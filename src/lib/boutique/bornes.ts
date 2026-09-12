/**
 * LES BORNES DES CHAMPS DE MARQUE, partagées par le serveur et le navigateur.
 *
 * ⚠️ CE MODULE EXISTE PARCE QUE `reglages.ts` EST `server-only`, ET QUE LE
 * FORMULAIRE EN A BESOIN. Le compteur « 34 / 150 » du kit doit connaître la
 * borne pour la dire à l'avance ; l'importer depuis le module de validation
 * faisait entrer `server-only` dans un composant client, et le build refusait —
 * ce qui est exactement ce que cette barrière doit faire.
 *
 * L'alternative — réécrire 150 dans le formulaire — est celle qu'il faut
 * refuser : deux nombres, deux endroits, et le jour où l'un bouge, le champ
 * laisse saisir ce que la base refusera, sans rien dire. Une borne, un
 * domicile.
 *
 * ⚠️ ET CE N'EST PAS LA SEULE COPIE : la même valeur est une contrainte de
 * COLONNE (migration 147). C'est voulu, et ce n'est pas la même chose — ici on
 * le dit à l'avance, là-bas on le fait respecter quel que soit le chemin
 * d'écriture. Une règle applicative s'oublie dans un nouveau chemin ; une
 * contrainte de colonne non.
 */

/** Le nom de la boutique, en caractères. */
export const NOM_MAX = 60;

/**
 * La description de la boutique, en caractères.
 *
 * Le nombre vient du kit : son compteur écrit « 34 / 150 ».
 */
export const DESCRIPTION_MAX = 150;
