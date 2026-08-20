import type { CommandePublique } from "@/lib/page-publique/lecture";

/**
 * La frise d'expédition, à QUATRE étapes.
 *
 * Quatre et pas douze : la granularité vit dans le DÉTAIL du suivi, pas dans la
 * frise. Un client qui voit douze étapes ne sait plus laquelle compte.
 *
 * Portée sur la frise verticale de `droplink_votre_suivi_de_commande` — pastille
 * de 16 px sur une ligne de 2 px, l'étape en cours creuse et pulsante, les
 * étapes à venir à demi-opacité. Le vocabulaire de fret disparaît : ni port de
 * départ, ni dédouanement, ni palette.
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
  accent,
}: {
  readonly statut: CommandePublique["statut"];
  readonly libelles: Readonly<Record<Etape, { titre: string; texte: string }>>;
  readonly accent: string;
}) {
  const courante = ETAPES.indexOf(statut);

  return (
    <ol className="relative ml-3 flex flex-col gap-8 border-l-2 border-surface-container-high">
      {ETAPES.map((etape, rang) => {
        const faite = rang < courante;
        const active = rang === courante;

        return (
          <li
            key={etape}
            className={"relative pl-6 " + (!faite && !active ? "opacity-50" : "")}
            aria-current={active ? "step" : undefined}
          >
            {active ? (
              <span
                className="absolute top-0 -left-[11px] flex h-5 w-5 items-center justify-center rounded-full border-2 bg-surface-container-lowest"
                style={{ borderColor: accent }}
              >
                <span
                  className="h-2 w-2 rounded-full motion-safe:animate-pulse"
                  style={{ backgroundColor: accent }}
                />
              </span>
            ) : (
              <span
                className={
                  "absolute top-1 -left-[9px] h-4 w-4 rounded-full " +
                  (faite ? "" : "border-2 border-outline-variant bg-surface-container-lowest")
                }
                style={faite ? { backgroundColor: accent } : undefined}
              />
            )}

            <h3
              className="font-label-md text-label-md"
              style={active ? { color: accent } : undefined}
            >
              {libelles[etape].titre}
            </h3>
            <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
              {libelles[etape].texte}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
