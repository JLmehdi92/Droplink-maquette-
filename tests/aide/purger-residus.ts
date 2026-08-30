import { clientService } from "./utilisateurs";

/**
 * PURGE DES COMPTES DE TEST ABANDONNÉS.
 *
 * DÉFAUT CONSTATÉ, PAS ANTICIPÉ. Le 21/08/2026, la base est passée en LECTURE
 * SEULE : 930 Mo occupés, quota atteint. Cause : 47 comptes de test survivants,
 * portant 288 001 commandes, 2 112 000 événements et 1 061 430 vues — le résidu
 * de jeux de mesure successifs.
 *
 * CHAQUE SUITE NETTOIE POURTANT DERRIÈRE ELLE. Mais `afterAll` NE S'EXÉCUTE PAS
 * quand `beforeAll` échoue — et il a échoué, régulièrement, sur le quota
 * d'authentification. Chaque échec laissait donc derrière lui la volumétrie
 * d'une mesure entière, et l'accumulation était invisible : rien n'échouait,
 * jusqu'au jour où plus rien ne fonctionnait, d'un coup, pour une raison sans
 * rapport apparent avec le code qu'on venait de toucher.
 *
 * UNE PROTECTION QUI TIENT À UNE ABSENCE N'EN EST PAS UNE : compter sur le fait
 * que `afterAll` s'exécute toujours revenait à se protéger par une absence
 * d'échec. La purge est donc faite À L'ENTRÉE, où rien ne peut l'avoir sautée.
 *
 * ELLE NE TOUCHE QUE CE QU'ELLE PEUT PROUVER JETABLE : le domaine
 * `@droplink-test.invalid` — réservé par la RFC 2606, donc impossible à
 * enregistrer — ET une ancienneté supérieure au délai ci-dessous, pour ne jamais
 * emporter les comptes d'une exécution parallèle en cours.
 */

/**
 * Deux heures : très au-delà de la plus longue suite (moins de trois minutes),
 * et très en deçà du temps qu'il faut pour accumuler un quota. Un délai trop
 * court emporterait les comptes d'une suite voisine encore en train de mesurer.
 */
const ANCIENNETE_HEURES = 2;

const DOMAINE_DE_TEST = "@droplink-test.invalid";

export async function purgerResidusDeTest(): Promise<number> {
  const service = clientService();

  const { data, error } = await service.auth.admin.listUsers({ page: 1, perPage: 1_000 });
  if (error !== null) {
    // Pas de `catch` muet — mais pas de blocage non plus : cette purge est une
    // hygiène, pas une garde. La faire échouer empêcherait de mesurer pour une
    // raison sans rapport avec ce qu'on mesure.
    console.warn("[harnais] purge des résidus impossible : " + error.message);
    return 0;
  }

  const limite = Date.now() - ANCIENNETE_HEURES * 3_600_000;
  const jetables = data.users.filter(
    (u) =>
      typeof u.email === "string" &&
      u.email.endsWith(DOMAINE_DE_TEST) &&
      Date.parse(u.created_at) < limite,
  );

  let supprimes = 0;
  for (const u of jetables) {
    // La suppression du compte auth emporte le profil, la boutique, les
    // commandes, les médias et les colis par cascade : c'est le seul geste à
    // faire, et il n'y a donc pas d'ordre à respecter qu'on pourrait se tromper.
    const { error: echec } = await service.auth.admin.deleteUser(u.id);
    if (echec === null) supprimes += 1;
    else console.warn(`[harnais] ${u.email ?? u.id} non supprimé : ${echec.message}`);
  }

  if (supprimes > 0) {
    console.warn(
      `[harnais] ${supprimes} compte(s) de test abandonné(s) purgé(s). ` +
        "Ils viennent d'exécutions dont la mise en place a échoué : `afterAll` " +
        "ne s'exécute pas quand `beforeAll` échoue.",
    );
  }

  return supprimes;
}

/**
 * Rend les paramètres système à leur état d'origine : AUCUNE LIGNE.
 *
 * `system_settings` est globale au produit — elle ne porte aucune isolation par
 * compte. Cinq suites y écrivent des seuils pour éprouver qu'ils sont bien LUS,
 * et aucune ne les défaisait : le plafond de colis valait 33 sur la base de
 * développement, écrit par une exécution passée, et la fiche d'un compte
 * affichait « 5 sur 33 » à un humain venu mesurer autre chose.
 *
 * ON EFFACE, ON NE RÉÉCRIT PAS LE DÉFAUT. Une ligne absente est l'état normal du
 * produit ; réinsérer 1 200 ferait croire que quelqu'un a choisi ce seuil, et le
 * test « sans paramètre écrit, les défauts s'appliquent » n'aurait plus rien à
 * observer.
 */
export async function rendreLesParametresAuDefaut(): Promise<void> {
  const service = clientService();
  const { error } = await service.from("system_settings").delete().neq("key", "");
  if (error !== null) {
    // Hygiène, pas garde : la faire échouer empêcherait de mesurer pour une
    // raison sans rapport avec ce qu'on mesure.
    console.warn("[harnais] remise à zéro des paramètres impossible : " + error.message);
  }
}

/**
 * Efface les battements de tâches de fond.
 *
 * ⚠️ `scheduler_heartbeat` EST GLOBALE, ET L'ABSENCE DE LIGNE Y EST
 * L'INFORMATION. Les suites y écrivent des battements pour éprouver les trois
 * états, et ils SURVIVENT : la base de développement portait `cadence-suivi` —
 * une tâche de l'inventaire, donc affichée — et `source-fantome`, un résidu pur.
 * L'écran de surveillance montrait « actif » puis « en retard » au fil des
 * minutes, selon des battements que personne n'avait voulus.
 *
 * C'est PIRE que le résidu d'un paramètre : celui-ci ne fausse pas une valeur,
 * il fait passer une tâche de « jamais exécutée » à « en retard », c'est-à-dire
 * d'un constat à une ALERTE. Et une alerte qui se trompe est une alerte qu'on
 * apprend à ignorer.
 */
export async function effacerLesBattements(): Promise<void> {
  const service = clientService();
  const { error } = await service.from("scheduler_heartbeat").delete().neq("source", "");
  if (error !== null) {
    console.warn("[harnais] effacement des battements impossible : " + error.message);
  }
}

/**
 * La taille de la base, en octets.
 *
 * Elle passe par une connexion Postgres DIRECTE : `pg_database_size` n'est pas
 * exposée par PostgREST, et c'est justement le genre de fait qu'aucune requête
 * applicative ne peut établir.
 */
export async function tailleBase(): Promise<number> {
  const { ouvrirConnexionCatalogue } = await import("./base");
  const bd = await ouvrirConnexionCatalogue();
  try {
    const { rows } = await bd.query<{ n: string }>(
      "select pg_database_size(current_database())::bigint as n",
    );
    return Number(rows[0]?.n ?? 0);
  } finally {
    await bd.end();
  }
}

/**
 * Rend au système l'espace que les suppressions ont laissé mort.
 *
 * ⚠️ `DELETE` NE REND RIEN. Il marque les lignes mortes ; l'autovacuum les
 * réutilise, mais le fichier ne rétrécit pas. Seul `VACUUM FULL` le réécrit —
 * et c'est pour cela que la base a pu glisser jusqu'à 930 Mo puis 753 Mo alors
 * qu'une purge tournait à l'entrée de chaque suite.
 *
 * Les tables visées sont celles que les jeux de mesure font gonfler ; les
 * autres ne pèsent rien et un `VACUUM FULL` inutile coûte un verrou exclusif.
 */
export async function rendreLEspace(): Promise<number> {
  const { ouvrirConnexionCatalogue } = await import("./base");
  const bd = await ouvrirConnexionCatalogue();
  try {
    for (const table of [
      "public.orders",
      "public.order_media",
      "public.order_events",
      "public.link_views",
      "public.admin_audit_log",
      "public.tracked_parcels",
      "public.parcel_checkpoints",
      "public.tracking_snapshots",
      "public.shops",
      "public.profiles",
    ]) {
      await bd.query(`vacuum (full, analyze) ${table}`);
    }
    const { rows } = await bd.query<{ n: string }>(
      "select pg_database_size(current_database())::bigint as n",
    );
    return Number(rows[0]?.n ?? 0);
  } finally {
    await bd.end();
  }
}
