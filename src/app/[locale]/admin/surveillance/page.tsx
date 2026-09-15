import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { EnTeteAdmin } from "@/components/admin/en-tete-admin";
import { exigerAdmin } from "@/lib/audit/garde";
import { lireSeuils } from "@/lib/audit/panneau";
import { JOURS_DE_FRISE, lireSurveillance } from "@/lib/audit/surveillance";
import { DEGRADATION, seuil, type Surface } from "@/lib/limitation/quota";
import { creerClientServeur } from "@/lib/supabase/server";
import { estLangueSupportee } from "@/i18n/config";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // LA GARDE COURT AUSSI ICI. Next évalue les métadonnées EN PARALLÈLE du rendu :
  // sans elle, le titre partirait dans le corps du 404 servi à qui n'a pas les
  // droits, et révélerait la surface que le code de réponse cache.
  await exigerAdmin();
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("surveillance.titre"), robots: { index: false, follow: false } };
}

/**
 * LES SURFACES QUE L'ÉCRAN MONTRE.
 *
 * ⚠️ CE COMMENTAIRE DISAIT « TROIS SUR SEPT ». Il y en a douze — trois pour le
 * mot de passe depuis le 01/09, une pour l'export depuis le 02/09 — et le
 * chiffre n'avait été relu à aucun de ces ajouts. C'est le motif que le brief
 * nomme : *les décomptes se périment à chaque session, les remplacer par la
 * requête qui les produit*. Aucun décompte n'est donc réécrit ici ; la liste
 * ci-dessous EST l'inventaire, et `Surface` reste la seule source du reste.
 *
 * Ce qui est affiché est un CHOIX, et il ne change pas : ce sont les surfaces
 * dont la saturation change ce qu'on fait. Une saturation de la page publique
 * peut être un vendeur qui perce ; un pic de jetons INCONNUS est une
 * aspiration ; l'administration qui sature, c'est nous.
 *
 * Toutes les autres sont comptées et protégées — le contrôle d'inventaire
 * `tests/unit/surfaces-a-plafond` l'établit surface par surface, dans les deux
 * sens — elles n'appellent simplement aucune décision de surveillance : leur
 * saturation se règle toute seule en refusant.
 */
const SURFACES_AFFICHEES: readonly Surface[] = [
  "publique-requetes",
  "publique-inconnu",
  "admin",
] as const;

/*
 * ⚠️ LES VALEURS SONT CELLES DE LA PLANCHE `#surveillance` DU KIT ADMIN, écrite le
 * 14/09/2026 : jusque-là l'écran n'avait aucune référence, et il portait encore
 * deux jetons de l'ancien canevas (`bg-corail`, `bg-gris-illustration`).
 */
const SUR_TITRE = "mb-3 text-[11.5px] leading-[1.55] md:text-[11px] font-extrabold tracking-[0.12em] text-ds-texte-sourdine uppercase";
const PANNEAU =
  "flex min-w-0 flex-col rounded-ds-card-lg border border-ds-filet bg-ds-surface-carte p-4 shadow-ds-card md:p-[22px]";
const PANNEAU_TITRE = "text-[18px] leading-[19.8px] font-bold tracking-[-0.025em] text-ds-texte-titre";
/** Le `Badge` du kit : 11 px gras, pilule, remplissage 5 × 11. */
const BADGE =
  "inline-flex shrink-0 items-center gap-1.5 rounded-ds-pill px-[11px] py-[5px] text-[11.5px] font-bold md:text-[11px] tracking-[-0.02em] whitespace-nowrap";

/**
 * L'HABILLAGE D'UNE TÂCHE, PAR ÉTAT. Trois états, trois teintes — et le vert
 * n'est PAS le défaut : une tâche jamais exécutée est neutre, parce qu'elle
 * n'est ni saine ni en panne. La peindre en vert affirmerait qu'elle va bien, la
 * peindre en ambre enverrait chercher une panne dans un mécanisme qui n'a jamais
 * tourné.
 *
 * ⚠️ LA PASTILLE D'UNE TÂCHE EN RETARD ÉTAIT INVISIBLE jusqu'au 14/09/2026 :
 * peinte `bg-ds-alerte-fond` sur une carte `bg-ds-alerte-fond`, donc de la
 * couleur exacte de son fond — sur le seul état que l'écran existe pour
 * signaler. Le badge, de même fond, perdait sa forme : il passe sur la carte
 * blanche, comme au kit.
 */
const TEINTE_TACHE = {
  actif: {
    carte: "border-ds-filet bg-ds-surface-carte",
    point: "bg-ds-succes",
    badge: "bg-ds-succes-fond text-ds-succes",
  },
  en_retard: {
    carte: "border-[#F3DFB4] bg-ds-alerte-fond",
    point: "bg-ds-alerte",
    badge: "bg-ds-surface-carte text-ds-alerte",
  },
  jamais_executee: {
    carte: "border-ds-filet bg-ds-surface-carte",
    point: "bg-ds-ink-300",
    badge: "bg-ds-surface-creux text-ds-texte-corps",
  },
} as const;

/**
 * SURVEILLANCE — ce que le produit mesure, et ce qu'il ne mesure pas.
 *
 * LA MAQUETTE STITCH EST ÉCARTÉE POUR L'ESSENTIEL. « Global Logistics Health »
 * affichait une disponibilité à 99,98 %, 18 245 websockets actifs, 12,4k IOPS,
 * une courbe de charge en temps réel et un flux de latences d'API. Le produit ne
 * mesure aucune de ces grandeurs — il n'a pas même de websockets. Les afficher
 * reviendrait à inventer des chiffres sur l'écran EXACTEMENT où l'on décide.
 *
 * CE QUI N'EST PAS MESURÉ EST DIT. Un écran qui se tairait laisserait croire que
 * la disponibilité est surveillée, et personne ne poserait la question avant
 * l'incident. La liste vient de la CONFIGURATION, pas d'une valeur absente.
 *
 * LES TÂCHES DE FOND ONT TROIS ÉTATS, pas deux, et désormais PAR TÂCHE :
 * l'inventaire des tâches attendues vit dans `surveillance.ts`, parce que
 * `scheduler_heartbeat` ne porte que les sources ayant DÉJÀ battu — sans lui,
 * une tâche jamais exécutée est invisible, donc indiscernable d'une tâche qui
 * n'existe pas.
 *
 * AUCUNE BIBLIOTHÈQUE DE GRAPHIQUES pour la frise : quatorze `div` en grille
 * coûtent zéro octet de plus et se lisent sans JavaScript.
 */
export default async function SurveillanceAdmin({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const langue = estLangueSupportee(locale) ? locale : "fr";
  setRequestLocale(langue);

  await exigerAdmin();

  const supabase = await creerClientServeur();
  const seuils = await lireSeuils(supabase);
  const surveillance = await lireSurveillance(supabase, seuils.retardMinutes);

  const t = await getTranslations("admin");
  const format = await getFormatter();

  // LES PLAFONDS VIENNENT DE LA CONFIGURATION, jamais d'une constante recopiée :
  // une barre remplie contre un plafond faux est pire qu'une barre absente.
  const plafonds = new Map(
    SURFACES_AFFICHEES.map((surface) => [surface, seuil(surface).plafond] as const),
  );
  /**
   * ⚠️ `null` N'EST PAS ZÉRO, ET C'EST TOUT L'ENJEU DE CET ÉCRAN.
   *
   * Un pic à 0 sur une lecture qui n'a pas abouti afficherait une barre vide,
   * donc « aucune requête » — sur l'écran dont le rôle est de dire si les
   * plafonds sont approchés. L'indisponibilité est donc NOMMÉE au-dessus des
   * barres, et le chiffre devient un tiret plutôt qu'un zéro.
   */
  const pic = (surface: string): number | null =>
    surveillance.indicateurs === null
      ? null
      : (surveillance.indicateurs.find((i) => i.indicateur === `pic_${surface}`)?.valeur ?? 0);

  const colisParJour = surveillance.colisParJour ?? [];
  const maxColis = Math.max(1, ...colisParJour.map((j) => j.n));
  const dernierJour = colisParJour.length - 1;

  return (
    <main id="contenu" className="md:px-8 md:pt-0 md:pb-8">
      <EnTeteAdmin titre={t("surveillance.titre")} sousTitre={t("surveillance.sousTitre")} />

      <div className="p-4 leading-[normal] md:-mt-1 md:p-0">
        {/* --- LES TÂCHES DE FOND, EN PREMIER --- */}
        <section aria-label={t("surveillance.taches")}>
          <p className={SUR_TITRE}>{t("surveillance.taches")}</p>

          {/* TROIS ÉTATS, PAS DEUX. Sur une lecture muette, la jointure ferait
              afficher « jamais exécutée » pour CHAQUE tâche attendue : une
              alerte inventée, sur l'écran fait pour les porter. */}
          {surveillance.surveillees === null ? (
            <p className={PANNEAU + " text-ds-texte-corps"}>
              {t("surveillance.tachesIndisponibles")}
            </p>
          ) : (
          <ul className="flex flex-col gap-2.5">
            {surveillance.surveillees.map((tache) => {
              const teinte = TEINTE_TACHE[tache.etat];
              return (
                <li
                  key={tache.source}
                  className={
                    "flex items-center gap-3.5 rounded-ds-card border px-4 py-4 md:px-[18px] " +
                    teinte.carte
                  }
                >
                  {/* La pastille DOUBLE le badge, elle ne le remplace pas : une
                      couleur seule ne se lit pas de la même façon selon les yeux. */}
                  <span
                    aria-hidden="true"
                    className={"h-2.5 w-2.5 shrink-0 rounded-ds-pill " + teinte.point}
                  />

                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] leading-[1.55] font-bold text-ds-texte-fort">
                      {t.has(`surveillance.tache.${tache.source}`)
                        ? t(`surveillance.tache.${tache.source}`)
                        : tache.source}
                    </p>
                    <p className="mt-0.5 text-[13px] leading-[1.55] text-ds-texte-corps">
                      {tache.etat === "jamais_executee"
                        ? t("surveillance.jamaisExecuteeAide")
                        : tache.etat === "en_retard"
                          ? t("surveillance.enRetardAide", {
                              n: tache.minutes ?? 0,
                              seuil: seuils.retardMinutes,
                            })
                          : t("surveillance.actifAide", { n: tache.minutes ?? 0 })}
                    </p>
                  </div>

                  <span className={BADGE + " " + teinte.badge}>
                    {t(`surveillance.etat.${tache.etat}`)}
                  </span>
                </li>
              );
            })}
          </ul>
          )}
        </section>

        {/* --- LA CONSOMMATION --- */}
        <section aria-label={t("surveillance.consommation")} className="mt-7">
          <p className={SUR_TITRE}>{t("surveillance.consommation")}</p>

          {/* L'INDISPONIBILITÉ SE DIT. Des barres vides et des tirets se
              liraient « aucune consommation », ce qui est une affirmation — et
              une affirmation qu'on n'a pas mesurée. */}
          {surveillance.indicateurs === null ? (
            <p className="mb-2.5 text-ds-texte-corps">
              {t("surveillance.indicateursIndisponibles")}
            </p>
          ) : null}

          <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            {/* --- LA FRISE DES COLIS --- */}
            <div className={PANNEAU}>
              <div className="mb-[18px] flex flex-wrap items-start gap-3.5">
                <h2 className={PANNEAU_TITRE + " min-w-0 flex-[1_1_180px]"}>
                  {t("surveillance.colisParJour")}
                </h2>
                <span className="pt-[3px] text-[12px] text-ds-texte-sourdine">
                  {t("surveillance.seulPosteFacture")}
                </span>
              </div>

              {surveillance.colisParJour === null ? (
                <p className="text-ds-texte-corps">
                  {t("surveillance.friseIndisponible")}
                </p>
              ) : (
              <div
                role="img"
                aria-label={t("surveillance.friseAide", { n: JOURS_DE_FRISE })}
                className="grid h-[152px] items-end gap-2"
                style={{
                  gridTemplateColumns: `repeat(${Math.max(colisParJour.length, 1)}, minmax(0, 1fr))`,
                }}
              >
                {colisParJour.map((j, rang) => (
                  <div
                    key={j.jour}
                    // UNE HAUTEUR MINIMALE DE 2 %, pour qu'un jour à zéro reste
                    // un trait visible : une barre absente se confond avec un
                    // jour qui n'aurait pas été mesuré.
                    style={{ height: `${Math.max(2, Math.round((j.n / maxColis) * 100))}%` }}
                    className={
                      "rounded-t-[4px] " + (rang === dernierJour ? "bg-ds-accent" : "bg-ds-violet-200")
                    }
                  />
                ))}
              </div>
              )}

              <p className="mt-3 text-[12px] leading-[1.55] text-ds-texte-sourdine">
                {t("surveillance.friseLegende", { n: JOURS_DE_FRISE })}
              </p>
            </div>

            {/* --- LA LIMITATION DE DÉBIT --- */}
            <div className={PANNEAU}>
              <h2 className={PANNEAU_TITRE + " mb-[18px]"}>
                {t("surveillance.limitation")}
              </h2>

              <div className="flex flex-col gap-[18px]">
                {SURFACES_AFFICHEES.map((surface, rang) => {
                  const plafond = plafonds.get(surface) ?? 1;
                  const valeur = pic(surface);
                  // La phrase n'apparaît qu'au CHANGEMENT de comportement.
                  const precedente = SURFACES_AFFICHEES[rang - 1];
                  const nouvelleRegle =
                    precedente === undefined || DEGRADATION[precedente] !== DEGRADATION[surface];
                  return (
                    <div key={surface}>
                      <div className="mb-[7px] flex flex-wrap justify-between gap-2">
                        <span className="text-[13px] font-semibold text-ds-texte-fort">
                          {t(`surveillance.surface.${surface}`)}
                        </span>
                        <span className="text-[13px] text-ds-texte-sourdine">
                          {/* UN TIRET, JAMAIS UN ZÉRO : zéro affirmerait
                              qu'on a mesuré, sur l'écran fait pour dire si un
                              plafond est approché. */}
                          {t("surveillance.surPlafond", {
                            valeur: valeur === null ? "—" : format.number(valeur),
                            plafond: format.number(plafond),
                          })}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-ds-pill bg-ds-ink-100">
                        <div
                          className="h-full rounded-ds-pill bg-ds-accent"
                          style={{
                            width: `${valeur === null ? 0 : Math.round(Math.min(valeur / Math.max(plafond, 1), 1) * 100)}%`,
                          }}
                        />
                      </div>
                      {/* CE QUE CHAQUE SURFACE FAIT QUAND LE COMPTEUR TOMBE. La
                          page publique AUTORISE — refuser pénaliserait les
                          clients d'un vendeur pour un incident qui ne les
                          concerne pas ; l'administration REFUSE, ça ne pénalise
                          que nous. */}
                      {nouvelleRegle ? (
                        <p className="mt-[7px] text-[12px] leading-[1.5] text-ds-texte-sourdine">
                          {t(`surveillance.degradation.${DEGRADATION[surface]}`)}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* --- CE QUI N'EST PAS MESURÉ, NOMMÉ --- */}
        <section aria-label={t("surveillance.nonMesure")} className="mt-7">
          <p className={SUR_TITRE}>{t("surveillance.nonMesure")}</p>
          <div className={PANNEAU}>
            <p className="text-[13px] leading-[1.55] text-ds-texte-corps">
              {t("surveillance.nonMesureAide")}
            </p>
            <ul className="mt-3.5 flex flex-wrap gap-2">
              {surveillance.nonMesure.map((cle) => (
                <li key={cle} className={BADGE + " bg-ds-surface-creux text-ds-texte-corps"}>
                  {t(`surveillance.absent.${cle}`)}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}
