# AUDIT COMPLET — DropLink, 31/08/2026

> Commit de départ : `001cbe0`. Branche `master`, arbre propre, 421 fichiers suivis.
> Tout ce qui est marqué **PROUVÉ PAR EXÉCUTION** a été mesuré sur cette machine,
> contre la vraie base et un vrai build servi. Tout le reste est marqué comme tel.
>
> **Ce document ne prétend pas que le produit est sans défaut.** Il dit ce qui a
> été inspecté, comment, ce qui a été trouvé, ce qui a été corrigé, ce qui a été
> laissé, et ce qui n'a pas pu être vérifié.

---

## 1. RÉSUMÉ EXÉCUTIF

**Vingt-cinq défauts confirmés**, dont deux à impact direct sur le coût du
produit et un sur ce que le client voit. **Dix-sept corrigés**, chacun avec sa
sonde et sa falsification vue en rouge ; **huit laissés**, dont trois sont des
arbitrages produit qui appartiennent à Wassim et non à moi.

Deux des vingt-cinq ont été **introduits par cet audit**, et attrapés par les
portes du projet — ils sont racontés au § 5.4 plutôt que passés sous silence.

Les quatre qui comptent le plus :

| # | Défaut | Comment il a été établi |
|---|---|---|
| **1** | Un vendeur authentifié obtenait autant d'URL `PUT` R2 qu'il voulait sur des clés qu'**aucune ligne n'aurait jamais référencées** — donc invisibles au compteur de stockage, au plafond de 100 Go et à tous les compteurs d'usage. Le seul poste de coût que le brief désigne comme pouvant déraper était écrivable **sans borne et sans mesure**. | Lecture du code, confirmée par l'absence de `verifierQuotaDepot` et de toute vérification du `mediaId` dans `preparerDepotDerivee` |
| **2** | `attacher_colis` n'avait **aucun plafond**. Changer le numéro de suivi en boucle sur **une seule commande** crée un colis par changement, chacun facturable — et le palier gratuit du fournisseur (200 prises en charge, **une seule fois**) est **commun à tout le produit**. | Catalogue : aucun déclencheur de plafond sur `tracked_parcels` |
| **3** | Avec un accent vendeur clair, l'aplat du bouton « Approuver » de la page client était à **1,000 : 1 contre son fond** — invisible, à côté d'un « Refuser » encadré et lisible. | **PROUVÉ PAR EXÉCUTION** sur `resoudreAccent()` : `#ffffff → 1,000`, `#ffff00 → 1,074`, `#eab308 → 1,918` |
| **4** | La consultation d'un **client** déplaçait `orders.updated_at`, donc réordonnait tout seul le tri « modifiées » du vendeur. La migration 090 avait écrit ce symptôme mot pour mot en fermant le chemin du transporteur ; celui du client est né hors de son champ de vision. | **PROUVÉ PAR EXÉCUTION**, transaction annulée : `2026-08-30T16:14:08` → `2026-08-31T13:28:17` |

**Le motif transversal de cet audit**, retrouvé neuf fois : *un garde écrit après
coup hérite du champ de vision de la CORRECTION, pas du problème* (L-025). Le cas
le plus net : la sonde qui protège le `public_token` ne posait **ni vignette ni
logo** dans son jeu de test. Les trois champs qui portent une URL signée valaient
donc `null`, et elle cherchait les identifiants internes dans un objet où le
défaut ne pouvait pas être. Rendue voyante, **elle a échoué au premier passage**.

---

## 2. INVENTAIRE DU DÉPÔT

Construit depuis `git ls-files`, pas depuis une liste connue.

| Domaine | Avant | Après |
|---|---:|---:|
| Fichiers suivis | 421 | 429 |
| Routes (`src/app`) | 47 | 47 |
| Modules `src/lib` | 69 | 70 |
| Composants | 48 | 48 |
| Migrations SQL | 119 | **126** |
| Tests | 113 | 113 |
| Scripts | 6 | 6 |
| Catalogues i18n | 2 (916 clés chacun) | 2 (920) |

---

## 3. MÉTHODE

**Neuf agents de lecture seule**, chacun avec une surface disjointe, un mandat
écrit et l'obligation de classer chaque point *PROUVÉ / RÉFUTÉ / NON VÉRIFIÉ* :
page publique et jeton · admin · routes `/api` et suivi · éditeur, médias et R2 ·
chaîne des 126 migrations · valeur probante des 113 tests · auth, session,
frontières et instrumentation · i18n, états, accessibilité et contraintes
produit · écrans secondaires, pages légales et veilleur.

**Puis vérification par exécution de chaque constat lourd, par moi.** Aucun
agent n'a touché la base ni exécuté de test : leurs constats sont des
hypothèses jusqu'à ce qu'une mesure les tranche. Deux affirmations d'agent ont
d'ailleurs été **corrigées** par la mesure (§ 9).

**Ce qui a été exécuté** : les six portes deux fois, `pnpm test:perf` (49/49,
11 min 51), `pnpm check:r2` (13/13, bucket réel), deux sondes de catalogue
Postgres, une mesure de poids sur un build de production servi, et **huit
falsifications vues en rouge**.

---

## 4. CE QUE LA SONDE DE CATALOGUE A ÉTABLI

Exécutée sur la vraie base, en lecture seule.

| Contrôle | Résultat |
|---|---|
| Tables sans RLS | **0** sur 17 |
| Tables sans RLS forcée | **0** |
| Fonctions atteignables par `anon` | **5** sur ~120 — les cinq lectures par jeton, toutes `security definer` avec `search_path` figé |
| `SECURITY DEFINER` sans `search_path` | **0** |
| Surcharges fantômes | **0** |
| Escalade par privilège de colonne | **impossible** — `authenticated` n'a `UPDATE` que sur `account_type` et `locale` |
| `alter default privileges` sur les fonctions | **posé et effectif** — une fonction neuve ne naît pas exécutable par `PUBLIC` |
| Base | 31 Mo, lecture seule **off** |

Deux points que la lecture des migrations laissait ouverts et que le catalogue a
tranchés :

- **`force row level security` est inopérant contre le propriétaire.** `postgres`
  et `service_role` portent `rolbypassrls`. La protection réelle est le contrôle
  de propriété écrit dans le corps de chaque fonction — il y est partout, mais le
  commentaire de la migration 001 surestime ce que `force` apporte.
- **Aucun index non partiel `(shop_id, created_at)` n'existe.** Les quatre index
  de ce préfixe sont tous partiels sur `archived_at`, et trois migrations (077,
  095, 096) affirment s'appuyer sur un index qui n'est pas là.

---

## 5. LES DÉFAUTS, ET CE QUI EN A ÉTÉ FAIT

### 5.1 Corrigés — coût et sécurité

| # | Sévérité | Défaut | Correction |
|---|---|---|---|
| 1 | **HAUTE** | `preparerDepotDerivee` : ni plafond de débit, ni preuve que le `mediaId` désigne quoi que ce soit → écriture R2 illimitée et non comptée | Plafond de débit posé + **laissez-passer signé** (HMAC lié aux trois identifiants), vérifié à temps constant. La preuve se vérifie **hors ligne** : interroger le stockage aurait mis un appel réseau dans la suite `rls` |
| 2 | **HAUTE** | `attacher_colis` sans plafond → un compte épuise le budget de suivi de tout le produit | Migration 125 : déclencheur `before insert` sur `tracked_parcels`, plafond = **2 × plafond mensuel de commandes**, refus `DL051` portant ses deux nombres |
| 3 | MOYENNE | Les dérivées ne sont **jamais supprimées** — trois chemins de retrait laissaient jusqu'à 110 Ko d'orphelins **invisibles en base**, donc absents du compteur de stockage et de l'écran d'administration | `supprimerAvecDerivees()` sur les trois chemins |
| 4 | MOYENNE | `system.ts` — service-role, RLS contournée — **n'était restreint par rien** ; et les trois exceptions ESLint éteignaient la règle **entière** au lieu de leur seul motif ; et les motifs exigeaient `lib/`, donc un import relatif passait | Trois cloisons nommées, `sauf()` pour que chaque exception ne désarme que sa raison, motifs élargis aux chemins relatifs. **Falsifié** : un import de `system.ts` dans un écran admin est refusé |
| 5 | MOYENNE | Une notification de suivi dont l'écriture échoue **consommait son empreinte de déduplication sans la rendre**, et la route répondait **200** — le fournisseur cessait de réémettre, l'état était perdu définitivement | Migration 126 (`liberer_notification_vue`) + libération sur les deux chemins d'échec + **503** sur nos propres pannes, 200 sur les cas normaux |
| 6 | MOYENNE | L'export CSV **ignorait `du` et `au`** — un vendeur filtrant « août » recevait toutes ses commandes, jusqu'à 5 000 lignes, **liens publics compris** | Les deux bornes sont lues |

### 5.2 Corrigés — ce que voit l'utilisateur

| # | Sévérité | Défaut | Correction |
|---|---|---|---|
| 7 | **HAUTE** | `resoudreAccent()` ne bornait **jamais** l'aplat contre le fond de page. Bouton principal invisible pour tout accent clair | L'aplat est ajusté à 3 : 1 contre le fond **avant** le choix de l'écriture. Test étendu aux six couleurs extrêmes ; **falsifié : 4 échecs sur 6** |
| 8 | MOYENNE | Une **révision** de contrôle qualité par le client était attribuée au **vendeur** : `qc_decide_par` passait de `client` à `vendeur` à la seconde décision | Migration 121 : marqueur local à la transaction, parce que « l'auteur a-t-il été déclaré ? » n'est pas lisible depuis `old`/`new` |
| 9 | MOYENNE | La consultation d'un client déplaçait `updated_at` (défaut n° 4 du résumé) | Migration 120 : second marqueur, honoré par le déclencheur |
| 10 | MOYENNE | **Les CGU citaient un formulaire de signalement qui rend 404.** Quatre surfaces gardaient correctement le lien ; la prose qui *engage* n'était conditionnée par rien | La phrase n'est rendue que si le canal existe |
| 11 | MOYENNE | `t(clé, { defaut: … })` — **next-intl n'a pas d'option de repli.** Sept sites croyaient retomber sur la valeur brute ; ils affichaient le chemin de la clé | `t.has(clé) ? t(clé) : brut`, vérifié contre les types de la **version installée** (L-003) |
| 12 | MOYENNE | `.replace("{nom}", …)` avec du texte libre : `$&`, `` $` `` et `$'` sont des motifs de substitution. Une boutique « Rock $& Roll » rendait « Retrouvez Rock {nom} Roll » **sur la page du client** | `src/lib/format/gabarit.ts` — `split().join()`, qui ne connaît aucun motif et remplace toutes les occurrences |
| 13 | FAIBLE | `couleur_personnalisee` comparait à `#0058be`, l'ancien défaut ; la migration 100 l'a fait passer à `#7c5cf5`. **Toute boutique née depuis déclarait « personnalisé » sans que le vendeur ait rien touché** — biais du côté rassurant | Comparaison à `ACCENT_DEFAUT` |
| 14 | FAIBLE | Le repli d'accent du CSS portait la même valeur périmée, avec un commentaire affirmant l'identité avec la base | Repli à `#7c5cf5` |
| 15 | FAIBLE | Le « +N » de l'écran Envois sous-comptait dès qu'une commande rattachée n'avait pas de destinataire nommé | Le reste se compte depuis les noms affichés |
| 16 | FAIBLE | Deux chaînes visibles en dur (« Atelier Nord », nom de boutique fictif) sur la landing et les deux écrans d'accès | Passées au catalogue, FR et EN |
| 17 | FAIBLE | Pas de lien d'évitement dans l'espace vendeur, alors que la cible `id="contenu"` existe sur les cinq écrans et que l'admin, structurellement identique, en a un | Posé, même forme que l'admin |

### 5.3 Corrigés — les portes elles-mêmes

| # | Défaut | Correction |
|---|---|---|
| 18 | **Six cibles du falsificateur levaient une `ReferenceError` avant de rien casser** — `const fin` lu dans sa zone morte temporelle. Le plafond de commandes, l'immobilité et la transition « premier scan » n'avaient donc **aucune falsification opérante** | Déclaration remontée. **Éprouvé** : `casser plafond-commandes-en-dur` casse, la sonde rougit, `reparer` restaure |
| 19 | `scripts/suite.mjs` couvrait le **saut**, pas la **disparition**. Renommer un fichier de test ou vider un `describe` ne produisait ni échec ni saut | Plancher par projet (400 / 600), avec le message qui dit quoi faire |
| 20 | **Les deux tiers des contrôles de fumée vivent sous deux `if` dont l'erreur est jetée.** Un quota d'authentification à 429 les faisait tous disparaître, et le script affichait « Tout est vert » | Plancher de 170 contrôles, et le décompte est imprimé |
| 21 | La CI annonçait « 412 tests unitaires » **en dur dans le nom du job**, vérifié par rien | Le nombre sort du fichier ; le plancher vit dans `suite.mjs`, où il est vérifié |
| 22 | La sonde des couleurs en dur **lisait les commentaires** (L-031), au point d'exiger une exception pour une couleur citée dans un commentaire | Dépollution par `sansCommentaires` ; l'exception `#ef0000` disparaît d'elle-même |
| 23bis | Le repli d'accents de la **saisie** divergeait de celui de la **base** : NFD n'isole que les diacritiques *combinants*, donc `ø`, `æ`, `œ`, `ß`, `ł`, `ð`, `þ` passaient intacts là où `unaccent` les replie. **Taper « Søren » ne trouvait pas la commande de Søren**, alors que taper « soren » la trouvait | Table de ligatures **relevée dans la base** (`select public.sans_accents(…)`), et un test qui compare les deux replis **par exécution** plutôt que de recopier un dictionnaire |
| 23ter | `src/lib/format/gabarit.ts` n'avait aucun test | Cinq cas, dont les quatre motifs de `$` et la double occurrence. **Falsifié** : revenir à `replace` fait échouer 2 des 5 |
| 23 | Trois index faisaient double emploi avec un index de contrainte, dont un sur `order_media` — écrit à chaque dépôt de média | Migration 124. La sonde d'index ne pouvait pas les voir : elle **exclut** les index de contrainte, donc compare deux ensembles sans jamais les confronter |

### 5.4 Un défaut que cet audit a lui-même introduit, et qu'une sonde a attrapé

Le premier passage des portes après les corrections est **sorti ROUGE**, sur un
seul contrôle :

> `falsificateur-a-jour` : « cible inconnue répare `arbitrer_qc` depuis
> `069_qui_a_arbitre_le_qc.sql`, mais `121_…` la redéfinit après : la réparation
> ramènerait le produit en arrière. »

C'est exactement le défaut que cette sonde existe pour empêcher, et il venait de
ma propre migration 121. Sans elle, `node scripts/falsifier.mjs reparer
qc-sans-suspension` aurait **réinstallé l'attribution fausse du contrôle qualité**
— une révision du client réattribuée au vendeur — pendant que le script annonce
avoir réparé. La réparation vise désormais la 121, et le couple casser/réparer a
été rejoué de bout en bout.

Il est consigné ici parce qu'un rapport qui ne montre que les défauts des autres
donne une fausse idée de la fiabilité du procédé.

**Et il y en a eu un second, du même genre.** Le plancher de contrôles que j'ai
posé sur la fumée était **faux** : je l'avais fixé à 170 parce que la sortie
imprime 183 lignes `OK`. Or le tableau `controles` n'en porte que **143** — une
quarantaine de contrôles s'impriment directement, sans y passer. Le passage
suivant est donc sorti **rouge**, en accusant le produit d'avoir sauté quarante
contrôles qui avaient parfaitement tourné.

Un plancher qui compte la mauvaise quantité est pire qu'aucun plancher. Il a
fallu **mesurer** — compter les lignes imprimées et les entrées du tableau
séparément — pour voir que l'erreur était la mienne. Le plancher est désormais à
140, juste sous la valeur **relevée**, et les trois étages du bloc conditionnel
**disent leur motif** quand ils cèdent : sans cela, le plancher signale qu'il
manque quelque chose sans jamais dire quoi, et on cherche dans le produit un
défaut qui est dans l'environnement.

*Une tentative d'interception de `console.log` pour compter les lignes réellement
imprimées a été écrite, puis retirée : elle rendait 0 alors que 183 lignes
sortaient, et je n'ai pas su expliquer pourquoi. Un mécanisme qu'on ne comprend
pas n'a rien à faire dans une porte — surtout pas dans celle qui compte.*

---

## 6. CE QUI N'A PAS ÉTÉ CORRIGÉ, ET POURQUOI

### 6.1 Trois arbitrages qui appartiennent à Wassim

1. **Le `shop_id` et l'`order_id` sortent dans le HTML de la page publique.**
   **PROUVÉ PAR EXÉCUTION** sur un build servi. Ils voyagent dans le *chemin* des
   URL présignées R2 — une signature S3/R2 porte la clé d'objet qu'elle signe, il
   ne peut pas en être autrement. La forme de la clé n'est pas un accident : elle
   est générée par le serveur, ancrée au préfixe de la commande, et vérifiée par
   un déclencheur en base — c'est elle qui empêche un vendeur d'écraser le média
   d'un autre. La rendre opaque demanderait une table d'indirection et retirerait
   la garde la plus forte du stockage.
   **La question** : deux liens publics du même vendeur restent rattachables l'un
   à l'autre. Ce n'est pas un secret, c'est une corrélation.
   **Ce qui a été fait** : la sonde a été rendue voyante, elle a échoué, et
   l'exception est désormais **déclarée et bornée** — les identifiants ne doivent
   apparaître **que** dans une URL signée, et le test échoue dans les deux sens.

2. **`arbitrer_qc` déplace aussi `updated_at`.** Contrairement à la consultation,
   une décision de contrôle qualité change réellement l'état de la commande.
   Faut-il qu'elle remonte la commande dans le tri « modifiées » du vendeur ?
   C'est un choix, pas un défaut — il est signalé dans la migration 120 plutôt
   que tranché en silence.

3. **Le dégradé de marque apparaît deux fois sur la landing** (haut et bas de
   page, même action). Le brief dit « une seule action principale par écran ».
   Les 43 planches vivent hors du dépôt et **le canevas fait foi** : je ne
   tranche pas sans les avoir ouvertes.

### 6.2 Ce qui ne peut pas être corrigé sans changer une décision produit

4. **Le plafond de 60 s par vidéo est déclaratif.** `dureeSecondes` est optionnel
   et vient de `video.duration` lu dans le navigateur ; l'omettre, ou envoyer un
   fichier que le navigateur ne sait pas décoder, contourne le contrôle. Le
   rendre obligatoire **contredirait une décision existante** — « refuser une
   vidéo parce qu'on n'a pas su en extraire une image ferait payer au vendeur une
   limite qui est la nôtre » — et le mesurer côté serveur exigerait le
   transcodeur que le brief refuse. **Le plafond qui borne réellement le coût est
   celui de la taille (20 Mo), lui relu côté serveur.** À dire, pas à maquiller.

5. **Il n'existe aucune frontière d'erreur sur `/p/[token]` ni sur les surfaces
   publiques `[locale]`.** Une erreur de rendu y sert la page générique de Next,
   en anglais, **au client d'un vendeur**. La correction n'est pas triviale : une
   frontière d'erreur est un Client Component, et le segment public n'expédie
   **délibérément aucun provider i18n** — tout texte y serait une chaîne en dur,
   c'est-à-dire la règle que le projet fait respecter partout ailleurs. C'est un
   arbitrage entre deux règles, pas un oubli à réparer.

6. **Le visionneur plein écran ne piège pas le focus et ne le restitue pas.**
   `role="dialog" aria-modal` est posé, Échap ferme, le focus entre — mais la
   tabulation sort derrière la couche opaque. Correction réelle, non faite faute
   de pouvoir la mesurer dans un navigateur au cours de cette passe.

### 6.3 Ce qui est bloqué sur autre chose

7. **La cadence de suivi n'a aucun appelant.** `CRON_SECRET` est absent, aucun
   planificateur n'existe dans le dépôt : aucune interrogation, aucun abandon,
   aucune marque d'immobilité, **et aucune purge à 90 jours**. Bloqué sur le
   premier déploiement.

8. **Le veilleur n'envoie rien.** Il n'y a **aucun module d'envoi d'email** dans
   le dépôt et `resend` n'est pas dans `package.json` : la réponse à « silence,
   erreur visible ou fausse réussite ? » est *aucun des trois*. Le seul canal est
   un badge sur un écran que personne n'ouvre — ce que L-022 désigne nommément
   comme insuffisant. Bloqué sur `RESEND_API_KEY`.

---

## 7. RÉSULTATS DES PORTES

| Porte | Résultat |
|---|---|
| `pnpm typecheck` | vert |
| `pnpm lint` | vert |
| `pnpm build` | vert — `/p/[token]` à **118 kB** de premier chargement JS |
| `pnpm test` | **423/423**, 0 sauté, 0 todo |
| `pnpm test:rls` | **622/622**, 0 sauté, 0 todo |
| `pnpm fumee` | **183 lignes de contrôle, 0 échec**, 143 contrôles empilés pour un plancher de 140 |
| `pnpm test:perf` *(hors portes)* | **49/49**, 11 min 51 |
| `pnpm check:r2` *(hors portes)* | **13/13**, bucket réel |

### Le poids réel de la page publique, mesuré

Sur un build de production servi sur port éphémère, commande à 14 médias :

```
HTML seul          :  44,2 Ko
TOTAL hors médias  : 631,2 Ko BRUT  |  177,2 Ko GZIP
Budget du brief    : 300 Ko hors médias
```

**Le budget est tenu**, mais deux choses sont à savoir :

- Le chiffre du brief — « total mesuré atteignable : ~116 Ko » — est **périmé**.
  Le vrai est 177 Ko compressés.
- **Le contrôle de fumée qui porte ce budget ne mesure que le HTML.** Étiqueté
  « poids du HTML public (budget 300) », il compare 44 Ko à 300 : il ne peut pas
  devenir rouge pour la chose que le budget protège. Une bibliothèque de
  carrousel de 90 Ko — le cas exact que le brief redoute — passerait sans un mot.
  **Signalé, non corrigé** : mesurer les sous-ressources depuis la fumée demande
  de rejouer la résolution des chunks, ce qui mérite sa propre passe.

---

## 8. FALSIFICATIONS — VUES EN ROUGE

Aucune garde posée ici n'est réputée protéger avant qu'on l'ait vue échouer.

| Garde | Falsification | Résultat |
|---|---|---|
| Substitution de gabarit | retour à `String.replace` | **2 échecs sur 5** |
| Repli d'accents | *(comparaison à la base, pas de falsification : la base EST l'arbitre)* | — |
| Laissez-passer des dérivées | Comparaison désarmée | **1 échec** — le test dédié |
| Plafond de débit des dérivées | `verifierQuotaDepot` retiré | **1 échec** — l'autre test, *hors du cas motivant* |
| Aplat contre le fond | Ajustement retiré | **4 échecs sur 6 couleurs** |
| `updated_at` sur consultation | Marqueur retiré du déclencheur | **1 échec** |
| Attribution du QC | Ancienne condition remise | **1 échec** |
| Plafond de colis | Déclencheur supprimé | **1 échec** |
| Cloison de `system.ts` | Import posé dans un écran admin | **lint rouge**, message complet |
| Falsificateur réparé | `casser plafond-commandes-en-dur` | casse réellement, la sonde rougit, `reparer` restaure |

Chaque falsification n'a fait échouer **que** sa propre sonde : aucune ne
rougissait par effet de bord.

---

## 9. DEUX AFFIRMATIONS D'AGENT CORRIGÉES PAR LA MESURE

Elles sont notées parce qu'un rapport qui ne contient que ce qui s'est confirmé
donne une fausse idée de la fiabilité du procédé.

1. **« `alter default privileges` n'est peut-être pas posé pour les fonctions »** —
   **faux**. `pg_default_acl` porte bien l'entrée `objtype = 'f'`, et `PUBLIC`
   n'y figure pas : une fonction neuve ne naît pas ouverte.
2. **« Le corps d'`arbitrer_qc` ressemble à ceci »** — la reconstruction de
   mémoire divergeait du corps réel sur le code d'erreur et sur la troncature du
   commentaire. **J'ai failli réintroduire les deux** en écrivant la migration
   121 avant d'aller relire `pg_get_functiondef`. C'est la deuxième fois que ce
   piège se présente sur ce projet.

---

## 10. MATRICE DE COUVERTURE

`PASS` = inspecté et sans défaut trouvé · `CORRIGÉ` = défaut trouvé et fermé ·
`SIGNALÉ` = défaut trouvé, laissé, avec sa raison · `NON MESURÉ` = ne peut pas
être tranché ici, et la raison est dite.

| Surface | Code | Runtime | Test auto | Sécurité | Statut |
|---|:--:|:--:|:--:|:--:|---|
| Page publique `/p/[token]` | ✅ | ✅ | ✅ | ✅ | **CORRIGÉ** (fuite d'id : SIGNALÉ) |
| Jeton public — immuabilité, révocation | ✅ | ✅ | ✅ | ✅ | PASS |
| Routes annexes `media` / `qc` / `vue` | ✅ | ✅ | ✅ | ✅ | PASS |
| Limitation de débit (8 surfaces) | ✅ | ✅ | ✅ | ✅ | PASS |
| Admin — 15 points d'entrée | ✅ | ✅ | ✅ | ✅ | PASS |
| Admin — audit atomique, journal append-only | ✅ | — | ✅ | ✅ | PASS |
| Coupure de suspension | ✅ | ✅ | ✅ | ✅ | PASS *(repose sur une ABSENCE de cache — gardé par sonde)* |
| Paramètres système | ✅ | — | ✅ | ✅ | PASS |
| `/api/*` — 3 routes + 2 handlers | ✅ | ✅ | ✅ | ✅ | **CORRIGÉ** |
| Suivi — 4 modules purs, port, adaptateur | ✅ | — | ✅ | ✅ | **CORRIGÉ** |
| Cadence, purge, veilleur | ✅ | ❌ | ✅ | — | **SIGNALÉ** — aucun appelant |
| Éditeur, autosave, glisser-déposer | ✅ | — | ✅ | ✅ | PASS *(deux onglets : SIGNALÉ)* |
| Médias et R2 | ✅ | ✅ | ✅ | ✅ | **CORRIGÉ** |
| Liste, curseur, recherche, lots | ✅ | ✅ | ✅ | ✅ | PASS *(repli d'accents divergent : SIGNALÉ)* |
| Export CSV | ✅ | — | ✅ | ✅ | **CORRIGÉ** |
| 126 migrations | ✅ | ✅ | ✅ | ✅ | **CORRIGÉ** |
| Catalogue Postgres — RLS, droits, definer | — | ✅ | ✅ | ✅ | PASS |
| Auth, session, cookies | ✅ | — | ✅ | ✅ | PASS *(pas de déconnexion : SIGNALÉ)* |
| Cinq clients Supabase | ✅ | — | ✅ | ✅ | **CORRIGÉ** |
| Instrumentation — 28 sites d'émission | ✅ | — | ✅ | ✅ | PASS |
| i18n — 920 clés, variables ICU | ✅ | ✅ | ✅ | — | **CORRIGÉ** |
| Contraste dynamique | ✅ | ✅ | ✅ | — | **CORRIGÉ** |
| Accessibilité | ✅ | partiel | ✅ | — | **CORRIGÉ** *(piège de focus : SIGNALÉ)* |
| Contraintes produit (paiement, vocabulaire, WebGL) | ✅ | ✅ | ✅ | — | PASS |
| Écrans secondaires (analyses, envois, marque) | ✅ | — | ✅ | ✅ | **CORRIGÉ** |
| Landing, pages légales, signalement | ✅ | ✅ | ✅ | — | **CORRIGÉ** |
| Les 113 tests eux-mêmes | ✅ | ✅ | — | — | **CORRIGÉ** |
| Les 6 scripts de porte | ✅ | ✅ | ✅ | — | **CORRIGÉ** |
| Performance — dashboard, envois, échelle | — | ✅ | ✅ | — | PASS (49/49) |
| Performance — écran Analyses | — | ❌ | ❌ | — | **NON MESURÉ** |
| Coût du déclencheur de plafond | — | ❌ | ❌ | — | **NON MESURÉ** |

**Aucune case n'est vide.** Les trois `NON MESURÉ` sont expliqués au § 11.

---

## 11. CE QUI N'A PAS PU ÊTRE VÉRIFIÉ, ET POURQUOI

1. **Le coût réel du déclencheur de plafond de commandes.** Il compte les
   commandes du mois sans prédicat sur `archived_at` ; aucun des quatre index
   partiels ne peut le servir, et l'index non partiel que trois migrations
   invoquent **n'existe pas**. Le fait structurel est établi ; **le coût ne
   l'est pas** : la base ne porte que 7 commandes, et à cette volumétrie le
   planificateur choisit un parcours séquentiel — la mesure ne dirait rien.
   *Une mesure impossible se dit impossible.* Il faut l'ajouter au banc, qui
   sème déjà au plafond.

2. **Les quatre agrégats de l'écran Analyses.** Le banc n'en mesure qu'un sur
   quatre. `analyser_activite` filtre sur **deux fois** la fenêtre demandée et
   agrège neuf compteurs sans qu'aucun index-only soit possible. Personne ne sait
   ce que cet écran coûte au plafond.

3. **LCP et décalage cumulé.** Exigent un navigateur throttlé. Le poids, lui, est
   mesuré (§ 7).

4. **Le prévol CORS du bucket R2.** Il vit chez Cloudflare, hors du dépôt. C'est
   le point que le brief désigne comme « celui qui casse en silence ».

5. **Le comportement réel de 17TRACK.** Nom d'en-tête de signature, forme d'un
   `NotFound`, code de quota épuisé. Le protocole des dix numéros réels reste le
   seul juge.

6. **Le rendu visuel.** Aucun navigateur n'a été piloté : pas de contraste
   photographié, pas de focus observé, pas de conformité au canevas évaluée.

7. **Le binaire SWC natif ne se charge pas sur cette machine** (« DLL
   initialization routine failed ») : Next retombe sur son moteur de secours. Le
   build est produit, mais **il n'est pas produit par la même chaîne qu'en CI**.
   À garder en tête avant de tirer une conclusion d'un poids mesuré ici.

---

## 12. VERDICT

```
PRÊT POUR LA PRODUCTION : NON — et le blocage n'est pas dans le code.

BLOQUANTS CRITIQUES     : 0
RISQUES ÉLEVÉS          : 0 restant (2 fermés)
RISQUES MOYENS          : 5 signalés (§ 6)
RISQUES FAIBLES         : 3 signalés

DÉFAUTS CONFIRMÉS       : 25  — 17 corrigés, 8 signalés
  (dont 2 introduits par cet audit lui-même, attrapés par les portes)
ZONES NON VÉRIFIÉES     : 7   — toutes nommées, aucune masquée

TESTS AUTOMATISÉS       : 423 unitaires + 622 RLS + 13 R2 + 49 mesures — 0 sauté
RLS                     : 17/17 tables, 0 escalade possible
R2                      : de bout en bout, bucket réel
PERFORMANCE             : 49/49 ; deux chemins non mesurés et nommés
RUNTIME                 : build servi, 183 contrôles de fumée
SÉCURITÉ                : 5 fonctions atteignables par anon, toutes gardées par jeton
```

**Ce qui empêche la mise en service n'est plus le code.** Cinq clés sont vides —
`RESEND_API_KEY`, `NEXT_PUBLIC_POSTHOG_KEY`, `SENTRY_DSN`, `TRACKING_API_KEY`,
`NEXT_PUBLIC_CONTACT_ABUS` — et chacune éteint quelque chose de nommé : pas
d'email, donc pas de veilleur qui alerte ; **pas d'analytics, donc aucune donnée
d'usage enregistrée, alors que c'est le livrable réel de la phase de
validation** ; pas de suivi ; pas d'adresse de signalement, donc une procédure de
notification et retrait qui n'a pas de destinataire.

**La chose la plus utile à faire maintenant n'est pas d'auditer davantage.**
C'est de déployer, de remplir les cinq clés, et de laisser le produit produire
les chiffres qui décideront de la suite.
