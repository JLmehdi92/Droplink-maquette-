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

# Inventaire exact : espace vendeur (fiche/éditeur, marque, paramètres, passer-pro, états)

Lecture seule, aucun fichier modifié. Les chemins du produit sont sous `/home/user/droplink2/src/`, ceux de la maquette sous `/home/user/droplink2/design/maquette/src/`.

**Ce que je n'ai pas pu vérifier :**
- Je n'avais pas de shell : pas de `git diff d1f3389..43ec195`. J'ai lu l'état courant de `parametres/actions.ts` et `passer-pro/page.tsx`, pas le diff.
- Je n'ai pas lu `messages/en.json` ni `zh-CN.json`. Les constats de textes ne portent que sur `messages/fr.json`.
- Je n'ai pas lu en détail `frise-detail.tsx`, `historique-commande.tsx`, `bouton-action.tsx`, `carte-reglage.tsx`, ni le CSS de la maquette (`css/app.css`).
- Je n'ai pas lu la source `<!--PAGE_CLIENT-->` injectée par `outils/construire.mjs`.
- Le gabarit commun (`<!--COQUE:…-->`, fil d'Ariane « Atelier Nord › … ») est hors périmètre. Je ne l'ai pas comparé à `(app)/layout.tsx`.
- Le « 5 commandes / 5 colis » est déjà dans le code lu (commentaire de `passer-pro/page.tsx:144`) et dans la maquette (`passer-pro.html:38,49-50`). `CLAUDE.md` dit encore 15, il est périmé (cas L-014).

---

## Transverse : points qui concernent tous les écrans

- **Textes.** La maquette a été écrite à partir des chaînes de `messages/fr.json`. La très grande majorité des libellés existent déjà : `editeur.*`, `medias.*`, `actions.revocation.*`, `marque.*`, `parametres.*`, `passerPro.*`, `erreurs.*`, `commandes.introuvable.*`. Les clés manquantes sont listées écran par écran.
- **Thème sombre.** `css/app.css:15-20` définit une palette sombre : `@media (prefers-color-scheme: dark)` et `:root[data-theme="dark"|"light"]`. `etats.js:7` lit `localStorage["dl-theme"]`. Le produit n'a aucun thème sombre : `grep data-theme|dl-theme|prefers-color-scheme` dans `src/` ne renvoie rien. C'est une **fonctionnalité nouvelle** à signaler. Elle touche la règle n° 1 de CLAUDE.md (accent résolu pour un fond clair) et les 10 écrans du design system. Je n'ai pas trouvé où se trouve le bouton de bascule.
- **Maquette = démo.** Elle simule les réponses : délais fictifs, jeu de 25 commandes en dur, hash `#<ref>`, mot de passe démo, `data-demo-photos`. Rien de cela ne se porte.

---

## 1. `commandes/[id]` : fiche ET éditeur

### 1.1 Fichiers du produit
- `(app)/commandes/[id]/page.tsx`
  - `lireCommandeEditee` mémoïsé, sous RLS, l.41-54.
  - `generateMetadata` l.66-97 : titre via `titreDeCommande`, « introuvable » si `data === null`.
  - Garde `exigerVendeur` l.136, **avant** toute lecture. Puis `notFound()` si erreur ou null (l.141).
  - `Promise.all` l.149 : `origineDuSite`, `order_media`, `lireHistorique`, `lireSuiviDeCommande`, `lireEtatBlocage`.
  - Vignettes signées (`signerLecture`, `cleDApercu`) l.194.
  - RPC `mon_quota_colis_atteint` l.235, seulement si un numéro est saisi sans colis attaché.
  - `emettreApres(EDITEUR_OUVERT)` l.298, avec `origine: brouillon|edition` d'après `first_content_at`.
  - `versPageClient = /<langue>/commandes/<id>/page-client` l.313.
  - Rendu l.324-443 : `<main className="-mb-[86px] flex min-h-dvh flex-col md:mb-0">` + `TraductionsClient espaces=[editeur, medias, actions, blocageVendeur]`.
- `(app)/commandes/[id]/page-client/page.tsx`
  - `exigerVendeur`, lecture RLS de `public_token`, `redirect(cheminPageClient(token, nomDeLien))` l.95.
  - 404 (pas 403) si ce n'est pas la commande de l'appelant.
- `components/commandes/editeur.tsx`
  - État `valeurs` / `confirmees`, `enregistrerChamp` l.249. Deux cadences : texte à 800 ms (`DELAI_TEXTE_MS` l.70), immédiat pour `status`, `qc_status`, `carrier_code`.
  - Une demande par champ (`derniereDemande`).
  - `EnTeteDetail` l.481, `PanneauSuivi` l.568, `PanneauInformations` l.668, `TemoinSauvegarde` l.716, `BoutonCopier` l.761, `ChampListe` l.840, `CarteCommande` l.870.
  - Grille de la fiche l.338-406, bande mobile collée l.412, bandeau d'échec l.428.
- `components/commandes/carte-medias.tsx` : dépôt, grille dnd-kit, couverture, suppression.
- `components/commandes/carte-revocation.tsx`
- `components/commandes/apercu-client.tsx`
- `components/commandes/tuiles-resume.tsx`
- `components/commandes/menu-gestes-fiche.tsx` : composant serveur ; deux formulaires POST vers la route de gestes de liste.
- `components/commandes/bandeau-blocage.tsx`
- `components/commandes/frise-detail.tsx`
- `components/commandes/historique-commande.tsx`
- `components/commandes/bandeau-quota.tsx`
- `components/app/panneau.tsx` : `Panneau`, `LienRetour` l.165, `LigneInfo` l.201, `CLASSE_ACTION_DETAIL` l.142.
- Actions et logique serveur :
  - `lib/commandes/actions.ts` : `creerBrouillon` l.53, `enregistrerChamp` l.120, `revoquerLienPublic` l.141, `dupliquer` l.166, `archiver` l.188.
  - `lib/commandes/ecriture.ts` : `appliquerChamp`, `marquerPremierContenu`.
  - `lib/commandes/actions-medias.ts` : `demanderDepot`, `validerDepot`, `demanderDepotVignette`, `demanderDepotCouverture`, `retirerMedia`, `ordonnerMedias`, `definirCouverture`.
  - `lib/commandes/medias.ts`, `lib/commandes/cycle.ts`, `lib/commandes/contestation.ts`, `lib/commandes/actions-contestation.ts`, `lib/commandes/quota-atteint.ts`, `lib/commandes/reference.ts`.
  - `lib/liens/page-client.ts` : `cheminPageClient`, `lienPageClient`, `cheminApercuPageClient`.
  - `lib/storage/{limites,cles,r2}.ts`.
- `app/p/[token]/apercu/page.tsx` : l'aperçu est la **vraie** page client (`PageClient`), servie en iframe. Aucune vue comptée, arbitrage et e-mails inertes, mêmes quotas que la page publique, cadrable par DropLink seulement.
- Création : il n'existe pas de route « nouvelle commande ».
  - `creerBrouillon` est appelée depuis `commandes/page.tsx:222` et `:378`, `tableau/carte-lancement.tsx`, `tableau/actions-rapides.tsx`, `tableau-commandes.tsx`.
  - Elle fait `insert` sur `orders` avec `shop_id` seul. Les jetons sont posés par un déclencheur (migration 009).
  - Elle redirige vers `/<langue>/commandes/<id>`.
  - Quota atteint (DL067 gratuit, DL035 mensuel) : redirection vers `/<langue>/commandes?quota=gratuit|mensuel` (`quota-atteint.ts:54`). **Aucune version « quota atteint » n'existe dans `commande.html`.**

### 1.2 Données et règles réelles
- **Sauvegarde automatique.**
  - Un champ par appel, zod aligné sur les `CHECK` de la base (`ecriture.ts:51-63`) : `customer_label` ≤ 120, `product_ref` ≤ 200, `tracking_number` ≤ 64, `carrier_code` `^[1-9][0-9]{0,8}$` ou vide, `internal_notes` ≤ 5000.
  - Un champ vidé redevient NULL.
  - Échec : retour à la valeur relue en base (`valeurConfirmee`) et échec **nommé** (`editeur.echec` avec `nomChamp.*`) + bouton « Réessayer ».
  - Aucun bouton « enregistrer » ni « publier » (décision 16).
- **Détection du transporteur.**
  - Côté serveur : `attacherColis` après un `tracking_number` ou `carrier_code` réussi (`ecriture.ts:235`). La migration 164 relance la prise en charge quand un transporteur nouveau est choisi.
  - Le nom affiché est résolu côté serveur depuis le catalogue figé `lib/tracking/transporteurs.json` (`lireTransporteur`). Si le code est absent du catalogue, la ligne est omise.
  - La liste déroulante est `transporteursProposes(carrier_code)`.
- **Quotas colis.** DL070 (gratuit, à vie) et DL051 (Pro, mensuel) → `suiviBloque` ∈ {`gratuit`, `mensuel`}. Le panneau de suivi dit pourquoi (`editeur.suiviBloque*`) et propose « Passer au Pro » en gratuit. Au rechargement : RPC `mon_quota_colis_atteint` (page.tsx:235).
- **Quota de commandes.**
  - Gratuit : 5 commandes à vie, lues par `lire_plafond_gratuit_a_vie`.
  - Pro : mensuel (`lire_plafond_commandes`).
  - Migration 212 : seul un brouillon de moins de 20 s rend sa place de quota. C'est une règle de base, **aucun code applicatif à changer**.
  - Conséquence pour le design : un vendeur qui s'arrête plus de 20 s consomme une place. À savoir avant de rendre la création « un clic puis curseur dans le nom ».
- **Statuts.** `STATUTS_EXPEDITION` = preparation / expedie / en_transit / livre. `STATUTS_QC` = en_attente / approuve / refuse (`lib/commandes/liste`). Les statuts changent par liste déroulante. La frise lit `valeurs.status`, jamais le colis.
- **Arbitrage QC.**
  - Il se fait sur la page client (`/p/[token]/qc`).
  - L'éditeur n'a que la liste « État des photos » (`qc_status`), pour les réponses reçues ailleurs.
  - L'historique contient `qc_approuve` et `qc_refuse`.
- **Médias.**
  - Plafonds par défaut : 20 médias, 3 vidéos, 60 s, photo 10 Mo, vidéo 20 Mo (`limites.ts`).
  - Parcours en 4 temps, **direct navigateur → R2** :
    1. `demanderDepot` renvoie une URL signée, les en-têtes, un `mediaId` et un `laissezPasser`. La clé est générée par le serveur (`cleMedia`).
    2. PUT par `XMLHttpRequest` pour la progression, `content-length` jamais posé par le client (`carte-medias.tsx:892`).
    3. Vignette puis couverture produites côté navigateur et déposées avec le `laissezPasser`. Leur échec n'est pas bloquant.
    4. `validerDepot` **relit la taille réelle** (`lireTaille`) et décide à nouveau.
  - Dépôt en série, un fichier à la fois.
  - 1re photo = couverture (suivi anti-course `creerSuiviDeCouverture`).
  - Les URL de vignettes sont signées au rendu, jamais stockées.
- **Jeton public.**
  - Immuable ; seul `revoquerLienPublic` le change (`cycle.ts`). Il invalide le cache de l'ancien ET du nouveau jeton.
  - L'éditeur tient `jetonCourant` en état. L'aperçu se recharge sur le nouveau jeton avec double tampon.
  - Le bouton « Voir la page client » passe par `/page-client`, qui relit le jeton au clic.
- **Lien bloqué / contesté** (168-169).
  - `lireEtatBlocage` sous RLS ; `null` si illisible, et alors rien n'est dit.
  - Le bandeau montre : date, motif, bouton « Contester », formulaire (explication ≥ `EXPLICATION_MIN`, image facultative jpeg/png/webp ≤ `contestationOctets` en PUT direct R2 signé), état « en attente », état « refusée » avec réponse et « N restantes » / « Aucune restante » / « Recontester ».
  - L'envoi recharge la page (`window.location.reload`).
- **Gestes de liste** (`MenuGestesFiche`) : dupliquer comme gabarit, archiver / sortir des archives. Deux formulaires POST vers la route de gestes de liste (même garde d'origine, RLS, journal). Ils portent `jeton` en champ caché (l.85).
- **Instrumentation.** `EDITEUR_OUVERT`, `COMMANDE_MODIFIEE`, `COMMANDE_CREEE` (réclamée une seule fois, rendue si l'envoi échoue), journal d'historique `commande_creee` / `commande_modifiee` (sans la valeur : les notes portent le prix d'achat).

### 1.3 Liste à cocher : ce que la fiche fait aujourd'hui
En-tête
- [ ] Lien retour « Retour aux commandes » (`LienRetour`)
- [ ] H1 = référence courte `#XXXXXX` (6 derniers caractères de l'uuid) + icône-lien vers la page client (cible 44 px au téléphone, nom accessible)
- [ ] « Créée le {date} »
- [ ] Témoin de sauvegarde en pilule, 3 états (Enregistré / Enregistrement… / Non enregistré), `aria-live=polite`
- [ ] Menu « ••• » : bureau en panneau ancré, téléphone en feuille du bas
- [ ] Bouton « Partager » (copie le lien ; nom accessible « Copier le lien » ; états copié et échec)
- [ ] Bouton principal au dégradé « Voir la page client » (nouvel onglet)
- [ ] Bande d'actions collée en bas au téléphone (copier + voir)

Bandeaux et résumé
- [ ] Bandeau lien bloqué (voir 1.2)
- [ ] 4 tuiles de résumé, bureau seulement : Client, Référence, Vues du lien (+ dernière vue), Suivi (+ nom du transporteur). Tiret `–` si vide.

Carte « La commande » (7 champs)
- [ ] Nom du client + aide « texte libre, pas de compte »
- [ ] Référence produit
- [ ] Numéro de suivi + aide conditionnelle
- [ ] Transporteur (liste ; « Détection automatique » ; envoi immédiat)
- [ ] Statut (liste ; immédiat)
- [ ] État des photos (liste ; immédiat ; aide)
- [ ] Notes internes (textarea, aide « jamais visible, absent de l'export »)
- [ ] Contour d'erreur sur les champs en échec

Aperçu
- [ ] Bascule Mobile / Desktop (`aria-pressed`)
- [ ] Lien « Voir la page »
- [ ] Rechargement 350 ms après chaque écriture confirmée (champ ou média)
- [ ] Double tampon et défilement conservé
- [ ] Pas de cadre au téléphone (zone mesurée à 0 donc rien n'est chargé)
- [ ] Cadre hors tabulation (`tabIndex=-1`), pas de `sandbox` (décision documentée)

Suivi et informations
- [ ] Frise 4 étapes avec dates et notes issues des points de passage ; date de création sur « préparation »
- [ ] Avis « suivi arrêté » / « non reconnu » (`suiviArrete`, `suiviNonReconnu`)
- [ ] Avis « suivi bloqué » gratuit (lien Passer au Pro) / mensuel
- [ ] Panneau « Informations » : Référence (lien), Date de création, Dernière mise à jour, Méthode d'expédition, Numéro de suivi, Lien client en clair (`LigneInfo`)
- [ ] Historique (composant serveur) avec 11 types d'événement

Médias
- [ ] Compteur « n sur 20 » (+ « · n vidéos sur 3 » au bureau seulement)
- [ ] Bouton d'en-tête « Ajouter des fichiers » (bureau)
- [ ] Case « Ajouter » dans la grille, désactivée au plafond, message « Plafond atteint »
- [ ] Glisser-déposer de fichiers sur toute la grille
- [ ] Case en cours d'envoi : barre `progressbar` + %, échec avec `role=alert` + « Écarter »
- [ ] Case d'échec : motif parmi 13 refus traduits (`medias.refus.*`) + repli « inconnu »
- [ ] Vignette : pastille « Couverture », durée vidéo seulement si mesurée, repli icône si pas de vignette
- [ ] Poignée de déplacement (dnd-kit : souris 8 px, toucher 200 ms, **clavier**, annonces lecteur d'écran en 5 phrases)
- [ ] Étoile « Définir comme couverture » (masquée au survol avec une souris, toujours visible au toucher)
- [ ] Bouton supprimer
- [ ] Bandeau d'échec d'action (couverture / suppression / ordre) avec retour à l'état confirmé
- [ ] Aide « glissez par la poignée » (bureau) / « appui long » (téléphone)
- [ ] Libération des `blob:` URL

Révocation du lien
- [ ] Carte rouge en ligne : case « Je comprends… » décochée par défaut
- [ ] Bouton inerte tant que la case n'est pas cochée
- [ ] Aucun `<form>`, donc pas de validation par Entrée
- [ ] Échec `role=alert` : « L'ancien lien reste actif »
- [ ] Le nouveau jeton est propagé sans rechargement (en-tête, informations, aperçu)

États globaux
- [ ] Bandeau d'échec fixe : liste des champs + « La valeur affichée est celle qui est en base » + « Réessayer » (relance tous les champs en échec)
- [ ] Ordre mobile : médias → commande → suivi → informations → historique → révocation (`order-*`)

### 1.4 Écarts avec la maquette (`commande.html`, `commande.js`)

**(a) Produit sans équivalent dans la maquette** (à conserver ; ni lieu de rendu ni textes à perdre)
- Menu « ••• » (dupliquer / archiver) : absent.
- Bandeau lien bloqué + contestation (3 états + formulaire) : absent.
- Avis « suivi bloqué par quota », « suivi arrêté », « non reconnu » : absents.
- Panneau « Informations de la commande » (6 lignes) : absent. La maquette n'a que l'URL dans « Lien client ».
- Bascule Mobile / Desktop de l'aperçu, et aperçu qui charge la vraie page : la maquette n'a qu'un téléphone, moulé depuis une page fictive (`[data-apercu]`).
- Dépôt réel : barres de progression, tuiles d'échec, motifs de refus, signature R2, vignette + couverture dérivées. Sans équivalent visuel.
- Réordonnancement clavier / toucher / annonces (dnd-kit) : la maquette utilise `draggable` HTML5, souris seulement. **À ne pas remplacer.**
- Bandeau d'échec d'enregistrement avec « Réessayer ».
- Étoile de couverture au survol seulement (`pointer-fine`).
- Le titre H1 et la logique de l'onglet.
- Quota de commandes atteint à la création (redirection vers la liste).
- Bouton `/page-client` (relecture du jeton au clic).

**(b) Maquette sans équivalent dans le produit**
- *Design ou mouvement, à porter :*
  - Fil d'Ariane `Atelier Nord › Commandes › <titre>` (coque).
  - Bloc `fiche__meta` : témoin + « Créée aujourd'hui à HH:MM » + référence `#XXXXXX`, au lieu de la référence en H1.
  - **H1 = nom du client, ou « Nouvelle commande » tant que vide** (`poserTitre`, `commande.js:63`). Le produit a la référence en H1 et ne met `titreDeCommande` que dans l'onglet. **Arbitrage de décision de design : à trancher avec Wassim.**
  - Séparation visuelle des cartes : Lien client / Suivi / Historique.
  - La révocation en `<details>` repliable (`commande.html:139`). Le produit est une carte rouge en ligne. La garantie « case décochée, aucun `<form>` » tient dans les deux cas ; à conserver.
  - Animations :
    - historique : glissement de 320 ms
    - vignettes : entrée de 420 ms avec décalage de 70 ms
    - jeton : flou de 360 ms à la révocation
    - respect de `prefers-reduced-motion` (`reduit`)
  - Tuiles « Vues du lien » en alerte quand jamais ouvert (`data-alerte`).
  - Pastille « Couverture » et icônes (`images`, `trash-2`) : produit = Star, X, GripVertical (Lucide).
- *Fonctionnalité nouvelle, à signaler :*
  1. **Détection du transporteur dans le navigateur** par regex sur le numéro, avec la pastille « <Transporteur> reconnu » (`commande.js:77-90`) et le sous-titre « Transporteur à préciser » sur la tuile Suivi. Le produit détecte côté serveur via 17TRACK : un tiers payant, quota à vie, détection non connue à la frappe. Les formats de numéro de la démo sont fictifs. Si on la porte, elle ne devrait que **prédire**, jamais affirmer ; sinon on affirme ce que la base n'a pas enregistré (contrainte 8).
  2. **Focus automatique** sur le nom du client sur une commande neuve, pointeur fin seulement (`commande.js:257`). `first_content_at === null` est déjà lu côté serveur et peut servir d'indice. Impact quota : aucun.
  3. Dernier mouvement transporteur dans la page client de l'aperçu (`mouvementPc`) : existe côté vraie page.
  4. Bouton « prendre les 4 photos de démonstration » : **démo uniquement, à ne pas porter**.
  5. Hash `commande.html#<ref>` : démo uniquement. Le produit passe par l'uuid.
  6. Thème sombre (voir transverse).
  7. Détail d'un compteur de vidéos en phrase « · 1 vidéo sur 3 » : existe déjà (`medias.videos`).
  8. L'URL du lien vue dans la carte « Lien client » sous la forme `droplink.fr/p/<jeton>` : le produit sert aussi la forme brandée (`lienPageClient(origine, jeton, nomDeLien)`, 182-184). La maquette n'a pas la variante.
- Résumé : le design de la fiche **perd** la liste (a). Tout ce qui est en (a) doit être gardé tel quel en changeant seulement les classes et la structure.

**(c) Textes** (FR seul dans la maquette)
- *À reprendre* : `editeur.*`, `medias.*`, `actions.revocation.*` couvrent presque tout (« Nom ou pseudo du client », « Ex : Yanis, ou @pseudo », aides du suivi, du transporteur, des notes, « Aperçu de la page client », « en direct »).
- *À créer* (FR, EN, zh-CN) :
  - « Créée aujourd'hui à {heure} » (le produit a « Créée le {quand} »).
  - « {Transporteur} reconnu » et « Transporteur à préciser », **si** la détection est portée.
  - Texte du fil d'Ariane (coque).
  - Le titre de page H1 « Nouvelle commande » existe (`editeur.titre`) mais pas pour le H1.
  - « Il existe dès la création et ne change plus : chaque modification arrive sur la même page. » (`commande.html:138`) : **je ne l'ai pas trouvée** dans `messages/fr.json`.
- Le bouton de démo ne doit pas entrer dans les messages.

### 1.5 Risques
- **Jeton public.**
  - `data-jeton` écrit dans le HTML statique (`commande.html:137`) : à ne pas reproduire côté serveur sans `exigerVendeur` avant la lecture (page.tsx:136 et page-client/page.tsx:69).
  - Dans le produit, `jeton` est prop de `Editeur` (page.tsx:334) et de `MenuGestesFiche` (champ caché, menu-gestes-fiche.tsx:85). C'est légitime pour le propriétaire, mais **ne jamais en faire un attribut visible** (`title`, `aria-label`, `data-*`, `<meta>`) ni le mettre dans une valeur de `generateMetadata`. Le jeton est la sentinelle prioritaire de CLAUDE.md.
  - L'URL de l'iframe contient le jeton (`/p/<jeton>/apercu`) : normal, l'aperçu est servi comme la page publique.
  - La route `/page-client` envoie le jeton dans `Location` : d'où la garde avant lecture.
- **Immuabilité.**
  - Dans la maquette, « Révoquer et régénérer » change le jeton côté client après 700 ms (`commande.js:186`). En produit, seule la réponse `ok` de `revoquerLienPublic` doit le changer.
  - Aucune autre action ne doit toucher `public_token`. Le test de non-régression doit couvrir toute nouvelle mutation.
- **Server Actions limitées à 1 Mo.** Le dépôt de médias, de logo et d'image de contestation passe par PUT direct sur URL signée. Ne jamais faire transiter un fichier par une action. L'`accept` côté produit est `plafonds.typesAcceptes` (jpeg, png, webp, avif, mp4, webm, mov, `cles.ts:39-45`). L'`accept` de la maquette est `image/jpeg,image/png,image/webp,video/mp4`, et `medias.formats` dit « JPEG, PNG, WebP ou MP4 ». Le produit accepte donc plus de formats que le texte n'en annonce (déjà vrai avant la maquette).
- **File des Server Actions et appels tiers.** Next sérialise les Server Actions.
  - Le rechargement de l'aperçu est temporisé (350 ms) pour ne pas empiler d'appels.
  - `appliquerChamp` → `attacherColis` est un appel tiers sur le chemin d'une mutation : respecter les bornes déjà mesurées (CLAUDE.md : `emettre` borné à 1,5 s, `after` pour reporter le reste).
  - Toute logique de détection ajoutée au chemin d'une frappe doit rester locale ou bornée.
- **Aperçu.** Le cadre doit rester non chargé quand la zone est cachée (`largeurZone === null`) : sans quoi, deux rendus serveur par ouverture de fiche au téléphone (mesuré le 26/09).
- **Maquette → produit : a11y.** `loading` doit rester `aria-hidden` ; la maquette ajoute `<p class="sr" role="status">Chargement…</p>` (voir §6).

---

## 2. `marque`

### 2.1 Fichiers du produit
- `(app)/marque/page.tsx` : `exigerVendeur`, redirection vers `/bienvenue` si onboarding à faire (l.54), logo signé (l.65, repli `null` si la signature échoue), `tousLesLibellesApercu()`.
- `(app)/marque/actions.ts` : `enregistrerMarque` (`useActionState`), `preparerLogo`, `confirmerLogo`, `supprimerLogo`.
- `components/marque/formulaire-marque.tsx` (1 363 lignes) : tout le formulaire ; l'aperçu est une miniature dessinée à la main (l.403-561), **pas** une iframe.
- `lib/boutique/{reglages,logo,normaliser-lien,libelles-apercu,phrases-apercu,bornes,types-logo}.ts`
- `lib/design/contraste.ts` : `resoudreAccent` (4,5:1 texte, 3:1 interface).
- `components/app/en-tete-ecran.tsx` : `EnTeteEcranDs`.

### 2.2 Données et règles
- **Pas de sauvegarde automatique** : un seul bouton « Enregistrer les modifications », car un réglage rhabille toutes les pages du vendeur.
- Réponse `ResultatMarque` : `inactif | enregistre | erreur` (`saisie` avec `champs[]` et `detail` ∈ `nom-invalide | nom-pris | nom-pro`, `session`, `ecriture`).
- **Ordre d'écriture** : le nom de lien en premier (le seul qui peut échouer pour une raison extérieure), puis `appliquerReglagesMarque`.
- **Logo.**
  - Réduit dans le navigateur (`logoReduit`, ≤ `DEPOT_LOGO_MAX_KO` = 20 Ko).
  - `preparerLogo` (type et taille) → PUT direct R2 → `confirmerLogo` (taille relue côté serveur) → `supprimerLogo`.
  - **SVG refusé**, jamais assaini.
- **Plan Pro / gratuit.**
  - Lien personnalisé (`nomDeLien`) : le champ est `disabled` et sans `name` en gratuit (rien ne part, DL059 en base). Carte « Fonctionnalité Pro » vers `/passer-pro`.
  - Interrupteur « Masquer la marque DropLink » (`masquerMarque`) : désactivé en gratuit, la base n'admet que `false` (167).
  - Le nom de lien déjà posé reste affiché même après une rétrogradation.
- **Réseaux** : Instagram, TikTok, WhatsApp, site (4 champs, `type=text`). Normalisation à la sortie du champ (`normaliserLien`). Le serveur fait foi.
- **Filigrane** : exige un nom, désactivé sinon.
- **Langue des pages client** : `languePublique`, liste engendrée par `LANGUES`.
- **Instrumentation** : `MARQUE_ENREGISTREE` (décisions, jamais contenus). `revalidatePath(/<langue>/marque)`.

### 2.3 Liste à cocher (produit)
- [ ] En-tête `EnTeteEcranDs` (titre + sous-titre)
- [ ] Aperçu (miniature) : en-tête boutique omis si ni nom ni logo ; logo ou pastille ; nom ; description ; titre « Votre commande » ; 4 barres de progression ; 4 vignettes ; bouton « Approuver » ; pied de réseaux seulement s'il y en a, avec nom ; libellés dans la **langue des pages client choisie** (pas celle de l'interface) ; contraste résolu, jamais la couleur brute ; badge « en direct » ; `aria-hidden`
- [ ] Section 1 Identité : logo (dépôt par bouton, remplacer, retirer, états envoi / pose / erreur ; message de formats `{n} Ko` ; 6 messages d'erreur), nom (≤ 60, erreur dédiée), description (textarea ≤ 150, compteur, erreur dédiée)
- [ ] Section 2 Couleur : pastille `<input type=color>` + code hexadécimal ; badge « Contraste conforme » (court au téléphone) ; 3 démonstrations (bureau seulement) ; note « couleur ajustée » si `accent.ajuste` ; erreur de code
- [ ] Section 3 Réseaux : 4 lignes à pastille (couleur de **leur** marque, pas l'accent), exemples, normalisation au blur, erreur par réseau, note « s'ouvrent dans un nouvel onglet »
- [ ] Section 4 Options : filigrane (interrupteur dessiné + case `sr-only`), langue des pages client
- [ ] Section 5 Lien personnalisé (Pro) : préfixe d'origine verrouillé venant du serveur, champ ≤ 40, erreurs (`erreurLien`, `erreurLienPris`, `erreurLienPro`), carte Pro hors Pro
- [ ] Section 6 Marque DropLink (Pro) : interrupteur + carte Pro
- [ ] Barre d'enregistrement : pilule verte « Enregistré. » (`role=status`), erreur serveur `role=alert`, bouton au dégradé (une seule action principale), pleine largeur au téléphone, libellé « Réessayer » après échec
- [ ] Mise en page : aperçu en tête au téléphone, colonne de droite à partir de `xl`

### 2.4 Écarts avec la maquette (`marque.html`, `marque.js`)
**(a) Produit sans équivalent**
- États Pro / gratuit : verrouillage du lien et de l'interrupteur, cartes « Fonctionnalité Pro » (`lienProTitre`, `marqueProAide`). La maquette montre les deux sections ouvertes (`marque.html:106-125`), compte Pro.
- Erreurs serveur : `nom-pris`, `nom-pro`, `session`, `ecriture` ; et retour de l'écriture réelle (`useActionState`).
- Dépôt réel du logo : `preparerLogo` / `confirmerLogo` / `supprimerLogo`, états d'envoi, erreurs `session` / `reseau` / `confirmation`.
- `plafondLogoKo` venant du serveur.
- Redirection vers `/bienvenue` si l'onboarding n'est pas fait.
- Retour à l'état confirmé quand `supprimerLogo` échoue.
- Normalisation des réseaux au blur : **présente aussi dans la maquette** (`normaliser`, `marque.js:76`).

**(b) Maquette sans équivalent**
- *Design ou mouvement, à porter :*
  - Sections numérotées par une pastille numérique `reglage__n` (le produit met « 1. », « 2. »… dans le **texte du titre**).
  - Description en `<input>` d'une ligne (le produit : textarea ≥ 84 px avec compteur ; la maquette garde le compteur `n / 150`).
  - Mise en page du bloc couleur et des démonstrations.
  - Texte d'état `marque__statut` près du bouton, avec animation de 220 ms.
  - L'aperçu pour **bureau** : colonne de la page du produit à largeur fixe, 1180 px réduit par `transform: scale` mesuré (`cadrer`).
- *Fonctionnalité nouvelle, à signaler :*
  1. **Bascule Desktop / Mobile de l'aperçu** (`marque.html:136-140`, `marque.js:137`) + lien « Voir la page client ». Le produit l'avait **volontairement refusée** (commentaire formulaire-marque.tsx:409-420 : « deux boutons qui ne changeraient rien »). C'est devenu pertinent depuis `ApercuClient`, qui a la même bascule. La maquette dessine un vrai rendu desktop (`creerPage(true)`).
  2. **Validation en direct** des champs couleur, lien et réseaux à la frappe / au `change`, avec focus automatique et défilement vers la première erreur à la soumission, et message « Rien n'a été enregistré. » (`marque.js:203-235, 272-281`). Le produit ne valide qu'au serveur (`ReglagesMarque`, champs nommés en retour). Son texte exact existe presque : `marque.erreur.ecriture` = « Rien n'a été enregistré. Réessayez dans un instant. » (message différent : à reconnaître).
  3. **Glisser-déposer d'une image** sur la zone du logo (`marque.js:264-267`) : le produit n'a que le bouton.
  4. **Lien « Voir la page client »** dans l'aperçu (`apercu-format__lien`, `href="client.html"`) : le produit n'a pas de page client sans commande. Sans objet, ou à relier à une commande exemple : décision à prendre.
  5. **Aperçu repeint dans les trois langues avec la page client complète** (en-tête, galerie, QC, livraison, contact, carte DropLink) : le produit a une miniature plus simple (en-tête, barres, vignettes, bouton, réseaux).
  6. Choix de contacts « Une question ? » (`ORDRE_CONTACT`) selon les réseaux : logique de la **vraie** page client à confirmer ; je ne l'ai pas vérifiée dans `components/publique/`.
  7. Compte démo **Pro** : valeurs de démonstration (`Atelier Nord`, `atelier-nord`, `#0F766E`).

**(c) Textes**
- Presque tout est dans `marque.*`.
- *À créer ou à scinder :* titres sans préfixe numérique (« Identité de la marque », etc.), si la numérotation passe en pastille ; sinon laisser « 1. … ».
- La phrase « Rien n'a été enregistré. » seule (si on garde `marque__statut`) : différente de `marque.erreur.ecriture`.
- `Desktop` / `Mobile` existent déjà côté éditeur (`editeur.apercuDesktop`, `editeur.apercuMobile`) ; il faudra une clé dans `marque` ou un partage.
- Les 3 langues de l'aperçu dans `marque.js:56-58` sont codées en dur : en produit elles viennent de `tousLesLibellesApercu()`.

### 2.5 Risques
- Le fichier du logo ne doit jamais traverser une Server Action (1 Mo) : garder PUT direct signé, puis `confirmerLogo` (taille relue côté serveur).
- La maquette réduit le logo à 256 px WebP et refuse s'il dépasse 20 Ko ; le produit fait la même réduction (`logoReduit`) mais la taille se **relit** côté serveur. Ne jamais se fier au calcul client.
- Si la validation en direct est portée : le serveur reste l'autorité, sinon on annonce un enregistrement que la base refuse.
- Le bouton principal (dégradé) ne doit pas peindre l'accent du vendeur (règle 3).
- Pas de `backdrop-blur` sur `/p/[token]` ; l'aperçu est sur une surface DropLink.
- Aucun appel tiers dans le chemin de sauvegarde (R2 déjà borné par `fetchBorne`).

---

## 3. `parametres`

### 3.1 Fichiers du produit
- `(app)/parametres/page.tsx` : `exigerVendeur` (l.108), redirection `/bienvenue`, lecture en parallèle de sessions, RPC `lister_mes_facteurs`, RPC `lire_plafond_gratuit_a_vie`, table `appareils_fiables` (actifs seulement, l.124). `searchParams.adresse=suivie`.
- `(app)/parametres/actions.ts` : `enregistrerNom`, `changerMotDePasseCompte`, `changerAdresseCompte`, `fermerAutresSessions`, `revoquerAppareilFiable`, `changerLangueInterface`, `commencerActivation`, `confirmerActivation`, `desactiverDeuxEtapes`, `supprimerMonCompte`, `supprimerMesDonnees`.
- `components/parametres/{carte-reglage.tsx, classes.ts, formulaires-parametres.tsx}`
- `components/lien-ecran.tsx`
- `lib/comptes/sessions.ts`, `lib/auth/{reauthentification,mot-de-passe,fuites,plancher}.ts`, `lib/paiement/plan.ts` (`urlPortailClient`), `lib/storage/purge.ts`
- Route d'export : `/api/compte/export` (lien `download`).

### 3.2 Données et règles
- **Mot de passe actuel exigé** (vérifié **avant** tout autre contrôle) pour : adresse, mot de passe, fermeture des autres sessions, **activation / désactivation 2FA**, **suppression** de compte et de données. Pas pour : nom, langue, révocation d'un appareil fiable.
- **Plancher de temps** (`attendrePlancher`) sur les gestes sensibles, succès compris.
- **Mot de passe** : 12 caractères mini, pas l'e-mail, pas identique, pas dans une fuite publique (`verifierFuite`) ; refus nommés (7 motifs `mdp_*`) ; après succès, `signOut(others)` + RPC `revoquer_tous_les_appareils_fiables`.
- **Adresse** : un e-mail de confirmation part vers la **nouvelle** adresse ; la réponse est identique que l'adresse soit libre ou prise ; quota d'envois sur la nouvelle adresse ; `?adresse=suivie` affiche un message après le lien.
- **2FA** : `commencerActivation` (retire les facteurs non vérifiés, enrôle, rend QR et clé), `confirmerActivation` (6 chiffres, quota, `challengeAndVerify`), `desactiverDeuxEtapes` (+ révocation des appareils fiables). Les appareils fiables n'existent qu'avec la 2FA (203).
- **Suppression.**
  - Preuves : session (`aal2` si 2FA), mot de passe, adresse recopiée (collage bloqué).
  - Base : une transaction, conservation d'un an de l'adresse et des dates, clés R2 en file, purge immédiate bornée à 100 clés.
  - **Nouveau :** si un abonnement prélève encore, la base refuse (DL077, 206) ; l'action rend `motif: "abonnement_en_cours"` + `portail` (`urlPortailClient()`) ; l'écran montre le lien « Résilier mon abonnement chez Lemon Squeezy », ou `portailAbsent` s'il n'y a pas d'adresse (`formulaires-parametres.tsx:596-614`).
  - Suppression de données seulement : le compte reste, vidé.
- **Abonnement.**
  - Carte lue sur `profil.planPro` : plan, 6 lignes cochées / barrées (`photos`, `couleurs`, `total` avec `{n}` lu en base et masqué si illisible ou Pro, `lien`, `marque`, `plafond`).
  - Bouton « Passer au Pro » **seulement en gratuit**.
  - Aucun paiement ici (contrainte 1).
- **Langue de l'interface** : écrite dans `profiles.locale` ET portée par l'URL ; redirection vers `/<nouvelle langue>/parametres`. Bouton « Appliquer » (pas de changement au `onChange`, WCAG 3.2.2).
- **Export** : `<a href="/api/compte/export" download>` ; pas de JS.
- Ce que le produit **exclut volontairement** (page.tsx:78-91) : téléphone, photo de profil, fuseau, 4 interrupteurs de notification, intégrations, « Nous contacter ».

### 3.3 Liste à cocher (produit)
- [ ] `EnTeteEcranDs` pleine largeur ; deux colonnes à partir de `xl` (1,45fr / 1fr)
- [ ] Carte « Informations du compte » : avatar (initiales), nom (≤ 80, bouton Enregistrer en en-tête au bureau et en bas au téléphone), adresse (bouton « Modifier » → formulaire : nouvelle adresse + mot de passe actuel), mot de passe masqué (« Modifier » → ancien + nouveau), note « Google ? Définissez d'abord un mot de passe », message `adresseSuivie`
- [ ] Carte « Préférences » : langue de l'interface (liste + « Appliquer ») + lien vers Ma marque
- [ ] Carte « Sécurité » : ligne 2FA (badge « Activée », Activer / Désactiver / Annuler / Fermer) avec panneau mot de passe → QR + clé de secours + code 6 chiffres ; ligne « Sessions actives » (Voir / Masquer, liste avec « Cet appareil », « Appareil non reconnu », erreur de lecture `role=alert`, « Déconnecter les autres appareils » avec mot de passe) ; ligne « Appareils fiables » (si 2FA) avec « Révoquer » par ligne, état « Aucun » et « lecture impossible » ; ligne **« Supprimer le compte »** (formulaire de recopie + mot de passe ; `l.840`)
- [ ] Carte « Données » : export (lien `download`) ; « Supprimer toutes les données » (recopie + mot de passe, message `ok`) ; avertissement
- [ ] Carte « Abonnement » : plan, aide, 6 lignes, « Passer au Pro » (gratuit seulement)
- [ ] Carte « Support » : « Centre d'aide » → `/<langue>/docs`
- [ ] États : `useMessage` / `Annonce` (succès `role=status`, échec `role=alert`), boutons désactivés pendant l'attente, 13 motifs d'erreur traduits

### 3.4 Écarts avec la maquette (`parametres.html`, `parametres.js`)
**(a) Produit sans équivalent**
- **Suppression de compte refusée parce qu'un abonnement court (DL077)** : message `erreurs.abonnementEnCours`, lien portail, message `portailAbsent`. Absent de la maquette (`armer($('[data-form="supCompte"]')…)` n'a qu'un chemin de succès).
- `?adresse=suivie` → `adresseSuivie`.
- Abonnement **gratuit** : la maquette n'a que l'état Pro. Manquent : lignes barrées, ligne `total` à vie, bouton « Passer au Pro ».
- Messages d'erreur détaillés : `mdpFuite`, `mdpTropLong`, `adresseIdentique`, `trop`, `indisponible`, `dejaActive`, `session`.
- « Lecture impossible » des sessions et appareils (`null`, rendu distinct de « aucun »).
- Redirection vers `/bienvenue` si onboarding à faire.
- Le menu d'avatar (initiales sur `nom_affiche ?? nom_boutique ?? email`).
- Lien « Centre d'aide » → `/docs` (la maquette a `href="#"` + `data-maquette`).

**(b) Maquette sans équivalent**
- *Design ou mouvement, à porter :*
  - **Onglets à trait glissant** : Compte / Préférences / Sécurité / Abonnement / Données / Support, `role=tablist`, clavier ← → ↑ ↓ Home End, hash `#securite` (`replaceState`), défilement du rang d'onglets au téléphone ; navigation verticale > mobile (`flexDirection === "column"`). Le produit est une page unique à deux colonnes avec cartes.
  - **Un bloc par réglage**, chaque bloc portant son bouton dans son pied (`bloc-r__pied`) : nom, adresse, mot de passe, suppression, langue, 2FA, sessions, export, suppression des données, support.
  - Animations : fondu de panneau 180 ms, dévoilement 200 ms (`devoiler`), annonce 160 ms, fondu des sessions fermées 180 ms, `reduit` respecté.
  - Le bouton « Enregistrer » du nom n'est actif qu'une fois le nom changé ; l'avatar suit la saisie.
  - Le champ « mot de passe actuel » de l'adresse n'apparaît qu'une fois l'adresse modifiée.
  - La suppression se fait en **deux temps** : un premier clic révèle la recopie et le mot de passe, le second agit (`armer`). Le produit a un panneau « Supprimer / Annuler » équivalent.
  - Aide du pied qui est **remplacée** par la réponse, puis revient à la saisie suivante (`annoncer` / `calmer`).
- *Fonctionnalité nouvelle, à signaler :*
  1. Découpage en **6 sections** et en blocs : réorganisation de l'information, pas de nouveau comportement.
  2. La maquette met « Supprimer le compte » dans **Compte**, le produit dans **Sécurité**.
  3. Le bouton « Enregistrer » conditionné à un changement de valeur (bouton désactivé tant que rien n'a changé) : le produit n'a pas cette logique.
  4. 2FA : bascule Activer / Désactiver dans l'en-tête avec pied qui n'apparaît que pendant les étapes ; **le QR de la maquette est une image statique fictive** : le produit rend le vrai `data.totp.qr_code` (jamais en dur) et la clé réelle.
  5. L'état Pro fixe du compte démo, `deuxActive = true`.
  6. Compte démo : mot de passe `demo-droplink-2026`.

**(c) Textes**
- Tout vient de `parametres.*`.
- *À créer (FR, EN, zh-CN) :*
  - « 80 caractères maximum. » (pied du nom)
  - « Le nom affiché dans votre espace, et ses initiales. »
  - Titres de sections : « Nom complet », « Adresse e-mail », « Mot de passe » comme titres de blocs. Le produit a « Informations du compte » + libellés de champ.
  - « Supprimer » / « Annuler » / « Supprimer le compte » en deux étapes (partiellement `suppression.*`).
  - Libellés d'onglets : Compte / Préférences / Sécurité / Abonnement / Données / Support. `parametres.preferences.titre`, `securite.titre`, `abonnement.titre`, `donnees.titre`, `support.titre` existent ; « Compte » n'existe qu'en `compte.titre` = « Informations du compte ».
  - « Ce que le plan Pro change » (lien du bloc abonnement vers `passer-pro`) : **non trouvé** dans `messages/fr.json`.
  - « Gérez votre abonnement et accédez à plus de fonctionnalités. » existe (`abonnement.aide`).
  - `aria-label` des onglets (« Paramètres », « Sections des paramètres ») : non trouvés.
- *À reprendre :* `erreurs.*`, `compte.*`, `securite.*`, `suppression.*`.

### 3.5 Risques
- La maquette demande le mot de passe actuel côté client (`actuelJuste`) : en produit la vérification reste **côté serveur**, avant tout autre contrôle (anti-oracle).
- La maquette met `data-sans-coller` sur la recopie : conserver `onPaste` / `onDrop` bloqués (formulaires-parametres.tsx:582).
- Le QR code est un secret du vendeur rendu à sa seule session : ne jamais le mettre dans un HTML mis en cache ni dans un journal.
- **`verifierFuite` (`lib/auth/fuites.ts`)** : appel à un service tiers sur le chemin d'une mutation. Je n'ai pas vérifié qu'il est borné ; à contrôler avant de refondre (CLAUDE.md : « tout appel à un tiers est borné »).
- **`purgerAussitot`** : borné à 100 clés, le reste à la veille.
- **Server Actions sérialisées** : une action lente (vérification de mot de passe + plancher de temps) bloque les suivantes. Ne pas regrouper plusieurs gestes dans un même formulaire.
- Le lien du portail (`urlPortailClient`) est une simple chaîne, pas un fetch : pas d'appel tiers.
- Ne pas affirmer l'état de l'abonnement sans l'avoir lu (contrainte 8) : la maquette dit « Votre abonnement Pro est actif » en dur.

---

## 4. `passer-pro`

### 4.1 Fichiers du produit
- `(app)/passer-pro/page.tsx` : `exigerVendeur` (l.70) ; `Promise.all` de `lireProfilVendeur`, RPC `lire_plafond_commandes`, RPC `lire_plafond_gratuit_a_vie`, RPC `signer_lien_paiement` (l.81-88).
- `lib/paiement/plan.ts` : `PRIX_PRO_EUR = 20` (l.23), `urlPaiementPourCompte` (l.128-139), `urlPortailClient`.
- `components/app/en-tete-ecran.tsx`.

### 4.2 Données et règles
- **Lien de paiement signé (204).**
  - `urlPaiementPourCompte` rend `null` si la signature n'a pas 64 caractères hexadécimaux.
  - Le lien porte `checkout[custom][profil_id]`, `checkout[custom][signature]`, et `checkout[email]` si l'e-mail est connu.
  - Le webhook est la **seule** surface qui pose un plan payant ; aucun montant, aucune carte chez nous.
- **Trois états** : `dejaPro` → badge « Votre plan Pro est actif » ; `paiement === null` → texte « L'abonnement n'est pas encore ouvert » (pas de bouton mort) ; sinon bouton `target="_blank" rel="noopener noreferrer"`.
- Les nombres sont **lus** : `aVie` (gratuit) et `parMois` (Pro) ; si illisibles, les deux lignes du tableau disparaissent. Les colis suivent le même nombre (le code lit le même `parMois` / `aVie`).
- Prix : `PRIX_PRO_EUR` formaté par `format.number` en EUR.
- Quatre atouts (`FEATURES`) : lien à votre nom, sans la carte DropLink, plafond qui se recharge, suivi qui suit. Pas d'autres promesses (statistiques avancées, support prioritaire, stockage 50 Go écartés).
- Tableau comparatif : commandes, colis, adresse, carte, médias, couleurs.

### 4.3 Liste à cocher (produit)
- [ ] En-tête `EnTeteEcranDs`
- [ ] Étiquette « Plan Pro », H2 « Vos liens, à votre nom », intro
- [ ] 4 cartes d'atouts (la phrase des commandes devient `texteNombre` avec `{n}` si lu)
- [ ] Tableau Gratuit / Pro (3 colonnes bureau ; au téléphone, chaque ligne devient un bloc avec valeurs nommées)
- [ ] Pastille prix « 20 € / mois »
- [ ] Phrase `facture` (Lemon Squeezy, résiliable, plan actif jusqu'à fin de période)
- [ ] 3 états du bas : déjà Pro / pas encore ouvert / bouton « Passer au Pro »

### 4.4 Écarts avec la maquette (`passer-pro.html`)
**(a) Produit sans équivalent**
- Les états **gratuit** : bouton « Passer au Pro » avec lien signé, et « pas encore ouvert ». La maquette ne montre que « Votre plan Pro est actif » (`passer-pro.html:60`).
- Nombres lus, absence de ligne si illisibles.
- Libellé `texteNombre`.
- Format monétaire par `Intl`.
- Lien signé ; `rel=noopener`.

**(b) Maquette sans équivalent**
- *Design, à porter :* mise en page `pro-accroche`, `pro-atout v4-carte`, tableau `tp`, `pro-pied`, colonne Pro mise en avant (`tp__pro`), animation décalée des lignes (`--i`), icônes de coche (`tp-oui`), `<caption class="sr">`, fil d'Ariane « Paramètres › Passer au Pro » (retour vers `parametres.html#abonnement`).
- *Fonctionnalité nouvelle :* aucune.
- Valeurs fixes de la maquette (5, 300, 20 €, `droplink.fr/p/xK9…`) : **elles ne doivent pas être écrites en dur** (le produit lit les plafonds ; le prix est `PRIX_PRO_EUR`). Elles sont celles du compte démo.

**(c) Textes** : tous existent (`passerPro.*`). Seul ajout possible : la `caption` du tableau (« Comparaison des plans Gratuit et Pro »), **non trouvée** dans `messages/fr.json`. Aucune autre chaîne neuve ; EN et zh-CN : non vérifiés.

### 4.5 Risques
- **Lien signé.** Le `profil_id` et la `signature` voyagent dans l'URL du fournisseur. Si la page devient statique (maquette), plus aucune signature : le bouton disparaît (comportement voulu, `plan.ts:135`). Ne jamais construire le lien côté client.
- Ne jamais afficher de montant autre que `PRIX_PRO_EUR`, ni de formulaire de paiement.
- `signer_lien_paiement` est une RPC sous session de l'appelant : borné par `fetchBorne` (10 s).
- Ne jamais réintroduire le rattachement par e-mail (supprimé par la 204).
- Le webhook passe de test à live sans code.

---

## 5. États de l'espace vendeur : `error.tsx`, `not-found.tsx`, `loading.tsx` (×2)

### 5.1 Produit
- `(app)/error.tsx` (client) : `CarteEtatVide` (icône `TriangleAlert`, titre `erreurs.titre`, texte `erreurs.texte`), bouton « Réessayer » (`reset`, icône `RotateCcw`), et `error.digest` affiché (`erreurs.reference`, « Référence de l'incident : {ref} ») seulement s'il existe. Le texte dit que **rien n'a été écrit ni supprimé** (vrai pour une erreur de rendu).
- `(app)/not-found.tsx` (serveur) : `CarteEtatVide` (icône `Search`, `commandes.introuvable.titre/texte`), lien relatif `./` « Revenir à mes commandes » (`ArrowLeft`). Une commande d'un autre vendeur rend **exactement** cette page.
- `(app)/loading.tsx` : squelette `aria-hidden` : titre, ligne, **8 lignes de liste** (tuile 48 px + 2 barres), `animate-pulse` (réduit par `prefers-reduced-motion` dans `globals.css`). Aucun chiffre ni libellé.
- `(app)/commandes/[id]/loading.tsx` : squelette `aria-hidden`, géométrie 7/5 colonnes : deux cartes de champs à gauche, carte de grille 2×2 de médias à droite.

### 5.2 Écarts avec la maquette
Les maquettes (`erreur-espace.html`, `commande-introuvable.html`, `chargement.html`, `commande-chargement.html`, `etats.js`) reprennent **les mêmes chaînes et la même structure** (carte, icône, titre, texte, bouton, 8 rangées, 2 cartes + 4 vignettes).
- *(a) Produit sans équivalent :* la vraie logique (`reset`, `digest` réel, 404 sans fuite sur l'appartenance).
- *(b) Design ou mouvement, à porter :*
  - Squelette animé avec décalage par rangée (`--i`) ; classes `.sq*`.
  - **Bouton « Réessayer » avec état `aria-busy`** et délai de 650 ms avant bascule (`etats.js:9-13`) : le produit appelle `reset()` sans état d'attente visible. Un état « en cours » est un ajout de design, pas une nouvelle fonction ; il doit refléter l'attente réelle de `reset`, pas un délai fixe.
  - **Annonce de chargement** : `<p class="sr" role="status">Chargement…</p>` + `aria-busy="true"` sur le `<main>` (`chargement.html:17-18`). Le produit est `aria-hidden` sans annonce. `Chargement…` existe en `fr.json:3`. C'est une amélioration d'accessibilité, **pas** une nouvelle fonction.
  - Thème sombre appliqué aux états (`etats.js:7`).
- *(b) Fonctionnalité nouvelle :* aucune pour les états, hors thème.
- *(c) Textes :* tout existe. `erreurs.*` et `commandes.introuvable.*` sont identiques mot pour mot. À vérifier en EN / zh-CN (non lus).

### 5.3 Risques
- **Ne jamais mettre de donnée dans un squelette** (aucun chiffre, aucun nom), sinon on affirme ce que la base n'a pas dit.
- `error.tsx` doit rester sûr : pas de `error.message` affiché (seul `digest`).
- `not-found.tsx` doit rendre la même page pour « n'existe pas » et « n'est pas à vous » (sinon on confirme l'existence d'une commande tierce). Garder le 404, jamais un 403.
- `loading.tsx` de la fiche : géométrie identique à la fiche réelle pour éviter le décalage cumulé. Si la fiche passe à 4 tuiles + 3 rangées de cartes, adapter le squelette en conséquence (aujourd'hui il est à 2 colonnes seulement).
- `.sq` animé doit respecter `prefers-reduced-motion` (règle 4).

---

## Points à décider avec Wassim / Mehdi avant d'implémenter
1. H1 de la fiche : référence courte (produit) ou nom du client / « Nouvelle commande » (maquette) ?
2. Détection du transporteur par regex côté navigateur : à porter comme **indication** ? ou rester serveur ?
3. Thème sombre : nouvelle fonctionnalité globale, non demandée jusqu'ici.
4. Paramètres en onglets (maquette) contre page à deux colonnes (produit) : réorganisation sans changement de comportement, mais les bloc-par-réglage changent l'interaction du bouton « Enregistrer » (actif seulement après changement).
5. Aperçu de Ma marque : bascule Desktop / Mobile (refusée dans le code actuel, désormais cohérente avec `ApercuClient`) ; lien « Voir la page client » sans commande à viser.
6. Validation en direct sur Ma marque et glisser-déposer du logo : ajouts de comportement, pas seulement de design.
7. Textes à créer en FR, EN, zh-CN : voir §1.4(c), §2.4(c), §3.4(c), §4.4(c).
