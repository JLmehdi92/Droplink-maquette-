/**
 * LES CONTRÔLES DE PRODUCTION, EN LECTURE SEULE.
 *
 * ⚠️ IL COMBLE UN TROU OUVERT LE 06/09/2026, ET `CLAUDE.md` LE DIT DEPUIS. Le
 * jour où les suites ont cessé de tourner sur la production — décision juste,
 * elles y effaçaient de vrais colis —, PLUS AUCUN contrôle n'a regardé la base
 * qui sert les clients. Ordre des migrations, catalogue des fonctions, droits
 * d'exécution : tout cela est éprouvé sur une base jetable, et rien ne dit que
 * la production lui ressemble encore.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QU'IL COMPARE, ET POURQUOI CETTE FORME
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Il ne re-déclare AUCUNE règle. Il compare la PRODUCTION à la BASE DE TESTS,
 * catalogue contre catalogue — parce que c'est la base de tests que les 725
 * suites d'isolation éprouvent. Tout ce qu'elles établissent ne vaut pour la
 * production que si les deux catalogues coïncident ; l'écart entre les deux est
 * exactement l'angle mort.
 *
 * Recopier ici la liste des fonctions ouvertes, celle des colonnes modifiables
 * et celle des policies aurait créé une SECONDE source de vérité, qui aurait
 * divergé au premier oubli. Une comparaison n'a rien à oublier.
 *
 * S'y ajoute le seul contrôle que la base de tests ne peut pas rendre : l'accord
 * entre les migrations du DÉPÔT et celles réellement appliquées en production,
 * dans les deux sens et dans l'ordre.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ LA LECTURE SEULE EST GARANTIE PAR POSTGRES, PAS PAR MOI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tout se passe dans une transaction `READ ONLY`. Ce n'est pas une discipline
 * d'écriture du script : c'est le serveur qui refuse, avec le SQLSTATE 25006.
 * Et cette garantie est ÉPROUVÉE au démarrage — on tente une écriture triviale,
 * et si elle PASSE, le script s'arrête. Une protection qu'on n'a pas vue
 * refuser n'est pas une protection.
 *
 * ⚠️ AUCUN APPEL AU FOURNISSEUR DE SUIVI. Il reste 198 prises en charge 17TRACK
 * À VIE : ce script ne touche jamais au réseau, il ne parle qu'au catalogue.
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import pg from "pg";

const { Client } = pg;

/* ── LES DEUX ENVIRONNEMENTS, LUS SÉPARÉMENT ────────────────────────────────
 *
 * ⚠️ `dotenv` NE REMPLACE PAS UNE VARIABLE DÉJÀ POSÉE : charger les deux
 * fichiers l'un après l'autre dans `process.env` ferait gagner le premier, et
 * les deux connexions viseraient la MÊME base. On les lit donc dans des objets
 * distincts, et on vérifie ensuite qu'elles diffèrent.
 */
const prod = {};
const tests = {};
config({ path: ".env.local", processEnv: prod, quiet: true });
config({ path: ".env.test.local", processEnv: tests, quiet: true });

const urlProd = (prod["SUPABASE_DB_URL"] ?? "").trim();
const urlTests = (tests["SUPABASE_DB_URL"] ?? "").trim();

const echouer = (message) => {
  console.error("ECHEC " + message);
  process.exit(1);
};

if (urlProd === "") echouer("`SUPABASE_DB_URL` absente de `.env.local`.");
if (urlTests === "") echouer("`SUPABASE_DB_URL` absente de `.env.test.local`.");
if (urlProd === urlTests) {
  echouer(
    "les deux fichiers pointent la MÊME base. La comparaison serait verte en " +
      "ne comparant rien — un ensemble vide passe tout.",
  );
}

/** L'hôte et le nom du projet, jamais les identifiants. */
const projet = (url) => (url.match(/postgres\.([a-z]+):/) ?? url.match(/\/\/([a-z]+)\./) ?? [])[1] ?? "?";

const controles = [];
const constate = (ok, libelle) => {
  controles.push([ok, libelle]);
  console.log(`${ok ? "OK   " : "ECHEC"} ${libelle}`);
};

/**
 * Ouvre une connexion et l'enferme dans une transaction en LECTURE SEULE, puis
 * ÉPROUVE que le refus fonctionne.
 */
async function ouvrirEnLectureSeule(url, nom) {
  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20_000,
  });
  await client.connect();
  await client.query("begin");
  await client.query("set transaction read only");

  /*
   * LE CONTRE-TEST DE LA GARANTIE. Une table temporaire est le geste d'écriture
   * le plus inoffensif qui existe — elle ne touche à aucune donnée — et c'est
   * exactement pour cela qu'elle convient : si MÊME elle passe, la transaction
   * n'est pas en lecture seule, et tout ce qui suit s'exécuterait sans filet.
   */
  let refuse = false;
  let sqlstate = "aucun";
  try {
    await client.query("create temp table sonde_lecture_seule (x int)");
  } catch (erreur) {
    refuse = true;
    sqlstate = erreur.code ?? "?";
  }
  if (!refuse) {
    console.error(
      `ECHEC la transaction ${nom} n'est PAS en lecture seule : une écriture a été ` +
        "acceptée. Le script s'arrête plutôt que d'interroger la production sans filet.",
    );
    await client.end();
    process.exit(1);
  }
  constate(
    sqlstate === "25006",
    `${nom} : toute écriture est refusée par Postgres (SQLSTATE ${sqlstate}, attendu 25006)`,
  );
  /* La transaction est avortée par l'erreur : on la rouvre pour lire. */
  await client.query("rollback");
  await client.query("begin");
  await client.query("set transaction read only");
  return client;
}

const lire = async (client, sql, parametres = []) => (await client.query(sql, parametres)).rows;

/**
 * Compare deux inventaires et rend les écarts DANS LES DEUX SENS.
 *
 * Un seul sens ne suffirait pas : un objet présent en production et absent des
 * tests n'est éprouvé par rien, et un objet présent dans les tests et absent de
 * la production est une garantie qu'on croit avoir.
 */
function comparer(nom, enProd, enTests, temoin) {
  const a = new Set(enProd);
  const b = new Set(enTests);
  const seulementProd = [...a].filter((x) => !b.has(x)).sort();
  const seulementTests = [...b].filter((x) => !a.has(x)).sort();

  /*
   * ⚠️ LE CONTRE-TEST NE PEUT PAS ÊTRE « L'ENSEMBLE N'EST PAS VIDE » PARTOUT,
   * ET C'EST LE PREMIER PASSAGE DE CE SCRIPT QUI ME L'A APPRIS. Sur les droits
   * de table de `anon`, ZÉRO est la bonne réponse — la page publique lit par
   * fonction, jamais par droit direct — et mon contre-test générique rougissait
   * sur un produit parfaitement sain.
   *
   * Quand le vide est ATTENDU, ce qu'il faut prouver n'est pas que l'ensemble
   * est peuplé, mais que la REQUÊTE VOIT QUELQUE CHOSE. Un témoin est donc
   * fourni : la même interrogation, sur un rôle dont on sait qu'il a des
   * droits. S'il rend zéro lui aussi, c'est la sonde qui est aveugle, et le
   * « aucun droit pour anon » ne prouvait rien.
   */
  constate(
    temoin === undefined ? a.size > 0 : temoin > 0,
    temoin === undefined
      ? `CONTRE-TEST ${nom} : la production en porte ${a.size} (un ensemble vide passerait tout)`
      : `CONTRE-TEST ${nom} : le vide est ATTENDU, et la requête voit bien ${temoin} ligne(s) sur son témoin`,
  );
  const ok = seulementProd.length === 0 && seulementTests.length === 0;
  constate(
    ok,
    `${nom} : ${a.size} en production, ${b.size} en base de tests` +
      (ok
        ? " — identiques"
        : ` — ${seulementProd.length} seulement en PROD, ${seulementTests.length} seulement en TESTS`),
  );
  if (!ok) {
    for (const x of seulementProd.slice(0, 12)) console.log(`        · PROD seulement : ${x}`);
    for (const x of seulementTests.slice(0, 12)) console.log(`        · TESTS seulement : ${x}`);
    const reste = seulementProd.length + seulementTests.length - 24;
    if (reste > 0) console.log(`        · … et ${reste} de plus`);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * LES REQUÊTES DE CATALOGUE — les mêmes des deux côtés
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Tables de `public` avec leur état RLS. Le second est ce qui sépare un anonyme de tout. */
const SQL_TABLES = `
  select c.relname || ' rls=' || c.relrowsecurity as ligne
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
  order by 1`;

/** Fonctions : nom, arité, `security definer`, et volatilité. */
const SQL_FONCTIONS = `
  select p.proname || '(' || p.pronargs || ')'
         || ' definer=' || p.prosecdef::text
         -- ⚠️ provolatile est de type "char", pas text : sans ce transtypage,
         -- Postgres refuse la concaténation (« operator is not unique ») et le
         -- script s arrête au lieu de comparer.
         || ' vol=' || p.provolatile::text as ligne
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
  order by 1`;

/** Droits d'EXÉCUTION accordés aux rôles atteignables depuis le dehors. */
const SQL_EXECUTE = `
  select p.proname || ' -> ' || a.grantee::regrole::text as ligne
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  where n.nspname = 'public'
    and a.privilege_type = 'EXECUTE'
    and a.grantee::regrole::text in ('public', '-', 'anon', 'authenticated')
  order by 1`;

/** Droits de TABLE accordés à `anon` — la page publique lit par fonction, jamais par droit direct. */
const SQL_DROITS_ANON = `
  select table_name || ' ' || privilege_type as ligne
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'anon'
  order by 1`;

/**
 * LE TÉMOIN DU CONTRÔLE PRÉCÉDENT : la MÊME interrogation, sur `authenticated`.
 * Elle doit rendre des lignes. Sans elle, « anon n'a aucun droit » serait vrai
 * de la même façon qu'il serait vrai d'une vue vide ou d'un nom de schéma mal
 * orthographié.
 */
const SQL_DROITS_TEMOIN = `
  select table_name || ' ' || privilege_type as ligne
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'authenticated'
  order by 1`;

/** Colonnes que `authenticated` peut ÉCRIRE — c'est ici que se joue l'escalade admin. */
const SQL_COLONNES = `
  select table_name || '.' || column_name as ligne
  from information_schema.column_privileges
  where table_schema = 'public' and grantee = 'authenticated' and privilege_type = 'UPDATE'
  order by 1`;

/** Policies RLS : nom, table, commande. */
const SQL_POLICIES = `
  select tablename || ' :: ' || policyname || ' [' || cmd || ']' as ligne
  from pg_policies
  where schemaname = 'public'
  order by 1`;

/** Valeurs d'énumération : une valeur citée mais absente annule la transaction entière. */
const SQL_ENUMS = `
  select t.typname || '.' || e.enumlabel as ligne
  from pg_type t
  join pg_enum e on e.enumtypid = t.oid
  join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public'
  order by 1`;

/** Index : leur absence en production est une falaise de performance invisible en dev. */
const SQL_INDEX = `
  select tablename || ' :: ' || indexname as ligne
  from pg_indexes
  where schemaname = 'public'
  order by 1`;

/** Vues : le dépôt n'en contient AUCUNE, et c'est délibéré — une vue SE PARCOURT. */
const SQL_VUES = `
  select c.relname as ligne
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('v', 'm')
  order by 1`;

/** Déclencheurs : l'immuabilité du jeton en est un. */
const SQL_TRIGGERS = `
  select c.relname || ' :: ' || t.tgname as ligne
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not t.tgisinternal
  order by 1`;

const colonne = (lignes) => lignes.map((l) => l.ligne);

async function principal() {
  console.log(`production   : ${projet(urlProd)}`);
  console.log(`base de tests: ${projet(urlTests)}\n`);

  const bdProd = await ouvrirEnLectureSeule(urlProd, "production");
  const bdTests = await ouvrirEnLectureSeule(urlTests, "base de tests");

  try {
    console.log("\n— Le catalogue de production contre celui de la base de tests —");
    for (const [nom, sql, sqlTemoin] of [
      ["tables et RLS", SQL_TABLES],
      ["fonctions", SQL_FONCTIONS],
      ["droits d'exécution ouverts", SQL_EXECUTE],
      ["droits de table de `anon`", SQL_DROITS_ANON, SQL_DROITS_TEMOIN],
      ["colonnes écrivables par `authenticated`", SQL_COLONNES],
      ["policies RLS", SQL_POLICIES],
      ["valeurs d'énumération", SQL_ENUMS],
      ["index", SQL_INDEX],
      ["déclencheurs", SQL_TRIGGERS],
    ]) {
      const [enProd, enTests] = await Promise.all([lire(bdProd, sql), lire(bdTests, sql)]);
      const temoin =
        sqlTemoin === undefined ? undefined : (await lire(bdProd, sqlTemoin)).length;
      comparer(nom, colonne(enProd), colonne(enTests), temoin);
    }

    /*
     * ⚠️ LES VUES SE CONTRÔLENT PAR L'ABSENCE, PAS PAR LA COMPARAISON. Deux
     * bases également fautives se compareraient sans rien dire — c'est
     * exactement le défaut d'une sonde qui n'a pas de référence extérieure.
     * Le dépôt n'a AUCUNE vue, et c'est délibéré : une vue SE PARCOURT, une
     * fonction EXIGE le jeton.
     */
    const vuesProd = colonne(await lire(bdProd, SQL_VUES));
    constate(
      vuesProd.length === 0,
      `aucune vue ni vue matérialisée dans \`public\` en production` +
        (vuesProd.length === 0 ? "" : ` — trouvées : ${vuesProd.join(", ")}`),
    );

    /*
     * ⚠️ ET DEUX PROPRIÉTÉS SE CONTRÔLENT DANS L'ABSOLU, jamais par
     * comparaison : elles fondent l'isolation, et une base de tests qui les
     * perdrait ferait taire le contrôle au lieu de le faire rougir.
     */
    const sansRls = colonne(await lire(bdProd, SQL_TABLES)).filter((l) => l.endsWith("rls=false"));
    constate(
      sansRls.length === 0,
      `toutes les tables de production ont la RLS activée` +
        (sansRls.length === 0 ? "" : ` — sans RLS : ${sansRls.join(", ")}`),
    );

    const roleEcrivable = colonne(await lire(bdProd, SQL_COLONNES)).filter(
      (l) => l === "profiles.role",
    );
    constate(
      roleEcrivable.length === 0,
      "`authenticated` ne peut PAS écrire `profiles.role` en production " +
        "(sans quoi un vendeur se promeut administrateur)",
    );

    /* ── LE DÉPÔT CONTRE LA PRODUCTION ───────────────────────────────────────
     *
     * ⚠️ LE SEUL CONTRÔLE QUE LA COMPARAISON DE CATALOGUES NE PEUT PAS RENDRE.
     * Deux bases peuvent porter le même schéma en l'ayant atteint par des
     * chemins différents — et c'est l'ordre d'application qui décide de ce
     * qu'une reconstruction depuis zéro produira. Mesuré le 01/09/2026 : la 088
     * a été appliquée AVANT la 087 en production. Inoffensif ici, vérifié,
     * déclaré — mais une reconstruction appliquerait un ordre que la production
     * n'a jamais exécuté.
     */
    console.log("\n— Les migrations du dépôt contre celles de la production —");
    const fichiers = readdirSync(join(process.cwd(), "supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .map((f) => f.replace(/\.sql$/, ""))
      .sort();
    /*
     * ⚠️ C'EST `name` QU'IL FAUT COMPARER, PAS `version_name`, ET LE PREMIER
     * PASSAGE ME L'A APPRIS BRUTALEMENT. La base stocke un horodatage dans
     * `version` et le nom du fichier dans `name` ; concaténer les deux
     * produisait `20260820152053_001_socle_identite` face à `001_socle_identite`
     * dans le dépôt, donc DEUX ENSEMBLES ENTIÈREMENT DISJOINTS — et le contrôle
     * d'ordre qui suit est alors passé au VERT, puisqu'il ne restait rien à
     * ordonner. Un ensemble vide passe tout, y compris quand c'est la
     * comparaison elle-même qui l'a vidé.
     */
    const appliquees = (
      await lire(
        bdProd,
        `select name
         from supabase_migrations.schema_migrations
         order by version`,
      )
    ).map((l) => l.name);

    constate(
      fichiers.length > 0 && appliquees.length > 0,
      `CONTRE-TEST : ${fichiers.length} fichiers lus dans le dépôt, ${appliquees.length} migrations lues en production`,
    );

    const jamaisAppliquees = fichiers.filter((f) => !appliquees.includes(f));
    constate(
      jamaisAppliquees.length === 0,
      `aucun fichier de migration n'est resté sans être appliqué en production` +
        (jamaisAppliquees.length === 0 ? "" : ` — ${jamaisAppliquees.join(", ")}`),
    );

    const sansFichier = appliquees.filter((a) => !fichiers.includes(a));
    constate(
      sansFichier.length === 0,
      `aucune migration appliquée en production n'est absente du dépôt` +
        (sansFichier.length === 0 ? "" : ` — ${sansFichier.join(", ")}`),
    );

    /*
     * L'ORDRE, ET SON INVERSION CONNUE. Une inversion de deux voisines produit
     * DEUX positions divergentes, pas une : les deux sens sont donc déclarés.
     */
    const INVERSIONS_ADMISES = [
      ["088_compteur_de_prise_en_charge_sur_insertion", "087_bornes_des_parametres_en_base"],
      ["087_bornes_des_parametres_en_base", "088_compteur_de_prise_en_charge_sur_insertion"],
    ];
    const communes = fichiers.filter((f) => appliquees.includes(f));
    const ordreProd = appliquees.filter((a) => communes.includes(a));
    /*
     * ⚠️ SANS CE CONTRE-TEST, LE CONTRÔLE D'ORDRE EST PASSÉ VERT SUR RIEN. Deux
     * ensembles disjoints donnent zéro position à comparer, donc zéro
     * divergence, donc un vert parfait — c'est ce qui s'est produit au premier
     * passage de ce script, et c'est exactement le défaut qu'il est censé
     * attraper ailleurs.
     */
    constate(
      communes.length >= fichiers.length,
      `CONTRE-TEST : ${communes.length} migrations communes au dépôt et à la production, sur ${fichiers.length} fichiers`,
    );
    const divergences = [];
    for (let i = 0; i < communes.length; i += 1) {
      const attendu = communes[i];
      const observe = ordreProd[i];
      if (attendu === observe) continue;
      if (INVERSIONS_ADMISES.some(([b, d]) => b === observe && d === attendu)) continue;
      divergences.push(`position ${i + 1} : dépôt « ${attendu} », production « ${observe} »`);
    }
    constate(
      divergences.length === 0,
      `l'ordre d'application en production est celui du dépôt, aux inversions déclarées près` +
        (divergences.length === 0 ? "" : ` — ${divergences.join(" | ")}`),
    );

    /*
     * ⚠️ ET L'INVERSION DÉCLARÉE DOIT EXISTER ENCORE. Une exception qu'on garde
     * après qu'elle a disparu masque la réapparition du même défaut : c'est une
     * autorisation permanente accordée à un fait devenu faux.
     */
    const inversionPresente = INVERSIONS_ADMISES.some(([observe, attendu]) => {
      const i = communes.indexOf(attendu);
      return i !== -1 && ordreProd[i] === observe;
    });
    constate(
      inversionPresente,
      "l'inversion 087/088 déclarée est TOUJOURS présente en production " +
        "(une exception périmée autorise en silence un défaut qui reviendrait)",
    );
  } finally {
    await bdProd.query("rollback").catch(() => {});
    await bdTests.query("rollback").catch(() => {});
    await bdProd.end().catch(() => {});
    await bdTests.end().catch(() => {});
  }

  const echecs = controles.filter(([ok]) => !ok);
  console.log(`\n${controles.length - echecs.length} / ${controles.length} conformes.`);
  if (echecs.length > 0) {
    console.error(`\n${echecs.length} ECART(S) :`);
    for (const [, libelle] of echecs) console.error(`  · ${libelle}`);
    process.exit(1);
  }
  console.log("La production et la base de tests décrivent le même schéma.");
}

await principal();
