import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { Icone } from "@/components/icone";
import { EnTeteEcran } from "@/components/app/en-tete-ecran";
import { PanneauFiltres } from "@/components/commandes/panneau-filtres";
import { PucesFiltresActifs } from "@/components/commandes/puces-filtres-actifs";
import { creerBrouillon } from "@/lib/commandes/actions";
import { TableauCommandes } from "@/components/commandes/tableau-commandes";
import { analyserParametres, compterParEtat, lireCommandes } from "@/lib/commandes/liste";
import { origineDuSite } from "@/lib/site";
import { estLangueSupportee } from "@/i18n/config";
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
 * LA PROTECTION EST LA RLS, pas ce fichier. Aucune requête d'ici n'écrit de
 * `shop_id` : c'est la policy qui le pose. Le layout de `(app)` a déjà écarté
 * les visiteurs sans session et les comptes suspendus, mais il n'est que la
 * première couche — la lecture, elle, est bornée en base.
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

  const [page, origine, compteurs] = await Promise.all([
    lireCommandes(parametres),
    origineDuSite(),
    compterParEtat(),
  ]);

  const base = "/" + langue + "/commandes";

  // LE COMPTE VIDE A SA PROPRE PLANCHE, et ce n'est pas une nuance de mise en
  // page : `CommandesVide` n'a NI recherche, NI compteurs, NI filtres. Il n'y a
  // rien à chercher dans rien, et quatre zéros en tête d'écran seraient la
  // première chose qu'un nouveau vendeur verrait du produit.
  const compteVide = page.diagnostic === "aucune-commande";
  const listeVide = page.lignes.length === 0;

  /*
   * LES COMPTEURS DÉCRIVENT LES COMMANDES ACTIVES. Dans la vue des archives, ils
   * décriraient donc exactement ce qui n'est PAS affiché — quatre nombres justes
   * posés au-dessus d'une liste qu'ils ne comptent pas. C'est le genre d'écart
   * qu'on lit sans le voir, et qui fait conclure à une perte de données.
   *
   * Les deux planches d'écran vide n'en portent pas non plus : il n'y a rien à
   * compter au-dessus de rien.
   */
  const compteursVisibles = compteurs !== null && !compteVide && !listeVide && !parametres.archivees;

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
      <EnTeteEcran
        titre={t("titre")}
        {...(sousTitre !== null ? { sousTitre } : {})}
        actions={
          compteVide ? undefined : (
            <div className="hidden shrink-0 items-center gap-2.5 md:flex">
              {/*
                ⚠️ LA RECHERCHE DE 290 px NE TIENT PAS À CÔTÉ DU BOUTON SOUS
                1024 px. Mesuré : à 768 px, la barre latérale prend 236 px et il
                reste 432 px à l'en-tête, pour un titre et 500 px de contrôles.
                Le bouton principal sortait de la carte-page — qui porte
                `overflow-hidden` — donc il était COUPÉ, pas repoussé. Sous `lg`,
                la recherche descend en pleine largeur sous le titre.
              */}
              <span className="hidden lg:block">
                <FormulaireRecherche base={base} parametres={parametres} libelles={t} />
              </span>

              {/* CRÉER EST UNE MUTATION, donc une Server Action et non un lien
                  vers une page qui écrirait au rendu. Un lien serait suivi par
                  le préchargement du navigateur, par un aspirateur, par une
                  visite accidentelle — et chacun créerait un brouillon.

                  LE DÉGRADÉ EST ICI, ET NULLE PART AILLEURS SUR L'ÉCRAN : une
                  seule action principale par page. */}
              <form action={creerBrouillon}>
                <input type="hidden" name="langue" value={langue} />
                <button
                  type="submit"
                  className="degrade-marque flex h-[42px] items-center gap-2 rounded-[11px] px-[18px] font-label-md text-[14px] font-bold shadow-[0_8px_20px_-8px_rgba(124,92,245,0.66)] transition-opacity hover:opacity-90"
                >
                  <Icone nom="add" className="text-[15px]" />
                  {t("nouvelle")}
                </button>
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
        className="flex flex-grow flex-col gap-3.5 py-3.5 md:gap-5 md:px-[30px] md:pt-0 md:pb-[26px]"
      >
        {/*
          LES QUATRE COMPTEURS. Omis en bloc si la lecture échoue : rendre des
          zéros affirmerait qu'on a compté et trouvé rien, ce qui est faux — et
          c'est le genre de nombre crédible qui fait décider de travers.

          « JAMAIS OUVERTES » EST MIS EN AVANT parce que c'est le seul des quatre
          qui appelle une action : une commande que le client n'a pas regardée est
          un lien qu'il n'a peut-être jamais reçu.
        */}
        {compteursVisibles && compteurs !== null ? (
          <ul className="grid grid-cols-2 gap-3 px-margin-mobile md:grid-cols-4 md:px-0">
            {(
              [
                ["preparation", compteurs.preparation, false],
                ["enTransit", compteurs.enTransit, false],
                ["jamaisOuvertes", compteurs.jamaisOuvertes, true],
                ["livrees", compteurs.livrees, false],
              ] as const
            ).map(([clef, valeur, alerte]) => (
              <li
                key={clef}
                className={
                  "rounded-lg border px-5 py-[18px] " +
                  (alerte && valeur > 0
                    ? "border-alerte-filet bg-alerte-fond"
                    : "border-outline-variant bg-surface-container-lowest")
                }
              >
                <p
                  className={
                    "font-body-sm text-[12px] " + (alerte && valeur > 0 ? "text-alerte" : "text-sourdine")
                  }
                >
                  {t("compteurs." + clef)}
                </p>
                <p
                  className={
                    "mt-1.5 font-headline-lg text-[26px] font-extrabold tracking-[-0.03em] " +
                    (alerte && valeur > 0 ? "text-alerte" : "text-on-surface")
                  }
                >
                  {valeur}
                </p>
              </li>
            ))}
          </ul>
        ) : null}

        {compteVide ? null : <PucesFiltresActifs base={base} parametres={parametres} />}

        {/* LE PANNEAU DE FILTRES NE SE REND PAS AU-DESSUS D'UNE LISTE VIDE. La
            planche `CommandesFiltreVide` ne dessine rien entre les puces et la
            carte : les critères se retirent un par un depuis les puces, et
            dérouler un panneau pour en poser un de plus sur un résultat déjà vide
            ne mène nulle part. */}
        {compteVide || listeVide ? null : (
          <PanneauFiltres base={base} parametres={parametres} />
        )}

        <TableauCommandes
          base={base}
          langue={langue}
          // Sans origine connue, le lien public serait construit sur une valeur
          // devinée. On rend alors un chemin relatif : il ne se copie pas dans
          // une conversation, mais il n'envoie personne sur un domaine inventé.
          origine={origine ?? ""}
          parametres={parametres}
          page={page}
          lot={lot}
          total={compteurs?.total ?? null}
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
          <button
            type="submit"
            className="degrade-marque flex h-[52px] items-center gap-2 rounded-full px-[22px] font-label-md text-[15px] font-bold shadow-[0_14px_28px_-10px_rgba(124,92,245,0.7)]"
          >
            <Icone nom="add" className="text-[16px]" />
            {t("nouvelleCourt")}
          </button>
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

      <Icone
        nom="search"
        className="pointer-events-none absolute top-1/2 left-[13px] -translate-y-1/2 text-[16px] text-gris-inactif"
      />
      <input
        type="search"
        name="q"
        defaultValue={parametres.q}
        placeholder={libelles(telephone ? "rechercherExempleCourt" : "rechercherExemple")}
        aria-label={libelles("rechercher")}
        className={
          // La planche bureau pose le champ sur du BLANC — il est seul sur le
          // gris de la zone de travail. La planche téléphone le pose sur
          // `#fafafc`, parce qu'il est déjà dans la barre blanche : un blanc sur
          // blanc n'aurait plus de bord.
          "rounded-[11px] border border-filet-controle pr-3.5 pl-[38px] font-body-md text-on-surface " +
          (telephone
            ? "h-11 w-full rounded-[12px] bg-surface-container-low text-[15px]"
            : "h-[42px] w-[290px] bg-surface-container-lowest text-[14px]")
        }
      />
    </form>
  );
}
