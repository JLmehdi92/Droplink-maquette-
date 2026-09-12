import { getFormatter, getTranslations } from "next-intl/server";
import { Panneau } from "@/components/app/panneau";
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
    <Panneau
      titre={t("frise.titre")}
      sousTitre={t("frise.aide")}
      action={
        <span className="hidden pt-1 text-[13px] text-ds-texte-sourdine lg:inline">
          {t("frise.fenetre", { n: semaines.length })}
        </span>
      }
    >

      {maximum === 0 ? (
        <p className="text-[14px] text-ds-texte-corps">{t("frise.vide")}</p>
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
                    "rounded-t-[4px] bg-ds-accent " +
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
                  "text-center text-[11.5px] leading-[15px] text-ds-texte-sourdine " +
                  (i < MASQUEES_AU_TELEPHONE ? "hidden xl:block" : "")
                }
              >
                {format.dateTime(s.debut, { day: "numeric", month: "numeric" })}
              </span>
            ))}
          </div>
        </>
      )}
    </Panneau>
  );
}
