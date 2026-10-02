import { redirect } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";
import { onboardingAFaire } from "@/lib/comptes/profil";
import { exigerVendeur } from "@/lib/comptes/apres-session";
import { BandeauAnalyses } from "@/components/analyses/bandeau-analyses";
import { CompteursApp } from "@/components/tableau/compteurs-app";
import { GrapheTableau, type PointGraphe, type TextesGraphe } from "@/components/tableau/graphe-tableau";
import { SelecteurPeriode } from "@/components/tableau/selecteur-periode";
import {
  ActiviteBloc,
  BlocIndisponible,
  ConsulteesBloc,
  RepartitionBloc,
  ReponsesBloc,
  TransporteursBloc,
} from "@/components/tableau/blocs-tableau";
import {
  analyserParametres,
  lireActivite,
  lireDelaiLivraison,
  lireOuverturesParJour,
  lirePlusConsultees,
  lireSemaines,
  lireTransporteurs,
  PERIODES,
  SEMAINES_FRISE,
} from "@/lib/analyses/activite";
import { lireActiviteRecente } from "@/lib/analyses/recente";
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
  const tt = await getTranslations("tableau");
  const format = await getFormatter();
  const base = `/${langue}/analyses`;
  const nom = profil.nomAffiche ?? profil.nomBoutique;

  /* LA REFONTE (02/10/2026) suit `analyses.html` : les mêmes lectures et les
     mêmes composants que le tableau de bord (un même panneau ne rend jamais deux
     nombres différents d'un écran à l'autre ; « liens ouverts » compte les vues
     des commandes CRÉÉES dans la période, la courbe compte les ouvertures DU
     JOUR — deux questions, deux libellés), la frise et les ouvertures chacune
     dans sa carte, puis les commandes les plus consultées, les réponses des
     clients et le bandeau. Chaque panneau se rend ou se dit illisible, jamais
     zéro. */
  const courtJour = (d: Date) => format.dateTime(d, { day: "numeric", month: "short", timeZone: "UTC" });
  const pointsSemaines: readonly PointGraphe[] | null =
    semaines?.map((s) => ({
      valeur: s.total,
      court: courtJour(s.debut),
      long: tt("graphe.semaineDuDate", { date: format.dateTime(s.debut, { day: "numeric", month: "long", timeZone: "UTC" }) }),
    })) ?? null;
  const pointsOuvertures: readonly PointGraphe[] | null =
    ouvertures?.map((o) => {
      const d = new Date(`${o.jour}T12:00:00Z`);
      return { valeur: o.total, court: courtJour(d), long: format.dateTime(d, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }) };
    }) ?? null;
  const n = semaines?.length ?? SEMAINES_FRISE;
  const totalOuvertures = ouvertures?.reduce((somme, o) => somme + o.total, 0) ?? null;
  const textes: TextesGraphe = {
    bascule: tt("graphe.bascule"),
    commandes: tt("graphe.commandes"),
    liens: tt("graphe.liens"),
    titreSemaines: t("frise.titre"),
    aideSemaines: t("frise.aide"),
    titreLiens: t("liens.titre"),
    aideLiens: t("liens.aide"),
    voirValeurs: tt("graphe.voirValeurs"),
    semaineDu: tt("graphe.semaineDu"),
    creees: tt("graphe.creees"),
    jour: tt("graphe.jour"),
    ouvertures: tt("graphe.ouvertures"),
    cetteSemaine: tt("graphe.cetteSemaine"),
    zoneSemaines: tt("graphe.zoneSemaines", { n }),
    zoneLiens: tt("graphe.zoneLiens", { n: totalOuvertures ?? 0 }),
    videSemaines: semaines === null ? t("indisponible") : t("frise.vide"),
    videLiens: ouvertures === null ? t("indisponible") : t("liens.aucun"),
  };

  return (
    <main id="contenu" className="tableau analyses-ecran">
      <div className="tableau__tete">
        <div>
          <p className="v4-fil">
            {nom === null ? null : (
              <>
                <span>{nom}</span>
                <ChevronRight aria-hidden="true" className="ic" />
              </>
            )}
            <b>{t("titre")}</b>
          </p>
          <h1>{t("titre")}</h1>
          <p>{t("sousTitreEcran")}</p>
        </div>
        <SelecteurPeriode
          etiquette={t("periode.titre")}
          actif={periode}
          periodes={PERIODES.map((p) => ({ cle: p, libelle: t(`periode.${p}`), href: p === "30j" ? base : `${base}?periode=${p}` }))}
        />
      </div>

      {activite === null ? <p className="bloc bloc__vide">{t("indisponible")}</p> : <CompteursApp activite={activite} delai={delai} />}

      <div className="analyses__rangee analyses__rangee--16">
        <GrapheTableau semaines={pointsSemaines} ouvertures={null} textes={textes} fixe="semaines" meta={t("frise.fenetre", { n })} />
        {colis === null ? <BlocIndisponible titre={t("colis.titre")} /> : <RepartitionBloc compteurs={colis} variante="analyses" />}
      </div>

      <div className="analyses__rangee analyses__rangee--3">
        <GrapheTableau
          semaines={null}
          ouvertures={pointsOuvertures}
          textes={textes}
          fixe="liens"
          {...(totalOuvertures === null ? {} : { meta: t("liens.ouvertures", { n: totalOuvertures }) })}
        />
        {transporteurs === null ? (
          <BlocIndisponible titre={t("transporteurs.titre")} />
        ) : (
          <TransporteursBloc parts={transporteurs} />
        )}
        {recente === null ? <BlocIndisponible titre={t("activite.titre")} /> : <ActiviteBloc faits={recente} langue={langue} />}
      </div>

      {consultees === null ? <BlocIndisponible titre={t("consultees.titre")} /> : <ConsulteesBloc commandes={consultees} langue={langue} />}

      <ReponsesBloc activite={activite} />

      <BandeauAnalyses />
    </main>
  );
}
