import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import {
  clientService,
  creerUtilisateur,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";
import { PARAMETRES } from "@/lib/audit/parametres";
import { PURGE_JOURS } from "@/lib/audit/reglages-constates";
import { prendreEnCharge } from "@/lib/tracking/prise-en-charge";
import { MOTIF_CLE_ABSENTE } from "@/lib/tracking/provider/port";

/**
 * LES DEUX INTERRUPTEURS, ET CE QUE L'ÉCRAN DES PARAMÈTRES DOIT MONTRER.
 *
 * Un interrupteur qui ne coupe rien est pire qu'un interrupteur absent : on
 * baisse la manette, l'écran dit « coupé », et la dépense continue. Ces
 * propriétés ne se relisent donc pas, elles s'exécutent.
 *
 * ⚠️ AUCUN APPEL RÉSEAU N'EST FAIT ICI. `TRACKING_API_KEY` est vide dans cet
 * environnement, donc l'adaptateur échoue chez lui et rend un motif à lui.
 * C'est justement ce qui rend le test utile : le MOTIF distingue le refus de
 * l'interrupteur — qui tombe avant l'adaptateur — de l'échec de l'adaptateur,
 * qui tombe après. Une assertion sur le seul `statut` aurait été vraie dans les
 * deux cas, donc vraie même sans interrupteur du tout.
 */

let bd: Client;

/** Écrit un réglage HORS du produit, pour éprouver ce que le produit en fait. */
async function poser(cle: string, valeur: number): Promise<void> {
  await bd.query(
    `insert into public.system_settings (key, value) values ($1, to_jsonb($2::int))
     on conflict (key) do update set value = excluded.value`,
    [cle, valeur],
  );
}

async function effacer(cle: string): Promise<void> {
  await bd.query("delete from public.system_settings where key = $1", [cle]);
}

beforeAll(async () => {
  bd = await ouvrirConnexionCatalogue();
});

afterEach(async () => {
  // ⚠️ `system_settings` EST GLOBALE. Une ligne oubliée ici ne casse pas cette
  // suite, elle en casse une autre — et le rouge tombe alors sur un fichier qui
  // n'y est pour rien. Le nettoyage est donc après CHAQUE test, pas à la fin.
  await effacer("suivi_actif");
  await effacer("inscriptions_ouvertes");
});

afterAll(async () => {
  await bd.end();
});

describe("Les deux lectures rendent ce que la base porte", () => {
  test("contre-test : une clé ABSENTE vaut ouvert, pour les deux", async () => {
    // Un produit dont la table de réglages est vide doit fonctionner. Partir
    // fermé transformerait une base neuve en panne totale et silencieuse.
    const lignes = await interroger<{ suivi: boolean; inscriptions: boolean }>(
      bd,
      "select public.lire_suivi_actif() as suivi, public.lire_inscriptions_ouvertes() as inscriptions",
    );
    expect(lignes[0]?.suivi, "suivi fermé alors qu'aucune ligne ne le dit").toBe(true);
    expect(lignes[0]?.inscriptions, "porte fermée alors qu'aucune ligne ne le dit").toBe(true);
  });

  test("0 ferme, 1 rouvre", async () => {
    for (const [cle, fonction] of [
      ["suivi_actif", "lire_suivi_actif"],
      ["inscriptions_ouvertes", "lire_inscriptions_ouvertes"],
    ] as const) {
      await poser(cle, 0);
      const ferme = await interroger<{ v: boolean }>(bd, `select public.${fonction}() as v`);
      expect(ferme[0]?.v, `${cle} = 0 ne ferme pas`).toBe(false);

      await poser(cle, 1);
      const ouvert = await interroger<{ v: boolean }>(bd, `select public.${fonction}() as v`);
      expect(ouvert[0]?.v, `${cle} = 1 ne rouvre pas`).toBe(true);
    }
  });
});

describe("L'interrupteur du suivi coupe la dépense, avant l'appel", () => {
  const COLIS = "00000000-0000-4000-8000-0000000000ff";

  /*
   * UN COLIS RÉEL POUR LE CONTRE-TEST (migration 172). Depuis que la prise en charge demande
   * à la base si le numéro est STABLE — porté par une commande, créé depuis 30 secondes —
   * un identifiant inventé est écarté AVANT l'adaptateur, comme il se doit : on ne paie
   * jamais un colis que rien ne porte. Pour prouver que l'appel VA jusqu'à l'adaptateur
   * quand l'interrupteur est ouvert, il faut donc un colis qui mérite d'y aller.
   */
  let vendeur: UtilisateurDeTest;
  let colisStable = "";

  beforeAll(async () => {
    vendeur = await creerUtilisateur("interrupteur-suivi");
    const commande = await interroger<{ id: string }>(
      bd,
      "insert into public.orders (shop_id, customer_label) values ($1, 'client interrupteur') returning id",
      [vendeur.shopId],
    );
    const colis = await interroger<{ id: string }>(
      bd,
      `insert into public.tracked_parcels (shop_id, tracking_number, created_at)
       values ($1, 'TESTINTERRUPTEUR02', now() - interval '5 minutes') returning id`,
      [vendeur.shopId],
    );
    colisStable = colis[0]?.id ?? "";
    await interroger(bd, "insert into public.order_parcels (order_id, parcel_id) values ($1, $2)", [
      commande[0]?.id,
      colisStable,
    ]);
  }, 120_000);

  afterAll(async () => {
    await supprimerUtilisateur(vendeur);
  });

  test("coupé : le refus porte le motif de l'interrupteur", async () => {
    await poser("suivi_actif", 0);
    const r = await prendreEnCharge(COLIS, "TESTINTERRUPTEUR01", null);
    expect(r.statut).toBe("indisponible");
    expect(r.statut === "indisponible" ? r.motif : null).toBe("interrupteur-coupe");
  });

  test("contre-test : ouvert, l'appel VA jusqu'à l'adaptateur", async () => {
    /*
     * LE MOTIF EST CELUI DE L'ADAPTATEUR, et c'est toute la démonstration : il
     * ne peut être rendu que par un code situé APRÈS la garde. Une assertion
     * sur le seul `statut` aurait été vraie même sans garde du tout, puisque
     * les deux chemins rendent `indisponible`.
     *
     * L'ensemble est déclaré plutôt qu'une valeur unique : ces motifs
     * appartiennent à l'adaptateur, qui peut légitimement en ajouter un. Ce que
     * ce test doit tenir, c'est qu'aucun d'eux n'est celui de l'interrupteur.
     */
    const MOTIFS_DE_L_ADAPTATEUR = [
      "reseau",
      "exception",
      "http",
      "reponse",
      /*
       * ⚠️ CE MOTIF EST GARANTI PAR LE HARNAIS, IL N'EST PLUS SUBI.
       *
       * Il a longtemps été « le motif rendu dans cet environnement, où
       * `TRACKING_API_KEY` est absente » — c'est-à-dire un ACCIDENT de machine
       * érigé en propriété. Le 01/09/2026, la clé a été renseignée et ce test
       * est parti en rouge en rendant `refuse` : il venait d'appeler POUR DE
       * VRAI `/register` chez le fournisseur, dont le quota est de 200 prises
       * en charge À VIE. Rien n'a été consommé — un enregistrement rejeté est
       * gratuit, `quota_used: 0` relevé juste après — mais c'était de la chance.
       *
       * `charger-env.ts` débranche désormais les tiers payants pour la durée de
       * la suite, et le transport REFUSE tout appel vers eux. Le motif attendu
       * ici est donc une conséquence de cette règle, pas de la machine.
       *
       * Repris par sa CONSTANTE et non par sa chaîne : un renommage doit casser
       * ici plutôt que de retomber en silence dans le cas `reseau`.
       */
      MOTIF_CLE_ABSENTE,
    ];
    await poser("suivi_actif", 1);
    const r = await prendreEnCharge(colisStable, "TESTINTERRUPTEUR02", null);
    expect(r.statut).toBe("indisponible");
    expect(
      MOTIFS_DE_L_ADAPTATEUR,
      "l'appel n'a pas atteint l'adaptateur alors que l'interrupteur est ouvert",
    ).toContain(r.statut === "indisponible" ? r.motif : null);
  });

  test("rien n'est marqué en base quand l'interrupteur coupe", async () => {
    // `registered_at` doit rester nulle : la coupure est une décision
    // d'exploitation, pas une perte de données. Le colis est repris tel quel le
    // jour où l'on rouvre.
    await poser("suivi_actif", 0);
    await prendreEnCharge(COLIS, "TESTINTERRUPTEUR03", null);
    const restes = await interroger<{ n: string }>(
      bd,
      "select count(*)::text as n from public.tracked_parcels where id = $1",
      [COLIS],
    );
    expect(restes[0]?.n, "un colis fantôme a été écrit").toBe("0");
  });
});

describe("La rétention de purge affichée est celle que la base applique", () => {
  test("`PURGE_JOURS` correspond au corps de `purger_donnees_de_suivi`", async () => {
    /*
     * ⚠️ CETTE CONSTANTE EST UNE RECOPIE, et c'est assumé : la rétention vit en
     * SQL, aucun chemin TypeScript ne peut la lire, et l'écran d'administration
     * doit pourtant l'afficher. Ce test est ce qui la rend légitime — une
     * recopie surveillée par une exécution n'est plus une recopie, c'est une
     * assertion. Sans lui, l'écran continuerait d'annoncer 90 jours le jour où
     * une migration passerait la fonction à 30.
     */
    const lignes = await interroger<{ corps: string }>(
      bd,
      `select pg_get_functiondef(p.oid) as corps
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'purger_donnees_de_suivi'`,
    );
    expect(lignes, "fonction de purge introuvable : la sonde vise à côté").toHaveLength(1);
    expect(
      lignes[0]?.corps,
      `l'écran annonce ${PURGE_JOURS} jours de rétention, la fonction appliquée dit autre chose`,
    ).toContain(`interval '${PURGE_JOURS} days'`);
  });
});

describe("Tout réglage modifiable a sa rangée à l'écran", () => {
  /*
   * ⚠️ CETTE SONDE INVENTORIE, ELLE NE SÉLECTIONNE PAS, et elle échoue DANS LES
   * DEUX SENS : un réglage de l'inventaire absent de l'écran serait modifiable
   * par personne, et une clé citée par l'écran mais absente de l'inventaire
   * rendrait une rangée qui n'écrit rien. Les deux sont silencieux — l'écran
   * s'affiche parfaitement dans les deux cas.
   *
   * Elle lit le CODE, commentaires retirés : un motif appliqué au fichier brut
   * se satisferait d'une clé citée dans un commentaire qui décrit ce qu'on
   * aurait voulu faire.
   */
  const source = readFileSync(
    join(process.cwd(), "src", "app", "[locale]", "admin", "parametres", "page.tsx"),
    "utf8",
  );
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  const citees = [...code.matchAll(/genre:\s*"reglage",\s*cle:\s*"([a-z_]+)"/g)].map(
    (m) => m[1] as string,
  );

  test("la sonde inspecte réellement quelque chose", () => {
    // Un ensemble vide passe tout. Sans cette assertion, une expression
    // rationnelle devenue inopérante — un renommage, un reformatage — rendrait
    // le test vert et muet.
    expect(citees.length, "aucune clé trouvée dans l'écran : le motif ne mord plus").toBeGreaterThan(
      0,
    );
    expect(PARAMETRES.length, "l'inventaire TypeScript est vide").toBeGreaterThan(0);
  });

  test("chaque réglage de l'inventaire est affiché, et réciproquement", () => {
    expect([...citees].sort()).toEqual([...PARAMETRES.map((p) => p.cle)].sort());
  });
});

describe("La fermeture ferme la NAISSANCE du compte, pas seulement le formulaire", () => {
  /*
   * ⚠️ CE BLOC EXISTE PARCE QUE LA GARDE PRÉCÉDENTE REGARDAIT LÀ OÙ LE DÉFAUT
   * N'ÉTAIT PLUS (L-025).
   *
   * `scripts/fumee.mjs` éprouve déjà qu'une fermeture refuse le formulaire
   * d'inscription ET qu'aucun compte n'en naît. C'est vrai, et c'est la
   * correction de la migration 141 — dont la lecture vit dans `sInscrire`.
   *
   * Mesuré le 06/09/2026, interrupteur à 0, par un chemin qui ne traverse PAS
   * ce formulaire : `auth.users` 1, `profiles` 1, `shops` 1. Un compte complet
   * naissait pendant une fermeture. La garde couvrait le chemin corrigé, pas la
   * propriété — *aucun compte ne doit naître*.
   *
   * ⚠️ ET LE CHEMIN QUI MANQUAIT ÉTAIT DATÉ — LA DATE EST ÉCHUE. Ce paragraphe
   * a dit, du 06 au 08/09/2026, que la connexion Google était « écrite et
   * inerte (`external.google = false`, `AUTH_GOOGLE_ACTIF` absent) » et que son
   * activation serait « la mission suivante ». Elle a eu lieu le 08/09 :
   * `external.google = true`, `/authorize` rend 302 vers `accounts.google.com`,
   * et le bouton est servi sur `https://droplink.fr/fr/connexion`.
   *
   * Au retour, le fournisseur insère dans `auth.users` sans jamais passer par
   * `sInscrire`. La porte n'était donc fermée que par une ABSENCE, et cette
   * absence avait une date de péremption : c'est L-029 mot pour mot, arrivé à
   * échéance. Ce test n'est plus une anticipation, il garde un chemin VIVANT.
   *
   * La migration 143 descend l'invariant dans `creer_profil_et_shop`, seul
   * passage obligé de toute naissance de compte. Ce test l'éprouve LÀ, par le
   * chemin le plus bas — pas par un formulaire.
   */
  const DOMAINE_JETABLE = "@droplink-test.invalid";

  /** Tente une naissance de compte hors formulaire, et rend ce qui a été écrit. */
  async function tenterNaissance(
    etiquette: string,
  ): Promise<{ refus: string | null; users: number; profils: number; shops: number }> {
    const service = clientService();
    const email = `interrupteur-${etiquette}-${Date.now()}${DOMAINE_JETABLE}`;
    const { data, error } = await service.auth.admin.createUser({
      email,
      password: `Mdp-de-test-${Math.random().toString(36).slice(2)}-9!`,
      email_confirm: true,
    });

    const userId = data?.user?.id ?? null;
    try {
      const profils = await interroger<{ id: string }>(
        bd,
        "select id from public.profiles where email = $1",
        [email],
      );
      const shops =
        profils[0] === undefined
          ? []
          : await interroger<{ id: string }>(bd, "select id from public.shops where owner_id = $1", [
              profils[0].id,
            ]);
      return {
        refus: error === null ? null : error.message,
        users: userId === null ? 0 : 1,
        profils: profils.length,
        shops: shops.length,
      };
    } finally {
      // ⚠️ NETTOYAGE INCONDITIONNEL. Un compte de test survivant a déjà mis
      // cette base en LECTURE SEULE une fois — voir `purger-residus`.
      if (userId !== null) await service.auth.admin.deleteUser(userId);
    }
  }

  test("CONTRE-TEST : inscriptions ouvertes, le compte naît en entier", async () => {
    /*
     * IL VIENT EN PREMIER, ET CE N'EST PAS UN ORDRE DE CONFORT. « Aucun compte
     * ne naît » serait vrai d'un déclencheur complètement cassé — c'est-à-dire
     * d'un produit où PERSONNE ne peut plus s'inscrire. Une suite où tout est
     * refusé passe à 100 % sans rien prouver.
     */
    await poser("inscriptions_ouvertes", 1);
    const r = await tenterNaissance("ouvert");
    expect(r.refus, "la création est refusée alors que les inscriptions sont OUVERTES").toBeNull();
    expect(
      [r.users, r.profils, r.shops],
      "le déclencheur ne crée plus le profil et le shop : plus personne ne peut s'inscrire",
    ).toEqual([1, 1, 1]);
  });

  test("fermées : RIEN ne naît, par un chemin qui n'est pas le formulaire", async () => {
    await poser("inscriptions_ouvertes", 0);
    const r = await tenterNaissance("ferme");
    expect(r.refus, "la naissance du compte n'a pas été refusée").not.toBeNull();
    expect(
      [r.users, r.profils, r.shops],
      "un compte est né pendant une fermeture — la garde ne couvre que le formulaire",
    ).toEqual([0, 0, 0]);
  });

  test("la garde vit dans le déclencheur, pas dans un appelant", async () => {
    /*
     * ⚠️ L'AUTRE SENS, ET C'EST LUI QUI PROTÈGE DU RETOUR DU DÉFAUT.
     *
     * Les deux tests ci-dessus resteraient verts si quelqu'un remettait la
     * lecture dans un appelant — par exemple dans le harnais de test lui-même —
     * tout en la retirant de la base. Ce qu'on veut tenir, c'est que le SEUL
     * passage obligé la porte : c'est ce qui rend inutile de la recopier dans
     * chaque chemin futur, Google compris.
     *
     * On interroge donc le catalogue, pas le fichier de migration : un fichier
     * prouve qu'un texte existe, jamais qu'une capacité est en place (L-020).
     */
    const lignes = await interroger<{ corps: string }>(
      bd,
      `select pg_get_functiondef(p.oid) as corps
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'creer_profil_et_shop'`,
    );
    expect(lignes, "déclencheur de création introuvable : la sonde vise à côté").toHaveLength(1);
    expect(
      lignes[0]?.corps,
      "le déclencheur ne consulte plus l'interrupteur : la fermeture est redevenue applicative",
    ).toContain("lire_inscriptions_ouvertes");
  });
});
