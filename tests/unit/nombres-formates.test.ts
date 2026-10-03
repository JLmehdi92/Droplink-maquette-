import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createTranslator } from "next-intl";
import { describe, expect, test } from "vitest";

/**
 * LES NOMBRES D'UN CATALOGUE PASSENT PAR `Intl.NumberFormat`.
 *
 * intl-messageformat (11.2.14, `index.js`) rend un argument SIMPLE `{x}` par
 * `String(value)` : 1248 sort « 1248 », sans séparateur de milliers. Seuls `#`
 * dans un pluriel et `{x, number}` passent par `Intl.NumberFormat`. Mesuré le
 * 03/10/2026 : le chinois écrivait « 共 1248 个包裹 » là où l'anglais rend
 * « 1,248 shipments » et le français « 1 248 envois ».
 *
 * La liste est DÉCLARÉE : chaque entrée est une clé dont l'appelant passe un
 * nombre BRUT (lu dans le code), avec les arguments qu'il fournit. Le test rend
 * chaque clé dans les trois langues avec 1248 et exige la forme de la langue.
 */
const CLES: ReadonlyArray<readonly [string, Record<string, number | string>]> = [
  ["envois.compteurPage", { de: 1248, a: 1248, total: 1248 }],
  ["commandes.surTotal", { n: 1248, total: 1248 }],
  ["analyses.livreesSur", { n: 1248, total: 1248 }],
  ["analyses.reponsesSur", { n: 1248, total: 1248 }],
  ["analyses.colis.dontSilencieux", { n: 1248 }],
  ["analyses.surColisLivres", { n: 1248 }],
  ["analyses.liens.ouvertures", { n: 1248 }],
  ["commandes.vuesCourt", { n: 1248 }],
  ["commandes.quota.gratuitTexte", { n: 1248 }],
  ["admin.panneau.comptesDont", { sansType: 1248, suspendus: 1248 }],
  ["admin.panneau.alerteDoublons", { comptes: 1248, identifiants: 1248 }],
  ["admin.panneau.barre", { jour: "lundi", n: 1248 }],
  ["admin.surveillance.barre", { jour: "lundi", n: 1248 }],
  ["admin.statistiques.surComptes", { total: 1248 }],
  ["admin.statistiques.statutTotal", { total: 1248 }],
  ["admin.statistiques.transporteursTotal", { total: 1248 }],
  ["admin.statistiques.delaiValeur", { valeur: 1248 }],
  ["admin.doublons.nombreComptes", { n: 1248 }],
  ["alertes.titreAvec", { n: 1248 }],
  ["alertes.jamaisOuvertes.titre", { n: 1248 }],
  ["alertes.silencieux.titre", { n: 1248 }],
  ["tableau.graphe.zoneLiens", { n: 1248 }],
  ["tableau.colisTotal", { n: 1248 }],
  ["parametres.abonnement.inclusTotal", { n: 1248 }],
  ["accueil.garanties.offertes", { n: 1248 }],
  ["accueil.vendeur.vues", { n: 1248 }],
  ["accueil.questions.q4", { n: 1248 }],
  ["acces.film.minute.offre", { n: 1248 }],
  // Petits par nature aujourd'hui (vidéos, rang de contestation, essais restants…), mais
  // des nombres bruts : la règle est la même, et une régression doit se voir.
  ["envois.autresCommandes", { n: 1248 }],
  ["commandes.frise.silence", { jours: 1248 }],
  ["commandes.nbPhotos", { n: 1248 }],
  ["medias.formats", { videos: 1248 }],
  ["admin.parametres.constate.medias_par_commande.aide", { videos: 1248 }],
  ["admin.contestation.aide", { date: "30 sept. 2026", rang: 1248 }],
  ["blocageVendeur.restantes", { n: 1248 }],
];

/** La forme de 1248 dans chaque langue, telle que `Intl.NumberFormat` l'écrit. */
const FORME: Record<string, string> = Object.fromEntries(
  ["fr", "en", "zh-CN"].map((l) => [l, new Intl.NumberFormat(l).format(1248)]),
);

describe("Les nombres des catalogues sont formatés dans la langue", () => {
  test("la liste inspecte réellement des clés", () => {
    // UN ENSEMBLE VIDE PASSE TOUT.
    expect(CLES.length).toBeGreaterThan(20);
    expect(FORME["zh-CN"], "le chinois groupe les milliers").toBe("1,248");
  });

  for (const langue of ["fr", "en", "zh-CN"] as const) {
    test(`${langue} : 1248 est écrit « ${FORME[langue] ?? ""} », jamais brut`, () => {
      const messages: unknown = JSON.parse(readFileSync(join(process.cwd(), "messages", `${langue}.json`), "utf8"));
      const erreurs: string[] = [];
      const t = createTranslator({
        locale: langue,
        messages: messages as Record<string, unknown>,
        onError: (e) => erreurs.push(e.message),
      }) as unknown as (cle: string, valeurs: Record<string, number | string>) => string;
      const fautives: string[] = [];
      for (const [cle, valeurs] of CLES) {
        const rendu = t(cle, valeurs);
        if (rendu.includes("1248") || !rendu.includes(FORME[langue] ?? "§")) fautives.push(`${cle} → « ${rendu} »`);
      }
      expect(erreurs, "une clé n'a pas pu être rendue").toEqual([]);
      expect(fautives).toEqual([]);
    });
  }
});
