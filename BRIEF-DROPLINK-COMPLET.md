# DropLink — Brief complet du projet

> Document de contexte exhaustif. Tout ce qui doit être su pour construire le produit
> de zéro, sans avoir lu autre chose.
> Langue de travail : **français**, y compris commentaires de code, messages de commit
> et documentation.

---

## SOMMAIRE

1. Le produit en une page
2. Positionnement, marché, personas
3. Les décisions produit verrouillées
4. Les principes non négociables
5. Architecture technique
6. Le modèle de données
7. Les écrans, un par un
8. Le design system
9. Sécurité — règles détaillées
10. Performance — budgets chiffrés
11. Instrumentation et métriques de verdict
12. Risque légal et mitigations
13. Méthode de travail et discipline de vérification
14. Ce qui est bloqué et sur qui
15. Glossaire

---

<a id="1"></a>
## 1. LE PRODUIT EN UNE PAGE

**Une page privée par commande, pour ceux qui vendent en direct sans boutique.**

Le vendeur crée une page par commande : il dépose les photos et vidéos de contrôle
qualité, colle le numéro de suivi, et obtient **un seul lien brandé à ses couleurs**.
Il l'envoie à son client, qui consulte tout lui-même. Fini le renvoi photo par photo
et les « c'est où mon colis ».

**Analogie de référence : Pixieset pour les commandes.** Pixieset (1M+ photographes)
a validé exactement ce modèle : lien privé par livrable + moment de marque.

### Les trois features qui font la différence

Si un arbitrage doit être fait, ces trois-là passent avant tout le reste :

1. **Import QC en 1 clic depuis un lien de commande agent** (CNFans, Kakobuy,
   Sugargoo, ACBuy) — le vrai gain de temps face au combo Drive + WeTransfer +
   capture d'écran.
2. **Suivi auto multi-transporteurs dans le même lien** — tue le « c'est où mon
   colis ».
3. **Page brandée par commande, modifiable en direct sans changer le lien** — la
   crédibilité que Drive ne donnera jamais.

### Trois niveaux d'accès, jamais confondus

| Qui | Compte ? | Surface |
|---|---|---|
| **Celui qui crée** les commandes | **Oui, obligatoire** | `/app/*` — dashboard, éditeur, RLS |
| **Celui qui consulte** le lien | **JAMAIS** — pas d'inscription, pas d'app, pas de mot de passe | `/p/[token]` — lecture par jeton |
| **L'admin** (nous) | Rôle vérifié **en base**, à chaque requête | `/admin/*` — audité systématiquement |

Le champ destinataire est **un texte libre** (`customer_label`), un pseudo. Pas un
compte, pas une recherche d'utilisateur. L'email de notification est optionnel et ne
crée pas de compte.

### Statut

**Phase de validation. Produit GRATUIT. Aucune facturation, aucun code de paiement,
pas de table `subscriptions`.** Les maquettes de facturation existent et sont
conservées pour la phase 2 ; le code viendra plus tard.

**Le livrable réel du MVP, c'est la donnée d'usage**, pas le revenu.

---

<a id="2"></a>
## 2. POSITIONNEMENT, MARCHÉ, PERSONAS

### Deux profils, même produit

| | **Fournisseur** (Chine) | **Revendeur DM** (Occident/FR) |
|---|---|---|
| Ce qu'il fait | Envoie QC + suivi à ses clients revendeurs | Envoie QC + suivi à ses clients finaux |
| Volume | 100-300 commandes/**semaine** | 20-80 commandes/**mois** |
| Besoin de « faire vrai shop » | Faible (B2B) | **Central** |
| Atteignable depuis la France | Non — langue, WeChat, confiance | Oui — Reddit, TikTok, Discord |
| Rôle stratégique | **Volume + preuve d'usage + prescription** | **Cœur de cible à terme** |
| Paiera ? | Probablement jamais | C'est l'hypothèse à tester |

**Un seul produit, deux profils. On teste les deux en gratuit et on laisse les données
trancher.**

**Contrainte technique qui découle du profil fournisseur** : la connexion Google lui
est **inaccessible** (Chine). Il entre donc par **email + mot de passe**.

> ⚠️ **AMENDÉ LE 01/09/2026 — CE PARAGRAPHE DISAIT L'INVERSE.** Il affirmait
> « le lien magique par email est son unique porte d'entrée », et en tirait que
> ce chemin devait être irréprochable. **Décision de Wassim : le lien magique est
> supprimé, remplacé par une authentification classique.**
>
> **Et le raisonnement d'origine se retourne contre sa conclusion.** Si la
> délivrabilité vers les boîtes chinoises (QQ, 163, 126) est le point faible —
> et c'est vrai —, alors le lien magique était le pire choix possible pour ce
> persona : il faisait dépendre **CHAQUE connexion** d'un email qui doit
> arriver. Un mot de passe n'en fait dépendre que la **réinitialisation**,
> c'est-à-dire un cas rare. Pour Chen, l'authentification classique est donc
> **plus** robuste, pas moins.
>
> Ce que le paragraphe protégeait reste vrai, et se déplace : la délivrabilité
> est toujours un sujet d'infrastructure — sous-domaine d'envoi dédié, SPF,
> DKIM, DMARC — mais elle ne porte plus l'accès quotidien, seulement le recours.

La délivrabilité vers ces boîtes reste donc à traiter, pour la réinitialisation
de mot de passe. Ce qui change : son échec coûte désormais un **recours**, pas
**l'accès**.

### Personas

- **Chen, fournisseur, Guangzhou** — 200 commandes/semaine, WhatsApp et WeChat,
  anglais approximatif. À 200/semaine, **le dashboard et les actions groupées ne sont
  pas du confort, c'est vital**.
- **Yanis, 22 ans, revend en DM** — 20-80/mois sur Snap et Insta, pas de boutique.
  Passe 1-2 h/jour à renvoyer des QC. **Craint de paraître peu sérieux.**
- **Le destinataire** — ouvre sur mobile, veut voir ses photos et son suivi. **Aucune
  adoption requise de sa part**, donc pas de problème d'œuf-et-poule.
- **Anti-persona** : marchands Shopify (déjà servis par AfterShip/Malomo), grandes
  marques DTC, logisticiens, transitaires.

### Le wedge de démarrage

Le circuit reps/haul : fournisseurs chinois + revendeurs qui achètent via agents et
revendent en DM. Douleur QC la plus aiguë, communauté dense et gratuite à toucher
(r/FashionReps ~2,4M, r/sneakerreps ~319k, r/RepSneakers ~172k), délai d'expédition
long (2-6 semaines).

**Mais le positionnement public reste 100 % générique et neutre.** On dit « vendeur »,
« commande », « suivi ». Jamais « rep ».

### La brèche concurrentielle

- **Link-in-bio** (Stan Store, Beacons, Fourthwall) : font le checkout, **aucun suivi
  post-achat, aucune galerie QC**.
- **Pages de suivi brandées** (AfterShip, Malomo, 17TRACK, ShipStation) : **supposent
  une boutique Shopify**, zéro galerie médias.
- **Écosystème agent chinois** (CNFans, Sugargoo, Kakobuy…) : QC dans **leur**
  dashboard interne, jamais dans un lien public brandé au nom du vendeur.
- **Client portals** (Copilot, SuiteDash) : pensés **par client**, pas **par
  commande**, et trop lourds.

**Aucun acteur du suivi brandé ne sert le vendeur SANS boutique. C'est la brèche.**

**Concurrents à surveiller** : rep.tools / JadeShip (ils ont déjà l'audience et les
briques), AfterShip / 17TRACK (offre standalone), Stan / Beacons, Bumpa / Catlog.

**Leçon Pandabuy** : raid police avril 2024 (16 marques), fuite de 1 348 407 comptes
confirmée par Have I Been Pwned, non-opérationnel depuis. **Ne jamais dépendre
structurellement du marché gris.**

### Métriques de verdict

| Signal | Verdict |
|---|---|
| Un fournisseur crée **>15 commandes en une semaine** sans relance | **Bon — le signal roi** |
| Un utilisateur teste 1-2 fois puis disparaît | Mauvais. Politesse, pas adoption |
| **Vues de lien par commande > 3** | Bon — le destinataire revient |
| **>80 % des commandes avec tracking** | Bon — le suivi est utilisé |
| **>30 % des commandes ré-éditées** après envoi | Bon — l'édition en direct est une vraie feature |
| **Rétention semaine 4 > 40 %** | Feu vert pour la phase 2 |

**Signal de kill** : si après 6-8 semaines aucun utilisateur ne dépasse spontanément
10 commandes créées, la douleur n'est pas assez forte. Repivoter le vertical.

---

<a id="3"></a>
## 3. LES DÉCISIONS PRODUIT VERROUILLÉES

**À ne pas rouvrir sans raison nouvelle.**

### Suivi de colis

1. **Un seul fournisseur de suivi, pas de secours à deux.** Les deux candidats
   (17TRACK, TrackingMore) facturent **à la prise en charge**, pas à l'interrogation :
   garder un secours **double le seul coût variable du produit**. De plus, deux
   normalisations divergentes **feraient reculer un statut** chez un client, ce qui est
   interdit.
2. **Le vendeur prime avant la remise au transporteur, le transporteur après.** Chacun
   est seul à savoir ce qu'il affirme. **Le statut ne recule jamais.**
3. **La page publique reste sans formulaire.** L'abonnement du destinataire reste en
   v1 : un champ email serait le premier pas vers l'inverse de « le destinataire n'a
   jamais de compte ».
4. **La frise reste à quatre étapes** (préparation, expédié, en transit, livré). La
   granularité vit dans le **détail** du suivi, pas dans la frise.
5. **Purge des réponses brutes 90 jours après le DERNIER MOUVEMENT**, pas après la
   création : un colis bloqué en douane est celui pour lequel on en a le plus besoin.
6. **Première interrogation immédiate, en tâche de fond.** Un vendeur qui colle un
   numéro et ne voit rien pendant 4 h conclut que ça ne marche pas.
7. **Un numéro fraîchement collé n'est souvent pas encore scanné.** Le message dit
   « pas encore d'information du transporteur », **jamais** « numéro introuvable ». Ce
   retour vide compte dans les compteurs de coût mais **ne déclenche ni la cadence du
   silence ni l'abandon**. Fenêtre de 7 jours / 16 interrogations avant abandon.
8. **Le silence est nommé au-delà de 10 jours.** *Un silence nommé est une information,
   un silence subi se lit comme une panne.* L'ancienneté du dernier mouvement est
   écrite en clair — c'est le seul élément de la page qui change tous les jours quand
   le colis ne bouge pas.

### Back-office admin

9. **Aucune suppression de compte, aucune usurpation d'identité, aucun rôle
   intermédiaire.** Suspendre est réversible ; la lecture tracée suffit au diagnostic ;
   chaque rôle est une surface de plus.
10. **Les paramètres passent en base, sauf les secrets**, et la trace est écrite par un
    **déclencheur**. *Un paramètre modifiable sans trace est pire qu'un paramètre figé.*
11. **Le veilleur doit être hors du planificateur veillé.** Une tâche qui surveille les
    tâches s'arrête avec elles. → veille mutuelle entre deux planificateurs
    indépendants.
12. **La confirmation d'une suspension exige de RECOPIER l'email du compte visé**, et
    **le collage est bloqué**. La règle n'existe pas pour refuser une erreur, mais
    **pour forcer à lire quel compte on suspend**. *La gêne est le mécanisme, pas un
    effet secondaire.*
13. **Refus sur panne du compteur de limite de débit : côté ADMIN oui, côté PUBLIC
    non.** Refuser côté public pénaliserait les clients d'un vendeur pour un incident
    qui ne les concerne pas ; côté admin, ça ne pénalise que nous.

### Éditeur et dashboard

14. **Duplication = gabarit**, pas copie. Référence produit et notes internes
    **uniquement**. Copier les médias doublerait le seul poste de coût qui peut
    déraper ; les **partager** créerait un couplage invisible (supprimer un média dans
    une commande le ferait disparaître d'une autre, y compris sur un lien déjà envoyé).
    Le **nom du client est exclu** : envoyer une page portant le pseudo d'un autre est
    le défaut le plus visible que ce produit puisse produire.
15. **Export CSV sans notes internes.** Elles contiennent le prix d'achat. *« Le
    vendeur ne décide pas de la fuite, il décide d'un export — deux gestes différents,
    parfois séparés de plusieurs mois. »* Les liens publics restent dans l'export, avec
    avertissement au téléchargement.
16. **Sauvegarde automatique, pas de bouton « enregistrer ».** Debounce ~800 ms sur le
    texte, immédiat sur les actions structurelles.
17. **Indicateur de sauvegarde à trois états** qui **nomme les champs en échec**.
18. **La poignée de déplacement est séparée** des boutons couverture et suppression —
    sinon chaque tentative de clic démarre un déplacement, surtout sur mobile.
19. **Seuils de déclenchement du glisser-déposer** : 8 px au pointeur, 200 ms au
    toucher. Sans eux, un simple clic produit un déplacement d'un pixel, donc une
    écriture et un événement d'historique inutiles.

### Instrumentation

20. **`order_created` est émis à la PREMIÈRE SAUVEGARDE DE CONTENU RÉEL**, jamais à
    l'ouverture de l'éditeur. Un brouillon ouvert puis abandonné est exactement le cas
    « teste 1-2 fois puis disparaît ». Un second événement, `order_editor_opened`,
    mesure l'ouverture — **et l'écart entre les deux est l'information**. Contenu = nom
    du client, référence produit, numéro de suivi, ou média. **PAS les notes internes
    seules** : elles sont pour le vendeur, pas pour son client.
21. **Le comptage des vues se fait APRÈS le rendu**, pas pendant. WhatsApp, Snap et
    Discord **chargent les liens qu'on leur colle**. Compter au rendu gonflerait **par
    construction** la métrique de verdict.
22. **Une ligne de vue = un visiteur, un JOUR.** Un comptage brut mesurerait la
    nervosité du réseau autant que l'intérêt du client. Le vendeur qui ouvre sa propre
    page est **exclu**, côté serveur.

### Page publique

23. **Aucune image de partage (Open Graph).** Un aperçu enrichi montrerait la photo ou
    le pseudo du client **dans la conversation**, donc à qui n'ouvre pas le lien — et
    les messageries le mettent en cache sur leurs serveurs. Fuite silencieuse, hors de
    notre portée.
24. **En-tête OMIS quand ni nom ni logo.** Pas de barre vide, pas de libellé de
    remplacement.
25. **Mention « Powered by DropLink » cliquable**, avec trois garde-fous : secondaire
    visuellement, jamais confondable avec l'expéditeur, ouverture hors de la page.
26. **Une information absente est OMISE**, jamais remplacée par un texte de
    remplacement ou une valeur inventée. Sur la page publique. **L'inverse vaut côté
    admin** : omettre le stockage ferait croire qu'il n'y a rien à surveiller, afficher
    « 0 o » ferait croire qu'on a mesuré. Un client consulte, un administrateur décide.

### Accès au compte — tranché le 01/09/2026

27. **Email + mot de passe. Le lien magique est SUPPRIMÉ**, pas gardé en secours :
    un second chemin qui ouvre une session est une seconde surface où fermer
    l'énumération, le bourrage et la limitation de débit. Google reste — le code
    existe — mais il n'est configuré ni chez Google ni chez Supabase, donc il ne
    sert personne aujourd'hui.
28. **La confirmation d'email n'est PAS exigée** à l'inscription. Elle coûte le
    clic dans un email que cette décision supprime, et elle le coûte au pire
    moment : la première minute. **Son prix est écrit au §9** — la page
    d'inscription devient un oracle d'existence de compte, borné mais réel.
29. **La déconnexion existe sur les DEUX surfaces**, vendeur et administration.
    Elle n'était pas une décision produit tant qu'il n'y avait pas de mot de
    passe ; avec un mot de passe, son absence serait le premier retour d'un
    utilisateur réel.

### Ce qu'on ne fait PAS — scope explicite

- **Aucun traitement des paiements des commandes.** Définitif, toutes phases
  confondues. On n'est pas un PSP.
- **Aucun code de facturation en phase 1.**
- **Pas de compte pour le destinataire.** Jamais.
- **Pas de transfert de lien entre utilisateurs** — un fournisseur ne doit pas pouvoir
  envoyer un lien directement au client final d'un revendeur.
- Pas de catalogue, pas de stock, pas de messagerie temps réel, pas de sourcing.
- **Pas de fret, conteneurs, palettes, dédouanement, ERP.** Pas une plateforme
  logistique enterprise.
- **Pas de Three.js, WebGL, shader.** Hors scope.

---

<a id="4"></a>
## 4. LES PRINCIPES NON NÉGOCIABLES

| # | Principe |
|---|---|
| **I** | **Zéro traitement de paiement.** Ni les commandes, ni un abonnement en phase 1 |
| **II** | **Positionnement générique et neutre.** Zéro « rep », « replica », « batch », « W2C », zéro marque de luxe, zéro nom d'agent chinois dans l'UI, la copy, les CGU ou les métadonnées. Zéro vocabulaire de fret |
| **III** | **Propriété exclusive des commandes et des destinataires.** Aucun transfert entre comptes |
| **IV** | **Trois niveaux d'accès, jamais confondus** |
| **V** | **Immuabilité du `public_token`.** Aucune édition ne le régénère. Seule l'action explicite « révoquer et régénérer » le change, et elle écrit un événement |
| **VI** | **Secret serveur et rôle admin vérifié en base.** La clé service-role ne quitte jamais le serveur |
| **VII** | **Instrumentation d'usage comme feature du MVP**, pas comme extra |
| **VIII** | **Passes séquentielles à propriétaire unique** sur les sujets couplés, pas de fan-out parallèle |
| **IX** | **Documentation à jour avant tout code lib-dépendant** — vérifier la version installée, jamais la doc canary |
| **X** | **Portes de qualité bloquantes** : typecheck, lint, build, tests, tests RLS |
| **XI** | **Budget de performance de la page publique** : LCP < 2 s, page < 300 Ko hors médias |
| **XII** | **L'interface n'affirme jamais ce que la base n'a pas enregistré** |

**Le principe XII mérite d'être développé**, parce qu'il structure tout l'éditeur. Un
retour optimiste est **un pari sur le serveur** ; pari perdu → **retour à l'état
confirmé, et on le dit**. Il a été adopté après avoir attrapé trois défauts distincts :
un média fantôme, un échec d'enregistrement présenté comme un succès, et un
réordonnancement optimiste laissé à l'écran après un appel échoué. Ces trois défauts
sont silencieux par nature : ils ne cassent aucun test, n'apparaissent dans aucun
journal, et se manifestent chez le destinataire des semaines plus tard.

---

<a id="5"></a>
## 5. ARCHITECTURE TECHNIQUE

### Environnement de développement

**Windows, sans WSL.** Toutes les commandes doivent tourner en PowerShell ou cmd natif.

Deux pièges Windows déjà rencontrés sur ce projet :
- **`child.kill()` ne tue que le processus `pnpm`**, pas le serveur qu'il a lancé. Un
  serveur du passage précédent reste en écoute, les `next start` suivants échouent
  **silencieusement** à se lier, et les requêtes atteignent un **build antérieur aux
  modifications à vérifier**. Trois falsifications sont passées au vert pour cette seule
  raison. → port éphémère + arrêt de l'arbre de processus.
- **Les chemins** : `path.join`, jamais de séparateur en dur.

### Stack

| Couche | Choix |
|---|---|
| Framework | Next.js 15 App Router, React 19, TypeScript strict (`noUncheckedIndexedAccess`) |
| UI | Tailwind v4, shadcn/ui, Framer Motion |
| Glisser-déposer | dnd-kit (core 6.3.1 / sortable 10.0.0) |
| Base + Auth | Supabase (Postgres + Auth + RLS) |
| **Stockage médias** | **Cloudflare R2, bucket PRIVÉ** (`aws4fetch` pour la signature) |
| Compression client | `browser-image-compression` 2.0.2 |
| Emails | Resend + React Email |
| Analytics | PostHog (EU Cloud) |
| Erreurs | Sentry |
| Suivi | 17TRACK (choisi, à valider sur numéros réels) |
| i18n | `next-intl`, FR + EN dès le MVP |
| Validation | Zod sur toute entrée externe |
| Déploiement | Cloudflare (Workers ou Pages) — à trancher au premier déploiement |

**Absent volontairement** : toute librairie de paiement, Three.js, WebGL, tout
transcodeur vidéo.

### Note sur le stockage — Cloudflare R2

**R2 est retenu.** La raison qui tranche : **R2 ne facture pas la sortie de données**,
alors que la vidéo est le seul poste de coût du produit qui peut réellement déraper.

Ordre de grandeur : à 3 vidéos de 20 Mo par commande et 800 commandes/mois pour un seul
gros fournisseur, on atteint ~48 Go/mois de stockage, **et chaque consultation de page
publique relit ces médias**. Avec un stockage qui facture la sortie, le coût croîtrait
avec le nombre de clients qui ouvrent leur lien — c'est-à-dire avec le succès du
produit.

**Conséquences pratiques :**
- Bucket **privé sans exception**, aucun domaine public, aucun `r2.dev` actif.
- Upload **direct navigateur → R2 par URL PUT présignée**. Les Server Actions ont une
  limite de corps de **1 Mo** : un upload à travers elles échoue dès la première vidéo.
  Piège d'autant plus vicieux qu'il **passe en développement sur de petits fichiers de
  test**.
- **La configuration CORS du bucket est le point qui casse en silence** : sans elle, le
  navigateur bloque la requête **avant même de l'envoyer**. Aucune erreur côté serveur,
  rien dans les journaux R2, une barre de progression qui ne démarre jamais. Le `PUT`
  présigné **aboutit pourtant depuis curl** — donc un test d'interface montrerait un
  uploader défaillant sans rien pour l'expliquer. **Tester le prévol CORS isolément, en
  curl, AVANT tout test d'interface.**
- L'accès au stockage passe par un **module unique** (`lib/storage/r2.ts`), jamais par
  des appels dispersés.
- Poser une **alerte de budget** dès le premier jour.

**Variables** : `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
`R2_BUCKET`. **Aucune préfixée `NEXT_PUBLIC_`** : une seule fuite donnerait accès à tous
les médias de tous les vendeurs. Token en **Object Read & Write**, limité au seul
bucket — jamais un token Admin, qui permettrait de créer et supprimer des buckets.

### Le principe directeur : les invariants vivent dans la BASE

Immuabilité du token par **trigger**, isolation par **RLS**, plafonds vérifiés **en
base**, audit **atomique** avec la lecture qu'il trace.

> Une règle applicative peut être oubliée dans un nouveau chemin de code.
> **Une règle en base ne peut pas l'être.**

### Quatre surfaces, quatre logiques

| Surface | Accès | Règle |
|---|---|---|
| `/[locale]/(app)/*` | Authentifié, RLS | Client serveur **avec** session, jamais service-role |
| `/p/[token]` | **Jamais authentifié** | Lecture par jeton via **fonctions `security definer`**, jamais une vue. `noindex`. **Hors du segment `[locale]`** |
| `/[locale]/admin/*` | Rôle vérifié **en base** | Défense en profondeur + audit de **toute consultation** |
| `/api/*` | Machine | **Exclue du middleware** — chaque route porte sa propre garde |

### La page publique — détails qui comptent

- **Hors du segment `[locale]`** : la langue est celle du **vendeur**, pas de l'URL. Un
  client à qui on envoie un lien ne la choisit pas, et une URL localisée créerait deux
  adresses pour un jeton censé être unique.
- **Racine de mise en page distincte.** Ce n'est pas de l'organisation, **c'est le
  budget** : la racine de l'espace vendeur monte tout ce dont un tableau de bord a
  besoin ; cette page est vue une fois, en 4G, sur un appareil d'entrée de gamme.
- **Le catalogue n'est pas expédié au navigateur** : la langue est distribuée aux
  Server Components, et le visionneur plein écran reçoit ses libellés **en
  propriétés**.
  > ⚠️ **AMENDÉ LE 31/08/2026.** Cette ligne disait « aucun provider i18n
  > client ». Il y en a désormais UN, restreint à **trois libellés**
  > (`page-publique.erreur`), et il existe pour une raison que la règle
  > n'avait pas prévue : **une frontière d'erreur DOIT être un Client
  > Component**. Elle ne peut donc ni appeler `getTranslations()`, ni recevoir
  > de propriétés — le provider est la seule voie qui ne mette pas deux phrases
  > en dur sur la page que reçoit le client d'un vendeur.
  >
  > **Le surcoût a été mesuré avant d'être accepté** : `/p/[token]` reste à
  > **118 kB** de premier chargement, la brique next-intl étant déjà dans le
  > socle partagé. Ce que la règle protégeait — ne pas expédier le catalogue —
  > reste vrai ; c'est sa formulation qui interdisait trop.
- **Les îlots clients de la page publique sont un INVENTAIRE DÉCLARÉ, pas un
  décompte.** Chacun est nommé avec sa raison, et
  `tests/unit/ilots-page-publique.test.ts` compare cette liste aux fichiers qui
  portent réellement `"use client"`, **dans les deux sens** :
  - `visionneur.tsx` — le plein écran, écrit à la main contre 40 à 90 Ko pour
    une bibliothèque ;
  - `balise-vue.tsx` — le comptage de consultation, **après** le rendu ;
  - `arbitrage-qc.tsx` — l'approbation, montée seulement si la commande porte
    au moins un média ;
  - `app/p/[token]/error.tsx` — la frontière d'erreur, qui **ne peut pas** être
    un Server Component : c'est une contrainte de React, pas un choix.
  > ⚠️ **AMENDÉ DEUX FOIS, ET LA SECONDE FOIS PARCE QUE LA PREMIÈRE S'ÉTAIT
  > TROMPÉE.** Cette ligne a dit « deux îlots seulement », puis « trois îlots,
  > pas deux » le 31/08/2026. Elle en oubliait toujours un : **il y en a
  > quatre**, relevé le 02/09/2026 en comptant les fichiers.
  >
  > Le quatrième est `error.tsx` — et le paragraphe qui le précède
  > immédiatement dans ce même document explique pourquoi il DOIT porter
  > `"use client"`. L'amendement du 31/08 a donc corrigé le chiffre en oubliant
  > l'îlot que sa propre voisine venait d'introduire : c'est L-025, un correctif
  > qui hérite du champ de vision de la correction plutôt que du problème.
  >
  > Il avait écrit sa propre épitaphe : *« un décompte qu'on ne vérifie pas
  > devient l'argument avec lequel on refusera le quatrième îlot — ou avec
  > lequel on l'acceptera en croyant qu'il est le troisième »*. Le quatrième
  > existait déjà quand la phrase a été écrite. **Le décompte est donc remplacé
  > par la liste, et la liste par une requête qui la vérifie** — c'est la règle
  > du §13 appliquée à elle-même.
- **Pas de glassmorphism / backdrop-blur** : c'est ce qui rame le plus sur les appareils
  d'entrée de gamme. Sur un aplat uni, un blanc à 70 % flouté donne exactement la même
  couleur qu'un blanc opaque — **le flou n'a rien à flouter**.

### Clients Supabase, physiquement séparés

| Fichier | Rôle |
|---|---|
| `lib/supabase/client.ts` | Navigateur, clé publiable |
| `lib/supabase/server.ts` | Serveur **avec session**, RLS active. **Client par défaut** |
| `lib/supabase/admin.ts` | Service-role, `server-only`. **Jamais hors `lib/audit/`** |
| `lib/supabase/anon.ts` | Serveur **SANS session** — pour la page publique |
| `lib/supabase/system.ts` | Service-role pour les chemins **sans utilisateur** (webhooks, tâches, envois) |

**Pourquoi `anon.ts` existe** : `server.ts` lit les cookies, donc le rendu de la page
publique dépendrait de la présence d'un cookie — **un vendeur connecté verrait sa page
autrement que son client, sans que personne s'en aperçoive avant que ça compte**.

**Pourquoi `system.ts` est distinct de `admin.ts`** : le client admin impose un audit,
parce qu'un **humain** y lit les données d'un tiers. **Un webhook n'est personne** ;
l'auditer noierait les vraies consultations humaines.

Importer le mauvais **doit casser le build** plutôt que de fuiter silencieusement.

### Le cache — piège central

Toute mutation visible publiquement doit déclencher l'invalidation du cache de la page
correspondante. Sans elle, la page publique reste servie périmée **alors que tout
paraît fonctionner côté vendeur** — le mode de défaillance le plus trompeur du produit.

**Attention** : `revalidateTag` prend **UN SEUL argument** en Next 15. Vérifier la
signature réelle dans `package.json`, pas la doc canary.

### Le suivi de colis — le colis est une entité distincte

`tracked_parcels`, `order_parcels`, `parcel_checkpoints`. Un même numéro peut porter
plusieurs commandes, et le fournisseur facture **à la prise en charge** : porter l'état
sur `orders` aurait rendu la double facturation naturelle. L'unicité
`(shop_id, tracking_number)` la rend impossible.

**Un port, pas une API.** `lib/tracking/provider/port.ts` définit ce que le produit
attend ; **un seul fichier connaîtra jamais un fournisseur**, son adaptateur. La vraie
justification n'est pas de changer de fournisseur un jour : c'est de rendre **la
normalisation testable sans réseau**.

**Quatre modules purs** portent toute la logique décidable hors réseau : `normalize`,
`checkpoints`, `silence`, `schedule`.

### Le middleware

Rafraîchit la session **tôt** (avant toute génération de réponse — sinon les cookies
mis à jour sont perdus), puis protège `/admin/*` en **404** (jamais 403 : ne pas
révéler l'existence de la surface).

**Chaque exclusion du matcher est une porte.** `/api` en est une, mais
`.*\.(svg|png|…)$` est la plus large : un segment de route nommé `rapport.png` en
sortirait. Un garde doit énumérer toutes les exclusions et vérifier chacune contre
l'inventaire complet des routes.

**Le middleware ne protège aucune donnée à lui seul.** La seule protection qui fait
autorité est `requireAdmin()` au début de chaque Server Action, plus la vérification en
base dans chaque fonction auditée.

---

<a id="6"></a>
## 6. LE MODÈLE DE DONNÉES

### Les tables — RLS activée sur TOUTES

> ⚠️ **CE BLOC AVAIT DÉRIVÉ, et personne ne l'a vu pendant des semaines.** Il
> citait `notifications_sent`, qui n'existe pas ; `public_rate_limit`, dont le
> vrai nom est `rate_limit` ; et six colonnes de `order_media` sous des noms
> anglais qui ne sont pas les vrais. Un document assez précis pour être cru et
> assez discret pour n'être jamais vérifié.
>
> Une suite compare désormais ce bloc à `pg_tables` **DANS LES DEUX SENS** — une
> table décrite ici et absente de la base, et une table de la base absente d'ici.
> C'est elle qui fait foi, pas cette liste. Les descriptions de colonnes, elles,
> restent indicatives : les vraies sont dans `supabase/migrations/`.

```
profiles            id, user_id, email, account_type (supplier|reseller),
                    role (user|admin), status (active|suspended), locale, created_at

shops               id, owner_id (UNIQUE), name, slug, logo_url, accent_color,
                    default_language, watermark_enabled

orders              id, shop_id, public_token (unique, nanoid 16+, IMMUABLE),
                    customer_label, product_ref, internal_notes, status,
                    tracking_number, carrier_code, qc_status, cover_media_id,
                    notify_email, unsubscribe_token, first_content_at,
                    created_at, updated_at, archived_at

order_media         id, order_id, type (photo|video), cle, cle_vignette, largeur,
                    hauteur, taille_octets, duree_s, position, source, created_at

order_events        id, order_id, type, payload, actor, occurred_at

tracked_parcels     id, shop_id, tracking_number, carrier_code, normalized_status,
                    last_movement_at, first_movement_at, query_count, abandoned_at
                    UNIQUE (shop_id, tracking_number)

order_parcels       order_id, parcel_id

subscriptions       id, profile_id, provider, provider_subscription_id, status,
                    renews_at, ends_at, created_at, updated_at
                    UNIQUE (provider, provider_subscription_id)
                    ⚠️ AJOUTÉE LE 20/09/2026, ET ELLE LÈVE LA CONTRAINTE N° 1
                    (« pas de table subscriptions ») — décision explicite de
                    Wassim : « quand le mec a payé via stripe ou lemon squeezy,
                    il a son abonnement automatiquement sur le saas ».
                    AUCUNE DONNÉE DE PAIEMENT : ni carte, ni montant, ni moyen
                    de paiement. Lemon Squeezy est MERCHANT OF RECORD — il
                    encaisse, facture, collecte et reverse la TVA. Ce qui est
                    stocké est l'ÉTAT d'un abonnement tel qu'un tiers nous le
                    raconte. `status` est gardé BRUT : chez ce fournisseur
                    `cancelled` ne veut PAS dire « coupé », l'abonnement court
                    jusqu'à `ends_at`, et le traduire ici perdrait la seule
                    distinction qui coûte de l'argent à qui la rate.
                    `profiles.plan` reste la VÉRITÉ D'ACCÈS ; cette table est ce
                    qui la justifie.

payment_events      id, provider, event_name, signature, payload, profile_id,
                    issue, received_at
                    UNIQUE (provider, signature)
                    Le journal des webhooks reçus, avec ce qu'on en a fait
                    (`applique`, `sans_destinataire`, `ignore`, `echec`).
                    La SIGNATURE sert de clé d'idempotence : le fournisseur
                    n'envoie aucun identifiant d'événement, et un renvoi porte
                    le même corps donc la même signature.
                    ⚠️ RLS ACTIVÉE ET FORCÉE, SANS AUCUNE POLICY — donc fermée à
                    tout le monde sauf au rôle de service. Elle porte la charge
                    brute du fournisseur, c'est-à-dire des adresses e-mail de
                    vendeurs.

parcel_checkpoints  id, parcel_id, occurred_at, location, description, stage,
                    created_at
                    ⚠️ IL N'Y A PAS DE COLONNE `raw` ICI, ET IL N'Y EN A JAMAIS
                    EU. Ce bloc en décrivait une — mesuré le 02/09/2026 contre
                    `information_schema.columns`, et aucun fichier du dépôt ne
                    la mentionne. La réponse brute du fournisseur vit dans
                    `tracking_snapshots.raw_payload`, PAR INTERROGATION, pas par
                    point de passage. La décision §3-5 (« purge des réponses
                    brutes 90 jours après le dernier mouvement ») porte donc sur
                    `tracking_snapshots` ; lue ici, elle laissait croire qu'on
                    peut rejouer l'historique point par point

tracking_snapshots  id, parcel_id, raw_payload, normalized_status, fetched_at

link_views          id, order_id, viewed_at, viewed_on (GÉNÉRÉE), ip_hash,
                    user_agent_hash, country
                    UNIQUE (order_id, ip_hash, user_agent_hash, viewed_on)

usage_counters      profile_id, period_month, orders_created, media_count,
                    storage_bytes, parcels_registered, tracking_api_calls

admin_audit_log     id, admin_id, admin_email, action, resource_type, resource_id,
                    target_profile_id, target_email, ip_hash, occurred_at, payload

system_settings     key, value, updated_by, updated_at

parametres_admis    cle, minimum, maximum, raison — (aucune policy) inventaire
                    FERMÉ des paramètres système et de leurs bornes, lu par
                    ecrire_parametre. Les bornes ne vivaient que dans
                    TypeScript ; un admin appelant la RPC hors du formulaire
                    écrivait n'importe quelle clé, hors bornes

scheduler_heartbeat source, beat_at, premier_battement, detail
                    `premier_battement` n'est JAMAIS réécrit : c'est l'âge du
                    veilleur qui distingue « pas encore passée » de « jamais
                    déployée »

alertes_envoyees    cle, envoye_at — (aucune policy) repos entre deux alertes du
                    veilleur. Poser une ligne le fait TAIRE, en effacer une le
                    fait réémettre : les deux droits restent hors de portée

rate_limit          (aucune policy — atteignable uniquement par consommer_quota)

comptes_supprimes   id, user_id, email, inscrit_le, supprime_le, conserver_jusqu_au
                    — (aucune policy) comptes supprimés par leur titulaire :
                    adresse et dates gardées UN AN (obligation de l'hébergeur),
                    puis effacées par la veille. Décision de Wassim, 13/09/2026

purges_r2           cle, demande_le, tentatives — (aucune policy) objets R2 à
                    effacer après une suppression ; une clé n'en sort qu'une fois
                    l'objet réellement supprimé

tracking_notifications_vues
                    cle, vue_at — (aucune policy) empreintes des notifications
                    de suivi déjà traitées, pour qu'un rejeu ne compte qu'une fois

link_contests       id, order_id, shop_id, blocked_at, message, image_key, status,
                    created_at, decided_at, decided_by, admin_response — la
                    CONTESTATION d'un lien bloqué par l'administration (168,
                    décision de Wassim du 19/09/2026). Le vendeur la LIT sous RLS
                    (sans `decided_by`, droit de colonne) et l'écrit par fonction :
                    une en attente, trois par blocage, image facultative sous
                    SA commande. L'administration la lit — tracé — et répond
```

### Colonnes structurantes, et leurs conséquences produit

- **`profiles.account_type`** — `supplier | reseller`, **nullable SANS DÉFAUT**,
  déclaré à l'onboarding. Un défaut à `reseller` aurait classé **tous les fournisseurs
  comme revendeurs** et faussé irrémédiablement la segmentation d'usage, qui est le
  livrable réel de la phase de validation. **La nullité rend le manque visible plutôt
  que silencieux.**
- **`profiles.role`** — pilote l'accès admin, vérifié en base. Ce qui empêche un vendeur
  de se promouvoir admin doit être un **privilège de COLONNE** Postgres, pas une policy
  (une policy sur `profiles` qui lit `profiles` produit une récursion infinie). Un
  `grant update (role) on profiles to authenticated` suffirait à produire une escalade
  complète.
- **`profiles.status`** — la suspension est une propriété des **données**, filtrée dans
  la vue publique. **Quand un compte est suspendu, ses pages publiques cessent d'être
  servies** et renvoient une page neutre, sans divulguer motif, existence de la
  suspension, ni identité du vendeur. La réactivation rétablit les pages **sur les mêmes
  liens**.
- **`shops.owner_id` UNIQUE** — un shop par compte ; **pivot unique de l'isolation**.
- **`shops.name` est NULLABLE, sans défaut.** La ligne `shops` est créée **à
  l'inscription**, donc avant l'onboarding. **Conséquence produit** : un vendeur peut
  envoyer un lien sans avoir jamais configuré sa boutique, et c'est le cas le plus
  fréquent au début de vie d'un compte. La page publique **omet alors l'en-tête**.
- **`shops.accent_color` NON NULLE avec défaut** : il n'existe donc **aucun état
  « couleur non configurée »** à détecter. La valeur stockée fait foi, **elle n'est
  jamais réécrite**.
- **`orders.public_token`** — nanoid base62, **IMMUABLE**, défaut en base, **trigger
  `BEFORE UPDATE`**. Vérifié **par la base**, pas seulement par le code.
- **`orders.unsubscribe_token`** — **DISTINCT du `public_token`**. Un jeton, un pouvoir.
- **`orders.customer_label`** — texte libre, **aucune clé étrangère vers un compte**.
- **`orders.internal_notes`** — **absent de la vue publique** ET de l'export CSV. Porte
  le prix d'achat.
- **`order_media`** — `unique (order_id, position) DEFERRABLE INITIALLY DEFERRED`, posée
  exprès pour autoriser l'état intermédiaire d'une permutation. `cle_vignette` **nullable** :
  l'absence de vignette est un cas normal.
- **`link_views`** — **une ligne = un visiteur, un JOUR**. Colonne `viewed_on`
  **générée** depuis `viewed_at`. **Ce n'est pas un détail d'implémentation : c'est la
  définition d'une métrique de verdict.** Empreintes `sha256` **salées** — sans sel, une
  IPv4 se retrouve en quelques secondes.
- **`admin_audit_log`** — **append-only**, `ON DELETE SET NULL` sur les clés + emails
  dénormalisés à l'écriture : **il survit à la suppression des comptes**.
- **`tracked_parcels`** — **unicité `(shop_id, tracking_number)`**, la règle de coût
  rendue structurelle. Elle s'arrête à la **frontière du vendeur**, deux vendeurs
  pouvant employer le même numéro.
- **`scheduler_heartbeat`** — **L'ABSENCE de ligne EST l'information**. Trois états, pas
  deux : « jamais déployé » (aucune ligne), « en retard » (ligne ancienne), « actif »
  (ligne fraîche). Sans le premier, un veilleur jamais déployé se présenterait comme
  « en retard » et on chercherait une panne dans un mécanisme inexistant.

### La lecture publique — QUATRE FONCTIONS, AUCUNE VUE

> ⚠️ **CE BLOC S'INTITULAIT « LA VUE DE LECTURE PUBLIQUE », ET CET OBJET N'A
> JAMAIS EXISTÉ.** Mesuré le 02/09/2026 : `pg_class` ne contient **aucune vue ni
> vue matérialisée** dans `public`, tous schémas confondus. La lecture publique
> est faite de **quatre fonctions `security definer`** — `lire_commande_publique`,
> `lire_medias_publics`, `lire_suivi_public`, `lire_passages_publics` — et
> `tests/rls/catalogue.test.ts` le dit noir sur blanc depuis longtemps : « le
> dépôt ne contient AUCUNE vue, et c'est délibéré : la lecture publique est une
> FONCTION qui exige le jeton, précisément parce qu'une vue **se parcourt** ».
>
> **ET CE N'ÉTAIT PAS UN DÉTAIL DE VOCABULAIRE.** Les deux documents qu'on relit
> AVANT d'écrire une migration envoyaient écrire un `create view` dans `public` —
> or une vue s'exécute avec les droits de **celui qui l'a créée**, donc sans la
> RLS de l'appelant. Un `create view mes_commandes as select * from orders`
> accordé à `authenticated` rendrait **toutes les commandes de tous les
> vendeurs**, `internal_notes` et `public_token` compris. Le document pointait
> droit sur le trou que le test garde.
>
> La consigne de falsification « filtrer une colonne dans la vue » portait donc
> sur un objet inexistant : appliquée à la lettre, elle ne casse rien, la suite
> reste verte, et l'on croit avoir éprouvé la garde.

Filtre `profiles.status = 'active'` et **ne contient pas `internal_notes`**.
`archived_at` n'est **pas** dans le filtre : **archiver ne retire pas la page** —
l'archivage range le plan de travail du vendeur, il ne casse pas la promesse faite au
client.

**Jeton inconnu, jeton révoqué et compte suspendu produisent la MÊME réponse** — un
seul chemin de sortie, et le test compare aussi **l'ordre de grandeur du délai**.

### Stockage

**Bucket privé sans exception.** URL signées à expiration. **SVG assainis avant
stockage.** Upload **direct navigateur → stockage**, **clé générée par le SERVEUR**
(une clé fournie par le client permettrait d'écraser le média d'un autre vendeur),
taille relue côté serveur après upload (**ne jamais croire le client sur la taille** :
c'est la base du modèle de coût).

**Vignettes** : 200 × 200, cible **12 Ko déduite du budget de page** (400 Ko de page +
600 Ko de vignettes à 50 lignes ÷ 50), **plafond dur 20 Ko**. Produites **au dépôt** —
seul instant où le fichier est déjà décodé en mémoire ; transformer à la lecture ferait
payer ce coût **à chaque affichage, pour toujours**. Clé **dérivée** de celle du média.
Mesuré **chargement différé désactivé** — sinon on dimensionne sur le cas favorable.

**Plafonds produit** : 20 médias et 3 vidéos de 60 s par commande. Seuil vidéo **20 Mo
en configuration** (jamais en dur) — provisoire, une vidéo de 60 s en 720 p pèse
couramment 15 à 30 Mo. Refus **instrumentés avec motif ET taille réelle** : *sans la
taille, je ne saurai pas de combien je me suis trompé.*

**Vidéos** : validation, pas transcodage. `ffmpeg.wasm` = ~30 Mo et plusieurs minutes
sur mobile — un fournisseur à 200 commandes/semaine y perdrait plus de temps que le
produit ne lui en fait gagner. **La vignette d'une vidéo est capturée depuis la vidéo au
dépôt, échec non bloquant** : refuser une vidéo parce qu'on n'a pas su en extraire une
image ferait payer au vendeur une limite qui est la nôtre.

---

<a id="7"></a>
## 7. LES ÉCRANS, UN PAR UN

> ⚠️ **LE DOSSIER STITCH A ÉTÉ SUPPRIMÉ DU DÉPÔT le 26/08/2026**, une fois les
> 20 routes portées sur le canevas Claude Design. Les noms de maquettes cités
> dans les tableaux ci-dessous ne renvoient plus à aucun fichier : ils valent
> comme **inventaire historique des écrans**, et les notes qui les accompagnent
> valent comme **corrections de vocabulaire déjà appliquées**. La source du
> design est le canevas — voir §8.

> ⚠️ **Ne pas lire** `droplink_project.md`, `droplink_claude.md` ni
> `droplink_guide_spec_kit_pour_claude_code.md` du zip : ils décrivent un produit
> différent (fret maritime B2B, ERP, Three.js) et contredisent ce document.
>
> ⚠️ **Cinq `screen.png` sont corrompus** (28 octets) ; leur `code.html` est intact,
> lire le HTML.
>
> ⚠️ **Les images des maquettes sont des placeholders**, remplacées par les vraies
> photos et vidéos QC de la commande. Ne pas chercher à les reproduire.

### Espace vendeur

| Écran | Maquette | Notes |
|---|---|---|
| **Connexion** | `droplink_connexion_acc_s_portail` | **Email + mot de passe**, plus Google. ⚠️ Cette case disait « Email magic link + Google. Le lien email est l'unique porte pour les fournisseurs chinois » — **amendé le 01/09/2026**, voir §2 |
| **Mot de passe oublié** | *(aucune maquette Stitch)* | Réponse **identique** que l'adresse existe ou non. Lien à usage unique, durée courte |
| **Nouveau mot de passe** | *(aucune maquette Stitch)* | Atteignable **uniquement** avec une session de récupération |
| **Inscription** | `droplink_cr_ation_de_compte_inscription` | + onboarding 60 s : nom, logo, couleur, type de compte |
| **Dashboard** | `droplink_tableau_de_bord_principal` (PNG corrompu, lire le HTML) | L'écran le plus utilisé. Détail ci-dessous |
| **Créer / éditer une commande** | `droplink_cr_er_un_post_client` | **Correction obligatoire** : le bloc « Client Account » avec recherche et email est remplacé par un **simple champ texte libre**. Le destinataire n'a jamais de compte |
| **Réglages de marque** | `droplink_param_tres_marque_blanche` (PNG corrompu) | Nom, logo, couleur d'accent, watermark |

**Le dashboard en détail** — un fournisseur à 200 commandes/semaine y passe sa journée.

- **Vue liste** : miniature du premier média, nom/pseudo du client, référence produit,
  badge de statut d'expédition, compteur de vues + indicateur **« jamais ouvert »**,
  date de dernière modification.
- **Actions rapides au survol** : copier le lien, ouvrir la page publique, dupliquer,
  archiver.
- **Recherche** par nom de client, référence produit ou numéro de suivi. **Insensible
  aux accents** — chercher « creme » doit trouver « Crème », c'est le cas majoritaire
  puisqu'on tape vite dans une barre de recherche. Nécessite un **index d'EXPRESSION
  avec `unaccent`**, pas un index simple.
- **Filtres** : statut d'expédition, statut QC, période. **Attention à la borne haute** :
  `to=2026-08-16` vaut minuit, donc « jusqu'à aujourd'hui » exclurait toute la journée
  en cours.
- **Tris** : plus récent, plus ancien, **jamais ouvert par le client**, **bloqué en
  transit**.
- **Actions groupées** : archiver, resynchroniser le suivi, exporter en CSV. **Chaque
  lot est tout-ou-rien** — une sélection à moitié archivée sans que le vendeur sache
  laquelle est pire que l'échec complet.
- **Pagination par CURSEUR**, pas par décalage : à la page 40 d'un jeu de 9 600, un
  `offset` fait lire 2 000 lignes pour en rendre 50 — **le coût croît avec le numéro de
  page**, donc l'inconfort arrive chez celui qui a le plus de données.
- **États vides distincts** : « ce compte n'a rien » et « ce filtre ne renvoie rien »
  sont deux écrans différents. Afficher « créez votre première commande » à un vendeur
  qui en a 9 600 est une perte de confiance immédiate. Le second offre un retour en un
  geste vers l'état non filtré, et le libellé dit **« tout effacer »** si le lien remet
  tous les filtres à zéro.

**L'éditeur en détail** :

- Tous les champs éditables, **sauvegarde automatique**.
- Gestionnaire de médias : ajouter, supprimer, **réordonner par glisser-déposer**
  (accessible au clavier dès le départ), définir la photo de couverture.
- Réordonnancement en **une seule écriture** quel que soit le nombre de médias,
  appuyée sur la contrainte différée.
- **Aperçu en direct** de ce que voit le client, côte à côte.
- Historique de la commande : qui a modifié quoi, quand le client a ouvert le lien.
- Bouton **« Révoquer et régénérer le lien »** — volontairement inconfortable : deux
  gestes séparés, case à cocher explicite (« je comprends que l'ancien lien cessera
  définitivement de fonctionner »), aucun raccourci clavier, aucun formulaire (donc pas
  de soumission par Entrée), Échap ferme. **L'invalidation porte sur les DEUX tokens** —
  oublier l'ancien laisserait le cache servir la page à qui détient le lien fuité.
- **Le nouveau lien est copiable immédiatement**, sans rechargement. Un vendeur qui doit
  rafraîchir pour retrouver son lien hésitera à révoquer, et le lien fuité restera actif.

### Page publique

| Écran | Maquette | Notes |
|---|---|---|
| **Suivi de commande** | `droplink_votre_suivi_de_commande` | Structure conservée. **Trois corrections obligatoires** ci-dessous |

**Corrections sur cette maquette** :

1. **Le vocabulaire.** Les libellés actuels parlent de palettes, ports de départ,
   dédouanement, scellé de conteneur et « Global Freight Logistics ». Notre client final
   a commandé un article en message privé, pas un conteneur. → préparation, expédié, en
   transit, arrivé, livré.
2. **L'identité.** Le mot « DropLink » dans l'en-tête et le bloc de navigation du pied
   de page sont des placeholders. Dans l'en-tête s'affichent **le nom et le logo du
   vendeur**. Sans logo configuré, on affiche le nom en texte. Sans couleur configurée,
   on garde la palette de la maquette. **Un vendeur qui n'a rien configuré obtient cette
   page à l'identique, avec son nom à la place de « DropLink » — c'est le cas principal,
   pas un repli dégradé.** La mention « Powered by DropLink » cliquable reste.
3. **Mobile-first.** La maquette est composée pour desktop. La page est ouverte au
   téléphone depuis un DM dans la grande majorité des cas. **Sur mobile, la galerie
   vient AVANT les détails d'expédition** — c'est ce que le client vient voir. La
   maquette desktop les met côte à côte, ce qui n'a pas d'équivalent en une colonne.

**Contenu** : galerie photos et vidéos (plein écran, zoom), frise de statut à quatre
étapes, points de passage datés, **ancienneté du dernier mouvement en clair**, silence
nommé au-delà de 10 jours, mise en évidence de l'arrivée dans le pays, numéro de suivi,
date estimée. Approbation / refus du QC avec commentaire.

**Galerie** : vignettes 200×200 en grille (**deux colonnes sur mobile** — sur une
colonne pleine largeur elles seraient agrandies de 80 % et floues), photo pleine
**uniquement** à l'ouverture du plein écran, et **pas dans le document tant que le
visionneur est fermé** (un `<img>` masqué serait tout de même téléchargé — c'est la
façon la plus courante de croire qu'on a différé un chargement sans l'avoir fait).
Vidéos en `preload="none"` avec poster. Dimensions réservées avant chargement.

### Back-office admin

| Écran | Maquette | Notes |
|---|---|---|
| **Panneau master** | `droplink_panneau_d_administration_master` | Vue d'ensemble. **Les alertes avant les compteurs** — un panneau qui les enterre oblige à chercher ce qui devrait sauter aux yeux |
| **Gestion des utilisateurs** | `droplink_admin_gestion_des_utilisateurs_fidelity_fix` | Liste, recherche, détail, suspension, rôle |
| **Gestion des organisations** | `droplink_admin_gestion_des_organisations_fidelity_fix` | Regroupement par shop, volumes, type de compte |
| **Journal d'audit** | `droplink_admin_logs_d_audit_qc_master_fidelity_fix` | **Titre à refaire** : « QC Master Logs » — personne n'inspecte de contrôle qualité chez nous |
| **Monitoring infrastructure** | `droplink_admin_monitoring_infrastructure_fidelity_fix` | **Titre à refaire** : « Global Logistics Health » — nous n'exploitons aucune logistique |
| **Paramètres système** | `droplink_admin_param_tres_syst_me_s_curit_fidelity_fix` | Seuils, feature flags. **En base, trace par déclencheur** |
| **Facturation / abonnements** | `droplink_admin_facturation_abonnements` | **Maquette conservée, AUCUN code en phase 1** |

**Détails qui comptent** :

- Le **motif de suspension** s'affiche en clair sur la ligne du journal, pas replié
  derrière un détail que personne n'ouvre — c'est la pièce qu'on demanderait en cas de
  litige. Le reste de la charge utile n'est **pas** étalé : un journal qui montre tout
  devient une surface de fuite.
- L'entrée de journal **survit à la suppression du compte visé** (emails dénormalisés).
- **Lire le journal n'écrit pas dans le journal.**
- Une **consultation de liste** produit **une seule** entrée portant ses critères, pas
  une par ligne affichée. L'inverse noierait les consultations individuelles.
- Les **signalements portent leur valeur** : « 1 840 colis sur un seuil de 1 200 », pas
  « ce compte dépasse ».
- `parcels_registered` en tête et encadré — **seul compteur correspondant à une
  facture**.
- **Le stockage s'affiche « indisponible » tant qu'il n'est pas mesurable, jamais
  « 0 o »** — et la décision vient de la **configuration**, pas de la valeur : déduire
  « zéro donc indisponible » deviendrait faux le jour où un compte a réellement zéro
  octet.
- `never_ran` **n'est pas une alerte** : une tâche posée ce matin n'a pas encore eu son
  premier passage ; la signaler ferait chercher une panne inexistante. **Une alerte qui
  se trompe est une alerte qu'on apprend à ignorer.**

### Les écrans restants — tous implémentés

> ⚠️ **AMENDÉ LE 26/08/2026 — STITCH EST ABANDONNÉ.** La source du design est
> désormais le canevas Claude Design validé par Wassim (voir §8). Ce qui reste
> vrai de la décision d'origine : **la surface est complète dès le départ**, tous
> ces écrans existent. Ce qui est faux : qu'ils doivent ressembler aux maquettes
> Stitch. Le tableau ci-dessous vaut comme **inventaire des écrans**, pas comme
> référence visuelle.

**Décision produit : la surface est complète dès le départ.** Wassim veut un
contrôle total sur la plateforme et tous les écrans dès la première version.

| Écran | Notes |
|---|---|
| `droplink_gestion_d_inventaire_envois` (+ mobile) | Vue des envois. **Attention** : le vocabulaire actuel parle d'inventaire logistique ; le reformuler autour des commandes et des colis, pas du stock |
| `droplink_gestion_des_partenaires_fournisseurs` (+ mobile) | Vue des fournisseurs d'un revendeur |
| `droplink_analyses_rapports_qc` (PNG corrompu) | Analyses. **Titre à refaire** : nous n'inspectons pas de contrôle qualité |
| `droplink_analyses_audits_qc_mobile` | Version mobile des analyses |
| `droplink_tableau_de_bord_visibilit_qc` | Vue de suivi agrégée |
| `droplink_solutions_int_grations_b2b` (PNG corrompu) | Écran intégrations. **Retirer toute référence ERP, SAP, Oracle** — hors produit |
| `droplink_variante_bento_grid_tendue` | Variante visuelle du dashboard |
| `droplink_landing_page_mobile` (PNG corrompu) | Landing publique |
| `droplink_tableau_de_bord_mobile` | Dashboard mobile |
| `droplink_param_tres_marque_blanche_mobile` | Réglages de marque, mobile |

**`shader/`** est le seul élément écarté : Three.js et WebGL sont hors scope, et le
budget de performance de la page publique l'interdit de toute façon.

> ⚠️ **Ces écrans ajoutent de la surface au MVP.** Chacun doit respecter les mêmes
> règles que les autres : RLS, isolation, vocabulaire neutre, contrôle par valeur sur ce
> qui est rendu, et instrumentation. Un écran de plus est une surface de fuite de plus.

---

<a id="8"></a>
## 8. LE DESIGN SYSTEM

> ⚠️ **REMPLACÉ LE 26/08/2026.** La base n'est plus `DESIGN.md` du zip Stitch,
> **abandonné**. La source est le **canevas Claude Design validé par Wassim** :
> `https://claude.ai/code/artifact/044de325-d272-4e9e-b3ab-1c345e7121af`
> — **47 planches** (40 à l'origine, 41 après `Envois`, 43 après la passe du
> 30/08, 47 après l'authentification classique du 01/09), chaque écran en bureau
> ET téléphone, plus une page d'états.
>
> ⚠️ **LE CANEVAS EST MODIFIABLE depuis le 29/08/2026** : quand un écran a besoin
> de ce que la planche ne dessine pas, on écrit d'abord DANS LA PLANCHE, on
> republie, puis on implémente. Voir `CLAUDE.md` § « Assets design ».
> Les valeurs exactes vivent dans `CLAUDE.md` § « Assets design ».

**Ce qui SURVIT de l'ancien système** : **Plus Jakarta Sans** (titres) + **Inter**
(corps et tableaux denses), servies par `next/font/google` — jamais un CDN.

**Ce qui CHANGE** : la palette (lavande `#c5cbfb` / encre `#0e0e13` / dégradé de
marque `#7c5cf5 → #f2765e`), les rayons (carte-page 28, carte 16, contrôle 12),
et la composition de tous les écrans.

**Ce qui reste vrai quel que soit le design** : les quatre règles ci-dessous.

**À modifier obligatoirement** :

1. **La couleur d'accent est une VARIABLE pilotée par le vendeur**, pas une couleur en
   dur. Le design doit rester correct avec **n'importe quelle** valeur, y compris un
   rouge saturé ou un jaune vif. Prévoir un test de contraste sur au moins six couleurs
   extrêmes (rouge saturé, jaune vif, blanc, noir, très clair) **plus une valeur
   invalide**. Critères chiffrés : **4,5:1 sur le texte, 3:1 sur les éléments
   d'interface**. **La conformité doit être obtenue automatiquement, sans que le vendeur
   ait à chercher « une couleur qui marche ».**
2. **Pas de glassmorphism ni de backdrop-blur sur la page publique.** Géométrie
   conservée, fond opaque. Possible sur le dashboard desktop.
3. **Le vocabulaire logistique enterprise disparaît partout** : conteneur, palette,
   dédouanement, inspecteur QC, lot, tolérances, généalogie produit.

**Mobile** : cibles tactiles de **44 points** minimum, contenu principal lisible sans
exécution de JavaScript, **aucun décalage de mise en page après le premier affichage**.

---

<a id="9"></a>
## 9. SÉCURITÉ — RÈGLES DÉTAILLÉES

### Mots de passe — surface ouverte le 01/09/2026

Elle n'existait pas tant que le produit n'avait que le lien magique. **Aucune de
ces règles n'a de valeur si elle n'est pas exécutée** : trois d'entre elles
vivent dans le tableau de bord Supabase, où aucune relecture de code ne peut les
voir — c'est L-028 appliqué à l'authentification.

- **Longueur minimale 12 caractères**, imposée **des deux côtés** : par Zod chez
  nous, et par le réglage du projet Supabase. Les deux sont nécessaires — Zod ne
  voit pas `updateUser`, et le réglage Supabase ne voit pas nos messages.
- **Refus des mots de passe des fuites connues** (option Supabase adossée à
  HaveIBeenPwned). Sans elle, le bourrage d'identifiants est gratuit.
- **Aucun message ne distingue un email inconnu d'un mot de passe faux**, et le
  **délai non plus** : le hachage ne s'exécute que si le compte existe, donc
  sans plancher le chronomètre répond à la place du message. Même discipline
  que `/p/[token]`.
- ⚠️ **L'INSCRIPTION, ELLE, RESTE UN ORACLE, ET C'EST ASSUMÉ.** Confirmation
  d'email désactivée (décision de Wassim), `signUp` sur une adresse déjà
  inscrite rend `User already registered` — la page dit donc qui a un compte
  ici. **Ce n'est pas rattrapable en code** : une inscription réussie ouvre une
  session, un doublon non, et la différence est observable quoi qu'on affiche.
  Elle est **bornée** (30 essais/h par adresse IP, 6/h par adresse email) et
  **refermable** en réactivant la confirmation d'email, qui fait obfusquer
  Supabase.
- **La réinitialisation est le nouveau vecteur de prise de compte** : lien à
  usage unique, durée courte, réponse identique que l'adresse existe ou non, et
  compteur d'envoi distinct de celui de la connexion.
- **Aucun mot de passe** dans un journal, une trace d'erreur ou un événement
  d'usage.
- **La déconnexion est une propriété de sécurité, pas un confort.** Le cookie de
  session vaut 400 jours et est rafraîchi par le middleware : sans elle, le
  suivant qui ouvre un navigateur partagé a l'éditeur, l'export CSV et les
  **notes internes, qui portent le prix d'achat**. Elle doit être atteignable
  **sans JavaScript**, porter la **garde CSRF**, et être prouvée par une sonde
  qui rejoue le **MÊME cookie** après coup.

### Isolation

- **RLS activée sur toutes les tables dès la première migration**, jamais en rattrapage.
- Un utilisateur ne voit et ne modifie que ses propres shops, commandes et médias.
- **Supabase accorde SELECT/INSERT/UPDATE/DELETE à `anon` par défaut.** La RLS est la
  seule chose qui sépare un anonyme de toutes les lignes — **une table créée sans elle
  est grande ouverte, et le fichier de migration ne le dira pas.**

### Droits d'exécution

- **Postgres accorde `EXECUTE` à `PUBLIC` par défaut.** Révoquer explicitement.
- Un droit d'exécution **ne s'écrit pas dans le corps d'une fonction**, donc aucun
  contrôle textuel ne peut le voir. **Inventorier par le catalogue.**
- Le défaut vise les fonctions **sans garde interne**, c'est-à-dire celles appelées par
  une **machine** — un veilleur dont le battement est écrivable anonymement est pire
  qu'un veilleur absent : on cesse de le chercher.
- **`alter default privileges`** pour que l'objet SUIVANT naisse fermé.

### Admin

- **La clé service-role ne quitte JAMAIS le serveur.** Jamais dans un Client Component,
  jamais dans une variable `NEXT_PUBLIC_*`, jamais dans un bundle.
- **Le rôle admin se vérifie côté serveur, en base, à chaque requête.** Jamais un claim
  JWT modifiable côté client, jamais un check en `useEffect`, jamais une comparaison
  d'email en dur.
- **Défense en profondeur** : le middleware protège `/admin/*`, **ET** chaque Server
  Action revérifie indépendamment.
- **Piège structurel** : le matcher du middleware exclut `/api`, donc une route
  `/api/admin/...` ne serait protégée par **rien** — et son préfixe donnerait
  l'impression contraire à qui la relit.
- **Audit atomique et fail-closed** : rôle, audit et lecture dans **une seule
  transaction**. Un accès dont l'audit échoue est refusé.
- Aucun mot de passe, token de session ou clé API affiché en clair.

### Contrôle par VALEUR, pas par nom

**Le contrôle par nom ne suffit pas.** Une valeur voyage sous n'importe quel nom : un
champ sensible republié sous `meta`, `debug`, `commentaire` ou `diagnostic` survit
intégralement à un contrôle textuel.

→ Injecter des **sentinelles à valeur unique** en base et les chercher dans les
réponses **et dans le HTML rendu**, charges d'hydratation comprises.

**Le `public_token` est la sentinelle qui compte le plus** : les autres exposent une
donnée, celle-là **TRANSFÈRE UNE CAPACITÉ**, définitivement, puisque le token est
immuable à vie.

### Limitation de débit

**Deux seuils distincts, EN BASE.** Un seuil unique obligerait à choisir entre gêner les
clients et laisser passer l'aspiration — **un client final ne tape jamais un jeton faux,
il clique un lien**.

En base et pas en mémoire : les environnements sans mémoire partagée entre instances
multiplient les instances précisément sous la charge à limiter.

Compteurs **distincts** entre la page publique et l'admin.

Seuils actuels : fenêtre d'une minute, **20** requêtes sur un jeton inconnu, **120** sur
un jeton valide, **60** dépôts. La fenêtre se lit **en base**, pas sur l'horloge client
— un décalage ferait chevaucher une fenêtre client sur deux fenêtres serveur.

---

<a id="10"></a>
## 10. PERFORMANCE — BUDGETS CHIFFRÉS

### Page publique

- **LCP < 2 s** et **page < 300 Ko hors médias**, mesurés sur **profil mobile bas de
  gamme en 4G throttlée**. Une mesure desktop non throttlée ne veut rien dire ici.
- Socle Next/React incompressible : **~102 Ko**. Il reste donc ~198 Ko pour tout le
  reste. Un composant client de 40-90 Ko consommerait la moitié de la marge à lui seul.
- Total **RÉELLEMENT mesuré le 31/08/2026** sur un build de production servi,
  page à 14 médias, sous-ressources comprises : **176 Ko compressés**
  (615 Ko bruts). Dans le budget de 300 Ko, avec 124 Ko de marge.
  > ⚠️ **AMENDÉ.** Cette ligne annonçait « ~116 Ko atteignable », et personne ne
  > l'avait confrontée à une page servie. Le contrôle de fumée qui portait ce
  > budget ne pesait que le HTML — 26 Ko contre un seuil de 300 : il ne pouvait
  > pas devenir rouge pour la chose que le budget protège. Il pèse désormais la
  > page entière, sous-ressources comprises, et refuse de mesurer si elle n'en
  > référence aucune.
- **À 20 médias : page complète < 1 Mo.**
- **Décalage cumulé < 0,1.**

### Dashboard

Doit tenir à **800 commandes/mois** pour un seul vendeur, et rester correct à 9 600.

- Pagination ou virtualisation au-delà de ~50 lignes.
- Index sur `(shop_id, created_at)`, `(shop_id, status)`, **et sur le tri par défaut**
  (celui-ci est facile à oublier : sans index il lit toutes les lignes pour en rendre
  50, ce qui reste invisible à faible volumétrie).
- Recherche plein texte sur `customer_label` + `product_ref` + `tracking_number`, index
  d'expression avec `unaccent`.

### Protocole de mesure — non négociable

- **Mesurer le PLAN d'exécution, pas seulement le chronomètre.** Un seuil de temps seul
  certifie une performance qui n'existe qu'à la volumétrie de test.
- **Fixer les seuils AVANT de connaître le chiffre.** Sans seuil écrit à l'avance, « on
  décidera sur la mesure » devient « on a mesuré, ça allait ».
- **Rodage jeté, puis DEUX séries concordantes.** Une mesure isolée se trompe dans le
  sens rassurant : sans rodage, un export de 1 000 lignes peut sortir plus lent qu'un
  export de 5 000, parce que la première mesure paie l'établissement de connexion.
- **Toute mesure porte une assertion sur le jeu qu'elle prétend décrire.** Sans elle,
  une purge accidentelle du jeu de mesure fait consigner une dégradation de 83 % — et on
  pose un index pour un problème inexistant, donc on dégrade le produit en croyant
  l'améliorer.
- **Mesurer ce que l'écran appelle réellement**, pas la requête brute. L'écart peut être
  d'un facteur 10 quand la fonction fait un comptage exact en plus du tri.
- **Mesurer AU PLAFOND**, pas à un dixième du plafond. Si le plafond ne passe pas,
  baisser le plafond plutôt que de découvrir la limite en production.
- Le jeu de mesure inclut **un compte voisin de même volumétrie** : une requête peut
  sembler rapide sur une base mono-compte et s'effondrer dès que l'isolation filtre
  réellement.
- **Vignettes mesurées chargement différé DÉSACTIVÉ**, sinon on dimensionne sur le cas
  favorable.

---

<a id="11"></a>
## 11. INSTRUMENTATION ET MÉTRIQUES DE VERDICT

**PostHog EU Cloud.** L'instrumentation est une feature du MVP : un compteur branché
après coup démarre avec un historique vide, **donc inexploitable au moment précis où il
faut décider**.

### Événements à poser

Inscription, ouverture de l'éditeur, création de commande (au premier contenu réel),
modification, média ajouté, **média refusé avec MOTIF ET TAILLE RÉELLE**, lien partagé,
lien révoqué, page publique rendue (côté serveur), vue de lien enregistrée, QC approuvé,
QC refusé, commande archivée, commande dupliquée, colis pris en charge, premier scan,
interrogation vide, abandon de suivi, immobilisation, notification envoyée, notification
échouée, rebond.

### Trois pièges à éviter absolument

1. **Un compteur incrémenté AVANT une opération qui peut échouer perd des événements
   définitivement.** Si une marque à usage unique est consommée avant l'envoi et que
   l'envoi échoue, l'événement est perdu sans réémission possible. Et si cet événement
   est un **dénominateur** (comme l'inscription pour le taux d'activation), **la perte
   fait monter le taux, du côté rassurant.**
2. **Une promesse non attendue perd des événements en silence.** Activer
   `no-floating-promises`, `no-misused-promises`, `await-thenable`. C'est le **typage**,
   pas la relecture, qui doit l'exiger : `foo()` et `await foo()` se ressemblent trop
   pour qu'une recherche textuelle les distingue.
3. **Un beacon client ne prouve rien si la requête n'arrive pas.** Bloqueur, réseau,
   onglet fermé : aucune trace. Un événement **côté serveur** borne la perte : rendus ≥
   vues réelles ≥ vues enregistrées.

> **Une métrique de verdict légèrement faussée est pire qu'une métrique cassée, parce
> qu'elle reste crédible.** Corollaire : **une métrique fausse qui confirme ce qu'on
> espère ne se remet jamais en question.** Un biais optimiste est plus dangereux qu'un
> biais pessimiste, à ampleur égale.

**Un fait, un point d'émission.** Trois appels dispersés pour le même événement rendent
le double comptage inévitable — passer par un module unique.

---

<a id="12"></a>
## 12. RISQUE LÉGAL ET MITIGATIONS

On ne touche à aucun paiement → risque PSP nul en phase 1. Le risque restant est le
**contenu hébergé**.

**Mitigations obligatoires dès le MVP** :

1. **Positionnement public 100 % générique et neutre.**
2. **CGU claires + procédure de notification et retrait** (statut d'hébergeur) +
   **outil de suspension dans l'admin**.
3. **`noindex` partout**, aucune galerie publique, aucun moteur de recherche interne.
   Chaque lien privé et isolé.
4. **Diversifier tôt** hors du vertical reps.

> **C'est de là que vient l'importance disproportionnée de la coupure de suspension** :
> c'est la capacité technique qui fonde notre statut d'hébergeur.
>
> La chaîne est : `suspension en base → la fonction de lecture publique filtre → invalidation du cache →
> la page cesse de répondre`. **Le mode de défaillance est SILENCIEUX** : si
> l'invalidation est mal câblée, elle n'échoue pas, elle ne trouve simplement rien à
> invalider. La suspension s'enregistre, l'audit la consigne, l'écran affiche
> « suspendu » — **et la page publique continue d'être servie depuis le cache. Tout dit
> que le compte est coupé. Il ne l'est pas.**
>
> **Établir par exécution que la coupure coupe, avec un seuil de 30 secondes, est une
> priorité du premier déploiement.** Et le contre-test vient **en premier** : prouver
> que la page EST mise en cache, avant de prétendre mesurer une invalidation.

⚠️ Rien ici n'est un conseil juridique. Faire valider les CGU et le statut d'hébergeur
par un avocat avant tout lancement public.

---

<a id="13"></a>
## 13. MÉTHODE DE TRAVAIL ET DISCIPLINE DE VÉRIFICATION

### Migrations — règle absolue

> **Une migration par sujet, numérotée à sa création, JAMAIS rouverte une fois
> appliquée.** Modifier un fichier appliqué fait diverger silencieusement les
> environnements. L'ordre lexicographique **DOIT ÊTRE** l'ordre d'application. Les
> correctifs sont de **nouvelles** migrations.

> ⚠️ **AMENDÉ LE 01/09/2026 — il disait « EST », et la base disait le contraire.**
> `supabase_migrations.schema_migrations` triée par `version` place la **088 avant
> la 087**. Inoffensif ici (aucun objet commun entre les deux), mais une
> reconstruction depuis zéro appliquerait un ordre jamais exécuté en production,
> et rien ne le disait : les contrôles comparaient des ensembles de noms, pas une
> séquence. La séquence est désormais comparée, avec l'inversion connue déclarée
> et sa raison. C'est L-014 dans sa forme exacte — *un document affirme un état
> que personne n'a exécuté*.

- `alter type ... add value` vit **SEUL** dans sa migration (Postgres interdit d'employer
  une valeur dans la transaction qui l'ajoute).
- **Vérifier que les valeurs d'énumération citées dans les contrats existent
  réellement.** Une valeur citée mais absente fait échouer l'insertion d'événement, et
  **la transaction étant partagée, annule la mutation entière**.
- **`create or replace function` NE REMPLACE PAS** une fonction dont la liste
  d'arguments change : **il en crée une SECONDE**. Les deux surcharges coexistent, et un
  appel résout l'ANCIENNE — sans erreur. **Un `drop` explicite est obligatoire.**
- Un test doit comparer base et dépôt **DANS LES DEUX SENS** : une migration appliquée
  sans fichier, et un fichier jamais appliqué.

### Code

- TypeScript **strict**, **pas de `any`**, pas de `@ts-ignore` sans justification.
- **Server Components par défaut** ; `"use client"` seulement si état ou handlers.
- **Server Actions pour les mutations** ; route handlers réservés aux webhooks et
  callbacks d'auth. *Déviation documentée : l'export CSV est un route handler, parce
  qu'un téléchargement exige `Content-Disposition` qu'une Server Action ne peut pas
  fixer — et un export est une lecture. Lecture **sous RLS avec la session**, jamais
  service-role : un export est le pire endroit où contourner l'isolation, il produit un
  fichier qui sort de l'application.*
- **Zod sur toute entrée externe**, y compris ce qui « vient de notre formulaire ».
- Fichiers `kebab-case`, composants `PascalCase`, fonctions `camelCase`.
- **Jamais de `catch` vide.**
- Commenter **le pourquoi, jamais le quoi**. *Un commentaire qui décrit une intention
  plutôt qu'un comportement est un mensonge en attente.*
- **Aucune chaîne visible en dur** — tout par `next-intl`, FR et EN, parité vérifiée par
  test.
- **Aucune requête vers un domaine tiers sur un chemin dont l'échec est invisible.** Une
  librairie qui charge son fil de travail depuis un CDN échoue en **silence** derrière un
  pare-feu — et les photos partiraient brutes. Auto-héberger le fichier, avec vérification
  d'identité sha256 avec le paquet installé.

### Tests — la discipline qui a le plus payé

**Falsifier en cassant LE PRODUIT, pas les tests.** Retirer la garde, désactiver
`unaccent`, filtrer une colonne dans une **fonction de lecture publique**, ajouter la colonne interdite à l'export.
**Si la suite reste verte, elle ne prouvait rien.**

**Falsifier HORS du cas motivant.** Le falsifier sur son cas d'origine ne prouve que ce
qu'on savait déjà. **Deux falsifications minimum**, dont une sur une variante qu'on
n'avait pas en tête.

**Inventorier plutôt que sélectionner.** Un contrôle ne doit pas dépendre de ce que son
auteur a pensé à inspecter. La sonde rend **TOUT**, le test **déclare les exceptions
avec leur raison**, et il échoue **dans les deux sens**.

**Tout garde doit prouver qu'il inspecte quelque chose** avant de prouver que ce quelque
chose est correct. **Un ensemble vide passe tout.**

**Utiliser des utilisateurs réellement authentifiés, jamais de mock** : *un test qui
simule RLS ne teste pas RLS.*

**Vérifier qu'un test ÉCHOUE avant de poser la protection.**

**Toujours un contre-test positif** : une suite où tout est refusé passe à 100 % sans
rien prouver.

**Un test qu'on relance jusqu'au vert n'est plus bloquant** — si un test échoue par
intermittence, c'est le test qu'il faut borner.

**Ne jamais commiter par-dessus des portes rouges**, même si la cause est ailleurs —
c'est comme ça qu'on s'habitue au rouge.

### Les leçons formelles

| # | Leçon |
|---|---|
| **L-001** | Les policies RLS s'exécutent avec le rôle **appelant**. La protection vient de la **non-exposition du schéma**, pas du retrait du droit |
| **L-002** | Une policy sur `profiles` qui lit `profiles` → **récursion infinie**. Utiliser les **privilèges de colonne**, évalués **avant** la policy |
| **L-003** | Consulter la doc de la **VERSION INSTALLÉE**. Lire `package.json` **d'abord**. La doc la plus visible n'est pas celle de la version installée |
| **L-004** | Server Actions : **limite de corps de 1 Mo**. Ne **jamais** faire transiter un fichier par une Server Action |
| **L-005** | Ne jamais croire le client sur la **taille** d'un fichier. Toute donnée qui fonde un coût doit être **mesurée côté serveur** |
| **L-006** | **Un test qui n'a jamais échoué ne prouve rien.** Toujours constater le rouge d'abord |
| **L-007** | Propager un amendement de spec à **TOUTES** les exigences liées |
| **L-008** | Un lint de contenu qui scanne le code **échoue sur ses propres listes noires**. Cibler **l'usage interdit**, pas la mention |
| **L-010** | `ALTER TYPE ADD VALUE` doit vivre **seul** dans sa migration |
| **L-011** | Une FK sans `ON DELETE` sur un journal **bloque toute suppression de compte** |
| **L-013** | Un **SQLSTATE réessayable** transforme un refus métier en boucle. Un refus métier ne doit **jamais** porter `40001` — le code d'erreur fait partie du **contrat** |
| **L-014** | **Un document affirme un état que personne n'a exécuté.** Interroger, pas lire |
| **L-015** | Un **seuil de temps seul** certifie une performance qui n'existe qu'à la volumétrie de test |
| **L-016** | Une librairie qui charge son fil de travail depuis un **CDN** échoue en **silence** |
| **L-017** | Un seuil dépassé **ne veut pas dire qu'il manque un index**. Vérifier d'abord que la requête **ne demande pas plus que nécessaire** — un agrégat complet ne se rattrape par aucun index |
| **L-018** | Un test qui constate qu'une **déclaration existe** ne prouve jamais que **son absence bloque** |
| **L-019** | Une mesure isolée **se trompe dans le sens rassurant**. Rodage, puis DEUX exécutions concordantes |
| **L-020** | **Un contrôle qui cherche un MOT ne prouve rien.** Une expression régulière prouve qu'un **texte** existe, jamais qu'une **capacité** est en place |
| **L-021** | **Un document qui SE SOUS-ESTIME ne sera jamais vérifié.** Convertir la dette payée en revendication positive **au moment de la pose** |
| **L-022** | **Le veilleur ne peut pas être ce qu'il veille.** Veille **mutuelle**, et **l'alerte PART** (email), pas un badge sur un écran que personne n'ouvre |
| **L-023** | **Le recensement des gardes se trompe comme les gardes.** Vérifier un échantillon à la main |
| **L-024** | **Un point d'ingestion qui répond 200 ne prouve pas qu'il a accepté.** Trouver un appel qui **REFUSE** quand la config est fausse — et l'avoir **vu refuser** |
| **L-025** | **Un garde écrit après coup hérite du champ de vision de la CORRECTION, pas du problème.** Il regarde là où le défaut n'est plus. **Falsifier HORS du cas motivant.** *(6 occurrences observées)* |
| **L-026** | Une valeur qui a la **FORME** d'une configuration franchit toutes les validations de présence. **Valider la présence ne dit rien de la substitution** |
| **L-027** | **Postgres accorde `EXECUTE` à `PUBLIC` par défaut.** La garde dans le **corps** ne remplace pas le **droit** |
| **L-028** | **Les propriétés de sécurité qui vivent EN BASE sont invisibles à toute relecture de code.** Inventorier par le catalogue |
| **L-029** | **Une protection qui tient à une ABSENCE n'est pas une protection.** *Si la phrase juste est « ce serait ouvert si quelqu'un ajoutait X », c'est en sursis* |
| **L-030** | **Une course qui DÉGRADE au lieu de casser** est la plus difficile à attribuer. C'est le **TYPAGE** qui doit l'exiger |
| **L-031** | Un motif de garde qui cherche un appel de fonction doit s'appliquer au **CODE, commentaires retirés** |
| **L-032** | **Toute vérification qui interroge un artefact construit doit établir que l'artefact CORRESPOND au code sous test.** *« Il répond » est la propriété que tous les résidus possèdent* |

### Un motif transversal, rencontré cinq fois

**Un document affirme un état que personne n'a vérifié.** Et sa variante la plus
pernicieuse : **une affirmation trop vague pour être fausse ne peut pas non plus être
vraie.** « La recherche plein texte est en place » restait vrai pendant que l'index ne
repliait pas les accents.

→ Toute affirmation de capacité technique doit être **exécutable, et exécutée**.
→ Les **décomptes** (tests, tables, migrations) se périment à chaque session : les
remplacer par **la requête qui les produit**. Le taux d'échec observé de « penser à
mettre à jour » est de **3 sur 3**.

---

<a id="14"></a>
## 14. CE QUI EST BLOQUÉ ET SUR QUI

| Bloqueur | Ce que ça débloque | Chez qui |
|---|---|---|
| **Lot de 25-30 photos QC réelles** | Calibrage du plafond de vignette et du seuil vidéo | **Wassim** |
| **10 numéros de suivi réels** | Choix du fournisseur → intégration du suivi | Contact fournisseur de Wassim |
| **Premier déploiement** | **La coupure de suspension**, le veilleur | Wassim |

### Composition exacte du lot de photos

**25 à 30 photos**, pour en avoir 20 exploitables après écarts.

| Type | Combien | Pourquoi |
|---|---|---|
| **Déjà passées par WhatsApp** | **8-10** | Le cas réel des utilisateurs, et le plus traître : déjà ré-encodées, pleines d'artefacts que le second encodage doit gérer |
| Textile à motif fin | 5 | Le pire cas pour un encodeur — un motif fin ne se compresse pas, et c'est le détail que le client vient vérifier |
| Intérieur sombre | 4 | Le bruit en basse lumière coûte cher en poids |
| Plein soleil | 4 | Fortes hautes lumières, l'inverse du cas précédent |
| Logo sur fond uni | 3 | Le cas facile — il doit passer largement |
| Étiquette ou code imprimé | 2 | Lisibilité à 170 px : c'est là qu'on verra si la vignette reste utile |

**Règles impératives** : fichiers **originaux**, non renommés, non retouchés. **Pas de
passage par un outil qui recompresse** — ni Drive en « qualité optimisée », ni un envoi
WhatsApp *supplémentaire*. **Préfixer `wa_`** les fichiers passés par WhatsApp. Le test
se déroule **dans un NAVIGATEUR** (la vignette est produite entièrement côté client).

> *Vingt photos de studio sur fond blanc passeraient toutes et ne prouveraient rien. Les
> photos difficiles sont plus utiles que les belles.*

### Le protocole des 10 numéros

Aucun comparatif indépendant de couverture n'existe : **toutes** les pages publiques
comparant 17TRACK et TrackingMore sont écrites par l'un d'eux. Dix vrais numéros valent
mieux que dix pages de marketing.

Composition : **6 livrés dans les 30 derniers jours, 4 en cours, 1 à 2 bloqués
longtemps**. Pas plus vieux que 30 jours — 17TRACK purge, on mesurerait sa rétention et
non sa couverture.

**Le critère décisif n'est pas le nombre de transporteurs mais la continuité au DERNIER
KILOMÈTRE** : sur le trajet Chine → Europe, le numéro change à la remise au réseau
local, **exactement au moment que le client attend le plus**.

**Réserve connue** : 17TRACK cesse son suivi après 30 jours sans mouvement, alors que
notre rétention en prévoit 90. Un colis bloqué en douane sort de leur radar avant du
nôtre.

**Bloquant à lever avant tout engagement** : la signature des notifications n'est
documentée publiquement chez aucun des deux. Un point de réception non authentifié
laisserait n'importe qui écrire dans les commandes de n'importe quel vendeur.

### Travailler avec Wassim

- **Il veut les CHIFFRES, pas la recommandation.** Présenter les données, dire ce
  qu'elles impliquent, **et le laisser trancher**.
- **Il tranche vite et bien quand la question est posée nettement.** Poser une
  **question binaire avec ses conséquences chiffrées**, pas un menu d'options.
- **Il repère les défauts silencieux.** Prendre ses intuitions au sérieux.
- **Il ne veut pas qu'on maquille.** Une mesure impossible **se dit impossible**.
- **⚠️ NE JAMAIS POUSSER SANS LE LUI DEMANDER.**
- **Langue : français**, y compris commentaires de code et messages de commit.

---

<a id="15"></a>
## 15. GLOSSAIRE

| Terme | Définition |
|---|---|
| **Commande** | L'unité du produit. Une commande = une page = un lien |
| **QC** | Contrôle qualité. Les photos et vidéos que le fournisseur prend de l'article avant expédition |
| **`public_token`** | L'identifiant non devinable qui donne accès à la page publique. Immuable à vie |
| **Destinataire** | Celui qui reçoit le lien. N'a jamais de compte |
| **Vendeur** | Celui qui crée les commandes. Fournisseur ou revendeur |
| **Agent** | Plateforme d'achat groupé chinoise (CNFans, Kakobuy, Sugargoo, ACBuy). **Ne jamais nommer dans l'UI** |
| **Frise** | La barre de progression du statut d'expédition, quatre étapes |
| **Point de passage** | Un événement de suivi daté rapporté par le transporteur |
| **Silence** | Absence de mouvement d'un colis. Nommé au-delà de 10 jours |
| **Falsification** | Casser le produit en base pour vérifier qu'un test le détecte |
| **Porte de qualité** | Contrôle bloquant : typecheck, lint, build, tests, tests RLS |
