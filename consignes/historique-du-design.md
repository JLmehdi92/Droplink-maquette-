# Historique du design et de la conformité

> Déplacé de `CLAUDE.md` le 17/09/2026, **mot pour mot**, pour qu'il ne soit plus chargé
> d'office à chaque séance (~48 Ko). Rien n'y est périmé du seul fait d'avoir déménagé :
> c'est le journal des relevés, des pièges et des décisions. Les consignes, elles, sont
> restées dans `CLAUDE.md`. Les deux gardes qui lisent la prose de `CLAUDE.md`
> (`exports-vivants`, `consignes-executables`) lisent aussi ce fichier.

### ▶️ 20/09/2026 — DEUX ÉCRANS TOUCHÉS, ET TROIS DÉFAUTS QUE SEULE UNE CAPTURE A VUS

**Écrans :** `/[locale]/passer-pro` (NOUVEAU, planche `seller_app/PassProView.jsx`
écrite d'abord) · `/marque` (sections 5 et 6 vivantes en Pro) · la barre latérale
de tout l'espace vendeur.

**Mesure :** `verifier-ecran-migre.mjs` sur `/fr/passer-pro`, `/fr|en|zh-CN/marque`,
à **1690 et 390 px** — **60 contrôles, code 0**. CSP servie sans violation, aucune
erreur de console, rien ne disparaît sous `prefers-reduced-motion`.

#### Ce que la MESURE a trouvé, à 390 px seulement

- une police à **11 px** — le plancher du téléphone est **11,5** (règle 5). Le kit
  descend à 11 px et c'est réservé au bureau : `text-[11.5px] lg:text-[11px]` ;
- `droplink.fr/votre-boutique/…` **sortait de sa carte**. Trois colonnes ne
  tiennent pas sur un téléphone : chaque ligne du tableau y devient un BLOC, et
  ses deux valeurs portent leur nom — sans en-tête de colonne, « Affichée » tout
  seul ne dit pas de quel plan il parle.

#### ⚠️ CE QUE LES NOMBRES NE POUVAIENT PAS VOIR, ET QU'UNE CAPTURE A MONTRÉ

Les trois relevés sortaient déjà en code 0. Rien ne débordait, rien n'était
tronqué. La capture, elle, montrait :

1. un bouton **« Upgrade »** dans la barre latérale d'un écran **français**. Le
   mot venait de la planche (`AppShell.jsx`), recopié dans `fr.json` ; le
   chinois, lui, était traduit. **Corrigé dans le kit D'ABORD**, produit ensuite ;
2. ce bouton menait à `/docs#plans` alors qu'un écran répond à la question ;
3. ⚠️ **la carte « Passez au Pro » s'affichait à un compte qui PAIE DÉJÀ.**
   Ce n'est pas une maladresse de copie : c'est l'interface qui affirme un état
   que la base contredit (principe VIII).

*C'est la règle du 12/09 dans sa formulation exacte : « regarder les deux
captures côte à côte — les nombres établissent qu'un écran ne déborde pas, ils
ne disent rien de ce qui MANQUE autour ». Ici ce n'était pas un manque mais un
mot faux et une carte de trop, et aucune soustraction ne pouvait les voir.*

#### La planche se contredisait, et il a fallu trancher

`BrandView.jsx` dessinait la section 5 (« Lien personnalisé ») avec un champ
**ACTIF** et sa coche de validation, pendant que la section 6 (« Marque
DropLink ») juste en dessous dessinait un interrupteur **VERROUILLÉ** — pour le
même compte, sur le même écran. Les deux sont réservées au Pro : elles ne
peuvent pas être dans deux états à la fois. Un drapeau `PLAN_PRO` (défaut
`false`) porte désormais les deux états, et `false` est le bon défaut — le reste
de l'écran décrit un compte gratuit.

---

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

#### ▶️ OÙ ON EN EST, ET LE PROCHAIN ÉCRAN

> **REMESURÉ LE 19/09/2026 : 37 RELEVÉS AU BUREAU ET 37 À 390 px EN CODE 0, ET 148 RELEVÉS
> AUX LARGEURS INTERMÉDIAIRES (768, 1 024, 1 280, 1 440) SANS DÉFAUT.** Le tableau ci-dessous
> garde ses décomptes d'origine ; le détail de la nuit du 18 au 19/09 est en fin de fichier,
> § « Les largeurs entre les planches ».

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
> ⚠️ **LES ÉCRANS VENDEUR ONT UNE PLANCHE TÉLÉPHONE À PART** —
> `seller_app/Telephone.jsx` (dans le kit, pas dans `src`), choisie sous 768 px. À 390 px
> la planche de bureau tassée rendait cinq tuiles empilées et un tableau de neuf
> colonnes replié ; le produit avait déjà la composition du pouce (en-tête blanc
> et recherche, compteurs deux par deux, cartes, action flottante). Au passage :
> sur **/commandes**, « Filtres » et « Exporter » tombaient à 180 px HORS de
> l'écran au bout des onglets qui défilent — ils ont désormais leur rangée, en
> deux moitiés ; sur **/envois**, le tri seul sur sa rangée prend toute la
> largeur (« Ce qui ne b… ») ; sur **Liens clients** (analyses et tableau de
> bord), neuf dates dans 324 px faisaient déborder « 15/09 » de la carte, et
> trente barres séparées de 10 px n'avaient plus qu'UN pixel de large — cinq
> repères et 2 px d'écart au téléphone, rien ne change au bureau.
> ⚠️ **`.dl-main > *` et `.dl-main div` portent `max-width:100%` au téléphone
> dans la planche** : une bande en marges négatives s'y arrêtait à 358 px, sans
> débordement ni alerte.
> ⚠️ **Deux données du jeu de mesure changent d'ordre d'un passage à l'autre** —
> quatre commandes et deux événements créés à la même seconde : leurs
> déclarations de place sont `volatile`.
>
> ⚠️ **`volatile: true`** dans `ecarts-declares.json` : la seule déclaration
> qu'on n'exige pas de retrouver, réservée aux données que les suites réécrivent
> selon leur ordre (âges du journal, lignes de suspension). Toute autre
> déclaration morte fait toujours échouer la soustraction.
>
> ⚠️ **QUATRIÈME LOT, L'ADMINISTRATION : SES DIX RELEVÉS SORTENT EN CODE 0 À
> 390.** La planche admin n'avait pas de version téléphone du tout — sa barre du
> haut, ses panneaux et ses tuiles étaient ceux du bureau, tassés. Écrit dans la
> planche puis porté : une **bande de titre** (DropLink / ADMINISTRATION et la
> déconnexion à 44 px) qui remplace la barre du haut sous 768 px, titre d'écran à
> 24 et sous-titre à 14 (à 26 et 15 le titre passait sur deux lignes), panneaux à
> 16 de remplissage, grilles `mon-grid` et `acc-grid` sur une colonne, compteurs
> de fiche de compte deux par deux (à quatre, chaque libellé tenait dans 39 px),
> et **plancher de 11,5 px sur les libellés d'axe des graphes**. Côté produit,
> les grilles de tuiles compactes passent de une à **deux colonnes** : une tuile
> par rangée repoussait la première ligne de liste à 550 px.
> ⚠️ **LA PASTILLE DU DESIGN SYSTEM ÉCRIT EN `var(--text-micro)`, PAS EN
> `font-size: 11px`** : la règle d'attribut qui remontait les 11 px ne pouvait
> pas la voir. C'est `--text-micro` qu'on redéfinit à 11,5 dans `.adm-main`.
> ⚠️ **ET UN DÉFAUT VU SEULEMENT À LA CAPTURE** : sur `/admin/statistiques`, la
> rangée des vues (« Vue globale », « Utilisateurs »…) partageait sa ligne avec
> le sélecteur de période — 159 px pour six onglets, et ses marges négatives
> passaient SOUS le sélecteur. Aucun débordement du document, donc aucune alerte
> de la sonde. Elle a sa rangée sous le palier.
>
> **CINQUIÈME LOT, LA PAGE CLIENT ET LA LANDING : CODE 0 À 390** (17/09/2026),
> vérifiées en fr/en/zh et toujours à 0 au bureau.
> - **Page client** — la planche est écrite **À PLAT** au téléphone (décision
>   téléphone de Wassim) : sections séparées d'un filet, gouttière 18. Dans ses
>   cartes, la frise ne tenait plus (« Commandée » et « En transit » se
>   chevauchaient) et les liens du pied faisaient 40 px. Au produit, l'historique
>   resserrait sa grille sous `lg` (texte 8 px à gauche) : même grille partout.
> - **Landing** — pris au kit : cartes de fonctionnalités icône à gauche (elles
>   perdaient la hauteur de leur tuile), gages en colonne alignée, étapes à 24,
>   bannière 28 × 34, **les deux points de l'`Eyebrow`** que la pastille du
>   produit n'avait pas, gouttière 16. Écrit dans le kit : liens du pied à 44 px
>   (ils en faisaient 16), plancher 11,5 par `--type-eyebrow-size`. Retiré : les
>   **textes courts et le paragraphe masqué de l'ancien canevas** — « la planche
>   mobile SUPPRIME ce paragraphe » citait une planche morte.
> - ⚠️ **UNE DÉCLARATION « POSITION ET LARGEUR » COUVRAIT UN ÉCART DE DESSIN.** Le
>   bouton blanc de la bannière portait un filet transparent et l'ombre `md` là
>   où le `Button secondary` du kit porte filet et ombre `sm` ; au bureau, sa
>   déclaration ne parlait que de place. Une déclaration couvre un TEXTE, toutes
>   propriétés confondues : relire ce qu'elle excuse quand l'écran change. Les
>   liens du pied de la landing étaient de même au gris de corps, pas en sourdine.

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
>
> ⚠️ **CE N'EST PLUS VRAI DEPUIS LE 18/09/2026, ET C'ÉTAIT UN DÉFAUT DE LA
> SONDE, PAS UNE CONVENTION.** Le contenu d'un `<details>` fermé garde ses
> boîtes sous Chrome (`content-visibility: hidden`) sans être peint : la sonde
> l'inventoriait donc comme rendu, et une option CACHÉE du produit pouvait
> apparier un texte VISIBLE du kit. C'est ainsi que « Plus récentes », bouton
> de la barre d'outils du kit, se trouvait « rendu » par le lien replié du
> panneau Filtres de `/commandes` — déclaré `structure`, alors que le produit
> ne l'affichait pas. L'inventaire écarte désormais ce qui n'est pas peint
> (l'API du navigateur checkVisibility, sans argument) ; le plancher téléphone garde l'ancien test, un menu
> fermé s'ouvre et ses cibles doivent tenir 44 px.

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
⚠️ **ET UN `finally` NE PROTÈGE PAS D'UN PROCESSUS TUÉ.** Le 17/09/2026, la base
de tests ne portait plus qu'un compte : un « ecran-… » d'un passage arrêté la
veille. Chaque mesure en ajoutait un second, et quatre écrans d'administration
sont sortis rouges au bureau sans aucun défaut — « 1 boutique au total » ne
s'appariait pas à « 124 boutiques au total » (l'accord du nom les sépare),
« 2 boutiques au total » si. **Le singulier et le pluriel font basculer un
écart d'une liste à l'autre.** La sonde purge désormais, avant de créer le sien,
tout compte de sonde de plus de trente minutes. *Avant de déclarer un écart
d'administration, compter les comptes de la base de tests.*

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

#### ▶️ LES LARGEURS ENTRE LES PLANCHES (nuit du 18 au 19/09/2026)

Consigne de Wassim : « vérifie tout les écran et chaque features deja existante ». Les 37
relevés étaient en code 0 à la largeur du kit et à 390 px ; **entre les deux, rien n'était
mesuré.** Quatre règles nouvelles dans `scripts/verifier-ecran-migre.mjs` (commit `d9cbbc9`),
toutes en code 1 : `[rognage]` (contenu coupé par un ancêtre en overflow caché), `[largeur]`
(document qui déborde, avec ses coupables, et menu ouvert hors de la fenêtre), `[cadre]`
(étendue réelle du texte, par `Range`, qui sort d'une carte visible) et `[chevauchement]`
(deux textes qui se recouvrent ; les textes sous un ancêtre fixe ou collant en sont exclus,
une barre du bas recouvre ce qui défile sous elle par construction).

**Défauts trouvés et corrigés** (commit `4a102cc`) :

| écran | largeur | défaut | correction |
|---|---|---|---|
| en-tête vendeur | 768 | le champ de recherche gardait sa largeur d'input : +17 px, menu du compte hors écran | `w-0 min-w-0 flex-1` |
| `/commandes`, `/envois` | 1 024 / 1 280 | rangée d'outils sur une ligne dès `lg` : +298/+281 px, puis +42/+25 | une ligne seulement à `2xl` |
| `/commandes` | 1 024 / 1 280 | frise, date et vignettes se recouvraient | colonnes Produits et Suivi à `2xl` seulement |
| `/envois` | 1 280 / 1 440 | « Dernière mise à jour » (en-tête `nowrap`) sur « Prochaine étape » | en-têtes à la ligne sous `2xl` |
| fiche de commande | 1 024 | grille de médias à 6 colonnes (pastille « Couverture » coupée) ; historique dont le titre n'avait plus que 11 px ; valeurs du panneau Informations HORS de la carte | 6 colonnes à `2xl` ; requête de conteneur `@[280px]` ; `LigneInfo` en `flex-wrap` |
| `/admin` | 1 280 | la légende de l'anneau recouvrait sa part | légende sous l'anneau sous 230 px (239 mesurés à 1 545 : la planche reste en rangée) |
| `/admin`, courbe | 768 | neuf dates au lieu des huit de la planche, sorties de la carte de 69 px | la règle de la planche : un repère régulier n'est écrit que s'il reste un pas complet avant le dernier jour |
| `/admin/boutiques` | 1 545 | la colonne Actions (`ee7f945`) dépassait la carte, « Voir » passait sous le panneau — caché par une déclaration « structure » | panneau à côté dès `2xl`, comme la planche ; la colonne Médias (absente de la planche, son coût est dans Stockage) ne s'affiche qu'à 1 700 |

**Et hors écran** (commit `f7d3f2c`) : les liens de l'administration préchargeaient leur
cible, et chaque préchargement comptait contre le plafond de 30 requêtes par minute — une
404 au quatrième écran ouvert en vingt secondes. `prefetch={false}` sur les 22 liens, gardé
par `tests/unit/admin-sans-prechargement.test.ts`.

**Mouvement réduit** : un texte n'est « disparu » que s'il manque encore après dix secondes de
relecture. L'activation en deux étapes à 768 px était sortie avec deux textes disparus
pendant un balayage qui chargeait le serveur, puis en code 0 trois fois : l'état rejoué au
clic relance une action serveur. Falsifié : un titre en `opacity-0 motion-safe:opacity-100`
rougit toujours.

**Les pièges de la nuit**, tous payés :

- ⚠️ **ARRÊTER UN SERVEUR DE MESURE PAR MOTIF** : la ligne de commande réelle est
  `next" start`, avec un guillemet entre les deux mots. Un motif `next start` ne tuait rien,
  et huit serveurs orphelins se sont accumulés jusqu'à faire tomber les mesures. Motif :
  `next\W+start`.
- ⚠️ **FERMER LES FENÊTRES NOIRES, C'EST COUPER LES SERVEURS** : les écrans sortent alors en
  « servi SANS Content-Security-Policy », les uns après les autres.
- ⚠️ **UNE CHAÎNE TUÉE LAISSE UN COMPTE DE SONDE** (quatre commandes) : pendant trente minutes,
  les écrans d'administration comptent double (« 8 commandes au total »). On attend la purge
  et on remesure ; **on ne déclare rien.**
- ⚠️ **LE JEU DE MESURE EST DATÉ DU JOUR DU PASSAGE** : le 19/09, toutes ses dates tombent à
  deux chiffres, l'appariement aux dates du kit change de rang, et des déclarations meurent.
  Celles qui en dépendent sont `volatile`, avec les quatre rangs.

**Parcours de bout en bout** (vrais clics, effets vérifiés EN BASE de tests) : 26 étapes sur
26 — connexion, commande, transporteur, dupliquer, archiver, révoquer, recherche et export,
page client et arbitrage, envois, marque, paramètres, deux étapes, sessions, export et
suppression des données et du compte, suspension et réactivation par l'administration.
Portes : 862 unitaires, 799 RLS, 0 sauté, fumée 349.

**Les nouveautés du kit que le produit n'a pas** : 83, inventoriées le 19/09 — 21 interdites
par une décision verrouillée, 43 qui attendent une décision de Wassim, 19 faisables sans
arbitrage. La liste écran par écran est dans `consignes/inventaire-du-kit.md`, indexée dans context-mode
(source `inventaire-kit`).

#### ▶️ LES DÉCISIONS DE WASSIM SUR LE KIT, ET LE BLOCAGE D'UN LIEN (19/09/2026)

**Retirés du design system** (décision de Wassim : « tu peux enlever pour la sécurité »,
« enlève apple et github ») : les boutons et mentions Apple, la rangée GitHub et la carte
« Politique de mot de passe » de l'onglet Sécurité admin, la carte « Configuration SMTP », la
carte « Zone dangereuse ». Sauvegarde avant retrait dans `out/kit-sauvegarde-19-09/`. La
remesure des six écrans touchés (12 relevés en code 0) a trouvé un défaut **du produit** : ni
la confidentialité ni la documentation ne mentionnaient Google (commit `451d1e8`).

**Blocage d'un lien par l'administration** (commit `229365d`, migration 166) : planche
`admin/AdminOrders.jsx` d'abord — le « ⋯ » inerte devient le bouton de blocage, une pastille
« Lien bloqué » s'ajoute au statut, `BlockLinkDialog` avec motif (état `#commandes-blocage`).
Relevés `admin-commandes` et `admin-commandes-blocage`, bureau et 390 px, en code 0 ; la sonde
bloque RÉELLEMENT une ligne avant de relever. Pièges payés :

- ⚠️ **UN DIALOGUE CENTRÉ SE DÉCALE DE 5 PX** : la sonde du kit mesure dans une fenêtre de
  1 010 px de haut (l'en-tête `viewport` des planches), celle du produit dans 1 000. Déclaré
  `structure`, avec le calcul.
- ⚠️ **UN COMPOSANT CLIENT D'ADMINISTRATION REÇOIT SES TEXTES PAR `TraductionsClient`** : sans
  `espaces={["admin.blocage"]}`, la console relevait `MISSING_MESSAGE` à chaque ligne.
- ⚠️ **LA PASTILLE COMPACTE DES CARTES ADMIN** (3/9 sous `xl`) diffère de la planche téléphone
  (6/11) pour TOUTES les pastilles des listes admin — écart préexistant, déclaré et signalé.

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


#### ▶️ LE PLAN D'UN COMPTE ET LA CARTE « PROPULSÉ PAR DROPLINK » (19/09/2026)

Décision de Wassim (point 4) : en gratuit, la page client porte la carte promotionnelle du kit
(`PoweredCard`) ; un compte **Pro** la retire par un interrupteur de « Ma marque » ; le plan se
pose à la main dans l'administration, après un paiement reçu hors du produit (migration 167).

**Planches d'abord** : `seller_app/BrandView.jsx` et `Telephone.jsx` (section « 6. Marque
DropLink (Pro) », état gratuit verrouillé ; l'état Pro — interrupteur pleine ligne, sans carte —
écrit en commentaire), `admin/AdminAccount.jsx` (`AccPlan` sous la suspension, état ouvert
`#compte-plan`, état Pro en commentaire), dictionnaire `dict-app.js` (+6 entrées en/zh).

**Relevés** : `marque`, `compte`, `compte-suspension`, `compte-plan` (NOUVEAU, `CLIC_PRODUIT="Passer
en Pro"`, `ETAT=plan`) et `client`, au bureau en code 0. Défauts trouvés en mesurant :

- 🔴 **LA CARTE ÉTAIT PEINTE AUX COULEURS DROPLINK, ET LA PLANCHE AUX COULEURS DU VENDEUR.**
  `ClientPage.jsx` rhabille `--gradient-brand`, `--gradient-tint`, `--violet-200` et
  `--accent-ink` par `brandVars` : le bouton du kit est `primaire → secondaire` du VENDEUR. La
  règle 3 tient donc sans exception ; la carte suit l'accent (`resoudreAccent`), le bouton est un
  aplat (une seule couleur au produit), seul le symbole est à nous. CLAUDE.md corrigé.
- 🔴 **LA SOUSTRACTION NE COMPARAIT PAS L'IMAGE DE FOND** — donc AUCUN dégradé, sur aucun écran,
  depuis l'origine. La sonde la relevait ; `PROPRIETES` s'arrêtait à `fond`. Ajoutée. Balayage
  des 74 inventaires : 14 écarts, 9 portés par un parent immédiat (mesuré), 4 déjà déclarés par
  la règle 3, et le seul vrai : la carte ci-dessus. Falsifié : la déclaration levée, l'ancien
  dégradé de la carte ressort en « image de fond ».
- ⚠️ **LA MENTION ÉTAIT ÉCRITE DEUX FOIS** en gratuit : dans la carte ET dans le lien « Propulsé
  par DropLink » du pied (hérité de la décision 25). Le lien du pied est retiré ; les deux liens
  légaux gardent la droite, comme au kit.
- ⚠️ **LE BOUTON « PASSER EN PRO » TOMBAIT 11 PX TROP HAUT** : la rangée `AccRow` du kit porte
  11 px en bas. Et 127 px de décalage de la carte client, mesurés : c'est la carte
  « Notifications automatiques » du kit (refusée), 132 px moins les 5 de la carte de contact.
- ⚠️ **CE QUE COÛTE UN DÉPLOIEMENT AVANT LA 167 — corrigé après le commit `cb63602`**, dont le
  message dit à tort « la page client rend 500 ». Vérifié dans le code : la page client lit
  `marque_masquee === true` et resterait servie. C'est la lecture du profil vendeur
  (`profil.ts`) qui demande `profiles.plan` et `shops.hide_droplink_brand` : PostgREST la
  refuse, et CHAQUE page vendeur traite le compte comme déconnecté. Donc `pnpm db:migrate`
  (147 → 167) AVANT le déploiement, sans exception.

#### ▶️ LE LIEN BLOQUÉ VU DU VENDEUR, SA CONTESTATION, ET LE TÉLÉPHONE PARFAIT (19-20/09/2026)

Décisions de Wassim : « oui il doit le savoir », le vendeur CONTESTE (explication, image
facultative), et « je veux que les pages soient parfaites en version téléphone ».

**Planches d'abord** : `seller_app/OrderDetail.jsx` (`BlockedNotice`, quatre états par
l'adresse : `#commande-bloquee`, `-formulaire`, `-attente`, `-refusee`, partagé avec le
téléphone), `OrdersView.jsx` et `Telephone.jsx` (`#commandes-bloquee`, pastille « Lien bloqué »
sous le statut ; au téléphone elle remplace la ligne d'appoint), `admin/AdminOrders.jsx`
(`#commandes-contestation` : pastille « Contestation », `ContestDialog` — explication, image,
réponse, refuser OU débloquer, les deux issues à largeur égale et empilées au téléphone),
dictionnaires `dict-app.js` (+19) et `dict-admin.js` (+7). Le bandeau prend le rouge des ÉTATS,
jamais le dégradé.

**Douze relevés neufs, tous en code 0** (bureau et 390) : `commandes-bloquee`, `detail-bloquee`,
`detail-contestation`, `detail-attente`, `detail-refusee`, `admin-commandes-contestation`. La
sonde prépare l'état par `LIEN_BLOQUE=1|attente|refusee` (client de service, textes de la
planche mot pour mot). Écarts déclarés avec leur cause MESURÉE : l'en-tête du kit (32 px), le
bouton d'action à quatre libellés, l'absence d'image dans le jeu (R2 de production seulement),
deux arrondis additionnés (3 px au téléphone, bandeau identique au pixel).

**Le téléphone, capture contre capture — ce que la soustraction ne voyait pas** :
- 🔴 **le fond de l'espace vendeur manquait sur NEUF écrans à 390 px** (`FondApplication` en
  `hidden md:block`, racine blanche au téléphone) et **celui de l'admin manquait PARTOUT**
  (jamais porté). Corrigés ; la soustraction compare désormais les DÉCORS (⑥), et les deux
  sondes inventorient `<body>` (le kit y peint le fond des pages publiques) ;
- 🔴 **les pastilles des listes admin passaient en 3/9 sous `xl`**, la planche dessine 6/11
  partout : alignées (comptes, boutiques, commandes) ;
- ⚠️ la planche admin « Commandes » au téléphone est elle-même CASSÉE (plage de dates à un mot
  par ligne, tableau écrasé) : le produit garde ses cartes, plus lisibles ;
- ⚠️ les pages légales du kit sont un gabarit d'un autre produit — décision du 18/09, déclarée.

### 20/09/2026 — Le motif du blocage, lu par le vendeur (migration 169)

Décision de Wassim : « oui on montre la raison au vendeur ». **Planches d'abord** :
`BlockedNotice` porte une ligne « Motif : … » sous sa phrase (texte 13,5 / encre forte, libellé
en gras), dans ses quatre états et au téléphone ; `BlockLinkDialog` dit, au BLOCAGE seulement,
« Le vendeur le lit dans sa commande, et il s'écrit au journal » (le déblocage garde l'aide du
journal) ; dictionnaires `dict-app.js` (+2) et `dict-admin.js` (+2, dont l'aide du déblocage,
qui n'était pas traduite).

**Quatorze relevés en code 0** (les sept écrans-états du blocage, bureau et 390). La ligne du
motif suit le décalage DÉJÀ déclaré du bandeau (32 px, le sélecteur de statut de l'en-tête de
la planche) ; l'aide admin garde les 5 px de la fenêtre de mesure ; la tuile « Couverture » au
téléphone devient VOLATILE (un arrondi de 3 px qui ne tombe pas à chaque passage). Captures
côte à côte : le bandeau est identique.

🔴 **Le serveur de mesure parlait à 17TRACK avec la clé de PRODUCTION** : 9 des 200 prises à vie
perdues (numéros « LX…123FR » du parcours). Coupé au transport (`scripts/refus-tiers.mjs`,
préchargé) et par des clés sentinelles — une clé VIDE ne suffit pas, Next recharge `.env.local`.

### 20/09/2026 — Les comptes en doublon (migrations 170 et 171)

Décision de Wassim : « j'aime bien l'idée des doublons détectés dans l'admin […] faut que la
feature soit vraiment parfaite, aucune erreur » — et « garde que ça » (ni plafond global, ni
suivi réservé au Pro : le suivi automatique reste pour tous, gratuits compris).

**Planches d'abord** : `ui_kits/admin/AdminDuplicates.jsx` (`#comptes-doublons` — une carte par
identifiant partagé, colonne « En bref » et « Comment un doublon est reconnu »), panneau
`DuplicatesPanel` dans la colonne de droite d'Utilisateurs (un NOMBRE, jamais un nom), 26
entrées `dict-admin.js`. Deux défauts de ma propre planche au téléphone corrigés AVANT le
portage : une adresse coupée (« lea.modeaddict@icl… » — l'adresse est justement ce qui
distingue deux comptes) et un bouton de 34 px (plein largeur, 44 px).

**Quatre relevés en code 0** : `admin-doublons` (bureau, 78 écarts de POSITION seule déclarés —
la barre supérieure du kit, -2/-79 px, prouvé sur les ENSEMBLES de positions) et au téléphone ;
`admin-comptes` au bureau et au téléphone, avec le panneau. Trois vrais écarts trouvés et
corrigés à la mesure : l'action de l'en-tête centrée au lieu d'être alignée en haut
(`EnTeteAdmin actionEnHaut`), 4 px sous l'en-tête, les remplissages téléphone des cartes et de
la section des règles. Sonde : `DOUBLONS=1` (les sept comptes de la planche, adresses AFFICHÉES
seulement, connexion `ecran-…`) et `DOUBLONS=nombres` (comptes neutres pour la liste — sinon
les adresses de la planche s'appariaient aux utilisateurs de démonstration). Trois langues à
390 px et en/zh à 1545 : rien ne déborde, CSP servie sans violation.

⚠️ **Un écart CACHÉ PAR LES DONNÉES, trouvé en passant** : l'adresse d'une ligne de la liste des
comptes est à 12 px chez le produit, 12,5 dans la planche — invisible tant que les deux jeux
n'avaient aucune adresse commune. Corrigé dans la foulée (12,5 px, bureau et téléphone), vérifié par une mesure ponctuelle aux adresses de la planche.

**Revues ECC** (base, sécurité, code) : 0 critique en sécurité ; un faux positif réel
(`stories/highlights/…` → `instagram:highlights`, corrigé par la 171 avec `www.m.`, le premier
`?` et `parallel safe`) ; les étiquettes de cellule passent de `lg:hidden` à `lg:sr-only` pour
le lecteur d'écran au bureau.
