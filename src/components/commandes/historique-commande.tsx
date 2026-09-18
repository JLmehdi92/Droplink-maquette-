import { getFormatter, getTranslations } from "next-intl/server";
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
import { Panneau } from "@/components/app/panneau";

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
 * LES DATES SONT ABSOLUES, en deux lignes dans une colonne de 92 px. Voir
 * `jour` et `heure` plus bas pour la raison : ce bloc les a rendues relatives
 * pendant des semaines, sur l argument d une planche qui n est plus la
 * reference.
 */

export async function HistoriqueCommande({
  lignes,
}: {
  readonly lignes: readonly LigneHistorique[];
}) {
  const t = await getTranslations("editeur.historique");
  const format = await getFormatter();

  /*
   * ⚠️ LA DATE EST ABSOLUE, ET ELLE ETAIT RELATIVE.
   *
   * Ce bloc affichait « il y a 2 h » sur la premiere semaine, au motif qu on
   * le lit d un coup d oeil. L argument citait « la planche » — le canevas
   * abandonne le 11/09 —, et le design system, lui, ecrit la date ET l heure
   * en deux lignes dans une colonne de 92 px. C est le bon choix ici pour une
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
    <Panneau titre={t("titre")}>
      {/*
        ⚠️ LA CONSULTATION DU CLIENT A QUITTE CE PANNEAU, elle n a pas disparu.
        Elle en occupait la premiere ligne — donc le BAS de la page, apres un
        defilement — alors que « le client a-t-il ouvert le lien » est la
        question qu on se pose en ouvrant l ecran. Elle est desormais la
        troisieme tuile de la rangee de resume, en haut, avec sa date en
        sous-titre. Le kit ne dessine rien a cet endroit-ci : c est donc aussi
        un bloc en trop de moins.
      */}
      {lignes.length === 0 ? (
        // ÉTAT VIDE DISTINCT : une commande neuve n'a rien à montrer, et ce
        // n'est pas une anomalie. Afficher un bloc vide sans le dire laisserait
        // croire à un échec de chargement.
        <p className="text-[13px] text-ds-texte-sourdine">{t("aucun")}</p>
      ) : (
        <ol>
          {lignes.map((ligne, index) => {
            const Icone = ICONES[ligne.type];
            return (
              /*
                LA LIGNE DU KIT : ecart 14, `13px 0`, et un filet EN HAUT sauf
                sur la premiere. Le filet du haut plutot que du bas evite le
                trait orphelin sous la derniere ligne, que le kit n a pas.
              */
              <li
                key={ligne.id}
                className={
                  "flex gap-3.5 py-[13px]" + (index === 0 ? "" : " border-t border-ds-filet")
                }
              >
                {/* `IconTile` taille `sm` : 34 au rayon `sm`, fond teinte,
                    icone 16 a l accent au trait 1,9. */}
                <span className="inline-flex h-[34px] w-[34px] flex-none items-center justify-center rounded-ds-sm bg-ds-surface-teinte text-ds-accent">
                  <Icone aria-hidden="true" size={16} strokeWidth={1.9} />
                </span>
                {/* LA COLONNE DE DATE FAIT 92 px ET NE SE COMPRIME PAS : c est
                    ce qui aligne les titres des quatre lignes entre eux. */}
                <time
                  dateTime={ligne.quand}
                  className="flex w-[92px] flex-none flex-col text-[12px] leading-[normal] text-ds-texte-sourdine"
                >
                  {jour(ligne.quand)}
                  <span>{t("aHeure", { heure: heure(ligne.quand) })}</span>
                </time>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[14px] leading-[normal] font-bold text-ds-texte-fort">
                    {t(`types.${ligne.type}`)}
                  </span>
                  {/* LE DETAIL SE CASSE N IMPORTE OU (`overflowWrap: anywhere`),
                      comme dans le kit : il peut porter une URL de lien client,
                      qui n a aucune espace ou se couper. */}
                  {ligne.detail !== null && (
                    <span className="text-[13px] leading-[normal] break-words text-ds-texte-corps">
                      {lisible(ligne.detail)}
                    </span>
                  )}
                  {/*
                    LE COMMENTAIRE DU CLIENT, sous son arbitrage, entre
                    guillemets : c'est SA phrase, pas la nôtre. Il ne passe pas
                    par `lisible` — un texte tiers ne se traduit pas — et React
                    l'échappe. `break-words` : un client colle parfois un lien.
                  */}
                  {/* `unicode-bidi: isolate` : si un caractère de direction
                      survivait un jour à l'assainissement de la base (mesuré
                      le 18/09/2026 : les dix-sept testés sont retirés), il ne
                      déborderait pas sur le libellé voisin. */}
                  {ligne.commentaire !== null && (
                    <span className="text-[13px] leading-[normal] break-words text-ds-texte-corps [unicode-bidi:isolate]">
                      {t("commentaire", { texte: ligne.commentaire })}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </Panneau>
  );
}
