import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";

/**
 * Sondes de sécurité par catalogue.
 *
 * Principe directeur : la sonde rend TOUT, le test déclare ses exceptions avec
 * leur raison, et il échoue DANS LES DEUX SENS — une protection manquante fait
 * échouer, et une exception devenue inutile aussi. Sans le second sens, une
 * exception posée pour une raison disparue survit indéfiniment et couvre le
 * jour où le défaut revient.
 *
 * Chaque sonde établit d'abord qu'elle INSPECTE quelque chose : un ensemble
 * vide passe tout, et une suite verte sur rien est le pire des résultats
 * puisqu'elle est indiscernable d'une suite verte sur tout.
 */

let bd: Client;

beforeAll(async () => {
  bd = await ouvrirConnexionCatalogue();
});

afterAll(async () => {
  await bd.end();
});

describe("Sonde A — RLS sur toutes les tables de public", () => {
  /**
   * Supabase accorde SELECT/INSERT/UPDATE/DELETE à `anon` par défaut. La RLS est
   * la seule chose qui sépare un anonyme de toutes les lignes : une table créée
   * sans elle est grande ouverte, et le fichier de migration ne le dira pas.
   */
  const TABLES_SANS_RLS_ADMISES = new Map<string, string>([
    // Aucune pour l'instant. Toute entrée ici doit porter sa raison, et sera
    // signalée dès qu'elle deviendra inutile.
  ]);

  /**
   * Tables qui portent la RLS mais AUCUNE policy, délibérément.
   *
   * C'est une exception d'une autre nature que la précédente, et elle mérite
   * son propre registre : ici la RLS est bien active et forcée, mais l'absence
   * de policy est le MÉCANISME, pas un oubli. Une table sans policy n'est
   * atteignable que par une fonction `security definer`, ce qui est exactement
   * la propriété recherchée pour un compteur.
   *
   * Le second sens est inversé par rapport à l'autre registre : une entrée
   * devient périmée quand la table GAGNE une policy — car alors le mécanisme a
   * changé sans que l'exception le dise.
   */
  const TABLES_SANS_POLICY_ADMISES = new Map<string, string>([
    [
      "comptes_supprimes",
      "Conservation d'un an des comptes supprimés par leur titulaire (migration " +
        "157) : adresse et dates, l'obligation de l'hébergeur. AUCUNE POLICY : " +
        "écrite par `supprimer_mon_compte` dans la transaction même de la " +
        "suppression, effacée par `purger_comptes_supprimes` au bout d'un an, " +
        "réservée au rôle de service. Personne d'autre n'a à la lire — un vendeur " +
        "y lirait les adresses des comptes partis —, et personne n'a à l'écrire : " +
        "une ligne effacée à la main ferait manquer l'obligation.",
    ],
    [
      "purges_r2",
      "File des objets R2 à effacer après une suppression (migration 157). " +
        "AUCUNE POLICY : une clé y entre dans la transaction qui supprime sa " +
        "ligne, et n'en sort que par `purges_effectuees`, réservée au rôle de " +
        "service, une fois l'objet réellement supprimé. Lire la file donnerait " +
        "les clés des médias d'autres comptes ; y écrire ferait effacer les " +
        "médias de n'importe qui à la prochaine veille.",
    ],
    [
      "alertes_envoyees",
      "Repos entre deux alertes du veilleur. AUCUNE POLICY : la table n'est " +
        "atteignable que par `reserver_alerte` et `liberer_alerte`, toutes deux " +
        "en `security definer` et ouvertes au seul `service_role`. Les deux " +
        "droits qu'une policy accorderait sont exactement ceux qu'il ne faut " +
        "pas donner : POSER une ligne fait TAIRE le veilleur pour la durée du " +
        "repos, et EFFACER une ligne lui fait réémettre autant d'emails qu'on " +
        "veut. Le premier est une panne silencieuse, le second apprend à " +
        "ignorer l'expéditeur — deux façons d'obtenir le même résultat final.",
    ],
    [
      "parametres_admis",
      "Inventaire FERMÉ des paramètres système et de leurs bornes. AUCUNE " +
        "POLICY : la table n'est lue que par `ecrire_parametre`, en " +
        "`security definer` avec vérification du rôle. Personne d'autre n'a de " +
        "raison de la lire, et surtout personne n'a de raison de l'écrire — une " +
        "borne modifiable par celui qu'elle borne n'est pas une borne. Elle " +
        "change par migration, comme le reste des invariants du produit.",
    ],
    [
      "system_settings",
      "Paramètres système. AUCUNE POLICY : la table n'est atteignable que par " +
        "`ecrire_parametre` et `lire_parametre_entier`, toutes deux en " +
        "`security definer` avec vérification du rôle. Un paramètre modifiable " +
        "sans trace est PIRE qu'un paramètre figé — figé, on sait ce qu'il vaut ; " +
        "modifiable en silence, on croit savoir. La trace est écrite par un " +
        "DÉCLENCHEUR et porte l'ancienne ET la nouvelle valeur, parce qu'un " +
        "journal qui ne dit que la nouvelle répète ce que la table dit déjà. " +
        "Aucun secret n'y passe : une valeur en base est lisible par qui accède " +
        "à la base, ce qui convient à un seuil et jamais à une clé.",
    ],
    [
      "usage_counters",
      "Compteurs d'usage, tenus à l'écriture par déclencheur. AUCUNE POLICY : " +
        "seules les fonctions du panneau les lisent. Ils existent parce que le " +
        "panneau agrégeait `tracked_parcels` directement — 19 244 lignes lues " +
        "pour DEUX comptes, donc un coût linéaire dans l'activité TOTALE du " +
        "produit et des millions de lignes à mille vendeurs. Après : une ligne " +
        "par compte et par mois, 22 lignes lues. `storage_bytes` est NULLABLE et " +
        "non `default 0` : tant qu'aucun mécanisme ne mesure le stockage, la " +
        "valeur est INCONNUE, et zéro affirmerait qu'on a mesuré.",
    ],
    [
      "admin_audit_log",
      "Journal d'audit. AUCUNE POLICY, délibérément : la table n'est atteignable " +
        "que par les fonctions `security definer` de l'administration, qui " +
        "vérifient le rôle EN BASE. Une policy de lecture, même réservée aux " +
        "administrateurs, créerait un SECOND chemin — et c'est le second chemin " +
        "qu'on oublie de protéger le jour où le premier change. Elle est de plus " +
        "append-only par déclencheur, ce qui s'applique même aux fonctions " +
        "`security definer` : sans lui, le retrait des droits ne suffirait pas, " +
        "puisqu'elles s'exécutent avec ceux du propriétaire de la table.",
    ],
    [
      "scheduler_heartbeat",
      "Battement des tâches de fond. Aucune policy : la table n'est atteignable " +
        "que par public.battre(). UN VEILLEUR DONT LE BATTEMENT EST ÉCRIVABLE " +
        "ANONYMEMENT EST PIRE QU'UN VEILLEUR ABSENT — on cesse de le chercher, " +
        "en croyant qu'il veille. Et son ABSENCE DE LIGNE est une information : " +
        "« jamais déployé » n'est pas « en retard ».",
    ],
    [
      "tracking_snapshots",
      "Réponses BRUTES du fournisseur de suivi. Aucune policy, donc atteignable " +
        "par le seul rôle système : elles contiennent des champs que nous " +
        "n'exposons pas, et leur unique usage est le diagnostic. Ce qui n'est " +
        "lisible par personne ne peut fuiter par personne — et un vendeur qui " +
        "les lirait obtiendrait des données que la page publique ne rend pas.",
    ],
    [
      "tracking_notifications_vues",
      "Empreintes des notifications de suivi déjà traitées. Aucune policy : la " +
        "table n'est atteignable que par public.notification_deja_vue(). Elle " +
        "n'est pas seulement à protéger en LECTURE — un tiers capable d'y " +
        "insérer l'empreinte d'une notification À VENIR la ferait IGNORER, " +
        "c'est-à-dire empêcherait un colis de jamais se mettre à jour, sans " +
        "qu'aucune erreur soit levée nulle part.",
    ],
    [
      "rate_limit",
      "Compteur de limitation de débit. Sans policy, la table n'est atteignable " +
        "que par public.consommer_quota(). Un compteur lisible dirait à " +
        "l'attaquant combien il lui reste ; un compteur écrivable lui " +
        "permettrait d'épuiser le quota d'un tiers.",
    ],
  ]);

  test("chaque table porte la RLS, activée et forcée, avec au moins une policy", async () => {
    const tables = await interroger<{
      table_name: string;
      rls_active: boolean;
      rls_forcee: boolean;
      nb_policies: string;
    }>(
      bd,
      `select c.relname as table_name,
              c.relrowsecurity as rls_active,
              c.relforcerowsecurity as rls_forcee,
              (select count(*) from pg_policy p where p.polrelid = c.oid)::text as nb_policies
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r', 'p')
       order by c.relname`,
    );

    // La garde prouve qu'elle inspecte quelque chose avant de prouver que ce
    // quelque chose est correct.
    expect(
      tables.length,
      "La sonde n'a trouvé AUCUNE table dans public. Soit les migrations ne " +
        "sont pas appliquées, soit la sonde interroge la mauvaise base — dans " +
        "les deux cas elle ne prouve rien.",
    ).toBeGreaterThan(0);

    const defauts: string[] = [];
    for (const t of tables) {
      if (TABLES_SANS_RLS_ADMISES.has(t.table_name)) continue;
      if (!t.rls_active) defauts.push(`${t.table_name} : RLS non activée`);
      if (!t.rls_forcee) defauts.push(`${t.table_name} : RLS non forcée`);
      if (Number(t.nb_policies) === 0 && !TABLES_SANS_POLICY_ADMISES.has(t.table_name)) {
        defauts.push(`${t.table_name} : RLS activée mais AUCUNE policy`);
      }
    }
    expect(defauts, defauts.join(" | ")).toEqual([]);

    // Deuxième sens : une exception qui n'a plus lieu d'être doit faire échouer.
    const exceptionsPerimees = [...TABLES_SANS_RLS_ADMISES.keys()].filter((nom) => {
      const t = tables.find((x) => x.table_name === nom);
      return t === undefined || t.rls_active;
    });
    expect(
      exceptionsPerimees,
      `Exceptions déclarées devenues inutiles : ${exceptionsPerimees.join(", ")}. ` +
        "Les retirer — une exception périmée couvre le retour du défaut.",
    ).toEqual([]);

    // Même exigence pour le registre « sans policy », dans son sens propre :
    // une table qui a GAGNÉ une policy n'a plus besoin d'y figurer, et une
    // entrée pour une table disparue n'aurait plus d'objet.
    const sansPolicyPerimees = [...TABLES_SANS_POLICY_ADMISES.keys()].filter((nom) => {
      const t = tables.find((x) => x.table_name === nom);
      return t === undefined || Number(t.nb_policies) > 0;
    });
    expect(
      sansPolicyPerimees,
      `Tables déclarées « sans policy » qui en ont désormais une, ou qui ` +
        `n'existent plus : ${sansPolicyPerimees.join(", ")}. Le mécanisme de ` +
        "protection a changé sans que la déclaration le dise.",
    ).toEqual([]);
  });
});

describe("Sonde B — droits d'exécution dans public", () => {
  /**
   * Postgres accorde EXECUTE à PUBLIC par défaut, et un droit d'exécution ne
   * s'écrit pas dans le corps d'une fonction : aucun contrôle textuel ne peut
   * le voir (L-027, L-028).
   *
   * La propriété assertée porte sur `public` et non sur `extensions`, pour une
   * raison de fond : PostgREST n'expose que `public`, donc seul ce schéma est
   * atteignable par un porteur de clé publiable. Asserter sur `extensions`
   * reviendrait à asserter sur des objets appartenant à `supabase_admin`, que
   * nos migrations ne peuvent pas modifier — et un test qu'on ne peut pas faire
   * passer finit désactivé.
   */
  const FONCTIONS_OUVERTES_ADMISES = new Map<string, string>([
    [
      "cle_media_canonique",
      "La forme canonique d'une clé d'objet, appelée depuis DEUX CONTRAINTES " +
        "`CHECK` sur `order_media`. Une contrainte s'évalue avec les droits de " +
        "CELUI QUI ÉCRIT : sans ce `grant`, la table devient insérable par " +
        "personne, et le refus se présente comme une erreur de permission sur " +
        "la fonction plutôt que comme une violation de contrainte. Elle ne lit " +
        "aucune donnée — elle compare une chaîne à une expression rationnelle — " +
        "donc l'ouvrir n'expose rien. `anon` n'y a pas droit : il ne fait que " +
        "lire, et une contrainte ne s'évalue qu'à l'écriture.",
    ],
    [
      "lire_plafond_commandes",
      "Le plafond mensuel de commandes, lu par le déclencheur `verifier_plafond_" +
        "commandes` — qui s'exécute avec le rôle du VENDEUR qui insère. Sans ce " +
        "`grant`, aucun vendeur ne peut plus créer de commande : le défaut a " +
        "existé, entre les migrations 095 et 096, et il ramenait le plafond " +
        "effectif à zéro pour tout le monde. Elle ne prend AUCUN argument — " +
        "contrairement à `lire_parametre_entier`, qui reste réservée aux " +
        "administrateurs parce qu'une clé libre laisserait lire n'importe quel " +
        "réglage et servirait d'oracle d'existence sur n'importe quelle clé " +
        "devinée. Elle ne rend qu'une valeur que le vendeur lit de toute façon " +
        "dans le message de refus s'il atteint la borne. `anon` n'y a pas droit : " +
        "il n'insère aucune commande.",
    ],
    [
      "lire_inscriptions_ouvertes",
      "L'interrupteur de création de comptes, lu par le RETOUR " +
        "D'AUTHENTIFICATION — qui s'exécute avec la session fraîchement " +
        "échangée, donc en `authenticated`. Sans ce `grant`, la porte resterait " +
        "ouverte en silence : la lecture échouerait, et le code laisse entrer " +
        "quand il ne peut pas lire, parce qu'une base momentanément illisible ne " +
        "doit pas fermer le produit sans que personne l'ait décidé. Elle ne " +
        "prend AUCUN argument, contrairement à `lire_parametre_entier` qui reste " +
        "réservée aux administrateurs parce qu'une clé libre servirait d'oracle " +
        "d'existence sur n'importe quelle clé devinée. Elle ne rend qu'un " +
        "booléen que l'écran de connexion annonce de toute façon quand la porte " +
        "est fermée. `anon` n'y a pas droit : il n'atteint jamais ce chemin, qui " +
        "vient APRÈS l'échange du code.",
    ],
    [
      "mon_shop_id",
      "Rend la boutique de l'APPELANT et ne prend aucun argument : il n'y a rien " +
        "à détourner. Les policies s'exécutant avec le rôle appelant (L-001), " +
        "sans ce droit toute lecture de commande échouerait. Elle est évaluée " +
        "une fois par requête au lieu d'une jointure par ligne, ce qui est la " +
        "raison même de son existence.",
    ],
    [
      "compter_commandes_par_etat",
      "Les quatre compteurs de tête de la liste des commandes. En `security " +
        "INVOKER` : la RLS s'applique, elle ne voit que les commandes de son " +
        "appelant — c'est une lecture ordinaire enveloppée pour tenir en un " +
        "seul aller-retour. Elle ne prend AUCUN argument, donc il n'y a rien à " +
        "détourner, et elle ne rend que des nombres portant sur des lignes que " +
        "l'appelant peut de toute façon lire une par une.",
    ],
    [
      "sans_accents",
      "Appelée par la COLONNE GÉNÉRÉE `orders.recherche`, laquelle est calculée " +
        "avec les privilèges du rôle qui insère. Sans ce droit, toute création " +
        "de commande échoue. N'expose qu'une transformation de texte pure : elle " +
        "ne lit ni n'écrit aucune donnée, et ne révèle rien que l'appelant ne " +
        "connaisse déjà.",
    ],
    [
      "reclamer_evenement_creation",
      "Réclame l'émission de `order_created`, UNE SEULE FOIS. En `security " +
        "definer` parce que `created_event_at` est une MESURE que le vendeur " +
        "n'a pas le droit d'écrire, mais elle vérifie la PROPRIÉTÉ dans son " +
        "corps, et la condition est évaluée par la base — deux sauvegardes " +
        "simultanées ne peuvent donc pas produire deux émissions.",
    ],
    [
      "reordonner_medias",
      "Réordonne en UNE SEULE écriture, ce qu'aucune suite d'écritures " +
        "applicatives ne peut garantir. En `security definer` pour s'appuyer " +
        "sur l'unicité différée sans que la RLS coupe la transaction, mais elle " +
        "vérifie la PROPRIÉTÉ dans son corps ET refuse toute liste qui ne " +
        "décrit pas exactement les médias de la commande — un identifiant " +
        "étranger y déplacerait le média d'un autre vendeur.",
    ],
    [
      "lire_commande_publique",
      "SEUL chemin de lecture publique. En `security definer` parce que `anon` " +
        "n'a — et ne doit avoir — aucun droit sur `orders`. Elle EXIGE le jeton " +
        "en argument : c'est ce qui rend l'énumération impossible, là où une VUE " +
        "exposée à `anon` se lirait tout entière. Elle filtre la suspension du " +
        "compte, et ne rend ni `internal_notes` ni `unsubscribe_token`.",
    ],
    [
      "lire_suivi_public",
      "Suivi d'une commande, par jeton. Troisième surface de lecture publique, " +
        "et elle REFAIT le filtre de suspension : une coupure à moitié faite est " +
        "une coupure qui n'a pas eu lieu. Elle ne rend AUCUN chiffre de coût — " +
        "interrogations et retours vides sont nos chiffres, pas ceux du client.",
    ],
    [
      "lire_passages_publics",
      "Points de passage d'une commande, par jeton. Même filtre de suspension, " +
        "et un plafond de trente dans la fonction : certains transporteurs " +
        "émettent un scan par centre de tri traversé, et le budget de la page " +
        "publique serait mangé par du bruit.",
    ],
    [
      "lire_medias_publics",
      "Médias de la même commande, par jeton. Elle REFAIT le filtre de " +
        "suspension : ne pas le refaire laisserait les photos d'un compte " +
        "suspendu accessibles alors que sa page ne répond plus, et une coupure à " +
        "moitié faite est une coupure qui n'a pas eu lieu.",
    ],
    [
      "attacher_colis",
      "Attache un numéro de suivi à une commande. `security definer` parce qu'un " +
        "vendeur n'a AUCUN droit d'écriture sur `tracked_parcels` — l'écriture " +
        "vient du transporteur, et un vendeur qui écrirait ses propres points de " +
        "passage raconterait à son client une expédition qui n'a pas eu lieu. La " +
        "PROPRIÉTÉ est donc vérifiée dans son corps. Elle rend aussi `cree`, le " +
        "booléen qui décide si l'on PAIE une prise en charge : insertion et " +
        "verdict dans le même ordre SQL, pour qu'un double clic ne paie pas deux " +
        "fois.",
    ],
    [
      "suspendre_compte",
      "LA CAPACITÉ QUI FONDE NOTRE STATUT D'HÉBERGEUR. `SECURITY DEFINER` parce " +
        "que `profiles.status` n'est accordé en écriture à PERSONNE — c'est un " +
        "privilège de colonne, évalué avant toute policy, et c'est ce qui empêche " +
        "un vendeur de se réactiver lui-même. La fonction vérifie le rôle, exige " +
        "un motif non vide, refuse l'auto-suspension (irréversible depuis " +
        "l'intérieur) et la suspension d'un autre administrateur (un compte " +
        "compromis couperait sinon tous les autres), écrit l'audit et modifie le " +
        "statut — le tout dans une seule transaction.",
    ],
    [
      "reactiver_compte",
      "Réactivation, tracée comme la suspension : sans trace, un compte " +
        "reviendrait en service sans que rien ne dise qui l'a décidé. Elle ne " +
        "touche JAMAIS le `public_token`, immuable à vie : un compte réactivé " +
        "retrouve exactement les liens qu'il avait envoyés, ce qui est la seule " +
        "façon de rendre la suspension réversible pour ses clients aussi.",
    ],
    [
      "bloquer_lien_commande",
      "LE BLOCAGE D'UN SEUL LIEN (166, décision de Wassim du 19/09/2026). `SECURITY " +
        "DEFINER` parce que `orders.admin_blocked_at` n'est accordé en écriture à " +
        "PERSONNE — sans quoi un vendeur se débloquerait lui-même. La fonction vérifie " +
        "le rôle admin actif EN BASE, exige un motif, verrouille la ligne, écrit l'audit " +
        "AVANT la mutation, et ne touche jamais le `public_token`.",
    ],
    [
      "debloquer_lien_commande",
      "Le déblocage, tracé comme le blocage : la page revient sur le MÊME lien, celui " +
        "que le client a déjà reçu.",
    ],
    [
      "liens_bloques_parmi",
      "Pour la liste d'administration : parmi des identifiants qu'elle a DÉJÀ, lesquels " +
        "portent un blocage. Rôle admin vérifié en base, 200 identifiants au plus ; ne " +
        "rend que des identifiants, donc rien qui ne soit déjà à l'écran.",
    ],
    [
      "ecrire_parametre",
      "Écriture d'un paramètre système. Vérifie le rôle elle-même : une fonction " +
        "qui accepterait n'importe quel appelant laisserait un vendeur modifier " +
        "les seuils du produit, et la trace dirait QUI sans empêcher QUOI. La " +
        "trace, elle, est posée par un déclencheur — un appel explicite se " +
        "contourne en écrivant directement dans la table, y compris par " +
        "inadvertance dans un script de maintenance.",
    ],
    [
      "lire_parametre_entier",
      "Lecture d'un seuil, avec son défaut fourni PAR L'APPEL. Une ligne absente " +
        "est donc un état NORMAL — le produit fonctionne sans qu'aucun paramètre " +
        "n'ait jamais été décidé — et non une panne à diagnostiquer. `stable` : " +
        "elle n'écrit rien, et le moteur refusera toute écriture qu'on y " +
        "ajouterait.",
    ],
    [
      "lister_parametres",
      "Liste les paramètres ÉCRITS. Elle REFUSE au lieu de rendre un ensemble " +
        "vide : un vide serait ici indiscernable de « aucun paramètre n'a jamais " +
        "été décidé », qui est l'état NORMAL du produit — un appelant sans droits " +
        "lirait donc les défauts en croyant lire la configuration. Elle N'AUDITE " +
        "PAS, et c'est délibéré : l'audit trace un humain qui lit les données " +
        "d'un TIERS, or un seuil du produit n'appartient à personne. `stable` : " +
        "le moteur refusera toute écriture qu'on y ajouterait.",
    ],
    [
      "exiger_aal_du_compte",
      "Le crochet `db_pre_request` de PostgREST (migration 156), exécuté AVANT " +
        "CHAQUE requête, avec le rôle de la requête : `anon` et `authenticated` " +
        "doivent pouvoir l'appeler, sans quoi le produit entier cesserait de " +
        "répondre. Il ne rend RIEN et n'écrit rien : il refuse, en 42501, toute " +
        "requête d'un compte à facteur vérifié dont le jeton n'est pas `aal2`. " +
        "C'est lui qui fait tenir la double authentification sur les fonctions " +
        "`security definer`, que la RLS ne voit pas.",
    ],
    [
      "supprimer_mon_compte",
      "« Supprimer le compte » (migration 157, décision de Wassim du 13/09/2026). " +
        "L'identité vient de `auth.uid()`, jamais d'un argument ; la fonction " +
        "revérifie que le compte est ACTIF (un compte suspendu n'efface pas le " +
        "contenu signalé) et que la confirmation reprend son adresse. Conservation " +
        "d'un an, clés R2 en file et suppression en cascade dans UNE transaction. " +
        "Le mot de passe actuel est vérifié par l'application avant l'appel, la " +
        "double authentification par le crochet de la 156. Refusée à `anon`.",
    ],
    [
      "supprimer_mes_donnees",
      "« Supprimer toutes les données » (migration 157) : mêmes gardes que " +
        "`supprimer_mon_compte`, et la suppression ne vise que la boutique de " +
        "`auth.uid()` — éprouvé par une falsification qui l'étendait au voisin. " +
        "Le compte, la boutique et le logo restent. Refusée à `anon`.",
    ],
    [
      "lister_mes_facteurs",
      "« La double authentification est-elle active ? » pour l'écran Paramètres. " +
        "`authenticated` n'a aucun droit sur `auth.mfa_factors` (mesuré) : elle " +
        "rend les facteurs TOTP VÉRIFIÉS de `auth.uid()`, identifiant et date, " +
        "jamais leur secret. Aucun argument ne désigne un compte. Refusée à `anon`.",
    ],
    [
      "lister_mes_sessions",
      "« Voir les sessions » de l'écran Paramètres (migration 155). `auth.sessions` " +
        "est hors du schéma exposé, et doit le rester : la fonction rend les " +
        "sessions de `auth.uid()` et AUCUN argument ne désigne un compte, donc " +
        "aucun argument ne peut en désigner un autre. Ni adresse IP — une session " +
        "volée afficherait le domicile du propriétaire —, ni jeton, ni clé : rien " +
        "qui permette de rejouer une session. Refusée à `anon`, qui n'a rien à " +
        "lister. `stable`.",
    ],
    [
      "lister_boutiques_admin",
      "Liste des boutiques pour l'administration. UN HUMAIN Y LIT LES DONNÉES " +
        "D'UN TIERS : elle écrit donc UNE entrée d'audit par page, portant ses " +
        "critères — une par ligne affichée noierait les consultations " +
        "individuelles, qui sont ce qu'on relit en cas de litige. `volatile` " +
        "parce qu'elle écrit cette trace : déclarée `stable`, PostgREST " +
        "l'exécuterait en lecture seule et l'audit échouerait. Elle ne rend " +
        "AUCUN contenu — ni nom de client, ni référence, ni note interne, ni " +
        "`public_token`, qui transfère une capacité et non une donnée.",
    ],
    [
      "lister_commandes_admin",
      "Commandes de toute la plateforme pour l'administration (migrations 159-160, " +
        "décision de Wassim du 14/09/2026). UN HUMAIN Y LIT LES DONNÉES DE TIERS : " +
        "UNE entrée d'audit par page, portant ses critères, dans la transaction de " +
        "la lecture — `volatile` pour cette raison. Elle ne rend AUCUN contenu : ni " +
        "pseudo ni adresse du client final, qui n'a jamais eu de compte chez nous, " +
        "ni référence produit, ni note interne, ni `public_token` — contrôlé par " +
        "valeur dans `tests/rls/commandes-admin.test.ts`. Un statut ou une fenêtre " +
        "inconnus sont REFUSÉS (DL055) : ignorés, ils rendraient la liste entière.",
    ],
    [
      "statistiques_admin",
      "Indicateurs de l'écran Statistiques (migration 161) sur 7, 30 ou 90 jours et la période " +
        "précédente. Garde est_admin, fenêtre inconnue REFUSÉE (DL056). Elle ne rend QUE des " +
        "nombres — `tests/rls/statistiques-admin.test.ts` inventorie ses colonnes et rougit sur " +
        "la première qui ne serait pas numérique — donc aucune donnée tierce n'est lue et aucun " +
        "audit n'est écrit, comme `repartir_commandes_admin`. `stable`.",
    ],
    [
      "statistiques_admin_par_jour",
      "Séries jour par jour de l'écran Statistiques, jours vides compris, taux et délai NULS un " +
        "jour sans mesure. Même garde, même fenêtre fermée, mêmes nombres seuls. `stable`.",
    ],
    [
      "transporteurs_admin",
      "Colis de la plateforme par CODE transporteur sur la fenêtre ; le nom se résout dans le " +
        "dépôt. Même garde, même fenêtre fermée, aucune boutique ni aucun numéro de suivi rendus.",
    ],
    [
      "croissance_admin",
      "Volumes mensuels de la plateforme sur neuf mois, mois vides compris. Garde est_admin, " +
        "aucun argument, nombres seuls. `stable`.",
    ],
    [
      "stockage_total_admin",
      "Somme des octets occupés, tous comptes confondus. Elle lit les compteurs " +
        "par boutique et jamais `order_media` : le coût suit ainsi le nombre de " +
        "COMPTES et non le nombre de fichiers. `stable` — elle n'écrit rien, et " +
        "n'a rien à auditer : un total agrégé ne désigne les données de personne.",
    ],
    [
      "liberer_evenement_creation",
      "Rend la marque d'émission quand l'événement n'est PAS parti. Elle vérifie " +
        "la propriété de la commande comme sa jumelle `reclamer_`, et ne rend la " +
        "marque que si elle est posée — sans cette condition, un appel isolé " +
        "effacerait la trace d'un événement réellement émis et provoquerait un " +
        "DOUBLE comptage, l'erreur symétrique de celle qu'elle corrige.",
    ],
    [
      "reclamer_evenement_inscription",
      "Marque d'inscription, en base et non déduite d'un autre état. Le critère " +
        "précédent — « l'onboarding reste à faire » — restait vrai tant que le " +
        "vendeur ne l'avait pas soumis : trois connexions donnaient trois " +
        "inscriptions pour un compte. Sur un DÉNOMINATEUR, cela fait baisser le " +
        "taux d'activation, et le biais est corrélé au comportement mesuré.",
    ],
    [
      "liberer_evenement_inscription",
      "Jumelle de la précédente, même raison que pour la création : une marque " +
        "consommée avant une opération qui peut échouer perd l'événement " +
        "définitivement.",
    ],
    [
      "sante_infrastructure",
      "Indicateurs de surveillance. Elle ne rend QUE ce que le produit mesure " +
        "réellement : la maquette affichait une disponibilité, des websockets et " +
        "des IOPS que rien ne relève, et inventer un chiffre sur l'écran où l'on " +
        "décide ferait douter de tous les autres. Les surfaces de limitation y " +
        "restent SÉPARÉES — une saturation de la page publique peut être un " +
        "vendeur qui perce, une saturation de l'authentification est une " +
        "attaque. `stable` : elle n'écrit rien, et le moteur refusera toute " +
        "écriture qu'on y ajouterait.",
    ],
    [
      "alertes_admin",
      "Alertes du panneau. Elles PRÉCÈDENT les compteurs, et portent leur VALEUR " +
        "avec leur seuil — « 1 840 pour un seuil de 1 200 », jamais « ce compte " +
        "dépasse » : un chiffre se vérifie, une appréciation se discute. Elles se " +
        "lisent sur `usage_counters`, pas sur `tracked_parcels`, pour que le coût " +
        "suive le nombre d'INSCRITS et non leur activité.",
    ],
    [
      "etat_veilleur",
      "État des tâches de fond, rendu SÉPARÉMENT des alertes — parce que « jamais " +
        "déployé » doit s'afficher sans alerter. Le mélanger aux alertes " +
        "obligerait à choisir entre le taire, et l'on ignorerait qu'aucune tâche " +
        "ne tourne, ou l'alerter à tort. L'ABSENCE de ligne est l'information.",
    ],
    [
      "compteurs_admin",
      "Compteurs du panneau. Les comptes sont exacts — `profiles` est la seule " +
        "table dont le volume suit les inscriptions et non l'usage. Les colis " +
        "viennent des compteurs dénormalisés et sont bornés au MOIS : leur coût " +
        "ne croît pas avec l'âge du produit.",
    ],
    [
      "repartir_commandes_admin",
      "Répartition des commandes de la plateforme par statut, pour l'anneau du " +
        "panneau. Elle NE RÉUTILISE PAS `compter_commandes_par_etat`, qui est " +
        "`security invoker` : appelée par un administrateur, celle-là rendrait SES " +
        "commandes — c'est-à-dire zéro — sur un panneau qui prétend décrire tout " +
        "le produit. Elle ne rend QUE DES NOMBRES : aucun pseudo, aucune " +
        "référence, aucune boutique, donc aucune donnée tierce lue, donc aucun " +
        "audit à écrire. C'est ce qui l'autorise à vivre sur l'écran d'accueil là " +
        "où un TABLEAU de commandes y écrirait une entrée de journal à chaque " +
        "ouverture.",
    ],
    [
      "repartir_journal_admin",
      "Répartition du journal d'audit par famille, pour l'anneau et les tuiles de " +
        "son écran. Garde interne `est_admin()`. Elle ne lit que `admin_audit_log`, " +
        "donc NOS PROPRES GESTES : le journal ne contient aucune donnée de vendeur, " +
        "il contient ce que les administrateurs ont fait. La lire n'écrit donc rien " +
        "— indispensable ici plus qu'ailleurs, un compteur qui s'incrémenterait en " +
        "se lisant rendrait le journal illisible dès la deuxième ouverture. Bornee " +
        "au même plafond que `compter_journal_admin` : deux bornes différentes sur " +
        "la même carte feraient un total qui n'est pas la somme de ses parts.",
    ],
    [
      "compter_inscriptions_admin",
      "Comptes inscrits sur une fenêtre, pour la tuile « nouveaux inscrits » de la " +
        "liste des comptes. Garde interne `est_admin()`, et rien d'autre qu'un " +
        "NOMBRE en retour — aucune adresse, aucun identifiant, donc aucune donnée " +
        "tierce lue et aucun audit à écrire. Sa borne est INCLUSIVE : « depuis le " +
        "14 août » doit compter le 14 août.",
    ],
    [
      "compter_commandes_par_jour_admin",
      "Commandes créées par jour sur toute la plateforme, pour la courbe du " +
        "panneau. Même raisonnement que `repartir_commandes_admin` : garde interne " +
        "`est_admin()`, et rien d'autre que des dates et des comptes. Les jours " +
        "VIDES sont rendus — une courbe qui saute les jours sans commande rend ses " +
        "points équidistants alors que le temps ne l'est pas, et une semaine morte " +
        "s'y lirait comme une semaine pleine.",
    ],
    [
      "est_admin",
      "LA SEULE AUTORITÉ sur la question « cet appelant est-il administrateur ». " +
        "Ouverte à `authenticated` parce que chaque garde l'appelle. Elle lit le " +
        "rôle EN BASE, jamais dans un claim du jeton : un jeton reste valide " +
        "jusqu'à son expiration même après une rétrogradation, et s'y fier " +
        "laisserait un ancien administrateur travailler une heure de plus. Elle " +
        "exige aussi `status = 'active'` — sans quoi suspendre un compte lui " +
        "retirerait l'accès vendeur tout en lui laissant l'accès à TOUTES les " +
        "données, l'inverse exact de l'intention.",
    ],
    [
      "journaliser_admin",
      "Écriture d'une entrée d'audit. Ouverte à `authenticated` parce que les " +
        "fonctions de lecture l'appellent avec la session de l'administrateur. " +
        "Elle VÉRIFIE LE RÔLE ELLE-MÊME et relit l'email de l'auteur en base " +
        "plutôt que de le recevoir en argument : une fonction d'audit qui écrit " +
        "ce qu'on lui dit accepterait une entrée forgée par n'importe quel " +
        "utilisateur, et le journal deviendrait un endroit où écrire des " +
        "mensonges sur les autres.",
    ],
    [
      "lister_comptes_admin",
      "Liste des comptes pour l'administration. `SECURITY DEFINER` parce qu'un " +
        "administrateur lit des lignes que sa RLS lui refuse ; la garde vit donc " +
        "dans son corps, en tête. Elle écrit UNE entrée d'audit portant les " +
        "CRITÈRES — une entrée par ligne affichée noierait les consultations " +
        "individuelles, les seules réellement utiles en cas de litige. " +
        "`VOLATILE` et non `stable` : PostgREST exécute une fonction `stable` en " +
        "transaction lecture seule, et l'audit ne pouvait pas s'y écrire.",
    ],
    [
      "lire_compte_admin",
      "Détail d'un compte. Trace la consultation AVEC sa cible, et le fait même " +
        "quand le compte n'existe pas : ne consigner que les succès laisserait " +
        "l'énumération d'identifiants totalement invisible, alors que c'est " +
        "exactement le motif qu'on chercherait après coup.",
    ],
    [
      "colis_par_jour_admin",
      "Les colis pris en charge JOUR PAR JOUR, pour la frise de surveillance. " +
        "`usage_counters` tient le compteur au MOIS : il répond « combien ce " +
        "mois-ci », jamais « depuis quand ça monte », et c'est QUAND qu'on " +
        "demande devant une facture inattendue. `stable` et SANS audit : un " +
        "agrégat par jour, tous vendeurs confondus, ne désigne les données de " +
        "personne — même règle que `stockage_total_admin`. Garde interne " +
        "`est_admin()`.",
    ],
    [
      "compter_journal_admin",
      "Le nombre d'entrées du journal, avec les MÊMES filtres que la lecture — " +
        "un total qui les ignorerait afficherait « 1 284 entrées » au-dessus " +
        "d'une liste qui en montre trois. `stable` comme sa jumelle, et pour la " +
        "même raison : compter le journal ne l'écrit pas non plus. Garde " +
        "interne `est_admin()`, comme toute la surface.",
    ],
    [
      "lire_journal_admin",
      "Lecture du journal. Reste DÉLIBÉRÉMENT `stable` : PostgREST l'exécute donc " +
        "en transaction lecture seule, et toute écriture qu'on y ajouterait " +
        "serait refusée par le moteur. « Lire le journal n'écrit pas dans le " +
        "journal » cesse d'être une intention commentée pour devenir une " +
        "propriété que la base fait respecter — sans quoi ouvrir la page d'audit " +
        "y ajouterait une ligne, qui apparaîtrait à la consultation suivante.",
    ],
    [
      "analyser_activite",
      "Compteurs d'activité de l'écran des analyses. `SECURITY INVOKER` — donc " +
        "exécutée sous la RLS de l'appelant : un vendeur ne peut structurellement " +
        "agréger que ses propres commandes. Ce sont des MÉTRIQUES DE VERDICT, " +
        "celles qui servent à décider : une fuite y serait parfaitement crédible, " +
        "puisqu'un total gonflé ressemble exactement à un total normal. Elle " +
        "s'appuie sur `views_count` dénormalisé plutôt que sur une jointure vers " +
        "`link_views` — la table qui grossit le plus vite du produit, une ligne " +
        "par visiteur ET par jour.",
    ],
    [
      "repartir_transporteurs",
      "Répartition des colis par transporteur, écran des analyses. " +
        "`SECURITY INVOKER` — donc exécutée sous la RLS de l'appelant : elle ne " +
        "peut structurellement compter que les colis de sa propre boutique, et il " +
        "n'y a aucun filtre de propriété à écrire dans son corps, donc aucun à " +
        "oublier. Elle rend le CODE du transporteur, jamais son nom : la " +
        "traduction vit dans le dépôt, et l'écrire en base la figerait à la date " +
        "de la migration. Elle existe parce que les agrégats groupés de " +
        "PostgREST sont DÉSACTIVÉS sur ce projet — mesuré : regrouper côté " +
        "application aurait exigé de rapatrier tous les colis de la période, ou " +
        "de les plafonner et de rendre une distribution tronquée présentée " +
        "comme complète.",
    ],
    [
      "delai_moyen_livraison",
      "Durée moyenne de livraison, écran des analyses. `SECURITY INVOKER` — " +
        "même raison que ci-dessus. Elle rend `null` plutôt que zéro quand aucun " +
        "colis n'est livré : « 0 jour » affirmerait une livraison instantanée, " +
        "et l'absence de colis livré n'est pas une performance.",
    ],
    [
      "compter_ouvertures_par_jour",
      "Ouvertures de liens par jour, écran des analyses. `SECURITY INVOKER` — " +
        "la policy de `link_views` remonte à `orders → shops → profiles`, donc " +
        "un vendeur ne voit que les ouvertures de ses propres commandes. " +
        "⚠️ C'EST LA SEULE LECTURE DU PRODUIT QUI AGRÈGE `link_views`, la table " +
        "qui grossit le plus vite — une ligne par visiteur ET par jour. Elle est " +
        "bornée à la période choisie, à une boutique par la RLS, et un index " +
        "couvre exactement sa jointure. Elle rend les JOURS VIDES : un graphe qui " +
        "les saute fait lire une semaine morte comme une semaine pleine.",
    ],
    [
      "compter_commandes_par_semaine",
      "Frise hebdomadaire de l'écran des analyses. `SECURITY INVOKER` — donc " +
        "exécutée sous la RLS de l'appelant : la jointure externe sur `orders` " +
        "ne peut structurellement voir que les commandes de sa propre boutique, " +
        "et il n'y a aucun filtre de propriété à écrire dans son corps, donc " +
        "aucun à oublier. Elle existe parce que regrouper par semaine côté " +
        "application obligerait à RAPATRIER douze semaines de commandes pour " +
        "n'en rendre que douze nombres — jusqu'à deux mille quatre cents lignes " +
        "chez un fournisseur à deux cents commandes par semaine. L'axe du temps " +
        "vient d'un `generate_series` et non des données : une semaine sans " +
        "commande doit rester visible, sans quoi le graphique montrerait une " +
        "activité continue là où il y a eu un trou.",
    ],
    [
      "compter_envois",
      "Compteurs de l'écran des envois. `SECURITY INVOKER` — donc exécutée sous " +
        "la RLS de l'appelant : elle ne peut structurellement compter que les " +
        "colis de sa propre boutique, et il n'y a aucun filtre de propriété à " +
        "écrire dans son corps, donc aucun à oublier. Elle existe parce que cinq " +
        "requêtes séparées liraient cinq fois le même ensemble de lignes ; un " +
        "`count(*) filter` les obtient d'un seul parcours. Le seuil de silence " +
        "lui est PASSÉ EN ARGUMENT plutôt qu'écrit en dur : la valeur vit dans " +
        "`silence.ts`, et une seconde définition en base divergerait au premier " +
        "ajustement sans que personne ne pense à regarder dans une migration.",
    ],
    [
      "archiver_lot",
      "Archivage par LOT, tout-ou-rien. `SECURITY INVOKER` — donc exécutée avec " +
        "les droits de l'appelant, sous SA RLS : elle ne peut structurellement " +
        "pas toucher la commande d'un autre vendeur, et il n'y a aucun contrôle " +
        "de propriété à écrire dans son corps, donc aucun à oublier. Elle existe " +
        "parce qu'un `update ... where id = any(...)` ignorerait SILENCIEUSEMENT " +
        "les lignes hors de portée : elle compare ce qu'elle a modifié à ce " +
        "qu'on lui a demandé, et lève si les deux diffèrent.",
    ],
    [
      "arbitrer_qc",
      "SEULE écriture publique du produit. En `security definer` parce que " +
        "`anon` n'a et ne doit avoir aucun droit sur `orders` : sans elle, il " +
        "faudrait une policy d'UPDATE ouverte à `anon`, laquelle porterait sur " +
        "TOUTES les commandes. Elle exige le jeton et n'accepte AUCUN " +
        "identifiant de commande — en accepter un permettrait d'arbitrer la " +
        "commande d'un autre vendeur avec un jeton valide quelconque. Elle " +
        "refait le filtre de suspension et borne le commentaire.",
    ],
    [
      "journaliser_vendeur",
      "Écrit le journal d'un vendeur sur SES commandes. Volontairement " +
        "DISTINCTE de `journaliser`, qui reste réservée au rôle système : " +
        "celle-ci refuse les types `qc_*` et `lien_revoque`, et écrit l'acteur " +
        "en dur. Un vendeur qui pourrait écrire « le client a approuvé » " +
        "fabriquerait la seule pièce contestable du journal. Elle vérifie la " +
        "PROPRIÉTÉ dans son corps, `security definer` mettant la RLS de côté.",
    ],
    [
      "regenerer_jeton_public",
      "Unique chemin légitime de révocation d'un lien. En `security definer` " +
        "pour poser le drapeau qu'exige le déclencheur d'immuabilité, mais elle " +
        "vérifie la PROPRIÉTÉ dans son corps — sans quoi elle contournerait la " +
        "RLS et permettrait de couper l'accès aux clients d'un autre vendeur.",
    ],
  ]);

  test("aucune fonction de public n'est exécutable par anon, authenticated ou PUBLIC", async () => {
    const toutes = await interroger<{ nom: string }>(
      bd,
      `select p.proname as nom
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
       order by p.proname`,
    );

    expect(
      toutes.length,
      "Aucune fonction dans public : la sonde n'inspecte rien, donc ne prouve rien.",
    ).toBeGreaterThan(0);

    const ouvertes = await interroger<{ nom: string; beneficiaire: string }>(
      bd,
      `select p.proname as nom, a.grantee::regrole::text as beneficiaire
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
       where n.nspname = 'public'
         and a.privilege_type = 'EXECUTE'
         and a.grantee::regrole::text in ('public', '-', 'anon', 'authenticated')
       order by p.proname`,
    );

    const defauts = ouvertes
      .filter((o) => !FONCTIONS_OUVERTES_ADMISES.has(o.nom))
      .map((o) => `public.${o.nom} exécutable par ${o.beneficiaire}`);
    expect(defauts, defauts.join(" | ")).toEqual([]);

    const exceptionsPerimees = [...FONCTIONS_OUVERTES_ADMISES.keys()].filter(
      (nom) => !ouvertes.some((o) => o.nom === nom),
    );
    expect(exceptionsPerimees, `Exceptions périmées : ${exceptionsPerimees.join(", ")}`).toEqual([]);
  });
});

describe("Sonde C — privilèges de colonne", () => {
  /**
   * Ce qui empêche un vendeur de se promouvoir admin doit être un privilège de
   * COLONNE, pas une policy : une policy sur `profiles` qui lit `profiles`
   * produit une récursion infinie (L-002). Les privilèges de colonne sont
   * évalués AVANT les policies, donc ils tiennent même si une policy future
   * autorise trop largement.
   *
   * La liste ci-dessous est un inventaire EXHAUSTIF, pas une sélection. Le test
   * échoue si une colonne modifiable apparaît sans y figurer, ET si une entrée
   * de la liste n'est plus modifiable — sans quoi un retrait accidentel de
   * droit passerait inaperçu jusqu'à ce qu'un vendeur ne puisse plus se
   * configurer.
   */
  const COLONNES_MODIFIABLES_ATTENDUES = new Set([
    "profiles.account_type",
    "profiles.locale",
    // Migration 154 : le nom affiché dans l'espace vendeur. Un libellé libre,
    // borné par une contrainte de longueur, qui ne commande aucun accès.
    "profiles.nom_affiche",
    "shops.name",
    // `shops.slug` a été RETIRÉ par la migration 004 : la colonne est unique et
    // aucune fonctionnalité ne l'utilise, donc l'ouvrir en écriture offrait un
    // espace de noms global au premier arrivé, sans contrepartie.
    "shops.logo_url",
    "shops.accent_color",
    "shops.default_language",
    "shops.watermark_enabled",
    // Les trois réseaux (migration 085). Ils sont FACULTATIFS et leur domaine
    // est contraint EN BASE : un lien libre rendu sur la page publique d'un
    // vendeur serait une redirection ouverte offerte à qui prend son compte.
    "shops.instagram_url",
    "shops.tiktok_url",
    "shops.whatsapp_url",
    // Le site du vendeur (migration 133). ⚠️ C'est le SEUL lien du produit dont
    // l'hôte n'est pas contraint — c'est son domaine à lui. Ce qui tient à la
    // place : `https` en toutes lettres, donc UN SEUL schéma autorisé plutôt
    // qu'une liste d'interdits, et aucune arobase dans l'autorité, sans quoi
    // `https://instagram.com@attaquant.example/x` s'afficherait comme Instagram
    // sur la page que le client d'un vendeur croit être la sienne.
    "shops.site_url",
    // La description de la boutique (migration 147) : une ligne sous son nom,
    // sur la page du client. ⚠️ ELLE EST BORNÉE EN BASE à 150 caractères, pas
    // seulement dans le formulaire — une règle applicative s'oublie dans un
    // nouveau chemin d'écriture, une contrainte de colonne non. `null` vaut
    // « non configurée » et la page client OMET alors la ligne : c'est la
    // décision 26, et c'est la fonction de lecture publique qui la fait
    // respecter, pas le rendu.
    "shops.description",
    // `orders` — sont volontairement ABSENTES : `public_token` et
    // `unsubscribe_token` (immuables, et deux pouvoirs distincts), `shop_id`
    // (aucun transfert entre comptes), `created_at`, `updated_at` (tenue par
    // déclencheur) et `first_content_at` (c'est une MESURE, pas une donnée du
    // vendeur : la lui laisser écrire reviendrait à lui laisser écrire notre
    // métrique de verdict).
    "orders.customer_label",
    "orders.product_ref",
    "orders.internal_notes",
    "orders.status",
    "orders.qc_status",
    "orders.tracking_number",
    "orders.carrier_code",
    "orders.cover_media_id",
    "orders.notify_email",
    "orders.archived_at",
    // `order_media` — sont volontairement ABSENTES : `taille_octets` (elle fonde
    // le MODÈLE DE COÛT et n'est écrite qu'une fois, avec la valeur RELUE chez
    // le fournisseur de stockage), `cle` (la faire pointer ailleurs désignerait
    // l'objet d'un autre vendeur — la RLS ne le verrait pas, la ligne appartient
    // bien à l'appelant, c'est sa VALEUR qui change de cible), `type`,
    // `order_id`, `source` et `created_at`.
    "order_media.position",
    "order_media.cle_vignette",
    "order_media.largeur",
    "order_media.hauteur",
    "order_media.duree_s",
  ]);

  test("seules les colonnes déclarées sont modifiables par authenticated", async () => {
    const modifiables = await interroger<{ cible: string }>(
      bd,
      `select table_name || '.' || column_name as cible
       from information_schema.column_privileges
       where table_schema = 'public'
         and grantee = 'authenticated'
         and privilege_type = 'UPDATE'
       order by 1`,
    );

    expect(
      modifiables.length,
      "Aucune colonne modifiable trouvée : soit la sonde vise à côté, soit le " +
        "produit est inutilisable. Dans les deux cas elle ne prouve rien.",
    ).toBeGreaterThan(0);

    const observees = new Set(modifiables.map((m) => m.cible));

    const enTrop = [...observees].filter((c) => !COLONNES_MODIFIABLES_ATTENDUES.has(c));
    expect(
      enTrop,
      `Colonnes modifiables NON déclarées : ${enTrop.join(", ")}. Si l'une d'elles ` +
        "est `profiles.role`, c'est une escalade de privilège complète.",
    ).toEqual([]);

    const manquantes = [...COLONNES_MODIFIABLES_ATTENDUES].filter((c) => !observees.has(c));
    expect(manquantes, `Colonnes attendues devenues non modifiables : ${manquantes.join(", ")}`).toEqual(
      [],
    );
  });

  test("role et status ne sont modifiables par personne d'autre que le serveur", async () => {
    const sensibles = await interroger<{ cible: string; grantee: string; privilege_type: string }>(
      bd,
      `select table_name || '.' || column_name as cible, grantee, privilege_type
       from information_schema.column_privileges
       where table_schema = 'public'
         and table_name = 'profiles'
         and column_name in ('role', 'status')
         and grantee in ('anon', 'authenticated')
       order by 1, 2, 3`,
    );

    // Contre-test positif : la sonde doit voir le SELECT, sinon elle regarde une
    // table vide et son silence sur UPDATE ne vaut rien.
    expect(
      sensibles.some((s) => s.privilege_type === "SELECT"),
      "La sonde ne voit même pas le SELECT sur profiles.role : elle n'inspecte rien.",
    ).toBe(true);

    const ecritures = sensibles.filter((s) => s.privilege_type !== "SELECT");
    expect(
      ecritures.map((e) => `${e.grantee} peut ${e.privilege_type} sur ${e.cible}`),
      "Un droit d'écriture sur profiles.role permet à un vendeur de se promouvoir admin.",
    ).toEqual([]);
  });
});

describe("Sonde D — anon n'a aucun droit de table", () => {
  test("anon ne peut rien lire ni écrire dans public", async () => {
    const droitsAnon = await interroger<{ table_name: string; privilege_type: string }>(
      bd,
      `select table_name, privilege_type
       from information_schema.role_table_grants
       where table_schema = 'public' and grantee = 'anon'
       order by 1, 2`,
    );

    expect(
      droitsAnon.map((d) => `anon peut ${d.privilege_type} sur ${d.table_name}`),
      "La page publique lit par vue restreinte, jamais par droit direct de anon " +
        "sur les tables.",
    ).toEqual([]);
  });

  test("contre-test positif : authenticated PEUT lire ses tables", async () => {
    // Une suite où tout est refusé passe à 100 % sans rien prouver. Ce test
    // établit que la sonde D distingue réellement anon de authenticated, et
    // qu'elle échouerait si les droits légitimes disparaissaient.
    const droitsAuth = await interroger<{ table_name: string }>(
      bd,
      `select distinct table_name
       from information_schema.role_table_grants
       where table_schema = 'public'
         and grantee = 'authenticated'
         and privilege_type = 'SELECT'
       order by 1`,
    );

    // La liste s'allonge à chaque table du produit. Elle est écrite en dur, et
    // pas dérivée du catalogue, parce que c'est le POINT : une table nouvelle
    // qui apparaît ici doit obliger quelqu'un à confirmer qu'elle est bien
    // censée être lisible par un vendeur authentifié.
    expect(droitsAuth.map((d) => d.table_name)).toEqual([
      // Lisible par le vendeur, et par lui seul : c'est son compteur de vues et
      // son indicateur « jamais ouvert ». AUCUN droit d'écriture ne
      // l'accompagne — un vendeur qui pourrait s'ajouter des vues se
      // fabriquerait une preuve d'usage sur un produit dont le livrable EST la
      // donnée d'usage.
      "link_views",
      // Le journal d'une commande, lisible par son vendeur et par lui seul.
      // AUCUN droit d'écriture : la table est append-only et son seul chemin
      // d'écriture est `security definer`. Un journal qu'on peut corriger n'est
      // pas un journal.
      "order_events",
      "order_media",
      // Le lien commande ↔ colis, lisible par le vendeur pour afficher le suivi
      // de sa commande. Aucune écriture : elle vient du transporteur.
      "order_parcels",
      "orders",
      // Les points de passage d'un colis, lisibles par son vendeur. Un vendeur
      // qui pourrait les ÉCRIRE raconterait à son client une expédition qui n'a
      // pas eu lieu : aucun droit d'écriture n'accompagne celui-ci.
      "parcel_checkpoints",
      "profiles",
      "shops",
      // Les colis suivis. Lecture seule, pour la même raison.
      "tracked_parcels",
    ]);
  });
});

describe("Sonde E — aucune policy n'est trivialement permissive", () => {
  /**
   * Trouvé par falsification : remplacer la policy de mise à jour des profils
   * par `using (true) with check (true)` ne faisait échouer AUCUN test.
   *
   * La raison est instructive. Postgres applique les policies SELECT aux lignes
   * lues par la clause `WHERE` d'un `UPDATE` : c'était donc la policy de LECTURE
   * qui bloquait l'écriture, pas celle d'écriture. La protection tenait à une
   * propriété d'un AUTRE objet — et se serait effondrée en silence le jour où
   * quelqu'un élargit la lecture, ce qui est un changement parfaitement banal
   * (« que l'admin puisse lire tous les profils »).
   *
   * « Ce serait ouvert si quelqu'un élargissait la lecture » est exactement la
   * phrase qui signale une protection en sursis (L-029). Cette sonde ne dépend
   * d'aucun comportement : elle interroge l'EXPRESSION de chaque policy.
   */
  const POLICIES_PERMISSIVES_ADMISES = new Map<string, string>([
    // Aucune. Toute entrée devra porter la raison pour laquelle une policy
    // ouverte est correcte à cet endroit précis.
  ]);

  test("aucune policy d'écriture ne porte un qualificatif trivialement vrai", async () => {
    const policies = await interroger<{
      table_name: string;
      polname: string;
      commande: string;
      using_expr: string | null;
      check_expr: string | null;
    }>(
      bd,
      `select c.relname as table_name,
              p.polname,
              case p.polcmd
                when 'r' then 'SELECT' when 'a' then 'INSERT'
                when 'w' then 'UPDATE' when 'd' then 'DELETE'
                else 'ALL' end as commande,
              pg_get_expr(p.polqual, p.polrelid) as using_expr,
              pg_get_expr(p.polwithcheck, p.polrelid) as check_expr
       from pg_policy p
       join pg_class c on c.oid = p.polrelid
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
       order by c.relname, p.polname`,
    );

    expect(policies.length, "aucune policy trouvée : la sonde n'inspecte rien").toBeGreaterThan(0);

    const estTrivial = (e: string | null): boolean => e !== null && e.trim().toLowerCase() === "true";

    const defauts = policies
      .filter((p) => !POLICIES_PERMISSIVES_ADMISES.has(p.polname))
      .filter((p) => estTrivial(p.using_expr) || estTrivial(p.check_expr))
      .map((p) => `${p.table_name}.${p.polname} (${p.commande}) est ouverte à tous`);

    expect(defauts, defauts.join(" | ")).toEqual([]);

    const perimees = [...POLICIES_PERMISSIVES_ADMISES.keys()].filter(
      (nom) => !policies.some((p) => p.polname === nom),
    );
    expect(perimees, `Exceptions périmées : ${perimees.join(", ")}`).toEqual([]);
  });

  test("le filtre de chaque policy dépend de l'identité de l'appelant", async () => {
    /*
     * ON CHERCHE L'EFFET, PAS LE MOT.
     *
     * Une première version exigeait la chaîne « auth.uid() » DANS le texte de la
     * policy. Elle a échoué sur `orders`, dont les policies appellent
     * `mon_shop_id()` — une fonction qui dépend pourtant entièrement de
     * l'identité de l'appelant. Un contrôle qui cherche un MOT ne prouve rien
     * (L-020) : il refusait une policy correcte, et il aurait tout aussi bien
     * accepté une policy où « auth.uid() » n'apparaît que dans un commentaire.
     *
     * La sonde résout donc la dépendance : elle relève d'abord les fonctions de
     * `public` dont le CORPS s'appuie sur `auth.uid()`, puis accepte qu'une
     * policy s'appuie sur l'une d'elles. Le contrôle reste honnête dans les deux
     * sens — le jour où `mon_shop_id()` cesserait de dépendre de l'identité,
     * elle sortirait de l'ensemble et les policies qui l'emploient échoueraient.
     */
    const porteusesDIdentite = await interroger<{ nom: string }>(
      bd,
      `select p.proname as nom
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prosrc like '%auth.uid()%'
       order by 1`,
    );

    const noms = porteusesDIdentite.map((f) => f.nom);
    expect(
      noms.length,
      "Aucune fonction de public ne s'appuie sur auth.uid() : la sonde ne " +
        "résout rien, et son indulgence serait vide de sens.",
    ).toBeGreaterThan(0);

    const policies = await interroger<{
      table_name: string;
      polname: string;
      filtre: string;
    }>(
      bd,
      `select c.relname as table_name, p.polname,
              coalesce(pg_get_expr(p.polqual, p.polrelid), '') || ' ' ||
              coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') as filtre
       from pg_policy p
       join pg_class c on c.oid = p.polrelid
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
       order by 1, 2`,
    );

    expect(policies.length, "aucune policy trouvée : la sonde vise à côté").toBeGreaterThan(0);

    const sansIdentite = policies
      .filter(
        (p) =>
          !p.filtre.includes("auth.uid()") &&
          !noms.some((nom) => p.filtre.includes(`${nom}(`)),
      )
      .map((p) => `${p.table_name}.${p.polname}`);

    expect(
      sansIdentite,
      `Policies dont le filtre ne dépend pas de l'identité de l'appelant : ` +
        `${sansIdentite.join(", ")}. Une policy peut être non triviale ET ne ` +
        "dépendre de personne — « using (status = 'active') » laisserait chacun " +
        "voir les lignes de tous les autres.",
    ).toEqual([]);
  });
});

describe("Sonde F — chemin de recherche des fonctions `security definer`", () => {
  /**
   * Une fonction `security definer` s'exécute avec les droits de son
   * PROPRIÉTAIRE. Si son `search_path` n'est pas épinglé, l'appelant choisit
   * quelle table `orders` la fonction lira : il lui suffit de créer un schéma à
   * lui, d'y poser un objet du même nom, et de le placer devant dans son propre
   * chemin. La fonction, elle, ne change pas d'une ligne.
   *
   * C'est exactement le genre de propriété que décrit L-028 : elle vit dans le
   * catalogue, aucune relecture du CORPS ne peut la voir, et son absence ne
   * produit aucune erreur — seulement un résultat qui vient d'ailleurs.
   *
   * Vérifié par exécution avant de poser cette sonde : retirer
   * `set search_path = ''` de `mon_shop_id()` — la fonction pivot de la moitié
   * des policies — laissait la suite ENTIÈREMENT VERTE.
   */
  const DEFINER_SANS_CHEMIN_ADMISES = new Map<string, string>([
    // Aucune. Une entrée ici devrait expliquer pourquoi une fonction privilégiée
    // peut laisser son appelant décider des objets qu'elle touche.
  ]);

  /*
   * ⚠️ CETTE SONDE NE VOYAIT QUE LES FONCTIONS `security definer`, ET C'ÉTAIT
   * UN ANGLE MORT MESURÉ.
   *
   * Le filtre `and p.prosecdef` la rendait aveugle aux 20 fonctions `security
   * invoker` du schéma. Deux d'entre elles portaient un écart réel, relevé le
   * 01/09/2026 en interrogeant `pg_proc` À LA MAIN :
   *
   *   compter_commandes_par_etat  →  search_path = public, pg_temp
   *   refuser_truncate_audit      →  proconfig NUL, aucun chemin du tout
   *
   * Aucune des deux n'était exploitable — la première qualifie ses relations,
   * la seconde n'en référence aucune. Mais `pg_temp` dans un chemin de
   * recherche est une porte que n'importe quel rôle peut franchir en créant une
   * table temporaire du bon nom, et la protection tenait donc à ce que personne
   * ne dé-qualifie jamais une référence. Surtout : la seconde est la fonction
   * qui garde le JOURNAL D'AUDIT — une exception dans l'inventaire est ce qui
   * fait qu'on cesse de lire l'inventaire.
   *
   * Le filtre est retiré. Le raisonnement qui l'avait posé — « seule une
   * fonction privilégiée peut être détournée » — est juste sur la GRAVITÉ et
   * faux sur l'INVENTAIRE : c'est en ne regardant qu'une moitié qu'on laisse
   * une valeur aberrante s'installer dans l'autre, puis migrer.
   */
  test("toute fonction du schéma épingle son `search_path` à vide", async () => {
    const fonctions = await interroger<{
      nom: string;
      signature: string;
      config: string[] | null;
    }>(
      bd,
      `select p.proname as nom,
              pg_get_function_identity_arguments(p.oid) as signature,
              p.proconfig as config
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prokind = 'f'
       order by 1, 2`,
    );

    expect(
      fonctions.length,
      "Aucune fonction trouvée dans public. La sonde n'inspecte rien, et un " +
        "ensemble vide passe tout.",
    ).toBeGreaterThan(0);

    const defauts = fonctions
      .filter((f) => !DEFINER_SANS_CHEMIN_ADMISES.has(f.nom))
      .filter((f) => !(f.config ?? []).some((c) => c === 'search_path=""'))
      .map(
        (f) =>
          `${f.nom}(${f.signature}) : chemin de recherche ` +
          `${f.config === null ? "ABSENT" : JSON.stringify(f.config)}`,
      );

    expect(
      defauts,
      "Fonctions dont le chemin de recherche n'est pas épinglé à " +
        `vide : ${defauts.join(" | ")}. L'appelant peut leur substituer ses ` +
        "propres objets.",
    ).toEqual([]);

    // Deuxième sens : une exception qui n'a plus d'objet doit faire échouer.
    const perimees = [...DEFINER_SANS_CHEMIN_ADMISES.keys()].filter(
      (nom) => !fonctions.some((f) => f.nom === nom),
    );
    expect(perimees, `Exceptions périmées : ${perimees.join(", ")}`).toEqual([]);
  });

  test("contre-test positif : la sonde distingue une fonction NON épinglée", async () => {
    /*
     * ON NE FALSIFIE PAS UNE ABSENCE EN LA REGARDANT.
     *
     * Le test ci-dessus passe aujourd'hui parce que toutes les fonctions sont
     * correctes. Rien, dans ce vert, ne dit qu'il serait rouge autrement : une
     * requête mal écrite rendrait un ensemble vide et se lirait pareil.
     *
     * On pose donc un TÉMOIN — une fonction privilégiée délibérément sans
     * chemin — dans une transaction ANNULÉE, et on exige que la requête de la
     * sonde la trouve. Le témoin ne survit pas au test : `rollback` défait la
     * création, y compris si l'assertion échoue.
     */
    await bd.query("begin");
    try {
      /*
       * ⚠️ LE TÉMOIN EST `security INVOKER`, ET C'EST TOUT L'INTÉRÊT.
       *
       * Il était `security definer` — donc il aurait été trouvé même par
       * l'ancienne requête, qui filtrait `prosecdef`. Un contre-test qui passe
       * avec ET sans le filtre ne prouve rien sur le filtre : il faut qu'il
       * échoue quand la sonde se rétrécit, sinon il valide l'angle mort qu'on
       * vient de fermer.
       */
      await bd.query(
        "create function public.temoin_sans_chemin() returns int " +
          "language sql as 'select 1'",
      );

      const trouvees = await interroger<{ nom: string }>(
        bd,
        `select p.proname as nom
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.prokind = 'f'
           and not (coalesce(p.proconfig, '{}') @> array['search_path=""'])`,
      );

      expect(
        trouvees.map((f) => f.nom),
        "La sonde n'a pas vu une fonction sans chemin de recherche alors " +
          "qu'elle venait d'être créée sous ses yeux. Son vert ne prouvait " +
          "donc rien.",
      ).toContain("temoin_sans_chemin");
    } finally {
      await bd.query("rollback");
    }
  });
});

describe("Sonde G — vues", () => {
  /**
   * Le dépôt ne contient AUCUNE vue, et c'est délibéré : la lecture publique est
   * une FONCTION qui exige le jeton, précisément parce qu'une vue se parcourt.
   *
   * Une sonde qui se contenterait de constater cette absence porterait sur un
   * ensemble vide — elle passerait aussi bien le jour où la vue existe et où la
   * requête vise à côté. C'est le cas de la sonde de `page-publique`, qui ne
   * regarde que `anon` : une vue `create view mes_commandes as select * from
   * orders` accordée à `authenticated`, sans `security_invoker`, rendrait
   * TOUTES les commandes de TOUS les vendeurs — `internal_notes` et
   * `public_token` compris — sans qu'une seule suite rougisse.
   *
   * Deux propriétés indépendantes se cumulent donc ici, et la seconde est celle
   * qui manquait : une vue s'exécute par défaut avec les droits de CELUI QUI
   * L'A CRÉÉE, donc du propriétaire, donc SANS la RLS de l'appelant.
   */
  const VUES_ADMISES = new Map<string, string>([
    // Aucune vue n'existe. Une entrée ici devra dire quelle donnée la vue
    // expose et pourquoi son parcours intégral est acceptable.
  ]);

  test("aucune vue n'est lisible par anon ou authenticated sans `security_invoker`", async () => {
    const vues = await interroger<{
      nom: string;
      invoker: boolean;
      lisible_anon: boolean;
      lisible_auth: boolean;
    }>(
      bd,
      `select c.relname as nom,
              coalesce(c.reloptions, '{}') @> array['security_invoker=true'] as invoker,
              has_table_privilege('anon', c.oid, 'SELECT') as lisible_anon,
              has_table_privilege('authenticated', c.oid, 'SELECT') as lisible_auth
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('v', 'm')
       order by 1`,
    );

    const defauts = vues
      .filter((v) => !VUES_ADMISES.has(v.nom))
      .filter((v) => (v.lisible_anon || v.lisible_auth) && !v.invoker)
      .map(
        (v) =>
          `${v.nom} : lisible par ${v.lisible_anon ? "anon" : "authenticated"} ` +
          "et exécutée avec les droits du PROPRIÉTAIRE, donc hors RLS",
      );

    expect(defauts, defauts.join(" | ")).toEqual([]);

    const perimees = [...VUES_ADMISES.keys()].filter((nom) => !vues.some((v) => v.nom === nom));
    expect(perimees, `Exceptions périmées : ${perimees.join(", ")}`).toEqual([]);
  });

  test("contre-test positif : la sonde voit une vue qui contourne la RLS", async () => {
    // Même raison qu'en sonde F : l'inventaire des vues est VIDE, donc le test
    // ci-dessus est aujourd'hui muet. Le témoin est ce qui le rend probant.
    await bd.query("begin");
    try {
      await bd.query("create view public.temoin_vue as select id from public.orders");
      await bd.query("grant select on public.temoin_vue to authenticated");

      const vues = await interroger<{ nom: string; invoker: boolean; lisible_auth: boolean }>(
        bd,
        `select c.relname as nom,
                coalesce(c.reloptions, '{}') @> array['security_invoker=true'] as invoker,
                has_table_privilege('authenticated', c.oid, 'SELECT') as lisible_auth
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind in ('v', 'm')`,
      );

      const dangereuses = vues.filter((v) => v.lisible_auth && !v.invoker).map((v) => v.nom);
      expect(
        dangereuses,
        "La sonde n'a pas vu une vue accordée à `authenticated` sans " +
          "`security_invoker` créée sous ses yeux.",
      ).toContain("temoin_vue");

      // ... et le contre-test du contre-test : la même vue en `security_invoker`
      // ne doit PLUS être signalée, sinon la sonde refuserait tout et ne
      // prouverait rien de plus qu'un refus systématique.
      await bd.query("alter view public.temoin_vue set (security_invoker = true)");
      const apres = await interroger<{ invoker: boolean }>(
        bd,
        `select coalesce(c.reloptions, '{}') @> array['security_invoker=true'] as invoker
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname = 'temoin_vue'`,
      );
      expect(apres[0]?.invoker, "la sonde ne distingue pas les deux cas").toBe(true);
    } finally {
      await bd.query("rollback");
    }
  });
});

describe("Sonde H — toute policy d'écriture porte un `WITH CHECK` explicite", () => {
  /**
   * `CLAUDE.md` revendique « zéro INSERT sans `WITH CHECK`, zéro UPDATE sans
   * `WITH CHECK` ». C'était vrai, et rien ne l'exigeait.
   *
   * La sonde E, qui est la seule à lire `polwithcheck`, le CONCATÈNE avec
   * `polqual` dans un `coalesce` : un `WITH CHECK` absent y disparaît sans
   * laisser de trace, et la policy passe pour correcte parce que son `USING`,
   * lui, dépend bien de l'identité.
   *
   * Ce que la présence explicite achète : sur un `UPDATE`, Postgres se rabat sur
   * `USING` quand `WITH CHECK` manque. Les deux clauses répondent pourtant à
   * deux questions différentes — `USING` dit quelles lignes on a le droit de
   * MODIFIER, `WITH CHECK` dit ce qu'elles ont le droit de DEVENIR. Se reposer
   * sur le repli, c'est faire dépendre l'interdiction de déplacer une commande
   * chez un autre vendeur d'une propriété de la clause de LECTURE — la même
   * dépendance à un autre objet qui avait déjà piégé la sonde E, et exactement
   * la phrase de L-029 : « ce serait ouvert si quelqu'un élargissait le USING ».
   */
  const ECRITURES_SANS_CHECK_ADMISES = new Map<string, string>([
    // Aucune. Une entrée devra dire à quoi la ligne écrite est autorisée à
    // ressembler, et pourquoi la clause de lecture suffit à le garantir.
  ]);

  test("chaque policy INSERT ou UPDATE déclare son `WITH CHECK`", async () => {
    const ecritures = await interroger<{
      table_name: string;
      polname: string;
      commande: string;
      check_present: boolean;
    }>(
      bd,
      `select c.relname as table_name,
              p.polname,
              case p.polcmd when 'a' then 'INSERT' else 'UPDATE' end as commande,
              p.polwithcheck is not null as check_present
       from pg_policy p
       join pg_class c on c.oid = p.polrelid
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and p.polcmd in ('a', 'w')
       order by 1, 2`,
    );

    expect(
      ecritures.length,
      "Aucune policy d'écriture trouvée. Soit les migrations ne sont pas " +
        "appliquées, soit la sonde vise à côté — dans les deux cas son vert " +
        "ne vaut rien.",
    ).toBeGreaterThan(0);

    const defauts = ecritures
      .filter((p) => !ECRITURES_SANS_CHECK_ADMISES.has(p.polname))
      .filter((p) => !p.check_present)
      .map(
        (p) =>
          `${p.table_name}.${p.polname} (${p.commande}) : aucun WITH CHECK — ` +
          "ce que la ligne a le droit de DEVENIR n'est contrôlé par rien qui " +
          "lui soit propre",
      );

    expect(defauts, defauts.join(" | ")).toEqual([]);

    const perimees = [...ECRITURES_SANS_CHECK_ADMISES.keys()].filter(
      (nom) => !ecritures.some((p) => p.polname === nom),
    );
    expect(perimees, `Exceptions périmées : ${perimees.join(", ")}`).toEqual([]);
  });

  test("contre-test positif : la sonde voit un `WITH CHECK` retiré", async () => {
    /*
     * Falsification HORS du cas motivant : on ne touche pas à `orders`, la table
     * qui a motivé la sonde, mais à `order_media` — dont la policy de mise à
     * jour est celle qui autorise le réordonnancement, donc celle qu'on est le
     * plus susceptible de réécrire un jour sans y penser.
     *
     * Transaction annulée : la policy d'origine est intacte à la sortie, y
     * compris si l'assertion échoue.
     */
    await bd.query("begin");
    try {
      // `alter policy` ne sait pas RETIRER un `with check` : on recrée la policy
      // sans lui, ce qui est exactement le geste qu'un correctif pressé ferait.
      // Le `using` est celui de la vraie policy, à la lettre : une falsification
      // qui simplifie l'objet qu'elle casse ne casse pas l'objet.
      await bd.query("drop policy order_media_maj on public.order_media");
      await bd.query(
        "create policy order_media_maj on public.order_media for update to authenticated " +
          "using (exists (select 1 from public.orders o " +
          "where o.id = order_media.order_id and o.shop_id = public.mon_shop_id()))",
      );

      const sansCheck = await interroger<{ polname: string }>(
        bd,
        `select p.polname
         from pg_policy p
         join pg_class c on c.oid = p.polrelid
         join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and p.polcmd in ('a', 'w')
           and p.polwithcheck is null`,
      );

      expect(
        sansCheck.map((p) => p.polname),
        "La sonde n'a pas vu une policy d'écriture privée de son WITH CHECK " +
          "alors qu'elle venait d'être recréée sous ses yeux.",
      ).toContain("order_media_maj");
    } finally {
      await bd.query("rollback");
    }
  });
});

describe("Sonde H — l'état des déclencheurs du journal d'audit", () => {
  /**
   * L'APPEND-ONLY DU JOURNAL NE VAUT QUE PAR L'ÉTAT DE SES DÉCLENCHEURS.
   *
   * `admin_audit_log` porte deux déclencheurs qui interdisent la modification et
   * le vidage. Ils sont la seule chose qui rende le journal opposable : c'est la
   * pièce qu'on produirait en cas de litige sur une suspension.
   *
   * ⚠️ UN DÉCLENCHEUR « ORIGIN » NE S'EXÉCUTE PAS quand la session pose
   * `session_replication_role = 'replica'`. Mesuré le 01/09/2026, trois fois,
   * chacune en transaction annulée : `authenticated` et `service_role` se voient
   * refuser ce réglage (42501), mais le rôle des migrations, lui, l'obtient sans
   * erreur. Le journal était donc réécrivable SANS DDL — donc sans qu'aucun
   * déclencheur d'événement ne voie passer quoi que ce soit.
   *
   * La migration 131 les passe en `ALWAYS`. Elle n'arrête pas un adversaire
   * déterminé — le propriétaire de la table peut toujours `drop trigger` — mais
   * elle force un DDL VISIBLE plutôt qu'un `set` silencieux.
   *
   * ⚠️ CETTE SONDE EXISTE PARCE QUE LA FALSIFICATION EST RESTÉE VERTE. Après la
   * migration, remettre un déclencheur en `ORIGIN` n'a fait rougir AUCUN test :
   * rien n'inventoriait `tgenabled`. Un durcissement que personne ne surveille
   * est un durcissement qui sera défait sans qu'on le sache.
   */
  const ATTENDUS = ["admin_audit_log_append_only", "admin_audit_log_no_truncate"] as const;

  test("les deux déclencheurs du journal sont ALWAYS, pas ORIGIN", async () => {
    const etats = await interroger<{ nom: string; etat: string }>(
      bd,
      `select t.tgname as nom, t.tgenabled as etat
         from pg_trigger t
         join pg_class c on c.oid = t.tgrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = 'admin_audit_log'
          and not t.tgisinternal
        order by 1`,
    );

    // Un ensemble vide passe tout : un `drop trigger` ferait disparaître les
    // deux lignes, et un contrôle qui ne vérifie que l'état des lignes trouvées
    // serait vert sur un journal devenu librement modifiable.
    expect(
      etats.map((e) => e.nom).sort(),
      "Les déclencheurs du journal d'audit ont disparu : il n'est plus " +
        "append-only du tout.",
    ).toEqual([...ATTENDUS].sort());

    const affaiblis = etats.filter((e) => e.etat !== "A");
    expect(
      affaiblis.map((e) => `${e.nom} (tgenabled=${e.etat})`),
      "Des déclencheurs du journal ne sont plus `ALWAYS` : une session qui pose " +
        "`session_replication_role = 'replica'` les contourne, sans DDL, donc " +
        "sans laisser de trace.",
    ).toEqual([]);
  });
});

describe("Sonde I — qui peut poser un drapeau de session", () => {
  /**
   * L'IMMUABILITÉ DU JETON TIENT À UN DRAPEAU, ET LE DRAPEAU À UN INVENTAIRE.
   *
   * Le déclencheur `orders_jeton_public_immuable` refuse tout changement de
   * `public_token` SAUF si la session porte `droplink.rotation_jeton = 'oui'`.
   * Son propre commentaire dit : « la seule porte : un drapeau de session que
   * seule la fonction de rotation pose ».
   *
   * ⚠️ C'EST LA PHRASE-TYPE D'UNE PROTECTION QUI TIENT À UNE ABSENCE. Elle est
   * vraie aujourd'hui — vérifié : une seule fonction du schéma pose ce
   * drapeau-là. Mais rien ne l'exigeait, et le Principe V dit que ce jeton ne
   * transfère pas une donnée, il transfère une CAPACITÉ, définitivement.
   *
   * DEUX PROPRIÉTÉS SONT ÉPROUVÉES ICI, et la seconde compte autant :
   *
   *  1. L'inventaire des fonctions qui touchent un GUC `droplink.*` est FERMÉ,
   *     et vérifié dans les deux sens.
   *  2. Aucune ne construit le NOM ni la VALEUR du drapeau depuis un ARGUMENT.
   *     Une fonction générique — `poser_drapeau(p_cle, p_valeur)` — passerait
   *     l'inventaire en n'étant qu'une ligne de plus, et donnerait à son
   *     appelant la clé du déclencheur.
   *
   * Le drapeau est toujours posé avec `set_config(…, true)` : LOCAL à la
   * transaction. Sans ce troisième argument, la valeur survivrait à la requête
   * et fuiterait d'un appel à l'autre à travers le pool de connexions de
   * PostgREST — un `updated_at` figé, ou un arbitrage QC attribué au client au
   * lieu du vendeur, sur la requête d'après.
   */
  const TOUCHENT_UN_DRAPEAU: ReadonlyMap<string, string> = new Map([
    [
      "regenerer_jeton_public",
      "LA SEULE qui pose `droplink.rotation_jeton`. C'est la porte de la " +
        "révocation, le seul geste que le brief autorise à changer le jeton.",
    ],
    [
      "arbitrer_qc",
      "Pose `droplink.arbitrage_du_client` : l'écriture vient d'un visiteur SANS " +
        "compte, et le déclencheur d'historique doit l'attribuer au client et " +
        "non au vendeur.",
    ],
    [
      "appliquer_etat_colis",
      "Pose `droplink.ecriture_hors_vendeur` : la mise à jour vient du " +
        "transporteur, et ne doit pas faire bouger `updated_at`, qui mesure " +
        "l'activité DU VENDEUR.",
    ],
    [
      "compter_vue",
      "Même raison : une consultation par le client d'un vendeur n'est pas une " +
        "modification de la commande.",
    ],
    [
      "attacher_colis",
      "Pose `droplink.maj_transporteur` depuis la migration 136 : attacher une " +
        "commande à un colis DÉJÀ suivi y descend son état, et cette écriture-là " +
        "vient du transporteur, pas du vendeur. Sans le drapeau, coller un " +
        "numéro de suivi remonterait la commande en tête du tableau de bord " +
        "comme si le vendeur venait de la modifier.",
    ],
    [
      "jeton_public_immuable",
      "LIT le drapeau — c'est le déclencheur qui refuse la mutation du jeton.",
    ],
    [
      "qui_a_arbitre_le_qc",
      "LIT le drapeau d'arbitrage pour attribuer l'événement au bon acteur.",
    ],
    [
      "toucher_updated_at_commande",
      "LIT le drapeau d'écriture hors vendeur pour ne pas toucher `updated_at`.",
    ],
  ]);

  test("l'inventaire des fonctions qui touchent un drapeau est fermé", async () => {
    // ⚠️ DEUX ANTISLASHS, ET CE N'EST PAS UNE COQUETTERIE. Ce motif s'écrivait `'droplink\.'`
    // dans ce gabarit JavaScript, qui MANGE l'antislash : Postgres recevait `droplink.`, où le
    // point est un joker. La sonde attrapait donc aussi `hide_droplink_brand` (migration 167),
    // et aurait tout aussi bien attrapé n'importe quel `droplink_…` sans qu'aucun drapeau ne
    // soit posé. Mesuré le 19/09/2026 : le motif strict rend exactement les huit fonctions
    // déclarées ci-dessus, le motif mangé en rendait onze.
    const trouvees = await interroger<{ nom: string }>(
      bd,
      `select p.proname as nom
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prosrc ~ 'droplink\\.'
        order by 1`,
    );

    // Un ensemble vide passe tout : si le motif cessait de trouver quoi que ce
    // soit, l'inventaire serait « fermé » sur zéro fonction.
    expect(
      trouvees.length,
      "Aucune fonction ne touche un drapeau `droplink.*` : la sonde n'inspecte " +
        "plus rien, alors que l'immuabilité du jeton en dépend.",
    ).toBeGreaterThan(0);

    const inconnues = trouvees.map((f) => f.nom).filter((nom) => !TOUCHENT_UN_DRAPEAU.has(nom));
    expect(
      inconnues,
      `Fonctions qui touchent un drapeau de session sans être déclarées : ` +
        `${inconnues.join(", ")}. Le déclencheur d'immuabilité du jeton s'ouvre ` +
        "à qui sait poser `droplink.rotation_jeton`.",
    ).toEqual([]);

    // L'AUTRE SENS : une déclaration périmée masquerait la prochaine.
    const disparues = [...TOUCHENT_UN_DRAPEAU.keys()].filter(
      (nom) => !trouvees.some((f) => f.nom === nom),
    );
    expect(
      disparues,
      `Fonctions déclarées qui ne touchent plus aucun drapeau : ${disparues.join(", ")}.`,
    ).toEqual([]);
  });

  test("aucune ne construit son drapeau depuis un argument", async () => {
    const poseuses = await interroger<{ nom: string; corps: string }>(
      bd,
      `select p.proname as nom, p.prosrc as corps
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prosrc ~ 'set_config'
        order by 1`,
    );

    expect(poseuses.length, "Aucune poseuse trouvée : la sonde est vide.").toBeGreaterThan(0);

    const suspectes: string[] = [];
    for (const f of poseuses) {
      for (const appel of f.corps.matchAll(/set_config\s*\(([^;]*?)\)\s*;/g)) {
        const args = appel[1] ?? "";
        // Les deux premiers arguments doivent être des LITTÉRAUX. Une référence
        // à un paramètre (`p_…`) ou à une variable (`v_…`) rendrait le drapeau
        // choisi par l'appelant.
        if (/\b[pv]_\w+/.test(args)) suspectes.push(`${f.nom} : set_config(${args.trim()})`);
        // Et le troisième argument doit être `true` : sinon la valeur survit à
        // la transaction et voyage dans le pool de connexions.
        if (!/,\s*true\s*$/.test(args)) suspectes.push(`${f.nom} : drapeau NON LOCAL (${args.trim()})`);
      }
    }

    expect(
      suspectes,
      "Des drapeaux de session sont construits depuis un argument, ou ne sont " +
        `pas locaux à la transaction :\n${suspectes.join("\n")}`,
    ).toEqual([]);
  });
});
