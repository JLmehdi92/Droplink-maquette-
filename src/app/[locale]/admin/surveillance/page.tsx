import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { EnTeteAdmin } from "@/components/admin/en-tete-admin";
import { exigerAdmin } from "@/lib/audit/garde";
import { lireSeuils } from "@/lib/audit/panneau";
import { lireSurveillance } from "@/lib/audit/surveillance";
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

const CARTE = "rounded-lg border border-outline-variant bg-surface-container-lowest p-4";

/**
 * SURVEILLANCE — ce que le produit mesure, et ce qu'il ne mesure pas.
 *
 * LA MAQUETTE EST ÉCARTÉE POUR L'ESSENTIEL. « Global Logistics Health »
 * affichait une disponibilité à 99,98 %, 18 245 websockets actifs, 12,4k IOPS,
 * une courbe de charge en temps réel et un flux de latences d'API. Le produit ne
 * mesure aucune de ces grandeurs — il n'a pas même de websockets. Les afficher
 * reviendrait à inventer des chiffres sur l'écran EXACTEMENT où l'on décide.
 *
 * CE QUI N'EST PAS MESURÉ EST DIT. Un écran qui se tairait laisserait croire que
 * la disponibilité est surveillée, et personne ne poserait la question avant
 * l'incident. La liste vient de la CONFIGURATION, pas d'une valeur absente.
 *
 * LES TÂCHES DE FOND ONT TROIS ÉTATS, pas deux : « jamais déployé » n'est pas
 * « en retard ».
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

  const parGenre = new Map<string, typeof surveillance.indicateurs>();
  for (const i of surveillance.indicateurs) {
    parGenre.set(i.genre, [...(parGenre.get(i.genre) ?? []), i]);
  }

  return (
    <main id="contenu" className="md:px-[30px] md:py-[26px]">
      <EnTeteAdmin titre={t("surveillance.titre")} sousTitre={t("surveillance.sousTitre")} />

      <div className="p-4 md:mt-[22px] md:p-0">

      {/* --- LES TÂCHES DE FOND, EN PREMIER --- */}
      <section aria-label={t("surveillance.taches")} className="mt-gutter">
        <h2 className="font-headline-md text-headline-md-mobile text-on-surface">
          {t("surveillance.taches")}
        </h2>

        {surveillance.aucuneTacheDeployee ? (
          /* TROIS ÉTATS, PAS DEUX. Rien n'a été mis en service : l'annoncer
             comme un retard enverrait chercher un défaut dans un mécanisme
             inexistant. */
          <p className={CARTE + " mt-3 font-body-md text-body-md text-on-surface-variant"}>
            {t("panneau.tachesJamaisDeployees")}
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {surveillance.taches.map((tache) => (
              <li
                key={tache.source}
                className={
                  CARTE +
                  " flex flex-wrap items-baseline justify-between gap-2 " +
                  (tache.etat === "en_retard" ? "border-error" : "")
                }
              >
                <span className="font-label-md text-label-md text-on-surface">{tache.source}</span>
                <span className="font-body-sm text-body-sm text-on-surface-variant">
                  {t(`panneau.tache.${tache.etat}`, { n: tache.minutes })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* --- LES INDICATEURS RÉELLEMENT MESURÉS --- */}
      {[...parGenre.entries()].map(([genre, indicateurs]) => (
        <section key={genre} aria-label={t(`surveillance.genre.${genre}`)} className="mt-gutter">
          <h2 className="font-headline-md text-headline-md-mobile text-on-surface">
            {t(`surveillance.genre.${genre}`)}
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            {indicateurs.map((i) => (
              <div key={i.indicateur} className={CARTE}>
                <p className="font-label-sm text-label-sm text-on-surface-variant">
                  {/* Les pics de limitation portent le nom de leur SURFACE :
                      elles ne partagent jamais leurs compteurs, et une
                      saturation ne veut pas dire la même chose des deux côtés —
                      la page publique qui sature peut être un vendeur qui perce,
                      l'authentification qui sature est une attaque. */}
                  {t(`surveillance.indicateur.${i.indicateur}`)}
                </p>
                <p className="mt-1 font-headline-md text-headline-md text-on-surface">
                  {format.number(i.valeur)}
                </p>
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* --- CE QUI N'EST PAS MESURÉ, NOMMÉ --- */}
      <section aria-label={t("surveillance.nonMesure")} className="mt-gutter">
        <h2 className="font-headline-md text-headline-md-mobile text-on-surface">
          {t("surveillance.nonMesure")}
        </h2>
        <p className="mt-2 max-w-[640px] font-body-sm text-body-sm text-on-surface-variant">
          {t("surveillance.nonMesureAide")}
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {surveillance.nonMesure.map((cle) => (
            <li
              key={cle}
              className="rounded-full border border-outline-variant px-3 py-1 font-label-sm text-label-sm text-on-surface-variant"
            >
              {t(`surveillance.absent.${cle}`)}
            </li>
          ))}
        </ul>
      </section>
      </div>
    </main>
  );
}
