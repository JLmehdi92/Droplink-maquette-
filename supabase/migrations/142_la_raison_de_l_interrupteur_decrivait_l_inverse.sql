/*
 * LA RAISON DE `inscriptions_ouvertes` DÉCRIVAIT UN MÉCANISME SUPPRIMÉ, ET
 * DEPUIS LA 141 ELLE DÉCRIT L'INVERSE DU COMPORTEMENT.
 *
 * Texte relevé en base avant cette migration :
 *
 *   « La fermeture agit APRÈS le clic sur le lien magique, jamais à son envoi —
 *     refuser à l'envoi produirait un oracle d'existence de compte, mesuré à
 *     seize fois d'écart de délai sur ce projet. »
 *
 * Deux choses fausses, et la seconde est dangereuse :
 *
 *   1. LE LIEN MAGIQUE N'EXISTE PLUS — supprimé du produit le 01/09/2026,
 *      décision de Wassim. La phrase décrit un geste que personne ne peut plus
 *      faire.
 *
 *   2. LA FERMETURE AGIT MAINTENANT AVANT `signUp`, pas après (migration 141),
 *      et c'est ce qui la rend efficace : lue après, elle laissait naître le
 *      compte qu'elle prétendait empêcher — mesuré, 1 `auth.users`, 1
 *      `profiles`, 1 `shops` pour une inscription refusée à l'écran.
 *
 * ⚠️ CE N'EST PAS DE LA COSMÉTIQUE. C'est le seul endroit du produit où la
 * raison d'un réglage est écrite à côté du réglage lui-même, donc l'endroit qui
 * fait autorité. Quelqu'un qui lit cette phrase et constate le comportement
 * d'aujourd'hui conclut que le produit a un défaut, et le « corrige » en
 * remettant la garde après `signUp` — c'est-à-dire en réintroduisant celui
 * qu'on vient de fermer. Un document qui affirme un état que personne n'a
 * exécuté (L-014), dans sa variante la plus coûteuse : il donne les
 * instructions de la régression.
 *
 * L'ARGUMENT DE L'ORACLE EST CONSERVÉ, PARCE QU'IL RESTE VRAI ET QU'IL COMPTE —
 * mais rendu à son objet. L'écart de délai de seize fois qu'il cite a bien été
 * mesuré, et c'est lui qui a imposé le plancher inconditionnel. Ce que la
 * phrase avait de faux, c'est d'en déduire que la fermeture devait venir après.
 * Le plancher étant inconditionnel, elle peut venir avant sans rien divulguer —
 * et le refus est le même pour toute adresse, existante ou non.
 */

update public.parametres_admis
   set raison =
         'Interrupteur : 0 ferme la création de comptes, 1 la laisse ouverte. '
         'La fermeture est lue AVANT `signUp` (migration 141) : lue après, elle '
         'laissait naître le compte qu''elle refusait à l''écran — mesuré, 1 '
         'auth.users + 1 profiles + 1 shops pour une inscription pourtant '
         'repoussée. Elle ne divulgue rien : le refus est le même pour toute '
         'adresse, et le plancher d''authentification est inconditionnel, donc '
         'le chronomètre ne dit rien non plus. Elle ne ferme QUE l''inscription '
         '— jamais la connexion d''un compte existant.'
 where cle = 'inscriptions_ouvertes';
