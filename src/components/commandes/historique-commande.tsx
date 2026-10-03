import { getTranslations } from "next-intl/server";
import { getFormateur } from "@/lib/format/formateur";
import {
  Archive,
  ArchiveRestore,
  ArrowUpDown,
  CircleCheck,
  CircleX,
  Copy,
  ImageMinus,
  ImagePlus,
  Link2,
  Package,
  Pencil,
  type LucideIcon,
} from "lucide-react";
import type { LigneHistorique } from "@/lib/commandes/historique";
import { ListeHistorique } from "@/components/commandes/liste-historique";

/**
 * UNE ICONE PAR TYPE D EVENEMENT — c est ce que le kit dessine, et il n en
 * dessine aucune deux fois.
 *
 * ⚠️ LA TABLE EST EXHAUSTIVE PAR LE TYPAGE, pas par la relecture.
 * `Record<TypeAffiche, LucideIcon>` : ajouter un type d evenement sans lui
 * donner d icone ne compile plus. Un repli « icone par defaut » aurait laisse
 * passer l oubli en silence, et c est exactement ainsi qu une pastille
 * generique finit sur la moitie des lignes.
 */
const ICONES: Record<LigneHistorique["type"], LucideIcon> = {
  commande_creee: Package,
  commande_modifiee: Pencil,
  commande_archivee: Archive,
  commande_desarchivee: ArchiveRestore,
  commande_dupliquee: Copy,
  media_ajoute: ImagePlus,
  media_supprime: ImageMinus,
  medias_reordonnes: ArrowUpDown,
  lien_revoque: Link2,
  qc_approuve: CircleCheck,
  qc_refuse: CircleX,
};

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
 * LES DATES SONT ABSOLUES, sous le libellé comme dans la maquette (`.ed-histo`),
 * année comprise. Voir `jour` et `heure` plus bas pour la raison.
 */

export async function HistoriqueCommande({
  lignes,
}: {
  readonly lignes: readonly LigneHistorique[];
}) {
  const t = await getTranslations("editeur.historique");
  const format = await getFormateur();

  /*
   * ⚠️ LA DATE EST ABSOLUE, ET ELLE ETAIT RELATIVE.
   *
   * Ce bloc affichait « il y a 2 h » sur la premiere semaine, au motif qu on
   * le lit d un coup d oeil. L argument citait « la planche » — le canevas
   * abandonne le 11/09 —, et le design system, lui, ecrit la date ET l heure.
   * C est le bon choix ici pour une
   * raison qui n est pas esthetique : l historique est la piece qu on
   * demanderait en cas de litige avec un client, et « il y a 2 h » cesse
   * d etre vrai a la lecture suivante.
   */
  const jour = (iso: string): string =>
    format.dateTime(new Date(iso), { day: "numeric", month: "short", year: "numeric" });
  const heure = (iso: string): string =>
    format.dateTime(new Date(iso), { hour: "2-digit", minute: "2-digit" });

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
    <section className="bloc ed-carte ed-carte--historique" aria-labelledby="ed-historique">
      <header className="ed-carte__tete">
        <h2 id="ed-historique">{t("titre")}</h2>
      </header>
      {lignes.length === 0 ? (
        // ÉTAT VIDE DISTINCT : une commande neuve n'a rien à montrer, et ce n'est pas
        // une anomalie. Un bloc vide sans le dire laisserait croire à un échec.
        <p className="ed-histo__vide">{t("aucun")}</p>
      ) : (
        <ListeHistorique>
          {lignes.map((ligne) => {
            const Icone = ICONES[ligne.type];
            return (
              <li key={ligne.id} data-id={ligne.id}>
                <i aria-hidden="true">
                  <Icone className="ic" />
                </i>
                <p>
                  {t(`types.${ligne.type}`)}
                  {/* LE DÉTAIL SE CASSE N'IMPORTE OÙ : il peut porter une URL de lien client. */}
                  {ligne.detail === null ? null : <span className="ed-histo__detail">{lisible(ligne.detail)}</span>}
                  {/* LE COMMENTAIRE DU CLIENT, entre guillemets : c'est SA phrase. Il ne passe
                      pas par `lisible` — un texte tiers ne se traduit pas —, React l'échappe, et
                      `unicode-bidi: isolate` l'empêche de déborder sur le libellé voisin. */}
                  {ligne.commentaire === null ? null : (
                    <span className="ed-histo__detail ed-histo__commentaire">
                      {t("commentaire", { texte: ligne.commentaire })}
                    </span>
                  )}
                  <small>
                    <time dateTime={ligne.quand}>
                      {jour(ligne.quand)} {t("aHeure", { heure: heure(ligne.quand) })}
                    </time>
                  </small>
                </p>
              </li>
            );
          })}
        </ListeHistorique>
      )}
    </section>
  );
}
