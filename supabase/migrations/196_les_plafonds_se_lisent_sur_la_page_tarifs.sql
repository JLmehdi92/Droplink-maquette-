-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ LES PLAFONDS SE LISENT SUR LA PAGE TARIFS — deux nombres ouverts à anon  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- La page publique des tarifs (26/09/2026) doit dire le quota À VIE du plan
-- gratuit et le plafond MENSUEL du plan Pro. Elle est servie à un visiteur sans
-- compte, donc par `anon` — qui n'avait pas le droit de lire ces deux nombres
-- (096 et 176 l'en excluaient : « anon ne crée aucune commande »).
--
-- ⚠️ LES ÉCRIRE EN DUR DANS LA PAGE AURAIT ÉTÉ UNE SECONDE SOURCE. Les deux
-- plafonds se règlent dans l'administration, sans une ligne de code ; une page
-- qui recopierait « 15 » et « 300 » les contredirait au premier réglage — sur
-- la page même qui mène à un paiement. Un fait, un point d'émission.
--
-- ⚠️ CE QUI EST OUVERT EST EXACTEMENT DEUX ENTIERS. Les deux fonctions sont sans
-- argument, lisent chacune UNE clé fixe de `system_settings` et rendent un
-- nombre que la page affiche de toute façon. `lire_parametre_entier`, qui prend
-- une clé, reste fermée : ouverte, elle servirait d'oracle sur n'importe quel
-- réglage. Les deux droits sont déclarés dans `tests/rls/catalogue-droits.test.ts`
-- avec cette raison.
--
-- Sans cette migration en production, la page ne casse pas : la lecture échoue,
-- et elle rend ses phrases sans nombre plutôt qu'un nombre inventé.

grant execute on function public.lire_plafond_gratuit_a_vie() to anon;
grant execute on function public.lire_plafond_commandes() to anon;
