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

# Inventaire page client + administration (produit 43ec195 vs maquette d1f3389)

Lecture seule. Aucun fichier modifié. Je n'ai pas de Bash : pas de `git`, rien exécuté, aucune mesure. Tout ce qui suit vient de la lecture du code.

**Vérifié dans le code : depuis la maquette, trois changements**
- Langue des pages client d'un compte neuf : `LANGUE_PAGE_CLIENT_PAR_DEFAUT = "en"` (`src/lib/boutique/reglages.ts:51`), qui doit rester égale au défaut de `shops.default_language` posé par la migration 205.
- Double authentification : la 186 la fait exiger EN BASE par `est_admin()` et `journaliser_admin()`. Elle concerne donc lectures et écritures, pas seulement les écritures.
- Renvoi d'un administrateur à un seul facteur : `src/lib/audit/garde.ts:96-112`, `:130-132`. Il est envoyé vers `/verification?suite=admin` (facteur déjà vérifié) ou `/parametres` (aucun facteur).

**Non vérifié**
- Les mentions légales : le pied de page client les porte déjà (`page-client.tsx:587-594`, clé `pied.mentions`), la maquette `client.html` ne les porte pas.
- Les catalogues `en.json` et `zh-CN.json` : seul `fr.json` a été lu. Je n'ai lu aucun test.

**Écart avec CLAUDE.md à signaler**
- `PLAFOND_COMMANDES_GRATUIT_A_VIE_DEFAUT = 5` dans `src/lib/audit/panneau.ts:89`.
- Maquette : `gratuitAVie: 5` (`admin.mjs:51`).
- Migration `210_le_gratuit_passe_a_cinq.sql` présente.
- CLAUDE.md parle encore de 15 commandes à vie.

---

## 1. Page client `/p/[token]` (+ `/apercu`, erreur, lien mort)

### 1.1 Fichiers du produit

| Fichier | Rôle |
|---|---|
| `src/app/p/[token]/layout.tsx` | Racine distincte. Quota `:134-135`, lecture mémoïsée `:137`, langue validée `:159-162`, `<html lang>` `:165`. Fond blanc en style en ligne `:186` (pas de classe, à cause du `body` de `globals.css`). Police Inter `:36-41`. `TraductionsClient` limité à `page-publique.erreur` `:208`. |
| `src/app/p/[token]/page.tsx` | `generateMetadata` `:56-73`. Page `:75-155` : vérif du nom brandé `PARAM_NOM`, quota, lecture, `notFound()`, `emettreApres(PAGE_PUBLIQUE_RENDUE)`, `<BaliseVue>` en enfant. |
| `src/app/p/[token]/apercu/page.tsx` | Même `PageClient` avec `apercu`, même quota et même compteur de jetons inconnus, aucune vue comptée. |
| `src/app/p/[token]/error.tsx` | Frontière d'erreur cliente. Seul îlot client de la zone d'erreur. Bouton « Réessayer » en `bg-ds-accent`. |
| `src/app/p/[token]/not-found.tsx` | Lien mort. Langue figée à `fr` `:38`. Logo DropLink, illustration PNG, CTA en aplat (`:78`), carte d'aide, pied. |
| `src/app/p/[token]/vue/route.ts` | `POST`, 204 dans tous les cas, 429 si quota dépassé. |
| `src/app/p/[token]/qc/route.ts` | `POST`, quota d'écriture, Zod via `arbitrerQc`, 200 / 404 / 429. |
| `src/app/p/[token]/notification/route.ts` | `POST` (e-mails de suivi), 202 / 400 / 404 / 429 / 503. |
| `src/app/p/[token]/media/[mediaId]/route.ts` | `GET` d'une URL signée pleine taille, 404 sinon. |
| `src/components/publique/page-client.tsx` | Corps de la page. Aussi rendu par `/apercu`. `Inerte` `:619-627`. |
| `src/components/publique/` (autres) | `carte-client.tsx` (`CARTE`, `TitreCarte`), `en-tete-boutique.tsx`, `carte-commande.tsx`, `visionneur.tsx`, `arbitrage-qc.tsx`, `historique-suivi.tsx`, `repli-historique.tsx`, `carte-livraison.tsx`, `carte-contact.tsx`, `reseaux-vendeur.tsx`, `carte-notifications.tsx`, `carte-propulsee.tsx`, `balise-vue.tsx`. |
| `src/lib/page-publique/` | `lecture.ts`, `vue.ts`, `qc.ts`, `notifications.ts`, `estimation.ts`, `repli-historique.ts`. |
| `src/lib/limitation/quota.ts` | Compteurs. |
| `src/lib/design/contraste.ts` | `resoudreAccent`. |
| `messages/*.json` | Espaces `page-publique` (fr.json `:1681-1788`) et `notifications.carte` (`:2997`). |
| `next.config.ts` | CSP et cadrage : `/p/:path*` en `frame-ancestors 'none'`, exception pour `/p/:token/apercu` (SAMEORIGIN, ~`:216-253`). |

### 1.2 Données et règles réelles

**Fonctions `security definer`, toutes via le client anonyme (sans session)**
- `lire_commande_publique` et `lire_medias_publics` : en parallèle, `lecture.ts:152-155`.
- `lire_suivi_public` et `lire_passages_publics` : `lecture.ts:335-336`.
- `verifier_slug_commande` : `lecture.ts:394`.
- Écritures : `arbitrer_qc` (`qc.ts:93`), `demander_notification` (`notifications.ts:71`), `enregistrer_vue` (`vue.ts:63`, client système, car un visiteur n'est personne).
- Aucune écriture au journal d'administration : le visiteur n'est pas audité.

**Jeton**
- Validé par `JetonPublic = ^[0-9A-Za-z]{16,64}$` avant toute requête (`lecture.ts:31`).
- Inconnu, révoqué, suspendu ou bloqué : un seul chemin, `null` puis `notFound()`.
- Le nom d'un lien brandé qui ne correspond pas fait la même chose (`page.tsx:130-134`).

**Limitation de débit** (`quota.ts`)
- 120 requêtes par minute et par adresse (`:239-243`).
- 20 jetons inconnus par minute (`:244-248`).
- 10 écritures publiques par minute (`:249-256`).
- Panne du compteur : la lecture AUTORISE, l'écriture REFUSE (`DEGRADATION`, `:114-128`).
- Un refus de quota rend `notFound()` sur la page et sur `/media` (pas 429), mais 429 sur `/qc`, `/notification` et `/vue`.
- `verifierQuotaPublique` est mémoïsée par rendu (`:567`). Le layout et la page ne consomment qu'une unité.
- « Quota de vues » : je n'ai trouvé aucun plafond de vues par plan.
  - Il n'existe que le comptage `enregistrer_vue`, dédupliqué par jour (empreinte d'adresse, classe d'agent, pays).
  - La vue du vendeur lui-même est exclue (`vue.ts:57-60`).
  - Rien n'est compté sans adresse ni agent (`vue.ts:55`).

**Langue de la page client**
- C'est `shops.default_language` (vendeur, pas URL), validée par `estLangueSupportee`, repli `fr`.
- Défaut `en` pour un compte neuf (`reglages.ts:38-51`, migration 205).

**`noindex` et titre**
- Layout `:80` et `generateMetadata` : `robots {index:false, follow:false, nocache:true}`. Aucune image de partage (`openGraph`/`twitter` à `undefined`).
- Titre neutre `page-publique.titre`, ou `lienInvalideTitre` pour un lien mort. Ne dit rien du jeton, du client ou de la référence.

**« Propulsé par DropLink »**
- `commande.boutique.marqueMasquee` (colonne `hide_droplink_brand`, migration 167, réservée au plan Pro, lu EN BASE). Carte absente si Pro et masquée (`page-client.tsx:530-541`).
- La carte porte la couleur du vendeur (`accent`), jamais le dégradé DropLink (`carte-propulsee.tsx:20-26`, `color-mix`).

**Couleur du vendeur**
- `resoudreAccent(boutique.couleur)` (`page-client.tsx:136`) donne `texte`, `interface`, `remplissage`, `surRemplissage`, `teinte`, `surTeinte`, `doux`, `surDoux`.
- Aucun `#fff`, `text-white`, `bg-white` ni `backdrop-blur` dans `src/app/p` et `src/components/publique`, sauf `visionneur.tsx` (fond noir qui lui est propre). Gardé par `tests/unit/page-client-couleurs.test.ts` (regex `COULEUR_EN_DUR` et `FLOU`).

**E-mails de suivi** : la carte n'existe que si `envoiClientConfigure()` (`page-client.tsx:510`), donc `EMAIL_CLIENTS_DE` posée.

**Îlots client** : inventaire nommé et bloquant dans `tests/unit/ilots-page-publique.test.ts` (repli-historique, visionneur, carte-notifications, balise-vue, arbitrage-qc, plus `error.tsx`). Tout nouvel îlot doit y être déclaré avec sa raison.

**Écritures en aperçu** : `tests/unit/apercu-page-client.test.ts` exige que tout `POST` soit enveloppé dans `Inerte`.

### 1.3 Liste à cocher : ce que la page FAIT

**En-tête boutique** (`en-tete-boutique.tsx`)
- [ ] Entièrement omis sans nom NI logo (`page-client.tsx:256`).
- [ ] Logo signé R2, rond 64/96 px.
- [ ] « Une commande de » + nom (seulement si nom).
- [ ] Description, seulement si nom (résolu en base, migration 147).
- [ ] Icônes de réseaux : Instagram, TikTok, WhatsApp et **site web** (4).
- [ ] Domaines revérifiés au rendu (`liensDuVendeur`, regex `MOTIFS`) ; un lien non conforme est omis.

**Carte « Votre commande »** (`carte-commande.tsx`)
- [ ] Référence courte `#XXXXXX` en `<h1>`. Sans référence (migration 153 absente), « Votre commande » devient le `<h1>`.
- [ ] Sous-titre « Suivi mis à jour automatiquement. ».
- [ ] Date estimée, avec règles de disparition (`estimationVisible`) : dépassée, livré, silencieux > 10 jours. Jour unique ou fourchette ; formatage en UTC.
- [ ] Frise à 4 étapes (préparation, expédié, en transit, livré). Statut affiché = max(statut commande, étape du colis), jamais de recul (`:129-132`).
- [ ] Dates par étape : préparation = création (omise si postérieure au premier mouvement), expédié = premier mouvement, livré = dernier mouvement, en transit sans date.
- [ ] Pastille « En cours » sur l'étape courante, « En attente » sur les suivantes, « Livré » atteint = fait.
- [ ] Bandeau d'état en une phrase + seconde ligne d'ancienneté :
  - « Pas encore d'information du transporteur ».
  - « Mouvement aujourd'hui » / « hier » / « Dernier mouvement il y a N jours ».
  - Préparation sans colis : « Le vendeur prépare votre commande. »
- [ ] Bandeau **silencieux** (> 10 jours) : ambre, « Aucun mouvement depuis N jours » + texte douane.

**Galerie** (`visionneur.tsx`)
- [ ] Titre + compteur « (N) ».
- [ ] Galerie vide : encart pointillé « Pas encore de photos ».
- [ ] Grille de carrés : 2 colonnes mobile, 3 en `md`, 5 en `lg`.
- [ ] 6 tuiles mobile / 10 bureau, avec tuile « +N » de dépassement. Les tuiles au-delà de la borne ne sont pas rendues (une vignette masquée par CSS serait téléchargée).
- [ ] La couverture choisie passe en tête (`page-client.tsx:306-312`).
- [ ] Première tuile `fetchPriority="high"`, les autres `lazy`.
- [ ] Repli quand la vignette manque : dérivée 900 px pour une photo, icône pour une vidéo (`apercuDe`).
- [ ] Pastille de lecture sur les vidéos.
- [ ] Plein écran créé à l'ouverture (la photo pleine n'est pas dans le document fermé).
- [ ] URL signée demandée à `/p/{jeton}/media/{id}` à chaque ouverture.
- [ ] Navigation : flèches clavier, Échap, balayage ≥ 40 px, boutons précédent/suivant, compteur « 3 / 12 ».
- [ ] Pellicule de miniatures, tuile courante cerclée.
- [ ] Piège de focus manuel, retour du focus à la vignette d'origine, `body` non défilable.
- [ ] Lecteur vidéo `preload="none"` avec `poster`.
- [ ] Filigrane = nom de la boutique, si `filigrane` (décidé en base), superposé à l'affichage.
- [ ] États « Chargement… » et « Cette photo n'est pas disponible ».

**Validation QC** (`arbitrage-qc.tsx`)
- [ ] Carte absente sans média.
- [ ] Deux boutons Approuver / Refuser, aux couleurs `remplissage` / `surRemplissage`.
- [ ] Refus en deux temps : le motif (≤ 1000 caractères) s'ouvre après « Refuser », avec Annuler.
- [ ] États « validée » / « problème signalé », avec `role="status"`.
- [ ] « Changer d'avis » (décision modifiable).
- [ ] Aucun retour optimiste : on affiche ce que le serveur a renvoyé (`qc`).
- [ ] Échec dit avec `role="alert"`.
- [ ] Inerte en aperçu.

**Historique du suivi** (`historique-suivi.tsx`, `repli-historique.tsx`)
- [ ] Carte absente tant qu'aucun colis n'est enregistré.
- [ ] Passages datés : phrase du transporteur en titre, lieu en détail, le plus récent porte l'accent et le camion.
- [ ] Repli au-delà de 6 étapes : 5 visibles + « Voir tout l'historique (N) » / « Réduire », reste rendu par le serveur et caché dès le premier rendu.
- [ ] Alerte « suivi arrêté » (`abandonne`).
- [ ] État « En attente du transporteur » (zéro passage, calme, jamais ambre).

**Colonne de droite**
- [ ] Informations de livraison : transporteur (si catalogue), numéro de suivi, date estimée, destinataire (texte libre), référence. Une ligne par donnée présente, carte omise sans ligne. Le numéro n'ouvre rien (pas de lien tiers).
- [ ] Contact : bouton vers le premier moyen parmi WhatsApp, Instagram, TikTok, site ; puces nommées (sans le site). Carte omise sans lien.
- [ ] Suivi par e-mail : champ + « Me prévenir » ; états envoyé / invalide / trop / erreur ; carte conditionnelle (voir plus haut) ; inerte en aperçu.
- [ ] Carte « Propulsé par DropLink » (gratuit).

**Pied de page**
- [ ] Trois liens vers les pages légales dans la langue du vendeur : conditions, confidentialité, mentions légales.
- [ ] Cibles de 44 px au toucher via `-my-3.5 min-h-11` (lu par `cibles-tactiles.test.ts`).
- [ ] Aucun « © DropLink » ni lien « Propulsé par » dans le pied.

**Mise en page**
- [ ] Mobile : sections plates pleine largeur, séparées par un filet, sans cadre (consigne explicite, `carte-client.tsx:10-15`).
- [ ] Bureau : conteneur 1 180 px, grille 1,72 fr / 1 fr, `lg:pt-[82px]`.
- [ ] 600 px max entre 768 et 1023 px.
- [ ] Fond teinté à partir de `md` seulement.

**Comptage et vue**
- [ ] `BaliseVue` : `POST /vue` avec `keepalive` après le rendu, sans corps, sans `AbortController`.

**Lien mort** (`not-found.tsx`)
- [ ] Même écran pour inconnu, révoqué, suspendu, bloqué et quota dépassé.
- [ ] Illustration, titre, sous-titre, CTA vers l'accueil (`target="_top"`, pour sortir du cadre de l'aperçu), carte d'aide, pied avec lien « Comment fonctionne DropLink ».
- [ ] Langue figée à `fr`, aucune couleur de vendeur.

**Erreur** (`error.tsx`)
- [ ] Icône d'attention, titre, texte « votre lien, lui, reste valable », « Réessayer ».
- [ ] Textes dans la langue du vendeur (via `TraductionsClient`).
- [ ] Aucun identifiant d'incident.
- [ ] Aucune couleur de vendeur.

**Aperçu** (`/apercu`)
- [ ] Même composant, aucune vue ni rendu compté.
- [ ] Arbitrage et e-mails `inert`.
- [ ] Cadrable par DropLink seulement.
- [ ] Même quota.

### 1.4 Écarts avec la maquette

La maquette décrit deux versions :
- `client.html` = **v3, la refonte** (corps de page : `client.js`).
- `client-produit.html` = fidèle à l'actuel (même structure que `PageClient`).
- `page-client.html` (fragment `.pc`) = **miniature d'imitation** injectée dans les écrans vendeur (`construire.mjs:16`, `main.js`, `tableau.js`, `commande.js`, `compte.js`).
  - Le produit a décidé le 26/09 de NE PAS imiter, mais d'encadrer la vraie page (`apercu/page.tsx:9-37`).
  - Ce fragment ne se porte pas : l'iframe affichera le nouveau design.

**(a) Dans le produit, sans équivalent dans `client.html` v3** (à garder ou à redessiner)
- Logo et description de la boutique, 3 des 4 réseaux, en-tête omis sans nom ni logo.
- États du bandeau : préparation sans colis, expédié, livré, silencieux (ambre), « pas encore d'information ».
- État « suivi arrêté » et état « en attente du transporteur ».
- Galerie vide, tuile « +N », repli d'aperçu manquant, pastille vidéo, filigrane, lecteur vidéo, états chargement / indisponible.
- Dates sous les étapes (la v3 les ajoute dans une autre forme, voir b).
- Texte « Propulsé par » (`carteDropLink.texte`, `.bouton`). La maquette ne garde que le surtitre et le titre.
- Lien « Mentions légales » (la maquette n'a que 2 liens, plus un lien de comparaison de démo).
- Carte « Suivi par e-mail » conditionnelle.
- Carte Contact conditionnelle (ordre WhatsApp > Instagram > TikTok > site).
- `Inerte` en aperçu.
- Fond blanc au rebond iOS : la v3 pose `#F4F5F8` (`.page-client--v3`), contraire à `layout.tsx:167-188`.
- Cartes aplaties au téléphone : la v3 passe en cartes flottantes (rayon 22, ombre) sur mobile.

**(b) Dans la maquette, sans équivalent dans le produit**

*Design et mouvement, à porter :*
- Hero pleine largeur à l'aplat `remplissage` (`.cv-heros`), titre d'état en `<h1>` 42/68 px (`max-width: 11ch`), cartes qui chevauchent (`margin-top: -48px/-60px`).
  - La référence descend en petite ligne : « Votre commande 6A4D21 · pour Léa M. ».
  - Aujourd'hui le `<h1>` est la référence.
- « Trajet » : ligne + arrêts + camion animé à gauche (`cn-rail`, camion 1100 ms).
- Barre de boutique en haut du hero avec une rondelle d'icône de réseau (verre translucide, sans flou).
- Bouton-carte « dernier mouvement » avec point pulsant (`cn-pouls`, infini) et lien « Historique du suivi (7) ».
- Carrousel horizontal à accroche (72 % de large, 4/5) avec compteur « 1 / 4 » en mobile ; grille de 4 au-delà de 640 px.
- Historique dans une **feuille** : monte du bas au téléphone (glisser pour fermer, voile aplat), glisse de la droite au bureau, regroupé par jours (« Aujourd'hui », « 29 sept. ») avec seulement l'heure.
- Aperçu des 3 derniers mouvements sur la page au bureau (`.cv-apercu-fil`).
- Entrée en fondu étagée (`cv-entree`, 40–45 ms par bloc).
- Coche animée du QC, titre « Votre validation » dans un cadre de 2 px teinté.
- Carte « Propulsé » compacte : lien pointillé avec symbole 14 px, flèche.
- Colonne de droite collante au bureau (`position: sticky`).
- `theme-color` du vendeur dans le `<head>`.
- Lien d'évitement « Aller au contenu ».
- Message d'erreur et QC : texte identique au produit.
- Lien invalide : icône + 3 anneaux animés au lieu de l'illustration PNG (`notif-onde`, protégé par `no-preference`).
- Erreur : même écran que le produit (`errc`).

*Fonctionnalité nouvelle à signaler :*
- **Lieux par étape du trajet** (« Lyon · 29 sept. », « Wissous · aujourd'hui », destination « Léa M. »), et l'aria-label qui les raconte.
  - Le produit n'a aucun rattachement passage → étape. Le commentaire de `historique-suivi.tsx:17-30` refuse d'interpréter les passages. À décider, c'est de la logique nouvelle.
  - Les données brutes existent (`passages[].lieu`, dates).
- Date de l'étape « en transit » (« 30 sept. » dans `page-client.html`, « Wissous · aujourd'hui » dans `client.html`) : le produit n'en pose pas (`dates.en_transit = null`).
- Compteur de position carrousel (JS, scroll).
- Mode sombre : la maquette contient des jetons `data-theme="dark"` / `prefers-color-scheme: dark` (`app.css:15-24`, `base.css:62,92`). Le produit n'a aucun `data-theme` (grep `src` : rien). `lien-invalide.html` et `erreur-client.html` lisent `var(--surface)`/`--fond`, donc deviendraient sombres sur `/p/` si on porte les jetons tels quels. `client.html` est en hex fixes, donc épargné. À trancher : ne rien porter du sombre sur `/p/`.
- Les liens « sortants » (`data-sortie`) sont des toasts de démo, pas des fonctions.

**(c) Textes**
- **À reprendre, existants** : tous ceux de `page-publique` (bandeaux, frise, galerie, qc, suivi, livraison, contact, historique, carteDropLink, erreur, lienInvalide*), `notifications.carte.*`. La maquette les reprend mot pour mot (vérifié sur `fr.json`).
- **Exploitables sans création** : `page-publique.pourClient` (« pour {nom} ») et `reseaux.titre` existent déjà, utilisés seulement par `libelles-apercu.ts:75,79` ; `galerie.position` (« {n} sur {total} ») pour « Agrandir la photo, 1 sur 4 ».
- **À créer en FR / EN / zh-CN** :
  - « Aller au contenu » (sur la page client).
  - « Mouvement aujourd'hui · 08:40 » sous forme heure.
  - Libellés de jours de la feuille (« Aujourd'hui », « Hier », date courte).
  - « Historique du suivi » + badge de compte.
  - « Photo N sur M » (vignettes de la pellicule).
  - Texte accessible du trajet (aria-label composé).
  - Compteur « 1 / 4 ».
  - Éventuellement « Voir la page actuelle » (démo : à ne pas porter).
- Maquette uniquement en français. Les trois langues restent à produire.

### 1.5 Risques précis

**Budget 300 Ko** (mesuré le 20/09 : 268 Ko, JS 174 / CSS 21 / police 73, marge 32 Ko, `layout.tsx:27-34`)
- Une feuille d'historique avec glissement, piège de focus et fermeture animée est un nouvel îlot (ou une extension de `repli-historique.tsx`). Le déclarer dans `ilots-page-publique.test.ts`.
- Le hero ajoute CSS mais pas de JS. Le carrousel avec compteur au scroll en ajoute un peu.

**LCP < 2 s**
- `.cv-entree` pose `animation: cn-entree 520ms both` avec `opacity:0` au départ et un délai de `i × 45 ms` (jusqu'à 8). Le `<h1>` du hero est dedans. Sur un téléphone lent, cela retarde le premier rendu significatif de ~0,5 à 0,9 s et peut dépasser le seuil. Le produit n'anime rien à l'arrivée.
- Aujourd'hui l'élément LCP est la première tuile (`fetchPriority="high"`). Dans la v3 la première vignette passe sous le hero et le bouton « dernier mouvement ».

**Photos de la v3**
- `.cv-photo img { width: 66%; mix-blend-mode: multiply }` dans un cadre 4/5 sur fond teinté. Fait pour des visuels détourés sur blanc. Des photos QC réelles seraient assombries et rapetissées.
- Tuiles de ~280×350 px à 72 % de la largeur : la vignette de 200 px sera agrandie et floue. Servir la dérivée 900 px (≈ 77–89 Ko) a déjà été mesuré et corrigé pour tenir le budget (`visionneur.tsx:138-143`, plafond de 20 Ko par vignette).
- Le carrousel mobile rend tous les médias (le produit limite à 6 tuiles + « +N », les autres non rendues).
- Aucune vidéo, aucun filigrane, aucun état d'aperçu manquant dans la maquette.

**Dégradé / flou**
- Aucun `backdrop-filter` ni dégradé DropLink dans `.cv-*` (le seul dégradé est un halo radial dérivé de `surRemplissage`, `app.css:1266`).
- Les hex en dur de la maquette (`#FFFFFF`, `#0B0B18`, `#6B6F8C`…) passent par `tests/unit/page-client-couleurs.test.ts`, qui interdit `#fff`, `text-white`, `bg-white`. À porter en tokens `ds-*` ou en `accent.*`.
- **Contraste** : le texte du hero est en `opacity: .75–.82` (`.cv-boutique small`, `.cv-ref`, `.cv-date small`, `.cv-trajet__etapes small`). `resoudreAccent` garantit 4,5:1 au texte PLEIN sur l'aplat ; l'opacité réduite peut passer sous le seuil sur un accent moyen. Le rail du trajet est à 28 % d'alpha.
- Le « lien mort » de la maquette fond `--accent` et `#A855E0` dans son arrière-plan (`.page-notif`). Le produit a un dégradé fixe lavande et un CTA en aplat ; règle 3 : à garder en aplat.

**Jeton jamais dans le HTML**
- Le jeton est déjà passé en propriétés (`token`, `jeton` : visionneur, arbitrage, notifications, balise de vue). Il est dans l'URL de toute façon. Aucun autre identifiant n'est exposé (pas d'id de commande, pas de `shop_id`, logo signé).
- À préserver dans le nouveau markup : aucune photo pleine dans le document tant que le visionneur est fermé (la maquette `client.js` l'applique via `<template>`), aucune clé R2 ni id interne en attribut `data-*`, aucun jeton en `href`. Sentinelle : `tests/rls/page-publique.test.ts`.
- Les images d'aperçu partagées (`openGraph`) restent interdites. `theme-color` n'est pas une fuite.

**Galerie avant détails sur mobile**
- Produit : colonne gauche (commande, galerie, QC, historique) puis colonne droite (livraison, contact, e-mails, propulsé) : galerie en 2e position.
- v3 : « dernier mouvement » → photos → validation → (fil caché) → livraison. Conforme, mais le bouton « dernier mouvement » passe devant les photos.

**Autres**
- `lien-invalide` : langue figée à `fr`, alors que les comptes neufs sont en `en`. Choix à acter (aucun vendeur connu).
- Tests à adapter : `cibles-tactiles.test.ts` (liens de pied), `visionneur-focus.test.ts`, `apercu-page-client.test.ts`, `apercu-client-cadre.test.ts`, `ilots-page-publique.test.ts`.
- Le `h1` du hero change : le contrôle de titre unique et de référence doit suivre.

---

## 2. Administration — éléments communs (valent pour chaque écran de la section)

**Garde et 404**
- `src/app/[locale]/admin/layout.tsx:61` : `exigerAdmin()`.
- `src/lib/audit/garde.ts:59-116` : quota admin d'abord (30 par minute, compteur distinct, REFUSE en cas de panne, `quota.ts:282-306,759-769`), puis profil, puis RPC `est_admin` en base, puis `notFound()`. Jamais 403. Refus d'adresse nommé une seule fois en console (`signalerAdminSansAdresse`).
- La double authentification est tenue EN BASE (migration 186) : `est_admin()` et `journaliser_admin()` refusent une session à un facteur, donc toutes les lectures auditées tombent aussi.
- Un administrateur sans second facteur est redirigé (`garde.ts:106-111`) vers `/verification?suite=admin` (facteur déjà vérifié, typiquement après un « appareil fiable », migration 203) ou vers `/parametres` (aucun facteur).
- Chaque page appelle aussi `exigerAdmin()` dans `generateMetadata` (sinon le titre fuit dans le corps du 404).
- Middleware : `src/middleware.ts:260-330` valide la session et le rôle sur `/admin`.
- **Pas de `loading.tsx`** dans le segment (`layout.tsx:29-48`) : un squelette révélerait la surface. Sentinelle `data-surface="administration"` (`layout.tsx:153`).
- Chaque Server Action porte sa propre garde (`exigerAdmin()`), le layout n'est pas un rempart.
- Tests-garde : `admin-sans-prechargement.test.ts` (tout `<Link prefetch={false}>`), `admin-sans-useactionstate.test.ts` (les actions s'appellent comme des fonctions puis `window.location.reload()`), `admin-refus-nomme.test.ts`, `filtre-admin-du-middleware.test.ts`, `tests/rls/admin-exige-double-facteur.test.ts`, `garde-admin-appelee.test.ts`.

**Coque** (`layout.tsx:152-269`)
- 8 entrées : Vue d'ensemble, Commandes, Comptes, Boutiques, Statistiques, Journal, Surveillance, Paramètres (même ordre que la maquette).
- Colonne de 240 px au bureau, bande supérieure + **barre d'onglets en bas** au téléphone (`NavigationAdmin`, `variante="onglets"`, bouton « Plus »).
- Fond dégradé léger fixe (`:155`).
- Encart « Tout est tracé », avatar = initiale de l'adresse, rôle, déconnexion.
- Lien d'évitement.
- **Aucun lien vers l'espace vendeur** (`layout.tsx:24`, volontaire).

**Audit** : toute lecture de données tierces passe par une RPC `security definer` qui écrit au journal dans la même transaction (sous la session de l'administrateur, aucun service-role). Lire le journal lui-même n'écrit rien (fonctions `stable`).

**Frontière d'erreur** (`error.tsx`) : `CarteEtatVide`, bouton « Réessayer », référence `digest` (clé `erreurs.*`, identique à la maquette).

**Éléments partagés dans `src/components/admin/`**
- `en-tete-admin.tsx`, `encart-trace.tsx`, `tuile-volume.tsx`, `recherche-admin.tsx`, `selecteur-admin.tsx`, `selecteur-periode.tsx` (7 / 30 / 90 jours).
- `anneau.tsx`, `anneau-statuts.tsx`, `courbe-commandes.tsx`, `graphique-lignes.tsx`, `graphique-barres.tsx`, `echelle.ts`.
- `carte-reglages.tsx`, `reglage-nombre.tsx`, `reglage-interrupteur.tsx`, `rangee-constatee.tsx`.
- `dialogue-suspension.tsx`, `plan-compte.tsx`, `blocage-lien.tsx`, `contestation-lien.tsx`.
- Les îlots reçoivent leurs libellés via `TraductionsClient espaces={[…]}`.

**Écarts communs à toute la section (maquette `outils/admin.mjs`, `src/admin.js`)**

*Design à porter :*
- Coque : sidebar logo + pastille « Admin », menu compte repliable, **fil d'Ariane** (`v4-fil`), cartes au rayon 22, info-bulles de graphiques (`data-info`, JS au survol), badges `adm-badge`, avatar de couleur d'après l'adresse.
- Dialogue modal unique pour suspension, plan, blocage et contestation.
- Animation d'entrée des barres de graphiques.

*Fonctionnalité nouvelle ou conflit à signaler :*
- **Recherche globale de compte dans la barre haute**, présente sur tous les écrans (`admin.js:29-34`, stocke `dl-adm-q` en `sessionStorage` puis ouvre la liste). Le produit n'a de recherche que dans les listes (comptes, boutiques, commandes), et chaque recherche écrit un critère au journal. Ce serait un point d'entrée d'audit nouveau.
- **Lien « Espace vendeur » dans le menu compte** (`admin.mjs:145`) : contredit `layout.tsx:24` (« aucun lien vers l'espace vendeur ni l'inverse », volontaire : une action admin lancée en croyant être chez soi serait tracée au nom de son auteur).
- **Tiroir de navigation** (hamburger) en étroit au lieu de la barre d'onglets : le commentaire `layout.tsx:136-146` choisit les onglets en bas parce qu'une navigation à faire défiler cache des entrées.
- **Mode sombre** admin (`data-theme`, `dl-theme` en `localStorage`, `admin.js:15`) : n'existe pas dans le produit.
- **`MOTIF_MIN` = 10 dans la maquette** (`admin.js:14`), 8 dans le produit (`suspension.ts:20`, repris par plan, blocage, contestation). Les textes de maquette disent « Au moins 10 caractères ». À aligner sur la valeur du produit (ou sur une décision).
- **Filtres et recherche côté client** sur lignes déjà chargées (`admin.js:36-70`), simulés. Le produit filtre côté serveur, par liens dans l'URL, avec curseur, et les critères entrent dans la trace. Ne pas porter la logique client.
- **La maquette ne montre jamais l'état d'indisponibilité** (« lecture non aboutie », tiret au lieu de zéro) que le produit porte partout.
- La fiche de compte de la maquette s'ouvre par ancre (`#c1`) sur une seule page. Le produit a une route `/comptes/[id]`.

*Aucun contenu de commande : la maquette le respecte.*

---

## 3. Vue d'ensemble — `admin/page.tsx`

**Fichiers** : `src/app/[locale]/admin/page.tsx`, `src/lib/audit/panneau.ts`, `src/lib/audit/comptes.ts` (`lireDernieresActions`), `src/lib/admin/nature-d-action.ts`, composants `tuile-volume`, `courbe-commandes`, `anneau-statuts`, `selecteur-periode`.

**Données et règles**
- RPC : `alertes_admin` (audité, action `panneau.alertes`, exclue de l'aperçu du journal par `ACTION_EXCLUE_DE_L_APERCU`, `comptes.ts:332`), `compteurs_admin`, `etat_veilleur`, `stockage_total_admin`, `repartir_commandes_admin`, `compter_commandes_par_jour_admin`, `lire_parametre_entier` (seuils), `lire_journal_admin` (4 lignes, lecture seule).
- Chaque lecture peut échouer sans emporter l'écran. Trois états : indisponible, vide, rempli. Un tiret au lieu d'un zéro.
- L'écran ne rend que des nombres. Le kit pose un tableau « Dernières commandes » avec pseudo de client : refusé (il faudrait un audit à chaque ouverture).

**Liste à cocher**
- [ ] Section « Ce qui demande une décision » : trois états (indisponible / aucune alerte / liste).
- [ ] Alertes : `colis_au_dessus_du_seuil` (critique, rouge) et `veilleur_en_retard` (ambre), la gravité vient de la base. Valeur ET seuil dans le titre. Bouton neutre « Examiner » vers `/comptes?q=…` ou `/surveillance`.
- [ ] Cinq tuiles : « Colis pris en charge » (encadrée, badge « FACTURÉ »), comptes actifs (dont suspendus et sans type), commandes, boutiques (dont nommées), stockage (« Indisponible » si non mesurable).
- [ ] Ligne « compteurs indisponibles ».
- [ ] Courbe des commandes par jour avec sélecteur de période 7 / 30 / 90 (`?jours=`, repli 30).
- [ ] Anneau des statuts de commandes (4 parts) ; absent si total 0 ; message si illisible.
- [ ] « Dernières actions d'administration » : 4 lignes, **bureau seulement**, tuile d'icône par nature d'action (suspension, réactivation, paramètre, consultation), libellé traduit ou action brute, e-mail de la cible, temps relatif. Lien « Tout le journal ».
- [ ] Tout lien avec `prefetch={false}`.

**Écarts avec la maquette `admin.html`**
- (a) Dans le produit sans équivalent maquette : sélecteur de période (la maquette affiche une étiquette fixe « 30 derniers jours »), états indisponible / vide, alerte `veilleur_en_retard`, tuiles « dont suspendus et sans type », dernières actions à 4 lignes (la maquette en montre 5).
- (b) Dans la maquette sans équivalent produit :
  - Deux alertes dans « Ce qui demande une décision » : **doublons** (« 4 comptes, sur 2 identifiants partagés ») et **contestation du blocage de #7E0B6D**. Fonctionnalité nouvelle. Les doublons sont déjà comptables (`compterDoublons`). Il n'existe **aucune fonction qui compte globalement les contestations en attente** (`contestations_en_attente_parmi` prend des identifiants de commandes). À créer. Rapprocher de la contrainte « aucun contenu de commande ».
  - Barres plutôt que courbe (design).
  - Ligne de journal avec lien « Compte visé » (cf. §9).
- (c) Textes : tout est issu de `admin.panneau.*` (maquette = produit). À créer : libellés des deux alertes ajoutées (EN, zh-CN aussi).

**Risques** : pas de contenu de commande, mais l'alerte « contestation » ne doit pas montrer son message. Elle ne doit pas non plus créer une lecture non tracée (la lecture du message est tracée à l'ouverture du dialogue, pas au rendu).

---

## 4. Comptes — `admin/comptes/page.tsx`

**Fichiers** : `page.tsx`, `src/lib/audit/comptes.ts` (`listerComptes`, `ParametresComptes`, curseur), `src/lib/audit/doublons.ts` (`compterDoublons`), `empreinte-admin.ts`, composants `recherche-admin`, `selecteur-admin`, `tuile-volume`, `anneau`, `encart-trace`.

**Données et règles**
- RPC : `lister_comptes_admin` (audité : critères q + statut + page, une ligne par consultation), `compteurs_admin`, `compter_inscriptions_admin` (30 jours), `compter_doublons_admin` (compte seulement, n'écrit rien), seuils.
- Pagination PAR CURSEUR, 50 par page, le curseur n'est jamais gardé quand on change de filtre.
- Colonne « Commandes » compte le contenu réel (migration 111).
- Un compte administrateur porte une pastille « Administrateur » à côté du nom.
- Aucune colonne de plan dans `LigneCompte` (le plan n'est lu que sur la fiche).

**Liste à cocher**
- [ ] En-tête + encart de trace (le sous-titre est masqué au téléphone, l'encart le redit).
- [ ] 4 tuiles : total (dont sans type), nouveaux inscrits sur 30 jours (« Indisponible » si lecture muette), actifs (% du total), suspendus (% du total). Deux colonnes au téléphone.
- [ ] Barre de filtres : recherche (adresse ou nom de boutique), sélecteur de statut (Tous / Actifs / Suspendus), « Réinitialiser ».
- [ ] Liste : tableau à partir de `xl` (7 colonnes : Compte, Type, Statut, Commandes, Colis, Inscrit le, Action), cartes en dessous.
- [ ] Nom de boutique ou « Pas encore nommée » en italique ; type ou « Non déclaré » ; pilule d'état ; colis rouge et « 1 840 / 1 200 » quand le seuil est dépassé ; date ; « Ouvrir » vers la fiche.
- [ ] Carte suspendue fond rouge au téléphone.
- [ ] Trois états vides distincts (aucun compte / aucun avec ce filtre / aucun pour cette recherche).
- [ ] « Voir la suite » (curseur, filtre conservé).
- [ ] Colonne de droite à partir de `2xl` : anneau Actifs / Suspendus (que des nombres) et panneau « Comptes en doublon » (nombre + lien seulement s'il y a quelque chose, n'écrit rien).

**Écarts avec la maquette `admin-comptes.html`**
- (a) Produit sans équivalent : bouton « Réinitialiser », 3 états vides distincts, pastille « Administrateur », carte rouge des suspendus, 3 écrans de rendu (tableau / cartes), colonne `statut` filtrable en base, curseur.
- (b) Maquette sans équivalent :
  - Design : avatar rond coloré d'initiales, mini-barre de progression des colis (`adm-colis`) avec info-bulle, lien « Comptes en doublon » en carte-bouton.
  - **Fonctionnalité nouvelle** : badge **Pro** à côté du nom dans la liste. `listerComptes` ne renvoie pas le plan ; il faudrait étendre `lister_comptes_admin` (nouvelle migration, nouvelle arité, `drop` explicite). À signaler.
  - Filtres en boutons-pilules et recherche instantanée sur les lignes déjà chargées : simulation maquette, ne pas porter.
- (c) Textes : `admin.comptes.*` existants. La maquette reprend les libellés du produit. À créer : rien d'évident ; vérifier EN et zh-CN.

**Risques** : la liste nomme des vendeurs : toute recherche reste auditée (critères écrits). Ne rien ajouter qui lise un contenu de commande. Un badge Pro exige l'extension de la RPC avec audit inchangé.

---

## 5. Fiche de compte — `admin/comptes/[id]/page.tsx` + `actions.ts`

**Fichiers** : `page.tsx`, `actions.ts` (`suspendre`, `reactiver`, `definirPlan`), `src/lib/audit/comptes.ts` (`lireCompte`), `suspension.ts`, `plan.ts`, composants `dialogue-suspension.tsx`, `plan-compte.tsx`, `encart-trace.tsx`.

**Données et règles**
- RPC : `lire_compte_admin` (**auditée même quand le compte n'existe pas**, `page.tsx:57-62`), `lire_plan_compte`, `suspendre_compte`, `reactiver_compte`, `definir_plan_compte` (chacune trace le geste avec motif et empreinte, dans la même transaction que le geste).
- `id` inconnu ou illisible : `notFound()` après audit.
- Titre neutre (`fiche.titre`), jamais l'adresse du compte.
- E-mail attendu pour la confirmation relu EN BASE (pas transporté depuis le formulaire, `actions.ts:28-31,58-62`).
- `MOTIF_MIN = 8`, `MOTIF_MAX` ; zod sur les entrées.
- Après succès : `revalidatePath("/[locale]/admin/comptes/[id]", "page")` puis rechargement complet.
- Aucun contenu de commande, de client ni de média. Même la frise d'activité est agrégée (type, jour, nombre).

**Liste à cocher**
- [ ] Retour vers la liste (lien, pas d'historique).
- [ ] En-tête : pastille de la couleur d'accent du vendeur, nom de boutique ou « Pas encore nommée », pilule d'état, phrase de résumé (e-mail, type, date d'inscription).
- [ ] Encart de trace.
- [ ] Volumes : « Colis pris en charge » encadré avec « FACTURÉ », commandes, médias, stockage.
- [ ] Plafonds : colis contre seuil (barre bornée à 100 %, rouge et « dépassé de N » si dépassé) ; quota de commandes selon le plan (« à vie » en gratuit, « ce mois » en Pro), barre.
- [ ] Activité agrégée (type, jour, n, avec singulier et pluriel dans le libellé).
- [ ] **Suspendre / Réactiver** (`DialogueSuspension`, panneau EN LIGNE, pas une modale) :
  - Titre et aide visibles avant ouverture.
  - Motif ≥ MOTIF_MIN.
  - Suspension : recopie de l'adresse (insensible à la casse), **collage bloqué et annoncé**. Réactivation : motif seul.
  - Échap ferme sauf pendant la requête, Annuler désactivé pendant la requête.
  - Erreurs nommées (`erreur.<motif>`) ; état remis à zéro à l'ouverture.
  - `window.location.reload()` seulement après confirmation de la base.
  - Un bouton « danger » à contour rouge pour suspendre.
- [ ] **Plan** (`PlanCompte`) : plan actuel ou « illisible » (aucun geste proposé si illisible), « Passer en Pro » / « Repasser en gratuit », motif, même mécanique, plan VISÉ transporté (deux onglets ne s'annulent pas, « déjà dans ce plan »).
- [ ] Identité : e-mail, type, rôle, langue.
- [ ] Boutique : pastille de couleur et valeur hexadécimale en chasse fixe, filigrane actif / inactif, réseaux configurés (noms).
- [ ] « Ce que cette page ne permet pas » : suppression, usurpation, ouverture des commandes.

**Écarts avec la maquette `admin-compte.html`** (une page par compte via ancre)
- (a) Produit sans équivalent : retour en flèche, pastille de la couleur d'accent et hexadécimal, pilule Actif/Suspendu avec point, quota de commandes lu « là où il bloque » avec libellé selon le plan, barre « dépassé de N », panneau du plan avec « illisible », collage bloqué annoncé, états d'erreur nommés.
- (b) Maquette sans équivalent :
  - Design : header avec avatar, badge Plan (couronne) à côté de l'état, dialogue **modal** pour suspension et plan (le produit les ouvre EN LIGNE, volontairement : une modale demande un piège de focus), animation de remontée de la fiche.
  - Mise en page en 3 colonnes de cartes.
  - Aucune fonction nouvelle.
- (c) Textes : `admin.suspension.*`, `admin.plan.*`, `admin.fiche.*` existent. Maquette = produit, sauf « 10 caractères » (voir §2).

**Risques** : jamais de contenu de commande ni de lien public. L'adresse recopiée ne se colle pas. Chaque geste est une Server Action avec sa propre garde. Si on passe à une modale native `<dialog>`, `Escape` doit rester neutre pendant la requête.

---

## 6. Comptes en doublon — `admin/comptes/doublons/page.tsx`

**Fichiers** : `page.tsx`, `src/lib/audit/doublons.ts` (`listerDoublons`, `compterDoublons`, `valeurLisible`), `reseaux-vendeur.tsx` (tracés).

**Données et règles**
- RPC : `lister_doublons_admin` (**audité : une entrée `comptes.doublons` à chaque ouverture**), `compter_doublons_admin` (n'écrit rien).
- Un seul égal : `identifiant_public` (migrations 170-171). L'écran dit un fait (« même identifiant »), jamais « même personne », et n'agit sur rien. Aucun indicatif ajouté.
- Plafond de 100 identifiants, avec phrase du total au-delà.
- Titre neutre.

**Liste à cocher**
- [ ] Bouton « Retour aux comptes » (lien, aligné sur le haut du titre).
- [ ] Encart de trace.
- [ ] Phrase de plafond quand le total dépasse ce qui est affiché.
- [ ] Une carte par identifiant partagé : symbole du réseau (tracés officiels) ou globe, genre, valeur jamais coupée (`overflow-wrap:anywhere`), pilule « N comptes ».
- [ ] Tableau des comptes de la carte : compte (e-mail jamais coupé, boutique ou « Pas encore nommée »), statut, inscription, commandes, bouton « Voir » (fiche), avec libellés d'accessibilité.
- [ ] État vide.
- [ ] « En bref » : identifiants, comptes concernés, dont suspendus.
- [ ] « Comment un doublon est reconnu » (4 règles : réseaux, WhatsApp, site, rien d'automatique).

**Écarts avec la maquette `admin-doublons.html`**
- (a) Produit sans équivalent : phrase de plafond, symbole de réseau par carte, libellés cachés pour lecteurs d'écran, état vide.
- (b) Maquette sans équivalent : tuiles chiffrées en tête (3 tuiles : le produit les met dans « En bref »). Design.
- (c) Textes : `admin.doublons.*` existants. La maquette les reprend.

**Risques** : l'écran nomme des comptes ; l'audit à l'ouverture doit rester dans la même transaction que la lecture. Aucune action de suspension à partir d'ici (maquette conforme : « Aucun compte n'est suspendu par cette liste »).

---

## 7. Boutiques — `admin/boutiques/page.tsx`

**Fichiers** : `page.tsx`, `src/lib/audit/boutiques.ts` (`listerBoutiques`, `TYPES_FILTRABLES`, `PAR_PAGE = 50`), `panneau.ts` (`lireCompteurs`, `lirePanneau`).

**Données et règles**
- RPC : `lister_boutiques_admin` (**audité** avec critères q + type + curseur), `stockage_total_admin`, `compteurs_admin`.
- Trié par stockage décroissant, pagination par curseur (octets + id).
- Aucun contenu : volumes, nom de boutique, adresse.

**Liste à cocher**
- [ ] 4 tuiles : boutiques totales, configurées, commandes ce mois, stockage (« Indisponible » si non mesuré).
- [ ] Filtres : recherche, sélecteur de type (Toutes / Fournisseur / Revendeur / Non configurées), « Réinitialiser ».
- [ ] Tableau à partir de `xl` : nom (pastille de couleur du vendeur sauf sans nom), propriétaire (adresse tronquée à 120 px), commandes, colis (« N / seuil » rouge si dépassé), médias (**seulement à ≥ 1 700 px**), stockage, création, statut (Active / Suspendue), « Voir » (lien vers la fiche du compte).
- [ ] Cartes en dessous : une seule pilule d'état, la plus grave (Suspendue > Plafond dépassé > Active), grille 4 chiffres, bouton « Voir ».
- [ ] 3 états vides distincts.
- [ ] « Voir la suite ».
- [ ] Anneau Configurées / Sans nom à partir de `2xl`.

**Écarts avec la maquette `admin-boutiques.html`**
- (a) Produit sans équivalent : **colonnes Propriétaire, Création et le lien « Voir »** vers la fiche du compte. La maquette n'a **aucune** action ni lien (la fonction « Voir » avait déjà été perdue une fois, `page.tsx:368-376`). Pastille « Plafond dépassé » en carte, seuil des colis, tuiles « dont… ».
- (b) Maquette sans équivalent : colonne **Type** dans le tableau (le produit n'affiche le type que sur la carte mobile), barre de stockage proportionnelle avec info-bulle, badge « Plafond dépassé » dans le tableau. Design.
- (c) Textes : `admin.boutiques.*` existants.

**Risques** : si la maquette est reprise telle quelle, « Voir » disparaît, donc plus de chemin vers la fiche d'un compte depuis les boutiques. À garder.

---

## 8. Commandes — `admin/commandes/page.tsx` + `actions.ts`

**Fichiers** : `page.tsx`, `actions.ts` (`bloquerLien`, `debloquerLien`, `lireContestation`, `refuserUneContestation`), `src/lib/audit/commandes.ts` (`listerCommandesAdmin`, `STATUTS_FILTRABLES`, `FENETRES` "7"/"30"), `blocage-lien.ts`, `contestation.ts`, composants `blocage-lien.tsx`, `contestation-lien.tsx`.

**Données et règles**
- RPC : `lister_commandes_admin` (**audité, une ligne par page**, migrations 159-160), `repartir_commandes_admin`, `compteurs_admin`, `liens_bloques_parmi` et `contestations_en_attente_parmi` (identifiants seulement, aucune écriture au journal), `bloquer/débloquer` (traçants, motif obligatoire), `lire_contestation_admin` (**la lecture est tracée à l'OUVERTURE du dialogue**, jamais au rendu), `refuser_contestation`.
- **Aucun contenu** : pas de client, pas de référence produit, pas de lien. « Voir » mène à la fiche du compte, pas à la commande.
- Exception unique : la contestation du vendeur (message et image facultative) se lit via le dialogue, tracée (migrations 168-169).
- Si la lecture des blocages échoue, ni pastille ni bouton (on n'affirme pas un état que la base n'a pas rendu).

**Liste à cocher**
- [ ] 6 tuiles : total, en transit, livrées, préparation, expédiées, créées ce mois-ci (2 colonnes mobile, 3 en `xl`, 6 en `2xl`).
- [ ] Filtres : recherche (référence, boutique ou adresse), statut, fenêtre (Toutes / 7 jours / 30 jours), « Réinitialiser ».
- [ ] Tableau à partir de `xl` (7 colonnes, `table-fixed`) : référence, compte (e-mail), boutique (pastille de couleur), statut, transporteur (monogramme coloré, ou rien si inconnu), date, actions. Cartes en dessous.
- [ ] Pilule « Lien bloqué » ajoutée au statut, pilule « Contestation » si une contestation attend.
- [ ] « Voir » → fiche du compte propriétaire (libellé accessible avec l'adresse).
- [ ] **Geste par ligne** : `BlocageLien` (icône « interdit » / « lien »), ou `ContestationLien` (icône de message d'alerte) quand le lien est bloqué et contesté.
- [ ] **Dialogue de blocage / déblocage** (`<dialog>` natif, 480 px) :
  - Dit ce que le client verra, exige un motif ≥ MOTIF_MIN, sans recopie.
  - Échap neutralisé pendant la requête, Annuler désactivé, état remis à zéro à l'ouverture, rechargement après confirmation.
- [ ] **Dialogue de contestation** (520 px) :
  - Lecture tracée au geste, états « lecture » / « erreur ».
  - Message du vendeur (retours à la ligne conservés) et vignette cliquable de l'image (URL R2 signée).
  - Champ « Votre réponse » ≥ MOTIF_MIN.
  - Deux issues : « Refuser » (le lien reste coupé) ou « Débloquer » (la réponse devient le motif de déblocage, la contestation passe « acceptée »).
- [ ] Anneau des statuts à `2xl`.
- [ ] États vides filtré / total.
- [ ] « Voir la suite » (curseur, critères conservés).
- [ ] Aucune case à cocher, aucun export, aucun « Nouvelle commande ».

**Écarts avec la maquette `admin-commandes.html`**
- (a) Produit sans équivalent : tuile « Créées ce mois-ci » avec libellé, filtre fenêtre en base, monogramme de transporteur coloré, états de blocage indisponibles, refus avec réponse qui part au vendeur, erreurs nommées.
- (b) Maquette sans équivalent : bouton texte « Bloquer le lien » (le produit : icône de 34 px), pastille « Contestation » cliquable dans la cellule référence (le produit : icône + pastille dans le statut), référence en `#`. Design. Filtre `statut` côté client : à ne pas porter.
- (c) Textes : `admin.commandes.*`, `admin.blocage.*`, `admin.contestation.*` existent.

**Risques** : jamais le contenu d'une commande ni son lien public. Un lien « Voir la page client » ou toute lecture de la commande serait une violation (contrainte 4 et commentaire `page.tsx:99-114`). Les icônes sans texte doivent garder leur `aria-label`. Les deux rendus (tableau et cartes) existent en même temps : `useId` pour les titres de dialogue.

---

## 9. Statistiques — `admin/statistiques/page.tsx`

**Fichiers** : `page.tsx`, `src/lib/audit/statistiques.ts`, composants `graphique-lignes`, `graphique-barres`, `courbe-commandes`, `anneau`, `anneau-statuts`, `echelle.ts`, `selecteur-admin`.

**Données et règles**
- RPC : `statistiques_admin`, `statistiques_admin_par_jour`, `transporteurs_admin`, `croissance_admin` (migration 161, **que des nombres, rien au journal**), `repartir_commandes_admin`.
- Vue (`globale`, `utilisation`, `croissance`, `commandes`, `comptes`) et période (`7`, `30`, `90`) dans l'URL ; aucun îlot client.
- L'écart « vs période précédente » est CALCULÉ sur les tables horodatées ; sans base, pas de badge.

**Liste à cocher**
- [ ] 6 tuiles avec badge d'écart : commandes, liens consultés (ouverts au moins une fois), photos, comptes actifs, nouveaux comptes, colis pris en charge.
- [ ] Rangée de vues (liens, `aria-current`, la vue courante au dégradé calme) + sélecteur de période.
- [ ] Cartes : évolution des commandes, évolution des comptes (actifs et nouveaux), types de compte (anneau), pages consultées (barres), taux de liens consultés, délai de livraison, statut des commandes (anneau), transporteurs en tête (5, monogramme, barre relative, part, nombre), croissance (4 indicateurs sur trois mois contre trois précédents + barres mensuelles).
- [ ] « Aucune mesure » quand la série est vide ; « — » au lieu d'un zéro.
- [ ] Vue globale en 3 rangées, vue filtrée en grille auto-ajustée.

**Écarts avec la maquette `admin-statistiques.html`**
- (a) Produit sans équivalent : états « aucune mesure », monogrammes de transporteurs, barres mensuelles de croissance, libellé « sans base » pour la croissance.
- (b) Maquette sans équivalent : tuiles distinctes pour « Pages client consultées / Taux de liens consultés / Temps moyen de livraison » en dernière rangée (le produit les place dans des cartes à courbes), ordre des périodes 30 / 7 / 90 (produit : 7 / 30 / 90). Design.
- (c) Textes : `admin.statistiques.*`. Maquette « Pas encore reconnu » ↔ produit `transporteurInconnu` (vérifier l'équivalence).

**Risques** : aucune ligne nominative ne doit apparaître (pas d'« activité récente »), sinon un audit par ouverture serait nécessaire.

---

## 10. Journal d'audit — `admin/journal/page.tsx`

**Fichiers** : `page.tsx`, `src/lib/audit/comptes.ts` (`lireJournal`, `compterJournal`, `repartirJournal`, `ParametresJournal`, `FAMILLES_JOURNAL`, `FENETRES_JOURNAL` 7/30/0, `PLAFOND_COMPTAGE_JOURNAL = 10 000`), `nature-d-action.ts`.

**Données et règles**
- RPC : `lire_journal_admin`, `compter_journal_admin`, `repartir_journal_admin`. **Lecture seule garantie par Postgres** (`stable`), donc consulter le journal n'y écrit rien.
- Critères d'une consultation gardés fermés (ils contiennent des recherches). Le motif est en clair. Avant/après d'un paramètre en clair.
- L'entrée survit à la suppression du compte visé (e-mail dénormalisé).
- La couleur suit la NATURE (réactivation en vert), pas la famille.

**Liste à cocher**
- [ ] 4 tuiles : total, suspensions (et réactivations), paramètres, consultations (part du total).
- [ ] Filtres : famille (Toutes / Suspensions / Consultations / Paramètres) et fenêtre (début / 7 / 30 jours), « Réinitialiser ».
- [ ] Encart de garantie (inaltérable, survit à la suppression ; bureau seulement).
- [ ] Liste : en-têtes Quand / Quoi / Qui au bureau (`xl`), cartes en dessous. Pilule d'action teintée par nature, e-mail de la cible, avant → après d'un paramètre avec son titre, motif dans un bandeau teinté, auteur.
- [ ] Sous-titre mobile qui porte le décompte (« … au-delà de 10 000 »).
- [ ] Pied : « N sur M entrées », « Voir la suite » (curseur).
- [ ] Anneau de répartition (consultations / paramètres / suspensions), ignore la famille, suit la fenêtre.
- [ ] États vides et illisible.

**Écarts avec la maquette `admin-journal.html`**
- (a) Produit sans équivalent : plafond de comptage (« au-delà de »), avant → après des paramètres, états « illisible », titre de clé de paramètre.
- (b) Maquette sans équivalent : lien « Compte visé » **vers la fiche** (`admin-compte.html#id`). Le produit rend l'e-mail en gras sans lien ; `LigneJournal` porte `cibleEmail` (identifiant du compte non vérifié). Fonctionnalité possible mais à vérifier : la cible peut avoir été supprimée.
- (c) Textes : `admin.journal.*` et `journal.actions.*`. La maquette utilise d'autres clés d'action (`compte_deblocage_lien`, `compte_contestation_refusee`, `contestations_detail`…) : vérifier qu'elles existent en base et dans les trois catalogues.

**Risques** : si le motif s'affiche en clair, ne pas y ajouter d'autre charge utile. Jamais de critère de recherche.

---

## 11. Surveillance — `admin/surveillance/page.tsx`

**Fichiers** : `page.tsx`, `src/lib/audit/surveillance.ts`, `src/lib/veille/taches.ts` (inventaire des tâches attendues), `src/lib/limitation/quota.ts` (`seuil`, `DEGRADATION`).

**Données et règles**
- RPC : `sante_infrastructure`, `etat_veilleur`, `colis_par_jour_admin(p_jours: 14)`.
- Les plafonds viennent de `seuil()`, jamais recopiés. Trois états pour chaque lecture : indisponible, vide, rempli. Un tiret, jamais un zéro.
- Trois états de tâche : actif, en retard, **jamais exécutée** (neutre, ni verte ni ambre).
- Liste « non mesuré » en dur : disponibilité, latence, charge, erreurs 5xx.

**Liste à cocher**
- [ ] Section « Tâches de fond » : une carte par tâche attendue, pastille + badge (Actif / En retard / Jamais exécutée), phrase d'aide avec minutes et seuil.
- [ ] « Consommation » :
  - Frise de colis par jour sur 14 jours (la dernière barre en accent), hauteur minimale de 2 %, étiquette « le seul poste facturé », légende.
  - « Limitation de débit » : pic sur plafond de 3 surfaces (pages publiques, jetons inconnus, administration), avec la phrase de comportement en panne n'apparaissant qu'au changement de règle.
- [ ] « Non mesuré » : texte + 4 badges.

**Écarts avec la maquette `admin-surveillance.html`**
- (a) Produit sans équivalent : états « jamais exécutée » et « en retard », états indisponibles par section, phrase de dégradation par surface.
- (b) Maquette sans équivalent :
  - Design : point pulsant infini (`adm-pouls`, protégé par `prefers-reduced-motion`), frise sur **30 jours** (le produit : 14, constante `JOURS_DE_FRISE`, argument `p_jours` de la RPC).
  - **Bloc « Consommation » à 3 chiffres** (interrogations du transporteur ce mois, colis pris en charge ce mois, suivis abandonnés ce mois) : **les données existent** (`sante_infrastructure` rend `interrogations_ce_mois` et `abandons_ce_mois`, migration 052) et les textes aussi (`fr.json:2258,2260`), mais **la page produit ne les rend pas** (grep : aucune occurrence dans `src`). À porter ; c'est du rendu, pas de nouvelle fonction.
- (c) Textes : `admin.surveillance.*` existants, plus les deux clés ci-dessus inutilisées.

**Risques** : ne pas afficher un zéro à la place d'une lecture muette. Les animations infinies doivent rester neutralisées en `reduce`.

---

## 12. Paramètres système — `admin/parametres/page.tsx` + `actions.ts`

**Fichiers** : `page.tsx`, `actions.ts` (`enregistrerParametre`), `src/lib/audit/parametres.ts` (`PARAMETRES`, `lireParametres`, `ecrireParametre`), `src/lib/audit/reglages-constates.ts`, composants `carte-reglages`, `reglage-nombre`, `reglage-interrupteur`, `rangee-constatee`.

**Données et règles**
- RPC : `lister_parametres`, `ecrire_parametre` (inventaire clos de clés, bornes, trace par déclencheur avec ancienne ET nouvelle valeur, auteur et date relus).
- La clé vient du formulaire donc est confrontée à l'inventaire avant écriture. `valeur` en `z.coerce.number().int()`.
- Après écriture : `revalidatePath` de cet écran et du panneau (leurs seuils sont liés), **puis relecture** pour rendre la valeur réellement appliquée (`actions.ts:61-80,115-134`).
- `TraductionsClient espaces={["admin.parametres"]}` est obligatoire (sinon l'écran lève au rendu).
- Aucun secret ne passe par cet écran.

**Liste à cocher** (14 rangées en 4 cartes ; l'ordre est celui de la planche)
- [ ] Plafonds : `plafond_commandes_gratuit_a_vie`, `plafond_commandes_mensuel` (deux quotas côte à côte), « stockage par compte » (absent, nommé « Aucun plafond »), médias par commande (constaté), poids d'une vidéo (constaté).
- [ ] Suivi : `seuil_colis_par_compte`, `budget_suivi_total`, `budget_suivi_deja_consomme`, silence en jours (constaté), abandon en jours (constaté), purge en jours (constaté), `retard_veilleur_minutes`.
- [ ] Débit : jeton inconnu, jeton valide, dépôts (constatés, sans aide).
- [ ] Interrupteurs : `inscriptions_ouvertes`, `suivi_actif`, « notifications e-mail » **éteint et non cliquable** (rien ne le pilote encore).
- [ ] Chaque rangée modifiable : valeur, bornes min / max, « jamais décidé » ou « décidé le … par … », erreur de bornes, valeur relue.
- [ ] Trois natures distinctes : modifiable / constaté (lu à sa source, changé au déploiement) / absent ou éteint.

**Écarts avec la maquette `admin-parametres.html`**
- (a) Produit sans équivalent : rangée « notifications e-mail » éteinte, rangée « abandon_jours », rangée « stockage_par_compte » (la maquette la place dans la carte « Constaté », sous « Aucun »), états « jamais décidé », bornes et erreurs de bornes en base.
- (b) Maquette sans équivalent : agencement en 5 blocs (Plafonds, Suivi, Interrupteurs, Limitation de débit, Constaté) ; `retard_veilleur_minutes` y est mis à 30, **sans bornes cohérentes avec le produit** (valeurs de démo). Design. Les valeurs de la maquette (par exemple `Plafond gratuit à vie : 15 → 5`) sont des données de démo.
- (c) Textes : `admin.parametres.*` existants.

**Risques** : ne jamais rendre cliquable ce qui ne pilote rien (règle du brief, `page.tsx:68-73`). La page « Abonnements », « Emails », « Intégrations », « Apparence », « Sécurité », « Système » reste non codée (décision verrouillée).

---

## 13. Erreur d'administration — `admin/error.tsx`

**Fichiers** : `src/app/[locale]/admin/error.tsx`, `src/components/app/carte-etat-vide.tsx`, clés `erreurs.titre / texte / reessayer / reference` (fr.json `:2515-2519`).

**Liste à cocher**
- [ ] Carte d'état vide : icône d'alerte, titre, texte « Vos données ne sont pas touchées : rien n'a été enregistré ni supprimé. », bouton « Réessayer » (`reset`).
- [ ] « Référence de l'incident : {digest} » si un `digest` existe.
- [ ] Aucun message d'erreur réel envoyé au navigateur.

**Écarts** : maquette `admin-erreur.html` = même écran et mêmes textes (vérifié sur `admin.mjs:479-495` et `fr.json`). Seul le décor de page diffère. RAS.

---

## 14. Ce que je n'ai pas pu vérifier

- Les trois catalogues pour les textes « à créer » (seul `fr.json` lu). La parité FR / EN est testée ; zh-CN reste à produire.
- `LigneJournal` : présence d'un identifiant de compte cible pour un lien « Compte visé ».
- Les migrations 205 à 212, au-delà de leur nom (je n'ai pas relu 207 « une pause peut reprendre le prélèvement » ni 211-212, hors périmètre).
- Les fichiers `carte-reglages.tsx`, `reglage-*.tsx`, `rangee-constatee.tsx`, `recherche-admin.tsx`, `selecteur-*.tsx`, `tuile-volume.tsx`, `anneau*.tsx`, `courbe-commandes.tsx` et graphiques : lus seulement par leurs appels.
- `lib/page-publique/qc.ts`, `notifications.ts`, `estimation.ts`, `repli-historique.ts` : seuls les appels de RPC ont été relevés.
- Les rendus : aucune mesure, aucune capture, aucun test lancé. Les affirmations de poids (268 Ko, 32 Ko de marge) viennent d'un commentaire du dépôt (`layout.tsx:27-34`), pas de ma mesure.
- Si les audits de `lire_plan_compte`, `lister_parametres`, `liens_bloques_parmi`, `contestations_en_attente_parmi` écrivent au journal : non vérifié (je le suppose non pour les deux derniers, d'après les commentaires).
