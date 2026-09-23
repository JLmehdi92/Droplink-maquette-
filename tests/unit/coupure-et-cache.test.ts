import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * CE QUI COMPTE COMME « INVALIDER LA PAGE PUBLIQUE ».
 *
 * ⚠️ DEUX FORMES, ET LA SECONDE EST ARRIVÉE AVEC NEXT 16. Les modules appelaient
 * `revalidateTag` directement ; la version 16 exige un second argument, et ce
 * second argument est une DÉCISION DE SÉCURITÉ — `{ expire: 0 }`, sans quoi une
 * suspension cesserait de couper la page. Une décision pareille ne se recopie
 * pas à quatre endroits : elle vit dans `invaliderCommandePublique`, et les
 * modules passent par lui.
 *
 * Accepter l'intermédiaire ne suffit pas : un test plus bas vérifie que CE
 * helper appelle réellement `revalidateTag`, et avec le bon profil. Sans lui, la
 * porte se franchirait avec une fonction vide portant le bon nom.
 */
const INVALIDE = /(?:revalidateTag|invaliderCommandePublique)\s*\(/;

/**
 * LA COUPURE DE SUSPENSION SURVIVRA-T-ELLE AU PREMIER CACHE ?
 *
 * C'est la capacité technique qui fonde notre statut d'hébergeur : suspendre un
 * compte doit faire cesser de servir ses pages publiques. La chaîne est
 * `suspension en base → la vue filtre → invalidation du cache → la page cesse
 * de répondre`, et son mode de défaillance est SILENCIEUX : si l'invalidation
 * est mal câblée, elle n'échoue pas, elle ne trouve simplement rien à
 * invalider. La suspension s'enregistre, l'audit la consigne, l'écran affiche
 * « suspendu » — et la page publique continue d'être servie.
 *
 * ÉTAT ÉTABLI PAR EXÉCUTION (sonde de fumée, build de production servi) : la
 * coupure fonctionne aujourd'hui, en un dixième de seconde. Mais elle
 * fonctionne parce que la page publique lit les en-têtes de la requête pour la
 * limitation de débit, donc n'est PAS mise en cache. Ce n'est pas une
 * protection, c'est une absence de cache — et le fichier `lib/commandes/cache.ts`
 * le dit lui-même.
 *
 * ⚠️ CE QUE L'AUDIT DU 26/08/2026 A TROUVÉ, ET QUI RESTE VRAI :
 *
 * La RÉVOCATION d'un lien invalide bien ses deux jetons. La SUSPENSION, elle,
 * n'invalide aucune page publique — aucun appel, nulle part. L'asymétrie est
 * invisible tant qu'il n'y a pas de cache : le jour où quelqu'un enveloppe la
 * lecture publique dans un cache de données, la révocation resterait couverte
 * et la suspension ne couperait plus. Tout dirait que le compte est coupé.
 *
 * CE CONTRÔLE INTERROGE UNE FORME DE CODE, ET C'EST DÉLIBÉRÉ.
 *
 * Le dépôt refuse ailleurs les contrôles textuels, parce qu'ils prouvent qu'un
 * texte existe et jamais qu'une capacité est en place (L-020). Ici la chose
 * gardée EST une forme de code : « quelqu'un a-t-il ajouté un cache ? ». Il n'y
 * a pas d'effet à interroger tant que le cache n'existe pas — et quand il
 * existera, il sera trop tard pour s'en apercevoir autrement qu'en production,
 * sur la page d'un vendeur suspendu.
 *
 * Ce contrôle ne remplace donc pas la sonde de fumée, qui établit la coupure
 * par exécution. Il garde le SEUIL : il devient rouge à l'instant où l'on
 * introduit un cache sans avoir câblé l'invalidation qui va avec.
 */

const SRC = join(process.cwd(), "src");

/** Les formes qui mettent une lecture en cache de DONNÉES, dans Next 15. */
const MISES_EN_CACHE = [
  /\bunstable_cache\s*\(/,
  /\bcacheTag\s*\(/,
  /^\s*["']use cache["']/m,
  /\bcacheLife\s*\(/,
] as const;

function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function fichiers(racine: string): readonly string[] {
  const trouves: string[] = [];
  const parcourir = (dossier: string): void => {
    for (const entree of readdirSync(dossier)) {
      const chemin = join(dossier, entree);
      if (statSync(chemin).isDirectory()) parcourir(chemin);
      else if (chemin.endsWith(".ts") || chemin.endsWith(".tsx")) trouves.push(chemin);
    }
  };
  parcourir(racine);
  return trouves;
}

const TOUS = fichiers(SRC).map((chemin) => ({
  chemin,
  posix: chemin.split(/[\\/]/).join("/"),
  source: sansCommentaires(readFileSync(chemin, "utf8")),
}));

/** Les fichiers qui composent la lecture publique — ce qu'un cache toucherait. */
const SURFACE_PUBLIQUE = TOUS.filter(
  (f) => f.posix.includes("/src/lib/page-publique/") || f.posix.includes("/src/app/p/"),
);

/** L'action qui suspend un compte. */
const ACTION_SUSPENSION = TOUS.find((f) => f.posix.endsWith("/admin/comptes/[id]/actions.ts"));

/**
 * L'action qui bloque le lien d'UNE commande (19/09/2026). Même chaîne, même mode de
 * défaillance : bloquée en base, la page resterait servie depuis un cache.
 */
const ACTION_BLOCAGE = TOUS.find((f) => f.posix.endsWith("/admin/commandes/actions.ts"));

describe("le seuil est gardé : pas de cache public sans invalidation à la suspension", () => {
  // UN ENSEMBLE VIDE PASSE TOUT. Si ces chemins étaient renommés, la suite
  // deviendrait verte en ne surveillant plus rien — exactement l'état qu'elle
  // est censée empêcher.
  test("la sonde trouve la surface publique et l'action de suspension", () => {
    expect(
      SURFACE_PUBLIQUE.length,
      "aucun fichier de la surface publique trouvé : la sonde vise à côté",
    ).toBeGreaterThan(3);
    expect(ACTION_SUSPENSION, "l'action de suspension est introuvable").toBeDefined();
    expect(ACTION_BLOCAGE, "l'action de blocage de lien est introuvable").toBeDefined();
  });

  test("aucun cache de données sur la lecture publique sans invalidation câblée", () => {
    const enCache = SURFACE_PUBLIQUE.filter((f) =>
      MISES_EN_CACHE.some((motif) => motif.test(f.source)),
    );

    if (enCache.length === 0) return; // Rien à garder tant que rien n'est en cache.

    const actions = [ACTION_SUSPENSION, ACTION_BLOCAGE] as (typeof TOUS)[number][];
    const invalide = actions.every((action) => /revalidateTag\s*\(/.test(action.source));

    expect(
      invalide,
      "Un cache de données a été posé sur la lecture publique " +
        `(${enCache.map((f) => f.posix.split("/").pop()).join(", ")}), ` +
        "mais la suspension d'un compte ou le blocage d'un lien n'invalide toujours rien. La coupure " +
        "cesserait de couper SANS ÉCHOUER : la suspension s'enregistrerait, " +
        "l'audit la consignerait, l'écran afficherait « suspendu », et la page " +
        "publique continuerait d'être servie depuis le cache.",
    ).toBe(true);
  });

  /*
   * LE CONTRE-TEST DU CONTRÔLE LUI-MÊME.
   *
   * Une sonde qui ne reconnaîtrait aucune forme de mise en cache passerait à
   * 100 % pour toujours, sans jamais rien garder. On lui donne donc un texte
   * témoin portant chacune des formes, et on exige qu'elle les voie TOUTES.
   */
  test.each([
    ['const lire = unstable_cache(async () => {}, ["x"]);', "unstable_cache"],
    ['cacheTag("commande-publique:abc");', "cacheTag"],
    ['"use cache";\nexport async function lire() {}', "use cache"],
    ["cacheLife({ revalidate: 60 });", "cacheLife"],
  ])("la sonde reconnaît « %s » (%s)", (temoin) => {
    expect(MISES_EN_CACHE.some((motif) => motif.test(temoin))).toBe(true);
  });

  test("la sonde ne prend PAS un texte ordinaire pour un cache", () => {
    // Discriminant : sans ce cas, une expression trop large — « cache » tout
    // court — passerait le contre-test ci-dessus tout en criant au loup sur
    // chaque commentaire qui parle de cache. Les fichiers de la surface
    // publique en parlent beaucoup.
    const temoin = "// La page n'est pas mise en cache : elle lit les en-têtes.";
    expect(MISES_EN_CACHE.some((motif) => motif.test(temoin))).toBe(false);
  });
});

describe("les chemins d'invalidation sont des chemins que Next sait résoudre", () => {
  /*
   * DÉFAUT RÉEL, TROUVÉ À L'AUDIT DU 26/08/2026.
   *
   * L'action de suspension appelait :
   *
   *     revalidatePath(`/[locale]/admin/comptes/${profilId}`, "page")
   *
   * — un segment de GABARIT littéral (`[locale]`) mêlé à une valeur CONCRÈTE.
   * Next accepte l'un ou l'autre, jamais le mélange : la chaîne ne correspond à
   * aucune entrée, l'appel réussit, et rien n'est invalidé. L'écran voisin
   * employait déjà la forme juste — le bon usage était connu, il n'avait
   * simplement pas été appliqué là.
   *
   * C'est le même mode de défaillance que la coupure : ça n'échoue pas, ça ne
   * trouve rien.
   */
  const APPELS = TOUS.flatMap((f) =>
    [...f.source.matchAll(/revalidatePath\(\s*([`"'])([^`"']*)\1/g)].map((m) => ({
      fichier: f.posix.split("/").slice(-2).join("/"),
      chemin: m[2] as string,
    })),
  );

  test("la sonde trouve réellement des appels", () => {
    expect(APPELS.length, "aucun revalidatePath trouvé : la lecture est fausse").toBeGreaterThan(3);
  });

  test("aucun chemin ne mêle gabarit et valeur concrète", () => {
    const hybrides = APPELS.filter(
      (a) => a.chemin.includes("[") && /\$\{|%s/.test(a.chemin),
    ).map((a) => `${a.fichier} → ${a.chemin}`);

    expect(
      hybrides,
      "Ces chemins mêlent un segment entre crochets et une valeur interpolée. " +
        "Next n'y reconnaît aucune entrée : l'appel réussit et n'invalide rien.",
    ).toEqual([]);
  });

  test("un chemin à crochets n'a AUCUN segment concret", () => {
    // L'autre moitié du même défaut : `/[locale]/admin/comptes/abc-123` est
    // hybride sans interpolation visible — un identifiant écrit en dur, ou
    // concaténé avant l'appel. On exige donc qu'un chemin portant des crochets
    // n'ait QUE des segments statiques ou des segments entre crochets.
    const suspects = APPELS.filter((a) => {
      if (!a.chemin.includes("[")) return false;
      return a.chemin
        .split("/")
        .filter((s) => s !== "")
        .some((s) => /^[0-9a-f-]{8,}$/i.test(s));
    }).map((a) => `${a.fichier} → ${a.chemin}`);

    expect(suspects, "Chemins de gabarit portant un identifiant concret").toEqual([]);
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * LA SENTINELLE REGARDAIT UNE MUTATION SUR SEIZE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le bloc ci-dessus garde un seul chemin : la suspension de compte. C'est celui
 * qui a motivé son écriture, et c'est exactement le défaut L-025 — « un garde
 * écrit après coup hérite du champ de vision de la CORRECTION, pas du
 * problème ». Il regarde là où le défaut n'est plus.
 *
 * RELEVÉ LE 30/08/2026 : seize modules écrivent ce que le client finit par
 * voir. Trois posent une étiquette d'invalidation. Le jour où quelqu'un
 * enveloppe la lecture publique dans un cache de données — l'optimisation la
 * plus naturelle sur une page dont tout le budget est la vitesse — les autres
 * serviraient du périmé SANS ÉCHOUER. L'éditeur dirait « enregistré », le
 * webhook du transporteur écrirait son point de passage, et le client verrait
 * l'état d'avant, indéfiniment.
 *
 * CE BLOC INVENTORIE AU LIEU DE SÉLECTIONNER. La sonde rend TOUT ce qui a la
 * forme d'une écriture dans les dossiers qui écrivent, le test DÉCLARE chaque
 * fichier avec sa raison, et il échoue DANS LES DEUX SENS :
 *   - un fichier qui écrit sans être déclaré  → la liste a vieilli ;
 *   - une déclaration sans fichier qui écrit  → la liste ment.
 *
 * ⚠️ LA FORME D'UNE ÉCRITURE N'EST PAS UNE ÉCRITURE. `dix-sept-track.ts`
 * contient `.update(corpsBrut + "/" + cle(), "utf8")` : c'est un condensat
 * SHA-256, pas une ligne de base. Une sonde purement textuelle l'aurait compté
 * — d'où la déclaration explicite, avec sa raison, plutôt qu'un silence.
 */

/** Les dossiers d'où part tout ce que le client finit par voir. */
const DOSSIERS_MUTANTS = [
  "/src/lib/commandes/",
  "/src/lib/page-publique/",
  "/src/lib/tracking/",
  "/src/lib/audit/",
  "/src/lib/boutique/",
] as const;

/*
 * ⚠️ LES DOSSIERS VISÉS SONT CEUX QUI ÉCRIVENT, PAS CEUX QUI DÉCLENCHENT.
 *
 * Cette liste a d'abord visé `app/[locale]/admin/comptes/` et
 * `app/[locale]/(app)/marque/`, parce que ce sont les Server Actions qu'on lit
 * quand on cherche « où suspend-on un compte ». Le contrôle de SENS 2 l'a
 * refusée tout de suite : ces deux fichiers ne portent aucune écriture, ils
 * délèguent à `lib/audit/suspension.ts` et `lib/boutique/reglages.ts`.
 *
 * Une sonde posée sur les Server Actions aurait donc déclaré surveiller la
 * coupure de suspension en ne regardant pas le module qui la fait.
 */

/**
 * Ce qui a la FORME d'une écriture. Volontairement LARGE : on préfère devoir
 * déclarer un faux positif que rater une mutation. Une sonde étroite se tairait
 * sur ce qu'elle n'a pas su reconnaître, et son silence passerait pour une
 * absence de défaut.
 */
const FORME_ECRITURE = /\.(update|insert|delete|upsert)\(|\.rpc\(\s*["'][a-z_]+["']/;

type Verdict =
  /** Change ce que le client voit. `couvreur` : le module qui invalide à sa place. */
  | { readonly change: true; readonly couvreur: string | null; readonly raison: string }
  /** N'atteint jamais la page publique. */
  | { readonly change: false; readonly raison: string };

const DECLARES: Readonly<Record<string, Verdict>> = {
  "commandes/actions.ts": {
    change: true,
    couvreur: null,
    raison: "revocation et archivage — invalide deja ses deux jetons",
  },
  "commandes/geste-liste.ts": {
    change: true,
    couvreur: null,
    raison: "archivage depuis la liste — invalide deja",
  },
  "commandes/cycle.ts": {
    change: true,
    couvreur: "commandes/actions.ts",
    raison: "revocation, duplication, archivage : appeles par les actions, qui invalident",
  },
  "commandes/ecriture.ts": {
    change: true,
    couvreur: null,
    raison:
      "DETTE NOMMEE. Sauvegarde automatique de l'editeur — le geste le PLUS " +
      "frequent du produit. Change le nom du client affiche, la reference, le " +
      "statut d'expedition et le statut QC. N'invalide rien.",
  },
  "commandes/medias.ts": {
    change: true,
    couvreur: null,
    raison: "DETTE NOMMEE. Ajout, suppression et reordonnancement des medias.",
  },
  "commandes/actions-medias.ts": {
    change: true,
    couvreur: null,
    raison: "DETTE NOMMEE. Choix de la photo de couverture.",
  },
  "page-publique/qc.ts": {
    change: true,
    couvreur: null,
    raison:
      "DETTE NOMMEE. L'arbitrage du client lui-meme — la seule ecriture que la " +
      "page publique autorise. C'est le badge que verra le visiteur suivant.",
  },
  "tracking/attache.ts": {
    change: true,
    couvreur: null,
    raison: "DETTE NOMMEE. Rattache un colis a une commande.",
  },
  "tracking/cadence.ts": {
    change: true,
    couvreur: null,
    raison:
      "DETTE NOMMEE, ET LA PLUS DANGEREUSE : declenchee par une tache de fond, " +
      "donc hors de portee d'un vendeur qui penserait a rafraichir.",
  },
  "tracking/ingestion.ts": {
    change: true,
    couvreur: null,
    raison: "DETTE NOMMEE. Notification du transporteur — meme remarque que la cadence.",
  },
  "tracking/prise-en-charge.ts": {
    change: true,
    couvreur: null,
    raison: "DETTE NOMMEE. Premiere inscription d'un numero chez le fournisseur.",
  },
  "audit/suspension.ts": {
    change: true,
    couvreur: null,
    raison:
      "DETTE NOMMEE, gardee a part par le bloc ci-dessus : c'est la COUPURE de " +
      "suspension, la capacite qui fonde notre statut d'hebergeur. Le module " +
      "qui la FAIT, pas la Server Action qui la declenche.",
  },
  "audit/blocage-lien.ts": {
    change: true,
    couvreur: null,
    raison:
      "DETTE NOMMEE, gardee a part par le bloc ci-dessus comme la suspension : le " +
      "blocage d'UN lien par l'administration (166, 19/09/2026). Il coupe la page " +
      "publique d'une commande ; l'action ne connait meme pas le jeton a invalider.",
  },
  "audit/doublons.ts": {
    change: false,
    raison:
      "Les comptes en doublon (170) : la seule ecriture est la ligne de journal de la " +
      "consultation. Rien n est modifie sur aucun compte, aucune page publique ne change.",
  },
  "audit/contestation.ts": {
    change: false,
    raison:
      "La contestation (168) : lire est trace, refuser garde le lien COUPE. Rien de ce que " +
      "le client voit ne change — sa page reste « Ce lien n est plus valable ».",
  },
  "commandes/contestation.ts": {
    change: false,
    raison:
      "Le vendeur conteste un blocage (168) : une ligne de dossier, lue par l administration. " +
      "La page publique reste coupee tant que l administration ne debloque pas.",
  },
  "audit/plan.ts": {
    change: true,
    couvreur: null,
    raison:
      "DETTE NOMMEE. Le plan du compte (167, 19/09/2026) : repasse en gratuit, la " +
      "carte DropLink revient sur CHAQUE page publique du vendeur (l'interrupteur " +
      "retombe en base), et l'action ne connait aucun jeton a invalider.",
  },
  "boutique/reglages.ts": {
    change: true,
    couvreur: null,
    raison:
      "DETTE NOMMEE. Nom, couleur, langue publique, filigrane, reseaux et carte " +
      "DropLink (167) : " +
      "l'en-tete de CHAQUE page publique de ce vendeur, pas d'une seule.",
  },
  "boutique/logo.ts": {
    change: true,
    couvreur: null,
    raison: "DETTE NOMMEE. Le logo, affiche en tete de chaque page publique du vendeur.",
  },
  "audit/boutiques.ts": {
    change: false,
    raison: "liste admin des boutiques : lecture auditee, l'ecriture detectee est sa trace",
  },
  "audit/commandes.ts": {
    change: false,
    raison: "liste admin des commandes : lecture auditee, l'ecriture detectee est sa trace",
  },
  "audit/statistiques.ts": {
    change: false,
    raison: "statistiques admin : quatre fonctions qui ne rendent que des nombres, aucune ecriture",
  },
  "audit/comptes.ts": {
    change: false,
    raison: "listes et journal admin : lectures auditees, l'ecriture detectee est leur trace",
  },
  "audit/garde.ts": {
    change: false,
    raison: "est_admin : une lecture, appelee a chaque requete admin",
  },
  "audit/panneau.ts": {
    change: false,
    raison: "compteurs et alertes du panneau : agregats de lecture",
  },
  "audit/parametres.ts": {
    change: false,
    raison:
      "ecrit les parametres systeme, mais aucun ne figure dans ce qu'une page " +
      "publique rend : ils pilotent des seuils et des interrupteurs, jamais le " +
      "contenu d'une commande",
  },
  "audit/surveillance.ts": {
    change: false,
    raison: "battement du veilleur : etat d'exploitation, jamais rendu a un client",
  },
  "page-publique/lecture.ts": {
    change: false,
    raison: "quatre rpc de LECTURE (lire_*) — la forme trompe, rien n'est ecrit",
  },
  "page-publique/notifications.ts": {
    change: false,
    raison:
      "demandes de suivi par e-mail, adresses et etapes annoncees (migration 188) : " +
      "rien de ce qu'elle ecrit n'est rendu par la page du client",
  },
  "page-publique/vue.ts": {
    change: false,
    raison: "compte une consultation ; invisible du client, et deliberement apres le rendu",
  },
  "commandes/journal.ts": {
    change: false,
    raison: "historique de la commande — ecran vendeur, absent de la page publique",
  },
  "commandes/liste.ts": {
    change: false,
    raison: "compter_commandes_par_etat est un agregat de LECTURE",
  },
  "tracking/provider/dix-sept-track.ts": {
    change: false,
    raison: "le .update() detecte est celui d'un condensat SHA-256, pas d'une ligne de base",
  },
};

/** Le nom court sous lequel un module est declare. */
function nomCourt(posix: string): string {
  return posix.split("/src/lib/")[1] ?? posix;
}

describe("toute mutation visible du client est inventoriée, pas sélectionnée", () => {
  const ECRIVAINS = TOUS.filter(
    (f) => DOSSIERS_MUTANTS.some((d) => f.posix.includes(d)) && FORME_ECRITURE.test(f.source),
  ).map((f) => ({ ...f, nom: nomCourt(f.posix) }));

  test("CONTRE-TEST : la sonde trouve réellement des écritures", () => {
    // Un ensemble vide passe tout. Si les dossiers étaient renommés, ce bloc
    // deviendrait vert en ne surveillant plus rien — l'état exact qu'il existe
    // pour empêcher.
    expect(ECRIVAINS.length, "aucun module d'écriture trouvé : la sonde vise à côté").toBeGreaterThan(
      12,
    );
  });

  test("SENS 1 — tout fichier qui écrit est déclaré", () => {
    const inconnus = ECRIVAINS.filter((f) => DECLARES[f.nom] === undefined).map((f) => f.nom);
    expect(
      inconnus,
      "Ces modules écrivent et ne sont pas déclarés. Dire s'ils changent ce que " +
        "voit le client, et pourquoi — sans quoi la liste vieillit en silence.",
    ).toEqual([]);
  });

  test("SENS 2 — toute déclaration correspond à un fichier qui écrit", () => {
    const noms = new Set(ECRIVAINS.map((f) => f.nom));
    const mortes = Object.keys(DECLARES).filter((n) => !noms.has(n));
    expect(
      mortes,
      "Ces déclarations ne correspondent à aucun module qui écrit : la liste ment.",
    ).toEqual([]);
  });

  test("chaque couvreur nommé invalide RÉELLEMENT — vérifiable sans cache", () => {
    /*
     * CE CONTRÔLE VAUT AUJOURD'HUI, pas seulement le jour du cache. Déclarer
     * qu'un module est couvert par un autre est une affirmation vérifiable tout
     * de suite : ou bien le couvreur appelle `revalidateTag`, ou bien la
     * couverture est imaginaire et la dette est plus grande qu'annoncé.
     */
    const couvreurs = Object.entries(DECLARES)
      .filter((e): e is [string, Extract<Verdict, { change: true }>] => {
        const v = e[1];
        return v.change && v.couvreur !== null;
      })
      .map(([nom, v]) => ({ nom, couvreur: v.couvreur as string }));

    expect(couvreurs.length, "aucun couvreur déclaré : ce contrôle n'inspecte rien").toBeGreaterThan(
      0,
    );

    for (const { nom, couvreur } of couvreurs) {
      const fichier = ECRIVAINS.find((f) => f.nom === couvreur);
      expect(fichier, `${nom} déclare être couvert par ${couvreur}, introuvable`).toBeDefined();
      expect(
        INVALIDE.test(fichier?.source ?? ""),
        `${nom} déclare être couvert par ${couvreur}, qui n'invalide rien`,
      ).toBe(true);
    }
  });

  /**
   * ⚠️ LE CONTRÔLE CI-DESSUS ACCEPTE UN INTERMÉDIAIRE ; CELUI-CI VÉRIFIE QUE
   * L'INTERMÉDIAIRE INVALIDE POUR DE BON.
   *
   * Sans lui, la porte serait franchissable en créant n'importe quelle fonction
   * nommée `invaliderCommandePublique` qui ne fait rien — le motif la
   * reconnaîtrait, la couverture serait déclarée, et la coupure de suspension ne
   * couperait plus. C'est exactement le mode de défaillance du brief §12 : la
   * mutation réussit, l'audit la consigne, l'écran affiche « suspendu », et la
   * page publique continue d'être servie.
   *
   * DÉFAUT ÉVITÉ LE 09/09/2026, PENDANT LA MIGRATION VERS NEXT 16. Les quatre
   * appels directs à `revalidateTag` ont été centralisés dans ce helper — parce
   * que Next 16 exige un second argument, et que le profil est une décision de
   * sécurité qui ne doit pas être recopiée quatre fois. Le contrôle précédent
   * est alors parti ROUGE, et il avait raison : il ne voyait plus personne
   * invalider. L'élargir sans ce second contrôle aurait affaibli la garde qui
   * protège le mécanisme le plus critique du produit.
   */
  test("l intermediaire d invalidation appelle REELLEMENT revalidateTag", () => {
    /*
     * ⚠️ LES COMMENTAIRES SONT RETIRÉS, ET CE N'EST PAS UNE PRÉCAUTION DE STYLE.
     *
     * DÉFAUT DE CE CONTRÔLE, ATTRAPÉ PAR SA PROPRE FALSIFICATION le 09/09/2026 :
     * lu brut, le fichier contient `{ expire: 0 }` DANS le commentaire qui
     * explique pourquoi ce profil est obligatoire. En remplaçant le profil du
     * CODE par `"max"`, le contrôle restait VERT — il lisait sa propre
     * description. C'est L-031 dans sa forme exacte, et sur la garde qui protège
     * la coupure de suspension.
     */
    const cache = sansCommentaires(
      readFileSync(join(process.cwd(), "src/lib/commandes/cache.ts"), "utf8"),
    );
    expect(
      /export function invaliderCommandePublique/.test(cache),
      "le helper d'invalidation a disparu de `commandes/cache.ts`",
    ).toBe(true);
    expect(
      /revalidateTag\s*\(/.test(cache),
      "`invaliderCommandePublique` n'appelle plus `revalidateTag` : la couverture " +
        "déclarée par les modules qui s'appuient dessus est devenue imaginaire.",
    ).toBe(true);
    /*
     * ⚠️ ET LE PROFIL EST GARDÉ, PAS SEULEMENT L'APPEL. Next 16 recommande
     * `"max"` — servir la page en cache pendant un an pendant la revalidation.
     * Sur ces étiquettes-là, un compte suspendu resterait servi. Seul
     * `{ expire: 0 }` reproduit le comportement de Next 15.
     */
    expect(
      // `[^)]*` ne conviendrait pas : l'étiquette est elle-même un appel, et le
      // motif s'arrêterait à SA parenthèse fermante.
      /revalidateTag\([\s\S]*?\{\s*expire:\s*0\s*\}/.test(cache),
      "le profil de revalidation n'est plus `{ expire: 0 }` : avec un profil qui " +
        "sert du périmé, une suspension cesserait de couper la page publique.",
    ).toBe(true);
  });

  test("SI un cache apparaît, aucune mutation visible ne peut rester muette", () => {
    const enCache = SURFACE_PUBLIQUE.filter((f) =>
      MISES_EN_CACHE.some((motif) => motif.test(f.source)),
    );
    if (enCache.length === 0) return; // Rien à garder tant que rien n'est en cache.

    const muets = ECRIVAINS.filter((f) => {
      const v = DECLARES[f.nom];
      if (v === undefined || !v.change) return false;
      if (/revalidateTag\s*\(/.test(f.source)) return false;
      if (v.couvreur === null) return true;
      const c = ECRIVAINS.find((x) => x.nom === v.couvreur);
      return c === undefined || !/revalidateTag\s*\(/.test(c.source);
    }).map((f) => f.nom);

    expect(
      muets,
      `Un cache de données a été posé sur la lecture publique (${enCache
        .map((f) => f.posix.split("/").pop())
        .join(", ")}), et ces mutations n'invalident toujours rien. Elles ne ` +
        "casseront pas : elles serviront l'état d'AVANT, indéfiniment, pendant " +
        "que l'écran du vendeur affichera « enregistré ».",
    ).toEqual([]);
  });
});
