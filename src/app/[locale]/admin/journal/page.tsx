import { getTranslations, setRequestLocale } from "next-intl/server";
import { getFormateur } from "@/lib/format/formateur";
import type { Metadata } from "next";
import { EnTeteAdmin } from "@/components/admin/en-tete-admin";
import { LockKeyhole } from "lucide-react";
import { exigerAdmin } from "@/lib/audit/garde";
import {
  compterJournal,
  repartirJournal,
  PLAFOND_COMPTAGE_JOURNAL,
  lireJournal,
  FAMILLES_JOURNAL,
  FENETRES_JOURNAL,
  ParametresJournal,
} from "@/lib/audit/comptes";
import { creerClientServeur } from "@/lib/supabase/server";
import { estLangueSupportee } from "@/i18n/config";
import { LienEcran } from "@/components/lien-ecran";
import { Anneau } from "@/components/admin/anneau";
import { EntreeJournal } from "@/components/admin/entree-journal";
import { FiltresAdmin } from "@/components/admin/filtres-admin";
import { TuileVolume, Tuiles } from "@/components/admin/tuile-volume";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // LA GARDE COURT AUSSI ICI. Next évalue les métadonnées EN PARALLÈLE du
  // rendu : sans elle, le titre de l'écran partait dans le corps du 404 servi à
  // un visiteur sans droits, et révélait la surface que le code de réponse
  // cachait. L'appel est mémoïsé par requête, donc il ne coûte rien de plus.
  await exigerAdmin();
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("journal.titre"), robots: { index: false, follow: false } };
}

/**
 * LE JOURNAL D'AUDIT.
 *
 * LE TITRE DE LA MAQUETTE STITCH EST ABANDONNÉ DEPUIS LONGTEMPS. Elle l'appelait
 * « QC Master Logs » : personne n'inspecte de contrôle qualité chez nous, et ce
 * journal ne parle pas de commandes mais de ce que NOUS avons consulté chez les
 * autres.
 *
 * LIRE CETTE PAGE N'ÉCRIT RIEN. Sans cette règle, l'ouvrir y ajouterait une
 * ligne, laquelle apparaîtrait à la consultation suivante : le journal se
 * remplirait de sa propre consultation et noierait ce qu'il conserve. La
 * garantie n'est pas dans ce fichier — les fonctions en base sont déclarées
 * `stable`, donc PostgREST les exécute en transaction lecture seule et le moteur
 * refuserait toute écriture qu'on y ajouterait.
 *
 * LE MOTIF EST EN CLAIR, LE RESTE DE LA CHARGE UTILE NON. Le motif est la pièce
 * qu'on demanderait en cas de litige, et le replier derrière un détail que
 * personne n'ouvre reviendrait à ne pas l'avoir. L'avant/après d'un paramètre
 * système l'est aussi : un seuil n'appartient à aucun vendeur, ce sont nos
 * propres réglages.
 *
 * ⚠️ LES CRITÈRES D'UNE CONSULTATION RESTENT FERMÉS, alors que la planche les
 * affiche — « état = suspendu · tri = date d'inscription · 3 résultats ». Ils
 * contiennent la RECHERCHE saisie, donc souvent l'adresse d'un vendeur, et
 * étaler tout le reste ferait de ce journal une surface de fuite de plus :
 * celle-là consultable par tous les administrateurs à la fois.
 */
export default async function AdminJournal({
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

  const parametres = ParametresJournal.parse({
    famille: seul("famille"),
    jours: seul("jours"),
    curseur: seul("curseur") ?? null,
  });

  const supabase = await creerClientServeur();
  const [page, decompte, repartition] = await Promise.all([
    lireJournal(supabase, parametres),
    compterJournal(supabase, parametres, PLAFOND_COMPTAGE_JOURNAL),
    // LA RÉPARTITION IGNORE LA FAMILLE ET SUIT LA FENÊTRE : un anneau filtré sur
    // une seule famille n'aurait qu'une part, et dirait 100 % de ce qu'on vient
    // de sélectionner. C'est la répartition DE LA PÉRIODE qu'on vient y lire.
    repartirJournal(supabase, parametres.jours, PLAFOND_COMPTAGE_JOURNAL),
  ]);
  const { total, depasse } = decompte;

  const t = await getTranslations("admin");
  const format = await getFormateur();
  const base = `/${langue}/admin/journal`;

  /** Une URL de filtre. Le CURSEUR est jeté : il désigne une position dans un
   *  classement que le filtre vient de changer. */
  const lien = (famille: string, jours: number): string => {
    const params = new URLSearchParams();
    if (famille !== "") params.set("famille", famille);
    if (jours !== 0) params.set("jours", String(jours));
    const suffixe = params.toString();
    return suffixe === "" ? base : `${base}?${suffixe}`;
  };

  const lienSuivant =
    page.curseurSuivant === null
      ? null
      : `${base}?${new URLSearchParams({
          ...(parametres.famille === "" ? {} : { famille: parametres.famille }),
          ...(parametres.jours === 0 ? {} : { jours: String(parametres.jours) }),
          curseur: page.curseurSuivant,
        }).toString()}`;

  /** La part d'une famille dans le total de la fenetre. */
  const part = (n: number): number =>
    repartition === null || repartition.total === 0
      ? 0
      : Math.round((n / repartition.total) * 100);
  const valeur = (n: number | undefined): string => (n === undefined ? "—" : format.number(n));

  return (
    <main id="contenu" className="tableau adm">
      <EnTeteAdmin
        titre={t("journal.titre")}
        sousTitre={t("journal.sousTitreListe")}
      />

      {/* LES FAMILLES DU JOURNAL, qui sont exactement celles du filtre : un
          journal de GESTES d'administration n'a ni niveau, ni code de retour,
          ni latence. */}
      <Tuiles etiquette={t("chiffresCles")} colonnes={4}>
        <TuileVolume
          libelle={t("journal.tuileTotal")}
          valeurEnSourdine={repartition === null}
          valeur={repartition === null ? t("panneau.stockageIndisponible") : format.number(repartition.total)}
          complement={t("journal.surLaFenetre")}
        />
        <TuileVolume
          libelle={t("journal.tuileSuspensions")}
          valeur={valeur(repartition?.suspensions)}
          complement={t("journal.partDuTotal", { part: part(repartition?.suspensions ?? 0) })}
        />
        <TuileVolume
          libelle={t("journal.tuileParametres")}
          valeur={valeur(repartition?.parametres)}
          complement={t("journal.partDuTotal", { part: part(repartition?.parametres ?? 0) })}
        />
        <TuileVolume
          libelle={t("journal.tuileConsultations")}
          valeur={valeur(repartition?.consultations)}
          complement={t("journal.partDuTotal", { part: part(repartition?.consultations ?? 0) })}
        />
      </Tuiles>

      {/* CE QUE CE JOURNAL GARANTIT, dit avant qu'on le lise. Au téléphone, le
          sous-titre porte cette garantie : l'encart y est masqué. */}
      <p className="adm-garantie">
        <LockKeyhole aria-hidden="true" className="ic" />
        <span>{t("journal.garantie")}</span>
      </p>

      <div className="adm-rangee adm-rangee--liste">
        <section className="bloc adm-bloc" aria-labelledby="adm-liste">
          <header className="bloc__tete">
            <div>
              <h2 id="adm-liste">{t("journal.liste")}</h2>
              <p className="adm-aide">
                {depasse ? t("journal.listeTotalAuDela", { total }) : t("journal.listeTotal", { total })}
              </p>
            </div>
          </header>
          {/* LE FILTRE VIT DANS L'URL : il se partage, se recharge, revient avec
              le bouton retour. Le curseur est jeté à chaque changement. */}
          <div className="adm-outils">
            <FiltresAdmin
              etiquette={t("journal.filtreFamille")}
              courant={parametres.famille}
              options={(["", ...FAMILLES_JOURNAL] as const).map((f) => ({
                valeur: f,
                libelle: t(`journal.famille.${f === "" ? "toutes" : f}`),
                href: lien(f, parametres.jours),
              }))}
            />
            <FiltresAdmin
              etiquette={t("journal.filtreFenetre")}
              courant={String(parametres.jours)}
              options={FENETRES_JOURNAL.map((j) => ({
                valeur: String(j),
                libelle: t(`journal.fenetre.${j}`),
                href: lien(parametres.famille, j),
              }))}
            />
          </div>

          {page.lignes.length === 0 ? (
            <p className="adm-vide">
              {parametres.famille === "" && parametres.jours === 0 ? t("journal.vide") : t("journal.videFiltre")}
            </p>
          ) : (
            <ol className="adm-journal">
              {page.lignes.map((l) => (
                <EntreeJournal key={l.id} ligne={l} />
              ))}
            </ol>
          )}

          {/* LE PIED DIT COMBIEN : « Voir la suite » sans nombre ne dit pas s'il
              reste dix lignes ou dix mille. Il le dit AUSSI sur la dernière page,
              comme la maquette (contre-audit du 03/10/2026) : le nombre ne dépend
              pas de l'existence d'une suite. */}
          {page.lignes.length === 0 ? null : (
            <footer className="adm-pied">
              <span>
                {depasse
                  ? t("journal.surTotalAuDela", { affichees: page.lignes.length, total })
                  : t("journal.surTotal", { affichees: page.lignes.length, total })}
              </span>
              {lienSuivant === null ? null : (
                <LienEcran prefetch={false} href={lienSuivant} className="bouton-outil">
                  {t("journal.pageSuivante")}
                </LienEcran>
              )}
            </footer>
          )}
        </section>

        <section className="bloc adm-bloc adm-bloc--anneau" aria-labelledby="adm-repartition">
          <header className="bloc__tete">
            <div>
              <h2 id="adm-repartition">{t("journal.repartition")}</h2>
            </div>
          </header>
          {repartition === null ? (
            <p className="adm-texte pb-4">{t("journal.repartitionIndisponible")}</p>
          ) : (
            <Anneau
              etiquette={t("journal.repartition")}
              total={repartition.total}
              unite={t("journal.unite")}
              part={(pourcent) => t("journal.part", { part: pourcent })}
              parts={[
                { cle: "consultation", libelle: t("journal.famille.consultation"), valeur: repartition.consultations, trait: "var(--color-ds-accent)" },
                { cle: "suspension", libelle: t("journal.famille.suspension"), valeur: repartition.suspensions, trait: "var(--color-ds-erreur)" },
                { cle: "parametre", libelle: t("journal.famille.parametre"), valeur: repartition.parametres, trait: "var(--color-ds-alerte)" },
              ]}
            />
          )}
        </section>
      </div>
    </main>
  );
}
