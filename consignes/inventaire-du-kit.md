# Inventaire des nouveautés du kit non codées (19/09/2026)

Rapport d agent, lecture seule, vérifié par grep dans src/ et messages/fr.json. 83 fonctionnalités : 21 ⛔ interdites, 43 🟠 décision de Wassim, 19 🟢 sans arbitrage.

Je n'ai rien modifié ni lancé : pas de build, de test ni de serveur, et je n'ai pas ouvert `.env.local`. Chaque absence a été vérifiée par grep dans `src/` et dans `messages/fr.json`, jamais dans un navigateur. J'ai lu en entier `out/manquants-par-ecran.txt`, puis les planches de `ui_kits/` (seller_app avec Telephone.jsx, admin avec les 3 sous-onglets de réglages, client_link, auth, marketing_site, legal, docs, blog, erreurs).

**Décompte : 83 fonctionnalités manquantes.**
- ⛔ interdites : 21
- 🟠 décision produit : 43
- 🟢 à faire sans arbitrage : 19

**Deux contrôles non faits dans `src/` :**
- Les 3 sous-onglets de réglages admin (`AdminSettingsSecurity`, `AdminSettingsSystem`, `AdminSettingsBilling`) n'ont jamais été mesurés. Ils n'apparaissent pas dans `manquants-par-ecran.txt`, donc je les ai lus dans le JSX seul.
- Pour les tuiles du tableau de bord, je me suis fié au fichier des manquants.

## Landing
- 🟢 **Page d'exemple réelle** : « Voir un exemple de page client » mène aujourd'hui à `/docs#lien`. Il faudrait une vraie page de démonstration statique, qui ne compte aucune vue. Pas de migration.
- 🟠 **Newsletter** : le champ « Restez informé » du pied de page n'a pas de `name`. Le formulaire renvoie vers l'inscription et l'adresse saisie est perdue. À décider : collecte d'e-mails marketing, consentement RGPD, envoi.

## Connexion / Inscription / Mot de passe
- ⛔ **Connexion Apple** (et « Continuer avec Apple ») : la décision 27 fixe e-mail + mot de passe et Google.
- 🟢 **Champ « Nom complet » à l'inscription** : la colonne existe déjà (`nom_affiche`, modifiable dans Paramètres). La raison écrite dans le fichier des manquants (« aucune colonne ») est périmée. Pas de migration.
- 🟠 **Case de consentement CGU bloquante** : le produit n'affiche qu'une mention « En continuant, vous acceptez… ». Question juridique : faut-il une case et une trace du consentement ?
- 🟠 **Preuve sociale et places de marché sur connexion/inscription** : « +2 500 vendeurs », le témoignage, les logos Vinted, eBay… La landing les affiche déjà (réécrite le 18/09 sur la consigne de Wassim). Il faut aligner les deux écrans, ou retirer partout.

## Accueil (bienvenue)
Rien ne manque : le kit correspond au produit.

## Tableau de bord (et la coque vendeur)
- 🟠 **Plage de dates libre** à la place des fenêtres 7/30/90 j, avec un graphe qui suit la période choisie. Vaut aussi pour Analyses, où le graphe reste figé sur 12 semaines. À décider : à quoi comparer une plage libre.
- 🟢 **Variation vs période précédente sur toutes les tuiles** : seule la première en a une aujourd'hui. Vaut aussi pour Analyses, Envois et Commandes. Pas de migration.
- 🟢 **Événements de suivi dans l'activité** : « Colis livré », « Colis en transit », « Statut mis à jour ». Vaut pour l'activité récente du tableau de bord et d'Analyses, et pour l'historique de la fiche. Il faut que l'ingestion du suivi écrive dans `order_events`. Migration : `alter type … add value`, seul dans sa migration.
- 🟢 **« Nouveau lien ouvert » dans l'activité** : se déduit de `link_views`. Migration probable de la fonction de lecture.
- ⛔ **Offre Pro payante** : carte « Passez au Pro » du tableau de bord (lien personnalisé, statistiques avancées, support prioritaire), carte « Passer au Pro » et plan borné à 50 commandes/mois dans Paramètres. Contrainte n°1.
- 🟠 **Centre de notifications de la coque** : la cloche du kit montre des événements (livré, en livraison, problème, nouvelle commande), un état « non lue » et « Tout marquer comme lu ». La nôtre n'a que 2 alertes calculées, sans état lu. Il faudrait des événements et une colonne d'état de lecture.

## Commandes (liste)
- ⛔ **Pagination numérotée** : la règle de performance impose le curseur, jamais le décalage.
- 🟢 **Choix du nombre de lignes par page** (« Afficher [10] ») : compatible avec le curseur. Vaut aussi pour les listes admin.
- 🟠 **Incident transporteur « Problème » et « En livraison »** : tuiles, onglet et statut sur Commandes, Envois, Analyses, tableau de bord et admin.
  - La frise à 4 étapes est verrouillée (décision 4), donc ce ne peut être qu'un indicateur à part.
  - Les raisons écrites disent que « le transporteur ne déclare pas d'incident ». Or `src/lib/tracking/normalize.ts` reçoit bien `exception`, `deliveryfailure` et `outfordelivery`, puis les ignore.
  - Donc faisable, mais il faut décider où l'afficher et s'il faut une colonne.

## Création de commande
- 🟠 **E-mail facultatif du client** pour le notifier. Le brief l'envisage (« l'e-mail de notification est optionnel et ne crée pas de compte »). Implique une donnée personnelle, des envois Resend et une migration.
- 🟠 **PDF acceptés comme médias** : il faudrait une visionneuse, et un PDF peut porter du script.
- ⛔ **Brouillon et boutons « Enregistrer » / « Modifier la commande »** : la décision 16 impose la sauvegarde automatique.

## Fiche / éditeur de commande
- 🟠 **Pays de livraison** : sur la fiche, la page client et le filtre « Tous les pays » des envois. Nouvelle donnée personnelle, migration.
- 🟠 **Nombre d'articles** : une commande n'a pas de lignes (pas de catalogue).

## Suivi d'envois
- 🟢 **Tri « Par statut »** : les autres tris existent. Pas de migration.

## Analyses
Rien d'autre que ce qui est déjà listé au tableau de bord (plage de dates, variations, événements).

## Ma marque
- 🟠 **Couleur secondaire** : colonne, contraste propre et endroit où l'appliquer sur la page client.
- 🟠 **Les 6 interrupteurs d'affichage** (logo, photos, description, suivi, réseaux, bouton de contact) : aucune colonne. `CLAUDE.md` les réserve à une décision.
- 🟠 **« Ouvrir ma page client »** : il n'existe pas de page par boutique. Il faudrait choisir la commande à ouvrir, sans compter de vue (décision 22).
- ⛔ **Lien personnalisé fonctionnel** : fonction Pro, et un jeton par commande. La section reste affichée et inerte, sur décision du 12/09.
- 🟢 **Logo en SVG** : autorisé par la règle de sécurité à condition de l'assainir avant stockage. Il faut un assainisseur auto-hébergé, pas de migration.
- 🟢 **Bascule d'aperçu Bureau / Mobile** : purement côté écran.

## Paramètres (dont 2FA et suppression)
2FA, sessions, export et les deux suppressions sont complets. Manquent :
- 🟠 **Photo de profil** : colonne et stockage R2.
- 🟠 **Téléphone (optionnel)** : refusé pour minimisation des données.
- 🟠 **Fuseau horaire** : colonne, et il faudrait l'appliquer à tous les formatages de date.
- 🟠 **Notifications vendeur** : e-mail, résumé quotidien, push, offres. Envois d'e-mails et préférences en base.
- 🟠 **Langue espagnole** proposée par le sélecteur du kit : une 4e langue à traduire.
- 🟠 **Intégrations** Shopify, Google Sheets, Webhook : le kit les marque lui-même « UI seule ».
- 🟠 **Canal de support / « Nous contacter »** : aussi « Contact » sur la landing et les CGU, et « Contacter le support » dans les docs. Aujourd'hui tout passe par la page de signalement.

## Page client (/p)
- ⛔ **Sélecteur de langue et logo DropLink en tête** : la page parle la langue du vendeur et vit hors de `[locale]`.
- ⛔ **Les gages** « Qualité 1:1 » (positionnement) et « Suivi en temps réel » / « Service client réactif » (contrainte 8).
- ⛔ **Abonnement du client aux notifications** : la page publique reste sans formulaire.
- ⛔ **Carte promo « Découvrir DropLink » et copyright DropLink** : décision 25, la page appartient au vendeur.

## Pages d'erreur
- ⛔ **Lien expiré 90 jours après livraison**, avec sa page distincte : le jeton est immuable, et une seule page couvre les 3 causes pour ne rien divulguer.

## Légal / Signalement, Docs, Blog
Rien ne manque. Signalement est complet. Côté légal, seule la section « Abonnement » des CGU est absente, et elle relève de la facturation (⛔, déjà comptée). Les phrases refusées de la doc décrivent des fonctions déjà listées ailleurs.

## Admin

**Vue d'ensemble, et ce qui vaut pour tous les écrans admin**
- ⛔ **« Dernières commandes » avec le client, et flux « Activité récente » nominatif** : présents sur tous les écrans admin. Données de tiers affichées à chaque ouverture.
- 🟠 **Notifications admin** : la cloche, et les réglages « nouveaux utilisateurs, erreurs système, rapport quotidien ».
- 🟢 **Recherche transverse Ctrl K** : commandes, comptes et boutiques, avec une ligne d'audit.
- 🟢 **Choix des colonnes** (bouton « Colonnes »).
- 🟠 **Sélection multiple (cases à cocher)** : aucune action groupée n'est définie.
- 🟢 **Variations vs période précédente sur les tuiles admin** : calculables sur les tables horodatées, comme le fait déjà Statistiques.
- 🟠 **Exports** des comptes, boutiques, commandes et du journal.

**Commandes**
- ⛔ **Colonne Client (pseudo et e-mail du client) et « Ouvrir la page client »** : migration 159, transfert de capacité.
- ⛔ **« Nouvelle commande »** : contrainte 3.
- 🟢 **Filtres par transporteur et par boutique** : migration des fonctions SQL.
- 🟠 **Statut « Annulée »** : nouveau statut métier.

**Comptes**
- ⛔ **« Inviter un utilisateur »** : décision 9.
- 🟠 **« Dernière activité » et notion d'inactif** (comptes et boutiques) : il faudrait tracer la dernière visite, donnée personnelle.
- 🟢 **Filtre par date** d'inscription (comptes) et de création (boutiques) : migration.

**Fiche compte et Surveillance**
Rien ne manque : le kit correspond au produit.

**Boutiques**
- ⛔ **« Ajouter une boutique »** : une boutique par compte, et décision 9.
- 🟠 **Tuile « Liens clients actifs »** : il faut définir « actif » et écrire l'agrégat.

**Statistiques**
- 🟢 **Sélecteur 3 / 6 mois du comparatif** : migration, il faut 12 mois de données.
- 🟢 **« Voir tout » des transporteurs** : la liste complète.

**Journal**
- 🟠 **Journal technique** : niveaux, erreurs, avertissements, temps de réponse, « événements critiques » (connexions suspectes, erreurs API, dépôts refusés, limites atteintes).
- 🟠 **IP et détails techniques de chaque entrée** : donnée personnelle.
- 🟢 **Filtre par acteur (« Par qui »)**.
- 🟢 **Courbe d'activité du journal**.

**Paramètres (7 sous-onglets)**
- 🟠 **Informations de l'application** : nom, description, URL, e-mail de contact, logo.
- 🟠 **Réglages régionaux par défaut**.
- 🟠 **Mode maintenance** : chaque surface devrait le lire.
- 🟠 **Plafond de stockage par compte et durée de conservation réglables**.
- ⛔ **Zone dangereuse** : vider le journal (il est en ajout seul), réinitialiser la plateforme (décision 9).
- 🟠 **Statut des services, ressources, uptime, requêtes/min** : instrumentation à créer.
- 🟠 **Sauvegardes** : elles sont gérées par Supabase.
- 🟢 **Informations système** : version lue à l'exécution, pas écrite en dur.
- ⛔ **Identifiants SMTP à l'écran** : les secrets ne passent jamais par cet écran.
- 🟠 **Onglet Emails** : modèles, expéditeur, statistiques d'envoi.
- 🟠 **2FA obligatoire pour les administrateurs** : aujourd'hui exigée seulement si activée. Wassim risque de se bloquer lui-même.
- 🟠 **Durée de session, déconnexion automatique, interrupteurs des moyens de connexion** : ces réglages vivent chez Supabase.
- ⛔ **Connexion GitHub** : décision 27.
- ⛔ **Politique de mot de passe** par composition ou expiration : contredit le plancher de 12 caractères.
- 🟠 **Onglet Sécurité** : sessions de la plateforme, journal de sécurité, tentatives, activités suspectes, score.
- 🟠 **Gestion des administrateurs**.
- 🟠 **Onglet Intégrations** : API et clés, webhooks, Zapier/Make, Slack, Drive, import Shopify, AliExpress, Taobao. Attention au positionnement.
- 🟠 **Onglet Apparence** : thème sombre, couleurs, CSS personnalisé.
- 🟠 **Actions système** : vider le cache, redémarrer, optimiser la base, générer un rapport.

**Abonnements, Paiements, Support**
- ⛔ **Écran Abonnements** : avec l'onglet et les plans, les tuiles, colonnes, filtres et anneaux « plan » partout.
- ⛔ **Écran Paiements**.
- 🟠 **Support** : système de tickets, avec tables, e-mails et données personnelles.

## Incohérences à remonter
- **Raisons périmées dans `out/manquants-par-ecran.txt`** : « aucun nom de vendeur » (inscription, tableau de bord) est faux, `nom_affiche` existe et sert au « Bonjour ». Et l'affirmation sur les incidents transporteur est contredite par `normalize.ts`.
- **Promesses sans fonction sur la landing** (`src/app/[locale]/page.tsx`, lignes 198 et 201) : « votre client est notifié en temps réel » et « Multi-plateformes : fonctionne avec Vinted, eBay, Shopify… ». Cela heurte la contrainte 8.
- **Pro affiché d'un côté, retiré de l'autre** : l'encart « Passez au Pro / Upgrade » de la barre latérale existe (décision du 12/09, lien vers `/docs#plans`), alors que la carte Pro du tableau de bord est refusée. Les deux écrans ne suivent pas la même règle.
