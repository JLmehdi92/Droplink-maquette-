import type { LucideIcon } from "lucide-react";

/**
 * LA TUILE DE MÉTRIQUE DU DESIGN SYSTEM — `components/app/MetricTile`.
 *
 * Une pastille d'icône de 48 px, un nombre, un libellé. C'est la brique des
 * rangées de compteurs de l'espace vendeur.
 *
 * LES VALEURS DU KIT, RELEVÉES :
 *   carte     fond carte, filet `--border-subtle`, rayon carte-lg, ombre carte,
 *             `padding: 18px 20px`, écart 16
 *   pastille  48 × 48, rayon pilule, fond et trait de la teinte, icône 22 px
 *             en trait 1,9
 *   nombre    26 px / 800 / tracking -0,04em / interligne 1,1
 *   libellé   13 px / 400 / interligne 1,35
 *
 * ⚠️ LE BADGE D'ÉVOLUTION DU KIT N'EST PAS REPRIS, ET C'EST UNE DÉCISION
 * PRODUIT, PAS UN OUBLI. Le kit pose « +12 % », « -20 % » sur chaque tuile —
 * des nombres inventés pour la démonstration. Le produit ne mesure aucune
 * variation d'une semaine sur l'autre : il n'existe ni série temporelle, ni
 * période de référence, ni requête qui les produise. Rendre ce badge
 * exigerait de l'inventer, c'est-à-dire exactement ce que le principe XII
 * interdit — *l'interface n'affirme jamais ce que la base n'a pas enregistré*.
 * Le jour où la variation sera mesurée, la propriété se rajoute ici ; d'ici là
 * son absence est l'information juste.
 */

export type TeinteTuile = "marque" | "alerte" | "info" | "succes" | "erreur";

/**
 * Les cinq teintes du kit, chacune en DEUX classes complètes.
 *
 * ⚠️ ELLES SONT ÉCRITES EN ENTIER ET JAMAIS COMPOSÉES PAR MORCEAUX. Tailwind ne
 * voit que les chaînes littérales du source : un `"bg-ds-" + teinte + "-fond"`
 * ne produirait aucune règle — le genre de défaut qui ne lève rien et rend une
 * pastille transparente.
 */
const TEINTES: Record<TeinteTuile, { readonly pastille: string; readonly encre: string }> = {
  marque: { pastille: "bg-ds-surface-teinte text-ds-accent", encre: "text-ds-accent" },
  alerte: { pastille: "bg-ds-alerte-fond text-ds-alerte", encre: "text-ds-alerte" },
  info: { pastille: "bg-ds-info-fond text-ds-info", encre: "text-ds-info" },
  succes: { pastille: "bg-ds-succes-fond text-ds-succes", encre: "text-ds-succes" },
  erreur: { pastille: "bg-ds-erreur-fond text-ds-erreur", encre: "text-ds-erreur" },
};

export function TuileMetrique({
  Icone,
  valeur,
  libelle,
  teinte = "marque",
  valeurEnAlerte = false,
}: {
  readonly Icone: LucideIcon;
  readonly valeur: number | string;
  readonly libelle: string;
  readonly teinte?: TeinteTuile;
  /**
   * Peint AUSSI le nombre de la couleur de la teinte.
   *
   * ⚠️ DE LA COULEUR DE SA TEINTE, ET NON D'UN ROUGE ÉCRIT EN DUR. Les deux
   * compteurs qui s'en servent ne disent pas la même chose : « jamais
   * ouvertes » est un manque, en rouge ; « sans mouvement » est une attente, en
   * ambre. Un rouge unique aurait dit « erreur » d'un colis qui voyage
   * normalement mais lentement.
   *
   * Il ne s'allume que quand le compteur n'est pas nul : peint en permanence, il
   * crierait sur un compte neuf dont aucune commande n'a encore pu être
   * ouverte, et *une alerte qui se déclenche partout est une alerte qu'on
   * apprend à ignorer*.
   */
  readonly valeurEnAlerte?: boolean;
}) {
  const peau = TEINTES[teinte];
  return (
    /*
     * `group-hover` SANS `group` DANS CE FICHIER, et ce n'est pas un oubli : la
     * tuile est parfois posée DANS un lien — sur l'écran Envois, chaque compteur
     * filtre la liste. Le survol se lève alors sur le lien, qui porte `group`.
     * Sans lien, la règle ne s'applique jamais et la tuile reste ce qu'elle est.
     */
    <div className="flex h-full min-w-0 items-center gap-3 rounded-ds-card-lg border border-ds-filet bg-ds-surface-carte px-4 py-[18px] shadow-ds-card transition-shadow group-hover:shadow-ds-md md:gap-4 md:px-5">
      {/*
        ⚠️ LA PASTILLE RÉTRÉCIT AU TÉLÉPHONE — 40 AU LIEU DE 48 — PARCE QU'ON Y
        MET DEUX TUILES PAR RANGÉE. À 48 px plus 16 d'écart plus 40 de marges,
        il restait 99 px de texte sur 171 : « Jamais ouvertes » y passait sur
        trois lignes. Le kit n'a pas ce cas, il ne met qu'une tuile par rangée.
      */}
      <span
        className={
          "inline-flex h-10 w-10 flex-none items-center justify-center rounded-ds-pill md:h-12 md:w-12 " +
          peau.pastille
        }
      >
        {/* La taille est posée en CLASSES et non par `size` : une seule icône
            dans le document, dimensionnée par la feuille. Deux icônes dont on en
            masque une rendraient deux SVG sur chaque tuile. */}
        <Icone strokeWidth={1.9} aria-hidden="true" className="h-5 w-5 md:h-[22px] md:w-[22px]" />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span
          className={
            "text-[26px] leading-[1.1] font-extrabold tracking-[-0.04em] " +
            (valeurEnAlerte ? peau.encre : "text-ds-texte-fort")
          }
        >
          {valeur}
        </span>
        <span className="text-[13px] leading-[1.35] text-ds-texte-corps">{libelle}</span>
      </span>
    </div>
  );
}
