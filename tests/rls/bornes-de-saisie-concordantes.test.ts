import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";

/**
 * LES PLAFONDS DE SAISIE SONT ÉCRITS DEUX FOIS. ILS DOIVENT DIRE LA MÊME CHOSE.
 *
 * ⚠️ DIVERGENCE MESURÉE LE 02/09/2026, en comparant les `CHECK` du catalogue
 * aux schémas Zod de l'éditeur :
 *
 *     customer_label   base 120   Zod  80
 *     product_ref      base 200   Zod  80
 *     internal_notes   base 5000  Zod 2000
 *     tracking_number  base  64   Zod  64   (d'accord)
 *     carrier_code     base  32   Zod  32   (d'accord)
 *
 * LES DEUX SENS SONT DES DÉFAUTS, ET PAS LES MÊMES.
 *
 *   - Zod PLUS LARGE que la base : le produit accepte, l'écran affiche un
 *     succès optimiste, et la base refuse. C'est le principe XII à l'envers —
 *     l'interface affirme ce que la base n'a pas enregistré — avec en prime une
 *     erreur Postgres brute là où l'utilisateur attendait un message.
 *
 *   - Zod PLUS STRICT : rien ne casse, mais le produit se bride sous ce que sa
 *     propre base autorise, et personne ne sait laquelle des deux valeurs a été
 *     choisie. C'est le cas ici, et il n'est pas anodin sur `product_ref` : la
 *     première des trois features du brief est l'import depuis un LIEN de
 *     commande agent, et 80 caractères ne suffisent pas à un tel lien. La base
 *     avait prévu 200.
 *
 * ⚠️ ET AUCUNE PORTE NE POUVAIT LE VOIR. Une valeur trop longue est refusée
 * proprement, avec son champ nommé : rien ne casse, rien ne rougit, et le
 * plafond le plus bas gagne en silence. C'est exactement le motif que le brief
 * traque — *une affirmation trop vague pour être fausse ne peut pas non plus
 * être vraie* : « les longueurs sont validées » restait vrai des deux côtés
 * pendant qu'elles se contredisaient.
 *
 * CE CONTRÔLE EST UN INVENTAIRE : il part des `CHECK` réellement posés en base,
 * pas d'une liste écrite à la main qui aurait vieilli à la première colonne
 * ajoutée.
 */
let bd: Client;

beforeAll(async () => {
  bd = await ouvrirConnexionCatalogue();
}, 60_000);

afterAll(async () => {
  await bd.end();
});

/** Les plafonds de longueur que la BASE impose, lus dans le catalogue. */
async function plafondsEnBase(): Promise<ReadonlyMap<string, number>> {
  const lignes = await interroger<{ def: string }>(
    bd,
    `select pg_get_constraintdef(con.oid) as def
       from pg_constraint con
       join pg_class rel on rel.oid = con.conrelid
       join pg_namespace n on n.oid = rel.relnamespace
      where n.nspname = 'public' and rel.relname = 'orders' and con.contype = 'c'`,
  );
  const plafonds = new Map<string, number>();
  for (const { def } of lignes) {
    // `((colonne IS NULL) OR (length(colonne) <= N))`
    const m = /length\(([a-z_]+)\)\s*<=\s*(\d+)/.exec(def);
    if (m?.[1] !== undefined && m[2] !== undefined) plafonds.set(m[1], Number(m[2]));
  }
  return plafonds;
}

/**
 * Les plafonds que ZOD impose, relus dans la source.
 *
 * On les relit plutôt que d'importer le module : `ecriture.ts` porte
 * `server-only` et monte un client Supabase. Ce qui est comparé reste la valeur
 * que le produit applique, pas une copie.
 */
function plafondsDansLeCode(): ReadonlyMap<string, number> {
  const source = readFileSync(
    join(process.cwd(), "src", "lib", "commandes", "ecriture.ts"),
    "utf8",
  );
  const bloc = source.slice(source.indexOf("const CHAMPS = {"), source.indexOf("} as const;"));
  const plafonds = new Map<string, number>();
  for (const m of bloc.matchAll(/([a-z_]+):\s*z\.string\(\)[^,]*?\.max\((\d+)\)/g)) {
    if (m[1] !== undefined && m[2] !== undefined) plafonds.set(m[1], Number(m[2]));
  }
  return plafonds;
}

describe("Les plafonds de saisie de l'éditeur", () => {
  test("les deux sondes voient réellement quelque chose", async () => {
    /*
     * UN ENSEMBLE VIDE PASSE TOUT — et ici DEUX ensembles vides passeraient
     * doublement : la comparaison ci-dessous ne porte que sur l'intersection.
     * Sans ces bornes, renommer `CHAMPS` ou changer la forme d'un `CHECK`
     * rendrait ce fichier vert en ne comparant plus rien.
     */
    const base = await plafondsEnBase();
    const code = plafondsDansLeCode();
    expect(base.size, "aucun CHECK de longueur lu sur `orders`").toBeGreaterThanOrEqual(4);
    expect(code.size, "aucun plafond Zod lu dans `ecriture.ts`").toBeGreaterThanOrEqual(4);
    const communs = [...code.keys()].filter((c) => base.has(c));
    expect(communs.length, "aucune colonne commune : les sondes visent à côté").toBeGreaterThanOrEqual(4);
  });

  test("chaque plafond Zod est celui de la base, ni plus large ni plus strict", async () => {
    const base = await plafondsEnBase();
    const code = plafondsDansLeCode();

    const ecarts = [...code.entries()]
      .filter(([colonne]) => base.has(colonne))
      .filter(([colonne, zod]) => base.get(colonne) !== zod)
      .map(([colonne, zod]) => `${colonne} : base ${base.get(colonne)} ≠ Zod ${zod}`);

    expect(
      ecarts,
      "Plafonds divergents. Plus LARGE que la base : l'écran annonce un succès " +
        "que la base refuse. Plus STRICT : le produit se bride sous sa propre " +
        "base, en silence, et personne ne sait laquelle des deux valeurs a été " +
        "choisie.",
    ).toEqual([]);
  });

  test("aucun champ écrivable n'échappe à un plafond de base", async () => {
    /*
     * L'AUTRE SENS. Un champ texte que l'éditeur écrit sans `CHECK` en face
     * n'est borné que par Zod — c'est-à-dire par la couche que le brief dit de
     * ne jamais considérer comme la dernière. `status` et `qc_status` sont des
     * énumérations, bornées par leur type : elles n'ont rien à faire ici.
     */
    const base = await plafondsEnBase();
    const code = plafondsDansLeCode();
    const sansCheck = [...code.keys()].filter((c) => !base.has(c));
    expect(
      sansCheck,
      "Champs bornés par Zod seulement : une écriture qui n'emprunte pas ce " +
        "schéma passerait sans plafond du tout.",
    ).toEqual([]);
  });
});
