/*
 * 205 — LA PAGE CLIENT PART EN ANGLAIS, POUR TOUS LES COMPTES.
 *
 * Décision de Mehdi du 29/09/2026 : « chaque lien de page client finale doit
 * être en anglais, peu importe l'URL [d'inscription] ; on laisse le choix de la
 * langue dans Ma marque, juste par défaut c'est anglais ».
 *
 * CE QUI L'A MOTIVÉE. Un fournisseur inscrit par `/zh-CN` a créé sa première
 * commande : la page envoyée à son acheteur était en chinois. Deux chemins y
 * menaient, et cette migration ferme celui de la base :
 *
 *   - `default_language` valait `'fr'` par défaut (001, gardé par 144) : toute
 *     boutique qui n'a pas terminé l'accueil servait ses pages en français ;
 *   - l'accueil recopiait la langue de l'INTERFACE du vendeur dans celle de ses
 *     PAGES CLIENT. Ce second chemin est corrigé dans le code
 *     (`bienvenue/actions.ts`), pas ici.
 *
 * L'interface du vendeur (`profiles.locale`) n'est PAS touchée : elle suit le
 * vendeur. Seule la langue de ce que voient ses clients change.
 *
 * ⚠️ LES BOUTIQUES EXISTANTES PASSENT TOUTES EN ANGLAIS, Y COMPRIS CELLES QUI
 * AVAIENT CHOISI UNE AUTRE LANGUE DANS « MA MARQUE ». C'est la demande explicite
 * (« chaque compte déjà créé »), et elle est sans retour : la base ne garde pas
 * la valeur précédente. Au 29/09/2026 la production compte 3 boutiques ; un
 * vendeur qui voulait une autre langue la remet dans « Ma marque ».
 *
 * Aucune page client n'est mise en cache : le changement est visible à la
 * visite suivante, sans redéploiement.
 */

alter table public.shops
  alter column default_language set default 'en';

update public.shops
  set default_language = 'en'
  where default_language <> 'en';
