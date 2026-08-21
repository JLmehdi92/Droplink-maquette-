import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import {
  creerUtilisateur,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";
import { definitionDe, ecrireParametre, lireParametres, PARAMETRES } from "@/lib/audit/parametres";
import { lireSeuils } from "@/lib/audit/panneau";

/**
 * LES PARAMÈTRES SYSTÈME.
 *
 * Trois propriétés portent tout le reste :
 *
 *  1. L'INVENTAIRE EST CLOS. Une clé hors inventaire est refusée AVANT
 *     l'écriture. Sans ce contrôle, une clé forgée créerait une ligne que rien
 *     ne lit — avec sa trace, sa date et son auteur, donc parfaitement crédible.
 *     Une valeur qui a la FORME d'une configuration franchit toutes les
 *     validations de présence.
 *  2. LES BORNES SONT VÉRIFIÉES CÔTÉ SERVEUR. Un seuil à zéro signalerait tout
 *     le monde, et une alerte qui part toujours est une alerte qu'on apprend à
 *     ignorer.
 *  3. UNE CLÉ ABSENTE SIGNIFIE « JAMAIS DÉCIDÉ », pas « décidé au défaut ».
 *     Même chiffre, situations opposées.
 */

let admin: UtilisateurDeTest;
let vendeur: UtilisateurDeTest;
let catalogue: Client;

const CLE = "seuil_colis_par_compte";

beforeAll(async () => {
  catalogue = await ouvrirConnexionCatalogue();
  admin = await creerUtilisateur("param-admin");
  vendeur = await creerUtilisateur("param-vendeur");
  await interroger(catalogue, "update public.profiles set role = 'admin' where id = $1", [
    admin.profilId,
  ]);
}, 120_000);

afterAll(async () => {
  await supprimerUtilisateur(admin);
  await supprimerUtilisateur(vendeur);
  await catalogue.end();
});

beforeEach(async () => {
  await interroger(catalogue, "delete from public.system_settings");
});

describe("Qui peut lire les paramètres", () => {
  test("un vendeur est REFUSÉ, il n'obtient pas une liste vide", async () => {
    // LE POINT CENTRAL DE CE CONTRÔLE. Un ensemble vide serait indiscernable de
    // « aucun paramètre n'a jamais été écrit », qui est l'état NORMAL du
    // produit : l'appelant sans droits lirait donc les défauts en croyant lire
    // la configuration, et le refus serait invisible.
    await expect(lireParametres(vendeur.client)).rejects.toThrow(/impossible/i);
  });

  test("contre-test positif : l'administrateur lit l'inventaire complet", async () => {
    const lus = await lireParametres(admin.client);
    // La sonde rend TOUT l'inventaire, y compris les clés jamais écrites : sans
    // cela, un réglage oublié disparaîtrait de l'écran sans que rien ne le dise.
    expect(lus.map((p) => p.cle).sort()).toEqual(PARAMETRES.map((p) => p.cle).sort());
  });
});

describe("Une clé absente n'a JAMAIS été décidée", () => {
  test("sans ligne : la valeur est le défaut, et l'écran sait que c'est un défaut", async () => {
    const p = (await lireParametres(admin.client)).find((x) => x.cle === CLE);

    expect(p?.ecrit, "un défaut est présenté comme une valeur décidée").toBe(false);
    expect(p?.valeur).toBe(definitionDe(CLE)?.defaut);
    expect(p?.modifieLe).toBeNull();
    expect(p?.modifiePar).toBeNull();
  });

  test("après écriture : la même valeur, mais DÉCIDÉE, avec son auteur", async () => {
    // Contre-test du précédent : sans lui, une fonction qui rendrait toujours
    // `ecrit: false` passerait le test ci-dessus sans rien prouver. Et la valeur
    // choisie est EXACTEMENT le défaut, pour que seul l'état les distingue.
    const defaut = definitionDe(CLE)?.defaut ?? 0;
    expect(await ecrireParametre(admin.client, CLE, defaut)).toEqual({ statut: "ok", cle: CLE });

    const p = (await lireParametres(admin.client)).find((x) => x.cle === CLE);
    expect(p?.valeur, "la valeur écrite diffère de celle relue").toBe(defaut);
    expect(p?.ecrit, "une valeur écrite est présentée comme un défaut").toBe(true);
    expect(p?.modifiePar).toBe(admin.email);
    expect(p?.modifieLe).not.toBeNull();
  });
});

describe("L'inventaire est CLOS", () => {
  test("une clé hors inventaire est refusée, et AUCUNE ligne n'est créée", async () => {
    const resultat = await ecrireParametre(admin.client, "seuil_colis", 5);
    expect(resultat).toEqual({ statut: "erreur", motif: "cle" });

    // Le refus ne suffit pas : ce qui compte est qu'aucune ligne crédible ne
    // subsiste en base. Une ligne écrite puis « refusée » à l'affichage serait
    // pire que rien — elle porterait une trace d'audit véridique.
    const lignes = await interroger<{ n: string }>(
      catalogue,
      "select count(*) as n from public.system_settings",
    );
    expect(Number(lignes[0]?.n), "une clé inconnue a laissé une ligne en base").toBe(0);
  });

  test("contre-test positif : chaque clé de l'inventaire, elle, est acceptée", async () => {
    // Sans lui, une fonction qui refuserait TOUT passerait le test précédent.
    // Et le parcours est exhaustif : il ne dépend pas de la clé à laquelle
    // l'auteur du test a pensé.
    for (const p of PARAMETRES) {
      expect(
        await ecrireParametre(admin.client, p.cle, p.defaut),
        `clé de l'inventaire refusée : ${p.cle}`,
      ).toEqual({ statut: "ok", cle: p.cle });
    }
  });
});

describe("Les bornes sont vérifiées côté serveur", () => {
  test("chaque paramètre refuse en dessous de son minimum et au-dessus de son maximum", async () => {
    for (const p of PARAMETRES) {
      expect(
        await ecrireParametre(admin.client, p.cle, p.min - 1),
        `minimum non tenu : ${p.cle}`,
      ).toEqual({ statut: "erreur", motif: "bornes" });
      expect(
        await ecrireParametre(admin.client, p.cle, p.max + 1),
        `maximum non tenu : ${p.cle}`,
      ).toEqual({ statut: "erreur", motif: "bornes" });
    }

    const lignes = await interroger<{ n: string }>(
      catalogue,
      "select count(*) as n from public.system_settings",
    );
    expect(Number(lignes[0]?.n), "une valeur hors bornes a été écrite").toBe(0);
  });

  test("contre-test positif : les bornes elles-mêmes sont acceptées", async () => {
    for (const p of PARAMETRES) {
      expect(await ecrireParametre(admin.client, p.cle, p.min), `minimum refusé : ${p.cle}`).toEqual(
        { statut: "ok", cle: p.cle },
      );
      expect(await ecrireParametre(admin.client, p.cle, p.max), `maximum refusé : ${p.cle}`).toEqual(
        { statut: "ok", cle: p.cle },
      );
    }
  });

  test("une valeur non entière est refusée", async () => {
    expect(await ecrireParametre(admin.client, CLE, 12.5)).toEqual({
      statut: "erreur",
      motif: "bornes",
    });
  });
});

describe("Un vendeur ne modifie rien, quoi qu'il envoie", () => {
  test("l'écriture est refusée EN BASE, pas seulement par notre module", async () => {
    // On n'appelle pas `ecrireParametre` : personne d'hostile n'appelle notre
    // module TypeScript. On appelle PostgREST, comme le ferait une requête
    // forgée qui n'a jamais affiché l'écran.
    const { error } = await vendeur.client.rpc("ecrire_parametre", {
      p_cle: CLE,
      p_valeur: 999_999,
    });
    expect(error, "un vendeur a modifié un seuil du produit").not.toBeNull();

    const lignes = await interroger<{ n: string }>(
      catalogue,
      "select count(*) as n from public.system_settings",
    );
    expect(Number(lignes[0]?.n)).toBe(0);
  });

  test("la lecture de l'inventaire lui est refusée EN BASE", async () => {
    const { error } = await vendeur.client.rpc("lister_parametres");
    expect(error, "un vendeur a lu la configuration du produit").not.toBeNull();
  });
});

describe("Ce que l'écran affiche est ce que le produit applique", () => {
  test("une valeur écrite hors bornes est AFFICHÉE telle quelle, pas corrigée en silence", async () => {
    // Elle ne peut pas venir de l'écran — mais elle peut venir d'un script de
    // maintenance ou d'une migration. La corriger à l'affichage montrerait autre
    // chose que ce que le panneau applique réellement, et l'écart serait
    // invisible exactement au moment où on le cherche.
    await interroger(catalogue, "insert into public.system_settings (key, value) values ($1, $2)", [
      CLE,
      "0",
    ]);

    const p = (await lireParametres(admin.client)).find((x) => x.cle === CLE);
    expect(p?.valeur, "une valeur hors bornes a été maquillée à l'affichage").toBe(0);
    expect(p?.ecrit).toBe(true);

    // Et le panneau lit bien la même chose : les deux écrans ne peuvent pas se
    // contredire.
    expect((await lireSeuils(admin.client)).colis).toBe(0);
  });

  test("le seuil écrit est celui que le panneau lit", async () => {
    await ecrireParametre(admin.client, CLE, 33);
    expect((await lireSeuils(admin.client)).colis).toBe(33);
  });
});
