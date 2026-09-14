import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Clock,
  Eye,
  Image as IconeImage,
  Link2,
  Package,
  ShoppingCart,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { EnTeteAdmin } from "@/components/admin/en-tete-admin";
import { SelecteurAdmin } from "@/components/admin/selecteur-admin";
import { TuileVolume } from "@/components/admin/tuile-volume";
import { AnneauStatuts } from "@/components/admin/anneau-statuts";
import { Anneau } from "@/components/admin/anneau";
import { CourbeCommandes } from "@/components/admin/courbe-commandes";
import { GraphiqueLignes } from "@/components/admin/graphique-lignes";
import { GraphiqueBarres } from "@/components/admin/graphique-barres";
import { jourCourt } from "@/components/admin/echelle";
import { exigerAdmin } from "@/lib/audit/garde";
import { lireRepartition } from "@/lib/audit/panneau";
import {
  ecart,
  FENETRES_STATISTIQUES,
  lireCroissance,
  lireIndicateurs,
  lireSeries,
  lireTransporteurs,
  ParametresStatistiques,
  VUES_STATISTIQUES,
  type VueStatistiques,
} from "@/lib/audit/statistiques";
import { lireTransporteur, monogramme } from "@/lib/tracking/transporteurs";
import { creerClientServeur } from "@/lib/supabase/server";
import { estLangueSupportee } from "@/i18n/config";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // LA GARDE COURT AUSSI ICI : Next évalue les métadonnées EN PARALLÈLE du
  // rendu, et le titre partirait sinon dans le corps du 404 servi à qui n'a pas
  // les droits.
  await exigerAdmin();
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("statistiques.titre"), robots: { index: false, follow: false } };
}

/*
 * LES CLÉS DE LIBELLÉ SONT ÉCRITES EN TOUTES LETTRES : l'inventaire des chaînes
 * mortes lit les appels du code, et une clé composée à l'exécution lui échappe.
 */
const LIBELLE_VUE: Record<VueStatistiques, string> = {
  globale: "statistiques.vues.globale",
  utilisation: "statistiques.vues.utilisation",
  croissance: "statistiques.vues.croissance",
  commandes: "statistiques.vues.commandes",
  comptes: "statistiques.vues.comptes",
};
const LIBELLE_FENETRE = {
  "7": "statistiques.fenetres.7",
  "30": "statistiques.fenetres.30",
  "90": "statistiques.fenetres.90",
} as const;

/* LES GÉOMÉTRIES DU KIT : `AdminPanel` (remplissage 22, titre 18/700) et
   `StatCard` (remplissage 20, pastille 34, titre 16/700, valeur 27/800). */
const PANNEAU =
  "flex min-w-0 flex-col rounded-ds-card-lg border border-ds-filet bg-ds-surface-carte p-4 shadow-ds-card md:p-[22px]";
const PANNEAU_TITRE = "text-[18px] leading-[normal] font-bold tracking-[-0.025em] text-ds-texte-titre";
const PANNEAU_AIDE = "mt-[3px] text-[13px] leading-[normal] text-ds-texte-corps";

/**
 * LES STATISTIQUES DE LA PLATEFORME — décision de Wassim du 14/09/2026.
 *
 * DES VOLUMES, JAMAIS UN NOM. Aucune des quatre fonctions de la migration 161 ne
 * rend une ligne tierce : l'écran ne trace donc rien au journal, comme l'anneau
 * et la courbe de la vue d'ensemble.
 *
 * ⚠️ CE QUE LE KIT MONTRE ET QUE L'ÉCRAN NE MONTRE PAS : les abonnements (tuile,
 * onglet, anneau — contrainte n°1), l'activité récente (elle nommerait des
 * vendeurs à chaque ouverture) et les badges qui n'ont pas de période
 * précédente à comparer. À la place de l'anneau des abonnements : les TYPES DE
 * COMPTE, la segmentation d'usage que le brief place au cœur de la validation.
 *
 * VUE ET PÉRIODE DANS L'URL : l'écran se partage et se recharge tel quel, et il
 * n'embarque aucun îlot client.
 */
export default async function AdminStatistiques({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const langue = estLangueSupportee(locale) ? locale : "fr";
  setRequestLocale(langue);

  await exigerAdmin();

  const brut = await searchParams;
  const seul = (cle: string): string | undefined =>
    Array.isArray(brut[cle]) ? brut[cle][0] : brut[cle];
  const { jours, vue } = ParametresStatistiques.parse({ jours: seul("jours"), vue: seul("vue") });

  const supabase = await creerClientServeur();
  const [ind, series, transporteurs, croissance, repartition] = await Promise.all([
    lireIndicateurs(supabase, jours),
    lireSeries(supabase, jours),
    lireTransporteurs(supabase, jours),
    lireCroissance(supabase),
    lireRepartition(supabase),
  ]);

  const t = await getTranslations("admin");
  const format = await getFormatter();
  const base = `/${langue}/admin/statistiques`;

  const lien = (criteres: { jours?: string; vue?: string }): string => {
    const p = new URLSearchParams();
    const j = criteres.jours ?? jours;
    const v = criteres.vue ?? vue;
    if (v !== "globale") p.set("vue", v);
    if (j !== "30") p.set("jours", j);
    const s = p.toString();
    return s === "" ? base : `${base}?${s}`;
  };

  const montre = (v: VueStatistiques): boolean => vue === "globale" || vue === v;
  const etiquettes = series.map((j) => jourCourt(format, j.jour));
  const nombre = (n: number): string => format.number(n);

  /** Le badge d'écart du kit, ou rien quand la période précédente n'a pas de base. */
  const badge = (valeur: number | null, taille: "tuile" | "carte"): ReactNode => {
    if (valeur === null) return null;
    const hausse = valeur >= 0;
    const Fleche = hausse ? ArrowUp : ArrowDown;
    return (
      <span
        className={
          "inline-flex items-center rounded-ds-pill font-bold " +
          (taille === "tuile" ? "gap-0.5 px-[7px] py-0.5 text-[11.5px] lg:text-[11px] " : "gap-[3px] px-[9px] py-[3px] text-[12px] ") +
          (hausse ? "bg-ds-succes-fond text-ds-succes" : "bg-ds-erreur-fond text-ds-erreur")
        }
      >
        <Fleche aria-hidden="true" size={taille === "tuile" ? 10 : 11} strokeWidth={3} />
        {hausse
          ? t("statistiques.ecartHausse", { ecart: valeur })
          : t("statistiques.ecartBaisse", { ecart: Math.abs(valeur) })}
      </span>
    );
  };

  const taux = (consultes: number, total: number): number | null =>
    total === 0 ? null : Math.round((100 * consultes) / total);
  const tauxCourant = taux(ind.liens_consultes, ind.commandes);
  const tauxAvant = taux(ind.liens_consultes_avant, ind.commandes_avant);

  const carte = (
    Icone: LucideIcon,
    titre: string,
    valeur: string,
    ecartValeur: number | null,
    corps: ReactNode,
    sourdine = false,
  ) => (
    <section className="flex min-w-0 flex-col rounded-ds-card-lg border border-ds-filet bg-ds-surface-carte p-4 shadow-ds-card md:p-5">
      <div className="mb-2.5 flex items-center gap-[11px]">
        <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-ds-sm bg-ds-surface-teinte text-ds-accent">
          <Icone aria-hidden="true" size={17} strokeWidth={1.9} />
        </span>
        <h2 className="min-w-0 text-[16px] leading-[normal] font-bold tracking-[-0.02em] text-ds-texte-titre">{titre}</h2>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-[11px]">
        <span
          className={
            "text-[27px] leading-[normal] font-extrabold tracking-[-0.045em] " +
            (sourdine ? "text-ds-texte-sourdine" : "text-ds-texte-fort")
          }
        >
          {valeur}
        </span>
        {badge(ecartValeur, "carte")}
      </div>
      {corps}
    </section>
  );

  const panneau = (titre: string, aide: string | null, corps: ReactNode) => (
    <section className={PANNEAU}>
      <header className="mb-[18px]">
        <h2 className={PANNEAU_TITRE}>{titre}</h2>
        {aide === null ? null : <p className={PANNEAU_AIDE}>{aide}</p>}
      </header>
      <div className="min-w-0 flex-1">{corps}</div>
    </section>
  );

  const aucuneMesure = <p className="text-[14px] text-ds-texte-corps">{t("statistiques.aucuneMesure")}</p>;

  /* --- LES CARTES, dans l'ordre des rangées du kit --- */
  const evolutionCommandes = montre("commandes")
    ? carte(
        CalendarDays,
        t("statistiques.evolutionCommandes"),
        nombre(ind.commandes),
        ecart(ind.commandes, ind.commandes_avant),
        <CourbeCommandes jours={series.map((j) => ({ jour: j.jour, total: j.commandes }))} hauteur={185} reperes={5} />,
      )
    : null;

  const evolutionComptes = montre("comptes")
    ? carte(
        Users,
        t("statistiques.evolutionComptes"),
        nombre(ind.comptes_actifs),
        ecart(ind.comptes_actifs, ind.comptes_actifs_avant),
        <GraphiqueLignes
          hauteur={172}
          etiquettes={etiquettes}
          series={[
            { cle: "nouveaux", libelle: t("statistiques.serieNouveaux"), trait: "var(--color-ds-accent)", valeurs: series.map((j) => j.nouveaux_comptes) },
            { cle: "actifs", libelle: t("statistiques.serieActifs"), trait: "var(--color-ds-violet-300)", valeurs: series.map((j) => j.comptes_actifs) },
          ]}
        />,
      )
    : null;

  const sansType = Math.max(0, ind.comptes - ind.fournisseurs - ind.revendeurs);
  const typesDeCompte = montre("comptes")
    ? panneau(
        t("statistiques.typesDeCompte"),
        t("statistiques.typesTotal", { total: ind.comptes }),
        <Anneau
          variante="statistiques"
          total={ind.comptes}
          unite={t("statistiques.uniteComptes")}
          part={(pourcent) => t("statistiques.part", { part: pourcent })}
          parts={[
            { cle: "fournisseurs", libelle: t("statistiques.typeFournisseurs"), valeur: ind.fournisseurs, trait: "var(--color-ds-accent)" },
            { cle: "revendeurs", libelle: t("statistiques.typeRevendeurs"), valeur: ind.revendeurs, trait: "var(--color-ds-violet-300)" },
            { cle: "sans", libelle: t("statistiques.typeSans"), valeur: sansType, trait: "var(--color-ds-filet-appuye)" },
          ]}
        />,
      )
    : null;

  const vuesTotales = series.reduce((n, j) => n + j.vues, 0);
  const pagesConsultees = montre("utilisation")
    ? carte(
        Eye,
        t("statistiques.pagesConsultees"),
        nombre(vuesTotales),
        null,
        <GraphiqueBarres hauteur={132} valeurs={series.map((j) => j.vues)} etiquettes={etiquettes} />,
      )
    : null;

  const tauxConsultes = montre("utilisation")
    ? carte(
        Link2,
        t("statistiques.tauxConsultes"),
        tauxCourant === null ? "—" : t("statistiques.tauxValeur", { valeur: tauxCourant }),
        ecart(tauxCourant, tauxAvant),
        series.every((j) => j.taux_consultes === null) ? (
          aucuneMesure
        ) : (
          <GraphiqueLignes
            hauteur={130}
            etiquettes={etiquettes}
            series={[{ cle: "taux", libelle: t("statistiques.tauxConsultes"), trait: "var(--color-ds-accent)", valeurs: series.map((j) => j.taux_consultes) }]}
          />
        ),
        tauxCourant === null,
      )
    : null;

  const delai = montre("utilisation")
    ? carte(
        Clock,
        t("statistiques.delaiLivraison"),
        ind.delai_jours === null ? "—" : t("statistiques.delaiValeur", { valeur: ind.delai_jours }),
        ecart(ind.delai_jours, ind.delai_jours_avant),
        series.every((j) => j.delai_jours === null) ? (
          aucuneMesure
        ) : (
          <GraphiqueLignes
            hauteur={130}
            etiquettes={etiquettes}
            series={[{ cle: "delai", libelle: t("statistiques.serieDelai"), trait: "var(--color-ds-accent)", valeurs: series.map((j) => j.delai_jours) }]}
          />
        ),
        ind.delai_jours === null,
      )
    : null;

  const statutCommandes =
    montre("commandes") && repartition !== null
      ? panneau(
          t("statistiques.statutCommandes"),
          t("statistiques.statutTotal", { total: repartition.total }),
          <AnneauStatuts repartition={repartition} variante="statistiques" />,
        )
      : null;

  /* LES CINQ TRANSPORTEURS EN TÊTE, et leur part des colis de la fenêtre. La barre
     se mesure contre le PREMIER, comme au kit : elle compare les transporteurs
     entre eux, la part écrite dit le reste. */
  const totalColis = transporteurs.reduce((n, c) => n + c.nombre, 0);
  const tete = transporteurs.slice(0, 5);
  const premier = tete[0]?.nombre ?? 0;
  const lesTransporteurs = montre("utilisation")
    ? panneau(
        t("statistiques.transporteurs"),
        t("statistiques.transporteursTotal", { total: totalColis }),
        tete.length === 0 ? (
          <p className="text-[14px] text-ds-texte-corps">{t("statistiques.aucunColis")}</p>
        ) : (
          <ul className="flex flex-col gap-[15px]">
            {tete.map((c) => {
              const connu = lireTransporteur(c.carrier_code);
              const nom = connu?.nom ?? t("statistiques.transporteurInconnu");
              const m = connu === null ? null : monogramme(connu.nom);
              const court = m?.court ?? "?";
              return (
                <li key={c.carrier_code ?? "inconnu"} className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className={
                      "inline-flex h-[30px] w-[30px] flex-none items-center justify-center rounded-ds-sm font-extrabold tracking-[-0.02em] " +
                      (court.length > 2 ? "text-[11.5px] lg:text-[9px] " : "text-[11.5px] lg:text-[11px] ") +
                      (m?.fond == null ? "bg-ds-surface-creux text-ds-texte-corps" : "")
                    }
                    style={m?.fond == null ? undefined : { background: m.fond, color: m.encre ?? undefined }}
                  >
                    {court}
                  </span>
                  <span className="w-24 flex-none truncate text-[13.5px] leading-[normal] text-ds-texte-fort">{nom}</span>
                  <span className="h-[9px] min-w-10 flex-1 overflow-hidden rounded-ds-pill bg-ds-surface-creux">
                    <span
                      className="block h-full rounded-ds-pill bg-[image:var(--degrade-ds-marque-calme)] text-ds-texte-sur-marque"
                      style={{ width: `${premier === 0 ? 0 : (100 * c.nombre) / premier}%` }}
                    />
                  </span>
                  <span className="w-9 text-right text-[13.5px] leading-[normal] font-bold text-ds-texte-fort">
                    {t("statistiques.part", { part: totalColis === 0 ? 0 : Math.round((100 * c.nombre) / totalColis) })}
                  </span>
                  <span className="w-[52px] text-right text-[12.5px] leading-[normal] text-ds-texte-sourdine">
                    {t("statistiques.nombreEntreParentheses", { nombre: nombre(c.nombre) })}
                  </span>
                </li>
              );
            })}
          </ul>
        ),
      )
    : null;

  /* LA CROISSANCE : les trois derniers mois (le courant compris) contre les trois
     précédents. Sans base, pas de pourcentage — le mot « nouveau ». */
  const somme = (cle: "comptes" | "commandes" | "colis" | "photos", debut: number, fin: number): number =>
    croissance.slice(debut, fin).reduce((n, m) => n + m[cle], 0);
  const indicateursCroissance = (
    [
      { cle: "comptes", icone: UserPlus, libelle: t("statistiques.croissanceComptes") },
      { cle: "commandes", icone: ShoppingCart, libelle: t("statistiques.croissanceCommandes") },
      { cle: "colis", icone: Package, libelle: t("statistiques.croissanceColis") },
      { cle: "photos", icone: IconeImage, libelle: t("statistiques.croissancePhotos") },
    ] as const
  ).map((g) => ({ ...g, ecart: ecart(somme(g.cle, 6, 9), somme(g.cle, 3, 6)), recent: somme(g.cle, 6, 9) }));

  const laCroissance = montre("croissance")
    ? panneau(
        t("statistiques.croissance"),
        t("statistiques.croissanceAide"),
        <>
          <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-3.5">
            {indicateursCroissance.map((g) => {
              const Icone = g.icone;
              return (
                <div key={g.cle} className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-ds-sm bg-ds-surface-teinte text-ds-accent">
                    <Icone aria-hidden="true" size={16} strokeWidth={1.9} />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[12.5px] leading-[normal] text-ds-texte-sourdine">{g.libelle}</span>
                    <span
                      className={
                        "text-[16px] leading-[normal] font-extrabold tracking-[-0.03em] " +
                        (g.ecart === null
                          ? "text-ds-texte-sourdine"
                          : g.ecart >= 0
                            ? "text-ds-succes"
                            : "text-ds-erreur")
                      }
                    >
                      {g.ecart === null
                        ? g.recent === 0
                          ? "—"
                          : t("statistiques.croissanceSansBase")
                        : g.ecart >= 0
                          ? t("statistiques.ecartHausse", { ecart: g.ecart })
                          : t("statistiques.ecartBaisse", { ecart: Math.abs(g.ecart) })}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
          <GraphiqueBarres
            hauteur={150}
            valeurs={croissance.map((m) => m.commandes)}
            etiquettes={croissance.map((m) =>
              format.dateTime(new Date(`${m.mois}T00:00:00Z`), { month: "short", year: "numeric", timeZone: "UTC" }),
            )}
          />
        </>,
      )
    : null;

  const cartes = [
    evolutionCommandes,
    evolutionComptes,
    typesDeCompte,
    pagesConsultees,
    tauxConsultes,
    delai,
    statutCommandes,
    lesTransporteurs,
    laCroissance,
  ].filter((c) => c !== null);

  return (
    <main id="contenu" className="md:px-8 md:pt-0 md:pb-8">
      <EnTeteAdmin titre={t("statistiques.titre")} sousTitre={t("statistiques.sousTitre")} sousTitreAuBureauSeulement />

      <div className="flex flex-col gap-2.5 px-4 py-3.5 md:mt-5 md:gap-[18px] md:px-0 md:py-0">
        {/* --- SIX TUILES, COMME LE KIT ---

            Ses « Liens clients générés » valent le nombre de commandes — une
            commande, un lien — et ne diraient rien de plus : la tuile compte
            ceux qui ont été OUVERTS. Ses « Nouvelles boutiques » sont nos
            nouveaux comptes, une boutique naissant avec son compte. Ses
            « Nouveaux abonnements » sont interdits : la sixième tuile compte
            les colis pris en charge, le seul poste facturé du produit. */}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-6 xl:gap-3.5">
          <TuileVolume
            icone={ShoppingCart}
            compacte
            libelle={t("statistiques.tuileCommandes")}
            valeur={nombre(ind.commandes)}
            badge={badge(ecart(ind.commandes, ind.commandes_avant), "tuile")}
            complement={ecart(ind.commandes, ind.commandes_avant) === null ? t("statistiques.sansAvant") : t("statistiques.vsAvant")}
          />
          <TuileVolume
            icone={Link2}
            compacte
            teinte="info"
            libelle={t("statistiques.tuileLiens")}
            valeur={nombre(ind.liens_consultes)}
            badge={badge(ecart(ind.liens_consultes, ind.liens_consultes_avant), "tuile")}
            complement={
              ecart(ind.liens_consultes, ind.liens_consultes_avant) === null
                ? t("statistiques.tuileLiensAide")
                : t("statistiques.vsAvant")
            }
          />
          <TuileVolume
            icone={IconeImage}
            compacte
            teinte="succes"
            libelle={t("statistiques.tuilePhotos")}
            valeur={nombre(ind.photos)}
            badge={badge(ecart(ind.photos, ind.photos_avant), "tuile")}
            complement={ecart(ind.photos, ind.photos_avant) === null ? t("statistiques.sansAvant") : t("statistiques.vsAvant")}
          />
          <TuileVolume
            icone={Users}
            compacte
            libelle={t("statistiques.tuileActifs")}
            valeur={nombre(ind.comptes_actifs)}
            badge={badge(ecart(ind.comptes_actifs, ind.comptes_actifs_avant), "tuile")}
            complement={t("statistiques.surComptes", { total: ind.comptes })}
          />
          <TuileVolume
            icone={UserPlus}
            compacte
            teinte="alerte"
            libelle={t("statistiques.tuileNouveaux")}
            valeur={nombre(ind.nouveaux_comptes)}
            badge={badge(ecart(ind.nouveaux_comptes, ind.nouveaux_comptes_avant), "tuile")}
            complement={t("statistiques.surComptes", { total: ind.comptes })}
          />
          <TuileVolume
            icone={Package}
            compacte
            teinte="info"
            libelle={t("statistiques.tuileColis")}
            valeur={nombre(ind.colis)}
            badge={badge(ecart(ind.colis, ind.colis_avant), "tuile")}
            complement={t("statistiques.tuileColisAide")}
          />
        </div>

        {/* --- LES VUES ET LA PÉRIODE ---

            Des LIENS, pas des boutons : la vue vit dans l'URL. Au téléphone la
            rangée défile plutôt que de passer sur trois lignes. */}
        <div className="flex flex-wrap items-center gap-3.5">
          <nav
            aria-label={t("statistiques.filtreVue")}
            className="defilement-discret -mx-4 flex min-w-0 flex-1 gap-2.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:overflow-visible md:px-0"
          >
            {VUES_STATISTIQUES.map((v) => {
              const courante = v === vue;
              return (
                <Link
                  key={v}
                  href={lien({ vue: v })}
                  aria-current={courante ? "page" : undefined}
                  className={
                    "flex h-11 flex-none items-center rounded-ds-card border px-5 text-[13.5px] leading-[normal] whitespace-nowrap lg:h-[42px] " +
                    (courante
                      ? "border-transparent bg-[image:var(--degrade-ds-marque-calme)] font-bold text-ds-texte-sur-marque"
                      : "border-ds-filet bg-ds-surface-carte font-medium text-ds-texte-corps hover:bg-ds-surface-creux")
                  }
                >
                  {t(LIBELLE_VUE[v])}
                </Link>
              );
            })}
          </nav>
          <SelecteurAdmin
            etiquette={t("statistiques.filtreJours")}
            courant={jours}
            largeurMin={185}
            options={FENETRES_STATISTIQUES.map((j) => ({
              valeur: j,
              libelle: t(LIBELLE_FENETRE[j]),
              href: lien({ jours: j }),
            }))}
          />
        </div>

        {/* --- LES CARTES ---

            En vue globale, les trois rangées du kit ; sur un onglet, une grille
            qui se remplit — le kit fait de même. L'« Activité récente » du kit
            n'est pas portée : elle nommerait des vendeurs à chaque ouverture. */}
        {vue === "globale" ? (
          <>
            <div className="grid gap-2.5 md:gap-[18px] xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1.05fr)_minmax(330px,1fr)] xl:items-start">
              {evolutionCommandes}
              {evolutionComptes}
              {typesDeCompte}
            </div>
            <div className="grid gap-2.5 md:gap-[18px] xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(330px,1.1fr)] xl:items-start">
              {pagesConsultees}
              {tauxConsultes}
              {delai}
              {statutCommandes}
            </div>
            <div className="grid gap-2.5 md:gap-[18px] xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] xl:items-start">
              {lesTransporteurs}
              {laCroissance}
            </div>
          </>
        ) : (
          <div className="grid gap-2.5 md:gap-[18px] xl:grid-cols-[repeat(auto-fit,minmax(340px,1fr))] xl:items-start">
            {cartes}
          </div>
        )}
      </div>
    </main>
  );
}
