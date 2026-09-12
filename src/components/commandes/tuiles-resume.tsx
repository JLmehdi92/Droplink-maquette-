import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Eye, Package, Truck, User } from "lucide-react";

/**
 * LA RANGÉE DE RÉSUMÉ DE L'ÉCRAN DE DÉTAIL — `SummaryTile` du kit, mesuré à
 * 1690 px sur la page servie.
 *
 * Quatre tuiles à `repeat(4,1fr)`, écart 16, 20 px sous la rangée. Chaque tuile :
 * carte au rayon `card-lg`, filet fin, ombre de carte, `16px 18px` de
 * remplissage, écart 14 ; une pastille de 44 au rayon pilule portant une icône
 * de 20 au trait 1,9 ; puis une colonne à l'écart 3 — libellé 13 en sourdine,
 * valeur 16/700 en encre, et une troisième ligne facultative à 12 en sourdine.
 *
 * ⚠️ DEUX DES QUATRE TUILES DU KIT NE SONT PAS LES NÔTRES, ET C'EST MESURÉ, PAS
 * SUPPOSÉ. Le kit montre « Pays de livraison » et « Nombre d'articles » :
 *
 *  - le PAYS n'existe nulle part dans le schéma, et ce n'est pas un oubli — le
 *    destinataire est un texte libre sans compte ni adresse (principe III), il
 *    n'y a donc aucune adresse d'où tirer un pays ;
 *  - le NOMBRE D'ARTICLES suppose des lignes de commande. Une commande DropLink
 *    porte une RÉFÉRENCE produit en texte libre et des médias, jamais un panier.
 *
 * Les remplir par un repli — « France » écrit d'avance, ou le nombre de photos
 * présenté comme un nombre d'articles — afficherait sur l'écran le plus ouvert
 * du produit deux valeurs que la base n'a pas enregistrées. Deux tuiles portent
 * donc NOS colonnes : la référence produit, et le compteur de consultations du
 * lien.
 *
 * ⚠️ ET LE COMPTEUR DE VUES N'EST PAS UN REMPLISSAGE. « Le client a-t-il ouvert
 * le lien » est la question que le vendeur se pose en ouvrant cet écran, et
 * c'est une métrique de verdict du produit (décision 22). Elle occupait
 * jusqu'ici la première ligne du panneau d'historique — tout en bas de la page,
 * donc après un défilement — et le kit ne dessine rien à cet endroit. Elle
 * remonte ici : la même information, à l'endroit où on la cherche, et un bloc
 * en trop de moins par rapport au kit.
 */

function Tuile({
  Icone,
  libelle,
  valeur,
  sous,
  ton = "marque",
}: {
  readonly Icone: typeof User;
  readonly libelle: string;
  readonly valeur: ReactNode;
  readonly sous?: string | null;
  /** `info` sur la tuile de suivi, comme le kit : c'est celle qu'on cherche. */
  readonly ton?: "marque" | "info";
}) {
  return (
    <div className="flex min-w-0 items-center gap-3.5 rounded-ds-card-lg border border-ds-filet bg-ds-surface-carte px-[18px] py-4 shadow-ds-card">
      <span
        className={
          "inline-flex h-11 w-11 flex-none items-center justify-center rounded-ds-pill text-ds-accent " +
          (ton === "info" ? "bg-ds-info-fond" : "bg-ds-surface-teinte")
        }
      >
        <Icone aria-hidden="true" size={20} strokeWidth={1.9} />
      </span>
      <span className="flex min-w-0 flex-col gap-[3px]">
        <span className="text-[13px] leading-[normal] text-ds-texte-sourdine">{libelle}</span>
        {/*
          LA VALEUR SE TRONQUE À L'ELLIPSE, elle ne se replie pas. Une tuile de
          336 px porte un nom de client libre et un numéro de suivi de vingt
          caractères : repliée, elle prendrait deux hauteurs et désalignerait
          les trois autres tuiles de la rangée. La valeur complète reste dans le
          champ du formulaire, quinze pixels plus bas — cette ligne l'identifie.
        */}
        <span className="truncate text-[16px] leading-[normal] font-bold text-ds-texte-fort">{valeur}</span>
        {sous === undefined || sous === null ? null : (
          <span className="truncate text-[12px] leading-[normal] text-ds-texte-sourdine">{sous}</span>
        )}
      </span>
    </div>
  );
}

export function TuilesResume({
  client,
  reference,
  numeroSuivi,
  transporteur,
  vues,
  derniereVueLe,
}: {
  readonly client: string;
  readonly reference: string;
  readonly numeroSuivi: string;
  /**
   * Le NOM du transporteur, résolu côté serveur depuis `carrier_code`.
   *
   * `null` quand aucun colis n'est rattaché ou quand le catalogue ne connaît
   * pas le code — 17TRACK en ajoute. La ligne est alors OMISE plutôt que
   * remplie d'un « Transporteur inconnu » : un repli sur chaque commande vaut
   * moins que rien.
   */
  readonly transporteur: string | null;
  readonly vues: number;
  /**
   * La derniere ouverture du lien par le client, DEJA FORMATEE par le serveur,
   * ou `null` si le lien n a jamais ete ouvert.
   *
   * Elle vit sur la troisieme ligne de la tuile — celle que `SummaryTile`
   * reserve au sous-titre, et que le kit emploie pour le nom du transporteur.
   * Sans elle, remonter le compteur ici aurait PERDU la date : « 3 consultations »
   * sans dire quand ne repond pas a la question qu on se pose.
   */
  readonly derniereVueLe: string | null;
}) {
  const t = useTranslations("editeur");

  /*
   * LE TIRET EST CELUI DU KIT, pas une invention : `OrderDetail.jsx` écrit
   * `order.tracking || "–"` sur cette tuile. Ici, une valeur vide est une
   * information utile au VENDEUR — « tu n'as pas encore collé le numéro » —, ce
   * qui n'est pas le cas sur la page publique, où la règle d'omission
   * s'applique. Ce sont deux lecteurs différents (décision 26).
   */
  const ou = (v: string): string => (v.trim() === "" ? t("tuileVide") : v);

  return (
    <div className="mb-5 hidden grid-cols-4 gap-4 lg:grid">
      <Tuile Icone={User} libelle={t("tuileClient")} valeur={ou(client)} />
      <Tuile Icone={Package} libelle={t("tuileReference")} valeur={ou(reference)} />
      <Tuile
        Icone={Eye}
        libelle={t("tuileVues")}
        valeur={vues === 0 ? t("tuileVuesAucune") : t("tuileVuesNombre", { n: vues })}
        sous={derniereVueLe}
      />
      <Tuile
        Icone={Truck}
        ton="info"
        libelle={t("tuileSuivi")}
        valeur={ou(numeroSuivi)}
        sous={transporteur}
      />
    </div>
  );
}
