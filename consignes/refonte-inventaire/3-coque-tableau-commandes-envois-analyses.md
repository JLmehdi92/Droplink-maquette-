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

# Inventaire exact : coque vendeur, tableau de bord, commandes (liste), envois, analyses

Fait en lecture seule. Je n'ai pas de shell : je n'ai pas pu lancer `git diff d1f3389..43ec195`, ni rendre la maquette, ni mesurer quoi que ce soit au navigateur. Tout ce qui suit vient de la lecture des fichiers. Les messages EN et zh-CN n'ont pas été relus : je n'ai vérifié que `messages/fr.json`.

Abréviations : `PRD` = produit (`/home/user/droplink2/src/...`), `MAQ` = `/home/user/droplink2/design/maquette/src/...`.

## Constat transversal (à lire avant le reste)

1. **La maquette est un second système visuel, pas un re-skin du produit.**
   - Tokens propres dans `MAQ/css/app.css:10-19` : `--sol #F4F4F8`, `--feuille #FFF`, `--sol-onglet`, `--survol-ligne`.
   - Le produit, lui, est sur les tokens `ds-*` du design system (`#FBFBFE`, rayons 16/20, ombres teintées).
   - Écrans en « feuille posée sur un sol » : `.app__feuille` (rayon 12, marge 8), grille `236px 1fr`, barre latérale transparente.
   - Titres à 22 px/700 (`.tableau__tete h1`, `app.css:99`), contre 40 px/800 au produit (`en-tete-ecran.tsx:70`).
   - Compteurs en bande unique à filets (`.compteurs`, `app.css:108`), contre quatre ou cinq cartes avec pastille d'icône de 48 px (`tuile-metrique.tsx`).
   - La règle de conformité de CLAUDE.md (« le design system gagne ») est donc à arbitrer : la maquette devient la nouvelle référence, à écrire dans le design system d'abord.

2. **Mode sombre.** `app.css:15-19` et `:20` posent `prefers-color-scheme: dark` et `[data-theme="dark"]`. Le produit n'a aucun mode sombre : grep négatif sur `prefers-color-scheme|data-theme|color-scheme` dans `src/`. C'est une fonctionnalité nouvelle à signaler, pas du design à porter.

3. **Deux navigations mobiles différentes.**
   - Produit :
     - barre d'onglets fixe en bas, cinq entrées. Paramètres est exclu (`auTelephone:false`, `layout.tsx:143`) ;
     - barre du haut de 62 px (logo, cloche, compte) ;
     - la barre d'onglets disparaît sur l'éditeur (`navigation-vendeur.tsx:137`) ;
     - paliers Tailwind `md`=768 et `lg`=1024.
   - Maquette :
     - aucune barre d'onglets ;
     - tiroir latéral à hamburger sous 1020 px (`coque.js:57-61`, `app.css:244-253`) ;
     - barre du haut de 60 px portant la recherche en 44 px, la cloche et le bouton « Créer une commande » réduit à une icône de 44×44 sous 760 px (`app.css:254-263`) ;
     - paliers 1260/1020/760.
   - Décision produit à poser. Les règles 5 (cible 44 px) et « 11,5 px min » restent applicables.

4. **Le dégradé de marque est sur le bouton de la barre du haut, donc sur chaque écran** (`coque.html:55`, `.bouton-app--marque`).
   - CLAUDE.md, règle 3 : « UNE SEULE action principale par écran ».
   - Produit actuel : la carte de lancement du tableau (`carte-lancement.tsx`), le bouton de `/commandes`, le bouton de l'état vide.
   - Conséquence : retirer ces boutons du dégradé là où le bouton du haut les double (tableau de bord : 3 « Créer une commande »), ou arbitrer.

5. **La maquette n'a PAS de transition « magique » à copier telle quelle ; elle en a deux, redondantes.**
   - (a) Échange du `<main>` en JavaScript : `coque.js:70-150`.
     - Charge la page cible par `fetch` puis `DOMParser`.
     - Remplace `main#contenu`.
     - Sortie 110 ms, entrée 240 ms, translation ±6/10 px selon le sens du menu (`ORDRE`, `coque.js:70`).
     - Pastille de menu animée par FLIP.
     - Préchargement au survol/focus/touchstart (`coque.js:153-156`).
     - Rechargement de scripts par écran, avec `AbortController` (`window.DropLink.ecran()`).
   - (b) View Transitions CSS : `app.css:497-536`, `@view-transition { navigation: auto }`, plus `speculationrules` prerender injecté par `construire.mjs:37-39`. Le sens est stocké dans `sessionStorage "dl-sens"`. Un fallback `sans-vt` existe (`construire.mjs:46`).
   - Dans le produit, la coque est déjà persistante (layout), donc (a) se traduit en transition au changement de route, pas en fetch maison. Voir « Risques » plus bas.

---

## Coque de l'espace vendeur

### 1. Fichiers du produit
- Layout : `src/app/[locale]/(app)/layout.tsx` (373 lignes).
  - Gardes : `lireEtatOuDireLaPanne` L49, redirections `verification`/`connexion`/`suspendu`/`bienvenue` L54-93.
  - Logo signé : L99-100.
  - Lectures : `compterParEtat` + `compterEnvois` en `Promise.all`, L116-119.
  - Entrées de navigation : L121-145.
  - Fond : `<FondApplication/>` L162.
  - Lien d'évitement `#contenu` : L172.
  - Aside bureau 264 px : L185-343, avec logo→tableau de bord, `NavigationVendeur variante="cote"`, encart Pro (masqué si `profil.planPro`, L237-252), bloc compte `<details>` (L264-342).
  - Pied de page bureau uniquement : L364-366.
  - Barre d'onglets : `NavigationVendeur variante="bas"` L370.
- `src/components/app/barre-superieure.tsx` : 89 px bureau, 62 px mobile ; logo mobile ; recherche `hidden md:block` ; `ClocheAlertes` ; séparateur ; menu compte `<details>`.
- `src/components/app/navigation-vendeur.tsx` (client) :
  - `estActive` L94 ; `estEditionDeCommande` L106.
  - Barre du bas L122-177.
  - Pastille active animée Motion `layoutId="pastille-navigation-vendeur"` L211-222, ressort 420/34, désactivée si `useReducedMotion`.
  - Pastille de compte sur « Commandes » L249-263.
- `src/components/app/recherche-globale.tsx` (client) : formulaire GET vers `/{langue}/commandes?q=`.
  - Raccourci Ctrl/Cmd+K : L64-74. Il ne fait que focus et select.
  - Relit `?q=` seulement si `chemin === action` : L52.
  - Deux `<kbd>` « Ctrl » et « K » statiques, `hidden lg:flex` : L108-127.
- `src/components/app/cloche-alertes.tsx` (serveur) : `<details>`.
  - Deux familles : `jamaisOuvertes` → `/commandes?tri=jamais-ouvert` ; `silencieux` → `/envois?silencieux=oui`.
  - Panneau mobile en `fixed` au-dessus des onglets (L102) ; état vide « rien » (L114-120).
- Autres : `fond-application.tsx` (dégradé fixe + deux losanges, sans animation), `en-tete-ecran.tsx` (`EnTeteEcranDs`), `lien-parametres.tsx`, `panneau.tsx`, `tuile-metrique.tsx`, `carte-etat-vide.tsx`.
- Loading : `(app)/loading.tsx` (squelette générique 8 lignes). Erreur : `(app)/error.tsx`. 404 : `(app)/not-found.tsx`.

### 2. Données lues
- Par requête (cache React) : `compterParEtat` (rpc `compter_commandes_par_etat`, `lib/commandes/liste.ts:800-824`) et `compterEnvois` (rpc `compter_envois`, `lib/envois/liste.ts:378-383`).
- `lireProfilVendeur` mémoïsé ; `signerLecture` du logo (HMAC local).
- Tout est rendu côté serveur. Seuls clients : `NavigationVendeur` et `RechercheGlobale`.
- `RechercheGlobale` est dans un `<Suspense>` à cause de `useSearchParams`.
- Les compteurs de la coque sont lus à chaque rendu du layout. Contrairement à une idée reçue, le layout n'est pas re-rendu à chaque navigation cliente. Le commentaire `navigation-vendeur.tsx:199-209` le dit ; déduction : pastille « Commandes » et badge de cloche peuvent être périmés jusqu'à un refresh. Je n'ai pas mesuré.

### 3. Liste à cocher (produit)
- [ ] Lien d'évitement « Aller au contenu » (`layout.tsx:172`) ; cible `id="contenu"` dans chaque `<main>`.
- [ ] Logo → `/tableau-de-bord` (jamais la landing, décision du 26/09).
- [ ] 6 entrées : Tableau de bord, Commandes (+pastille total), Suivi d'envois, Analyses, Ma marque, Paramètres. Paramètres absent du mobile.
- [ ] `aria-current="page"` ; l'entrée active est un `LienEcran` (rechargement). Préfixe `href + "/"`.
- [ ] Pastille active qui glisse ; graisse 700/500 ; trait d'icône 2,1/1,8.
- [ ] Encart « Passez au Pro » en bas de colonne, masqué pour un compte Pro, vers `/passer-pro`.
- [ ] Bloc compte : logo signé ou initiales (2 lettres) ; nom de boutique ou « Mon compte » ; e-mail ; menu ouvrant vers le haut avec Paramètres + Déconnexion (`BoutonDeconnexion`).
- [ ] Pied de page (année) bureau seulement.
- [ ] Barre du haut : recherche (bureau), cloche, séparateur, menu compte (e-mail, Paramètres, Déconnexion) ; logo mobile (cible 44 px).
- [ ] Recherche : GET `?q=` sur `/commandes`, Ctrl/Cmd+K, préremplie depuis l'URL sur `/commandes` seulement.
- [ ] Cloche : badge = somme exacte des familles listées ; une famille à 0 ou lecture échouée (`null`) n'apparaît pas ; texte « rien » si vide ; panneau 400 px bureau, feuille mobile.
- [ ] Barre d'onglets mobile masquée sur l'éditeur de commande.
- [ ] Fond lavande dégradé fixe (`FondApplication`), présent à toutes les largeurs.
- [ ] Redirections de garde (vérification 2FA, suspendu, onboarding).
- [ ] Pas de bouton « Créer une commande » dans la coque : il vit dans chaque écran.

### 4. Écarts avec la maquette
(a) **Produit sans équivalent dans la maquette** (`coque.html`/`coque.js`) :
- Barre d'onglets mobile (voir constat 3).
- Encart « Passez au Pro » du bas de colonne (absent de `coque.html`).
- Pied de page légal.
- Logo du vendeur : la maquette n'a que des initiales (`compte__avatar`, `coque.html:20`).
- Pastille dans le menu de compte, nom de boutique dans la barre du haut (`lg:block`).
- Menu de compte de la barre du haut avec e-mail : la maquette n'a que le bloc du bas de colonne.
- Lien « Paramètres » rond au téléphone.
- Garde de session/suspension, `aria-label`s en 3 langues.

(b) **Maquette sans équivalent dans le produit** :
- **Design/mouvement à porter**
  - Grille de coque 236 px (le produit : 264 px) ; feuille arrondie sur un sol.
  - Barre du haut sticky de 56 px (le produit : 89 px, non sticky, sans fond propre).
  - Titre H1 22 px ; fil d'Ariane `.v4-fil` en tête de chaque écran (`<Boutique> > <Écran>`, `tableau.html:22`) ; texte absent du produit, qui ne l'a pas.
  - Grain `.l4-grain`, bordure lumineuse qui suit le pointeur sur `.bloc`/`.compteurs` (`v4.js:19-31`, `app.css:1495`), compteurs « à rouleaux » au premier chargement (`v4.js:49-77`), et entrée du premier écran (`v4-entree`).
  - Bouton de l'alerte : 36 px, badge 18 px, panneau 320 px (le produit : 42 px/400 px).
  - Transition inter-écrans et préchargement (constat 5).
  - Pastille de menu animée (le produit l'a déjà, via Motion).
  - Menu de compte : animation `menu-entre`/`alertes-entre`, et fermeture au clic extérieur/Échap (le produit utilise `<details>`, sans clic extérieur ; `commandes` utilise `name="actions-commande"`).
- **Fonctionnalités nouvelles à signaler**
  - **« Créer une commande » dans la barre du haut de tous les écrans** (`coque.html:55`). Il faudrait un formulaire à Server Action `creerBrouillon` dans le layout.
  - **Tiroir à hamburger** (`app__menu`) + sa fermeture au clic extérieur/Échap.
  - **Recherche au téléphone dans la barre du haut** ; au produit elle est dans l'en-tête de `/commandes` sous `lg`.
  - **Mode sombre**.
  - Alerte « commande jamais ouverte » reliée à `commandes.html#jamais-ouvertes` (hash) ; le produit passe par `?tri=jamais-ouvert`.
  - Texte d'aide dynamique `Rechercher…` sous 640 px (`coque.js:28-30`).
  - `⌘K` affiché sur Mac, `Ctrl K` sinon (`coque.js:34`) ; le produit affiche toujours « Ctrl K ».
  - Le `kbd` disparaît à la prise de focus (`app.css:68`).

(c) **Textes**
- Repris tels quels du produit : « Espace vendeur », « Aller au contenu », « Rechercher une commande », « Client, référence, numéro de suivi… », « Créer une commande », libellés d'alertes (la maquette copie `alertes.jamaisOuvertes.*`).
- À créer en FR/EN/zh-CN :
  - « Ouvrir le menu » / « Fermer le menu » (le `aria-label` du hamburger) ;
  - l'abréviation `Rechercher…` ;
  - fil d'Ariane (utilise le nom de boutique + l'écran : réutilise les clés `navigation.*`) ;
  - « Alertes (N) » (`aria-label` ; le produit utilise `alertes.titreAvec`) ;
  - texte `⌘K`.

### 5. Risques
- Une barre du haut qui contient un `<form action={creerBrouillon}>` appelle une Server Action depuis le layout. Les Server Actions sont sérialisées par Next : un clic pendant une autre action attend. `creerBrouillon` fait un INSERT + `redirect` (`lib/commandes/actions.ts:53-106`) ; l'écran de quota passe par `redirect(cheminQuotaAtteint)` (L85). La même action est déjà employée par 3 autres boutons.
- Rendre la barre du haut sticky + fond opaque : le produit a ajouté `backdrop-blur` nulle part dans l'espace vendeur (OK). La maquette dit explicitement « sans backdrop-filter » (`app.css:59`).
- `loading.tsx` unique pour toute la section : le squelette est un faux « Commandes » ; la maquette `chargement.html` fait le même (même coque, `data-nav="commandes"`).
- Le tiroir mobile exige du JS (clic extérieur, Échap, focus) alors que la navigation du produit est un composant client déjà existant. À écrire dans `NavigationVendeur`.
- Si la barre d'onglets est supprimée au mobile, l'accès à « Paramètres » ne dépend plus du menu de compte (aujourd'hui `LienParametres variante="rond"` ne s'affiche que `md:hidden`).

---

## Tableau de bord (`/[locale]/tableau-de-bord`)

### 1. Fichiers du produit
- Page : `src/app/[locale]/(app)/tableau-de-bord/page.tsx` (224 lignes).
- Composants :
  - `src/components/tableau/{carte-lancement,actions-rapides,dernieres-commandes,carte-pro}.tsx`
  - `src/components/analyses/{compteurs-analyses,frise-semaines,repartition-colis,activite-recente,liens-par-jour,parts-transporteurs}.tsx` (partagés avec `/analyses`).
- Action : `creerBrouillon` (`lib/commandes/actions.ts:53`), utilisée par `CarteLancement` et `ActionsRapides`.
- Lectures : `lib/analyses/activite.ts`, `lib/analyses/recente.ts`, `lib/envois/liste.ts`, `lib/commandes/liste.ts`.

### 2. Données lues
8 lectures en `Promise.all` (L92-102) :
- `lireActivite` → rpc `analyser_activite`
- `lireSemaines` → rpc `compter_commandes_par_semaine`
- `compterEnvois` → rpc `compter_envois`
- `lireTransporteurs` → rpc `repartir_transporteurs`
- `lireDelaiLivraison` → rpc `delai_moyen_livraison`
- `lireOuverturesParJour` → rpc `compter_ouvertures_par_jour`
- `lireActiviteRecente` → table `order_events`, limite 5
- `lireCommandes(analyserParametresListe({}))` → table `orders`, première page de 50, dont on garde 5 (`slice(0, 5)`, L177). Elle charge aussi les vignettes (`order_media`) pour 50 lignes alors qu'il n'en faut que 5.

Période : searchParam `periode` ∈ {7j, 30j, 90j} (`PERIODES`), défaut 30j. Tout est rendu côté serveur, aucun îlot client ; la période se change par navigation (liens `LienEcran`). Chaque panneau tombe sur « indisponible » si sa lecture échoue (jamais zéro).

### 3. Liste à cocher (produit)
- [ ] Titre « Bonjour {nom} » : `nomAffiché ?? nomBoutique`, sinon « Bonjour » ; sous-titre.
- [ ] Sélecteur de période 7/30/90 jours (liens, `aria-current`).
- [ ] 5 compteurs (créées avec écart vs période précédente, livrées « N sur M », liens ouverts « N,N vues par commande ouverte », taux de validation, délai moyen) ; « — » jamais « 0 » quand absent.
- [ ] Carte de lancement : illustration `public/marque/illus-colis.png`, titre, texte, bouton dégradé « Créer une commande » (`BoutonAction`).
- [ ] Frise des 12 semaines (8 sous `xl` ; 4 barres masquées).
- [ ] Dernières commandes (5) : vignette 38 px, référence, client (« sans nom »), badge de statut (icône), ancienneté `relativeTime` (≥ `sm`) ; lien « Voir tout ».
- [ ] Actions rapides : Créer une commande (formulaire), Personnaliser ma page client, Suivi d'envois, Analyses.
- [ ] Répartition des colis ; liens clients par jour ; transporteurs (lien « Voir tout ») ; activité récente (variante `tableau`).
- [ ] Carte « Passez au Pro » (bureau seulement, `hidden lg:flex`), masquée pour un compte Pro ; la grille de 2e rangée passe à 3 colonnes.
- [ ] Paliers : trois colonnes seulement à partir de `2xl`.
- [ ] Garde `exigerVendeur` + onboarding.

### 4. Écarts avec la maquette (`tableau.html` + `tableau.js` + `analytique.js`)
(a) **Produit sans équivalent dans la maquette** :
- Carte de lancement avec illustration (`CarteLancement`).
- Carte « Passez au Pro ».
- Panneau « Répartition des statuts » + « Liens clients » + « Transporteurs » + « Activité récente » sont tous là, mais autrement disposés : le produit affiche la frise et les liens par jour dans deux panneaux séparés, la maquette en fait UN bloc à bascule (voir plus bas).
- Message d'erreur « indisponible » par panneau.
- Salutation conditionnelle (pas de nom → « Bonjour »).
- Vignettes réelles dans « Dernières commandes » ; badge d'état avec icône et état « Sans mouvement · N j ».

(b) **Maquette sans équivalent dans le produit** :
- **Design/mouvement à porter**
  - Bascule de graphique « Commandes / Liens clients » (`tableau.html:40-43`, `tableau.js:44-52`) : un seul graphique, deux séries, navigation clavier ←/→.
  - Graphiques en SVG tracés à la main avec animations (barres `scaleY`, trait `strokeDashoffset`, aire en fondu) et bulle au survol/focus avec navigation clavier : `analytique.js:95-173`.
  - Table cachée « Voir les valeurs » (`<details>`, `table-vue`, `tableau.html:47`) : alternative texte au graphique.
  - Sélecteur de période en `radiogroup` avec curseur coulissant (`analytique.js:202-217`) : le produit navigue par liens.
  - Compteurs : chiffre qui se fond avec flou lors du changement de période (`changer`, `analytique.js:54-61`), pas de rechargement.
  - Aperçu flottant de la page client au survol d'une commande (`tableau.js:63-103`). — **retiré, décision de Mehdi du 03/10/2026**
  - Fil d'Ariane ; l'en-tête avec titre 22 px.
  - Pas d'icône dans les compteurs (bande à filets).
- **Fonctionnalités nouvelles à signaler**
  - **Aperçu de la page client au survol** (450 ms d'intention, `tableau.js:98`). Il réutiliserait `/p/<jeton>/apercu`, mais ce chemin compte aucune vue et mettrait un `<iframe>` en jeu : c'est une surface à valider (CSP/`frame-ancestors` ; `next.config.ts` n'autorise le cadrage que par DropLink). — **retiré, décision de Mehdi du 03/10/2026**
  - **Changement de période sans rechargement** : demande soit un composant client avec les trois périodes préchargées (3× lectures serveur), soit une navigation (comme aujourd'hui).
  - Les données de la maquette sont fictives : « 24 commandes créées sur 30 jours » etc. Aucun impact produit.
  - La maquette n'a pas de `CarteLancement`, donc l'unique bouton dégradé de l'écran est celui de la barre du haut.

(c) **Textes**
- Repris : « Dernières commandes », « Voir tout », « Actions rapides », « Créer une commande », « Personnaliser ma page client », « Voir mes envois » (le produit dit « Suivi d'envois » ; à vérifier), « Accéder aux analyses », libellés des compteurs, « Répartition des statuts », « Transporteurs les plus utilisés », « Activité récente ».
- À créer en FR/EN/zh-CN :
  - titres du graphique à bascule et ses deux aides (`TEXTES_GRAPHE`) ;
  - « Voir les valeurs » ;
  - « Graphique affiché » ;
  - `aria-label` des graphiques (« Flèches gauche et droite pour lire chaque semaine ») ;
  - bulles : « Semaine du {date} », « Commandes créées », « Ouvertures ».
- « Bonjour Atelier Nord ! » avec espace insécable fine (`&#8239;`, `tableau.html:23`) : en FR seulement ; le produit utilise `tableau.bonjourNom`.

### 5. Risques
- La page fait 8 lectures dont `lireCommandes` (50 lignes + vignettes + signatures R2) pour n'en rendre que 5. À 9 600 commandes, c'est borné par `PAR_PAGE`, mais on peut passer `avecVignettes`/limite plus petite. Je ne l'ai pas mesuré.
- Un graphique SVG client avec bulle exige du JavaScript sur un écran qui est aujourd'hui sans îlot client ; il faudra l'îlot (poids, `loading`).
- Les graphiques existants sont sans JS et lisibles par un lecteur d'écran (`<ul>` + `sr-only`) ; la maquette ajoute `role="img"` + table. À conserver pour l'accessibilité.
- `FriseSemaines` cache 4 barres sous `xl` ; la maquette en dessine toujours 12 avec des étiquettes adaptées (`analytique.js:104`).

---

## Commandes (liste) (`/[locale]/commandes`)

### 1. Fichiers du produit
- Page : `src/app/[locale]/(app)/commandes/page.tsx` (514 lignes).
- Geste de liste (POST natif) : `src/app/[locale]/(app)/commandes/geste/route.ts` ; `src/lib/commandes/geste-liste.ts` (lot, archiver, dupliquer ; `cheminGesteDeListe` L65).
- Export CSV : `src/app/api/commandes/export/route.ts` + `lib/commandes/export-csv.ts`.
- Composants : `src/components/commandes/{tableau-commandes,pilules-filtres,pilules-filtres-animees,panneau-filtres,selecteur-periode,puces-filtres-actifs,actions-ligne,bandeau-quota,badge-statut,frise-suivi}.tsx`.
- Lib : `lib/commandes/{liste,url,lot,quota-atteint,reference,actions,cycle}.ts`, `lib/tracking/silence.ts`, `lib/liens/page-client.ts`.
- À côté : `commandes/[id]` (hors périmètre), `loading.tsx` de `[id]`.

### 2. Données lues
- `lireCommandes` (`lib/commandes/liste.ts:567-698`) : table `orders` sous RLS.
  - Colonnes énumérées (L266).
  - Pagination **par curseur** `(colonne, id)` encodé en base64url, validé par regex (`decoderCurseur`, L334) ; `PAR_PAGE = 50`, on lit 51 lignes.
  - Tri : 5 valeurs (`TRIS`) ; `jamais-ouvert` filtre `views_count = 0` ; `bloquees` filtre `status = en_transit` + `parcel_last_movement_at < now - 10 j` (seuil `SEUIL_SILENCE_JOURS`).
  - Recherche `q` : `like` sur la colonne générée `recherche` (index d'expression `unaccent`), repliée par `motifRecherche` (L420) ; maximum 120 caractères.
  - Période `du`/`au` incluse en haut (`borneHauteExclusive`, UTC).
  - Vignettes : une requête `order_media` bornée, max 3 lignes par commande, cles signées en local.
  - Aucun `count` exact ; si page vide, deux lectures d'une ligne (`diagnostiquerVide`).
- `compterParEtat` (rpc) pour les 4 tuiles, les pastilles d'onglet, le sous-titre et le pied « N sur total ».
- `origineDuSite()`, `lireProfilVendeur()` (nom de lien).
- `lirePlafondDuQuota` : rpc `lire_plafond_gratuit_a_vie` ou `lire_plafond_commandes`, uniquement si `?quota=` est posé (L495).
- Tout est rendu côté serveur. Îlots client : `PilulesFiltresAnimees` (trait qui glisse), `ActionsLigne` (copier le lien), `RechercheGlobale`.
- Filtres, tri, vues, pagination = liens `LienEcran` et formulaires GET : **chaque geste est un aller-retour serveur** (URL = état).
- Archiver/dupliquer/lot = POST natif sur la route `geste` + redirection (document complet rechargé ; raison dans `geste-liste.ts:14-38`). Résultat du lot via `?lot=&n=`.

### 3. Liste à cocher (produit)
**En-tête**
- [ ] Titre ; sous-titre chiffré « N commandes, M créées cette semaine » ; variantes vide / archives / compte échoué (omis).
- [ ] Sélecteur de période (bureau `lg`), formulaire `du`/`au` natif ; libellés pour chaque combinaison ; « Tout effacer » si posée.
- [ ] Bouton « Créer une commande » (bureau, dégradé) ; FAB mobile « Nouvelle » à `bottom-[102px]` ; masqués si compte vide.
- [ ] Recherche sous le titre sous `lg` (`FormulaireRecherche`, champs cachés qui préservent filtres).
- [ ] La recherche du haut (barre de coque) filtre la même liste.

**Bandeaux/états**
- [ ] `BandeauQuota` : `?quota=gratuit|mensuel`, avec nombre lu en base ou sans nombre ; bouton « Passer au Pro » seulement pour gratuit.
- [ ] Résultat du lot : `ok` / refus / panne (`t("lot." + etat)`), `role="status"`.
- [ ] Compte vide : accueil 3 étapes + bouton + lien « Ma marque » (`AccueilCompteVide`) ; pas de compteurs, pas de barre d'outils.
- [ ] Filtre sans résultat (`FiltreSansResultat`) : trois diagnostics (`aucune-commande`, `tout-archive`, `filtre-trop-etroit`), « Tout effacer », « Voir les archives », rappel que la recherche ignore les accents.
- [ ] Compteurs masqués en vue archivée et sur compte vide.

**Compteurs** : 4 tuiles (En préparation, En transit, Jamais ouvertes en alerte si > 0, Livrées), 2 colonnes au téléphone, 4 à partir de 1424 px.

**Vues** (onglets soulignés, trait glissant) : Toutes (total) · En transit (compte) · Jamais ouvertes (compte) · Bloquées (sans compte, volontairement). Choix **exclusif** `(statut, tri)`.

**Barre d'outils** : Filtres (statut d'expédition, statut des photos, archivées ; période en champs cachés sauf < `lg`) · Exporter (panneau avertissement « liens publics », puis lien `/api/commandes/export` avec les paramètres) · Tri (5 options ; bureau seulement, au mobile dans le panneau de filtres).

**Puces de filtres actifs** : recherche, statut (sauf `en_transit`), photos, période, archives ; retirables une à une ; « Tout effacer ».

**Tableau (≥ `lg`)**, 9 colonnes `table-fixed` :
- case, commande (vignette 40 + référence courte + icône), date (jour + heure), client (nom + « Jamais ouvert » en rouge ou « N vues » avec infobulle dernière ouverture), produits (≥ `2xl` : 2 vignettes + « +N »), numéro de suivi, statut (badge + « Lien bloqué » si `lienBloqueLe`), frise de suivi (≥ `2xl`), menu « … ».
- Menu « … » : Copier le lien (avec état échec), Ouvrir la page (nouvel onglet), Dupliquer (soumission unique), Archiver / Sortir des archives.

**Cartes (< `lg`)** : vignette 52, nom, ancienneté, référence produit, badge, « Lien bloqué » / « Jamais ouvert » / « N photos · N vues » ; carte ambre si colis silencieux.

**Lot** : cases + barre apparaissant via `:has(input:checked)` (CSS, sans JS) ; action Archiver/Sortir des archives tout-ou-rien ; POST natif.

**Pied** : « N sur total » (omis en archives ou compte échoué) + « Charger la suite » (curseur) ; pas de « Précédent » (volontaire).

### 4. Écarts avec la maquette (`commandes.html` + `commandes.js`)
(a) **Produit sans équivalent dans la maquette** :
- `BandeauQuota` (2 variantes) : aucune mention de quota dans `MAQ` hors `docs.html`/`admin-journal.html`.
- Résultat du lot (ok/refus/panne).
- Accueil du compte vide et diagnostic « tout archivé » ; la maquette a seulement « Aucune commande archivée » et « Aucune commande ne correspond ».
- Badge « Lien bloqué » (blocage administration) et mention de contestation.
- Pastille `compte` sur onglets : la maquette n'en a aucune sur les vues.
- Pagination par curseur (« Charger la suite ») : la maquette affiche tout et « Fin de la liste. » (`commandes.js:176`).
- Carte mobile (< `lg`) : la maquette garde la même grille avec `.carte-meta` (« N photos · N vues », `commandes.js:159`) ; je n'ai pas vérifié le CSS 760 px en détail.
- Barre « lot » inline ; la maquette a un bandeau flottant `.lot` (`commandes.html:94`).
- Recherche relue depuis l'URL, `?q=` partageable, historique navigateur.
- Export CSV réel (`/api/commandes/export`).
- Archivage et duplication persistants ; gestion de la collision de double-clic.
- `exigerVendeur` : refus avant toute lecture.

(b) **Maquette sans équivalent dans le produit** :
- **Design/mouvement à porter**
  - Onglets de vues avec trait glissant et fondu de bord (`v4.js:39-47`).
  - Frise de suivi avec rail qui se remplit (`frise__plein`, animée une fois, `commandes.js:179-181`), infobulle « Dernier mouvement du colis… », texte `sr`.
  - Rafraîchissement de la liste en fondu 90/160 ms (`rafraichir`, `commandes.js:184-187`).
  - Lignes qui se replient à l'archivage (`est-partie`, 260 ms).
  - Menu de ligne et déroulants (`pop`) avec animation d'entrée, fermés au scroll/Échap/clic extérieur.
  - Bouton « Copier » qui passe à l'état « copié » (le produit a déjà cet état).
  - Ouverture de la page client dans une fenêtre modale à cadre téléphone (voir ci-dessous).
- **Fonctionnalités nouvelles à signaler**
  - **Filtrage/tri/vues instantanés sans aller-retour** : la maquette travaille sur un tableau en mémoire (`filtrer()`, `commandes.js:78-94`). Au produit, 9 600 commandes imposent le serveur et le curseur ; il faut garder l'URL comme état et accélérer le ressenti (transition, `useTransition`, squelette) plutôt que passer au client.
  - **Modale « Page du client »** (`commandes.html:101-107`, `ouvrirPage`) : aperçu en cadre téléphone depuis une ligne. Le produit ouvre la page publique dans un nouvel onglet. Réutilisable via `/p/<jeton>/apercu`, à valider comme pour le tableau de bord.
  - **Bouton « Exporter » dans l'en-tête** : le produit le met dans la barre d'outils.
  - **« Période » dans l'en-tête** : déjà présent au produit (bureau, `lg`).
  - Sélecteur de tri à choix « Jamais ouvertes par le client » + « Bloquées en transit » : déjà au produit.
  - **Case « Voir les commandes archivées »** : déjà au produit.
  - Dans la maquette, « Dupliquer comme gabarit » est une annonce de maquette, sans comportement.
  - **Bandeau flottant « Actions groupées »** (`.lot`) avec « Tout désélectionner » : le produit n'a pas le bouton de désélection globale ni case « tout cocher » (la maquette en a une, `data-tout`, avec état indéterminé).
  - **Colonne « Statut des photos »** (`qc`) : la maquette n'en a pas ; le produit ne l'affiche pas non plus (filtre seulement).
  - Rendu `data-alerte` sur la tuile « Jamais ouvertes » : identique.

(c) **Textes**
- Repris : toutes les chaînes de la maquette sont recopiées du produit (« Plus récentes », « Modifiées en dernier », « Jamais ouvertes par le client », « Bloquées en transit », « Filtres actifs : », « Dupliquer comme gabarit », « Sortir la sélection des archives », « Fin de la liste. », « Toutes les périodes »).
- À créer :
  - « Tout désélectionner » (`aria-label`) ;
  - « Actions groupées » (`aria-label` de la région `.lot`) ;
  - « Page du client » (`aria-label` de la modale) et « Fermer » ;
  - « Tout sélectionner » (le produit n'a que `lot.titre` pour l'en-tête de colonne) ;
  - « Affichage de N sur M commandes » (le produit : `surTotal`) ;
  - « 1 vue / N vues » pluriel (le produit : `vuesCourt`) ;
  - « Aucune commande archivée » (probablement `vide.archiveTitre`).
- Les textes de dates (« 30 sept. », « à 11 h 48 ») sont calculés en français dans le script, le produit passe par `next-intl` : rien à traduire à la main.

### 5. Risques
- **Performance à 9 600 commandes** : le produit est déjà conçu pour (curseur, index, pas de `count`, signatures locales). Les ressorts de la maquette (filtre en mémoire, tout afficher) ne s'y transposent pas. Le piège est de « porter » le comportement client et de perdre le curseur.
- **Chaque filtre est une navigation serveur** : rendu complet de la page (`lireCommandes` + `compterParEtat` + profil + 3 signatures). La maquette montre un fondu instantané. Il faut un retour visuel sans déformer l'URL-état ; `loading.tsx` ne se déclenche pas sur un changement de simple searchParam en général (à vérifier : la page est dynamique, un `<Suspense key>` serait nécessaire). Non mesuré.
- **Archiver/dupliquer/lot** : POST natif + redirection (document complet, défilement perdu). Les animations de la maquette (ligne qui se replie) ne sont pas réalisables sans repasser en Server Action, ce que `geste-liste.ts:14-38` a explicitement écarté (« le routeur client jette cette navigation en build de production », treize pistes fermées). À ne pas rouvrir sans nouvelle mesure.
- **Server Actions sérialisées** : si on passe l'archivage en Server Action avec animation, plusieurs gestes consécutifs s'attendent. `BoutonSoumissionUnique` existe pour la duplication (double-clic : deux copies décomptées du quota, audit du 24/09).
- **Recherche globale** : aujourd'hui elle recharge `/commandes?q=` ; la maquette filtre sur place quand on est déjà sur Commandes (`surPlace`, `coque.js:33-41`). Au produit, c'est une navigation GET ; un `useTransition` donnerait le ressenti.
- Au mobile, le FAB « Nouvelle » disparaît dans la maquette au profit de l'icône de la barre du haut ; le test de présence du FAB (`bottom-[102px]`) est lié à la barre d'onglets.
- Le quota gratuit est maintenant de 5 commandes / 5 colis (commit postérieur à `d1f3389`) et le quota rend la place aux brouillons : le texte est lu en base (`lire_plafond_gratuit_a_vie`), donc aucune valeur à recopier. La maquette ne mentionne aucun nombre dans ces écrans.

---

## Envois (`/[locale]/envois`)

### 1. Fichiers du produit
- Page : `src/app/[locale]/(app)/envois/page.tsx` (147 lignes).
- Composants : `src/components/envois/tableau-envois.tsx` (1 379 lignes), `src/components/envois/en-tete-envois.tsx` (client : « Actualiser » = `router.refresh()` dans un `useTransition`).
- Export de la sélection : `src/app/api/envois/export/route.ts` + `lib/envois/export-csv.ts`.
- Lib : `lib/envois/liste.ts`, `lib/tracking/{silence,transporteurs}.ts` + `transporteurs.json` (3 502 entrées).
- Réutilise `FriseCompacte` de `components/commandes/frise-suivi.tsx`.

### 2. Données lues
- `lireEnvois` (table `tracked_parcels`, pagination par curseur, `PAR_PAGE = 50`, `liste.ts:255-358`).
- `compterEnvois` (rpc `compter_envois`) ; si `null`, l'écran **lève** (L99-101) pour ne pas rendre des tuiles fausses ; la frontière d'erreur de la section prend le relais.
- `lireFraicheur` (dernière mise à jour) et `lireEvolution` (variation mensuelle « pris en charge »).
- Paramètres URL : `etat`, `silencieux=oui`, `abandonnes=oui|non`, `transporteur`, `q`, `tri` (`immobiles`/`recents`/`anciens`), `curseur`.
- Rendu 100 % serveur ; seul îlot client = `EnTeteEnvois`.

### 3. Liste à cocher (produit)
- [ ] En-tête : titre, sous-titre, bouton « Actualiser » (spinner pendant la transition) + « Dernière mise à jour » (omis si aucun colis).
- [ ] 5 tuiles-liens qui filtrent : Tous les envois (+ évolution % ce mois, omise si mois précédent vide) · Pas encore scannés · En transit · Sans mouvement (alerte si > 0) · Livrés ce mois. Au téléphone seulement « En transit » et « Sans mouvement » (2 colonnes).
- [ ] Barre de filtres : recherche (GET, numéro) · menu Statut (Tous / 4 états / Sans mouvement ambre / Suivi arrêté) · menu Transporteur (déduit des lignes visibles) · menu Tri (3 options). Tout par `<details>` + liens ; la recherche préserve les filtres (champs cachés).
- [ ] Tableau ≥ `xl` : 10 colonnes (case, suivi mono, commande(s) jusqu'à 2 + « +N », client(s), transporteur avec monogramme, statut, progression, dernière mise à jour (date + ancienneté, ambre si silence), prochaine étape (date prévue / « aujourd'hui » / silence / dernier point), interrogations, menu « … »). Mon relevé s'est arrêté à la colonne actions (L1202-1239) ; la colonne « Interrogations » est annoncée dans le commentaire du `colgroup` (L945-954) et l'en-tête `colonnes.*` ; je ne l'ai pas relue ligne à ligne (le fichier est tronqué entre L1099 et la fin de la ligne d'actions que j'ai lue).
- [ ] Menu « … » : jusqu'à 3 « Voir la commande {référence} » + « Site du transporteur » (nouvel onglet) ; menu absent si aucune action.
- [ ] Lot : cases, barre « Exporter la sélection » (GET `/api/envois/export`, via `:has(:checked)`), pas de case « tout cocher ».
- [ ] Cartes < `xl` : numéro + puce, phrase « prochaine étape », ligne secondaire (clients · ancienneté · interrogations · « suivi arrêté »).
- [ ] Ligne ambre si silence > 10 jours ; badge « suivi arrêté ».
- [ ] États vides : « compte vide » vs « filtre » + lien « Tout effacer ».
- [ ] Bandeau d'aide (numéro tout juste collé ≠ erreur) en pied de tableau et en carte mobile.
- [ ] Pied : « Affichage de 1 à N sur total » + « Page suivante ».

### 4. Écarts avec la maquette (`envois.html` + `envois.js`)
(a) **Produit sans équivalent dans la maquette** :
- Colonne « Interrogations » (la maquette la met en infobulle de la colonne « Dernière mise à jour », `envois.js:135`).
- Plusieurs commandes liées par colis (jusqu'à 3 actions, « +N » références) : la maquette a 1 commande par colis.
- Filtre « Suivi arrêté » existe dans la maquette (`STATUTS`, L69) mais `e.abandonne` n'est jamais défini dans le jeu : filtre vide.
- Pagination par curseur (la maquette n'a que « Affichage de 1 à N sur M envois »).
- Monogramme du transporteur (tuile avec initiales + couleurs du catalogue) : la maquette affiche le nom seul.
- Évolution mensuelle réelle.
- Bandeau d'aide en pied de tableau et carte mobile (la maquette le place **avant** la liste : `aide-envois`, `envois.html:55`).
- Cartes mobiles.
- Erreur levée quand le comptage échoue.

(b) **Maquette sans équivalent dans le produit** :
- **Design/mouvement à porter**
  - Tuiles en boutons `aria-pressed` ; le fond change selon l'état sélectionné.
  - Mini-frise de progression (`mini-frise`) avec animation d'entrée décalée (`envois.js:228`), à comparer à `FriseCompacte`.
  - Rafraîchissement de la liste en fondu ; menu déroulant animé ; recherche à la frappe (160 ms de debounce, `envois.js:191`).
  - Bouton « Actualiser » avec rotation 700 ms (`tourne-actualiser`) : le produit tourne pendant la vraie transition.
- **Fonctionnalités nouvelles à signaler**
  - **Recherche à la frappe** : au produit, c'est un GET à l'entrée. À la frappe = une requête par pause de 160 ms sur `tracked_parcels`.
  - **Le tri par défaut « Ce qui ne bouge plus »** : déjà au produit (`immobiles`).
  - **Recherche limitée au numéro** (`q.toUpperCase().replace(/[^A-Z0-9-]/g, "")`) : c'est déjà la règle du produit (je n'ai lu que le commentaire L76-78 ; le `z.string` exact n'a pas été vérifié).
  - Colonne « Progression » : déjà au produit.
  - Un test « Pas encore scanné » : déjà au produit (`preparation`).
  - Libellé « Sans mouvement » du statut sans nombre de jours : déjà au produit (la durée passe en « prochaine étape »).
  - « Exporter la sélection » : annonce de maquette ; au produit c'est un vrai GET.
  - Cases « tout sélectionner » avec état indéterminé : le produit n'en pose pas (`tableau-envois.tsx:975-986` explique que sans JS elle serait inerte).
  - Prévision d'arrivée (« Livraison prévue le … ») : déjà au produit (`estimated_from/to`).

(c) **Textes**
- Repris : tous (« Suivi d'envois », « Dernière mise à jour », « Actualiser », « Tous les statuts », « Tous les transporteurs », « Rechercher un envoi… », « Ce qui ne bouge plus », « Mis à jour récemment », « Exporter la sélection », « Un numéro tout juste collé… »).
- À créer :
  - « Tout sélectionner » / « Sélectionner le colis {numéro} » (ce dernier existe : `lot.selectionner`) ;
  - « Sélection » (région `.lot`) ;
  - « colis sélectionné(s) » (pluriel) ;
  - « Tout désélectionner ».
- La maquette écrit « il y a N jours » avec espace insécable ; le produit utilise `mouvement.jours`.

### 5. Risques
- La maquette trie tout en mémoire (19 colis). Le produit pagine à 50 par curseur et ses menus de transporteur sont déduits **de la page courante** (`tableau-envois.tsx:455-462`) : un transporteur absent de la page 1 n'apparaît pas dans le menu. Je n'ai pas mesuré à volume ; c'est une limite existante, pas introduite par la maquette.
- « Actualiser » : ne pas lui faire interroger le fournisseur de suivi (palier de 200 prises en charge à vie ; `en-tete-envois.tsx:23-38`). La maquette simule 700 ms ; ne rien y ajouter.
- Une recherche à la frappe multiplierait les lectures sous RLS ; les limites de débit s'appliquent aux routes `/api/*`, pas aux pages.
- Lecture déjà en échec : l'écran lève, alors que la maquette n'a pas d'état d'erreur propre (`erreur-espace.html` existe, hors de mon périmètre).

---

## Analyses (`/[locale]/analyses`)

### 1. Fichiers du produit
- Page : `src/app/[locale]/(app)/analyses/page.tsx` (282 lignes).
- Composants : `src/components/analyses/{compteurs-analyses,frise-semaines,repartition-colis,liens-par-jour,parts-transporteurs,activite-recente,plus-consultees,bandeau-analyses}.tsx`.
- Lib : `lib/analyses/activite.ts` (PERIODES L33, `SEMAINES_FRISE` L40, `PLUS_CONSULTEES` L43, `etatPanneauQc`), `lib/analyses/recente.ts`.

### 2. Données lues
8 lectures en parallèle (L99-109), mêmes qu'au tableau de bord plus `lirePlusConsultees` (table `orders`, `order_media`, limite 3), avec `etatPanneauQc` pour le panneau QC (indisponible / vide / parts). L'instant `maintenant` est pris une fois. Période par `?periode=`. Rendu 100 % serveur, aucun îlot client. Pas d'export (la maquette le dit aussi : `analyses.html:16`).

### 3. Liste à cocher (produit)
- [ ] En-tête : titre, sous-titre, sélecteur de période (liens).
- [ ] 5 compteurs.
- [ ] Rangée 1 (grille 1,6fr/1fr) : frise des semaines + répartition des colis.
- [ ] Rangée 2 (3 colonnes à partir de `xl`, 2 en `lg`) : liens par jour, transporteurs, activité récente.
- [ ] « Vos commandes les plus consultées » (3).
- [ ] « Réponses de vos clients » (approuvé/refusé/en attente, barres) ou « indisponible » / « vide ».
- [ ] Bandeau final « Propulsé par DropLink / Des analyses simples et utiles ».
- [ ] « Indisponible » par panneau.

### 4. Écarts avec la maquette (`analyses.html` + `analyses.js`)
(a) **Produit sans équivalent** :
- États « indisponible » et « vide » par panneau ; panneau QC avec trois barres ; frise 8/12 barres selon la largeur.
- Les 12 barres sont `<li>` + texte `sr-only` (lecture par lecteur d'écran) ; la maquette passe par `role="img"` + `aria-label` + table.
- Garde `exigerVendeur`.

(b) **Maquette sans équivalent** :
- **À porter (design/mouvement)** :
  - Graphiques SVG avec bulle au survol/focus et navigation clavier ←/→ ; animation d'entrée ; retracé au redimensionnement (`ResizeObserver`).
  - « Voir les valeurs » : table cachée sous chaque graphique.
  - Sélecteur de période à curseur coulissant, sans rechargement ; chiffres qui se fondent avec flou.
  - « Commandes les plus consultées » : barre proportionnelle par ligne (`consultee__barre`, `--p`) et rang.
  - « Réponses de vos clients » : taux en gros + barre empilée + légende (le produit : trois barres séparées). Ordre des parts : approuvé, sans réponse, refusé (gris entre vert et rouge, « validé au script dataviz »).
  - Total de colis en gros (`total-colis`).
  - Bandeau « À propos des analyses » stylisé (logo + « Des liens de suivi simples et puissants »).
- **Fonctionnalités nouvelles** :
  - Bascule de graphe (tableau de bord seulement).
  - Le total de colis (« 19 colis suivis ») dans la répartition.
  - Variation vs période précédente, colorée : déjà au produit.

(c) **Textes**
- Repris : tous les titres et aides.
- À créer : « Voir les valeurs », « Semaine du … », « Commandes créées », « Ouvertures » (bulle), `aria-label` de graphiques, « colis suivis », « des réponses approuvent les photos » (le produit n'affiche pas ce taux en gros), « Des liens de suivi simples et puissants » (slogan : à vérifier dans `analyses.bandeau.*`, non relu), « vue / vues » pluriel.

### 5. Risques
- Les graphiques SVG de la maquette sont dessinés à la largeur du conteneur en JS : demande un îlot client avec ses données sérialisées dans le HTML (8 lectures serveur déjà faites, donc OK) mais un retracé au redimensionnement.
- Remplacer la liste `<ul>` accessible par un SVG `aria-hidden` + `role="img"` perd la lecture barre par barre sans la table « Voir les valeurs » : à conserver comme équivalent.
- Page de 8 lectures + QC : aucun problème de volume (agrégats SQL).

---

## Synthèse des risques spécifiques demandés

**Performance à 9 600 commandes**
- `/commandes` : aucune régression si l'on garde curseur + `recherche` + vignettes bornées (déjà mesuré par le banc). Le danger est de reprendre la logique « tout en mémoire » de `commandes.js`.
- Le layout paie deux agrégats (`compter_commandes_par_etat`, `compter_envois`) à son propre rendu ; la barre du haut sticky ne change pas ça.
- Le tableau de bord charge 50 commandes + signatures pour en afficher 5 : à réduire (non mesuré).
- Mobile bas de gamme : ajouter graphiques SVG + animations + `grain` + bordure lumineuse = JS et peinture en plus sur l'espace que l'on laisse ouvert toute la journée. Le produit actuel n'a aucune animation sur `FondApplication` (« AUCUNE animation », `fond-application.tsx:12-14`). Je n'ai pas mesuré.

**Server Actions sérialisées**
- Candidats dans le périmètre : `creerBrouillon` (3 emplacements aujourd'hui, +1 dans la barre du haut si portée) ; l'archivage/lot/duplication sont volontairement hors Server Action (POST natif). Toute animation de ligne qui replie suppose une Server Action : à ne pas faire sans re-mesure.
- CLAUDE.md : « tout appel à un tiers est borné » ; `creerBrouillon` ne fait pas d'appel tiers visible dans ce que j'ai lu (non vérifié en profondeur).

**Transition entre écrans (le produit n'en a aucune aujourd'hui)**
- Ce que j'ai constaté : aucune transition de page ; `loading.tsx` seul. `motion` 13.2 est installé et utilisé (pastille de navigation, `layoutId`) ; React est en 19.1.0 (`package.json`), Next en 16.3.4, `next.config.ts:159` n'active que `experimental: { globalNotFound: true }` (pas de `viewTransition`).
- Non vérifié : si la `<ViewTransition>` de React est disponible sur 19.1.0 stable ou si le drapeau `experimental.viewTransition` de Next 16.3 est utilisable ici. À tester avant de choisir entre (a) CSS `@view-transition` (comme la maquette, `app.css:497-536`, uniquement pour la navigation inter-document, donc pas pour des navigations clientes de Next), (b) Motion sur un composant client qui enveloppe `children`, (c) rien.
- La maquette effectue (a) en JS en remplaçant `main#contenu` ; au produit c'est le routeur de Next qui échange le segment. Un échange animé exige de retarder le démontage de l'ancienne page (pas trivial avec le routeur) ; sinon on peut seulement animer l'entrée (240 ms, ±10 px) à l'arrivée du nouveau contenu, et garder la pastille de navigation animée (déjà faite).
- Attention : `PilulesFiltresAnimees` documente que `layoutId` de Motion échoue sur le contenu RSC (la pastille est remontée) : une transition fondée sur Motion et sur le contenu de page rencontrera le même obstacle (`pilules-filtres-animees.tsx:18-27`).
- Sous `prefers-reduced-motion` : la maquette neutralise tout (`app.css:228-231`, `434-436`, `529-536`) et la sonde du dépôt le vérifie. Idem pour `coque.js:73` (`reduit` figé au chargement : une préférence changée ensuite n'est pas prise en compte).

**Ce que je n'ai pas pu vérifier**
- Le diff `d1f3389..43ec195` (pas de shell).
- Rendu réel de la maquette et du produit ; mesures de performance ; tailles de bundle.
- Parité EN et zh-CN de `messages/*.json` (seul `fr.json` consulté, en grep ciblé).
- Détail du CSS mobile des écrans (`app.css` L447-500, 600-660, 692-705) ; je n'ai lu que les paliers de la coque.
- `lib/analyses/activite.ts` hors signatures ; `repartition-colis`, `parts-transporteurs`, `activite-recente`, `plus-consultees`, `bandeau-analyses`, `panneau.tsx`, `badge-statut.tsx`, `frise-suivi.tsx` non relus.
- Colonne « Interrogations » du tableau d'envois et le contenu exact du palier mobile du tableau de bord.
- La page `/p/<jeton>/apercu` comme source d'aperçu pour le survol/la modale. — **retiré, décision de Mehdi du 03/10/2026**

## Fichiers clés (chemins absolus)
- Coque : `/home/user/droplink2/src/app/[locale]/(app)/layout.tsx`, `/home/user/droplink2/src/components/app/{barre-superieure,navigation-vendeur,recherche-globale,cloche-alertes,fond-application,en-tete-ecran,tuile-metrique}.tsx`
- Tableau de bord : `/home/user/droplink2/src/app/[locale]/(app)/tableau-de-bord/page.tsx`, `/home/user/droplink2/src/components/tableau/*.tsx`
- Commandes : `/home/user/droplink2/src/app/[locale]/(app)/commandes/page.tsx`, `/home/user/droplink2/src/app/[locale]/(app)/commandes/geste/route.ts`, `/home/user/droplink2/src/components/commandes/{tableau-commandes,pilules-filtres,pilules-filtres-animees,panneau-filtres,selecteur-periode,puces-filtres-actifs,bandeau-quota,actions-ligne}.tsx`, `/home/user/droplink2/src/lib/commandes/{liste,geste-liste,url,actions,quota-atteint}.ts`
- Envois : `/home/user/droplink2/src/app/[locale]/(app)/envois/page.tsx`, `/home/user/droplink2/src/components/envois/{tableau-envois,en-tete-envois}.tsx`, `/home/user/droplink2/src/lib/envois/liste.ts`
- Analyses : `/home/user/droplink2/src/app/[locale]/(app)/analyses/page.tsx`, `/home/user/droplink2/src/components/analyses/*.tsx`, `/home/user/droplink2/src/lib/analyses/activite.ts`
- Maquette : `/home/user/droplink2/design/maquette/src/{coque.html,coque.js,tableau.html,tableau.js,analytique.js,commandes.html,commandes.js,envois.html,envois.js,analyses.html,analyses.js,v4.js}`, `/home/user/droplink2/design/maquette/src/css/app.css`, `/home/user/droplink2/design/maquette/outils/construire.mjs`
