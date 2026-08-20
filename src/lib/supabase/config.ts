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

function lireVariable(nom: string, prefixeAttendu?: string): string {
  const brut = process.env[nom];
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

export function urlSupabase(): string {
  return lireVariable("NEXT_PUBLIC_SUPABASE_URL", "https://");
}

export function clePubliable(): string {
  return lireVariable("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
}

/**
 * Clé service-role. Jamais préfixée `NEXT_PUBLIC_` : une seule fuite donnerait
 * un accès total, RLS contournée, à toutes les données de tous les vendeurs.
 */
export function cleServiceRole(): string {
  return lireVariable("SUPABASE_SERVICE_ROLE_KEY");
}
