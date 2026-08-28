import { getFormatter, getTranslations } from "next-intl/server";
import type { SemaineCreee } from "@/lib/analyses/activite";

/**
 * LA FRISE DES COMMANDES CRÉÉES PAR SEMAINE.
 *
 * AUCUNE BIBLIOTHÈQUE DE GRAPHIQUES. La plus légère pèse quarante kilo-octets
 * pour dessiner douze barres qu'une grille CSS rend aussi bien — et l'écran
 * reste lisible sans une ligne de JavaScript, ce qui compte pour un fournisseur
 * qui l'ouvre depuis un téléphone d'entrée de gamme.
 *
 * DOUZE BARRES AU BUREAU LARGE, HUIT EN DESSOUS. `AnalysesMobile` n'en garde
 * que huit, et la bascule est à 1 280 px et non à 1 024 : mesuré, douze
 * colonnes n'y font que 21 px, et le libellé « 15/06 » en réclame 25 — il
 * déborde de sa cellule sans que rien ne le signale. Les quatre plus anciennes
 * sont MASQUÉES, pas retirées de la lecture : c'est la même série, tronquée par
 * la largeur, et le nombre de barres suit toujours celui des libellés.
 *
 * ⚠️ LA HAUTEUR EST UNE PART DU MAXIMUM DE LA SÉRIE, pas du total. Un vendeur
 * qui crée dix commandes par semaine et un autre qui en crée trois cents lisent
 * la même forme : la question posée par ce bloc est « est-ce que ça monte ? »,
 * pas « combien ». Le chiffre exact reste accessible sur chaque barre.
 *
 * ⚠️ ZÉRO N'EST PAS UNE PETITE BARRE. Une semaine sans commande ne dessine
 * rien ; une semaine avec une seule commande dessine au moins deux pour cent de
 * la hauteur, sans quoi elle se confondrait avec le vide. Confondre « aucune »
 * et « une » sur un graphique de tendance, c'est effacer le redémarrage d'un
 * compte au moment précis où il redémarre.
 */

/** Sous ce seuil, une barre non nulle deviendrait invisible. */
const PART_MINIMALE = 2;

/** Les quatre premières disparaissent au téléphone : 12 − 8. */
const MASQUEES_AU_TELEPHONE = 4;

export async function FriseSemaines({ semaines }: { readonly semaines: readonly SemaineCreee[] }) {
  const t = await getTranslations("analyses");
  const format = await getFormatter();

  const maximum = semaines.reduce((m, s) => Math.max(m, s.total), 0);

  return (
    <section
      aria-label={t("frise.titre")}
      className="rounded-lg border border-outline-variant bg-surface-container-lowest p-[18px] lg:rounded-[18px] lg:p-[22px]"
    >
      <div className="mb-[18px] flex items-baseline justify-between gap-3 lg:mb-[22px]">
        <h2 className="font-headline-md text-[15px] leading-[19px] font-bold tracking-normal text-on-surface lg:text-[16px] lg:leading-[21px] lg:tracking-[-0.015em]">
          {t("frise.titre")}
        </h2>
        <span className="hidden font-body-sm text-[12px] leading-[15px] text-sourdine lg:inline">
          {t("frise.fenetre", { n: semaines.length })}
        </span>
      </div>

      {maximum === 0 ? (
        <p className="font-body-md text-[14px] text-on-surface-variant">{t("frise.vide")}</p>
      ) : (
        <>
          {/*
            LA LISTE PORTE L'INFORMATION, LES BARRES LA DESSINENT. Chaque élément
            est nommé en entier pour un lecteur d'écran — « semaine du 4 août :
            12 commandes » — pendant que l'axe visible se contente du jour et du
            mois, faute de place. Un graphique dont le seul contenu est une
            hauteur n'est lisible que par ceux qui le voient.
          */}
          <ul className="grid h-[128px] grid-cols-8 items-end gap-[7px] lg:h-[172px] lg:gap-2.5 xl:grid-cols-12">
            {semaines.map((s, i) => {
              const part = s.total === 0 ? 0 : Math.max(PART_MINIMALE, (s.total / maximum) * 100);
              return (
                <li
                  key={s.debut.toISOString()}
                  className={
                    "rounded-t-[4px] bg-violet " +
                    (i < MASQUEES_AU_TELEPHONE ? "hidden xl:block" : "")
                  }
                  style={{ height: part + "%" }}
                >
                  <span className="sr-only">
                    {t("frise.barre", {
                      semaine: format.dateTime(s.debut, { day: "numeric", month: "long" }),
                      n: s.total,
                    })}
                  </span>
                </li>
              );
            })}
          </ul>

          <div
            aria-hidden="true"
            className="mt-[9px] grid grid-cols-8 gap-[7px] lg:mt-2.5 lg:gap-2.5 xl:grid-cols-12"
          >
            {semaines.map((s, i) => (
              <span
                key={s.debut.toISOString()}
                className={
                  "text-center font-body-sm text-[10px] leading-3 text-sourdine " +
                  (i < MASQUEES_AU_TELEPHONE ? "hidden xl:block" : "")
                }
              >
                {format.dateTime(s.debut, { day: "numeric", month: "numeric" })}
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
