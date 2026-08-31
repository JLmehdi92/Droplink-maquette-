import { createHash } from "node:crypto";
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

/*
 * Deux visiteurs distincts, deux empreintes distinctes.
 *
 * ELLES ONT LA FORME RÉELLE de ce que `empreinte()` produit — trente-deux
 * caractères hexadécimaux — parce que la base l'exige désormais. Elle ne
 * l'exigeait pas : `''`, `'x'` et `'vue-ip-a-1f4c'` étaient acceptés, et la clé
 * de déduplication d'une métrique de VERDICT reposait dessus. Les valeurs
 * lisibles employées ici jusque-là étaient donc du même genre que le défaut.
 */
const IP_A = "a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1";
const IP_B = "b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2";
const AGENT = "c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3";

/**
 * Une empreinte de test AU FORMAT RÉEL, dérivée d'un libellé lisible.
 *
 * Les contrôles employaient jusqu'ici des chaînes lisibles telles quelles
 * (`"vue-ip-a"`), ce que la base acceptait. Elle ne l'accepte plus : la clé de
 * déduplication est la DÉFINITION de « vues par lien », une métrique de verdict,
 * et une valeur qui n'a pas la forme d'une empreinte n'en est pas une.
 *
 * Le libellé reste donc à l'écriture — un test doit se lire — mais ce qui part
 * en base est ce que `empreinte()` produirait.
 */
function emp(libelle: string): string {
  return createHash("sha256").update(libelle).digest("hex").slice(0, 32);
}

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
    expect(await enregistrer(jeton, IP_A, emp("vue-agent-autre"))).toBe(true);
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
    expect(await enregistrer(jeton, emp("vue-ip-vendeur"), emp("vue-agent-vendeur"), alice.profilId)).toBe(
      false,
    );
    expect(await compterVues()).toBe(avant);
  });

  test("mais un AUTRE vendeur connecté compte comme un visiteur", async () => {
    // Le contre-test de l'exclusion : sans lui, « exclure tout profil connecté »
    // — donc ne jamais rien compter dès qu'un cookie traîne — passerait.
    const avant = await compterVues();
    expect(await enregistrer(jeton, emp("vue-ip-bob"), emp("vue-agent-bob"), bob.profilId)).toBe(true);
    expect(await compterVues()).toBe(avant + 1);
  });

  test("un jeton inconnu n'enregistre rien", async () => {
    const avant = await compterVues();
    expect(await enregistrer("jeton-qui-nexiste-pas", emp("vue-ip-x"), emp("vue-agent-x"))).toBe(false);
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
    expect(await enregistrer(jeton, emp("vue-ip-pendant-suspension"), emp("vue-agent-susp"))).toBe(false);
    expect(await compterVues()).toBe(avant);

    await service.from("profiles").update({ status: "active" }).eq("id", alice.profilId);
    // Et la réactivation rétablit le comptage : sans cette moitié-là, une
    // fonction cassée passerait pour une suspension qui fonctionne.
    expect(await enregistrer(jeton, emp("vue-ip-apres-suspension"), emp("vue-agent-susp"))).toBe(true);
  });
});

/**
 * LE COMPTEUR DÉNORMALISÉ (027).
 *
 * Il existe parce que le tri « jamais ouvert » mesurait 500 ms et 48 001 lignes
 * lues dans son pire cas — un vendeur dont toutes les commandes ont été
 * ouvertes, c'est-à-dire un vendeur chez qui ça marche. Le tri portait sur une
 * ABSENCE, et rien ne s'indexe du côté d'une absence.
 *
 * Mais un compteur tenu par déclencheur est une SECONDE source de vérité, et une
 * seconde source ne se contente pas d'exister : elle doit dire la même chose que
 * la première. Un écart ne casserait rien — il produirait un tri qui ment au
 * vendeur sur ce que ses clients ont vu.
 */
describe("Le compteur porté par la commande", () => {
  async function compteur(): Promise<{ n: number; derniere: string | null }> {
    const lignes = await interroger<{ n: number; derniere: string | null }>(
      catalogue,
      "select views_count as n, last_viewed_at as derniere from public.orders where id = $1",
      [commande],
    );
    return { n: Number(lignes[0]?.n ?? -1), derniere: lignes[0]?.derniere ?? null };
  }

  test("il suit EXACTEMENT le nombre de lignes de vues", async () => {
    const reelles = await compterVues();
    const porte = await compteur();
    expect(porte.n, "le compteur a divergé des vues réelles").toBe(reelles);
    expect(reelles, "aucune vue : la sonde n'inspecte rien").toBeGreaterThan(0);
  });

  test("une vue de plus l'incrémente, une vue dédupliquée NON", async () => {
    const avant = (await compteur()).n;

    expect(await enregistrer(jeton, emp("vue-ip-compteur"), emp("vue-agent-compteur"))).toBe(true);
    expect((await compteur()).n, "le déclencheur n'a pas compté").toBe(avant + 1);

    // Le même visiteur le même jour : aucune ligne, donc aucun incrément. Sans
    // ce contre-test, un compteur incrémenté à chaque APPEL — et non à chaque
    // ligne — passerait le test précédent.
    expect(await enregistrer(jeton, emp("vue-ip-compteur"), emp("vue-agent-compteur"))).toBe(false);
    expect((await compteur()).n, "une consultation dédupliquée a été comptée").toBe(avant + 1);
  });

  test("la date de dernière vue est renseignée", async () => {
    expect((await compteur()).derniere, "aucune date de dernière vue").not.toBeNull();
  });

  test("un vendeur ne peut pas écrire son propre compteur", async () => {
    // C'est une MESURE, pas une donnée du vendeur. La lui laisser écrire
    // reviendrait à le laisser fabriquer sa preuve d'usage — sur un produit dont
    // le livrable EST la donnée d'usage.
    const avant = (await compteur()).n;
    const { error } = await alice.client
      .from("orders")
      .update({ views_count: 9999 })
      .eq("id", commande);
    expect(
      (await compteur()).n,
      `un vendeur a écrit son compteur (erreur : ${error?.message ?? "aucune"})`,
    ).toBe(avant);
  });
});

describe("Une empreinte doit en être une", () => {
  /*
   * MESURÉ AVANT CORRECTION : `enregistrer_vue` acceptait `''` et `'x'`, et
   * créait la ligne. Le refus existait — mais dans l'APPELANT, `vue.ts`, qui
   * renvoie « ignorée » quand l'adresse ou l'agent manque.
   *
   * C'est L-029 littéralement : la phrase juste était « ce serait faussé si
   * quelqu'un appelait cette fonction d'ailleurs », et rien dans la signature ne
   * l'aurait appris au prochain appelant.
   *
   * La forme, pas la présence : `'x'` n'est pas vide et franchissait donc toute
   * validation de présence. Valider la présence ne dit rien de la substitution.
   */
  test("des empreintes vides sont refusées", async () => {
    expect(await enregistrer(jeton, "", ""), "une vue sans empreinte a été comptée").toBe(false);
  });

  test("des empreintes hors format sont refusées", async () => {
    expect(await enregistrer(jeton, "x", "y"), "une vue à l'empreinte inventée a été comptée").toBe(
      false,
    );
    // Bon alphabet, mauvaise longueur — le cas qu'une simple vérification de
    // non-vacuité laisserait passer sans rien dire.
    expect(await enregistrer(jeton, "a1a1a1", "c3c3c3"), "une empreinte tronquée passe").toBe(false);
  });

  test("contre-test positif : une empreinte AU FORMAT est bien acceptée", async () => {
    // Une suite où tout est refusé passe à 100 % sans rien prouver. Sans ce
    // contrôle, une expression régulière qui refuserait TOUT serait verte.
    const inedite = "d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4";
    expect(await enregistrer(jeton, inedite, AGENT), "une empreinte légitime est refusée").toBe(
      true,
    );
  });
});

describe("Qui peut écrire, qui peut lire", () => {
  test("`anon` ne peut ni exécuter la fonction ni toucher la table", async () => {
    const anonyme = clientAnonyme();

    const appel = await anonyme.rpc("enregistrer_vue", {
      p_jeton: jeton,
      p_ip_hash: IP_A,
      p_ua_hash: AGENT,
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

  /**
   * UNE CONSULTATION N'EST PAS UNE MODIFICATION.
   *
   * ⚠️ DÉFAUT RÉEL, PROUVÉ PAR EXÉCUTION LE 31/08/2026, puis fermé par la
   * migration 120. `compter_vue()` émet un `update public.orders` pour
   * incrémenter `views_count` ; le déclencheur `orders_toucher_updated_at` le
   * voyait comme n'importe quelle écriture et posait `now()`.
   *
   * Chaque ouverture de lien par un client — dédupliquée par visiteur et par
   * jour, donc parfaitement normale — remontait la commande en tête du tri
   * « modifiées » du vendeur et lui affichait une date de modification qu'il
   * n'avait pas produite. La migration 090 avait écrit ce symptôme mot pour mot
   * en fermant le chemin du TRANSPORTEUR ; celui du CLIENT est né hors de son
   * champ de vision (L-025).
   *
   * LE CONTRE-TEST VIENT EN PREMIER, et il est indispensable : sans lui, un
   * déclencheur qui aurait cessé de compter les vues passerait ce test à 100 %.
   */
  test("la consultation d'un client ne déplace PAS updated_at, mais compte bien la vue", async () => {
    const avant = await interroger<{ maj: string; vues: number }>(
      catalogue,
      "select updated_at::text as maj, views_count as vues from public.orders where id = $1",
      [commande],
    );
    const majAvant = avant[0]?.maj;
    const vuesAvant = avant[0]?.vues ?? -1;
    expect(majAvant, "la commande de la sonde est introuvable").toBeDefined();

    const pose = await enregistrer(jeton, emp("maj-ip"), emp("maj-agent"));
    expect(pose, "la vue n'a pas été enregistrée : la sonde ne mesure rien").toBe(true);

    const apres = await interroger<{ maj: string; vues: number }>(
      catalogue,
      "select updated_at::text as maj, views_count as vues from public.orders where id = $1",
      [commande],
    );

    // CONTRE-TEST : le compteur a bien bougé. C'est ce qui distingue « la vue
    // ne modifie pas la commande » de « rien ne s'est passé ».
    expect(
      apres[0]?.vues,
      "le compteur de vues n'a pas bougé : le déclencheur ne s'exécute plus",
    ).toBe(vuesAvant + 1);

    expect(
      apres[0]?.maj,
      "la consultation d'un client a déplacé updated_at : le tri « modifiées » du vendeur se réordonne tout seul",
    ).toBe(majAvant);
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
