# Relecture des trois langues et audit SEO — bilan (03/10/2026)

Session cloud sur le bac à sable `JLmehdi92/Droplink-maquette-`, consigne
`consignes/prompt-langues-et-seo.md`. Le détail lot par lot est au § 8 de
`consignes/refonte-design.md` ; ce fichier en est la synthèse.

## Ce qui a été fait, en chiffres

| Lot | Commit | Corrections |
|---|---|---|
| Français | `bdd3c07` | 236 chaînes : espace insécable posée (+ 41 dans le blog) · 34 corrections de relecture · 3 affirmations fausses (« gratuit pendant la phase de validation ») · « 1er » dans les fourchettes de dates |
| SEO, lot 1 | `52a60f9` | 124 défauts au premier passage → structure corrigée (plan de site, titres, JSON-LD sur toutes les pages, `og:type=article`) |
| Anglais | `d5d848e` | 188 clés · pluriels réparés aussi dans le code (analyses) |
| Chinois | `90d00f2` | 199 corrections · interlettrage chinois réparé (règle CSS battue par un `!important`) |
| SEO, lot 2 | `2fc1aae` | 35 longueurs de titres et descriptions, trois langues, plus deux gardes |
| Contrôle final | commit de clôture | second passage des trois relecteurs (5 + 16 + 18 retenues, 4 écartées, et 4 pluriels français alignés sur l'anglais), contre-inventaire SEO indépendant (1 écart : `og:locale:alternate` du blog), contrôle du delta (3 défauts, corrigés) |

### Corrections de langue, par catégorie

| Catégorie | Français | Anglais | Chinois |
|---|---|---|---|
| Typographie / ponctuation / espacement | 236 + 41 (insécables), 6 | 30 + 9 | 21 + 2 + 2 |
| Orthographe (dont britannique → américain) | — | 50 + 1 | — |
| Grammaire, accord, conjugaison | 7 + 1 + 1, puis 1 | 12 + 1 | 4 + 3 |
| Cohérence des termes / glossaire | 11, puis 1 | 43 + 1 | 149 + 11 |
| Tournure | 7 + 2 (blog) | 45 | 12 |
| Contresens, omission, affirmation fausse | 3 (gratuité), puis 1 (e-mail client) | 3 + 1, puis 1 | 11 + 1 + 1 |
| Pluriels ICU | 1 + 3, puis 2 | 4 + 2, puis 4 | — |
| Majuscules | 1 | 1 | — |

## Tableau page × langue (production locale, HTML serveur, contre-inventaire indépendant)

Largeur : un idéogramme ou une ponctuation pleine chasse compte 2, le reste 1. Bornes : titre
30–60, description 120–160.

| Page | Langue | Title | Desc. | h1 | lang | canonique | hreflang | OG / Twitter | JSON-LD | Images |
|---|---|---|---|---|---|---|---|---|---|---|
| Landing | fr | 55 | 156 | 1 | fr | ✓ | fr·en·zh-CN·x-default | ✓ | Organization, WebSite, SoftwareApplication | 31 ✓ |
| Landing | en | 48 | 151 | 1 | en | ✓ | ✓ | ✓ | idem | 31 ✓ |
| Landing | zh-CN | 41 | 131 | 1 | zh-CN | ✓ | ✓ | ✓ | idem | 31 ✓ |
| Tarifs | fr / en / zh-CN | 42 / 40 / 36 | 149 / 144 / 126 | 1 | ✓ | ✓ | ✓ | ✓ | WebPage | ✓ |
| Conditions | fr / en / zh-CN | 35 / 50 / 43 | 153 / 125 / 125 | 1 | ✓ | ✓ | ✓ | ✓ | WebPage | ✓ |
| Confidentialité | fr / en / zh-CN | 39 / 47 / 43 | 138 / 127 / 122 | 1 | ✓ | ✓ | ✓ | ✓ | WebPage | ✓ |
| Mentions légales | fr / en / zh-CN | 52 / 45 / 39 | 148 / 137 / 120 | 1 | ✓ | ✓ | ✓ | ✓ | WebPage | ✓ |
| Signalement | fr / en / zh-CN | 30 / 47 / 35 | 149 / 134 / 126 | 1 | ✓ | ✓ | ✓ | ✓ | ContactPage | ✓ |
| Guide (`/docs`) | fr / en / zh-CN | 46 / 38 / 31 | 124 / 129 / 120 | 1 | ✓ | ✓ | ✓ | ✓ | WebPage | ✓ |
| Blog | fr | 50 | 160 | 1 | fr | ✓ | fr·x-default | ✓ (sans autre locale) | CollectionPage | ✓ |
| 5 articles | fr | 49–58 | 148–159 | 1 | fr | ✓ | fr·x-default | ✓ `og:type=article` | Article (+ fil d'Ariane) | ✓ |

Plan de site : **27 URL**, exactement les pages ci-dessus, aucune privée (`/p/`, admin, accès,
espace vendeur). `/signalement` n'y figure que si l'adresse de signalement est configurée.
`robots.txt` : seul `/api/` est fermé. Pages privées : `noindex` ou redirection vers la connexion ;
`/fr/admin` et `/p/<jeton inventé>` rendent 404. `/p` : 279,3 Ko hors médias, `noindex`, aucune
balise Open Graph.

Validateur hors ligne du pack (`hooks/validate-schema.py`, environnement vide) : 0 sur dix pages,
2 sur un contre-test `HowTo` (il inspecte bien). Sonde de l'auteur et contre-inventaire
indépendant : **0 écart** après correction du dernier.

Core Web Vitals en local (Chromium, CPU ×4, médiane de 3) : LCP 0,5–1,0 s et CLS 0,000 sur la
landing et une page légale par langue, au téléphone et au bureau — sauf la landing chinoise au
bureau (≈ 2,8 s, antérieur à l'audit, voir plus bas). Rien n'a été dégradé.

## Les gardes ajoutées (toutes vues rouges avant d'être vertes)

- `seo.test.ts` : chaque page indexable rend un graphe JSON-LD ; titres et descriptions des pages
  trilingues dans les bornes et uniques ; idem pour le blog et chaque article ; aucune page du blog
  n'annonce d'autres locales Open Graph.
- `catalogue-chinois.test.ts` : quatre exceptions nouvelles, chacune avec sa raison.

## Ce qui reste à faire au poste de Mehdi

- **Remesurer** (étape 6 TER de `verification-finale-locale.md`) : `pnpm fumee`, la soustraction
  au kit sur les écrans dont un texte ou une balise a changé, les écrans d'administration en
  chinois, `test:rls`, `couverture`.
- **Reporter dans le design system** les corrections de `legal.*` (listées au § 8, une entrée par
  langue) : 2 en français, 14 en anglais, 1 en chinois, plus les espaces insécables françaises.
- **Après la mise en ligne** : Google Search Console (soumettre le plan de site, inspecter `/fr`,
  `/en`, `/zh-CN` et un article, vérifier les fils d'Ariane), test des résultats enrichis, et les
  VRAIES Core Web Vitals (données de terrain). Rien de cela ne se mesure depuis le cloud.

## Trancher (laissé ouvert, parce que le sens ou le fond légal changerait)

- Le LCP de la landing chinoise au bureau (≈ 2,8 s en local) : la ligne « 整笔订单。 » du titre,
  révélée par l'animation d'entrée.
- « Trois minutes suffisent » contre « moins d'une minute » ; « Pas encore scanné » (guide)
  contre « Préparation » (page client) ; le « 20 » écrit en dur dans
  `blocageVendeur.erreur.saisie` ; la ligne « Export limité à … lignes » du CSV, en français
  quelle que soit la langue.
- Textes légaux anglais : « sole trader » et « by post » (britanniques) — écartés, c'est du fond.
- Textes légaux chinois : 专业版 / 封禁 / 暂停 contre Pro / 停用 dans l'interface ; « 任何订阅 »
  pour « son abonnement éventuel » ; deux ajouts absents du français dans les mentions.
- Les autres dates longues du produit passent par `Intl` sans « 1er » (« inscrit le 1 juin ») :
  seules les fourchettes de livraison le disent.
- `passerPro.features.commandes.texteNombre` reçoit un nombre déjà mis en texte : pas de pluriel
  ICU possible (« 1 orders » si le plafond gratuit était réglé à 1 ; il vaut 5).
- Hors de l'audit, constaté en passant : `/fr/signalement` sans adresse configurée rend la page 404
  anglaise par défaut de Next (prérendue), et la page « lien mort » de `/p` a un corps vide dans le
  HTML serveur (rendue au client) — toutes deux `noindex`.

## Ce qui n'a pas pu se faire d'ici

- Le push vers le bac à sable a d'abord été refusé par le classifieur de permissions de la
  session ; Mehdi l'a autorisé, et les six commits sont partis en avance rapide
  (`d1b5dfc..bbd19f2`, branche `claude/saas-motion-design-video-r3ani3`).
- `parse_html.py` du pack exige BeautifulSoup, absent : rien n'a été installé, sa règle est
  appliquée par une sonde Playwright.
- La sonde du dépôt `verifier-ecran-migre.mjs` exige Postgres en direct (fermé depuis ce
  conteneur) : une variante jetable, par l'API HTTPS de la base de tests, a mesuré les écrans
  vendeur en chinois ; l'administration n'a pas été mesurée.

Aucun « parfait » n'est affirmé ici sans la mesure qui le porte : chaque chiffre de ce fichier vient
d'une exécution de cette session.
