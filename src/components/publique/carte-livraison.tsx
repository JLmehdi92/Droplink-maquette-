import { CalendarDays, FileText, Package, Truck, User } from "lucide-react";
import type { ReactNode } from "react";
import { CARTE, TitreCarte } from "@/components/publique/carte-client";
import type { AccentResolu } from "@/lib/design/contraste";

/**
 * « INFORMATIONS DE LIVRAISON » — la carte de droite du kit `client_link`.
 *
 * Une ligne par information : tuile d'icône ronde, libellé 12 en sourdine,
 * valeur 15 / 700, un filet entre deux lignes.
 *
 * ⚠️ UNE LIGNE PAR INFORMATION QUE LA BASE PORTE, ET AUCUNE AUTRE. Le kit
 * montre un pays de livraison avec son drapeau : le destinataire n'a pas
 * d'adresse chez nous, et le pays d'un transporteur n'est pas celui où arrive
 * le colis. La ligne n'existe pas plutôt que d'afficher un pays deviné.
 *
 * ⚠️ ET LE NUMÉRO N'OUVRE RIEN. Le kit pose une flèche vers l'extérieur à côté :
 * aucune source ne donne l'adresse de la page de suivi d'un transporteur
 * (`lib/tracking/transporteurs.ts` le mesure — 3 502 transporteurs, aucun
 * gabarit d'URL), et un lien vers un site de suivi tiers enverrait le numéro du
 * client chez quelqu'un que ni lui ni son vendeur n'ont choisi.
 *
 * DEUX LIGNES QUE LE KIT N'A PAS, parce que le produit les portait déjà et que
 * cette carte est leur place naturelle : le destinataire, et la référence du
 * produit. Le bloc « Détails » qui les portait n'existe plus.
 *
 * LA CARTE ENTIÈRE EST OMISE QUAND ELLE N'A AUCUNE LIGNE : une carte titrée et
 * vide affirmerait qu'il y a quelque chose à y lire.
 */
export interface LigneLivraison {
  readonly cle: "transporteur" | "numero" | "estimation" | "destinataire" | "reference";
  readonly libelle: string;
  readonly valeur: string;
}

const ICONES: Readonly<Record<LigneLivraison["cle"], ReactNode>> = {
  transporteur: <Truck size={17} strokeWidth={1.9} />,
  numero: <FileText size={20} strokeWidth={1.9} />,
  estimation: <CalendarDays size={20} strokeWidth={1.9} />,
  destinataire: <User size={20} strokeWidth={1.9} />,
  reference: <Package size={20} strokeWidth={1.9} />,
};

export function CarteLivraison({
  titre,
  lignes,
  accent,
}: {
  readonly titre: string;
  readonly lignes: readonly LigneLivraison[];
  readonly accent: AccentResolu;
}) {
  if (lignes.length === 0) return null;

  return (
    <section className={CARTE}>
      <TitreCarte>{titre}</TitreCarte>
      <dl>
        {lignes.map((ligne, rang) => (
          <div
            key={ligne.cle}
            className={
              "flex items-center gap-3.5 py-3.5 " + (rang > 0 ? "border-t border-ds-filet" : "")
            }
          >
            {/* LE TRANSPORTEUR A SA TUILE DE 38, LES AUTRES 44 : c'est le kit,
                où la pastille du transporteur porte la couleur de SA marque.
                Ici elle porte l'accent — aucune source ne donne la couleur
                officielle de 3 502 transporteurs. */}
            <span
              aria-hidden="true"
              className={
                "flex shrink-0 items-center justify-center rounded-full " +
                (ligne.cle === "transporteur" ? "h-[38px] w-[38px]" : "h-11 w-11")
              }
              style={{ backgroundColor: accent.teinte, color: accent.interface }}
            >
              {ICONES[ligne.cle]}
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-[12px] text-ds-texte-sourdine">{ligne.libelle}</dt>
              <dd className="text-[15px] font-bold break-words text-ds-texte-fort">{ligne.valeur}</dd>
            </div>
          </div>
        ))}
      </dl>
    </section>
  );
}
