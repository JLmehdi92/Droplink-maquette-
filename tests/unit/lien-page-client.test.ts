import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, test } from "vitest";
import { cheminPageClient, lienPageClient } from "@/lib/liens/page-client";

/**
 * L'ADRESSE DE LA PAGE CLIENT N'A QU'UN SEUL POINT D'ÉMISSION.
 *
 * Elle en avait CINQ — l'éditeur, le tableau des commandes, l'export CSV,
 * l'export RGPD et la redirection « voir la page client » — et tant qu'il
 * n'existait qu'une forme d'adresse, cinq copies identiques ne coûtaient rien.
 *
 * Depuis les migrations 182-184 il y en a deux, et la sixième copie qu'on
 * ajoutera par distraction sera celle qui donne `/p/<jeton>` aux clients d'un
 * vendeur qui a payé pour son nom. Ça ne casse rien, ça ne lève rien, et ça
 * n'apparaît nulle part : c'est exactement le genre de défaut qu'aucune porte
 * ne voit.
 */

const RACINE = join(process.cwd(), "src");

/**
 * Les motifs qui FABRIQUENT l'adresse de la page à partir d'un jeton.
 *
 * ⚠️ ILS NE VISENT PAS LA CHAÎNE `/p/`, QUI EST PARTOUT. Les îlots de la page
 * client appellent `/p/<jeton>/qc`, `/p/<jeton>/vue`, `/p/<jeton>/media/<id>` —
 * ce sont des SOUS-ROUTES d'API, pas l'adresse qu'on donne à quelqu'un. Un
 * motif qui les attraperait obligerait à les déclarer en exception, et une
 * liste d'exceptions qui grossit finit par tout couvrir.
 *
 * Ce qu'on cherche est la CONCATÉNATION d'un préfixe `/p/` avec une valeur :
 * `"/p/" + jeton` ou `` `/p/${jeton}` ``.
 */
const INTERDITS: ReadonlyArray<{ readonly motif: RegExp; readonly pourquoi: string }> = [
  {
    motif: /["'`]\/p\/["'`]\s*\+/,
    pourquoi: '`"/p/" + jeton` fabrique une seconde adresse de page client',
  },
  {
    motif: /`[^`]*\/p\/\$\{[^}]+\}`/,
    pourquoi: "`` `…/p/${jeton}` `` fabrique une seconde adresse de page client",
  },
];

/**
 * Les fichiers qui ONT LE DROIT de la fabriquer, chacun avec sa raison.
 *
 * Le test échoue dans les DEUX SENS : un fichier qui fabrique l'adresse sans
 * être ici, et une exception qui ne désigne plus rien.
 */
const ADMIS: ReadonlyMap<string, string> = new Map([
  ["lib/liens/page-client.ts", "LE point d'émission. C'est lui que tout le reste doit appeler."],
  [
    "middleware.ts",
    "La réécriture `/<nom>/<jeton>` → `/p/<jeton>`. Elle ne fabrique pas une " +
      "adresse à MONTRER : elle traduit celle qu'on a reçue vers la route " +
      "interne qui la sert. Personne ne copie ce chemin.",
  ],
  [
    "components/publique/arbitrage-qc.tsx",
    "Appel de l'îlot d'arbitrage vers `/p/<jeton>/qc` — une SOUS-ROUTE d'API, " +
      "pas l'adresse de la page. Le jeton y est encodé par `encodeURIComponent`.",
  ],
  [
    "components/publique/carte-notifications.tsx",
    "Appel de la carte de suivi par e-mail vers `/p/<jeton>/notification` — une " +
      "SOUS-ROUTE d'API, pas l'adresse de la page. Le jeton y est encodé par `encodeURIComponent`.",
  ],
  [
    "components/publique/balise-vue.tsx",
    "Appel vers `/p/<jeton>/vue`, la sous-route qui compte une vue réelle.",
  ],
  [
    "components/publique/visionneur.tsx",
    "Appel vers `/p/<jeton>/media/<id>`, la sous-route qui signe un média.",
  ],
]);

function fichiersDeSrc(): string[] {
  const trouves: string[] = [];
  const parcourir = (dossier: string): void => {
    for (const entree of readdirSync(dossier)) {
      const chemin = join(dossier, entree);
      if (statSync(chemin).isDirectory()) {
        parcourir(chemin);
        continue;
      }
      if (/\.(ts|tsx)$/.test(entree)) trouves.push(relative(RACINE, chemin).split(sep).join("/"));
    }
  };
  parcourir(RACINE);
  return trouves;
}

/**
 * Le CODE, commentaires retirés.
 *
 * Un motif de garde qui cherche une forme dans le texte brut se satisfait du
 * commentaire qui DÉCRIT cette forme (L-031) — et ce dépôt en est rempli, à
 * commencer par les commentaires qui racontent précisément le défaut corrigé.
 */
function codeSansCommentaires(relatif: string): string {
  return readFileSync(join(RACINE, relatif), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("L'adresse de la page client — un seul point d'émission", () => {
  test("la sonde balaie réellement le code source", () => {
    // UN ENSEMBLE VIDE PASSE TOUT. Si la lecture récursive cassait, le contrôle
    // principal porterait sur une liste vide et resterait vert sans rien voir.
    const fichiers = fichiersDeSrc();
    expect(fichiers.length, "aucun fichier lu sous src/ : la sonde vise à côté").toBeGreaterThan(80);
    expect(fichiers, "le point d'émission est introuvable").toContain("lib/liens/page-client.ts");
  });

  test("la sonde SAIT reconnaître les formes qu'elle interdit", () => {
    /*
     * CONTRE-TEST POSITIF, ET IL N'EST PAS DÉCORATIF. Une expression
     * rationnelle cassée ne trouverait plus rien nulle part, et le contrôle
     * suivant passerait à 100 % en ne regardant rien. On lui fait donc
     * reconnaître les formes EXACTES qui étaient dans le produit le 20/09 au
     * matin, relevées une par une.
     */
    const AVANT = [
      'const lienPublic = origine === "" ? "/p/" + jetonCourant : origine + "/p/" + jetonCourant;',
      'lien={origine + "/p/" + ligne.jetonPublic}',
      'cellule(origine + "/p/" + l.jetonPublic),',
      "lien_public: `${origine}/p/${public_token}`,",
      'redirect("/p/" + data.public_token);',
    ];
    for (const ligne of AVANT) {
      const vus = INTERDITS.filter(({ motif }) => motif.test(ligne));
      expect(vus.length, `aucun motif ne reconnaît : ${ligne}`).toBeGreaterThan(0);
    }
  });

  test("aucun fichier ne fabrique l'adresse en dehors du point d'émission", () => {
    const fautes: string[] = [];
    for (const relatif of fichiersDeSrc()) {
      if (ADMIS.has(relatif)) continue;
      const code = codeSansCommentaires(relatif);
      for (const { motif, pourquoi } of INTERDITS) {
        if (motif.test(code)) fautes.push(`${relatif} → ${pourquoi}`);
      }
    }
    expect(
      fautes,
      "Ces fichiers fabriquent l'adresse de la page client à la main. Il y en a " +
        "DEUX formes depuis les migrations 182-184, et celle-ci donnerait " +
        "`/p/<jeton>` aux clients d'un vendeur qui a payé pour son nom — sans " +
        "rien casser, donc sans rien signaler. Employer `lienPageClient()`.",
    ).toEqual([]);
  });

  test("aucune exception ne survit à ce qu'elle exemptait", () => {
    // Une exception qu'on oublie de retirer devient une autorisation permanente
    // de refaire le défaut, à l'endroit précis où on avait promis de ne pas.
    const inutiles: string[] = [];
    for (const relatif of ADMIS.keys()) {
      const code = codeSansCommentaires(relatif);
      if (!INTERDITS.some(({ motif }) => motif.test(code))) inutiles.push(relatif);
    }
    expect(
      inutiles,
      `Ces exceptions ne couvrent plus rien : ${inutiles.join(", ")}. Les retirer.`,
    ).toEqual([]);
  });
});

describe("Ce que le point d'émission rend", () => {
  const JETON = "xK9mQ2pL7vR4nT8wY3zB1";

  test("sans nom de lien, l'adresse historique", () => {
    expect(cheminPageClient(JETON, null)).toBe(`/p/${JETON}`);
    expect(lienPageClient("https://droplink.fr", JETON, null)).toBe(
      `https://droplink.fr/p/${JETON}`,
    );
  });

  test("avec un nom de lien, l'adresse au nom du vendeur", () => {
    expect(cheminPageClient(JETON, "atelier-nord")).toBe(`/atelier-nord/${JETON}`);
    expect(lienPageClient("https://droplink.fr", JETON, "atelier-nord")).toBe(
      `https://droplink.fr/atelier-nord/${JETON}`,
    );
  });

  test.each(["", "   "])("un nom VIDE (« %s ») retombe sur `/p/`, sans produire `//`", (vide) => {
    /*
     * ⚠️ LE CONTRÔLE QUI COMPTE LE PLUS DE CE BLOC. `/${""}/${jeton}` s'écrit
     * `//<jeton>` : une URL relative au PROTOCOLE, que le navigateur résout
     * vers un AUTRE domaine. Le produit a déjà eu une redirection ouverte le
     * 01/09/2026 ; la même famille se refermerait ici, sur l'adresse que le
     * vendeur colle dans ses messages.
     */
    const chemin = cheminPageClient(JETON, vide);
    expect(chemin).toBe(`/p/${JETON}`);
    expect(chemin.startsWith("//"), "adresse relative au protocole").toBe(false);
  });

  test("une origine vide rend un chemin, jamais une adresse inventée", () => {
    // `origineDuSite()` rend `null` quand `NEXT_PUBLIC_SITE_URL` manque. Une
    // origine de secours donnerait une adresse qui a la FORME d'un lien sans en
    // être un — et personne ne verrait la différence avant qu'un client clique.
    expect(lienPageClient("", JETON, "atelier-nord")).toBe(`/atelier-nord/${JETON}`);
  });
});
