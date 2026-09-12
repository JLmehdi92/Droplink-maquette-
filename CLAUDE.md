# CLAUDE.md

DropLink — une page privée par commande, pour ceux qui vendent en direct sans boutique (DM Snap, Insta, WhatsApp).
Le vendeur upload ses photos/vidéos QC, colle le tracking, envoie **un seul lien brandé à ses couleurs**. Son client consulte tout lui-même, sans compte.

**Statut : phase de validation. Produit gratuit. Aucun code de paiement.**

📖 **Contexte produit complet : @BRIEF-DROPLINK-COMPLET.md** — lis-le avant toute décision produit ou d'architecture. Il contient les 26 décisions verrouillées avec leurs raisons, le modèle de données, les budgets chiffrés et les 32 leçons.

---

## Environnement

**Windows, sans WSL.** Toutes les commandes doivent tourner en PowerShell / cmd natif.

Deux pièges Windows connus, déjà rencontrés sur ce projet :
- `child.kill()` ne tue que le processus `pnpm`, pas le serveur qu'il a lancé. Un serveur du passage précédent reste en écoute, les `next start` suivants échouent **silencieusement** à se lier, et les requêtes atteignent un **build antérieur aux modifications à vérifier**. → port éphémère + arrêt de l'arbre de processus.
- Les chemins : utiliser `path.join`, jamais de séparateur en dur.

---

## Commandes

```
pnpm dev              # serveur de développement
pnpm build            # build de prod — doit passer avant tout commit
pnpm lint             # eslint
pnpm typecheck        # tsc --noEmit — zéro erreur tolérée
pnpm test             # projet unit — REFUSE un test sauté, todo, ou une suite vide
pnpm test:rls         # suites BLOQUANTES d'isolation — jamais désactivables
pnpm test:perf        # mesures (~10 min) — PAS une porte de commit, voir ci-dessous
pnpm db:migrate       # applique les migrations
pnpm db:types         # régénère les types Supabase
pnpm fumee            # le produit doit RÉPONDRE : serveur réel, statuts et HTML servi
pnpm falsifier        # casse le produit EN BASE, de façon réversible, pour éprouver les sondes
pnpm gates            # les six portes ci-dessus, sur la BASE DE TESTS (voir plus bas)
pnpm check:r2         # dépôt R2 de bout en bout — exige les variables R2_*
```

> ⚠️ **`pnpm test:perf` N'EST PAS DANS LES PORTES, ET IL EST RESTÉ ROUGE PLUSIEURS
> JOURS.** Dix minutes, donc hors de la boucle de commit ; « avant chaque clôture
> de phase » a voulu dire « rarement », et quand il a enfin tourné il ne pouvait
> plus dire quelle modification l'avait cassé. Ce qui l'avait cassé : la
> migration 113 change l'arité de `lister_boutiques_admin`, et la mesure appelait
> encore l'ancienne signature.
>
> La moitié bon marché est donc passée dans les portes :
> `tests/rls/mesures-a-jour.test.ts` vérifie en quelques millisecondes que chaque
> `public.<fonction>(…)` du banc résout encore, **nom ET arité**. Le reste — les
> temps, les plans, les lignes lues — reste dans `test:perf`, **à relancer à
> chaque reprise de séance**, pas seulement en fin de phase.

> ⚠️ **UN TEST SAUTÉ N'EST PAS UN TEST QUI PASSE.** Une exécution a rendu
> `589 passed | 22 skipped` là où les 611 passent — aucun échec, statut 0, porte
> verte, et vingt-deux contrôles qui n'avaient pas tourné. Vitest ne sait pas
> échouer sur un saut ; `scripts/suite.mjs` lit son rapport JSON et refuse
> **saut, todo, et suite vide** (un ensemble vide passe tout). Le projet `r2` en
> est exclu : son `describe.runIf` est délibéré, il ne peut pas tourner sans
> identifiants Cloudflare.
>
> ⚠️ **LES SUITES TOURNENT SUR UN SECOND PROJET SUPABASE — `droplink-tests`,
> créé le 06/09/2026.** Elles ont tourné sur la PRODUCTION jusque-là, et ce
> n'était pas un accident ponctuel : c'était l'architecture. Le 05/09, un test
> portait un `delete from public.tracked_parcels where registered_at >= now() -
> interval '30 days'` — chaque `pnpm gates` effaçait les colis réellement pris
> en charge du mois, dont ceux d'un vrai client, et chacun coûte 1 des **200
> prises en charge À VIE** du fournisseur de suivi.
>
> La configuration vit dans **`.env.test.local`** (ignoré par git, comme tout
> `.env*`). Elle ne suffit pas et ne prétend pas suffire : `pnpm gates` passe
> par `scripts/portes.mjs`, qui **REFUSE de démarrer** si le fichier manque ou
> si la cible est la production — et `tests/aide/base-de-tests.ts` exige, avant
> la première purge, que la base **se déclare elle-même** base de tests par un
> commentaire posé dessus. Une marque en base ne se recopie pas par accident
> dans un `.env`.
>
> ⚠️ **LE BUILD FAIT PARTIE DES PORTES, ET C'EST POURQUOI ELLES PARTAGENT UN
> SEUL ENVIRONNEMENT.** Les variables `NEXT_PUBLIC_*` sont **inlinées dans le
> bundle** : un build fait sur `.env.local` puis une fumée lancée contre la base
> de tests servirait de VRAIES données à 293 contrôles convaincus de mesurer une
> base jetable — et tout serait vert (L-032).
>
> ⚠️ **CE QUE LA SÉPARATION A COÛTÉ, ET CE QUI LE COMBLE DEPUIS LE 10/09/2026.**
> Le jour où les suites ont cessé de viser la production, plus aucun contrôle
> n'a regardé la base qui sert les clients : ordre des migrations, catalogue des
> fonctions, droits d'exécution étaient éprouvés sur une base jetable, et rien
> ne disait que la production lui ressemblait encore.
>
> **`pnpm verif:prod` répond à cette question, et à elle seule.** Il ne
> re-déclare AUCUNE règle : il compare la PRODUCTION à la BASE DE TESTS,
> catalogue contre catalogue — tables et RLS, fonctions avec leur arité et leur
> `security definer`, droits d'exécution ouverts, droits de table de `anon`,
> colonnes écrivables, policies, valeurs d'énumération, index, déclencheurs — et
> il y ajoute l'accord entre les migrations du DÉPÔT et celles réellement
> appliquées, dans les deux sens et dans l'ordre. Recopier les règles ici aurait
> créé une seconde source de vérité, qui aurait divergé au premier oubli ; une
> comparaison n'a rien à oublier.
>
> ⚠️ **IL N'EST PAS DANS LES PORTES, ET C'EST DÉLIBÉRÉ** : les six portes
> partagent un environnement, et c'est la base de TESTS. Celui-ci vise la
> production — il se lance à part, à chaque reprise de séance et avant tout
> déploiement.
>
> ⚠️ **SA LECTURE SEULE EST GARANTIE PAR POSTGRES, PAS PAR SA DISCIPLINE
> D'ÉCRITURE.** Tout se passe dans une transaction `READ ONLY`, et la garantie
> est ÉPROUVÉE au démarrage : le script tente une écriture triviale et s'arrête
> si elle PASSE. Une protection qu'on n'a pas vue refuser n'est pas une
> protection.

> ⚠️ **NE JAMAIS LANCER UNE PORTE DANS UN TUYAU.** `pnpm test:rls | grep …` rend
> le statut de `grep`, pas celui de la suite : l'enchaînement `&&` continue sur
> du rouge. Lancer `pnpm gates`, et **relever le décompte**, pas la couleur.

Après toute modif de schéma : `pnpm db:migrate && pnpm db:types`, sinon les types sont périmés.

**Portes de qualité avant chaque commit** — les six, dans cet ordre, sous un
seul environnement :
```
pnpm typecheck · pnpm lint · pnpm build · pnpm test · pnpm test:rls · pnpm fumee
```
**Ne pas les enchaîner à la main : `scripts/portes.mjs` les lance, et c'est lui
qui garantit qu'elles visent toutes la même base.**

**Ne jamais commiter par-dessus des portes rouges**, même si la cause est ailleurs — c'est comme ça qu'on s'habitue au rouge.

---

## Stack

Next.js 15 App Router · React 19 · TypeScript strict (`noUncheckedIndexedAccess`) · Tailwind v4 · shadcn/ui · dnd-kit · **Supabase** (Postgres + Auth + RLS) · **Cloudflare R2** (médias, bucket privé) · Resend + React Email · PostHog (EU) · Sentry · next-intl (FR + EN) · Zod · 17TRACK (suivi).

**Absent volontairement :** toute librairie de paiement, Three.js, WebGL, tout transcodeur vidéo.

---

## Assets design

> ⚠️ **LE CANEVAS DES 47 PLANCHES N'EST PLUS LA RÉFÉRENCE — décision de Wassim,
> 11/09/2026.** Ce fichier a longtemps dit « la source du design est le canevas
> Claude Design, en cas de désaccord c'est la planche qui gagne ». **Cette phrase
> est morte.** Si un commentaire du code cite encore une planche, il parle d'une
> décision PASSÉE, jamais d'une référence à consulter. Le dossier
> `C:/Users/mehdi/Desktop/canevas-droplink/` est un historique, pas une source.

**La source du design est le design system DropLink**, construit écran par écran
et validé : **10 écrans, chacun en bureau et en téléphone, en trois langues.**

Il se consulte comme du code, pas comme une image :

```
styles.css              point d'entrée, @import uniquement
tokens/                 colors typography spacing radius elevation motion fonts base
components/core/        Avatar Badge Button Card Checkbox Eyebrow Icon IconButton
                        IconTile Input Logo
components/app/         FilterTabs MetricTile OrderRow Pagination ProgressTracker
                        ShareLinkField SidebarItem StatCard TrackingTimeline UnderlineTabs
components/marketing/   FeatureCard FloatingChip SectionHeading StepCard TestimonialCard
ui_kits/                marketing_site auth seller_app client_link admin docs legal
guidelines/             fondations visuelles, règles de contenu, SEO, lexique
mobile.html             les 10 écrans en cadre téléphone, bascule fr/en/zh
readme.md               le guide complet
```

> ⚠️ **CE SONT DE VRAIES PAGES HTML, PAS DES MAQUETTES.** Elles portent toutes les
> valeurs en clair et se mesurent dans un navigateur. On ne compare donc pas une
> impression, on compare des nombres. `mobile.html` rend les dix écrans côte à
> côte à 390 px : c'est là qu'on vérifie le téléphone, pas en redimensionnant une
> fenêtre.

> **RÈGLE DE CONFORMITÉ.** Chaque écran doit correspondre à sa page de référence
> **au pixel près**. On ne passe pas à l'écran suivant tant que celui en cours
> n'est pas exactement conforme. Cela vaut pour **tous** les écrans, landing et
> admin comprises. En cas de désaccord entre ce fichier et le design system,
> **c'est le design system qui gagne** — et on corrige ce fichier dans le même
> commit, pour qu'il n'y ait jamais deux sources.

> ⚠️ **LE DESIGN SYSTEM EST MODIFIABLE, ET DANS CET ORDRE.** Quand un écran a
> besoin de ce que le design system ne porte pas, **on l'écrit d'abord dedans**,
> puis on implémente. Implémenter d'abord ferait du code la référence,
> c'est-à-dire plus de référence du tout. Et on écrit dans son VOCABULAIRE :
> avant d'ajouter un motif, chercher lequel des 26 composants le porte déjà.

### Les valeurs font foi, pas la prose

```
accent primaire        #5B4BF5     survol            #4B3AE0
DÉGRADÉ DE MARQUE      violet #6C5CFB → magenta #A855E0 → corail #FB7C7F
                       (TROIS arrêts, pas deux)
                       ⚠️ SES DEUX EXTRÉMITÉS NE SONT PAS L'ACCENT. Le violet
                       du dégradé est plus clair que #5B4BF5, et son corail plus
                       clair que le corail de l'ancien canevas. Relevé dans
                       `tokens/colors.css` (`--gradient-brand`), qui fait foi.

fond de page           #FBFBFE     carte             #FFFFFF
teinte violette        #F1F0FE     creux             #F6F6FA
encre                  #0B0B18     corps             #6B6F8C
sourdine               #8B90A8     estompé           #A9AEC4
filet                  #ECECF5     filet appuyé      #DEDEEA

succès #12A87A · erreur #EF4B57 · avertissement #E08A18 · info #4F46E5

rayons    xs 6 · sm 10 · md 12 · lg 14 · xl 18 · 2xl 24 · 3xl 32 · pilule 9999
          carte 16 · carte-lg 20 · contrôle 12 · BOUTON 9999 · fenêtre 18

ombres    TOUJOURS teintées violet, jamais noir neutre
          xs     0 1px 2px rgba(28,22,78,.05)
          carte  0 4px 16px rgba(28,22,78,.06)
          md     0 10px 26px rgba(28,22,78,.08)
          lg     0 20px 48px rgba(28,22,78,.10)
          marque 0 10px 26px rgba(91,75,245,.30)
          focus  0 0 0 3px rgba(91,75,245,.22)

mouvement ease standard cubic-bezier(.4,0,.2,1) · out cubic-bezier(.16,1,.3,1)
          instant 90ms · rapide 160ms · normal 240ms · lent 420ms
          survol carte translateY(-2px) · appui scale(.98)
```

> ⚠️ **SIX VALEURS CHANGENT PAR RAPPORT À L'ANCIEN CANEVAS.** Ce ne sont pas des
> arrondis, et un écran à moitié migré se voit :
>
> | | Ancien canevas | Design system |
> |---|---|---|
> | Accent | `#7c5cf5` | **`#5B4BF5`** |
> | Dégradé | `97deg`, 2 arrêts, `#7c5cf5 → #f2765e` | **3 arrêts, `#6C5CFB → #A855E0 → #FB7C7F`** |
> | Rayon carte-page | 28 public / 24 authentifié | **16-20, sans distinction** |
> | Chrome admin | sombre `#111117` | **clair, comme le reste** |
> | Cadre extérieur | carte blanche sur `#c5cbfb` | **aucun cadre** |
> | Polices | Plus Jakarta Sans + Inter | **Inter seule** |
>
> **La migration se fait écran par écran, jamais par un chercher-remplacer sur les
> tokens.** Les deux systèmes ne partagent aucune valeur d'accent : un remplacement
> global laisserait des écrans conformes à un dégradé qui n'existe plus, et rien ne
> le dirait.

### Typographie

**Inter seule**, servie par `next/font/google`. **Plus Jakarta Sans est retirée.**
Jamais de `<link>` vers un CDN de polices.

```
hero        64px / 800 / interligne 0.98 / tracking -0.045em
section     44px / 800 / tracking -0.045em
h2          30px / 800        h3 22px / 700        titre carte 18px / 700
corps       16px / 400 / interligne 1.55
petit       14px    légende 13px    micro 11px
eyebrow     11px / 800 / majuscules / tracking 0.12em
```

**En `zh-CN`, ajouter `Noto Sans SC, PingFang SC, Microsoft YaHei` ET forcer
`letter-spacing: 0`.** Le tracking négatif de l'anglais colle les idéogrammes —
constaté sur les dix écrans, corrigé par une règle unique
`html[lang^="zh"] *{letter-spacing:0}`.

### Les cinq règles qui survivent à tout changement de design

Les quatre premières sont **inchangées** : elles sont architecturales, pas
esthétiques, et le nouveau design ne les touche pas.

1. **La couleur d'accent est une VARIABLE pilotée par le vendeur**, jamais en dur.
   Contraste obtenu **automatiquement** par `resoudreAccent()` : 4,5:1 sur le
   texte, 3:1 sur l'interface. Sur un aplat d'accent, le texte prend
   `surRemplissage`, **jamais `#ffffff` en dur**. `#5B4BF5` n'est que le DÉFAUT.
2. **Pas de glassmorphism ni `backdrop-blur` sur `/p/[token]`.** Sur un aplat uni
   le flou n'a rien à flouter, et c'est ce qui rame le plus sur mobile bas de
   gamme. *(Le design system emploie `backdrop-filter` sur l'en-tête de la landing
   et sur le badge du hero — c'est autorisé là, jamais sur la page client.)*
3. **Le dégradé est réservé à UNE SEULE action principale par écran**, et
   uniquement sur les surfaces DropLink. Il **n'apparaît jamais** sur
   `/p/[token]` : cette page porte la couleur DU VENDEUR, pas la nôtre.
4. **Toute animation respecte `prefers-reduced-motion`** et ne porte jamais
   d'information.
5. **Cible tactile 44 px minimum, police 11,5 px minimum sur téléphone** —
   nouveauté du 11/09/2026. Les liens **en ligne dans la prose** restent à leur
   hauteur de texte : les agrandir casserait l'interligne du paragraphe.

### Iconographie

**Lucide**, trait 1,8-1,9. Aucune icône dessinée à la main, **aucun emoji dans
l'interface**. Les logos de marques tierces (Google, Instagram, TikTok, WhatsApp,
transporteurs) viennent de leurs SVG officiels — jamais reconstitués de mémoire.

> ⚠️ **L'ANCIEN CODE EMPLOIE DES NOMS D'ICÔNES `material-symbols`**
> (`inventory_2`, `local_shipping`, `monitoring`, `palette` dans
> `(app)/layout.tsx`). Le design system est en Lucide. La correspondance se fait
> à la migration de chaque écran, pas en bloc : `inventory_2 → package`,
> `local_shipping → truck`, `monitoring → bar-chart-3`, `palette → palette`.

### Réseaux sociaux du vendeur

**Instagram, TikTok, WhatsApp — et ces trois-là seulement** (Snapchat et Telegram
écartés par Wassim). Facultatifs, stockés sur `shops`, rendus sur la page client
**uniquement s'ils sont configurés.** Aucun bloc, aucun logo grisé quand il n'y en
a pas.

> ⚠️ **LE DESIGN SYSTEM DESSINE UN QUATRIÈME CHAMP « site web ».** Il n'est pas
> dans `shops` et **n'est pas une autorisation** : soit on l'ajoute par une
> migration et une décision produit, soit on retire le champ du design system.
> Ne pas l'implémenter en silence au motif qu'il est dessiné.

### Périmètre — ce que le design system couvre, et ce qu'il ne couvre pas

**Couvert, à migrer** : landing · connexion · inscription · commandes · détail et
éditeur de commande · envois · analyses · marque · `/p/[token]` · conditions ·
confidentialité · les deux pages d'erreur de lien (expiré, introuvable).

**Écrans du dépôt que le design system ne dessine pas** — ils gardent leur
habillage actuel jusqu'à ce qu'ils soient dessinés, et on le dit plutôt que
d'improviser : `/bienvenue` (onboarding) · `/blog` et `/blog/[slug]` ·
`/signalement` · `/mot-de-passe-oublie` · `/nouveau-mot-de-passe` · l'arbitrage QC
de la page client.

**Écrans dessinés que le dépôt n'a pas** : une page d'accueil de dashboard, un
écran de paramètres vendeur, `/docs`. Ce sont des routes à créer, donc des
décisions produit — pas de la migration.

> ⚠️ **L'ADMIN : SIX ÉCRANS EN CODE, DIX DESSINÉS.** Les six existants
> (`/admin`, `boutiques`, `comptes`, `comptes/[id]`, `journal`, `parametres`,
> `surveillance`) se migrent. Des quatre autres, **trois sont de la phase 2 et ne
> doivent PAS être implémentés** (voir ci-dessous) ; seul « Statistiques » est un
> écran de phase 1 à arbitrer, sachant que `surveillance` en couvre déjà une
> partie.

> ⚠️ **LE DESIGN SYSTEM CONTIENT DES ÉCRANS DE FACTURATION, ET LA CONTRAINTE N°1
> LES INTERDIT.** Admin → Paiements (390 paiements, 12 358 €), Admin →
> Abonnements (386 abonnements), un plan Pro à 19,90 €/mois, les CTA « Passez au
> Pro », et le tableau tarifaire de `/docs`. **Aucune ligne de code.** Ces
> planches sont conservées pour la phase 2, exactement comme l'étaient les
> anciennes maquettes de facturation. La barre latérale continue d'annoncer la
> gratuité de la phase de validation.

### Multilingue

Le design system fournit les trois langues complètes. **Les traductions se
reprennent, elles ne se refont pas.** Elles vivent dans `messages/fr.json`,
`en.json`, `zh-CN.json` — **`zh-CN`, jamais `zh-Hans`** : le filtre du middleware
n'accepte qu'un sous-tag de deux lettres, et `zh-Hans` ferait disparaître le 404
de l'admin sans un seul signal.

Ne se traduisent pas : marques et transporteurs, noms de personnes, références
(`#DLK7842`), endpoints. Se traduisent **par règle** et non entrée par entrée :
les dates, les heures, et les chaînes composées du type « 30 % du total »,
« Affichage de 1 à 10 sur 1 248 commandes ».

### ⚠️ LA MÉTHODE DU PIXEL PRÈS — ON SERT LE KIT, ON NE LE LIT PAS

> **Établie le 12/09/2026, après avoir migré quatre écrans à l'envers.**
> Les quatre premières migrations ont LU les valeurs dans le source du kit
> (`height: 48`, `gap: 14`, `--radius-card`) et les ont transposées à la main.
> Le résultat passait toutes les portes, ne débordait nulle part, et ne
> ressemblait PAS à la référence : il manquait une barre supérieure entière,
> quatre colonnes de tableau, les compteurs d'onglets et le pied de page.
> Wassim l'a vu en une phrase : « y'a rien qui est parfait sur toutes les pages ».

**Lire le source d'un kit ne dit pas ce que le navigateur rend.** Il est en
`border-box` ici et en `content-box` ailleurs, ses `padding` s'ajoutent, ses
`gap` se replient, la moitié de ses valeurs vient de variables résolues à
l'exécution — et surtout, **lire un composant ne montre pas ce qui manque
autour de lui.**

#### Les quatre gestes, dans cet ordre

```
1.  npx --yes http-server -p 8123 -s .      # dans .claude/skills/droplink-design/
    chrome --remote-debugging-port=9223 --headless=new

2.  CLIC_KIT="Suivi d'envois" node scripts/comparer-au-kit.mjs       "http://127.0.0.1:8123/ui_kits/seller_app/index.html" 1690       kit-envois.json KIT-envois-1690.png

3.  node scripts/build-contre-tests.mjs && node scripts/servir-contre-tests.mjs
    MSYS_NO_PATHCONV=1 node scripts/verifier-ecran-migre.mjs       http://localhost:<port> "/fr/envois" 1690,390 <dossier de captures>

4.  Comparer les DEUX captures côte à côte, et les deux inventaires par
    soustraction. L'écart se lit, il ne se devine pas.
```

`comparer-au-kit.mjs` rend, pour chaque élément RÉELLEMENT RENDU : boîte,
position, police, graisse, interlettrage, interligne, couleur, fond, image de
fond, rayon, filet, ombre, marge, écart. **C'est un inventaire, pas une
sélection** : la comparaison trie, pas la sonde.

#### ⚠️ LES CINQ PIÈGES, TOUS PAYÉS UNE FOIS

1. **LE KIT EST DESSINÉ À 1690 px, PAS 1440.** C'est écrit dans l'en-tête de
   chacune de ses pages : `viewport="1690x1010"`. Mesurer le produit à 1440 et
   le comparer à des valeurs relevées à 1690 compare deux choses différentes,
   et l'écart se lit comme une erreur d'implémentation alors que c'est une
   erreur de protocole.
2. **LE KIT EST UNE APPLICATION À ÉTAT, PAS SIX PAGES.** Ses six écrans vendeur
   vivent dans un seul document et se choisissent par un `setView` de React :
   aucune URL ne les distingue. Sans `CLIC_KIT`, toutes les comparaisons
   porteraient sur le même écran — celui par défaut.
3. **LE MÊME COMPOSANT N'EST PAS LE MÊME PARTOUT.** Le kit pose
   `ProgressTracker` avec ses libellés sur Commandes et `MiniProgress` SANS
   libellé sur Envois. Posée aux deux endroits, la première faisait chevaucher
   nos libellés : « Pas encore scannéExpédié ».
4. **UNE CLASSE SERVIE N'EST PAS UNE CLASSE QUI GAGNE.** `.champ-app`,
   `.champ-editeur` et `.champ-liste` sont déclarées HORS de toute `@layer` dans
   `globals.css` ; Tailwind range ses utilitaires dans `@layer utilities`, et
   **une règle sans couche l'emporte sur une règle en couche.** Elles écrasaient
   le fond, le filet et la taille du design system en silence : les classes
   existent, sont servies, et les deux gardes qui les surveillent restent vertes
   — elles vérifient qu'une classe existe et pointe sur une variable définie,
   jamais qui GAGNE la cascade.
5. **DEUX PALIERS DE FAMILLES DIFFÉRENTES NE SE TRIENT PAS.**
   `md:grid-cols-2 min-[1424px]:grid-cols-4` rendait DEUX colonnes à 1440 px :
   mesuré dans la feuille servie, Tailwind émet le bloc `min-width:1424px` à
   l'octet 71 505 et un bloc `min-width:48rem` à l'octet 71 763 — le palier le
   plus LARGE arrive en PREMIER et le plus étroit l'écrase. Deux paliers de la
   **même** famille se trient par leur valeur.

#### ⚠️ ET CE QUE LA MÉTHODE NE DISPENSE PAS DE DÉCIDER

Un écart au kit n'est pas toujours un défaut. **Trois familles, et elles se
disent dans le commit à chaque fois :**

| L'écart | Ce qu'on fait |
|---|---|
| Le kit contredit une **contrainte verrouillée** — « Passez au Pro », pagination numérotée | **Le produit gagne**, et on écrit pourquoi |
| Le kit montre une donnée **que la base n'a pas** — badges « +12 % », drapeau de pays, nom de transporteur | **On n'affiche rien.** Un repli sur chaque ligne (« Transporteur inconnu ») vaut moins que rien |
| Le kit dessine un écran **que le dépôt n'a pas** — Tableau de bord, Paramètres | Une entrée de navigation qui mène à un 404 est pire qu'une entrée absente |

> *Le numéro de commande du kit, `#DLK7842`, illustre la troisième voie : la
> référence courte est DÉRIVÉE de l'identifiant plutôt que stockée. Un numéro
> séquentiel se lirait mieux, mais il exigerait une colonne, un compteur par
> boutique, une reprise de l'existant et une migration en attente de
> déploiement — pour une référence qu'on copie plus qu'on ne récite.*

### Comment on vérifie un écran migré

Dans cet ordre, et on ne passe pas au suivant avant que les cinq passent :

1. **Bureau, À 1690 px** — comparer à la page de référence SERVIE, valeur par
   valeur, par la méthode ci-dessus. Pas une impression : deux inventaires et
   une soustraction. **Et regarder les deux captures côte à côte** : les
   nombres établissent qu'un écran ne déborde pas, ils ne disent rien de ce qui
   MANQUE autour.
2. **Téléphone à 390 px** — `scrollWidth === clientWidth`, aucun texte tronqué,
   aucune cible sous 44 px, aucune police sous 11,5 px.
3. **Les trois langues** — le chinois allonge les libellés courts et raccourcit
   les longs ; c'est là que les colonnes de tableau cassent.
4. **`prefers-reduced-motion`** activé : rien ne disparaît, rien ne devient
   illisible.
5. **Les six portes** — `pnpm gates`, et on relève le décompte, pas la couleur.

> ⚠️ **NE JAMAIS VÉRIFIER UN ÉCRAN À LA LARGEUR DE SA FENÊTRE.** À 900 px, les
> paliers 760 et 640 ne se déclenchent pas : cinq débordements s'y étaient cachés,
> jusqu'à 287 px sur l'espace vendeur, tous invisibles jusqu'à la mesure à 390.
> L'outil est `mobile.html`.

---

## Quatre surfaces, quatre logiques

**1. `/[locale]/(app)/*` — authentifié, RLS.** Client serveur **avec** session, jamais service-role. Le dashboard est l'écran le plus utilisé : un fournisseur à 200 commandes/semaine y passe sa journée.

**2. `/p/[token]` — jamais authentifié.** Hors du segment `[locale]` (la langue est celle du vendeur, pas de l'URL). Racine de mise en page distincte — c'est le budget, pas l'organisation. Lecture par jeton via **fonctions `security definer`** — `lire_commande_publique`, `lire_medias_publics`, `lire_suivi_public`, `lire_passages_publics`. ⚠️ **Le dépôt ne contient AUCUNE VUE, et c'est délibéré** : une vue SE PARCOURT, une fonction EXIGE le jeton. `noindex`.

**3. `/[locale]/admin/*` — rôle vérifié EN BASE, à chaque requête.** Segment RÉEL, jamais un groupe entre parenthèses : un groupe n'ajoute rien à l'URL, les écrans tomberaient hors du filtre du middleware.

**4. `/api/*` — machine.** Exclue du middleware, donc **chaque route porte sa propre garde**.

**Cinq clients Supabase, physiquement séparés.** Importer le mauvais doit casser le build plutôt que de fuiter silencieusement :

| Fichier | Rôle |
|---|---|
| `lib/supabase/client.ts` | Navigateur, clé publiable |
| `lib/supabase/server.ts` | Serveur **avec session**, RLS active. **Défaut** |
| `lib/supabase/admin.ts` | Service-role, `server-only`. **Jamais hors `lib/audit/`** |
| `lib/supabase/anon.ts` | Serveur **SANS session** — page publique uniquement |
| `lib/supabase/system.ts` | Service-role pour les chemins **sans humain** (webhooks, tâches) |

`anon.ts` existe parce que `server.ts` lit les cookies : sinon le rendu de la page publique dépendrait de la présence d'un cookie, et **un vendeur connecté verrait sa page autrement que son client**, sans que personne s'en aperçoive avant que ça compte.

`system.ts` est distinct de `admin.ts` parce que le client admin impose un audit — un **humain** y lit les données d'un tiers. **Un webhook n'est personne** ; l'auditer noierait les vraies consultations humaines.

---

## Contraintes produit à ne jamais violer

1. **Aucun traitement de paiement.** Ni les commandes (définitif), ni un abonnement (phase 1). Pas de Stripe, pas de table `subscriptions`. Les maquettes de facturation existent et sont conservées pour la phase 2, mais **aucun code**.

2. **Positionnement générique et neutre.** Zéro « rep », « replica », « batch », « W2C », zéro marque de luxe, zéro nom d'agent chinois dans l'UI, la copy, les CGU ou les métadonnées. *Exception bornée : les noms d'agents sont autorisés dans les identifiants de parsers et la config technique interne, jamais dans une chaîne traduite, la landing, un message d'erreur ou les métadonnées.*

3. **Chacun est propriétaire de ses commandes et de ses destinataires.** Aucun transfert de lien entre comptes.

4. **Trois niveaux d'accès, jamais confondus.** Celui qui **crée** a un compte obligatoire. Celui qui **consulte** le lien n'en a **jamais** — le champ destinataire est un texte libre, pas un compte ni une recherche d'utilisateur. L'**admin** est une surface serveur séparée, auditée.

5. **Le `public_token` est immuable à vie.** Aucune édition ne le régénère. Seule l'action explicite « révoquer et régénérer » le change, et elle écrit un événement. **Test de non-régression obligatoire**, étendu à chaque nouvelle mutation.

6. **La clé service-role ne quitte jamais le serveur.** Rôle admin vérifié en base à chaque requête, jamais un claim JWT. Défense en profondeur : middleware **ET** garde dans chaque Server Action. Tout accès admin à des données tierces écrit un audit, **consultations comprises**.

7. **L'instrumentation d'usage est une feature du MVP, pas un extra.** Un compteur branché après coup démarre vide, donc inexploitable au moment précis où il faut décider.

8. **L'interface n'affirme jamais ce que la base n'a pas enregistré.** Un retour optimiste est un pari sur le serveur ; pari perdu → retour à l'état confirmé, **et on le dit**.

---

## Règles de sécurité

- **RLS activée sur toutes les tables dès la première migration**, jamais en rattrapage. Supabase accorde SELECT/INSERT/UPDATE/DELETE à `anon` par défaut : **une table créée sans RLS est grande ouverte, et le fichier de migration ne le dira pas.**
- **Postgres accorde `EXECUTE` à `PUBLIC` par défaut.** Révoquer explicitement, + `alter default privileges` pour que l'objet suivant naisse fermé. Un droit d'exécution **ne s'écrit pas dans le corps d'une fonction** — aucun contrôle textuel ne peut le voir, il faut **interroger le catalogue**.
- Ce qui empêche un vendeur de se promouvoir admin doit être un **privilège de COLONNE**, pas une policy (une policy sur `profiles` qui lit `profiles` = récursion infinie).
- **Contrôle par VALEUR, pas par nom.** Une valeur voyage sous n'importe quel nom : un champ sensible republié sous `meta`, `debug`, `commentaire` ou `diagnostic` survit à un contrôle textuel. Injecter des sentinelles uniques et les chercher dans les réponses **et dans le HTML rendu**, charges d'hydratation comprises. **Le `public_token` est la sentinelle prioritaire** : les autres exposent une donnée, celle-là transfère une **capacité**, définitivement.
- **Bucket R2 privé sans exception.** URL signées à expiration. **Clé d'objet générée par le SERVEUR** — une clé fournie par le client permettrait d'écraser le média d'un autre vendeur. **Taille relue côté serveur**, jamais crue depuis le client : c'est la base du modèle de coût.
- **Rate limiting à deux seuils, EN BASE** (pas en mémoire : les instances se multiplient précisément sous la charge à limiter). Compteurs **distincts** entre page publique et admin. **En cas de panne du compteur : la page publique AUTORISE** (refuser pénaliserait les clients d'un vendeur pour un incident qui ne les concerne pas), **l'admin REFUSE** (ça ne pénalise que nous).
- **SVG assainis avant stockage.**

---

## Performance

**Page publique** — vue en 4G sur mobile d'entrée de gamme, depuis un DM :
- **LCP < 2 s**, **page < 300 Ko hors médias**, **< 1 Mo à 20 médias**, **décalage cumulé < 0,1**
- Socle Next/React incompressible ≈ 102 Ko. Il reste ~198 Ko. Une bibliothèque de carrousel consommerait la moitié de la marge à elle seule → écrire le visionneur à la main (~1 Ko).
- Vignettes 200×200 en grille (**deux colonnes sur mobile**), photo pleine **uniquement** au plein écran et **pas dans le document tant que le visionneur est fermé** (un `<img>` masqué serait tout de même téléchargé). Vidéos en `preload="none"` avec poster.
- **Sur mobile, la galerie vient AVANT les détails d'expédition** — c'est ce que le client vient voir.

**Dashboard** — doit tenir à 800 commandes/mois, rester correct à 9 600 :
- Pagination **par curseur**, jamais par décalage (à la page 40 d'un jeu de 9 600, un `offset` lit 2 000 lignes pour en rendre 50 : le coût croît avec le numéro de page).
- Index sur `(shop_id, created_at)`, `(shop_id, status)`, **et sur le tri par défaut** (facile à oublier, invisible à faible volumétrie).
- Recherche **insensible aux accents** — index d'EXPRESSION avec `unaccent`. « creme » doit trouver « Crème », c'est le cas majoritaire.

### ⚠️ LA RÉGION DU SERVICE RAILWAY EST UNE PROPRIÉTÉ DE PERFORMANCE

Mesuré le 07/09/2026, sur le produit servi. Le service tournait en **US West**
(la région PAR DÉFAUT de Railway) pendant que la base Supabase est en
**eu-west-3, Paris**. Chaque appel du serveur vers sa base faisait donc un
aller-retour transatlantique — **~150 ms au lieu de ~10**.

|  | US West | EU West |
|---|---|---|
| Landing (statique, aucun appel) | ~190 ms | **25 ms** |
| Page client | — | 182 ms |
| Panneau admin | 2 216 ms | **540 ms** |
| Les six écrans admin | 9 378 ms | **2 472 ms** |

⚠️ **CE DÉFAUT EST INVISIBLE DEPUIS UNE MACHINE DE DÉVELOPPEMENT** : en local,
la latence vers Supabase est de ~15 ms, et toutes les sondes du dépôt tournent
en local. Aucune porte ne pouvait le voir. Il a été signalé par Wassim, qui a
trouvé le panneau admin lent — l'écran le plus lourd, donc celui où un surcoût
réparti sur tout le produit devient perceptible.

⚠️ **LA BASE N'Y ÉTAIT POUR RIEN** : les douze fonctions SQL de l'admin
répondent en **4 à 11 ms**, mesurées en production. Un seuil de temps de page
qui aurait conclu « il manque un index » aurait dégradé le produit en croyant
l'améliorer (L-017).

**Tout service créé pour ce produit doit être en `EU West`**, région à régler
dans `Settings → Regions`. Le changement est sans interruption tant qu'aucun
volume n'est attaché — ce qui est notre cas, les médias vivant chez R2.

**Protocole de mesure :** mesurer le **PLAN**, pas le chronomètre. Seuils fixés **AVANT**. Rodage jeté, puis **deux séries concordantes**. Toute mesure **porte une assertion sur le jeu qu'elle décrit**. Mesurer ce que l'écran appelle réellement, **au plafond**, avec un **compte voisin** dans le jeu.

---

## Code style

- TypeScript strict, **pas de `any`**, pas de `@ts-ignore` sans justification.
- **Server Components par défaut** ; `"use client"` seulement si état ou handlers.
- **Server Actions pour les mutations.** Les Server Actions ont une **limite de corps de 1 Mo** : ne jamais y faire transiter un fichier. Route handlers réservés aux webhooks — *déviation documentée : l'export CSV en est un, parce qu'un téléchargement exige `Content-Disposition`. Lecture **sous RLS avec la session**, jamais service-role.*
- **Zod sur toute entrée externe**, y compris ce qui « vient de notre formulaire ».
- Fichiers `kebab-case`, composants `PascalCase`, fonctions `camelCase`.
- **Jamais de `catch` vide.** `no-floating-promises`, `no-misused-promises`, `await-thenable` actifs.
- **Aucune chaîne visible en dur** — tout par `next-intl`, FR et EN, parité vérifiée par test.
- **Aucune requête vers un domaine tiers sur un chemin dont l'échec est invisible.** Une librairie qui charge son worker depuis un CDN échoue en silence derrière un pare-feu — et les photos partiraient brutes. Auto-héberger, avec vérification sha256 contre le paquet installé.
- Commenter **le pourquoi, jamais le quoi**. *Un commentaire qui décrit une intention plutôt qu'un comportement est un mensonge en attente.*

---

## Migrations — règle absolue

> **Une migration par sujet, numérotée à sa création, JAMAIS rouverte une fois appliquée.** L'ordre lexicographique **DOIT ÊTRE** l'ordre d'application. Les correctifs sont de **nouvelles** migrations.

> ⚠️ **CE BLOC DISAIT « EST », ET C'ÉTAIT FAUX.** Mesuré le 01/09/2026 en
> comparant `supabase_migrations.schema_migrations` triée par `version` à la
> liste des fichiers triée : **la 088 a été appliquée AVANT la 087.** Deux
> positions sur 130, jamais interrogées — les trois contrôles existants
> comparaient des ENSEMBLES de noms et un contenu, jamais une SÉQUENCE.
> L'inversion est inoffensive (aucun objet commun, vérifié), mais **une
> reconstruction depuis zéro appliquerait un ordre que la production n'a jamais
> exécuté**. `tests/rls/migrations.test.ts` compare désormais la séquence, avec
> l'inversion connue déclarée comme exception et sa raison, et échoue **dans les
> deux sens**.

- `alter type ... add value` vit **SEUL** dans sa migration.
- **Vérifier que les valeurs d'énumération citées dans les contrats existent réellement.** Une valeur citée mais absente fait échouer l'insertion, et la transaction étant partagée, **annule la mutation entière**.
- **`create or replace function` NE REMPLACE PAS** une fonction dont la liste d'arguments change : il en crée une **SECONDE**. Les deux coexistent et un appel résout l'ANCIENNE, sans erreur. **`drop` explicite obligatoire.**
- Un test compare base et dépôt **DANS LES DEUX SENS** : migration appliquée sans fichier, et fichier jamais appliqué.

---

## Tests — la discipline qui compte le plus

**Falsifier en cassant LE PRODUIT, pas les tests.** Retirer la garde, désactiver `unaccent`, filtrer une colonne dans une **fonction de lecture publique**, ajouter la colonne interdite à l'export. **Si la suite reste verte, elle ne prouvait rien.**

**Falsifier HORS du cas motivant.** Le falsifier sur son cas d'origine ne prouve que ce qu'on savait déjà. **Deux falsifications minimum**, dont une sur une variante qu'on n'avait pas en tête.

**Inventorier plutôt que sélectionner.** Un contrôle ne doit pas dépendre de ce que son auteur a pensé à inspecter. La sonde rend **TOUT**, le test **déclare les exceptions avec leur raison**, et il échoue **dans les deux sens**.

**Tout garde doit prouver qu'il inspecte quelque chose** avant de prouver que ce quelque chose est correct. **Un ensemble vide passe tout.**

**Utilisateurs réellement authentifiés, jamais de mock** : un test qui simule RLS ne teste pas RLS.

**Constater le rouge avant de poser la protection.** Un test qui n'a jamais échoué ne prouve rien.

**Toujours un contre-test positif** : une suite où tout est refusé passe à 100 % sans rien prouver.

**Un test qui échoue par intermittence doit être borné**, pas relancé jusqu'au vert.

**Suites jamais désactivables :** isolation RLS, **404 admin** (jamais 403 — un 403
confirmerait l'existence de la surface à qui n'y a pas droit), immuabilité du jeton.

---

## Les pièges déjà rencontrés — à ne pas refaire

| # | Piège |
|---|---|
| **L-003** | Consulter la doc de la **VERSION INSTALLÉE**, jamais la doc canary. `revalidateTag` prend **un seul argument** en Next 15. Lire `package.json` d'abord |
| **L-014** | **Un document affirme un état que personne n'a exécuté.** Interroger, pas lire. Et sa variante pire : *une affirmation trop vague pour être fausse ne peut pas non plus être vraie* |
| **L-017** | Un seuil dépassé ne veut pas dire qu'il manque un index. Vérifier d'abord que la requête **ne demande pas plus que nécessaire** — un agrégat complet ne se rattrape par aucun index |
| **L-018** | Un test qui constate qu'une **déclaration existe** ne prouve jamais que **son absence bloque** |
| **L-020** | **Un contrôle qui cherche un MOT ne prouve rien.** Interroger l'EFFET |
| **L-025** | **Un garde écrit après coup hérite du champ de vision de la CORRECTION, pas du problème.** Il regarde là où le défaut n'est plus *(6 occurrences)* |
| **L-026** | Une valeur qui a la **FORME** d'une configuration franchit toutes les validations de présence. Valider la présence ne dit rien de la substitution |
| **L-029** | **Une protection qui tient à une ABSENCE n'est pas une protection.** *Si la phrase juste est « ce serait ouvert si quelqu'un ajoutait X », c'est en sursis* |
| **L-030** | **Une course qui DÉGRADE au lieu de casser** est la plus difficile à attribuer. C'est le **TYPAGE** qui doit l'exiger |
| **L-031** | Un motif de garde qui cherche un appel de fonction doit s'appliquer au **CODE, commentaires retirés** — sinon il se satisfait du commentaire qui décrit la garde |
| **L-032** | **Toute vérification qui interroge un artefact construit doit établir que l'artefact CORRESPOND au code sous test.** *« Il répond » est la propriété que tous les résidus possèdent* |

Liste complète des 32 leçons dans @BRIEF-DROPLINK-COMPLET.md §13.

---

## Workflow

### ⚠️ LE PILOTE AUTOMATIQUE — consigne de Wassim, 11/09/2026

> « tu vas être constamment en **auto pilote**, tu vas implémenter tout le design
> parfaitement et quand y'a des erreurs tu les corriges **toutes** et tu passes à
> la partie suivante et ainsi de suite »
>
> « quand tu dois faire un choix, quand tu **rencontres un problème**, raisonne
> bien correctement et ensuite tu prends la **meilleure solution possible**, tu le
> corriges et tu continues »

**Ce que ça change, concrètement :**

1. **Un obstacle ne suspend pas le travail, il se résout.** Une garde rouge, une
   valeur qui manque, deux sources qui se contredisent : on raisonne, on tranche,
   on corrige, on enchaîne. On ne revient pas demander l'arbitrage d'un choix
   qu'on est en position de faire.
2. **Mais on ÉCRIT le raisonnement**, dans le commit et dans le code. Un choix
   pris en silence est un choix que personne ne pourra contredire plus tard — et
   c'est exactement ce que ce dépôt refuse partout ailleurs.
3. **On enchaîne écran par écran**, et un écran migré est un écran **vérifié** :
   mesuré au navigateur, aux trois langues, à 390 px tactile émulé, portes vertes.
   Commiter un écran à moitié fait est pire que ne pas l'avoir commencé.

**⚠️ CE QUI NE PASSE JAMAIS EN PILOTE AUTOMATIQUE, et la liste est courte :**

- **POUSSER.** Jamais sans sa demande explicite. Le pilote automatique porte sur
  le travail, pas sur sa mise en ligne.
- **Une écriture en production.** La coupure de suspension a été éprouvée le
  11/09 sur son seul compte — après avoir POSÉ la question et obtenu un oui.
- **Une contrainte produit verrouillée.** Les 26 décisions du brief et les
  contraintes du §« Contraintes produit » ne sont pas des arbitrages de design :
  quand le design system les contredit — facturation, marketplaces, chiffres
  inventés, plancher de mot de passe — **c'est le produit qui gagne**, et on le
  dit dans le commit.
- **Un geste irréversible** : supprimer un compte, régénérer un jeton, effacer
  des données.

> *Le pilote automatique n'est pas « décider vite », c'est « décider soi-même et
> laisser une trace de pourquoi ». Les deux moitiés comptent.*

- **Plan mode d'abord** sur toute tâche qui touche plus de 2 fichiers. Propose le plan, attends validation. ⚠️ **Sauf en pilote automatique**, où le plan s'écrit dans le commit plutôt qu'avant.
- **Passes séquentielles à propriétaire unique** sur les sujets couplés, **jamais de fan-out parallèle**. Le dashboard, l'éditeur, la page publique et l'admin partagent le modèle de données et le jeton : des agents isolés casseraient leurs hypothèses mutuelles.
- Un commit = un changement logique. Titre à l'impératif, corps expliquant **le pourquoi**, notamment les défauts trouvés.
- **⚠️ NE JAMAIS POUSSER SANS DEMANDER.** Wassim décide.
- Ne crée pas de fichier de doc ou de README non demandé.
- Si une décision produit est ambiguë, consulte @BRIEF-DROPLINK-COMPLET.md avant de demander — la réponse y est souvent.

---

## Travailler avec Wassim

- **Il veut les CHIFFRES, pas la recommandation.** Présenter les données, dire ce qu'elles impliquent, **et le laisser trancher**.
- **Poser une question binaire avec ses conséquences chiffrées**, pas un menu d'options.
- **Il repère les défauts silencieux.** Prendre ses intuitions au sérieux.
- **Ne pas maquiller.** Une mesure impossible **se dit impossible**. Un résultat de 140 octets ne s'arrondit pas à zéro.
- **Langue : français**, y compris commentaires de code, messages de commit et documents.

---

## Les 3 features qui font la différence

Si un arbitrage doit être fait, ces trois-là passent avant tout le reste :
1. **Import QC en 1 clic** depuis un lien de commande agent — le vrai gain de temps vs Google Drive.
2. **Suivi auto multi-transporteurs** dans le même lien — tue le « c'est où mon colis ».
3. **Page brandée par commande, modifiable en direct sans changer le lien** — la crédibilité que Drive ne donnera jamais.
