"use server";

import { revalidatePath } from "next/cache";
import { getFormatter, getTranslations } from "next-intl/server";
import { z } from "zod";
import { exigerAdmin } from "@/lib/audit/garde";
import {
  ecrireParametre,
  lireParametres,
  type ParametreAffiche,
  type ResultatEcriture,
} from "@/lib/audit/parametres";
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

/**
 * Ce que l'écran doit redessiner APRÈS l'écriture.
 *
 * ⚠️ IL EST RELU EN BASE, jamais déduit de ce qu'on vient d'envoyer. C'est toute
 * la différence entre « la valeur que j'ai demandée » et « la valeur que le
 * produit applique » — et sur un interrupteur qui coupe une facturation, seule
 * la seconde vaut quelque chose.
 */
export interface ValeurRelue {
  readonly valeur: number;
  readonly ecrit: boolean;
  readonly origine: string;
}

export type EtatParametre =
  | { statut: "inactif" }
  // `avant` : la valeur relue en base JUSTE AVANT l'écriture (`null` si la relecture a
  // échoué), pour dire « 300 → 400 » comme la maquette — jamais la valeur que l'écran
  // croyait, qu'un autre administrateur a pu changer entre-temps.
  | ({ statut: "ok"; cle: string; readonly avant: number | null } & { readonly apres: ValeurRelue })
  | Extract<ResultatEcriture, { statut: "erreur" }>;

/*
 * ⚠️ POURQUOI LE SERVEUR RENVOIE LA VALEUR RELUE, AU LIEU DE LAISSER LE CACHE
 * FAIRE SON TRAVAIL. Mesuré le 29/08/2026, écran piloté, requêtes lues octet par
 * octet — TROIS chemins ont été essayés, tous écrivaient correctement en base et
 * aucun ne redessinait l'écran :
 *
 *   - `useActionState` : la réponse contient le résultat ET l'arbre rafraîchi,
 *     et l'état du composant reste `inactif` indéfiniment (observé 8 s, toutes
 *     les 500 ms) ;
 *   - `router.refresh()` après un `await` ordinaire : rien ne bouge, 10 s
 *     durant, alors que la base a changé ;
 *   - le même appel DANS une transition : l'écran se met à jour, mais
 *     `isPending` ne retombe jamais, donc le bouton reste désactivé et le clic
 *     SUIVANT est avalé sans un mot.
 *
 * Un écran d'administration qui affirme un état que la base n'a plus est le
 * défaut le plus grave que cet écran puisse porter. On cesse donc de dépendre
 * d'une invalidation de cache : la Server Action RELIT et rend ce qu'elle a lu.
 * `revalidatePath` reste, pour le panneau et pour la navigation suivante.
 */
function composerOrigine(
  p: ParametreAffiche,
  t: (cle: string, valeurs?: Record<string, string>) => string,
  quand: (iso: string | null) => string,
): string {
  if (!p.ecrit) return t("origine.jamaisDecide");
  if (p.modifiePar === null) return t("origine.auteurParti", { date: quand(p.modifieLe) });
  return t("origine.decide", { date: quand(p.modifieLe), email: p.modifiePar });
}

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
  // Une lecture de plus, sur un écran d'administration : le prix d'un « avant → après »
  // qui dit ce que la base portait, et non ce que l'écran supposait.
  // Si elle échoue, l'écriture n'en dépend pas : le message dira « Enregistré. » sans la
  // flèche, et la relecture qui suit l'écriture reste, elle, obligatoire.
  const avant = await lireParametres(supabase).then(
    (liste) => liste.find((p) => p.cle === analyse.data.cle)?.valeur ?? null,
    () => null,
  );
  const resultat = await ecrireParametre(supabase, analyse.data.cle, analyse.data.valeur);

  if (resultat.statut !== "ok") return resultat;

  // Les deux écrans concernés : celui-ci, et le panneau dont les alertes
  // dépendent directement de ces seuils. Oublier le second laisserait le panneau
  // signaler selon l'ancien seuil pendant que l'écran de réglage affiche le
  // nouveau — les deux se contrediraient sans que rien n'échoue.
  revalidatePath("/[locale]/admin/parametres", "page");
  revalidatePath("/[locale]/admin", "page");

  const relu = (await lireParametres(supabase)).find((p) => p.cle === resultat.cle);
  // ⚠️ SI LA RELECTURE NE RETROUVE PAS LA CLÉ, ON LE DIT. Rendre « enregistré »
  // sans valeur laisserait l'écran sur l'ancienne, c'est-à-dire exactement le
  // défaut qu'on vient de corriger — mais cette fois sans même un message.
  if (relu === undefined) return { statut: "erreur", motif: "panne" };

  const t = await getTranslations("admin.parametres");
  const format = await getFormatter();
  const quand = (iso: string | null): string =>
    // Le format nommé de l'écran : l'origine ne change pas de forme après un enregistrement.
    format.dateTime(new Date(iso ?? 0), "origine");

  return {
    statut: "ok",
    cle: resultat.cle,
    avant,
    apres: {
      valeur: relu.valeur,
      ecrit: relu.ecrit,
      origine: composerOrigine(relu, t, quand),
    },
  };
}
