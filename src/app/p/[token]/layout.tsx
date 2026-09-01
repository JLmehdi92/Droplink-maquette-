import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TraductionsClient } from "@/components/traductions-client";
import { lireCommandePublique } from "@/lib/page-publique/lecture";
import { verifierQuotaPublique } from "@/lib/limitation/quota";
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
  /*
   * LE TITRE PAR DÉFAUT DE LA SURFACE, ET IL EST CELUI DU LIEN MORT.
   *
   * `generateMetadata` de la page l'écrase dès qu'une commande est lue. Il ne
   * reste donc visible que sur l'écran de lien mort — qui passe par
   * `notFound()`, donc par une frontière dont les métadonnées de la page sont
   * écartées. C'est la seule façon de lui donner un titre.
   *
   * EN FRANÇAIS, pour la même raison que le `lang` de cet écran : il n'y a pas
   * de vendeur, donc pas de langue de vendeur. Et il ne dit RIEN de plus que ce
   * que l'écran affiche déjà — inconnu, révoqué et suspendu portent le même,
   * comme ils portent le même corps.
   */
  title: "Ce lien n'est plus valable",
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

  /*
   * ⚠️ LE PLAFOND DOIT PASSER ICI AUSSI, ET IL N'Y ÉTAIT PAS.
   *
   * DÉFAUT RÉEL, TROUVÉ À L'AUDIT DU 31/08/2026. La page pose bien le plafond
   * avant sa lecture, et son commentaire dit pourquoi : « c'est la lecture
   * qu'elle protège ». Mais CE layout s'exécute pour chaque requête `/p/…`, y
   * compris celles que la page refusera ensuite, et il appelait
   * `lireCommandePublique` sans condition.
   *
   * `cache()` déduplique les deux appels, mais dans le sens qui dessert : la
   * lecture avait lieu de toute façon. Un balayeur ayant brûlé ses vingt essais
   * continuait donc de faire payer un aller-retour `orders ⨝ shops ⨝ profiles`
   * à chaque requête — c'est-à-dire exactement la dépense que le seuil « jeton
   * inconnu » existe pour éviter. Le plafond s'appliquait après la dépense
   * qu'il prétend éviter.
   *
   * LE REFUS EMPRUNTE LE MÊME CHEMIN QUE TOUT LE RESTE : `notFound()`, donc la
   * page « lien invalide », donc rien qui distingue un refus de quota d'un
   * jeton qui n'existe pas.
   */
  const quota = await verifierQuotaPublique();
  if (!quota.autorise) notFound();

  const commande = await lireCommandePublique(token);

  return (
    <html lang={commande?.boutique.langue ?? "fr"}>
      {/*
        LE FOND EST BLANC, pas le gris de l'espace vendeur. Les six planches de
        la page client déclarent toutes `body { background: #ffffff }` : cette
        page n'est pas un plan de travail, c'est une page qu'on reçoit. Le gris
        ne se voyait que sur les bords, ce qui est exactement ce qui rend ce
        genre d'écart durable.
      */}
      <body
        /*
         * ⚠️ LE FOND EST POSÉ EN STYLE EN LIGNE, ET C'EST NÉCESSAIRE. La classe
         * `bg-surface-container-lowest` était bien écrite ici, et elle ne
         * s'appliquait PAS : `globals.css` porte une règle `body { background:
         * var(--color-surface) }` HORS de toute couche, et une règle non
         * couchée l'emporte sur un utilitaire Tailwind. Mesuré dans Chrome :
         * le corps rendait #f7f7fb, le gris du tableau de bord.
         *
         * Invisible tant que le contenu couvre l'écran — d'où sa durée de vie.
         * Il se voit au rebond de défilement sur iOS, c'est-à-dire exactement
         * sur l'appareil pour lequel cette page est écrite.
         */
        style={{ backgroundColor: "var(--color-surface-container-lowest)" }}
        className="min-h-dvh text-on-surface antialiased"
      >
        {/*
          LE SEUL PROVIDER CLIENT DE CETTE PAGE, ET IL NE PORTE QUE TROIS
          LIBELLÉS.

          ⚠️ POURQUOI IL A FALLU EN POSER UN ICI, alors que cette racine s'en
          était toujours passée. Il n'existait AUCUNE frontière d'erreur sur
          `/p/[token]` : une erreur de rendu y servait la page générique de
          Next, en anglais, non brandée — au CLIENT d'un vendeur, c'est-à-dire à
          quelqu'un qui ne peut ni la comprendre ni la signaler. `not-found.tsx`
          traite le lien mort avec soin ; l'asymétrie était un oubli.

          Et une frontière d'erreur DOIT être un Client Component : elle ne peut
          donc pas appeler `getTranslations()`, et ne reçoit aucune propriété.
          Le provider est la seule voie qui ne mette pas de chaîne en dur.

          IL EST RESTREINT À `page-publique.erreur` — trois clés — et le surcoût
          a été MESURÉ sur le build avant d'être accepté, parce que le budget de
          cette page est la raison même pour laquelle cette racine est distincte.
        */}
        <TraductionsClient espaces={["page-publique.erreur"]}>{children}</TraductionsClient>
      </body>
    </html>
  );
}
