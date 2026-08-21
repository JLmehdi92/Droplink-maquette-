import { Client } from "pg";

/**
 * Connexion directe à Postgres pour les sondes de sécurité.
 *
 * L'API REST de Supabase ne donne accès ni à `pg_class`, ni à `pg_proc`, ni aux
 * privilèges de colonne. Or les propriétés de sécurité qui comptent le plus
 * vivent exactement là, et sont invisibles à toute relecture de code (L-028).
 * Une sonde qui ne peut pas interroger le catalogue ne prouve rien.
 */
export async function ouvrirConnexionCatalogue(): Promise<Client> {
  const url = process.env["SUPABASE_DB_URL"];
  if (url === undefined || url === "") {
    throw new Error(
      "SUPABASE_DB_URL absente. Les sondes de sécurité interrogent le catalogue " +
        "Postgres en direct ; sans elle elles ne peuvent rien établir, et une " +
        "suite qu'on laisse passer faute de connexion est une suite qui ment.",
    );
  }

  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15_000,
  });
  await client.connect();
  return client;
}

/**
 * Exécute une requête et rend les lignes typées.
 *
 * Les paramètres sont PASSÉS, jamais interpolés : une sonde qui compose son SQL
 * par concaténation finit par tester la concaténation. Et la valeur qu'on
 * interpolerait ici est souvent celle qu'on cherche justement à faire échouer.
 */
export async function interroger<T extends Record<string, unknown>>(
  client: Client,
  sql: string,
  parametres: readonly unknown[] = [],
): Promise<T[]> {
  const resultat = await client.query<T>(sql, [...parametres]);
  return resultat.rows;
}
