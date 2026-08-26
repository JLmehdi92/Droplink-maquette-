import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * LA COUPURE DE SUSPENSION SURVIVRA-T-ELLE AU PREMIER CACHE ?
 *
 * C'est la capacité technique qui fonde notre statut d'hébergeur : suspendre un
 * compte doit faire cesser de servir ses pages publiques. La chaîne est
 * `suspension en base → la vue filtre → invalidation du cache → la page cesse
 * de répondre`, et son mode de défaillance est SILENCIEUX : si l'invalidation
 * est mal câblée, elle n'échoue pas, elle ne trouve simplement rien à
 * invalider. La suspension s'enregistre, l'audit la consigne, l'écran affiche
 * « suspendu » — et la page publique continue d'être servie.
 *
 * ÉTAT ÉTABLI PAR EXÉCUTION (sonde de fumée, build de production servi) : la
 * coupure fonctionne aujourd'hui, en un dixième de seconde. Mais elle
 * fonctionne parce que la page publique lit les en-têtes de la requête pour la
 * limitation de débit, donc n'est PAS mise en cache. Ce n'est pas une
 * protection, c'est une absence de cache — et le fichier `lib/commandes/cache.ts`
 * le dit lui-même.
 *
 * ⚠️ CE QUE L'AUDIT DU 26/08/2026 A TROUVÉ, ET QUI RESTE VRAI :
 *
 * La RÉVOCATION d'un lien invalide bien ses deux jetons. La SUSPENSION, elle,
 * n'invalide aucune page publique — aucun appel, nulle part. L'asymétrie est
 * invisible tant qu'il n'y a pas de cache : le jour où quelqu'un enveloppe la
 * lecture publique dans un cache de données, la révocation resterait couverte
 * et la suspension ne couperait plus. Tout dirait que le compte est coupé.
 *
 * CE CONTRÔLE INTERROGE UNE FORME DE CODE, ET C'EST DÉLIBÉRÉ.
 *
 * Le dépôt refuse ailleurs les contrôles textuels, parce qu'ils prouvent qu'un
 * texte existe et jamais qu'une capacité est en place (L-020). Ici la chose
 * gardée EST une forme de code : « quelqu'un a-t-il ajouté un cache ? ». Il n'y
 * a pas d'effet à interroger tant que le cache n'existe pas — et quand il
 * existera, il sera trop tard pour s'en apercevoir autrement qu'en production,
 * sur la page d'un vendeur suspendu.
 *
 * Ce contrôle ne remplace donc pas la sonde de fumée, qui établit la coupure
 * par exécution. Il garde le SEUIL : il devient rouge à l'instant où l'on
 * introduit un cache sans avoir câblé l'invalidation qui va avec.
 */

const SRC = join(process.cwd(), "src");

/** Les formes qui mettent une lecture en cache de DONNÉES, dans Next 15. */
const MISES_EN_CACHE = [
  /\bunstable_cache\s*\(/,
  /\bcacheTag\s*\(/,
  /^\s*["']use cache["']/m,
  /\bcacheLife\s*\(/,
] as const;

function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function fichiers(racine: string): readonly string[] {
  const trouves: string[] = [];
  const parcourir = (dossier: string): void => {
    for (const entree of readdirSync(dossier)) {
      const chemin = join(dossier, entree);
      if (statSync(chemin).isDirectory()) parcourir(chemin);
      else if (chemin.endsWith(".ts") || chemin.endsWith(".tsx")) trouves.push(chemin);
    }
  };
  parcourir(racine);
  return trouves;
}

const TOUS = fichiers(SRC).map((chemin) => ({
  chemin,
  posix: chemin.split(/[\\/]/).join("/"),
  source: sansCommentaires(readFileSync(chemin, "utf8")),
}));

/** Les fichiers qui composent la lecture publique — ce qu'un cache toucherait. */
const SURFACE_PUBLIQUE = TOUS.filter(
  (f) => f.posix.includes("/src/lib/page-publique/") || f.posix.includes("/src/app/p/"),
);

/** L'action qui suspend un compte. */
const ACTION_SUSPENSION = TOUS.find((f) => f.posix.endsWith("/admin/comptes/[id]/actions.ts"));

describe("le seuil est gardé : pas de cache public sans invalidation à la suspension", () => {
  // UN ENSEMBLE VIDE PASSE TOUT. Si ces chemins étaient renommés, la suite
  // deviendrait verte en ne surveillant plus rien — exactement l'état qu'elle
  // est censée empêcher.
  test("la sonde trouve la surface publique et l'action de suspension", () => {
    expect(
      SURFACE_PUBLIQUE.length,
      "aucun fichier de la surface publique trouvé : la sonde vise à côté",
    ).toBeGreaterThan(3);
    expect(ACTION_SUSPENSION, "l'action de suspension est introuvable").toBeDefined();
  });

  test("aucun cache de données sur la lecture publique sans invalidation câblée", () => {
    const enCache = SURFACE_PUBLIQUE.filter((f) =>
      MISES_EN_CACHE.some((motif) => motif.test(f.source)),
    );

    if (enCache.length === 0) return; // Rien à garder tant que rien n'est en cache.

    const action = ACTION_SUSPENSION as (typeof TOUS)[number];
    const invalide = /revalidateTag\s*\(/.test(action.source);

    expect(
      invalide,
      "Un cache de données a été posé sur la lecture publique " +
        `(${enCache.map((f) => f.posix.split("/").pop()).join(", ")}), ` +
        "mais la suspension d'un compte n'invalide toujours rien. La coupure " +
        "cesserait de couper SANS ÉCHOUER : la suspension s'enregistrerait, " +
        "l'audit la consignerait, l'écran afficherait « suspendu », et la page " +
        "publique continuerait d'être servie depuis le cache.",
    ).toBe(true);
  });

  /*
   * LE CONTRE-TEST DU CONTRÔLE LUI-MÊME.
   *
   * Une sonde qui ne reconnaîtrait aucune forme de mise en cache passerait à
   * 100 % pour toujours, sans jamais rien garder. On lui donne donc un texte
   * témoin portant chacune des formes, et on exige qu'elle les voie TOUTES.
   */
  test.each([
    ['const lire = unstable_cache(async () => {}, ["x"]);', "unstable_cache"],
    ['cacheTag("commande-publique:abc");', "cacheTag"],
    ['"use cache";\nexport async function lire() {}', "use cache"],
    ["cacheLife({ revalidate: 60 });", "cacheLife"],
  ])("la sonde reconnaît « %s » (%s)", (temoin) => {
    expect(MISES_EN_CACHE.some((motif) => motif.test(temoin))).toBe(true);
  });

  test("la sonde ne prend PAS un texte ordinaire pour un cache", () => {
    // Discriminant : sans ce cas, une expression trop large — « cache » tout
    // court — passerait le contre-test ci-dessus tout en criant au loup sur
    // chaque commentaire qui parle de cache. Les fichiers de la surface
    // publique en parlent beaucoup.
    const temoin = "// La page n'est pas mise en cache : elle lit les en-têtes.";
    expect(MISES_EN_CACHE.some((motif) => motif.test(temoin))).toBe(false);
  });
});

describe("les chemins d'invalidation sont des chemins que Next sait résoudre", () => {
  /*
   * DÉFAUT RÉEL, TROUVÉ À L'AUDIT DU 26/08/2026.
   *
   * L'action de suspension appelait :
   *
   *     revalidatePath(`/[locale]/admin/comptes/${profilId}`, "page")
   *
   * — un segment de GABARIT littéral (`[locale]`) mêlé à une valeur CONCRÈTE.
   * Next accepte l'un ou l'autre, jamais le mélange : la chaîne ne correspond à
   * aucune entrée, l'appel réussit, et rien n'est invalidé. L'écran voisin
   * employait déjà la forme juste — le bon usage était connu, il n'avait
   * simplement pas été appliqué là.
   *
   * C'est le même mode de défaillance que la coupure : ça n'échoue pas, ça ne
   * trouve rien.
   */
  const APPELS = TOUS.flatMap((f) =>
    [...f.source.matchAll(/revalidatePath\(\s*([`"'])([^`"']*)\1/g)].map((m) => ({
      fichier: f.posix.split("/").slice(-2).join("/"),
      chemin: m[2] as string,
    })),
  );

  test("la sonde trouve réellement des appels", () => {
    expect(APPELS.length, "aucun revalidatePath trouvé : la lecture est fausse").toBeGreaterThan(3);
  });

  test("aucun chemin ne mêle gabarit et valeur concrète", () => {
    const hybrides = APPELS.filter(
      (a) => a.chemin.includes("[") && /\$\{|%s/.test(a.chemin),
    ).map((a) => `${a.fichier} → ${a.chemin}`);

    expect(
      hybrides,
      "Ces chemins mêlent un segment entre crochets et une valeur interpolée. " +
        "Next n'y reconnaît aucune entrée : l'appel réussit et n'invalide rien.",
    ).toEqual([]);
  });

  test("un chemin à crochets n'a AUCUN segment concret", () => {
    // L'autre moitié du même défaut : `/[locale]/admin/comptes/abc-123` est
    // hybride sans interpolation visible — un identifiant écrit en dur, ou
    // concaténé avant l'appel. On exige donc qu'un chemin portant des crochets
    // n'ait QUE des segments statiques ou des segments entre crochets.
    const suspects = APPELS.filter((a) => {
      if (!a.chemin.includes("[")) return false;
      return a.chemin
        .split("/")
        .filter((s) => s !== "")
        .some((s) => /^[0-9a-f-]{8,}$/i.test(s));
    }).map((a) => `${a.fichier} → ${a.chemin}`);

    expect(suspects, "Chemins de gabarit portant un identifiant concret").toEqual([]);
  });
});
