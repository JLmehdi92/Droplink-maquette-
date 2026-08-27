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
pnpm test             # vitest, projet unit
pnpm test:rls         # suites BLOQUANTES d'isolation — jamais désactivables
pnpm test:perf        # mesures, avant chaque clôture de phase
pnpm db:migrate       # applique les migrations
pnpm db:types         # régénère les types Supabase
pnpm fumee            # le produit doit RÉPONDRE : serveur réel, statuts et HTML servi
pnpm falsifier        # casse le produit EN BASE, de façon réversible, pour éprouver les sondes
pnpm gates            # les six portes ci-dessus, enchaînées
pnpm check:r2         # dépôt R2 de bout en bout — exige les variables R2_*
```

Après toute modif de schéma : `pnpm db:migrate && pnpm db:types`, sinon les types sont périmés.

**Portes de qualité avant chaque commit :**
```
pnpm typecheck && pnpm lint && pnpm build && pnpm test && pnpm test:rls && pnpm fumee
```

**Ne jamais commiter par-dessus des portes rouges**, même si la cause est ailleurs — c'est comme ça qu'on s'habitue au rouge.

---

## Stack

Next.js 15 App Router · React 19 · TypeScript strict (`noUncheckedIndexedAccess`) · Tailwind v4 · shadcn/ui · dnd-kit · **Supabase** (Postgres + Auth + RLS) · **Cloudflare R2** (médias, bucket privé) · Resend + React Email · PostHog (EU) · Sentry · next-intl (FR + EN) · Zod · 17TRACK (suivi).

**Absent volontairement :** toute librairie de paiement, Three.js, WebGL, tout transcodeur vidéo.

---

## Assets design

> ⚠️ **STITCH EST SUPPRIMÉ — décision de Wassim, 26/08/2026.**
> Ce fichier a longtemps dit « on implémente TOUS les écrans Stitch, c'est une décision produit, pas une suggestion ». **Cette phrase est morte, et le dossier avec elle** : `stitch_droplink_qc_tracking_portal/` a été effacé du dépôt le 26/08/2026, une fois les 20 routes portées sur le canevas. Si un commentaire du code cite encore une maquette Stitch, il parle d'une décision PASSÉE, jamais d'une référence à consulter.

**La source du design est le canevas Claude Design**, validé écran par écran : `https://claude.ai/code/artifact/044de325-d272-4e9e-b3ab-1c345e7121af` — **41 planches**, chaque écran en bureau ET téléphone, plus les planches d'états.

**Les planches sont EXTRAITES sur le disque : `C:/Users/mehdi/Desktop/canevas-droplink/`** (fichiers `.dc.html` + `canvas.json`, hors du dépôt). Ce sont de vraies pages HTML qui portent **toutes les valeurs en clair** : on ne compare donc pas une impression, on compare des nombres. Ré-extraction si le canevas change : `Artifact action:"read"` sur l'URL, puis `node "<skill design>/seed-canvas.mjs" --extract <fichier> --to <dossier vide>`.

> **RÈGLE DE CONFORMITÉ — décision de Wassim, 27/08/2026.** Chaque écran doit
> correspondre à sa planche **au millimètre près**. On ne passe pas à l'écran
> suivant tant que celui en cours n'est pas exactement conforme. Cela vaut pour
> **tous** les écrans, **landing comprise**. En cas de désaccord entre ce
> fichier et une planche, **c'est la planche qui gagne**.

**Design system — les valeurs font foi, pas la prose :**

```
canvas (extérieur)  #c5cbfb    carte-page  #ffffff
app (dashboard)     #f7f7fb    encre       #0e0e13
sourdine            #83858f    filet       #ececf0
pilule noire        #111117    admin       #111117 (chrome sombre)
DÉGRADÉ DE MARQUE   linear-gradient(97deg, #7c5cf5 0%, #f2765e 100%)
rayons              carte 16 · contrôle 12-13 · pilule 9999

RAYON DE LA CARTE-PAGE — DEUX VALEURS, SELON LA SURFACE
  28  surfaces PUBLIQUES  : landing, connexion, inscription, onboarding,
                            conditions, confidentialité, signalement
  24  surfaces AUTHENTIFIÉES : commandes, éditeur, envois, analyses, marque,
                            et les six écrans admin
```

> ⚠️ Ce bloc disait « carte-page rayon 28 », valeur unique. **C'était
> incomplet, et le code a suivi la prose plutôt que le canevas** : `/fr/commandes`
> rendait 28 là où sa planche dit 24. Relevé le 27/08/2026 en comparant les 41
> planches extraites : **15 planches à 24, 6 à 28**, et la coupure est nette —
> elle sépare le public de l'authentifié. Le canevas fait foi ; ce fichier ne
> fait que le rapporter.

Typographie inchangée : **Plus Jakarta Sans** (titres, 800, tracking -0.03em) + **Inter** (corps), servies par `next/font/google` — **jamais de `<link>` vers un CDN de polices**.

**Le dégradé est réservé à UNE SEULE action principale par écran, et uniquement sur les surfaces DropLink** (landing, connexion, inscription, dashboard). Il **n'apparaît jamais** sur `/p/[token]` : cette page porte la couleur DU VENDEUR, pas la nôtre.

**Quatre règles qui survivent à tout changement de design :**
1. **La couleur d'accent est une VARIABLE pilotée par le vendeur**, jamais en dur. Contraste obtenu **automatiquement** par `resoudreAccent()` : 4,5:1 sur le texte, 3:1 sur l'interface. **Sur un aplat d'accent, le texte prend `surRemplissage`, jamais `#ffffff` en dur** — un accent clair rendrait le blanc illisible.
2. **Pas de glassmorphism ni backdrop-blur sur la page publique.** Sur un aplat uni le flou n'a rien à flouter, et c'est ce qui rame le plus sur mobile bas de gamme.
3. **Le vocabulaire de fret disparaît partout** : conteneur, palette, dédouanement, inspecteur QC, lot, tolérances, généalogie. → commande, colis, photos, suivi, client.
4. **Toute animation respecte `prefers-reduced-motion`**, et ne porte jamais d'information.

**Réseaux sociaux du vendeur** (Instagram, TikTok, WhatsApp — **et ces trois-là seulement** : Snapchat et Telegram écartés par Wassim) : facultatifs, stockés sur `shops`, rendus sur la page client **uniquement s'ils sont configurés**. Aucun bloc, aucun logo grisé quand il n'y en a pas.

---

## Quatre surfaces, quatre logiques

**1. `/[locale]/(app)/*` — authentifié, RLS.** Client serveur **avec** session, jamais service-role. Le dashboard est l'écran le plus utilisé : un fournisseur à 200 commandes/semaine y passe sa journée.

**2. `/p/[token]` — jamais authentifié.** Hors du segment `[locale]` (la langue est celle du vendeur, pas de l'URL). Racine de mise en page distincte — c'est le budget, pas l'organisation. Lecture par jeton via vue restreinte. `noindex`.

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

> **Une migration par sujet, numérotée à sa création, JAMAIS rouverte une fois appliquée.** L'ordre lexicographique **EST** l'ordre d'application. Les correctifs sont de **nouvelles** migrations.

- `alter type ... add value` vit **SEUL** dans sa migration.
- **Vérifier que les valeurs d'énumération citées dans les contrats existent réellement.** Une valeur citée mais absente fait échouer l'insertion, et la transaction étant partagée, **annule la mutation entière**.
- **`create or replace function` NE REMPLACE PAS** une fonction dont la liste d'arguments change : il en crée une **SECONDE**. Les deux coexistent et un appel résout l'ANCIENNE, sans erreur. **`drop` explicite obligatoire.**
- Un test compare base et dépôt **DANS LES DEUX SENS** : migration appliquée sans fichier, et fichier jamais appliqué.

---

## Tests — la discipline qui compte le plus

**Falsifier en cassant LE PRODUIT, pas les tests.** Retirer la garde, désactiver `unaccent`, filtrer une colonne dans la vue, ajouter la colonne interdite à l'export. **Si la suite reste verte, elle ne prouvait rien.**

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

- **Plan mode d'abord** sur toute tâche qui touche plus de 2 fichiers. Propose le plan, attends validation.
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
