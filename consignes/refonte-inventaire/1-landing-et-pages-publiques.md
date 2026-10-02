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

# Inventaire des écrans publics : produit (43ec195) contre maquette (d1f3389)

Lecture seule. Je n'ai pas pu lancer Bash (désactivé) : je n'ai donc ni compté d'octets ni exécuté la maquette, seulement lu les sources avec Read et Grep. Ce qui est supposé et non vérifié est marqué « non vérifié ».

## Constats transverses (à lire avant les écrans)

**1. Les pages légales de la maquette sont périmées.**
- `design/maquette/outils/pages-publiques.mjs` lit `fr.json` à l'ancienne structure (`L.conditions.objetTitre` etc., l.317-364).
- `conditions.html` a 8 sections, `confidentialite.html` en a 5, et il n'y a ni `mentions-legales.html` ni blocs h3, ul, tableau ou encart.
- Le produit rend 14, 10 et 6 sections, depuis `legal.pages.*` (`fr.json:233-975`).
- La date de la maquette est « 18 septembre 2026 » en dur (l.325). Le produit a `DERNIERE_MAJ` = 30/09/2026 (`page-legale.tsx:114`).
- Le générateur écrit aussi en dur GRATUIT=5, PRO=300 et PRIX="20 €" (l.14).

**2. La maquette transforme les textes du produit.**
- `texte()` et `titre()` (l.17-27) remplacent le tiret long par une virgule ou deux-points, et ajoutent des espaces insécables fines.
- Les titres de la maquette sont donc « X · DropLink » (« Tarifs · DropLink »). Ceux du produit sont « X — DropLink » (`fr.json:3056`, `legal.*MetaTitre`).
- Il faut décider si cette règle typographique vaut pour le produit. Si oui, ce sont des modifications de `fr.json`, `en.json` et `zh-CN.json`, plus la sonde de fumée (`scripts/fumee.mjs`, qui lit les titres).

**3. Le thème sombre est nouveau.**
- Il est absent du design system : CLAUDE.md dit « Chrome admin clair ».
- Il est implémenté par `@media (prefers-color-scheme: dark)` et `[data-theme="dark"]` (`base.css:61` et suivantes, `app.css:15-24`).
- Il y a un bouton clair/sombre dans chaque pied de page (`index.html:529-532`) et la clé `localStorage` « dl-theme ».
- Conséquences :
  - il s'applique à tout le site dès que l'OS est en sombre, sans que personne l'ait activé ;
  - il faut un script bloquant pour éviter le flash du mauvais thème, car la maquette l'applique par un `<script defer>` ;
  - `<html data-theme>` modifié hors de React pose un risque de warning d'hydratation, car `[locale]/layout.tsx:95` n'a pas `suppressHydrationWarning` ;
  - `tests/unit/couleurs-en-dur.test.ts` et `jetons-ancien-canevas.test.ts` rougiront sur des couleurs sombres en dur ;
  - la politique de confidentialité dit « aucun traceur » (`fr.json:792-821`) et liste les cookies : le choix de thème en `localStorage` n'y figure pas ;
  - `global-not-found.tsx` et `[locale]/error.tsx` devraient aussi appliquer le thème (la maquette le fait dans `etats.js:7`).
- À signaler à Mehdi : c'est une fonctionnalité nouvelle, pas du design.

**2 bis. Le mouvement dépend de la classe `.js` posée par un script.**
- `base.css:619-624` met `.js [data-entree]` et `.js [data-apparait]` à `opacity:0` ; `.js .l4-ligne` (l.1099) porte un `filter: blur(10px)`.
- La classe `.js` est ajoutée par un script différé (`l4.js`, `main.js`, `public.js`). Le contenu est donc visible, puis disparaît, puis revient.
- Dans Next, ces classes sur `<html>` seront mutées hors de React. Le h1 est le candidat LCP.
- Les h1 de la maquette sont faits de `<span class="l4-ligne">` en `display:block` sans espace entre eux (`index.html:54`). Le texte brut devient « Un seul lien.Toute la commande. » pour les moteurs et lecteurs d'écran.
- `scripts/fumee.mjs:881-926` compare le texte du h1 à `heroTitle1 + " " + heroTitle2 + heroTitleHl` : cette sonde sera à réécrire.

**4. Aucun îlot client n'existe aujourd'hui sur la landing.**
- Elle est prérendue et sans JS : `<details>` natif pour le burger (`page.tsx:258`) et le sélecteur de langue (`selecteur-langue.tsx`).
- `[locale]/layout.tsx:41-58` explique que `metadataBase` lit `origineConfiguree()` précisément pour garder la landing statique (« répond en 25 ms »).
- La maquette y ajoute beaucoup de JS :
  - chorégraphie du héros avec fils SVG et parallaxe (`l4.js:20-126`) ;
  - onglets du studio avec jauge et frappe animée (`main.js:114-245`) ;
  - nuancier avec algorithme de contraste porté (`main.js:46-95`) ;
  - démo QC, langues qui tournent, défileur, compteurs à rouleaux, mots qui s'allument au défilement, slug qui se tape.
- Chaque îlot demande son `<TraductionsClient espaces=[…]>`, et `traductions-expediees.test.ts` l'exige.
- L'algorithme de contraste existe déjà dans `src/lib/design/contraste.ts` (`resoudreAccent`) : à réutiliser, pas à recopier.
- Budget de l'impact : non mesuré.

**5. Textes : tout le catalogue de la landing est à réécrire.**
- La maquette est en français seul, avec des textes en dur dans le HTML et le JS (`LEGENDES`, `aria-label` du menu, etc.).
- Le produit traduit en FR, EN et zh-CN avec parité testée (`tests/unit/i18n-parite.test.ts`). `chaines-mortes.test.ts` exige que chaque clé soit appelée.
- Dès que `landing.kit.*` est remplacé, les anciennes clés doivent être supprimées dans les trois catalogues. Les exceptions listées dans `catalogue-chinois.test.ts:61-65` et `i18n-parite.test.ts:65` (`landing.kit.howHl`, `langues.fr`, `langues.en`) sont à reprendre.

**6. Le bloc de contenu de la coque publique est dupliqué dans le code.**
- En-tête, pied, fond et lien d'évitement existent dans `coque-publique.tsx`, dans `page-legale.tsx:226-364` (en-tête et pied recopiés) et dans `docs/page.tsx:163-467` (recopiés aussi).
- `tests/unit/cibles-tactiles.test.ts` balaie `src/` pour les pieds de page (références : l.293, 342 et 356).
- La maquette a UNE coque (`entete`/`pied` générés par `page()` dans `pages-publiques.mjs:36-115`). C'est l'occasion de fusionner les trois dans `CoquePublique`.

**7. Le lien à votre nom existe désormais.**
- `src/lib/routes/lien-au-nom.ts`, `lib/page-publique/lecture.ts:365` et `lib/boutique/reglages.ts:202` le portent.
- Le commentaire de `docs/page.tsx:79-87` est donc périmé : il dit que « lien personnalisé `droplink.fr/votre-boutique` » n'existe pas.
- Les promesses de la maquette sont donc cohérentes avec `passerPro.features.lien` (`fr.json:2961-2964`).

## Landing — `/[locale]`

**1. Fichiers du produit**
- `src/app/[locale]/page.tsx` (626 lignes).
- `src/components/landing/maquette-application.tsx` : `MaquetteApplication` (faux tableau de bord) et `TelephoneClient` (image `public/marque/maquette-page-client.webp`).
- `src/components/landing/illustrations-etapes.tsx`, `icones-reseaux.tsx` (`IconeTwitter`, `IconeInstagram`, `IconeYoutube`) et `selecteur-langue.tsx`.
- `LogoMarque` vient de `src/components/acces/coque-acces.tsx:72` (image PNG, `priority`).
- Avatars : `public/marque/avatar-1.jpg` à `avatar-5.jpg`.

**2. Données et métadonnées**
- Aucune lecture en base : `getTranslations("landing")` et `getTranslations("landing.kit")` seulement.
- `generateStaticParams` sur les trois langues (l.80). `robots: { index: true, follow: true, "max-image-preview": "large" }` (l.95), `alternatesDe` et `openGraphDe` (l.96-100).
- JSON-LD `donneesStructurees(langue, {nom, description})` (l.170, injecté l.219-224).
- Inclus dans `src/app/sitemap.ts:45` (chemin `""`, priorité 1).
- `donnees-structurees.ts:28-46` écrit explicitement : aucun `offers`, aucune `FAQPage`. La maquette ajoute une FAQ visible : ce serait le cas où un balisage `FAQPage` redevient licite, mais c'est à décider.

**3. Liste à cocher (à ne pas perdre)**
- Données structurées JSON-LD (l.219-224).
- Logo, lien vers `/{locale}` (l.231-233).
- Navigation à 5 entrées (l.180-186) : Fonctionnalités `#fonctionnalites`, Comment ça marche `#etapes`, Tarifs `/{locale}/tarifs`, Documentation `/{locale}/docs`, FAQ `/{locale}/docs#faq`. Visible seulement à partir de 1181 px.
- Sélecteur de langue compact dans l'en-tête (l.246) : `<details>` avec drapeaux importés, liens vers `/{code}`, `hrefLang`, `lang`, états actif, 44 px au téléphone.
- Se connecter (`/{locale}/connexion`) et Créer un compte (`/{locale}/inscription`), visibles à partir de 641 px.
- Burger sous 641 px : `<details>`, mêmes 5 liens plus connexion et inscription, `aria-label` = `k("menu")`.
- Héros :
  - badge « trust » avec 5 avatars ;
  - titre h1 en deux lignes avec un mot en dégradé (zh-CN : interligne 1,24) ;
  - chapeau ;
  - CTA principal vers `/inscription` ;
  - CTA secondaire vers `/{locale}/docs#lien` (exemple) ;
  - trois garanties `perk1-3` ;
  - 4 pastilles flottantes au-dessus de 1180 px ;
  - `MaquetteApplication` plus `TelephoneClient`, avec `zoom` sous 1181 px (l.376-383 : correction mesurée sur iPhone).
- Ligne « Utilisé par des vendeurs sur » avec six noms en texte (Vinted, ebay, amazon, shopify, Leboncoin, TikTok Shop) (l.396-407). Ce sont de faux logos : texte typographique, aucune licence.
- Six cartes de fonctionnalités (`f1-f6`).
- Section étapes `#etapes` avec trois cartes et illustrations décoratives (`aria-hidden`).
- Section témoignages `#temoignages` : 3 citations inventées, avatars et étoiles (l.470-499).
- Bannière finale en dégradé avec 2 CTA, un secondaire vers `/docs#lien`.
- Pied :
  - logo et slogan `footTag` ;
  - 4 icônes de réseaux, décoratives (l.545-550) ;
  - sélecteur de langue en bas, ouvert vers le haut ;
  - colonne Produit avec ancres, Documentation, Questions fréquentes, et Blog seulement si `locale === "fr"` (l.569-573) ;
  - colonne Société : À propos (`/docs#presentation`), Contact (`/docs#support`), Conditions, Confidentialité, Mentions légales ;
  - formulaire « Restez informé » (l.587-609) qui envoie vers `/inscription` sans liste de diffusion ;
  - droits avec l'année courante (l.211) ;
  - « Conçu pour les vendeurs » avec cœur.
- Cibles tactiles 44 px au téléphone sur les liens de pied (l.215), gardées par un test.
- Raccourcis `max-[901px]` et `min-[901px]` (palier à la valeur exacte).

**4. Écarts avec la maquette (`index.html` + `main.js`, `l4.js`, `v4.js`)**

(a) Produit sans équivalent dans la maquette
- Sélecteur de langue (en-tête et pied). La maquette n'a aucune notion de langue : à conserver impérativement.
- Lien Mentions légales dans le pied, absent côté maquette (obligation LCEN). À conserver.
- Lien Blog conditionnel au français (l.569). La maquette met Blog dans la navigation de toutes les pages publiques (`pages-publiques.mjs:35`) : en EN et zh-CN ce lien mène à un 404 voulu.
- Lien Signaler un contenu conditionnel (`signalementDisponible()`). La maquette l'affiche sans condition.
- JSON-LD de la landing, `alternates`, Open Graph.
- Lien « Contact » (`/docs#support`) et « À propos » : absents de la maquette. Décision à prendre, car le contact est utile côté légal.
- À RETIRER par décision de Mehdi, présents dans le produit et absents de la maquette :
  - badge « +2 500 vendeurs nous font déjà confiance » (`fr.json:60`, `page.tsx:296-313`) : chiffre inventé ;
  - les 5 avatars (`avatar-1` à `avatar-5`) ;
  - la section témoignages complète, avec clés `testiEyebrow`, `testiTitle`, `testiHl`, `testiSub`, `q1-3`, `q1-3role`, et les noms Yanis, Sarah, Mehdi (`page.tsx:204-208`) ;
  - la ligne de six « plateformes » (faux logos) ;
  - le formulaire newsletter non branché (l.587-609) ;
  - les 4 icônes de réseaux du pied.
- Les pastilles flottantes `chip1-4` : la maquette a une scène de héros différente.

(b) Maquette sans équivalent dans le produit
- Design et mouvement, à porter :
  - héros animé : lien dans une conversation qui se déplie en page client, avec fils SVG, parallaxe, tampon « Approuvées » (`l4.js:20-126`) ;
  - bande de 4 chiffres avec compteurs à rouleaux (20, 4, 3, 0) ;
  - section « problème » avec défileur de questions et phrase qui s'éclaire mot à mot ;
  - studio : 4 onglets (le client, les photos, le suivi, le lien) avec jauge auto, flèches et Home/End au clavier, pause au survol ;
  - sections « La page client » (cinq cases) et « Côté vendeur » (trois cartes) ;
  - bordure lumineuse qui suit le pointeur (`.v4-carte`) ;
  - grain SVG en fond (`base.css:1063`) ;
  - slug final qui s'écrit en boucle (`l4.js:196-213`) ;
  - barre d'en-tête qui change à `est-defile` (sans `backdrop-filter`, `base.css:197`) ;
  - sous `prefers-reduced-motion`, tout est posé en état final (`base.css:1252`, `l4.js:133`, `main.js:171`).
- Nouvelle fonctionnalité (à signaler seulement) :
  - **thème clair/sombre** (voir constat 3) ;
  - nuancier interactif et démo QC à Approuver/Refuser et « Changer d'avis » : pure démo, aucun appel ;
  - section tarifs et FAQ de 4 questions intégrées à la landing (le produit renvoie vers `/tarifs` et `/docs#faq`). Le tableau tarifaire de la landing est différent de celui de `/tarifs` (7 lignes avec « Suivi automatique », « Colis suivis », « Page à vos couleurs » contre 6 sur la page tarifs), et ses textes ne viennent pas de `passerPro.*` ;
  - liens `plan.html` (« Toutes les pages ») et `ancienne-landing.html` (« Voir l'ancienne landing ») dans le pied : ce sont des outils de relecture de la maquette, à ne jamais porter (`index.html:528`).
- Les faits chiffrés de la maquette (5 commandes, 5 colis, 300 par mois, 20 €) sont écrits en dur. Dans le produit, les plafonds viennent de `supabase.rpc("lire_plafond_commandes")` et `"lire_plafond_gratuit_a_vie"`, et le prix de `PRIX_PRO_EUR`. La landing devrait lire les mêmes sources que `/tarifs`.

(c) Textes
- La maquette introduit 100 % de textes neufs pour la landing (nouveau hero « Un seul lien. Toute la commande. », « Commencer gratuitement », « Aucun compte pour votre client », bento, FAQ, etc.). Ils sont à créer en FR, EN et zh-CN et à substituer à `landing.kit.*` (`fr.json:52-179`), après suppression des clés mortes.
- Quelques textes existent déjà et sont à reprendre : `tarifs.*`, `passerPro.*` (lignes du tableau de comparaison), `landing.kit.langues.*`, `landing.kit.langueChoisir`, `landing.kit.menu`, `landing.menu.docs`, `navigation.allerAuContenu`, `navigation.creerCompte`, `navigation.seConnecter`.
- Textes de la maquette qui contredisent ou risquent de contredire le produit :
  - `perk1` « Gratuit au lancement » (`fr.json:48`, `:68`) et `bannerSub` « Gratuit pendant le lancement. Aucune carte demandée. » (`:124`) sont périmés depuis le plan à 5 commandes à vie. Même chose dans `blog/[slug]/page.tsx:119-121`.
  - Dates et données de démonstration en dur : « 28 sept. », « 1 au 2 octobre », « Wissous », « Colissimo », « La Poste ».
  - Référence `6A4D21` : le produit dérive une référence `#DLK7842` de l'identifiant (voir CLAUDE.md). Non vérifié dans `commandes`.
  - « 20 photos ou vidéos par commande » : confirmé (`lib/storage/limites.ts:85`, 20 par défaut, réglable par variable d'environnement). « 4 étapes de suivi, datées » : non vérifié écran par écran.
  - « jusqu'à 3 vidéos par commande » (`quota.ts:314`) : non repris par la maquette.

**5. Risques d'intégration**
- Perf et rendu statique : la landing est aujourd'hui statique. Lui faire lire les plafonds la rendrait dynamique (cf. `tarifs` et `docs` avec `force-dynamic`, et le commentaire de `layout.tsx:41-58`). Alternatives : ISR avec `revalidate`, ou ne pas afficher de chiffres. À décider.
- Images : la maquette utilise `src="assets/img/..."` (`index.html:95-98`). En produit, il faut des imports statiques (`import x from "@/../public/marque/…"`), sinon le middleware de langue répond 307 et `/_next/image` renvoie 400 (`maquette-application.tsx:23-31`). Les `apercu-*.jpg` existent déjà dans `public/marque/`. Le symbole de la maquette est `symbole-84.png` ; le produit a `logo-droplink.png` et `logo-symbole.png`.
- CSP (`next.config.ts:91-112`) : `script-src 'self' 'unsafe-inline'`, `style-src 'self' 'unsafe-inline'`, `img-src 'self' data: blob:`, `font-src 'self'`, `form-action 'self'`. Le grain `data:` et les styles en ligne passent. `<script type="speculationrules">` (`construire.mjs:37`) concerne l'espace vendeur : non vérifié que `'unsafe-inline'` suffise pour la CSP. Aucun CDN de police ni de drapeaux (`flagcdn.com` bloqué, d'où l'hébergement local des drapeaux).
- Police : la maquette utilise `@font-face` avec `inter-latin` et `latin-ext`. Le produit utilise `next/font` avec l'axe `opsz` (`layout.tsx:17-30`) : à conserver. La maquette n'a pas la règle zh-CN `html[lang^="zh"] *{letter-spacing:0}` (seulement `.langues__ligne[lang="zh-CN"]`, `base.css:543`), alors que `globals.css:843` la documente. Les titres de la maquette utilisent des tracking négatifs : à vérifier en chinois.
- `backdrop-filter` : le produit le garde sur le badge et les pastilles (autorisé sur la landing). La maquette l'a retiré de l'en-tête (`base.css:197`, mesures de fluidité). Rien à faire sur la page client.
- Cibles de 44 px et 11,5 px mini : à reprendre dans les nouveaux composants (la maquette a des polices de 11-13 px dans les mini-maquettes `aria-hidden`, probablement exemptées : non vérifié).
- `<h1>` : voir constat 3 (texte brut sans espace) et la sonde de fumée.
- Une seule action au dégradé par écran (règle 3) : la maquette met `bouton--marque` sur le héros, la tarification et l'appel final ; à compter par écran.
- Hydratation : `suppressHydrationWarning` sur `<html>` ou migration en `useEffect`.
- Garde `jetons-ancien-canevas.test.ts` et `pilules-lisibles.test.ts` référencent la landing : non lus en détail.

## Tarifs — `/[locale]/tarifs`

**1. Fichiers.** `src/app/[locale]/tarifs/page.tsx` (277 lignes), `CoquePublique` (`src/components/coque-publique.tsx`).

**2. Données et métadonnées**
- `creerClientServeur()` puis `supabase.rpc("lire_plafond_commandes")` et `"lire_plafond_gratuit_a_vie"` (l.74-78). Une erreur est écrite avec `console.error` et le nombre disparaît de la page (l.80-87).
- Espaces de traduction : `tarifs`, `passerPro`, `navigation`. Prix via `PRIX_PRO_EUR` et `getFormatter`.
- `export const dynamic = "force-dynamic"` (l.33).
- `generateMetadata` : title, description (avec le prix), `alternatesDe(…, "/tarifs")`, `openGraphDe`. Pas de `robots` explicite (indexable). Dans le plan de site (`sitemap.ts:45`).

**3. Liste à cocher**
- Pastille « Tarifs » dans la coque, lien d'évitement, logo, Documentation, Accueil, Créer un compte (secondaire car la page porte le dégradé), pied légal.
- Eyebrow, h1, introduction.
- Carte Gratuit : prix 0 €, sous-titre, liste de 3 puces (`tableau.medias`, `tableau.couleurs`, quota à vie ou texte sans nombre), CTA « Créer un compte gratuit » (`/inscription`).
- Carte Pro : prix, 4 puces (`toutLeGratuit`, `features.lien.titre`, `features.marque.titre`, quota mensuel), CTA au dégradé (`/inscription`), note « Le Pro s'active depuis votre espace… » plus lien Se connecter.
- Tableau de comparaison :
  - en-tête sur grand écran, valeurs étiquetées par plan sur téléphone ;
  - les 2 lignes Commandes et Colis suivis disparaissent si un plafond est illisible (l.108-124) ;
  - lignes adresse, carte « Propulsé par DropLink », médias, couleurs ;
  - mention de facturation Lemon Squeezy `p("facture")` (l.265).
- Question finale avec lien `/docs#faq`.

**4. Écarts**

(a) Produit qui manque à la maquette
- Les plafonds lus en base. La maquette écrit 5 et 300.
- La note de facturation (« Le paiement est traité par Lemon Squeezy, qui émet la facture. Résiliable à tout moment… », `passerPro.facture`) : absente de `tarifs.html`. À conserver, car Lemon Squeezy exige un plan tarifaire détaillé (commentaire `tarifs/page.tsx:15`).
- Le repli quand un plafond est illisible, les `console.error`.
- Les clés `p("tableau.*")` du produit pour la carte « Propulsé par DropLink ».

(b) Maquette qui manque au produit
- Design, à porter : mêmes cartes mais en `v4-carte` (bordure lumineuse), apparition au défilement (`data-anime`), titre `l4-ligne`, tableau avec colonne Pro mise en avant (`tp__col-pro`), croix posées par `ResizeObserver` (`public.js:62-66`), en-tête principal avec navigation (`Comment ça marche`, `Tarifs`, `Documentation`, `Blog`).
- Rien de nouveau fonctionnellement.

(c) Textes : aucun texte neuf, la maquette les génère depuis `tarifs.*` et `passerPro.*`. Seul « Lire », « min » etc. concerne le blog. Voir constat 2 pour les tirets.

**5. Risques**
- `force-dynamic` doit rester (les plafonds se règlent dans l'administration).
- La coque doit offrir le lien « Blog » seulement en français.
- `maquette tarifs.html` n'a pas de `<main>` interne à la coque produit : `id="contenu"` doit rester dans `<main>` pour le lien d'évitement.

## Docs — `/[locale]/docs`

**1. Fichiers.** `src/app/[locale]/docs/page.tsx` (469 lignes), `src/components/docs/briques.tsx` (`CarteStatut`, `Encart`, `Etapes`, `Etiquette`, `LigneAuteur`, `Liste`, `Paragraphe`, `Question`, `SousTitre`, `Tableau`, `TitreSection`), `docs/sommaire-docs.tsx` (client), `sommaire-repliable.tsx`, `lien-ecran.tsx` (`LienEcran`), `commandes/badge-statut.tsx`.

**2. Données et métadonnées**
- RPC `lire_plafond_commandes` et `lire_plafond_gratuit_a_vie` (l.109-110), `console.error` si illisible (l.113-118).
- Espaces `docs`, `navigation`, `legal`. Prix via `PRIX_PRO_EUR`. Date de révision en dur `MISE_A_JOUR = 2026-09-14` (l.23).
- `force-dynamic` (l.37). title, description, `alternatesDe(…, "/docs")`, `openGraphDe`. Indexable.

**3. Liste à cocher**
- En-tête propre (recopié) : logo, pastille, Accueil (masqué sous 560 px), Se connecter, Créer un compte.
- Sommaire avec 5 groupes et 16 entrées, repliable sous 980 px, surbrillance de la section lue (client, seuil 120 px).
- Étiquette, titre, ligne auteur et date, résumé avec lien `#analyses`.
- Sections `presentation`, `demarrer` (lien d'inscription), `marque`, `commande`, `medias`, `suivi`, `statuts` (4 badges), `lien`, `envois`, `analyses` (tableau), `notifications`, `parametres`, `plans` (texte et tableau, repli sans nombre), `faq` (6 questions, `<details>`), `support`.
- Carte finale en dégradé avec CTA vers l'inscription.
- Pied : Contact (`#support`), Conditions, Confidentialité, Mentions légales, copyright.

**4. Écarts**

(a) Produit sans équivalent maquette
- Les nombres de plafonds lus en base, le repli textuel sans nombre.
- Le lien Mentions légales au pied (la maquette, `pages-publiques.mjs:88-100`, ne l'a pas).
- Les badges de statut réels (`BadgeStatut` avec icônes) : la maquette utilise `.doc-badge` maison.
- Le lien « Se connecter » dans l'en-tête de la docs (la maquette a un en-tête commun).

(b) Maquette sans équivalent produit
- Design : sommaire en `<details data-sommaire>` avec libellé de section courante, ouvert au bureau et replié sous 980 px (`public.js:68-95`), `doc-flux`, `doc-statuts`, `doc-encart`, bordure lumineuse.
- Un lien « Signaler un contenu » sous le support (`pages-publiques.mjs:232`) : le produit n'a pas ce lien dans la docs. Signaler le comportement conditionnel (`signalementDisponible()`), qui doit s'appliquer.
- Lien vers `client.html` dans « marque » : n'existe pas dans le produit. Le produit utilise `ancre("#lien")`.

(c) Textes : aucun texte neuf, tout vient de `docs.*`. Seule la phrase de la ligne « Sommaire » est en dur dans la maquette (`<span>Sommaire</span>`) alors que le produit a `legal.sommaireTitre`.

**5. Risques**
- `SommaireDocs` reste un îlot client avec `TraductionsClient`. La maquette en fait du JS global.
- Le commentaire de `docs/page.tsx:79-87` est périmé (voir constat 7).
- Date de révision : `MISE_A_JOUR` du 14/09 contre un contenu qui a évolué depuis. Non vérifié.

## Blog — `/[locale]/blog` et `/[locale]/blog/[slug]`

**1. Fichiers.** `src/app/[locale]/blog/page.tsx` (107 l.), `blog/[slug]/page.tsx` (133 l.), `src/components/blog/corps-article.tsx`, `meta-article.tsx`, `src/lib/blog/articles.ts`, `types.ts`, `src/contenu/blog/*.ts` (5 articles : `lien-qui-expire`, `suivre-un-colis-sans-boutique`, `ou-est-mon-colis`, `photos-controle-sans-dossier-partage`, `vendre-sans-boutique`).

**2. Données.** Aucun appel base : objets TypeScript compilés. Aucune traduction : textes en dur en français (`TITRE`, `DESCRIPTION`, « Le blog », « Vendre en direct… »). `generateStaticParams` limité à la langue du blog (`fr`). Métadonnées : `alternatesUneSeuleLangue`, `openGraphDe`, `donneesArticle` (JSON-LD, `<` neutralisé). Sitemap : `/blog` et chaque article en `fr` seulement (`sitemap.ts:59-62`).

**3. Liste à cocher**
- 404 (`notFound()`) pour toute locale autre que `fr` (l.60 et l.63) et pour un slug inconnu (l.66).
- Index : pastille « Blog », h1, description, grille 1 colonne (téléphone) ou 3 (bureau), cartes (étiquette, titre, résumé, meta date et durée).
- Article : lien « Le blog », étiquette, h1, meta, `CorpsArticle` (blocs `chapeau`, `titre`, `paragraphe`, `citation`, `liste`, garde `never`), carte d'appel finale (« Essayez sur votre prochaine commande », CTA `/inscription`, dégradé).
- JSON-LD de l'article.
- Coque : `enteteSecondaire` faux sur l'index et vrai sur l'article.

**4. Écarts**

(a) Produit sans équivalent maquette
- La garde fr-only et le JSON-LD.
- Le titre de page (`titreMeta`).

(b) Maquette sans équivalent produit
- Design, à porter : carte « une » mise en avant, libellé « Lire » avec flèche, barre de progression de lecture (`public.js:97-107`, îlot client), lien « Tous les articles », bloc « À lire aussi » (2 autres articles).
- Texte de l'appel final : la maquette utilise « Un seul lien pour toute la commande » plus `docs.ctaTexte`. Le produit a un texte différent, avec « Gratuit pendant le lancement », devenu faux.

(c) Textes : « Lire », « Tous les articles », « À lire aussi », « Toutes les pages » sont neufs et en dur. Le blog étant fr-only, la parité de catalogue n'est pas exigée, mais l'interdiction de chaîne en dur du CLAUDE.md est déjà enfreinte aujourd'hui par ce fichier.

**5. Risques**
- `generateStaticParams` et les routes `/en/blog` en 404 voulu : la maquette met « Blog » dans la navigation de toutes les langues.
- La barre de progression est un îlot client sur une page statique.
- La maquette lit `src/contenu/blog` (`pages-publiques.mjs:257`), donc ses articles sont à jour.

## Conditions, Confidentialité et Mentions légales

**1. Fichiers.** Routes : `src/app/[locale]/conditions/page.tsx`, `confidentialite/page.tsx`, `mentions-legales/page.tsx` (44 lignes chacune, simples coques de `PageLegale`). Composant : `src/components/page-legale.tsx` (366 l.). Textes : `messages/{fr,en,zh-CN}.json`, clé `legal.pages.{conditions,confidentialite,mentions}`.

**2. Données.** Aucun appel base. `t.raw("pages.<sorte>")` validé par Zod (`DocumentLegal` / `Bloc`, l.24-48 : blocs `p` (avec `si:"signalement"` optionnel), `h3`, `ul`, `table`, `encart`) ; un bloc mal formé lève au rendu. Gabarit `{prixPro}` rempli depuis `PRIX_PRO_EUR`, qui lève s'il manque. `signalementDisponible()` filtre les blocs conditionnels et affiche l'encart. Métadonnées : `legal.*MetaTitre` / `MetaDescription`, `alternatesDe`, `openGraphDe`. Date : `DERNIERE_MAJ` = 30/09/2026 (l.114). Les trois sont au plan de site (`sitemap.ts:45`).

**3. Liste à cocher**
- En-tête (recopié) : logo, pastille « Légal », Documentation, Accueil, Créer un compte.
- Sommaire en `<details>` sous 980 px, dans la colonne à partir de 980 px, entrées numérotées `1. Titre`, liens vers les trois pages, sans surbrillance de section active (décision documentée l.136-140).
- Encart « Un contenu à signaler ? » conditionnel : dans la colonne au bureau, en fin de document au téléphone.
- Pastille avec icône par sorte (`FileText`, `Shield`, `Scale`), h1, date « Dernière mise à jour », « Éditeur : Mahfoud SEDDIKI », chapeau, sections `h2` avec `id` et ancre, blocs.
- Pied : Conditions, Confidentialité, Mentions légales, Signaler (conditionnel), copyright.

**4. Écarts**

(a) Produit sans équivalent maquette : tout le contenu réel (14, 10 et 6 sections), les tableaux (durées, cookies, prestataires), les encarts, la page Mentions légales, le lien Mentions légales dans le pied, le filtre `si: "signalement"`, la validation Zod, la date de révision.

(b) Maquette sans équivalent produit
- Design, à porter : bandeau d'en-tête de page `pub-tete` (pastille, h1 avec `l4-ligne`, chapeau, meta) plus colonne `doc-cote` et `leg-encart`, numéros `leg-n` en `h2` (« 01 »), sommaire qui suit la lecture avec libellé courant (`public.js:68-95`). Ce dernier demande un îlot client que `page-legale.tsx:136-140` refuse expressément. Décision à prendre.
- Les pages `conditions.html`, `confidentialite.html` ne reflètent pas le contenu réel. La maquette est donc inutilisable comme source de texte ou de structure de blocs.

(c) Textes : aucun texte neuf pour les conditions. Les mots de la coque (« Sommaire », « Légal », « Dernière mise à jour ») existent. Les libellés `misAJourLe` et `editeur` de la maquette n'existent plus : ils sont devenus `misAJourDate` et `editeurLigne` (`fr.json:231-232`).

**5. Risques**
- Il faut rejouer le générateur avec la structure `legal.pages.*`, ou renoncer à générer et lire la maquette comme référence visuelle.
- Les blocs `table` et `encart` doivent être stylés dans la nouvelle coque (le design du tableau est dans `briques.tsx`).
- `tests/unit/pages-legales.test.ts` importe `documentLegal` (garder l'export et la signature).
- Si un sommaire dynamique est ajouté, il rendra la page cliente : coût de JS sur des pages de texte pur, avec `TraductionsClient`.

## Signalement — `/[locale]/signalement`

**1. Fichiers.** `src/app/[locale]/signalement/page.tsx` (135 l.), `src/components/formulaire-signalement.tsx` (157 l., client), `acces-champs.tsx` (`ChampAcces`, `BoutonPrincipalDs`), `traductions-client.tsx`, `src/lib/contact.ts`.

**2. Données.** Pas de base. Variable d'environnement `NEXT_PUBLIC_CONTACT_ABUS` via `adresseAbus()` : absente, vide, gabarit ou forme invalide donne `null`, et la page fait `notFound()` (l.62-65). Espace `legal` (clés `signalement.*`, `signalementTitre`, `signalementSurTitre`, `signalementMeta*`, `pastille`). Métadonnées : title, description, `alternatesDe(…, "/signalement")`, `openGraphDe`. Au plan de site. Pas de `robots` explicite.

**3. Liste à cocher**
- 404 si aucune adresse configurée ; le lien du pied disparaît de la même façon.
- Colonne gauche : pastille « Notification et retrait », h1, introduction, 3 étapes numérotées, avertissement `role="note"` (au bureau à gauche, au téléphone après le formulaire).
- Formulaire client (sans appel réseau) : champs lien (`type=url`), catégorie (select, 4 options `droits`, `illicite`, `donnees`, `autre`), description (obligatoire, 4 lignes), e-mail (`autoComplete="email"`).
- Soumission : `preventDefault`, puis `window.location.href = mailto:` avec sujet et corps composés (l.53-77). Rien n'est envoyé sans geste du visiteur.
- Phrase « Ce bouton ouvre votre messagerie… » et adresse en clair avec `mailto:`.

**4. Écarts**

(a) Produit sans équivalent maquette
- La condition d'existence liée à la variable d'environnement : la maquette écrit `abus@droplink.fr` en dur (`signalement.html:71,76`, `pages-publiques.mjs:389,394`).
- Validation HTML native. La maquette a la sienne (`novalidate`).

(b) Maquette sans équivalent produit
- Design, à porter : mise en page deux colonnes, carte de formulaire en `v4-carte`.
- Comportement nouveau, à signaler sans porter automatiquement :
  - validation en ligne avec messages d'erreur sous chaque champ, `aria-invalid`, focus sur le premier champ en faute (`public.js:113-139`) ;
  - panneau « Votre message est prêt » avec boutons « Copier le message » (`navigator.clipboard` avec repli par sélection) et « Ouvrir ma messagerie », le tout pour les visiteurs sans client de messagerie.
- Cette dernière est une vraie amélioration d'usage, mais c'est du comportement client neuf et des textes à traduire.

(c) Textes neufs (à créer en FR, EN, zh-CN) : « Votre message est prêt », « À », « Objet », « Copier le message », « Message copié », « Sélectionné, copiez-le », « Ouvrir ma messagerie », « Rien n'est envoyé tant que vous ne l'envoyez pas vous-même », et les trois messages d'erreur de validation (en dur dans `public.js:120-122`). Les autres textes viennent de `legal.signalement.*`.

**5. Risques**
- Ne pas supprimer le 404 conditionnel (CLAUDE : aucun canal sans destinataire).
- `form-action 'self'` n'affecte pas `mailto:` par `location.href` : comportement actuel conservé.
- Si le panneau « prêt » est porté, le formulaire reste un îlot client sous `TraductionsClient espaces=["legal"]`.

## 404 global — `src/app/global-not-found.tsx`

**1. Fichiers.** `src/app/global-not-found.tsx` (114 l.), `src/components/ecran-erreur-public.tsx` (`EcranErreurPublic`, `CLASSE_ACTION_ERREUR`), `public/marque/logo-droplink.png`. Drapeau `experimental.globalNotFound` dans `next.config.ts` (non relu ici).

**2. Données.** Lit la langue dans l'en-tête `x-next-intl-locale`, validée par `hasLocale(routing.locales, …)`, avec repli sur `routing.defaultLocale`. `getTranslations({locale, namespace:"erreurs"})`. Pas de `generateMetadata` : `<title>` (`introuvableTitre`) et `<meta robots noindex, nofollow>` dans le corps (l.91-92).

**3. Liste à cocher.** Propre `<html lang>` et `<body>` ; import de `./globals.css` et de la police `Inter` (variable `--font-corps`, axe `opsz`). Icône `Unlink`, titre, texte, bouton `<a>` natif vers `/{langue}` (pas un `<Link>`, car aucun routeur au-dessus), logo en tête et en pied. Trois langues.

**4. Écarts**
- (a) Produit sans équivalent maquette : la résolution de langue ; le `noindex` posé (la maquette `introuvable.html:7` le pose aussi) ; l'import de la feuille de style.
- (b) Maquette sans équivalent produit : design seulement (cadre `err-page`, grand symbole dans une tuile, bouton « Revenir à l'accueil » au dégradé), thème sombre (via `etats.js`).
- (c) Aucun texte neuf : `erreurs.introuvableTitre`, `introuvableTexte`, `introuvableRetour` (`fr.json:2520-2522`).

**5. Risques**
- Ce fichier remplace la racine : tout nouveau style ou script doit être importé ici.
- Il ne monte pas `TraductionsClient` : aucun îlot client dans cet écran.

## Erreur — `src/app/[locale]/error.tsx`

**1. Fichiers.** `src/app/[locale]/error.tsx` (48 l., client), `ecran-erreur-public.tsx`. L'espace `erreurs` est expédié globalement par `[locale]/layout.tsx:122`.

**2. Données.** `useTranslations("erreurs")`. Aucune base. Aucune métadonnée (pas de `noindex` explicite dans ce fichier : non vérifié).

**3. Liste à cocher.** Icône `TriangleAlert`, titre, texte, bouton « Réessayer » qui appelle `reset()` (`RotateCcw`), référence « Référence de l'incident : {ref} » **seulement si `error.digest` existe** (l.43-45).

**4. Écarts**
- (a) Produit sans équivalent maquette : la condition sur le `digest`. La maquette l'affiche toujours (`erreur.html:23`) et le dit en commentaire (l.14).
- (b) Maquette sans équivalent produit : l'état « en cours » du bouton (`aria-busy="true"`, délai de 650 ms avant la navigation) : ici `reset()` n'est pas asynchrone. Design : tuile d'icône 88 px, bouton au dégradé.
- (c) Aucun texte neuf.

**5. Risques**
- `frontieres-d-erreur.test.ts` référence cette frontière : garder son contrat (client, `reset`, `digest`).
- Ne rien importer qui exige un `getTranslations` serveur.

## Coque publique — `src/components/coque-publique.tsx`

**1. Fichiers.** `src/components/coque-publique.tsx` (116 l.). Utilisée par tarifs, blog, blog/[slug], signalement. Pas par docs, ni par la landing, ni par `PageLegale` (ils recopient leur propre en-tête et pied). `LogoMarque`.

**2. Données.** `getTranslations("navigation")`, `"legal"`, `"landing"`. `signalementDisponible()`. Paramètres : `locale`, `pastille`, `enteteSecondaire`.

**3. Liste à cocher**
- Lien d'évitement vers `#contenu` (`navigation.allerAuContenu`), premier élément focusable.
- En-tête collant et translucide avec `backdrop-blur-[12px]` (autorisé hors `/p/[token]`).
- Logo vers `/{locale}`, pastille de rubrique, Documentation (`landing.menu.docs`), Accueil (`legal.accueil`), Créer un compte (`navigation.creerCompte`) : dégradé ou secondaire selon `enteteSecondaire`.
- Pied : logo, nav « Pages légales » (Conditions, Confidentialité, Mentions légales, Signaler si disponible), copyright avec l'année.
- Cibles de 44 px au téléphone avec marge négative (gardées par `cibles-tactiles.test.ts:293,342`).
- **Aucun sélecteur de langue ici** : il n'existe que sur la landing.
- **Pas de lien Tarifs ni Blog** dans cette coque aujourd'hui.

**4. Écarts**

(a) Produit sans équivalent maquette
- Le sélecteur de langue (landing seule), le filtrage conditionnel des liens (Signaler, Blog en fr-only), le pied avec Mentions légales, le lien d'évitement.

(b) Maquette sans équivalent produit
- En-tête unique pour tous les écrans publics : logo + nom, navigation (Comment ça marche, Tarifs, Documentation, Blog) avec `aria-current="page"`, Se connecter, Créer un compte, menu mobile piloté par JS (`aria-expanded`, Échap qui ferme et rend le focus, fermeture au clic sur un lien) (`public.js:30-42`), `est-defile` par `IntersectionObserver`.
- Pied en 3 colonnes (logo + devise, Produit, Légal) et ligne basse avec bascule de thème.
- Nouvelle fonctionnalité : thème clair/sombre (constat 3).
- À ne pas porter : lien « Toutes les pages » (`plan.html`).

(c) Textes : devise « Un seul lien de suivi pour toute la commande. » (`landing.kit.footTag` existe déjà), « Produit », « Légal » (`landing.kit.footProduct` existe, « Légal » : non existant sous cette forme, `legal.pastille` = « Légal »), « Thème », « Clair », « Sombre », « Ouvrir le menu » / « Fermer le menu » (le produit a `landing.kit.menu` = « Menu » seulement). Les `aria-label` de la maquette sont en dur en français.

**5. Risques**
- Trois implémentations de l'en-tête et du pied existent (coque, `page-legale.tsx`, `docs/page.tsx`) : le moment est idéal pour les fusionner, mais `cibles-tactiles.test.ts` référence les noms de fichiers (l.293, 342, 356).
- Le menu mobile JS de la maquette est un îlot client. Le produit utilise aujourd'hui `<details>` sans JS ; le garder préserverait le zéro JS.
- Le sélecteur de langue ne doit pas être perdu : sans lui, les visiteurs de `/en` ou `/zh-CN` n'ont aucun moyen de changer de langue depuis les pages publiques (déjà le cas hors landing).
- Le lien Blog dans une navigation commune doit être conditionnel à `fr`.
- Un lien `/{locale}/…` de la coque est relatif à la langue ; les liens `index.html#studio` de la maquette devront devenir `/{locale}#…`.

## Récapitulatif des décisions à prendre (non tranchées dans ce rapport)

1. Thème sombre : porter ou non ?
2. Tiret long : appliquer la règle de la maquette aux catalogues ?
3. Landing : lire les plafonds en base (donc dynamique) ou rester statique sans chiffres ?
4. Sommaire des pages légales qui suit la lecture : accepter un îlot client ?
5. Panneau « Votre message est prêt » du signalement : porter ?
6. Liens Contact et À propos : supprimer ou garder ?
7. `FAQPage` JSON-LD maintenant qu'une FAQ visible existe sur la landing ?
8. Menu mobile : JS ou `<details>` ?

Fichiers produit clés : `/home/user/droplink2/src/app/[locale]/page.tsx`, `/home/user/droplink2/src/components/coque-publique.tsx`, `/home/user/droplink2/src/components/page-legale.tsx`, `/home/user/droplink2/src/components/landing/selecteur-langue.tsx`, `/home/user/droplink2/src/app/[locale]/tarifs/page.tsx`, `/home/user/droplink2/src/app/[locale]/docs/page.tsx`, `/home/user/droplink2/src/app/global-not-found.tsx`, `/home/user/droplink2/src/components/ecran-erreur-public.tsx`. Maquette : `/home/user/droplink2/design/maquette/outils/pages-publiques.mjs`, `/home/user/droplink2/design/maquette/src/index.html`, `/home/user/droplink2/design/maquette/src/public.js`, `/home/user/droplink2/design/maquette/src/l4.js`, `/home/user/droplink2/design/maquette/src/main.js`.
