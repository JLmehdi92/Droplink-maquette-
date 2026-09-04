/**
 * QUEL EN-TÊTE LE BORD RÉÉCRIT-IL VRAIMENT ? — À LANCER UNE FOIS EN LIGNE.
 *
 * ⚠️ CETTE QUESTION NE SE RÈGLE PAS EN LISANT UNE DOCUMENTATION. `BORD_DE_CONFIANCE`
 * décide quel en-tête fait autorité pour identifier un visiteur, et toute la
 * limitation de débit publique ET le comptage des vues en dépendent. Deux
 * façons de se tromper, opposées et toutes deux silencieuses :
 *
 *   • le mode désigne un en-tête que le bord NE POSE PAS → aucune adresse
 *     n'est résolue → la page publique n'est plus limitée du tout ET
 *     `enregistrerVue` refuse d'écrire. Le compteur de vues, qui est une
 *     MÉTRIQUE DE VERDICT de la phase de validation, reste vide à jamais sans
 *     qu'une seule ligne d'erreur ne parte ;
 *   • le mode désigne un en-tête que le bord LAISSE PASSER → n'importe qui le
 *     forge, repart avec un quota neuf à chaque requête, et fabrique autant de
 *     vues qu'il veut.
 *
 * Les deux se voient de l'extérieur, et c'est ce que fait ce script — en boîte
 * noire, sans identifiants, contre le déploiement réel.
 *
 * LE CONTRE-TEST VIENT EN PREMIER, et il n'est pas une formalité : sans lui,
 * « l'en-tête forgé ne débloque rien » serait aussi vrai d'un produit qui ne
 * limite RIEN. On établit d'abord que le plafond MORD sur une série normale.
 *
 *   node scripts/verifier-bord.mjs https://mon-domaine <jeton-public> [en-tete]
 *
 * L'en-tête par défaut est `x-real-ip`, celui que Railway documente comme posé
 * par son bord. Passer `cf-connecting-ip` derrière Cloudflare.
 */

const [, , baseBrute, jeton, enTeteBrut] = process.argv;
const enTete = (enTeteBrut ?? "x-real-ip").toLowerCase();

if (!baseBrute || !jeton) {
  console.error(
    "Usage : node scripts/verifier-bord.mjs <base-url> <jeton-public> [en-tete]\n" +
      "Le jeton doit être celui d'une commande RÉELLE et servie : le plafond\n" +
      "d'un jeton valide (120/min) est celui qu'on mesure ; un jeton inconnu\n" +
      "répond 404 pour deux raisons différentes, donc ne prouve rien.",
  );
  process.exit(2);
}

const base = baseBrute.trim().replace(/\/+$/, "");
const url = `${base}/p/${jeton}`;

/** Le plafond d'un jeton valide, plus une marge : on veut le DÉPASSER. */
const TIRS = 150;

/**
 * Combien de requêtes en vol à la fois.
 *
 * Assez pour que les 150 tirs tiennent dans UNE fenêtre d'une minute — c'est la
 * condition pour qu'un plafond par minute puisse mordre — et assez peu pour ne
 * pas ressembler à une attaque contre son propre serveur.
 */
const CONCURRENCE = 25;

/**
 * Une série de requêtes, PAR VAGUES CONCURRENTES.
 *
 * ⚠️ CETTE FONCTION ÉTAIT SÉQUENTIELLE, ET C'EST CE QUI A FAIT MENTIR LA SONDE
 * À SON PREMIER USAGE RÉEL, le 04/09/2026 contre la production.
 *
 * Son commentaire disait : « en séquence et non en parallèle — 150 requêtes
 * lancées d'un coup se chevaucheraient sur deux fenêtres ». Le raisonnement
 * était exactement à l'envers. Sur un réseau réel, 150 requêtes SÉQUENTIELLES
 * prennent plus de deux minutes : elles s'étalent sur trois fenêtres d'une
 * minute et n'atteignent JAMAIS le plafond de 120 dans aucune. Relevé en base
 * ce jour-là — 49, puis 1, puis 2, sur trois fenêtres consécutives.
 *
 * La sonde a donc rendu « AUCUNE ADRESSE N'EST RÉSOLUE » sur un produit dont
 * l'adresse était parfaitement résolue et le compteur parfaitement tenu. Une
 * sonde qui crie au loup est pire qu'une absence de sonde : elle envoie
 * chercher un défaut là où il n'y en a pas, et on finit par l'ignorer.
 *
 * Les vagues concurrentes font tenir la série dans UNE fenêtre — c'est la seule
 * façon de faire mordre un plafond par minute.
 */
async function serie(forger) {
  const statuts = new Map();
  const compter = (s) => statuts.set(s, (statuts.get(s) ?? 0) + 1);

  for (let debut = 0; debut < TIRS; debut += CONCURRENCE) {
    const vague = [];
    for (let i = debut; i < Math.min(debut + CONCURRENCE, TIRS); i += 1) {
      const enTetes = { "user-agent": "sonde-bord/1" };
      if (forger) enTetes[enTete] = `203.0.113.${(i % 250) + 1}`;
      vague.push(
        fetch(url, { headers: enTetes, redirect: "manual" })
          .then((r) => r.status)
          .catch((erreur) => `transport:${String(erreur)}`),
      );
    }
    for (const statut of await Promise.all(vague)) compter(statut);
  }
  return statuts;
}

const decrire = (m) =>
  [...m.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s}×${n}`).join(" ");

/** Le plafond a-t-il mordu ? Un refus se présente en 404 — jamais en 429. */
const aMordu = (m) => (m.get(404) ?? 0) > 0;

console.log(`[bord] cible ${url}`);
console.log(`[bord] en-tête éprouvé : ${enTete}`);

// ── 1. CONTRE-TEST : le plafond existe-t-il seulement ? ─────────────────────
const normale = await serie(false);
console.log(`[bord] série normale      : ${decrire(normale)}`);

if ((normale.get(200) ?? 0) === 0) {
  console.error(
    "[bord] ÉCHEC : pas une seule réponse 200 sur une série normale. Le jeton\n" +
      "       est-il celui d'une commande servie ? Rien n'est mesurable ici.",
  );
  process.exit(1);
}

if (!aMordu(normale)) {
  console.error(
    `[bord] VERDICT : AUCUNE ADRESSE N'EST RÉSOLUE.\n` +
      `       ${TIRS} chargements depuis une seule adresse n'ont déclenché aucun refus,\n` +
      "       alors que le plafond est de 120 par minute. Le bord ne pose pas\n" +
      "       l'en-tête que BORD_DE_CONFIANCE désigne, donc :\n" +
      "         • la page publique n'est plus limitée du tout ;\n" +
      "         • AUCUNE VUE N'EST ENREGISTRÉE — la métrique de verdict est morte.\n" +
      "       Corriger BORD_DE_CONFIANCE sur le service web, puis relancer.",
  );
  process.exit(1);
}

// ── 2. LA MESURE : l'en-tête forgé rouvre-t-il le quota ? ───────────────────
//
// On attend une minute pleine : la fenêtre du compteur doit se refermer, sinon
// la seconde série hériterait des refus de la première et l'on conclurait à un
// bord sûr sans avoir rien éprouvé.
console.log("[bord] fenêtre en cours de fermeture (70 s)…");
await new Promise((r) => setTimeout(r, 70_000));

const forgee = await serie(true);
console.log(`[bord] série avec ${enTete} forgé : ${decrire(forgee)}`);

if (aMordu(forgee)) {
  console.log(
    `[bord] VERDICT : SÛR. Le bord RÉÉCRIT « ${enTete} » — une valeur forgée n'a pas\n` +
      "       rouvert le quota. Le mode configuré est le bon.",
  );
  process.exit(0);
}

console.error(
  `[bord] VERDICT : « ${enTete} » EST FORGEABLE.\n` +
    `       ${TIRS} requêtes portant chacune une adresse différente sont toutes passées :\n` +
    "       le bord laisse traverser ce que le client envoie. N'importe qui peut donc\n" +
    "       contourner la limitation publique et fabriquer des vues à volonté.\n" +
    "       NE PAS employer ce mode. Repasser BORD_DE_CONFIANCE sur un en-tête que\n" +
    "       le bord réécrit lui-même.",
);
process.exit(1);
