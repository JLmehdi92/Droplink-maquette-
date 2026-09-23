import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import {
  creerUtilisateur,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";

/**
 * LES GESTES DE LA LISTE, DE BOUT EN BOUT — le module qu'aucun test ne
 * traversait le 23/09/2026.
 *
 * `archivage-par-lot.test.ts` éprouve la fonction SQL ; `retour-de-liste.test.ts`
 * éprouve une COPIE de la règle de retour. Personne n'appelait le vrai
 * `executerGesteDeListe`, c'est-à-dire ce qui se passe entre le clic et la base :
 * la validation de la sélection, la traduction d'une erreur SQL en message,
 * l'événement émis, le retour construit. Un défaut là passait toutes les portes.
 *
 * ⚠️ LA BASE EST RÉELLE ET LA SESSION AUSSI. Seules deux choses sont substituées,
 * faute de requête HTTP : la lecture du cookie (on rend le client déjà
 * authentifié de l'utilisateur de test, RLS comprise) et l'invalidation du cache
 * de Next. Rien de ce qui décide n'est simulé.
 */

let session: SupabaseClient | null = null;
let profil: { profilId: string; shopId: string; statut: "active" | "suspended" } | null = null;

vi.mock("@/lib/supabase/server", () => ({
  creerClientServeur: async () => {
    if (session === null) throw new Error("aucune session posée par le test");
    return session;
  },
}));
vi.mock("@/lib/comptes/profil", () => ({ lireProfilVendeur: async () => profil }));
const revalidatePath = vi.fn();
const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath, revalidateTag }));
const emettreApres = vi.fn();
vi.mock("@/lib/instrumentation/emettre", () => ({ emettreApres }));

const { executerGesteDeListe } = await import("@/lib/commandes/geste-liste");

let alice: UtilisateurDeTest;
let bob: UtilisateurDeTest;
let catalogue: Client;
let commandesAlice: string[] = [];
let commandeBob: string;

function formulaire(champs: Record<string, string | readonly string[]>): FormData {
  const f = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) {
    if (typeof valeur === "string") f.append(cle, valeur);
    else for (const v of valeur) f.append(cle, v);
  }
  return f;
}

function commeVendeur(u: UtilisateurDeTest): void {
  session = u.client;
  profil = { profilId: u.profilId, shopId: u.shopId, statut: "active" };
}

async function archivees(ids: readonly string[]): Promise<number> {
  const lignes = await interroger<{ n: string }>(
    catalogue,
    "select count(*)::text as n from public.orders where id = any($1) and archived_at is not null",
    [[...ids]],
  );
  return Number.parseInt(lignes[0]?.n ?? "0", 10);
}

async function remettreAZero(): Promise<void> {
  await interroger(
    catalogue,
    "update public.orders set archived_at = null where id = any($1)",
    [[...commandesAlice, commandeBob]],
  );
}

async function creerCommandes(u: UtilisateurDeTest, combien: number): Promise<string[]> {
  const lignes = Array.from({ length: combien }, (_, i) => ({
    shop_id: u.shopId,
    customer_label: "geste " + String(i),
  }));
  const { data, error } = await u.client.from("orders").insert(lignes).select("id");
  expect(error, `création impossible : ${error?.message}`).toBeNull();
  return (data as { id: string }[]).map((l) => l.id);
}

beforeAll(async () => {
  catalogue = await ouvrirConnexionCatalogue();
  alice = await creerUtilisateur("geste-alice");
  bob = await creerUtilisateur("geste-bob");
  commandesAlice = await creerCommandes(alice, 4);
  commandeBob = (await creerCommandes(bob, 1))[0] as string;
}, 90_000);

afterAll(async () => {
  await supprimerUtilisateur(alice);
  await supprimerUtilisateur(bob);
  await catalogue.end();
}, 60_000);

beforeEach(async () => {
  commeVendeur(alice);
  revalidatePath.mockReset();
  revalidateTag.mockReset();
  emettreApres.mockReset();
  await remettreAZero();
});

// ─────────────────────────────────────────────────────────────────────────────

describe("L'archivage d'une sélection", () => {
  test("CONTRE-TEST : la sélection est archivée EN BASE, et l'écran dit combien", async () => {
    const trois = commandesAlice.slice(0, 3);
    const r = await executerGesteDeListe(
      formulaire({ geste: "lot", archiver: "1", selection: trois, retour: "/fr/commandes" }),
    );
    expect(r).toEqual({ statut: "ok", destination: "/fr/commandes?lot=ok&n=3" });
    expect(await archivees(trois), "l'écran annonce 3, la base n'en a pas 3").toBe(3);
    expect(await archivees([commandesAlice[3] as string]), "une commande NON cochée a bougé").toBe(0);
    // Le compteur d'usage (contrainte n° 7) reçoit le VRAI nombre, celui de la base.
    expect(emettreApres).toHaveBeenCalledTimes(1);
    expect(emettreApres.mock.calls[0]?.[2]).toEqual({ lot: 3, archivee: true });
    // Sans invalidation, la liste rechargée pourrait sortir d'une entrée périmée.
    expect(revalidatePath).toHaveBeenCalledWith("/fr/commandes");
  });

  test("le lot laisse sa trace dans l'historique de CHAQUE commande", async () => {
    const deux = commandesAlice.slice(0, 2);
    await executerGesteDeListe(formulaire({ geste: "lot", archiver: "1", selection: deux }));
    const lignes = await interroger<{ order_id: string }>(
      catalogue,
      `select order_id from public.order_events
        where order_id = any($1) and type = 'commande_archivee'
          and (payload->>'par_lot')::boolean and (payload->>'taille_lot')::int = 2`,
      [[...deux]],
    );
    expect(new Set(lignes.map((l) => l.order_id)).size).toBe(2);
  });

  test("désarchiver rend la sélection à la liste", async () => {
    const deux = commandesAlice.slice(0, 2);
    await executerGesteDeListe(formulaire({ geste: "lot", archiver: "1", selection: deux }));
    expect(await archivees(deux)).toBe(2);
    const r = await executerGesteDeListe(
      formulaire({ geste: "lot", archiver: "0", selection: deux, retour: "/fr/commandes?archivees=1" }),
    );
    expect(r).toEqual({ statut: "ok", destination: "/fr/commandes?archivees=1&lot=ok&n=2" });
    expect(await archivees(deux)).toBe(0);
  });

  test("⚠️ UNE COMMANDE D'UN AUTRE VENDEUR DANS LA SÉLECTION : RIEN N'EST ARCHIVÉ, ET ON LE DIT", async () => {
    /*
     * Le cas qui justifie tout le module. Sous RLS, l'`update` ignorerait la
     * commande de Bob EN SILENCE : sans la comparaison de la base, l'écran
     * dirait « 3 commandes traitées » pour une sélection dont une n'a pas bougé.
     * Tout ou rien — et un « rien » ANNONCÉ, pas un succès.
     */
    const melange = [...commandesAlice.slice(0, 2), commandeBob];
    const r = await executerGesteDeListe(
      formulaire({ geste: "lot", archiver: "1", selection: melange, retour: "/fr/commandes" }),
    );
    expect(r).toEqual({ statut: "ok", destination: "/fr/commandes?lot=partiel" });
    expect(await archivees(commandesAlice.slice(0, 2)), "atomicité rompue : Alice archivée à moitié").toBe(0);
    expect(await archivees([commandeBob]), "la commande de Bob a bougé").toBe(0);
    // Un lot refusé n'est pas un usage : le compteur ne doit rien voir.
    expect(emettreApres).not.toHaveBeenCalled();
  });

  test("une sélection vide le dit, sans toucher la base", async () => {
    const r = await executerGesteDeListe(formulaire({ geste: "lot", archiver: "1" }));
    expect(r).toEqual({ statut: "ok", destination: "/fr/commandes?lot=vide" });
    expect(emettreApres).not.toHaveBeenCalled();
  });

  test("⚠️ UNE SÉLECTION REFUSÉE N'EST PAS UNE SÉLECTION VIDE", async () => {
    /*
     * Défaut trouvé en écrivant ce fichier. Une sélection au-delà du plafond, ou
     * portant un identifiant altéré, faisait échouer la validation — et le
     * module répondait `lot=vide`. L'écran affichait « Aucune commande
     * sélectionnée » à un vendeur qui venait d'en cocher : un message FAUX, là où
     * la contrainte n° 8 exige qu'il soit vrai. « Rien n'a été modifié » l'est.
     */
    const trop = Array.from({ length: 201 }, (_, i) =>
      "00000000-0000-4000-8000-" + String(i).padStart(12, "0"),
    );
    for (const selection of [trop, [commandesAlice[0] as string, "pas-un-identifiant"]]) {
      const r = await executerGesteDeListe(formulaire({ geste: "lot", archiver: "1", selection }));
      expect(r, `${selection.length} identifiants`).toEqual({
        statut: "ok",
        destination: "/fr/commandes?lot=ecriture",
      });
    }
    expect(await archivees(commandesAlice), "une sélection refusée a archivé quelque chose").toBe(0);
  });

  test("un retour hostile est ramené à la liste — jamais un tremplin vers un autre site", async () => {
    for (const retour of ["https://exemple.test/x", "//exemple.test", "/\\exemple.test", "/..//exemple.test"]) {
      const r = await executerGesteDeListe(
        formulaire({ geste: "lot", archiver: "1", selection: [commandesAlice[0] as string], retour }),
      );
      expect(r.statut === "ok" ? r.destination : "", retour).toMatch(/^\/fr\/commandes\?lot=ok&n=1$/);
      await remettreAZero();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Les gardes du module", () => {
  test("⚠️ SANS SESSION, OU COMPTE SUSPENDU : AUCUN GESTE, AUCUNE ÉCRITURE", async () => {
    // La garde vit dans le module, pas seulement dans la route : rien ne
    // garantit qu'un appelant futur l'aura posée avant.
    const deux = commandesAlice.slice(0, 2);
    profil = null;
    expect(await executerGesteDeListe(formulaire({ geste: "lot", archiver: "1", selection: deux }))).toEqual({
      statut: "session",
    });
    profil = { profilId: alice.profilId, shopId: alice.shopId, statut: "suspended" };
    expect(await executerGesteDeListe(formulaire({ geste: "lot", archiver: "1", selection: deux }))).toEqual({
      statut: "session",
    });
    expect(await archivees(deux)).toBe(0);
  });

  test("un geste inconnu est refusé", async () => {
    for (const geste of ["supprimer", "", "LOT"]) {
      expect(await executerGesteDeListe(formulaire({ geste })), geste).toEqual({ statut: "geste-inconnu" });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Les gestes unitaires", () => {
  test("CONTRE-TEST : archiver UNE commande l'archive, et invalide sa page client", async () => {
    const id = commandesAlice[0] as string;
    const r = await executerGesteDeListe(
      formulaire({ geste: "archiver", id, archiver: "1", jeton: "xK9mQ2pL7vR4nT8wY3zB1", retour: "/en/commandes" }),
    );
    expect(r).toEqual({ statut: "ok", destination: "/en/commandes" });
    expect(await archivees([id])).toBe(1);
    // Une page client servie depuis le cache montrerait encore l'état d'avant.
    expect(revalidateTag).toHaveBeenCalled();
  });

  test("⚠️ ARCHIVER LA COMMANDE D'UN AUTRE VENDEUR NE FAIT RIEN", async () => {
    commeVendeur(bob);
    await executerGesteDeListe(formulaire({ geste: "archiver", id: commandesAlice[0] as string, archiver: "1" }));
    expect(await archivees([commandesAlice[0] as string])).toBe(0);
  });

  test("dupliquer crée une copie dans la boutique du vendeur et ouvre son éditeur", async () => {
    const r = await executerGesteDeListe(
      formulaire({ geste: "dupliquer", id: commandesAlice[0] as string, langue: "fr" }),
    );
    expect(r.statut).toBe("ok");
    const destination = r.statut === "ok" ? r.destination : "";
    const m = /^\/fr\/commandes\/([0-9a-f-]{36})$/.exec(destination);
    expect(m, `destination inattendue : ${destination}`).not.toBeNull();
    const copie = m?.[1] as string;
    commandesAlice.push(copie);
    const lignes = await interroger<{ shop_id: string }>(
      catalogue,
      "select shop_id from public.orders where id = $1",
      [copie],
    );
    expect(lignes[0]?.shop_id).toBe(alice.shopId);
  });

  test("⚠️ DUPLIQUER LA COMMANDE D'UN AUTRE VENDEUR NE CRÉE RIEN, et revient à la liste", async () => {
    const avant = await interroger<{ n: string }>(
      catalogue,
      "select count(*)::text as n from public.orders where shop_id = $1",
      [alice.shopId],
    );
    const r = await executerGesteDeListe(formulaire({ geste: "dupliquer", id: commandeBob, langue: "fr" }));
    expect(r).toEqual({ statut: "ok", destination: "/fr/commandes" });
    const apres = await interroger<{ n: string }>(
      catalogue,
      "select count(*)::text as n from public.orders where shop_id = $1",
      [alice.shopId],
    );
    expect(apres[0]?.n).toBe(avant[0]?.n);
  });
});
