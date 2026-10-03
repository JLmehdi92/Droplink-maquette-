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
- Textes légaux anglais : « sole trader » et « by post » (britanniques) — écartés, c'est de la
  terminologie. « French » / « 法国 » devant le registre et la CNIL : gardés (traduction du nom
  de l'institution).
- **Tranchés par la troisième passe (03/10/2026, voir plus bas)** : le « 20 » en dur, l'export
  CSV tronqué en français, le pluriel de `texteNombre`, le « 1er » des dates longues, la 404
  anglaise de `/signalement` non configurée, les textes de la maquette.
- **Tranchés depuis par la passe de finition** (voir plus bas) : « Trois minutes » contre
  « moins d'une minute » (aligné sur « moins d'une minute »), « Pas encore scanné » du guide
  (aligné sur « Préparation »), le vocabulaire des textes légaux chinois (Pro, 停用), « 任何订阅 »
  et les ajouts des mentions.

## Passe de finition (151e2b5 à 0fea2ff)

Contre-vérification de l'audit par deux agents, puis une passe point par point décidée par Mehdi.

| Lot | Commit | Ce qui change |
|---|---|---|
| Langue | `151e2b5` | **15 clés fr, 16 en, 48 zh** : « Dernière ouverture le », « moins d'une minute », « Préparation » dans le guide, un seul terme pour la double authentification par langue, nombres formatés (`{x, number}`), « 他 » neutralisé, tournures anglaises ; un défaut réel corrigé (« NaN suspendus » sur le panneau d'administration) ; 28 déclarations de `ecarts-declares.json` mises à jour |
| Légal | `6ce1100` | **5 feuilles en, 19 zh** : chaque langue dit exactement ce que dit le français ; `DERNIERE_MAJ` au 3 octobre 2026 ; liste à reporter dans le kit au § 8 du journal |
| Blog | `8a376ea` | trois affirmations sans appui retirées (« 300 € par mois », « huit jours », « sept jours / vingt-huit ») |
| SEO | `0fea2ff` | preuve de la carte Twitter/X dans la fumée ; filet `noindex` sur les layouts privés |

**Corrections par catégorie (passe de finition)**, comptées dans les diffs :
- nombres passés en `{x, number}` : 35 clés en chinois, 6 en français, 6 en anglais (dont un
  défaut réel corrigé dans le code : « NaN suspendus ») ;
- terminologie (double authentification, « Préparation », « Dernière ouverture ») : 8 clés en
  français, 4 en anglais, 3 en chinois ;
- durée promise alignée : 1 clé par langue ;
- neutralité (« 他 ») : 6 clés en chinois ; tournures : 5 en anglais, 2 en chinois ; date : 1 en
  chinois ;
- textes légaux : 5 feuilles en anglais, 19 en chinois (additions, omissions, écarts au
  français, terminologie de l'interface) ;
- blog : 6 chaînes dans 3 articles.

**⚠️ Correction de l'audit précédent** : il comptait les balises Twitter/X comme à vérifier ;
elles étaient en réalité déjà servies, DÉRIVÉES de l'Open Graph par Next 16. Rien n'est ajouté
au code ; la fumée en apporte désormais la preuve (27 pages sur 27 mesurées ici).

**Gardes ajoutées** : `tests/unit/nombres-formates.test.ts` (35 clés rendues avec 1248 dans les
trois langues, vue rouge avant correction) ; un test de `seo.test.ts` qui exige le `noindex` de
chaque layout privé ; la garde Twitter/X de la fumée.

**Non touchés, avec leur raison** : « Le blog » en dur (`donnees-structurees.ts`,
`blog/page.tsx`) — le blog est français seul et répond `notFound()` ailleurs ; `PRIX_PRO_EUR`
dans la description de `/tarifs` — la source unique du prix, voulue.

⚠️ **Les textes légaux restent à faire relire par un juriste** avant l'ouverture publique.

## Troisième passe (03/10/2026) — ce que les revues avaient laissé ouvert

| Défaut | Correction | Preuve |
|---|---|---|
| « au moins 20 caractères » écrit dans le texte | `{n, number}`, nourri par `explicationMin` du code | `nombres-formates.test.ts` |
| « 1 orders » possible si le plafond gratuit valait 1 | `{n, plural, …}` en fr/en, `{n, number}` en zh ; la page passe le NOMBRE | idem |
| ligne « Export limité à … lignes » du CSV en français pour tous | clé `commandes.exportTronque`, traduite dans la langue du PROFIL | idem |
| « inscrit le 1 juin » | `getFormateur` / `useFormateur` (`src/lib/format/`) enveloppent le formateur de next-intl et écrivent « 1er » en français ; 34 fichiers basculés ; « 1er » aussi dans la date des articles | `premier-du-mois.test.ts`, dont une garde qui interdit `getFormatter`/`useFormatter` hors de `src/lib/format/` (vue rouge deux fois) |
| `/xx/signalement` sans adresse : 404 générique de Next, en anglais | le middleware réécrit vers un chemin inexistant, avec la langue de l'URL : 404 de la charte | mesuré sur build servi : fr « Cette page n'existe pas », en « This page does not exist », zh « 此页面不存在 », statut 404 |
| textes de la maquette restés à l'ancienne version | 172 remplacements dans 41 fichiers de `design/maquette/src` (e-mail, Ordinateur, Ex. :, 1er, double authentification, espaces insécables…) | inventaire refait : il ne reste que des commentaires de code et « Pas encore scanné » des écrans VENDEUR, qui est le libellé actuel du produit |

**Confirmation par trois agents (même jour)**, puis corrigé :

| Trouvé par | Défaut | Correction | Preuve |
|---|---|---|---|
| audit au navigateur | en-têtes HTTP `Link` de next-intl contredisant le HTML : x-default vers `/` (une 307), versions en/zh du blog qui répondent 404, alternates sur les 404 | `alternateLinks: false` dans `src/i18n/routing.ts` ; les alternates viennent des seules métadonnées | build servi : aucun `Link` d'alternates sur `/fr`, `/en/docs`, `/fr/blog`, 404 ; HTML inchangé |
| revue de code | `/fr/%73ignalement` contournait la réécriture | chemin lu décodé (encodage invalide : pas cette page) | build servi : 404 de la charte |
| revue de code | `dateTimeRange` sans « 1er » (aucun appelant aujourd'hui) | enveloppé aussi | test vu rouge puis vert |
| relecture native | en : point hors des guillemets dans 2 clés (convention US adoptée) | `commandes.vide.accents`, `admin.plan.motifAide` | — |
| relecture native | zh : « 媒体 » dans les conditions, « 浏览 » pour les vues dans la confidentialité | « 照片、视频 », « 查看 » (à reporter dans le kit légal) | — |
| relecture native | zh : `{affichees}` non formaté (comptes, commandes) | `{affichees, number}` | `nombres-formates.test.ts`, vu rouge puis vert |
| relecture native | maquette : 4 recopies manquées | `marque.js` (已发货, October 1–2), `commandes.js`, `client.html` | `node --check` |

**Écartés après vérification** : « du 1 oct. » dans les filtres de période (faux : ces dates
passent par l'enveloppe, mesuré « 1er oct. 2026 ») ; deux espaces « ordinaires » de `marque.js`
(ce sont des fines insécables) ; « Une commande de Atelier Nord » (petit surtitre au-dessus du
nom, sur sa propre ligne : l'élision dépendrait du nom saisi par le vendeur) ; les descriptions
chinoises de 65 à 68 caractères (≈ 130 de largeur visuelle) ; les préférences de style des
relecteurs (apostrophes droites ou courbes, « nommé », « Dispute over »…), laissées à Mehdi.

**Laissés, avec leur raison :**
- la page « lien mort » de `/p` : statut 404, `noindex`, texte présent dans la charge RSC et rendu
  par le navigateur ; le HTML serveur seul a un corps vide (comportement de Next pour un
  `notFound` levé sous une racine sans layout commun ; antérieur à cette mission). Sans
  JavaScript, la page est blanche.
- deux balises `robots` sur les 404 (celle que Next pose seul et la nôtre) : toutes deux
  `noindex`, combinées par les moteurs. La nôtre est gardée exprès : retirer une protection
  écrite pour s'en remettre à un comportement implicite de Next serait L-029.
- le LCP de la landing chinoise au bureau : décision de design, pour Mehdi.

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
