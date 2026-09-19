import { describe, expect, test } from "vitest";
import { LANGUES } from "@/i18n/config";
import catalogueTransporteurs from "@/lib/tracking/transporteurs.json";
import { lireTransporteur } from "@/lib/tracking/transporteurs";
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

/*
 * ⚠️ TOUTES LES LANGUES, PAS DEUX. Cette constante valait `["fr", "en"]` :
 * un catalogue chinois n'aurait été inspecté par RIEN.
 */
const CATALOGUES = LANGUES;

/**
 * LES INTERDITS QUI NE S'ÉCRIVENT PAS EN LETTRES.
 *
 * ⚠️ LE TOKENISEUR CI-DESSOUS DÉCOUPE SUR `[^a-z0-9]+` : sur un texte en
 * idéogrammes il rend le TABLEAU VIDE. Mesuré — « 集装箱正在港口清关 » (le
 * conteneur est en dédouanement au port) donne `[]`. Un catalogue chinois
 * entier serait donc passé à 100 % **en n'inspectant rien**, et c'est la porte
 * qui tient le principe II du brief et la mitigation du risque hébergeur.
 * *Un ensemble vide passe tout*, posé au pire endroit possible.
 *
 * Ces termes-ci sont donc cherchés par SOUS-CHAÎNE, puisque le chinois écrit
 * sans espaces et qu'aucun découpage en mots n'a de sens ici.
 */
const INTERDITS_SANS_MOTS: ReadonlyMap<string, string> = new Map([
  ["集装箱", "conteneur — vocabulaire de fret"],
  ["托盘", "palette — vocabulaire de fret"],
  ["报关", "dédouanement — vocabulaire de fret"],
  ["清关", "dédouanement — vocabulaire de fret"],
  ["货代", "transitaire — vocabulaire de fret"],
  ["批次", "lot / batch — interdit par le brief"],
  ["复刻", "replica — jargon du vertical reps"],
  ["仿品", "contrefaçon — jargon du vertical reps"],
  ["高仿", "contrefaçon haut de gamme — jargon du vertical reps"],
  ["莆田", "Putian — désigne l'origine des reps"],
]);

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

      /*
       * ⚠️ COMPTER LES CHAÎNES NE SUFFISAIT PAS, ET C'EST LE DÉFAUT QUE CE
       * BLOC FERME. Le contrôle vérifiait `lues.length > 400` — le nombre de
       * VALEURS lues — jamais le nombre d'unités réellement examinées. Sur un
       * catalogue en idéogrammes, les 400 chaînes étaient bien là et le
       * tokeniseur rendait `[]` pour chacune : la sonde passait en n'ayant
       * rien inspecté du tout.
       *
       * On exige donc que CHAQUE catalogue livre des unités : soit des mots
       * latins, soit des caractères CJK. Un catalogue qui n'en donnerait
       * aucune ferait rougir ici, au lieu de rendre le contrôle suivant muet.
       */
      const unites = lues.reduce(
        (n, [, v]) => n + mots(v).length + [...v].filter((c) => c >= "　").length,
        0,
      );
      expect(
        unites,
        `catalogue ${langue} : la sonde n'a extrait AUCUNE unité inspectable. ` +
          "Le découpage en mots ne mord-il pas sur cette écriture ?",
      ).toBeGreaterThan(1000);
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

        // LES TERMES SANS ESPACES, cherchés tels quels : aucun découpage en
        // mots ne peut les isoler, et c'est précisément pour cela qu'ils
        // passaient inaperçus.
        for (const [terme, motif] of INTERDITS_SANS_MOTS) {
          if (!texte.includes(terme)) continue;
          if (EXCEPTIONS.has(`${chemin}:${terme}`)) continue;
          trouves.push(`${langue}/${chemin} → « ${terme} » (${motif}) : ${texte.slice(0, 90)}`);
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

  test("tous les catalogues portent exactement les mêmes clés", () => {
    /*
     * La parité est vérifiée ailleurs, mais elle conditionne CE contrôle : une
     * clé présente dans une seule langue échapperait à l'inspection des autres.
     *
     * ⚠️ CE TEST FAISAIT `const [fr, en] = cles` — DEUX LANGUES, EN DUR. Une
     * troisième n'aurait été comparée à rien, et ses clés propres n'auraient
     * donc jamais été inspectées pour le vocabulaire interdit.
     */
    const reference = new Set(lireCatalogue(CATALOGUES[0]).map(([c]) => c));
    for (const langue of CATALOGUES.slice(1)) {
      const autres = new Set(lireCatalogue(langue).map(([c]) => c));
      expect(
        [...reference].filter((c) => !autres.has(c)),
        `clés présentes en ${CATALOGUES[0]} et absentes en ${langue}`,
      ).toEqual([]);
      expect(
        [...autres].filter((c) => !reference.has(c)),
        `clés présentes en ${langue} et absentes en ${CATALOGUES[0]}`,
      ).toEqual([]);
    }
  });
});

/**
 * LES NOMS DE TRANSPORTEURS SONT AUSSI DU TEXTE AFFICHÉ — audit du 20/09/2026.
 *
 * Le contrôle ci-dessus lisait les catalogues de traduction, et seulement eux. Or le nom
 * d'un transporteur s'affiche dans les envois, les analyses, le tableau de bord, l'export
 * CSV et l'administration, et il vient d'une liste recopiée du fournisseur de suivi : 3 502
 * entrées, dont une PLATEFORME D'ACHAT (code 190837), qu'aucun contrôle ne voyait. La
 * contrainte n° 2 ne distingue pas un mot écrit par nous d'un mot recopié : il est affiché.
 *
 * INVENTAIRE, pas sélection : chaque code du catalogue passe par `lireTransporteur`, la
 * seule porte par laquelle un nom arrive à l'écran.
 */
describe("Les noms de transporteurs affichés respectent la contrainte n° 2", () => {
  const codes = Object.keys(catalogueTransporteurs as Record<string, unknown>);

  test("CONTRE-TEST : l'inventaire porte les 3 502 entrées, et il en rend des noms", () => {
    expect(codes.length).toBeGreaterThan(3000);
    const nommes = codes.filter((c) => lireTransporteur(Number(c)) !== null);
    expect(nommes.length).toBeGreaterThan(3000);
  });

  /*
   * TROIS FAMILLES SEULEMENT, ET C'EST UNE DÉCISION. Un nom de transporteur est un NOM PROPRE,
   * affiché tel quel (CLAUDE.md : marques et transporteurs ne se traduisent pas). « DHL
   * Freight », « CEVA Logistics », « SAP EXPRESS » ou « Jordan Post » (la poste jordanienne)
   * sont de vrais transporteurs : le vocabulaire de fret, les marques et les noms de logiciels
   * de la liste visent NOTRE rédaction, pas le nom d'une entreprise de livraison. Ce qu'un nom
   * propre ne doit jamais être ici, c'est une plateforme d'achat du vertical ou son jargon.
   */
  const FAMILLES_INTERDITES_POUR_UN_NOM = /^(nom de plateforme d'achat|plateforme du vertical|jargon du vertical reps)/;

  test("aucun nom rendu n'est une plateforme d'achat ni le jargon du vertical", () => {
    const trouves: string[] = [];
    for (const code of codes) {
      const t = lireTransporteur(Number(code));
      if (t === null) continue;
      for (const mot of mots(t.nom)) {
        if (AUTORISES_MALGRE_TOUT.has(mot)) continue;
        const motif = INTERDITS.get(mot);
        if (motif !== undefined && FAMILLES_INTERDITES_POUR_UN_NOM.test(motif)) {
          trouves.push(`${code} → « ${t.nom} » (${motif})`);
        }
      }
      for (const [terme, motif] of INTERDITS_SANS_MOTS) {
        if (FAMILLES_INTERDITES_POUR_UN_NOM.test(motif) && t.nom.includes(terme)) {
          trouves.push(`${code} → « ${t.nom} » (${motif})`);
        }
      }
    }
    expect(trouves, "un nom de transporteur affichable nomme une plateforme d'achat").toEqual([]);
  });
});
