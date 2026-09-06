import { z } from "zod";
import { LANGUES } from "@/i18n/config";

/**
 * LE SCHÉMA DES LANGUES, DÉRIVÉ DE L'INVENTAIRE.
 *
 * ⚠️ IL ÉTAIT RECOPIÉ — `z.enum(["fr", "en"])` — À SIX ENDROITS, et le
 * compilateur ne pouvait rien en dire : une union littérale écrite à la main
 * est valide, elle est simplement FAUSSE le jour où l'inventaire change.
 *
 * Deux de ces six copies portaient `.catch("fr")` : un vendeur sur `/zh-CN`
 * qui archive ou duplique une commande aurait été redirigé vers `/fr`, sans
 * exception, sans journal, sans rien. Un repli silencieux sur une langue que
 * la personne ne lit pas.
 *
 * `z.enum` exige un tuple non vide : `LANGUES` en est un, `as const` le
 * garantit. Ajouter une langue met donc à jour les six d'un coup.
 */
export const SchemaLangue = z.enum(LANGUES);
