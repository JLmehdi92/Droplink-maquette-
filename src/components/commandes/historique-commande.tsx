import { getFormatter, getTranslations } from "next-intl/server";
import type { LigneHistorique } from "@/lib/commandes/historique";

/**
 * L'HISTORIQUE D'UNE COMMANDE, porté sur la colonne de droite de la planche.
 *
 * Composant SERVEUR : il n'a ni état ni gestionnaire, donc il n'a rien à faire
 * dans le paquet du navigateur. Le rendre client ferait voyager les libellés
 * traduits ET la liste des événements dans la charge d'hydratation, pour un
 * bloc que personne n'interroge.
 *
 * ⚠️ AUCUNE CHAÎNE EN DUR. Chaque type d'événement porte son libellé traduit ;
 * un type sans libellé est écarté en amont, dans `lireHistorique`, plutôt que
 * rendu par sa clé — une clé brute à l'écran est une chaîne en dur déguisée.
 *
 * LES DATES SONT RELATIVES SUR LA PREMIÈRE SEMAINE, puis absolues. La planche
 * écrit « il y a 2 h », « hier, 18:12 », « 16 août, 09:40 » : c'est la même
 * information, mais on lit « il y a 2 h » d'un coup d'œil là où « 27/08/2026
 * 20:40 » demande une soustraction. Au-delà d'une semaine, le relatif cesse
 * d'aider — « il y a 3 semaines » est plus vague que la date.
 */
const SEMAINE_MS = 7 * 24 * 60 * 60 * 1000;

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
  const maintenant = new Date();

  const quand = (iso: string): string => {
    const date = new Date(iso);
    if (maintenant.getTime() - date.getTime() < SEMAINE_MS) {
      return format.relativeTime(date, { now: maintenant, style: "short" });
    }
    return format.dateTime(date, {
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  /**
   * ⚠️ « CHAMP MODIFIÉ QC_STATUS » S'AFFICHAIT EN TOUTES LETTRES.
   *
   * Le détail d'un événement de modification est le NOM DE COLONNE, tel que la
   * base le porte. Rendu tel quel, l'historique montrait `qc_status`,
   * `customer_label`, `tracking_number` — des identifiants techniques, dans un
   * bloc que le vendeur lit pour se rappeler ce qu'il a fait. C'est une chaîne
   * en dur déguisée : elle a traversé toutes les sondes parce qu'elle ne vient
   * pas du code, elle vient d'une ligne.
   *
   * Les détails qui ne sont PAS un nom de champ — un nombre de médias, une
   * taille de lot — passent tels quels : ce sont des chiffres, ils n'ont pas de
   * traduction.
   */
  const CHAMPS = new Set([
    "customer_label",
    "product_ref",
    "tracking_number",
    "carrier_code",
    "internal_notes",
    "status",
    "qc_status",
  ]);
  const tEditeur = await getTranslations("editeur");
  const lisible = (detail: string): string =>
    CHAMPS.has(detail) ? tEditeur("nomChamp." + detail) : detail;

  return (
    <section className="carte rounded-lg p-[18px] lg:rounded-[18px]">
      <h2 className="mb-3.5 font-headline-md text-[14px] font-bold text-on-surface">
        {t("titre")}
      </h2>

      {/*
        LA CONSULTATION DU CLIENT VIENT EN PREMIER, et c'est un choix.
        « Le client a-t-il ouvert le lien » est la question que le vendeur se
        pose en ouvrant cet écran ; ce qu'il a lui-même modifié, il le sait.
        Elle est lue sur la commande, jamais agrégée : mesuré, l'agrégat lisait
        vingt fois plus de lignes.
      */}
      <p className="mb-3.5 border-b border-filet-ligne pb-3.5 font-body-sm text-[13px] leading-[19px] text-on-surface">
        {derniereVueLe === null
          ? t("jamaisOuvert")
          : t("derniereOuverture", { quand: quand(derniereVueLe), vues })}
      </p>

      {lignes.length === 0 ? (
        // ÉTAT VIDE DISTINCT : une commande neuve n'a rien à montrer, et ce
        // n'est pas une anomalie. Afficher un bloc vide sans le dire laisserait
        // croire à un échec de chargement.
        <p className="font-body-sm text-[13px] text-sourdine">{t("aucun")}</p>
      ) : (
        <ol className="flex flex-col gap-[13px]">
          {lignes.map((ligne, index) => (
            <li key={ligne.id} className="flex gap-2.5">
              {/* LA PASTILLE DU HAUT EST VIOLETTE, LES AUTRES GRISES : c'est
                  l'événement le plus récent, et c'est celui qu'on vient
                  chercher. Elle ne porte aucune information à elle seule — la
                  ligne du dessus est déjà la première. */}
              <span
                className={
                  "mt-1.5 h-[7px] w-[7px] shrink-0 rounded-full " +
                  (index === 0 ? "bg-violet" : "bg-fond-barre")
                }
              />
              <div className="min-w-0">
                <p className="font-body-md text-[13px] leading-[19px] text-on-surface">
                  {t(`types.${ligne.type}`)}
                  {ligne.detail !== null ? " " + lisible(ligne.detail) : ""}
                </p>
                <time
                  dateTime={ligne.quand}
                  className="mt-px block font-body-sm text-[11px] text-sourdine"
                >
                  {quand(ligne.quand)}
                </time>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
