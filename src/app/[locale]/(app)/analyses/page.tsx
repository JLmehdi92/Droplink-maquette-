import { EnTeteEcranDs } from "@/components/app/en-tete-ecran";
import { Panneau } from "@/components/app/panneau";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { onboardingAFaire } from "@/lib/comptes/profil";
import { exigerVendeur } from "@/lib/comptes/apres-session";
import { CompteursAnalyses } from "@/components/analyses/compteurs-analyses";
import { FriseSemaines } from "@/components/analyses/frise-semaines";
import { PlusConsultees } from "@/components/analyses/plus-consultees";
import { RepartitionColis } from "@/components/analyses/repartition-colis";
import { ActiviteRecente } from "@/components/analyses/activite-recente";
import { BandeauAnalyses } from "@/components/analyses/bandeau-analyses";
import { LiensParJour } from "@/components/analyses/liens-par-jour";
import { PartsTransporteurs } from "@/components/analyses/parts-transporteurs";
import {
  analyserParametres,
  lireActivite,
  lireDelaiLivraison,
  lireOuverturesParJour,
  lirePlusConsultees,
  lireSemaines,
  lireTransporteurs,
  PERIODES,
} from "@/lib/analyses/activite";
import { lireActiviteRecente } from "@/lib/analyses/recente";
import { compterEnvois } from "@/lib/envois/liste";
import { creerClientServeur } from "@/lib/supabase/server";
import { estLangueSupportee } from "@/i18n/config";
import { LienEcran } from "@/components/lien-ecran";

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

  // ⚠️ `exigerVendeur` REMPLACE une garde qui ne regardait que `profil === null`.
  // Elle laissait donc passer un compte SUSPENDU, dont le tableau de bord
  // continuait de répondre — la coupure ne tenait que sur `/p/[token]`, et c'est
  // elle qui fonde notre statut d'hébergeur.
  const profil = await exigerVendeur(langue);
  if (onboardingAFaire(profil)) redirect(`/${langue}/bienvenue`);

  const { periode } = analyserParametres(await searchParams);
  const maintenant = new Date();

  // LE CLIENT PORTE LA SESSION, donc la RLS s'applique aux quatre lectures.
  // Aucun filtre sur `shop_id` n'est écrit nulle part : l'isolation vient de la
  // base, pas d'une requête bien rédigée.
  const supabase = await creerClientServeur();

  // Les huit lectures sont indépendantes : les enchaîner multiplierait par huit
  // la latence de l'écran pour rien.
  const [activite, semaines, colis, consultees, transporteurs, delai, ouvertures, recente] =
    await Promise.all([
      lireActivite(supabase, periode, maintenant),
      lireSemaines(supabase, maintenant),
      compterEnvois(supabase),
      lirePlusConsultees(supabase, periode, maintenant),
      lireTransporteurs(supabase, periode, maintenant),
      lireDelaiLivraison(supabase, periode, maintenant),
      lireOuverturesParJour(supabase, periode, maintenant),
      lireActiviteRecente(supabase, periode, maintenant),
    ]);

  const t = await getTranslations("analyses");
  const format = await getFormatter();
  const base = `/${langue}/analyses`;

  /**
   * ⚠️ CHAQUE SECTION SE REND OU SE NOMME, JAMAIS N'INVENTE.
   *
   * Les quatre lectures sont indépendantes ; une seule qui bronche emportait
   * tout l'écran. Défaut vu en vrai : `/fr/analyses` en 500 après 10,7 s le
   * 03/09. Et le zéro n'est pas une porte de sortie non plus — le module le
   * disait déjà : *afficher des zéros ferait croire à un vendeur actif qu'il
   * n'a rien fait.*
   */
  const INDISPONIBLE =
    "rounded-ds-card-lg border border-ds-filet bg-ds-surface-carte p-4 text-[14px] text-ds-texte-corps shadow-ds-card lg:p-6";

  const qcTotal =
    activite === null ? 0 : activite.qcApprouve + activite.qcRefuse + activite.qcEnAttente;

  /*
   * LE BOUTON DE PÉRIODE ACTIF EST À L'ACCENT, ET IL ÉTAIT NOIR.
   *
   * ⚠️ CE NOIR ÉTAIT L'ANCIEN CANEVAS, `#111117`, celui dont `CLAUDE.md` dit que
   * le chrome sombre est mort. Il a survécu à la migration des quatre autres
   * écrans parce que rien ne le cherchait : il était écrit en tokens
   * (`bg-primary` / `text-on-primary`), donc aucune garde de couleur en dur ne
   * pouvait le voir, et il restait le seul aplat noir de tout le produit.
   *
   * Le kit rend ces onglets à 38 px de haut, rayon 10, `padding 0 15`, en 13/700
   * blanc sur accent quand ils sont actifs, 13/500 corps sur carte bordée sinon.
   *
   * ⚠️ LA HAUTEUR MONTE À 44 AU TÉLÉPHONE. Ce sont des liens, pas des boutons —
   * la règle de cible tactile de la feuille de base ne les couvre pas, et les
   * 38 px du kit se ratent au pouce.
   */
  const pilule = (actif: boolean): string =>
    "inline-flex h-11 items-center rounded-ds-sm border px-[15px] text-[13px] leading-4 transition-colors lg:h-[38px] " +
    (actif
      ? "border-transparent bg-ds-accent font-bold text-ds-texte-sur-marque"
      : "border-ds-filet bg-ds-surface-carte font-medium text-ds-texte-corps shadow-ds-xs hover:bg-ds-surface-teinte");

  return (
    <>
      <EnTeteEcranDs
        titre={t("titre")}
        sousTitre={t("sousTitreEcran")}
        actions={
          <nav
            aria-label={t("periode.titre")}
            /* −2 px pour retrouver les 14 px de la planche quand la barre passe
               à la ligne au téléphone : l'écart de rangée de l'en-tête est de
               16. Au bureau la barre ne passe pas à la ligne, donc rien. */
            className="flex flex-wrap gap-2"
          >
            {PERIODES.map((p) => (
              <LienEcran
                key={p}
                href={p === "30j" ? base : `${base}?periode=${p}`}
                aria-current={periode === p ? "true" : undefined}
                className={pilule(periode === p)}
              >
                {t(`periode.${p}`)}
              </LienEcran>
            ))}
          </nav>
        }
      />

      <main
        id="contenu"
        className="flex flex-col gap-3 px-margin-mobile pt-3.5 pb-6 lg:gap-[18px] lg:px-8 lg:pt-0 lg:pb-8"
      >
        {activite === null ? (
          <p className={INDISPONIBLE}>{t("indisponible")}</p>
        ) : (
          <CompteursAnalyses activite={activite} delai={delai} />
        )}

        {/* 1,6fr / 1fr sur la planche. La frise garde la place : c'est elle
            qu'on lit en premier, et quatre barres de progression n'ont pas
            besoin de plus de largeur qu'un libellé et un chiffre. */}
        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[1.6fr_minmax(0,1fr)] lg:gap-4">
          {semaines === null ? (
            <p className={INDISPONIBLE}>{t("indisponible")}</p>
          ) : (
            <FriseSemaines semaines={semaines} />
          )}
          {colis === null ? (
            <p className={INDISPONIBLE}>{t("indisponible")}</p>
          ) : (
            <RepartitionColis compteurs={colis} />
          )}
        </div>

        {/* LA DERNIÈRE RANGÉE DU KIT : trois colonnes égales — les ouvertures
            de liens, les transporteurs, l'activité récente. */}
        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-3 lg:items-start lg:gap-4">
          {ouvertures === null || activite === null ? (
            <p className={INDISPONIBLE}>{t("indisponible")}</p>
          ) : (
            <LiensParJour jours={ouvertures} total={activite.vuesTotales} />
          )}
          {transporteurs === null ? (
            <p className={INDISPONIBLE}>{t("indisponible")}</p>
          ) : (
            <PartsTransporteurs parts={transporteurs} />
          )}
          {recente === null ? (
            <p className={INDISPONIBLE}>{t("indisponible")}</p>
          ) : (
            <ActiviteRecente faits={recente} langue={langue} />
          )}
        </div>

        {consultees === null ? (
          <p className={INDISPONIBLE}>{t("indisponible")}</p>
        ) : (
          <PlusConsultees commandes={consultees} />
        )}

        <Panneau titre={t("qc.titre")} sousTitre={t("qc.aide")}>
          {qcTotal === 0 ? (
            <p className="text-[14px] text-ds-texte-corps">{t("qc.vide")}</p>
          ) : (
            <ul className="flex flex-col gap-[15px] lg:gap-4">
              {(
                [
                  { cle: "approuve", valeur: activite?.qcApprouve ?? 0, barre: "bg-ds-succes" },
                  { cle: "refuse", valeur: activite?.qcRefuse ?? 0, barre: "bg-ds-erreur" },
                  { cle: "enAttente", valeur: activite?.qcEnAttente ?? 0, barre: "bg-ds-ink-200" },
                ] as const
              ).map((part) => (
                <li key={part.cle}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3 lg:mb-[7px]">
                    <span className="text-[13px] leading-4 font-semibold text-ds-texte-fort">
                      {t(`qc.${part.cle}`)}
                    </span>
                    <span className="text-[13px] leading-4 font-semibold text-ds-texte-sourdine">
                      {format.number(part.valeur)}
                    </span>
                  </div>
                  {/* La piste est décorative : le chiffre au-dessus porte
                      l'information, elle n'a rien à annoncer de plus. */}
                  <div
                    aria-hidden="true"
                    className="h-2 overflow-hidden rounded-ds-pill bg-ds-surface-creux"
                  >
                    <span
                      className={"block h-full rounded-ds-pill " + part.barre}
                      style={{ width: `${(part.valeur / qcTotal) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panneau>

        {/* LE BANDEAU DE PIED DU KIT, en dernier comme chez lui. */}
        <BandeauAnalyses />
      </main>
    </>
  );
}
