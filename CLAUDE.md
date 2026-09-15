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
> n'ont aucune colonne, et `shops` ne porte que `watermark_enabled`. Elles ne
> s'implémentent pas au motif qu'elles sont dessinées.

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
> ⚠️ **COMMANDES NE MONTRE AUCUN CONTENU.** Le kit dessine le pseudo et l'adresse
> du client, et « Ouvrir la page client ». Le premier appartient à quelqu'un qui
> n'a jamais eu de compte chez nous, le second transfère une capacité : la liste
> rend référence courte, boutique, statut, transporteur et date, écrit UNE ligne
> d'audit par page (migrations 159-160), et « Voir » mène à la fiche du compte.
> **STATISTIQUES NE REND QUE DES NOMBRES** (migration 161), donc n'écrit rien au
> journal ; la période précédente y est CALCULÉE sur les tables horodatées, et
> l'anneau des abonnements du kit y devient celui des types de compte.

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
couleur, fond, rayon, filet, ombre, remplissage, écart, boîte). **Il apparie par
le TEXTE, jamais par la position** — apparier par position reviendrait à
supposer la réponse, puisque la position est justement ce qu'on mesure — et il
**normalise les chiffres en `#`**, sinon chaque date et chaque compteur des deux
jeux de données ressortirait comme « absent ».

`comparer-au-kit.mjs` rend, pour chaque élément RÉELLEMENT RENDU : boîte,
position, police, graisse, interlettrage, interligne, couleur, fond, image de
fond, rayon, filet, ombre, marge, écart. **C'est un inventaire, pas une
sélection** : la comparaison trie, pas la sonde.

#### ⚠️ LES NEUF PIÈGES, TOUS PAYÉS UNE FOIS

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
6. **LE FICHIER QUI PORTE LE NOM DE L'ÉCRAN N'EST PAS CELUI QUI LE REND.**
   `OrderDetail.jsx` écrit `fontSize: 18` et `letterSpacing: -0.025em` pour son
   `Panel` ; le navigateur rend **19 px et -0,03em**. Les huit écrans vendeur
   sont chargés dans un seul document, `AnalyticsView.jsx` **après**
   `OrderDetail.jsx`, et les deux déclarent un `function Panel` au niveau
   global : la seconde déclaration écrase la première, donc l'écran de détail
   rend le `Panel` des **ANALYSES**. Rien ne le signale — pas d'erreur, pas
   d'avertissement, et les deux composants se ressemblent assez pour que la
   transposition paraisse juste. *Une valeur lue dans un source n'est une valeur
   que si ce source est celui qui s'exécute ; le navigateur, lui, ne peut pas se
   tromper de composant.*

7. **UNE SONDE QUI MESURE UN 404 CERTIFIE LE 404.** Le plafond de débit de
   l'administration refuse douze requêtes enchaînées — c'est la décision 13,
   « côté admin on REFUSE ». La sonde envoyait six routes × deux largeurs,
   recevait des 404, et rapportait pour chacun « aucun débordement, aucune
   police sous 11,5 px, aucune cible sous 44 ». **C'était vrai : une page de
   404 ne déborde pas.** `verifier-ecran-migre.mjs` relève désormais le
   `titre` et la longueur du contenu, et **LÈVE** plutôt que de pousser une
   ligne de rapport. **Sur `/admin`, mesurer DEUX écrans à la fois, pas six.**
8. **UN SERVEUR DE MESURE NE SURVIT PAS À `pnpm gates`.** Les portes
   **reconstruisent `.next` sous le serveur qui tourne** : les noms de morceaux
   changent, les feuilles de style répondent 404 et 500, et l'écran mesuré se
   rend **SANS AUCUN CSS**. Dix minutes passées à croire à un défaut de
   production sur l'administration. ⚠️ **Après chaque `pnpm gates`, tuer le
   serveur et le relancer** — et le vérifier par `Get-CimInstance` : quatorze
   processus `node` étaient encore vivants ce jour-là.

9. **LE KIT PEUT RENDRE SON TEXTE DANS LA POLICE DE REPLI, ET RIEN NE LE DIT.**
   Mesuré le 12/09/2026 : la face latine d'Inter, que `tokens/fonts.css` va
   chercher chez `fonts.gstatic.com`, rendait un `NetworkError` **reproductible**
   dans le Chrome sans fenêtre — pendant que `document.fonts.status` valait
   « loaded » et que `getComputedStyle(...).fontFamily` répondait « Inter ». Le
   kit rendait donc TOUT son texte en Segoe UI. « Retour aux commandes » :
   **149,8 px chez le kit, 157,9 px chez le produit**, même chaîne, même taille,
   même graisse. **Sept pour cent d'écart sur chaque largeur de texte, dans le
   sens qui fait passer le produit pour fautif** — et irréparable par
   construction : on ne rétrécit pas du texte pour rattraper une police.
   - **Le kit sert désormais Inter depuis le dépôt du design system**
     (`assets/fonts/inter-latin-variable.woff2`, sha256 dans `tokens/fonts.css`).
     ⚠️ **Ce dossier est GITIGNORÉ** — décision du 11/09 — donc la correction ne
     voyage PAS : sur une autre machine, il faut la refaire, et `tokens/fonts.css`
     porte la source exacte et la marche à suivre.
   - **Les deux sondes LÈVENT plutôt que de mesurer** (`scripts/sonde-polices.mjs`,
     falsifié aux deux points d'appel) : aucun inventaire n'est écrit si la page
     n'a pas rendu son texte en Inter. *Une sonde qui mesure une police de repli
     certifie la police de repli.*
   - **Elles désactivent aussi le cache HTTP.** Sans ça, une correction apportée
     au design system restait invisible d'un passage à l'autre : on remesurait
     le même écart indéfiniment.
   - ⚠️ **Et la correction a rendu CONFORMES quatre écarts déjà déclarés** sur
     `/commandes` et `/envois` : leurs déclarations ne désignaient plus rien, et
     c'est le contrôle « dans l'autre sens » qui les a sorties.

9. **UN FOND ET UN TEXTE DE LA MÊME VALEUR NE RENDENT RIEN, ET AUCUNE PORTE NE
   POUVAIT LE VOIR.** `bg-ds-erreur text-ds-erreur` est une classe VALIDE,
   servie, et le jeton existe : les deux gardes de couleurs vérifient qu'une
   classe pointe sur une variable définie, jamais que le résultat se LIT. La
   pilule « Suspension d'un compte » du journal d'audit rendait donc un aplat
   rouge **sans une lettre dedans** — et le même défaut vivait **neuf fois**,
   sur cinq écrans d'administration. Il est resté invisible parce que le jeu de
   mesure n'a ni compte suspendu, ni boutique au-dessus de son plafond, ni
   alerte : exactement les trois états qui déclenchent ces pilules.
   `tests/unit/pilules-lisibles.test.ts` compare désormais des **valeurs**, pas
   des noms — les deux jetons sont résolus dans `globals.css` avant d'être
   comparés (L-020).

> ⚠️ **ET UN TEST QUI ÉCHOUE SOUS LA CHARGE N'ACCUSE PAS TOUJOURS LE PRODUIT.**
> `limitation-debit` a rendu « 7 appels autorisés sur un plafond de 4 » une
> seule fois, sous la suite complète, et passait rejoué seul. La cause n'était
> pas le compteur : `fenetre_courante` arrondit `clock_timestamp` à la
> minute, et douze connexions parallèles mettent assez longtemps à s'ouvrir
> pour CHEVAUCHER une bordure — deux fenêtres, deux plafonds, jusqu'à huit
> appels. Le test groupe donc ses résultats **par fenêtre**. *Un test
> intermittent se BORNE, il ne se relance pas jusqu'au vert* — et il garde son
> mordant : falsifié avec `quota-non-atomique`, il rend 7 dans UNE fenêtre.

> ⚠️ **ET LA SONDE PEUT APPRENDRE À IGNORER SES PROPRES ALERTES.** Elle
> signalait onze cibles sous 44 px sur connexion + inscription, dont **aucune
> n'en était une** : quatre champs **enveloppés par leur `<label>`** — la cible
> est alors le label, 56 px, pas l'`<input>` nu de 23 — et quatre **liens en
> ligne dans la prose**, que la règle 5 écarte explicitement. Onze faux
> positifs apprennent à ignorer le douzième, qui serait vrai. Elle les écarte
> désormais **par mesure** — hauteur du `<label>` le plus proche, présence de
> texte autour du lien — jamais par exception nommée.

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

#### ▶️ OÙ ON EN EST, ET LE PROCHAIN ÉCRAN

**TRENTE-DEUX ÉCRANS SORTENT EN CODE 0** — les cinq de l'espace vendeur, le
tableau de bord, les paramètres et la vérification en deux étapes créés, les sept que le kit admin dessine et que la contrainte n° 1 autorise, la page client et son
lien mort, la connexion, l'inscription, le mot de passe oublié, le nouveau mot de passe et l'onboarding, les deux pages légales, le signalement, le blog et ses articles, la documentation, le 404 général, la commande introuvable, la surveillance et la fiche de compte de l'administration :

| écran | relevé kit | manquants | en trop | écarts de valeur |
|---|---|---|---|---|
| `/commandes` | `OrdersView`, sans `CLIC_KIT` | 39 (0 non déclarés) | 43 (0) | **0** |
| `/envois` | `CLIC_KIT="Suivi d'envois"` | 48 (0) | 46 (0) | **0** |
| **l'éditeur** `/commandes/[id]` | `CLIC_KIT="#DLK7842"` | 26 (0) | 48 (0) | **0** |
| `/analyses` | `CLIC_KIT="Analyses"` | 32 (0) | 41 (0) | **0** |
| `/marque` | `CLIC_KIT="Ma marque"` | 26 (0) | 41 (0) | **0** |
| `/admin` | `Overview`, kit **admin** | 54 (0) | 28 (0) | **0** |
| `/admin/commandes` (CRÉÉ) | `CLIC_KIT="Commandes"`, produit à **1545** | 75 (0) | 32 (0) | **0** |
| `/admin/comptes` | `CLIC_KIT="Utilisateurs"`, produit à 1545 | 98 (0) | 31 (0) | **0** |
| `/admin/boutiques` | `CLIC_KIT="Boutiques"`, produit à 1545 | 78 (0) | 30 (0) | **0** |
| `/admin/statistiques` (CRÉÉ) | `CLIC_KIT="Statistiques"` | 62 (0) | 40 (0) | **0** |
| `/admin/journal` | `CLIC_KIT="Logs système"` | 82 (0) | 51 (0) | **0** |
| `/admin/parametres` | `CLIC_KIT="Paramètres"` | 90 (0) | 48 (0) | **0** |
| `/p/[token]` | `ClientPage`, kit **client_link** à 1440 | 39 (0) | 23 (0) | **0** |
| `/connexion` | `LoginScreen`, kit **auth** à 1425 | 13 (0) | 1 (0) | **0** |
| `/inscription` | `CLIC_KIT="Créer un compte"` | 46 (0) | 2 (0) | **0** |
| `/conditions` | `legal/conditions.html` à 1280 | 80 (0) | 25 (0) | **0** |
| `/confidentialite` | `legal/confidentialite.html` à 1280 | 116 (0) | 18 (0) | **0** |
| lien mort `/p/<inconnu>` | `client_link/not-found.html` à 1440 | 2 (0) | 2 (0) | **0** |
| `/tableau-de-bord` (CRÉÉ) | `CLIC_KIT="Tableau de bord"` à 1690 | 48 (0) | 52 (0) | **0** |
| `/parametres` (CRÉÉ) | `CLIC_KIT="Paramètres"` à 1690 | 46 (0) | 18 (0) | **0** |
| `/verification` (CRÉÉ) | `auth/index.html#verification` à **1440**, `DEUX_ETAPES=1` | 0 (0) | 0 (0) | **0** |
| `/docs` | `docs/index.html` à **1280** | 81 (0) | 42 (0) | **0** |
| `/mot-de-passe-oublie` | `auth/index.html#mot-de-passe-oublie` à **1440** | 0 (0) | 0 (0) | **0** |
| `/nouveau-mot-de-passe` | `auth/index.html#nouveau-mot-de-passe` à 1440, `RECUPERATION=1` | 1 (0) | 1 (0) | **0** |
| `/bienvenue` | `auth/index.html#bienvenue` à 1440, `ONBOARDING=1` | 0 (0) | 0 (0) | **0** |
| `/signalement` | `legal/signalement.html` à 1280 | 0 (0) | 0 (0) | **0** |
| `/blog` | `blog/index.html` à 1280 | 0 (0) | 0 (0) | **0** |
| `/blog/[slug]` | `blog/index.html#envoyer-photos-client-sans-lien-qui-expire` à 1280 | 0 (0) | 0 (0) | **0** |
| 404 général `/fr/pas-une-route` | `erreurs/introuvable.html` à 1440, `ECRAN_ERREUR=1` | 0 (0) | 0 (0) | **0** |
| commande introuvable `(app)/not-found` | `seller_app/index.html#introuvable` à 1690 | 4 (0) | 9 (0) | **0** |
| `/admin/surveillance` | `admin/index.html#surveillance` à 1560 | 15 (0) | 9 (0) | **0** |
| `/admin/comptes/[id]` | `admin/index.html#compte` à 1560, route `{profil}` | 23 (0) | 17 (0) | **0** |
| ↳ suspension ouverte | `#compte-suspension` à 1560, `CLIC_PRODUIT="Suspendre ce compte" ETAT=suspension` | 23 (0) | 17 (0) | **0** |
| `/parametres` ↳ deux étapes, mot de passe | `CLIC_KIT="Paramètres > Activer"`, `CLIC_PRODUIT="Activer" ETAT=deux-etapes` | 37 (0) | 20 (0) | **0** |
| `/parametres` ↳ suppression du compte | `CLIC_KIT="Paramètres > Supprimer"`, `CLIC_PRODUIT="Supprimer" ETAT=suppression` (le panneau des données est le même composant) | 37 (0) | 20 (0) | **0** |
| `/parametres` ↳ deux étapes, QR code | `CLIC_KIT="Paramètres > Activer > Continuer"`, `CLIC_PRODUIT="Activer > actuel={motdepasse} > Continuer" ETAT=deux-etapes-qr` | 38 (0) | 21 (0) | **0** |

> ⚠️ **`/nouveau-mot-de-passe` NE S'OUVRE QU'À UNE SESSION DE RÉCUPÉRATION** — sa
> méthode doit être `otp`. `RECUPERATION=1` fait ouvrir à la sonde un VRAI lien
> de réinitialisation (généré par l'API d'administration de la base de tests,
> puis vérifié comme le navigateur le ferait) ; sans lui, la page renvoie à la
> connexion et la sonde mesurerait la connexion. **`ECRAN_ERREUR=1`** lève la garde
> qui refuse de mesurer une page d'erreur — seulement quand c'est elle qu'on
> mesure. ⚠️ Les deux frontières d'erreur (`[locale]/error`, `(app)/error`)
> partagent les composants de ces deux écrans mais ne se déclenchent pas sur
> commande : elles ne sont PAS soustraites. **`ONBOARDING=1`** laisse de même
> le type de compte NUL : `/bienvenue` renvoie aux commandes tout compte qui l'a
> déclaré.

> ⚠️ **LA GARDE DU RAYON DE CARTE-PAGE NE BALAYAIT QUE `src/app`.** Elle annonçait
> « il n'en reste qu'une, l'onboarding » pendant que `components/coque-publique.tsx`
> en posait une pour le blog et le signalement. Elle a balayé `src` le
> 14/09/2026, puis a été SUPPRIMÉE le même jour avec les jetons `--radius-page`
> et `--radius-page-publique` et leurs cinq contrôles de fumée, comme elle le
> demandait elle-même : le blog et le signalement portaient les deux dernières
> cartes-pages du dépôt.

> ⚠️ **`/docs` AVAIT ÉTÉ « PORTÉ » LE 12/09 SANS AVOIR JAMAIS ÉTÉ SOUSTRAIT.** Au
> premier relevé : **108 écarts de valeur** — titres à 26 contre 28, marges de 38
> contre 48, paragraphes à 15 contre 15,5, cercles cochés au lieu de coches, ni
> en-tête collant ni sommaire qui suit la lecture. Un écran absent du tableau
> ci-dessus n'est pas conforme, quel que soit le commit qui l'affirme. Le TEXTE,
> lui, reste celui du produit : 61 fonctions que le kit documente n'existent pas
> (connexion Apple, lien qui expire, brouillon, cloche, intégrations, passage au
> Pro), et une documentation fausse se lit comme une promesse.

> ⚠️ **LES DEUX ÉCRANS D'ADMINISTRATION SANS RÉFÉRENCE EN ONT UNE DEPUIS LE
> 14/09/2026, ET CE PARAGRAPHE DISAIT « IL N'Y A RIEN À SOUSTRAIRE CONTRE RIEN ».**
> C'était vrai, et c'était l'excuse : `surveillance` portait encore `bg-corail`
> et une pastille d'alerte de la couleur exacte de sa carte ; la fiche de compte,
> un bouton de confirmation noir de l'ancien canevas, une icône Material, et
> « 1 modifications de commande ». Les deux sont écrits dans le kit admin
> (`#surveillance`, `#compte` — le tiroir annonçait lui-même « la fiche complète
> quand elle sera maquettée ») puis soustraits. La sonde gagne `{profil}`,
> l'identifiant du compte de mesure. ⚠️ **Le formulaire OUVERT de suspension n'a
> été mesuré que le 15/09/2026** — la sonde ne relevait que l'état replié, et le
> kit ne dessinait que le bouton. Il est écrit dans le kit (`#compte-suspension`,
> vocabulaire `Field` des paramètres, aide en gris de corps parce que la sourdine
> rend 3,2:1) puis porté : le produit rendait des libellés 14/600 en encre, des
> champs à rayon 16 et en 15 px, étrangers à l'administration. La sonde gagne
> **`CLIC_PRODUIT="<texte du bouton>"`** (lève si le bouton manque) et
> **`ETAT=<nom>`**, qui suffixe l'écran pour que l'état ouvert ait ses propres
> déclarations. La planche dessine aussi la largeur RÉSERVÉE de l'état
> d'attente du bouton d'action (« En cours… » et son anneau, invisibles) : sans
> elle, 140 px contre 116.

> ⚠️ **LE TÉLÉPHONE N'AVAIT JAMAIS ÉTÉ SOUSTRAIT, ET SES MISES EN PAGE VENAIENT
> DE L'ANCIEN CANEVAS.** Consigne de Wassim du 15/09/2026 : « je veux la
> meilleure version des écrans pour les mobiles ». La meilleure version n'est ni
> la planche ni le produit : on garde les décisions téléphone écrites (page
> client à plat, barre d'onglets en bas), on prend au kit ce qui est meilleur,
> on L'ÉCRIT dans la planche, puis on porte et on soustrait à 390
> (`ETAT=tel`). Premier lot, la NAVIGATION :
> - **vendeur** — la barre du haut du kit au téléphone (logo, cloche, avatar et
>   son menu Paramètres / Se déconnecter), les cinq onglets du produit en bas.
>   Avant : les paramètres ne s'ouvraient que depuis le tableau de bord, la
>   déconnexion que depuis les commandes, la cloche nulle part ;
> - **administration** — quatre onglets et « Plus » (feuille des quatre
>   autres). Avant : huit onglets dans une barre qui défilait, bords coupés.
> Relevé téléphone des 37 écrans avant ce lot : 1 016 écarts de valeur, dont
> 284 d'apparence — le reste du chantier, écran par écran.
>
> Second lot, les défauts vus à la revue des 33 écrans à 390 px, chacun écrit
> dans sa planche puis porté : **Envois** — la barre de filtres ne défile plus
> (recherche seule, menus deux par deux) ; **Paramètres** — « Enregistrer » sous
> les champs qu'il enregistre, avatar à 64 px ; **Éditeur** — médias sur DEUX
> colonnes (à trois, les coins tactiles de 44 px se chevauchaient sur 105 px) ;
> **Documentation, conditions, confidentialité** — sommaire REPLIÉ
> (`SommaireRepliable`), il passait avant le contenu ; **Surveillance** — badge
> d'état sous la description. La bande d'action collée en bas de l'éditeur n'est
> PAS un défaut : elle ne recouvre le texte que sur une capture pleine page.
>
> Troisième lot, **les seize petits écrans sortent en code 0 à 390** (`<écran>-tel`
> dans `ecarts-declares.json`) : accès (connexion, inscription, vérification, mot
> de passe oublié et nouveau, onboarding), lien mort, commande introuvable,
> signalement, blog et article, conditions, confidentialité, documentation, 404.
> Écrit dans les planches : en-têtes publics sur UNE ligne (Documentation et
> Accueil sous 640 px), gouttière de 16, titres 27-30 au lieu de 44, liens de pied
> à 44 px par marge négative, liens du pied groupés ; carte d'accès calée en haut,
> logo de carte à 40, en-tête de 44 ; onboarding avec son « Étape 1 sur 2 » et
> ses deux types de compte empilés (81 px de texte chacun côte à côte) ; commande
> introuvable plein écran comme l'éditeur ; barre vendeur de 62 px. Porté dans le
> produit : carte d'accès 24/20/30, titres 24, marges de 16.
> ⚠️ **La soustraction ne compare pas l'alignement du texte** : un chapeau de
> carte centré au produit et aligné à gauche au kit sortait à zéro écart. Seule
> la capture l'a montré.
>
> ⚠️ **`volatile: true`** dans `ecarts-declares.json` : la seule déclaration
> qu'on n'exige pas de retrouver, réservée aux données que les suites réécrivent
> selon leur ordre (âges du journal, lignes de suspension). Toute autre
> déclaration morte fait toujours échouer la soustraction.

> ⚠️ **LES ÉTATS AU CLIC SE MESURENT PAR SÉQUENCE.** `CLIC_KIT` et `CLIC_PRODUIT`
> acceptent `« étape > étape »` ; côté produit, une étape `nom=valeur` remplit le
> champ `name=nom` (`{motdepasse}` : celui du compte de mesure). **La planche de
> l'activation en deux étapes contredisait une règle verrouillée** : elle
> montrait le QR code et la clé de secours AVANT le mot de passe — un cookie volé
> suffisait donc à lire la clé d'un facteur neuf. Le produit ne crée le facteur
> qu'après le mot de passe ; la planche a été réécrite en deux étapes le
> 15/09/2026, et la seconde se mesure avec un VRAI facteur enrôlé sur le compte
> de mesure.

> **`IMAGES_EN_ATTENTE=1`** retient toutes les requêtes d'images : l'écran se
> mesure dans l'état qu'un client voit en 4G, et la sonde sort en code 1 sur
> toute image sans place réservée (boîte nulle dans un sens). Sans lui, le jeu
> de mesure — dont les clés n'existent pas dans le bucket — ne montre que des
> images EN ERREUR, que Chrome réduit à une bande de texte alternatif : la photo
> du visionneur y ressemblait à un défaut qui n'en était pas un. Falsifié en
> retirant ses dimensions (0×0) ; passé le 15/09/2026 sur les 33 écrans et le
> visionneur ouvert (`CLIC_PRODUIT="Agrandir la photo 1"`, qui trouve un bouton
> par son nom accessible) : aucune image sans place.

> ⚠️ **LES COULEURS D'ÉTAT SE LISAIENT À 2,69:1 EN TEXTE, PARTOUT.** Pastilles
> de statut, boutons « Supprimer », messages d'erreur : le -500 servait d'aplat
> ET de texte, dans le kit comme dans le produit. Décision de Wassim
> (15/09/2026) : trois ENCRES, même teinte, luminosité abaissée. Kit : 144
> avant-plans passés à `--status-*-ink` (bundle compris — les pages chargent
> `_ds_bundle.js`, pas `components/`), 43 aplats gardés ; les ICÔNES sur fond
> teinté suivent l'encre, parce que le -500 n'y tenait pas même 3:1 (ambre
> 2,44). Produit : 119 utilitaires. `tests/unit/encres-etat-lisibles.test.ts`
> résout et mesure chaque `text-ds-<état>`, falsifié deux fois. **Remesure
> complète des 36 relevés, kit et produit : aucun écart de couleur**, et les
> relevés comptent 470 textes à l'encre au kit, 335 au produit, zéro au -500
> côté produit.
>
> ⚠️ **ET LA REMESURE A SORTI TROIS ROUGES QUI N'ÉTAIENT PAS DES COULEURS.** Les
> analyses déclaraient la semaine « 22/06 » en toutes lettres — morte au
> changement de semaine, passée en motif. Et la base de tests gardait, APRÈS
> `pnpm gates`, un plafond de colis à 33 écrit par `parametres.test.ts` : la
> remise à zéro des paramètres ne tournait qu'à l'entrée des suites. Elle tourne
> désormais aussi au `teardown`.

> ⚠️ **LE TEXTE INDICATIF DES CHAMPS SE LISAIT À 2,20:1.** Le design system ne lui
> donnait aucune couleur — le kit rendait le gris par défaut de Chrome, 4,61:1 —
> et onze champs du produit le posaient en « estompé ». Écrit dans
> `tokens/base.css` (`::placeholder` au gris de corps : 4,91 sur la carte, 4,55
> sur le creux), porté en `@layer base` et sur les onze champs ;
> `tests/unit/textes-indicatifs-lisibles.test.ts` RÉSOUT chaque couleur et mesure
> son contraste, falsifié trois fois (un champ, la règle de base, une valeur
> arbitraire). Aucune soustraction ne pouvait le voir : un texte indicatif n'est
> pas un texte de la page.

> ⚠️ **LE KIT ADMIN SE SERT À 1560, PAS À 1690.** C'est écrit dans l'en-tête de
> sa page — `viewport="1560x1040"` — et la largeur UTILE est donc 1545. Mesurer
> l'administration à 1690 comparerait deux choses différentes, et l'écart se
> lirait comme une erreur d'implémentation.

> ⚠️ **LE KIT ADMIN A DEUX TUILES ET TROIS ANNEAUX, ET LES CONFONDRE FAIT UN
> ÉCRAN CONFORME À LA MAUVAISE RÉFÉRENCE.** `AdminStat` — vue d'ensemble, icône
> 52, remplissage 20/22, libellé 14, valeur 28 — contre `OrderKpi` — écrans de
> liste, icône 44, remplissage 16/18, libellé 13 en interligne 1,35, valeur 23.
> Et `AdminDonut` se pose à **190** sur la vue d'ensemble, **165** sur les
> écrans de liste, **124** quand il partage sa colonne avec deux autres
> panneaux ; ses deux polices de centre en DÉRIVENT (`max(15, rond(côté ×
> 0,16))` et `max(9,5, rond(côté × 0,072))`), donc les recopier revient à se
> tromper six fois. `TuileVolume` et `Anneau` portent les variantes.

> ⚠️ **UN `<details>` REPLIÉ EST MESURÉ COMME UN `<select>` OUVERT.** Les
> sélecteurs d'administration sont des `details` — le filtre vit dans l'URL,
> donc pas d'îlot client. L'œil ne voit qu'un libellé, la sonde relève TOUTES
> les options : leurs libellés se déclarent là où ils diffèrent de ceux du kit.
> Un commentaire du dépôt a affirmé le contraire pendant une heure.

⚠️ **LE PRODUIT NE SE MESURE PAS TOUJOURS À LA MÊME LARGEUR QUE LE KIT.** Les
deux relevés doivent porter la même largeur UTILE — 1675 —, et c'est la barre de
défilement qui décide : le kit l'a toujours, donc il se sert à **1690** ; le
produit ne l'a que sur les pages assez hautes. `/commandes` et `/envois` se
mesurent donc à **1675**, l'éditeur à **1690**. L'outil refuse de soustraire deux
largeurs différentes, et c'est lui qui le dit.

⚠️ **L'ÉDITEUR EST LE SEUL ÉCRAN À RÉPONDRE À DEUX PLANCHES.** Le kit sépare une
vue de LECTURE (`OrderDetail.jsx`) d'un FORMULAIRE (`CreateOrder.jsx`) ; le dépôt
n'a **aucune route de création** — la Server Action crée la ligne et redirige
vers `/commandes/<id>`, et la décision 16 interdit le bouton d'enregistrement.
La référence est donc `OrderDetail`, et la disposition emprunte à `CreateOrder`
son couple formulaire + aperçu, qui vient en premier.

⚠️ **UN JEU DE MESURE PAUVRE FABRIQUE DE FAUX « ÉCARTS DE DONNÉE ».** Il ne
créait ni média, ni événement de commande, ni ouverture de lien, ni colis livré
dans la fenêtre, et aucune commande n'avait d'arbitrage qualité. Six panneaux
rendaient donc leur état VIDE, et rien ne distinguait « la règle du `null`
s'applique » de « le calcul est cassé » — la tentation étant alors de déclarer
« la base ne le porte pas ». L'enrichir a fait surgir **trois éléments que les
écrans rendaient depuis toujours sans qu'aucune mesure ne les voie.**

⚠️ **ET IL A ROUVERT LES TROIS ÉCRANS DÉJÀ VERTS.** Deux compteurs d'alerte
étaient déclarés EN TOUTES LETTRES — « 4 commandes jamais ouvertes » — sur un
chiffre que le jeu produit. *Une déclaration littérale posée sur une valeur du
jeu de mesure meurt au premier changement de jeu, et l'écran sort rouge sans
qu'aucun défaut soit en cause.* Ces valeurs-là se déclarent par MOTIF.

⚠️ **`/analyses` A DEMANDÉ UNE MIGRATION, ET C'EST UNE DÉCISION DE WASSIM.** Les
agrégats groupés de PostgREST sont **désactivés** sur ce projet — mesuré :
`select=carrier_code,count()` répond « Use of aggregate functions is not
allowed ». Cinq panneaux du kit exigeaient donc une fonction SQL. Voir
`pnpm db:migrate:tests` plus haut : le code est écrit et appliqué à la base de
tests ; **la production attend `pnpm db:migrate`, AVANT le déploiement.**

⚠️ **L'ADMINISTRATION A DEMANDÉ CINQ MIGRATIONS, ET DEUX D'ENTRE ELLES SONT DES
CORRECTIFS DE MES PROPRES MIGRATIONS.** 148 (boutiques et répartition par
statut), 149 (commandes jour par jour), 150 (le « dont N sans type » que la 148
avait reperdu), 151 (filtre de statut sur la liste des comptes, et inscriptions
récentes), 152 (répartition du journal). *Une migration qui recrée une fonction
pour en changer la signature RÉÉCRIT tout son corps, donc elle hérite de la
responsabilité de TOUTES les corrections passées de ce corps.* La 150 existe
parce que ce n'était pas fait.

**LA LANDING SORT AUSSI EN CODE 0**, contre `marketing_site` à **1280** —
105 manquants, 31 en trop, 31 écarts de valeur, tous déclarés. Elle passe de
115 éléments rendus à 191 : les trois promesses du héros, une section « comment
ça marche » en trois étapes, six cartes de fonctionnalité, un pied en colonnes,
et la bannière d'appel dégradée du kit.

**LA PAGE CLIENT `/p/[token]` SORT EN CODE 0**, contre `client_link` à
**1440** — 39 manquants, 23 en trop, 22 écarts de valeur, tous déclarés. Elle
passe de 93 éléments rendus à 201, et vérifiée à 390 px en fr, en et zh-CN.

```
node scripts/comparer-au-kit.mjs   "http://127.0.0.1:8123/ui_kits/client_link/index.html" 1440   out/editeur/kit-client.json out/editeur/KIT-client.png
MSYS_NO_PATHCONV=1 INVENTAIRE=out/editeur node scripts/verifier-ecran-migre.mjs   http://localhost:<port> "/p/{jeton}" 1440 out/editeur
LANGUE_BOUTIQUE=en MSYS_NO_PATHCONV=1 node scripts/verifier-ecran-migre.mjs   http://localhost:<port> "/p/{jeton}" 390 <dossier>
```

⚠️ **CE N'ÉTAIT PAS UNE PASSE DE DÉTAIL, ET ELLE A DEMANDÉ UNE MIGRATION.** Le
bandeau à la couleur du vendeur a laissé place aux cartes du kit : identité de
la boutique, « Votre commande » avec sa référence et une frise à quatre étapes
datées, galerie en grille uniforme, validation, historique, livraison, contact.
La référence courte (« #A1B2C3 ») n'était pas lisible par la page — la lecture
publique ne rend pas l'identifiant, et c'est délibéré : **la migration 153** la
calcule EN BASE, par la formule de `referenceCourte()`, et
`tests/rls/page-publique.test.ts` compare les deux sur une vraie commande.
**La production attend `pnpm db:migrate` pour 147 à 153, AVANT le déploiement** ;
sans la 153, la carte omet sa référence plutôt que d'écrire « undefined ».

⚠️ **LA PAGE LIT `LANGUE_BOUTIQUE`, PAS SON URL.** Elle vit hors de `[locale]` :
la sonde ne peut la vérifier en anglais ou en chinois qu'en réglant la langue de
la boutique du jeu, et c'est ce que fait cette variable.

⚠️ **LE BANDEAU ÉCRIT SUR UNE TEINTE, ET `texte` NE SUFFISAIT PAS.** `texte` vise
4,5:1 contre le fond de page ; une teinte à 10 % est plus sombre. `resoudreAccent`
rend désormais `teinte` et `surTeinte`, re-mesurée contre la teinte, et
`tests/unit/contraste.test.ts` l'éprouve sur les couleurs extrêmes. Le gris de
corps du kit sur cette teinte tombait à 4,3:1 : le bandeau écrit un cran plus
foncé.

**CE QUE LA PAGE NE PORTE PAS, ET QUI EST DÉCLARÉ** : les gages « Qualité 1:1 »
(principe II) et leurs promesses, la carte « Notifications automatiques »
(décision 3), la carte « Découvrir DropLink » et le « © DropLink » du pied
(décision 25), le sélecteur de langue, le lien « Aide », le pays de livraison
(la base n'a pas d'adresse), le bouton « Voir tout » (36 px, sous la cible
tactile), et « en temps réel », qui n'est pas vrai.

**LA CONNEXION ET L'INSCRIPTION SORTENT EN CODE 0** contre le kit `auth`, à
**1425** : sa page porte une barre de défilement, et l'outil refuse de soustraire
deux largeurs utiles différentes. Vérifiées à 390 px dans les trois langues.

```
node scripts/comparer-au-kit.mjs "http://127.0.0.1:8123/ui_kits/auth/index.html" 1440 out/editeur/kit-connexion.json
CLIC_KIT="Créer un compte" node scripts/comparer-au-kit.mjs "http://127.0.0.1:8123/ui_kits/auth/index.html" 1440 out/editeur/kit-inscription.json
AUTH_GOOGLE_ACTIF=1 node scripts/servir-contre-tests.mjs
MSYS_NO_PATHCONV=1 INVENTAIRE=out/editeur node scripts/verifier-ecran-migre.mjs http://localhost:<port> "/fr/connexion,/fr/inscription" 1425 out/editeur
```

⚠️ **LE SERVEUR DE MESURE DOIT ÊTRE LANCÉ AVEC `AUTH_GOOGLE_ACTIF=1`.** Sans lui
le bouton Google rend `null`, et la mesure se fait sur une carte que la
production ne sert pas. C'est exactement ainsi qu'est resté caché le défaut de
cette passe : le bouton porte son séparateur « ou », les deux pages en posaient
un SECOND — deux « ou » empilés en production, un « ou continuer avec » suivi de
rien partout ailleurs. Le séparateur vit désormais dans `bouton-google.tsx`, non
exporté.

⚠️ **UNE GRILLE SANS COLONNE DÉCLARÉE N'EST PAS UNE GRILLE À UNE COLONNE.** Sa
piste implicite est `auto`, qui prend la largeur MINIMALE de son contenu : la
carte d'accès débordait de 8 px à 390, parce qu'un champ mot de passe réclamait
330 px. `grid-cols-[minmax(0,1fr)]` sous le palier.

**LES PAGES LÉGALES ET LE LIEN MORT SORTENT EN CODE 0.**

⚠️ **LE KIT `legal` A ÉTÉ PORTÉ POUR SA COQUE, PAS POUR SON TEXTE.** Ses
conditions sont un gabarit : abonnement Pro à 19,90 € prélevé chaque mois,
prestataire de paiement, Apple, double authentification, pays et e-mail de
l'acheteur. La contrainte n° 1 interdit la moitié, le reste décrit un autre
produit. Le texte juridique reste celui du produit — lacunes affichées dans la
pastille « à compléter » du kit — et le brief exige toujours sa validation par
un avocat avant toute ouverture publique.

⚠️ **LE LIEN MORT N'A QU'UNE PAGE, ET LA PLANCHE « LIEN EXPIRÉ » N'EST PAS
PORTÉE.** Le jeton n'expire jamais, et jeton inconnu, révoqué ou compte
suspendu doivent rendre la même réponse. Le titre du kit (« Cette commande est
introuvable ») est faux de deux des trois cas.

⚠️ **UNE GARDE QUI CHERCHE `#RRGGBB` SUIVI D'UNE FRONTIÈRE DE MOT NE VOIT PAS
LES DÉGRADÉS ARBITRAIRES DE TAILWIND.** Dans `#F2F0FD_0%`, le `_` est un
caractère de mot : `couleurs-en-dur` laissait passer toute couleur écrite dans
un `bg-[linear-gradient(…)]`. Le motif exige désormais seulement qu'aucun
septième chiffre hexadécimal ne suive.

**LE TABLEAU DE BORD EST CRÉÉ**, et il ne calcule rien : chacun de ses
panneaux est celui des Analyses, sous la même RLS, dans une taille « section »
et un remplissage serré que le kit lui donne. Il n'est PAS la page d'arrivée —
la connexion mène toujours aux commandes, l'écran où l'on passe sa journée.

⚠️ **AJOUTER UNE ENTRÉE DE NAVIGATION ROUVRE LES ÉCRANS VENDEUR.** Leurs
déclarations de décalage de la barre latérale citaient l'entrée « Tableau de
bord » absente ; une fois créée, vingt d'entre elles ne désignaient plus rien.
« Paramètres » a refait la même passe sur six écrans.

**LES PARAMÈTRES SONT CRÉÉS — décision de Wassim : « tu ajoutes les features
mais bien sécurisé ».** Première phase : nom affiché, adresse, mot de passe,
langue de l'interface, sessions actives. **La double authentification, l'export
et la suppression des données et du compte viennent aux phases suivantes.**

⚠️ **TOUT CE QUI PROTÈGE LE COMPTE EXIGE LE MOT DE PASSE ACTUEL.** Une session ne
suffit pas : un cookie volé en est une. `lib/auth/reauthentification.ts`
consomme le quota du mot de passe AVANT de vérifier, lit l'adresse EN BASE, et
ferme aussitôt la session de vérification, ouverte sur un client dédié
(`lib/supabase/verification.ts`, sa propre cloison) — `server.ts` aurait
remplacé la session du vendeur. Plancher de 1,2 s sur chaque geste.

⚠️ **UNE CONSTANTE EXPORTÉE D'UN MODULE `"use client"` ARRIVE VIDE DANS UN
COMPOSANT SERVEUR.** Ce qu'il reçoit est une RÉFÉRENCE client, pas la chaîne :
les boutons et les champs de l'écran sortaient sans filet ni fond, typecheck,
lint et tests verts. Seule la capture l'a montré.

⚠️ **SUPABASE ENREGISTRAIT « node » COMME APPAREIL DE CHAQUE SESSION.** Une
session s'ouvre depuis une Server Action : c'est notre serveur qui appelle
l'authentification. `server.ts` transmet désormais l'agent du navigateur —
sans quoi « Voir les sessions » n'aurait reconnu aucun appareil, en production
comme en local.

⚠️ **UNE DATE DU JEU DE MESURE NE DOIT PAS ÊTRE « MAINTENANT ».** La date de
mise à jour des colis déplaçait « Actualiser » de 0 à 13 px d'une minute à
l'autre, et sa déclaration mourait un passage sur deux. `verifier-ecran-migre`
la fixe en fin de jeu sur celle du kit, en suspendant le déclencheur qui la
réécrit, dans une transaction.

**LA DOUBLE AUTHENTIFICATION EST EN PLACE, ET ELLE TIENT EN BASE.**

⚠️ **UNE REDIRECTION NE PROTÈGE RIEN CONTRE QUI CONNAÎT LE MOT DE PASSE.** Il
obtient une session `aal1` valide et appelle PostgREST à la main. La migration
156 pose un **crochet `db_pre_request`** (`exiger_aal_du_compte`), exécuté avant
CHAQUE requête — tables ET fonctions `security definer`, que des policies
restrictives n'auraient pas couvertes. Éprouvé avec de vrais facteurs TOTP
(`tests/aide/totp.ts`), falsifié trois fois. `pnpm verif:prod` ne compare pas
les réglages de rôle : après `db:migrate`, vérifier à la main que
`authenticator` porte `pgrst.db_pre_request`.

⚠️ **LE PROFIL REND UN ÉTAT, PAS `null`.** `lireEtatDuCompte()` distingue
`profil`, `aucun` et `verification` ; `lireProfilVendeur()` rend toujours
`null` pour les deux derniers, donc tout appelant existant refuse, fermé. Les
gardes qui ORIENTENT — layout vendeur, pages, suite de connexion, `/bienvenue`,
récupération — lisent l'état. ⚠️ **Le layout redirige EN PARALLÈLE de la page,
et sa redirection gagne** : le brancher seul sur la page envoyait une session
`aal1` vers la connexion, en boucle.

⚠️ **ÉCRAN ÉCRIT DANS LE KIT D'ABORD** (`VerifyScreen` dans `ui_kits/auth`, le
panneau d'activation dans `SettingsView`) — et **le design system est
gitignoré** : ces planches ne voyagent pas avec le dépôt. La planche ne défile
pas : elle se mesure à **1440**, pas à 1425.

⚠️ **APPAREIL PERDU ET MOT DE PASSE OUBLIÉ : AUCUN RECOURS EN LIBRE-SERVICE.**
Supabase refuse en `aal1` le changement de mot de passe et le retrait du
facteur. La clé de secours montrée à l'activation est le recours ; au-delà,
seul un geste de service retire le facteur — décision de Wassim s'il faut
l'outiller côté administration.

**L'EXPORT DES DONNÉES EST EN PLACE** (`/api/compte/export`, JSON), **SANS LES
NOTES INTERNES** : la décision 15 vaut pour tout fichier qui sort, pas seulement
pour le CSV. Ni adresse du client final, ni jeton de désabonnement, ni
empreintes de visiteurs. Contrôlé par sentinelles dans le fichier sérialisé,
404 en `aal1`, plafond de débit partagé avec l'export CSV.

**LA SUPPRESSION DU COMPTE ET DES DONNÉES EST EN PLACE — décision de Wassim du
13/09/2026, option A** : tout part, sauf l'adresse et les dates d'inscription
et de suppression, gardées UN AN (`comptes_supprimes`) puis effacées par la
veille. Migrations 157 et 158.

⚠️ **UNE SEULE TRANSACTION, SANS CLÉ DE SERVICE.** La fonction SQL `supprimer_mon_compte` (migration 157)
vérifie que le compte est ACTIF (un compte suspendu n'efface pas le contenu
signalé), que la confirmation reprend son adresse, écrit la conservation, met
les clés R2 en file et supprime `auth.users` — la cascade emporte le reste.
Le propriétaire des fonctions peut supprimer cette ligne : mesuré, pas supposé.

⚠️ **LE BUCKET NE S'ÉNUMÈRE PAS, DONC UNE CLÉ HORS FILE EST PERDUE POUR
TOUJOURS.** `purges_r2` reçoit les clés DANS la transaction ; la purge est
tentée aussitôt et rejouée par la veille jusqu'au succès. Une clé n'est purgée
que si sa vignette et sa couverture ont répondu. ⚠️ Les seuls identifiants R2
de la machine sont ceux de la PRODUCTION : la purge s'éprouve sans réseau
(`tests/unit/purge-r2.test.ts`), et les médias témoins portent des clés à UUID
aléatoire.

⚠️ **UNE SUPPRESSION ÉTENDUE AU VOISIN EST LA PIRE PANNE CONCEVABLE, ET ELLE
SERAIT SILENCIEUSE** : `tests/rls/suppression-du-compte.test.ts` compte les
lignes du voisin par le rôle qui voit tout, et il a été falsifié sur ce cas.

⚠️ **REACT 19 RÉINITIALISE UN FORMULAIRE APRÈS CHAQUE ENVOI.** En pilotant, un
second envoi « ne partait pas » : le mot de passe s'était vidé, et le champ
`required` bloquait l'envoi dans le navigateur, sans un message. Ce n'était pas
le produit — mais une sonde qui rejoue un formulaire doit ressaisir TOUS ses
champs.

**La production attend `pnpm db:migrate` pour 147 à 163, AVANT le
déploiement.**

⚠️ **LA COULEUR PAR DÉFAUT DES VENDEURS ÉTAIT RESTÉE CELLE DU CANEVAS MORT.**
`shops.accent_color` valait `#7c5cf5` par défaut (migration 100) et
`ACCENT_DEFAUT` aussi, trois jours après que le design system — `primary:
"#5B4BF5"` sur Ma marque et sur la page client — l'a remplacé. Tout vendeur qui
n'a rien configuré montrait l'ancien violet à ses clients. Aucune sonde ne
pouvait le voir : le jeu de mesure prenait lui aussi le défaut de la colonne, et
une déclaration « la boutique du jeu porte #7c5cf5 » excusait l'écart. **La 163
change le défaut sans réécrire une ligne** (la valeur stockée fait foi) ; la
métrique « couleur personnalisée » compare désormais aux trois défauts
historiques. Et cette déclaration MASQUAIT un second défaut : la pastille « En
cours » était à 10 % d'accent au lieu des 12 % de `--accent-soft`.
`resoudreAccent` rend désormais `doux` et `surDoux`.

⚠️ **ET DEUX GARDES ÉTAIENT ANCRÉES AU CANEVAS MORT.** `accent-defaut.test.ts`
exigeait `#7c5cf5`, et `couleurs-en-dur.test.ts` acceptait l'ancien violet mais
REFUSAIT l'accent du design system. Un test qui fige une référence la fige aussi
quand elle meurt : le second lit désormais les jetons `--color-ds-*` de
`globals.css`.

⚠️ **LES ÉCRANS ADMIN QUI LISENT TOUTE LA PLATEFORME SONT DANS LE BANC, ET LE
BANC A TROUVÉ UNE REQUÊTE QUI DEMANDAIT TRENTE-SIX PARCOURS.** Mesuré le
14/09/2026 sur 219 200 commandes, seuils écrits avant : la liste admin des
commandes emprunte son index partiel et lit moins d'une page ; les statistiques
tiennent entre 5 et 474 ms — sauf `croissance_admin`, à 1 118 ms pour un seuil
de 1 000. Il ne manquait pas d'index (L-017) : une sous-requête corrélée par
mois ET par table relisait neuf fois les mêmes lignes. La 162 lit chaque table
une fois.

⚠️ **LE PROTOCOLE « DEUX SÉRIES CONCORDANTES » VIVAIT EN QUATRE COPIES, ET ELLES
AVAIENT DIVERGÉ** : celle du banc des boutiques ne vérifiait aucune concordance.
Il vit désormais dans `tests/aide/series.ts`, avec une troisième série qui
DÉPARTAGE (jamais qui remplace) quand l'instance partagée fait prendre vingt
millisecondes à une série — mesuré : « 8,6 ms puis 30,7 ms ».

⚠️ **LES SONDES DE MESURE LAISSAIENT LEURS COMPTES EN BASE.** La suppression
vivait à leur dernière ligne : chaque passage interrompu laissait un compte —
ADMINISTRATEUR pour `verifier-ecran-migre` —, sa boutique et ses commandes.
Trente-trois se sont accumulés du 11 au 14/09, et personne ne les voyait tant
qu'aucun écran ne listait toute la plateforme : c'est la liste admin des
commandes qui les a montrés. Elle vit désormais dans un `finally`.

⚠️ **ET LES DÉCLARATIONS DES ÉCRANS ADMIN TENAIENT À CES RÉSIDUS.** « dont 15
avec un nom de boutique », « 4,1 Mo », « 20 comptes au total » : déclarés en
toutes lettres, ils sont tous morts à la purge. Un écran d'administration lit
TOUTE la base de tests — comptes, compteurs, dernières lignes du journal que les
suites écrivent à chaque passage des portes. Ce qui y varie se déclare par
MOTIF ; et le journal, lui, change encore d'un passage à l'autre : on le remesure
juste avant de conclure, jamais sur un relevé de la veille.

⚠️ **UN `<svg>` POSITIONNÉ EN ABSOLU NE S'ÉTIRE PAS ENTRE `left` ET `right`.**
C'est un élément remplacé : il prend sa largeur intrinsèque. La courbe de la vue
d'ensemble tenait donc dans ses cent premiers pixels depuis sa création, avec des
mois écrits en français sur la page chinoise. Aucune porte ne pouvait le voir —
la soustraction compare des textes, un tracé n'en a pas. **Regarder la capture
n'est pas facultatif.**

⚠️ **LE SEPTIÈME ONGLET A FAIT SE CHEVAUCHER LA BARRE DU TÉLÉPHONE** :
« PanneauCommandesComptesBoutiques », sans aucun débordement du document, donc
sans alerte de la sonde. La barre défile désormais, et l'onglet courant est
ramené dans la vue.

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
