/**
 * UN PASSAGE DE PLANIFICATEUR, POUR RAILWAY.
 *
 * Railway ne fait pas d'appel HTTP planifié : il RELANCE la commande de
 * démarrage d'un service, qui doit se terminer proprement. Ce script est donc
 * cette commande — il appelle UNE route, dit ce qu'il a obtenu, et sort.
 *
 * ⚠️ UN SEUL PASSAGE PAR APPEL, ET C'EST UNE EXIGENCE DU BRIEF, PAS UNE
 * COMMODITÉ. « Le veilleur doit être hors du planificateur veillé : une tâche
 * qui surveille les tâches s'arrête avec elles. » Un script unique qui
 * appellerait la cadence PUIS la veille les ferait tomber ensemble, et il ne
 * resterait personne pour le constater. D'où deux services Railway distincts,
 * qui invoquent ce même fichier avec un argument différent.
 *
 * ⚠️ CES DEUX SERVICES SE SAISISSENT À LA MAIN, DANS L'INTERFACE DE RAILWAY,
 * et le dépôt ne peut rien y faire : « New services cannot opt into Config as
 * Code » (docs.railway.com, relevé le 06/09/2026). Ce qu'il faut y taper —
 * commandes, horaires, politique de redémarrage, variables — est tenu à jour
 * dans `deploiement/services-planifies.ts`, que `tests/unit/deploiement.test.ts`
 * compare à ce fichier-ci dans les deux sens.
 *
 * ⚠️ IL SORT EN ERREUR QUAND L'APPEL ÉCHOUE, et c'est tout ce qui rend une
 * panne visible ici. Le contrat de ces routes a été MESURÉ le 04/09/2026 sur
 * un build servi :
 *
 *   POST + `Authorization: Bearer <CRON_SECRET>`  →  200
 *   POST sans en-tête                             →  404
 *   POST avec un mauvais secret                   →  404
 *   GET                                           →  404
 *
 * Le 404 est délibéré — un 401 confirmerait l'existence de la route à qui n'y
 * a pas droit — mais il a une conséquence ici : un appel mal formé ressemble
 * exactement à une route inexistante. Sans code de sortie non nul, une faute
 * de frappe dans le secret produirait des passages « réussis » à jamais.
 */

const ROUTES = Object.freeze({
  cadence: "/api/suivi/cadence",
  veille: "/api/veille",
});

const tache = process.argv[2];
const chemin = ROUTES[tache];

if (chemin === undefined) {
  console.error(
    `[planificateur] tâche inconnue : « ${tache ?? "(aucune)"} ». ` +
      `Attendu : ${Object.keys(ROUTES).join(" ou ")}.`,
  );
  process.exit(2);
}

/*
 * L'ADRESSE VIENT DE L'ENVIRONNEMENT, JAMAIS D'UN DÉFAUT. Un repli sur
 * `localhost` marcherait sur cette machine et appellerait, en production, un
 * serveur qui n'est pas le produit — le genre de succès qui ne prouve rien.
 */
const base = (process.env["PLANIFICATEUR_BASE_URL"] ?? "").trim().replace(/\/+$/, "");
const secret = (process.env["CRON_SECRET"] ?? "").trim();

const manquantes = [
  base === "" ? "PLANIFICATEUR_BASE_URL" : null,
  secret === "" ? "CRON_SECRET" : null,
].filter((v) => v !== null);

if (manquantes.length > 0) {
  console.error(`[planificateur] variable(s) absente(s) : ${manquantes.join(", ")}`);
  process.exit(2);
}

/*
 * ⚠️ UNE VARIABLE PRÉSENTE N'EST PAS UNE VARIABLE SUBSTITUÉE (L-026).
 *
 * Railway laisse un service emprunter la valeur d'un autre :
 * `CRON_SECRET=${{droplink2.CRON_SECRET}}`. C'est la bonne façon de la poser —
 * elle n'est jamais recopiée à la main, donc jamais mal recopiée, et la
 * régénérer d'un côté la propage de l'autre.
 *
 * Mais si le nom du service est faux d'une lettre, Railway ne résout rien et
 * transmet la CHAÎNE ELLE-MÊME. Elle est non vide, elle passe le contrôle
 * ci-dessus, elle part dans l'en-tête — et la route répond 404, exactement
 * comme à un inconnu, parce que c'est ainsi qu'elle est conçue. On chercherait
 * alors une route disparue là où c'est une référence qui n'a pas pris.
 *
 * Le motif `${{ … }}` n'a aucun sens dans une valeur substituée : sa seule
 * présence ici prouve que la substitution n'a pas eu lieu.
 */
const nonSubstituees = [
  ["PLANIFICATEUR_BASE_URL", base],
  ["CRON_SECRET", secret],
]
  .filter(([, valeur]) => valeur.includes("${{"))
  .map(([nom]) => nom);

if (nonSubstituees.length > 0) {
  console.error(
    `[planificateur] variable(s) NON SUBSTITUÉE(S) : ${nonSubstituees.join(", ")} — ` +
      `Railway a transmis la référence au lieu de sa valeur. Le nom du service ` +
      `cité entre \${{ }} ne correspond à aucun service de ce projet : le vérifier ` +
      `au caractère près, majuscules comprises.`,
  );
  process.exit(2);
}

const debut = Date.now();
let reponse;
try {
  reponse = await fetch(`${base}${chemin}`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(120_000),
  });
} catch (erreur) {
  // On NOMME le transport. « Échec » sans motif envoie chercher un défaut du
  // produit là où c'est le réseau qui n'a pas répondu.
  console.error(`[planificateur] ${tache} : transport en échec — ${String(erreur)}`);
  process.exit(1);
}

const duree = Date.now() - debut;

if (!reponse.ok) {
  /*
   * Le 404 est le cas le plus probable, et le plus trompeur : il ne veut pas
   * dire « la route n'existe pas », il veut dire « le secret n'a pas été
   * accepté » — c'est la même réponse par conception. On le dit, parce que
   * chercher une route disparue quand c'est une variable mal recopiée fait
   * perdre exactement le temps qu'un planificateur doit faire gagner.
   */
  const indice =
    reponse.status === 404
      ? " — 404 signifie ici « secret refusé », pas « route absente » : vérifier CRON_SECRET"
      : "";
  console.error(`[planificateur] ${tache} : statut ${reponse.status} en ${duree} ms${indice}`);
  process.exit(1);
}

const corps = await reponse.text();
console.log(`[planificateur] ${tache} : 200 en ${duree} ms — ${corps.slice(0, 300)}`);
