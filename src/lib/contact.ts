/**
 * Adresse de signalement de contenu.
 *
 * Elle n'est pas décorative : la procédure de notification et retrait est ce qui
 * fonde notre statut d'hébergeur (brief §12). Une procédure sans destinataire
 * n'est pas une procédure.
 *
 * Tant qu'aucune adresse n'existe, la page de signalement renvoie 404 et le lien
 * du pied de page disparaît. C'est délibéré : afficher une procédure qui ne mène
 * nulle part serait pire que ne rien afficher — cela laisserait croire qu'un
 * canal existe, et un signalement envoyé dans le vide est un signalement non
 * traité qu'on croit traité.
 */

/** Marqueurs qu'un gabarit non substitué laisse derrière lui (L-026). */
const GABARITS = ["votre", "your", "exemple", "example", "todo", "xxx", "changeme", "<", "["];

export function adresseAbus(): string | null {
  const brut = process.env["NEXT_PUBLIC_CONTACT_ABUS"];
  if (brut === undefined) return null;

  const valeur = brut.trim();
  if (valeur === "") return null;

  // Une valeur qui a la FORME d'une adresse franchirait toute validation de
  // présence. On vérifie la substance.
  const minuscule = valeur.toLowerCase();
  if (GABARITS.some((g) => minuscule.includes(g))) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valeur)) return null;

  return valeur;
}

/** Vrai si le canal de signalement est réellement joignable. */
export function signalementDisponible(): boolean {
  return adresseAbus() !== null;
}
