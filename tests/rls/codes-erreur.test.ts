import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";

/**
 * UN CODE D'ERREUR DÉSIGNE UN SEUL FAIT.
 *
 * Le code fait partie du CONTRAT : c'est par lui, jamais par le message, qu'un
 * appelant distingue un refus métier d'une panne. `actions.ts` en dépend
 * littéralement — il traduit un code en « archivage partiel ».
 *
 * QUATRE COLLISIONS EXISTAIENT, chacune entre deux faits sans rapport : plafond
 * de médias contre lot trop grand, plafond de vidéos contre commandes hors de
 * portée, refus d'identité contre refus de forme des clés de média. Aucune
 * n'était atteignable par le même chemin, et c'est précisément ce qui les rendait
 * durables : rien ne cassait, rien ne se signalait. La phrase juste était « ce
 * serait faux si quelqu'un appelait les deux depuis le même endroit ».
 *
 * CETTE SONDE INTERROGE LA BASE, pas les fichiers de migration. Une migration
 * peut avoir été écrite sans être appliquée, ou remplacée par une suivante : ce
 * qui lève réellement un code est ce que le catalogue contient, et c'est la
 * seule chose qui compte pour un appelant.
 *
 * ELLE INVENTORIE au lieu de sélectionner : elle rend TOUS les codes de TOUTES
 * les fonctions, et le test déclare ses exceptions avec leur raison. Un contrôle
 * qui ne regarderait que les codes auxquels son auteur a pensé ne prouverait que
 * ce qu'il savait déjà.
 */

let bd: Client;

/**
 * Les codes qu'un même fait lève depuis plusieurs fonctions.
 *
 * Chacun est ici parce que le FAIT est le même et que la formulation seule
 * diffère — pas parce qu'il gênait. Un appelant qui distingue sur ces codes
 * obtient la même information dans tous les cas.
 */
const MESSAGES_MULTIPLES_ADMIS = new Map<string, string>([
  [
    "DL026",
    "« Aucune boutique pour cet appelant » et « Aucun profil pour cet appelant » : " +
      "le même refus d'identité, levé par les fonctions de réclamation d'événement. " +
      "Un appelant n'a rien à en distinguer — dans les deux cas la personne " +
      "authentifiée n'a pas les lignes que le produit lui suppose.",
  ],
  [
    "DL030",
    "« le journal d'audit est append-only » et « ne peut pas être vide » : le même " +
      "invariant — le journal est indestructible — vu depuis la ligne et depuis " +
      "l'instruction. Il a d'ailleurs fallu les DEUX, le déclencheur `FOR EACH ROW` " +
      "ne voyant pas passer un `TRUNCATE`. Un appelant n'a rien à en distinguer : " +
      "dans les deux cas, la pièce qui fonde notre statut d'hébergeur tient.",
  ],
  [
    "DL029",
    "Un média ne change ni de commande ni de type : deux formulations d'un seul " +
      "invariant, levées par le même déclencheur. Les séparer donnerait à l'appelant " +
      "une distinction dont il ne peut rien faire.",
  ],
]);

beforeAll(async () => {
  bd = await ouvrirConnexionCatalogue();
}, 60_000);

afterAll(async () => {
  await bd.end();
});

/** Chaque couple (code, message) levé par une fonction du schéma public. */
async function inventaire(): Promise<{ code: string; message: string; fonction: string }[]> {
  return interroger(
    bd,
    `with corps as (
       select p.proname as fonction, p.prosrc as src
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prosrc is not null
     ),
     leves as (
       select c.fonction,
              (regexp_matches(c.src, 'errcode\\s*=\\s*''(DL[0-9]{3})''', 'g'))[1] as code
       from corps c
     ),
     messages as (
       select c.fonction,
              (regexp_matches(
                 c.src,
                 'raise\\s+exception\\s+''([^'']*(?:''''[^'']*)*)''[^;]*?errcode\\s*=\\s*''(DL[0-9]{3})''',
                 'gi'
               )) as m
       from corps c
     )
     select m[2] as code, m[1] as message, fonction from messages
     union
     select l.code, '(message non extrait)', l.fonction
     from leves l
     where not exists (
       select 1 from messages mm where mm.m[2] = l.code and mm.fonction = l.fonction
     )
     order by 1, 2`,
  );
}

describe("L'inventaire des codes d'erreur", () => {
  test("la sonde inspecte réellement quelque chose", async () => {
    // Un ensemble vide passe tout. Si l'extraction cessait de fonctionner — une
    // migration qui change la façon d'écrire `using errcode`, par exemple — le
    // contrôle de collision passerait à 100 % sans rien regarder.
    const lignes = await inventaire();
    expect(
      lignes.length,
      "aucun code d'erreur trouvé dans le catalogue : la sonde ne regarde rien",
    ).toBeGreaterThan(15);

    const codes = new Set(lignes.map((l) => l.code));
    expect(codes.size, "trop peu de codes distincts pour que l'inventaire soit complet").toBeGreaterThan(
      15,
    );
  });

  test("aucun code ne désigne deux faits différents", async () => {
    const lignes = await inventaire();

    const parCode = new Map<string, Set<string>>();
    for (const l of lignes) {
      if (l.message === "(message non extrait)") continue;
      const vus = parCode.get(l.code) ?? new Set<string>();
      vus.add(l.message.trim());
      parCode.set(l.code, vus);
    }

    const collisions = [...parCode.entries()]
      .filter(([code, messages]) => messages.size > 1 && !MESSAGES_MULTIPLES_ADMIS.has(code))
      .map(([code, messages]) => `${code} → ${[...messages].join(" | ")}`);

    expect(
      collisions,
      "Un code d'erreur désigne deux faits différents. Le code fait partie du " +
        "contrat : un appelant qui distingue dessus se trompera, et il ne le " +
        "saura pas.\n" +
        collisions.join("\n"),
    ).toEqual([]);
  });

  test("une exception déclarée qui n'a plus lieu d'être fait échouer", async () => {
    // Le second sens, sans lequel une exception posée pour une raison disparue
    // survit indéfiniment et couvre le retour du défaut qu'elle décrivait.
    const lignes = await inventaire();

    const parCode = new Map<string, Set<string>>();
    for (const l of lignes) {
      if (l.message === "(message non extrait)") continue;
      const vus = parCode.get(l.code) ?? new Set<string>();
      vus.add(l.message.trim());
      parCode.set(l.code, vus);
    }

    const perimees = [...MESSAGES_MULTIPLES_ADMIS.keys()].filter(
      (code) => (parCode.get(code)?.size ?? 0) <= 1,
    );

    expect(
      perimees,
      `Exceptions déclarées devenues inutiles : ${perimees.join(", ")}. ` +
        "Les retirer — une exception périmée couvre le retour du défaut.",
    ).toEqual([]);
  });

  test("les codes de l'archivage par lot sont bien distincts de ceux des médias", async () => {
    // Le contre-test positif de la correction : sans lui, une sonde qui
    // n'extrairait aucun message passerait les contrôles précédents en beauté.
    const lignes = await inventaire();
    const codesDe = (fonction: string) =>
      new Set(lignes.filter((l) => l.fonction === fonction).map((l) => l.code));

    const lot = codesDe("archiver_lot");
    const medias = codesDe("verifier_plafonds_media");

    expect(lot.size, "aucun code trouvé pour archiver_lot : la sonde ne l'inspecte pas").toBeGreaterThan(
      0,
    );
    expect(
      medias.size,
      "aucun code trouvé pour verifier_plafonds_media : la sonde ne l'inspecte pas",
    ).toBeGreaterThan(0);

    const communs = [...lot].filter((c) => medias.has(c));
    expect(communs, `codes partagés entre l'archivage et les plafonds : ${communs.join(", ")}`).toEqual(
      [],
    );
  });
});
