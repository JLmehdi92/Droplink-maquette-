import type { Metadata } from "next";
import { lireCommandePublique } from "@/lib/page-publique/lecture";
import "../../globals.css";

/**
 * RACINE DE MISE EN PAGE DISTINCTE pour la page publique.
 *
 * Ce n'est PAS de l'organisation, c'est LE BUDGET. La racine de l'espace vendeur
 * monte tout ce dont un tableau de bord a besoin : le provider de traduction, la
 * navigation, l'état de session. Cette page-ci est vue UNE FOIS, en 4G, sur un
 * appareil d'entrée de gamme, depuis un message privé — et elle a 300 Ko hors
 * médias pour tout faire, dont ~102 Ko incompressibles de socle.
 *
 * Elle est hors du segment `[locale]` : la langue est celle du VENDEUR, pas de
 * l'URL. Un client à qui on envoie un lien ne la choisit pas, et une adresse
 * localisée créerait deux URL pour un jeton censé être unique.
 *
 * AUCUNE POLICE N'EST CHARGÉE ICI. Les deux familles du design system pèsent
 * ensemble plus que ce qui reste du budget une fois le socle payé. La pile de
 * repli système rend un texte lisible immédiatement, sans requête et sans
 * bascule de police au premier affichage — et c'est le premier affichage qui est
 * mesuré.
 */

export const metadata: Metadata = {
  // `noindex` PARTOUT sur cette surface : chaque lien est privé et isolé, il n'y
  // a ni galerie publique ni moteur de recherche interne.
  robots: { index: false, follow: false, nocache: true },
  // AUCUNE IMAGE DE PARTAGE. Un aperçu enrichi montrerait la photo ou le pseudo
  // du client DANS la conversation — donc à qui n'ouvre pas le lien — et les
  // messageries le mettent en cache sur LEURS serveurs. La fuite serait
  // silencieuse et hors de notre portée.
  openGraph: undefined,
  twitter: undefined,
};

/**
 * L'ATTRIBUT `lang` PORTE LA LANGUE DU VENDEUR.
 *
 * Sans lui, le document n'annonce aucune langue : un lecteur d'écran prononce
 * alors un texte anglais avec la phonétique de sa langue par défaut, et la
 * traduction automatique du navigateur se trompe de sens. Le défaut est
 * strictement invisible à l'œil — il ne se manifeste que chez qui n'utilise pas
 * ses yeux pour lire.
 *
 * `fr` quand le jeton est inconnu : la page qui suit est un 404, il faut bien
 * annoncer quelque chose, et c'est la langue par défaut du produit. Ce n'est pas
 * une information sur le vendeur, puisqu'il n'y en a pas.
 *
 * La lecture est mémoïsée pour le temps du rendu : la page fera le même appel
 * sans payer un second aller-retour.
 */
export default async function LayoutPagePublique({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const commande = await lireCommandePublique(token);

  return (
    <html lang={commande?.boutique.langue ?? "fr"}>
      <body className="min-h-dvh bg-surface text-on-surface antialiased">{children}</body>
    </html>
  );
}
