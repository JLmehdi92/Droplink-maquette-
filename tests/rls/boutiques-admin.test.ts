import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import {
  creerUtilisateur,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";
import { decoderCurseur, listerBoutiques, stockageTotal } from "@/lib/audit/boutiques";

/**
 * LES BOUTIQUES VUES PAR L'ADMINISTRATION.
 *
 * Quatre propriétés portent tout le reste :
 *
 *  1. LES COMPTEURS SONT TENUS À L'ÉCRITURE, et ils doivent rester ÉGAUX à ce
 *     qu'ils résument. Un compteur dénormalisé qui dérive est le pire des deux
 *     mondes : rapide et faux, donc crédible.
 *  2. LES COMMANDES COMPTÉES SONT CELLES QUI PORTENT DU CONTENU RÉEL. Un
 *     brouillon ouvert puis abandonné est exactement le cas « teste une ou deux
 *     fois puis disparaît » : le compter gonflerait la métrique du côté
 *     rassurant, et une métrique fausse qui confirme ce qu'on espère ne se
 *     remet jamais en question.
 *  3. L'ÉCRAN NE MONTRE AUCUN CONTENU. Ni nom de client, ni référence, ni note
 *     interne, ni jeton public.
 *  4. UN VENDEUR NE MODIFIE PAS SES PROPRES COMPTEURS. Ils mesurent ce qu'il
 *     nous coûte.
 */

let admin: UtilisateurDeTest;
let gros: UtilisateurDeTest;
let petit: UtilisateurDeTest;
let catalogue: Client;

const AUCUNE_EMPREINTE = "";
const SANS_FILTRE = { q: "", curseur: null };

/** Crée une commande PORTANT DU CONTENU, et rend son identifiant. */
async function creerCommande(shopId: string, client: string): Promise<string> {
  const lignes = await interroger<{ id: string }>(
    catalogue,
    `insert into public.orders (shop_id, customer_label) values ($1, $2) returning id`,
    [shopId, client],
  );
  const id = lignes[0]?.id;
  if (id === undefined) throw new Error("commande non créée");
  return id;
}

/** Le préfixe que la base exige pour un média de cette commande. */
async function prefixeDe(orderId: string): Promise<string> {
  const lignes = await interroger<{ p: string }>(
    catalogue,
    "select public.prefixe_media_attendu($1) as p",
    [orderId],
  );
  const p = lignes[0]?.p;
  if (p === null || p === undefined) throw new Error("préfixe introuvable");
  return p;
}

async function ajouterMedia(orderId: string, position: number, octets: number): Promise<string> {
  const lignes = await interroger<{ id: string }>(
    catalogue,
    `insert into public.order_media (order_id, type, cle, taille_octets, position)
     values ($1, 'photo', $2, $3, $4) returning id`,
    // LA CLÉ PORTE LE PRÉFIXE RÉEL, parce que la base l'exige désormais :
    // `medias/{shop}/{commande}/`. Une clé fictive était acceptée tant que rien
    // ne contrôlait la valeur — et c'est exactement ce qui permettait à un
    // vendeur de désigner l'objet d'un autre.
    [orderId, `${await prefixeDe(orderId)}${position}.jpg`, octets, position],
  );
  const id = lignes[0]?.id;
  if (id === undefined) throw new Error("média non créé");
  return id;
}

async function compteursEnBase(shopId: string): Promise<{
  commandes: number;
  medias: number;
  octets: number;
}> {
  const lignes = await interroger<{ c: number; m: number; o: string }>(
    catalogue,
    `select commandes_reelles as c, medias_count as m, stockage_octets as o
     from public.shops where id = $1`,
    [shopId],
  );
  const l = lignes[0];
  if (l === undefined) throw new Error("boutique introuvable");
  return { commandes: Number(l.c), medias: Number(l.m), octets: Number(l.o) };
}

beforeAll(async () => {
  catalogue = await ouvrirConnexionCatalogue();
  admin = await creerUtilisateur("boutiques-admin");
  gros = await creerUtilisateur("boutiques-gros");
  petit = await creerUtilisateur("boutiques-petit");

  await interroger(catalogue, "update public.profiles set role = 'admin' where id = $1", [
    admin.profilId,
  ]);
  await interroger(catalogue, "update public.shops set name = $2 where id = $1", [
    gros.shopId,
    "Crème Fraîche",
  ]);

  const c1 = await creerCommande(gros.shopId, "client-un");
  const c2 = await creerCommande(gros.shopId, "client-deux");
  await ajouterMedia(c1, 0, 3_000_000);
  await ajouterMedia(c1, 1, 2_000_000);
  await ajouterMedia(c2, 0, 1_000_000);

  const c3 = await creerCommande(petit.shopId, "client-trois");
  await ajouterMedia(c3, 0, 500);
}, 180_000);

afterAll(async () => {
  await supprimerUtilisateur(admin);
  await supprimerUtilisateur(gros);
  await supprimerUtilisateur(petit);
  await catalogue.end();
});

describe("Qui peut lire la liste", () => {
  test("un vendeur est refusé, et n'apprend pas que la surface existe", async () => {
    await expect(listerBoutiques(petit.client, SANS_FILTRE, AUCUNE_EMPREINTE)).rejects.toThrow(
      /impossible/i,
    );
  });

  test("un vendeur ne lit pas non plus le total de stockage", async () => {
    await expect(stockageTotal(petit.client)).rejects.toThrow(/impossible/i);
  });

  test("contre-test positif : l'administrateur lit les deux", async () => {
    const page = await listerBoutiques(admin.client, SANS_FILTRE, AUCUNE_EMPREINTE);
    expect(page.lignes.length).toBeGreaterThan(0);
    expect(await stockageTotal(admin.client)).toBeGreaterThan(0);
  });
});

describe("Les compteurs disent la vérité sur ce qu'ils résument", () => {
  test("ils sont ÉGAUX à ce que les tables portent réellement", async () => {
    // LE CONTRÔLE CENTRAL. Un compteur dénormalisé qui dérive est rapide et
    // faux, donc crédible : personne ne le remet en cause avant de comparer à
    // une facture. On compare donc au calcul complet, celui qu'on refuse de
    // faire à la lecture.
    for (const u of [gros, petit]) {
      const compteurs = await compteursEnBase(u.shopId);

      const reel = await interroger<{ c: string; m: string; o: string | null }>(
        catalogue,
        `select
           (select count(*) from public.orders o
             where o.shop_id = $1 and o.first_content_at is not null) as c,
           (select count(*) from public.order_media m
              join public.orders o on o.id = m.order_id where o.shop_id = $1) as m,
           (select sum(m.taille_octets) from public.order_media m
              join public.orders o on o.id = m.order_id where o.shop_id = $1) as o`,
        [u.shopId],
      );

      expect(compteurs.commandes, `commandes dérivées pour ${u.email}`).toBe(Number(reel[0]?.c));
      expect(compteurs.medias, `médias dérivés pour ${u.email}`).toBe(Number(reel[0]?.m));
      expect(compteurs.octets, `octets dérivés pour ${u.email}`).toBe(Number(reel[0]?.o ?? 0));
    }
  });

  test("un média supprimé fait REDESCENDRE les octets", async () => {
    // Sans la décrémentation, le compteur mesurerait les octets jamais déposés
    // plutôt que les octets occupés — un chiffre qui ne redescend pas finit par
    // n'avoir aucun rapport avec la facture, en restant crédible tout du long.
    const avant = await compteursEnBase(petit.shopId);

    const commande = await creerCommande(petit.shopId, "client-jetable");
    const media = await ajouterMedia(commande, 0, 777_000);

    const pendant = await compteursEnBase(petit.shopId);
    expect(pendant.octets).toBe(avant.octets + 777_000);
    expect(pendant.medias).toBe(avant.medias + 1);

    await interroger(catalogue, "delete from public.order_media where id = $1", [media]);

    const apres = await compteursEnBase(petit.shopId);
    expect(apres.octets, "les octets ne sont pas redescendus").toBe(avant.octets);
    expect(apres.medias).toBe(avant.medias);
  });

  test("une commande SANS contenu réel n'est pas comptée", async () => {
    // `first_content_at` est posé par la base dès qu'une commande porte du
    // contenu. Une commande vide est un brouillon : la compter reviendrait à
    // compter les ouvertures d'éditeur, ce que le produit mesure séparément.
    const avant = await compteursEnBase(petit.shopId);

    await interroger(catalogue, "insert into public.orders (shop_id) values ($1)", [petit.shopId]);

    expect(
      (await compteursEnBase(petit.shopId)).commandes,
      "un brouillon vide a été compté comme une commande",
    ).toBe(avant.commandes);
  });

  test("contre-test positif : dès qu'elle porte du contenu, elle est comptée UNE fois", async () => {
    // Et une seule : sans la condition de transition, chaque modification
    // ultérieure incrémenterait le compteur, qui mesurerait alors les
    // modifications. Les deux chiffres se ressemblent assez pour qu'on ne
    // remarque rien.
    const avant = await compteursEnBase(petit.shopId);
    const commande = await creerCommande(petit.shopId, "client-quatre");

    expect((await compteursEnBase(petit.shopId)).commandes).toBe(avant.commandes + 1);

    await interroger(catalogue, "update public.orders set customer_label = $2 where id = $1", [
      commande,
      "client-quatre-renomme",
    ]);
    await interroger(catalogue, "update public.orders set product_ref = $2 where id = $1", [
      commande,
      "ref-42",
    ]);

    expect(
      (await compteursEnBase(petit.shopId)).commandes,
      "une modification a été comptée comme une commande de plus",
    ).toBe(avant.commandes + 1);
  });

  test("le total du panneau est la somme des boutiques", async () => {
    const total = await stockageTotal(admin.client);
    const somme = await interroger<{ s: string | null }>(
      catalogue,
      "select sum(stockage_octets) as s from public.shops",
    );
    expect(total).toBe(Number(somme[0]?.s ?? 0));
  });
});

describe("Le tri, la recherche et la pagination", () => {
  test("la plus lourde vient en premier", async () => {
    const page = await listerBoutiques(admin.client, SANS_FILTRE, AUCUNE_EMPREINTE);
    const octets = page.lignes.map((l) => l.octets);
    expect([...octets].sort((a, b) => b - a), "la liste n'est pas triée par stockage").toEqual(
      octets,
    );
  });

  test("la recherche est INSENSIBLE AUX ACCENTS", async () => {
    // « creme » doit trouver « Crème » : c'est le cas majoritaire, puisqu'on
    // tape vite dans une barre de recherche.
    const page = await listerBoutiques(
      admin.client,
      { q: "creme", curseur: null },
      AUCUNE_EMPREINTE,
    );
    expect(page.lignes.map((l) => l.id), "« creme » ne trouve pas « Crème »").toContain(gros.shopId);
  });

  test("contre-test : une recherche qui ne correspond à rien ne rend rien", async () => {
    // Sans lui, une fonction qui ignorerait le filtre passerait le test
    // précédent sans rien prouver.
    const page = await listerBoutiques(
      admin.client,
      { q: "zzz-inexistant-zzz", curseur: null },
      AUCUNE_EMPREINTE,
    );
    expect(page.lignes).toEqual([]);
  });

  test("la recherche trouve aussi par email", async () => {
    const page = await listerBoutiques(
      admin.client,
      { q: petit.email, curseur: null },
      AUCUNE_EMPREINTE,
    );
    expect(page.lignes.map((l) => l.email)).toContain(petit.email);
  });

  test("un curseur forgé est refusé avant d'atteindre la requête", async () => {
    // La grammaire de PostgREST emploie la virgule et les parenthèses : une
    // valeur qui les porte ne doit jamais atteindre la requête. Elle serait
    // rejetée par Postgres au typage — mais une validation qui compte sur le
    // rejet d'une AUTRE couche disparaît le jour où cette couche change.
    for (const forge of ["1,2", "1)", "-1", "1e9", "1.5", "abc"]) {
      const encode = Buffer.from(`${forge}|${gros.shopId}`, "utf8").toString("base64url");
      expect(decoderCurseur(encode), `curseur accepté : ${forge}`).toBeNull();
    }
  });

  test("contre-test : un curseur légitime est accepté", async () => {
    const encode = Buffer.from(`6000000|${gros.shopId}`, "utf8").toString("base64url");
    expect(decoderCurseur(encode)).toEqual({ octets: "6000000", id: gros.shopId });
  });
});

describe("Ce que l'écran ne montre PAS", () => {
  test("aucun contenu de commande ne sort de la fonction", async () => {
    // CONTRÔLE PAR VALEUR, pas par nom. Une valeur voyage sous n'importe quel
    // nom : un champ republié sous `meta`, `diagnostic` — ou, comme la
    // falsification l'a fait, sous `nom` — survit intégralement à un contrôle
    // textuel des noms de colonnes. On cherche donc les VALEURS elles-mêmes dans
    // la réponse sérialisée.
    //
    // ON INVENTORIE, ON NE SÉLECTIONNE PAS. La première version de ce contrôle
    // ne cherchait QU'UN jeton, celui d'une commande prise au hasard : la
    // falsification en a publié un autre, et le contrôle est resté vert alors
    // qu'une capacité fuyait. Un garde ne doit pas dépendre de ce que son auteur
    // a pensé à inspecter.
    const jetons = await interroger<{ t: string }>(
      catalogue,
      "select public_token as t from public.orders",
    );
    expect(
      jetons.length,
      "aucune commande pour éprouver la sentinelle — un ensemble vide passe tout",
    ).toBeGreaterThan(0);

    const page = await listerBoutiques(admin.client, SANS_FILTRE, AUCUNE_EMPREINTE);
    const rendu = JSON.stringify(page);

    // LE JETON EST LA SENTINELLE PRIORITAIRE : les autres champs exposent une
    // donnée, celui-là transfère une CAPACITÉ, définitivement, puisqu'il est
    // immuable à vie.
    const fuites = jetons.map((j) => j.t).filter((t) => rendu.includes(t));
    expect(fuites, `des public_token sont sortis de la liste : ${fuites.join(", ")}`).toEqual([]);

    expect(rendu, "un nom de client est sorti").not.toContain("client-un");
    expect(rendu, "une référence produit est sortie").not.toContain("ref-42");
  });
});

describe("Un vendeur ne touche pas aux compteurs qui le mesurent", () => {
  test("l'écriture est refusée EN BASE, colonne par colonne", async () => {
    // La migration 001 accorde l'écriture sur `shops` en LISTE BLANCHE : une
    // colonne nouvelle naît fermée. Si le droit avait été donné sur la table
    // entière, remettre son stockage à zéro serait exactement ce qu'on ferait.
    for (const colonne of ["stockage_octets", "medias_count", "commandes_reelles"]) {
      const { error } = await petit.client
        .from("shops")
        .update({ [colonne]: 0 })
        .eq("id", petit.shopId);
      expect(error, `un vendeur a pu écrire ${colonne}`).not.toBeNull();
    }

    expect((await compteursEnBase(petit.shopId)).octets).toBeGreaterThan(0);
  });

  test("contre-test positif : il modifie bien ce qui lui appartient", async () => {
    // Sans lui, une suite où TOUT est refusé passerait à 100 % sans rien
    // prouver — y compris si la RLS avait fermé la table entière par erreur.
    const { error } = await petit.client
      .from("shops")
      .update({ name: "Ma boutique" })
      .eq("id", petit.shopId);
    expect(error).toBeNull();
  });
});

describe("La consultation est tracée", () => {
  test("UNE entrée par page, portant ses critères — pas une par ligne", async () => {
    // Une entrée par ligne affichée noierait les consultations individuelles,
    // qui sont ce qu'on relit en cas de litige.
    //
    // ON COMPTE AVANT ET APRÈS, on n'efface pas : le journal est append-only, et
    // la tentative de le vider échoue — y compris avec la connexion de service.
    // C'est la propriété qui compte le plus dans ce journal, et elle vient de
    // faire échouer ce test avant de le laisser passer.
    const compter = async (): Promise<number> => {
      const l = await interroger<{ n: string }>(
        catalogue,
        "select count(*) as n from public.admin_audit_log where action = 'boutiques.liste'",
      );
      return Number(l[0]?.n ?? 0);
    };

    const avant = await compter();

    const page = await listerBoutiques(
      admin.client,
      { q: "creme", curseur: null },
      "empreinte-de-test",
    );
    expect(page.lignes.length).toBeGreaterThan(0);

    expect(await compter(), "le nombre d'entrées écrites ne vaut pas un").toBe(avant + 1);

    const trace = await interroger<{ payload: { recherche?: string } }>(
      catalogue,
      `select payload from public.admin_audit_log
       where action = 'boutiques.liste' order by occurred_at desc limit 1`,
    );
    expect(trace[0]?.payload.recherche, "les critères ne sont pas tracés").toBe("creme");
  });
});
