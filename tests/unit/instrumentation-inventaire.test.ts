import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  EVENEMENTS,
  EVENEMENTS_DENOMINATEURS,
  EVENEMENTS_SANS_EMETTEUR,
} from "@/lib/instrumentation/evenements";
import type { NomEvenement } from "@/lib/instrumentation/evenements";
import { sansCommentaires } from "../aide/source";

/**
 * LE CATALOGUE D'ÉVÉNEMENTS COMPARÉ AUX SITES D'ÉMISSION RÉELS, DANS LES DEUX
 * SENS.
 *
 * `evenements.ts` déclare en tête « UN FAIT, UN POINT D'ÉMISSION ». C'était une
 * consigne, pas une garde, et deux compteurs l'avaient déjà perdue :
 *
 * - `colis_pris_en_charge` était émis par `prise-en-charge.ts` — la vraie
 *   inscription chez le fournisseur, LE SEUL GESTE FACTURÉ — et à nouveau par
 *   `ingestion.ts`, franchi à chaque interrogation de cadence. Le compteur
 *   mesurait les interrogations sous le nom des prises en charge, et c'est
 *   celui sur lequel on aurait décidé si le coût variable du produit tient ;
 * - `order_editor_opened`, déclaré DÉNOMINATEUR, était émis à la création PUIS
 *   au rendu de l'éditeur vers lequel la création redirige : deux par
 *   ouverture.
 *
 * Aucune suite ne pouvait le voir : un double comptage ne casse rien, ne lève
 * aucune erreur, et rend un chiffre parfaitement crédible. C'est la définition
 * même d'une métrique légèrement faussée — pire qu'une métrique cassée.
 *
 * ⚠️ L'INVENTAIRE PORTE SUR LE CODE, COMMENTAIRES RETIRÉS (L-031) : les
 * commentaires de ce dépôt CITENT abondamment les noms d'événements pour
 * expliquer les règles, et un motif appliqué au texte brut compterait ces
 * citations comme des émissions — donc conclurait qu'un événement mort est
 * branché.
 */

const SRC = join(process.cwd(), "src");
const CATALOGUE = join(SRC, "lib", "instrumentation", "evenements.ts");

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

/**
 * Les sites d'émission, par clé du catalogue.
 *
 * On ne cherche pas le NOM de l'événement mais l'APPEL qui l'émet : `emettre(`
 * ou `emettreApres(` immédiatement suivi de `EVENEMENTS.CLE`. Chercher la
 * chaîne « colis_pris_en_charge » aurait trouvé le catalogue lui-même, les
 * commentaires, et n'aurait jamais distingué une mention d'une émission —
 * un contrôle qui cherche un MOT ne prouve rien (L-020).
 */
const APPEL = /\bemettre(?:Apres)?\s*\(/g;

/**
 * Le PREMIER ARGUMENT de chaque appel d'émission, lu jusqu'à la virgule de
 * premier niveau.
 *
 * On ne se contente pas d'une expression régulière collée à `emettre(` : le
 * premier argument peut être un ternaire — `decision === "approuve" ?
 * EVENEMENTS.QC_APPROUVE : EVENEMENTS.QC_REFUSE` — et un motif qui exigerait
 * `emettre(EVENEMENTS.` aurait déclaré ces deux événements MORTS. On aurait
 * alors « corrigé » du code correct pour satisfaire la sonde, ce qui est
 * l'erreur exactement symétrique de celle qu'on répare.
 *
 * Les chaînes sont traversées sans être interprétées : une parenthèse ou une
 * virgule à l'intérieur d'un libellé fausserait le décompte de profondeur.
 */
function premierArgument(code: string, depuis: number): string {
  let profondeur = 0;
  let guillemet: string | null = null;
  for (let i = depuis; i < code.length; i += 1) {
    const c = code[i];
    if (guillemet !== null) {
      if (c === "\\") i += 1;
      else if (c === guillemet) guillemet = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      guillemet = c;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") profondeur += 1;
    else if (c === "]" || c === "}") profondeur -= 1;
    else if (c === ")") {
      if (profondeur === 0) return code.slice(depuis, i);
      profondeur -= 1;
    } else if (c === "," && profondeur === 0) return code.slice(depuis, i);
  }
  return code.slice(depuis);
}

/** Les événements émis par un module, un par appel reconnu. */
function evenementsEmis(code: string): readonly string[] {
  const noms: string[] = [];
  for (const appel of code.matchAll(APPEL)) {
    const argument = premierArgument(code, (appel.index ?? 0) + appel[0].length);
    for (const cle of argument.matchAll(/EVENEMENTS\.([A-Z_]+)/g)) noms.push(cle[1] ?? "");
  }
  return noms;
}

function sitesDEmission(): ReadonlyMap<string, readonly string[]> {
  const sites = new Map<string, string[]>();
  for (const chemin of fichiers(SRC)) {
    if (chemin === CATALOGUE) continue;
    const code = sansCommentaires(readFileSync(chemin, "utf8"));
    const relatif = chemin.slice(process.cwd().length + 1);

    for (const nom of evenementsEmis(code)) {
      const liste = sites.get(nom) ?? [];
      if (!liste.includes(relatif)) liste.push(relatif);
      sites.set(nom, liste);
    }
  }
  return sites;
}

/**
 * Les événements légitimement émis depuis plusieurs endroits, et ce qui les
 * réconcilie.
 *
 * Ces deux-là ne sont PAS des doublons : chacun porte une propriété qui
 * distingue les deux chemins dans la charge utile, et cette propriété est
 * vérifiée ci-dessous. Sans elle, la dispense serait une porte — il suffirait
 * d'inscrire un nom ici pour faire passer un vrai double comptage.
 */
const PLUSIEURS_SITES_ADMIS: ReadonlyMap<string, { readonly propriete: string; readonly raison: string }> =
  new Map([
    [
      "COMMANDE_ARCHIVEE",
      {
        propriete: "lot",
        raison:
          "L'archivage unitaire et l'archivage par lot écrivent le même fait. " +
          "La propriété `lot` porte le NOMBRE de commandes, sinon on compterait " +
          "les GESTES d'un côté et les COMMANDES de l'autre — et l'écart " +
          "suivrait l'usage : plus un vendeur emploie la sélection multiple, " +
          "plus le chiffre le sous-estime.",
      },
    ],
    [
      "SUIVI_ABANDONNE",
      {
        propriete: "a_la_prise_en_charge",
        raison:
          "Un colis peut être abandonné DÈS l'inscription (le fournisseur " +
          "refuse le numéro) ou APRÈS des interrogations sans mouvement. Ce " +
          "sont deux causes différentes et le booléen les sépare : les " +
          "confondre ferait chercher une panne de cadence là où le numéro " +
          "était simplement faux.",
      },
    ],
  ]);

describe("Inventaire de l'instrumentation", () => {
  const sites = sitesDEmission();
  const cles = Object.keys(EVENEMENTS);

  test("la sonde trouve réellement des sites d'émission", () => {
    expect(cles.length, "catalogue vide").toBeGreaterThan(10);
    expect(
      sites.size,
      "Aucun site d'émission trouvé dans src/. Le motif vise à côté, et tout " +
        "ce fichier passerait au vert sur un ensemble vide.",
    ).toBeGreaterThan(10);
  });

  test("CHAQUE appel d'émission est reconnu par le motif", () => {
    /*
     * LE CONTRÔLE QUI EMPÊCHE LE RESTE D'ÊTRE UNE ILLUSION.
     *
     * Le motif n'accepte que `emettre(EVENEMENTS.X`. Un appel écrit autrement —
     * ternaire, variable intermédiaire, événement passé en argument — serait
     * silencieusement absent de l'inventaire. Tous les tests ci-dessous
     * continueraient de passer sur un inventaire amputé.
     *
     * On compte donc les appels D'UN CÔTÉ et les reconnaissances DE L'AUTRE, et
     * on exige l'égalité. Une nouvelle forme d'appel fait échouer ici, avec son
     * fichier, plutôt que de faire disparaître un compteur en silence.
     */
    const echappes: string[] = [];
    for (const chemin of fichiers(SRC)) {
      if (chemin === CATALOGUE) continue;
      // La définition d'`emettreApres` appelle `emettre` en lui passant
      // l'événement qu'elle a reçu : son propre module est le seul endroit où un
      // appel n'a légitimement pas de nom littéral.
      if (chemin.endsWith(join("instrumentation", "emettre.ts"))) continue;

      const code = sansCommentaires(readFileSync(chemin, "utf8"));
      // On compte les appels DONT AUCUN événement n'a été tiré. Un ternaire en
      // rend deux pour un appel, et c'est correct : les deux branches sont deux
      // faits distincts émis depuis le même endroit.
      const muets = [...code.matchAll(APPEL)].filter((appel) => {
        const argument = premierArgument(code, (appel.index ?? 0) + appel[0].length);
        return !/EVENEMENTS\.[A-Z_]+/.test(argument);
      }).length;
      if (muets > 0) {
        echappes.push(`${chemin.slice(process.cwd().length + 1)} : ${muets} appels sans événement`);
      }
    }

    expect(
      echappes,
      `Appels d'émission que l'inventaire ne voit pas : ${echappes.join(" | ")}. ` +
        "Tant qu'ils échappent au motif, tous les contrôles de ce fichier " +
        "portent sur un inventaire incomplet.",
    ).toEqual([]);
  });

  test("tout événement du catalogue est émis, ou déclaré sans émetteur AVEC sa raison", () => {
    const muets = cles.filter((cle) => !sites.has(cle));
    const valeur = (cle: string): NomEvenement => EVENEMENTS[cle as keyof typeof EVENEMENTS];

    const nonDeclares = muets.filter((cle) => !EVENEMENTS_SANS_EMETTEUR.has(valeur(cle)));
    expect(
      nonDeclares,
      `Événements catalogués que RIEN n'émet : ${nonDeclares.join(", ")}. Le ` +
        "catalogue affirme alors une mesure que le produit ne prend pas — une " +
        "lecture conclurait qu'on mesure ce qu'on ne mesure pas (L-014). Les " +
        "brancher, ou les déclarer dans EVENEMENTS_SANS_EMETTEUR avec la raison.",
    ).toEqual([]);

    // La raison est OBLIGATOIRE et sa longueur est vérifiée : sans exigence, ce
    // registre devient l'endroit où l'on range ce qu'on ne veut pas expliquer.
    for (const [nom, raison] of EVENEMENTS_SANS_EMETTEUR) {
      expect(raison.length, `La déclaration de « ${nom} » n'explique rien`).toBeGreaterThan(120);
    }
  });

  test("SECOND SENS : une déclaration « sans émetteur » devenue fausse fait échouer", () => {
    /*
     * Sans ce sens-là, un événement enfin branché resterait déclaré muet pour
     * toujours — et la déclaration, qui explique en détail pourquoi il ne peut
     * pas l'être, deviendrait un mensonge que personne ne relirait.
     */
    const valeurs = new Map(cles.map((cle) => [EVENEMENTS[cle as keyof typeof EVENEMENTS], cle]));
    const menteuses: string[] = [];

    for (const nom of EVENEMENTS_SANS_EMETTEUR.keys()) {
      const cle = valeurs.get(nom);
      if (cle === undefined) {
        menteuses.push(`« ${nom} » n'existe plus au catalogue`);
        continue;
      }
      if (sites.has(cle)) {
        menteuses.push(`« ${nom} » est désormais émis par ${(sites.get(cle) ?? []).join(", ")}`);
      }
    }

    expect(menteuses, menteuses.join(" | ")).toEqual([]);
  });

  test("un fait, un point d'émission — sauf dispense réconciliée", () => {
    const multiples = [...sites.entries()].filter(([, ou]) => ou.length > 1);

    const defauts = multiples
      .filter(([cle]) => !PLUSIEURS_SITES_ADMIS.has(cle))
      .map(([cle, ou]) => `${cle} est émis depuis ${ou.length} endroits : ${ou.join(", ")}`);

    expect(
      defauts,
      `${defauts.join(" | ")}\n\nUn même fait émis de deux endroits produit un ` +
        "double comptage qui ne casse rien et reste crédible. Si les deux " +
        "chemins sont réellement distincts, les déclarer avec la propriété qui " +
        "les sépare dans la charge utile.",
    ).toEqual([]);

    // Dispense périmée : un événement redevenu unique n'a plus à figurer ici.
    const perimees = [...PLUSIEURS_SITES_ADMIS.keys()].filter(
      (cle) => (sites.get(cle) ?? []).length <= 1,
    );
    expect(
      perimees,
      `Dispenses de multi-émission devenues inutiles : ${perimees.join(", ")}`,
    ).toEqual([]);
  });

  test("chaque dispense de multi-émission porte VRAIMENT sa propriété distinctive", () => {
    /*
     * SANS CE TEST, LA DISPENSE SERAIT UNE PORTE. Y inscrire un nom suffirait
     * à faire passer un double comptage réel. On exige donc que la propriété
     * annoncée apparaisse dans le code, à CHACUN des sites d'émission — pas
     * seulement dans l'un d'eux, puisque c'est précisément la divergence entre
     * les deux qu'elle est censée empêcher.
     */
    for (const [cle, { propriete, raison }] of PLUSIEURS_SITES_ADMIS) {
      expect(raison.length, `La dispense de ${cle} n'explique rien`).toBeGreaterThan(120);

      const ou = sites.get(cle) ?? [];
      expect(ou.length, `${cle} n'est plus émis de nulle part`).toBeGreaterThan(1);

      for (const relatif of ou) {
        const code = sansCommentaires(readFileSync(join(process.cwd(), relatif), "utf8"));
        expect(
          code,
          `${relatif} émet ${cle} SANS la propriété « ${propriete} » qui la ` +
            "distingue de l'autre chemin. Les deux comptages se confondent.",
        ).toContain(propriete);
      }
    }
  });

  test("aucun DÉNOMINATEUR n'est émis depuis plus d'un endroit", () => {
    /*
     * L'exigence est la même pour tous, mais elle est REDITE ici parce que la
     * conséquence n'est pas la même. Un numérateur doublé exagère un succès ;
     * un dénominateur doublé écrase un taux. Dans les deux cas le chiffre reste
     * plausible, et c'est ce qui le rend dangereux.
     *
     * Aucune dispense n'est prévue : si un dénominateur devait un jour être
     * émis de deux endroits, il faudrait le dire ici, explicitement.
     */
    const parValeur = new Map(
      Object.entries(EVENEMENTS).map(([cle, valeur]) => [valeur as string, cle]),
    );

    const defauts = EVENEMENTS_DENOMINATEURS.map((valeur) => {
      const cle = parValeur.get(valeur) ?? "";
      return { cle, ou: sites.get(cle) ?? [] };
    })
      .filter((d) => d.ou.length > 1)
      .map((d) => `${d.cle} (dénominateur) est émis depuis : ${d.ou.join(", ")}`);

    expect(defauts, defauts.join(" | ")).toEqual([]);
  });
});
