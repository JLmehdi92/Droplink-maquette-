import "server-only";

/**
 * Configuration du stockage R2.
 *
 * Aucune de ces valeurs ne porte le préfixe `NEXT_PUBLIC_`, et ce n'est pas une
 * convention de nommage : une seule fuite donnerait accès aux médias de TOUS les
 * vendeurs, définitivement, puisqu'une clé compromise ne se révoque qu'à la main.
 * Le module est `server-only` pour que l'importer depuis un composant client
 * casse le build au lieu de fuiter en silence.
 *
 * La validation porte sur la SUBSTANCE, pas sur la présence. Une clé déclarée
 * mais vide, ou remplie d'un gabarit non substitué, franchirait toute
 * vérification de présence en laissant croire que le stockage est configuré
 * (L-026). Ici l'échec est explicite et nommé : on préfère un refus au démarrage
 * à un upload qui part vers nulle part.
 */

/** Marqueurs qu'un gabarit non substitué laisse derrière lui. */
const GABARITS = [
  "votre",
  "your",
  "xxx",
  "placeholder",
  "changeme",
  "a-remplir",
  "todo",
  "exemple",
  "example",
  "<",
  "[",
];

export type ConfigR2 = {
  readonly accountId: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly bucket: string;
  /** Racine du bucket, sans barre oblique finale. */
  readonly endpoint: string;
};

export class ConfigStockageManquante extends Error {
  constructor(public readonly details: readonly string[]) {
    super(
      `Stockage R2 non configuré : ${details.join(" ; ")}. ` +
        "Renseigner R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY et " +
        "R2_BUCKET dans .env.local (token Cloudflare en Object Read & Write, " +
        "limité au seul bucket).",
    );
    this.name = "ConfigStockageManquante";
  }
}

function lireVariable(nom: string, defauts: string[]): string | null {
  const brut = process.env[nom];
  if (brut === undefined) {
    defauts.push(`${nom} absente`);
    return null;
  }
  const valeur = brut.trim();
  if (valeur === "") {
    defauts.push(`${nom} vide`);
    return null;
  }
  const gabarit = GABARITS.find((g) => valeur.toLowerCase().includes(g));
  if (gabarit !== undefined) {
    // On ne cite JAMAIS la valeur : un message d'erreur voyage dans les
    // journaux, et un secret recopié dans un journal est un secret publié.
    defauts.push(`${nom} ressemble à un gabarit non substitué (contient « ${gabarit} »)`);
    return null;
  }
  return valeur;
}

/**
 * Vérifie qu'aucune variable R2 n'a été exposée au navigateur.
 *
 * Cette vérification ne tient PAS à l'absence de la variable : elle la cherche
 * activement. Une protection qui repose sur le fait que personne n'a encore
 * ajouté `NEXT_PUBLIC_R2_SECRET_ACCESS_KEY` n'est pas une protection, c'est un
 * sursis (L-029).
 */
function refuserVariablesPubliques(defauts: string[]): void {
  const fautives = Object.keys(process.env).filter(
    (nom) => nom.startsWith("NEXT_PUBLIC_") && nom.toUpperCase().includes("R2"),
  );
  for (const nom of fautives) {
    defauts.push(
      `${nom} est préfixée NEXT_PUBLIC_, donc incluse dans le bundle navigateur. ` +
        "Une clé R2 publiée donne accès aux médias de tous les vendeurs.",
    );
  }
}

let memo: ConfigR2 | null = null;

export function configR2(): ConfigR2 {
  if (memo !== null) return memo;

  const defauts: string[] = [];
  refuserVariablesPubliques(defauts);

  const accountId = lireVariable("R2_ACCOUNT_ID", defauts);
  const accessKeyId = lireVariable("R2_ACCESS_KEY_ID", defauts);
  const secretAccessKey = lireVariable("R2_SECRET_ACCESS_KEY", defauts);
  const bucket = lireVariable("R2_BUCKET", defauts);

  if (
    defauts.length > 0 ||
    accountId === null ||
    accessKeyId === null ||
    secretAccessKey === null ||
    bucket === null
  ) {
    throw new ConfigStockageManquante(defauts);
  }

  memo = {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  };
  return memo;
}

/** Vrai si le stockage est réellement utilisable. Ne lève pas. */
export function stockageConfigure(): boolean {
  try {
    configR2();
    return true;
  } catch {
    // L'appelant veut un booléen, pas un diagnostic : `configR2()` porte le
    // message détaillé pour qui a besoin de savoir POURQUOI.
    return false;
  }
}

/** Uniquement pour les tests : oublie la configuration mémorisée. */
export function oublierConfigR2(): void {
  memo = null;
}
