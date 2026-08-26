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

  test("toute fonction `security definer` épingle son `search_path` à vide", async () => {
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
       where n.nspname = 'public' and p.prosecdef
       order by 1, 2`,
    );

    expect(
      fonctions.length,
      "Aucune fonction `security definer` trouvée dans public. La sonde " +
        "n'inspecte rien, et un ensemble vide passe tout.",
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
      "Fonctions privilégiées dont le chemin de recherche n'est pas épinglé à " +
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
      await bd.query(
        "create function public.temoin_sans_chemin() returns int " +
          "language sql security definer as 'select 1'",
      );

      const trouvees = await interroger<{ nom: string }>(
        bd,
        `select p.proname as nom
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.prosecdef
           and not (coalesce(p.proconfig, '{}') @> array['search_path=""'])`,
      );

      expect(
        trouvees.map((f) => f.nom),
        "La sonde n'a pas vu une fonction `security definer` sans chemin de " +
          "recherche alors qu'elle venait d'être créée sous ses yeux. Son vert " +
          "ne prouvait donc rien.",
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
