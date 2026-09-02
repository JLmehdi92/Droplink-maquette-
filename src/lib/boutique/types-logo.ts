/**
 * LES TYPES DE LOGO ACCEPTÉS — UNE SEULE FOIS, POUR LES DEUX CÔTÉS.
 *
 * ⚠️ DÉFAUT MESURÉ LE 02/09/2026 : l'onboarding proposait au vendeur de choisir
 * un SVG que le serveur refuse. Son sélecteur de fichiers portait
 * `accept="image/png,image/jpeg,image/webp,image/svg+xml"` ; l'écran « Ma
 * marque », lui, n'annonçait que les trois premiers ; et `preparerLogo` rend
 * `{"statut":"erreur","motif":"type"}` sur `image/svg+xml`.
 *
 * Le vendeur choisissait donc un fichier que le sélecteur lui montrait, et se
 * faisait refuser après coup — au PREMIER écran du produit, dans la minute où
 * il le découvre.
 *
 * POURQUOI CE MODULE EXISTE PLUTÔT QU'UNE CONSTANTE RECOPIÉE : la liste qui
 * fait autorité vit dans `lib/boutique/logo`, qui est `server-only` — un
 * composant client ne peut pas l'importer, et c'est bien ainsi. La recopier
 * dans chaque formulaire, c'est ce qui a produit l'écart : deux copies d'une
 * même liste divergent au premier type ajouté ou retiré, et l'une des deux le
 * fait en silence.
 *
 * ⚠️ PAS DE SVG, ET CE N'EST PAS UN OUBLI. Un SVG est un document exécutable :
 * il peut porter un `<script>`, un `<foreignObject>`, une référence externe.
 * Servi depuis notre domaine sur la page d'un vendeur, il s'exécuterait dans
 * son contexte. Tant que l'assainissement que le brief exige n'existe pas, le
 * type reste refusé — et le sélecteur de fichiers doit dire la même chose que
 * le serveur.
 */
export const TYPES_LOGO_ACCEPTES = ["image/png", "image/jpeg", "image/webp"] as const;

/**
 * La valeur de l'attribut `accept` d'un sélecteur de fichiers.
 *
 * Dérivée, jamais écrite à la main : c'est la dérivation qui garantit que le
 * sélecteur ne peut plus proposer un type que le serveur refusera.
 */
export const ACCEPT_LOGO = TYPES_LOGO_ACCEPTES.join(",");
