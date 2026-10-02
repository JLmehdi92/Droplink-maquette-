# Refonte du design : journal d'intégration

> **À lire avant de toucher un écran.** Ce fichier est la mémoire de la refonte : d'où elle
> vient, ce qui a été décidé, comment on l'intègre, ce qui est fait et ce qui reste. Il se met
> à jour à CHAQUE étape, dans le même commit que l'étape. `CLAUDE.md` § « Assets design »
> renvoie ici.

## 1. D'où vient cette refonte

Entre le 27/09 et le 01/10/2026, Mehdi a fait refaire tout le design de DropLink dans une
session Claude Code **web**, hors de ce dépôt. Ton Claude Code sous VS Code n'en a jamais rien
vu : ce fichier existe pour combler ce trou.

- **Ce qui a été produit** : une maquette HTML statique complète, versionnée ici dans
  `design/maquette/`. Elle couvre les 36 routes du produit au commit `d1f3389`, plus ses 8
  écrans d'état (erreurs, introuvable, chargements). Elle a été publiée en artefact pour
  validation, et Mehdi l'a validée.
- **Comment elle a été faite** :
  - deux skills de design, `emil-design-eng` (le mouvement, les détails et les états
    d'Emil Kowalski) et `design-taste-frontend` (le goût et les anti-patterns d'interface) ;
  - l'analyse des sites de grands SaaS (Linear, Vercel, Stripe…) via firecrawl ;
  - des contrôles Playwright à chaque étape : 6 largeurs, clair et sombre, cibles de 44 px,
    texte d'au moins 11,5 px, aucun tiret long, aucune erreur de console.
- **Comment elle a été construite** : en LISANT ce dépôt. Ses textes viennent de
  `messages/fr.json`, ses règles de `src/lib/`, ses fonctionnalités des routes existantes.
  **Elle n'invente aucune fonctionnalité**, à une exception près : un thème sombre, qui ne se
  porte pas (le produit n'en a pas, voir § 3).
- **Des vidéos de motion design** ont aussi été faites dans la même session (skill
  `film-lancement-saas`). Elles ne concernent pas ce dépôt, sauf pour une chose : le « film »
  animé en fond des pages de connexion et d'inscription, qui vient de cette grammaire
  (`design/maquette/src/film.js`).

### Voir la maquette

```
node design/maquette/outils/construire.mjs
npx --yes http-server design/maquette/dist -p 4100 -s
```

Puis ouvrir `http://127.0.0.1:4100/plan.html` : la liste de tous les écrans, rangés par
surface. `dist/` est produit par la commande et ignoré par git.

### Ce qu'il y a dans `design/maquette/`

```
src/*.html             un fichier par écran (avant assemblage)
src/coque.html         la coque de l'espace vendeur (barre latérale, barre du haut)
src/css/base.css       landing, accès, pages publiques
src/css/app.css        espace vendeur, page client, administration, écrans d'état
src/*.js               comportements, un fichier par écran ou par couche
outils/construire.mjs  assemble src/ → dist/ (coque, icônes, page client)
outils/admin.mjs       génère les 11 écrans d'administration
outils/pages-publiques.mjs  générait tarifs, docs, blog, légal, signalement, plan
                       ⚠️ il échoue désormais : les textes légaux ont changé (§ 4)
assets/                images, polices Inter, sprite d'icônes Lucide
```

L'historique git de la maquette (47 commits, chacun avec le POURQUOI de ses choix et ses
mesures) est dans l'archive `droplink-maquette.zip` que Mehdi a reçue, pas dans ce dépôt.

## 2. Qui gagne quand deux sources se contredisent

Du plus fort au plus faible :

1. **Les contraintes verrouillées** de `CLAUDE.md` et les 26 décisions de `BRIEF-DROPLINK-COMPLET.md`.
2. **Les données et les règles du produit** : base, RLS, fonctions, `src/lib/`. La maquette
   les MONTRE, elle ne les définit jamais. Aucun chiffre de la maquette n'est une donnée : ce
   sont des données de démonstration.
3. **La maquette**, pour tout le visuel et le mouvement : mise en page, hiérarchie, matière,
   animations.
4. **Le design system** (gitignoré, sur le poste de Mehdi), pour ce que la maquette ne tranche
   pas. Il se resynchronise après coup.

## 3. Décisions déjà prises (ne pas les rediscuter)

| Date | Décision | Par |
|---|---|---|
| 01/10/2026 | La maquette devient la référence du design, versionnée dans `design/maquette/` | Mehdi |
| 01/10/2026 | **Les témoignages et « +2 500 vendeurs nous font déjà confiance » quittent la landing** (`landing.kit.trust`, `testi*`, `q1` à `q3`) : ce ne sont pas des faits vérifiables | Mehdi |
| 01/10/2026 | **Rien ne doit atteindre la production pendant l'intégration** : chaque push sur GitHub peut redéployer Railway | Mehdi |
| 01/10/2026 | Le thème sombre de la maquette ne se porte pas (fonctionnalité absente du produit) | conséquence de « ne rien inventer » |
| 01/10/2026 | La maquette retire le flou (`backdrop-filter`) des barres collantes pour la fluidité (§ 6) ; pour l'en-tête de la landing, que `CLAUDE.md` autorise, **la question reste ouverte** | à trancher par Mehdi |

### Ce qui ne se porte PAS

| Élément de la maquette | Pourquoi |
|---|---|
| `plan.html`, les liens « Toutes les pages » et « Voir l'ancienne landing » | navigation de maquette, pas des écrans du produit |
| `ancienne-landing.html` | archive de comparaison |
| les données de démonstration (`COMMANDES` dans `commande.js`, `COMPTES` et `JOURNAL` dans `outils/admin.mjs`, etc.) | le produit a ses données |
| « Réessayer » qui navigue vers un écran (`etats.js`) | dans le produit, c'est `reset()` de `error.tsx` |
| la navigation de la coque en `fetch` + `DOMParser` (`coque.js`) | le produit a le routeur de Next ; seule la chorégraphie se porte (§ 6) |
| le thème sombre et les boutons clair / sombre | absents du produit |

### Ce que le produit a, que la maquette ne montre pas, et qui RESTE

**Une fonctionnalité perdue pendant le portage est un défaut bloquant.** L'inventaire du § 5
liste, écran par écran, tout ce que chaque écran fait aujourd'hui. Relevé dès le départ :

- **le sélecteur de langue** de la landing (`src/components/landing/selecteur-langue.tsx`) ;
- **les trois langues partout** : la maquette est en français seulement ;
- **les mentions légales** (`mentions-legales`, route créée après la maquette) ;
- **tous les changements produit postérieurs à `d1f3389`** (§ 4).

## 4. Ce qui a changé dans le produit depuis la maquette

La maquette lit le dépôt au commit `d1f3389` (27/09/2026). L'intégration part de `43ec195`
(30/09/2026). Entre les deux, 16 commits, dont :

- le gratuit passe à **5 commandes et 5 colis suivis à vie** (`d86a0eb`). La maquette affiche
  déjà 5, mais **le produit lit ce nombre en base** (`lire_plafond_gratuit_a_vie`), et il ne
  s'écrit jamais en dur ;
- **les textes légaux sont réécrits** depuis le produit réel, et une page **mentions légales**
  est publiée (`5731785`, `0b58ed6`). Les pages légales de la maquette sont donc périmées :
  on porte leur MISE EN PAGE, avec les textes ACTUELS ;
- la page client est servie **en anglais par défaut** (`da83ccf`) ;
- l'administrateur est envoyé taper son code 2FA, et toute écriture d'administration l'exige
  (`9a486c1`, `c357d57`) ;
- la suppression de compte est bloquée tant qu'un abonnement est prélevé (`6e56716`, `83a5a61`) ;
- les places de quota sont rendues aux brouillons de moins de 20 secondes (`7679ddd`, `1ead656`).

Avant de porter un écran, relire `git log d1f3389..HEAD -- <fichiers de l'écran>`.

## 5. Inventaire écran par écran

Cinq agents `ecc:code-explorer` en lecture seule ont comparé, le 01/10/2026, chaque écran du
produit (`43ec195`) à son écran de maquette. Pour chacun : fichiers, données lues, **liste à
cocher de tout ce que l'écran fait** (rien ne doit être perdu), écarts dans les deux sens,
textes à créer, risques. Leurs rapports sont dans `consignes/refonte-inventaire/`, repris mot
pour mot :

| Fichier | Écrans |
|---|---|
| `1-landing-et-pages-publiques.md` | landing, tarifs, docs, blog, légal (dont mentions légales), signalement, 404 global, erreur publique, coque publique |
| `2-acces-et-pages-de-compte.md` | connexion, inscription, mot de passe oublié, nouveau mot de passe, vérification, bienvenue, notification, le film |
| `3-coque-tableau-commandes-envois-analyses.md` | coque de l'espace vendeur, tableau de bord, commandes, envois, analyses |
| `4-fiche-commande-marque-parametres-etats.md` | fiche et éditeur de commande, Ma marque, Paramètres, Passer au Pro, états de l'espace vendeur |
| `5-page-client-et-administration.md` | `/p/[token]` (et aperçu, erreur, lien mort), les 11 écrans d'administration |

⚠️ Ces rapports se lisent avec les trois corrections notées en tête de chacun : 5 et non
15, pas de thème sombre, pas de témoignages.

### Ce que l'inventaire change à l'idée qu'on se faisait de la refonte

- **Ce n'est pas un simple habillage.** Sur l'espace vendeur et la page client, la maquette
  change la structure (coque plus étroite, titres de 22 px au lieu de 40, hero de la page
  client) et propose des comportements que le produit n'a pas. Chacun est listé ci-dessous.
- **Les pages légales de la maquette sont périmées** : on porte leur mise en page, avec les 14,
  10 et 6 sections ACTUELLES de `legal.pages.*`.
- **La maquette est en français seulement** : chaque texte neuf se crée en FR, EN et zh-CN.
- **Ses formulaires utilisent d'autres noms de champs** que les actions serveur (`mdp` au lieu
  de `motDePasse`, `type` au lieu de `typeDeCompte`, cases du code 2FA sans `name`). On garde
  TOUJOURS les noms du produit (`tests/unit/formulaires-et-actions.test.ts`).
- **La maquette valide côté client, le produit côté serveur.** Une validation client se porte
  comme un confort ; le serveur reste la seule autorité, et aucune ne dit quoi que ce soit sur
  l'existence d'un compte.

### Arbitrages pris par Claude (pilote automatique, `CLAUDE.md` § Workflow)

Ces points relèvent de règles déjà écrites (sécurité, performance, « l'interface n'affirme
jamais ce que la base n'a pas enregistré ») ou d'un choix de design. Ils sont tranchés, avec
leur raison :

| Point | Décision | Raison |
|---|---|---|
| Filtres et tris instantanés de Commandes et Envois (la maquette filtre en mémoire) | **Non** : l'URL reste l'état, le serveur filtre, et la transition donne le ressenti | 9 600 commandes, pagination par curseur (`CLAUDE.md` § Performance) |
| Archivage, duplication, lot en Server Action animée | **Non** : POST natif conservé | `lib/commandes/geste-liste.ts` documente treize pistes fermées |
| Détection du transporteur par regex dans le navigateur (« Colissimo reconnu ») | **Non** | la détection réelle est serveur ; afficher une supposition, c'est affirmer ce que la base n'a pas (contrainte 8) |
| Code de vérification en 6 cases | **Oui pour les cases**, avec un champ `code` unique envoyé et `one-time-code` sur la première ; **non à l'envoi automatique au 6e chiffre** | chaque envoi consomme le quota partagé avec la connexion |
| Phrase « en continuant, vous acceptez… » sur la connexion | **Non** | retirée exprès par le produit : se reconnecter n'accepte rien de nouveau |
| Mot de passe oublié en panneau dans la connexion (`#oubli`) | **La route `/mot-de-passe-oublie` reste** ; le panneau peut y mener | des liens existants y pointent ; même action `demanderReinitialisation` |
| Google | **Reste un formulaire POST** vers `partirVersGoogle`, affiché seulement si `AUTH_GOOGLE_ACTIF` | garde du fournisseur et quota |
| « Se déconnecter » de la vérification | **`BoutonDeconnexion`** (POST), dans un `<div>` | un lien ne déconnecte pas ; un `<form>` dans un `<p>` casse l'hydratation (#418) |
| Motif minimal des dialogues d'administration | **8 caractères**, la valeur du produit (`suspension.ts:20`), et non 10 comme la maquette | la donnée du produit gagne |
| Sommaire des pages légales qui suit la lecture | **Non** : le sommaire reste sans JavaScript | refus documenté dans `page-legale.tsx:136-140` |
| Titres de page « X · DropLink » au lieu de « X — DropLink » | **Non** : on garde les titres des catalogues | changer trois catalogues et la fumée pour une ponctuation n'est pas la refonte |
| Menu mobile des pages publiques | **`<details>` sans JavaScript**, habillé comme la maquette | même rendu, zéro JS |
| Lieux par étape du trajet sur la page client (« Lyon · 29 sept. ») | **Non** | ce serait interpréter les passages du transporteur, ce que `historique-suivi.tsx:17-30` refuse |
| Fragment `page-client.html` imité dans les écrans vendeur | **Non** : l'aperçu reste la vraie page en cadre (`/p/<jeton>/apercu`) | décision du 26/09 |

### Décisions qui appartiennent à Mehdi

Elles changent le produit, pas seulement son apparence. **Aucune n'est tranchée au
01/10/2026.** Chaque réponse s'écrit dans la colonne ci-dessous, datée, avant de toucher
l'écran concerné ; une ligne sans réponse veut dire « ne pas porter, garder le produit ».

| n° | Réponse de Mehdi | Date |
|---|---|---|
| 1 à 13 | **« je prends tout »** : chaque décision suit la MAQUETTE. Pour la n° 1, le menu hamburger, avec la précision « un menu hamburger fluide avec une animation fluide » — le tiroir de la maquette a été refait en conséquence (§ 8, entrée du 02/10) | 02/10/2026 |

⚠️ **Ce que « la maquette » implique, à dire en portant chaque écran** : n° 3, prix et quotas
LUS EN BASE (jamais écrits dans la page) ; n° 4, **la ligne « Utilisé par des vendeurs sur
Vinted, eBay… » (`usedOn`, `src/app/[locale]/page.tsx` l. 396-407) QUITTE la landing**
— Mehdi, 02/10/2026 : « mets pas ça sur la landing page ». Elle n'est PAS dans la maquette
(vérifié : aucune occurrence dans `design/maquette/src/`) ; elle vivait seulement dans la
landing actuelle du produit, et une note précédente de ce journal l'attribuait à tort à la
maquette. Même famille que les témoignages : une affirmation invérifiable. La phrase « Fonctionne avec Vinted, eBay, Shopify… » (`f6b`) part pour la même raison : la maquette ne l'a pas non plus. Le formulaire
« Restez informé » et les icônes de réseaux du pied partent aussi, comme dans la maquette ; n° 13, le
badge « Pro » demande une migration, donc une écriture en production par Mehdi AVANT le push.


1. Navigation mobile de l'espace vendeur : barre d'onglets en bas (produit) ou tiroir à hamburger (maquette).
2. Page client : porter la version 3 complète de la maquette (hero à l'aplat du vendeur avec l'état en titre, trajet animé, carrousel de photos, historique en feuille), ou garder la mise en page actuelle restylée. La v3 a des risques mesurables : LCP, contraste du texte à opacité réduite, photos QC assombries par `mix-blend-mode`, budget de 300 Ko.
3. Landing : afficher les quotas et le prix lus en base (la page cesse d'être purement statique, sauf revalidation périodique), ou une landing sans chiffres.
4. Landing : retirer aussi, comme les témoignages, la ligne « Utilisé par des vendeurs sur Vinted, eBay… » (faux logos), le formulaire « Restez informé » (non branché) et les icônes de réseaux du pied (décoratives).
5. Bouton « Créer une commande » dans la barre du haut de chaque écran vendeur (il porte alors le seul dégradé de l'écran).
6. Aperçu de la page client au survol d'une commande (tableau de bord, liste).
7. Titre de la fiche commande : la référence (produit) ou le nom du client / « Nouvelle commande » (maquette).
8. Paramètres en six onglets (maquette) ou en une page à deux colonnes (produit).
9. Ma marque : bascule Mobile / Desktop de l'aperçu, validation en direct, glisser-déposer du logo.
10. Tableau de bord : graphique à bascule « Commandes / Liens clients » et période qui change sans recharger.
11. Signalement : panneau « Votre message est prêt » avec « Copier le message ».
12. Flou de l'en-tête de la landing (autorisé par `CLAUDE.md`, retiré par la maquette pour la fluidité).
13. Administration : badge « Pro » dans la liste des comptes (demande une migration), section « Ce qui demande une décision » sur la vue d'ensemble.

### Jetons : ce que la maquette ajoute (mesuré le 01/10/2026)

**Les couleurs ne changent pas.** Sur les 44 jetons de `:root` de la maquette, toutes les
couleurs de base existent déjà dans `src/app/globals.css` avec la même valeur : accent
`#5B4BF5`, page `#FBFBFE`, teinte `#F1F0FE`, les trois gris, les filets, les encres d'état.
Les ombres et l'anneau de focus aussi (`--shadow-ds-*`, `--anneau-ds-focus`). **Aucune
migration globale de jetons n'est donc à faire** : la refonte se joue composant par
composant.

Ce qui est réellement nouveau :

| Jeton de la maquette | Valeur | Remarque |
|---|---|---|
| `--ease-out` | `cubic-bezier(.23, 1, .32, 1)` | la courbe d'Emil Kowalski ; le produit a `--ease-ds-out`, de valeur différente. **Ne pas écraser** : créer un second jeton |
| `--ease-in-out` | `cubic-bezier(.77, 0, .175, 1)` | idem |
| `--degrade` | `linear-gradient(100deg, …)` | mêmes trois couleurs que `--degrade-ds-marque`, angle à comparer |
| `--survol-ligne` | `#F8F8FC` | survol des lignes de tableau |
| `--sol-onglet` | `#FAFAFD` | fond d'onglet |
| `--gouttiere` | `clamp(16px, 4vw, 40px)` | marge latérale |
| `--halo`, `--lueur`, `--verre` | — | décor (halo de carte, reflet, barre presque opaque) |

## 6. Les règles de construction apprises sur la maquette

Chaque point a été mesuré au navigateur, processeur ralenti ×4. **Ce sont des règles, pas des
goûts.**

- **Pas de `backdrop-filter` sur une barre collante** : il recompose tout ce qui défile
  dessous, à chaque image. Commandes, Envois, Tableau, Ma marque et l'admin passaient de
  22-32 à 60 images/s au défilement sans lui. On garde la même teinte, presque opaque : 97 %
  sur les pages publiques, 98 % dans l'espace vendeur.
- **Le grain est peint dans le fond de la page** (`background-image`, opacité incluse dans
  l'image), jamais en couche fixe par-dessus l'écran, jamais en `mix-blend-mode`.
- **Les entrées attendent que la page soit posée** (structure lue, police chargée, une image
  passée), avec un plafond de 900 ms. Sinon leurs premières images tombent sur la mise en page
  complète et sur le remplacement de la police (jusqu'à 467 ms). Ici, la police vient de
  `next/font` : vérifier d'abord ce qui reste à attendre.
- **Une entrée finie ne garde pas `fill: both`** quand ses keyframes n'ont qu'un départ :
  `backwards` donne le même rendu sans laisser l'animation active, ce qui garderait
  l'élément en calque.
- **Une animation hors écran est annulée, pas mise en pause**, en retenant sa position. En
  pause, elle reste active et fait promouvoir tout ce qui la suit.
- **Changement d'écran de l'espace vendeur** : le nouvel écran est inséré invisible, et son
  entrée part une image plus tard. Le produit n'a aujourd'hui AUCUNE transition entre écrans
  (pas de `template.tsx`, pas de View Transition) : c'est à créer. La chorégraphie exacte est
  dans `design/maquette/src/coque.js`, fonction `aller` : sortie de 110 ms, entrée de 240 ms
  sur 10 px, pastille de navigation qui glisse en 300 ms, sens selon l'ordre des écrans.
- **Le film des pages d'accès** (`film.js`) est rendu en direct, sans bibliothèque ni WebGL :
  - il n'écrit que les styles qui changent, en valeurs arrondies ;
  - il ne tourne que visible, onglet affiché, et rien n'est construit sous 1021 px ;
  - son mode léger (sans flou, mouvement intact) se juge en continu sur les 60 dernières
    images ;
  - sous `prefers-reduced-motion`, il affiche une image fixe.

  À porter en composant client isolé, chargé sur ces deux routes seulement.
- **Tout mouvement respecte `prefers-reduced-motion`** et ne porte aucune information.

## 7. La méthode d'intégration

Pour chaque écran, dans cet ordre :

1. **Lire** l'écran de la maquette (servi), son source, et sa ligne d'inventaire (§ 5).
2. **Implémenter** avec les jetons du produit (classes `ds-*` de Tailwind v4). Ne jamais copier
   un CSS de la maquette tel quel : traduire ses valeurs en jetons, et créer le jeton qui manque.
3. **Comparer** au navigateur, maquette et produit côte à côte, au bureau et à 390 px, avec les
   sondes du dépôt (`scripts/verifier-ecran-migre.mjs`, `scripts/comparer-au-kit.mjs` en
   servant la maquette comme kit, `scripts/soustraire-inventaires.mjs`).
4. **Vérifier** : trois langues, `prefers-reduced-motion`, CSP, console propre, cibles de 44 px,
   police ≥ 11,5 px sur téléphone, et la liste à cocher de l'écran (rien de perdu).
5. **`pnpm gates`**, en relevant le décompte. Puis un commit par écran, par `git commit -F -`
   avec un heredoc à délimiteur quoté, jamais `-m`.

Avec ECC (plugin `ecc@ecc`) :
- **lecture** : `ecc:code-explorer` et `ecc:planner` ;
- **relecture de chaque diff**, en lecture seule et en parallèle : `ecc:react-reviewer`,
  `ecc:typescript-reviewer`, `ecc:code-reviewer` et `ecc:silent-failure-hunter`, plus
  `ecc:security-reviewer` sur les formulaires, l'accès et l'admin ;
- **textes** : `ecc:i18n-sync` pour les trois langues ;
- **à ne pas utiliser** : `ecc:e2e-runner` (il met les tests en quarantaine),
  `ecc:refactor-cleaner` (il supprime du code), `/prp-commit` (il fait `commit -m`), `/pr`
  (il pousse), les orchestrations parallèles, et le renommage de `middleware.ts` en
  `proxy.ts` que suggère `ecc:nextjs-turbopack`.

Les hooks d'ECC (`config-protection`, GateGuard) sont actifs : on ne les contourne jamais.

**Ordre** :
1. jetons et coque ;
2. landing ;
3. accès, avec le film ;
4. espace vendeur ;
5. page client ;
6. pages publiques ;
7. pages de compte ;
8. administration ;
9. états.

## 8. Journal des étapes

### ▶️ 01/10/2026 — préparation (session Claude Code web)

- Branche `claude/saas-motion-design-video-r3ani3` avancée sur `master` (`43ec195`), sans
  fusion, en avance rapide.
- **État de référence avant toute modification**, relevé ici :

  | Contrôle | Résultat |
  |---|---|
  | `pnpm typecheck` | 0 erreur, une fois `next-env.d.ts` généré par `next typegen` (fichier ignoré par git, normalement produit par `next dev` ou `next build`) |
  | `pnpm lint` | 0 erreur, 1 avertissement préexistant (`tests/unit/suivi-quota-fournisseur.test.ts`) |
  | `pnpm test` | 1 261 / 1 262 |

  ⚠️ **Le seul échec est une alarme volontaire**, pas un défaut : `tests/unit/deploiement.test.ts`
  devient rouge 60 jours avant le 01/12/2026, date à laquelle Railway cessera de lire
  `railway.json`. **Action pour Mehdi**, dans le tableau de bord Railway : recopier la commande
  de build, la commande de démarrage et la politique de redémarrage dans l'onglet Settings du
  service, PUIS supprimer le fichier. Jamais l'inverse.
- **Les portes complètes n'ont pas pu tourner dans cette session** : `pnpm gates` exige
  `.env.test.local` (la base de tests), absent de l'environnement cloud. Sans elle, même
  `pnpm build` échoue, puisqu'il prérend des écrans qui interrogent la base. Mehdi ajoute ces
  variables à l'environnement ; les écrans se porteront dans une session qui les a.
- La maquette est versionnée dans `design/maquette/`, octet pour octet identique à celle
  validée. Seuls 5 de ses scripts ont été nettoyés pour lint : variables mortes retirées, et
  une directive sur les 3 qui naviguent par `location.href`, normal pour une page statique.
  `eslint.config.mjs` n'a pas été modifié (le hook `config-protection` d'ECC l'interdit).
- `CLAUDE.md` § « Assets design » : la maquette devient la référence, et la décision sur les
  témoignages est consignée.

### ▶️ 02/10/2026 — décision de Mehdi : un dépôt bac à sable, jamais le vrai

- **Mehdi :** « faut pas que railway redéploie […] fais un autre repo GitHub exprès pour faire
  tout ça et quand on voit que tout est good là on pourra le mettre sur le vrai GitHub et push ».
  Railway redéploie à chaque push sur `JLmehdi92/droplink2`. Un AUTRE dépôt n'est relié à
  aucun service Railway : on peut y pousser autant qu'on veut sans toucher droplink.fr.
- La création du dépôt par Claude a échoué (GitHub : `403 Resource not accessible by
  integration` — l'application Claude n'a pas le droit de créer un dépôt). **Mehdi le crée à
  la main** (voir § 10).
- Le travail de préparation est commité **localement** sur la branche de travail, pour être
  poussé vers le bac à sable dès qu'il existe. ⚠️ **Ce commit a été fait sans les portes
  complètes** (pas de base de tests dans cette session) et avec l'alarme Railway rouge : c'est
  admis UNIQUEMENT parce qu'il part vers le bac à sable. Rien de ce dépôt ne revient dans le
  vrai sans `pnpm gates` vert (§ 10, étape 4).

### ▶️ 02/10/2026 — le menu des écrans étroits refait (maquette)

- **Mehdi :** « faut un menu hamburger quand on est dans le saas genre tableau de bord,
  commandes etc soit c'est moi j'le vois pas soit y'a pas de menu hamburger fluide ».
- **Ce qui existait** : un tiroir sous 1 020 px, espace vendeur et administration. Ses trois
  défauts, mesurés : la fermeture était SÈCHE (`visibility: hidden` tombait au premier instant,
  le glissement de sortie n'était jamais vu) ; aucun voile, donc rien ne disait que l'écran
  derrière était hors d'atteinte ; l'icône sautait de ☰ à ✕ par échange de symbole. Et le
  code était recopié dans `coque.js` et `admin.js`.
- **Ce qui le remplace** : `design/maquette/src/tiroir.js`, un seul module pour les deux
  surfaces (`window.DropLinkTiroir`), et ses styles dans `src/css/app.css` :
  - glissement `cubic-bezier(.32, .72, 0, 1)`, **380 ms à l'ouverture, 260 ms à la fermeture**
    (on attend une ouverture, jamais une fermeture), `visibility` retardée de la durée de
    sortie ;
  - un voile `rgba(11, 11, 24, .36)` **sans flou** (le flou coûterait chaque image du
    glissement sur un téléphone modeste) ; un toucher dessus ferme ;
  - ☰ → ✕ par trois traits qui se rejoignent, et une croix dans le tiroir lui-même (le bouton
    du haut est recouvert par le tiroir ouvert) ;
  - les liens entrent en cascade (32 ms d'écart), à chaque ouverture ;
  - **le geste du pouce** : on repousse le tiroir vers la gauche, il suit le doigt, le voile
    pâlit avec lui ; au lâcher il se ferme au-delà de 32 % de sa largeur OU à plus de
    0,45 px/ms, sinon il revient. Un geste vertical reste un défilement ;
  - le reste de l'écran est `inert` tant que le tiroir est ouvert, le défilement de la page
    est bloqué, le focus va au lien de l'écran courant et revient au bouton à la fermeture
    (Échap, voile, croix) ; au-dessus de 1 020 px le tiroir se referme de lui-même ;
  - sous `prefers-reduced-motion` : un fondu de 160 ms, aucun déplacement, pas de cascade.
- **Mesuré au navigateur, 390 px tactile**, sur Commandes, Tableau de bord, Administration
  et Comptes, mouvement normal et réduit : ouverture (à 120 ms le tiroir est à −33/−44 px,
  le voile à 0,53-0,61), Échap (à 80 ms il est encore visible et en sortie, invisible à
  480 ms), geste long (fermé), geste court (revenu en place), voile, navigation depuis le
  tiroir (écran changé, tiroir refermé), aucun débordement horizontal, **aucune erreur en
  console**. Artefact « Landing DropLink » republié (version 41).
- **À porter dans le produit** avec l'espace vendeur et l'administration : le produit a
  aujourd'hui une barre d'onglets en bas sur téléphone, elle est remplacée par ce tiroir.

### ▶️ 02/10/2026 — premières portes dans le bac à sable (session Claude Code web)

- **Environnement vérifié sans afficher une valeur** : les neuf variables attendues sont
  présentes ; `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_DB_URL` et `SUPABASE_PROJECT_REF` ne
  contiennent PAS la référence de production (`csndfatwtbzqmhgqseem`) et désignent le même
  projet, `djvjaocvndqhqqgilrof`. `.env.test.local` est écrit (ignoré par git), avec des
  valeurs R2 **factices** (les seules vraies sont celles de la production).
- **`pnpm exec next typegen` puis `pnpm gates`**, décompte relevé porte par porte :

  | Porte | Résultat |
  |---|---|
  | `typecheck` | 0 erreur |
  | `lint` | 0 erreur, 1 avertissement préexistant (`tests/unit/suivi-quota-fournisseur.test.ts:80`) |
  | `build` | compilé, 104 pages statiques générées |
  | `test` | **1 261 / 1 262** — le seul échec est l'alarme Railway attendue (`tests/unit/deploiement.test.ts`, échéance du 01/12/2026), ni contournée ni désactivée |
  | `test:rls` | **0 / 0 : n'a pas pu tourner** (ci-dessous) |
  | `couverture` | non exécutée (elle lit le rapport de `test:rls`) |
  | `fumee` | non exécutée (elle sert le produit contre la base de tests) |

  `portes.mjs` s'arrête au premier rouge : les trois dernières portes ont été relancées par une
  copie locale du script limitée à elles (même chargement de `.env.test.local`, même garde de
  cible), non versionnée.
- ⚠️ **CAUSE DU BLOCAGE : le réseau du conteneur refuse la base de tests.** Le proxy répond
  `Host not in allowlist: djvjaocvndqhqqgilrof.supabase.co`, et
  `db.djvjaocvndqhqqgilrof.supabase.co` ne se résout pas (`ENOTFOUND`). Les 35 « fetch
  failed » de la porte `test` viennent de là : les tests unitaires qui touchent la base
  passent par leurs chemins de panne, d'où leur vert. Ce n'est pas un défaut du produit, et
  aucun code ne le corrige : c'est un réglage de l'environnement (§ 9).
- **Conséquence : la refonte n'est pas commencée.** La consigne de la séance fait du portage
  une suite conditionnelle aux portes, et chaque écran exige `pnpm gates` vert avant son
  commit. Porter un écran sans `test:rls` ni `fumee`, c'est commiter par-dessus du rouge.
  Seul ce journal est commité, vers le bac à sable uniquement.
- La maquette se construit (`49 pages`) et se sert : le travail de lecture est prêt.

### ▶️ 02/10/2026 — réseau « Full » : l'API répond, Postgres reste hors d'atteinte

- **Variables** (aucune valeur affichée) : `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`,
  `SUPABASE_PROJECT_REF`, `CRON_SECRET` et `NEXT_PUBLIC_SITE_URL` sont présentes. Aucune ne
  contient `csndfatwtbzqmhgqseem` : les trois qui portent une référence désignent
  `djvjaocvndqhqqgilrof`.
- **HTTPS : débloqué.** `GET <url>/auth/v1/health` rend **200** (le refus `Host not in
  allowlist` de la séance précédente a disparu).
- **Postgres : toujours injoignable, et le pooler n'y change rien.** Mesures :
  - `db.djvjaocvndqhqqgilrof.supabase.co` n'a **aucun enregistrement A** (`ENODATA`). Il n'a
    qu'une adresse IPv6, et le conteneur n'a pas d'IPv6 : la connexion échoue en
    `EAFNOSUPPORT` ;
  - **le TCP brut sortant est coupé** : `aws-0-eu-west-3.pooler.supabase.com` en 5432 et en
    6543, `aws-1-eu-west-3.pooler.supabase.com:5432` et même `github.com:22` restent sans
    réponse au bout de 6 s, alors que `example.com:80` répond. La documentation du proxy de
    l'environnement le dit en toutes lettres : les bases en TCP brut ne passent pas par lui ;
  - **passer `SUPABASE_DB_URL` à l'URL « Session pooler » ne suffira donc pas** : le pooler
    est en IPv4, mais son port n'est pas joignable non plus.
- **Portes non relancées.** `tests/aide/base.ts` ouvre une connexion Postgres directe :
  `test:rls`, puis `couverture` (qui lit son rapport) et une partie de la fumée en dépendent.
  En plus, l'écriture de `.env.test.local` à partir des secrets de l'environnement a été
  refusée par le classifieur du mode auto (« Credential Materialization »). Le fichier a été
  supprimé aussitôt, et rien n'a tourné avec lui.
- **Conséquence : la refonte n'est pas commencée.** La règle reste la même : pas d'écran
  commité sans `pnpm gates` vert.

### ▶️ 02/10/2026 — étape 1 : jetons et coque de l'espace vendeur (session cloud)

- **Portage dans le cloud, vérification finale sur le poste de Mehdi** (§ 10) : à chaque écran,
  `typecheck`, `lint`, `build`, `test` et la comparaison au navigateur ; `test:rls`, `couverture`
  et `fumee` tournent sur son poste. **Les agents ECC (`ecc:*`) ne sont pas installés dans cet
  environnement cloud** : chaque diff est relu par un agent généraliste chargé des quatre angles
  (React, TypeScript, échecs silencieux, sécurité) ; la relecture ECC proprement dite revient à
  l'étape 6 de `verification-finale-locale.md`.
- **Le CSS de la maquette est CONVERTI, pas recopié, dans `src/styles/refonte/`** — `socle.css`
  (base.css : jetons, socle, landing, accès, pages publiques), `app.css` (espace vendeur, admin,
  états, ajustements du portage), `client.css` (la page client, importée plus tard par `/p`).
  Conversion outillée : thème sombre retiré, `@font-face` retirés (Inter vient de `next/font`),
  les couleurs qui sont des jetons du produit remplacées par leur `var(--color-ds-*)`, la pile de
  polices par `var(--font-ds-body)`, `--ease-out`/`--ease-in-out` renommés `--ease-sortie`/
  `--ease-bascule` (Tailwind définit déjà `--ease-out`). **Tout est rangé dans `@layer base` et
  `@layer components`** : hors couche, une règle battrait tous les utilitaires Tailwind. Pourquoi
  convertir plutôt que retraduire chaque règle en classes `ds-*` : 4 100 lignes et ~45 écrans ;
  la traduction à la main est exactement ce qui a produit, le 12/09, quatre écrans « conformes »
  qui ne ressemblaient pas à la référence. La conversion garde les valeurs de la maquette au pixel,
  et leurs couleurs passent quand même par les jetons du produit.
- **La coque** (`(app)/layout.tsx`, `components/app/*`) : colonne de 236 px sur le sol gris, contenu
  sur une feuille arrondie, barre du haut collante sans flou (recherche Ctrl/⌘ K, cloche à deux
  familles, « Créer une commande » au dégradé — décision n° 5), menu du compte en bas de colonne
  (paramètres, déconnexion POST), lien d'évitement, encart « Passez au Pro » gardé (masqué pour
  un compte Pro), pied légal gardé. Icônes de la maquette (Lucide). **La barre d'onglets du bas est
  supprimée** : sous 1 020 px la colonne devient le tiroir de `tiroir.js` (`CoqueTiroir`) —
  380/260 ms, voile sans flou, ☰ → ✕ en trois traits, cascade des liens, geste du pouce (32 % ou
  0,45 px/ms), `inert` sur la feuille, défilement bloqué, focus au lien courant puis rendu au bouton,
  fermeture sur Échap, voile, croix, lien suivi (même vers le chemin courant) et au-dessus de 1 020 px.
  Les paramètres sont désormais dans le menu à toutes les largeurs.
- **Changement d'écran** : `(app)/template.tsx` rejoue l'entrée du contenu (240 ms sur 10 px, dans
  le sens du menu, fondu de 160 ms sous mouvement réduit) ; la pastille du menu glisse (Motion,
  `layoutId`). Les View Transitions entre documents de la maquette ne se portent pas : le produit
  ne recharge pas la page.
- **Ce qui a suivi la suppression de la barre d'onglets** : le bouton flottant de `/commandes`
  (calé dessus) est retiré — la barre du haut le remplace —, la marge négative de l'éditeur aussi ;
  les trois autres « Créer une commande » au dégradé (liste, liste vide, carte de lancement)
  passent en bouton plein : un seul dégradé par écran.
- **Mesuré au navigateur** (build de production, base de tests, vendeur de démonstration
  `refonte-demo@droplink-test.invalid` créé sur la base de TESTS) : coque à 1440 et 390 px,
  identique à `tableau.html` de la maquette ; tiroir éprouvé à 390 px tactile — à 120 ms il est à
  −33 px et le voile à 0,61 (maquette : −33/−44 et 0,53-0,61), Échap le ferme (encore visible à
  80 ms, caché ensuite) avec le focus rendu au bouton, voile, geste long (fermé), geste court (revenu),
  navigation depuis le tiroir (écran changé, tiroir refermé) ; mouvement réduit (fondu, pas de geste) ;
  fr, en, zh-CN ; aucune erreur console, aucune violation CSP, aucun débordement.
- **Relecture** (agent généraliste, quatre angles) : 17 constats ; corrigés — focus invisible sous une
  ombre (le socle garde désormais un contour), `data-scroll-behavior="smooth"` sur `<html>`, marge
  morte de l'éditeur, bouton flottant et dégradés en double, tiroir et menus qui restaient ouverts
  sur une navigation vers le même chemin, focus perdu après une navigation depuis le tiroir, Échap
  qui fermait deux choses, règle CSS morte, double repère « Espace vendeur », sens d'entrée périmé,
  `priority` obsolète, deux `catch` muets (journalisés). Écartés : poids du CSS (accepté pendant le
  chantier), cast `CSSProperties` (inoffensif).
- **Portes** : `typecheck` 0 erreur ; `lint` 0 erreur (1 avertissement préexistant) ; `build` vert ;
  `test` : seule l'alarme Railway en échec (attendue). Tests adaptés, chacun avec sa raison : la
  cible « Aller au contenu » vit dans la feuille (`cibles-tactiles`), le bouton flottant devient le
  bouton de la barre du haut (`boutons-attente`).
- **⚠️ Ce qui reste au poste de Mehdi** : `test:rls`, `couverture`, `fumee` ; les règles du socle
  (`body` 16 px/1,55, `cv11`/`ss01`, `text-wrap`) touchent aussi les écrans pas encore portés
  jusqu'à leur portage.

### ▶️ 02/10/2026 — étape 2 : la landing (session cloud)

- **Portée de `index.html`** (« l4 ») : héros où le lien se déplie en page client (fils SVG,
  parallaxe, tampon « Approuvées »), bande de quatre chiffres en rouleaux, phrase qui s'éclaire mot
  à mot avec son défileur de questions, studio à quatre onglets (jauge, flèches, Origine/Fin, pause
  au survol ET au focus), page client en cinq cases (nuancier qui applique `resoudreAccent` du
  produit, frise, démonstration de validation, langues, historique), côté vendeur en trois cartes,
  tarifs, questions (`<details name="faq">`), appel final dont le nom de lien s'écrit.
- **Décisions de Mehdi appliquées** : n° 3, quotas et prix LUS (`lirePlafondsPublics`, client sans
  session de `lib/page-publique/`, et `PRIX_PRO_EUR`) — un plafond illisible retire ses lignes et la
  phrase se dit sans nombre ; la page reste prérendue (ISR, 5 min ; vérifié dans
  `prerender-manifest.json`). N° 4 : partent témoignages, « +2 500 vendeurs », `usedOn`, `f6b`,
  « Restez informé », icônes de réseaux. N° 12 : en-tête collant SANS flou (fluidité), surface
  presque opaque dès que la page défile. Aucun thème sombre.
- **Gardé du produit** : sélecteur de langue (restylé, menu toujours aligné à droite — ouvert depuis
  la gauche, il sortait de l'écran à 390 px), mentions légales et contact au pied, blog en
  français seulement, signalement s'il existe, JSON-LD, Open Graph, alternates.
- **Composants partagés avec les pages publiques** : `EntetePublique` (menu des écrans étroits,
  Échap, focus rendu) et `PiedPublic`. Textes neufs en FR/EN/zh-CN sous `accueil.*` ; la démo de
  page client réutilise les libellés de la VRAIE page (`page-publique.*`) ; dates formatées par la
  langue. 91 clés mortes de l'ancienne landing supprimées (garde des chaînes mortes).
- **Le mouvement** est un seul îlot (`AnimationsLanding`) qui anime ce que le serveur a rendu (port
  de `main.js` et `l4.js`) ; la classe `js` est posée par un script avant le premier rendu, avec un
  filet : si l'îlot ne démarre pas en 2,5 s, ou lève, elle est retirée et tout s'affiche dans son
  état final. Sous mouvement réduit : tout est posé, immobile.
- **Mesuré** : 1280 et 390 px, fr/en/zh-CN, mouvement normal et réduit : rendu identique à la
  maquette (captures côte à côte), aucun débordement (y compris masqué par `overflow-x: clip`),
  aucune erreur console, aucune violation CSP, aucune police sous 11,5 px ni cible sous 44 px au
  téléphone.
- **Relecture** (agent généraliste, quatre angles) : 0 CRITICAL/HIGH, 5 MEDIUM, ~10 LOW. Corrigés :
  l'îlot qui pouvait laisser la page masquée ou la remplacer par l'écran d'erreur (try/catch,
  `__landing` posé en fin), clignement des cartes du héros (masquées dès le premier rendu),
  compteurs muets au lecteur d'écran (valeur en texte caché), démonstration qui parlait seule
  (`aria-live` après une action seulement, pause au focus), « Dans sa langue » qui promettait la
  langue du CLIENT alors que c'est celle choisie dans « Ma marque », classe `js` qui survivait à la
  navigation, client sans session créé hors du `try`, cast de tuple, `priority` obsolète, nom
  accessible du sélecteur, traductions (ordre chinois, classificateurs, « opens », « branding »,
  « 1er »). Écarté : l'état de repos du studio (celui de la maquette).
- **Tests adaptés** : la sonde de fumée lit le h1 dans `accueil.heros` ; exceptions déclarées pour
  le nuancier (#E0533F, #F5C518, « #6A4D21 » qui est une référence) et pour des noms propres en
  chinois ; l'exception des étoiles des témoignages est retirée avec eux ; le pied de la refonte
  dessine ses liens à 44 px (pas de compensation). Nouveau test : `plafonds-publics`.
- **Portes** : `typecheck` 0, `lint` 0 erreur, `build` vert (`/fr`, `/en`, `/zh-CN` en ●),
  `test` : seule l'alarme Railway. **Au poste de Mehdi** : `fumee` (titre du héros), `couverture`
  (`lib/page-publique/plafonds.ts` a son test).

### ▶️ 02/10/2026 — étape 3 : connexion et inscription (session cloud)

- **Portée de `connexion.html` / `inscription.html`** (« v4 ») : une colonne de formulaire et, à
  partir de 1021 px, la vitrine filmée. Le film est un port de `film.js` (`FilmAcces`) : « Pendant
  votre absence » à la connexion, « Une minute » à l'inscription ; une navigation cliente entre les
  deux change de film. La page client du film est la DÉMO de la landing (`PageClientDemo`), rendue
  par le serveur et clonée, jamais une page refaite. Rien n'est construit ni calculé sous 1021 px.
- **Gardé du produit** : noms des champs (`email`, `motDePasse`, `locale`), messages et motifs
  d'erreur (liste close), redirection d'une session déjà ouverte, suggestion de faute de frappe,
  bouton Google conditionnel, mention légale à l'inscription. Le compteur de mot de passe lit
  `LONGUEUR_MINIMALE` (passée par la page serveur : son module importe zod, et l'importer dans le
  composant client embarquait zod dans le bundle). L'offre du film (« N commandes offertes ») est
  LUE par `lirePlafondsPublics`, pluralisée, et se dit sans nombre si le plafond est illisible.
- **Champs** : `ChampAcces` prend le balisage de la maquette ; l'œil n'apparaît que si on lui passe
  ses libellés, ce que font la connexion, l'inscription ET le nouveau mot de passe (la relecture
  avait vu ce dernier perdre l'œil). Les autres formulaires de compte gardent leur page jusqu'à
  l'étape 7 mais ont déjà le nouveau champ.
- **Mesuré** : 1440 et 390 px, fr/en/zh-CN, mouvement normal et réduit ; comportement au
  navigateur (suggestion, erreur annoncée, œil, bascule vers l'inscription qui change de film,
  jauge) ; aucun débordement, aucune erreur console, aucune violation CSP, aucune cible sous 44 px
  ni police sous 11,5 px au téléphone.
- **Relecture** (agent généraliste, quatre angles ; les agents ECC ne sont pas installés ici) :
  0 CRITICAL/HIGH, 3 MEDIUM, 9 LOW. Corrigés : œil du nouveau mot de passe, zod dans le bundle
  client, une exception du film qui se serait répétée à chaque image (journalisée une fois, film
  arrêté), script inline mort qui laissait la classe `js` aux écrans suivants (retiré ; les entrées
  CSS de la page d'accès ne sont plus gardées par `js`, elles n'en ont pas besoin), film qui
  repartait à zéro sur une redirection vers la même page (clé = contenu des textes), suggestion à
  32 px (44 px, marge négative), œil qui disait « Masquer… enfoncé » (`aria-pressed` retiré), offre
  non pluralisée, cast de tuple, JSDoc obsolète, option `ouAvec` sans appelant (et sa clé). Laissés :
  textes du film typés en index (toutes les clés vérifiées fournies), relevés de mise en page par
  image dans le film « minute » (repris tels quels de la maquette), le signalement qui mêle deux
  dessins de champ (réglé à l'étape 6, quand sa page se porte).
- **Portes** : `typecheck` 0, `lint` 0 erreur, `build` vert, `test` : seule l'alarme Railway.
  **Au poste de Mehdi** : `fumee` (connexion et inscription servent un autre HTML).

### ▶️ 02/10/2026 — étape 4a : le tableau de bord (session cloud)

- **Portée de `tableau.html`** : fil d'Ariane (boutique › Tableau de bord), salutation, période en
  curseur, bande de cinq compteurs, graphique à bascule (douze semaines de commandes / ouvertures
  des liens jour par jour), dernières commandes, actions rapides, puis répartition, transporteurs et
  activité. Composants neufs sous `components/tableau/` (`CompteursApp`, `GrapheTableau`,
  `SelecteurPeriode`, `ApercuSurvol`, `blocs-tableau`), écrits pour être repris par les Analyses.
- **Décisions de Mehdi appliquées** : n° 6, l'aperçu au survol d'une commande est la VRAIE page
  (`/p/<jeton>/apercu`, aucune vue comptée), à la souris seulement, après 450 ms ; chaque page
  ouverte garde son cadre (cinq au plus) pour ne pas recharger une page client à chaque retour.
  N° 10, la période change sans recharger : navigation du routeur, l'URL reste l'état, le serveur
  relit les chiffres ; pendant le chargement le groupe porte `aria-busy` et les anciens chiffres
  s'estompent ; si la navigation n'aboutit pas, le curseur revient sur la période servie.
- **Couche « v4 »** (`couche-v4.tsx`) : bordure lumineuse des cartes par délégation ; l'entrée
  (titre révélé, compteurs à rouleaux) ne se joue qu'au premier chargement réel, posée par un
  script en ligne avant le premier rendu, jamais en naviguant (vérifié : retour par le menu sans
  entrée). Les rouleaux sont des composants React (`ValeurRoulee`), jamais une réécriture du DOM
  que React gère ; la valeur est lue dans un texte masqué.
- **Quittent l'écran** : la carte de lancement et la carte « Passer au Pro » (le bouton de la barre
  supérieure et l'encart de la barre latérale les portent sur tous les écrans), et leurs clés.
- **Écart voulu à la maquette** : la répartition empile quatre statuts qui ne se chevauchent pas
  (préparation, expédiés, en transit, livrés) ; « sans mouvement » est un filtre posé sur eux dans
  le produit, l'empiler aurait compté deux fois les colis concernés — il est dit sous la légende.
- **Mesuré** (compte de démo de la base de TESTS, cinq commandes semées sous sa session, sans
  numéro de suivi pour ne consommer aucune prise en charge 17TRACK) : 1440 et 390 px, fr/en/zh-CN,
  mouvement réduit ; aucun débordement, aucune erreur console, aucune violation CSP. La seule
  « cible sous 44 px » relevée au téléphone est le contenu du menu d'alertes FERMÉ (artefact de
  mesure : ouvert, aucune cible trop petite).
- **Relecture** (quatre angles) : 2 HIGH, 7 MEDIUM, 7 LOW, tous corrigés sauf le `window.__v4`
  jugé inoffensif : répartition qui comptait deux fois les colis silencieux, curseur de période qui
  pouvait afficher une période non servie, trois zéros inventés (ouvertures, délai illisible,
  « 0 dernières semaines »), points du graphe muets au clavier (annonce `aria-live`), bascule
  `tablist` sans panneau (devenue boutons pressés), visée décalée sur la courbe, iframe rechargée à
  chaque survol, rAF non annulé, panne de lecture des dernières commandes sans trace, `data-jeton`
  non déclaré, flèches qui empilaient l'historique (+ Début/Fin), tracé rejoué au redimensionnement,
  clés orphelines, code mort.
- **Portes** : `typecheck` 0, `lint` 0 erreur, `build` vert, `test` : seule l'alarme Railway.
  **Au poste de Mehdi** : `fumee` (le tableau de bord sert un autre HTML), `couverture`.

### ▶️ 02/10/2026 — étapes 4b et 4c : Commandes et Suivi d'envois (session cloud)

- **Portée de `commandes.html` et `envois.html`** : fil d'Ariane, titre, outils d'en-tête
  (période et export ; fraîcheur et « Actualiser »), compteurs en une bande (quatre ; cinq tuiles qui
  filtrent pour les envois), vues soulignées / filtres / tri, puces des critères, table à rangées en
  grille avec frise (Commandes) ou mini-frise (Envois), et, au téléphone, les mêmes rangées en cartes.
  Composants : `liste-commandes.tsx` (remplace `tableau-commandes.tsx`), `tableau-envois.tsx` réécrit,
  îlots `vues-liste`, `selection-lot` (« tout sélectionner » et compte de la barre), `copier-lien-ligne`.
- **La maquette filtre dans le navigateur, le produit non — le produit gagne.** Vues, filtres, tri,
  période, recherche et pagination restent des LIENS et des formulaires `GET` lus par le serveur
  (curseur, recherche sans accents) : l'écran reprend le dessin, pas le moteur. Archiver (une ligne ou
  un lot) et dupliquer restent des POST natifs (marchent sans JavaScript), avec exactement les champs
  qu'attend la route ; la sélection des envois EXPORTE (GET). La barre de lot s'affiche par le CSS
  (`:has(:checked)`) ; son compte vient de l'îlot.
- **Ce que la maquette fait et que le produit ne refait pas** : « Ouvrir la page » ouvre la VRAIE page
  client dans un onglet (pas une imitation en fenêtre) ; la frise ne s'anime pas au chargement (elle
  clignoterait à chaque « Charger la suite ») ; aucune « interroger maintenant » sur un colis (palier de
  prises en charge à vie) ; un transporteur inconnu n'affiche rien. Les vues ne portent plus leur
  compteur (la maquette n'en a pas ; les quatre compteurs sont juste au-dessus).
- **Gardé du produit** : bandeau de quota, messages de lot (validés), deux états vides (compte vide
  avec ses trois étapes et le renvoi vers « Ma marque », filtre sans résultat avec « tout archivé » et
  la phrase sur les accents), compteurs masqués dans les archives et en panne de lecture, dénominateur
  « n sur total » seulement sur la liste entière (ni filtre, ni archive, ni page suivante — la relecture
  a vu « 50 sur 184 » en page 2), « Suivi arrêté », références multiples, évolution « ce mois-ci ».
  La recherche de la barre du haut GARDE les critères en cours quand on est sur la liste (sans quoi
  chercher dans les archives ramenait aux commandes actives).
- **Menus** : `<details>` (s'ouvrent sans JavaScript) fermés par `DetailsFermable` ; le menu d'une
  ligne est posé en position FIXE (la liste rogne ce qui déborde : le menu de la dernière ligne était
  coupé), invisible tant qu'il n'est pas placé, refermé au défilement (sauf l'inertie des 300 premières
  ms) et au redimensionnement.
- **Piège payé** : la classe `table` de la maquette déclenche l'utilitaire Tailwind `display: table`
  (couche `utilities`, qui gagne sur toute règle de composant) : la table perdait 50 px. Renommée
  `liste__table`. *Une classe de la maquette qui porte le nom d'un utilitaire Tailwind ne se reprend
  jamais telle quelle.*
- **Mesuré** (base de TESTS : cinq commandes, quatre colis semés en base et reliés à leurs commandes,
  aucune prise en charge 17TRACK consommée — aucune tâche ni fonction ne contacte le fournisseur depuis
  cette base) : 1440 et 390 px, fr/en/zh-CN, mouvement réduit, menus ouverts ; aucun débordement, aucune
  erreur console, aucune violation CSP ; au téléphone, les cibles sous 44 px relevées sont le contenu
  de `<details>` FERMÉS (ouverts, tout fait 44 px). Comportements au navigateur : sélection et lot,
  « tout sélectionner », menu de ligne placé, copie, filtres, vues, tri, période, archivage puis retour.
- **Relecture Commandes** : 0 CRITICAL/HIGH, 2 MEDIUM (recherche qui perdait les filtres, barre de lot
  animée sous mouvement réduit), 7 LOW (menu qui clignotait en haut à gauche, échec de copie dit par
  une icône seulement, date et « jamais ouvert » absents de la carte téléphone et muets au lecteur
  d'écran, année perdue, rôles ARIA de rangée, clé mal nommée) : tous corrigés.
- **Relecture Envois** : 0 CRITICAL, 1 HIGH (l'évolution « ce mois-ci » avait perdu son « % » :
  « +12 » se serait lu douze colis de plus — rendu par une clé ICU et le format pourcentage, baisse
  colorée), 3 MEDIUM (références multiples d'un colis groupé : deux liens et un menu vers chacune des
  commandes ; compteur de pied faux sous un filtre ou en page deux ; interrogations invisibles au
  doigt), 6 LOW (nom du lien du transporteur, `https:` vérifié dans le catalogue — il ne l'était pas,
  année des dates, tri nommé, clé morte) : corrigés. Restent, hérités et dits : l'heure des mouvements
  est formatée dans le fuseau du serveur (aucun `timeZone` n'est fixé dans `src/i18n`), la tuile
  « Livrés ce mois » filtre tous les livrés, la ligne silencieuse n'a plus de fond d'alerte (badge et
  mini-frise ambre la portent).

### ▶️ 02/10/2026 — étape 4d : Analyses (session cloud)

- **Portée de `analyses.html`** : mêmes compteurs et mêmes blocs que le tableau de bord (composants
  partagés), la frise des semaines et les ouvertures chacune dans leur carte (variante `fixe` du
  graphique, sans bascule, avec sa mention), la répartition avec son total en grand, les trois
  commandes les plus consultées (elles mènent désormais à leur commande), les réponses des clients
  (taux sur ce qui a été RÉPONDU, « — » sans réponse, jamais « 0 % »), et le bandeau final.
  Sept anciens composants d'analyses et `tuile-metrique` supprimés.
- **Piège payé** : la règle `.total-colis span` de la maquette attrapait les spans du rouleau des
  compteurs (le « 4 » rendu à 13 px) ; restreinte à l'enfant direct. *Une règle descendante sur
  `span` casse tout composant qui en contient.*
- **Relecture** : 0 CRITICAL/HIGH, 2 MEDIUM (« 1 repl of 3 » : pluriels faits à la main, passés en
  ICU dans les trois langues ; le bloc des réponses recalculait l'état au lieu d'appeler la règle
  testée `etatPanneauQc`), 6 LOW (nom vide, taux arrondi à 100 % avec un refus — arrondi vers le bas,
  « — » lu « tiret », commentaire qui promettait trop, majuscule anglaise) : corrigés.
- **Mesuré** : 1440, 1024 et 390 px, fr/en/zh-CN, mouvement réduit ; aucun débordement, aucune erreur
  console, aucune violation CSP.
- **Portes (4b, 4c, 4d)** : `typecheck` 0, `lint` 0 erreur, `build` vert, `test` : seule l'alarme
  Railway. **Au poste de Mehdi** : `fumee` (les trois écrans servent un autre HTML), `test:rls`,
  `couverture`.

### ▶️ 02/10/2026 — étapes 4e à 4g : Ma marque, Paramètres, Passer au Pro (session cloud)

- **Ma marque (`marque.html`)** : sections numérotées en `.bloc.reglage`, dépôt du logo par
  glisser-déposer, couleur et pastilles de démonstration, réseaux en champs à icône, interrupteurs
  `role="switch"` (le retrait de la carte « Propulsé par DropLink » reste réservé au Pro, refusé en
  base sinon), lien personnalisé et carte Pro. **L'aperçu suit la maquette** : la vraie grammaire de
  la page client (`.pc`, `client.css`), aux couleurs résolues par `resoudreAccent()`, dans la langue
  des pages client choisie — et la bascule Desktop/Mobile change la MISE EN PAGE (deux colonnes en
  bureau), plus seulement le cadre. Mise à l'échelle mesurée : `zoom` au téléphone, transformation en
  bureau (à 0,4, `zoom` arrondit chaque lettre et les mots se collent).
- **Paramètres (`parametres.html`)** : six onglets en LIENS `?section=` (l'écran marche sans
  JavaScript, chaque panneau est rendu au serveur), blocs `bloc-r` avec pied. Le mot de passe actuel
  n'apparaît qu'une fois l'adresse modifiée ; la suppression garde sa confirmation en deux gestes et
  son collage bloqué ; la 2FA garde ses deux parcours. `carte-reglage` et `classes.ts` supprimés.
- **Passer au Pro (`passer-pro.html`)** : fil d'Ariane, accroche, quatre atouts, tableau Gratuit/Pro
  (nombres en gras, adresses en chasse fixe comme la maquette — les messages `tableau.aVie` et
  `tableau.parMois` portent désormais `<b>`, et Tarifs les lit par `t.rich`), pied avec le lien de
  paiement SIGNÉ (204). Plafonds et prix LUS ; un plafond illisible retire ses lignes. « Paramètres »
  s'allume dans la barre latérale, comme dans la maquette. Hors maquette : l'abonnement pas encore
  ouvert se lit comme une aide, pas comme une action.
- **Décision d'accessibilité, contre la maquette** : ses textes indicatifs étaient en `--sourdine`
  (3,16:1). Ils passent en `--corps` partout, et `textes-indicatifs-lisibles` relève désormais aussi
  chaque règle `::placeholder` des feuilles de la refonte — toute couleur, une valeur non résolue est
  une faute — avec un plancher PAR MOITIÉ (classes, feuilles). Falsifiée : `#a9aec4` posé dans
  `app.css` → rouge.
- **Relecture de Ma marque** : 1 HIGH (le logo confirmé et le geste en cours partageaient un état : un
  retrait échoué effaçait l'aperçu d'un logo toujours en base — séparés en deux états), 5 MEDIUM
  (double dépôt, exception non rattrapée, échec du retrait muet, commentaires périmés, variables
  mortes) et leurs LOW : corrigés.
- **Relecture de Paramètres** : 0 CRITICAL/HIGH, 4 MEDIUM, corrigés — la 2FA disait « Désactivée »
  quand sa lecture échouait (contrainte n° 8 : l'écran dit maintenant qu'il n'a pas pu lire) ; les
  deux liens autonomes `.lien-r` étaient tombés sous 44 px, et `cibles-tactiles` ne voyait pas
  `LienEcran` (motif élargi) ; « Appliquer » la langue renvoyait sur l'onglet Compte ; l'exemption
  des pieds était ancrée sur une règle qui ne couvrait pas tout ce qu'elle exemptait (ré-ancrée sur
  la règle tactile globale de `.bouton-app`). LOW corrigés : l'aide du pied ne disparaît plus sous un
  message (le message vit dans une région annoncée qui existe avant son texte), `aria-controls` sur
  la 2FA, pieds vides, onglets à 44 px au toucher au-delà de 1 100 px, neuf clés mortes retirées.
  Gardé : `LienEcran` pour le lien vers « Ma marque » (il ne fait que préfixer la langue).
- **Mesuré** : 1440 et 390 px, fr/en/zh-CN, mouvement réduit ; aucun débordement, aucune erreur
  console, aucune violation CSP. Comportements : le mot de passe apparaît quand l'adresse change, la
  confirmation de suppression s'ouvre et s'annule, le trait suit l'onglet, l'aperçu bascule.
- **Portes** : `typecheck` 0, `lint` 0 erreur, `build` vert, `test` 1 268/1 269 — seule l'alarme
  Railway. **Au poste de Mehdi** : `fumee`, `test:rls`, `couverture`.

### ▶️ 02/10/2026 — étape 4h : la fiche commande (session cloud)

- **Portée de `commande.html`** : fil d'Ariane (boutique › Commandes › titre), titre = nom du client,
  « Nouvelle commande » sans lui (décision n° 7 : la maquette ; même règle `titreDeCommande` que
  l'onglet), témoin d'enregistrement, date de création et référence courte sur la même ligne, résumé en
  quatre compteurs (« Non renseigné » en gris, « Jamais ouvert » en alerte), puis la grille par zones :
  la commande et l'aperçu, les médias et le lien, le suivi et l'historique. Sous 1 100 px, une colonne
  dans l'ordre du travail (photos d'abord, lien en dernier) ; sous 900 px, la bande collée en bas.
- **Gardé du produit, contre la maquette** : l'aperçu reste la VRAIE page en cadre
  (`/p/<jeton>/apercu`, arbitrage du § 5), posé dans le téléphone de la maquette, avec la bascule
  Desktop (fonction du produit) ; aucun « Colissimo reconnu » deviné dans le navigateur (§ 5,
  contrainte 8) ; la poignée de déplacement des vignettes (décision 19, clavier) ; le menu « ••• »
  (dupliquer, archiver — seul chemin au téléphone) ; l'encart d'échec qui nomme les champs et relance ;
  la note du transporteur sous l'étape datée ; les vraies photos en `object-fit: cover` (la maquette
  détoure des produits). Retiré avec la maquette : le panneau « Informations » — tout y était ailleurs
  sur l'écran, sauf la date de dernière modification, que l'historique remplace (`updated_at` n'est
  plus lu). `panneau.tsx` et `panneau-outil.ts` supprimés (plus aucun appelant).
- **Gardes adaptées honnêtement** : `encres-etat-lisibles` relève désormais aussi chaque `color:` des
  feuilles de la refonte qui désigne une couleur d'état (alias résolus), plancher par moitié — falsifiée
  (`--color-ds-erreur` posé en texte → rouge) ; `apercu-client-cadre` mesure l'échelle sur l'écran du
  téléphone (254 px) ; `carte-medias-enregistre` simule `t.rich`.
- **Mesuré** : 1440, 1024, 390 px, fr/en/zh-CN, mouvement réduit ; aucun débordement, aucune erreur
  console, aucune violation CSP. Comportements au navigateur : le titre et le fil suivent la frappe et
  reviennent, le menu s'ouvre dans l'écran (390 et 1440), la révocation reste désactivée sans la case,
  l'aperçu desktop sert la page à 1 180 px réduite.
- **Portes** : `typecheck` 0, `lint` 0 erreur, `build` vert, `test` : seule l'alarme Railway.
- **Relecture (commit suivant)** : 0 CRITICAL ; 1 HIGH corrigé — un nom de client sans espace (jusqu'à
  120 caractères) débordait à 390 px, maintenant que le titre est ce nom (`overflow-wrap`, `min-width: 0`,
  remesuré : 0 px) ; MEDIUM corrigés — les trois gestes d'une vignette se chevauchaient au doigt
  (l'étoile descend en bas à gauche : trois coins), le « ••• » couvrait le fil d'Ariane, le focus tombait
  sur `body` après une révocation (rendu au volet, et le nouveau lien est annoncé), l'annonce de copie
  vivait dans le bouton (sortie). LOW corrigés : note du transporteur lisible en entier au survol, badge
  vidéo sans durée réduit à l'icône, référence morte, deux `#fff` passés au jeton. Gardé : les quatre
  compteurs au téléphone (la maquette mobile les montre) et la phrase « ne change plus » de la maquette
  (elle parle des modifications). **Défaut antérieur relevé, non corrigé ici** : le menu « ••• » est
  rendu au serveur avec le jeton du chargement ; après une révocation sans rechargement, archiver poste
  l'ancien jeton (il ne sert qu'à invalider la page publique). `scripts/ecarts-declares.json` cite encore
  l'ancienne fiche (outil de l'ancien kit, déjà signalé).

### ▶️ 02/10/2026 — étape 5 : la page client `/p/[token]` et son aperçu (session cloud)

- **La version 3 de `client.html`** (décision n° 2 de Mehdi : la maquette) : un haut de page plein à
  la couleur du VENDEUR (`--cl-*` résolues par `resoudreAccent()`, posées sur l'enveloppe), l'état du
  colis en titre, la date estimée, le trajet en quatre arrêts ; puis la carte du dernier mouvement, qui
  ouvre l'historique complet en FEUILLE, les photos en carrousel, la validation ; à droite la
  livraison, le contact, le suivi par e-mail, « Propulsé par DropLink » (gratuit seulement). L'aperçu
  de la fiche (`/p/<jeton>/apercu`) suit sans une ligne : c'est la même page.
- **Les risques du § 5, tenus un par un** : aucun dégradé DropLink ni flou (le voile de la feuille est
  un aplat) ; aucun `mix-blend-mode` sur une vraie photo (la maquette détoure des produits ; ici
  `object-fit: cover`) ; le trajet ne nomme AUCUN lieu (arbitrage du § 5) — chaque arrêt porte sa
  date, le dernier le destinataire ; les vignettes de 200 px restent nettes (2,5 tuiles au téléphone,
  pas une, et pas d'image pleine dans le document). **Budget mesuré** (même commande, même machine,
  avant/après) : 289 → 291 Ko hors médias (CSS +5, HTML −2, image −2, JS inchangé) — sous les 300, de
  justesse comme avant. `client.css` est réduite à la seule v3 (39 → 22 Ko bruts).
- **La feuille est un `<dialog>` natif** (`feuille-historique.tsx`, nouvel îlot déclaré) : piège du
  focus, Échap, fond inerte et retour du focus viennent du navigateur ; la croix ferme par
  `<form method="dialog">`, sans script ; un écouteur unique sert les deux boutons qui l'ouvrent.
  Éprouvé au navigateur à 1440 et 390 : ouverture, Échap, croix, voile, focus rendu au bouton.
- **Gardé du produit** : logo de la boutique, réseaux validés par `liensDuVendeur` (le seul filtre,
  désormais testé directement), silence anormal et abandon dits, attente « pas encore
  d'information » calme, couverture en tête et « +N », arbitrage QC sans retour optimiste, e-mails de
  suivi seulement si `EMAIL_CLIENTS_DE` est posée, îlots qui écrivent sous `Inerte` dans l'aperçu.
  Retirés : l'ancien repli « Voir tout » (la feuille le remplace, avec sa règle et son test), les
  cartes de l'ancien kit (`carte-commande`, `en-tete-boutique`, `carte-client`) et `ReseauxVendeur`.
- **Défaut trouvé en mesurant** : à 390 px en anglais, « Preparation » et « Shipped » se
  chevauchaient (libellés posés en absolu) : au téléphone, quatre colonnes égales centrées sous des
  arrêts recalés à 12,5 %. Et la feuille, hors de `.cv`, perdait la couleur du vendeur : les variables
  sont montées sur l'enveloppe.
- **Mesuré** : 1440 et 390 px, fr/en/zh-CN (langue de la boutique basculée sur la base de tests puis
  rétablie), mouvement réduit, quatre commandes (préparation, transit avec six passages semés, livrée,
  sans colis) ; aucun débordement, aucune erreur console, aucune violation CSP, aucune cible sous
  44 px. Hors de portée : une commande AVEC photos (les clés R2 du jeu n'existent pas) — le carrousel
  est vérifié par la feuille et `visionneur-focus`, pas à l'œil.

- **Relecture de la page client** (corrigée au commit suivant) : 3 HIGH — la section des photos se
  posait sur l'aplat du vendeur quand la commande n'a pas encore de colis (3,17:1 sur l'accent par
  défaut, 1:1 sur un vendeur noir : marge haute quand elle ouvre le corps) ; la description de la
  boutique avait disparu alors que l'aperçu de « Ma marque » la montrait (rendue sous le nom) ; le texte
  du haut de page à opacité réduite passait sous 4,5:1 — `resoudreAccent()` calibre `surRemplissage`
  à 4,5 tout juste, mesuré de 4,03 à 2,88:1 selon l'accent : toute transparence retirée, la hiérarchie
  passe par la taille et la graisse. MEDIUM corrigés : compteur de l'historique en `--cl-sur-teinte`,
  « Propulsé par » posé sur blanc (son encre est calibrée contre le blanc) et nommé par son texte
  visible (WCAG 2.5.3), titre et focus de l'arbitrage QC après chaque bascule, silence anormal signalé
  par une icône, « pour Léa M. » sous « Livré » (le nom seul se lisait comme une livraison faite), compte
  des photos visible au bureau, règles d'impression (sinon blanc sur blanc), poignée de la feuille sans
  curseur de glisser, champ e-mail de nouveau `required`. **Limite gardée et dite** : au téléphone,
  l'historique complet s'ouvre après l'hydratation ; le dernier mouvement, lui, est dans le HTML.

### ▶️ 02/10/2026 — étape 6a : Tarifs et Documentation (session cloud)

- **Une coque commune** (`components/public/coque-site.tsx`) : l'en-tête et le pied de la landing,
  avec la navigation des pages de la maquette (« Comment ça marche », Tarifs, Documentation, Blog en
  français) et l'entrée courante en `aria-current="page"`. Elle remplacera `CoquePublique` page après
  page.
- **Tarifs (`tarifs.html`)** : en-tête de page, les deux plans (`tf-plan`), le tableau de comparaison
  partagé avec « Passer au Pro » (nombres en gras, adresses en chasse fixe, coches nommées). Plafonds
  et prix LUS ; le dégradé sur « Commencer avec Pro » seulement.
- **Documentation (`docs.html`)** : sommaire en `<details>` ouvert au rendu (lisible sans
  JavaScript), replié au montage au téléphone et qui dit la section en cours ; sections `doc-section`,
  étapes, encarts, vrais tableaux, statuts en pastilles, FAQ repliable (`name` partagé), appel final en
  carte. **Le texte reste celui du produit** : la maquette l'avait recopié à un commit donné, et une
  partie a vieilli (elle promettait par exemple un e-mail facultatif du client, que l'éditeur ne
  demande pas). Briques réécrites dans le vocabulaire de la maquette ; leurs anciennes valeurs Tailwind
  sont parties avec elles.
- **Mesuré** : 1280 et 390 px, fr et zh-CN, mouvement réduit ; aucun débordement, aucune erreur
  console, aucune violation CSP, aucune cible sous 44 px. Cinq clés mortes retirées.
- **Portes** : `typecheck` 0, `lint` 0 erreur, `build` vert, `test` : seule l'alarme Railway.

### ▶️ 02/10/2026 — étape 6b : blog, articles, pages légales, signalement (session cloud)

- **Blog (`blog.html`)** : en-tête de page, grille de cartes, la plus récente « à la une ». **Articles** :
  le gabarit `.art` (retour, étiquette, titre, méta, corps sémantique, appel final, « À lire aussi » —
  les deux articles suivants). La barre de progression n'est pas portée (un script pour ne rien dire
  que la barre de défilement ne dise). L'appel de fin disait « Gratuit pendant le lancement » : faux
  depuis le plan Pro, remplacé par le texte juste de la maquette.
- **Pages légales (`conditions.html`)** : en-tête de page, sommaire et encart de signalement à gauche,
  sections numérotées « 01 »… Le texte reste celui du kit légal recopié dans les catalogues. **Sommaire
  sans JavaScript** (arbitrage du § 5) : deux rendus du même contenu, la colonne au bureau, un
  `<details>` replié au téléphone. La documentation adopte le même procédé — la relecture avait montré
  qu'un volet replié au montage restait invisible à l'élargissement, et qu'ouvert au rendu il faisait
  sauter la page.
- **Signalement (`signalement.html`, décision n° 11)** : « Préparer le signalement » compose le message
  et le MONTRE (destinataire, objet, corps) avec « Copier le message » et « Ouvrir la messagerie ». Rien
  ne part d'ici ; un `mailto:` qui ne s'ouvrait pas laissait l'utilisateur devant un bouton muet.
  Éprouvé au navigateur (build avec `NEXT_PUBLIC_CONTACT_ABUS`, sans lequel la page rend 404 — voulu).
- **Relecture de Tarifs et Documentation** : 1 HIGH corrigé — la mention de facturation et de
  résiliation (Lemon Squeezy) avait disparu de /tarifs avec la maquette ; elle revient (contrainte n° 1,
  et c'est ce que Lemon Squeezy demande sur la page publique). MEDIUM : le sommaire (voir plus haut).
  LOW : région en double nom, numéros d'étapes lus deux fois (`aria-hidden`).
- `CoquePublique` et `SommaireRepliable` n'ont plus d'appelant : supprimés. Gardes mises à jour avec
  leur raison : cibles autonomes (planchers posés dans le balisage, trois nouvelles déclarées),
  surfaces de marque (6 : la refonte les peint par `.bouton--marque`), une couleur d'exception
  devenue inutile retirée, dix clés mortes retirées.
- **Mesuré** : 1280 et 390 px, fr/en/zh-CN selon la page, mouvement réduit ; aucun débordement, aucune
  erreur console, aucune violation CSP, aucune cible sous 44 px.
- **Portes** : `typecheck` 0, `lint` 0 erreur, `build` vert, `test` : seule l'alarme Railway.

## 9. Ce qui attend Mehdi

- [ ] **Ouvrir le réseau de l'environnement cloud vers la base de tests** (menu de
  l'environnement dans la barre de titre de la session, puis Modifier, « Network access ») :
  autoriser `djvjaocvndqhqqgilrof.supabase.co` ET `db.djvjaocvndqhqqgilrof.supabase.co`
  (Postgres direct, port 5432), ou passer à un niveau d'accès plus large. Sans cela,
  `test:rls`, `couverture` et `fumee` ne peuvent pas tourner, et aucun écran ne se porte.
  Si le port 5432 reste fermé même autorisé, une `SUPABASE_DB_URL` vers le pooler de
  Supabase (port 6543) est l'autre voie.
- [ ] **(02/10, mis à jour) Le réseau « Full » a ouvert l'API HTTPS, pas Postgres.** Le
  conteneur n'a pas d'IPv6, et il ne laisse sortir aucun TCP brut (5432 et 6543 du pooler
  compris). Il reste trois voies : **(a)** faire tourner les portes sur le poste de Mehdi,
  qui a `.env.test.local` ; **(b)** obtenir un environnement cloud qui laisse sortir le TCP
  vers Postgres ; **(c)** autoriser, dans les réglages de permission de la session,
  l'écriture de `.env.test.local` à partir des secrets de l'environnement, ce que le mode
  auto a refusé. (c) ne suffit pas sans (b).
- [x] Ajouter les variables de `.env.test.local` à l'environnement cloud — présentes le
  02/10/2026 (mais le réseau refuse encore l'hôte, voir la case du dessus).
- [ ] Railway : recopier les réglages de `railway.json` dans l'onglet Settings, puis supprimer
  le fichier, avant le 01/12/2026.
- [ ] Confirmer quelle branche Railway déploie (Railway, service, Settings, Source). Tant que ce
  n'est pas confirmé, rien n'est poussé sur le vrai dépôt (le bac à sable du § 10, lui, ne déploie rien).
- [ ] Trancher le flou de l'en-tête de la landing : le garder (autorisé par `CLAUDE.md`), ou le
  retirer pour la fluidité comme la maquette.
- [x] Créer le dépôt bac à sable (§ 10, étape 1) — `JLmehdi92/Droplink-maquette-`, 02/10/2026.

## 10. Le dépôt bac à sable — comment le travail circule

> ⚠️ **Décision de Mehdi du 02/10/2026 : portage dans le cloud, vérification finale sur son
> poste.** Le cloud ne joint pas Postgres (pas d'IPv6, pas de TCP brut sortant) : chaque
> écran y est porté avec `typecheck`, `lint`, `build`, `test` et la comparaison au
> navigateur, et **`test:rls`, `couverture` et `fumee` tournent sur le poste de Mehdi avant
> tout retour dans le vrai dépôt**. C'est une exception à « jamais de commit par-dessus des
> portes rouges », bornée au bac à sable. Le prompt de cette vérification finale est dans
> **`consignes/verification-finale-locale.md`**.

```
JLmehdi92/Droplink-maquette- (privé)       JLmehdi92/droplink2
  ← Claude pousse ici, autant qu'il veut       ← Railway déploie depuis ici
  aucun service Railway ne le regarde          on n'y pousse qu'après validation
```

1. **Créer le dépôt (Mehdi, une fois) — FAIT le 02/10/2026 :
   `JLmehdi92/Droplink-maquette-`** (le tiret final fait partie du nom). Sur github.com :
   New repository, **Private**, **sans** README, sans .gitignore, sans licence (un dépôt
   vide, sinon le premier push entre en conflit). Puis sur
   https://github.com/apps/claude/installations/select_target, donner à l'application Claude
   l'accès à ce dépôt, et **NE PAS le relier à Railway**.
2. **Y pousser (Claude).** Dans la session : rattacher `JLmehdi92/Droplink-maquette-`,
   remote `maquette`, et `git push maquette claude/saas-motion-design-video-r3ani3` — la
   branche suit `maquette`, pas `origin`. Le bac à sable porte aussi `master`, copie du vrai
   `master` au `43ec195`, et l'historique COMPLET (580 commits) : c'est ce qui permet de
   refusionner dans le vrai dépôt sans conflit d'ascendance. Le
   remote `origin` (le vrai dépôt) n'est jamais la cible d'un push pendant la refonte.
3. **Travailler écran par écran** dans le bac à sable, un commit par écran, chaque commit
   consigné au § 8 avec ses mesures.
4. **Revenir dans le vrai dépôt (Mehdi décide, Claude Code local exécute).** Sur le poste de
   Mehdi, qui a `.env.test.local` :
   ```
   git remote add maquette https://github.com/JLmehdi92/Droplink-maquette-.git
   git fetch maquette
   git switch -c refonte maquette/claude/saas-motion-design-video-r3ani3
   git merge master            # récupérer ce qui a bougé sur le vrai dépôt entre-temps
   pnpm gates                  # relever le DÉCOMPTE, pas la couleur
   ```
   Puis la méthode du pixel près de `CLAUDE.md` sur chaque écran porté, `pnpm verif:prod`,
   les migrations éventuelles en production **avant** le push, et seulement alors fusionner
   dans `master` et pousser — ce qui redéploie droplink.fr.

