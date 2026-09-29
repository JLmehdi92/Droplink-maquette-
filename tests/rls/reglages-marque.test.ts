import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { creerUtilisateur, supprimerUtilisateur, type UtilisateurDeTest } from "../aide/utilisateurs";
import { appliquerReglagesMarque, ReglagesMarque } from "@/lib/boutique/reglages";
import { cleAppartientAuShop } from "@/lib/boutique/logo";
import { lireCommandePublique } from "@/lib/page-publique/lecture";

/**
 * LES RÉGLAGES DE MARQUE.
 *
 * Un réglage de marque touche TOUTES les pages publiques d'un vendeur d'un seul
 * geste. C'est la seule écriture du produit dont un seul appel change ce que
 * voient des dizaines de clients à la fois — donc la seule dont une erreur se
 * constate en masse.
 *
 * La langue mérite une insistance particulière : `profiles.locale` habille
 * l'interface du vendeur, `shops.default_language` habille les pages de ses
 * clients. Rien dans le produit ne rendait la seconde modifiable, ce qui
 * signifiait que TOUTE page publique était servie en français, y compris pour un
 * vendeur ayant tout choisi en anglais. Le défaut est invisible côté vendeur :
 * il ne se voit que chez son client.
 */

let alice: UtilisateurDeTest;
let bob: UtilisateurDeTest;
let jetonAlice: string;

beforeAll(async () => {
  alice = await creerUtilisateur("marque-alice");
  bob = await creerUtilisateur("marque-bob");

  const { data } = await alice.client
    .from("orders")
    .insert({ shop_id: alice.shopId, customer_label: "Yanis" })
    .select("public_token")
    .single();
  jetonAlice = (data as { public_token: string }).public_token;
}, 90_000);

afterAll(async () => {
  await supprimerUtilisateur(alice);
  await supprimerUtilisateur(bob);
});

describe("Ce que le vendeur règle arrive sur sa page publique", () => {
  test("nom, couleur, langue et filigrane sont servis au client", async () => {
    const ok = await appliquerReglagesMarque(alice.client, alice.shopId, {
      nom: "Atelier Yuki",
      couleurAccent: "#C81E2D",
      languePublique: "en",
      filigrane: true,
    });
    expect(ok, "l'écriture des réglages a échoué").toBe(true);

    const publique = await lireCommandePublique(jetonAlice);
    expect(publique, "la page publique ne rend plus rien").not.toBeNull();
    if (publique === null) return;

    expect(publique.boutique.nom).toBe("Atelier Yuki");
    expect(publique.boutique.couleur).toBe("#c81e2d");
    // LE CŒUR DE CE FICHIER. Sans écriture de `default_language`, cette
    // assertion rend « fr » — et le client d'un vendeur anglophone reçoit une
    // page en français sans que personne ne s'en aperçoive.
    expect(publique.boutique.langue).toBe("en");
    
  });

  test("la couleur est stockée TELLE QUELLE, jamais corrigée pour le contraste", async () => {
    // Un jaune vif est illisible en texte. Le produit dérive des variantes
    // lisibles AU RENDU ; réécrire la valeur en base ferait voir au vendeur
    // autre chose que ce qu'il a choisi, sans le lui dire.
    await appliquerReglagesMarque(alice.client, alice.shopId, {
      nom: "Atelier Yuki",
      couleurAccent: "#FFEE00",
      languePublique: "en",
      filigrane: true,
    });
    const publique = await lireCommandePublique(jetonAlice);
    expect(publique?.boutique.couleur).toBe("#ffee00");
  });

  test("un nom vide vaut ABSENCE : la page publique omet l'en-tête", async () => {
    await appliquerReglagesMarque(alice.client, alice.shopId, {
      nom: "",
      couleurAccent: "#0058be",
      languePublique: "fr",
      filigrane: false,
    });
    const publique = await lireCommandePublique(jetonAlice);
    // `null` et non chaîne vide : c'est `null` qui fait omettre la barre. Une
    // chaîne vide produirait un en-tête vide au lieu de pas d'en-tête.
    expect(publique?.boutique.nom).toBeNull();
  });
});

describe("Le filigrane", () => {
  test("il ne s'allume que s'il y a un nom à écrire", async () => {
    // La condition vit EN BASE, avec la donnée, et pas dans le composant : un
    // second appelant qui l'oublierait produirait une bande noire vide sur les
    // photos, sans que rien ne le signale.
    await appliquerReglagesMarque(alice.client, alice.shopId, {
      nom: "",
      couleurAccent: "#0058be",
      languePublique: "fr",
      filigrane: true,
    });
    const sansNom = await lireCommandePublique(jetonAlice);
    expect(sansNom?.boutique.filigrane, "filigrane allumé sans rien à écrire").toBe(false);
  });

  test("contre-test positif : avec un nom, il s'allume", async () => {
    // Sans lui, une fonction qui rendrait TOUJOURS `false` passerait le test
    // précédent sans rien prouver.
    await appliquerReglagesMarque(alice.client, alice.shopId, {
      nom: "Atelier Yuki",
      couleurAccent: "#0058be",
      languePublique: "fr",
      filigrane: true,
    });
    expect((await lireCommandePublique(jetonAlice))?.boutique.filigrane).toBe(true);
  });

  test("un nom fait UNIQUEMENT d'espaces ne suffit pas", async () => {
    // Cas hors du motif d'origine : `name is not null` seul l'aurait laissé
    // passer, et le filigrane aurait affiché une bande vide.
    await appliquerReglagesMarque(alice.client, alice.shopId, {
      nom: "   ",
      couleurAccent: "#0058be",
      languePublique: "fr",
      filigrane: true,
    });
    expect((await lireCommandePublique(jetonAlice))?.boutique.filigrane).toBe(false);
  });

  test("éteint, il reste éteint même avec un nom", async () => {
    await appliquerReglagesMarque(alice.client, alice.shopId, {
      nom: "Atelier Yuki",
      couleurAccent: "#0058be",
      languePublique: "fr",
      filigrane: false,
    });
    expect((await lireCommandePublique(jetonAlice))?.boutique.filigrane).toBe(false);
  });
});

describe("La clé du logo appartient à son vendeur", () => {
  test("une clé d'un autre shop est refusée", () => {
    expect(cleAppartientAuShop("logos/" + alice.shopId + "/x.png", bob.shopId)).toBe(false);
  });

  test("contre-test positif : la sienne est acceptée", () => {
    expect(cleAppartientAuShop("logos/" + bob.shopId + "/x.png", bob.shopId)).toBe(true);
  });

  test("un shop dont l'identifiant est un PRÉFIXE d'un autre ne passe pas", () => {
    // Hors du cas motivant : sans le séparateur final dans la comparaison, le
    // shop `abc` accepterait une clé du shop `abcdef`. Les identifiants sont des
    // UUID, donc le cas ne se produit pas aujourd'hui — c'est exactement pour
    // ça qu'il faut l'écrire : une protection qui tient au format d'un
    // identifiant n'est pas une protection.
    expect(cleAppartientAuShop("logos/abcdef/x.png", "abc")).toBe(false);
    expect(cleAppartientAuShop("logos/abc/x.png", "abc")).toBe(true);
  });

  test("une clé qui n'est pas un logo est refusée", () => {
    // Le préfixe `logos/` fait partie du contrôle : sans lui, une clé de média
    // pourrait être confirmée comme logo, et le vendeur écraserait sa propre
    // photo de commande par une image de marque.
    expect(cleAppartientAuShop("medias/" + bob.shopId + "/x.png", bob.shopId)).toBe(false);
  });
});

describe("L'isolation, sur cette surface aussi", () => {
  test("Bob ne peut pas rhabiller la boutique d'Alice", async () => {
    const ok = await appliquerReglagesMarque(bob.client, alice.shopId, {
      nom: "Boutique detournee",
      couleurAccent: "#000000",
      languePublique: "en",
      filigrane: false,
    });

    // La RLS ne LÈVE pas sur un UPDATE hors périmètre : elle ne trouve
    // simplement aucune ligne. L'écriture « réussit » en ne faisant rien, donc
    // le contrôle porte sur l'ÉTAT, pas sur le code de retour.
    const publique = await lireCommandePublique(jetonAlice);
    expect(publique?.boutique.nom, "Bob a réécrit la boutique d'Alice").not.toBe(
      "Boutique detournee",
    );
    /*
     * ⚠️ IL Y AVAIT ICI `expect(ok || true).toBe(true)`.
     *
     * `ok || true` vaut TOUJOURS `true` : cette ligne ne pouvait pas échouer,
     * quelle que soit la valeur de `ok`. C'était le résidu d'une assertion
     * déplacée sur l'ÉTAT, deux lignes plus haut — vidée de sa fonction sans
     * être retirée. Elle ne prouvait rien et donnait la forme d'un contrôle à
     * un endroit qui n'en portait plus.
     *
     * Ce qui reste à dire est la propriété RÉELLE : l'écriture hors périmètre
     * ne LÈVE pas, elle ne trouve aucune ligne. C'est vérifiable, donc vérifié.
     */
    expect(ok, "l'écriture hors périmètre a levé : la RLS ne filtre plus, elle refuse").toBe(true);
  });

  test("contre-test positif : Bob PEUT rhabiller la sienne", async () => {
    // Sans lui, une fonction toujours en échec passerait le test précédent à
    // 100 % sans rien prouver.
    const ok = await appliquerReglagesMarque(bob.client, bob.shopId, {
      nom: "Chez Bob",
      couleurAccent: "#123456",
      languePublique: "en",
      filigrane: false,
    });
    expect(ok).toBe(true);

    const { data } = await bob.client
      .from("shops")
      .select("name, default_language")
      .eq("id", bob.shopId)
      .single();
    expect((data as { name: string }).name).toBe("Chez Bob");
    expect((data as { default_language: string }).default_language).toBe("en");
  });
});

describe("Le contrat de saisie", () => {
  test("une couleur qui n'est pas un hexadécimal à six chiffres est refusée", () => {
    for (const mauvaise of ["rouge", "#fff", "#12345g", "0058be", "#0058be ".repeat(3)]) {
      const r = ReglagesMarque.safeParse({
        couleurAccent: mauvaise,
        languePublique: "fr",
        filigrane: false,
      });
      expect(r.success, `« ${mauvaise} » a été acceptée`).toBe(false);
    }
  });

  test("contre-test positif : une couleur valide passe, casse comprise", () => {
    expect(
      ReglagesMarque.safeParse({
        couleurAccent: "#C81E2D",
        languePublique: "fr",
        filigrane: false,
      }).success,
    ).toBe(true);
  });

  test("une langue hors du couple supporté est refusée", () => {
    // La contrainte existe AUSSI en base (`shops_langue_supportee`). Le contrôle
    // applicatif refuse plus tôt et avec un meilleur message ; c'est la base qui
    // fait autorité.
    expect(
      ReglagesMarque.safeParse({ couleurAccent: "#0058be", languePublique: "de", filigrane: false })
        .success,
    ).toBe(false);
  });
});

/**
 * LA CONTRAINTE DE BASE ET LE MOTIF TYPESCRIPT DOIVENT DIRE LA MÊME CHOSE.
 *
 * Ils sont écrits DEUX FOIS — dans `reglages.ts` et dans les migrations 085 et
 * 133 — et c'est délibéré : l'un EXPLIQUE au vendeur quel champ ne va pas,
 * l'autre EMPÊCHE quel que soit le chemin d'écriture. Mais deux copies d'une
 * même règle divergent en silence, et la divergence a exactement deux formes,
 * toutes deux invisibles :
 *
 *   - la BASE plus stricte que Zod → le vendeur voit son formulaire accepter,
 *     puis « rien n'a été enregistré », sans savoir quel champ ;
 *   - la BASE plus permissive que Zod → un second chemin d'écriture (une
 *     migration corrective, un import, la console d'administration) pose une
 *     valeur que la page publique n'aurait jamais dû recevoir.
 *
 * ⚠️ ON N'INTERROGE PAS LE TEXTE DE LA CONTRAINTE, ON L'INTERROGE PAR L'EFFET :
 * on ÉCRIT chaque valeur et on regarde si Postgres la refuse. Un contrôle qui
 * comparerait deux expressions régulières prouverait qu'elles se ressemblent,
 * jamais qu'elles décident pareil.
 */
describe("La contrainte de base décide comme le motif applicatif", () => {
  const COLONNES = {
    instagram: "instagram_url",
    tiktok: "tiktok_url",
    whatsapp: "whatsapp_url",
    site: "site_url",
  } as const;

  // Des valeurs DÉJÀ NORMALISÉES : c'est ce que la base reçoit réellement, et
  // c'est donc sur celles-là que les deux règles doivent concorder.
  const VALEURS: ReadonlyArray<readonly [keyof typeof COLONNES, string]> = [
    ["instagram", "https://instagram.com/atelier.nord"],
    ["instagram", "https://www.instagram.com/atelier.nord"],
    ["instagram", "https://instagram.com.attaquant.example/x"],
    ["instagram", "https://instagram.com@attaquant.example/x"],
    ["instagram", "javascript:alert(1)"],
    ["tiktok", "https://www.tiktok.com/@atelier.nord"],
    ["tiktok", "https://tiktok.com/@x?_t=8k&_r=1"],
    ["tiktok", "https://tiktok.com/atelier"],
    ["whatsapp", "https://wa.me/33612345678"],
    ["whatsapp", "https://api.whatsapp.com/send?phone=33612345678"],
    ["whatsapp", "https://wa.me.attaquant.example/33612"],
    ["site", "https://laplanque.fr"],
    ["site", "https://www.laplanque.fr/boutique"],
    ["site", "http://laplanque.fr"],
    ["site", "https://laplanque.fr@attaquant.example/x"],
    ["site", "https://laplanque"],
    ["site", "javascript:alert(1)"],
  ];

  test("le jeu de valeurs couvre les quatre colonnes", () => {
    // UN ENSEMBLE VIDE PASSE TOUT : on dit ce qu'on inspecte avant d'inspecter.
    expect(VALEURS.length).toBeGreaterThanOrEqual(15);
    expect(new Set(VALEURS.map(([c]) => c))).toEqual(
      new Set(Object.keys(COLONNES) as Array<keyof typeof COLONNES>),
    );
  });

  test.each(VALEURS)(
    "%s = « %s » : la base et le motif tranchent pareil",
    async (clef, valeur) => {
      const motifAccepte = ReglagesMarque.safeParse({
        couleurAccent: "#0058be",
        languePublique: "fr",
        filigrane: false,
        [clef]: valeur,
      }).success;

      const { error } = await alice.client
        .from("shops")
        .update({ [COLONNES[clef]]: valeur })
        .eq("id", alice.shopId);

      const baseAccepte = error === null;

      // On rend la boutique à son état neutre quoi qu'il arrive : les tests qui
      // suivent lisent la même ligne.
      if (baseAccepte) {
        await alice.client
          .from("shops")
          .update({ [COLONNES[clef]]: null })
          .eq("id", alice.shopId);
      }

      expect(
        baseAccepte,
        `le motif ${motifAccepte ? "accepte" : "refuse"} « ${valeur} », la base ${
          baseAccepte ? "accepte" : "refuse"
        }`,
      ).toBe(motifAccepte);
    },
    30_000,
  );
});

describe("Un compte neuf sert sa page client en anglais (décision de Mehdi, 29/09/2026)", () => {
  // Un compte NEUF, créé par le vrai déclencheur d'inscription : la boutique
  // naît de la valeur par défaut de la colonne, sans que personne ne l'écrive.
  // C'est l'état de tout compte qui n'a pas encore terminé l'accueil.
  let carole: UtilisateurDeTest;
  let jetonCarole: string;

  beforeAll(async () => {
    carole = await creerUtilisateur("marque-carole");
    const { data } = await carole.client
      .from("orders")
      .insert({ shop_id: carole.shopId, customer_label: "Lina" })
      .select("public_token")
      .single();
    jetonCarole = (data as { public_token: string }).public_token;
  }, 90_000);

  afterAll(async () => {
    await supprimerUtilisateur(carole);
  });

  test("sans aucun réglage, la page client est en anglais", async () => {
    const publique = await lireCommandePublique(jetonCarole);
    expect(publique, "la page publique ne rend rien").not.toBeNull();
    expect(publique?.boutique.langue).toBe("en");
  });

  test("CONTRE-TEST : le choix fait dans « Ma marque » reste respecté", async () => {
    const ok = await appliquerReglagesMarque(carole.client, carole.shopId, {
      couleurAccent: "#5B4BF5",
      languePublique: "zh-CN",
      filigrane: false,
    });
    expect(ok, "l'écriture des réglages a échoué").toBe(true);
    const publique = await lireCommandePublique(jetonCarole);
    expect(publique?.boutique.langue).toBe("zh-CN");
  });
});
