# Prompt des corrections finales de la refonte

À coller tel quel dans une **nouvelle session Claude Code cloud** ouverte sur le dépôt
`JLmehdi92/Droplink-maquette-`, branche `claude/saas-motion-design-video-r3ani3`
(le même environnement que les sessions précédentes). Écrit le 03/10/2026 à partir du
contre-audit de `consignes/audit-fidelite-refonte.md` et des réponses de Mehdi, puis
contre-vérifié par un agent `ecc:code-explorer` : chemins et lignes exacts, 15 défauts corrigés.

---

```
Tu travailles pour Mehdi (pas Wassim), toujours en français. Ce dépôt est le BAC À SABLE
JLmehdi92/Droplink-maquette- (copie de JLmehdi92/droplink2, relié à AUCUN service Railway).
La refonte y est portée et ses animations aussi ; un contre-audit indépendant a trouvé ce qui
reste. TA MISSION : tout corriger, sans en oublier un seul point, sans rien casser, puis le
prouver. Mehdi veut le produit identique à la maquette (design/maquette/src/), animations et
optimisations de fluidité comprises, sauf ce qu'il a décidé autrement ci-dessous.

TU NE T'ARRÊTES PAS TANT QUE TOUT N'EST PAS FINI. Tu ne rends la main ni entre deux
corrections, ni pour demander « je continue ? ». Un obstacle se résout : tu raisonnes, tu
tranches, tu écris pourquoi (commit + journal), tu enchaînes. Tu ne t'arrêtes que si tout est
fait, ou devant un blocage qu'aucun choix de ta part ne peut lever (dis alors lequel).

RÈGLES ABSOLUES
- AVANT TOUT PUSH : `git remote -v`. Tu ne pousses QUE vers le remote dont l'URL est
  https://github.com/JLmehdi92/Droplink-maquette- (avec ou sans .git), branche
  claude/saas-motion-design-video-r3ani3 ; Mehdi t'y autorise sans redemander. Si un remote
  pointe vers JLmehdi92/droplink2, quel que soit son nom (origin compris), tu ne t'en sers
  JAMAIS : chaque push sur droplink2 redéploie le vrai site. Si aucun remote ne pointe vers le
  bac à sable, crée-le (`git remote add maquette https://github.com/JLmehdi92/Droplink-maquette-.git`).
- Jamais `pnpm db:migrate` (production), jamais la base de production
  (référence csndfatwtbzqmhgqseem). Aucun secret écrit sur le disque.
- Commits par `git commit -F -` avec un heredoc à délimiteur quoté (<<'FIN'), jamais -m.
- Ne contourne aucun hook ECC ni aucun refus de permission.
- Aucun test supprimé, sauté ou affaibli pour passer. Constate le rouge avant d'écrire un test
  qui doit le prévenir.
- Les contraintes verrouillées de CLAUDE.md gagnent toujours sur la maquette.

LIS D'ABORD, EN ENTIER : CLAUDE.md ; consignes/audit-fidelite-refonte.md (surtout les blocs
« ÉTAT AU 02/10/2026 » et « CONTRE-AUDIT INDÉPENDANT DU 03/10/2026 », c'est ta liste) ;
consignes/refonte-design.md (§ 5, § 6 « règles de construction apprises » = les optimisations
de fluidité, § 8, § 9) ; consignes/verification-finale-locale.md. La référence visuelle et de
mouvement est la maquette : ses JS et CSS donnent les durées, courbes, délais et seuils EXACTS.

ENVIRONNEMENT : Postgres est injoignable d'ici (pas d'IPv6, pas de TCP brut) ; l'API HTTPS de
la base de tests répond. Aucun compte administrateur n'est utilisable d'ici (2FA, migration
186). LES QUATRE PORTES LOCALES, à chaque lot : pnpm typecheck (0 erreur), pnpm lint (0 erreur ;
1 avertissement préexistant toléré dans tests/unit/suivi-quota-fournisseur.test.ts, aucun
nouveau), pnpm build, pnpm test (seul échec admis : l'alarme Railway
tests/unit/deploiement.test.ts, jamais désactivée). Les trois autres portes (test:rls,
couverture, fumee) tournent sur le poste de Mehdi. Pour voir le produit : pnpm build &&
pnpm start sur un port libre, Playwright avec le Chromium de /opt/pw-browsers.

DÉCISIONS DE MEHDI (03/10/2026) — elles priment sur la maquette

D1. L'APERÇU AU SURVOL (le téléphone qui s'affiche quand la souris passe sur une ligne des
    « Dernières commandes » du TABLEAU DE BORD : src/components/tableau/apercu-survol.tsx,
    monté seulement par src/components/tableau/blocs-tableau.tsx:111) : Mehdi ne l'aime pas.
    SUPPRIME-LE entièrement, et ses restes :
    - l'import (blocs-tableau.tsx:22) et l'attribut data-jeton (blocs-tableau.tsx:111, 121,
      147), qui met en plus le jeton public dans le HTML du tableau de bord ;
    - la propriété data-jeton de src/components/lien-ecran.tsx:83-84 si plus rien ne s'en sert ;
    - dans src/styles/refonte/app.css : .apercu-flottant__page (l. 169-170), .apercu-flottant
      (l. 263-264), .telephone--apercu (l. 265-267) ; l. 273, retire seulement
      .apercu-flottant de la liste « .periodes__curseur, .apercu-flottant, .toast » ;
    - les mentions dans consignes/refonte-design.md (l. ~207, 599-600, 626),
      consignes/audit-fidelite-refonte.md (l. ~55), consignes/refonte-inventaire/3-*.md
      (l. ~217, 221, 514) : marque-les « retiré, décision de Mehdi du 03/10/2026 ».
    Ne touche pas jetonPublic dans src/lib/commandes/liste.ts (utilisé par liste-commandes.tsx et
    l'export CSV). La ligne reste un lien vers la fiche. « Ouvrir la page » d'une ligne de la
    liste des commandes (liste-commandes.tsx:600) garde son nouvel onglet : PAS de fenêtre
    téléphone en superposition. Le composant n'a aucun texte next-intl : vérifie-le, ne
    supprime aucune clé à l'aveugle.

D2. TRAJET DU COLIS sur /p : c'est 17TRACK qui fournit tout le suivi, lieux compris ; la base
    garde le lieu de chaque passage (parcel_checkpoints.location, rendu par
    lire_passages_publics, migration 166 l. 360-383) et le produit le lit déjà
    (src/lib/page-publique/lecture.ts:354 « lieu: p.location », affiché par historique-suivi.tsx). Il
    manque au TRAJET du héros. Branche-le ainsi, sans rien interpréter :
    - exporte de src/lib/tracking/normalize.ts la fonction qui donne l'étape d'un passage à
      partir de son stage brut 17TRACK (table JALONS, l. 72-85) — une seule source de vérité ;
    - étape TERMINÉE : lieu du PLUS ANCIEN passage de cette étape parmi ceux lus ; étape EN
      COURS : lieu et date du PLUS RÉCENT passage de cette étape, en date courte (« 29 sept. »),
      comme « Wissous · aujourd'hui » de la maquette mais sans « aujourd'hui » (voir C1) ;
    - lire_passages_publics ne rend que les 30 plus récents : si le passage voulu n'y est pas,
      n'affiche que la date, aucun lieu ;
    - lieu affiché TEL QUE 17TRACK le donne, sans traduction ni déduction ; texte rendu par
      React (jamais en HTML) ; ajoute-le aussi à l'étiquette lue par les lecteurs d'écran
      (heros-client.tsx:59-65) ;
    - fais passer les lieux par page-client.tsx:237-242 (datesTrajet) jusqu'à
      heros-client.tsx:150-154 ;
    - corrige les commentaires qui disaient le contraire : heros-client.tsx:13-17,
      page-client.tsx:32, et l'arbitrage du journal (refonte-design.md l. ~178, ~203,
      ~794-800). Écris un test unitaire du choix du passage par étape.

D3. ALERTE « contestation en attente » de la vue d'ensemble admin : la fonctionnalité de
    contestation EXISTE (migrations 168-169, table link_contests). Porte la troisième alerte
    de la maquette (admin.html, alerte 3). Aucune fonction ne compte les contestations de
    toute la plateforme ; contestations_en_attente_parmi (168:172-200) ne filtre qu'une liste
    de 200 commandes. Écris donc la migration 213 (dernier fichier : 212), une seule fonction
    sur le modèle de compter_doublons_admin :
    - security definer, stable, `set search_path = ''`, LECTURE SEULE, garde
      `if not public.est_admin() then raise exception 'introuvable' using errcode = 'DL031'`
      comme la 168 ;
    - rend le nombre de contestations en attente et la plus ancienne : sa référence courte au
      format EXACT `'#' || upper(right(replace(o.id::text,'-',''),6))` (migrations 159:120,
      160:92) et sa date d'envoi ;
    - `revoke execute ... from public` (et anon), grant au seul rôle authenticated, commentaire
      qui dit qu'elle ne rend qu'un nombre et une référence, sans trace d'audit, comme
      contestations_en_attente_parmi (168:169-171) ;
    - déclare-la dans FONCTIONS_OUVERTES_ADMISES de tests/rls/catalogue.test.ts (l. ~334,
      avec sa raison, sur le modèle des entrées l. 555-559 et 851-857), ajoute un test de
      refus non-administrateur dans tests/rls/ (modèle : tests/rls/doublons.test.ts:295-309)
      et, si le modèle existe, une falsification dans scripts/falsifier.mjs (modèle :
      doublons-comptes-sans-garde) ;
    - types-base.ts mis à jour à la main comme compter_doublons_admin (l. 1316-1322) ;
    - lecture côté serveur à trois états (ok, aucune, illisible) : une erreur ne s'affiche
      jamais comme « aucune alerte » ;
    - texte de la maquette, sans « première sur trois » (ce rang n'existe que par
      lire_contestation_admin, qui écrit au journal) ; pluriel quand il y en a plusieurs ;
    - lien vers /admin/commandes?q=<référence courte> (la recherche accepte ^#?[0-9A-Fa-f]{6}$,
      migration 160:74-76) ; la maquette faisait une ancre vers une ligne ciblée : écris cet
      écart au journal ;
    - corrige les commentaires de src/app/[locale]/admin/page.tsx:65-68 et 148-154 ;
    - § 9 du journal ET consignes/verification-finale-locale.md : la 213 s'applique par
      `pnpm db:migrate:tests` + `pnpm db:types:tests` sur le poste, puis en PRODUCTION par Mehdi
      AVANT le push sur droplink2, avec les 210, 211 et 212 qui attendent aussi (jamais la 211
      sans la 212), sinon la vue d'ensemble admin rend une erreur. Coche au § 9 les cases
      « contestation » et « badge Pro » comme tranchées.

D4. POINTS OUVERTS DU § 9, tranchés : (a) l'en-tête de la landing suit la maquette, SANS flou
    (meilleur pour la fluidité) ; (b) la mention de facturation de Tarifs reste au gris
    secondaire (décision de Wassim du 15/09/2026 sur les gris, CLAUDE.md) ; (c) DÉFAUT
    antérieur à la refonte, à CORRIGER : le menu « ••• » d'une commande poste l'ancien jeton
    après une révocation. Reproduis-le d'abord (test rouge), corrige, prouve. Le jeton est la
    donnée la plus sensible du produit : ecc:security-reviewer obligatoire sur ce correctif.

À CORRIGER — TOUT, dans cet ordre de gravité

A. RÈGLE DURE
A1. src/app/p/[token]/not-found.tsx (l. 43-47 et 97) affiche public/marque/logo-symbole.png,
    au DÉGRADÉ de marque, sur l'écran de lien invalide, qui doit être NEUTRE. Il n'existe pas
    de symbole monochrome : produis-en un neutre (encre #0B0B18 ou gris de corps) — PNG, ou
    SVG statique servi depuis public/ (le refus du SVG vise les médias déposés, pas nos
    actifs), ou filtre CSS sur l'image — en ajustant client.css (l. 344-345, 370-371). Le mot
    « DropLink » en texte peut rester. Garde les liens en target="_top" ou "_blank" qu'exige
    tests/unit/apercu-page-client.test.ts:161-169. Ne touche pas la carte « Propulsé par
    DropLink » (carte-propulsee.tsx). Puis vérifie par recherche sur src/app/p/** et
    src/components/publique/** qu'aucune valeur du dégradé ne reste (#6C5CFB, #A855E0,
    #FB7C7F, degrade, gradient de marque).

B. COMPORTEMENT
B1. Historique de la fiche : le journal s'écrit après la réponse (journaliserApres, after(),
    src/lib/commandes/journal.ts:126-143) et n'est relu qu'une fois, 700 ms plus tard
    (editeur.tsx:212-221). L'action relireHistorique (commandes/[id]/actions.tsx:25-34) rend un
    ReactNode opaque, donc le client ne peut pas savoir si la ligne est arrivée. Fais-lui
    rendre aussi le NOMBRE de lignes (ou l'id de la plus récente) ; le client réessaie à
    700 ms, 1,5 s puis 3 s tant que ce nombre n'a pas augmenté, puis s'arrête. Remets
    historiqueRelu à zéro quand la propriété serveur historique change (editeur.tsx:208).
    Ajoute aria-live="polite" à la liste (liste-historique.tsx:36), comme la maquette. NE
    REGROUPE PAS les rafales de modifications : chaque ligne est une écriture réelle en base
    et l'historique sert de preuve (editeur.tsx:206) ; la fusion de commande.js:48 est une
    démonstration. Écris-le au § 8. Teste relireHistorique et la logique de nouvelle tentative.
B2. Formulaires GET DU VENDEUR (pas ceux de /admin, où chaque recherche écrit une ligne
    d'audit) : recherche-globale.tsx:64, liste-commandes.tsx:94 et 182,
    tableau-envois.tsx:224. Ils rechargent toute la page et rejouent l'intro v4. Garde le
    filtrage côté serveur et l'URL comme source de vérité, mais intercepte l'envoi pour
    naviguer côté client en RÉUTILISANT le mécanisme d'estompe qui existe déjà pour les liens
    vers la même page (transitions-ecran.tsx:148-163, reprise l. 103-110 :
    __changementSurPlace, 0,35 en 90 ms, retour en 160 ms, filet de 8 s) — ne le duplique
    pas — sans rejouer l'intro. Le formulaire GET reste le repli sans JavaScript. Recherche
    d'envois : à la frappe, délai de 160 ms, comme envois.js:191.
B3. « Copier le lien » d'une ligne (copier-lien-ligne.tsx:31-33) : l'état d'échec revient au
    repos après 1,6 s comme le succès.
B4. Transitions : le clic le plus récent gagne (transitions-ecran.tsx:173, comme coque.js:85) ;
    data-sens n'est posé que pour un clic non modifié qui navigue vraiment
    (navigation-vendeur.tsx:138-143) ; dl-sans-entree est nettoyé si le geste n'aboutit pas
    (repli-archivage.tsx:33).
B5. « Créer une commande » (barre du haut, tableau de bord, actions rapides) : joue la sortie
    d'écran de 110 ms avant de lancer l'action, comme aller("commande.html").

C. FIDÉLITÉ À LA MAQUETTE
C1. /p : la fourchette de date estimée s'écrit comme la maquette (« 1 au 2 octobre », mois
    non répété si identique), par règle de traduction dans les trois langues, pas une chaîne
    fixe, dans le héros ET la carte de livraison (page-client.tsx:145-157) ; les intertitres
    de jour de l'historique et de l'aperçu passent en date courte comme la maquette
    (« 29 sept. »). « Aujourd'hui » RESTE un écart gardé : la page est rendue sur le serveur
    sans le fuseau du lecteur et dirait faux autour de minuit. La carte « Propulsé par
    DropLink » reçoit l'aria-label de la maquette, traduit (carte-propulsee.tsx:21-26).
C2. Clavier et accessibilité comme la maquette : bascule « Commandes / Liens clients » du
    graphique en tablist/tab avec flèches gauche-droite (graphe-tableau.tsx:324-335 ;
    tableau.js:44-52) ; onglets de Paramètres avec flèches, Home/End et tabindex itinérant
    (parametres.js:43-51), l'URL ?section= restant la source de vérité ; focus sur le premier
    élément à l'ouverture d'un menu déroulant (commandes.js:228, envois.js:180) ;
    aria-expanded/aria-controls sur le bouton de la cloche.
C3. Administration (aucune migration pour ce point) :
    - Journal : le pied « X sur N » s'affiche même à la dernière page (admin/journal/page.tsx:218
      le met dans la condition du lien suivant ; sors le compte de la condition), avec
      compterJournal (src/lib/audit/comptes.ts:439-466) et ses clés journal.surTotal /
      surTotalAuDela, déjà appelés l. 91 ;
    - Commandes et Comptes : « X sur N » SANS filtre actif, avec N = repartition.total
      (src/lib/audit/panneau.ts:220-237) et compteurs.comptes (panneau.ts:330-349) ; avec un
      filtre, aucun total filtré n'existe : n'affiche que X et écris pourquoi au § 8 ;
    - Paramètres système : cartes, ordre (interrupteurs avant débit) et carte « Constaté,
      changé au déploiement » comme la maquette ; les données ne changent pas ;
    - Boutiques : colonnes de la maquette ;
    - supprime le <title> natif qui double l'info-bulle (barres-admin.tsx:56) ;
    - supprime la propriété morte carte de BlocageLien (blocage-lien.tsx:31, 95) et
      ContestationLien (contestation-lien.tsx:42, 111).
C4. Pages publiques et comptes :
    - Docs : encart « Le lien ne change jamais tout seul » en ton info, icône sparkles
      (docs/page.tsx:295) ; section support (docs/page.tsx:389-390) : lien « Signaler un
      contenu » rétabli, adresse e-mail en lien mailto ET en texte sélectionnable ;
    - articles : « N min » au lieu de « N min de lecture » (src/app/[locale]/blog/[slug]/
      page.tsx:107, aujourd'hui une chaîne française en dur : passe-la par next-intl dans les
      trois langues) ;
    - pages légales : icône House au lieu de Building2 pour « Éditeur »
      (src/components/page-legale.tsx:223, import l. 3) ;
    - nouveau mot de passe : message immédiat « ne doit pas contenir votre adresse » au blur
      ET à l'envoi, comme acces.js:100-103 et 130, avec la clé existante
      erreurMdpContientEmail (formulaire-nouveau-mot-de-passe.tsx:56-57) ; même chose dans
      Paramètres (formulaires-parametres.tsx:51 ; parametres.js:120) ; le serveur reste
      l'autorité ;
    - menu mobile de la landing comme la maquette : 4 ancres puis « Se connecter », sans
      « Créer un compte » (entete-publique.tsx:116-118) ;
    - landing : dans animations-landing.tsx l. 169, 176, 185, REMPLACE `style.opacity = "1"`
      par `style.opacity = ""` (cartes, photos, tampon), avec
      `.finished.then(() => { c.style.opacity = "" })` pour les cartes comme l4.js:85. Ne
      SUPPRIME PAS ces lignes : les éléments partent de opacity "0" posée en ligne
      (l. 139-141) et resteraient invisibles. Re-mesure : rien ne reste invisible.
C5. Bienvenue : compare l'aperçu au navigateur à celui de la maquette (compte.js:72-80) et
    aligne-le s'il diffère visiblement.
C6. Fluidité : une seule mise à jour par image (requestAnimationFrame) pour l'écouteur de
    défilement de SommaireDocs (sommaire-docs.tsx:37-50) et le pointermove de CoucheV4
    (couche-v4.tsx:22-30). Le MutationObserver de TransitionsEcran est déjà déconnecté
    (transitions-ecran.tsx:72-87) : vérifie-le et note-le au § 8, ne le réécris pas.

ÉCARTS GARDÉS (NE PAS les « corriger ») : thème sombre ; facturation ; témoignages,
« +2 500 vendeurs », Vinted/eBay ; données d'exemple ; filtrage et validation qui font autorité
côté serveur ; frise de 14 jours ; « Mot de passe oublié » sur sa propre page (et son film qui
repart) ; pas d'envoi automatique au 6e chiffre de la 2FA ; « Se souvenir de cet appareil » ;
phrase légale à l'inscription seule ; aucune sortie animée au « Précédent » du navigateur ;
« Réessayer » sans état en cours ; titre d'onglet neutre sur /p et aucun « · DropLink »
ailleurs ; « Aujourd'hui » / « Mouvement aujourd'hui » (fuseau) ; pas de lien d'évitement sur
le lien mort ; pas de badge Pro dans la LISTE des comptes (le plan sur la fiche d'un compte
reste) ; motif minimal de 8 caractères ; aucun contenu de commande dans l'admin ; gris
secondaires sous 4,5:1.

POUR CHAQUE LOT : implémentation fidèle aux valeurs de la maquette ; vérification AU NAVIGATEUR
(l'animation se joue aux bons instants, bureau ET 390 px tactile, fr/en/zh-CN,
prefers-reduced-motion sans rien qui disparaisse, aucune erreur console, aucune violation CSP,
aucun débordement) ; mesure de fluidité processeur ralenti ×4 (CDP
Emulation.setCPUThrottlingRate) quand le lot touche une animation ; poids de /p < 300 Ko hors
médias si le lot touche /p. EXCEPTION : l'administration (C3, D3) ne se voit pas au navigateur
d'ici — écris « non mesuré », inscris l'écran dans consignes/verification-finale-locale.md, et
n'écris jamais « conforme ». Revue par ecc:react-reviewer, ecc:typescript-reviewer,
ecc:silent-failure-hunter, plus ecc:security-reviewer pour /p, l'admin, l'accès et D4c, et
ecc:database-reviewer pour la migration 213 ; correction de ce qui est réel ; les quatre portes
locales ; un commit par lot en français (le pourquoi, les mesures, ce qui reste au poste de
Mehdi) ; entrée datée au § 8 du journal ; push vers le bac à sable.

À LA FIN : relance un audit de fidélité indépendant (3 agents ecc:code-explorer en lecture
seule, consigne « ne crois pas la session qui a corrigé », maquette contre produit, zone par
zone). Corrige tout ce qu'il trouve hors écarts gardés, et recommence jusqu'à ce qu'il ne
trouve plus rien. Puis mets à jour consignes/audit-fidelite-refonte.md (état final, point par
point : corrigé, ou gardé et pourquoi) et consignes/verification-finale-locale.md (migration
213, écrans à remesurer dont toute l'administration, nouveaux tests). Commit, push vers le bac
à sable, et rends la main avec un bilan chiffré : lots, commits, portes, ce qui est mesuré, ce
qui ne l'est pas et doit l'être au poste de Mehdi. N'affirme jamais « conforme » sans l'avoir
mesuré. N'utilise pas /prp-commit, /pr, e2e-runner ni refactor-cleaner.
```
