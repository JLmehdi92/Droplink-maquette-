import { NextResponse } from "next/server";
import { creerClientSysteme } from "@/lib/supabase/system";
import { verifierQuotaPaiement } from "@/lib/limitation/quota";
import { expediteurDiscord } from "@/lib/alerte/discord";
import {
  EVENEMENTS_TRAITES,
  FOURNISSEUR,
  destinataireDe,
  lireEvenement,
  verifierSignature,
} from "@/lib/paiement/lemon-squeezy";

/**
 * LE POINT DE RÉCEPTION DES ABONNEMENTS — décision de Wassim, 20/09/2026.
 *
 * « je veux que quand le mec a prix son abonnement et que il a payé via stripe
 * ou lemon squeezy et bah il a son abonnement automatiquement sur le saas ! »
 *
 * ⚠️ C'EST LA SECONDE SURFACE DU PRODUIT QUI ÉCRIT SANS QU'AUCUN HUMAIN SOIT
 * IMPLIQUÉ, et la première qui décide de ce qu'un compte a le DROIT de faire.
 * `/api/*` est exclu du matcher du middleware : cette route n'est protégée par
 * RIEN d'autre que ce qui est écrit ici, et son préfixe donnerait l'impression
 * contraire à qui la relit.
 *
 * L'ORDRE DES OPÉRATIONS EST LA GARDE, et il est repris de la notification de
 * suivi, qui l'a déjà payé :
 *
 *   1. le SEUIL DE DÉBIT, avant même de lire le corps — sinon un flot de
 *      requêtes non signées nous ferait calculer un HMAC par requête ;
 *   2. le CORPS BRUT, en texte, sans l'analyser ;
 *   3. la SIGNATURE sur ces octets exacts ;
 *   4. seulement ensuite, l'interpréter.
 *
 * ⚠️ CE QUE COÛTERAIT L'ABSENCE DE SIGNATURE : n'importe qui POSTerait
 * `{"status":"active"}` avec l'identifiant d'un profil et s'offrirait le plan
 * payant. La garde ne protège pas une donnée — elle protège le revenu.
 *
 * ── CE QU'ON RÉPOND, ET POURQUOI ───────────────────────────────────────────
 *
 * Lemon Squeezy REJOUE tout ce qui n'est pas 2xx. Chaque code est donc une
 * instruction au fournisseur, pas un commentaire :
 *
 *   429 → « ralentis » ; il réessaiera, rien n'est perdu.
 *   401 → « je ne te crois pas » ; un rejeu ne changera rien, et c'est voulu.
 *   400 → corps illisible ; le rejouer donnerait le même corps.
 *   503 → « je ne suis pas configuré » ; REJOUE, parce que ça, ça se répare.
 *   200 → « j'ai pris ». Y compris pour un événement qu'on IGNORE — sans quoi
 *         il serait rejoué indéfiniment pour rien.
 *
 * ⚠️ LE CAS QUI COMPTE LE PLUS EST LE PAIEMENT QU'ON NE SAIT PAS RATTACHER.
 * Il est encaissé chez le fournisseur et sans effet chez nous : c'est le pire
 * résultat possible, et le seul que personne ne remarquerait. Il répond 200 —
 * rejouer ne créerait pas le compte manquant — mais il ALERTE, et il est archivé
 * avec sa charge pour qu'un humain puisse le rattacher à la main.
 */

export const dynamic = "force-dynamic";
// `node:crypto` et le client service-role : cette route ne tourne pas à la périphérie.
export const runtime = "nodejs";

const NOM_SECRET = "LEMON_SQUEEZY_WEBHOOK_SECRET";

/** Prévient l'exploitant. Ne lève jamais : l'alerte ne doit pas casser l'encaissement. */
async function alerter(sujet: string, texte: string): Promise<void> {
  const issue = await expediteurDiscord().envoyer({ sujet, texte });
  if (issue.statut !== "envoye") {
    console.error(
      "[paiement] alerte non remise (" + issue.statut + ") — le sujet était : " + sujet,
    );
  }
}

export async function POST(requete: Request): Promise<NextResponse> {
  const quota = await verifierQuotaPaiement();
  if (!quota.autorise) {
    return NextResponse.json({ statut: "refuse" }, { status: 429 });
  }

  // LE CORPS BRUT. `requete.json()` détruirait les octets exacts sur lesquels
  // porte la signature — l'ordre des clés et les espaces changent.
  const corps = await requete.text().catch(() => null);
  if (corps === null || corps.length === 0) {
    return NextResponse.json({ statut: "refuse" }, { status: 400 });
  }

  const secret = (process.env[NOM_SECRET] ?? "").trim();
  if (secret === "") {
    /*
     * 503 ET NON 200. Répondre 200 sans secret ferait croire au fournisseur que
     * tout va bien : il cesserait de réessayer, et les abonnements payés
     * pendant la fenêtre de mauvaise configuration seraient perdus SANS TRACE.
     * Un 503 les fait rejouer une fois la variable posée.
     */
    console.error(
      "[paiement] " +
        NOM_SECRET +
        " n'est pas configuré : AUCUN abonnement ne peut être appliqué. " +
        "Les événements sont refusés en 503, donc rejoués — rien n'est perdu tant " +
        "que la variable est posée avant l'abandon du fournisseur.",
    );
    return NextResponse.json({ statut: "non_configure" }, { status: 503 });
  }

  const signature = requete.headers.get("x-signature");
  if (!verifierSignature(corps, signature, secret)) {
    // On ne dit pas CE qui a échoué : un message qui distingue « signature
    // absente » de « signature fausse » aide surtout celui qui essaie.
    return NextResponse.json({ statut: "refuse" }, { status: 401 });
  }

  // ── À partir d'ici, et seulement ici, la charge est authentifiée ──────────
  const lecture = lireEvenement(corps);
  if (lecture.statut === "illisible") {
    console.error("[paiement] événement signé mais illisible : " + lecture.motif);
    return NextResponse.json({ statut: "illisible" }, { status: 400 });
  }

  const evenement = lecture.evenement;
  const nom = evenement.meta.event_name;
  const systeme = creerClientSysteme();

  /*
   * L'ARCHIVAGE VIENT AVANT L'APPLICATION, et il sert de VERROU D'IDEMPOTENCE.
   *
   * `signature` est unique par corps : un rejeu du fournisseur porte le même
   * corps, donc la même signature, donc ce `insert` échoue. Lemon Squeezy
   * n'envoie aucun identifiant d'événement — c'est la seule clé dont on dispose.
   *
   * ⚠️ ET L'ARCHIVE EST ÉCRITE MÊME QUAND ON IGNORE L'ÉVÉNEMENT : le jour où un
   * vendeur dira « j'ai payé et je n'ai rien », la seule réponse honnête viendra
   * d'ici.
   */
  const { data: archive, error: erreurArchive } = await systeme
    .from("payment_events")
    .insert({
      provider: FOURNISSEUR,
      event_name: nom,
      signature: signature ?? "",
      payload: JSON.parse(corps) as never,
      issue: "recu",
    })
    .select("id")
    .maybeSingle();

  if (erreurArchive !== null) {
    // 23505 = violation d'unicité : c'est un REJEU, donc un succès du point de
    // vue du fournisseur. Tout autre code est une vraie panne, et il doit
    // rejouer plutôt que de considérer l'événement remis.
    if (erreurArchive.code === "23505") {
      return NextResponse.json({ statut: "deja_traite" }, { status: 200 });
    }
    console.error("[paiement] archivage impossible : " + erreurArchive.message);
    return NextResponse.json({ statut: "indisponible" }, { status: 503 });
  }

  const marquer = async (issue: string, profilId: string | null): Promise<void> => {
    if (archive === null) return;
    const { error } = await systeme
      .from("payment_events")
      .update({ issue, profile_id: profilId })
      .eq("id", archive.id);
    // Jamais de `catch` muet : l'archive est le seul témoin de ce chemin.
    if (error !== null) {
      console.error("[paiement] issue non consignée (" + issue + ") : " + error.message);
    }
  };

  if (!EVENEMENTS_TRAITES.includes(nom as (typeof EVENEMENTS_TRAITES)[number])) {
    await marquer("ignore", null);
    return NextResponse.json({ statut: "ignore" }, { status: 200 });
  }

  // ── À qui ? ───────────────────────────────────────────────────────────────
  const destinataire = destinataireDe(evenement);
  let profilId: string | null = null;

  if (destinataire.par === "profil") {
    const { data } = await systeme
      .from("profiles")
      .select("id")
      .eq("id", destinataire.profilId)
      .maybeSingle();
    profilId = data?.id ?? null;
  } else if (destinataire.par === "courriel") {
    const { data } = await systeme
      .from("profiles")
      .select("id")
      .eq("email", destinataire.courriel)
      .maybeSingle();
    profilId = data?.id ?? null;
  }

  if (profilId === null) {
    await marquer("sans_destinataire", null);
    await alerter(
      "Paiement reçu SANS destinataire",
      "Un abonnement `" +
        nom +
        "` est arrivé et **aucun compte ne lui correspond**.\n" +
        "Abonnement " +
        evenement.data.id +
        " — statut " +
        evenement.data.attributes.status +
        ".\n" +
        "Il est encaissé chez le fournisseur et SANS EFFET ici. À rattacher à la main " +
        "(table `payment_events`, issue `sans_destinataire`).",
    );
    // 200 : rejouer ne fera pas apparaître le compte manquant.
    return NextResponse.json({ statut: "sans_destinataire" }, { status: 200 });
  }

  const { data: plan, error: erreurApplication } = await systeme.rpc("appliquer_abonnement", {
    p_provider: FOURNISSEUR,
    p_subscription_id: evenement.data.id,
    p_profil: profilId,
    p_statut: evenement.data.attributes.status,
    p_renews_at: evenement.data.attributes.renews_at ?? null,
    p_ends_at: evenement.data.attributes.ends_at ?? null,
  });

  if (erreurApplication !== null) {
    await marquer("echec", profilId);
    console.error("[paiement] application impossible : " + erreurApplication.message);
    // 503 : celui-là, un rejeu peut le réussir.
    return NextResponse.json({ statut: "indisponible" }, { status: 503 });
  }

  await marquer("applique", profilId);
  return NextResponse.json({ statut: "applique", plan }, { status: 200 });
}
