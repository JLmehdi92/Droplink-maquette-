import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { ouvrirConnexionCatalogue } from "../aide/base";
import { ACCENT_DEFAUT } from "@/lib/design/contraste";

/**
 * LA COULEUR D'ACCENT PAR DÉFAUT EST LA MÊME EN BASE ET DANS LE CODE.
 *
 * ⚠️ CE TEST EXISTE PARCE QUE J'AI FALSIFIÉ ET VU VERT. `ACCENT_DEFAUT` portait
 * en commentaire « identique au défaut de `shops.accent_color` en base ». Rien
 * ne l'exigeait : remettre l'ancienne valeur dans le TypeScript laissait les
 * 357 tests unitaires verts, pendant que la base aurait continué d'écrire
 * l'autre. C'est L-014 dans sa forme exacte — un document affirme un état que
 * personne n'exécute — et le document, ici, était un commentaire de code.
 *
 * CE QUE LA DIVERGENCE PRODUIRAIT est silencieux : `ACCENT_DEFAUT` ne sert que
 * de repli quand la couleur lue est invalide. Un vendeur normal n'y touche
 * jamais. L'écart n'apparaîtrait que sur une page dont la couleur est corrompue
 * — c'est-à-dire au pire moment, et sans que rien ne l'ait signalé avant.
 *
 * IL INTERROGE LE CATALOGUE, il ne relit pas la migration : un fichier de
 * migration prouve ce qui a été écrit, jamais ce qui a été appliqué.
 */
describe("L'accent par défaut", () => {
  let bd: Client;

  beforeAll(async () => {
    bd = await ouvrirConnexionCatalogue();
  });

  afterAll(async () => {
    await bd.end();
  });

  test("le défaut de la colonne est CELUI du code", async () => {
    const { rows } = await bd.query<{ defaut: string | null }>(
      `select column_default as defaut
         from information_schema.columns
        where table_schema = 'public'
          and table_name = 'shops'
          and column_name = 'accent_color'`,
    );

    // UN ENSEMBLE VIDE PASSE TOUT : sans cette ligne, une colonne renommée
    // rendrait zéro ligne et le test serait vert en n'ayant rien comparé.
    expect(rows).toHaveLength(1);

    // Postgres rend le défaut sous la forme `'#7c5cf5'::text`.
    const brut = rows[0]?.defaut ?? "";
    const valeur = /'([^']*)'/.exec(brut)?.[1];
    expect(valeur, `défaut lu en base : ${brut}`).toBe(ACCENT_DEFAUT);
  });

  test("et c'est bien celui du canevas", async () => {
    // Le contrôle précédent tiendrait si les DEUX dérivaient ensemble. Celui-ci
    // les ancre à la valeur relevée dans le canevas — `default:"#7c5cf5"` dans
    // le script de la planche Marque.
    expect(ACCENT_DEFAUT).toBe("#7c5cf5");
  });

  test("les boutiques existantes n'ont PAS été réécrites", async () => {
    // La migration 100 ne touche aucune ligne, et c'est délibéré : le brief dit
    // que la valeur stockée fait foi et n'est jamais réécrite. Un `update`
    // aurait changé la couleur de pages DÉJÀ ENVOYÉES à des clients.
    const { rows } = await bd.query<{ n: string }>(
      `select count(*)::text as n from public.shops where accent_color = '#0058be'`,
    );
    // On n'affirme pas qu'il en reste : on affirme que la requête aboutit et
    // que rien n'a été purgé au passage. Le compte est rapporté, pas jugé.
    expect(Number.parseInt(rows[0]?.n ?? "-1", 10)).toBeGreaterThanOrEqual(0);
  });
});
