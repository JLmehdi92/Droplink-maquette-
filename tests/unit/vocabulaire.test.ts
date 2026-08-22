import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * LE VOCABULAIRE DES CHAÎNES VISIBLES.
 *
 * Le positionnement est générique et neutre : aucun terme du vertical reps,
 * aucune marque de luxe, aucun nom de plateforme d'achat, et aucun vocabulaire
 * de fret maritime. Ce n'est pas une préférence de style — c'est ce qui nous
 * sépare d'un site qu'on ferme.
 *
 * LES MAQUETTES SONT LA SOURCE DU RISQUE. Elles ont été reprises pour leur
 * GÉOMÉTRIE, décision explicite de Wassim ; leur copy parle de conteneurs, de
 * palettes, de dédouanement et de « Global Freight Logistics ». Chaque écran
 * porté depuis une maquette est une occasion de recopier une phrase de trop, et
 * une phrase recopiée ne se voit pas : elle a l'air d'avoir été écrite.
 *
 * POURQUOI CE CONTRÔLE PORTE SUR LES CATALOGUES ET NON SUR LE CODE. Un contrôle
 * de contenu qui balaie le code source échoue sur sa PROPRE liste noire — la
 * liste contient les mots interdits, donc le fichier qui l'écrit les contient.
 * Les catalogues de traduction sont des DONNÉES : ils portent exactement ce que
 * l'utilisateur lit, ni plus ni moins. Et comme aucune chaîne visible n'a le
 * droit d'être en dur, les inspecter revient à tout inspecter.
 *
 * IL INVENTORIE, IL NE SÉLECTIONNE PAS. La sonde rend TOUTES les chaînes des
 * deux catalogues ; le test déclare ses exceptions AVEC LEUR RAISON, et il
 * échoue DANS LES DEUX SENS — un terme interdit qui apparaît, mais aussi une
 * exception devenue inutile. Sans le second sens, une exception posée pour une
 * raison disparue survit indéfiniment et couvre le retour du défaut.
 *
 * LA CORRESPONDANCE EST PAR MOT ENTIER. Une recherche par sous-chaîne trouve
 * « ERP » dans « fingerprint » et « manifest » dans « manifestement » : elle
 * produit des alertes fausses, et une alerte qui se trompe est une alerte qu'on
 * apprend à ignorer.
 */

/** Les mots interdits, par famille et avec le motif de l'interdiction. */
const INTERDITS: ReadonlyMap<string, string> = new Map([
  // Vertical reps — le positionnement public est neutre.
  ["rep", "jargon du vertical reps"],
  ["reps", "jargon du vertical reps"],
  ["replica", "jargon du vertical reps"],
  ["replique", "jargon du vertical reps"],
  ["w2c", "jargon du vertical reps"],
  ["batch", "jargon du vertical reps : y désigne une version d'usine"],
  ["haul", "jargon du vertical reps"],
  ["yupoo", "plateforme du vertical"],
  // Plateformes d'achat groupé — autorisées dans la config technique interne,
  // JAMAIS dans une chaîne traduite.
  ["cnfans", "nom de plateforme d'achat"],
  ["kakobuy", "nom de plateforme d'achat"],
  ["sugargoo", "nom de plateforme d'achat"],
  ["acbuy", "nom de plateforme d'achat"],
  ["pandabuy", "nom de plateforme d'achat"],
  ["superbuy", "nom de plateforme d'achat"],
  ["wegobuy", "nom de plateforme d'achat"],
  // Fret maritime et logistique enterprise — le vocabulaire des maquettes.
  ["conteneur", "vocabulaire de fret"],
  ["conteneurs", "vocabulaire de fret"],
  ["container", "vocabulaire de fret"],
  ["containers", "vocabulaire de fret"],
  ["palette", "vocabulaire de fret"],
  ["palettes", "vocabulaire de fret"],
  ["dedouanement", "vocabulaire de fret"],
  ["fret", "vocabulaire de fret"],
  ["freight", "vocabulaire de fret"],
  ["logistics", "vocabulaire de fret"],
  ["logistique", "vocabulaire de fret"],
  ["cargaison", "vocabulaire de fret"],
  ["affretement", "vocabulaire de fret"],
  ["scelle", "vocabulaire de fret : le scellé de conteneur"],
  ["manifeste", "vocabulaire de fret : le manifeste de chargement"],
  ["tolerances", "vocabulaire d'inspection industrielle"],
  ["genealogie", "vocabulaire d'inspection industrielle"],
  ["erp", "logiciel d'entreprise hors produit"],
  ["sap", "logiciel d'entreprise hors produit"],
  ["oracle", "logiciel d'entreprise hors produit"],
  // Marques de luxe — aucune n'apparaît, jamais.
  ["nike", "marque"],
  ["adidas", "marque"],
  ["gucci", "marque"],
  ["prada", "marque"],
  ["balenciaga", "marque"],
  ["vuitton", "marque"],
  ["dior", "marque"],
  ["jordan", "marque"],
  ["yeezy", "marque"],
]);

/**
 * Les exceptions, avec leur raison. Une entrée ici DOIT correspondre à une
 * occurrence réelle : si l'occurrence disparaît, le test échoue et l'exception
 * doit être retirée.
 */
const EXCEPTIONS: ReadonlyMap<string, string> = new Map([
  // AUCUNE, et c'est un résultat, pas un oubli.
  //
  // Quatre exceptions avaient été déclarées d'avance pour « manifestement
  // illicite », la formule juridique du statut d'hébergeur. Le second sens du
  // contrôle les a refusées : la correspondance étant par MOT ENTIER,
  // « manifestement » n'est pas « manifeste » et n'a jamais été signalé. Les
  // garder aurait laissé quatre trous permanents dans la liste, pour couvrir un
  // défaut qui n'existait pas.
]);

/**
 * Les mots dont la forme française est ambiguë et qui restent AUTORISÉS.
 *
 * « lot » est le cas motivant : le brief l'interdit comme terme de fret, mais
 * « archiver par lot » est le français courant d'une action groupée et n'évoque
 * aucun conteneur. L'interdire forcerait une périphrase moins claire, et une
 * interface moins claire est un coût réel pour éviter un risque imaginaire.
 */
const AUTORISES_MALGRE_TOUT: ReadonlyMap<string, string> = new Map([
  ["lot", "« par lot » = action groupée en français courant, aucun sens de fret"],
  ["lots", "pluriel du précédent"],
]);

/** Aplatit un catalogue en couples (chemin, texte). */
function chaines(objet: unknown, prefixe = ""): [string, string][] {
  if (typeof objet === "string") return [[prefixe, objet]];
  if (objet === null || typeof objet !== "object") return [];
  return Object.entries(objet as Record<string, unknown>).flatMap(([cle, valeur]) =>
    chaines(valeur, prefixe === "" ? cle : `${prefixe}.${cle}`),
  );
}

/** Découpe en mots, sans accents, pour comparer forme à forme. */
function mots(texte: string): string[] {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((m) => m !== "");
}

const CATALOGUES = ["fr", "en"] as const;

function lireCatalogue(langue: string): [string, string][] {
  const brut = readFileSync(join(process.cwd(), "messages", `${langue}.json`), "utf8");
  return chaines(JSON.parse(brut));
}

describe("Le vocabulaire des chaînes visibles", () => {
  test("la sonde inspecte réellement quelque chose", () => {
    // UN ENSEMBLE VIDE PASSE TOUT. Avant de prouver que rien d'interdit n'est
    // présent, il faut établir qu'il y avait quelque chose à inspecter — un
    // chemin de fichier erroné ou un aplatissement cassé rendrait ce contrôle
    // vert et muet.
    for (const langue of CATALOGUES) {
      const lues = lireCatalogue(langue);
      expect(lues.length, `catalogue ${langue} vide ou illisible`).toBeGreaterThan(400);
      expect(
        lues.every(([, v]) => typeof v === "string"),
        "l'aplatissement ne rend pas que des chaînes",
      ).toBe(true);
    }
  });

  test("aucun terme interdit n'apparaît, dans aucune des deux langues", () => {
    const trouves: string[] = [];

    for (const langue of CATALOGUES) {
      for (const [chemin, texte] of lireCatalogue(langue)) {
        for (const mot of mots(texte)) {
          if (AUTORISES_MALGRE_TOUT.has(mot)) continue;

          const motif = INTERDITS.get(mot);
          if (motif === undefined) continue;

          // Les formules juridiques légitimes sont déclarées, une par une.
          if (EXCEPTIONS.has(`${chemin}:${mot}`)) continue;

          trouves.push(`${langue}/${chemin} → « ${mot} » (${motif}) : ${texte.slice(0, 90)}`);
        }
      }
    }

    expect(
      trouves,
      "Vocabulaire interdit dans une chaîne visible :\n" + trouves.join("\n"),
    ).toEqual([]);
  });

  test("les exceptions déclarées correspondent toutes à une occurrence RÉELLE", () => {
    // SECOND SENS DU CONTRÔLE. Sans lui, une exception posée pour une raison
    // disparue survit indéfiniment et couvre le retour du défaut qu'elle
    // décrivait — c'est exactement de cette façon qu'une liste d'exceptions
    // devient une liste de trous.
    const observees = new Set<string>();

    for (const langue of CATALOGUES) {
      for (const [chemin, texte] of lireCatalogue(langue)) {
        for (const mot of mots(texte)) {
          if (INTERDITS.has(mot)) observees.add(`${chemin}:${mot}`);
        }
      }
    }

    const perimees = [...EXCEPTIONS.keys()].filter((cle) => !observees.has(cle));
    expect(
      perimees,
      `Exceptions devenues inutiles : ${perimees.join(", ")}. Les retirer — ` +
        "une exception périmée couvre le retour du défaut.",
    ).toEqual([]);
  });

  test("les deux catalogues portent exactement les mêmes clés", () => {
    // La parité est vérifiée ailleurs, mais elle conditionne CE contrôle : une
    // clé présente dans une seule langue échapperait à l'inspection de l'autre.
    const cles = CATALOGUES.map((l) => new Set(lireCatalogue(l).map(([c]) => c)));
    const [fr, en] = cles;
    expect([...(fr ?? [])].filter((c) => !(en ?? new Set()).has(c))).toEqual([]);
    expect([...(en ?? [])].filter((c) => !(fr ?? new Set()).has(c))).toEqual([]);
  });
});
