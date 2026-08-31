import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { EnTeteAdmin } from "@/components/admin/en-tete-admin";
import { Icone } from "@/components/icone";
import { exigerAdmin } from "@/lib/audit/garde";
import { natureDAction } from "@/lib/admin/nature-d-action";
import {
  compterJournal,
  PLAFOND_COMPTAGE_JOURNAL,
  lireJournal,
  FAMILLES_JOURNAL,
  FENETRES_JOURNAL,
  ParametresJournal,
  type LigneJournal,
} from "@/lib/audit/comptes";
import { creerClientServeur } from "@/lib/supabase/server";
import { estLangueSupportee } from "@/i18n/config";
import { LienEcran } from "@/components/lien-ecran";

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
 * LA PILULE DE FILTRE DU JOURNAL — un rectangle arrondi, et non une pilule
 * pleine : elle occupe la place des deux listes déroulantes que la planche
 * posait là, et en garde la géométrie.
 *
 * ⚠️ 44 px, PAS 42. La planche écrit `height: 42px` sur une boîte en
 * `content-box` : avec son filet, elle REND 44. Quatrième fois cette séance que
 * l'attribut et le rendu ne disent pas la même chose.
 */
const PILULE_FILTRE =
  "inline-flex min-h-11 items-center rounded-full border px-[13px] font-headline-md text-[13px] leading-4 font-semibold whitespace-nowrap transition-colors md:rounded-[11px]";

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
  const [page, decompte] = await Promise.all([
    lireJournal(supabase, parametres),
    compterJournal(supabase, parametres, PLAFOND_COMPTAGE_JOURNAL),
  ]);
  const { total, depasse } = decompte;

  const t = await getTranslations("admin");
  const format = await getFormatter();
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

  /**
   * LA COULEUR SUIT LA NATURE, PAS LA FAMILLE.
   *
   * Cet écran repliait tout `compte.*` sur « suspension » : une réactivation
   * s'affichait donc en rouge, pilule et motif compris, alors que le Panneau la
   * peignait en vert. Deux règles écrites séparément avaient divergé, et c'est
   * la plus permissive qui gagnait — ici, sur l'écran qu'on ouvre justement
   * pour savoir ce qui s'est passé.
   *
   * La FAMILLE, elle, reste volontairement aveugle à cette distinction : elle
   * sert au filtre, et la base range tout `compte.%` sous « suspension ».
   */
  const TEINTE = {
    suspension: "bg-alerte-fond-vif text-alerte",
    reactivation: "bg-succes-fond text-succes",
    parametre: "bg-violet-fond text-violet-encre",
    consultation: "bg-fond-neutre text-ardoise",
  } as const;

  /** Le filet de gauche de l'encart de motif, teinté comme la pilule. */
  const MOTIF = {
    suspension: "border-alerte-puce bg-alerte-fond-doux",
    reactivation: "border-succes bg-succes-fond-doux",
    parametre: "border-violet bg-violet-fond",
    consultation: "border-gris-inactif bg-fond-neutre",
  } as const;

  const libelleAction = (l: LigneJournal): string =>
    // LE POINT DEVIENT UN SOULIGNÉ : next-intl traite le point comme un
    // séparateur de NIVEAU, donc `journal.actions.compte.suspension` irait
    // chercher une clé imbriquée qui n'existe pas.
    t.has(`journal.actions.${l.action.replaceAll(".", "_")}`)
      ? t(`journal.actions.${l.action.replaceAll(".", "_")}`)
      : l.action;

  return (
    <main id="contenu" className="md:px-[30px] md:py-[26px]">
      <EnTeteAdmin
        titre={t("journal.titre")}
        sousTitre={t("journal.portee")}
        sousTitreMobile={
          depasse ? t("journal.decompteAuDela", { total }) : t("journal.decompte", { total })
        }
      />

      <div className="flex flex-col gap-2.5 px-4 py-3.5 md:mt-5 md:gap-4 md:px-0 md:py-0">
        {/* --- LES FILTRES ---

            DES LIENS, PAS DES LISTES DÉROULANTES. La planche du bureau pose deux
            `select` ; ils exigeraient du JavaScript pour naviguer au changement,
            et un `select` sans soumission est un contrôle qui ne fait rien tant
            qu'on n'a pas trouvé le bouton. Les pilules du téléphone, elles, sont
            des liens — la même chose partout coûte moins cher à comprendre. */}
        <nav aria-label={t("journal.filtres")} className="-mx-4 px-4 md:mx-0 md:px-0">
          {/* `gap-y-4` AU BUREAU : les deux rangées vivent dans une seule liste
              qui se replie, donc le `gap` de 8 px servait aussi d'espace VERTICAL
              entre elles. La planche en met 16. */}
          <ul className="flex gap-2 overflow-x-auto pb-1 md:flex-wrap md:gap-y-4 md:overflow-visible md:pb-0">
            {(["", ...FAMILLES_JOURNAL] as const).map((f) => {
              const actif = parametres.famille === f;
              return (
                <li key={f === "" ? "toutes" : f}>
                  <LienEcran
                    href={lien(f, parametres.jours)}
                    aria-current={actif ? "true" : undefined}
                    className={
                      PILULE_FILTRE +
                      " " +
                      (actif
                        ? "border-primary bg-primary text-on-primary"
                        : "border-filet-controle bg-surface-container-lowest text-ardoise hover:bg-fond-neutre")
                    }
                  >
                    {t(`journal.famille.${f === "" ? "toutes" : f}`)}
                  </LienEcran>
                </li>
              );
            })}

            <li aria-hidden="true" className="w-2 shrink-0 md:basis-full md:w-0" />

            {FENETRES_JOURNAL.map((j) => {
              const actif = parametres.jours === j;
              return (
                <li key={j}>
                  <LienEcran
                    href={lien(parametres.famille, j)}
                    aria-current={actif ? "true" : undefined}
                    className={
                      PILULE_FILTRE +
                      " " +
                      // ⚠️ LE MÊME NOIR QUE LA RANGÉE DU DESSUS. Cette rangée
                      // peignait son actif en ardoise (#5b5d68) : deux états
                      // « actif » de deux teintes dans le même contrôle, et le
                      // second se lisait comme désactivé. Une seule couleur
                      // d’état actif dans tout le produit.
                      (actif
                        ? "border-primary bg-primary text-on-primary"
                        : "border-filet-controle bg-surface-container-lowest text-ardoise hover:bg-fond-neutre")
                    }
                  >
                    {t(`journal.fenetre.${j}`)}
                  </LienEcran>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* CE QUE CE JOURNAL GARANTIT, dit avant qu'on le lise. Un journal dont
            on ignore qu'il est inaltérable n'a pas la valeur d'un journal.

            AU BUREAU SEULEMENT : la planche du téléphone met cette même
            garantie dans le sous-titre, faute de place. L'encart s'y affichait
            AUSSI, donc la phrase était dite deux fois à l'écran le plus étroit. */}
        <p className="hidden items-center gap-2.5 rounded-[12px] border border-outline-variant bg-surface-container-lowest px-3.5 py-3 md:flex">
          <Icone nom="shield_lock" className="shrink-0 text-[16px] text-sourdine" />
          <span className="font-body-sm text-[13px] leading-4 text-sourdine">
            {t("journal.garantie")}
          </span>
        </p>

        {page.lignes.length === 0 ? (
          <p className="rounded-[18px] border border-outline-variant bg-surface-container-lowest p-6 text-center font-body-md text-body-md text-on-surface-variant">
            {parametres.famille === "" && parametres.jours === 0
              ? t("journal.vide")
              : t("journal.videFiltre")}
          </p>
        ) : (
          /* LA CARTE N'EXISTE QU'AU BUREAU. La planche du téléphone pose des
             cartes LIBRES, sans conteneur : le filet portait donc un second
             filet autour de lui, visible sur le seul écran où la place manque. */
          <div className="md:rounded-[18px] md:border md:border-outline-variant md:bg-surface-container-lowest md:px-6 md:py-5">
            {/* Les en-têtes de colonne n'existent qu'au bureau : sur une carte,
                « QUAND » au-dessus d'une heure n'apprend rien. */}
            <div className="hidden gap-[18px] pb-3 xl:grid xl:grid-cols-[132px_minmax(0,1fr)_168px]">
              {(["quand", "quoi", "qui"] as const).map((c) => (
                <span
                  key={c}
                  className="font-headline-md text-[11px] leading-[13px] font-bold tracking-[0.05em] text-gris-entete uppercase"
                >
                  {t(`journal.colonnes.${c}`)}
                </span>
              ))}
            </div>

            <ol className="flex flex-col gap-2.5 md:gap-0">
              {page.lignes.map((l) => {
                const f = natureDAction(l.action);
                return (
                  <li
                    key={l.id}
                    className="rounded-[16px] border border-outline-variant bg-surface-container-lowest p-4 md:rounded-none md:border-0 md:border-t md:border-filet-ligne md:p-0 md:py-[15px] xl:grid xl:grid-cols-[132px_minmax(0,1fr)_168px] xl:items-start xl:gap-[18px]"
                  >
                    {/* --- QUAND ---
                        La date sur une ligne, l'heure sur la suivante : au
                        téléphone la planche ne garde que l'heure, à droite de la
                        pilule, parce que la carte est déjà datée par sa place. */}
                    <span className="hidden font-body-sm text-[13px] leading-4 text-sourdine xl:block">
                      {format.dateTime(new Date(l.quand), { dateStyle: "medium" })}
                      <br />
                      {format.dateTime(new Date(l.quand), { timeStyle: "short" })}
                    </span>

                    <div className="min-w-0">
                      <div className="mb-[11px] flex items-center justify-between gap-2.5 md:mb-[7px] md:justify-start">
                        <span
                          className={
                            "inline-flex items-center gap-1.5 rounded-full px-[9px] py-1 font-headline-md text-[11px] leading-[14px] font-bold md:px-2.5 md:text-[12px] md:leading-[15px] md:font-semibold " +
                            TEINTE[f]
                          }
                        >
                          {libelleAction(l)}
                        </span>
                        <span className="shrink-0 font-body-sm text-[12px] leading-[15px] text-sourdine xl:hidden">
                          {format.dateTime(new Date(l.quand), {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </span>
                      </div>

                      {/* L'ENTRÉE SURVIT À LA SUPPRESSION DU COMPTE VISÉ : l'email
                          est dénormalisé à l'écriture, la clé étrangère se
                          dénoue. Sans lui, la ligne deviendrait « quelqu'un a
                          consulté quelque chose », exactement quand on en a le
                          plus besoin. */}
                      {l.cibleEmail !== null ? (
                        <p className="font-headline-md text-[14px] leading-[21px] font-normal text-on-surface">
                          {t("journal.cibleAvant")}{" "}
                          <strong className="font-bold">{l.cibleEmail}</strong>
                        </p>
                      ) : null}

                      {/* L'AVANT ET L'APRÈS D'UN PARAMÈTRE. Sans l'avant, la
                          ligne dit « le seuil vaut maintenant 1 200 » — ce que la
                          table dit déjà. */}
                      {l.apres !== null ? (
                        <p className="font-headline-md text-[14px] leading-[21px] font-normal text-on-surface">
                          {l.idRessource === null ? null : (
                            <>
                              {t.has(`parametres.cles.${l.idRessource}.titre`)
                                ? t(`parametres.cles.${l.idRessource}.titre`)
                                : l.idRessource}{" "}
                            </>
                          )}
                          {l.avant === null ? null : (
                            <>
                              <span className="text-sourdine">{l.avant}</span>{" "}
                              <span aria-hidden="true" className="text-sourdine">
                                →
                              </span>{" "}
                            </>
                          )}
                          <strong className="font-bold">{l.apres}</strong>
                        </p>
                      ) : null}

                      {l.motif !== null ? (
                        <p
                          className={
                            "mt-[5px] rounded-r-lg border-l-2 px-3 py-[9px] font-headline-md text-[13px] leading-5 font-normal text-on-surface " +
                            MOTIF[f]
                          }
                        >
                          {t("journal.motifAvant")} {l.motif}
                        </p>
                      ) : null}
                    </div>

                    {/* --- PAR QUI ---
                        L'adresse, jamais un prénom : c'est elle qui identifie un
                        compte partout ailleurs, et deux administrateurs peuvent
                        partager un prénom. */}
                    <p className="mt-[11px] font-body-sm text-[12px] leading-[15px] text-sourdine md:mt-2 xl:mt-0 xl:break-all">
                      <span className="xl:hidden">{t("journal.parQui")} </span>
                      {l.adminEmail}
                    </p>
                  </li>
                );
              })}
            </ol>

            {/* LE PIED DE LISTE EST DANS LA CARTE, séparé par un filet — la
                planche l'y met. Le bouton vivait dehors et seul : une pagination
                détachée de ce qu'elle pagine se lit comme la fin de la page.

                ET IL DIT COMBIEN. « Voir la suite » sans nombre ne dit pas s'il
                reste dix lignes ou dix mille ; le total est déjà compté par
                `compter_journal_admin`, il ne coûte rien de plus ici. */}
            {lienSuivant === null ? null : (
              <div className="mt-[18px] flex flex-col gap-3 border-t border-filet-ligne px-4 pt-4 md:flex-row md:items-center md:justify-between md:px-0">
                <p className="font-body-sm text-[13px] leading-4 text-sourdine">
                  {depasse
                    ? t("journal.surTotalAuDela", { affichees: page.lignes.length, total })
                    : t("journal.surTotal", { affichees: page.lignes.length, total })}
                </p>
                <LienEcran
                  href={lienSuivant}
                  className="inline-flex min-h-12 items-center justify-center rounded-[11px] border border-filet-controle bg-surface-container-lowest px-[18px] font-headline-md text-[14px] leading-[18px] font-semibold text-on-surface md:h-10 md:min-h-0"
                >
                  {t("journal.pageSuivante")}
                </LienEcran>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
