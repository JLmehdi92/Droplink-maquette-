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

const SUR_TITRE =
  "font-headline-md text-[11px] leading-[13px] font-bold tracking-[0.08em] text-gris-entete uppercase";
const CARTE =
  "rounded-[18px] border border-outline-variant bg-surface-container-lowest p-4 md:p-[22px]";
const PILULE_ETAT =
  "shrink-0 rounded-full px-3 py-[5px] font-headline-md text-[12px] leading-[15px] font-bold";

/**
 * L'HABILLAGE D'UNE TÂCHE, PAR ÉTAT. Trois états, trois teintes — et le vert
 * n'est PAS le défaut : une tâche jamais exécutée est grise, parce qu'elle n'est
 * ni saine ni en panne. La peindre en vert affirmerait qu'elle va bien, la
 * peindre en ambre enverrait chercher une panne dans un mécanisme qui n'a jamais
 * tourné.
 */
const TEINTE_TACHE = {
  actif: {
    carte: "border-outline-variant bg-surface-container-lowest",
    point: "bg-succes",
    titre: "text-on-surface",
    // LA PLANCHE MET CE DÉTAIL EN INTER (classe `.mut`) sur les deux états
    // neutres, et en Plus Jakarta Sans sur le seul état en retard — la ligne
    // qui doit se lire comme une alerte porte la police des titres.
    detail: "font-body-sm leading-4 text-sourdine",
    pilule: "bg-succes-fond text-succes",
  },
  en_retard: {
    carte: "border-attention-filet bg-attention-fond",
    // ⚠️ PAS `attention-icone` (#a97b1e) : la planche peint cette pastille en
    // #d19a20, plus clair. L'ambre foncé est celui du TEXTE ; réemployer un
    // token voisin parce qu'il est ambre est invisible à toute relecture.
    point: "bg-attention-pastille",
    titre: "text-attention",
    detail: "font-headline-md leading-4 text-attention-doux",
    pilule: "bg-attention-puce text-attention",
  },
  jamais_executee: {
    carte: "border-outline-variant bg-surface-container-lowest",
    point: "bg-gris-illustration",
    titre: "text-on-surface",
    // 20 px, et déclaré comme tel dans la planche : c'est le seul détail qui
    // tienne sur deux lignes, donc le seul où l'interlignage se voie.
    detail: "font-body-sm leading-5 text-sourdine",
    pilule: "bg-fond-neutre text-sourdine",
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
  const pic = (surface: string): number =>
    surveillance.indicateurs.find((i) => i.indicateur === `pic_${surface}`)?.valeur ?? 0;

  const maxColis = Math.max(1, ...surveillance.colisParJour.map((j) => j.n));
  const dernierJour = surveillance.colisParJour.length - 1;

  return (
    <main id="contenu" className="md:px-[30px] md:py-[26px]">
      <EnTeteAdmin titre={t("surveillance.titre")} sousTitre={t("surveillance.sousTitre")} />

      <div className="p-4 md:mt-[22px] md:p-0">
        {/* --- LES TÂCHES DE FOND, EN PREMIER --- */}
        <section aria-label={t("surveillance.taches")}>
          <p className={SUR_TITRE + " mb-3"}>{t("surveillance.taches")}</p>

          <ul className="flex flex-col gap-2.5">
            {surveillance.surveillees.map((tache) => {
              const teinte = TEINTE_TACHE[tache.etat];
              return (
                <li
                  key={tache.source}
                  className={
                    "flex items-center gap-3.5 rounded-[14px] border px-4 py-4 md:px-[18px] " +
                    teinte.carte
                  }
                >
                  {/* La pastille DOUBLE la pilule, elle ne la remplace pas : une
                      couleur seule ne se lit pas de la même façon selon les yeux. */}
                  <span
                    aria-hidden="true"
                    className={"h-2.5 w-2.5 shrink-0 rounded-full " + teinte.point}
                  />

                  <div className="min-w-0 flex-grow">
                    <p
                      className={
                        "mb-0.5 font-headline-md text-[15px] leading-[19px] font-bold " +
                        teinte.titre
                      }
                    >
                      {t.has(`surveillance.tache.${tache.source}`)
                        ? t(`surveillance.tache.${tache.source}`)
                        : tache.source}
                    </p>
                    <p
                      className={
                        "text-[13px] font-normal " + teinte.detail
                      }
                    >
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

                  <span className={PILULE_ETAT + " " + teinte.pilule}>
                    {t(`surveillance.etat.${tache.etat}`)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        {/* --- LA CONSOMMATION --- */}
        <section aria-label={t("surveillance.consommation")} className="mt-7">
          <p className={SUR_TITRE + " mb-3"}>{t("surveillance.consommation")}</p>

          <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[1.5fr_1fr]">
            {/* --- LA FRISE DES COLIS --- */}
            <div className={CARTE}>
              <div className="mb-5 flex items-baseline justify-between gap-4">
                <h2 className="font-headline-md text-[16px] leading-[21px] font-bold tracking-[-0.015em] text-on-surface">
                  {t("surveillance.colisParJour")}
                </h2>
                <span className="shrink-0 font-body-sm text-[12px] leading-[15px] text-sourdine">
                  {t("surveillance.seulPosteFacture")}
                </span>
              </div>

              <div
                role="img"
                aria-label={t("surveillance.friseAide", { n: JOURS_DE_FRISE })}
                className="grid h-[152px] items-end gap-2"
                style={{
                  gridTemplateColumns: `repeat(${Math.max(surveillance.colisParJour.length, 1)}, minmax(0, 1fr))`,
                }}
              >
                {surveillance.colisParJour.map((j, rang) => (
                  <div
                    key={j.jour}
                    // UNE HAUTEUR MINIMALE DE 2 %, pour qu'un jour à zéro reste
                    // un trait visible : une barre absente se confond avec un
                    // jour qui n'aurait pas été mesuré.
                    style={{ height: `${Math.max(2, Math.round((j.n / maxColis) * 100))}%` }}
                    className={
                      "rounded-t-[4px] " + (rang === dernierJour ? "bg-corail" : "bg-violet")
                    }
                  />
                ))}
              </div>

              <p className="mt-3 font-body-sm text-[12px] leading-[15px] text-sourdine">
                {t("surveillance.friseLegende", { n: JOURS_DE_FRISE })}
              </p>
            </div>

            {/* --- LA LIMITATION DE DÉBIT --- */}
            <div className={CARTE}>
              <h2 className="mb-5 font-headline-md text-[16px] leading-[21px] font-bold tracking-[-0.015em] text-on-surface">
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
                        <span className="font-headline-md text-[13px] leading-4 font-semibold text-on-surface">
                          {t(`surveillance.surface.${surface}`)}
                        </span>
                        <span className="font-body-sm text-[13px] leading-4 text-sourdine">
                          {t("surveillance.surPlafond", {
                            valeur: format.number(valeur),
                            plafond: format.number(plafond),
                          })}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-filet-ligne">
                        <div
                          className="h-full rounded-full bg-violet"
                          style={{
                            width: `${Math.round(Math.min(valeur / Math.max(plafond, 1), 1) * 100)}%`,
                          }}
                        />
                      </div>
                      {/* CE QUE CHAQUE SURFACE FAIT QUAND LE COMPTEUR TOMBE. La
                          page publique AUTORISE — refuser pénaliserait les
                          clients d'un vendeur pour un incident qui ne les
                          concerne pas ; l'administration REFUSE, ça ne pénalise
                          que nous. */}
                      {nouvelleRegle ? (
                        <p className="mt-[7px] font-body-sm text-[11px] leading-[17px] text-sourdine">
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
          <p className={SUR_TITRE + " mb-3"}>{t("surveillance.nonMesure")}</p>
          <div className={CARTE}>
            <p className="font-body-sm text-[13px] leading-5 text-sourdine">
              {t("surveillance.nonMesureAide")}
            </p>
            <ul className="mt-3.5 flex flex-wrap gap-2">
              {surveillance.nonMesure.map((cle) => (
                <li
                  key={cle}
                  className="rounded-full border border-filet-controle px-3 py-1 font-headline-md text-[12px] leading-[15px] font-semibold text-sourdine"
                >
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
