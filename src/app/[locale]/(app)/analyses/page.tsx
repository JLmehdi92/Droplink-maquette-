import Link from "next/link";
import { EnTeteEcran } from "@/components/app/en-tete-ecran";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { lireProfilVendeur, onboardingAFaire } from "@/lib/comptes/profil";
import { CompteursAnalyses } from "@/components/analyses/compteurs-analyses";
import { FriseSemaines } from "@/components/analyses/frise-semaines";
import { PlusConsultees } from "@/components/analyses/plus-consultees";
import { RepartitionColis } from "@/components/analyses/repartition-colis";
import {
  analyserParametres,
  lireActivite,
  lirePlusConsultees,
  lireSemaines,
  PERIODES,
} from "@/lib/analyses/activite";
import { compterEnvois } from "@/lib/envois/liste";
import { creerClientServeur } from "@/lib/supabase/server";
import { estLangueSupportee } from "@/i18n/config";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "analyses" });
  return { title: t("titre"), robots: { index: false, follow: false } };
}

/**
 * LES ANALYSES, portées sur `Analyses` et `AnalysesMobile`.
 *
 * SON TITRE STITCH EST ABANDONNÉ DEPUIS LONGTEMPS. La maquette d'origine
 * annonçait un « taux de conformité global » calculé sur des articles
 * inspectés : personne n'inspecte de contrôle qualité chez nous.
 *
 * AUCUNE BIBLIOTHÈQUE DE GRAPHIQUES, aucun composant client. Quatre compteurs,
 * douze barres, quatre barres de progression et trois lignes : tout se dessine
 * avec une grille et une largeur en pourcentage. L'écran fonctionne sans
 * JavaScript et ne pèse rien de plus que son HTML.
 *
 * LE VENDEUR VOIT LES MÊMES CHIFFRES QUE NOUS. Le livrable réel de la phase de
 * validation est la donnée d'usage ; un écran qui lui montrerait autre chose
 * que ce qu'on regarde soi-même serait une vitrine.
 *
 * ⚠️ « RÉPONSES DE VOS CLIENTS » N'EST SUR AUCUNE PLANCHE, et il reste. Le
 * relevé de conformité l'a signalé « en trop » ; c'est le seul endroit du
 * produit où le vendeur voit ce que ses clients ont répondu après avoir vu les
 * photos, et l'approbation du contrôle qualité est une fonction verrouillée du
 * brief (§7). Retirer une fonction parce qu'un dessin ne la montre pas serait
 * une régression produit, pas une mise en conformité — le même arbitrage que
 * « dupliquer » et « archiver » dans l'éditeur. Il passe en DERNIER, après ce
 * que les planches dessinent.
 *
 * ⚠️ L'INSTANT EST PRIS UNE SEULE FOIS et descendu aux quatre lectures. Lu
 * séparément par chacune, il changerait entre la première et la dernière : les
 * compteurs, la frise et le classement décriraient trois fenêtres légèrement
 * différentes, et l'écart serait invisible.
 */
export default async function Analyses({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const langue = estLangueSupportee(locale) ? locale : "fr";
  setRequestLocale(langue);

  const profil = await lireProfilVendeur();
  if (profil === null) redirect(`/${langue}/connexion?erreur=session`);
  if (onboardingAFaire(profil)) redirect(`/${langue}/bienvenue`);

  const { periode } = analyserParametres(await searchParams);
  const maintenant = new Date();

  // LE CLIENT PORTE LA SESSION, donc la RLS s'applique aux quatre lectures.
  // Aucun filtre sur `shop_id` n'est écrit nulle part : l'isolation vient de la
  // base, pas d'une requête bien rédigée.
  const supabase = await creerClientServeur();

  // Les quatre lectures sont indépendantes : les enchaîner multiplierait par
  // quatre la latence de l'écran pour rien.
  const [activite, semaines, colis, consultees] = await Promise.all([
    lireActivite(supabase, periode, maintenant),
    lireSemaines(supabase, maintenant),
    compterEnvois(supabase),
    lirePlusConsultees(supabase, periode, maintenant),
  ]);

  const t = await getTranslations("analyses");
  const format = await getFormatter();
  const base = `/${langue}/analyses`;

  const qcTotal = activite.qcApprouve + activite.qcRefuse + activite.qcEnAttente;

  /*
   * LE BOUTON DE PÉRIODE ACTIF EST NOIR, PAS VIOLET.
   *
   * Les deux planches posent `#111117` sur fond noir et texte blanc — c'est la
   * pilule noire du canevas, l'action neutre. Le produit y mettait le violet
   * clair de la navigation : la même peau qu'un onglet de barre latérale, donc
   * deux choses différentes rendues pareil sur le même écran.
   *
   * ⚠️ LA HAUTEUR CHANGE AVEC LA LARGEUR : 44 px au téléphone, 38 au bureau.
   * Ce sont des liens, pas des boutons — la règle de cible tactile de la
   * feuille de base ne les couvre pas, et un lien de 38 px de haut se rate au
   * pouce.
   */
  const pilule = (actif: boolean): string =>
    "inline-flex h-11 items-center rounded-full border px-3.5 font-headline-md text-[13px] leading-4 font-semibold transition-colors lg:h-[38px] " +
    (actif
      ? "border-primary bg-primary text-on-primary"
      : "border-filet-controle bg-surface-container-lowest text-ardoise hover:bg-fond-neutre");

  return (
    <>
      <EnTeteEcran
        titre={t("titre")}
        sousTitre={t(`sousTitre.${periode}`)}
        actions={
          <nav
            aria-label={t("periode.titre")}
            /* −2 px pour retrouver les 14 px de la planche quand la barre passe
               à la ligne au téléphone : l'écart de rangée de l'en-tête est de
               16. Au bureau la barre ne passe pas à la ligne, donc rien. */
            className="-mt-0.5 flex flex-wrap gap-2 lg:mt-0"
          >
            {PERIODES.map((p) => (
              <Link
                key={p}
                href={p === "30j" ? base : `${base}?periode=${p}`}
                aria-current={periode === p ? "true" : undefined}
                className={pilule(periode === p)}
              >
                {t(`periode.${p}`)}
              </Link>
            ))}
          </nav>
        }
      />

      <main
        id="contenu"
        className="flex flex-col gap-3 px-margin-mobile pt-3.5 pb-5 lg:gap-4 lg:px-[30px] lg:pt-0 lg:pb-[26px]"
      >
        <CompteursAnalyses activite={activite} />

        {/* 1,6fr / 1fr sur la planche. La frise garde la place : c'est elle
            qu'on lit en premier, et quatre barres de progression n'ont pas
            besoin de plus de largeur qu'un libellé et un chiffre. */}
        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[1.6fr_minmax(0,1fr)] lg:gap-4">
          <FriseSemaines semaines={semaines} />
          <RepartitionColis compteurs={colis} />
        </div>

        <PlusConsultees commandes={consultees} />

        <section
          aria-label={t("qc.titre")}
          className="rounded-lg border border-outline-variant bg-surface-container-lowest p-[18px] lg:rounded-[18px] lg:p-[22px]"
        >
          <h2 className="font-headline-md text-[15px] leading-[19px] font-bold tracking-normal text-on-surface lg:text-[16px] lg:leading-[21px] lg:tracking-[-0.015em]">
            {t("qc.titre")}
          </h2>
          <p className="mt-1 mb-4 font-body-sm text-[13px] leading-[19px] text-sourdine lg:mb-[18px] lg:leading-4">
            {t("qc.aide")}
          </p>

          {qcTotal === 0 ? (
            <p className="font-body-md text-[14px] text-on-surface-variant">{t("qc.vide")}</p>
          ) : (
            <ul className="flex flex-col gap-[15px] lg:gap-4">
              {(
                [
                  { cle: "approuve", valeur: activite.qcApprouve, barre: "bg-succes" },
                  { cle: "refuse", valeur: activite.qcRefuse, barre: "bg-alerte-puce" },
                  { cle: "enAttente", valeur: activite.qcEnAttente, barre: "bg-gris-inactif" },
                ] as const
              ).map((part) => (
                <li key={part.cle}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3 lg:mb-[7px]">
                    <span className="font-headline-md text-[13px] leading-4 font-semibold text-on-surface">
                      {t(`qc.${part.cle}`)}
                    </span>
                    <span className="font-body-sm text-[13px] leading-4 text-sourdine">
                      {format.number(part.valeur)}
                    </span>
                  </div>
                  {/* La piste est décorative : le chiffre au-dessus porte
                      l'information, elle n'a rien à annoncer de plus. */}
                  <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-filet-ligne">
                    <span
                      className={"block h-full rounded-full " + part.barre}
                      style={{ width: `${(part.valeur / qcTotal) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
