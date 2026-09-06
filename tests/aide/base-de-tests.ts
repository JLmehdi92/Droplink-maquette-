import pg from "pg";

/**
 * LE HARNAIS REFUSE DE TOURNER AILLEURS QUE SUR LA BASE DE TESTS.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI CE FICHIER EXISTE — ET CE QU'IL A DÉJÀ COÛTÉ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Jusqu'au 06/09/2026, il n'y avait qu'UN projet Supabase : les 716 suites RLS,
 * les 293 contrôles de fumée et le banc de mesure tournaient sur la base de
 * PRODUCTION. Ce n'était pas une négligence ponctuelle, c'était l'architecture.
 *
 * ⚠️ ET ELLE A DÉTRUIT DE VRAIES DONNÉES. Le 05/09, `tests/rls/surveillance`
 * portait un `delete from public.tracked_parcels where registered_at >= now() -
 * interval '30 days'` : chaque `pnpm gates` effaçait les colis réellement pris
 * en charge du mois — y compris ceux d'un vrai client, et chacun coûte 1 des
 * 200 prises en charge À VIE du fournisseur de suivi. La fumée, elle, mute
 * encore de vrais compteurs, et `tracking_notifications_vues` portait 186
 * empreintes de test sur 522 lignes.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI UN FICHIER DE CONFIGURATION NE SUFFIT PAS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `.env.test.local` bascule les suites vers le bon projet. Mais s'il disparaît
 * — un clone frais, une machine neuve, un fichier renommé — les suites
 * repartent sur la production EN SILENCE, et l'on retombe exactement dans
 * l'état qu'on vient de quitter. **Une protection qui tient à la présence d'un
 * fichier n'est pas une protection** (L-029) : c'est la même famille d'erreur
 * que « ce serait ouvert si quelqu'un ajoutait X ».
 *
 * DEUX GARDES, ET LES DEUX ÉCHOUENT FERMÉ :
 *
 *   1. LA LISTE NOIRE. La référence du projet de production est nommée ici, en
 *      clair. Toute cible qui la porte est refusée, quelle que soit la façon
 *      dont elle est arrivée dans l'environnement.
 *
 *   2. LA MARQUE EN BASE. La base doit se déclarer elle-même « base de tests »,
 *      par un commentaire posé sur la base de données. Une marque en base ne
 *      peut pas être recopiée par accident dans un `.env`, et elle survit à
 *      toute réécriture de la configuration.
 *
 * ⚠️ LA MARQUE N'EST PAS UNE TABLE, ET C'EST DÉLIBÉRÉ. `tests/rls/tables.test.ts`
 * compare `pg_tables` à l'inventaire du brief DANS LES DEUX SENS : une table de
 * marquage ferait rougir la suite sur la base de tests et pas sur la
 * production — l'inverse exact du but. Un commentaire de base n'appartient à
 * aucun inventaire de schéma.
 *
 * ⚠️ ET LA GARDE NE SE CONTENTE PAS DE L'ABSENCE DE LA PRODUCTION. Refuser
 * uniquement la production laisserait passer n'importe quelle troisième base —
 * celle d'un autre projet, celle d'un collègue. C'est la MARQUE qui autorise,
 * pas l'absence d'interdit.
 */

/** La production, nommée. Elle ne doit jamais être la cible d'une suite. */
export const REF_PRODUCTION = "csndfatwtbzqmhgqseem";

/** Ce que la base de tests doit dire d'elle-même. */
const MARQUE_ATTENDUE = "BASE DE TESTS";

export class CibleInterdite extends Error {}

/**
 * Refuse de continuer si la cible n'est pas, de façon prouvée, la base de tests.
 *
 * ⚠️ ELLE INTERROGE LA BASE PLUTÔT QUE DE LIRE UNE VARIABLE. Une variable dit
 * ce qu'on croit ; la base dit ce qui est. C'est la règle du projet appliquée à
 * la protection elle-même — *interroger, pas lire* (L-014).
 */
export async function exigerBaseDeTests(): Promise<void> {
  const url = (process.env["SUPABASE_DB_URL"] ?? "").trim();
  const api = (process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? "").trim();

  if (url === "" || api === "") {
    throw new CibleInterdite(
      "SUPABASE_DB_URL ou NEXT_PUBLIC_SUPABASE_URL absente : la cible des suites " +
        "est indéterminée. On refuse de commencer plutôt que de découvrir sur " +
        "quelle base on a écrit.",
    );
  }

  // ── GARDE 1 : la production, nommée et refusée ────────────────────────────
  if (url.includes(REF_PRODUCTION) || api.includes(REF_PRODUCTION)) {
    throw new CibleInterdite(
      `Les suites visent la PRODUCTION (${REF_PRODUCTION}). Refus. Elles créent ` +
        "de vrais comptes, mutent de vrais compteurs de colis, et l'une d'elles " +
        "a déjà effacé des colis réels le 05/09/2026. Créer ou renseigner " +
        "`.env.test.local` — voir `tests/aide/base-de-tests.ts`.",
    );
  }

  // ── GARDE 2 : la base doit se déclarer elle-même ──────────────────────────
  const client = new pg.Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20_000,
  });

  let marque: string | null;
  try {
    await client.connect();
    const { rows } = await client.query<{ m: string | null }>(
      "select shobj_description(oid, 'pg_database') as m from pg_database where datname = current_database()",
    );
    marque = rows[0]?.m ?? null;
  } finally {
    // Fermer quoi qu'il arrive : une connexion laissée ouverte par une garde
    // qui refuse ferait échouer le passage suivant pour une autre raison.
    await client.end().catch(() => undefined);
  }

  if (marque === null || !marque.includes(MARQUE_ATTENDUE)) {
    throw new CibleInterdite(
      "La base visée ne se déclare pas base de tests. Refus.\n" +
        `  Attendu dans le commentaire de la base : « ${MARQUE_ATTENDUE} »\n` +
        `  Lu : ${marque === null ? "(aucun commentaire)" : `« ${marque.slice(0, 80)} »`}\n` +
        "  La poser : comment on database postgres is '… BASE DE TESTS …';\n" +
        "  C'est la marque qui AUTORISE — refuser la seule production laisserait " +
        "passer n'importe quelle autre base.",
    );
  }
}
