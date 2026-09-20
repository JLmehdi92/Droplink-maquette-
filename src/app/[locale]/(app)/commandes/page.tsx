import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { CircleCheck, Clock, EyeOff, Plus, Search, Truck } from "lucide-react";
import { BoutonAction } from "@/components/bouton-action";
import { EnTeteEcranDs } from "@/components/app/en-tete-ecran";
import { TuileMetrique, type TeinteTuile } from "@/components/app/tuile-metrique";
import { PucesFiltresActifs } from "@/components/commandes/puces-filtres-actifs";
import { creerBrouillon } from "@/lib/commandes/actions";
import { TableauCommandes } from "@/components/commandes/tableau-commandes";
import { SelecteurPeriode } from "@/components/commandes/selecteur-periode";
import { analyserParametres, compterParEtat, lireCommandes } from "@/lib/commandes/liste";
import { origineDuSite } from "@/lib/site";
import { estLangueSupportee } from "@/i18n/config";
import { exigerVendeur } from "@/lib/comptes/apres-session";
import { lireProfilVendeur } from "@/lib/comptes/profil";
import { EtatLot, NombreLot } from "@/lib/commandes/lot";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "commandes" });
  // L'espace vendeur n'a rien à faire dans un index de moteur de recherche.
  return { title: t("titre"), robots: { index: false, follow: false } };
}

/**
 * La liste des commandes — l'écran le plus utilisé du produit.
 *
 * Un fournisseur à 200 commandes par semaine y passe sa journée. Trois choix en
 * découlent, tous mesurés plutôt que supposés :
 *
 *   - PAGINATION PAR CURSEUR, jamais par décalage ;
 *   - AUCUN COMPTAGE EXACT DU JEU FILTRÉ, qu'aucun index ne rattrape ;
 *   - RECHERCHE INSENSIBLE AUX ACCENTS, servie par une colonne générée.
 *
 * L'écran est ENTIÈREMENT rendu côté serveur, sauf les deux boutons d'action de
 * chaque ligne. Filtres, tri, recherche et pagination passent par des liens et
 * des formulaires `GET` : rien à télécharger, rien à réhydrater, et l'URL décrit
 * exactement ce qui est affiché.
 *
 * ⚠️ CE COMMENTAIRE DISAIT « la protection est la RLS, pas ce fichier ; le
 * layout a déjà écarté les visiteurs sans session et les comptes suspendus ».
 * LES DEUX MOITIÉS ÉTAIENT FAUSSES, et c'est ce qui a fait fuir cette page :
 *
 *   - la RLS ne protège pas d'un jeton RÉVOQUÉ. PostgREST ne valide qu'une
 *     signature et une date : un jeton révoqué lui reste bon UNE HEURE ;
 *   - le layout n'écarte personne à temps. Sa redirection tombe après que Next
 *     a engagé la réponse, et la charge part avec le 307.
 *
 * L'isolation ENTRE VENDEURS, elle, vient bien de la base — aucune requête
 * d'ici n'écrit de `shop_id`, c'est la policy qui le pose. Mais l'isolation
 * entre un vendeur et QUELQU'UN QUI N'EN EST PLUS UN se joue ici, dans
 * `exigerVendeur`, avant la première lecture.
 */
export default async function Commandes({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const langue = estLangueSupportee(locale) ? locale : "fr";
  setRequestLocale(langue);

  /*
   * ⚠️ LA GARDE PASSE AVANT TOUTE LECTURE, et cette page n'en avait AUCUNE.
   *
   * Elle s'en remettait à la RLS et à la redirection du layout. Mais la RLS
   * accepte un jeton d'accès RÉVOQUÉ pendant une heure — PostgREST ne valide
   * qu'une signature et une date —, et la redirection du layout arrive après
   * que Next a engagé la réponse : la charge part avec le 307.
   *
   * Mesuré avec un cookie révoqué : le nom du client et le `public_token`
   * sortaient. Contre-test : sans cookie, aucune occurrence.
   */
  await exigerVendeur(langue);

  const requete = await searchParams;
  const parametres = analyserParametres(requete);

  // Le résultat du dernier lot revient par l'URL, donc il est VALIDÉ comme tout
  // ce qui vient de la barre d'adresse : il finit dans une clef de traduction, et
  // une clef inexistante ferait lever le rendu de l'écran le plus utilisé du
  // produit.
  const lot = {
    etat: EtatLot.parse(requete["lot"]),
    nombre: NombreLot.parse(requete["n"]),
  };
  const t = await getTranslations("commandes");

  /*
   * ⚠️ `lireProfilVendeur()` NE COÛTE AUCUN ALLER-RETOUR DE PLUS ICI. Elle est
   * mémoïsée par requête (`cache()` de React) et la mise en page de l'espace
   * vendeur l'a déjà appelée pour décider si la page existe : ce second appel
   * lit le même résultat. Sans cette mémoïsation, l'écran le plus utilisé du
   * produit paierait une lecture de profil pour afficher un nom de lien.
   */
  const [page, origine, compteurs, profil] = await Promise.all([
    lireCommandes(parametres),
    origineDuSite(),
    compterParEtat(),
    lireProfilVendeur(),
  ]);

  const base = "/" + langue + "/commandes";

  // LE COMPTE VIDE A SA PROPRE PLANCHE, et ce n'est pas une nuance de mise en
  // page : `CommandesVide` n'a NI recherche, NI compteurs, NI filtres. Il n'y a
  // rien à chercher dans rien, et quatre zéros en tête d'écran seraient la
  // première chose qu'un nouveau vendeur verrait du produit.
  const compteVide = page.diagnostic === "aucune-commande";

  /*
   * LES COMPTEURS DÉCRIVENT LES COMMANDES ACTIVES. Dans la vue des archives, ils
   * décriraient donc exactement ce qui n'est PAS affiché — quatre nombres justes
   * posés au-dessus d'une liste qu'ils ne comptent pas. C'est le genre d'écart
   * qu'on lit sans le voir, et qui fait conclure à une perte de données.
   *
   * Les deux planches d'écran vide n'en portent pas non plus : il n'y a rien à
   * compter au-dessus de rien.
   */
  /*
   * ⚠️ `listeVide` A ÉTÉ RETIRÉ DE CETTE CONDITION, ET C'EST LE DÉFAUT QUE
   * WASSIM A MONTRÉ EN CAPTURE le 02/09/2026.
   *
   * Quand un filtre ne renvoyait RIEN, l'écran retirait la rangée de vues ET
   * les quatre compteurs, et basculait sur un état vide pleine page : « c'est
   * comme si ça ouvrait une deuxième page ». On perdait le contexte, et surtout
   * la possibilité de cliquer une AUTRE vue sans repasser par « tout effacer ».
   * Mesuré avant correction sur `?q=zzzzintrouvable` : zéro pilule, zéro
   * compteur.
   *
   * Et les compteurs restent JUSTES dans ce cas : ils décrivent les commandes
   * ACTIVES du compte, pas le résultat du filtre — c'est même l'information la
   * plus utile ici, puisqu'elle dit que les commandes sont toujours là.
   *
   * LES DEUX AUTRES CONDITIONS RESTENT, et pour des raisons différentes :
   * `compteVide` est le compte qui n'a RIEN, où quatre zéros seraient la
   * première chose qu'un nouveau vendeur verrait ; `archivees` est la vue où
   * les compteurs décriraient exactement ce qui n'est PAS affiché.
   */
  const compteursVisibles = compteurs !== null && !compteVide && !parametres.archivees;

  /*
   * LE SOUS-TITRE EST UN CHIFFRE, PAS UNE PHRASE.
   *
   * La planche écrit « 184 commandes, 12 créées cette semaine ». Le produit y
   * mettait une phrase fixe qui n'apprenait rien, à l'endroit exact où la
   * planche répond à la seule question qu'on se pose en arrivant.
   *
   * ⚠️ QUAND LE COMPTE A ÉCHOUÉ, ON N'ÉCRIT PAS ZÉRO. Un « 0 commande » affirme
   * qu'on a compté et trouvé rien — c'est-à-dire exactement le genre de nombre
   * crédible et faux que ce projet s'interdit. Le sous-titre est alors OMIS.
   */
  const sousTitre = compteVide
    ? t("sousTitreVide")
    : parametres.archivees
      ? // ⚠️ LE CHIFFRE COMPTE LES COMMANDES ACTIVES, et cette vue montre celles
        // qu'il exclut. « 0 commande » au-dessus de sept lignes archivées est une
        // contradiction que le vendeur lit sans la voir : elle passe pour une
        // perte de données. La vue se NOMME plutôt que de se compter.
        t("sousTitreArchives")
      : compteurs === null
        ? null
        : t("sousTitreChiffre", {
            total: compteurs.total,
            semaine: compteurs.creeesCetteSemaine,
          });

  return (
    <>
      {/*
        L'EN-TÊTE EST CELUI DE TOUS LES ÉCRANS DE L'ESPACE VENDEUR. Cette page
        recopiait le sien, et la copie avait déjà divergé sur trois valeurs.
      */}
      <EnTeteEcranDs
        titre={t("titre")}
        {...(sousTitre !== null ? { sousTitre } : {})}
        /* ⚠️ LA DÉCONNEXION DU TÉLÉPHONE N'EST PLUS ICI depuis le 15/09/2026 : elle
           vit, avec les paramètres, dans le menu du compte de la barre du haut,
           commune à tous les écrans (`BarreSuperieure`). Elle n'existait
           auparavant qu'ici, et les autres écrans n'offraient aucun accès au
           compte. */
        actions={
          compteVide ? undefined : (
            <div className="hidden shrink-0 items-center gap-3 md:flex">
              {/* Le kit pose la période à gauche de l action principale, à 12 px
                  d elle. Elle ne se rend qu à partir de `lg` : sous 1 024 px,
                  257 px de bouton plus 224 de bouton principal ne tiennent pas
                  à côté du titre — c est la même mesure qui avait déjà fait
                  descendre la recherche. */}
              <span className="hidden lg:block">
                <SelecteurPeriode base={base} parametres={parametres} />
              </span>
              {/*
                ⚠️ LA RECHERCHE A QUITTÉ CET EN-TÊTE POUR LA BARRE SUPÉRIEURE.
                Le kit n en dessine qu une par écran, et elle est en haut ; deux
                champs qui cherchent la même chose à 200 px l un de l autre
                posent une question à chaque écran. Elle reste ici AU TÉLÉPHONE,
                où la barre supérieure ne se rend pas — voir `dessous`.
              */}
              {/* CRÉER EST UNE MUTATION, donc une Server Action et non un lien
                  vers une page qui écrirait au rendu. Un lien serait suivi par
                  le préchargement du navigateur, par un aspirateur, par une
                  visite accidentelle — et chacun créerait un brouillon.

                  LE DÉGRADÉ EST ICI, ET NULLE PART AILLEURS SUR L'ÉCRAN : une
                  seule action principale par page. */}
              <form action={creerBrouillon}>
                <input type="hidden" name="langue" value={langue} />
                <BoutonAction
                  libelles={{
                    repos: <LibelleNouvelle libelle={t("nouvelle")} />,
                    enCours: t("nouvelleEnCours"),
                    reussi: <LibelleNouvelle libelle={t("nouvelle")} />,
                    echoue: <LibelleNouvelle libelle={t("nouvelle")} />,
                  }}
                  gapLibelle="gap-2"
                  /* `Button variant="primary" size="lg"` du kit, avec les deux
                     surcharges que `OrdersView` lui pose : 50 px de haut et le
                     rayon de CARTE au lieu de la pilule. Le dégradé reste
                     l'action principale UNIQUE de l'écran. */
                  className="degrade-ds-marque flex h-[50px] items-center gap-2 rounded-ds-card px-7 text-[15px] font-semibold text-ds-texte-sur-marque shadow-ds-brand transition-shadow hover:shadow-ds-brand-hover"
                />
              </form>
            </div>
          )
        }
        dessous={
          /* La recherche passe SOUS le titre au téléphone : à 390 px elle ne
             tient pas à côté du bouton, et c'est elle qu'on utilise le plus.
             Elle y reste jusqu'à 1024 px, faute de place. Le bouton, lui,
             devient l'action flottante du bas d'écran sous 768 px. */
          compteVide ? undefined : (
            <div className="mt-3.5 lg:hidden">
              <FormulaireRecherche base={base} parametres={parametres} libelles={t} telephone />
            </div>
          )
        }
      />

      <main
        id="contenu"
        className="flex flex-grow flex-col gap-3.5 py-3.5 md:gap-[22px] md:px-8 md:pt-0 md:pb-[26px]"
      >
        {/*
          LES QUATRE COMPTEURS. Omis en bloc si la lecture échoue : rendre des
          zéros affirmerait qu'on a compté et trouvé rien, ce qui est faux — et
          c'est le genre de nombre crédible qui fait décider de travers.

          « JAMAIS OUVERTES » EST MIS EN AVANT parce que c'est le seul des quatre
          qui appelle une action : une commande que le client n'a pas regardée est
          un lien qu'il n'a peut-être jamais reçu.
        */}
        {/*
          ⚠️ LE NOMBRE DE COLONNES SUIT LA LARGEUR DU CONTENU, PAS CELLE DE LA
          FENÊTRE, ET C'EST POURQUOI LE PALIER EST À 1 424.

          Le kit exprime ses paliers en requêtes de CONTENEUR : sa rangée passe à
          deux colonnes quand la zone de contenu descend sous 1 100 px. Chez
          nous la barre latérale vaut 264 px fixes dès `md`, et la zone de
          contenu porte 30 px de marge de chaque côté : la zone tombe donc sous
          1 100 px quand la FENÊTRE passe sous 1 424. Traduire le palier plutôt
          que de le recopier est le seul moyen d'obtenir le même dessin — un
          `2xl:` (1 536) laisserait deux colonnes sur toute la plage 1 424–1 535,
          là où le kit en montre quatre.

          ⚠️ DEUX COLONNES AU TÉLÉPHONE, ALORS QUE LE KIT N'EN MET QU'UNE, ET
          C'EST UNE DIVERGENCE MESURÉE. En une colonne, les quatre tuiles
          occupent 760 px de haut : sur un écran de 844, la première commande
          n'est visible qu'après avoir fait défiler tout l'écran — sur la vue la
          plus ouverte du produit, celle qu'un fournisseur consulte vingt fois
          par jour. Le kit peut se le permettre parce que SES tuiles portent un
          badge d'évolution en haut à droite, qui leur impose une largeur que
          les nôtres n'ont pas : on l'a retiré, faute de donnée à y mettre. À
          deux colonnes il reste 171 px par tuile, dont 107 pour le texte après
          la pastille de 48 et son écart — mesuré, le plus long des quatre
          libellés y tient sur deux lignes sans être tronqué, dans les trois
          langues.

          ⚠️ ET LES DEUX PALIERS SONT ÉCRITS DANS LA MÊME FAMILLE, `min-[…]`,
          PARCE QU'EN MÉLANGER DEUX A DONNÉ UN ÉCRAN FAUX. Écrit
          `md:grid-cols-2 min-[1424px]:grid-cols-4`, la rangée rendait DEUX
          colonnes à 1 440 px. Mesuré dans la feuille servie : Tailwind émet le
          bloc `min-width:1424px` à l'octet 71 505 et un bloc `min-width:48rem`
          à l'octet 71 763 — la règle du palier le plus LARGE arrive donc en
          PREMIER, et celle du palier le plus étroit l'écrase. Rien ne le
          signale : les deux classes existent, sont servies, et les gardes qui
          les surveillent restent vertes ; seul le rendu le dit. Deux paliers de
          la même famille se trient entre eux par leur valeur.
        */}
        {compteursVisibles && compteurs !== null ? (
          <ul className="grid grid-cols-2 gap-3 px-margin-mobile min-[768px]:gap-4 min-[768px]:px-0 min-[1424px]:grid-cols-4">
            {(
              [
                ["preparation", compteurs.preparation, Clock, "alerte", false],
                ["enTransit", compteurs.enTransit, Truck, "info", false],
                ["jamaisOuvertes", compteurs.jamaisOuvertes, EyeOff, "erreur", true],
                ["livrees", compteurs.livrees, CircleCheck, "succes", false],
              ] as const
            ).map(([clef, valeur, IconeTuile, teinte, alerte]) => (
              <li key={clef}>
                <TuileMetrique
                  Icone={IconeTuile}
                  valeur={valeur}
                  libelle={t("compteurs." + clef)}
                  teinte={teinte satisfies TeinteTuile}
                  valeurEnAlerte={alerte && valeur > 0}
                />
              </li>
            ))}
          </ul>
        ) : null}

        {compteVide ? null : <PucesFiltresActifs base={base} parametres={parametres} />}

        {/* ⚠️ LE PANNEAU DE FILTRES N'EST PLUS ICI. Il était une carte à part,
            posée entre les puces et le tableau ; il est devenu un contrôle de la
            barre d'outils, DANS la carte du tableau, comme la planche
            `CommandesOutils` le dessine. Il suit donc désormais la barre
            d'outils, qui ne se rend pas au-dessus d'une liste vide : sur un
            résultat vide, la sortie se fait par les puces de critères, chacune
            retirable seule, et par « tout effacer ». */}
        <TableauCommandes
          base={base}
          langue={langue}
          // Sans origine connue, le lien public serait construit sur une valeur
          // devinée. On rend alors un chemin relatif : il ne se copie pas dans
          // une conversation, mais il n'envoie personne sur un domaine inventé.
          origine={origine ?? ""}
          nomDeLien={profil?.nomDeLien ?? null}
          parametres={parametres}
          page={page}
          lot={lot}
          total={compteurs?.total ?? null}
          compteurs={compteurs}
        />
      </main>

      {/*
        L'ACTION FLOTTANTE DU TÉLÉPHONE, dessinée par la planche `CommandesMobile`
        juste au-dessus de la barre d'onglets.

        `bottom-[102px]` = les 86 px réservés à la barre d'onglets fixe par le
        layout, plus les 16 px de marge de la planche. Sans ce calage, le bouton
        se poserait SUR la navigation — c'est-à-dire sur les quatre destinations
        du produit.
      */}
      {compteVide ? null : (
        <form action={creerBrouillon} className="fixed right-4 bottom-[102px] z-20 md:hidden">
          <input type="hidden" name="langue" value={langue} />
          {/* ⚠️ C'EST LE BOUTON LE PLUS CLIQUÉ DU PRODUIT AU TÉLÉPHONE, et
              celui où l'absence de retour se paie le plus cher : il est fixe,
              donc rien autour de lui ne bouge au clic — l'écran reste
              exactement tel qu'il était, et c'est très exactement ce que
              Wassim a décrit par « c'est sec ».

              ⚠️ ET C'EST LE SEUL BOUTON DU PRODUIT OÙ L'ATTENTE GARDE LE MOT DU
              REPOS AU LIEU DE LE REMPLACER. Mesuré : avec « Création… » en
              libellé d'attente, ce bouton passait de 132,7 à 144,8 px de large
              AU REPOS — la grille interne réserve la largeur du libellé le plus
              long, et le plus long devenait celui qu'on ne voit presque jamais.
              Douze pixels sur un bouton flottant que la planche `CommandesMobile`
              dessine, pour un mot affiché un tiers de seconde. L'anneau prend
              donc la place du « + », à largeur constante, et c'est `aria-busy`
              — posé par le composant — qui porte l'état à qui ne le voit pas. */}
          <BoutonAction
            libelles={{
              repos: <LibelleNouvelle libelle={t("nouvelleCourt")} />,
              enCours: t("nouvelleCourt"),
              reussi: <LibelleNouvelle libelle={t("nouvelleCourt")} />,
              echoue: <LibelleNouvelle libelle={t("nouvelleCourt")} />,
            }}
            gapLibelle="gap-2"
            className="degrade-ds-marque flex h-[52px] items-center gap-2 rounded-ds-pill px-[22px] text-[15px] font-semibold text-ds-texte-sur-marque shadow-ds-brand"
          />
        </form>
      )}
    </>
  );
}

/**
 * Le champ de recherche.
 *
 * LES AUTRES RÉGLAGES VOYAGENT AVEC LUI, en champs cachés : chercher ne doit pas
 * défaire le filtre qu'on vient de poser. Ils étaient recopiés deux fois — une
 * pour le bureau, une pour le téléphone — et deux copies d'une même liste
 * divergent au premier paramètre ajouté, sans que rien ne le signale : le
 * vendeur perdrait alors son filtre en cherchant, mais seulement sur un des deux
 * écrans.
 */
function FormulaireRecherche({
  base,
  parametres,
  libelles,
  telephone = false,
}: {
  readonly base: string;
  readonly parametres: Awaited<ReturnType<typeof analyserParametres>>;
  readonly libelles: (clef: string) => string;
  readonly telephone?: boolean;
}) {
  return (
    <form method="get" action={base} className="relative">
      {parametres.statut !== null ? (
        <input type="hidden" name="statut" value={parametres.statut} />
      ) : null}
      {parametres.qc !== null ? <input type="hidden" name="qc" value={parametres.qc} /> : null}
      {parametres.tri !== "recentes" ? (
        <input type="hidden" name="tri" value={parametres.tri} />
      ) : null}
      {parametres.du !== null ? <input type="hidden" name="du" value={parametres.du} /> : null}
      {parametres.au !== null ? <input type="hidden" name="au" value={parametres.au} /> : null}
      {parametres.archivees ? <input type="hidden" name="archivees" value="1" /> : null}

      <Search
        aria-hidden="true"
        size={17}
        strokeWidth={1.8}
        className="pointer-events-none absolute top-1/2 left-[14px] -translate-y-1/2 text-ds-texte-tenu"
      />
      <input
        type="search"
        name="q"
        defaultValue={parametres.q}
        placeholder={libelles(telephone ? "rechercherExempleCourt" : "rechercherExemple")}
        aria-label={libelles("rechercher")}
        className={
          /*
            LE CHAMP DE RECHERCHE DU KIT — `dl-topsearch` : 42 px de haut, rayon
            de carte, filet `--border-subtle`, fond carte.

            AU TÉLÉPHONE IL RESTE SUR LE CREUX, et c'est la même raison qu'avant
            la migration : il vit alors DANS la barre blanche de l'en-tête, et un
            blanc posé sur du blanc n'aurait plus de bord. 44 px au doigt.
          */
          "rounded-ds-card border border-ds-filet pr-3.5 pl-[40px] text-ds-texte-fort " +
          "placeholder:text-ds-texte-corps focus-visible:outline-none " +
          "focus-visible:shadow-[var(--anneau-ds-focus)] " +
          (telephone
            ? "h-11 w-full bg-ds-surface-creux text-[15px]"
            : "h-[42px] w-[290px] bg-ds-surface-carte text-[14px]")
        }
      />
    </form>
  );
}

/**
 * Le libellé du bouton « nouvelle commande » — l'icône et le mot.
 *
 * IL EXISTE PARCE QU'IL ÉTAIT ÉCRIT HUIT FOIS : `BoutonAction` prend quatre
 * libellés, et l'écran porte deux boutons. Huit copies d'un même fragment
 * divergent à la première retouche, et c'est déjà arrivé sur cet écran — la
 * taille d'icône valait 15 au bureau, 16 au téléphone, sans raison.
 *
 * ⚠️ LE « + » RESTE PENDANT L'ATTENTE — NON, IL EST REMPLACÉ, et c'est mesuré :
 * l'anneau prend sa place à largeur constante. Les deux ensemble élargiraient le
 * bouton au clic, et sur l'action flottante du téléphone cela vaut douze pixels.
 */
function LibelleNouvelle({ libelle }: { readonly libelle: string }) {
  return (
    <>
      <Plus aria-hidden="true" size={17} strokeWidth={2} />
      {libelle}
    </>
  );
}
