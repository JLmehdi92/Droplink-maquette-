import { getFormatter, getTranslations } from "next-intl/server";
import { Panneau } from "@/components/app/panneau";
import type { OuverturesDuJour } from "@/lib/analyses/activite";

/**
 * LIENS CLIENTS — le graphe d'ouvertures du kit, jour par jour.
 *
 * Valeurs relevées : barres à l'écart 10 sur 150 px de haut, rayon `sm`, teinte
 * `violet-300` ; libellés d'axe à 11 px en sourdine, centrés, 10 px sous les
 * barres, tronqués à l'ellipse.
 *
 * AUCUNE BIBLIOTHÈQUE, aucun composant client : des `div` et une hauteur en
 * pourcentage. L'écran fonctionne sans JavaScript et ne pèse rien de plus que
 * son HTML — c'est la règle de cet écran depuis sa première version.
 *
 * ⚠️ LES JOURS VIDES SONT RENDUS, et c'est tout l'intérêt. Un graphe qui saute
 * les jours sans ouverture n'est plus un graphe : ses barres deviennent
 * équidistantes alors que le temps ne l'est pas, et une semaine morte se lit
 * comme une semaine pleine. C'est la fonction SQL qui pose la grille.
 *
 * ⚠️ ET UN JOUR À ZÉRO GARDE UNE BARRE VISIBLE — un pixel. Une hauteur nulle
 * fait disparaître la colonne, et le vendeur ne distingue plus « aucune
 * ouverture ce jour-là » de « ce jour-là n'existe pas dans la période ».
 *
 * ⚠️ TOUS LES JOURS NE PORTENT PAS UN LIBELLÉ. Sur 90 jours, quatre-vingt-dix
 * dates de cinq caractères dans 700 px se chevauchent ; on n'en écrit qu'un
 * nombre borné, réparti, et le premier et le dernier toujours — ce sont les
 * bornes de la fenêtre, donc les deux qu'on lit.
 */

/** Au-delà, les dates se chevauchent. Mesuré sur la largeur du panneau. */
const LIBELLES_MAX = 8;

export async function LiensParJour({
  jours,
  total,
}: {
  readonly jours: readonly OuverturesDuJour[];
  /** Le total de la période, affiché en gros au-dessus comme sur le kit. */
  readonly total: number;
}) {
  const t = await getTranslations("analyses");
  const format = await getFormatter();

  const maximum = jours.reduce((m, j) => Math.max(m, j.total), 0);

  /* Les repères de l'axe : au plus `LIBELLES_MAX`, répartis, bornes comprises. */
  const pas = Math.max(1, Math.ceil(jours.length / LIBELLES_MAX));
  const reperes = [
    ...new Set(
      jours.filter((_, i) => i % pas === 0 || i === jours.length - 1).map((j) => j.jour),
    ),
  ];

  return (
    <Panneau titre={t("liens.titre")} sousTitre={t("liens.aide")}>
      {jours.length === 0 ? (
        <p className="text-[14px] text-ds-texte-corps">{t("liens.aucun")}</p>
      ) : (
        <>
          <p className="mb-4 text-[26px] leading-[1.1] font-extrabold tracking-[-0.04em] text-ds-texte-titre">
            {format.number(total)}
          </p>
          {/* `aria-hidden` : le graphe est une IMAGE des chiffres. Le total
              au-dessus porte l'information, et un lecteur d'écran qui
              annoncerait quatre-vingt-dix barres n'apprendrait rien. */}
          <div aria-hidden="true">
            <div className="flex h-[150px] items-end gap-2.5">
              {jours.map((j) => (
                <span
                  key={j.jour}
                  title={t("ouverturesLe", { n: j.total, jour: j.jour })}
                  className="min-w-0 flex-1 rounded-ds-sm bg-ds-violet-300"
                  style={{
                    height: maximum === 0 ? "1px" : `max(1px, ${(j.total / maximum) * 100}%)`,
                  }}
                />
              ))}
            </div>
            {/*
              ⚠️ UNE ÉTIQUETTE PAR BARRE NE TIENT PAS, ET LE PREMIER ESSAI L'A
              PROUVÉ : trente colonnes dans 350 px laissent 7 px chacune, et
              `truncate` rendait « 1 », « ( », « 2 » — des morceaux de dates,
              illisibles et faux d'apparence. Une étiquette posée sur une case
              de la grille hérite de la largeur de SA barre, quel que soit le
              nombre d'étiquettes qu'on décide d'écrire.

              La rangée est donc indépendante de la grille des barres : quelques
              repères répartis, qui occupent chacun la place dont ils ont besoin.
              Le premier et le dernier sont toujours écrits — ce sont les bornes
              de la fenêtre, donc les deux qu'on lit.
            */}
            <div className="mt-2.5 flex justify-between gap-2">
              {reperes.map((r) => (
                <span
                  key={r}
                  className="text-[11.5px] leading-[normal] whitespace-nowrap text-ds-texte-sourdine lg:text-[11px]"
                >
                  {etiquette(r)}
                </span>
              ))}
            </div>
          </div>
        </>
      )}
    </Panneau>
  );
}

/**
 * `AAAA-MM-JJ` → `JJ/MM`.
 *
 * ⚠️ DÉCOUPÉE, PAS FORMATÉE PAR UN FUSEAU. `viewed_on` est une colonne générée
 * qui porte un JOUR, déjà résolu côté base ; le passer dans un formateur de date
 * le ferait relire comme un instant UTC et reculer d'un jour pour la moitié des
 * lecteurs. La forme `JJ/MM` est celle que la frise des semaines emploie déjà.
 */
function etiquette(jour: string): string {
  const [, mois, jourDuMois] = jour.split("-");
  return `${jourDuMois ?? ""}/${mois ?? ""}`;
}
