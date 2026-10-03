# Vérification finale de la refonte — prompt pour le Claude Code local de Mehdi

Le prompt est à copier tel quel dans Claude Code (VS Code), sur le poste Windows de Mehdi,
à la racine du dépôt `droplink2`, **une fois que la session cloud a fini le portage**.

Pourquoi ce passage existe : le conteneur cloud n'a pas d'IPv6 et ne laisse sortir aucun TCP
brut. Il joint l'API de la base de tests en HTTPS, mais pas Postgres en direct (mesuré le
02/10/2026, journal § 8). Le portage s'est donc fait avec `typecheck`, `lint`, `build`, `test`
et la comparaison au navigateur. **`test:rls`, `couverture` et `fumee` n'ont jamais tourné sur
ce code.** Ce sont elles qui gardent l'isolation entre vendeurs, le 404 de l'administration et
l'immuabilité du jeton. Rien ne part sur le vrai dépôt avant qu'elles soient vertes ici.

---

```
Tu es mon Claude Code local sur le vrai projet DropLink (Windows, PowerShell, pas de WSL).
Réponds-moi en français. Je suis Mehdi.

CONTEXTE. Toute la refonte du design a été portée dans une session Claude Code cloud, sur un
dépôt BAC À SABLE privé : https://github.com/JLmehdi92/Droplink-maquette- , branche
claude/saas-motion-design-video-r3ani3. Ce dépôt n'est relié à aucun service Railway. Le
cloud ne pouvait pas joindre Postgres : les portes test:rls, couverture et fumee n'ont
JAMAIS tourné sur ce code. Ta mission : tout vérifier et tout corriger avant que ça parte
sur le vrai dépôt.

INTERDITS ABSOLUS, sauf si je te dis « oui » explicitement dans ce chat, pour ce geste-là :
- aucun push vers origin (JLmehdi92/droplink2) : chaque push redéploie droplink.fr ;
- aucun `pnpm db:migrate` (production) ;
- aucune suppression de données, aucune régénération de jeton.
Commits par `git commit -F -` avec un heredoc à délimiteur quoté, jamais `-m`.
Ne contourne aucun hook ECC.

ÉTAPE 0 — LIRE AVANT DE TOUCHER QUOI QUE CE SOIT
1. CLAUDE.md en entier.
2. consignes/refonte-design.md en entier, surtout le § 5 (décisions : « je prends tout »,
   SAUF les témoignages, « +2 500 vendeurs », la ligne « Utilisé par des vendeurs sur
   Vinted, eBay… » et la phrase « Fonctionne avec Vinted, eBay… », qui partent ; pas de
   thème sombre), le § 8 (journal de chaque écran porté, avec ses mesures) et le § 9 (ce
   qui m'attend, dont les MIGRATIONS écrites par le cloud).
3. consignes/refonte-inventaire/ (les 5 rapports).

ÉTAPE 1 — RAPATRIER SANS RIEN CASSER
  git fetch origin
  git remote add maquette https://github.com/JLmehdi92/Droplink-maquette-.git   (s'il n'existe pas)
  git fetch maquette
  git switch -c refonte maquette/claude/saas-motion-design-video-r3ani3
  git merge origin/master
Si la fusion a des conflits : résous-les en gardant le comportement des DEUX côtés. Le
master a pu bouger pendant la refonte (quotas, légal, paiement) : la règle du produit gagne
toujours sur la maquette. Régénère les fichiers générés avec l'outil du dépôt, jamais à la
main. Montre-moi la liste des conflits et ce que tu as gardé.

ÉTAPE 2 — L'ENVIRONNEMENT DE TEST
- Vérifie que .env.test.local existe et vise la base de TESTS (jamais la référence de
  production nommée dans scripts/portes.mjs).
- pnpm install, puis pnpm exec next typegen.
- La refonte a écrit UNE migration, la 213 (`213_l_alerte_des_contestations.sql`, décision de
  Mehdi du 03/10/2026) : `git diff --stat origin/master...refonte -- supabase/migrations` doit
  montrer ce seul fichier. Applique-la, avec celles que master aurait ajoutées, UNIQUEMENT à
  la base de tests : `pnpm db:migrate:tests` puis `pnpm db:types:tests`. Les types de la 213
  ont été écrits À LA MAIN dans src/lib/supabase/types-base.ts (le cloud ne joint pas
  Postgres) : après `db:types:tests`, `git diff src/lib/supabase/types-base.ts` doit être
  vide ou ne différer que par l'ordre — sinon, garde la version générée et dis-le-moi.
- Si master a lui aussi pris le numéro 213, renumérote la migration de la refonte (nouveau
  numéro libre, jamais un fichier déjà appliqué rouvert) et dis-le-moi.
- La session cloud a créé sur la base de TESTS trois comptes de mesure :
  refonte-demo@, refonte-onb@ et refonte-admin@droplink-test.invalid (ce dernier
  administrateur, avec un facteur TOTP). Si un compteur des gardes d'administration s'en
  trouve décalé, supprime-les de la base de tests (et d'elle seule) avant de conclure.

ÉTAPE 3 — LES SEPT PORTES
`pnpm gates`. Relève le DÉCOMPTE de chaque porte, pas la couleur. Jamais dans un tuyau.
- Le seul échec admis est l'alarme Railway (tests/unit/deploiement.test.ts), SEULEMENT si
  je n'ai pas encore migré railway.json : dis-le-moi, ne la désactive pas.
- Tout autre rouge : trouve la cause racine, corrige, relance. Un test sauté n'est pas un
  test qui passe. Aucun test désactivé, sauté ou affaibli pour passer.
- Puis `pnpm test:perf` (gardé par scripts/suite.mjs, plancher de 45 mesures).
- Les TESTS ÉCRITS PAR LE CLOUD QUI N'ONT JAMAIS TOURNÉ (ils exigent Postgres) — regarde-les
  passer UN PAR UN, et vois-les rougir une fois :
  · tests/rls/contestation.test.ts : « l'alerte de la vue d'ensemble compte et désigne la plus
    ancienne, sans rien tracer (213) » et « un vendeur et un anonyme reçoivent le refus d'une
    surface inexistante (213) » ;
  · tests/rls/commandes-cycle.test.ts : « il rend le jeton QUE LA BASE PORTE, y compris après
    une révocation » ;
  · tests/rls/catalogue.test.ts : la déclaration de `compter_contestations_en_attente_admin`
    dans FONCTIONS_OUVERTES_ADMISES ;
  · la falsification neuve : `pnpm falsifier casser contestations-alerte-sans-garde` → la
    suite contestation doit ROUGIR → `pnpm falsifier reparer contestations-alerte-sans-garde`.

ÉTAPE 4 — CHAQUE ÉCRAN, AU NAVIGATEUR
Pour CHAQUE écran porté (liste au § 8 du journal), applique la méthode de CLAUDE.md
« Comment on vérifie un écran migré », avec la MAQUETTE comme référence
(`node design/maquette/outils/construire.mjs`, puis servir design/maquette/dist/) :
1. bureau ET 390 px tactile, comparés à la page de la maquette ;
2. scrollWidth === clientWidth, aucune cible sous 44 px, aucune police sous 11,5 px ;
3. les trois langues fr, en, zh-CN ;
4. prefers-reduced-motion : rien ne disparaît ;
5. aucune violation CSP, aucune erreur console, aucune requête en échec ;
6. le menu mobile de l'espace vendeur et de l'admin est le tiroir (ouvrir, Échap, voile,
   geste du pouce, navigation depuis le tiroir).
Utilise scripts/verifier-ecran-migre.mjs (serveur lancé avec AUTH_GOOGLE_ACTIF=1). Ne
m'écris jamais « conforme » sans l'avoir mesuré.
CE QUE LE CLOUD N'A PAS PU MESURER, À FAIRE EN PRIORITÉ :
- la vérification à deux facteurs PAR LE FORMULAIRE (le cloud a vu « Challenge and verify IP
  addresses mismatch », dû à sa sortie réseau) — avec ET sans JavaScript (six cases nommées
  `code`, recollées par l'action) ;
- le nouveau mot de passe (session de récupération) et son « Revenir à la connexion », qui
  est désormais une déconnexion ;
- les trois frontières d'erreur (espace vendeur, administration, site public, page client)
  en provoquant une erreur de rendu, et les deux squelettes de chargement (réseau ralenti) ;
- la page de signalement exige NEXT_PUBLIC_CONTACT_ABUS au build (sinon 404) ;
- l'administration au bureau ET dans le tiroir, ses quatre dialogues modaux (Échap et
  annulation bloqués pendant la requête, recopie d'adresse sans collage ni dépôt).
- ⚠️ TOUTE L'ADMINISTRATION EST « NON MESURÉE » APRÈS LE CONTRE-AUDIT DU 03/10/2026 (C3, D3 ;
  le cloud ne voit pas l'admin, qui exige la double authentification) — à remesurer contre la
  maquette, écran par écran :
  · vue d'ensemble : l'alerte « Contestation du blocage de #XXXXXX » (une contestation en
    attente) puis au pluriel (deux ou plus), sa date d'envoi, « Examiner » qui mène à
    /admin/commandes?q=#XXXXXX et y trouve la ligne ; « Aucune alerte » seulement quand les
    TROIS lectures ont abouti ; AVANT la 213, la ligne « Les contestations en attente n'ont pas
    pu être lues » et aucun 500 ;
  · journal : le pied « X sur N entrées » aussi sur la DERNIÈRE page ;
  · commandes et comptes : « X sur N » sans filtre, « N affichées » avec un filtre ; vérifie
    que N égale bien la liste non filtrée (sinon dis-le, ne l'ajuste pas à la main) ;
  · paramètres : Plafonds | Suivi, puis Interrupteurs | Débit, puis « Constaté, changé au
    déploiement » en pleine largeur sur deux colonnes ;
  · boutiques : les sept colonnes de la maquette, la boutique est le lien vers le compte
    (cible tactile, nom accessible « Voir le compte de … ») ;
  · graphique des barres : plus d'infobulle native, la bulle de la maquette seule.
- (fidélité du mouvement, 02/10/2026) côté administration : chaque dialogue SORT (160 ms)
  puis la page se recharge et la bulle d'annonce dit le geste (« Lien bloqué… »,
  « Contestation acceptée… », « Effectué. Compte suspendu… », « Effectué. Changement de
  plan… ») ; un seuil enregistré dit « Enregistré. 300 → 400, écrit au journal. » et une
  ligne `parametre.modification` est bien au journal ; un interrupteur dit « Activé / Désactivé,
  effet immédiat, écrit au journal. » ; « La réponse est trop courte. » sur une contestation ;
- le visionneur de la page client avec de VRAIES photos R2 (le cloud n'avait que des clés
  absentes du bucket) : cadre carré blanc, pellicule, balayage au doigt, boucle ;
- la carte « Suivi par e-mail » de /p (n'existe que si EMAIL_CLIENTS_DE est posée) : refus
  d'une adresse sur place, « Presque fini » qui entre en fondu ;
- les mini-frises d'Envois avec un vrai colis suivi ;
- le BUDGET de /p : 288 Ko transférés hors médias mesurés au cloud (gzip) — 12 Ko de marge
  seulement ; à remesurer en production (Brotli) avant tout ajout sur /p ;
- le menu ☰ des pages publiques au téléphone (≤ 640 px), sur la landing, une page légale, le
  signalement et un article : « Se connecter » en gris SANS filet, puis « Créer un compte » en
  bouton plein pleine largeur (52 px, texte lisible sur l'accent), qui ferme le menu et mène à
  l'inscription, dans les trois langues (le libellé chinois ne doit pas déborder) ;
- « Précédent » entre connexion et inscription sur Safari (l'adresse ne suit qu'avec la
  Navigation API : Safari 18.2 et plus).

ÉTAPE 5 — LES CONTRAINTES QUI NE BOUGENT JAMAIS (vérifie dans le CODE, pas dans le journal)
- /p/[token] : aucun backdrop-filter, aucun dégradé DropLink, la couleur est celle du
  vendeur via resoudreAccent(), texte sur aplat = surRemplissage, jamais #fff en dur ;
  budget < 300 Ko hors médias ; galerie avant les détails sur mobile.
- Quotas et prix LUS EN BASE (lire_plafond_gratuit_a_vie, lire_plafond_commandes), jamais
  écrits en dur ; gratuit = 5 commandes et 5 colis à vie aujourd'hui.
- Aucune chaîne visible en dur : tout par next-intl, parité FR/EN/zh-CN.
- Aucun témoignage, aucun « +2 500 vendeurs », aucun Vinted/eBay/Leboncoin sur la landing.
- Aucun thème sombre ; aucun emoji ; icônes Lucide uniquement.
- Le public_token jamais régénéré par une édition ; 404 (jamais 403) sur l'admin.
- Aucun nouvel îlot qui écrit sans `Inerte` dans l'aperçu de la page client.

ÉTAPE 6 — LA REVUE PAR LES AGENTS ECC, SUR TOUT LE DIFF master...refonte
Lance, l'un après l'autre (pas en parallèle) : ecc:code-reviewer, ecc:react-reviewer,
ecc:typescript-reviewer, ecc:silent-failure-hunter, ecc:security-reviewer (authentification,
admin, page client, paiement, webhook), ecc:database-reviewer (sur chaque migration),
ecc:a11y-architect. Vérifie chaque constat CRITICAL ou HIGH avant d'y croire, corrige ce
qui est réel, puis relance pnpm gates. Pour les constats écartés : un par un, avec la raison.

ÉTAPE 6 BIS — LES POINTS LAISSÉS OUVERTS PAR LE CLOUD (journal § 8, bilan) : présente-les-
moi, ne les tranche pas seul :
- TRANCHÉS par Mehdi le 03/10/2026 (ne pas rouvrir) : l'alerte « contestation en attente » est
  portée (migration 213) ; le badge « Pro » de la LISTE des comptes reste absent ; la mention
  de facturation de Tarifs reste au gris secondaire ; le menu « ••• » relit le jeton en base
  (corrigé, preuve RLS ci-dessus) ;
- le menu mobile des pages publiques n'a plus « Créer un compte » (décision de Mehdi), et le
  bouton de la barre est masqué sous 640 px : au téléphone, une page publique sans appel dans
  son corps ne mène plus à l'inscription — à confirmer avec moi ;
- scripts/ecarts-declares.json est périmé : la référence est désormais la maquette.

ÉTAPE 6 TER — LES LANGUES ET LE SEO (session cloud du 03/10/2026, consignes/audit-langues-seo.md)
Cinq commits (bdd3c07 à 2fc1aae) ont touché les trois catalogues, le blog, le pied public, la
démo de page client et l'aperçu de Ma marque. À remesurer ICI, parce que le cloud ne l'a pas pu :
- `pnpm fumee` : elle lit les catalogues et compare au HTML servi. 236 chaînes françaises ont
  reçu une espace insécable (U+00A0) ; ses contrôles du plan de site filtrent désormais
  `/signalement` selon `canalOuvert`. Relève le décompte et toute ligne ECHEC qui cite un texte ;
- la soustraction au kit sur les écrans dont un texte ou une balise a changé : landing (titres
  de la démo `h4` → `div.pc__titre`), pied des pages publiques (`h3` → `h2`), Ma marque et
  `/bienvenue` (aperçu, « Ordinateur » au lieu de « Desktop »), éditeur de commande, analyses
  (pluriels), tableau de bord. Les écarts de TEXTE nés de la relecture se déclarent, ils ne se
  « corrigent » pas en revenant à l'ancien texte ;
- `node scripts/verifier-ecran-migre.mjs` en zh-CN, à 390 et au bureau, sur les écrans
  d'ADMINISTRATION (double authentification, non mesurés d'ici) : aucun débordement, aucun
  libellé tronqué, `letter-spacing` 0 ;
- `pnpm test:rls` et `pnpm couverture` : aucun fichier de `src/lib/` n'a été ajouté ; un seul
  composant (`src/components/seo/graphe-json-ld.tsx`), exercé par la fumée sur chaque page publique.
Puis, après la mise en ligne seulement (étape 8, sur mon ordre) :
- Google Search Console : propriété de domaine droplink.fr, soumettre `https://droplink.fr/sitemap.xml`
  (27 URL), inspecter `/fr`, `/en`, `/zh-CN` et un article (canonique retenue, hreflang lus),
  vérifier dans « Améliorations » que les fils d'Ariane sont reconnus sans erreur ;
- le test des résultats enrichis de Google sur `/fr`, `/fr/tarifs` et un article ;
- les VRAIES Core Web Vitals (rapport Search Console ou PageSpeed Insights, données de terrain) :
  surveiller le LCP de la landing chinoise au bureau (≈ 2,8 s mesuré en local, CPU ×4).

ÉTAPE 7 — LA PRODUCTION, SANS Y TOUCHER
`pnpm verif:prod` (lecture seule). Liste les migrations que la production n'a pas encore.

ÉTAPE 8 — TON RAPPORT, ET TU T'ARRÊTES LÀ
Donne-moi :
- le décompte de chaque porte, et de test:perf ;
- écran par écran : mesuré oui ou non, et les écarts restants ;
- les défauts trouvés et corrigés, avec leurs commits ;
- les migrations à appliquer en production, dans l'ordre : 210, 211 ET 212 (jamais la 211
  sans la 212), puis 213 — TOUTES avant le push vers droplink2 ;
- l'ordre exact de mise en ligne : (1) railway.json recopié dans Railway puis supprimé,
  (2) `pnpm db:migrate` en production lancé PAR MOI, (3) vérification à la main du rôle
  authenticator (pgrst.db_pre_request), (4) `pnpm verif:prod`, (5) seulement alors la
  fusion dans master et le push, sur mon ordre.
Puis attends ma réponse. Ne pousse rien, ne migre rien en production.
```
