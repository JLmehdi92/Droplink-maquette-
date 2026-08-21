"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigerAdmin } from "@/lib/audit/garde";
import { ecrireParametre, type ResultatEcriture } from "@/lib/audit/parametres";
import { creerClientServeur } from "@/lib/supabase/server";

/**
 * ENREGISTRER UN PARAMÈTRE SYSTÈME.
 *
 * CETTE ACTION PORTE SA PROPRE GARDE. Le layout d'administration en pose une,
 * mais une Server Action NE PASSE PAS par le layout : c'est un point d'entrée à
 * part entière, atteignable par une requête forgée qui n'a jamais affiché
 * l'écran. Le middleware ne la couvre pas davantage.
 *
 * DANS UN MODULE `"use server"`, CHAQUE EXPORT EST ATTEIGNABLE DEPUIS LE
 * NAVIGATEUR. Le travail réel — l'inventaire clos des clés et leurs bornes —
 * vit dans `lib/audit/parametres.ts`, en `server-only`, et c'est lui que les
 * tests exercent.
 *
 * LA CLÉ VIENT DU FORMULAIRE, DONC ELLE EST SUSPECTE. Elle est confrontée à
 * l'inventaire avant toute écriture : sans ce contrôle, une clé forgée créerait
 * une ligne que rien ne lit, avec sa trace et son affichage — une configuration
 * qui a la FORME d'une configuration sans rien substituer.
 */

const Formulaire = z.object({
  cle: z.string().max(120),
  // `coerce` : un champ de formulaire est toujours du texte. Une saisie vide ou
  // non numérique devient `NaN`, que `z.number()` refuse — c'est ce qu'on veut,
  // et non un zéro silencieux qui vaudrait « signale tout le monde ».
  valeur: z.coerce.number().int(),
});

export type EtatParametre = { statut: "inactif" } | ResultatEcriture;

export async function enregistrerParametre(
  _precedent: EtatParametre,
  donnees: FormData,
): Promise<EtatParametre> {
  await exigerAdmin();

  const analyse = Formulaire.safeParse({
    cle: donnees.get("cle"),
    valeur: donnees.get("valeur"),
  });
  if (!analyse.success) return { statut: "erreur", motif: "bornes" };

  const supabase = await creerClientServeur();
  const resultat = await ecrireParametre(supabase, analyse.data.cle, analyse.data.valeur);

  if (resultat.statut === "ok") {
    // Les deux écrans concernés : celui-ci, et le panneau dont les alertes
    // dépendent directement de ces seuils. Oublier le second laisserait le
    // panneau signaler selon l'ancien seuil pendant que l'écran de réglage
    // affiche le nouveau — les deux se contrediraient sans que rien n'échoue.
    revalidatePath("/[locale]/admin/parametres", "page");
    revalidatePath("/[locale]/admin", "page");
  }

  return resultat;
}
