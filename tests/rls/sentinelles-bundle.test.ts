import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * Sonde par VALEUR sur l'artefact construit.
 *
 * ⚠️ PÉRIMÈTRE, établi par falsification et non par supposition.
 *
 * Première version de cette sonde : elle ne lisait que `.next/static`. Un
 * secret passé en propriété d'un Server Component à un Client Component — le
 * chemin de fuite RÉEL, celui qu'on emprunte sans y penser — la traversait sans
 * la faire broncher. Vérifié : le secret atterrissait dans
 * `.next/server/app/*.html` et `*.rsc`, et dans ZÉRO fichier de `.next/static`.
 * La sonde regardait exactement au mauvais endroit, et son silence passait pour
 * une preuve.
 *
 * Elle lit désormais TOUTE la sortie de build : chunks clients, HTML prérendu,
 * et charges RSC.
 *
 * Limite qui subsiste, nommée plutôt que subie : une route rendue
 * DYNAMIQUEMENT ne produit aucun HTML au build, donc rien à inspecter ici. La
 * page publique `/p/[token]` sera dans ce cas. Sa couverture exige d'interroger
 * une VRAIE réponse HTTP, et cette sonde-là appartient au lot 6 — elle ne peut
 * pas être écrite avant que la route existe.
 *
 * Un contrôle par NOM ne prouve rien : une valeur voyage sous n'importe quel
 * nom, et un secret republié sous `meta`, `debug` ou `config` survit
 * intégralement à une recherche de « SERVICE_ROLE ». On cherche donc la valeur
 * elle-même, dans tout ce que le navigateur reçoit.
 *
 * Et conformément à L-032, la sonde établit d'abord que l'artefact CORRESPOND
 * au code sous test. « Il existe » et « il répond » sont les propriétés que tous
 * les résidus possèdent : un `.next/` d'un build antérieur aux modifications
 * passerait cette suite en prouvant seulement que l'ancien code était sain.
 */

const RACINE = process.cwd();
const SORTIE_BUILD = join(RACINE, ".next");

/**
 * Extensions de tout ce qui peut porter une valeur jusqu'au navigateur : les
 * chunks servis, mais aussi le HTML prérendu et les charges RSC, qui sont
 * envoyés au client au même titre.
 */
const EXTENSIONS_LIVREES = [".js", ".json", ".map", ".html", ".rsc", ".txt"];

function estLivreAuClient(chemin: string): boolean {
  return EXTENSIONS_LIVREES.some((e) => chemin.endsWith(e));
}

function listerFichiers(dossier: string, filtre?: (chemin: string) => boolean): string[] {
  const trouves: string[] = [];
  const parcourir = (courant: string): void => {
    let entrees: string[];
    try {
      entrees = readdirSync(courant);
    } catch {
      return;
    }
    for (const entree of entrees) {
      if (entree === "node_modules" || entree === ".git" || entree === "cache") continue;
      const chemin = join(courant, entree);
      const infos = statSync(chemin);
      if (infos.isDirectory()) parcourir(chemin);
      else if (filtre === undefined || filtre(chemin)) trouves.push(chemin);
    }
  };
  parcourir(dossier);
  return trouves;
}

function dateModifLaPlusRecente(fichiers: string[]): number {
  return fichiers.reduce((max, f) => Math.max(max, statSync(f).mtimeMs), 0);
}

/** Valeurs qui ne doivent JAMAIS apparaître dans ce que reçoit un navigateur. */
function secretsAChercher(): Array<{ nom: string; valeur: string }> {
  const secrets: Array<{ nom: string; valeur: string }> = [];

  const service = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (service !== undefined && service.length > 20) {
    secrets.push({ nom: "SUPABASE_SERVICE_ROLE_KEY", valeur: service });
  }

  const sel = process.env["HASH_SALT"];
  if (sel !== undefined && sel.length > 20) {
    secrets.push({ nom: "HASH_SALT", valeur: sel });
  }

  const urlBd = process.env["SUPABASE_DB_URL"];
  if (urlBd !== undefined && urlBd !== "") {
    try {
      const motDePasse = decodeURIComponent(new URL(urlBd).password);
      if (motDePasse.length >= 8) {
        secrets.push({ nom: "mot de passe de la base", valeur: motDePasse });
      }
    } catch {
      // URL illisible : traitée par le test de configuration, pas ici.
    }
  }

  for (const cle of ["R2_SECRET_ACCESS_KEY", "R2_ACCESS_KEY_ID", "RESEND_API_KEY"] as const) {
    const v = process.env[cle];
    if (v !== undefined && v.length > 12) secrets.push({ nom: cle, valeur: v });
  }

  return secrets;
}

describe("Sentinelles par valeur dans le bundle client", () => {
  test("l'artefact construit correspond au code source actuel", () => {
    // Sans cette assertion, toute la suite ci-dessous peut passer sur un build
    // périmé — et prouver la sûreté d'un code qui n'est plus celui qu'on livre.
    const sources = listerFichiers(join(RACINE, "src"));
    expect(sources.length, "aucun fichier source trouvé : la sonde vise à côté").toBeGreaterThan(0);

    let statBuild: ReturnType<typeof statSync>;
    try {
      statBuild = statSync(SORTIE_BUILD);
    } catch {
      throw new Error(
        "`.next/` absent. Lancer `pnpm build` avant cette suite : une sonde de " +
          "bundle sans bundle ne prouve rien, et la laisser passer serait pire " +
          "que de ne pas l'avoir.",
      );
    }
    expect(statBuild.isDirectory()).toBe(true);

    const sourceLaPlusRecente = dateModifLaPlusRecente(sources);
    const buildManifest = join(SORTIE_BUILD, "build-manifest.json");
    const dateBuild = statSync(buildManifest).mtimeMs;

    expect(
      dateBuild,
      `Le build (${new Date(dateBuild).toISOString()}) est ANTÉRIEUR à la source ` +
        `la plus récente (${new Date(sourceLaPlusRecente).toISOString()}). ` +
        "La suite examinerait un artefact qui ne correspond pas au code sous test.",
    ).toBeGreaterThanOrEqual(sourceLaPlusRecente);
  });

  test("la sonde inspecte réellement quelque chose", () => {
    const fichiersClient = listerFichiers(SORTIE_BUILD, estLivreAuClient);
    // Un ensemble vide passe tout : si le dossier statique est vide, l'absence
    // de secret ne dit rien.
    expect(
      fichiersClient.length,
      "aucun fichier livrable trouve dans .next : la sonde ne regarde rien",
    ).toBeGreaterThan(0);
  });

  test("contre-test positif : la sonde SAIT trouver une valeur présente", () => {
    // Une suite où tout est « absent » passe à 100 % sans rien prouver. On
    // vérifie donc que la méthode de recherche trouve une valeur dont on SAIT
    // qu'elle est dans le bundle : la clé publiable, qui a le droit d'y être.
    const publiable = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
    expect(publiable, "clé publiable absente de l'environnement de test").toBeTruthy();

    const fichiers = listerFichiers(SORTIE_BUILD, estLivreAuClient);
    const contenus = fichiers.map((f) => readFileSync(f, "utf8"));

    // La clé publiable n'est inlinée que si un composant client l'utilise. Tant
    // qu'aucun ne le fait, on se rabat sur une valeur dont la présence est
    // certaine : le nom du framework dans le runtime.
    const methodeTrouve = contenus.some((c) => c.includes(publiable as string));
    const temoinDeRepli = contenus.some((c) => c.includes("react"));
    expect(
      methodeTrouve || temoinDeRepli,
      "La méthode de recherche ne trouve RIEN dans le bundle, pas même un " +
        "témoin dont la présence est certaine. Son silence sur les secrets ne " +
        "vaut donc rien.",
    ).toBe(true);
  });

  test("aucun secret serveur n'apparaît dans ce que reçoit le navigateur", () => {
    const secrets = secretsAChercher();
    expect(
      secrets.length,
      "Aucun secret à chercher : l'environnement de test est vide, donc cette " +
        "sonde passerait quoi qu'il arrive.",
    ).toBeGreaterThan(0);

    const fichiers = listerFichiers(SORTIE_BUILD, estLivreAuClient);

    const fuites: string[] = [];
    for (const fichier of fichiers) {
      const contenu = readFileSync(fichier, "utf8");
      for (const secret of secrets) {
        if (contenu.includes(secret.valeur)) {
          fuites.push(`${secret.nom} dans ${relative(RACINE, fichier)}`);
        }
      }
    }

    expect(
      fuites,
      `FUITE DE SECRET DANS LE BUNDLE CLIENT : ${fuites.join(" | ")}. ` +
        "Un secret livré au navigateur est compromis définitivement, pour tous " +
        "les vendeurs à la fois.",
    ).toEqual([]);
  });
});
