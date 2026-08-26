import type { CommandePublique } from "@/lib/page-publique/lecture";

/**
 * La frise d'expédition, à QUATRE étapes, en quatre segments horizontaux.
 *
 * Quatre et pas douze : la granularité vit dans le DÉTAIL du suivi, pas dans la
 * frise. Un client qui voit douze étapes ne sait plus laquelle compte.
 *
 * ELLE A CHANGÉ DE FORME AVEC LE CANEVAS. Elle était une colonne de pastilles
 * sur une ligne verticale, chaque étape portant une phrase. Le client n'a pas
 * besoin qu'on lui explique ce que « expédié » veut dire : il a besoin de voir
 * où en est son colis, en un coup d'œil, sans dérouler. Les quatre phrases sont
 * donc parties — et leurs clés de traduction avec elles, sinon elles seraient
 * restées à traduire et à relire pour rien.
 *
 * DEUX FONDS, DEUX PALETTES. Sur téléphone la frise est posée sur l'aplat
 * d'accent du vendeur ; sur grand écran elle est dans une carte blanche. Le
 * remplissage des segments ne peut donc pas être une couleur en dur : sur
 * l'aplat il prend `surRemplissage` — la couleur que `resoudreAccent()` a jugée
 * lisible dessus — et sur blanc il prend l'accent lui-même.
 *
 * LE STATUT NE RECULE JAMAIS. Ici c'est simplement l'affichage d'un état que la
 * base a déjà arbitré ; la règle vit en amont, mais l'écran ne doit pas pouvoir
 * la contredire — d'où un rang calculé depuis une liste ordonnée, et non une
 * suite de conditions.
 */

const ETAPES = ["preparation", "expedie", "en_transit", "livre"] as const;
type Etape = (typeof ETAPES)[number];

export function Frise({
  statut,
  libelles,
  rempli,
  vide,
  texteAtteint,
  texteAVenir,
}: {
  readonly statut: CommandePublique["statut"];
  readonly libelles: Readonly<Record<Etape, string>>;
  /** Couleur des segments franchis. */
  readonly rempli: string;
  /** Couleur des segments à venir. */
  readonly vide: string;
  /** Couleur du libellé de l'étape en cours. */
  readonly texteAtteint: string;
  /** Couleur des libellés des autres étapes. */
  readonly texteAVenir: string;
}) {
  const courante = ETAPES.indexOf(statut);

  return (
    <ol className="grid grid-cols-4 gap-[5px]" aria-label={libelles[statut]}>
      {ETAPES.map((etape, rang) => {
        const active = rang === courante;

        return (
          <li key={etape} aria-current={active ? "step" : undefined}>
            <div
              className="h-1.5 rounded-full"
              style={{ backgroundColor: rang <= courante ? rempli : vide }}
            />
            <span
              className="mt-2 block font-body-sm text-[10px] leading-[14px] md:text-[11px] md:leading-[15px]"
              style={{
                color: active ? texteAtteint : texteAVenir,
                fontWeight: active ? 700 : 400,
              }}
            >
              {libelles[etape]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
