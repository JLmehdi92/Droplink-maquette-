import { randomUUID } from "node:crypto";
import { cleLogo, cleMedia, cleVignette } from "../../src/lib/storage/cles";
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

  /*
   * LA CLÉ EST PRODUITE PAR LE PRODUIT, jamais écrite à la main.
   *
   * Ce jeu employait `medias/{shop}/{commande}/pub.jpg` — un identifiant de
   * média qui n'est pas un UUID. La base l'acceptait (son déclencheur ne
   * vérifiait que le PRÉFIXE) et le signeur le refusait (il exige la forme
   * complète depuis la correction de la traversée de chemin). Un média
   * enregistré, compté dans les plafonds, affiché au vendeur — et invisible
   * chez son client, sans un mot.
   *
   * C'est ce jeu de test qui a révélé la divergence ; la migration 089 y a mis
   * fin en descendant la forme complète en base. Faire produire la clé par
   * `cleMedia()` garantit que le jeu décrit ce que le produit fabrique
   * réellement, et non ce qu'on imagine qu'il fabrique.
   */
  const idMedia = randomUUID();
  // L'ÉCHEC DU JEU DOIT ÊTRE BRUYANT. Sans cette assertion, une insertion
  // refusée laissait la suite s'exécuter sur une commande SANS média : des
  // tests passaient en n'inspectant rien, et l'échec ne se voyait que sur un
  // « expected 0 to be greater than 0 » trois écrans plus bas.
  const { error: erreurMedia } = await alice.client.from("order_media").insert({
    id: idMedia,
    order_id: commande,
    type: "photo",
    cle: cleMedia({
      shopId: alice.shopId,
      orderId: commande,
      mediaId: idMedia,
      typeMime: "image/jpeg",
    }),
    taille_octets: 100,
    position: 0,
    /*
     * ⚠️ CE JEU N'AVAIT NI VIGNETTE NI LOGO, ET C'EST POUR ÇA QUE LA SONDE
     * D'IDENTIFIANTS INTERNES NE VOYAIT RIEN.
     *
     * Trouvé à l'audit du 31/08/2026, puis MESURÉ sur un build servi : le HTML
     * réel de `/p/{jeton}` contient bien `shop_id` et `order_id`. Ils voyagent
     * dans le CHEMIN des URL présignées — une signature S3/R2 porte la clé
     * d'objet dans son `pathname`, il ne peut pas en être autrement.
     *
     * `cle_vignette` et `logo_url` valant NULL, les trois champs qui portent une
     * URL signée valaient `null` : le test cherchait les identifiants dans un
     * objet où aucune URL signée n'existait. Le garde regardait là où le défaut
     * ne pouvait pas être (L-025).
     */
    cle_vignette: cleVignette(
      cleMedia({
        shopId: alice.shopId,
        orderId: commande,
        mediaId: idMedia,
        typeMime: "image/jpeg",
      }),
    ),
  });
  expect(erreurMedia, `média du jeu non inséré : ${erreurMedia?.message}`).toBeNull();

  const { error: erreurLogo } = await alice.client
    .from("shops")
    .update({ logo_url: cleLogo({ shopId: alice.shopId, logoId: randomUUID(), typeMime: "image/png" }) })
    .eq("id", alice.shopId);
  expect(erreurLogo, `logo du jeu non posé : ${erreurLogo?.message}`).toBeNull();
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

  test("aucun identifiant INTERNE ne sort — ni shop, ni commande, ni média", async () => {
    /*
     * DÉFAUT RÉEL, TROUVÉ PAR AUDIT ET NON PAR CETTE SONDE. Le logo de boutique
     * était rendu comme clé R2 brute — `logos/{shopId}/{uuid}.png` — donc le
     * `shop_id` sortait dans le HTML, SOUS LE NOM `boutique_logo`. La migration
     * 017 l'énumère pourtant parmi ce qui n'est PAS rendu.
     *
     * La sonde ne le voyait pas parce qu'elle n'inspectait que deux sentinelles,
     * choisies. Un contrôle ne doit pas dépendre de ce que son auteur a pensé à
     * inspecter : elle inventorie désormais TOUS les identifiants internes.
     *
     * L'ENJEU N'EST PAS LE SECRET, C'EST LA CORRÉLATION. Deux liens publics de
     * deux commandes différentes deviennent rattachables au même vendeur par un
     * identifiant stable — et le client d'un revendeur n'a pas à savoir qui est
     * derrière, ni combien de pages il existe.
     */
    const page = await lireCommandePublique(jeton);
    const renduComplet = JSON.stringify(page);

    /*
     * ⚠️ L'EXCEPTION DES URL SIGNÉES — DÉCLARÉE, BORNÉE, ET MESURÉE.
     *
     * FAIT ÉTABLI LE 31/08/2026 SUR UN BUILD SERVI, pas déduit : le HTML réel de
     * `/p/{jeton}` contient `shop_id` et `order_id`. Ils sont dans le CHEMIN des
     * URL présignées R2 — `…/medias/{shop}/{commande}/{media}.vignette.webp` —
     * et une signature S3/R2 ne peut pas ne pas porter la clé d'objet qu'elle
     * signe.
     *
     * CE TEST NE LE VOYAIT PAS, et la raison est exactement L-025 : son jeu ne
     * posait ni `cle_vignette` ni `logo_url`. Les trois champs qui portent une
     * URL signée valaient donc `null`, et il cherchait les identifiants dans un
     * objet où aucune URL signée n'existait. Le jeu porte désormais les deux, et
     * ce test a ÉCHOUÉ au premier passage — c'est ce qui prouve qu'il regarde
     * enfin le bon endroit.
     *
     * POURQUOI L'EXCEPTION PLUTÔT QU'UNE CORRECTION. La forme de la clé n'est
     * pas un accident : générée par le serveur, ancrée au préfixe de la
     * commande, et vérifiée par un déclencheur EN BASE (`verifier_cles_media`,
     * DL039) — c'est elle qui empêche un vendeur d'écraser le média d'un autre.
     * La rendre opaque demanderait une table d'indirection et retirerait la
     * garde la plus forte du stockage, pour masquer un UUID sans signification
     * hors de notre base.
     *
     * CE QUI RESTE INTERDIT, ET QUE CE TEST TIENT : les identifiants ne doivent
     * apparaître QUE là. Ailleurs — un champ, un attribut, une charge
     * d'hydratation — ce serait la fuite que la migration 017 dit ne pas
     * produire.
     *
     * ARBITRAGE LAISSÉ À WASSIM : deux liens publics du même vendeur restent
     * rattachables l'un à l'autre par ce `shop_id`. Ce n'est pas un secret,
     * c'est une corrélation — et c'est un choix produit, pas un défaut à
     * réparer en silence.
     */
    const urlsSignees = (renduComplet.match(/https?:\/\/[^"\\]+/g) ?? []).filter((u) =>
      u.includes("X-Amz-Signature"),
    );
    expect(
      urlsSignees.length,
      "aucune URL signée dans le rendu : le jeu ne porte ni vignette ni logo, " +
        "donc l'exception ci-dessus masquerait un rendu vide au lieu de le borner",
    ).toBeGreaterThan(0);

    let rendu = renduComplet;
    for (const u of urlsSignees) rendu = rendu.split(u).join("[url-signee]");

    const internes = await interroger<{ valeur: string }>(
      catalogue,
      `select o.shop_id::text as valeur from public.orders o where o.id = $1
       union all
       select o.id::text from public.orders o where o.id = $1
       union all
       select s.owner_id::text from public.shops s
         join public.orders o on o.shop_id = s.id where o.id = $1`,
      [commande],
    );

    // UN ENSEMBLE VIDE PASSE TOUT : sans ce contrôle, une requête fausse
    // rendrait la sonde verte et muette.
    expect(
      internes.length,
      "aucun identifiant à chercher : la requête est fausse",
    ).toBeGreaterThanOrEqual(3);

    /*
     * L'IDENTIFIANT DE MÉDIA EST EXCLU, ET C'EST DÉCLARÉ. Il est rendu exprès :
     * le visionneur plein écran construit `/p/{jeton}/media/{mediaId}` avec lui.
     * Il ne corrèle rien — il n'a de sens qu'accompagné du jeton, et la route
     * revérifie que le média appartient bien à la commande de ce jeton. Ce qui
     * est interdit ici, ce sont les identifiants qui désignent le VENDEUR ou
     * relient deux pages entre elles.
     */
    const fuites = internes.map((l) => l.valeur).filter((v) => rendu.includes(v));
    expect(
      fuites,
      `Identifiants internes rendus au visiteur HORS d'une URL signée : ${fuites.join(", ")}. ` +
        "Ils permettent de rattacher deux liens publics au même vendeur.",
    ).toEqual([]);
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
