import { describe, expect, test } from "vitest";
import { lireDernieresActions } from "@/lib/audit/comptes";
import { lirePanneau } from "@/lib/audit/panneau";

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
      ).rejects.toThrow(/lecture des dernières actions impossible/);
    }
  });

  test("une réponse VIDE sans erreur lève encore : ce n'est pas une panne nommée", async () => {
    await expect(lireDernieresActions(client(null, null), 4)).rejects.toThrow(/réponse vide/);
  });
});

/**
 * L'INVENTAIRE DES LECTURES DU PANNEAU — et non celle qui vient d'échouer.
 *
 * ⚠️ CE BLOC EXISTE PARCE QUE LE MÊME DÉFAUT A ÉTÉ CORRIGÉ TROIS FOIS SUR CET
 * ÉCRAN, CHAQUE FOIS SUR LA SEULE LECTURE QUI VENAIT DE TOMBER :
 *
 *   02/09 — `stockage_total_admin` : `fetch failed` → 500 sur tout l'écran.
 *           Correctif posé sur cette lecture-là. Message du commit : « la garde
 *           couvre désormais les deux consommateurs ».
 *   04/09 — `lire_journal_admin`, appelée dans le MÊME `Promise.all`, levait
 *           toujours. Correctif posé sur celle-là.
 *   04/09, une heure plus tard — `etat_veilleur`, TROISIÈME lecture du même
 *           écran, a rendu `lecture des tâches impossible : fetch failed`.
 *
 * Trois fois L-025 : *un garde écrit après coup hérite du champ de vision de la
 * CORRECTION, pas du problème.* La quatrième se produira aussi longtemps qu'on
 * traitera une lecture à la fois.
 *
 * D'OÙ UN INVENTAIRE, PAS UNE SÉLECTION. La sonde énumère TOUTES les fonctions
 * que le panneau interroge, et exige de chacune les DEUX propriétés. Une lecture
 * ajoutée demain sans dégradation fait rougir ce test sans que personne ait
 * pensé à elle — c'est tout ce qu'on lui demande.
 */
const LECTURES_DU_PANNEAU = [
  "alertes_admin",
  "compteurs_admin",
  "etat_veilleur",
  "stockage_total_admin",
] as const;

/** Un client dont UNE seule fonction échoue, les autres répondant normalement. */
function panneauAvec(enEchec: string, message: string) {
  const reponses: Record<string, unknown> = {
    alertes_admin: [],
    compteurs_admin: [
      {
        colis_pris_en_charge_ce_mois: 0,
        comptes_actifs: 0,
        comptes_suspendus: 0,
        comptes_sans_type: 0,
        commandes_creees_ce_mois: 0,
      },
    ],
    etat_veilleur: [],
    stockage_total_admin: 0,
  };
  return {
    rpc: (nom: string) =>
      Promise.resolve(
        nom === enEchec
          ? { data: null, error: { message } }
          : { data: reponses[nom] ?? null, error: null },
      ),
  } as never;
}

const SEUILS = { colis: 1200, retardMinutes: 90 };

describe("Le panneau admin, lecture par lecture", () => {
  test("CONTRE-TEST : sans aucune panne, le panneau se lit entièrement", async () => {
    // ⚠️ EN PREMIER. Sans lui, « ne lève pas » serait vrai d'un panneau mort.
    const p = await lirePanneau(panneauAvec("aucune", ""), SEUILS);
    expect(p.alertes).not.toBeNull();
    expect(p.compteurs).not.toBeNull();
    expect(p.taches).not.toBeNull();
    expect(p.stockageMesurable).toBe(true);
  });

  test("la sonde inventorie réellement quelque chose", () => {
    expect(LECTURES_DU_PANNEAU.length).toBeGreaterThanOrEqual(4);
  });

  test("AUCUNE lecture en panne de transport n'emporte l'écran entier", async () => {
    for (const lecture of LECTURES_DU_PANNEAU) {
      const p = await lirePanneau(panneauAvec(lecture, "TypeError: fetch failed"), SEUILS).catch(
        (e: unknown) => e as Error,
      );
      expect(
        p instanceof Error,
        `« ${lecture} » en panne fait tomber TOUT le panneau : ${p instanceof Error ? p.message : ""}`,
      ).toBe(false);
    }
  });

  test("et la section touchée est NOMMÉE illisible, jamais remplie d'une valeur inventée", async () => {
    /*
     * `[]` sur les alertes dirait « tout va bien » — le brief l'interdit
     * explicitement : *un panneau qui affiche zéro alerte au lieu d'une erreur
     * ferait conclure que tout va bien.* Zéro sur les compteurs affirmerait
     * qu'on a compté. Et `taches: []` se confondrait avec « jamais déployé »,
     * qui enverrait chercher une panne dans un mécanisme inexistant.
     */
    const sansAlertes = await lirePanneau(panneauAvec("alertes_admin", "fetch failed"), SEUILS);
    expect(sansAlertes.alertes).toBeNull();
    expect(sansAlertes.alertes).not.toEqual([]);

    const sansCompteurs = await lirePanneau(panneauAvec("compteurs_admin", "fetch failed"), SEUILS);
    expect(sansCompteurs.compteurs).toBeNull();

    const sansTaches = await lirePanneau(panneauAvec("etat_veilleur", "fetch failed"), SEUILS);
    expect(sansTaches.taches).toBeNull();
    // ⚠️ ET SURTOUT PAS « aucune tâche déployée » : ce serait affirmer que rien
    // n'a jamais tourné, sur la foi d'une lecture qui n'a pas abouti.
    expect(sansTaches.aucuneTacheDeployee).toBe(false);

    const sansStockage = await lirePanneau(panneauAvec("stockage_total_admin", "fetch failed"), SEUILS);
    expect(sansStockage.stockageMesurable).toBe(false);
    expect(sansStockage.stockageOctets).toBeNull();
  });

  test("L'AUTRE SENS : une erreur APPLICATIVE continue de lever, sur chaque lecture", async () => {
    // Sans ce sens-là, un droit retiré ferait vivre un panneau « indisponible »
    // pour toujours, et personne n'irait chercher pourquoi.
    for (const lecture of LECTURES_DU_PANNEAU) {
      await expect(
        lirePanneau(panneauAvec(lecture, "permission denied for function " + lecture), SEUILS),
        `« ${lecture} » avale une erreur applicative comme une panne réseau`,
      ).rejects.toThrow();
    }
  });
});
