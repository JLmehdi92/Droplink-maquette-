import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { configR2, stockageConfigure } from "@/lib/storage/config";
import { cleMedia } from "@/lib/storage/cles";
import {
  deposerDepuisLeServeur,
  lireTaille,
  signerDepot,
  signerLecture,
  supprimer,
} from "@/lib/storage/r2";

/**
 * BRANCHEMENT RÉEL DU STOCKAGE, DE BOUT EN BOUT.
 *
 * Cette suite touche un vrai bucket. Elle n'est pas dans les portes de qualité :
 * celles-ci doivent rester exécutables sans compte tiers. Elle se lance par
 * `pnpm check:r2`, et elle doit être passée AVANT d'écrire la moindre interface
 * de dépôt.
 *
 * Pourquoi avant l'interface : sans configuration CORS sur le bucket, le
 * navigateur bloque la requête AVANT DE L'ENVOYER. Aucune erreur côté serveur,
 * rien dans les journaux R2, une barre de progression qui ne démarre jamais. Le
 * même `PUT` présigné aboutit pourtant depuis curl. Un test d'interface
 * montrerait donc un uploader défaillant sans rien pour l'expliquer.
 *
 * La suite ne se contente pas de vérifier que les appels RÉPONDENT. « Il
 * répond » est la propriété que tous les résidus possèdent (L-032), et un point
 * d'ingestion qui rend 200 ne prouve pas qu'il a accepté (L-024). Elle contient
 * donc des REFUS attendus : un dépôt plus gros que ce qui a été signé doit
 * échouer, et une lecture non signée doit être interdite. Une suite où tout
 * réussit ne prouverait pas que le bucket est privé.
 */

const configure = stockageConfigure();

const shopId = randomUUID();
const orderId = randomUUID();
const mediaId = randomUUID();
const cle = configure ? cleMedia({ shopId, orderId, mediaId, typeMime: "image/png" }) : "";

// Charge utile déterministe : on compare les octets rendus à ceux déposés.
const CORPS = Buffer.from(
  "verification-branchement-r2-" + "0123456789abcdef".repeat(16),
  "utf8",
);
const TYPE = "image/png";

describe("Configuration du stockage", () => {
  test("les identifiants R2 sont réellement renseignés", () => {
    expect(
      configure,
      "Stockage R2 non configuré. Renseigner R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, " +
        "R2_SECRET_ACCESS_KEY et R2_BUCKET dans .env.local. Le token Cloudflare " +
        "doit être en « Object Read & Write » et limité au seul bucket : un token " +
        "Admin permettrait de créer et supprimer des buckets.",
    ).toBe(true);
  });

  test("aucune variable R2 n'est exposée au navigateur", () => {
    const fautives = Object.keys(process.env).filter(
      (nom) => nom.startsWith("NEXT_PUBLIC_") && nom.toUpperCase().includes("R2"),
    );
    expect(
      fautives,
      `Variables R2 préfixées NEXT_PUBLIC_, donc incluses dans le bundle ` +
        `navigateur : ${fautives.join(", ")}. Une seule fuite donne accès aux ` +
        "médias de tous les vendeurs.",
    ).toEqual([]);
  });
});

/**
 * Toute clé produite ici est enregistrée pour être supprimee ensuite, QUEL QUE
 * SOIT le sort du test qui l a creee.
 *
 * Ce n est pas de l hygiene : un test qui ne nettoie que son chemin heureux
 * laisse un objet derriere lui a chaque ECHEC, c est-a-dire exactement quand on
 * le relance en boucle. Le residu s accumule donc au rythme des ennuis, sur le
 * seul poste de cout du produit qui puisse deraper. Defaut trouve en falsifiant
 * la liaison de taille : le depot abusif a reussi, et son objet est reste.
 */
const clesCreees = new Set<string>();

function suivre(cleSuivie: string): string {
  clesCreees.add(cleSuivie);
  return cleSuivie;
}

describe.runIf(configure)("Branchement de bout en bout", () => {
  beforeAll(async () => {
    // Un résidu d'un passage précédent ferait passer des assertions pour de
    // mauvaises raisons.
    suivre(cle);
    await supprimer(cle);
  });

  afterAll(async () => {
    for (const aSupprimer of clesCreees) await supprimer(aSupprimer);
  });

  /**
   * LE PRÉVOL CORS, ISOLÉMENT ET EN PREMIER.
   *
   * C'est le seul point de toute la chaîne qui casse sans produire la moindre
   * trace. On l'interroge donc directement, hors de tout navigateur.
   */
  test("le prévol CORS autorise un dépôt depuis le navigateur", async () => {
    const { endpoint, bucket } = configR2();
    const origine = "http://localhost:3000";

    const reponse = await fetch(`${endpoint}/${bucket}/${cle}`, {
      method: "OPTIONS",
      headers: {
        Origin: origine,
        "Access-Control-Request-Method": "PUT",
        "Access-Control-Request-Headers": "content-type,content-length",
      },
    });

    const autorise = reponse.headers.get("access-control-allow-origin");
    const methodes = reponse.headers.get("access-control-allow-methods") ?? "";

    expect(
      autorise,
      "Le bucket ne renvoie aucun en-tête CORS. Le navigateur bloquera le dépôt " +
        "AVANT DE L'ENVOYER : aucune erreur serveur, rien dans les journaux R2, " +
        "une barre de progression qui ne démarre jamais.\n\n" +
        "Corriger dans Cloudflare → R2 → le bucket → Settings → CORS Policy :\n" +
        JSON.stringify(
          [
            {
              AllowedOrigins: ["http://localhost:3000", "https://VOTRE-DOMAINE"],
              AllowedMethods: ["PUT", "GET", "HEAD"],
              AllowedHeaders: ["content-type", "content-length"],
              ExposeHeaders: ["etag"],
              MaxAgeSeconds: 3600,
            },
          ],
          null,
          2,
        ),
    ).not.toBeNull();

    expect(
      methodes.toUpperCase(),
      "Le prévol n'autorise pas PUT : le dépôt direct navigateur → R2 est impossible.",
    ).toContain("PUT");
  });

  test("une URL de dépôt présignée accepte le fichier annoncé", async () => {
    const { url, enTetesObligatoires } = await signerDepot({
      cle,
      typeMime: TYPE,
      tailleOctets: CORPS.byteLength,
    });

    const reponse = await fetch(url, {
      method: "PUT",
      headers: enTetesObligatoires,
      body: CORPS,
    });

    expect(
      reponse.status,
      `Dépôt refusé : ${reponse.status} ${await reponse.text().catch(() => "")}`,
    ).toBe(200);
  });

  test("la taille est RELUE côté serveur et correspond", async () => {
    const taille = await lireTaille(cle);
    expect(taille, "Objet introuvable après dépôt").not.toBeNull();
    expect(
      taille,
      "La taille relue diffère de celle déposée : le modèle de coût repose sur " +
        "cette mesure, pas sur ce que le client annonce.",
    ).toBe(CORPS.byteLength);
  });

  /**
   * LE REFUS QUI COMPTE.
   *
   * Sans lui, la suite prouverait seulement que le dépôt fonctionne — jamais que
   * la borne de taille EXISTE. Or aws4fetch classe `content-length` parmi les
   * en-têtes non signables par défaut : une URL de dépôt écrite naïvement laisse
   * pousser n'importe quel volume. C'est ce test, et lui seul, qui établit que
   * `allHeaders` fait son office.
   */
  test("un dépôt PLUS GROS que ce qui a été signé est REFUSÉ", async () => {
    const cleAbus = suivre(
      cleMedia({ shopId, orderId, mediaId: randomUUID(), typeMime: "image/png" }),
    );
    const { url, enTetesObligatoires } = await signerDepot({
      cle: cleAbus,
      typeMime: TYPE,
      tailleOctets: CORPS.byteLength,
    });

    const tropGros = Buffer.concat([CORPS, Buffer.alloc(50_000, 1)]);
    const reponse = await fetch(url, {
      method: "PUT",
      headers: { ...enTetesObligatoires, "content-length": String(tropGros.byteLength) },
      body: tropGros,
    });

    expect(
      reponse.ok,
      "Un dépôt de taille supérieure à celle signée a été ACCEPTÉ. La borne de " +
        "taille est décorative : n'importe qui disposant d'une URL prévue pour " +
        "une photo peut y pousser des gigaoctets.",
    ).toBe(false);

    expect(
      await lireTaille(cleAbus),
      "L'objet abusif existe malgré le refus annoncé.",
    ).toBeNull();
  });

  test("une URL de lecture présignée rend exactement les octets déposés", async () => {
    const url = await signerLecture(cle, 120);
    const reponse = await fetch(url);
    expect(reponse.status, "Lecture signée refusée").toBe(200);
    const rendu = Buffer.from(await reponse.arrayBuffer());
    expect(rendu.equals(CORPS), "Les octets rendus diffèrent de ceux déposés").toBe(true);
  });

  /**
   * LA PROPRIÉTÉ LA PLUS IMPORTANTE DE TOUTE LA SUITE.
   *
   * Le bucket doit être privé SANS EXCEPTION. Si cette assertion tombe, tous les
   * médias de tous les vendeurs sont lisibles par quiconque devine une clé — et
   * les cinq tests précédents seraient malgré tout au vert.
   */
  test("une lecture NON SIGNÉE est refusée : le bucket est privé", async () => {
    const { endpoint, bucket } = configR2();
    const reponse = await fetch(`${endpoint}/${bucket}/${cle}`, { method: "GET" });
    expect(
      reponse.ok,
      "Le bucket répond à une requête NON SIGNÉE. Il est public : désactiver le " +
        "domaine r2.dev et tout domaine personnalisé.",
    ).toBe(false);
  });

  test("la suppression est effective, et idempotente", async () => {
    const cleTemp = suivre(
      cleMedia({ shopId, orderId, mediaId: randomUUID(), typeMime: "image/png" }),
    );
    await deposerDepuisLeServeur({ cle: cleTemp, corps: CORPS, typeMime: TYPE });
    expect(await lireTaille(cleTemp), "Dépôt serveur sans effet").toBe(CORPS.byteLength);

    await supprimer(cleTemp);
    expect(await lireTaille(cleTemp), "L'objet survit à sa suppression").toBeNull();

    // Supprimer ce qui n'existe pas ne doit pas lever : une reprise après
    // incident repasserait sinon en erreur sur un nettoyage déjà fait.
    await expect(supprimer(cleTemp)).resolves.toBeUndefined();
  });
});
