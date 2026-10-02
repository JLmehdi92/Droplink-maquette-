> **Inventaire produit contre maquette, écrit le 01/10/2026 par un agent `ecc:code-explorer`
> en lecture seule**, sur le dépôt au commit `43ec195` et la maquette `design/maquette/`.
> Repris mot pour mot. Rien n'y a été exécuté : aucun rendu, aucune mesure.
>
> ⚠️ **À lire avec trois corrections**, vérifiées après coup :
> - **Le gratuit est à 5 commandes et 5 colis à vie** (migration 210, en-tête de `CLAUDE.md`).
>   Là où l'inventaire dit « 15 », il a lu un passage HISTORIQUE de `CLAUDE.md`.
> - **Le thème sombre ne se porte pas** (décidé : `consignes/refonte-design.md` § 3).
> - **Les témoignages et « +2 500 vendeurs » quittent la landing** (décidé, même endroit).
>
> Les « décisions à prendre » listées ici sont regroupées et suivies dans
> `consignes/refonte-design.md` § 5.

# Inventaire des écrans d'accès : produit (43ec195) contre maquette (design/maquette/src)

Lecture seule, aucun fichier modifié. Tout ce qui suit a été lu dans le code. Rien n'a été exécuté : ni navigateur, ni mesure de poids, ni tests.

Pour la maquette, `design/maquette/dist` n'est pas versionné. Les `.html` de `src/` contiennent des marqueurs que `design/maquette/outils/construire.mjs` (l. 19-30, 86-89) remplace : `<!--CHAMP_EMAIL-->`, `<!--BOUTON:libellé:encours-->`, `<!--GOOGLE:avant|apres-->`, `<!--PAGE_CLIENT-->`.

## Constats transversaux

### Les 8 points à trancher avant d'implémenter

1. **Le film est une nouvelle surface JS.** Il remplace la colonne `ArgumentAcces` (3 atouts) du produit, qui est du pur serveur et sans JS. Voir « Le film » plus bas.
2. **Les noms de champs et les identifiants divergent.** La maquette utilise `mdp` (produit : `motDePasse`) et `type` (produit : `typeDeCompte`). Elle a `autocomplete="email"` (produit : `username`). Le champ du nom de boutique n'a pas de `name` (produit : `nom`). Les cases du code 2FA n'ont pas de `name` (produit : `code`). Le contrat formulaire↔action est inventorié par `tests/unit/formulaires-et-actions.test.ts`.
3. **La maquette valide côté client**, par champ et au blur, puis `preventDefault`. Le produit est en `noValidate`, sans validation client : le serveur est la seule vérité (Zod + plancher de 1 200 ms + quotas). Si on porte la validation client, elle reste un confort, et il ne faut jamais sauter l'action.
4. **Les erreurs globales n'ont pas de place dans la maquette.** `data-statut` (`role=status`) est présent dans les formulaires mais `acces.js` n'y écrit jamais. Les bandeaux `?erreur=` (10 motifs) et `?info=` (3 infos) de la connexion n'existent pas dans la maquette. Les erreurs serveur « identifiants », « trop de tentatives » et « indisponible » n'y existent pas non plus.
5. **Texte légal ajouté partout.** La maquette pose `acces__legal` (« En continuant, vous acceptez nos conditions… ») sur connexion, nouveau mot de passe et vérification. Le produit l'a retiré exprès de la connexion (`connexion/page.tsx` l. 259-266 : « se reconnecter n'accepte rien de nouveau ») et du mot de passe oublié (`mot-de-passe-oublie/page.tsx` l. 24-25). C'est un choix à confirmer, pas un détail de style.
6. **Chiffre faux dans la maquette.** `inscription.html` l. 54 dit « 5 commandes offertes ». Le produit est à **15 commandes à vie** en gratuit (CLAUDE.md, migrations 175-176). Cette chaîne n'existe pas dans `messages/*.json`, et la valeur doit venir du plafond configurable (`plafond_commandes_mensuel` et équivalent), pas d'un littéral.
7. **Thème sombre.** La maquette lit `localStorage["dl-theme"]` (`acces.js` l. 12, `compte.js` l. 13) et a des règles `prefers-color-scheme: dark` et `[data-theme]` dans le CSS. `grep` ne trouve aucune occurrence de `data-theme` ni `dl-theme` dans `src/`. C'est une fonctionnalité nouvelle, pas un habillage.
8. **Aucun i18n dans la maquette.** Elle est en `lang="fr"` uniquement, avec des libellés ARIA et du texte du film en dur. La maquette n'embarque que `inter-latin` et `inter-latin-ext`. Le zh-CN exige les règles de CLAUDE.md : polices Noto Sans SC / PingFang SC / Microsoft YaHei et `letter-spacing: 0`.

### Risques de sécurité et de structure

- **Chaînes déjà en dur dans le produit (hors périmètre de la maquette).** `src/components/acces-champs.tsx` l. 160 : `aria-label={devoile ? "Masquer le mot de passe" : "Afficher le mot de passe"}` est en français, sans i18n. La maquette fait pareil (`acces.js` l. 79). À corriger au passage, avec 3 langues.
- **`<form>` interdit dans un `<p>`.** Dans `verification.html` l. 41, la maquette écrit `<p class="acces__bascule">Ce n'est pas votre compte ? <a href="connexion.html">Se déconnecter</a></p>`. Le produit a un `<form method=post action=/{langue}/deconnexion>` (`BoutonDeconnexion variante="lien"`). Il faut un `<div>` (`verification/page.tsx` l. 108-116 documente l'erreur React #418).
- **Google doit rester un `<form>` POST vers la Server Action `partirVersGoogle`.** Elle porte la garde `fournisseurActif("google")` et le quota. La maquette met un `<a href=".../connexion">` (`construire.mjs` l. 27), sans condition d'affichage.
- **Séparateur Google.** La connexion du produit affiche « ou continuer avec » (`ouAvec`) avant Google. La maquette affiche « ou » dans les deux sens. Si `ouAvec` n'est plus utilisée, la garde des chaînes mortes rougira.
- **Le film et le navigateur.** Il ne se construit qu'à `min-width: 1021px` ; le produit bascule en `lg` (1024). Il lit `navigator.connection.saveData` et `deviceMemory` (l. 28), `pointermove` (l. 459) et `IntersectionObserver`. Il est donc client-only : un composant `"use client"` monté en effet, ou un `<script defer>` statique dans `public/`.
- **Pas de lien d'évitement dans le produit.** La maquette ajoute `<a class="evitement" href="#contenu">Aller au contenu</a>` sur toutes ses pages. Le produit pose bien `id="contenu"` sur `<main>`, mais aucune occurrence de ce texte dans `src/`. À créer en FR/EN/zh-CN.

### Le film (`design/maquette/src/film.js`, 493 lignes ; poids en octets non mesuré)

- **Fonctionnement.** Il se monte avec `window.DropLinkFilm.monter(hote)` sur `[data-film]`. Deux scénarios : `"absence"` (connexion, mot de passe oublié, nouveau mot de passe, vérification ; DUREE 15,4 s, POSE 6,9, l. 124-125) et `"minute"` (inscription ; DUREE 17, POSE 10,6, l. 274-275).
- **Reduced-motion : géré.** `reduit` → une seule image fixe (`renderAt(POSE, 0)` après `document.fonts.ready`), pas de boucle (l. 445). `acces.js` coupe aussi les animations (`secouer`, `occupe` à 200 ms, bascule sans délai, l. 10, 53, 54).
- **Coût.** Boucle `requestAnimationFrame` uniquement quand l'hôte est visible et l'onglet actif (l. 465). Mode « léger » (sans flou) si `saveData`, si `deviceMemory <= 2`, ou si plus de 15 images sur 60 dépassent 24 ms (l. 466-472). Le grain est désactivé (`transparent = true`, l. 99) mais le `<canvas>` est quand même créé. Ce coût n'est pas mesuré.
- **Texte en dur et factice.** Ligne l. 128-151 : « Pendant votre absence », « Pris en charge par La Poste », « Wissous », « 29 sept. », « Lien consulté », « Photos validées »… Le tout est dans un `<aside aria-hidden>`, mais visible. Il faudrait le passer dans `next-intl` (dates comprises).
- **Dépendance cachée.** Les photos du film viennent du `<template data-pc>` (`.pc__grille img`, l. 93), qui est une copie de `page-client.html`. Assets : `assets/img/apercu-*.jpg` et le logo, lu via `.acces__logo img` (l. 151).
- **CSP (`next.config.ts` l. 91-112).**
  - `script-src 'self' 'unsafe-inline'`, `style-src 'self' 'unsafe-inline'` : OK pour un script servi par le site, pour `innerHTML` avec attributs `style` et pour `el.style[...]`.
  - `img-src 'self' data: blob:` : OK si les assets passent par `public/`.
  - `font-src 'self'` : OK avec `next/font`.
  - `connect-src 'self'` : OK pour le `fetch` du prefetch de `acces.js`.
  - Je n'ai trouvé ni `eval`, ni `new Function`, ni URL externe dans `film.js` (recherche faite).
  - À vérifier avec la sonde CSP du dépôt. Je ne l'ai pas lancée, et la CSP n'est servie qu'en `NODE_ENV=production`.
- **Transition connexion⇄inscription (`acces.js` l. 176-261).**
  - `fetch` de l'autre page HTML + `DOMParser`, remplacement de `.acces__corps` et `.acces__legal`, `history.pushState`, `popstate`.
  - Préchargement au survol / focus / touchstart / `requestIdleCallback`.
  - L'adresse déjà saisie suit d'un écran à l'autre.
  - Le film sortant s'arrête et s'efface ; l'entrant se monte 260 ms plus tard.
  - Focus reporté sur le `<h1 tabindex=-1>`.
  - En Next, ce `fetch` + `DOMParser` n'a pas de sens : il faut un layout partagé (route group sous `[locale]`, qui n'ajoute rien à l'URL) portant la coque et le film, et le routeur Next pour la transition.
  - Attention : `connexion/page.tsx` est dynamique (`searchParams`) et `inscription/page.tsx` est `force-dynamic` (l. 68). Les deux font `redirect` si une session est ouverte (`entreeDejaOuverte`).

---

## connexion

### 1. Fichiers du produit

- Route : `/home/user/droplink2/src/app/[locale]/connexion/page.tsx` (page, métadonnées `noindex`, `generateStaticParams`).
- Actions : `.../connexion/actions.ts`, qui porte `seConnecter`, `sInscrire`, `demanderReinitialisation` et `partirVersGoogle`. Tout l'accès passe par ce seul fichier.
- Composants :
  - `src/components/formulaire-connexion.tsx`
  - `src/components/acces-champs.tsx` (`ChampAcces`, `BoutonPrincipalDs`, `MessageErreurDs`)
  - `src/components/bouton-google.tsx`
  - `src/components/acces/coque-acces.tsx` (`FondAcces`, `LogoMarque`, `NoteSecurite`, `ArgumentAcces`)
  - `src/components/traductions-client.tsx`
- Libs : `lib/comptes/apres-session.ts`, `lib/auth/{plancher,fournisseurs,mot-de-passe,fuites,appareil-fiable}.ts`, `lib/limitation/quota.ts`, `lib/email/domaines.ts`, `lib/site.ts`.
- Retour et déconnexion : `src/app/[locale]/auth/retour/route.ts` (non lue en détail), POST `/{langue}/deconnexion`.
- Tests : `tests/unit/motifs-connexion.test.ts` (inventaire des motifs, deux sens), `tests/unit/formulaires-et-actions.test.ts`.

### 2. Règles et validations réelles

- **Zod (`actions.ts` l. 76-84).** `Identifiants` : `locale` (SchemaLangue), `email` trim 3-254 + `.email()`, `motDePasse` min 1 / max 1024. Aucune longueur minimale à la connexion (voulu).
- **Entrée invalide.** Une analyse qui échoue rend `email_invalide`. Un `FormData` absent rend `indisponible`.
- **Quota.** `verifierQuotaMotDePasse(email)` est consommé avant l'appel ; refus → `trop_de_tentatives`.
- **Plancher.** `attendrePlancher(debut)` (1 200 ms) s'applique à toutes les sorties, succès compris ; il est attendu juste après `signInWithPassword` (l. 175).
- **Erreurs.** `error.status === 429` → `trop_de_tentatives`, sinon `identifiants`. Le message est le même pour adresse inconnue, mot de passe faux et compte non confirmé.
- **Après succès.** `confirmerAppareilSiPresent` (appareil fiable, 203), puis `suivreApresSession` (`apres-session.ts` l. 92-191) :
  - 2FA requise → `/{l}/verification` ;
  - profil nul → `?erreur=profil` ;
  - suspendu → `?erreur=suspendu` ;
  - onboarding à faire → `/bienvenue` (après avoir réclamé l'événement d'inscription et émis `INSCRIPTION` une seule fois) ;
  - sinon `/commandes`.
  - `redirect()` est hors de tout `try`.
- **Session déjà ouverte.** `entreeDejaOuverte` (`apres-session.ts` l. 331-342) redirige vers `/verification` ou `/commandes`. Une panne `SessionIndisponible` rend le formulaire.
- **Suggestion d'adresse.** Locale, via `suggererCorrection` (`lib/email/domaines.ts`), mémoïsée sur chaque frappe. Elle suggère et ne corrige jamais d'office (le bouton appelle `setEmail`).
- **Google.** `fournisseurActif("google")` (variable `AUTH_GOOGLE_ACTIF`), lu côté serveur, rien n'est rendu sinon. L'action revérifie ce drapeau, puis `verifierQuotaAuthAdresse`, puis `origineDuSite` (null → `?erreur=indisponible`), puis `signInWithOAuth` avec `skipBrowserRedirect` et `redirectTo=…/auth/retour`.

### 3. Liste à cocher de ce que l'écran fait

- [ ] Métadonnées : titre `connexion.titre`, `robots: noindex,nofollow`.
- [ ] `FondAcces` : dégradé fixe `aria-hidden` et 4 formes radiales, sans animation.
- [ ] En-tête : logo → `/{locale}`, `min-h-11` même si l'image ne charge pas. Texte « Pas encore de compte ? » (≥ sm) + pilule « Créer un compte » → `/{locale}/inscription`.
- [ ] Colonne de gauche `ArgumentAcces` (cachée sous `lg`) : titre en `<p>` (le `<h1>` est celui de la carte), 3 atouts, aucune preuve sociale.
- [ ] Carte : logo, `<h1>` `connexion.titre`, sous-titre.
- [ ] Bandeau d'erreur `role="alert"` pour `?erreur=` ∈ {`lien`, `expire`, `profil`, `session`, `suspendu`, `indisponible`, `service`, `trop`, `fermees`, `confirmez`} (inventaire clos `MOTIFS`, l. 60-88). Un motif inconnu n'affiche rien.
- [ ] Bandeau neutre `role="status"` pour `?info=` ∈ {`deconnecte`, `deconnexion-partielle`, `compte-supprime`} (l. 102).
- [ ] Champ e-mail (`id="email"`, `name="email"`, `type=email`, `inputMode=email`, `autoComplete="username"`, contrôlé) avec icône `Mail`.
- [ ] Champ mot de passe (`id="motDePasse"`, `name="motDePasse"`, `autoComplete="current-password"`) avec icône `Lock` et bouton œil (afficher/masquer, cible 44 px par pseudo-élément).
- [ ] Lien « Mot de passe oublié ? » sur la ligne du libellé → `/{locale}/mot-de-passe-oublie`, zone tactile 44 px par `::after`.
- [ ] Suggestion « Vouliez-vous dire … ? » (`aria-live="polite"`, bouton qui remplace l'adresse).
- [ ] Message d'erreur `role="alert"` `id="erreur-connexion"` : `email_invalide` / `trop_de_tentatives` / `indisponible` / `identifiants`. `aria-invalid` + `aria-describedby` sur les deux champs.
- [ ] Bouton principal au dégradé : désactivé pendant l'envoi (`useFormStatus`), anneau à la place de la flèche, libellé « Connexion… ».
- [ ] Séparateur « ou continuer avec » + bouton Google (SVG local, 52 px) : seulement si `AUTH_GOOGLE_ACTIF` est posé.
- [ ] Phrase « Pas encore de compte ? Créer un compte » en bas de carte.
- [ ] `NoteSecurite` (« Vos données sont sécurisées et confidentielles. »).
- [ ] Pied : « Documentation · © année » (lien `/docs`, cible 44 px sous `lg`).
- [ ] Redirections côté serveur : session ouverte, 2FA, onboarding.
- [ ] Hors écran : plancher de 1 200 ms et quotas.

### 4. Écarts avec la maquette (`connexion.html`)

**(a) Produit sans équivalent dans la maquette**
- Bandeaux `?erreur=` et `?info=`.
- Messages d'erreur serveur : identifiants, trop de tentatives, indisponible.
- État d'envoi lié au serveur (`useFormStatus`). La maquette simule 900 ms, puis `location.href="tableau.html"`.
- Pilule « Créer un compte » en haut à droite et texte « Pas encore de compte ? » en en-tête. La maquette n'a que le lien du bas.
- `NoteSecurite`, pied « Documentation · © » et `FondAcces`.
- Séparateur « ou continuer avec » : la maquette met « ou ».
- Google conditionné, quota, et `autoComplete="username"`.
- Colonne `ArgumentAcces` : remplacée par le film.
- `?erreur=` : les textes `motif.*` font référence à un « nouveau lien ci-dessous » (pré-existant).

**(b) Maquette sans équivalent dans le produit**
- *Design / mouvement, à porter :*
  - mise en page deux colonnes (formulaire + panneau film sticky, 28 px de rayon, masqué sous 1021 px) ;
  - le film `"absence"` ;
  - la transition connexion⇄inscription ;
  - le secouement du champ en erreur (`secoue`, 360 ms) ;
  - le bouton œil avec `aria-pressed` ;
  - le panneau « mot de passe oublié » commuté en place avec animation `sort`/`entre`, `#oubli` / `#connexion` via `history.replaceState`, l'adresse reportée d'un panneau à l'autre, et le focus sur le `<h1>`.
- *Fonctionnalité nouvelle, à signaler :*
  - validation client au blur et à l'envoi, avec un nouveau message « Saisissez votre mot de passe. » ;
  - la suggestion d'adresse au `blur` (le produit la calcule à chaque frappe) ;
  - le thème sombre ;
  - le lien d'évitement ;
  - le préchargement de l'autre page.

**(c) Textes**
- Repris tels quels, déjà dans `messages` (fr, en, zh-CN supposés, non relus) : titre « Bon retour », sous-titre, libellés, placeholders, « Mot de passe oublié ? », « Se connecter / Connexion… », « Pas encore de compte ? », « Créer un compte », « Continuer avec Google », `suggestionPrefixe/Suffixe`, `cgvAvant/cgvEt/cgvConditions/cgvConfidentialite`, `erreurEmailInvalide`.
- À créer en FR/EN/zh-CN : « Saisissez votre mot de passe. » ; libellés ARIA « Afficher le mot de passe » / « Masquer le mot de passe » (en dur aujourd'hui) ; « Aller au contenu » ; « Revenir à la connexion » existe (`motDePasse.retourConnexion`).

### 5. Risques précis

- **CSP.** Voir plus haut. `form-action 'self'` s'applique au POST de Google ; comportement existant, non modifié par la maquette.
- **Film.** Voir plus haut, sous « Le film ».
- **`prefers-reduced-motion`.** La maquette le gère (film figé, délais courts), alors que le produit n'a aucune animation sur cet écran. Le bouton pending et l'anneau sont du CSS pur.
- **Sécurité.**
  - Ne pas ajouter de validation client qui dise quoi que ce soit sur l'existence d'un compte.
  - Ne pas retirer le plancher ni les quotas.
  - Conserver `noValidate` + Zod côté serveur.
  - Si le panneau `#oubli` devient une vue de la même page, `demanderReinitialisation` doit rester la même action. Dans ce cas la route `/mot-de-passe-oublie` doit être conservée ou redirigée (liens existants éventuels : non vérifié).

---

## inscription

### 1. Fichiers du produit

- Route : `src/app/[locale]/inscription/page.tsx` (`export const dynamic = "force-dynamic"`, l. 68, pour lire `AUTH_GOOGLE_ACTIF` au runtime).
- Action : `sInscrire` dans `connexion/actions.ts` l. 214-418.
- Composants : `formulaire-inscription.tsx`, `acces-champs.tsx`, `bouton-google.tsx`, `coque-acces.tsx` (`ArgumentAcces variante="inscription"`, qui embarque `MaquetteApplication` de la landing, mise à l'échelle 0,509).
- Lib : `lib/auth/mot-de-passe.ts`.

### 2. Règles et validations réelles

- **Zod `Inscription` (l. 86-90).** `email` 3-254 + `.email()`, `motDePasse` = `MotDePasse` : min 12 caractères (`LONGUEUR_MINIMALE`), max **72 octets** (`OCTETS_MAXIMUM`, bcrypt), sans trim.
- **Refus nommés.**
  - `email_invalide` ;
  - `mdp_trop_court` ;
  - `mdp_trop_long` ;
  - `mdp_contient_email` : partie locale de ≥ 4 caractères trouvée dans le mot de passe, comparaison insensible à la casse ;
  - `mdp_fuite` : `verifierFuite`, appelée après le quota ;
  - `deja_inscrit` : code `user_already_exists` ou texte `already registered|exists`.
- **Quota.** `verifierQuotaAuth(email)` (6 par heure et par adresse, 30 par IP, d'après les commentaires) ; refus → `trop_de_tentatives`.
- **Interrupteur d'inscription.** `rpc("lire_inscriptions_ouvertes")` lu avant `signUp`. `false` → `redirect(?erreur=fermees)`. Lecture en erreur → on laisse entrer.
- **`signUp`.** Avec `emailRedirectTo=${origine}/${locale}/auth/retour`. `origineDuSite()` null → `indisponible`.
- **Erreur 429.** → `redirect(?erreur=confirmez)`, pour ne pas faire d'oracle.
- **Pas de session** (confirmation d'e-mail active) → `?erreur=confirmez`.
- **Session présente** → `suivreApresSession` → `/bienvenue`.
- **Plancher.** 1 200 ms après `signUp`, et sur les sorties qui précèdent.

### 3. Liste à cocher

- [ ] Redirection si session déjà ouverte.
- [ ] Colonne gauche (≥ `lg`) : logo 52 px, `ArgumentAcces` variante inscription (badge, titre 52/36 px, accroche, 3 atouts dont le premier est « Rapide à mettre en place », aperçu `MaquetteApplication`).
- [ ] Carte 620 px : « Déjà un compte ? Se connecter » à droite en haut (lien → `/connexion`).
- [ ] Logo, `<h1>` « Créer un compte », sous-titre.
- [ ] Google en premier (si actif), puis séparateur « ou ».
- [ ] E-mail : `id="email-inscription"`, `autoComplete="username"`, suggestion.
- [ ] Mot de passe : `id="motDePasse-inscription"`, `autoComplete="new-password"`, œil.
- [ ] Aide permanente « 12 caractères minimum… » (`id="aide-mot-de-passe"`, reliée par `aria-describedby`).
- [ ] Message d'erreur nommé (`role="alert"`, `id="erreur-inscription"`). `aria-invalid` par champ (e-mail pour `email_invalide` / `deja_inscrit` ; mot de passe pour les 4 refus de mot de passe).
- [ ] Bouton 60 px, « Créer mon compte » / « Création… » + anneau.
- [ ] Phrase de consentement avec liens → `/conditions` et `/confidentialite` (rendue sur toutes les largeurs).
- [ ] `NoteSecurite`.
- [ ] Pas de footer « Docs · © » et pas de pilule d'en-tête.
- [ ] Hors écran : redirections `?erreur=fermees` / `confirmez`, événement `INSCRIPTION` compté une fois.

### 4. Écarts avec la maquette (`inscription.html`)

**(a) Produit sans équivalent dans la maquette**
- Erreurs serveur : `mdp_trop_long`, `mdp_fuite`, `deja_inscrit`, `trop_de_tentatives`, `indisponible`.
- Badge, accroche et aperçu `MaquetteApplication` : remplacés par le film `"minute"`.
- `autoComplete="username"` sur l'e-mail.
- Google conditionnel (la maquette met toujours le bouton).
- Redirections serveur et plancher.

**(b) Maquette sans équivalent dans le produit**
- *Design / mouvement :*
  - `data-film="minute"` ;
  - jauge de progression `jauge-mdp` (`--remplie` = n/12, classe `est-ok`) ;
  - la transition connexion⇄inscription (déjà décrite) ;
  - secouement.
- *Fonctionnalité nouvelle, à signaler :*
  - **compteur « n / 12 caractères minimum »** : comptage en points de code (`[...value].length`), alors que le serveur compte en unités UTF-16 pour le minimum (`z.string().min(12)`) et en **octets** pour le maximum. Les deux peuvent diverger sur emoji ou accents ;
  - **avertissement « contient votre adresse » au blur**, côté client ;
  - **liste de 3 garanties** : « 5 commandes offertes » (**faux : 15 à vie**, valeur à dériver du plafond), « Sans carte bancaire », « Aucun compte pour votre client » ;
  - `minlength="12"` sur le champ ;
  - la maquette ne prévoit ni message de mot de passe trop long, ni de fuite.

**(c) Textes**
- Repris : « Créer votre compte » (la maquette dit « Créer votre compte » alors que le produit dit « Créer un compte » : à trancher), « Commencez gratuitement. Votre premier lien de suivi part juste après. » (le produit : « Commencez gratuitement et en moins d'une minute. » : textes différents), « Mot de passe », « Une phrase, plutôt qu'un mot » (placeholder à créer : le produit n'en a pas), « Créer mon compte / Création… », « Déjà un compte ? Se connecter », « Prenez plutôt une phrase qu'un mot compliqué. ».
- À créer : « n / 12 caractères minimum » (variable `n`), les 3 garanties, « Aller au contenu », le placeholder mot de passe de l'inscription.

### 5. Risques précis

- Le jauge et le compteur ne doivent pas affirmer plus que le serveur : seuls 12 caractères sont exigés ; le maximum de 72 octets et la fuite ne s'affichent qu'après réponse.
- La phrase de consentement sans case à cocher est une décision produit (`inscription/page.tsx` l. 159-163). La maquette n'introduit pas de case.
- Google doit rester un `<form>` POST.
- Même risques CSP et film que plus haut.

---

## mot-de-passe-oublie (panneau `#oubli` de `connexion.html`)

### 1. Fichiers du produit

- Route : `src/app/[locale]/mot-de-passe-oublie/page.tsx`.
- Coque : `src/components/acces/coque-acces-simple.tsx` (`CoqueAccesSimple` : logo seul en en-tête, carte 520 px, icône `Mail` de 64 px).
- Formulaire : `src/components/formulaire-mot-de-passe-oublie.tsx`.
- Action : `demanderReinitialisation` dans `connexion/actions.ts` l. 432-502.

### 2. Règles et validations réelles

- **Zod `Adresse` (l. 92-95).** `email` seul.
- **Quota.** `verifierQuotaAuth(email)` : échec → `trop_de_tentatives` (le seul refus qui peut être dit).
- **Origine.** `origineDuSite` null → même réponse que le succès (`envoye`).
- **Appel.** `resetPasswordForEmail` avec `redirectTo=${origine}/${locale}/auth/retour?suite=mot-de-passe`.
- **Réponse unique.** Toute erreur d'envoi (429 compris) est journalisée et renvoie `envoye`, pour ne pas faire d'oracle. Plancher 1 200 ms.
- **Pas de Google, pas de consentement** (`mot-de-passe-oublie/page.tsx` l. 19-25).

### 3. Liste à cocher

- [ ] Coque : fond, logo seul (→ `/{locale}`), colonne `ArgumentAcces`, carte avec icône `Mail`, `<h1>` « Mot de passe oublié », sous-titre.
- [ ] Champ e-mail (`id="email-oubli"`, suggestion `aria-live`).
- [ ] Erreurs : `email_invalide`, `trop_de_tentatives` (`role="alert"`).
- [ ] Bouton « Envoyer le lien » / « Envoi… ».
- [ ] État de succès (`role="status"`) : icône `MailCheck`, titre « Regardez votre boîte mail », texte avec « Si un compte existe… ».
- [ ] **Pas de bouton « Renvoyer »** (décision documentée dans le composant : il épuiserait les 6 envois par heure).
- [ ] Lien « Revenir à la connexion » → `/{locale}/connexion` (cible 44 px sous `lg`).
- [ ] `NoteSecurite` et pied de docs (via la coque).

### 4. Écarts avec la maquette

**(a) Produit sans équivalent dans la maquette**
- Page dédiée avec sa propre route.
- Erreurs serveur et réponse unique.
- Suggestion d'adresse en direct.
- `NoteSecurite`, pied docs.

**(b) Maquette sans équivalent dans le produit**
- *Design / mouvement :* panneau commuté en place (animation `sort` 190 ms puis `entre`), état de succès avec focus déplacé sur le `<h2 tabindex=-1>` (le produit ne déplace pas le focus), l'adresse déjà tapée suit, `#oubli` dans l'URL, film partagé `"absence"`.
- *Fonctionnalité nouvelle :* aucune, hormis l'adresse recopiée d'un panneau à l'autre. Elle suppose que le formulaire de connexion et celui d'oubli cohabitent dans la même vue.

**(c) Textes** : tous déjà dans `motDePasse.*` (`oublieTitre`, `oublieSousTitre`, `bouton`, `boutonEnCours`, `envoyeTitre`, `envoyeTexte`, `retourConnexion`). Rien à créer. Les textes de la maquette sont identiques à ceux du produit.

### 5. Risques précis

- **Faille à ne pas créer.** Ne pas distinguer « adresse inconnue » de « envoyé » à l'écran, et ne pas ajouter de « Renvoyer ».
- **Incohérence existante, hors maquette.** `connexion.motif.lien` et `.expire` disent « demandez-en un nouveau ci-dessous » alors que la page de connexion n'a aucun formulaire de demande, juste un lien. Le panneau `#oubli` de la maquette résoudrait cette incohérence si la phrase est conservée.

---

## nouveau-mot-de-passe

### 1. Fichiers du produit

- Route : `src/app/[locale]/nouveau-mot-de-passe/page.tsx`.
- Action : `.../nouveau-mot-de-passe/actions.ts` (`changerMotDePasse`).
- Composant : `src/components/formulaire-nouveau-mot-de-passe.tsx`.
- Coque : `coque-acces-simple.tsx`.
- Libs : `lib/auth/recuperation.ts` (`sessionParEmail`), `lib/comptes/profil.ts` (`lireProfilVendeur`), `lib/comptes/apres-session.ts`.
- Non dans `(app)`, pour éviter la boucle avec l'onboarding.

### 2. Règles et validations réelles

- **Garde de la page.**
  - `lireEtatOuDireLaPanne` : 2FA requise → `/verification?suite=mot-de-passe` ;
  - sans profil → `?erreur=profil` ;
  - `suspended` → `?erreur=suspendu` ;
  - session non obtenue par e-mail (`sessionParEmail(supabase)` faux) → `?erreur=profil`.
- **Garde de l'action (revérifiée).**
  - `lireProfilVendeur()` nul ou suspendu → `session` ;
  - `sessionParEmail` faux → `session`.
- **Zod.** `Saisie` : `locale` + `MotDePasse` (min 12 caractères, max 72 octets).
- **Refus.** `trop_court`, `trop_long`, `contient_email` (l'adresse vient de la base, jamais du formulaire), `fuite` (`verifierFuite`), `indisponible` (échec `updateUser`).
- **Après succès.** `signOut({ scope: "others" })` (non bloquant en cas d'échec, journalisé), `suivreApresSession`, plancher, redirection.
- Le refus `contient_email` est rendu sans plancher dans cette action (l. 112-114), contrairement aux autres sorties : détail observé, pas de conclusion.

### 3. Liste à cocher

- [ ] Coque simple, icône `KeyRound`.
- [ ] `<h1>` « Nouveau mot de passe », sous-titre avec l'adresse du compte en gras (`t.rich`, adresse issue de la session).
- [ ] Encart `Info` : « Ce lien ne servira qu'une fois, et vos autres appareils devront se reconnecter ».
- [ ] Champ unique `id="nouveau-mot-de-passe"`, `name="motDePasse"`, `new-password`, œil. Pas de champ de confirmation (décision documentée).
- [ ] Aide « 12 caractères minimum… » reliée par `aria-describedby`.
- [ ] Erreurs : `trop_court`, `trop_long`, `contient_email`, `fuite`, `session`, `indisponible`.
- [ ] Bouton « Enregistrer et me connecter » / « Enregistrement… ».
- [ ] Pas de lien « Revenir à la connexion » (la maquette en ajoute un).
- [ ] `NoteSecurite` et pied de docs.

### 4. Écarts avec la maquette (`nouveau-mot-de-passe.html`)

**(a) Produit sans équivalent dans la maquette**
- Erreurs serveur (`fuite`, `session`, `indisponible`, `trop_long`).
- Gardes de session, de 2FA et de statut.
- `NoteSecurite`, pied de docs.

**(b) Maquette sans équivalent dans le produit**
- *Design :* film `"absence"`, jauge et compteur « n / 12 », secouement, lien « Revenir à la connexion » (`href="connexion.html"`).
- *Fonctionnalité nouvelle :* l'avertissement « contient votre adresse » au blur, avec l'adresse en `data-adresse="…"` : l'adresse est dans le DOM, mais elle y vient de la session et pas d'un champ modifiable.
- **Texte « Ce lien ne servira qu'une fois »** : identique côté produit (`motDePasse.avertissement`), mais je n'ai pas vérifié que ce soit exact techniquement (affirmation héritée, état non exécuté).
- Texte légal ajouté (voir « Les 8 points »).

**(c) Textes** : tous déjà dans `motDePasse.*` / `inscription.*`. À créer : le placeholder « Une phrase, plutôt qu'un mot » (si on le porte), « Revenir à la connexion » existe déjà.

### 5. Risques précis

- La maquette met le bouton « Revenir à la connexion » sur un écran dont l'accès exige une session de récupération : cliquer ne déconnecte pas. Le produit n'a pas ce lien ; le comportement attendu est à décider.
- Conserver la garde `sessionParEmail` : un cookie volé ne doit pas pouvoir changer le mot de passe.

---

## verification (2FA)

### 1. Fichiers du produit

- Route : `src/app/[locale]/verification/page.tsx` (nommée `Verification`, dernière modification de l'équipe : `suite=admin`, l. 55-65).
- Action : `.../verification/actions.ts` (`verifierCode`).
- Composant : `src/components/formulaire-verification.tsx`.
- `src/components/bouton-deconnexion.tsx` (variante `lien`, `<form method="post" action="/{langue}/deconnexion">`).
- Libs : `lib/auth/appareil-fiable.ts` (`poserPreuveAppareil`, 30 jours = `TRENTE_JOURS_S` l. 22), `lib/limitation/quota.ts`.

### 2. Règles et validations réelles

- **Page.**
  - Sans session → `/connexion?erreur=session`.
  - Aucun facteur vérifié, ou déjà `aal2` → redirection : `suite=mot-de-passe` → `/nouveau-mot-de-passe`, `suite=admin` → `/admin`, sinon `/commandes`.
  - `suite` n'accepte que `"mot-de-passe"` ou `"admin"` ; autre valeur → `null`.
- **Zod `Saisie`.** `code` : espaces retirés puis `^\d{6}$` ; `locale` ; `suite` enum optionnelle ; `souvenir` enum `"on"` optionnelle.
- **Action.**
  - Code invalide → `invalide` (avec plancher).
  - Session absente → `?erreur=session`.
  - Facteur TOTP vérifié issu de `getUser()`, jamais du formulaire.
  - Sans facteur : on suit la suite ordinaire.
  - `verifierQuotaMotDePasse(email ?? id)` : même budget que la connexion. Refus → `trop` ou `indisponible`.
  - `challengeAndVerify`. Erreur 429 → `trop`, sinon `code`.
  - Succès : si `souvenir === "on"` **et** `suite !== "mot-de-passe"` → `poserPreuveAppareil`.
  - Redirections : `suite=mot-de-passe` → `/nouveau-mot-de-passe` ; `suite=admin` → `/admin` ; sinon `suivreApresSession`. Plancher sur toutes les sorties.

### 3. Liste à cocher

- [ ] Coque dédiée à la page (logo seul, `ArgumentAcces`, carte 520 px).
- [ ] Icône `ShieldCheck` dans une pastille, `<h1>`, sous-titre.
- [ ] Champ unique `id="code"`, `name="code"`, `autoComplete="one-time-code"`, `inputMode="numeric"`, placeholder `123456`, icône `KeyRound`.
- [ ] Erreurs `role="alert"` : `code`, `invalide`, `trop`, `indisponible`.
- [ ] Case « Se souvenir de cet appareil pendant 30 jours », **cochée par défaut** (`defaultChecked`). **Absente quand `suite` est `mot-de-passe` ou `admin`.**
- [ ] Bouton « Vérifier » / « Vérification… ».
- [ ] Phrase « Appareil perdu ? Ajoutez la clé de secours… ».
- [ ] « Ce n'est pas votre compte ? » + formulaire POST « Se déconnecter » dans un `<div>`.
- [ ] `NoteSecurite` et pied de docs.
- [ ] Champs cachés `locale` et `suite` (si présent).

**Anomalie probable, non vérifiée au navigateur :** dans `formulaire-verification.tsx` l. 59-64, l'icône `Check` porte `peer-checked:opacity-100`, mais elle est dans un `<span>` enfant, pas frère du `<input class="peer">`. Le sélecteur `peer-*` de Tailwind ne cible que les frères suivants, donc la coche pourrait ne jamais apparaître alors que le fond et la bordure du `<span>` changent. À vérifier avant de la reprendre.

### 4. Écarts avec la maquette (`verification.html` + `compte.js` l. 17-55)

**(a) Produit sans équivalent dans la maquette**
- Paramètre `suite` (`mot-de-passe` / `admin`) : la maquette ne le connaît pas.
- Redirections de la page selon l'état de la session.
- `NoteSecurite` et pied docs.
- Quota partagé et plancher.
- Cases cochée par défaut (maquette : décochée).

**(b) Maquette sans équivalent dans le produit**
- *Design / mouvement :* **six cases à un chiffre** (`maxlength=1`, `data-chiffre`, chaque case avec `aria-label="Chiffre n sur 6"`) à la place d'un champ unique. Navigation clavier (flèches, retour arrière), collage répartissant les chiffres, secouement, état `est-valide` après succès, film `"absence"`.
- *Fonctionnalité nouvelle, à signaler :* **soumission automatique** dès le 6e chiffre (`verif.requestSubmit()`, l. 27) : chaque saisie complète consomme le quota partagé avec la connexion. À arbitrer : un code erroné collé consomme un essai sans clic explicite. Le produit n'envoie qu'au clic ou à Entrée.
- **Portage du contrat.** Il faut conserver un `<input name="code">` (cachée ou visuellement fusionnée avec les cases) contenant les 6 chiffres. `autoComplete="one-time-code"` ne doit rester que sur la première case pour que le remplissage automatique des SMS / applications fonctionne. Attention au lecteur d'écran : le produit a un seul champ avec un libellé « Code de vérification », la maquette a 6 champs plus une `<legend>`.
- Dans la maquette, « Se déconnecter » est un lien `<a href="connexion.html">` : il ne déconnecte pas. À remplacer par `BoutonDeconnexion` (POST, CSRF).
- Le simulateur `000000 → refus` est un artefact de maquette.

**(c) Textes** : titre, sous-titre, légende « Code de vérification », « Vérifier / Vérification… », « Appareil perdu ? », « Ce n'est pas votre compte ? », erreurs `code` et `invalide` : identiques au produit (`verification.*`). À créer : les 6 libellés ARIA « Chiffre n sur 6 ». « Se souvenir de cet appareil pendant 30 jours » existe déjà.

### 5. Risques précis

- Quota : l'auto-envoi accélère l'épuisement du budget de tentatives, partagé avec le mot de passe.
- Ne pas mettre `BoutonDeconnexion` dans un `<p>` (erreur React #418 documentée l. 108-114 de la page).
- Garder `souvenir` absent quand `suite` est défini (l'action l'exclut aussi, L-014).

---

## bienvenue (onboarding)

### 1. Fichiers du produit

- Route : `src/app/[locale]/bienvenue/page.tsx`.
- Actions : `.../bienvenue/actions.ts` : `terminerOnboarding`, `preparerDepotLogo`, `confirmerDepotLogo`.
- Composant : `src/components/formulaire-onboarding.tsx` (client).
- Libs : `lib/boutique/{logo,reglages,types-logo,libelles-apercu,phrases-apercu}.ts`, `lib/design/contraste.ts` (`resoudreAccent`, `ACCENT_DEFAUT`), `lib/comptes/profil.ts` (`onboardingAFaire`), `lib/instrumentation/*`.
- Tests : `tests/unit/onboarding-page-client-en-anglais.test.ts`, `formulaires-et-actions.test.ts`.

### 2. Règles et validations réelles

- **Gardes de la page.**
  - 2FA requise → `/verification` ;
  - profil nul → `?erreur=session` ;
  - `statut !== "active"` → `?erreur=suspendu` ;
  - onboarding déjà fait → `/commandes`.
- **Zod `Onboarding` (l. 34-50).**
  - `typeDeCompte` enum `supplier | reseller`, **obligatoire** ;
  - `nomBoutique` trim max 60, facultatif (lu depuis `nom`) ;
  - `couleurAccent` regex `^#[0-9a-fA-F]{6}$` ;
  - `locale` (SchemaLangue).
- **Autres garde-fous.**
  - Session active exigée, et onboarding non rejouable (`!onboardingAFaire(profil)` → `session`) : l'action revérifie.
  - Échec Zod → `motif: "saisie"` + liste des champs.
  - Écriture sous RLS : `profiles.update({account_type, locale})` puis `appliquerReglagesMarque` avec **`languePublique: LANGUE_PAGE_CLIENT_PAR_DEFAUT`** (anglais, décision de Mehdi) et `filigrane: false`.
  - Événement `ONBOARDING_TERMINE`, puis `redirect(/{locale}/commandes)`.
- **Logo.**
  - Les types viennent de `TYPES_LOGO_ACCEPTES` : PNG, JPEG et WebP. SVG refusé.
  - `preparerDepotLogo` rend une URL présignée R2.
  - Envoi navigateur par XHR PUT avec progression.
  - `confirmerDepotLogo` relit la taille côté serveur ; la clé est générée côté serveur.
  - L'aperçu est une URL `blob:` révoquée au démontage.
- **Texte « 512 px minimum ».** Il est dans `onboarding.logoFormats` des deux côtés, mais je n'ai trouvé aucun contrôle de 512 px dans `lib/boutique` (recherche faite) : l'affirmation n'est pas appliquée.

### 3. Liste à cocher

- [ ] En-tête : logo + « Étape 1 sur 2 ». Dans la carte, deux barres de progression (une pleine).
- [ ] `<h1>` « Mettons votre nom sur la page » + sous-titre.
- [ ] Champ nom (`id="nom"`, `name="nom"`, facultatif, icône `Store`, `aria-invalid` si le champ est en échec).
- [ ] Logo : bouton « Choisir une image » / « Envoi… n % » / « Remplacer », texte « PNG ou JPG, 512 px minimum » ou nom de fichier, bouton `X` « Retirer le logo » (44 px), vignette d'aperçu.
- [ ] Erreurs logo `role="alert"` : `type`, `taille`, `envoi`, `confirmation`, `session`.
- [ ] Couleur : pastille 28 px (cible 44 px) + `<input type=color>` + champ texte hex monospace en majuscules, champ caché `couleurAccent`, aide « Le contraste est ajusté automatiquement… ». Le champ texte n'a pas de validation locale ; la regex est serveur.
- [ ] Type de compte : deux cartes radio (`supplier`, `reseller`), `name="typeDeCompte"`, aucune présélection ; erreur « Choisissez à qui vous vendez. ».
- [ ] Erreurs globales : `session`, `ecriture` (`MessageErreurDs`).
- [ ] Bouton « Continuer » / « Enregistrement… ».
- [ ] Aperçu en direct (≥ `lg`, `aria-hidden`) : téléphone, nom (« Votre boutique » si vide), logo, libellés de la commande et du bouton d'approbation tirés de `libellesApercu(langue)`, couleurs issues de `resoudreAccent`.
- [ ] Pas de « Passer pour l'instant » (décision documentée).
- [ ] Hors écran : `onboardingAFaire` non rejouable, émission d'un événement, langue publique = anglais.

### 4. Écarts avec la maquette (`bienvenue.html` + `compte.js` l. 57-123)

**(a) Produit sans équivalent dans la maquette**
- Envoi réel du logo vers R2 avec progression et 4 erreurs. La maquette lit le fichier en local et l'affiche, « jamais envoyé ».
- Erreurs serveur : `session`, `ecriture`, `saisie` par champ.
- `LOGO` accepte WebP (la maquette : PNG et JPEG seulement, et le texte dit « PNG ou JPG »).
- Barres de progression dans la carte.
- Mini-aperçu fabriqué à la main (vs `.pc`).

**(b) Maquette sans équivalent dans le produit**
- *Design / mouvement :* en-tête avec indicateur « Étape 1 sur 2 » + barre, aperçu bâti à partir du composant page-client `.pc` (4 photos d'exemple `apercu-*.jpg`, étapes, `data-etats`), cartes de type avec coche `circle-check`, `secoue` sur le type manquant.
- *Fonctionnalité nouvelle, à signaler :*
  - **5 pastilles de couleurs rapides** (violet #5B4BF5, vert sapin #0F766E, corail #E5484D, encre #0B0B18, ambre #D97706) avec `aria-pressed` et libellés ARIA ;
  - validation côté client du type (« Choisissez à qui vous vendez. »), alors que le produit passe par le serveur ;
  - formulaire dont les champs n'ont pas de `name` (`onb-nom`, couleur) et un radio nommé `type` : contrat à reprendre pour coller à `nom`, `couleurAccent`, `typeDeCompte`.
- Redirection : la maquette envoie vers `commande.html` (« étape 2 sur 2 ») ; le produit vers `/commandes`.

**(c) Textes** : tous les textes visibles de la maquette sont identiques à `onboarding.*` (titre, sous-titre, étape, libellés, formats, aide couleur, type, « CE QUE VOTRE CLIENT VERRA »). À créer : les 5 libellés ARIA des couleurs (« Violet », « Vert sapin », « Corail », « Encre », « Ambre ») et « Couleurs rapides ». « Votre commande / pour votre client » dans l'aperçu : à comparer avec `libelles.commande` (non vérifié).

### 5. Risques précis

- Aucun `name` sur les champs de la maquette : sans contrat repris, l'action lit `null` (c'est exactement le défaut documenté `actions.ts` l. 92-101).
- Les photos d'exemple du film et de l'aperçu sont des assets statiques ; ne pas les confondre avec la page client réelle (`libellesApercu`).
- Les couleurs rapides doivent passer par `resoudreAccent` comme le reste, jamais `#ffffff` en dur (règle n° 1 de CLAUDE.md).
- La maquette dit « PNG ou JPG, 512 px minimum » : texte hérité, non appliqué, et incompatible avec WebP accepté.

---

## notification (page ouverte depuis un e-mail de suivi)

### 1. Fichiers du produit

- Route : `src/app/[locale]/notification/page.tsx`.
- Routes machine : `src/app/api/notification/confirmer/route.ts` et `.../desinscription/route.ts` (POST natifs, redirection 303).
- Lib : `src/lib/page-publique/notifications.ts` (`CIBLES_NOTIFICATION` l. 101-104, `lireFormulaireNotification`, `confirmerNotification`).
- Test : `tests/unit/notifications-client.test.ts`, `tests/rls/notifications-client.test.ts`.
- Textes : `notifications.page.*` (titre, six états) et `page-publique.lienInvalideAccueil` / `lienInvalideCommentCaMarche`.

### 2. Règles et validations réelles

- Langue non supportée → `notFound()`.
- Paramètres de requête : `action` ∈ {`confirmer`, `desinscrire`}, `j` (jeton, regex `^[A-Za-z0-9_-]{16,64}$`), `etat` ∈ {`confirmee`, `desinscrite`, `invalide`, `indisponible`}. L'état est celui d'`etat` s'il est connu, sinon l'action si le jeton est plausible, sinon `invalide`.
- Ouvrir la page ne fait rien : seul le bouton envoie le POST (formulaire natif, sans JS).
- Route `confirmer` : `verifierQuotaEcriturePublique` ; refus → `?etat=indisponible` ; sinon `confirmerNotification(jeton)` → `?etat=confirmee` ou `?etat=invalide`.
- La page ne montre jamais la commande.

### 3. Liste à cocher

- [ ] Fond dégradé fixe (inline, non via `FondAcces`), en-tête : logo + pilule « Retour à l'accueil » (→ `/{locale}`).
- [ ] Illustration : `illus-colis.png`, ou `illus-colis-introuvable.png` si l'état est `invalide`.
- [ ] `<h1>` et texte pour 6 états : `confirmer`, `confirmee`, `desinscrire`, `desinscrite`, `invalide`, `indisponible`.
- [ ] Bouton (seulement pour `confirmer` et `desinscrire`) : formulaire `method="post"` avec champs cachés `j`, `langue` et, pour la désinscription, `retour=page`. Pas de JS.
- [ ] Pied : petit logo + lien « Comment fonctionne DropLink » → `/{locale}/docs` (`target=_blank`, `rel=noopener noreferrer`).
- [ ] `robots: noindex,nofollow`.

### 4. Écarts avec la maquette (`notification.html` + `compte.js` l. 125-162)

**(a) Produit sans équivalent dans la maquette**
- POST réel, jeton, gardes et routes serveur.
- Illustration PNG (deux variantes).
- `robots`, `notFound` sur langue inconnue.
- Quota d'écriture publique.

**(b) Maquette sans équivalent dans le produit**
- *Design / mouvement :* carte `notifp__carte` avec un visuel animé (`notifp__icone` + 3 `<i>`) à la place de l'illustration PNG, une icône par état (`mail`, `mail-check`, `bell-off`, `circle-check`, `circle-alert`, `clock`), animation d'entrée de 380 ms au changement d'état, `aria-live="polite"`, focus déplacé sur le titre, `document.title` mis à jour, bouton avec état « en cours ».
- *Aucune fonctionnalité nouvelle :* les six états et leurs textes sont identiques à ceux du produit.
- La maquette pilote l'état par `location.hash` (`#confirmer`…) et un bouton `type="button"` : artefact de simulation. Le produit passe par `?action=…&j=…` / `?etat=…` et un POST.

**(c) Textes** : repris à l'identique de `notifications.page.*` et `page-publique.*`. Rien à créer en texte. Le `<title>` de la maquette (« Suivi par e-mail · DropLink ») est dynamique par état ; côté produit, `metadata` est statique sans titre (`robots` seulement). À décider.

### 5. Risques précis

- Conserver le POST natif, qui fonctionne sans JavaScript : ne pas le remplacer par un bouton piloté en JS. Un antivirus de messagerie qui ouvre le lien ne doit pas confirmer.
- `aria-live` sur toute la carte combiné à un POST + redirection 303 : l'annonce ne se déclenche que si la page est rechargée ; le focus sur `<h1>` serait à reprendre via un attribut d'autofocus, pas via JS d'état.
- Le bouton produit utilise `bg-ds-accent` (accent DropLink) ; la maquette utilise `notifp__bouton`. Aucun dégradé de marque sur cette page.

---

## Ce que je n'ai pas pu vérifier

- Aucun rendu navigateur, aucune mesure de poids du film, aucune exécution de tests, de la sonde CSP ou de `pnpm gates`.
- Le contenu de `src/app/[locale]/auth/retour/route.ts`, des routes `deconnexion`, de `lib/auth/recuperation.ts`, `lib/auth/fuites.ts`, `lib/limitation/quota.ts` n'a pas été lu en détail. Les comportements décrits viennent des commentaires et des appels dans les fichiers lus.
- Les traductions EN et zh-CN n'ont pas été relues : seule la structure FR a été comparée à la maquette. Je suppose la parité (testée par le dépôt), sans l'avoir vérifiée.
- Les feuilles CSS de la maquette n'ont été lues que par recherche ciblée (`base.css` l. 618-640, 698-812, 892-1015). Je n'ai pas inventorié les règles dark mode ni les valeurs de design.
- `page-client.html`, `coque.html`, `main.js`, `v4.js` ne sont pas décrits en détail. `v4.js` ne pose que l. 36 des classes `v4-carte` d'après la recherche faite.
- Que le lien de réinitialisation « ne serve qu'une fois » : affirmation reprise telle quelle du produit, jamais exécutée.
