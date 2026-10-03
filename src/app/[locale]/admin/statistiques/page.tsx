import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { EnTeteAdmin } from "@/components/admin/en-tete-admin";
import { FiltresAdmin } from "@/components/admin/filtres-admin";
import { TuileVolume, Tuiles } from "@/components/admin/tuile-volume";
import { AnneauStatuts } from "@/components/admin/anneau-statuts";
import { Anneau } from "@/components/admin/anneau";
import { BarresAdmin } from "@/components/admin/barres-admin";
import { LignesAdmin } from "@/components/admin/lignes-admin";
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
import { lireTransporteur } from "@/lib/tracking/transporteurs";
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

  const nombre = (n: number): string => format.number(n);
  const premierJour = series[0]?.jour;
  const dernierJour = series[series.length - 1]?.jour;
  const debut = premierJour === undefined ? "" : jourCourt(format, premierJour);
  const fin = dernierJour === undefined ? "" : jourCourt(format, dernierJour);

  /** L'écart avec la période précédente, CALCULÉ sur les tables horodatées ; sans base, rien. */
  const delta = (valeur: number | null): ReactNode =>
    valeur === null ? null : (
      <span className="delta" data-ton={valeur >= 0 ? "hausse" : "baisse"}>
        {valeur >= 0 ? t("statistiques.ecartHausse", { ecart: valeur }) : t("statistiques.ecartBaisse", { ecart: Math.abs(valeur) })}
      </span>
    );
  const dessous = (aide: string | null, valeur: number | null): ReactNode => {
    const d = delta(valeur);
    if (d === null) return aide ?? t("statistiques.sansAvant");
    return (
      <>
        {aide === null ? null : `${aide} · `}
        {d} {t("statistiques.vsAvant")}
      </>
    );
  };

  const taux = (consultes: number, total: number): number | null => (total === 0 ? null : Math.round((100 * consultes) / total));
  const tauxCourant = taux(ind.liens_consultes, ind.commandes);
  const vuesTotales = series.reduce((n, j) => n + j.vues, 0);
  const sansType = Math.max(0, ind.comptes - ind.fournisseurs - ind.revendeurs);

  const bloc = (id: string, titre: string, corps: ReactNode, options: { aide?: string; periode?: boolean; anneau?: boolean } = {}) => (
    <section key={id} className={"bloc adm-bloc" + (options.anneau === true ? " adm-bloc--anneau" : "")} aria-labelledby={`stat-${id}`}>
      <header className="bloc__tete">
        <div>
          <h2 id={`stat-${id}`}>{titre}</h2>
        </div>
        {options.periode === true ? <span className="adm-periode">{t(`statistiques.fenetres.${jours}`)}</span> : null}
      </header>
      {options.aide === undefined ? null : <p className="adm-aide adm-aide--haut">{options.aide}</p>}
      {corps}
    </section>
  );
  const aucuneMesure = <p className="adm-texte pb-4">{t("statistiques.aucuneMesure")}</p>;

  const evolutionCommandes = bloc(
    "commandes",
    t("statistiques.evolutionCommandes"),
    series.length === 0 ? (
      aucuneMesure
    ) : (
      <BarresAdmin
        etiquette={t("statistiques.evolutionCommandes")}
        debut={debut}
        fin={fin}
        valeurs={series.map((j) => ({ valeur: j.commandes, info: t("panneau.barre", { jour: jourCourt(format, j.jour), n: j.commandes }) }))}
      />
    ),
    { periode: true },
  );
  const evolutionComptes = bloc(
    "comptes",
    t("statistiques.evolutionComptes"),
    series.length === 0 ? (
      aucuneMesure
    ) : (
      <LignesAdmin
        etiquette={t("statistiques.evolutionComptes")}
        debut={debut}
        fin={fin}
        series={[
          { cle: "actifs", libelle: t("statistiques.serieActifs"), trait: "var(--color-ds-accent)", valeurs: series.map((j) => j.comptes_actifs) },
          { cle: "nouveaux", libelle: t("statistiques.serieNouveaux"), trait: "var(--color-ds-succes)", valeurs: series.map((j) => j.nouveaux_comptes) },
        ]}
      />
    ),
  );
  const typesDeCompte = bloc(
    "types",
    t("statistiques.typesDeCompte"),
    <Anneau
      etiquette={t("statistiques.typesDeCompte")}
      total={ind.comptes}
      unite={t("statistiques.uniteComptes")}
      part={(pourcent) => t("statistiques.part", { part: pourcent })}
      parts={[
        { cle: "fournisseurs", libelle: t("statistiques.typeFournisseurs"), valeur: ind.fournisseurs, trait: "var(--color-ds-accent)" },
        { cle: "revendeurs", libelle: t("statistiques.typeRevendeurs"), valeur: ind.revendeurs, trait: "var(--adm-expedie)" },
        { cle: "sans", libelle: t("statistiques.typeSans"), valeur: sansType, trait: "var(--st-attente)" },
      ]}
    />,
    { anneau: true },
  );

  /* LES CINQ TRANSPORTEURS EN TÊTE ; la barre se mesure contre le PREMIER (elle
     compare les transporteurs entre eux), la part écrite dit le reste. */
  const totalColis = transporteurs.reduce((n, c) => n + c.nombre, 0);
  const tete = transporteurs.slice(0, 5);
  const premier = tete[0]?.nombre ?? 0;
  const lesTransporteurs = bloc(
    "transporteurs",
    t("statistiques.transporteurs"),
    tete.length === 0 ? (
      <p className="adm-texte pb-4">{t("statistiques.aucunColis")}</p>
    ) : (
      <ul className="adm-barres-h">
        {tete.map((c, i) => (
          <li key={c.carrier_code ?? "inconnu"}>
            <span className="truncate">{lireTransporteur(c.carrier_code)?.nom ?? t("statistiques.transporteurInconnu")}</span>
            <i aria-hidden="true">
              <b style={{ "--k": (premier === 0 ? 0 : c.nombre / premier).toFixed(3), "--i": String(i) } as React.CSSProperties} />
            </i>
            <em title={nombre(c.nombre)}>{t("statistiques.part", { part: totalColis === 0 ? 0 : Math.round((100 * c.nombre) / totalColis) })}</em>
          </li>
        ))}
      </ul>
    ),
    { aide: t("statistiques.transporteursTotal", { total: totalColis }) },
  );

  /* LA CROISSANCE : les trois derniers mois contre les trois précédents. Sans
     base, pas de pourcentage — le mot « nouveau ». */
  const somme = (cle: "comptes" | "commandes" | "colis" | "photos", debutM: number, finM: number): number =>
    croissance.slice(debutM, finM).reduce((n, m) => n + m[cle], 0);
  const laCroissance = bloc(
    "croissance",
    t("statistiques.croissance"),
    <ul className="adm-croissance">
      {(
        [
          { cle: "comptes", libelle: t("statistiques.croissanceComptes") },
          { cle: "commandes", libelle: t("statistiques.croissanceCommandes") },
          { cle: "colis", libelle: t("statistiques.croissanceColis") },
          { cle: "photos", libelle: t("statistiques.croissancePhotos") },
        ] as const
      ).map((g) => {
        const e = ecart(somme(g.cle, 6, 9), somme(g.cle, 3, 6));
        const recent = somme(g.cle, 6, 9);
        return (
          <li key={g.cle}>
            <span>{g.libelle}</span>
            {e === null ? (
              <b className="adm-sourdine">{recent === 0 ? "—" : t("statistiques.croissanceSansBase")}</b>
            ) : (
              <b className="delta" data-ton={e >= 0 ? "hausse" : "baisse"}>
                {e >= 0 ? t("statistiques.ecartHausse", { ecart: e }) : t("statistiques.ecartBaisse", { ecart: Math.abs(e) })}
              </b>
            )}
          </li>
        );
      })}
    </ul>,
    { aide: t("statistiques.croissanceAide") },
  );

  const tuileSeule = (libelle: string, valeur: string, aide: string, sourdine = false) => (
    <Tuiles etiquette={libelle} colonnes={1}>
      <TuileVolume libelle={libelle} valeur={valeur} complement={aide} valeurEnSourdine={sourdine} />
    </Tuiles>
  );

  /* LES COURBES DÉTAILLÉES des vues filtrées : la vue globale suit la maquette
     (trois chiffres), les vues « utilisation », « commandes » et « croissance »
     gardent les séries que le produit calculait déjà — rien ne se perd. */
  const pagesParJour = bloc(
    "pages",
    t("statistiques.pagesConsultees"),
    series.length === 0 ? (
      aucuneMesure
    ) : (
    <BarresAdmin
      etiquette={t("statistiques.pagesConsultees")}
      debut={debut}
      fin={fin}
      valeurs={series.map((j) => ({ valeur: j.vues, info: t("infoValeur", { libelle: jourCourt(format, j.jour), valeur: nombre(j.vues) }) }))}
    />
    ),
    { periode: true },
  );
  const tauxParJour = bloc(
    "taux",
    t("statistiques.tauxConsultes"),
    series.every((j) => j.taux_consultes === null) ? (
      aucuneMesure
    ) : (
      <LignesAdmin
        etiquette={t("statistiques.tauxConsultes")}
        debut={debut}
        fin={fin}
        series={[{ cle: "taux", libelle: t("statistiques.tauxConsultes"), trait: "var(--color-ds-accent)", valeurs: series.map((j) => j.taux_consultes) }]}
      />
    ),
  );
  const delaiParJour = bloc(
    "delai",
    t("statistiques.delaiLivraison"),
    series.every((j) => j.delai_jours === null) ? (
      aucuneMesure
    ) : (
      <LignesAdmin
        etiquette={t("statistiques.serieDelai")}
        debut={debut}
        fin={fin}
        series={[{ cle: "delai", libelle: t("statistiques.serieDelai"), trait: "var(--color-ds-accent)", valeurs: series.map((j) => j.delai_jours) }]}
      />
    ),
  );
  const statutCommandes =
    repartition === null
      ? bloc("statuts", t("statistiques.statutCommandes"), <p className="adm-texte pb-4">{t("panneau.statutsIndisponible")}</p>)
      : bloc("statuts", t("statistiques.statutCommandes"), <AnneauStatuts repartition={repartition} />, {
          anneau: true,
          aide: t("statistiques.statutTotal", { total: repartition.total }),
        });
  const croissanceMensuelle = bloc(
    "mois",
    t("statistiques.evolutionCommandes"),
    <BarresAdmin
      etiquette={t("statistiques.croissanceAide")}
      debut={croissance[0] === undefined ? "" : format.dateTime(new Date(`${croissance[0].mois}T00:00:00Z`), { month: "short", year: "numeric", timeZone: "UTC" })}
      fin={croissance.at(-1) === undefined ? "" : format.dateTime(new Date(`${croissance.at(-1)?.mois ?? ""}T00:00:00Z`), { month: "short", year: "numeric", timeZone: "UTC" })}
      valeurs={croissance.map((m) => ({
        valeur: m.commandes,
        info: t("infoValeur", {
          libelle: format.dateTime(new Date(`${m.mois}T00:00:00Z`), { month: "long", year: "numeric", timeZone: "UTC" }),
          valeur: nombre(m.commandes),
        }),
      }))}
    />,
  );

  const parVue: Record<Exclude<VueStatistiques, "globale">, ReactNode[]> = {
    utilisation: [pagesParJour, tauxParJour, delaiParJour, lesTransporteurs],
    croissance: [laCroissance, croissanceMensuelle],
    commandes: [evolutionCommandes, statutCommandes],
    comptes: [evolutionComptes, typesDeCompte],
  };

  return (
    <main id="contenu" className="tableau adm">
      <EnTeteAdmin titre={t("statistiques.titre")} sousTitre={t("statistiques.sousTitre")} />

      {/* LA VUE ET LA PÉRIODE VIVENT DANS L'URL : des liens, pas des boutons. */}
      <div className="adm-outils adm-outils--tete">
        <FiltresAdmin
          etiquette={t("statistiques.filtreVue")}
          courant={vue}
          options={VUES_STATISTIQUES.map((v) => ({ valeur: v, libelle: t(LIBELLE_VUE[v]), href: lien({ vue: v }) }))}
        />
        <FiltresAdmin
          etiquette={t("statistiques.filtreJours")}
          courant={jours}
          options={FENETRES_STATISTIQUES.map((j) => ({ valeur: j, libelle: t(LIBELLE_FENETRE[j]), href: lien({ jours: j }) }))}
        />
      </div>

      {/* SIX TUILES : les colis pris en charge prennent la place des « nouveaux
          abonnements » du kit (interdits), les liens comptent ceux qui ont été
          OUVERTS. QUE DES NOMBRES : rien n'est écrit au journal (migration 161). */}
      <Tuiles etiquette={t("statistiques.titre")} colonnes={6}>
        <TuileVolume libelle={t("statistiques.tuileCommandes")} valeur={nombre(ind.commandes)} complement={dessous(null, ecart(ind.commandes, ind.commandes_avant))} />
        <TuileVolume
          libelle={t("statistiques.tuileLiens")}
          valeur={nombre(ind.liens_consultes)}
          complement={dessous(t("statistiques.tuileLiensAide"), ecart(ind.liens_consultes, ind.liens_consultes_avant))}
        />
        <TuileVolume libelle={t("statistiques.tuilePhotos")} valeur={nombre(ind.photos)} complement={dessous(null, ecart(ind.photos, ind.photos_avant))} />
        <TuileVolume libelle={t("statistiques.tuileActifs")} valeur={nombre(ind.comptes_actifs)} complement={t("statistiques.surComptes", { total: ind.comptes })} />
        <TuileVolume libelle={t("statistiques.tuileNouveaux")} valeur={nombre(ind.nouveaux_comptes)} complement={dessous(null, ecart(ind.nouveaux_comptes, ind.nouveaux_comptes_avant))} />
        <TuileVolume libelle={t("statistiques.tuileColis")} valeur={nombre(ind.colis)} complement={dessous(t("statistiques.tuileColisAide"), ecart(ind.colis, ind.colis_avant))} />
      </Tuiles>

      {vue === "globale" ? (
        <>
          <div className="adm-rangee adm-rangee--2">
            {evolutionCommandes}
            {evolutionComptes}
          </div>
          <div className="adm-rangee adm-rangee--3">
            {typesDeCompte}
            {lesTransporteurs}
            {laCroissance}
          </div>
          <div className="adm-rangee adm-rangee--3">
            {tuileSeule(t("statistiques.pagesConsultees"), nombre(vuesTotales), t("statistiques.surFenetre", { jours: Number(jours) }))}
            {tuileSeule(
              t("statistiques.tauxConsultes"),
              tauxCourant === null ? "—" : t("statistiques.tauxValeur", { valeur: tauxCourant }),
              t("statistiques.tuileLiensAide"),
              tauxCourant === null,
            )}
            {tuileSeule(
              t("statistiques.delaiLivraison"),
              ind.delai_jours === null ? "—" : t("statistiques.delaiValeur", { valeur: ind.delai_jours }),
              t("statistiques.delaiAide"),
              ind.delai_jours === null,
            )}
          </div>
        </>
      ) : (
        <div className="adm-rangee adm-rangee--2">{parVue[vue]}</div>
      )}
    </main>
  );
}
