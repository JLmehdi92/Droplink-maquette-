import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  cleLogo,
  cleMedia,
  cleCouverture,
  cleVignette,
  extensionPour,
  IdentifiantInvalide,
  prefixesBoutique,
  TypeNonAccepte,
  typesAcceptes,
} from "@/lib/storage/cles";

/**
 * Ce que cette suite établit SANS RÉSEAU.
 *
 * Trois propriétés du stockage se décident entièrement dans la signature, donc
 * hors ligne, et ce sont les trois qui coûteraient le plus cher si elles
 * cédaient :
 *
 *   1. l'expiration est TOUJOURS explicite — aws4fetch mettrait sinon 24 h en
 *      silence, et une URL de 24 h sur un média privé survit largement à la
 *      conversation qui l'a produite ;
 *   2. `content-length` et `content-type` sont DANS la signature — sans eux la
 *      borne de taille est décorative ;
 *   3. la clé d'objet ne dépend jamais d'une chaîne fournie par le client.
 *
 * Les vérifier ici plutôt que dans `pnpm check:r2` a un intérêt précis : elles
 * restent vérifiées même sans identifiants Cloudflare, donc à chaque passage des
 * portes de qualité, et pas seulement le jour où quelqu'un pense à lancer le
 * branchement réel.
 */

const UUID_A = "11111111-2222-4333-8444-555555555555";
const UUID_B = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const UUID_C = "01234567-89ab-4cde-8f01-23456789abcd";

/**
 * Une clé RÉELLE, produite par le module lui-même.
 *
 * Ces tests employaient `"medias/a/b/c.png"`, une clé qu'aucun chemin du
 * produit ne fabrique. Depuis que `adresseObjet` exige une forme canonique,
 * elle est refusée — et c'est le bon comportement : signer une adresse à partir
 * d'une chaîne libre est précisément ce qui a permis la traversée de chemin du
 * 26/08/2026. On fait donc produire la clé par le produit plutôt que de
 * l'écrire à la main, ce qui la garde juste si la disposition change.
 */
const CLE_REELLE = cleMedia({
  shopId: UUID_A,
  orderId: UUID_B,
  mediaId: UUID_C,
  typeMime: "image/png",
});

describe("Clés d'objet", () => {
  test("la clé se compose du vendeur, de la commande et du média", () => {
    expect(cleMedia({ shopId: UUID_A, orderId: UUID_B, mediaId: UUID_C, typeMime: "image/jpeg" }))
      .toBe(`medias/${UUID_A}/${UUID_B}/${UUID_C}.jpg`);
  });

  test("le vendeur vient en PREMIER dans la clé", () => {
    // Ce n'est pas cosmétique : c'est ce qui permet de purger tout ce qui
    // appartient à un compte sans parcourir le bucket entier, et ce qui répartit
    // les clés au lieu de les entasser derrière un préfixe commun quand le
    // nombre de vendeurs croît.
    const cle = cleMedia({
      shopId: UUID_A,
      orderId: UUID_B,
      mediaId: UUID_C,
      typeMime: "image/png",
    });
    const prefixes = prefixesBoutique(UUID_A);
    expect(prefixes.some((p) => cle.startsWith(p))).toBe(true);
  });

  test("l'extension vient du type MIME, jamais du nom de fichier", () => {
    // Le nom de fichier n'est même pas un paramètre acceptable : il est
    // intégralement contrôlé par le client. Un `.php`, un `../`, un octet nul ou
    // 4 000 caractères ne peuvent pas atteindre la clé parce qu'ils n'ont aucun
    // chemin pour y arriver.
    expect(cleMedia({ shopId: UUID_A, orderId: UUID_B, mediaId: UUID_C, typeMime: "video/mp4" }))
      .toMatch(/\.mp4$/);
    expect(
      cleMedia({ shopId: UUID_A, orderId: UUID_B, mediaId: UUID_C, typeMime: "image/webp" }),
    ).toMatch(/\.webp$/);
  });

  test("un type MIME avec paramètres ou en majuscules reste accepté", () => {
    expect(extensionPour("media", "IMAGE/JPEG")).toBe("jpg");
    expect(extensionPour("media", "image/jpeg; charset=binary")).toBe("jpg");
  });

  test("un type non listé est REFUSÉ", () => {
    expect(() => extensionPour("media", "application/x-msdownload")).toThrow(TypeNonAccepte);
    expect(() => extensionPour("media", "text/html")).toThrow(TypeNonAccepte);
    // LE SVG N'EST ACCEPTÉ NULLE PART — et il l'était pour un logo jusqu'au
    // 26/08/2026, sur la foi d'un commentaire affirmant un assainissement qui
    // n'a jamais existé. Un SVG est un document capable de porter du script
    // sont affichés à des inconnus sur la page publique.
    expect(() => extensionPour("media", "image/svg+xml")).toThrow(TypeNonAccepte);
    expect(() => extensionPour("logo", "image/svg+xml")).toThrow(TypeNonAccepte);
  });

  test("la sonde inspecte réellement une table non vide", () => {
    // Un ensemble vide passe tout : si la table des types était vide, le test
    // « un type non listé est refusé » réussirait sans rien prouver.
    expect(typesAcceptes("media").length).toBeGreaterThan(3);
    expect(typesAcceptes("logo").length).toBeGreaterThan(2);
  });

  test("un identifiant qui n'est pas un UUID est REFUSÉ", () => {
    for (const mauvais of [
      "../autre-vendeur",
      "",
      "1",
      "11111111-2222-4333-8444-555555555555/../x",
      "11111111222243338444555555555555",
    ]) {
      expect(
        () => cleMedia({ shopId: mauvais, orderId: UUID_B, mediaId: UUID_C, typeMime: "image/png" }),
        `« ${mauvais} » a été accepté comme identifiant de boutique`,
      ).toThrow(IdentifiantInvalide);
    }
  });

  test("la vignette dérive de la clé du média", () => {
    const cle = cleMedia({
      shopId: UUID_A,
      orderId: UUID_B,
      mediaId: UUID_C,
      typeMime: "video/mp4",
    });
    expect(cleVignette(cle)).toBe(`medias/${UUID_A}/${UUID_B}/${UUID_C}.vignette.webp`);
    // Toujours WebP quel que soit le format d'origine : la vignette est produite
    // par nous, son format est donc notre décision.
    expect(cleVignette(cleMedia({
      shopId: UUID_A, orderId: UUID_B, mediaId: UUID_C, typeMime: "image/png",
    }))).toMatch(/\.vignette\.webp$/);
  });

  test("la couverture dérive comme la vignette, y compris sans extension", () => {
    /*
     * ⚠️ `cleCouverture` EMPLOYAIT UN POINT NON ÉCHAPPÉ : `/.[^./]+$/`, donc
     * « n'importe quel caractère » au lieu de « un point ». Sur les clés
     * d'aujourd'hui — un seul point, l'extension — le résultat était le même
     * PAR COÏNCIDENCE, le caractère à cette position étant justement un point.
     * `cleVignette`, sa jumelle, l'échappait déjà.
     *
     * Le cas qui les séparait : une clé SANS extension. L'ancienne expression
     * mangeait alors le séparateur et le dernier segment, et rendait une clé
     * du répertoire PARENT — `medias/{shop}/{order}.couverture.webp` au lieu
     * de `medias/{shop}/{order}/{media}.couverture.webp`.
     *
     * Aucune clé sans extension n'existe aujourd'hui : elles sont toutes
     * générées par le serveur à partir du type MIME. La protection tenait donc
     * à une ABSENCE — exactement ce qu'on refuse d'appeler une protection.
     */
    const cle = cleMedia({
      shopId: UUID_A,
      orderId: UUID_B,
      mediaId: UUID_C,
      typeMime: "image/jpeg",
    });
    expect(cleCouverture(cle)).toBe(`medias/${UUID_A}/${UUID_B}/${UUID_C}.couverture.webp`);

    // LES DEUX DÉRIVÉES SE COMPORTENT PAREIL — c'est la propriété qui manquait.
    const memeRacine = (c: string): string => c.replace(/\.(vignette|couverture)\.webp$/, "");
    expect(memeRacine(cleCouverture(cle))).toBe(memeRacine(cleVignette(cle)));

    // Le cas qui les séparait, éprouvé directement : sans extension, la clé
    // reste dans SON répertoire et ne remonte pas d'un cran.
    const sansExtension = `medias/${UUID_A}/${UUID_B}/${UUID_C}`;
    expect(cleCouverture(sansExtension)).toBe(`${sansExtension}.couverture.webp`);
    expect(memeRacine(cleCouverture(sansExtension))).toBe(memeRacine(cleVignette(sansExtension)));
  });

  test("le logo vit hors de l'espace des médias", () => {
    expect(cleLogo({ shopId: UUID_A, logoId: UUID_C, typeMime: "image/webp" })).toBe(
      `logos/${UUID_A}/${UUID_C}.webp`,
    );
  });
});

describe("Signature des URLs", () => {
  // Identifiants factices : la signature est un calcul local, elle n'exige
  // aucun compte. C'est précisément ce qui rend ces propriétés vérifiables à
  // chaque passage des portes, sans dépendre d'un service tiers.
  const ENV_FACTICE = {
    R2_ACCOUNT_ID: "compte-de-test",
    R2_ACCESS_KEY_ID: "cle-acces-de-test",
    R2_SECRET_ACCESS_KEY: "secret-de-test-suffisamment-long",
    R2_BUCKET: "bucket-de-test",
  } as const;

  let sauvegarde: Record<string, string | undefined> = {};

  beforeEach(async () => {
    sauvegarde = {};
    for (const [nom, valeur] of Object.entries(ENV_FACTICE)) {
      sauvegarde[nom] = process.env[nom];
      process.env[nom] = valeur;
    }
    const { oublierConfigR2 } = await import("@/lib/storage/config");
    oublierConfigR2();
  });

  afterEach(async () => {
    for (const [nom, valeur] of Object.entries(sauvegarde)) {
      if (valeur === undefined) delete process.env[nom];
      else process.env[nom] = valeur;
    }
    const { oublierConfigR2 } = await import("@/lib/storage/config");
    oublierConfigR2();
  });

  test("l'expiration est TOUJOURS explicite, jamais le défaut de 24 h", async () => {
    // aws4fetch pose `X-Amz-Expires=86400` quand on ne le précise pas. C'est
    // écrit dans son code source, pas dans sa documentation, et rien dans notre
    // code ne le laisserait deviner.
    const { signerDepot, signerLecture } = await import("@/lib/storage/r2");

    const depot = await signerDepot({
      cle: CLE_REELLE,
      typeMime: "image/png",
      tailleOctets: 1234,
    });
    const expiresDepot = new URL(depot.url).searchParams.get("X-Amz-Expires");
    expect(expiresDepot).not.toBeNull();
    expect(
      Number(expiresDepot),
      "L'URL de dépôt a hérité du défaut de 24 h d'aws4fetch.",
    ).not.toBe(86400);
    expect(Number(expiresDepot)).toBeLessThanOrEqual(3600);

    const lecture = await signerLecture(CLE_REELLE, 120);
    expect(new URL(lecture).searchParams.get("X-Amz-Expires")).toBe("120");
  });

  test("le DÉFAUT — celui que tout le produit emploie — borne à 15 minutes", async () => {
    /*
     * LE CONTRÔLE PRÉCÉDENT PASSE UNE DURÉE EXPLICITE, donc il ne dit RIEN de
     * la valeur que le produit emploie réellement : aucun appelant de
     * `signerLecture` ne passe d'argument. C'est exactement le champ de vision
     * d'un garde écrit après coup — il regarde là où le défaut n'est pas.
     *
     * ⚠️ CE NOMBRE EST LE DERNIER RÉSIDU DE LA COUPURE DE SUSPENSION. La page
     * cesse d'être servie instantanément, mais R2 ne révoque pas une URL déjà
     * signée : cette durée EST le temps pendant lequel les médias d'un compte
     * suspendu restent atteignables par qui avait la page ouverte. C'est la
     * coupure qui fonde notre statut d'hébergeur, donc ce n'est pas un réglage
     * de confort — l'allonger sans le décider est une décision produit prise
     * par accident.
     *
     * On interroge l'URL PRODUITE, pas la constante : comparer la constante à
     * elle-même prouverait qu'une déclaration existe, jamais qu'elle a un effet.
     */
    const { signerLecture, DUREE_LECTURE_DEFAUT_S } = await import("@/lib/storage/r2");

    const url = new URL(await signerLecture(CLE_REELLE));
    expect(
      url.searchParams.get("X-Amz-Expires"),
      "L'URL de lecture par défaut ne porte pas 900 s : la fenêtre pendant " +
        "laquelle un compte suspendu reste visible a changé sans être décidée.",
    ).toBe("900");
    expect(DUREE_LECTURE_DEFAUT_S, "la constante et l'URL divergent").toBe(900);
  });

  test("content-length et content-type sont DANS la signature du dépôt", async () => {
    // Sans eux, une URL prévue pour une photo laisse pousser des gigaoctets de
    // n'importe quel format. aws4fetch les exclut par défaut : c'est `allHeaders`
    // qui les réintègre, et rien d'autre ne le prouverait.
    const { signerDepot } = await import("@/lib/storage/r2");
    const { url, enTetesObligatoires } = await signerDepot({
      cle: CLE_REELLE,
      typeMime: "image/png",
      tailleOctets: 4242,
    });

    const signes = (new URL(url).searchParams.get("X-Amz-SignedHeaders") ?? "").split(";");
    expect(signes, `En-têtes signés : ${signes.join(",")}`).toContain("content-length");
    expect(signes).toContain("content-type");
    expect(signes).toContain("host");
    expect(enTetesObligatoires["content-length"]).toBe("4242");
  });

  test("la signature CHANGE si la taille change", () => {
    // Contre-test discriminant : constater que `content-length` figure dans la
    // liste des en-têtes signés ne prouverait pas que sa VALEUR entre dans le
    // calcul. Une liste peut être déclarative et la valeur ignorée.
    return (async () => {
      const { signerDepot } = await import("@/lib/storage/r2");
      const a = await signerDepot({
        cle: CLE_REELLE,
        typeMime: "image/png",
        tailleOctets: 1000,
      });
      const b = await signerDepot({
        cle: CLE_REELLE,
        typeMime: "image/png",
        tailleOctets: 1001,
      });
      const sigA = new URL(a.url).searchParams.get("X-Amz-Signature");
      const sigB = new URL(b.url).searchParams.get("X-Amz-Signature");
      expect(sigA).not.toBeNull();
      expect(
        sigA,
        "Deux tailles différentes produisent la même signature : la taille " +
          "n'entre pas réellement dans le calcul, la borne est décorative.",
      ).not.toBe(sigB);
    })();
  });

  test("une durée de lecture hors bornes est REFUSÉE", async () => {
    const { signerLecture, DureeHorsBornes, LECTURE_MAX_S } = await import("@/lib/storage/r2");
    await expect(signerLecture(CLE_REELLE, 5)).rejects.toThrow(DureeHorsBornes);
    await expect(signerLecture(CLE_REELLE, LECTURE_MAX_S + 1)).rejects.toThrow(
      DureeHorsBornes,
    );
    // Contre-test positif : une suite où tout est refusé passerait à 100 % sans
    // rien prouver.
    await expect(signerLecture(CLE_REELLE, 600)).resolves.toContain("X-Amz-Signature");
  });

  test("une taille annoncée absurde est REFUSÉE", async () => {
    const { signerDepot } = await import("@/lib/storage/r2");
    for (const taille of [0, -1, 1.5, Number.NaN]) {
      await expect(
        signerDepot({ cle: CLE_REELLE, typeMime: "image/png", tailleOctets: taille }),
        `taille ${taille} acceptée`,
      ).rejects.toThrow();
    }
  });
});

describe("Configuration", () => {
  const NOMS = [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET",
  ] as const;

  let sauvegarde: Record<string, string | undefined> = {};

  beforeEach(async () => {
    sauvegarde = {};
    for (const nom of NOMS) {
      sauvegarde[nom] = process.env[nom];
      process.env[nom] = `valeur-reelle-${nom.toLowerCase()}`;
    }
    const { oublierConfigR2 } = await import("@/lib/storage/config");
    oublierConfigR2();
  });

  afterEach(async () => {
    for (const [nom, valeur] of Object.entries(sauvegarde)) {
      if (valeur === undefined) delete process.env[nom];
      else process.env[nom] = valeur;
    }
    delete process.env["NEXT_PUBLIC_R2_ACCESS_KEY_ID"];
    const { oublierConfigR2 } = await import("@/lib/storage/config");
    oublierConfigR2();
  });

  test("une configuration complète est acceptée", async () => {
    const { stockageConfigure } = await import("@/lib/storage/config");
    expect(stockageConfigure()).toBe(true);
  });

  test("une variable VIDE est refusée, pas traitée comme absente", async () => {
    process.env["R2_BUCKET"] = "   ";
    const { oublierConfigR2, stockageConfigure } = await import("@/lib/storage/config");
    oublierConfigR2();
    expect(stockageConfigure()).toBe(false);
  });

  test("une valeur qui a la FORME d'une configuration est refusée", async () => {
    // Une validation de présence dirait « tout est là ». C'est précisément le
    // cas où l'on croit le stockage branché alors qu'aucun octet ne partira.
    for (const gabarit of ["votre-bucket", "YOUR_ACCOUNT_ID", "<a-remplir>", "changeme"]) {
      process.env["R2_BUCKET"] = gabarit;
      const { oublierConfigR2, stockageConfigure } = await import("@/lib/storage/config");
      oublierConfigR2();
      expect(stockageConfigure(), `« ${gabarit} » a été accepté`).toBe(false);
    }
  });

  test("une variable R2 exposée au navigateur fait ÉCHOUER la configuration", async () => {
    // La protection ne tient pas à ce que personne n'ait encore ajouté cette
    // variable : elle la cherche activement. Une protection qui repose sur une
    // absence n'est pas une protection (L-029).
    process.env["NEXT_PUBLIC_R2_ACCESS_KEY_ID"] = "quelque-chose";
    const { oublierConfigR2, stockageConfigure } = await import("@/lib/storage/config");
    oublierConfigR2();
    expect(
      stockageConfigure(),
      "Une clé R2 préfixée NEXT_PUBLIC_ part dans le bundle navigateur et donne " +
        "accès aux médias de tous les vendeurs.",
    ).toBe(false);
  });
});
