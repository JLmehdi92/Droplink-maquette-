import { describe, expect, test } from "vitest";
import { lireActivite, lireSemaines, lirePlusConsultees } from "@/lib/analyses/activite";
import { compterEnvois } from "@/lib/envois/liste";

/**
 * L'ÉCRAN ANALYSES NE TOMBE PAS ENTIER POUR UNE LECTURE SUR QUATRE.
 *
 * ⚠️ CINQUIÈME OCCURRENCE DE LA MÊME FAMILLE, ET CELLE-CI A DÉJÀ ÉTÉ VUE EN
 * VRAI : `/fr/analyses` a rendu 500 après 10,7 s pendant la passe navigateur du
 * 03/09, consigné et non corrigé faute de savoir reproduire le rouge. On sait
 * maintenant le reproduire — c'est le même `fetch failed` que le panneau et la
 * surveillance, et il suffit d'une des QUATRE lectures pour emporter l'écran.
 *
 * ⚠️ CE QUI DISTINGUE CET ÉCRAN : ce qu'il affiche, ce sont des CHIFFRES
 * D'USAGE. Le commentaire d'origine le disait déjà — *afficher des zéros à la
 * place ferait croire à un vendeur actif qu'il n'a rien fait*. C'est
 * exactement l'argument pour `null` plutôt qu'une valeur neutre, et il vaut
 * aussi contre le 500 : perdre l'écran entier ne dit rien non plus.
 */

const LECTURES = [
  "analyser_activite",
  "compter_commandes_par_semaine",
  "compter_envois",
  "orders", // `lirePlusConsultees` lit la TABLE, pas une fonction.
] as const;

/**
 * Un client dont UNE seule lecture échoue.
 *
 * ⚠️ IL IMITE LES DEUX FORMES QUE L'ÉCRAN EMPLOIE : `rpc()` pour trois
 * lectures, et le constructeur de requête `from().select()…` pour la
 * quatrième. Une sonde qui n'aurait imité que `rpc` aurait laissé la
 * quatrième hors de portée — c'est-à-dire précisément le genre d'angle mort qui
 * a fait corriger ce défaut cinq fois.
 */
function clientAvec(enEchec: string, message: string) {
  const echec = { data: null, error: { message } };
  const lignesActivite = [
    {
      commandes: 0, commandes_precedent: 0, vues: 0, vues_precedent: 0,
      qc_approuve: 0, qc_refuse: 0, qc_en_attente: 0,
      medias: 0, medias_precedent: 0, jamais_ouvertes: 0,
    },
  ];
  const lignesEnvois = [
    {
      total: 0, preparation: 0, expedie: 0, en_transit: 0, livre: 0,
      silencieux: 0, abandonnes: 0, livres_ce_mois: 0,
    },
  ];
  const reponses: Record<string, unknown> = {
    analyser_activite: lignesActivite,
    compter_commandes_par_semaine: [],
    compter_envois: lignesEnvois,
  };

  // Le constructeur de requête : chaque méthode rend l'objet, et l'attente
  // finale rend le résultat.
  const requete: Record<string, unknown> = {};
  const resultat = enEchec === "orders" ? echec : { data: [], error: null };
  for (const m of ["select", "gte", "not", "gt", "order", "limit", "eq", "is"]) {
    requete[m] = () => requete;
  }
  requete["then"] = (r: (v: unknown) => unknown) => Promise.resolve(resultat).then(r);

  return {
    rpc: (nom: string) =>
      Promise.resolve(nom === enEchec ? echec : { data: reponses[nom] ?? [], error: null }),
    from: () => requete,
  } as never;
}

const MAINTENANT = new Date("2026-09-04T12:00:00Z");

/** Les quatre lectures, appelées comme l'écran les appelle. */
const APPELS: Record<string, (c: never) => Promise<unknown>> = {
  analyser_activite: (c) => lireActivite(c, "30j", MAINTENANT),
  compter_commandes_par_semaine: (c) => lireSemaines(c, MAINTENANT),
  compter_envois: (c) => compterEnvois(c),
  orders: (c) => lirePlusConsultees(c, "30j", MAINTENANT),
};

describe("L'écran Analyses, lecture par lecture", () => {
  test("la sonde inventorie bien les quatre lectures de l'écran", () => {
    // ⚠️ EN PREMIER : un inventaire vide passerait tout ce qui suit.
    expect(LECTURES.length).toBe(4);
    for (const l of LECTURES) expect(APPELS[l], `« ${l} » n'est pas appelée`).toBeTypeOf("function");
  });

  test("CONTRE-TEST : sans panne, chaque lecture rend quelque chose", async () => {
    for (const l of LECTURES) {
      const r = await (APPELS[l] as (c: never) => Promise<unknown>)(clientAvec("aucune", ""));
      expect(r, `« ${l} » ne rend rien alors que la base répond`).not.toBeNull();
    }
  });

  test("une PANNE DE TRANSPORT rend `null` au lieu d'emporter l'écran", async () => {
    for (const l of LECTURES) {
      const r = await (APPELS[l] as (c: never) => Promise<unknown>)(
        clientAvec(l, "TypeError: fetch failed"),
      ).catch((e: unknown) => e as Error);
      expect(
        r instanceof Error,
        `« ${l} » lève encore : ${r instanceof Error ? r.message : ""}`,
      ).toBe(false);
      expect(r, `« ${l} » devrait être NOMMÉE illisible`).toBeNull();
    }
  });

  test("L'AUTRE SENS : une erreur APPLICATIVE continue de lever", async () => {
    for (const l of LECTURES) {
      await expect(
        (APPELS[l] as (c: never) => Promise<unknown>)(
          clientAvec(l, "permission denied for function " + l),
        ),
        `« ${l} » avale une erreur applicative comme une panne réseau`,
      ).rejects.toThrow();
    }
  });
});
