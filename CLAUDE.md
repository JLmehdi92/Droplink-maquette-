# CLAUDE.md

DropLink — une page privée par commande, pour ceux qui vendent en direct sans boutique (DM Snap, Insta, WhatsApp).
Le vendeur upload ses photos/vidéos QC, colle le tracking, envoie **un seul lien brandé à ses couleurs**. Son client consulte tout lui-même, sans compte.

**Statut : phase de validation, en ligne sur droplink.fr. Plan gratuit (15 commandes et 15 colis
suivis à vie) et plan Pro à 20 €/mois (300/300 par mois), encaissé par Lemon Squeezy — encore en
mode test au 27/09/2026. Aucun paiement ne passe jamais SUR les commandes (contrainte n° 1).**

📖 **Contexte produit complet : `BRIEF-DROPLINK-COMPLET.md`** — à consulter avant toute décision produit ou d'architecture. Il n'est PAS chargé d'office (83 Ko) : on l'interroge dans context-mode (`ctx_search`, source `brief`), et on le lit en entier quand la décision l'exige. Si la recherche ne rend rien, le réindexer d'abord (`ctx_index`). Il contient les 26 décisions verrouillées avec leurs raisons, le modèle de données, les budgets chiffrés et les 32 leçons.

🔎 **Le contexte long vit dans context-mode, pas dans la conversation** (17/09/2026). Cinq sources indexées : `brief`, `claude-md`, `historique-design` (`consignes/historique-du-design.md`, le journal écran par écran), `inventaire-kit` (`consignes/inventaire-du-kit.md`, les nouveautés du kit non codées, 19/09/2026) et `memoire` (le DOSSIER des fiches de mémoire). **Toujours filtrer par `source`** — sans filtre, une grosse fiche écrase les autres — et chercher des mots précis (un nom de variable, un numéro de décision). ⚠️ **L'index ne se met pas à jour tout seul** : après avoir modifié l'un de ces fichiers, le réindexer (`ctx_index` sur le même chemin, même `source`) — **après chaque étape finie, pas en fin de séance** (consigne de Wassim, 19/09/2026). ⚠️ **UNE SOURCE NE PORTE QU'UN CHEMIN : indexer un autre fichier sous la même `source` REMPLACE le premier** (constaté le 19/09 : l'inventaire a effacé le journal). La mémoire se réindexe donc par son DOSSIER, jamais fiche par fiche. Les journaux longs (`out/`, scratchpad) se lisent par `ctx_execute_file`, jamais en entier dans la conversation.

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
pnpm test:watch       # les tests unitaires relancés à chaque enregistrement
pnpm test:perf        # mesures (~15 min) — PAS une porte, mais gardée : voir ci-dessous
pnpm couverture       # 7e porte : aucun fichier de src/lib/ sans un test qui le traverse
pnpm db:migrate       # applique les migrations — ⚠️ EN PRODUCTION
pnpm db:migrate:tests # les applique à la base de TESTS (refuse toute autre cible)
pnpm db:types         # régénère les types Supabase — depuis la PRODUCTION
pnpm db:types:tests   # les régénère depuis la base de tests
pnpm fumee            # le produit doit RÉPONDRE : serveur réel, statuts et HTML servi
pnpm falsifier        # casse le produit EN BASE (base de TESTS), de façon réversible
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
>
> ⚠️ **ET ÇA S'EST REPRODUIT LE 20/09/2026, PAR UNE AUTRE PORTE.** Les migrations
> 175-176 et 181 bornent un compte **gratuit** à 15 commandes et 30 colis **À
> VIE** (15 colis depuis la 201, décision de Wassim du 27/09/2026). Le banc en sème des milliers pour savoir si l'écran tient : ses quatre
> fichiers ont cessé de se charger, et vitest a rendu **« 6 passed | 48
> skipped »**. Six sur cinquante-quatre, présenté comme un succès partiel.
>
> Ce n'était pas l'arité cette fois, c'étaient les **FIXTURES refusées par une
> règle métier neuve** — et aucune garde ne pouvait le voir, parce que
> `test:perf` court-circuitait `scripts/suite.mjs`.
>
> **`pnpm test:perf` PASSE DÉSORMAIS PAR LE MÊME GARDE que `test` et
> `test:rls`** : saut refusé, todo refusé, suite vide refusée, et un plancher de
> 45 mesures qui rougit quand un fichier entier disparaît. La correction du banc
> lui-même n'est pas un contournement : **les comptes du banc sont Pro**, parce
> qu'un vendeur à 9 600 commandes l'est par construction. Le plafond MENSUEL du
> plan Pro, lui, continue de s'appliquer — c'est pour lui que le semis étale ses
> lignes sur treize mois.

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

> ⚠️ **UNE MIGRATION ÉCRITE N'EST PAS UNE MIGRATION DÉPLOYÉE, ET `railway.json`
> NE LES APPLIQUE PAS.** Le déploiement lance `pnpm build` puis `pnpm start`,
> rien d'autre : les migrations s'appliquent **à la main**, et `pnpm db:migrate`
> vise la PRODUCTION — donc il n'est jamais en pilote automatique.
>
> **Le chemin de travail est `pnpm db:migrate:tests`** : il charge
> `.env.test.local` en premier et **REFUSE de démarrer** si l'URL résolue ne
> désigne pas le projet de tests. `pnpm db:types:tests` régénère les types
> depuis cette même base — sans quoi on régénérerait depuis une production qui
> ne connaît pas encore les fonctions qu'on vient d'écrire, et les types du code
> tout neuf disparaîtraient.
>
> ⚠️ **CONSÉQUENCE À DIRE À CHAQUE FOIS** : entre le déploiement du code et la
> migration de la production, l'écran qui appelle la nouvelle fonction rend
> **500**. L'ordre est donc `pnpm db:migrate` PUIS le déploiement, et c'est la
> décision de Wassim, pas la nôtre.

> ⚠️ **`pnpm falsifier` VISAIT LA PRODUCTION JUSQU'AU 13/09/2026.** Il retire des
> policies RLS, remplace des fonctions de lecture publique par des versions
> `security definer`, supprime des bornes de période — **délibérément**. Sur la
> base qui sert les clients, « casser » ouvrait donc réellement les données de
> tous les vendeurs jusqu'à la réparation. Il vise désormais la base de TESTS et
> refuse toute autre cible ; **aucun drapeau ne permet de viser la production**,
> parce qu'un drapeau qui l'autoriserait finirait par être tapé.
>
> Ce n'était même pas ce qu'il devait mesurer : les suites qui doivent rougir
> tournent sur `droplink-tests` depuis le 06/09. *Falsifier ailleurs que là où
> les gardes s'exécutent ne prouve rien — on casse une base, on en regarde une
> autre.*

**Portes de qualité avant chaque commit** — les sept, dans cet ordre, sous un
seul environnement :
```
pnpm typecheck · pnpm lint · pnpm build · pnpm test · pnpm test:rls · pnpm couverture · pnpm fumee
```

> ⚠️ **LA SEPTIÈME, `couverture`, EST NÉE LE 23/09/2026 — ET ELLE FAIT ROUGIR UNE
> FEATURE AJOUTÉE SANS TEST.** `@vitest/coverage-v8` était installé et n'avait
> jamais tourné. Allumé, il a montré **28 fichiers de `src/lib/` qu'aucun des
> 1 931 tests ne traversait** — dont le secret des tâches planifiées, la garde
> anti-CSRF, la cadence qui décide des appels PAYANTS, et l'adresse du site qui
> fabrique les liens de réinitialisation. `test` et `test:rls` écrivent désormais
> leur couverture ; `scripts/inventaire-couverture.mjs` exige que CHAQUE fichier
> de `src/lib/` soit traversé par au moins un test, ou déclaré avec sa raison, et
> échoue dans les deux sens. ⚠️ **« Traversé » veut dire qu'une de ses FONCTIONS a
> été APPELÉE** (depuis le 24/09/2026) : une instruction exécutée ne suffisait pas,
> le code de niveau module tourne au simple import, et trois fichiers passaient la
> porte sans un seul test. **L'inventaire part du disque** : un fichier que rien
> n'importe ne peut pas s'y cacher. `src/app/` et `src/components/` n'y sont pas —
> la fumée et les sondes navigateur les exercent dans un autre processus, que la
> couverture ne voit pas.
>
> **Leur plancher est donc dans la fumée** (même jour) : elle note chaque requête
> RÉELLEMENT partie vers le serveur, et exige que chaque `page.tsx` et `route.ts`
> du DISQUE en ait reçu une, sans réponse 5xx. Premier passage : **42/46**. Deux
> écrans d'administration (`comptes/doublons`, `comptes/[id]`) manquaient à la
> liste du 404 admin, écrite à la main — elle est désormais lue sur le disque — et
> ni l'export des données du compte ni le webhook de paiement n'étaient jamais
> appelés. Le webhook est éprouvé depuis avec un secret propre à la fumée : sans
> signature, mauvaise signature, signature valide sur un corps modifié, contre-test
> signé accepté, rejeu traité une fois. Ce plancher dit qu'une route a été
> atteinte, pas qu'elle fait tout ce qu'elle doit.
**Ne pas les enchaîner à la main : `scripts/portes.mjs` les lance, et c'est lui
qui garantit qu'elles visent toutes la même base.**

**Ne jamais commiter par-dessus des portes rouges**, même si la cause est ailleurs — c'est comme ça qu'on s'habitue au rouge.

---

## Stack

Next.js 16 App Router · React 19 · TypeScript strict (`noUncheckedIndexedAccess`) · Tailwind v4 · shadcn/ui · dnd-kit · **Supabase** (Postgres + Auth + RLS) · **Cloudflare R2** (médias, bucket privé) · Resend · PostHog (EU) · Sentry · next-intl (FR, EN, zh-CN) · Zod · 17TRACK (suivi).

> ⚠️ **TROIS MENTIONS DE CETTE LIGNE ÉTAIENT FAUSSES, mesurées le 20/09/2026 dans
> `package.json`** : le dépôt est en **Next 16.3.4**, pas 15 ; il n'y a **AUCUN paquet Resend ni React
> Email** — `lib/email/resend.ts` appelle l'API HTTP à la main, et il ne sert qu'aux ALERTES DE
> VEILLE, vers l'exploitant ; les e-mails de compte (inscription, réinitialisation, changement
> d'adresse) partent du SMTP configuré dans Supabase Auth. **Aucun e-mail ne part vers le client
> final** : `orders.notify_email` et `unsubscribe_token` existent en base et ne sont lus par
> aucun chemin, et il n'existe pas de route de désinscription.

**Absent volontairement :** Three.js, WebGL, tout transcodeur vidéo. ⚠️ « Toute librairie de paiement » figurait ici et n'y est plus (20/09/2026) : il n'y a toujours AUCUN SDK de paiement — le webhook Lemon Squeezy tient en un HMAC et un `fetch` —, mais l'interdiction de principe est levée.

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
                       ⚠️ CE SONT DES COULEURS D'APLAT : points, barres, fonds,
                       filets. En TEXTE ou en ICÔNE sur fond clair elles ne se
                       lisaient pas (3,61 · 3,04 · 2,69 sur blanc).
GRIS SECONDAIRES       sourdine #8B90A8 (3,16:1 sur blanc) · estompé #A9AEC4 (2,20)
                       ⚠️ SOUS 4,5:1 EN TEXTE, ET GARDÉS — décision de Wassim du
                       15/09/2026. Les rendre lisibles les ramenait au gris de
                       corps (#676D89, #646C91) : la hiérarchie à trois gris
                       disparaissait. Ne pas rouvrir sans raison nouvelle.
ENCRES D'ÉTAT          erreur #D81322 · succès #0D7C5A · avertissement #9D6111
                       (décision de Wassim, 15/09/2026 ; 4,5:1 sur blanc ET sur
                       le fond teinté ; `--status-*-ink` au kit,
                       `text-ds-*-encre` au produit)

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
   ⚠️ **LA CARTE « Propulsé par DropLink » N'Y FAIT PAS EXCEPTION** (décision de
   Wassim du 19/09/2026 : elle est sur la page client d'un compte GRATUIT, un
   compte **Pro** la retire depuis « Ma marque », migration 167). Elle a d'abord
   été peinte au dégradé DropLink : c'était faux. La planche `client_link`
   rhabille ses variables aux couleurs du VENDEUR (`brandVars`), carte comprise ;
   seul le symbole est le nôtre. Le plan se pose à la main dans l'administration,
   après un paiement reçu HORS du produit : la contrainte n° 1 tient.
4. **Toute animation respecte `prefers-reduced-motion`** et ne porte jamais
   d'information.
5. **Cible tactile 44 px minimum, police 11,5 px minimum sur téléphone** —
   nouveauté du 11/09/2026. Les liens **en ligne dans la prose** restent à leur
   hauteur de texte : les agrandir casserait l'interligne du paragraphe.

### Iconographie

**Lucide**, trait 1,8-1,9. Aucune icône dessinée à la main, **aucun emoji dans
l'interface**. Les logos de marques tierces (Google, Instagram, TikTok, WhatsApp,
transporteurs) viennent de leurs SVG officiels — jamais reconstitués de mémoire.

> ⚠️ **LES TRACÉS `material-symbols` SONT SORTIS DU DÉPÔT LE 15/09/2026.** Le
> composant `Icone` et ses 19 Ko de tracés vivaient encore dans sept fichiers —
> la landing, quatre écrans d'administration, la recherche admin, la marque —
> tous « conformes » : la soustraction compare des textes, jamais un tracé, donc
> aucune mesure ne pouvait les voir. Ils sont remplacés par Lucide et le composant
> est SUPPRIMÉ : une icône Material réintroduite ne compile plus.

### Réseaux sociaux du vendeur

**Instagram, TikTok, WhatsApp — et ces trois-là seulement** (Snapchat et Telegram
écartés par Wassim). Facultatifs, stockés sur `shops`, rendus sur la page client
**uniquement s'ils sont configurés.** Aucun bloc, aucun logo grisé quand il n'y en
a pas.

> ⚠️ **LE QUATRIÈME CHAMP « site web » EXISTE, ET CE BLOC DISAIT LE CONTRAIRE.**
> Il affirmait « il n'est pas dans `shops` et n'est pas une autorisation ».
> Mesuré le 12/09/2026 contre le catalogue : `shops.site_url` est posée par la
> **migration 133**, contrainte de forme comprise, elle est lue par
> `lib/comptes/profil.ts` et écrite par `lib/boutique/reglages.ts`, et l'écran
> `/marque` la saisit depuis. La décision produit A été prise ; c'est cet
> avertissement qui ne l'avait pas suivie — L-014 dans sa forme exacte, *un
> document affirme un état que personne n'a exécuté*.
>
> **Ce qui reste vrai et qui motivait l'avertissement :** un champ dessiné n'est
> pas une autorisation. Les **options d'affichage** du kit — six interrupteurs
> « Afficher le logo », « Afficher la description », « Afficher les photos »… —
> n'ont aucune colonne, et `shops` ne porte que `watermark_enabled` — plus,
> depuis la migration 167, `hide_droplink_brand`, qui est une DÉCISION de Wassim
> (réservée au plan Pro, refusée en base sinon), pas un interrupteur du kit porté
> parce qu'il était dessiné. Les six autres ne s'implémentent pas au motif
> qu'elles sont dessinées.

### Périmètre — ce que le design system couvre, et ce qu'il ne couvre pas

**Couvert, à migrer** : landing · connexion · inscription · commandes · détail et
éditeur de commande · envois · analyses · marque · `/p/[token]` · conditions ·
confidentialité · les deux pages d'erreur de lien (expiré, introuvable).

**Écrans du dépôt que le design system ne dessine pas : AUCUN depuis le
14/09/2026.** Le dernier, l'arbitrage QC de la page client, est écrit dans
`ui_kits/client_link` (`ValidationCard`, juste après la galerie, état en attente).
Les autres en sont sortis le même jour, écrits d'abord dans le kit puis portés — ils portaient encore
l'ancien canevas à un clic d'écrans migrés : `/mot-de-passe-oublie`,
`/nouveau-mot-de-passe` et `/bienvenue` dans `ui_kits/auth` (`ForgotScreen`,
`ResetScreen`, `OnboardingScreen`), `/signalement` dans `ui_kits/legal`
(`signalement.html`, trois langues), `/blog` et `/blog/[slug]` dans le nouveau
`ui_kits/blog` (français seul, `#<slug>` pour un article). ⚠️ **Le design system
est gitignoré : ces planches ne voyagent pas avec le dépôt.**

**Écrans dessinés que le dépôt n'avait pas, et qui sont créés** : le tableau de
bord, les paramètres vendeur, `/docs`, et dans l'administration **Commandes** et
**Statistiques** (décision de Wassim du 14/09/2026). Chacun a été une décision
produit avant d'être une route.

> ⚠️ **L'ADMIN : NEUF ÉCRANS EN CODE, TOUS DESSINÉS.** Sept écrans du kit sont
> portés (vue d'ensemble, commandes, utilisateurs, boutiques, statistiques, logs,
> paramètres), et `surveillance` a reçu la sienne le 14/09/2026 (`#surveillance`) ;
> et `comptes/[id]` la sienne (`#compte`). Restent
> trois planches, et aucune ne se code : **Abonnements et Paiements** sont de la
> facturation, interdite par la contrainte n° 1 ; **Support** suppose un système
> de tickets que la base n'a pas.
>
> ⚠️ **ET SES PARAMÈTRES ONT SEPT SOUS-ONGLETS, DONT UN SEUL EST PORTÉ** — relevé
> le 17/09/2026 en comparant `ADMIN_NAV`/`SETTINGS_NAV` du kit aux routes du
> dépôt. Le nôtre est « Général », et il ne montre que ce que `parametres_admis`
> autorise : plafonds par compte, suivi des colis, limitation de débit. Les six
> autres ne se codent pas, et c'est une DÉCISION, pas un oubli :
> **Abonnements** est de la facturation (contrainte n° 1) ; **Emails**,
> **Intégrations** et **Apparence** (thème, couleurs, logo de la plateforme)
> règlent ce qu'aucune colonne ne porte — c'est la même règle que les six
> interrupteurs d'affichage de « Ma marque », *un réglage dessiné n'est pas une
> autorisation* ; **Sécurité** (2FA obligatoire, durée de session, déconnexion
> automatique) et **Système** (uptime, ressources, requêtes/minute) décrivent
> l'un des réglages de compte qui vivent chez Supabase, l'autre ce que
> `/admin/surveillance` montre déjà. **Aucun écran du dépôt n'attend donc d'être
> implémenté.**
>
> ⚠️ **COMMANDES NE MONTRE AUCUN CONTENU.** Le kit dessine le pseudo et l'adresse
> du client, et « Ouvrir la page client ». Le premier appartient à quelqu'un qui
> n'a jamais eu de compte chez nous, le second transfère une capacité : la liste
> rend référence courte, boutique, statut, transporteur et date, écrit UNE ligne
> d'audit par page (migrations 159-160), et « Voir » mène à la fiche du compte.
> ⚠️ **UNE SEULE EXCEPTION, ET C'EST LE VENDEUR QUI L'ENVOIE** (migrations 168 et 169, décision de
> Wassim du 19/09/2026) : quand l'administration bloque un lien, le vendeur le voit dans ses
> commandes et peut le CONTESTER — explication obligatoire, image facultative. L'administration
> lit cette contestation, et chaque lecture est écrite au journal ; elle répond en débloquant
> ou en refusant, et le vendeur lit la réponse — ainsi que le MOTIF du blocage (169), écrit pour
> lui : l’aide du dialogue de blocage le dit à l’administrateur. Le contenu de la commande reste invisible.
> **STATISTIQUES NE REND QUE DES NOMBRES** (migration 161), donc n'écrit rien au
> journal ; la période précédente y est CALCULÉE sur les tables horodatées, et
> l'anneau des abonnements du kit y devient celui des types de compte.
> **LES COMPTES EN DOUBLON** (migrations 170-171, décision de Wassim du 20/09/2026) : des
> comptes DISTINCTS qui affichent le même Instagram, TikTok, WhatsApp ou site. L'écran dit un
> fait, jamais « même personne », et n'agit sur rien. UNE fonction décide de l'égalité
> (`identifiant_public`) : rien n'est deviné — aucun indicatif ajouté, un lien qui ne désigne pas
> un compte ne rapproche personne. La liste nominative écrit `comptes.doublons` au journal ; le
> panneau de la liste des comptes ne rend que des nombres.

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

#### ⚠️ LA RÈGLE D'ARRÊT — CONSIGNE DE WASSIM, 12/09/2026

> « tu vas les re re comparer avec les écrans de Claude Design et tant que c'est
> **1:1, pixel par pixel**, tu passes pas à l'écran suivant, on va faire comme
> ça maintenant »
>
> « tu dois **constamment comparer le vrai design et celui que tu codes**, et tu
> passes pas à l'écran suivant tant que l'écran en cours n'est pas **parfait** »
>
> « **tu as tous les assets** pour faire tous les écrans »

**⚠️ IL N'Y A AUCUNE EXCUSE D'ASSET, ET IL FAUT LE DIRE EN PREMIER.** Le design
system est COMPLET dans le dépôt, sous `.claude/skills/droplink-design/` : les
dix écrans en vraies pages HTML (`ui_kits/`), les tokens, les 26 composants, les
trois langues, le rendu téléphone (`mobile.html`). Rien n'est à demander, rien
n'est à deviner, rien n'est « pas fourni ». Un écran qui ne ressemble pas à sa
référence n'a qu'une cause possible : on ne l'a pas comparé.

**UN ÉCRAN N'EST PAS FINI TANT QUE LA SOUSTRACTION N'EST PAS VIDE.**
`node scripts/soustraire-inventaires.mjs <kit.json> <produit.json>` doit **sortir
en code 0**. Il y sort quand il ne reste plus un seul écart non déclaré — et il
refuse aussi une déclaration qui ne désigne plus rien, sans quoi la liste
grossirait jusqu'à tout couvrir et « c'est vide » voudrait dire « j'ai tout
déclaré ».

**LA COMPARAISON EST CONSTANTE, PAS FINALE.** On ne code pas un écran puis on
mesure : on mesure, on corrige, on re-mesure, et on recommence jusqu'à zéro. Sur
`/commandes`, il a fallu **six tours** ; le premier rendait 41 écarts, dont un
`colgroup` entier sans effet faute de `table-fixed`.

**Et « mesuré au pixel » ne s'écrit dans un commit qu'après avoir lancé la
soustraction.** Huit messages de commit l'ont affirmé sans elle : le quatrième
geste n'était pas outillé, il se faisait à l'œil, donc sur ce qu'on pensait à
regarder. *Une affirmation de conformité qui n'a pas été exécutée est une
affirmation fausse, et elle coûte plus cher que l'absence d'affirmation.*

**LES TROIS SEULS MOTIFS DE DÉCLARATION**, écrits dans
`scripts/ecarts-declares.json` avec leur raison, jamais ailleurs :

| motif | ce qu'il couvre |
|---|---|
| `contrainte` | le kit contredit une décision verrouillée — facturation, route inexistante, vocabulaire du brief. **Le produit gagne** |
| `donnee` | la base ne porte pas ce que le kit montre, ou le jeu de mesure n'a pas ses huit lignes |
| `structure` | **le même rendu par un balisage différent** — un écart de l'outil, pas de l'écran. À employer avec méfiance : c'est le motif qui permet de tout excuser |

#### Les cinq gestes, dans cet ordre

```
1.  npx --yes http-server -p 8123 -s .      # dans .claude/skills/droplink-design/
    chrome --remote-debugging-port=9223 --headless=new

2.  CLIC_KIT="Suivi d'envois" node scripts/comparer-au-kit.mjs       "http://127.0.0.1:8123/ui_kits/seller_app/index.html" 1690       kit-envois.json KIT-envois-1690.png

3.  node scripts/build-contre-tests.mjs && node scripts/servir-contre-tests.mjs
    MSYS_NO_PATHCONV=1 node scripts/verifier-ecran-migre.mjs       http://localhost:<port> "/fr/envois" 1690,390 <dossier de captures>

4.  MSYS_NO_PATHCONV=1 INVENTAIRE=<dossier> node scripts/verifier-ecran-migre.mjs \
      http://localhost:<port> "/fr/envois" 1690 <dossier de captures>

5.  node scripts/soustraire-inventaires.mjs <kit.json> <produit.json>
    ET regarder les deux captures côte à côte. Les deux, pas l'un OU l'autre :
    la soustraction voit ce qui diffère, les captures voient ce qui manque
    autour.
```

`soustraire-inventaires.mjs` rend trois listes — ce que le kit rend et que le
produit ne rend pas, ce que le produit rend en plus, et pour chaque texte commun
les propriétés qui diffèrent (taille, graisse, interligne, interlettrage,
couleur, fond, IMAGE DE FOND, rayon, filet, ombre, remplissage, écart, boîte) — et
une quatrième liste, les DÉCORS : les dégradés d'au moins 300 × 150 sans texte (fonds
de page, halos, cartes teintées), comparés en ensembles. ⚠️ **Jusqu'au 19/09/2026 ni
l'image de fond ni les décors n'étaient comparés** : le fond de l'espace vendeur manquait
sur neuf écrans au téléphone, celui de l'admin partout, et tout sortait en code 0. Les deux
sondes inventorient aussi `<body>`, où le kit peint le fond de ses pages publiques. **Il apparie par
le TEXTE, jamais par la position** — apparier par position reviendrait à
supposer la réponse, puisque la position est justement ce qu'on mesure — et il
**normalise les chiffres en `#`**, sinon chaque date et chaque compteur des deux
jeux de données ressortirait comme « absent ».

`comparer-au-kit.mjs` rend, pour chaque élément RÉELLEMENT RENDU : boîte,
position, police, graisse, interlettrage, interligne, couleur, fond, image de
fond, rayon, filet, ombre, marge, écart. **C'est un inventaire, pas une
sélection** : la comparaison trie, pas la sonde.

#### ⚠️ LES NEUF PIÈGES, TOUS PAYÉS UNE FOIS — DANS L'HISTORIQUE

Le détail vit dans `consignes/historique-du-design.md` (§ « Les neuf pièges »), indexé dans context-mode.
Les quatre qui changent une mesure, à ne jamais oublier :

- **le kit vendeur se sert à 1690 px, l'admin à 1560, la page client et l'accès à 1440,
  le public à 1280** — la largeur est écrite dans l'en-tête `viewport=` de chaque planche ;
- **le kit est une application à état** : sans `CLIC_KIT`, on mesure l'écran par défaut ;
- **les sondes LÈVENT si le texte n'est pas rendu en Inter** — une police de repli fausse
  chaque largeur de 7 % ;
- **un serveur de mesure ne survit pas à `pnpm gates`**, qui reconstruit `.next` sous lui.

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

#### ▶️ OÙ ON EN EST — DANS L'HISTORIQUE

**Tous les écrans du dépôt ont une planche, et les 74 relevés (37 au bureau, 37 à 390 px)
sortent en code 0** (remesure du 17/09/2026). Le journal écran par écran — tableau des
relevés, commandes exactes de mesure, défauts trouvés, décisions de Wassim, migrations
demandées — vit dans `consignes/historique-du-design.md` et dans context-mode. **On le consulte avant de toucher
à un écran**, pas après.

**La production est à jour jusqu'à la 204 incluse, depuis le 27/09/2026** — migrations lancées
à la main par Mehdi (frère de Wassim, qui pilote le projet avec lui), `verif:prod` 29/29, puis
code poussé. Aucune migration n'attend. Les dernières : le quota à vie qui ne se recharge pas
(198), le suivi bloqué dit (199), le Pro qui repart de zéro (200), 15 colis à vie en gratuit
(201), le quota de colis compté en AFTER INSERT (202), l'appareil fiable (203), et **le lien de
paiement signé (204)**, qui retire le rattachement par e-mail (voir la contrainte n° 1).
**La chaîne de paiement est prouvée EN PRODUCTION** (27/09, Lemon Squeezy en mode test, carte
de test) : lien signé → webhook → `verifier_lien_paiement` → compte gratuit passé Pro tout seul.
Passer en live ne demande aucun code : le mode live chez Lemon Squeezy et ses variables dans
Railway. **La règle reste : la prochaine migration s'applique en production AVANT de pousser le
code qui l'appelle**, sinon l'écran qui l'appelle rend 500 (ou, pour la 204, « Passer au Pro »
n'affiche aucun bouton : le lien n'est jamais proposé non signé).

**Les consignes que ce journal porte et qui ne se perdent pas avec lui :**

- ⚠️ **LES E-MAILS DE SUIVI DU CLIENT FINAL (188-189) N'EXISTENT À L'ÉCRAN QUE SI
  `EMAIL_CLIENTS_DE` EST POSÉE** (adresse d'expédition dédiée, domaine vérifié chez Resend) :
  sans elle, la carte « Suivi par e-mail » n'apparaît pas et rien ne part. Les e-mails d'étape
  partent de la tâche `cadence-suivi` existante — aucune tâche Railway de plus.
- ⚠️ **LA 186 REND LA DOUBLE AUTHENTIFICATION OBLIGATOIRE POUR L'ADMINISTRATION, EN BASE**
  (décision de Wassim, 23/09/2026) : les fonctions SQL `est_admin` et `journaliser_admin` refusent une
  session à un seul facteur. ⚠️ **« L'ACTIVER AVANT DE DÉPLOYER » ÉTAIT IMPOSSIBLE** (corrigé le
  23/09/2026) : le module 2FA lui-même (156) n'est pas encore en production. L'ordre juste :
  migrations → déploiement → ouvrir `/admin`, qui renvoie aux **Paramètres** → activer la 2FA
  (QR code dans l'application d'authentification de l'administrateur — personne ne peut le
  faire à sa place : le secret doit finir dans SON téléphone). Aucun blocage : l'espace vendeur
  reste ouvert à un seul facteur, c'est là qu'on l'active.
- ⚠️ **après `pnpm db:migrate`, vérifier À LA MAIN que le rôle `authenticator` porte
  `pgrst.db_pre_request`** (migration 156, la double authentification tenue en base) :
  `pnpm verif:prod` ne compare pas les réglages de rôle ;
- ⚠️ **les seuls identifiants R2 de la machine sont ceux de la PRODUCTION** : la purge
  s'éprouve sans réseau, jamais contre le vrai bucket ;
- **tout ce qui protège le compte exige le mot de passe actuel** — une session ne suffit
  pas, un cookie volé en est une ;
- **une constante exportée d'un module `"use client"` arrive VIDE dans un composant
  serveur** (c'est une référence client) : typecheck, lint et tests restent verts ;
- **le serveur de mesure se lance avec `AUTH_GOOGLE_ACTIF=1`**, sinon le bouton Google rend
  `null` et l'on mesure une carte que la production ne sert pas ;
- **avant de déclarer un écart d'administration, compter les comptes de la base de tests** :
  un compte de sonde résiduel déplace tous les compteurs ;
- **une déclaration couvre un TEXTE, toutes propriétés confondues** : relire ce qu'elle excuse
  quand l'écran change. Les valeurs du jeu de mesure (dates, volumes) se déclarent par MOTIF ;
- **ne jamais modifier la source pendant `pnpm gates`** : la garde L-032 rougit, à raison.

### Comment on vérifie un écran migré

Dans cet ordre, et on ne passe pas au suivant avant que les six passent :

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
   > ⚠️ **CETTE ÉTAPE N'AVAIT JAMAIS TOURNÉ, ET LA SONDE AFFIRMAIT LE CONTRAIRE.**
   > L'en-tête de `verifier-ecran-migre.mjs` citait `prefers-reduced-motion`
   > depuis le 11/09 ; mesuré le 15/09, aucun `setEmulatedMedia` dans le
   > fichier. Elle recharge désormais chaque écran sous `reduce` émulé, compare
   > les textes RÉELLEMENT visibles (opacité effective, `visibility`) à l'état
   > normal, et relève les animations infinies encore actives — sortie en
   > code 1 sur l'un ou l'autre. Falsifiée deux fois : les deux règles `reduce`
   > neutralisées (10 boucles de la landing actives) et un titre en
   > `opacity-0 motion-safe:opacity-100` (disparu). **Les 33 écrans, à la
   > largeur du kit et à 390 px : 66 mesures, aucun défaut.**
5. **La CSP ne bloque rien** — la sonde relève chaque violation
   (`securitypolicyviolation`, écouteur posé avant la navigation) et sort en
   code 1.
   > ⚠️ **ELLE N'AVAIT ÉTÉ VÉRIFIÉE AU NAVIGATEUR QU'UNE FOIS, LE 02/09/2026**,
   > sur trois écrans — avant la refonte complète du design. Aucune porte ne
   > peut voir une violation : la fumée n'exécute pas de JavaScript, et la CSP
   > n'est servie qu'en `NODE_ENV=production`. La sonde **exige d'abord que
   > l'en-tête soit servi** (une politique absente ne produit aucune violation).
   > Falsifiée deux fois : `style-src` sans `'unsafe-inline'` (14 violations sur
   > la connexion) et CSP désactivée (arrêt). **17/09/2026 : les 37 écrans et
   > leurs états ouverts, au bureau et à 390 px — 75 passages, aucune violation.**
   > Hors de sa portée : ce que les écrans mesurés n'exercent pas — un dépôt de
   > média vers R2, un colis suivi.
   >
   > **Et la console ne ment pas non plus** : la même sonde relève les exceptions,
   > les `console.error` et les requêtes en échec (≥ 400), sauf les images R2 du
   > jeu (clés absentes du bucket) et le 404 VOULU du document mesuré. Elle
   > exige d'avoir reçu des réponses réseau, sans quoi « aucune erreur » ne
   > prouverait rien. Falsifiée : texte différent serveur/client et image
   > inexistante sur la connexion → « React error #418 » et un 404 relevés.
   > ⚠️ **PREMIER BALAYAGE, 17/09/2026 : UN VRAI DÉFAUT.** `/fr/verification`
   > levait « Minified React error #418 » à chaque ouverture : un `<form>` (celui
   > de `BoutonDeconnexion`) dans un `<p>`. Le navigateur ferme le paragraphe
   > avant le formulaire, l'arbre ne correspond plus à celui de React, qui jette
   > le HTML du serveur. **Un composant qui rend un `<form>` ne se pose jamais
   > dans un `<p>`.**
6. **Les six portes** — `pnpm gates`, et on relève le décompte, pas la couleur.

> ⚠️ **NE JAMAIS VÉRIFIER UN ÉCRAN À LA LARGEUR DE SA FENÊTRE.** À 900 px, les
> paliers 760 et 640 ne se déclenchent pas : cinq débordements s'y étaient cachés,
> jusqu'à 287 px sur l'espace vendeur, tous invisibles jusqu'à la mesure à 390.
> L'outil est `mobile.html`.

---

## Quatre surfaces, quatre logiques

**1. `/[locale]/(app)/*` — authentifié, RLS.** Client serveur **avec** session, jamais service-role. Le dashboard est l'écran le plus utilisé : un fournisseur à 200 commandes/semaine y passe sa journée.

**2. `/p/[token]` — jamais authentifié.** Hors du segment `[locale]` (la langue est celle du vendeur, pas de l'URL). Racine de mise en page distincte — c'est le budget, pas l'organisation. Lecture par jeton via **fonctions `security definer`** — `lire_commande_publique`, `lire_medias_publics`, `lire_suivi_public`, `lire_passages_publics`. ⚠️ **Le dépôt ne contient AUCUNE VUE, et c'est délibéré** : une vue SE PARCOURT, une fonction EXIGE le jeton. `noindex`.
Son corps vit dans `components/publique/page-client.tsx` (26/09/2026), rendu aussi par **`/p/<jeton>/apercu`** — l'aperçu que la fiche commande encadre en mobile et en desktop : même page et même quota, mais **aucune vue comptée**, arbitrage et e-mails **`inert`**, et c'est la SEULE page client cadrable (par DropLink seulement, `next.config.ts`). ⚠️ Un nouvel îlot qui écrit (`POST`) doit être enveloppé d'`Inerte` : `tests/unit/apercu-page-client.test.ts` l'inventorie et rougit sinon.

**3. `/[locale]/admin/*` — rôle vérifié EN BASE, à chaque requête.** Segment RÉEL, jamais un groupe entre parenthèses : un groupe n'ajoute rien à l'URL, les écrans tomberaient hors du filtre du middleware.

**4. `/api/*` — machine.** Exclue du middleware, donc **chaque route porte sa propre garde**.

**Quatre clients Supabase, physiquement séparés** (six jusqu'au 23/09/2026). Importer le mauvais doit casser le build plutôt que de fuiter silencieusement :

| Fichier | Rôle |
|---|---|
| ~~`lib/supabase/client.ts`~~ | ⚠️ **SUPPRIMÉ le 23/09/2026** : `creerClientNavigateur` n'avait aucun appelant. Aucun accès Supabase ne part du navigateur — c'est ce qui permet aux cookies de session d'être `httpOnly` (`lib/auth/cookies.ts`) ; un client navigateur recréé devrait défaire cette protection |
| `lib/supabase/server.ts` | Serveur **avec session**, RLS active. **Défaut** |
| ~~`lib/supabase/admin.ts`~~ | ⚠️ **SUPPRIMÉ le 23/09/2026** : `creerClientAdmin` n'avait plus AUCUN appelant — l'audit passe par la session de l'administrateur (fonctions `security definer` et lectures sous RLS). La cloison ESLint reste, en fil-piège |
| `lib/supabase/anon.ts` | Serveur **SANS session** — page publique uniquement |
| `lib/supabase/system.ts` | Service-role pour les chemins **sans humain** (webhooks, tâches) |
| `lib/supabase/verification.ts` | **Sans cookies**, pour une seule question : « ce mot de passe est-il celui de ce compte ? », avant un geste sensible. Réservé à `lib/auth/` ; la session ouverte est refermée aussitôt (ajouté au tableau le 23/09/2026 — il y manquait) |

`anon.ts` existe parce que `server.ts` lit les cookies : sinon le rendu de la page publique dépendrait de la présence d'un cookie, et **un vendeur connecté verrait sa page autrement que son client**, sans que personne s'en aperçoive avant que ça compte.

`system.ts` est le SEUL client service-role depuis le 23/09/2026, et il est réservé aux chemins **sans humain** (webhooks, tâches). Quand un **humain** de l'administration lit les données d'un tiers, ce n'est jamais par lui : c'est sous SA session — 41 appels de fonctions `security definer` qui vérifient le rôle en base, et 6 lectures de tables sous RLS (compté le 23/09/2026 dans `lib/audit/`). Aucune ne passe par la clé service-role. **Un webhook n'est personne** ; l'auditer noierait les vraies consultations humaines.

---

## Contraintes produit à ne jamais violer

1. **Aucun traitement de paiement SUR LES COMMANDES** — définitif. DropLink ne
   sera jamais un intermédiaire entre un vendeur et son client : c'est ce qui le
   distingue d'une marketplace, et ce qui lui évite d'être responsable de la
   transaction.

   > ⚠️ **LA SECONDE MOITIÉ DE CETTE CONTRAINTE EST TOMBÉE LE 20/09/2026.**
   > Elle disait aussi « ni un abonnement, pas de Stripe, pas de table
   > `subscriptions` ». **Wassim l'a levée explicitement** : « je veux que quand
   > le mec a prix son abonnement et que il a payé via stripe ou lemon squeezy
   > et bah il a son abonnement automatiquement sur le saas ! ».
   >
   > **Le fournisseur est Lemon Squeezy**, et le choix n'est pas technique :
   > c'est un **MERCHANT OF RECORD**. Il encaisse, facture, collecte et reverse
   > la TVA européenne. Avec Stripe, le vendeur du service serait Wassim — donc
   > immatriculation TVA OSS et déclarations trimestrielles à sa charge. Le
   > surcoût mesuré est d'environ **1 € par client et par mois** sur un
   > abonnement à 20 €.
   >
   > **CE QUI RESTE VRAI ET NE BOUGE PAS : aucune carte ne passe par nous.** Le
   > produit ne voit aucun numéro, ne stocke aucun moyen de paiement, n'a aucun
   > montant en base. Ce que `subscriptions` porte est l'**ÉTAT** d'un abonnement
   > tel qu'un tiers nous le raconte (migrations 177-179).
   >
   > ⚠️ **`status` EST GARDÉ BRUT, ET C'EST LA RÈGLE QUI COÛTE LE PLUS CHER SI
   > ON LA RATE** : chez ce fournisseur, `cancelled` ne veut PAS dire « coupé ».
   > L'abonnement court jusqu'à `ends_at`. Un vendeur qui résilie le 2 du mois a
   > payé jusqu'au 30 ; le couper au clic lui vole ce qu'il a réglé.
   > ⚠️ **`past_due` REPASSE EN GRATUIT** (décision de Wassim du 24/09/2026,
   > migration 193 — la 179 le gardait Pro) : un prélèvement échoué coupe le Pro,
   > un paiement réussi (`active`) le rend par le même webhook. Un `cancelled`
   > SANS `ends_at` est gratuit aussi (confirmé le même jour). La traduction vit
   > dans `plan_pour_statut`, à UN SEUL endroit.
   >
   > **Le webhook est la seule surface qui POSE UN PLAN PAYANT.** `/api/*` est
   > hors du middleware : sa seule garde est une signature HMAC-SHA256 vérifiée
   > sur le **corps brut**, à temps constant, **avant toute analyse**. Sans elle,
   > un POST suffirait à s'offrir l'abonnement.
   >
   > ⚠️ **CETTE SIGNATURE PROUVE LA PROVENANCE, PAS LE PAYEUR — et c'était une
   > faille CRITIQUE** (audit ECC du 27/09/2026, migration 204, solution A choisie
   > par Wassim). Sans identifiant, le webhook rattachait le paiement par
   > l'**e-mail saisi chez le fournisseur**, que personne ne prouve posséder : qui
   > connaissait l'adresse d'un vendeur pouvait, par un abonnement qu'il contrôle
   > puis résilie, poser ou RETIRER son plan — jusqu'à rétrograder un vrai client
   > Pro. **Le filet e-mail est supprimé.** Le lien de paiement porte `profil_id`
   > (l'identifiant de PROFIL, pas celui d'authentification) ET sa signature HMAC
   > (secret en base, `signer_lien_paiement` pour l'appelant seul,
   > `verifier_lien_paiement` pour le webhook seul) ; un événement sans preuve
   > valide garde le compte auquel son abonnement a été rattaché à la création, et
   > `appliquer_abonnement` refuse de ré-attacher un abonnement à un autre compte
   > (`DL076`). Un rejeu n'est « déjà traité » que si le premier passage a
   > ABOUTI — un 503 est donc réellement rejoué.
   >
   > **Les maquettes de facturation de l'admin restent non codées** : elles
   > montrent des paiements et des montants que le produit n'a toujours pas, et
   > n'aura pas — c'est le fournisseur qui les détient.

   > ⚠️ **UN QUOTA PAR PLAN N'EST PAS UN PAIEMENT NON PLUS.**
   > Un compte **gratuit** est borné à **15 commandes À VIE** (migrations
   > 175-176), un compte **pro** retrouve le plafond **mensuel**. Le « à vie »
   > est le cœur de la décision — un plafond mensuel se contourne en attendant,
   > celui-ci se contourne en recréant un compte, ce qui laisse une trace que
   > l'administration voit (170-171). Les deux nombres se règlent à l'écran :
   > « 300 commandes pour l'abo à 20 € » s'obtient en écrivant 300 dans
   > `plafond_commandes_mensuel`, sans une ligne de code.

   > ⚠️ **UN QUOTA PAR PLAN N'EST PAS UN PAIEMENT, et la frontière est nette.**
   > Décision de Wassim du 20/09/2026 : un compte **gratuit** est borné à **15
   > commandes À VIE** (migrations 175-176), un compte **pro** retrouve le
   > plafond **mensuel**. Le « à vie » est le cœur de la décision — un plafond
   > mensuel se contourne en attendant, celui-ci se contourne en recréant un
   > compte, ce qui laisse une trace que l'administration voit (170-171).
   >
   > Ce qui reste interdit est **d'encaisser** : le plan est un ÉTAT DU COMPTE,
   > posé **à la main dans l'administration** après un paiement reçu HORS du
   > produit. Les deux nombres se règlent à l'écran — « 300 commandes pour l'abo
   > à 20 € » s'obtient en écrivant 300 dans `plafond_commandes_mensuel`, sans
   > une ligne de code.

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
- **Postgres accorde `EXECUTE` à `PUBLIC` par défaut. Révoquer explicitement, sur CHAQUE fonction, sans exception.** Un droit d'exécution **ne s'écrit pas dans le corps d'une fonction** — aucun contrôle textuel ne peut le voir, il faut **interroger le catalogue**.

  > ⚠️ **CETTE LIGNE DISAIT « + `alter default privileges` POUR QUE L'OBJET
  > SUIVANT NAISSE FERMÉ ». C'EST FAUX SUR CETTE BASE, mesuré le 20/09/2026.**
  >
  > Trois sondages en transaction ANNULÉE sur la base de tests, après qu'une
  > migration a livré deux fonctions ouvertes à `PUBLIC` :
  >
  > | | ACL de la fonction créée |
  > |---|---|
  > | sans rien toucher | `{=X/postgres, postgres=X/postgres, service_role=X/postgres}` |
  > | après avoir RE-exécuté la ligne de la migration 001 | identique |
  > | avec `for role postgres` | identique |
  >
  > `pg_default_acl` porte pourtant l'entrée attendue pour
  > (`postgres`, `public`, fonctions), PUBLIC absent — et les **six**
  > déclencheurs d'événement de la base ont été lus : aucun n'accorde quoi que
  > ce soit sur `public`. **Le mécanisme n'est pas établi, et on ne l'invente
  > pas.** Le comportement, lui, l'est trois fois.
  >
  > **Conséquence pratique, et c'est tout ce qui compte :** une fonction
  > nouvelle naît **OUVERTE**. Le seul geste qui ferme est le `revoke` écrit à
  > la main, et le seul filet quand on l'oublie est
  > `tests/rls/catalogue-droits.test.ts`, qui interroge le catalogue. Croire au
  > réglage par défaut, c'est L-029 — une protection dont personne n'a vu
  > l'effet.
- Ce qui empêche un vendeur de se promouvoir admin doit être un **privilège de COLONNE**, pas une policy (une policy sur `profiles` qui lit `profiles` = récursion infinie).
- **Contrôle par VALEUR, pas par nom.** Une valeur voyage sous n'importe quel nom : un champ sensible republié sous `meta`, `debug`, `commentaire` ou `diagnostic` survit à un contrôle textuel. Injecter des sentinelles uniques et les chercher dans les réponses **et dans le HTML rendu**, charges d'hydratation comprises. **Le `public_token` est la sentinelle prioritaire** : les autres exposent une donnée, celle-là transfère une **capacité**, définitivement.
- **Bucket R2 privé sans exception.** URL signées à expiration. **Clé d'objet générée par le SERVEUR** — une clé fournie par le client permettrait d'écraser le média d'un autre vendeur. **Taille relue côté serveur**, jamais crue depuis le client : c'est la base du modèle de coût.
- **Rate limiting à deux seuils, EN BASE** (pas en mémoire : les instances se multiplient précisément sous la charge à limiter). Compteurs **distincts** entre page publique et admin. **En cas de panne du compteur : la page publique AUTORISE** (refuser pénaliserait les clients d'un vendeur pour un incident qui ne les concerne pas), **l'admin REFUSE** (ça ne pénalise que nous).
- **SVG REFUSÉ, jamais « assaini ».** Ce fichier a longtemps écrit « SVG assainis avant
  stockage » : cet assainissement n'a JAMAIS existé, et ce qui refusait réellement le format
  était l'absence d'un troisième appelant (L-029). Le format est sorti de la table des types
  acceptés — dépôt de média, logo et image de contestation comprises. Le relever est plus
  strict que la règle d'origine, et c'est voulu : héberger du script déguisé en image pour
  gagner un format vectoriel ne vaut pas l'échange (audit du 20/09/2026).

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

### ⚠️ UN APPEL EN LIGNE À UN TIERS + LA FILE DES SERVER ACTIONS = DES MODIFICATIONS PERDUES

**Mesuré au navigateur le 20/09/2026, et ça coûtait cinq modifications sur six.**
Six champs saisis dans l'éditeur, deux secondes entre chacun : **UN SEUL POST est
parti**, un seul champ est arrivé en base. Témoin bloqué sur « Enregistrement… »,
aucune erreur, rien en console — et tout ce qui attendait est perdu si le vendeur
quitte l'écran.

**Deux causes qui se multiplient :**

1. **`marquerPremierContenu` attendait PostHog EN LIGNE**, et `emettre()` n'avait
   aucune borne : 15,5 s par sauvegarde quand le tiers ne répond pas. Pire, la
   marque à usage unique est RENDUE quand l'envoi échoue — donc la sauvegarde
   suivante la re-réclame et re-paie l'appel. Chaque champ, à chaque fois.
2. **Next SÉRIALISE les Server Actions** : tant que la première n'a pas répondu,
   les suivantes ne partent même pas. Une seule action lente les bloque toutes,
   en silence.

**Règle : sur le chemin d'une mutation, tout appel à un tiers est BORNÉ.**
`emettre()` l'est à `BORNE_EMISSION_MS` (1,5 s) ; au-delà l'événement est
abandonné et **compté comme perdu**, jamais déclaré parti — deux appelants rendent
une marque à usage unique sur ce retour. Effet mesuré : 32,4 s → 1,65 s, et 6 POST
pour 6 champs.

> ⚠️ **ET CE BLOC A D'ABORD ACCUSÉ `after`, À TORT.** Il affirmait que Next
> attend les rappels d'`after` avant de terminer la réponse d'une action. **Faux,
> mesuré :** une sauvegarde de numéro de suivi, dont l'attache pose un `after`
> qui DORT 31 secondes, répond en **1,72 s** — colis bien attaché, donc le rappel
> bien posé. Le report par `after` fait ce qu'il promet, pour une page comme pour
> une action. C'était une explication plausible, cohérente avec les durées, et
> jamais exécutée : **L-014 commis en corrigeant L-014.** La mesure qui l'a
> démentie a été faite en cherchant un défaut voisin, pas en relisant.

### ⚠️ AUCUN APPEL À SUPABASE N'ATTEND SANS FIN (23/09/2026)

Mesuré le 04/09 : `/fr/analyses` a rendu 500 après 10,7 s, le serveur d'authentification
ne répondant pas — et rien ne bornait l'attente. Les quatre clients passent désormais par
`fetchBorne()` (`lib/reseau/fetch-borne.ts`, **10 s**) : au-delà, l'appel est abandonné et
suit les chemins de panne existants (`SessionIndisponible`, lecture illisible).

⚠️ **L'abandon s'appelle `AbortError`, et c'est mesuré** : `postgrest-js` 2.112 réessaie
seul une lecture en échec réseau (après 1, 2 puis 4 s) sauf si l'erreur porte ce nom.
Nommée `TimeoutError`, une lecture muette attendait ≈ 47 s — la borne quadruplait
l'attente qu'elle devait couper. `tests/unit/appels-supabase-bornes.test.ts` l'exige.

### ⚠️ LA RÉGION DU SERVICE RAILWAY EST UNE PROPRIÉTÉ DE PERFORMANCE

**Tout service créé pour ce produit doit être en `EU West`** (`Settings → Regions`) : la base
est à Paris, et la région par défaut de Railway (US West) coûtait ~150 ms par appel à la base.
Mesures et histoire : `consignes/historique-du-design.md`.

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

Liste complète des 32 leçons dans `BRIEF-DROPLINK-COMPLET.md` §13.

---

## Workflow

> ⚠️ **UN MESSAGE DE COMMIT NE SE PASSE JAMAIS PAR `-m "…"`, ET ÇA A COÛTÉ UNE
> ÉCRITURE EN PRODUCTION.** Le 13/09/2026, un message contenant des rétro-quotes
> autour de noms de commandes — `` `pnpm db:migrate` ``, `` `railway.json` `` —
> a été passé à `git commit -m` entre guillemets doubles. Bash y a vu des
> **substitutions de commande** et les a EXÉCUTÉES : `pnpm db:migrate` a tourné,
> et la migration 146 s'est appliquée à la base qui sert les clients.
>
> Le geste était dans la courte liste de ce qui n'est jamais automatique, et
> personne ne l'avait décidé. Il s'est trouvé sans conséquence — la migration
> était additive, `verif:prod` rend 29/29 et la production répond — mais c'est
> une chance, pas une protection : le même message aurait pu porter
> `` `pnpm falsifier casser …` ``.
>
> **Toujours `git commit -F -` avec un heredoc à délimiteur QUOTÉ** (`<<'FIN'`),
> qui n'interprète rien. C'est la même famille que « les heredocs abîment les
> échappements » : ce n'est pas le contenu qui est dangereux, c'est la couche
> qui le lit avant sa destination.

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
- Si une décision produit est ambiguë, consulte `BRIEF-DROPLINK-COMPLET.md` avant de demander — la réponse y est souvent.

---

## Travailler avec Wassim

> ⚠️ **LA PERSONNE AU CLAVIER EST SOUVENT MEHDI SEDDIKI, SON FRÈRE** (précisé le 27/09/2026) :
> ne pas l'appeler Wassim. Les « décisions de Wassim » de ce fichier restent des décisions du
> projet ; ce qui suit vaut pour les deux. **Toujours en français**, même quand le livrable est
> en anglais, et **montrer l'avant/après avant tout changement visible du site public**.

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
