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
import { lireCommandePublique, signerMediaPlein } from "@/lib/page-publique/lecture";
import { revoquerLien, type ClientCycle } from "@/lib/commandes/cycle";

/**
 * LA PAGE PUBLIQUE — la surface que Wassim a désignée comme prioritaire.
 *
 * Le `public_token` ne transporte pas une donnée : il transporte une CAPACITÉ,
 * définitivement, puisqu'il est immuable à vie. Ce qui suit vérifie qu'il ne
 * donne accès qu'à ce qu'il doit, et qu'aucun autre chemin ne donne accès à ce
 * qu'il protège.
 */

let alice: UtilisateurDeTest;
let catalogue: Client;
let commande: string;
let jeton: string;

/** Sentinelle : cherchée PAR SA VALEUR, jamais par le nom de sa colonne. */
const NOTE_SECRETE = "prix-achat-publique-4c81ba90";

beforeAll(async () => {
  catalogue = await ouvrirConnexionCatalogue();
  alice = await creerUtilisateur("pub-alice");

  const { data, error } = await alice.client
    .from("orders")
    .insert({
      shop_id: alice.shopId,
      customer_label: "Yanis",
      product_ref: "Veste bleue M",
      tracking_number: "LX123456789FR",
      internal_notes: NOTE_SECRETE,
    })
    .select("id, public_token")
    .single();

  expect(error, `création impossible : ${error?.message}`).toBeNull();
  commande = (data as { id: string }).id;
  jeton = (data as { public_token: string }).public_token;

  await alice.client.from("order_media").insert({
    order_id: commande,
    type: "photo",
    cle: "medias/" + alice.shopId + "/" + commande + "/pub.jpg",
    taille_octets: 100,
    position: 0,
  });
}, 90_000);

afterAll(async () => {
  await supprimerUtilisateur(alice);
  await catalogue.end();
});

describe("Ce que le jeton donne", () => {
  test("la sonde inspecte réellement une commande", async () => {
    // Un ensemble vide passe tout : sans cette borne, « rien ne fuite » serait
    // vrai parce que rien n'est rendu.
    const page = await lireCommandePublique(jeton);
    expect(page).not.toBeNull();
    expect(page?.client).toBe("Yanis");
    expect(page?.medias.length).toBeGreaterThan(0);
  });

  /**
   * CONTRÔLE PAR VALEUR, PAS PAR NOM. Une valeur voyage sous n'importe quel
   * nom : `internal_notes` republié sous `meta`, `debug` ou `diagnostic`
   * survivrait à toute vérification portant sur le nom de la colonne.
   */
  test("les notes internes ne sortent JAMAIS, sous aucun nom", async () => {
    const page = await lireCommandePublique(jeton);
    expect(JSON.stringify(page)).not.toContain(NOTE_SECRETE);
  });

  test("contre-test positif : la sentinelle EST bien en base", async () => {
    const { data } = await alice.client
      .from("orders")
      .select("internal_notes")
      .eq("id", commande)
      .single();
    expect((data as { internal_notes: string }).internal_notes).toBe(NOTE_SECRETE);
  });

  test("le jeton de désabonnement ne sort pas : un jeton, un pouvoir", async () => {
    const { data } = await alice.client
      .from("orders")
      .select("unsubscribe_token")
      .eq("id", commande)
      .single();
    const desabonnement = (data as { unsubscribe_token: string }).unsubscribe_token;

    const page = await lireCommandePublique(jeton);
    expect(JSON.stringify(page)).not.toContain(desabonnement);
  });

  test("le jeton de désabonnement N'OUVRE PAS la page", async () => {
    const { data } = await alice.client
      .from("orders")
      .select("unsubscribe_token")
      .eq("id", commande)
      .single();
    const desabonnement = (data as { unsubscribe_token: string }).unsubscribe_token;

    expect(await lireCommandePublique(desabonnement)).toBeNull();
  });
});

describe("Aucune énumération", () => {
  /**
   * LE POINT LE PLUS IMPORTANT DE CETTE SUITE. Une VUE exposée à `anon` se lit
   * tout entière : `select *` rendrait toutes les commandes de tous les
   * vendeurs. C'est pour cela que la lecture publique est une FONCTION qui exige
   * le jeton — il n'y a rien à parcourir.
   */
  test("`anon` n'a aucun droit sur les tables du produit", async () => {
    const anonyme = clientAnonyme();

    for (const table of ["orders", "order_media", "shops", "profiles"] as const) {
      const { data, error } = await anonyme.from(table).select("*").limit(1);
      const vide = error !== null || (data ?? []).length === 0;
      expect(vide, `anon a pu lire ${table}`).toBe(true);
    }
  });

  test("aucune vue publique lisible par anon n'expose les commandes", async () => {
    // Interroger le CATALOGUE plutôt que relire le code : un droit ne s'écrit
    // pas dans le corps d'un objet, et aucune relecture ne peut le voir.
    const ouvertes = await interroger<{ nom: string }>(
      catalogue,
      `select c.relname as nom
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relkind in ('v', 'm')
         and has_table_privilege('anon', c.oid, 'SELECT')`,
    );

    expect(
      ouvertes.map((v) => v.nom),
      "Vues lisibles par anon : chacune se lit ENTIÈREMENT, donc énumère.",
    ).toEqual([]);
  });
});

describe("Un seul chemin de sortie", () => {
  test("jeton inconnu, jeton révoqué et compte suspendu rendent la MÊME chose", async () => {
    const inconnu = await lireCommandePublique("aaaaaaaaaaaaaaaaaaaaa");
    expect(inconnu).toBeNull();

    // Révoqué : l'ancien jeton cesse de fonctionner.
    const ancien = jeton;
    const revocation = await revoquerLien(
      alice.client as unknown as ClientCycle,
      alice.profilId,
      commande,
    );
    expect(revocation.statut).toBe("ok");
    if (revocation.statut !== "ok") return;

    expect(await lireCommandePublique(ancien)).toBeNull();
    // ... et le nouveau fonctionne : sans ce contre-test, « tout rend null »
    // passerait la suite sans rien prouver.
    expect(await lireCommandePublique(revocation.nouveauJeton)).not.toBeNull();

    jeton = revocation.nouveauJeton;
  });

  /**
   * LA COUPURE DE SUSPENSION. C'est la capacité technique qui fonde notre statut
   * d'hébergeur : sans elle, une procédure de notification et retrait n'a aucun
   * effet réel.
   */
  test("un compte suspendu cesse d'être servi, médias compris", async () => {
    const service = clientService();

    await service.from("profiles").update({ status: "suspended" }).eq("id", alice.profilId);
    expect(await lireCommandePublique(jeton), "la page répond encore").toBeNull();

    // Et les MÉDIAS aussi : une coupure à moitié faite est une coupure qui n'a
    // pas eu lieu.
    const { data: medias } = await alice.client
      .from("order_media")
      .select("id")
      .eq("order_id", commande)
      .limit(1)
      .single();
    const mediaId = (medias as { id: string }).id;
    expect(await signerMediaPlein(jeton, mediaId)).toBeNull();

    // Réactivation : les pages reviennent SUR LES MÊMES LIENS.
    await service.from("profiles").update({ status: "active" }).eq("id", alice.profilId);
    expect(await lireCommandePublique(jeton), "la réactivation n'a pas rétabli la page").not.toBeNull();
  });

  /**
   * UN ÉCART DE TEMPS EST UNE DIVULGATION. Si un jeton inconnu répondait
   * nettement plus vite qu'un jeton valide, le délai deviendrait un oracle : on
   * saurait qu'un jeton existe sans jamais voir son contenu.
   */
  test("le délai ne trahit pas l'existence d'un jeton", async () => {
    const mesurer = async (valeur: string): Promise<number> => {
      // Rodage jeté : la première mesure paie l'établissement de connexion, et
      // se trompe toujours dans le sens rassurant.
      await lireCommandePublique(valeur);
      const debut = performance.now();
      for (let i = 0; i < 5; i += 1) await lireCommandePublique(valeur);
      return (performance.now() - debut) / 5;
    };

    const valide = await mesurer(jeton);
    const inconnu = await mesurer("bbbbbbbbbbbbbbbbbbbbb");

    // On compare des ORDRES DE GRANDEUR, pas des millisecondes : un test de
    // temps trop serré échoue par intermittence, et un test qu'on relance
    // jusqu'au vert n'est plus bloquant.
    const rapport = Math.max(valide, inconnu) / Math.max(1, Math.min(valide, inconnu));
    expect(
      rapport,
      `jeton valide ${valide.toFixed(1)} ms contre inconnu ${inconnu.toFixed(1)} ms`,
    ).toBeLessThan(10);
  }, 60_000);
});

describe("Le média plein", () => {
  test("il exige le jeton de SA commande", async () => {
    const { data } = await alice.client
      .from("order_media")
      .select("id")
      .eq("order_id", commande)
      .limit(1)
      .single();
    const mediaId = (data as { id: string }).id;

    expect(await signerMediaPlein(jeton, mediaId)).not.toBeNull();
    // Un jeton qui ne désigne pas cette commande ne signe rien.
    expect(await signerMediaPlein("ccccccccccccccccccccc", mediaId)).toBeNull();
  });

  test("un identifiant de média forgé ne signe rien", async () => {
    expect(await signerMediaPlein(jeton, "3f2504e0-4f89-11d3-9a0c-0305e82c3301")).toBeNull();
    expect(await signerMediaPlein(jeton, "pas-un-uuid")).toBeNull();
  });
});
