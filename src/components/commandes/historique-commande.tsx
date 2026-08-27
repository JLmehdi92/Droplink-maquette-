import { getFormatter, getTranslations } from "next-intl/server";
import type { LigneHistorique } from "@/lib/commandes/historique";

/**
 * L'HISTORIQUE D'UNE COMMANDE.
 *
 * Composant SERVEUR : il n'a ni état ni gestionnaire, donc il n'a rien à faire
 * dans le paquet du navigateur. Le rendre client ferait voyager les libellés
 * traduits ET la liste des événements dans la charge d'hydratation, pour un
 * bloc que personne n'interroge.
 *
 * ⚠️ AUCUNE CHAÎNE EN DUR. Chaque type d'événement porte son libellé traduit ;
 * un type sans libellé est écarté en amont, dans `lireHistorique`, plutôt que
 * rendu par sa clé — une clé brute à l'écran est une chaîne en dur déguisée.
 */
export async function HistoriqueCommande({
  lignes,
  vues,
  derniereVueLe,
}: {
  readonly lignes: readonly LigneHistorique[];
  readonly vues: number;
  readonly derniereVueLe: string | null;
}) {
  const t = await getTranslations("editeur.historique");
  const format = await getFormatter();

  return (
    <section className="rounded-xl border border-outline bg-surface-container-lowest p-4">
      <h2 className="font-headline-md text-on-surface">{t("titre")}</h2>

      {/*
        LA CONSULTATION DU CLIENT VIENT EN PREMIER, et c'est un choix.
        « Le client a-t-il ouvert le lien » est la question que le vendeur se
        pose en ouvrant cet écran ; ce qu'il a lui-même modifié, il le sait.
        Elle est lue sur la commande, jamais agrégée : mesuré, l'agrégat lisait
        vingt fois plus de lignes.
      */}
      <p className="mt-2 font-body-sm text-on-surface-variant">
        {derniereVueLe === null
          ? t("jamaisOuvert")
          : t("derniereOuverture", {
              quand: format.dateTime(new Date(derniereVueLe), {
                dateStyle: "medium",
                timeStyle: "short",
              }),
              vues,
            })}
      </p>

      {lignes.length === 0 ? (
        // ÉTAT VIDE DISTINCT : une commande neuve n'a rien à montrer, et ce
        // n'est pas une anomalie. Afficher un bloc vide sans le dire laisserait
        // croire à un échec de chargement.
        <p className="mt-3 font-body-sm text-on-surface-variant">{t("aucun")}</p>
      ) : (
        <ol className="mt-3 flex flex-col gap-2">
          {lignes.map((ligne) => (
            <li key={ligne.id} className="flex flex-wrap items-baseline gap-x-2 font-body-sm">
              <time
                dateTime={ligne.quand}
                className="tabular-nums text-on-surface-variant"
                // `tabular-nums` : sans lui, les dates d'une liste ne s'alignent
                // pas et l'œil ne peut plus la parcourir en colonne.
              >
                {format.dateTime(new Date(ligne.quand), {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </time>
              <span className="text-on-surface">{t(`types.${ligne.type}`)}</span>
              {ligne.detail !== null && (
                <span className="text-on-surface-variant">{ligne.detail}</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
