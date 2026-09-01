import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";

/**
 * LA SURFACE QUE SUPABASE OUVRE HORS DU SCHÉMA `public`, ET CE QUI LA TIENT.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QUI A ÉTÉ MESURÉ LE 01/09/2026, ET POURQUOI ON NE PEUT PAS LE REFERMER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Supabase accorde à `anon` ET `authenticated`, sur ses schémas propres :
 *
 *   storage.objects   DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
 *   storage.buckets   les mêmes sept
 *   realtime.messages INSERT, SELECT, UPDATE
 *   realtime.subscription  SELECT — et cette table N'A PAS de RLS
 *
 * Ce produit n'utilise NI Supabase Storage (les médias vont sur Cloudflare R2,
 * bucket privé) NI Realtime. Ces droits ne servent donc à rien ici, et l'on
 * voudrait les retirer.
 *
 * ⚠️ ON NE PEUT PAS, ET UNE MIGRATION QUI PRÉTENDRAIT LE FAIRE SERAIT VERTE EN
 * NE PROTÉGEANT RIEN. Mesuré : `revoke all on storage.objects from anon`
 * s'exécute depuis notre rôle de migration SANS LEVER — et laisse les quatorze
 * droits en place, parce que Postgres ignore silencieusement un `revoke` émis
 * par qui n'est pas le concédant. Et `set role supabase_storage_admin` est
 * refusé (`42501`). Le durcissement le plus naturel est donc un durcissement
 * IMAGINAIRE, du genre qu'on écrit une fois et qu'on croit ensuite acquis.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QUI PROTÈGE RÉELLEMENT, ET QUE CE FICHIER ÉPROUVE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * DEUX barrières, indépendantes, et c'est leur conjonction qui compte :
 *
 *  1. **PostgREST n'expose que `public` et `graphql_public`.** Un droit sur une
 *     table qu'aucune route ne sert n'est pas atteignable. C'est la protection
 *     par NON-EXPOSITION du schéma, et elle est mesurée ici par une vraie
 *     requête HTTP avec la clé publiable — l'EFFET, pas le catalogue.
 *
 *  2. **`storage` a la RLS partout et ZÉRO policy, et zéro bucket.** Même
 *     atteignable, tout serait refusé.
 *
 * ⚠️ LA SECONDE EST UNE PROTECTION QUI TIENT À UNE ABSENCE (L-029), et on le
 * dit plutôt que de s'en satisfaire. La phrase juste est : « ce serait ouvert
 * si quelqu'un créait un bucket depuis le tableau de bord Supabase » — deux
 * clics, et la case « Public bucket » pose une policy `for select using (true)`.
 * `anon` récupérerait alors INSERT, UPDATE, DELETE et TRUNCATE sur
 * `storage.objects` : de l'hébergement anonyme de fichiers arbitraires sur
 * notre projet, sans passer par R2 ni par aucune de nos gardes — c'est-à-dire
 * exactement le risque d'hébergeur du §12 du brief.
 *
 * C'est pour ça que ce fichier existe : on ne peut pas fermer la porte, on peut
 * poser une alarme dessus.
 */

let bd: Client;

beforeAll(async () => {
  bd = await ouvrirConnexionCatalogue();
});

afterAll(async () => {
  await bd.end();
});

/** Les schémas que l'API REST a le droit de servir. */
const SCHEMAS_EXPOSES = ["public", "graphql_public"] as const;

describe("La surface hors du schéma `public`", () => {
  test("l'API REST ne sert QUE `public` et `graphql_public`", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const cle = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    expect(url, "NEXT_PUBLIC_SUPABASE_URL absente : la sonde ne mesure rien").toBeTruthy();
    expect(cle, "clé publiable absente : la sonde ne mesure rien").toBeTruthy();

    const demander = async (
      table: string,
      schema: string | null,
    ): Promise<{ statut: number; code: string }> => {
      const entetes: Record<string, string> = {
        apikey: cle as string,
        authorization: `Bearer ${cle as string}`,
      };
      if (schema !== null) entetes["accept-profile"] = schema;
      const reponse = await fetch(`${url as string}/rest/v1/${table}?select=*&limit=1`, {
        headers: entetes,
      });
      const texte = await reponse.text();
      let code = "";
      try {
        code = String((JSON.parse(texte) as { code?: unknown }).code ?? "");
      } catch {
        code = "";
      }
      return { statut: reponse.status, code };
    };

    /*
     * CONTRE-TEST POSITIF D'ABORD, ET IL PORTE SUR LE CORPS — PAS SUR LE STATUT.
     *
     * ⚠️ LA PREMIÈRE VERSION DE CE CONTRÔLE N'A PAS SURVÉCU À SA PROPRE
     * FALSIFICATION. Elle exigeait seulement un 401 sur `public.orders`. Or une
     * clé publiable INVALIDE rend elle aussi 401 — refusée avant tout routage de
     * schéma. Le contre-test passait donc au vert sur une sonde aveugle, et les
     * quatre contrôles suivants rougissaient pour la mauvaise raison, en
     * accusant le produit d'exposer `storage`.
     *
     * Ce qui discrimine est le CODE : `42501` est une erreur POSTGRES, donc
     * PostgREST a bel et bien routé vers `public` et c'est la RLS qui a tranché.
     * Une clé invalide ne peut pas produire ce code — elle n'atteint jamais la
     * base.
     */
    const surPublic = await demander("orders", null);
    expect(
      surPublic.code,
      `L'API n'a pas servi \`public.orders\` (statut ${surPublic.statut}, code ` +
        `« ${surPublic.code} »). Sans une vraie réponse de Postgres, la sonde ne ` +
        "distingue plus « schéma non exposé » de « clé refusée ».",
    ).toBe("42501");

    // Les schémas fermés : un 406 `PGRST106` — « Invalid schema » — et non un
    // 401, qui prouverait au contraire que la table est servie.
    for (const [table, schema] of [
      ["objects", "storage"],
      ["buckets", "storage"],
      ["subscription", "realtime"],
      ["messages", "realtime"],
    ] as const) {
      const { statut, code } = await demander(table, schema);
      expect(
        `${statut}/${code}`,
        `\`${schema}.${table}\` n'est plus écartée par le routage (statut ` +
          `${statut}, code « ${code} »). Les droits que Supabase accorde à ` +
          "`anon` sur ce schéma deviendraient atteignables, et nous ne pouvons " +
          "pas les révoquer.",
      ).toBe("406/PGRST106");
    }
  }, 30_000);

  test("le schéma `storage` n'a ni policy ni bucket : rien n'y est ouvert", async () => {
    const [policies] = await interroger<{ n: string }>(
      bd,
      "select count(*)::text as n from pg_policies where schemaname in ('storage', 'realtime')",
    );
    const [buckets] = await interroger<{ n: string }>(
      bd,
      "select count(*)::text as n from storage.buckets",
    );

    expect(
      Number(policies?.n ?? -1),
      "Une policy est apparue sur `storage` ou `realtime`. Les droits que " +
        "Supabase accorde à `anon` sur ces schémas cessent d'être inertes, et " +
        "ils ne sont PAS révocables depuis nos migrations.",
    ).toBe(0);

    expect(
      Number(buckets?.n ?? -1),
      "Un bucket Supabase Storage existe. Ce produit stocke sur Cloudflare R2 : " +
        "un bucket ici n'a été créé par aucun code, donc par une main, et la " +
        "case « Public bucket » du tableau de bord pose une policy.",
    ).toBe(0);
  });

  test("l'inventaire des droits hors `public` n'a pas grandi", async () => {
    /*
     * On ne peut pas les retirer, mais on peut refuser qu'ils AUGMENTENT — et
     * surtout qu'un schéma NOUVEAU apparaisse sans que personne le remarque.
     *
     * Le décompte est figé plutôt que la liste : une liste exacte casserait à
     * chaque montée de version de la plateforme sur un détail sans importance,
     * et une sonde qu'on désactive ne protège plus rien. Le nombre, lui, ne
     * bouge que quand la surface bouge.
     */
    const droits = await interroger<{ schema: string; table: string; grantee: string }>(
      bd,
      `select table_schema as schema, table_name as "table", grantee
         from information_schema.role_table_grants
        where grantee in ('anon', 'authenticated')
          and table_schema not in ('public', 'information_schema', 'pg_catalog')
        group by 1, 2, 3`,
    );

    // Un ensemble vide passe tout : si la requête cessait de rendre quoi que ce
    // soit, le contrôle serait vert sur zéro objet.
    expect(
      droits.length,
      "Aucun droit hors `public` trouvé : la sonde n'inspecte plus rien.",
    ).toBeGreaterThan(0);

    const schemas = [...new Set(droits.map((d) => d.schema))].sort();
    expect(
      schemas,
      `Un schéma nouveau accorde des droits à \`anon\` ou \`authenticated\` : ` +
        `${schemas.join(", ")}. Chaque schéma est une surface de plus, et ` +
        "aucun n'est révocable depuis nos migrations.",
    ).toEqual(["realtime", "storage"]);

    expect(
      droits.length,
      `Le nombre de couples (table, rôle) hors \`public\` est passé à ` +
        `${droits.length}. Vérifier ce qui a été ajouté avant de relever ce seuil.`,
    ).toBe(18);
  });

  test("aucun de ces schémas n'est cité comme exposé par erreur", () => {
    // L'AUTRE SENS. Si quelqu'un ajoutait `storage` à la liste des schémas
    // servis, le premier test ci-dessus deviendrait vert en décrivant une
    // surface OUVERTE — la liste doit donc être vérifiée, elle aussi.
    expect(
      SCHEMAS_EXPOSES,
      "La liste des schémas exposés a changé : le premier contrôle ne prouve " +
        "plus la non-exposition, il la décrit.",
    ).toEqual(["public", "graphql_public"]);
  });
});
