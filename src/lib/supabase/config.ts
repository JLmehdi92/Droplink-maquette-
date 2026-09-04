/**
 * Lecture de la configuration Supabase, en un seul endroit.
 *
 * Une valeur qui a la FORME d'une configuration franchit toutes les validations
 * de présence (L-026) : `sb_publishable_VOTRE_CLE` est une chaîne non vide, et
 * un contrôle qui se contente de vérifier « non vide » la laisse passer. On
 * vérifie donc la SUBSTANCE, pas seulement la présence.
 */

/** Marqueurs de gabarit qu'un copier-coller d'exemple laisse derrière lui. */
const MARQUEURS_DE_GABARIT = [
  "votre",
  "your",
  "xxx",
  "placeholder",
  "changeme",
  "a-remplir",
  "todo",
  "<",
  "[",
];

/**
 * ⚠️ LA VALEUR EST PASSÉE, PAS LE NOM — ET C'EST UN DÉFAUT DE PRODUCTION.
 *
 * Cette fonction lisait `process.env[nom]`, avec le nom en PARAMÈTRE. Un accès
 * indexé par une variable n'est PAS analysable statiquement : le bundler ne peut
 * pas l'inliner au build. Mesuré le 04/09/2026 sur le premier déploiement :
 *
 *     NEXT_PUBLIC_SITE_URL figée dans le bundle serveur     -> 1
 *                          figée dans le bundle middleware  -> 0
 *
 * Or le MIDDLEWARE tourne en exécution « edge », qui ne reçoit PAS
 * l'environnement ambiant du conteneur : elle ne voit que ce qui a été inliné
 * au build, plus ce qu'un fichier `.env` a chargé. D'où un défaut invisible en
 * développement et systématique en production — en local, Next charge
 * `.env.local` et le transmet au bac à sable ; sur Railway il n'y a aucun
 * fichier `.env`, et le middleware levait à CHAQUE requête :
 *
 *     Error: Variable d'environnement NEXT_PUBLIC_SUPABASE_URL absente.
 *
 * Le message était juste et le diagnostic impossible : la variable ÉTAIT posée.
 *
 * Les appelants passent donc la valeur par un accès à CLÉ LITTÉRALE, que le
 * bundler sait remplacer au build. La validation, elle, ne change pas : c'est
 * toujours la SUBSTANCE qu'on vérifie, pas la présence.
 *
 * ⚠️ CE QUI COMPTE EST LE LITTÉRAL, PAS LA NOTATION — établi par falsification
 * le 04/09, contre ce que j'avais d'abord écrit ici.
 * `process.env["NEXT_PUBLIC_SUPABASE_URL"]` est inliné exactement comme
 * `process.env.NEXT_PUBLIC_SUPABASE_URL` : ma première falsification, qui ne
 * remplaçait que le point par des crochets, est restée VERTE. Seule une clé
 * venue d'une VARIABLE échappe au bundler — c'est elle qui a produit le rouge,
 * et c'est exactement la forme qu'avait le défaut d'origine.
 */
function validerVariable(nom: string, brut: string | undefined, prefixeAttendu?: string): string {
  if (brut === undefined || brut.trim() === "") {
    throw new Error(
      `Variable d'environnement ${nom} absente. Le client Supabase ne peut pas ` +
        "être construit ; échouer ici est préférable à démarrer sur une " +
        "configuration incomplète, qui ne se manifesterait qu'à la première " +
        "requête, ailleurs, sans dire pourquoi.",
    );
  }

  const valeur = brut.trim();
  const minuscule = valeur.toLowerCase();
  const marqueur = MARQUEURS_DE_GABARIT.find((m) => minuscule.includes(m));
  if (marqueur !== undefined) {
    throw new Error(
      `Variable ${nom} contient « ${marqueur} » : c'est un gabarit non substitué, ` +
        "pas une vraie valeur. Valider la présence n'aurait rien dit de la substitution.",
    );
  }

  if (prefixeAttendu !== undefined && !valeur.startsWith(prefixeAttendu)) {
    throw new Error(
      `Variable ${nom} ne commence pas par « ${prefixeAttendu} ». Une clé du ` +
        "mauvais type placée ici passerait toutes les validations de forme et " +
        "échouerait à l'usage, loin d'ici.",
    );
  }

  return valeur;
}

/*
 * ⚠️ CES DEUX-CI SONT LUES DEPUIS LE MIDDLEWARE, donc depuis l'exécution
 * « edge ». Leur nom DOIT rester un LITTÉRAL pour que le bundler
 * les inline au build — voir le bloc de `validerVariable`. Les remplacer par un
 * nom passé par variable remettrait le défaut du 04/09, invisible en local et
 * systématique en production.
 */
export function urlSupabase(): string {
  return validerVariable(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    "https://",
  );
}

export function clePubliable(): string {
  return validerVariable(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

/**
 * Clé service-role. Jamais préfixée `NEXT_PUBLIC_` : une seule fuite donnerait
 * un accès total, RLS contournée, à toutes les données de tous les vendeurs.
 */
export function cleServiceRole(): string {
  // Lue UNIQUEMENT depuis Node, jamais depuis le middleware : l inlining ne
  // la concerne pas, et surtout on ne VEUT PAS la figer dans un bundle.
  return validerVariable("SUPABASE_SERVICE_ROLE_KEY", process.env["SUPABASE_SERVICE_ROLE_KEY"]);
}
