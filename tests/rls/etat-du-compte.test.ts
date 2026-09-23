import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { promouvoirAdmin } from "../aide/admin";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import {
  clientAnonyme,
  creerUtilisateur,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";
import { lireEtatDuCompteAvec, lireProfilAvec } from "@/lib/comptes/profil";

/**
 * L'ÉTAT DU COMPTE, LU POUR DE VRAI — 23/09/2026.
 *
 * `lireProfilVendeur` est substitué dans presque toutes les suites : c'est
 * normal, il lit un cookie. Mais le travail qu'il délègue — `lireEtatDuCompteAvec`
 * — n'était appelé par AUCUN test, alors qu'il décide de ce que TOUTES les pages
 * vendeur voient : qui est connecté, s'il est suspendu, s'il est Pro, quelle est
 * sa boutique. Il prend le client en argument : il se teste donc sur la vraie
 * base, sous la vraie session.
 */

type ClientServeur = Parameters<typeof lireEtatDuCompteAvec>[0];

let vendeur: UtilisateurDeTest;
let voisin: UtilisateurDeTest;
let admin: UtilisateurDeTest;
let catalogue: Client;

beforeAll(async () => {
  catalogue = await ouvrirConnexionCatalogue();
  vendeur = await creerUtilisateur("etat-vendeur");
  voisin = await creerUtilisateur("etat-voisin");
  admin = await creerUtilisateur("etat-admin");
  await promouvoirAdmin(catalogue, admin);
}, 90_000);

afterAll(async () => {
  await interroger(catalogue, "update public.profiles set role = 'user' where id = $1", [admin.profilId]);
  await supprimerUtilisateur(vendeur);
  await supprimerUtilisateur(voisin);
  await supprimerUtilisateur(admin);
  await catalogue.end();
}, 60_000);

describe("L'état du compte", () => {
  test("CONTRE-TEST : le vendeur lit SON profil et SA boutique", async () => {
    const p = await lireProfilAvec(vendeur.client as ClientServeur);
    expect(p?.profilId).toBe(vendeur.profilId);
    expect(p?.shopId).toBe(vendeur.shopId);
    expect(p?.email).toBe(vendeur.email);
    expect(p?.statut).toBe("active");
  });

  test("⚠️ UN ADMINISTRATEUR LIT LE SIEN, PAS « AUCUN »", async () => {
    /*
     * La lecture est un `maybeSingle()` sur `profiles`. Si une policy laissait un
     * administrateur lire PLUSIEURS profils, `maybeSingle` échouerait — et
     * l'administrateur serait traité comme déconnecté sur tout l'espace vendeur,
     * sans une erreur visible.
     */
    const e = await lireEtatDuCompteAvec(admin.client as ClientServeur);
    expect(e.etat).toBe("profil");
    expect(e.etat === "profil" ? e.profil.profilId : "").toBe(admin.profilId);
  });

  test("⚠️ UN COMPTE SUSPENDU EST LU SUSPENDU — c'est ce qui coupe toutes ses pages", async () => {
    await interroger(catalogue, "update public.profiles set status = 'suspended' where id = $1", [vendeur.profilId]);
    try {
      expect((await lireProfilAvec(vendeur.client as ClientServeur))?.statut).toBe("suspended");
    } finally {
      await interroger(catalogue, "update public.profiles set status = 'active' where id = $1", [vendeur.profilId]);
    }
  });

  test("le plan Pro posé en base est lu Pro", async () => {
    await interroger(catalogue, "update public.profiles set plan = 'pro' where id = $1", [vendeur.profilId]);
    try {
      expect((await lireProfilAvec(vendeur.client as ClientServeur))?.planPro).toBe(true);
    } finally {
      await interroger(catalogue, "update public.profiles set plan = 'gratuit' where id = $1", [vendeur.profilId]);
    }
    expect((await lireProfilAvec(vendeur.client as ClientServeur))?.planPro).toBe(false);
  });

  test("deux vendeurs ne lisent jamais le profil l'un de l'autre", async () => {
    expect((await lireProfilAvec(voisin.client as ClientServeur))?.profilId).toBe(voisin.profilId);
    expect((await lireProfilAvec(vendeur.client as ClientServeur))?.shopId).not.toBe(voisin.shopId);
  });

  test("sans session, « aucun »", async () => {
    expect((await lireEtatDuCompteAvec(clientAnonyme() as ClientServeur)).etat).toBe("aucun");
  });

  test("⚠️ UNE PANNE DE TRANSPORT N'EST PAS UNE DÉCONNEXION", async () => {
    // Confondre les deux renverrait un vendeur à la page de connexion à chaque
    // coupure réseau vers l'authentification — et il croirait avoir été déconnecté.
    const enPanne = {
      auth: { getUser: async () => ({ data: { user: null }, error: { message: "fetch failed" } }) },
      from: () => ({ select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    } as unknown as ClientServeur;
    await expect(lireEtatDuCompteAvec(enPanne)).rejects.toThrow(/injoignable/);
  });
});
