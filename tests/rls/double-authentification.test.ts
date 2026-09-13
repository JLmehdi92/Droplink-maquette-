import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  clientAnonyme,
  creerUtilisateur,
  fetchResilient,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";
import { codeTotp } from "../aide/totp";

/**
 * LA DOUBLE AUTHENTIFICATION TIENT EN BASE, PAS SEULEMENT À L'ÉCRAN.
 *
 * Le scénario qui justifie tout : quelqu'un connaît le mot de passe, pas le
 * téléphone. Il obtient une session `aal1` parfaitement valide. Si la base la
 * servait, il lirait commandes, notes internes et `public_token` en appelant
 * PostgREST à la main, et la protection n'aurait protégé qu'une redirection.
 *
 * Tout est éprouvé avec de VRAIS facteurs TOTP, enrôlés et vérifiés chez
 * Supabase avec des codes calculés selon la RFC — jamais un faux serveur.
 *
 * ET LES CONTRE-TESTS POSITIFS COMPTENT AUTANT : le crochet s'exécute avant
 * CHAQUE requête du produit, donc un compte SANS facteur, une session `aal2` et
 * un anonyme doivent passer. Une garde qui refuserait tout passerait les refus.
 */

const URL_SUPABASE = process.env["NEXT_PUBLIC_SUPABASE_URL"] as string;
const CLE_PUBLIABLE = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] as string;

let protege: UtilisateurDeTest;
let ordinaire: UtilisateurDeTest;
let secret = "";
let commandeId = "";

function nouveauClient(): SupabaseClient {
  return createClient(URL_SUPABASE, CLE_PUBLIABLE, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchResilient },
  });
}

async function sessionAal1(u: UtilisateurDeTest): Promise<SupabaseClient> {
  const client = nouveauClient();
  const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.motDePasse });
  if (error !== null) throw new Error("connexion impossible : " + error.message);
  return client;
}

beforeAll(async () => {
  protege = await creerUtilisateur("deux-etapes-protege");
  ordinaire = await creerUtilisateur("deux-etapes-ordinaire");

  // Une commande, pour que « la lecture est refusée » ne puisse pas se confondre
  // avec « il n'y avait rien à lire ».
  const { data: commande, error: eCommande } = await protege.client
    .from("orders")
    .insert({ shop_id: protege.shopId, customer_label: "Client témoin 2FA" })
    .select("id")
    .single();
  if (eCommande !== null) throw new Error("commande témoin : " + eCommande.message);
  commandeId = commande.id as string;

  const { data: enrole, error: eEnrole } = await protege.client.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "témoin",
  });
  if (eEnrole !== null) throw new Error("enrôlement : " + eEnrole.message);
  secret = enrole.totp.secret;
  const { error: eVerif } = await protege.client.auth.mfa.challengeAndVerify({
    factorId: enrole.id,
    code: codeTotp(secret),
  });
  if (eVerif !== null) throw new Error("vérification : " + eVerif.message);
}, 120_000);

afterAll(async () => {
  await supprimerUtilisateur(protege);
  await supprimerUtilisateur(ordinaire);
});

describe("Un compte à facteur vérifié, session aal1", () => {
  test("ne lit AUCUNE table — et la commande existe bel et bien", async () => {
    const client = await sessionAal1(protege);
    const { data: niveau } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    expect(niveau?.currentLevel, "La session témoin doit être aal1.").toBe("aal1");

    for (const table of ["orders", "profiles", "shops"] as const) {
      const { data, error } = await client.from(table).select("id").limit(5);
      expect(error?.code, `${table} lisible en aal1 : la double authentification ne tient qu'à l'écran`).toBe("42501");
      expect(data).toBeNull();
    }

    // La MÊME commande, lue par la session aal2 : le refus ci-dessus n'est pas un vide.
    const { data: vue } = await protege.client.from("orders").select("id").eq("id", commandeId);
    expect(vue ?? []).toHaveLength(1);
  }, 60_000);

  test("n'appelle AUCUNE fonction — la RLS ne protège pas les security definer, le crochet si", async () => {
    const client = await sessionAal1(protege);
    const { error } = await client.rpc("lister_mes_sessions");
    expect(error?.code).toBe("42501");
  }, 60_000);

  test("n'écrit rien non plus", async () => {
    const client = await sessionAal1(protege);
    const { error } = await client
      .from("orders")
      .update({ customer_label: "Modifié en aal1" })
      .eq("id", commandeId);
    expect(error?.code).toBe("42501");
    const { data } = await protege.client.from("orders").select("customer_label").eq("id", commandeId).single();
    expect(data?.customer_label).toBe("Client témoin 2FA");
  }, 60_000);

  test("retrouve tout après avoir saisi son code", async () => {
    const client = await sessionAal1(protege);
    const { data: facteurs } = await client.auth.mfa.listFactors();
    const facteur = facteurs?.totp[0];
    expect(facteur, "le facteur vérifié doit être listé").toBeDefined();
    const { error } = await client.auth.mfa.challengeAndVerify({
      factorId: facteur?.id ?? "",
      code: codeTotp(secret),
    });
    expect(error).toBeNull();
    const { data, error: eLecture } = await client.from("orders").select("id").eq("id", commandeId);
    expect(eLecture).toBeNull();
    expect(data ?? []).toHaveLength(1);
  }, 60_000);

  test("un code FAUX ne donne rien", async () => {
    const client = await sessionAal1(protege);
    const { data: facteurs } = await client.auth.mfa.listFactors();
    const juste = codeTotp(secret);
    const faux = String((Number(juste) + 500_000) % 1_000_000).padStart(6, "0");
    const { error } = await client.auth.mfa.challengeAndVerify({ factorId: facteurs?.totp[0]?.id ?? "", code: faux });
    expect(error).not.toBeNull();
    const { error: eLecture } = await client.from("orders").select("id").limit(1);
    expect(eLecture?.code).toBe("42501");
  }, 60_000);
});

describe("Contre-tests : ce que le crochet doit laisser passer", () => {
  test("un compte SANS facteur, en aal1, lit ses données", async () => {
    const client = await sessionAal1(ordinaire);
    const { error } = await client.from("profiles").select("id").limit(1);
    expect(error).toBeNull();
    const { error: eRpc } = await client.rpc("lister_mes_sessions");
    expect(eRpc).toBeNull();
  }, 60_000);

  test("un anonyme atteint toujours la lecture publique", async () => {
    const { error } = await clientAnonyme().rpc("lire_commande_publique", { p_jeton: "jeton-inexistant-2fa-0000" });
    expect(error).toBeNull();
  }, 60_000);

  test("lister_mes_facteurs rend le facteur vérifié du compte, et celui-là seul", async () => {
    const { data, error } = await protege.client.rpc("lister_mes_facteurs");
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(1);
    expect(Object.keys((data ?? [])[0] ?? {}).sort()).toEqual(["cree_le", "id"]);

    const { data: autre } = await ordinaire.client.rpc("lister_mes_facteurs");
    expect(autre ?? []).toHaveLength(0);
  }, 60_000);
});
