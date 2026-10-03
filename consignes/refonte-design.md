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
| Sommaire des pages légales qui suit la lecture | **Oui depuis le 02/10/2026** (consigne de Mehdi : « exactement comme l'artefact ») : `AnimationsPubliques` le marque ; sans JavaScript il reste un sommaire, sans entrée active | `page-legale.tsx` |
| Titres de page « X · DropLink » au lieu de « X — DropLink » | **Non** : on garde les titres des catalogues | changer trois catalogues et la fumée pour une ponctuation n'est pas la refonte |
| Menu mobile des pages publiques | **`<details>` sans JavaScript**, habillé comme la maquette | même rendu, zéro JS |
| Lieux par étape du trajet sur la page client (« Lyon · 29 sept. ») | **Oui depuis le 03/10/2026** (décision de Mehdi, D2, qui remplace le « Non » d'origine) : le lieu est celui que 17TRACK donne, déjà lu et affiché par l'historique — étape terminée : le plus ancien passage de l'étape parmi les 30 lus ; en cours : lieu et date du plus récent ; passage hors des 30 : la date seule | `lieux-trajet.ts`, `page-client.tsx` |
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
6. Aperçu de la page client au survol d'une commande (tableau de bord, liste). — **retiré, décision de Mehdi du 03/10/2026**
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
  `SelecteurPeriode`, `ApercuSurvol`, `blocs-tableau`), écrits pour être repris par les Analyses. — **retiré, décision de Mehdi du 03/10/2026**
- **Décisions de Mehdi appliquées** : n° 6, l'aperçu au survol d'une commande est la VRAIE page — **retiré, décision de Mehdi du 03/10/2026**
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
  chaque survol, rAF non annulé, panne de lecture des dernières commandes sans trace, `data-jeton` — **retiré, décision de Mehdi du 03/10/2026**
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
  `object-fit: cover`) ; le trajet ne nommait AUCUN lieu (arbitrage du § 5, remplacé le 03/10/2026
  par la décision D2 de Mehdi : il nomme désormais le lieu donné par 17TRACK) — chaque arrêt porte sa
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

- **Relecture de 6b** (corrigée au commit suivant) : 0 CRITICAL/HIGH, 4 MEDIUM — le sommaire légal
  restait ouvert et collé au-dessus du texte au téléphone (sans script pour le refermer : il reste
  désormais dans le flux) ; l'encart de signalement avait disparu au téléphone (il revient en fin de
  document) ; le message de signalement préparé survivait à une correction des champs et l'ancien texte
  serait parti (il disparaît dès qu'un champ change, et l'annonce est courte, hors des contrôles) ; la
  garde des surfaces de marque ne lisait plus les feuilles, où vivent désormais les boutons en dégradé
  (elle les lit, falsifiée sur `.ed-voir`). Signalé à Mehdi, non tranché : la mention de facturation de
  Tarifs est en gris secondaire (3,16:1), conforme à la décision du 15/09 mais c'est un texte
  contractuel.

### ▶️ 02/10/2026 — étape 7a : mot de passe oublié, nouveau mot de passe, vérification (session cloud)

- **La coque des pages de compte** (`coque-acces-simple.tsx`) devient la page d'accès de la refonte
  (`PageAcces`, film « absence ») : le même dessin que la connexion, sans phrase de consentement.
- **Mot de passe oublié** : la route reste (§ 5, des liens y pointent), au dessin de l'accès ;
  suggestion de faute de frappe dans le champ, retour en `lien-retour`. **Nouveau mot de passe**
  (`nouveau-mot-de-passe.html`) : l'adresse rappelée en clair, la note « ce lien ne servira qu'une
  fois », la jauge et le compteur de l'inscription (le minimum vient de `LONGUEUR_MINIMALE`).
  **Vérification** (`verification.html`) : **six cases** (arbitrage du § 5) — un seul champ `code`
  envoyé, `one-time-code` sur la première, le code collé ou proposé se répartit, aucun envoi
  automatique au sixième chiffre (chaque envoi consomme le quota partagé avec la connexion) ;
  « se souvenir de cet appareil » en `coche-acces`.
- **Mesuré** : le mot de passe oublié à 1440 et 390 px, fr et zh-CN, mouvement réduit ; aucun
  débordement, aucune erreur, aucune cible sous 44 px. **Hors de portée de ce bac à sable** : le
  nouveau mot de passe (session de récupération) et la vérification (compte à double authentification)
  ne s'ouvrent qu'avec une session que la base de tests ne fournit pas sans écrire un facteur ;
  à vérifier au poste de Mehdi.
- **Portes** : `typecheck` 0, `lint` 0 erreur, `build` vert, `test` : seule l'alarme Railway.

### ▶️ 02/10/2026 — étape 7b : bienvenue (onboarding) et notification (session cloud)

- **Bienvenue** (`bienvenue.html`) : la coquille `onb` (logo, « Étape 1 sur 2 » et sa barre), le
  formulaire à gauche, la page client à droite dans un téléphone — c'est `ApercuPageClient`, le même
  composant que « Ma marque », qui gagne une prop `nomProvisoire` (« Votre boutique », grisé, tant
  que le nom est vide). Logo en `bouton-outil`, couleur par pastille + saisie hexadécimale + cinq
  couleurs rapides (celles de la maquette, déclarées dans `couleurs-en-dur` : ce sont des
  propositions de couleur de VENDEUR, qui passent par `resoudreAccent()`), type de compte en deux
  cartes. Les champs, l'action et la redirection ne changent pas.
- **Notification** (`notification.html`) : une icône par état dans trois ondes (décoratives,
  arrêtées sous mouvement réduit), titre, texte, bouton. Toujours un POST natif, toujours aucune
  action à l'ouverture, toujours aucune donnée de commande. Les illustrations de l'ancienne planche
  ne servent plus ici (la page du lien introuvable garde la sienne jusqu'à l'étape 9).
- **Ménage** : `coque-acces.tsx` et `maquette-application.tsx` (l'ancienne fenêtre du héros de la
  landing) n'avaient plus d'appelant que l'un l'autre — supprimés, avec 48 chaînes mortes. Deux
  planchers baissés avec leur raison (`encres-etat-lisibles` 70 → 60, `pilules-lisibles` > 2).
- **Mesuré** : bienvenue (compte de test sans type de compte, base de tests) à 1440 et 390 px, fr,
  en, zh-CN, mouvement réduit ; notification dans ses états confirmer, désinscrire, invalide, fr,
  zh-CN, en, 1440 et 390 px. Côte à côte avec la maquette : même rendu. Aucun débordement, aucune
  erreur console, aucune violation CSP, aucune cible sous 44 px.
- **Portes** : `typecheck` 0, `lint` 0 erreur, `build` vert, `test` : seule l'alarme Railway.

### ▶️ 02/10/2026 — corrections de la relecture de l'étape 7 (session cloud)

- **Vérification à deux facteurs sans JavaScript** : les six cases portent `name="code"`, l'action
  recolle leurs valeurs (le champ caché rempli par React n'envoyait rien avant l'hydratation — un
  compte administrateur ne pouvait plus se connecter). Case remplie remplacée à la frappe, code
  collé réparti depuis la première case, retour arrière qui efface la case précédente.
- **Onboarding** : l'aperçu parle la langue de la PAGE CLIENT (anglais, migration 205), plus celle
  de l'écran ; « Retirer le logo » l'efface en base (`supprimerLogo`) avant de l'effacer à l'écran ;
  une couleur saisie sans `#` est complétée, une couleur refusée est dite ; l'en-tête provisoire
  « Votre boutique » est retiré (décision 24 : une page sans nom n'a pas d'en-tête).
- **Nouveau mot de passe** : « Revenir à la connexion » est désormais une déconnexion (POST natif) —
  le lien menait dans l'application avec la session de récupération ouverte.
- Cible « Retirer le logo » à 44 px, nom de boutique long coupé proprement, animation du focus des
  cases sous `prefers-reduced-motion`.
- ⚠️ **Constaté dans le bac à sable, pas un défaut du produit** : la vérification TOTP par le
  formulaire échoue ici (« Challenge and verify IP addresses mismatch » : la sortie réseau du
  conteneur change d'adresse entre les deux appels). La mesure de l'administration a donc ouvert sa
  session à deux facteurs par script, puis l'a posée en cookie.

### ▶️ 02/10/2026 — étape 8 : l'administration, 10 écrans (session cloud)

- **La coque** prend la colonne de l'espace vendeur (`CoqueTiroir`, `NavigationVendeur` avec les
  icônes de la maquette) : pastille « Admin », encart « Tout est tracé », menu de compte, barre haute
  avec la recherche de comptes (un GET natif vers la liste, dont la recherche était déjà auditée) et
  le bandeau « ADMINISTRATION ». **La barre d'onglets du bas devient le tiroir** de la maquette : il
  montre les huit entrées, ce qui levait l'objection faite à l'ancienne bande défilante.
  **Non portés** : le lien « Espace vendeur » (aucun lien entre les deux surfaces, verrouillé) et le
  thème sombre (§ 5). Un `template.tsx` pose `.entree-ecran`, comme chez le vendeur ; toujours aucun
  `loading.tsx`.
- **Briques communes** : en-tête à fil d'Ariane, encart de trace, tuiles (`.compteurs.adm-tuiles`),
  anneau et légende, barres et courbes (`.adm-graphe`, info-bulle au survol ; le `<title>` par barre a été retiré le 03/10, il doublait l'info-bulle),
  filtres en pastilles (des LIENS : le filtre reste en base et dans la trace), recherche,
  avatar d'initiales, colis contre seuil, entrée de journal, et **un dialogue modal unique**
  (`<dialog>` natif : piège de focus du navigateur, rien ne ferme pendant la requête) pour la
  suspension, le plan, le blocage et la contestation.
- **Vue d'ensemble** : ajout de l'alerte « comptes en doublon » de la maquette (un nombre, rien au
  journal). **L'alerte « contestation » n'est pas portée** : aucune fonction ne compte les
  contestations de la plateforme, il faudrait une migration. La courbe devient des barres ; le choix
  7 / 30 / 90 jours reste.
- **Surveillance** : la consommation du mois (interrogations, colis, abandons) que la base rendait et
  que l'écran ne montrait pas ; la frise reste à 14 jours (donnée du produit).
- **Statistiques** : vue globale au dessin de la maquette ; les vues filtrées gardent les séries
  détaillées du produit (pages par jour, taux, délai, statuts, croissance mensuelle).
- **Commandes, boutiques, comptes, doublons, fiche, journal, paramètres** : tableaux défilants de la
  maquette (plus de cartes au téléphone), « Voir » vers la fiche du compte gardé partout, aucun
  contenu de commande, « Aucun transporteur » seulement quand il n'y a pas de colis. Pas de badge
  Pro dans la liste des comptes (la liste ne lit pas le plan ; il faudrait étendre la fonction).
- **Ménage** : `navigation-admin`, `selecteur-admin`, `courbe-commandes`, `graphique-lignes`,
  `graphique-barres` supprimés ; 18 chaînes mortes ; planchers des gardes Tailwind abaissés avec leur
  raison (les écrans peignent par la feuille, mesurée par l'autre moitié de chaque garde).
- **Mesuré** (compte administrateur de test à deux facteurs, base de tests) : les dix écrans à 1560 et
  390 px, fr et zh-CN (en sur deux écrans), mouvement réduit, dialogue de suspension ouvert. Côte à
  côte avec la maquette : même grammaire ; deux défauts trouvés et corrigés en cours de mesure
  (largeur du contenu sans `template`, filtres de période qui débordaient au téléphone). Aucune
  erreur console, aucune violation CSP, aucun débordement.
- **Portes** : `typecheck` 0, `lint` 0 erreur, `build` vert, `test` : seule l'alarme Railway.

### ▶️ 02/10/2026 — corrections de la relecture de l'étape 8 (session cloud)

- Ancres des cartes de paramètres stables en toute langue (en chinois les quatre cartes partageaient
  la même) ; le pied « N sur M » des comptes et commandes retiré (il annonçait le total GLOBAL avec
  un filtre actif, et « 50 sur 50 » quand le total était illisible) ; le dialogue ne se ferme plus
  sur une sélection relâchée hors de la boîte ni sur sa barre de défilement ; croix à 44 px au
  toucher ; focus sur le motif à l'ouverture et aide reliée (`aria-describedby`) ; glisser-déposer
  refusé comme le collage dans la recopie d'adresse.
- **Une contestation en attente remplace de nouveau le déblocage direct** : débloquer passe par sa
  lecture (tracée) et sa réponse, comme avant la refonte.
- « Aucune alerte » exige aussi un comptage des doublons lisible ; graduations et info-bulles
  formatées par la langue ; états vides et indisponibles des statistiques et de la frise.
- Garde ajoutée : le layout doit demander à la navigation commune de ne rien précharger.

### ▶️ 02/10/2026 — étape 9 : les états (session cloud)

- **Espace vendeur et administration** : `error.tsx` (×2) et la commande introuvable prennent
  `.etat` (maquettes `erreur-espace.html`, `admin-erreur.html`, `commande-introuvable.html`). « Réessayer »
  montre l'attente RÉELLE de la relance (`reset` dans une transition), jamais un délai fixe. Les deux
  `loading.tsx` prennent les squelettes `.sq` et annoncent « Chargement… » (`role="status"`,
  `aria-busy`) — toujours aucune donnée dans un squelette.
- **Public** : l'erreur du site et la page introuvable globale (`erreur.html`, `introuvable.html`) par
  `EcranErreurPublic`, réécrit en `.err-*` ; le 404 global importe désormais les feuilles de la
  refonte, puisqu'il remplace la racine.
- **Page client** : le lien mort prend la grammaire de la notification (`lien-invalide.html`) et
  l'erreur `.errc` (`erreur-client.html`). `app.css` n'étant pas chargée sous /p (budget), les règles
  de ces deux écrans sont recopiées dans `client.css` sous `.etat-p`, avec leurs variables lues aux
  jetons du design system. Aucune couleur de vendeur, aucun dégradé.
- **Ménage** : `en-tete-ecran` supprimé (orphelin), deux chaînes mortes, planchers de gardes abaissés
  avec leur raison.
- **Mesuré** : 404 global, lien mort et commande introuvable à 1440 et 390 px : conformes, aucune
  erreur hors le 404 voulu. **Non mesurés au navigateur** : les trois frontières d'erreur et les deux
  chargements, qu'aucune URL ne déclenche à la demande — à voir au poste de Mehdi (en provoquant une
  erreur de rendu, ou avec un réseau ralenti pour les chargements).
- **Portes** : `typecheck` 0, `lint` 0 erreur, `build` vert, `test` : seule l'alarme Railway.

### ▶️ 02/10/2026 — corrections de la relecture de l'étape 9, et BILAN (session cloud)

- **« Réessayer » appelle `retry`, plus `reset`** (Next 16.3) : `reset` re-rendait le flux déjà reçu,
  donc une erreur venue du serveur revenait à chaque clic. L'état « en cours » simulé est retiré
  (`retry` ne dit pas quand il a fini) — le commit précédent affirmait à tort le contraire.
- Lien mort et erreur de /p : règles de `client.css` toutes préfixées `.etat-p` (rien ne peut toucher
  la vraie page client), règles mortes retirées, petit logo du pied rendu à sa taille, fond en aplat
  (le magenta du dégradé de marque n'apparaît plus sous /p), texte de bouton lu au jeton
  (`--sur-accent`), bouton de l'erreur client neutre (encre) : aucune couleur DropLink.
- Ancre de l'écran d'état par `useId`, variable `--i` morte retirée du squelette.

#### BILAN DE LA SESSION CLOUD

**Porté, du premier au dernier écran, en 15 commits poussés sur le bac à sable**
(`claude/saas-motion-design-video-r3ani3`) : jetons et coque avec le tiroir (1), landing (2),
connexion, inscription et leur film (3), les huit écrans de l'espace vendeur et la fiche commande (4),
la page client et son aperçu (5), Tarifs, Documentation, blog, articles, pages légales et signalement
(6), mot de passe oublié, nouveau mot de passe, vérification, bienvenue et notification (7), les dix
écrans d'administration (8), et tous les écrans d'état (9). Chaque étape a été relue par un agent sur
quatre angles, et ses retours corrigés dans le commit suivant.

**Ce qui est vérifié ici** : `typecheck` et `lint` (0 erreur), `build`, `test` (1268/1269 — le seul
rouge est l'alarme Railway, à ne pas désactiver) ; au navigateur, chaque écran mesurable au bureau et à
390 px, en plusieurs langues, mouvement réduit, console et CSP. **Aucune migration écrite.**

**Ce qui ne l'est pas, et doit l'être au poste de Mehdi** (`consignes/verification-finale-locale.md`) :
`test:rls`, `couverture`, `fumee` et `test:perf` (Postgres injoignable d'ici) ; la vérification à
deux facteurs par le formulaire (sortie réseau du conteneur) ; le nouveau mot de passe ; les
frontières d'erreur et les chargements ; la revue ECC complète du diff.

**Écarts assumés à la maquette** (le produit gagne) : aucun thème sombre ; aucun lien entre
l'administration et l'espace vendeur ; quotas et prix lus en base ; pas de dégradé ni de couleur
DropLink sur /p ; motif minimal à 8 caractères ; filtres appliqués en base (liens) au lieu de filtres
côté navigateur ; la frise des colis à 14 jours ; aucune alerte « contestation » ni badge « Pro » dans
la liste des comptes admin (il faudrait une migration — question ouverte au § 9).

**Comptes de mesure créés sur la base de TESTS** : refonte-demo@, refonte-onb@ et refonte-admin@
(`droplink-test.invalid`, ce dernier administrateur à deux facteurs). Le secret TOTP utilisé pour la
mesure a été effacé du conteneur à la fin de la session.

### ▶️ 02/10/2026 — fidélité du mouvement, lots 1 et 2 : accès et pages publiques (session cloud)

Consigne de Mehdi : « exactement comme l'artefact, avec vraiment toutes les animations […] et même
les optimisations pour que ce ne soit pas lent ». Liste traitée : `consignes/audit-fidelite-refonte.md`.

- **La classe `js` devient GLOBALE** (`ScriptJs`, coque de langue) : chaque script de la maquette la
  pose, le produit ne la posait que sur la landing — les règles `.js …` de l'administration (graphes),
  des écrans d'état et des pages d'accès ne jouaient donc jamais. Elle porte `.attente` (animations
  gelées) jusqu'à `.pret` (police chargée, deux images, plafond 900 ms — § 6), et un filet : sans
  hydratation en 2,5 s, elle est retirée et tout s'affiche. La landing n'a plus son propre script et ne
  retire plus `js` en partant. `/p` n'en a pas (sa maquette non plus). `v4-entree` est désormais retirée
  1,6 s après `.pret`, sinon une entrée gelée était coupée net.
- **Pages d'accès** : `CoucheV4` + `v4-entree` (titre, formulaire) et bordure lumineuse sur la carte du
  formulaire (connexion, inscription, oubli, nouveau mot de passe, vérification, bienvenue) ; validation
  à la saisie et à l'envoi comme `acces.js` (message sous le champ, `role="alert"`, secousse, focus sur
  le premier champ fautif) — JAMAIS plus stricte que le serveur (longueur en unités UTF-16, partie
  locale d'au moins 4 caractères, comme `lib/auth/mot-de-passe.ts`), et lue dans le `FormData` qui part ;
  un refus du serveur secoue aussi les champs qu'il désigne. **Défaut de la maquette corrigé** : au
  téléphone, sortir du champ en tapant « Envoyer » affichait l'erreur, le bouton descendait de 20 px et
  le relâché tombait à côté (mesuré) ; une sortie vers le bouton d'envoi est laissée à l'envoi.
- **Connexion ⇄ inscription sans recharger** (`BasculeAcces`) : sortie 170 ms, film figé sur sa
  dernière image puis effacé en 520 ms, entrée 420 ms, film suivant construit 260 ms plus tard et
  fondu, adresse recopiée, focus au titre, liens préchargés. **Second défaut de la maquette corrigé** :
  à 800 ms elle retire `v4-entre`, ce qui rejoue l'entrée `monte` du chargement (le formulaire
  disparaissait une seconde fois, mesuré image par image) ; le produit garde la classe. Filet : une page
  qui n'est pas arrivée en 4 s est chargée comme un lien. Mesuré : mêmes durées que la maquette ; ici
  l'attente réseau du serveur (~1 s, base distante depuis le conteneur) s'intercale.
- **Vérification 2FA** : six cases secouées et vidées au refus, focus en première case (souris), message
  effacé à la frappe, et **cases vertes 380 ms** : l'action renvoie `{statut:"valide", chemin}` à un
  formulaire hydraté (`js=1`) — le vert SUIT l'acceptation du serveur — et redirige comme avant sans
  JavaScript. Relu : chemin construit au serveur seulement, pas de redirection ouverte. ⚠️ Le succès
  n'a pu être vu qu'une fois ici : Supabase refuse `challenge`/`verify` venus de deux IP différentes
  (`mfa_ip_address_mismatch`), et le proxy du conteneur en change — à revoir au poste de Mehdi.
- **Mot de passe oublié** : le bloc « Regardez votre boîte mail » de la maquette (`.envoye`, sceau,
  focus sur son titre). **Bienvenue** : « Choisissez à qui vous vendez » avant l'envoi, secousse.
  **Notification** : titre d'onglet par état, fondu 380 ms à l'arrivée d'un résultat.
- **Pages publiques** (`AnimationsPubliques`, port de `public.js`) : titres `l4-ligne`, cascade
  `data-entree`, `data-anime → est-vu` (seuil 0,2), croix du tableau des tarifs (`--tp-croix`,
  `ResizeObserver`) et ses lignes à 180 + 45 ms × rang, **barre de progression des articles** (décision
  de Mehdi), sommaire des pages légales qui suit la lecture (tiers haut de l'écran, comme celui de la
  documentation désormais), bordure lumineuse. Signalement : validation en place, bloc « prêt » qui
  entre en 320 ms et vient dans le champ de vision, copie au format de la maquette (« À : … / Objet : »),
  « Message copié » qui revient à « Copier le message » après 2,2 s, sélection du message si la copie
  est refusée. Blog : ordre et « à la une » de la maquette, titre « … » : … », et les tirets longs des
  articles remplacés par la ponctuation de la maquette (texte identique, vérifié phrase par phrase).
- **Mesuré au navigateur** (build de production, base de TESTS, compte de mesure neuf) : durées et
  courbes identiques à la maquette servie (titre, chapô, lignes du tableau, progression, sommaire, bloc
  prêt, copie) ; 1440 et 390 px tactile, fr/en/zh-CN, mouvement réduit : aucun débordement, aucun texte
  masqué, aucune boucle, aucune erreur console, aucune violation CSP. **Processeur ×4** : tableau des
  tarifs 60 images/s (maquette 59) ; bascule d'accès 50 images/s, pire image 150-180 ms (maquette 100 :
  le rendu React de la page arrivante s'ajoute à la construction du film).
- **Relectures** (deux agents, quatre angles) : 0 CRITICAL/HIGH. Corrigés : gel `.attente` perdu, puis
  coupure de `v4-entree` ; validation plus stricte que le serveur ; régions `aria-live` masquées
  (remplacées par `role="alert"` à l'insertion) ; validation sur l'état React plutôt que sur ce qui part ;
  effet relancé à chaque rendu ; avertissement d'hydratation de `<html>` (`suppressHydrationWarning`) ;
  commentaire du signalement ; corps du message non élagué ; volet du sommaire vide au rendu serveur ;
  tableau des tarifs vide à l'impression. Laissé : la colonne reste vide pendant l'attente réseau d'une
  bascule (comme la maquette pendant son `fetch`).
- **Portes ici** : `typecheck` 0, `lint` 0 erreur (2 avertissements, dont `suspendu` traité au lot 6),
  `build` vert, `test` 1268/1269 (alarme Railway seule).

### ▶️ 02/10/2026 — fidélité du mouvement, lots 3 et 4 : sorties, analytique, espace vendeur (session cloud)

- **Changer d'écran** (`TransitionsEcran`, `TemplateEcran`) : le contenu SORT (110 ms,
  `cubic-bezier(.4,0,1,1)`, 6 px dans le sens du menu) avant que le routeur charge l'écran suivant,
  qui est inséré INVISIBLE et n'entre que deux images plus tard (§ 6) — 240 ms sur 10 px. Le clic est
  intercepté en capture avant le lien de Next ; exports `/api`, `target`, téléchargements, ancres et
  clics modifiés restent des liens. **Défaut trouvé à la relecture** : un `template` ne se remonte pas
  quand seul un segment plus profond change (liste → fiche) — l'écran restait invisible 6 s. Il est
  désormais clé sur le chemin ; une sortie restée posée est levée à l'arrivée. Mesuré : sortie 0→132 ms,
  entrée 149→448 ms ; CPU ×4 : pire image 67 ms (maquette 117-167).
- **Filtrer une liste** (même écran, autre `?…`) : la table s'estompe à 0,35 en 90 ms pendant la
  lecture serveur et revient en 160 ms (filet de 8 s ; « Charger la suite » exclu).
- **Dialogues d'administration** : sortie `.sort` de 160 ms (Échap, voile, croix, Annuler), non
  cliquables pendant la sortie ; « Le motif est trop court. » / « L'adresse recopiée ne correspond
  pas » dits et secoués (280 ms) au lieu d'un bouton désactivé — même plancher que le serveur
  (8 caractères après `trim`, vérifié à la relecture).
- **Analytique** (`Changeant`, `GrapheTableau`) : au changement de période, chaque chiffre s'efface
  flouté (110 ms) puis le nouveau entre (220 ms) ; le graphique se redessine en fondu (120 ms, flou
  4 px) puis ses barres montent ou son trait se trace (900 ms) — à la bascule comme à la période.
  Premier dessin animé au premier chargement réel seulement (`v4-entree`), comme `!arrivee`. Défauts
  de relecture corrigés : double clic ou valeur revenue pendant le fondu laissaient le tracé effacé.
  Rouleaux ajoutés : taux de validation (Analyses), tuiles d'administration, tuiles de la fiche.
- **Commandes / Envois** : la frise se remplit en cascade (520 ms, +18 ms par ligne) et les
  mini-frises entrent (320 ms, +16 ms) au premier chargement réel ; une ligne archivée se REPLIE
  (`.est-partie`) avant que le POST natif parte (260 ms, `requestSubmit` avec le même bouton) —
  **défaut de la maquette corrigé** : sa hauteur minimale de 62 px tenait la ligne ouverte. Un geste
  de liste (rechargement) ne rejoue pas l'entrée ; « Précédent » rouvre les lignes repliées.
  ⚠️ Cela renverse l'arbitrage « la frise ne s'anime pas au chargement » : elle ne s'anime qu'au
  premier chargement réel, jamais à « Charger la suite ».
- **⚠️ DÉFAUT DE COMPORTEMENT CORRIGÉ : l'historique de la fiche ne se relisait pas.** Il est relu
  après chaque écriture confirmée (champ, média, révocation ; 700 ms de calme) par une action qui ne
  lit QUE lui (`relireHistorique`, sous RLS) et rend le bloc formaté par le serveur ; la nouvelle ligne
  entre (320 ms). Une première version passait par `router.refresh()` : la relecture a montré qu'il
  comptait une ouverture d'éditeur de plus à chaque sauvegarde (événement dénominateur) et faisait la
  queue avec les sauvegardes — abandonnée. Mesuré : 2 → 3 lignes après une modification.
- **Fiche** : focus sur « Nom du client » pour une commande sans client (souris seulement, décidé à
  l'ouverture), vignettes ajoutées qui entrent (420 ms, léger rebond), nouveau jeton qui réapparaît
  flouté (360 ms) après la confirmation de la base.
- **Ma marque** : validation à la saisie (couleur à chaque frappe, liens à la sortie puis à chaque
  frappe une fois refusés) avec les règles EXACTES du serveur (`lienAcceptable` : normalisation,
  200 caractères, motifs ancrés, déplacés de `reglages.ts` vers `normaliser-lien.ts` qui n'est pas
  réservé au serveur ; test ajouté) ; à l'envoi refusé, focus au premier champ fautif et « Rien n'a été
  enregistré. » ; badge « Contraste conforme » masqué tant que le code n'est pas une couleur ;
  « Enregistré. » qui entre (220 ms) et s'efface à la première retouche. Le nom de lien n'est PAS
  validé ici : sa forme appartient à `slug_valide()` seule (une copie divergerait). Lien « Voir la page
  client » : l'APERÇU de la dernière commande (`/p/<jeton>/apercu`, aucune vue comptée), par le saut
  qui relit le jeton au clic (`page-client?apercu=1`).
- **Paramètres** : panneau d'onglet qui entre (180 ms) au changement d'onglet seulement ; « Enregistrer »
  du nom désactivé tant que rien n'a changé (et sur la valeur ENVOYÉE, pas celle tapée pendant
  l'aller-retour) ; « Changer le mot de passe » désactivé tant que les deux champs ne sont pas remplis ;
  initiales qui suivent la frappe ; révélations animées (mot de passe de l'adresse, confirmations de
  suppression, étapes 2FA, 200 ms) ; autres sessions qui s'en vont (180 ms) APRÈS la confirmation.
- **Relectures** (trois agents) : corrigés — écran invisible liste → fiche (HIGH), graphe effacé au
  double clic (HIGH), `router.refresh()` de la fiche (HIGH), focus volé après relecture, aperçu de Ma
  marque qui comptait une vue, double POST et cache « Précédent » du repli, nom « Enregistré » sur une
  saisie non envoyée, bouton du mot de passe actif sur des champs vidés, drapeau d'onglet jamais remis
  à zéro, espaces de traduction `admin.dialogue` non expédiés (trouvé par `traductions-expediees`).
- ⚠️ **Non vérifié au navigateur ici** : les dialogues d'administration (aucun compte administrateur
  utilisable : la 2FA échoue par le proxy du conteneur) et les mini-frises d'Envois (aucun colis suivi :
  on n'engage pas de prise en charge 17TRACK). À voir au poste de Mehdi.
- **Portes ici** : `typecheck` 0, `lint` 0 erreur, `build` vert, `test` 1270/1271 (alarme Railway).

### ▶️ 02/10/2026 — fidélité du mouvement, lots 5 et 6 : page client, états, landing, administration (session cloud)

- **Page client `/p`** : la cascade d'entrée reçoit enfin son `--i` (0 à 8, plafonné comme la
  maquette) et le camion glisse depuis la gauche de son trajet (1 100 ms après 300 ms, WAAPI,
  `fill: backwards`), le tout par un script en ligne de 0,6 Ko qui ne tourne pas sous mouvement
  réduit ; pastille numérotée sur chaque photo ; compteur « 1 / N » du carrousel du téléphone,
  qui suit la photo en vue (masqué au bureau, comme la maquette ; le produit montrait le total seul,
  aussi au bureau).
- **Feuille d'historique** (`<dialog>` natif, gardé) : entrée 420 ms à la courbe des tiroirs, SORTIE
  de 240 ms (voile 220 ms) quel que soit le geste — croix, voile, Échap ; au téléphone la poignée se
  TIRE : fermée au-delà de 110 px ou de 0,11 px/ms, résistance (racine) au-dessus, retour en 260 ms
  sinon ; défilement du fond bloqué (`cl-bloque`). Mesuré : entrée 629 → 0 px en ≈ 450 ms, sortie
  0 → 627 px en 240 ms, glisser 60 px → reste ouverte, 200 px → fermée. **Défauts trouvés en
  mesurant** : `setPointerCapture` levait sur un pointeur déjà relâché (protégé) ; sous mouvement
  réduit, un glisser laissait son `transform` en ligne et la feuille se serait rouverte décalée de
  200 px (remis à zéro à chaque fermeture). **Fluidité** : le premier `showModal()` payait le style
  et la mise en page de tout le contenu dans l'image du geste (83 ms d'une traite à CPU ×4) — la
  feuille fermée est désormais mise en page d'avance sous `visibility: hidden` (ni visible, ni
  cliquable, ni focalisable, hors de l'arbre d'accessibilité — vérifié) : pire image 33-50 ms, comme
  la maquette (33).
- **Visionneur** : entrée 200 ms (0,97 → 1), glissement de 24 px entre photos (200 ms, sens du
  geste), sortie par une COPIE inerte qui s'efface (140 ms) pendant que le vrai dialogue se ferme
  aussitôt — le focus revient à la vignette sans attendre (test `visionneur-focus` inchangé).
  CPU ×4 : pire image 33-67 ms (maquette 17) ; les 67 ms tombent sur le premier rendu React de la
  scène, à opacité 0 : rien de visible n'est sauté. Assumé.
- **Validation QC** : l'étape qui arrive entre (200 ms, 4 px), jamais au premier rendu ; le focus suit.
- **Budget** : **288 Ko TRANSFÉRÉS hors médias** (gzip, mesurés par `encodedDataLength`), au
  téléphone comme au bureau — sous les 300 Ko, mais la marge n'est plus que de 12 Ko. Ce lot y
  ajoute quelques centaines d'octets ; l'essentiel vient du socle React (71 + 43 Ko) et de la
  police Inter (72 Ko). ⚠️ Une première mesure disait « 140 / 94 Ko » : elle lisait des corps
  décompressés, et de façon irrégulière. Elle était fausse. À surveiller avant tout ajout sur `/p`.
- **Relecture (un agent)** : aucun HIGH. Corrigés — `cl-bloque` sur `body` faisait sauter la
  colonne collante du bureau de 20 à −237 px sous le voile (mesuré) : au bureau seul `html` est
  bloqué, et la largeur de la barre disparue est rendue en marge (`bloquer-fond.ts`, décalage 0 px
  mesuré) ; une sortie de feuille pouvait refermer la feuille rouverte dans ses 240 ms (génération
  gardée) ; la feuille rouvrait au défilement précédent (remise en haut) ; une pichenette de 5 px
  la fermait (12 px minimum) ; `lostpointercapture` écouté ; le compteur s'arrêtait une tuile avant
  la fin (butée) ; chaque flèche du visionneur renvoyait le focus DERRIÈRE la couche (défaut
  antérieur : effet d'ouverture séparé de celui de la photo) ; la copie de sortie repart de
  l'opacité en cours ; une entrée déjà commencée garde son rang (pas de clignotement en 4G).
  Écartés : deux liens vers l'accueil sur le lien invalide (la maquette a les deux).
- **Lien invalide et erreur de `/p` NEUTRES** (décision de Mehdi) : l'« accent » de `.etat-p` est
  l'encre, plus aucun `rgba(91,75,245,…)` ni `--shadow-ds-brand` dessous — mesuré : aucun style
  calculé violet ou en dégradé sur la page. Ajoutés comme la maquette : « Retour à l'accueil » dans
  l'en-tête ; « Comment fonctionne DropLink » mène à `/fr/docs` (et non plus à `/fr`).
- **Landing** : le sceau de la démonstration QC devient une bulle sur un refus et redevient une coche
  sur un accord — les deux icônes sont rendues par le serveur, `.est-refuse` choisit.
- **Administration** : un seuil enregistré dit « Enregistré. 300 → 400, écrit au journal. », un
  interrupteur « Activé, effet immédiat, écrit au journal. » (comme la maquette). Les DEUX valeurs
  sont relues en base (l'« avant » juste avant l'écriture, sans bloquer l'écriture si cette lecture
  échoue) et « écrit au journal » est vrai : le déclencheur `tracer_parametre` (migration 044) écrit
  `admin_audit_log` dans la même transaction. Le badge de plan reste sur la fiche d'UN compte ; la
  liste des comptes reste sans badge Pro (décisions de Mehdi). Avertissement de lint `suspendu`
  (variable morte depuis l'étape 8) retiré.
- ⚠️ **Non vérifié au navigateur ici** : les messages de réglage de l'administration (aucun compte
  administrateur utilisable dans ce conteneur) ; l'écran d'erreur de `/p` (aucune panne de rendu
  provoquable sans toucher au code) — ses règles ne lisent plus que l'encre.
- **Portes ici** : `typecheck` 0, `lint` 0 erreur, `build` vert, `test` 1270/1271 (alarme Railway).

### ▶️ 02/10/2026 — fidélité du mouvement, lots 7 à 10 : deux tours d'audit final (session cloud)

- **Méthode** : trois agents en lecture seule (accès, public et landing ; espace vendeur et
  administration ; page client et états) comparent la maquette au produit, puis chaque point
  est corrigé et MESURÉ au navigateur ; un second tour relit le tout, correctifs compris.
- **1er tour — lot 7 (accès)** : erreur 2FA DANS le groupe des six cases ; suggestion
  d'adresse à la sortie du champ seulement ; adresse transmise vers l'oubli ; au
  « Précédent » entre connexion et inscription, l'adresse suit et le formulaire entre —
  ⚠️ mesuré : à `popstate`, Next a DÉJÀ rendu la page d'arrivée ; c'est l'événement
  `navigate` (Navigation API) qui est écouté ; bouton de notification « en cours » et un
  seul POST au double clic ; chapô de confidentialité ; nom provisoire grisé à l'onboarding ;
  404 globale avec sa classe `js`.
- **1er tour — lot 8 (`/p`)** : ⚠️ **DÉFAUT GRAVE** — le visionneur « plein écran » tenait
  dans 644 × 425 px au bureau, 348 × 201 au téléphone : rendu dans sa section, il héritait
  du `transform` maintenu par l'entrée (`animation-fill-mode: both`), qui faisait de la
  section le bloc conteneur des éléments `fixed`. Monté dans `<body>` par un portail
  (1440 × 860 mesuré) ; test de focus adapté à l'endroit où il cherche, assertions
  inchangées. Visionneur aux règles de la maquette (cadre carré blanc, pellicule, boucle,
  balayage au pointeur 50 px ou 12 px à 0,11 px/ms, clic à côté) ; QC et carte e-mail dans
  la cascade ; adresse jugée sur place ; lien d'évitement ; `theme-color` du vendeur.
- **1er tour — lot 9 (vendeur, admin)** : bordure lumineuse sur toutes les cartes (`:where()`,
  spécificité nulle ; défaut trouvé : l'aperçu de Ma marque en `static` débordait d'1 px) ;
  les **bulles d'annonce** de la maquette (`annonce.tsx`, toujours APRÈS la base ; à travers
  le rechargement pour l'administration) ; pied des paramètres (la réponse remplace l'aide,
  l'aide revient à la frappe) ; trait des vues posé puis glissant au seul changement ;
  onglet de la fiche qui suit le nom ; réglage numérique de l'administration.
- **2e tour — lot 10** : plus aucun écart visible. Corrigés, dont des effets de bord du
  1er tour : focus volé dans le bloc Adresse ; suggestion qui poussait un lien sous le
  pointeur ; focus rendu à la tuile sur Safari ; sens de transition d'après l'ordre des
  écrans pour tout lien et au « Précédent » (mesuré) ; focus au contenu de l'écran neuf,
  même après le remplacement du squelette (mesuré) ; barre de lot qui sort en fondu ;
  confirmations repliées après succès ; bulles de l'archivage et des interrupteurs.
  Vérifié sans défaut : un jeton valide sous un mauvais nom rend la même 404 neutre (aucun
  `theme-color`, même titre) — pas d'oracle.
- **Relecture du lot 10** (un agent) : un HIGH — le focus posé au contenu à l'arrivée
  reprenait le curseur qu'une commande neuve met dans « Nom du client » (gardé : seul un
  focus resté sur `<body>` ou hors de l'écran part au contenu) — et des MEDIUM : validation
  d'adresse perdue au clavier (rétablie, mesurée), focus perdu après le repli d'une
  confirmation, région du pied qui changeait de rôle (deux régions permanentes), bulle de
  l'archivage redite au retour (paramètres retirés de l'adresse, mesuré).
- **Mesures** : fumée sans débordement, violation CSP ni erreur sur les surfaces vendeur,
  accès, public et `/p`, à 1440 et 390 px, normal et réduit ; `/p` 288,7 Ko transférés hors
  médias ; CPU ×4, feuille d'historique pire image 33-50 ms (maquette 33).
- **Portes ici** : `typecheck` 0, `lint` 0 erreur, `build` vert, `test` 1270/1271 (alarme
  Railway, jamais désactivée).

### ▶️ 03/10/2026 — contre-audit indépendant, lots 11 à 13 : règle dure, jeton, comportements (session cloud)

- **A1 (règle dure)** : le lien invalide de `/p` montrait le symbole au DÉGRADÉ ; il prend
  `logo-symbole-encre.png` (tiré du symbole par son alpha, encre #0B0B18, 18 Ko). Mesuré : aucun
  style calculé violet ni dégradé ; plus aucune valeur du dégradé sous `src/app/p` et
  `src/components/publique` (hors la carte « Propulsé par DropLink », aux couleurs du vendeur).
- **D1** : l'aperçu au survol du tableau de bord est **retiré, décision de Mehdi du 03/10/2026**,
  avec `data-jeton` (le jeton public quittait le HTML du tableau de bord — mesuré : absent) et
  ses règles CSS.
- **D4c (défaut antérieur)** : archiver depuis le menu « ••• » invalidait le cache d'un jeton
  périmé après une révocation. Test rouge d'abord ; le jeton est désormais RELU EN BASE par
  l'écriture (`returning`, RLS), plus jamais pris au formulaire ; la révocation relit aussi
  l'ancien jeton en base. Revue sécurité : ni HIGH ni MEDIUM, LOW corrigés.
- **B1** : l'historique de la fiche est relu à 700 ms, 1,5 s, 3 s jusqu'à ce que sa ligne la plus
  récente change (le journal s'écrit après la réponse). Mesuré : la ligne arrive en ≈ 2,5 s — la
  relecture unique la manquait. Les rafales ne sont PAS fusionnées (chaque ligne est une
  écriture réelle, l'historique fait preuve), contrairement à `commande.js:48`.
- **B2** : les formulaires GET du vendeur (filtres, période, recherche globale, recherche
  d'envois) naviguent côté client avec l'estompe de la table — mesuré : 0 rechargement de
  document, l'entrée v4 ne rejoue pas ; recherche d'envois à la frappe (160 ms). Les liens
  sur place gardent la navigation de Next (défilement compris) ; l'administration n'est pas
  concernée (ses recherches écrivent l'audit).
- **B3** : l'échec de copie d'une ligne revient au repos en 1,6 s.
- **B4** : le geste le plus récent gagne pendant la sortie (mesuré : tableau → Commandes puis
  Analyses en 40 ms → Analyses) ; `data-sens` seulement sur un clic non modifié ;
  `dl-sans-entree` daté, valable 10 s.
- **B5** : « Créer une commande » fait sortir l'écran (110 ms) avant l'action (mesuré : action
  partie à 136 ms, écran à 0). Défaut trouvé à la relecture et corrigé : une action refusée
  (quota qui ramène ici, erreur) laissait l'écran effacé 6 s — il revient à la fin de l'action
  (mesuré : 1,5 s après un échec).
- **Relectures** (agents dédiés) : lot 13, 1 HIGH (la pagination de l'administration ne
  défilait plus) et 4 MEDIUM (estompe figée sur une adresse inchangée, frappe périmée, geste le
  plus récent seulement pour les liens, écran effacé après une action refusée) — tous corrigés.
- **Portes ici** : `typecheck` 0, `lint` 0 erreur, `build` vert, `test` 1289/1290 (alarme
  Railway).

### ▶️ 03/10/2026 — lot 14 : les lieux du trajet (D2) et les dates de /p (C1) (session cloud)

- **D2** : le trajet du héros nomme ses lieux, tels que 17TRACK les donne (`lieux-trajet.ts`,
  `etapeDuJalon` exporté de `normalize.ts`, la table JALONS seule source) — étape terminée : le
  plus ancien passage de l'étape parmi les 30 lus ; en cours : lieu et date du plus récent ;
  aucun passage lu : la date seule. Le lieu entre aussi dans l'étiquette lue du trajet. Aucune
  donnée nouvelle n'est exposée : `lire_passages_publics` rendait déjà le lieu, que
  l'historique affichait. Mesuré (base de tests) : « Shipped · Paris », « In transit · Lyon ·
  Oct 2 » en anglais, mêmes arrêts en français et en chinois.
- **Défaut trouvé à la relecture (M1)** et corrigé avant commit : le lieu d'un arrêt terminé
  était collé à la date d'un AUTRE passage (« Expédié · Lyon · 27 sept. » quand Lyon datait du
  28) — contrainte n° 8. `textesDuTrajet` prend désormais le lieu et la date du même passage ;
  test rouge sur l'ancien assemblage, vert après.
- **M2** : un lieu long (« GUANGZHOU INTERNATIONAL MAIL PROCESSING CENTER ») recouvrait l'arrêt
  voisin au bureau. Chaque libellé tient dans 22 % de la ligne et s'abrège ; mesuré à 640, 800,
  1 024 et 1 440 px : 0 px de chevauchement, rien hors du héros ; à 390 px, la grille passe à
  la ligne comme avant. Le texte entier reste dans l'étiquette lue.
- **C1** : la fourchette d'arrivée suit la maquette, le mois non répété, par règle de
  traduction (`page-publique.fourchette.*`) : « 5 au 6 octobre », « October 5–6 »,
  « 10月5日至6日 » ; sur deux mois « 30 octobre au 2 novembre » — mesuré dans le héros ET la
  carte de livraison, dans les trois langues. Bornes inversées remises dans l'ordre, jours en
  UTC (le trajet aussi, comme la fourchette). Intertitres de l'historique en date courte
  (« 2 oct. »). La carte « Propulsé par DropLink » porte une étiquette traduite. « Aujourd'hui »
  reste un écart gardé.
- **Mesures** : fumée de `/p` et de l'aperçu, 1 440 et 390 px, mouvement réduit compris :
  aucune violation CSP, aucune erreur console, 0 px de débordement (la sonde relève la feuille
  d'historique FERMÉE, masquée par `visibility` à dessein — `client.css`, mise en page
  d'avance). Poids hors médias : 289,0 Ko (< 300). Aucune animation touchée : pas de mesure
  CPU ×4.
- **Relecture** (React/TS, échecs silencieux, sécurité /p) : 0 HIGH, 2 MEDIUM corrigés (M1, M2),
  LOW corrigés : fuseau, bornes inversées, commentaires. Gardés : `jourSeul` ne connaît que les
  chiffres latins (les trois langues du produit le sont) ; l'étiquette de la carte Propulsé
  commence par son surtitre visible (WCAG 2.5.3 tenu) sans reprendre son titre.
- **Portes ici** : `typecheck` 0, `lint` 0 erreur, `build` vert, `test` 1296/1297 (alarme
  Railway).

### ▶️ 03/10/2026 — lot 15 : clavier, pages publiques, accès, bienvenue, fluidité (session cloud)

- **C2 (clavier)** : la bascule du graphique du tableau de bord est un `tablist` (flèches qui
  bouclent, un seul arrêt de tabulation, panneau `tabpanel` relié) ; les onglets des
  Paramètres aussi (flèches, Début, Fin, tabindex mobile), et ce restent des LIENS :
  `?section=` est toujours la source de vérité, le focus reste sur l'onglet après la
  navigation. Alt+← et Cmd+← (Retour du navigateur) ne sont jamais avalés. Activation
  automatique, comme la maquette — gardée : une saisie non enregistrée se perd comme au clic.
  À l'ouverture d'un déroulant (Commandes, Envois, menus de ligne), le focus va à l'option
  choisie, sinon au premier champ ; la cloche porte `aria-expanded`/`aria-controls`, alignés
  à chaque geste et au montage. Mesuré au navigateur, geste par geste.
- **C4** : Docs — l'encart « Le lien ne change jamais tout seul » en ton info (étincelles) ;
  le support retrouve « Signaler un contenu » (44 px) et l'adresse en `mailto:` restée
  sélectionnable, dans les trois langues. Blog — « N min (de lecture) » par next-intl.
  Pages légales — icône maison. Nouveau mot de passe et Paramètres — « ne doit pas contenir
  votre adresse » dès la sortie du champ et à l'envoi (0 requête partie, focus rendu au
  champ) ; l'adresse vient de la SESSION, ne part jamais avec le formulaire, le serveur relit
  la sienne. Mesuré sur une vraie session de récupération (lien généré en base de tests).
  Menu mobile de la landing : les quatre ancres puis « Se connecter ». ⚠️ Au téléphone, le
  bouton « Créer un compte » de la barre est masqué : une page publique sans appel dans son
  corps n'a plus de chemin vers l'inscription (§ 9).
  Héros de la landing : l'opacité est rendue au style (`""`, comme `l4.js`) et la règle CSS
  anti-clignement se lève quand l'îlot prend la main (`data-hx-parti`) ; une scène qui lève
  rend ses cartes visibles. Mesuré : 7 éléments à 1,00 en fin de scène à CPU ×1 et ×4, aucune
  opacité en ligne résiduelle, 1,00 sous mouvement réduit.
- **C5** : l'aperçu de `/bienvenue` comparé à la maquette au navigateur (1 440 et 390) : même
  structure ; la fourchette suit désormais la règle de `/p` (« October 4–5 », plus
  « October 4 – 5 »). Le bas de l'aperçu est rogné par l'écran du téléphone des deux côtés.
- **C6** : le sommaire des Docs et la bordure lumineuse (CoucheV4) écrivent au plus une fois
  par image (`requestAnimationFrame`, annulé au démontage). La veille `MutationObserver` de
  `TransitionsEcran` est coupée au premier geste, après 8 s et au démontage — vérifié.
- **D4a** : l'en-tête de la landing était DÉJÀ celui de la maquette, sans flou — mesuré à
  1 280 et 390 px, en haut et après défilement (fond, ombre, hauteur, transition identiques).
  **D4b** : la note de facturation des Tarifs est au gris sourdine de la maquette, inchangée.
- **Relecture** : 0 HIGH ; 3 MEDIUM corrigés (le refus local remontait le pied et détruisait
  le bouton visé par Tab ; un ancien message du serveur revenait sans envoi ; le focus ne
  pouvait pas entrer dans un menu de ligne encore masqué) ; LOW corrigés (touches modifiées,
  panneau du graphique, `aria-expanded` avant hydratation, texte d'erreur périmé, scène du
  héros qui lève, commentaire du menu mobile).
- **Mesures** : fumée de `/fr`, `/en/docs`, `/zh-CN/docs`, blog, mentions légales, tarifs,
  tableau de bord, paramètres, commandes, envois — 1 440 et 390 px, mouvement réduit compris :
  aucune violation CSP, aucune erreur console, 0 px de débordement (au téléphone la sonde
  relève le tiroir de navigation FERMÉ, en `visibility: hidden`, voulu).
- **Portes ici** : `typecheck` 0, `lint` 0 erreur, `build` vert, `test` 1299/1300 (alarme
  Railway).

### ▶️ 03/10/2026 — lot 16 : l'alerte des contestations (D3, migration 213) et l'administration (C3) (session cloud)

- **D3 — migration 213** `compter_contestations_en_attente_admin()` : `security definer`,
  `stable`, `search_path = ''`, garde `est_admin()` → `DL031` (donc double authentification,
  186), fermée à `public` et `anon`, ouverte à `authenticated`. Elle rend un NOMBRE, la
  référence courte (`#` + 6 derniers caractères, la règle de `referenceCourte`) et la date
  d'envoi de la plus ancienne — aucun contenu, donc aucune trace, comme
  `compter_doublons_admin`. Déclarée dans `FONCTIONS_OUVERTES_ADMISES` avec sa raison ;
  falsification `contestations-alerte-sans-garde` ; types écrits à la main comme ceux de
  `compter_doublons_admin`. Lecture serveur à TROIS états (`ok`, `aucune`, `illisible`) :
  test unitaire vu rouge sur deux falsifications (une panne dite « aucune », une file vide
  dite « aucune » sans référence). Deux tests RLS écrits (l'administrateur lit, sans trace ;
  vendeur et anonyme reçoivent le refus d'une surface inexistante) — **jamais exécutés ici**
  (pas de Postgres depuis le cloud), listés pour Mehdi avec la falsification.
- **L'alerte à l'écran** : « Contestation du blocage de #XXXXXX », « Envoyée par le vendeur le
  … » ; au pluriel « N contestations de blocage en attente, la plus ancienne pour #XXXXXX »
  (sans « première sur trois », que la base ne sait pas dire ici). « Examiner » mène à
  `/admin/commandes?q=#XXXXXX` : la maquette pointe une ANCRE de ligne, que la liste paginée
  ne garantit pas — la recherche par référence existe déjà (160). « Aucune alerte » exige
  désormais les trois lectures. Tant que la 213 n'est pas en production, la vue d'ensemble
  dit « Les contestations en attente n'ont pas pu être lues » au lieu de rendre 500.
- **C3** : pied « X sur N entrées » du Journal aussi sur la dernière page. Commandes et
  Comptes : « X sur N » SANS filtre (N = `repartir_commandes_admin.total`,
  `compteurs_admin.comptes`) ; AVEC un filtre, seulement « X affichées » — aucune fonction ne
  compte les lignes filtrées, et le total de la plateforme se lirait comme celui du filtre
  (contrainte n° 8). Paramètres : Plafonds | Suivi, puis Interrupteurs | Débit, puis
  « Constaté, changé au déploiement » sur toute la largeur, comme la maquette ; la purge des
  médias, valeur réelle non dessinée, y reste. Boutiques : les sept colonnes de la maquette ;
  la colonne « Voir », seul chemin d'une boutique vers son compte, devient la boutique
  elle-même (lien, nom accessible « Voir le compte de … »). Barres : plus de `<title>` natif.
  Prop `carte` morte retirée de `BlocageLien` et `ContestationLien`.
- **NON MESURÉ** : aucun écran d'administration ne se voit d'ici (double authentification) —
  vérifié seulement qu'ils rendent 404 à un anonyme. Tous listés dans
  `verification-finale-locale.md`.
- **Relecture** (base de données, sécurité, React/TS, échecs silencieux) : 0 HIGH, 0 MEDIUM.
  Vérifié par elle : droits et `search_path` de la 213, référence identique à la 160, index
  partiel utilisé, aucun contournement d'audit (« Examiner » passe par la liste, qui trace),
  N du même périmètre que la liste non filtrée. LOW corrigés : le lien boutique garde son
  texte visible comme nom accessible ; le chemin « illisible » incohérent laisse une trace
  serveur (test cas par cas, vu rouge) ; « X sur N » seulement en première page sur Commandes
  et Comptes ; nombres formatés en chinois.

### ▶️ 03/10/2026 — audit indépendant final, administration (session cloud)

Un agent en lecture seule, consigne « ne crois pas la session qui a corrigé », a repris les six
points de l'administration du contre-audit : tous corrigés (preuves fichier:ligne). Il a trouvé,
et c'est corrigé : les valeurs constatées des Paramètres sans leur unité (« 20 » au lieu de
« 20 / min », « 20 Mo », « 10 jours ») ; les bornes et les totaux chinois non formatés
(« 100000 ») ; la rangée « Notifications par email — rien n'est envoyé », absente de la
maquette et FAUSSE depuis les e-mails de suivi (188-189), retirée ; le point manquant de
« Les secrets ne sont pas ici. » ; le suffixe « · ni modifiables ni effaçables » du pied du
Journal ; la date d'origine en format court (« 20 sept. 2026 ») et la phrase des bornes sans
« Valeur par défaut », comme la maquette ; l'aide du stockage raccourcie ; un comptage des
doublons illisible qui laissait la section des décisions vide, désormais dit ; deux
commentaires faux. **Gardé** : la rangée « Abandon du suivi après », valeur réelle du produit
que la maquette ne dessine pas ; le pied du Journal sur toutes les pages (décision : « même
sur la dernière »). Toujours **non mesuré au navigateur** (double authentification).

### ▶️ 03/10/2026 — audit indépendant final, espace vendeur et pages publiques (session cloud)

Deux agents en lecture seule, mesures au navigateur comprises : **tous les points du
contre-audit de leur zone sont corrigés** (logo neutre, fourchette, intertitres, étiquette de
la carte Propulsé, lieux du trajet, Docs, blog, icône maison, refus de l'adresse, menu mobile,
héros de la landing, en-tête sans flou, note des Tarifs, historique de la fiche, filtres sur
place, copie de ligne, gestes de navigation, jeton relu, clavier, cloche, fluidité). Nouveaux
défauts trouvés, et corrigés :
- **« Créer une commande » qui échoue effaçait toute l'application** (la frontière d'erreur
  publique remplaçait la coque). Une frontière locale le rattrape : la coque reste, la bulle
  dit « Création impossible. Réessayez. », le bouton revient. Mesuré, POST coupé.
- **Un `notFound()` du blog** (autre langue, article inconnu) rendait la page générique de Next,
  en anglais. `dynamicParams = false` en fait des routes inexistantes, servies par
  `global-not-found` : mesuré en/zh/fr. Un `not-found` de segment a été ESSAYÉ (sous
  `[locale]`, sous `blog`, avec et sans layout) : jamais pris, comme le disait déjà
  `global-not-found` — retiré. Les deux autres `notFound()` (`notification`, `signalement`) ne
  se déclenchent que sur une langue hors liste ou une configuration absente au déploiement.
- Vues de Commandes en onglets (← →, un arrêt de tabulation) comme la maquette ; le sélecteur
  de période n'avale plus Alt/Cmd+← ; la copie de la fiche revient au repos après un échec, une
  seule minuterie par bouton ; les flèches des Paramètres ne jouent plus le fondu (mesuré :
  opacité 1 tout du long) ; les champs vides ne voyagent plus dans l'adresse
  (`?statut=preparation`) ; « Appliquer » rend le focus au bouton du menu ; une série de
  relecture qui en remplace une autre va jusqu'au bout (la ligne du second geste n'est plus
  manquée ; test vu rouge).
- `/p` : l'étiquette lue du trajet suit une règle de traduction (« In transit: Ongoing, Lyon »,
  plus « In transit : Ongoing : Lyon ») et dit la date estimée ; la préparation se tait aussi
  quand le plus ancien passage LU la contredit. Le compteur du mot de passe compte comme le
  serveur. `/bienvenue` : l'aperçu s'arrête à la validation et ses blocs entrent
  (`data-etats`), comme `compte.js`. La landing dit « 1 au 2 octobre » comme `/p` (le « 1er »
  noté plus haut est abandonné). Docs : virgules de la maquette au lieu des tirets. L'article
  affiche « 5 min » comme la maquette.
- **Gardé** : « Ce bouton prépare le message » du signalement (la maquette dit « ouvre votre
  messagerie ») — c'est ce que fait le produit.
- Portes : `typecheck` 0, `lint` 0 erreur, `build` vert, `test` 1301/1302 (alarme Railway) ;
  fumée sans violation CSP ni erreur ; `/p` 289,0 Ko hors médias.

### ▶️ 03/10/2026 — second tour d'audit, administration (session cloud)

Nouvel agent indépendant, sur le CODE (l'administration exige la double authentification).
Les correctifs du premier tour sont vérifiés ; il en restait des morceaux, et de nouveaux
écarts — corrigés : « plus de 10000 entrées » non formaté et pied du Journal au-delà de 10 000
sans « ni modifiables ni effaçables » ; forme `eteint` morte et en-tête des Paramètres qui
comptait encore « quatorze » réglages ; l'origine qui repassait en date longue après un
enregistrement (un seul format nommé, `origine` : « 20 sept. 2026, 14:05 » — le mois court de
la maquette, l'HEURE gardée, deux changements du même jour devant rester discernables) ; filtres et anneau de Comptes au pluriel (« Actifs », « Suspendus ») ; encart
de Boutiques au texte complet de la maquette ; sous-titres et garantie qui disparaissaient
sous 768 px (cinq écrans et le Journal) — rendus partout comme la maquette ; en-tête de la
fiche « Revendeur · inscrit le 14 juin 2026 » (la date n'existait plus au téléphone) ; un
comptage des doublons en panne qui faisait tomber toute la liste des Comptes ; « 30 sept. à
11:42 » (règle de traduction) ; date courte du dialogue de contestation ; « 1 suspendu » ;
périodes des Statistiques dans l'ordre 30 / 7 / 90 et « sur 30 jours » ; « 4,5 Go relus côté
serveur » ; la règle de panne sous chaque jauge de Surveillance ; trois chaînes mortes.

**Gardés, avec leur raison** : « Ce que ce compte a fait » en liste datée et non en tuiles de
totaux — `lire_compte_admin` ne rend que les six derniers couples (type, jour), des totaux
demanderaient une migration (§ 9) ; « Colis » marqué FACTURÉ et la ligne « Couleur » de la
fiche (données réelles) ; « Débloquer le lien » retiré d'une ligne contestée (débloquer passe
par la lecture tracée de la contestation) ; sélecteur 7/30/90 de la courbe du panneau, filtre
de date de Commandes, adresse du compte visé en texte dans le Journal.
**Non corrigé, et dit à Mehdi (§ 9)** : le 404 de l'administration a un corps VIDE.

### ▶️ 03/10/2026 — second tour d'audit, vendeur et public (session cloud)

Agent indépendant, mesures au navigateur, POST bloqués : les quinze correctifs du premier tour
sont vérifiés réels. Restaient, corrigés et remesurés :
- **Commandes** : un filtre sans résultat faisait disparaître « Filtres » et « Trier » (et le
  focus rendu au menu tombait sur `<body>`) — les outils restent, comme la maquette.
- **/p sous mouvement réduit** : la feuille d'historique s'ouvrait sans focus. La règle globale
  donnait 0,01 ms de transition à `visibility`, héritée par la croix ; la feuille ne transite
  plus rien sous `reduce`. Mesuré : focus sur la croix à 390 et 1 440, réduit ou non.
- Après un échec de création, le focus revient au bouton ; les flèches des onglets (Commandes,
  Paramètres) REMPLACENT l'adresse au lieu d'empiler l'historique (mesuré : +0 entrée pour
  trois flèches), sans fondu ; l'aperçu de `/bienvenue` est d'une seule langue (« Your
  shop ») et son compteur de galerie au gris sourdine ; « Passer au Pro » et l'aide du suivi
  avec la ponctuation de la maquette ; les boutons de 52 px de Tarifs, Docs et fin d'article
  ne sont plus écrasés à 44 par leur plancher `min-h-11` (gardé, exigé par
  `cibles-tactiles`) ; « © 2026 DropLink. Tous droits réservés. » sur les pages publiques, la
  forme courte sur la landing seule, et plus de pied dans l'espace vendeur — comme la maquette.
- Portes : `typecheck` 0, `lint` 0 erreur, `build` vert, `test` 1301/1302 (alarme Railway) ;
  fumée sans violation CSP ni erreur ; `/p` 289,1 Ko hors médias.

### ▶️ 03/10/2026 — troisième tour d'audit, tout le produit (session cloud)

Agent indépendant : les correctifs de 7dd3cb2 et 43f8b18 sont vérifiés réels (au navigateur
pour le vendeur et le public, sur le code pour l'administration). Trouvé, et corrigé :
- **Régression du second tour** : les vues de Commandes changées au clavier n'estompaient plus
  la table (`router.replace` sans l'estompe). `TransitionsEcran` écoute désormais une demande
  d'estompe ; mesuré : 1 → 0,35 → 1, et toujours 0 entrée d'historique.
- La feuille d'historique de `/p` garde le focus (Tab et Maj+Tab bouclent, mesuré à 390 réduit
  et 1 440) ; noms accessibles de la maquette (« Aperçu de votre page client », « À propos des
  analyses », « Gratuit et Pro », la navigation « Paramètres » autour des onglets, « Chiffres
  clés » pour les tuiles de l'administration) ; date courte de la fiche de compte ; pied court
  de la landing en chinois (« © 2026 DropLink »).
- **Gardés, décisions déjà prises** : « première sur trois » absent de l'alerte (consigne de
  Mehdi) ; titres d'onglet des catalogues (arbitrage du § 5 : « on garde les titres »).
- **Donnée du jeu de test** : sur `/p`, « No carrier information yet » avec des passages datés —
  `dernier_mouvement` est vide dans la fixture ; l'ingestion le pose en production.

### ▶️ 03/10/2026 — quatrième tour, contrôle final (session cloud)

Agent indépendant sur 72292b9 : les six correctifs sont réels (estompe au clavier, boucle de
la feuille de `/p`, noms accessibles identiques à la maquette dans les trois langues, `nav`
des Paramètres au pixel près, date courte, pied chinois). Une régression trouvée et corrigée :
un aller-retour rapide entre deux vues (→ puis ← avant la fin du chargement) laissait la
table estompée 8 s, l'adresse finale n'ayant pas changé — l'estompe est désormais levée quand
l'adresse demandée est celle déjà affichée, au clavier comme au clic. Mesuré : table à 1,00
tout du long sur l'aller-retour, 0,35 → 1 sur un changement simple. « Chiffres clés » aussi
sur les tuiles seules des Statistiques et des Doublons. Balayage : aucune violation CSP,
aucune erreur, aucun débordement.

### ▶️ 03/10/2026 — relecture des trois langues : le français (session cloud)

Consigne de Mehdi (`consignes/prompt-langues-et-seo.md`) : relire les trois langues, puis le SEO.
Méthode : les 2 329 chaînes de `messages/fr.json` mises en feuilles de relecture (hors dépôt), un
relecteur unique sur TOUTES les clés et les cinq articles du blog ; ses corrections passent par un
outil qui REFUSE une valeur « avant » différente du fichier, une variable ou une balise changée, et
un message ICU invalide (une seule refusée, voulue : le pluriel ajouté, appliqué à la main après
lecture des appelants).
- **Typographie, mécanique : 236 chaînes** reçoivent l'espace insécable (U+00A0) avant `: ; ? ! »
  % €` et après `«` ; **41 chaînes du blog** aussi (il n'en avait aucune). Les sondes
  normalisent les espaces (`\s` couvre U+00A0) ; la fumée lit le catalogue, donc la même valeur.
- **Relecture : 34 corrections** — cohérence 11 (« e-mail » partout, « facultatif » au lieu
  d'« optionnel », « Réessayez »), grammaire 7 (propositions soudées par des virgules dans le
  guide), tournure 7 (« Desktop » → « Ordinateur », « uploadées » → « déposées », « brandée »),
  typographie 6 (« Ex. : », « 1er »), accord 1, pluriel 1 (« {n} ouvertures » sans pluriel ICU),
  conjugaison 1 ; blog : 2 tournures.
- **Trois affirmations FAUSSES corrigées, au-delà de la langue** : le guide (`docs.param5`, trois
  langues) et deux articles disaient DropLink « gratuit pendant la phase de validation / de
  lancement » — faux depuis le plan Pro. Ils disent désormais ce que fait l'écran (plan actuel,
  Gratuit ou Pro) et « gratuit pour commencer ».
- **« 1er » dans les fourchettes de dates** : `Intl` écrit « 1 octobre », aucune option ne pose
  l'ordinal. `fourchetteDates` passe désormais aussi le jour et le mois séparés, et le catalogue
  français écrit `{jourDu, select, 1 {1er} other {…}}` ; l'anglais et le chinois ne changent pas.
  La landing dit « 1er au 2 octobre », comme `/p` (la note du 02/10 qui retenait « 1 au » est
  abandonnée). ⚠️ **Reste** : les AUTRES dates longues du produit (« inscrit le 1 juin 2026 »)
  passent par `Intl` sans ce relais ; les corriger demande un formateur commun — non fait.
- **Écart au design voulu** : « Ordinateur » au lieu de « Desktop » (Ma marque, éditeur) — la
  maquette dit « Desktop » ; la langue gagne.
- **Gardé, avec sa raison** : le glyphe d'apostrophe (le catalogue mélange `'` et `’`, la maquette
  aussi) — le changer déplacerait 157 ou 385 textes de la comparaison au kit sans gain de lecture ;
  les chaînes du blog écrites dans `src/` (le blog est français seul par décision, ses textes
  vivent dans `lib/blog`) ; le titre « Ce lien n'est plus valable » de `/p` (décision commentée
  dans le layout).
- **Non corrigés, parce qu'ils changeraient le sens — à trancher par Mehdi** : « Trois minutes
  suffisent » (`commandes.vide.compteTexte`) contre « moins d'une minute » ailleurs ; la première
  étape s'appelle « Pas encore scanné » dans le guide et « Préparation » sur la page client ;
  `blocageVendeur.erreur.saisie` écrit « 20 » en dur quand l'aide voisine lit `{n}` ; la ligne
  « Export limité à … lignes » du CSV est en français quelle que soit la langue.
- **À reporter dans le design system** (`ui_kits/legal/contenu-legal-fr.js`) : seules deux
  corrections touchent `legal.*`, aucune ne change le fond —
  `legal.pages.confidentialite.sections.1.blocs.3.table.lignes.4.0` « (facultatif) » →
  « (facultative) » ; `legal.signalement.email` « adresse email » → « adresse e-mail » ; et les
  espaces insécables avant `: ; ? !` dans tout `legal.pages` (mécanique, même règle).
- Portes : `typecheck` 0, `lint` 0 erreur (1 avertissement préexistant), `build` vert, `test`
  1301/1302 (alarme Railway).

### ▶️ 03/10/2026 — audit SEO, lot 1 : structure (session cloud)

Méthode : le pack `claude-seo` v2.4.1 cloné HORS du dépôt et lu comme grille (technique, page,
hreflang, schema, sitemap, images, audit) ; aucun de ses scripts réseau lancé, `parse_html.py`
inutilisable (BeautifulSoup absent, rien installé) — sa règle est appliquée par une sonde
Playwright qui enregistre le HTML SERVEUR (JavaScript coupé) des 27 pages indexables et de 14
pages privées, puis un contrôleur qui applique la grille. Premier passage : **124 défauts**.
- **`/signalement` annoncé sans exister** : sans adresse de signalement la page rend 404, mais
  le plan de site la déclarait toujours (trois URL mortes) et le guide y menait (trois liens
  morts). Les deux suivent désormais `signalementDisponible()`, comme le pied de page ; la
  fumée éprouve la même règle (`canalOuvert`). Audité ensuite avec une adresse factice.
- **Hiérarchie des titres** : la démo de page client de la landing sautait du h2 au h4 (ses
  « titres » sont une image de la page client) → `div.pc__titre`, et de même dans l'aperçu de
  Ma marque et de `/bienvenue`, qui partageaient la règle `.pc h4` (régression trouvée par la
  revue, corrigée avant commit) ; `/signalement` sautait du h1 au h3 du pied → les deux titres
  de colonne du pied passent en h2 (même rendu, `.pied h2`).
- **Données structurées sur toutes les pages indexables** : seules la landing et les articles en
  avaient. `donneesPage` décrit les autres (WebPage, ContactPage pour le signalement,
  CollectionPage pour le blog) avec leur fil d'Ariane, rattachées par `@id` au site et à
  l'organisation ; l'article gagne `author` (l'organisation), `image` (l'aperçu réellement
  servi) et son fil d'Ariane dans `mainEntityOfPage` ; l'organisation gagne son `logo` (le
  symbole affiché partout). Aucun prix, aucune note, aucun avis. Nouvelle garde dans
  `seo.test.ts`, vue rouge deux fois (tarifs, article) avant d'être verte.
- Un article se partage en `og:type=article` avec sa date ; une seule balise `<script>`
  JSON-LD, `GrapheJsonLd`, au lieu de deux copies.
- **Vérifié sans défaut** : `<html lang>` exact, canonique absolue et auto-référente, hreflang
  réciproques fr / en / zh-CN + `x-default` (français) identiques au plan de site, Open
  Graph (image absolue 1200 × 630, `og:locale` et ses deux alternatives) et Twitter sur les
  27 pages ; toutes les images ont un `alt` (vide si décoratives) et leurs dimensions ; aucun
  lien sans texte ; les 34 cibles internes répondent. Pages privées : connexion, inscription,
  mot de passe, vérification, bienvenue, notification, espace vendeur, `/en/blog` portent
  `noindex` ou redirigent vers la connexion ; `/fr/admin` et `/p/<jeton inventé>` rendent 404.
- Core Web Vitals en local (CPU ×4, médiane de 3, avant les textes du lot 2) : LCP 0,5 à 1,1 s
  sur la landing et les pages légales, CLS 0,000 partout — sauf la landing CHINOISE au bureau,
  LCP ≈ 2,8 à 3,3 s : l'élément mesuré est la ligne « 整笔订单。 » du titre, révélée par
  l'animation d'entrée. Antérieur à cet audit, noté pour Mehdi (§ 9).
- Reste pour le lot 2 : longueur des titres et descriptions (35 écarts, surtout en anglais et
  en chinois).
- Portes : `typecheck` 0, `lint` 0 erreur, `build` vert, `test` 1302/1303 (alarme Railway).

### ▶️ 03/10/2026 — relecture des trois langues : l'anglais (session cloud)

Même méthode que le français : un relecteur unique sur les 2 329 clés, le français en regard pour
le sens ; corrections passées par l'outil qui refuse toute variable changée (les deux pluriels
ajoutés, refusés comme prévu, appliqués après lecture des appelants).
- **188 clés corrigées** : orthographe 50 (le catalogue mélangeait britannique et américain :
  25 « colour », 7 « recognise », licence, cancelled, catalogue, centre… — tout en anglais
  américain, sauf le nom propre « OCBC Centre »), tournure 45 (« No orders yet » et non le calque
  « No order », « Learn more about DropLink »), cohérence 43 (log in / log out partout sauf
  « Sign in with Google », terme de Google ; customer page, seller, limit, dispute — 5 « appeal »
  de l'administration —, handle), ponctuation 30 (guillemets “ ”, plus de « » ; apostrophe
  droite, la dominante), grammaire 12, pluriel 4, contresens 3, accord 1.
- **Les trois contresens** : « Photo completion rate » pour le taux d'APPROBATION des photos ;
  « the customer comes back » sans le « plusieurs fois » qui porte le sens ; « twenty media,
  including three videos » qui rendait trois vidéos obligatoires (c'est un maximum).
- **Pluriels réparés dans le CODE aussi** : `analyses.jours` et `analyses.vuesParCommande`
  recevaient un nombre déjà formaté en chaîne, d'où « 1 days » possible ; `compteurs-app.tsx`
  passe désormais le nombre et les catalogues le formatent (`#` en français et en anglais,
  `{n, number}` en chinois). Mesuré : « 1 day », « 1.5 days », « 1,5 jour », « 1 234,5 jours ».
  Le français avait le même défaut sur `accueil.vendeur.vues` (« 1 vues ») : corrigé.
- **Non corrigé, voulu** : `page-publique.suivi.dernierMouvement` et `silenceTitre` restent en
  `t.raw().replace("{n}")` — ils ne s'affichent qu'à 2 jours et plus, et à 10 jours et plus ;
  « cap » (pages marketing) et « limit » (application) coexistent, tous deux justes ; le fond
  légal (« sole trader », « by post ») n'est pas touché.
- **À reporter dans le design system** (`ui_kits/legal/contenu-legal-en.js`), orthographe,
  grammaire ou ponctuation seulement : `legal.pages.conditions.sections.{3.blocs.0.p,
  6.blocs.1.ul.1, 7.blocs.1.p, 8.blocs.0.p, 10.blocs.0.ul.2, 11.blocs.2.p}` et
  `legal.pages.confidentialite.sections.{1.blocs.1.table.lignes.2.0, 2.blocs.0.table.lignes.4.0,
  4.blocs.0.table.lignes.5.1, 4.blocs.0.table.lignes.8.1, 6.blocs.1.table.lignes.2.1,
  8.blocs.0.ul.3}` (licence → license, cancelled → canceled, towards → toward, colour, recognise,
  defence ; « may be interrupted for maintenance, may change, or may be discontinued » ; « Until
  the customer unsubscribes or the order is deleted » ; « with a limited lifetime » ; une virgule
  après tiret retirée). Plus deux libellés du formulaire de signalement (`legal.signalement.*`).
- Portes : `typecheck` 0, `lint` 0 erreur, `build` vert, `test` 1302/1303 (alarme Railway).

### ▶️ 03/10/2026 — relecture des trois langues : le chinois (session cloud)

Même méthode : un relecteur unique sur les 2 329 clés (français pour le sens, anglais relu en aide),
corrections passées par l'outil de contrôle. **199 corrections** : cohérence 149, ponctuation 21,
tournure 12, contresens 11, grammaire 4, espacement 2 ; aucun caractère traditionnel, aucune
ponctuation demi-chasse collée à un idéogramme.
- **Conventions mesurées et tenues** : 您 (188 contre 13 你 ; 你 gardé dans les répliques de
  conversation de la landing), 账户 pour le compte DropLink (账号 pour Instagram, Google…), 跟踪,
  运单号, 笔订单, 免费版 / Pro, 停用 / 恢复 pour un lien bloqué, 双重验证 ; guillemets “ ” (les 「 」
  de 19 clés remplacés) ; « —— » dans une phrase ; une espace entre idéogramme et lettre latine,
  chiffre ou variable (331 + 363 cas contre 10 + 11), jamais autour d'une ponctuation pleine chasse.
- **Contresens corrigés, dont** : « le lien à votre nom » traduit « généré en votre nom »
  (以你的名义) — quatre clés, dont la description de recherche des tarifs ; « taux d'achèvement »
  pour le taux d'approbation des photos ; une adresse d'exemple impossible (`droplink.fr/你的店铺/`,
  un nom de lien n'accepte que des lettres latines) → `your-shop`, comme la landing ; « pris en
  charge » disparu des analyses ; « téléversements » pour des envois de contestation.
- `legal.signalement.sujet` retrouve sa variable `{titre}` (le titre était écrit en dur).
  Quatre exceptions déclarées, avec leur raison, dans `catalogue-chinois.test.ts` (« Logo »,
  « MB », l'adresse d'exemple, l'objet du signalement).
- **Au navigateur** (production locale, base de TESTS par l'API HTTPS, compte jetable purgé) :
  15 pages publiques et d'accès, 9 écrans vendeur, à 390 px (tactile émulé) et au bureau, menus
  mobiles ouverts : **aucun débordement de page, aucun libellé tronqué** (seules des données longues
  — adresse e-mail, nom de client — coupées à l'ellipse comme en français). **Un défaut réel** :
  la référence de la démo de la landing gardait un interlettrage de −1,08 px en chinois — une règle
  `!important` (`.hx__ref b`) battait `:lang(zh-CN) * { letter-spacing: 0 }`, qui perdait aussi
  contre tout sélecteur plus spécifique. Les deux sont corrigées (`!important` sur la règle
  chinoise, exception dédiée sous `.hx__ref b`). L'administration (double authentification) n'a
  pas été mesurée d'ici. La sonde du dépôt (`verifier-ecran-migre.mjs`) exige Postgres en direct,
  fermé depuis ce conteneur : une variante HTTPS jetable a servi, hors dépôt.
- **À reporter dans le design system** (`ui_kits/legal/contenu-legal-zh.js`) : une seule correction
  — `legal.pages.mentions.sections.0.blocs.0.p` : « DropLink 由个体经营者（entrepreneur individuel,
  EI）Mahfoud SEDDIKI 发布，地址：… ».
- **Non corrigés (fond légal ou sens) — à trancher par Mehdi** : les pages légales chinoises disent
  专业版, 封禁 et 暂停 quand l'interface dit Pro et 停用 ; `conditions.sections.7.blocs.1.p` dit
  « tout abonnement » (任何订阅) pour « son abonnement éventuel » ; les mentions ajoutent
  « （即网站发布方本人）» et deux adresses « France », absents du français.
- Portes : `typecheck` 0, `lint` 0 erreur, `build` vert, `test` 1302/1303 (alarme Railway).

### ▶️ 03/10/2026 — audit SEO, lot 2 : titres et descriptions de recherche (session cloud)

Les 35 écarts restants du lot 1 étaient des longueurs : « Tarifs — DropLink » (17 caractères),
« Pricing — DropLink », des descriptions anglaises de 88 à 117 caractères, chinoises de 63 à 105,
une française de 189 (tarifs) et deux articles à 175 et 186 que Google coupait au milieu.
- **Règle retenue, une seule pour les trois langues** : Google tronque en PIXELS, un idéogramme
  vaut environ deux lettres latines ; la largeur compte donc 2 par idéogramme ou ponctuation
  pleine chasse, 1 sinon. Titre 30 à 60, description 120 à 160, tous uniques.
- **Réécrits, sans rien promettre que la page ne dise** : tarifs (fr, en, zh), mentions légales
  (fr, en, zh), conditions et confidentialité (en, zh), signalement (en, zh), landing (zh) ; le
  guide reçoit un titre de recherche à lui (`docs.metaTitre`, « … le guide complet »), son h1
  ne change pas ; le blog, un titre et une description de recherche distincts du chapeau affiché
  (181 caractères, gardé) ; deux descriptions d'article raccourcies. Les valeurs chinoises sont
  celles du relecteur chinois (largeurs 31 à 43 et 120 à 131).
- **Garde nouvelle** (`seo.test.ts`) : les sept pages trilingues × trois langues, dans les
  bornes et uniques ; vue rouge deux fois (titre français raccourci, description chinoise
  doublée), puis verte ; une seconde garde couvre le blog (son titre et sa description de
  recherche, la description de chaque article), vue rouge deux fois aussi. La revue a relevé une
  formulation inexacte (« des vendeurs qui LIVRENT en message privé ») : corrigée.
- **Remesuré, production locale** : la sonde rend **0 défaut** sur les 27 pages indexables
  (title, description, un seul h1, hiérarchie, `lang`, canonique, hreflang réciproques +
  `x-default`, Open Graph et `og:locale`, Twitter, JSON-LD, `alt`, dimensions, liens internes) ;
  le validateur hors ligne du pack (`hooks/validate-schema.py`, lancé en environnement vide sur les
  HTML enregistrés) rend 0 sur dix pages, et 2 sur un contre-test `HowTo` — il inspecte bien ;
  le plan de site annonce 27 URL, aucune privée. `/p` : **279,3 Ko hors médias** (< 300),
  `noindex`, aucune balise Open Graph — mesuré sur une commande jetable de la base de tests,
  jeton gardé en mémoire et compte purgé. Core Web Vitals (CPU ×4) : rien de dégradé.
- Portes : `typecheck` 0, `lint` 0 erreur, `build` vert, `test` 1306/1307 (alarme Railway).

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
- [x] Trancher le flou de l'en-tête de la landing — **décidé le 03/10/2026 (D4a) : comme la
  maquette, sans flou** ; mesuré, c'était déjà le cas.
- [x] Créer le dépôt bac à sable (§ 10, étape 1) — `JLmehdi92/Droplink-maquette-`, 02/10/2026.
- [ ] **Lancer la vérification finale sur ton poste** : `consignes/verification-finale-locale.md`
  (portes complètes, écrans non mesurables d'ici, revue ECC). Rien ne part sur le vrai dépôt avant.
- [x] Trancher l'alerte « contestation en attente » et le badge « Pro » — **décidé le 03/10/2026
  (D3)** : l'alerte est portée par la **migration 213** ; le badge « Pro » de la LISTE des comptes
  reste un écart gardé (pas de migration).
- [ ] **Appliquer la migration 213** (`compter_contestations_en_attente_admin`) : sur ton poste,
  `pnpm db:migrate:tests` puis `pnpm db:types:tests` (les types écrits à la main doivent alors
  ressortir identiques), puis `pnpm test:rls` (deux tests neufs dans `tests/rls/contestation`)
  et `pnpm falsifier casser contestations-alerte-sans-garde` → rouge → `reparer`. Puis **EN
  PRODUCTION, par toi, AVANT le push vers droplink2**, avec les 210, 211 et 212 qui attendent
  déjà — **jamais la 211 sans la 212**. Tant que la 213 manque en production, la vue d'ensemble
  ne rend pas 500 : elle dit « Les contestations en attente n'ont pas pu être lues ».
- [x] Trancher la mention de facturation de Tarifs — **décidé le 03/10/2026 (D4b) : elle reste au
  gris secondaire** (`.tf-note`, comme la maquette).
- [ ] **Sécurité, à trancher (second tour d'audit, 03/10/2026)** : `/fr/admin*` répond 404 avec
  un corps VIDE (`middleware.ts`, trois `new NextResponse(null, { status: 404 })`), quand
  toute autre adresse inventée répond la page « Cette page n'existe pas » (≈ 11,7 Ko). Le
  préfixe `/admin` se reconnaît donc à la taille ou à l'écran du navigateur — l'inverse de ce
  que le 404 doit cacher. Correctif proposé : `NextResponse.rewrite` vers une route
  inexistante de la même langue, avec le statut 404, pour servir exactement le corps de
  `global-not-found`. NON appliqué depuis le cloud : la sonde de fumée (« le refus pèse comme
  une route admin inventée ») et la suite 404, non désactivables, ne tournent que sur ton poste.
- [ ] **« Ce que ce compte a fait »** (fiche admin) : la maquette montre des TUILES de totaux par
  type d'événement ; `lire_compte_admin` ne rend que les six derniers couples (type, jour). Une
  migration (nouvelle fonction de comptage) le permettrait — à décider.
- [x] **Menu mobile des pages publiques** — TRANCHÉ par Mehdi le 03/10/2026 : « Créer un compte »
  revient dans le menu ☰, en dernier, en bouton plein sous « Se connecter ». Écrit d'abord dans la
  maquette (13 pages, `base.css`), puis dans le produit (`entete-publique.tsx`, `socle.css`, mêmes
  règles `.menu-mobile__connexion` et `.menu-mobile__inscription`). Mesuré dans la maquette à 360 et
  390 px sur cinq pages : bouton de 52 px de haut, accent avec texte sur accent, mène à
  l'inscription, aucun débordement. Le produit est à remesurer au poste de Mehdi.
- [ ] **(Audit SEO, 03/10/2026) LCP de la landing CHINOISE au bureau ≈ 2,8 s** en local (CPU
  ×4), contre 0,5 à 0,8 s en français et en anglais : l'élément mesuré est la ligne « 整笔订单。 »
  du titre, révélée par l'animation d'entrée. Antérieur à l'audit. À regarder sur les vraies
  Core Web Vitals (Search Console) avant de toucher à l'animation.
- [x] Défaut antérieur à la refonte : le menu « ••• » d'une commande poste l'ancien jeton après une
  révocation — **corrigé le 03/10/2026** (jeton relu en base ; preuve RLS à faire tourner au poste).

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

