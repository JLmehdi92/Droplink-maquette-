# Prompt : relecture des trois langues et audit SEO

Session cloud lancée le 03/10/2026 sur le bac à sable `JLmehdi92/Droplink-maquette-`.
Le pack `claude-seo` (AgriciDaniel, v2.4.1) a été audité avant par `ecc:security-reviewer` :
sain (pas de télémétrie, pas d'exfiltration), mais ses scripts Python héritent de TOUT
l'environnement (`scripts/runtime.py` `_safe_env` = `os.environ.copy()`), 14 de ses agents ont
Bash, et son hook PostToolUse s'exécute à chaque écriture. D'où la règle : il sert de GRILLE
D'AUDIT, il n'est PAS installé comme plugin dans une session qui porte les secrets de la base de
tests.

---

```
Tu travailles pour Mehdi (pas Wassim), toujours en français. Ce dépôt est le BAC À SABLE
JLmehdi92/Droplink-maquette- (copie de JLmehdi92/droplink2, relié à AUCUN service Railway), branche
claude/saas-motion-design-video-r3ani3. La refonte y est finie. DEUX MISSIONS : (1) relire et
corriger les TROIS LANGUES de tout le site ; (2) auditer et corriger le SEO de TOUTES les pages
publiques dans les trois langues. Mehdi : « sans aucune erreur ».

TU NE T'ARRÊTES PAS TANT QUE TOUT N'EST PAS FINI. Un obstacle se résout : tu raisonnes, tu
tranches, tu écris pourquoi (commit + journal), tu enchaînes.

RÈGLES ABSOLUES
- AVANT TOUT PUSH : `git remote -v`. Tu ne pousses QUE vers le remote dont l'URL est
  https://github.com/JLmehdi92/Droplink-maquette- (avec ou sans .git). Jamais vers un remote qui
  pointe vers JLmehdi92/droplink2, quel que soit son nom (chaque push y redéploie le vrai site).
- Jamais `pnpm db:migrate`, jamais la base de production. Aucun secret écrit sur le disque.
- Commits par `git commit -F -` avec heredoc à délimiteur quoté (<<'FIN'), jamais -m.
- Ne contourne aucun hook ni refus de permission. Aucun test supprimé, sauté ou affaibli.
- Les contraintes de CLAUDE.md gagnent toujours. Lis-le d'abord, en entier, puis
  consignes/refonte-design.md (§ 5, § 8, § 9).
- Portes locales à chaque lot : pnpm typecheck (0 erreur), pnpm lint (0 erreur, 1 avertissement
  préexistant toléré), pnpm build, pnpm test (seul échec admis : l'alarme Railway
  tests/unit/deploiement.test.ts). test:rls, couverture et fumee tournent sur le poste de Mehdi.

═══ MISSION 1 — LES TROIS LANGUES ═══
Périmètre : messages/fr.json, messages/en.json, messages/zh-CN.json (2 036 clés chacun), les
articles du blog (src/contenu/blog/, FRANÇAIS SEUL, c'est voulu), les textes légaux
(legal.pages.*), et toute chaîne visible restée en dur dans src/ (il ne doit y en avoir aucune).
- Un agent PAR LANGUE (un relecteur français, un anglais, un chinois simplifié), l'un après
  l'autre, chacun sur TOUTES les clés de sa langue, avec la clé française en regard pour le sens.
  Chacun relève : fautes d'orthographe, de grammaire, d'accord, de conjugaison ; élisions et
  liaisons (« l'adresse », « d'un », « qu'il », « jusqu'à », espaces insécables avant « : ; ? ! »
  et dans « « » » en français) ; ponctuation et typographie propres à la langue (guillemets
  « » en français, " " en anglais, ponctuation pleine chasse en chinois) ; majuscules ;
  cohérence des termes d'une clé à l'autre (un seul mot pour « commande », « lien », « suivi »,
  « vendeur »…) ; tournures non naturelles ou traduites mot à mot ; pluriels ICU
  ({n, plural, …}) corrects dans chaque langue ; variables ({n}, {nom}…) intactes et à la bonne
  place.
- RÈGLES : ne JAMAIS changer le sens, ni une variable, ni une clé ; ne traduis pas ce que
  CLAUDE.md dit de ne pas traduire (marques, transporteurs, références #XXXXXX, endpoints) ;
  positionnement neutre de CLAUDE.md (contrainte 2 : aucun mot interdit) ; quotas et prix restent
  des variables lues en base. Textes légaux : corrige seulement l'orthographe, la grammaire et la
  typographie, JAMAIS le fond (ils restent à relire par un juriste) ; ils vivent aussi dans le
  design system de Mehdi (ui_kits/legal/contenu-legal-*.js, absent de ce dépôt) : liste au
  journal chaque correction pour qu'il la reporte.
- Le chinois : vérifie aussi au navigateur que les libellés ne débordent pas (boutons, onglets,
  menu mobile, tableaux) à 390 px et au bureau, et que letter-spacing vaut 0
  (html[lang^="zh"]).
- Les tests de parité (tests/unit/i18n-parite.test.ts, catalogue-chinois.test.ts…) restent
  verts. Un commit par langue, avec la liste chiffrée des corrections par catégorie.

═══ MISSION 2 — LE SEO, TOUTES LES PAGES PUBLIQUES, TROIS LANGUES ═══
Le pack claude-seo sert de GRILLE, pas de plugin :
- `GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 --branch v2.4.1 https://github.com/AgriciDaniel/claude-seo /tmp/claude-seo`
  (hors du dépôt, jamais commité). NE lance PAS install.sh, ni extensions/*/install.sh, ni
  `/plugin install`, ni pip install, ni aucun script qui fait du réseau.
- Lis et applique comme méthode : skills/seo-technical, seo-page, seo-hreflang, seo-schema,
  seo-sitemap, seo-images, seo-audit (leurs SKILL.md et les agents correspondants). Ne touche pas
  à seo-flow, seo-image-gen, seo-dataforseo, seo-backlinks, seo-google, indexnow, indexing_notify.
- Seuls scripts autorisés : les analyseurs HORS LIGNE sur des fichiers HTML que TU as enregistrés
  depuis le produit servi en local (ex. parse_html.py sur un fichier, hooks/validate-schema.py),
  TOUJOURS lancés avec un environnement vide : `env -i PATH="$PATH" HOME=/tmp python3 …`. Jamais
  d'URL donnée à un script du pack, jamais CLAUDE_SEO_LOCAL_TARGETS. Si un script exige une
  dépendance absente, n'installe rien : applique sa règle à la main.
Périmètre : chaque page indexable de src/app/sitemap.ts (CHEMINS_INDEXABLES dans les trois
langues + le blog et ses articles en français), rendue par `pnpm build && pnpm start` et
Playwright (Chromium de /opt/pw-browsers), HTML enregistré page par page. Vérifie et corrige
pour CHAQUE page × langue :
- <title> unique, ≈ 60 caractères au plus, dans la langue de la page ; meta description unique,
  ≈ 120-160 caractères, dans la langue ; un seul <h1>, hiérarchie h2-h6 sans saut ;
- <html lang> exact (fr, en, zh-CN) ; canonical auto-référent et absolu ; hreflang réciproques
  pour les trois langues + x-default, cohérents avec sitemap.ts (zh-CN, jamais zh-Hans) ;
- Open Graph et Twitter (titre, description, image absolue, og:locale par langue) ;
- données structurées JSON-LD (src/lib/seo/donnees-structurees.ts) valides et VRAIES : aucune
  note, aucun avis, aucun chiffre inventé (contrainte 8 et décision sur les témoignages) ;
- images : alt pertinent dans la langue, ou alt="" si décoratives ; dimensions posées (pas de
  CLS) ;
- liens internes : textes d'ancre parlants, aucun lien mort ;
- robots.ts et sitemap.ts : toutes les pages publiques présentes, aucune page privée.
⚠️ RÈGLE ABSOLUE : AUCUNE page privée ne devient indexable ni n'entre dans le sitemap — surtout
PAS /p/[token] (son jeton est une capacité : le publier publie l'accès), ni l'espace vendeur,
l'admin, la connexion, l'inscription, les pages de compte. Vérifie qu'elles portent noindex et
que le test qui garde la liste du sitemap reste vert. Ne donne JAMAIS une URL /p/<jeton> à quoi
que ce soit.
Core Web Vitals : mesure-les en local (Playwright, CPU ralenti ×4) sur la landing et une page
légale par langue ; ne dégrade rien ; /p garde son budget < 300 Ko hors médias.

À CHAQUE LOT : agents ecc:typescript-reviewer et ecc:react-reviewer sur le diff,
ecc:security-reviewer sur tout ce qui touche sitemap, robots, métadonnées et /p ; les portes
locales ; un commit par lot en français (le pourquoi, les mesures) ; entrée datée au § 8 de
consignes/refonte-design.md ; push vers le bac à sable.

À LA FIN : un agent ecc:code-explorer en lecture seule refait l'inventaire page × langue (title,
description, h1, lang, canonical, hreflang, OG, JSON-LD, alt) et un relecteur par langue refait
un passage complet sur les textes ; corrige ce qu'ils trouvent et recommence jusqu'à zéro. Écris
le bilan dans consignes/audit-langues-seo.md (tableau page × langue, corrections par catégorie,
ce qui reste au poste de Mehdi : Google Search Console, vraies Core Web Vitals en production),
ajoute à consignes/verification-finale-locale.md ce qui doit y être remesuré, commit, push, puis
rends la main avec un bilan chiffré. N'affirme jamais « parfait » sans l'avoir mesuré.
```
