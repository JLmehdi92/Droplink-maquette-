import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { ouvrirConnexionCatalogue } from "../aide/base";
import { creerUtilisateur, supprimerUtilisateur, type UtilisateurDeTest } from "../aide/utilisateurs";

/**
 * `arreter_suivi` — QUAND LE FOURNISSEUR ANNONCE QU'IL CESSE DE REGARDER.
 *
 * ⚠️ 17TRACK POUSSE DEUX ÉVÉNEMENTS, et nous n'en lisions qu'un.
 * `TRACKING_STOPPED` n'était détecté qu'indirectement, par l'absence d'état —
 * or rien ne l'oblige à venir vide : ils cessent de suivre quinze jours APRÈS
 * une livraison, donc avec un état complet. Il passait pour une mise à jour
 * ordinaire, la cadence continuait d'interroger un numéro que plus personne ne
 * suit, et le silence affiché au client était imputé au TRANSPORTEUR alors que
 * c'est la SOURCE qui s'était tue.
 *
 * Ce que cette suite établit, et qu'aucune relecture ne peut établir :
 *   1. la fonction ferme bien le suivi, par NUMÉRO ;
 *   2. elle N'ÉCRASE JAMAIS un abandon déjà posé — sans quoi un rejeu
 *      repousserait l'ancienneté affichée au client ;
 *   3. elle rend le nombre de lignes touchées, pour que l'appelant distingue
 *      « déjà fermé » de « numéro inconnu » ;
 *   4. elle reste hors de portée d'`anon` et d'`authenticated`.
 */

let bd: Client;
let alice: UtilisateurDeTest;

const NUMERO = "ARRET-TEST-000000001";

beforeAll(async () => {
  bd = await ouvrirConnexionCatalogue();
  alice = await creerUtilisateur("arret-alice");
});

afterAll(async () => {
  await bd.query("delete from public.tracked_parcels where tracking_number like 'ARRET-TEST-%'");
  await supprimerUtilisateur(alice);
  await bd.end();
});

/** Repose un colis actif, propre, avant chaque scénario. */
async function poserUnColisActif(): Promise<void> {
  await bd.query("delete from public.tracked_parcels where tracking_number = $1", [NUMERO]);
  await bd.query("insert into public.tracked_parcels (shop_id, tracking_number) values ($1, $2)", [
    alice.shopId,
    NUMERO,
  ]);
}

/**
 * L'INSTANT d'abandon en millisecondes, jamais l'objet `Date`.
 *
 * `pg` rend un `Date`, et deux `Date` distincts portant le même instant ne sont
 * jamais `Object.is`-égaux : la comparaison échouerait pour une raison qui n'a
 * rien à voir avec ce qu'on éprouve. On compare la VALEUR.
 */
async function abandonDe(): Promise<number | null> {
  const { rows } = await bd.query<{ a: Date | null }>(
    "select abandoned_at as a from public.tracked_parcels where tracking_number = $1",
    [NUMERO],
  );
  const brut = rows[0]?.a ?? null;
  return brut === null ? null : new Date(brut).getTime();
}

describe("arreter_suivi — ce qu'elle ferme", () => {
  test("CONTRE-TEST : un colis neuf n'est PAS abandonné", async () => {
    // Sans lui, une fonction qui ne ferait rien passerait le test suivant, et
    // une base où tout serait déjà abandonné le passerait aussi.
    await poserUnColisActif();
    expect(await abandonDe(), "un colis neuf ne doit pas naître abandonné").toBeNull();
  });

  test("elle ferme le suivi, et rend le nombre de lignes touchées", async () => {
    await poserUnColisActif();
    const { rows } = await bd.query<{ n: number }>("select public.arreter_suivi($1, $2) as n", [
      NUMERO,
      "suivi-arrete-par-le-fournisseur",
    ]);
    expect(rows[0]?.n, "aucune ligne touchée : la sélection par numéro ne vise rien").toBe(1);
    expect(await abandonDe()).not.toBeNull();
  });

  test("le MOTIF est conservé, pour qu'on sache POURQUOI le suivi s'est arrêté", async () => {
    await poserUnColisActif();
    await bd.query("select public.arreter_suivi($1, $2)", [NUMERO, "suivi-arrete-par-le-fournisseur"]);
    const { rows } = await bd.query<{ s: string | null }>(
      "select raw_status as s from public.tracked_parcels where tracking_number = $1",
      [NUMERO],
    );
    expect(rows[0]?.s).toBe("suivi-arrete-par-le-fournisseur");
  });

  test("⚠️ UN REJEU NE REPOUSSE PAS LA DATE D'ABANDON", async () => {
    /*
     * LA PROPRIÉTÉ QUI COMPTE LE PLUS ICI, et la plus facile à casser sans s'en
     * apercevoir. Le fournisseur réémet ses notifications ; si chaque renvoi
     * réécrivait `abandoned_at`, l'ancienneté affichée au client d'un vendeur
     * repartirait de zéro à chaque fois — et le « silence nommé au-delà de dix
     * jours » ne se déclencherait JAMAIS.
     */
    await poserUnColisActif();
    await bd.query("select public.arreter_suivi($1, $2)", [NUMERO, "premier"]);
    // On recule l'abandon de trente jours, comme si la notification était ancienne.
    await bd.query(
      "update public.tracked_parcels set abandoned_at = now() - interval '30 days' where tracking_number = $1",
      [NUMERO],
    );
    const avant = await abandonDe();

    const { rows } = await bd.query<{ n: number }>("select public.arreter_suivi($1, $2) as n", [
      NUMERO,
      "rejeu",
    ]);

    expect(rows[0]?.n, "un rejeu ne doit toucher aucune ligne").toBe(0);
    expect(await abandonDe(), "la date d'abandon a été repoussée par un rejeu").toBe(avant);
  });

  test("un numéro INCONNU rend zéro, sans lever", async () => {
    // Zéro est un état légitime, pas une erreur : l'appelant le journalise.
    const { rows } = await bd.query<{ n: number }>("select public.arreter_suivi($1, $2) as n", [
      "ARRET-TEST-NUMERO-QUI-N-EXISTE-PAS",
      "peu-importe",
    ]);
    expect(rows[0]?.n).toBe(0);
  });
});

describe("arreter_suivi — qui a le droit de l'appeler", () => {
  test("ni `anon` ni `authenticated`, et `service_role` OUI", async () => {
    /*
     * ⚠️ UN DROIT D'EXÉCUTION NE S'ÉCRIT PAS DANS LE CORPS D'UNE FONCTION : il
     * faut interroger le catalogue (L-027, L-028). Et Postgres accorde `EXECUTE`
     * à `PUBLIC` par défaut — l'oubli d'un `revoke` ne produit aucune erreur,
     * juste une porte. Ici la porte donnerait le droit d'ÉTEINDRE le suivi des
     * colis de n'importe quel vendeur.
     */
    const ouvertes: string[] = [];
    for (const role of ["anon", "authenticated", "public"]) {
      const { rows } = await bd.query<{ d: boolean }>(
        "select has_function_privilege($1, 'public.arreter_suivi(text, text)', 'EXECUTE') as d",
        [role],
      );
      if (rows[0]?.d === true) ouvertes.push(role);
    }
    expect(ouvertes, `arreter_suivi exécutable par : ${ouvertes.join(", ")}`).toEqual([]);

    // Contre-test positif : un `revoke` trop large passerait le contrôle
    // ci-dessus à 100 % en cassant le produit.
    const { rows } = await bd.query<{ d: boolean }>(
      "select has_function_privilege('service_role', 'public.arreter_suivi(text, text)', 'EXECUTE') as d",
    );
    expect(rows[0]?.d, "le rôle système ne peut plus fermer un suivi").toBe(true);
  });
});
