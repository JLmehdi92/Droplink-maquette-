import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { Icone } from "@/components/icone";
import { PanneauFiltres } from "@/components/commandes/panneau-filtres";
import { PilulesFiltres } from "@/components/commandes/pilules-filtres";
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
 *   - AUCUN COMPTAGE EXACT, qu'aucun index ne rattrape ;
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

  return (
    <>
      {/*
        L'EN-TÊTE D'ÉCRAN, sur fond blanc et détaché du contenu par un filet.
        Il porte les deux gestes qu'on fait en arrivant : chercher, et créer.
      */}
      <header className="border-b border-outline-variant bg-surface-container-lowest px-margin-mobile py-4 md:px-[30px] md:py-[26px]">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-headline-lg text-[24px] font-extrabold tracking-[-0.03em] text-on-surface md:text-[28px]">
              {t("titre")}
            </h1>
            <p className="mt-1 font-body-sm text-[13px] text-on-surface-variant md:text-[14px]">
              {t("sousTitre")}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2.5">
            <form method="get" action={base} className="relative hidden md:block">
              {/* Les autres réglages voyagent avec la recherche : chercher ne
                  doit pas défaire le filtre qu'on vient de poser. */}
              {parametres.statut !== null ? (
                <input type="hidden" name="statut" value={parametres.statut} />
              ) : null}
              {parametres.qc !== null ? (
                <input type="hidden" name="qc" value={parametres.qc} />
              ) : null}
              {parametres.tri !== "recentes" ? (
                <input type="hidden" name="tri" value={parametres.tri} />
              ) : null}
              {parametres.archivees ? <input type="hidden" name="archivees" value="1" /> : null}

              <Icone
                nom="search"
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[18px] text-sourdine"
              />
              <input
                type="search"
                name="q"
                defaultValue={parametres.q}
                placeholder={t("rechercherExemple")}
                aria-label={t("rechercher")}
                className="champ-app h-[42px] w-[290px] rounded-md border border-outline pr-3.5 pl-[38px] font-body-md text-[14px] text-on-surface"
              />
            </form>

            {/* CRÉER EST UNE MUTATION, donc une Server Action et non un lien
                vers une page qui écrirait au rendu. Un lien serait suivi par le
                préchargement du navigateur, par un aspirateur, par une visite
                accidentelle — et chacun créerait un brouillon.

                LE DÉGRADÉ EST ICI, ET NULLE PART AILLEURS SUR L'ÉCRAN : une
                seule action principale par page. */}
            <form action={creerBrouillon}>
              <input type="hidden" name="langue" value={langue} />
              <button
                type="submit"
                className="degrade-marque flex h-[42px] items-center gap-2 rounded-md px-[18px] font-label-md text-[14px] font-bold shadow-[0_8px_20px_-8px_rgba(124,92,245,0.66)] transition-opacity hover:opacity-90"
              >
                <Icone nom="add" className="text-[16px]" />
                <span className="hidden sm:inline">{t("nouvelle")}</span>
              </button>
            </form>
          </div>
        </div>

        {/* La recherche passe SOUS le titre au téléphone : à 390 px elle ne
            tient pas à côté du bouton, et c'est elle qu'on utilise le plus. */}
        <form method="get" action={base} className="relative mt-3.5 md:hidden">
          {parametres.statut !== null ? (
            <input type="hidden" name="statut" value={parametres.statut} />
          ) : null}
          {parametres.qc !== null ? <input type="hidden" name="qc" value={parametres.qc} /> : null}
          {parametres.tri !== "recentes" ? (
            <input type="hidden" name="tri" value={parametres.tri} />
          ) : null}
          {parametres.archivees ? <input type="hidden" name="archivees" value="1" /> : null}
          <Icone
            nom="search"
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[18px] text-sourdine"
          />
          <input
            type="search"
            name="q"
            defaultValue={parametres.q}
            placeholder={t("rechercherExemple")}
            aria-label={t("rechercher")}
            className="champ-app h-11 w-full rounded-md border border-outline pr-3.5 pl-[38px] font-body-md text-[15px] text-on-surface"
          />
        </form>
      </header>

      <main id="contenu" className="flex flex-col gap-3.5 py-3.5 md:gap-4 md:px-[30px] md:py-[22px]">
        {/*
          LES QUATRE COMPTEURS. Omis en bloc si la lecture échoue : rendre des
          zéros affirmerait qu'on a compté et trouvé rien, ce qui est faux — et
          c'est le genre de nombre crédible qui fait décider de travers.

          « JAMAIS OUVERTES » EST MIS EN AVANT parce que c'est le seul des
          quatre qui appelle une action : une commande que le client n'a pas
          regardée est un lien qu'il n'a peut-être jamais reçu.
        */}
        {compteurs !== null ? (
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
                    ? "border-tertiary-container bg-tertiary-container/40"
                    : "border-outline-variant bg-surface-container-lowest")
                }
              >
                <p
                  className={
                    "font-body-sm text-[12px] " +
                    (alerte && valeur > 0 ? "text-on-tertiary-container" : "text-on-surface-variant")
                  }
                >
                  {t("compteurs." + clef)}
                </p>
                <p
                  className={
                    "mt-1.5 font-headline-lg text-[26px] font-extrabold tracking-[-0.03em] " +
                    (alerte && valeur > 0 ? "text-on-tertiary-container" : "text-on-surface")
                  }
                >
                  {valeur}
                </p>
              </li>
            ))}
          </ul>
        ) : null}

        <PilulesFiltres base={base} parametres={parametres} />

        <PanneauFiltres base={base} parametres={parametres} />

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
        />
      </main>
    </>
  );
}
