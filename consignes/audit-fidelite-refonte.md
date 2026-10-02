# Audit de fidélité de la refonte (03/10/2026)

> ## ▶️ ÉTAT AU 02/10/2026, APRÈS LES LOTS 1 À 10 (session cloud)
>
> **Tout ce que ce document listait comme MANQUANT est porté** (§ 1 et § 2), et les trois
> points du § 3 sont tranchés par Mehdi : écrans d'état de `/p` NEUTRES (encre, aucun
> violet — mesuré), barre de progression des articles PORTÉE, badge de plan gardé sur la
> fiche d'UN compte et absent de la liste.
>
> **Deux tours d'audit final** (trois agents en lecture seule chacun) ont suivi :
> - 1er tour : 8 écarts visibles et 29 subtils → corrigés (lots 7 à 9), dont un DÉFAUT GRAVE
>   trouvé en mesurant un « à vérifier » : le visionneur « plein écran » de `/p` tenait dans
>   644 × 425 px (il héritait du `transform` de l'entrée de sa section) ;
> - 2e tour : **aucun écart visible**, des défauts subtils dont plusieurs introduits par le
>   1er tour (focus volé dans le bloc Adresse, suggestion qui poussait un lien sous le
>   pointeur…) → corrigés (lot 10).
>
> **Écarts GARDÉS, volontairement :** thème sombre ; facturation ; témoignages ; titre
> d'onglet neutre sur `/p` et aucun « · DropLink » ailleurs ; « Mouvement aujourd'hui »
> (fuseau) ; pas de lien d'évitement sur le lien mort (cadre de l'aperçu) ; envoi
> automatique au 6e chiffre de la 2FA (quota) ; « Se souvenir de cet appareil » coché ;
> phrase légale à l'inscription seule ; « Mot de passe oublié » sur sa propre page (pas de
> panneau) et son film qui se refond au retour ; aucune sortie animée au « Précédent » du
> navigateur (l'entrée, elle, prend le bon sens) ; ligne ciblée `#REF` liée à l'alerte
> « contestation » encore à trancher ; « Réessayer » sans état en cours.
>
> **Non mesuré dans le conteneur** (à faire au poste, `verification-finale-locale.md`) :
> l'administration au navigateur (aucun compte administrateur utilisable), les vraies
> photos R2, la carte « Suivi par e-mail », les mini-frises avec un vrai colis, Safari.
>
> Le détail de chaque lot, avec ses mesures, est au § 8 de `refonte-design.md`. Ce qui suit
> est l'audit du 03/10, conservé tel quel.

> ## ▶️ CONTRE-AUDIT INDÉPENDANT DU 03/10/2026, SUR `e5ce6bd`
>
> Trois nouveaux agents `ecc:code-explorer`, lecture seule, consigne « ne crois pas la session
> précédente ». `typecheck` 0, `lint` 0 erreur et 1 avertissement préexistant, `test`
> 1 270 / 1 271 (alarme Railway). **Toutes les animations de la maquette sont portées et
> câblées** (landing, films, accès, public, comptes, vendeur, `/p`, admin, états), durées et
> courbes identiques, `prefers-reduced-motion` respecté partout. Il reste :
>
> **Règle dure violée (1)** — `src/app/p/[token]/not-found.tsx:43-47` et `:97` : le logo au
> DÉGRADÉ de marque sur l'écran de lien invalide, qui doit être neutre (décision du 02/10).
>
> **Défauts de comportement**
> - Historique de la fiche : le journal s'écrit par `after()` et n'est relu qu'une fois, 700 ms
>   après la réponse, sans nouvelle tentative → la ligne peut manquer. `historiqueRelu` n'est
>   jamais remis à zéro (`editeur.tsx:208`). Pas d'`aria-live` (`liste-historique.tsx:36`).
>   Aucun test de `relireHistorique`.
> - Filtres, période et recherche en `<form method="get">` : rechargement complet, l'intro v4
>   se rejoue à chaque filtre (`recherche-globale.tsx:64`, `liste-commandes.tsx:94,182`,
>   `tableau-envois.tsx:224`) au lieu de l'estompe sur place.
> - « Copier le lien » d'une ligne : l'état d'échec ne revient jamais au repos
>   (`copier-lien-ligne.tsx:31-33`).
> - Aperçu au survol : l'intention n'est annulée qu'en quittant la LISTE (`apercu-survol.tsx:73-76`)
>   et cinq iframes restent actives masquées (`:101-110`).
> - Second clic pendant la sortie de 110 ms ignoré (`transitions-ecran.tsx:173`) ; `data-sens`
>   posé même sur un clic modifié (`navigation-vendeur.tsx:138-143`) ; `dl-sans-entree` laissé
>   en `sessionStorage` si le geste échoue (`repli-archivage.tsx:33`).
>
> **Écarts à la maquette**
> - `/p` : date estimée « 1 octobre — 2 octobre » au lieu de « 1 au 2 octobre » ; jamais
>   « Aujourd'hui » dans l'historique ; « Propulsé par DropLink » sans son `aria-label`.
> - Commandes : « Ouvrir la page » ouvre un onglet au lieu de la fenêtre téléphone ; bascule du
>   graphique et onglets de Paramètres sans navigation aux flèches (`tablist`) ; recherche
>   d'envois sans frappe en direct ; menus déroulants sans focus sur le premier élément ;
>   cloche sans `aria-expanded`.
> - Admin : pied « X sur N » absent (commandes, comptes, dernière page du journal) ; cartes de
>   Paramètres réorganisées (« Constaté, changé au déploiement » éclatée) ; Boutiques avec
>   colonne « Création » et « Voir » en plus ; double info-bulle (`<title>` + `data-info`,
>   `barres-admin.tsx:56`) ; propriété `carte` morte (`blocage-lien.tsx`, `contestation-lien.tsx`) ;
>   3e alerte « contestation » absente (faute de fonction de comptage : migration).
> - Pages publiques : encart « Le lien ne change jamais tout seul » en alerte au lieu d'info
>   (`docs/page.tsx:295`) ; lien « Signaler un contenu » de Docs disparu, adresse e-mail non
>   cliquable ; « 6 min de lecture » au lieu de « 6 min » ; icône « Éditeur » bâtiment au lieu
>   de maison ; nouveau mot de passe sans le message immédiat « contient votre adresse ».
> - Écarts déjà ARBITRÉS dans le code et à confirmer par Mehdi : trajet du colis sans lieux
>   (« Lyon », « Wissous ») ; film qui repart de zéro entre connexion et mot de passe oublié.

État audité : `34bd810` sur le bac à sable. Trois agents `ecc:code-explorer` ont comparé, en
lecture seule, la maquette (`design/maquette/src/`) au produit (`src/`), zone par zone. Ils
n'ont rien mesuré au navigateur : tout vient du code et des CSS. Contrôles relancés à part :
`typecheck` 0 erreur, `lint` 0 erreur et 2 avertissements (un nouveau :
`admin/comptes/page.tsx:121`, `suspendu` inutilisé), `test` 1 268 / 1 269 (seule l'alarme
Railway échoue). Exclusions voulues vérifiées dans le code : pas de témoignages, pas de
Vinted/eBay, pas de thème sombre, pas de flou sur `/p`.

**Verdict : la STRUCTURE et le CSS sont portés presque partout (le CSS de mouvement est un
portage quasi littéral). Ce qui manque, c'est surtout le MOUVEMENT que la maquette pilote en
JavaScript** — les règles CSS existent, mais les scripts qui posent les classes ne sont pas
montés.

## 1. Les causes communes (corriger une fois, plusieurs écrans en profitent)

1. **`CoucheV4` et `ScriptEntreeV4` ne sont montés que dans `(app)` et `admin`.** Les pages
   d'accès (connexion, inscription, vérification, nouveau mot de passe) et les pages
   publiques n'ont donc ni entrée de page (`v4-entree`), ni bordure lumineuse au pointeur.
2. **`public.js` n'est pas porté.** Sur tarifs, docs, blog, articles, légal et signalement,
   `.js` n'est jamais posé : pas de titre révélé ligne à ligne (`l4-ligne`), pas de cascade
   `data-entree`, pas de `data-anime → est-vu`, et les croix du tableau de tarifs sont mal
   posées (`--tp-croix` jamais calculé).
3. **Les sorties ne sont jamais animées** : fondu de sortie entre écrans (110 ms), fondu
   0,35 de la table quand un filtre ou un tri change, sortie des dialogues admin (`.sort`),
   de la feuille d'historique et du visionneur de `/p`.
4. **`changer()` / `redessiner()` (analytique.js) ne sont pas portés** : pas de fondu flouté
   des chiffres ni de redessin de la courbe au changement de période.
5. **`.secoue` n'est jamais appliquée** (connexion, inscription, vérification, nouveau mot de
   passe, bienvenue, dialogues admin).

## 2. MANQUANT, écran par écran

**Landing** — l'icône du sceau QC ne passe pas en bulle au refus (`animations-landing.tsx`
l. 658-667). Tout le reste est porté (≈ 43 éléments, mêmes durées et courbes).

**Connexion / inscription** — entrée de page ; bordure lumineuse du formulaire ; transition
sans rechargement entre connexion et inscription (fondu des films, adresse recopiée : le CSS
`acces-sort`/`acces-entre`/`est-entrant` est porté mais rien ne le déclenche) ; secousse ;
panneau « mot de passe oublié » animé (le produit va sur une route, écart déclaré). Les deux
FILMS sont portés intégralement (actes, durées, zooms, fouet, 3D, mode léger, mouvement réduit).

**Coque vendeur** — fondu de sortie entre écrans. Tiroir, pastille qui glisse, cloche,
menus, rouleaux : portés.

**Tableau de bord / Analyses** — fondu des chiffres et redessin de la courbe au changement
de période ; rouleau du taux de validation (Analyses).

**Commandes** — remplissage animé des frises au premier affichage ; repli d'une ligne
archivée (`.est-partie`) ; fondu de la table.

**Suivi d'envois** — entrée des mini-frises ; fondu de la table.

**Ma marque** — retour d'erreur à la saisie (couleur, lien, réseaux) et focus sur le premier
champ fautif ; animation du statut « Enregistré. » ; lien « Voir la page client » ; le badge
« Contraste conforme » reste affiché même quand le code n'est pas une couleur valide.

**Paramètres** — fondu du panneau au changement d'onglet ; boutons « Enregistrer » (nom) et
« Changer le mot de passe » toujours actifs, alors que la maquette les désactive tant que
rien n'a changé ; initiales de l'avatar figées pendant la saisie ; révélations animées
(confirmation d'adresse, suppression, étapes 2FA) ; disparition animée des sessions.

**Fiche commande** — ⚠️ **l'historique ne se met pas à jour après une sauvegarde** (composant
serveur jamais relu : défaut de COMPORTEMENT, pas seulement de mouvement) ; focus auto sur
« Nom du client » pour une commande neuve ; entrée des nouvelles vignettes ; réapparition
floutée du jeton après révocation.

**Page client `/p`** — camion qui glisse (1 100 ms) ; cascade d'entrée de 45 ms (`--i`
jamais posé : tout entre en même temps) ; pastille numérotée des photos ; compteur du
carrousel « 1 / 4 » (le produit affiche le total seul, aussi au bureau) ; glisser pour
fermer la feuille d'historique ; sorties animées de la feuille et du visionneur ;
animations du visionneur (entrée, glissement entre photos) ; fondu des étapes de la
validation QC ; lien « Retour à l'accueil » de la page de lien invalide ; le lien « Comment
fonctionne DropLink » de cette page mène à `/fr` au lieu de `/fr/docs`.

**Pages publiques** — tout le § 1.2 ; barre de progression de lecture des articles (écartée
volontairement : à trancher) ; suivi de lecture du sommaire des pages légales ; validation
en place et animation du bloc « prêt » du signalement ; « Copié » qui ne revient pas à
« Copier le message » ; **ordre des articles du blog** différent (l'article « à la une »
n'est pas celui de la maquette) et petites différences de titres.

**Comptes** — vérification : secousse, cases vertes `est-valide` avant la redirection,
focus de la première case ; nouveau mot de passe : secousse, `aria-live`, focus ;
notification : fondu de changement d'état et titre de page par état.

**Administration** — sortie des dialogues ; message « motif trop court » (le produit
désactive le bouton à la place) ; rouleaux des tuiles ; enregistrement d'un réglage qui dit
« fait » au lieu de « Enregistré. 300 → 400, écrit au journal ».

**États** — portés. Seul écart : « Réessayer » sans état « en cours » (assumé).

## 3. Points à trancher (Mehdi)

- `/p` lien invalide et erreur : le bloc `.etat-p` utilise le violet DropLink en aplat. Le
  jeton est inconnu, donc ce n'est pas la page d'un vendeur, mais la règle 3 de `CLAUDE.md`
  dit « jamais de couleur DropLink sur `/p` ».
- `client.css` contient des `#FFFFFF` en dur, sur des fonds de carte et non sur du texte posé
  sur l'aplat du vendeur : la règle 1 tient, la lettre « jamais de #fff » non.
- La fiche de compte admin affiche un badge de plan : à rapprocher de « aucun badge Pro ».
- La barre de progression des articles : la porter, ou la garder écartée.
