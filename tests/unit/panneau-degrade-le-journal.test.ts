import { describe, expect, test } from "vitest";
import { lireDernieresActions } from "@/lib/audit/comptes";

/**
 * LE PANNEAU NE TOMBE PAS ENTIER PARCE QUE SA CARTE D'APERÇU N'A PAS RÉPONDU.
 *
 * ⚠️ DÉFAUT TROUVÉ LE 04/09/2026 PAR UNE PASSE DE FUMÉE, DANS LA NATURE :
 *
 *     ⨯ Error: lecture des dernieres actions impossible : TypeError: fetch failed
 *
 * quatre contrôles rouges, dont « CONTRE-TEST : un administrateur OBTIENT le
 * panneau (statut 500) ». Le journal d'audit, lui, répondait 200 juste après :
 * le rôle, la session et la base allaient bien. Seule une lecture avait bronché.
 *
 * ⚠️ ET C'EST L-025 DANS SA FORME EXACTE. Le 02/09, `lirePanneau` levait sur
 * toute erreur de lecture du stockage et emportait l'écran entier ; le correctif
 * a extrait `estPanneDeTransport` et l'a posé... sur la lecture du stockage
 * SEULEMENT. `lireDernieresActions` est appelée dans le MÊME `Promise.all`, sur
 * le MÊME écran, et continuait de lever. *Un garde écrit après coup hérite du
 * champ de vision de la CORRECTION, pas du problème.*
 *
 * ⚠️ CE TEST APPELLE LA FONCTION, il ne cherche pas un motif dans sa source. Un
 * contrôle textuel prouverait qu'une expression existe, jamais qu'une panne est
 * rattrapée — et il se satisferait du commentaire qui la décrit.
 */

/** Un client qui rend l'erreur voulue, avec la chaîne d'appels réelle. */
function client(error: { message: string } | null, data: unknown = null) {
  const requete = {
    neq: () => requete,
    limit: () => Promise.resolve({ data, error }),
  };
  return { rpc: () => requete } as never;
}

describe("L'aperçu du journal sur le panneau admin", () => {
  test("CONTRE-TEST : une lecture qui aboutit rend bien ses lignes", async () => {
    // ⚠️ EN PREMIER. Sans lui, « ne lève pas » serait aussi vrai d'une fonction
    // qui ne lit rien du tout, et toute la suite passerait sur un produit mort.
    const lignes = await lireDernieresActions(
      client(null, [
        {
          id: "1",
          admin_email: "a@b.c",
          action: "compte.suspension",
          resource_type: "profile",
          resource_id: "x",
          target_email: "c@d.e",
          occurred_at: "2026-09-04T00:00:00Z",
        },
      ]),
      4,
    );
    expect(lignes).not.toBeNull();
    expect(lignes?.length).toBe(1);
    expect(lignes?.[0]?.action).toBe("compte.suspension");
  });

  test("une PANNE DE TRANSPORT dégrade la carte au lieu d'emporter l'écran", async () => {
    for (const message of ["TypeError: fetch failed", "ECONNRESET", "socket hang up", "ETIMEDOUT"]) {
      const lignes = await lireDernieresActions(client({ message }), 4);
      expect(lignes, `« ${message} » a été traité comme une lecture réussie`).toBeNull();
    }
  });

  test("`null` et NON un tableau vide — un tableau vide dirait « rien ne s'est passé »", async () => {
    /*
     * La différence n'est pas cosmétique : le panneau d'un administrateur est
     * l'endroit où l'on décide. « Aucune entrée » sur un journal qu'on n'a pas
     * pu lire est une affirmation fausse — et c'est le principe XII, *l'interface
     * n'affirme jamais ce que la base n'a pas enregistré*, appliqué à une base
     * qui n'a rien répondu du tout.
     */
    const lignes = await lireDernieresActions(client({ message: "fetch failed" }), 4);
    expect(lignes).toBeNull();
    expect(lignes).not.toEqual([]);
  });

  test("une erreur APPLICATIVE continue de lever — dégrader la cacherait pour toujours", async () => {
    /*
     * Sans ce sens-là, un droit retiré, une fonction disparue ou une contrainte
     * violée feraient vivre une carte « indisponible » indéfiniment, et personne
     * n'irait chercher pourquoi. La liste de `estPanneDeTransport` est étroite
     * exprès : l'élargir rendrait invisibles de vrais défauts, exactement comme
     * le faisait le défaut d'origine, dans l'autre sens.
     */
    for (const message of [
      'permission denied for function lire_journal_admin',
      'function public.lire_journal_admin(...) does not exist',
      "new row violates row-level security policy",
    ]) {
      await expect(
        lireDernieresActions(client({ message }), 4),
        `« ${message} » a été avalé comme une panne réseau`,
      ).rejects.toThrow(/lecture des dernieres actions impossible/);
    }
  });

  test("une réponse VIDE sans erreur lève encore : ce n'est pas une panne nommée", async () => {
    await expect(lireDernieresActions(client(null, null), 4)).rejects.toThrow(/reponse vide/);
  });
});
