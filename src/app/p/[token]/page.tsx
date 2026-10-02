import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { Metadata, Viewport } from "next";
import { resoudreAccent } from "@/lib/design/contraste";
import { BaliseVue } from "@/components/publique/balise-vue";
import { PageClient } from "@/components/publique/page-client";
import {
  lireCommandePublique,
  lireSuiviPublic,
  nomDeLienCorrespond,
} from "@/lib/page-publique/lecture";
import { PARAM_NOM } from "@/lib/routes/lien-au-nom";
import { estLangueSupportee } from "@/i18n/config";
import { signalerJetonInconnu, verifierQuotaPublique } from "@/lib/limitation/quota";
import { adresseAppelant, empreinte } from "@/lib/limitation/empreinte";
import { emettreApres } from "@/lib/instrumentation/emettre";
import { EVENEMENTS } from "@/lib/instrumentation/evenements";

/**
 * LA PAGE QUE VOIT LE CLIENT — son corps vit dans `components/publique/page-client.tsx`.
 *
 * ⚠️ IL EN EST SORTI LE 26/09/2026, POUR QUE L APERÇU DE L ÉDITEUR SOIT CETTE PAGE ET
 * NON SON IMITATION (`apercu/page.tsx`). Ce qui reste ICI est ce que seule la vraie
 * page fait : vérifier le nom d un lien brandé, compter le rendu, et poser la balise
 * qui compte la vue. Un aperçu qui compterait ferait croire au vendeur que son client
 * a ouvert le lien, alors que c est lui qui regardait.
 */

/**
 * ⚠️ CETTE PAGE NE PORTAIT AUCUN `<title>` — mesuré sur le HTML servi : ZÉRO
 * balise, là où la landing en sert une.
 *
 * Ce n'est pas qu'un défaut d'accessibilité, même si c'en est un — « Page
 * Titled » est un critère de NIVEAU A, et c'est la seule page du produit que
 * tous les clients de tous les vendeurs ouvrent.
 *
 * CE QUI COMPTE DAVANTAGE : sans titre, l'onglet et l'entrée d'historique du
 * navigateur affichent L'URL. Or l'URL de cette page PORTE la capacité, et elle
 * est immuable à vie. Un titre ne fuite donc pas — il RETIRE le jeton de ce que
 * le navigateur montre par-dessus l'épaule, dans la liste des onglets, et dans
 * une capture d'écran d'historique.
 *
 * LE TITRE EST NEUTRE, ET C'EST DÉLIBÉRÉ. Il ne porte ni le pseudo du client ni
 * la référence du produit — c'est la même raison qui interdit l'image de
 * partage : ce qui apparaît hors de la page apparaît à qui n'a pas ouvert le
 * lien. Il vient du catalogue, dans la langue DU VENDEUR, comme le reste.
 *
 * ⚠️ IL NE COÛTE AUCUNE REQUÊTE. `lireCommandePublique` est enveloppée dans
 * `cache()` : `generateMetadata` et le rendu partagent la même lecture. C'est
 * exactement le montage déjà éprouvé sur le titre de l'éditeur, où trois
 * chargements ont produit trois lectures, compteur posé puis retiré.
 *
 * ⚠️ ET IL NE DIT RIEN DU JETON. Un lien inconnu, révoqué ou suspendu rend le
 * MÊME titre que l'écran de lien mort que le produit affiche déjà pour les
 * trois : le titre ne distingue pas ce que le corps ne distingue pas.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const commande = await lireCommandePublique(token);
  const langue =
    commande !== null && estLangueSupportee(commande.boutique.langue)
      ? commande.boutique.langue
      : "fr";
  const t = await getTranslations({ locale: langue, namespace: "page-publique" });

  return {
    title: commande === null ? t("lienInvalideTitre") : t("titre"),
    robots: { index: false, follow: false, nocache: true },
  };
}

/**
 * LA BARRE DU NAVIGATEUR À LA COULEUR DU VENDEUR (maquette `client.html`, `theme-color`) :
 * sa couleur d'aplat RÉSOLUE (`resoudreAccent`), jamais la saisie brute. Même lecture mise
 * en cache que le titre : aucune requête de plus. Un lien mort n'en pose aucune.
 */
export async function generateViewport({ params }: { params: Promise<{ token: string }> }): Promise<Viewport> {
  const { token } = await params;
  const commande = await lireCommandePublique(token);
  return commande === null ? {} : { themeColor: resoudreAccent(commande.boutique.couleur).remplissage };
}

export default async function PagePublique({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;

  /*
   * LE NOM SOUS LEQUEL LA PAGE A ÉTÉ DEMANDÉE — posé par le middleware quand
   * l'URL était `droplink.fr/<nom>/<jeton>`, absent sur un `/p/<jeton>` nu.
   *
   * ⚠️ UNE VALEUR MULTIPLE (`?nom=a&nom=b`) EST TRAITÉE COMME UNE ABSENCE, et
   * jamais comme un refus. Le middleware POSE ce paramètre par `set`, donc il
   * est toujours unique sur le chemin brandé : une valeur multiple ne peut
   * venir que d'un `/p/<jeton>?…` écrit à la main, par quelqu'un qui détient
   * déjà le jeton. Lui rendre 404 ne protégerait personne de rien.
   */
  const brut = (await searchParams)[PARAM_NOM];
  const nomDemande = typeof brut === "string" ? brut : null;

  // LA LIMITATION DE DÉBIT VIENT AVANT LA LECTURE : c'est la lecture qu'elle
  // protège. Un refus emprunte le MÊME chemin de sortie que tout le reste —
  // répondre 429 ici distinguerait « tu vas trop vite sur un jeton qui existe »
  // de « ce jeton n'existe pas », donc rendrait le balayage informatif.
  const quota = await verifierQuotaPublique();
  if (!quota.autorise) notFound();

  const commande = await lireCommandePublique(token);
  // Jeton inconnu, jeton révoqué, compte suspendu : UN SEUL chemin de sortie.
  if (commande === null) {
    // Compté APRÈS la lecture : c'est la requête SUIVANTE que ce compteur
    // refusera. Un balayage se coupe ainsi lui-même au bout de vingt essais,
    // alors qu'un client qui clique un lien ne touche jamais ce seuil.
    await signalerJetonInconnu();
    notFound();
  }

  /*
   * Lu APRÈS la commande : une commande sur deux n'a pas encore de numéro, et
   * `null` est alors la réponse normale — pas une erreur.
   *
   * ⚠️ LA VÉRIFICATION DU NOM PART AVEC LUI, ET NON APRÈS. Les deux lectures
   * sont indépendantes ; les enchaîner ajouterait un aller-retour complet à la
   * page qui doit s'afficher en moins de deux secondes en 4G, et le ferait
   * payer aux seuls liens brandés — c'est-à-dire précisément ceux d'un vendeur
   * qui a payé pour eux.
   *
   * ⚠️ ET LE REFUS EMPRUNTE LE MÊME `notFound()` QUE TOUT LE RESTE. Jeton
   * inconnu, jeton révoqué, compte suspendu, nom qui n'appartient pas à cette
   * boutique : un seul chemin de sortie. Quatre chemins distincts finiraient par
   * diverger — en contenu, en code de réponse ou en délai — et chacun de ces
   * écarts est un oracle.
   */
  const [suivi, nomLegitime] = await Promise.all([
    lireSuiviPublic(token),
    nomDemande === null ? Promise.resolve(true) : nomDeLienCorrespond(token, nomDemande),
  ]);
  if (!nomLegitime) notFound();

  // LE RENDU EST COMPTÉ CÔTÉ SERVEUR, la VUE côté client, et les deux ne se
  // confondent pas : `rendus ≥ vues réelles ≥ vues enregistrées`.
  //
  // NI LE JETON NI L'IDENTIFIANT DE LA COMMANDE NE PARTENT VERS L'ANALYTICS. Le
  // jeton ne transporte pas une donnée mais une CAPACITÉ, définitivement,
  // puisqu'il est immuable à vie : l'expédier chez un tiers reviendrait à lui
  // donner la page.
  const visiteur = await adresseAppelant();
  emettreApres(EVENEMENTS.PAGE_PUBLIQUE_RENDUE, {
    sujet: visiteur === null ? "visiteur:sans-adresse" : `visiteur:${empreinte(visiteur)}`,
  });

  return (
    <PageClient token={token} commande={commande} suivi={suivi} apercu={false}>
      {/* Monté APRÈS le premier rendu — c est toute la différence entre une page
          chargée et une page vue. Il ne rend rien. */}
      <BaliseVue jeton={commande.jeton} />
    </PageClient>
  );
}
