import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { PageClient } from "@/components/publique/page-client";
import { lireCommandePublique, lireSuiviPublic } from "@/lib/page-publique/lecture";
import { estLangueSupportee } from "@/i18n/config";
import { signalerJetonInconnu, verifierQuotaPublique } from "@/lib/limitation/quota";

/**
 * L'APERÇU DE LA PAGE CLIENT, TEL QUE L'ÉDITEUR L'AFFICHE EN MOBILE ET EN DESKTOP.
 *
 * ⚠️ CE N'EST PAS UNE IMITATION, ET C'EST TOUT L'OBJET (demande de Wassim, 26/09/2026 :
 * « pourquoi l'aperçu de la page client n'est pas comme la vraie page client »). La
 * maquette qu'il remplace redessinait la page en miniature : trois vignettes, quatre
 * barres, un bouton — et elle divergeait de la page réelle à chaque carte ajoutée.
 * Celui-ci rend `PageClient`, le MÊME composant que `/p/<jeton>`, par les MÊMES lectures
 * — donc la même couleur résolue, les mêmes photos, le même historique, la même carte
 * « Propulsé par DropLink » selon le plan. Il ne peut pas diverger : il n'y a qu'un code.
 *
 * CE QUI LE DISTINGUE DE LA VRAIE PAGE, ET RIEN D'AUTRE :
 *  - AUCUNE VUE N'EST COMPTÉE, ni rendu ni consultation. Le vendeur qui regarde son
 *    aperçu ne doit pas lire « Vu par le client » le lendemain ;
 *  - l'arbitrage des photos et l'inscription aux e-mails sont INERTES : les deux seuls
 *    gestes qui écrivent au nom du client ;
 *  - il n'est pas servi sous le nom d'un lien brandé : il n'a aucun nom à vérifier ;
 *  - il se laisse encadrer par DropLink, et par DropLink seulement (`next.config.ts`).
 *
 * ⚠️ IL N'OUVRE RIEN QUE LE JETON N'OUVRAIT DÉJÀ. Il ne demande aucune session : exiger
 * celle du vendeur ferait dépendre le rendu d'un cookie — exactement ce que la page
 * publique s'interdit, pour qu'un vendeur connecté voie ce que voit son client — et
 * l'aperçu s'éteindrait à l'expiration de la session, au milieu d'une saisie. Qui a le
 * jeton a déjà la page ; il obtiendrait ici la même, en moins interactive.
 *
 * ⚠️ ET IL EST FREINÉ EXACTEMENT COMME ELLE. Une seconde adresse qui lit par jeton sans
 * plafond serait une seconde porte de balayage : même quota avant la lecture, même
 * compteur des jetons inconnus, même `notFound()` — donc le même écran de lien mort,
 * sans rien qui distingue un refus d'une absence.
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

export default async function ApercuPageClient({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const quota = await verifierQuotaPublique();
  if (!quota.autorise) notFound();

  const commande = await lireCommandePublique(token);
  if (commande === null) {
    await signalerJetonInconnu();
    notFound();
  }

  const suivi = await lireSuiviPublic(token);

  return <PageClient token={token} commande={commande} suivi={suivi} apercu />;
}
