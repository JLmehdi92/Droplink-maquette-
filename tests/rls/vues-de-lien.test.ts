import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import {
  clientAnonyme,
  clientService,
  creerUtilisateur,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";

/**
 * LE COMPTAGE DES VUES — ce que cette suite établit.
 *
 * « Vues de lien par commande > 3 » est une MÉTRIQUE DE VERDICT : c'est elle
 * qui dira si le destinataire revient, donc si le produit sert à quelque chose.
 * Une métrique légèrement faussée est pire qu'une métrique cassée, parce qu'elle
 * reste crédible — et celle-ci ne peut se fausser que dans un seul sens, le
 * rassurant : chaque défaut imaginable ici AJOUTE des vues.
 *
 * D'où l'ordre des contrôles : d'abord prouver qu'une vue s'enregistre (un
 * ensemble vide passe tout), ensuite seulement prouver ce qui ne doit PAS en
 * produire.
 */

let alice: UtilisateurDeTest;
let bob: UtilisateurDeTest;
let catalogue: Client;
let commande: string;
let jeton: string;

/** Deux visiteurs distincts, deux empreintes distinctes. */
const IP_A = "vue-ip-a-1f4c";
const IP_B = "vue-ip-b-9d02";
const AGENT = "vue-agent-7b31";

async function enregistrer(
  jetonAppele: string,
  ip: string,
  agent: string,
  profil = "",
): Promise<boolean> {
  const lignes = await interroger<{ ok: boolean }>(
    catalogue,
    "select public.enregistrer_vue($1, $2, $3, $4, $5) as ok",
    [jetonAppele, ip, agent, "", profil],
  );
  return lignes[0]?.ok === true;
}

async function compterVues(): Promise<number> {
  const lignes = await interroger<{ n: string }>(
    catalogue,
    "select count(*)::text as n from public.link_views where order_id = $1",
    [commande],
  );
  return Number.parseInt(lignes[0]?.n ?? "0", 10);
}

beforeAll(async () => {
  catalogue = await ouvrirConnexionCatalogue();
  alice = await creerUtilisateur("vue-alice");
  bob = await creerUtilisateur("vue-bob");

  const { data, error } = await alice.client
    .from("orders")
    .insert({ shop_id: alice.shopId, customer_label: "Yanis" })
    .select("id, public_token")
    .single();

  expect(error, `création impossible : ${error?.message}`).toBeNull();
  commande = (data as { id: string }).id;
  jeton = (data as { public_token: string }).public_token;
}, 90_000);

afterAll(async () => {
  await supprimerUtilisateur(alice);
  await supprimerUtilisateur(bob);
  await catalogue.end();
});

describe("Ce qui compte comme une vue", () => {
  test("une première consultation enregistre UNE ligne", async () => {
    // Le contre-test positif d'abord : sans lui, tout ce qui suit passerait sur
    // une fonction qui ne fait jamais rien.
    expect(await enregistrer(jeton, IP_A, AGENT)).toBe(true);
    expect(await compterVues()).toBe(1);
  });

  test("la même personne le même jour ne compte pas deux fois", async () => {
    expect(await enregistrer(jeton, IP_A, AGENT)).toBe(false);
    expect(await enregistrer(jeton, IP_A, AGENT)).toBe(false);
    expect(await compterVues(), "un client qui remonte sa conversation n'a pas reconsulté").toBe(1);
  });

  test("un AUTRE visiteur le même jour compte, lui", async () => {
    // Sans ce contre-test, « tout est dédupliqué » — c'est-à-dire un produit qui
    // ne compte jamais rien — passerait la suite à 100 %.
    expect(await enregistrer(jeton, IP_B, AGENT)).toBe(true);
    expect(await compterVues()).toBe(2);
  });

  test("un autre agent depuis la même adresse compte aussi", async () => {
    expect(await enregistrer(jeton, IP_A, "vue-agent-autre")).toBe(true);
    expect(await compterVues()).toBe(3);
  });

  test("`viewed_on` est GÉNÉRÉE, donc l'appelant ne peut pas la faire diverger", async () => {
    const lignes = await interroger<{ genere: string | null }>(
      catalogue,
      `select a.attgenerated as genere
       from pg_attribute a
       join pg_class c on c.oid = a.attrelid
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'link_views' and a.attname = 'viewed_on'`,
    );
    expect(lignes, "colonne viewed_on absente : la sonde vise à côté").toHaveLength(1);
    expect(
      lignes[0]?.genere,
      "Une colonne de déduplication fournie par l'appelant est une colonne " +
        "qu'un appelant peut faire diverger.",
    ).toBe("s");
  });
});

describe("Ce qui NE compte PAS", () => {
  test("le vendeur qui ouvre sa propre page est exclu", async () => {
    const avant = await compterVues();
    // Une adresse et un agent jamais vus : si l'exclusion ne fonctionnait pas,
    // la ligne serait créée, aucune déduplication ne la retiendrait.
    expect(await enregistrer(jeton, "vue-ip-vendeur", "vue-agent-vendeur", alice.profilId)).toBe(
      false,
    );
    expect(await compterVues()).toBe(avant);
  });

  test("mais un AUTRE vendeur connecté compte comme un visiteur", async () => {
    // Le contre-test de l'exclusion : sans lui, « exclure tout profil connecté »
    // — donc ne jamais rien compter dès qu'un cookie traîne — passerait.
    const avant = await compterVues();
    expect(await enregistrer(jeton, "vue-ip-bob", "vue-agent-bob", bob.profilId)).toBe(true);
    expect(await compterVues()).toBe(avant + 1);
  });

  test("un jeton inconnu n'enregistre rien", async () => {
    const avant = await compterVues();
    expect(await enregistrer("jeton-qui-nexiste-pas", "vue-ip-x", "vue-agent-x")).toBe(false);
    expect(await compterVues()).toBe(avant);
  });

  /**
   * LA COUPURE DE SUSPENSION, ici aussi. Continuer à compter les vues d'un
   * compte suspendu laisserait croire à une audience sur une page qui ne répond
   * plus — et c'est le genre de chiffre qu'on ne remet pas en question.
   */
  test("un compte suspendu ne produit plus aucune vue", async () => {
    const service = clientService();
    await service.from("profiles").update({ status: "suspended" }).eq("id", alice.profilId);

    const avant = await compterVues();
    expect(await enregistrer(jeton, "vue-ip-pendant-suspension", "vue-agent-susp")).toBe(false);
    expect(await compterVues()).toBe(avant);

    await service.from("profiles").update({ status: "active" }).eq("id", alice.profilId);
    // Et la réactivation rétablit le comptage : sans cette moitié-là, une
    // fonction cassée passerait pour une suspension qui fonctionne.
    expect(await enregistrer(jeton, "vue-ip-apres-suspension", "vue-agent-susp")).toBe(true);
  });
});

describe("Qui peut écrire, qui peut lire", () => {
  test("`anon` ne peut ni exécuter la fonction ni toucher la table", async () => {
    const anonyme = clientAnonyme();

    const appel = await anonyme.rpc("enregistrer_vue", {
      p_jeton: jeton,
      p_ip_hash: "anon-ip",
      p_ua_hash: "anon-agent",
      p_pays: "",
      p_profil: "",
    });
    expect(
      appel.error,
      "anon a pu enregistrer une vue : la métrique est falsifiable",
    ).not.toBeNull();

    const lecture = await anonyme.from("link_views").select("*").limit(1);
    const vide = lecture.error !== null || (lecture.data ?? []).length === 0;
    expect(vide, "anon a pu lire les vues").toBe(true);
  });

  test("le droit d'exécution est retiré DANS LE CATALOGUE, pas seulement dans le corps", async () => {
    // Un droit d'exécution ne s'écrit pas dans le corps d'une fonction : aucune
    // relecture de code ne peut le voir, il faut interroger le catalogue.
    const lignes = await interroger<{ beneficiaire: string }>(
      catalogue,
      `select coalesce(a.grantee::regrole::text, 'PUBLIC') as beneficiaire
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace,
            aclexplode(p.proacl) a
       where n.nspname = 'public' and p.proname = 'enregistrer_vue'
         and a.privilege_type = 'EXECUTE'`,
    );
    const ouverts = lignes
      .map((l) => l.beneficiaire)
      .filter((r) => r === "PUBLIC" || r === "anon" || r === "authenticated");
    expect(ouverts, "la fonction d'écriture des vues est exécutable trop largement").toEqual([]);
  });

  test("un vendeur ne lit QUE les vues de ses propres commandes", async () => {
    const sienne = await alice.client.from("link_views").select("id").eq("order_id", commande);
    expect(sienne.error).toBeNull();
    expect(
      (sienne.data ?? []).length,
      "le vendeur ne voit pas ses propres vues : la sonde n'inspecte rien",
    ).toBeGreaterThan(0);

    const autre = await bob.client.from("link_views").select("id").eq("order_id", commande);
    expect((autre.data ?? []).length, "un vendeur lit les vues d'un autre").toBe(0);
  });

  test("un vendeur ne peut pas écrire de vues, même sur ses propres commandes", async () => {
    // Un vendeur qui peut s'ajouter des vues peut se fabriquer une preuve
    // d'usage — sur un produit dont le livrable EST la donnée d'usage.
    const { error } = await alice.client
      .from("link_views")
      .insert({ order_id: commande, ip_hash: "forge", user_agent_hash: "forge" });
    expect(error, "un vendeur a pu s'ajouter une vue").not.toBeNull();
  });
});
