import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { dixSeptTrack } from "@/lib/tracking/provider/dix-sept-track";
import { ingererEtat } from "@/lib/tracking/ingestion";
import { verifierQuotaNotificationSuivi } from "@/lib/limitation/quota";

/**
 * LE POINT DE RÉCEPTION DES NOTIFICATIONS DE SUIVI.
 *
 * ⚠️ C'EST LA SURFACE LA PLUS EXPOSÉE DU PRODUIT APRÈS LA PAGE PUBLIQUE, et la
 * seule qui ÉCRIVE sans qu'aucun humain soit impliqué. Le matcher du middleware
 * exclut `/api` : cette route n'est protégée par RIEN d'autre que ce qui est
 * écrit ici, et son préfixe donnerait l'impression contraire à qui la relit.
 *
 * SANS VÉRIFICATION DE SIGNATURE, N'IMPORTE QUI POURRAIT ÉCRIRE DANS LES
 * COMMANDES DE N'IMPORTE QUEL VENDEUR : il suffirait de deviner un numéro de
 * suivi — qui n'est pas un secret, il figure sur l'étiquette — pour annoncer au
 * client d'un tiers que son colis est livré. C'était le bloqueur consigné avant
 * tout engagement fournisseur ; il est levé, le schéma est documenté.
 *
 * L'ORDRE DES OPÉRATIONS EST LA GARDE :
 *
 *   1. lire le CORPS BRUT, en texte, sans l'analyser ;
 *   2. vérifier la signature sur ces octets exacts ;
 *   3. seulement ensuite, l'interpréter.
 *
 * Analyser d'abord — ne serait-ce que pour « voir de quoi il s'agit » — ferait
 * exécuter du code sur une charge non authentifiée, et surtout ferait vérifier
 * la signature d'un contenu qui n'est plus celui reçu.
 *
 * ELLE RÉPOND TOUJOURS VITE. Un fournisseur qui n'obtient pas de réponse rejoue
 * la notification, parfois en boucle : un traitement lent transforme un incident
 * en avalanche. Rien de long ne doit être fait ici.
 */

export const dynamic = "force-dynamic";

export async function POST(requete: Request): Promise<NextResponse> {
  /*
   * LE SEUIL DE DÉBIT VIENT EN PREMIER, avant même de lire le corps.
   *
   * Cette route n'en avait aucun. Le lire après la signature aurait laissé
   * calculer un HMAC par requête — c'est-à-dire aurait laissé intact le seul
   * travail qu'un flot de requêtes non signées nous impose.
   *
   * 429 et non 503 : le fournisseur sait réémettre sur 429, c'est le code qui
   * lui dit de ralentir plutôt que d'abandonner.
   */
  const quota = await verifierQuotaNotificationSuivi();
  if (!quota.autorise) {
    return NextResponse.json({ statut: "refuse" }, { status: 429 });
  }

  // LE CORPS BRUT, en texte. `requete.json()` détruirait les octets exacts sur
  // lesquels porte la signature — l'ordre des clefs et les espaces changent.
  const corps = await requete.text().catch(() => null);
  if (corps === null || corps.length === 0) {
    return NextResponse.json({ statut: "refuse" }, { status: 400 });
  }

  // Une charge démesurée est refusée AVANT tout calcul : hacher un corps de
  // cinquante mégaoctets pour découvrir qu'il n'est pas signé est exactement ce
  // qu'on demanderait à un point de réception pour le saturer.
  if (corps.length > 512_000) {
    return NextResponse.json({ statut: "refuse" }, { status: 413 });
  }

  // Le NOM de l'en-tête vient de l'adaptateur : l'écrire en dur ici ferait de
  // cette route un second fichier qui connaît le fournisseur.
  const signature = requete.headers.get(dixSeptTrack.enTeteSignature);

  let authentique = false;
  try {
    authentique = dixSeptTrack.verifierNotification(corps, signature);
  } catch {
    // La clé manque. On REFUSE : sans elle, la vérification accepterait ou
    // refuserait tout, et accepter tout est la pire des deux options.
    return NextResponse.json({ statut: "refuse" }, { status: 503 });
  }

  if (!authentique) {
    // 401 sans détail. Dire POURQUOI — signature absente, mal formée, ou
    // simplement fausse — apprendrait à qui essaie où il en est.
    return NextResponse.json({ statut: "refuse" }, { status: 401 });
  }

  const lecture = dixSeptTrack.lireNotification(corps);
  if (lecture.statut === "refuse") {
    // Signée mais illisible : c'est un incident de leur côté ou un changement de
    // format, pas une attaque. On répond 200 pour ne pas déclencher une boucle
    // de réémission sur quelque chose qu'aucune réémission ne réparera, et on le
    // NOMME dans le journal — un rejet muet est un rejet qu'on ne verra jamais.
    console.warn("[suivi] notification signée mais illisible : " + lecture.motif);
    return NextResponse.json({ statut: "ignore" });
  }

  const numero = lecture.numero ?? "";
  if (numero.trim() === "") {
    console.warn("[suivi] notification signée sans numéro de suivi exploitable");
    return NextResponse.json({ statut: "ignore" });
  }

  /*
   * L'EMPREINTE DE LA NOTIFICATION, calculée sur les octets EXACTS qui ont été
   * signés.
   *
   * MESURÉ AVANT CORRECTION : la même notification signée, renvoyée cinq fois,
   * faisait passer `query_count` de 1 à 6 et imputait cinq appels de coût à
   * chaque vendeur suivant le numéro. Les points de passage, eux, tenaient —
   * leur unicité est déclarée en base.
   *
   * ELLE SE REFERME SUR LA SIGNATURE : rejouer un corps identique donne la même
   * empreinte et ressort ; changer un seul octet pour en changer l'empreinte
   * casse la signature, donc la requête n'arrive jamais ici. Aucune des deux
   * gardes ne suffirait seule.
   */
  const empreinteNotification = createHash("sha256").update(corps, "utf8").digest("hex");

  const resultat = await ingererEtat(numero, lecture, empreinteNotification);

  // « IL RÉPOND » EST LA PROPRIÉTÉ QUE TOUS LES RÉSIDUS POSSÈDENT : la réponse
  // dit combien de colis ont RÉELLEMENT été touchés. Zéro n'est pas une erreur —
  // le fournisseur pousse aussi pour des numéros qu'on ne suit plus — mais c'est
  // la seule chose qui distingue un point de réception qui travaille d'un point
  // de réception qui acquiesce.
  const colis = resultat.statut === "ignore" ? 0 : resultat.colis;
  return NextResponse.json(
    { statut: resultat.statut, colis },
    { headers: { "cache-control": "no-store" } },
  );
}

/**
 * Toute autre méthode est refusée explicitement.
 *
 * Sans ces exports, Next répond 405 de lui-même — ce qui est correct, mais tient
 * à une ABSENCE. Une protection qui tient à une absence n'est pas une
 * protection : le jour où quelqu'un ajoute un `GET` de diagnostic « juste pour
 * vérifier que la route répond », il n'y a plus rien.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ statut: "refuse" }, { status: 405 });
}
