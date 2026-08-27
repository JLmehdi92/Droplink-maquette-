import type { ParametresListe } from "./liste";

/**
 * Construit l'URL de la liste à partir des paramètres courants et d'une
 * modification.
 *
 * LE CURSEUR EST REMIS À ZÉRO par toute modification qui change l'ensemble
 * résultat — changer de filtre en gardant le curseur ferait démarrer la liste au
 * milieu d'un jeu qui n'existe plus, et l'écran paraîtrait vide alors qu'il ne
 * l'est pas. Seule une demande explicite de page suivante le porte.
 *
 * Les valeurs par défaut sont OMISES de l'URL. Une adresse qui n'énumère que ce
 * qui s'écarte du défaut est lisible, se recopie dans une conversation, et rend
 * visible d'un coup d'œil ce qui filtre la liste.
 */
export function lienListe(
  base: string,
  courant: ParametresListe,
  modification: Partial<ParametresListe> & { readonly curseur?: string | null },
): string {
  const suivant: ParametresListe = { ...courant, ...modification };

  // Toute modification autre que le curseur lui-même invalide le curseur.
  const changeLeJeu = Object.keys(modification).some((c) => c !== "curseur");
  const curseur = changeLeJeu ? null : (suivant.curseur ?? null);

  const params = new URLSearchParams();
  if (suivant.q !== "") params.set("q", suivant.q);
  if (suivant.statut !== null) params.set("statut", suivant.statut);
  if (suivant.qc !== null) params.set("qc", suivant.qc);
  if (suivant.tri !== "recentes") params.set("tri", suivant.tri);
  if (suivant.du !== null) params.set("du", suivant.du);
  if (suivant.au !== null) params.set("au", suivant.au);
  if (suivant.archivees) params.set("archivees", "1");
  if (curseur !== null) params.set("curseur", curseur);

  const chaine = params.toString();
  return chaine === "" ? base : base + "?" + chaine;
}

/**
 * Vrai si un filtre restreint la liste.
 *
 * Sert à choisir entre les deux états vides. `archivees` en fait partie : une
 * corbeille vide n'est pas un compte vide, et proposer « créez votre première
 * commande » à qui consulte ses archives serait absurde.
 */
export function listeFiltree(p: ParametresListe): boolean {
  return p.q !== "" || p.statut !== null || p.qc !== null || p.archivees || p.du !== null || p.au !== null;
}
