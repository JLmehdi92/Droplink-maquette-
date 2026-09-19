import { getFormatter, getTranslations } from "next-intl/server";
import { decrireSilence } from "@/lib/tracking/silence";
import type {
  CompteursEnvois,
  Etat,
  EvolutionEnvois,
  PageEnvois,
  ParametresEnvois,
} from "@/lib/envois/liste";
import { ETATS, TRIS } from "@/lib/envois/liste";
import {
  AlertCircle,
  ArrowUpDown,
  ChevronDown,
  CircleCheck,
  Info,
  ExternalLink,
  MoreHorizontal,
  Package,
  PackageOpen,
  Search,
  Truck,
} from "lucide-react";
import { DETAILS_OUTIL_DS, PANNEAU_OUTIL_DS } from "@/components/panneau-outil";
import { TuileMetrique, type TeinteTuile } from "@/components/app/tuile-metrique";
import { FriseCompacte } from "@/components/commandes/frise-suivi";
import { LienEcran } from "@/components/lien-ecran";
import { lireTransporteur, monogramme } from "@/lib/tracking/transporteurs";

/**
 * L'ÉCRAN DES ENVOIS, porté sur `Envois` et `EnvoisMobile`.
 *
 * TABLEAU DENSE AU BUREAU, LISTE DE CARTES AU TÉLÉPHONE — et c'est la largeur
 * qui décide, pas le contenu. Six colonnes dans 390 px se lisent à la loupe ou
 * se font défiler latéralement ; la carte reprend les mêmes six informations en
 * trois lignes, dans l'ordre où on les cherche.
 *
 * RENDU ENTIÈREMENT CÔTÉ SERVEUR, filtres et pagination en LIENS. Zéro octet de
 * bundle, et l'écran fonctionne sans JavaScript. Un fournisseur qui consulte ses
 * envois depuis un téléphone bas de gamme sur un réseau lent n'a pas à attendre
 * qu'un composant s'hydrate pour voir où en sont ses colis.
 *
 * ⚠️ LE TRANSPORTEUR EST AFFICHÉ DEPUIS LE 12/09/2026, ET CE PARAGRAPHE DISAIT
 * LE CONTRAIRE PENDANT DES SEMAINES. Il affirmait : « nous n'avons aucune table
 * de correspondance vers un nom lisible ». C'était vrai — le code est un
 * identifiant numérique du fournisseur de suivi, « 3011 », « 100003 » — mais ce
 * n'était pas une fatalité : la correspondance est PUBLIÉE par le fournisseur,
 * et elle vit désormais dans `lib/tracking/transporteurs.json`, 3 502 entrées
 * figées dans le dépôt. *Une affirmation d'impossibilité que personne n'a
 * exécutée n'est pas une impossibilité.*
 *
 * Ce qui reste vrai : un code que le catalogue ne connaît pas ne produit RIEN.
 * Ni « 3011 », ni « Transporteur inconnu » — une information absente est omise,
 * jamais remplacée, la même règle que sur la page publique.
 *
 * ⚠️ « RESYNCHRONISER » N'EST TOUJOURS PAS PORTÉ, ET CE PARAGRAPHE A ÉTÉ REPRIS
 * LE 12/09/2026 PARCE QU'IL ÉTAIT DEVENU À MOITIÉ FAUX. Il disait « le produit
 * n'a aucun bouton » ; l'en-tête en porte un depuis, « Actualiser », et il ne
 * fait PAS ce que ce paragraphe interdit — voir `en-tete-envois.tsx`, qui
 * rejoue le rendu serveur sans toucher au fournisseur de suivi.
 *
 * Ce qui reste vrai, et qui est la vraie raison : déclencher une interrogation
 * depuis un bouton reviendrait à dépenser le palier de 200 prises en charge À
 * VIE au rythme des clics d'un vendeur impatient, et à court-circuiter la
 * cadence de `lib/tracking`, qui existe pour les espacer selon l'âge du colis.
 * Un bouton qui ne fait rien serait un mensonge d'interface ; un bouton qui
 * coûte à chaque clic sans limite de débit serait pire.
 */

/** Construit un lien de filtre en conservant les autres paramètres. */
function lien(base: string, actuels: ParametresEnvois, modif: Record<string, string | null>): string {
  const p = new URLSearchParams();

  if (actuels.tri !== "immobiles") p.set("tri", actuels.tri);
  if (actuels.etat !== null) p.set("etat", actuels.etat);
  // ⚠️ LA RECHERCHE ET LE TRANSPORTEUR VOYAGENT AVEC LES AUTRES FILTRES. Sans
  // eux, cliquer « En transit » effacerait le numero cherche — en silence, et
  // le vendeur conclurait que sa recherche n a rien donne.
  if (actuels.q !== null) p.set("q", actuels.q);
  if (actuels.transporteur !== null) p.set("transporteur", String(actuels.transporteur));
  if (actuels.silencieux) p.set("silencieux", "oui");
  if (actuels.abandonnes !== null) p.set("abandonnes", actuels.abandonnes ? "oui" : "non");

  for (const [cle, valeur] of Object.entries(modif)) {
    if (valeur === null) p.delete(cle);
    else p.set(cle, valeur);
  }

  // LE CURSEUR EST TOUJOURS RETIRÉ QUAND UN FILTRE CHANGE. Le garder ferait
  // reprendre la nouvelle liste au milieu de l'ancienne : le vendeur cliquerait
  // « sans mouvement » et tomberait sur une page vide en concluant qu'il n'en a
  // aucun.
  if (!("curseur" in modif)) p.delete("curseur");

  const q = p.toString();
  return q === "" ? base : base + "?" + q;
}

const CARTE =
  "rounded-ds-card-lg border border-ds-filet bg-ds-surface-carte p-4 shadow-ds-card lg:p-5";

/**
 * LA PEAU DE CHAQUE ÉTAT, relevée sur les planches.
 *
 * `expedie` n'y figure pas : les maquettes ne montrent que quatre situations.
 * Il prend la peau du transit, parce qu'il décrit la même chose du point de vue
 * du vendeur — le colis est parti. Lui inventer une cinquième couleur aurait
 * ajouté un code à retenir sans ajouter une information.
 */
const PEAU: Readonly<Record<Etat, { fond: string; encre: string; pastille: string }>> = {
  preparation: { fond: "bg-ds-surface-creux", encre: "text-ds-texte-corps", pastille: "bg-ds-texte-tenu" },
  expedie: { fond: "bg-ds-info-fond", encre: "text-ds-info", pastille: "bg-ds-info" },
  en_transit: { fond: "bg-ds-info-fond", encre: "text-ds-info", pastille: "bg-ds-info" },
  livre: { fond: "bg-ds-succes-fond", encre: "text-ds-succes-encre", pastille: "bg-ds-succes" },
};

/* AMBRE, PAS ROUGE : un colis immobile n'est pas une erreur, c'est une attente
   qu'il faut relancer. Même arbitrage que la pastille « sans mouvement » de
   l'écran Commandes. */
const ALERTE = {
  fond: "bg-ds-alerte-fond",
  encre: "text-ds-alerte-encre",
  pastille: "bg-ds-alerte",
} as const;

function Puce({
  fond,
  encre,
  pastille,
  children,
}: {
  readonly fond: string;
  readonly encre: string;
  readonly pastille: string;
  readonly children: React.ReactNode;
}) {
  return (
    <span
      className={
        // `Badge` du design system, AUX VALEURS DE CET ÉCRAN-CI : `ShippingView`
        // pose explicitement `fontSize: 12, padding: "7px 12px"` sur le sien,
        // plus grand que le `5px 11px` du composant nu. Mesuré sur la page
        // servie : 30 px de haut, pas 26. Le même composant n'a pas les mêmes
        // valeurs partout — c'est le troisième piège de la méthode, et il vaut
        // aussi pour le remplissage, pas seulement pour les libellés.
        // ⚠️ `tracking-[-0.02em]` : le kit resserre ses pastilles de statut, relevé
        // -0,24 px sur 12. Le même oubli avait été trouvé sur `/commandes`,
        // où la valeur écrite était -0,01em. C'est le genre de détail qu'on ne
        // voit jamais à l'œil et qui décale la largeur de chaque pastille.
        // ⚠️ `whitespace-nowrap`, ET IL MANQUAIT ICI. `BadgeStatut` le porte
        // depuis longtemps, avec un commentaire qui cite littéralement le cas :
        // « Sans mouvement · 14 j se replierait en deux lignes dans une
        // pilule ». C'est cette pastille-ci qui rend ce texte, et elle ne l'avait
        // jamais reçu : vu à la capture le 17/09/2026, replié sur TROIS lignes
        // avec un « j » seul sur la dernière. Le correctif était resté dans le
        // champ de vision de son premier cas — L-025.
        "inline-flex shrink-0 items-center gap-1.5 rounded-ds-pill px-3 py-[7px] text-[12px] font-bold tracking-[-0.02em] whitespace-nowrap " +
        fond +
        " " +
        encre
      }
    >
      <span className={"h-1.5 w-1.5 shrink-0 rounded-ds-pill " + pastille} />
      {children}
    </span>
  );
}

export async function TableauEnvois({
  base,
  parametres,
  page,
  compteurs,
  evolution,
  maintenant,
}: {
  readonly base: string;
  readonly parametres: ParametresEnvois;
  readonly page: PageEnvois;
  readonly compteurs: CompteursEnvois;
  readonly evolution: EvolutionEnvois;
  readonly maintenant: Date;
}) {
  const t = await getTranslations("envois");
  const format = await getFormatter();

  const aUnFiltre =
    parametres.etat !== null ||
    parametres.silencieux ||
    parametres.abandonnes !== null ||
    parametres.transporteur !== null ||
    parametres.q !== null;

  /*
   * ⚠️ LES COLONNES S'ÉCARTENT, ALORS QUE LA PLANCHE N'ÉCARTE RIEN.
   *
   * Son `.td` porte `padding: 15px 0` — aucune marge horizontale — et cela tient
   * parce que ses cinq lignes d'exemple sont courtes. Mesuré à 1 024 px sur de
   * vraies données : « COMMANDES LIÉESÉTAT » et « DERNIER MOUVEMENTDERNIER
   * POINT » se touchaient, exactement comme « CLIENTRÉFÉRENCESTATUT » sur la
   * liste des commandes. La dernière colonne ne prend rien : elle est alignée à
   * droite, sur le bord de la carte.
   */
  /* En-tête de colonne du design system : 12 px, demi-gras, sourdine, SANS
     capitales — les majuscules y sont réservées aux eyebrows de marketing, et
     11 px passait sous le plancher de la règle 5. */
  /*
   * LES BANDES PORTENT LEUR MARGE DE 20 px, comme sur l écran des commandes : le
   * filet de séparation doit aller d un bord à l autre de la carte, ce qu une
   * marge posée sur le conteneur du tableau lui interdit.
   */
  /*
   * ⚠️ LES TROIS VALEURS DU KIT, MESURÉES, ET NON CELLES QU'ON AVAIT DÉDUITES.
   *
   *   en-tête   remplissage `16px 20px`, libellé 12 / 600, hauteur de ligne 18
   *   rangée    remplissage `14px 20px`, écart 14, texte 14
   *
   * L'en-tête rendait `pb-3` (12) et une hauteur de ligne de 16 : deux pixels
   * par libellé, et toute la grille du tableau décalée d'autant. La rangée
   * rendait `py-[15px]` et un écart de 16 au lieu de 14 — sur huit colonnes,
   * seize pixels de dérive cumulée jusqu'au bord droit.
   */
  // ⚠️ LES EN-TÊTES NE RESTENT SUR UNE LIGNE QU'À `2xl`. Les colonnes sont en
  // pourcentage de la planche (1 675 px) : à 1 280 et 1 440, « Dernière mise à
  // jour » débordait de ses ~83 px et recouvrait « Prochaine étape » (balayage
  // du 18/09/2026). Plus étroit, le libellé passe à la ligne dans sa colonne.
  const enTete =
    "pt-4 pb-4 pr-[14px] text-left align-bottom text-[12px] font-semibold text-ds-texte-sourdine 2xl:whitespace-nowrap";
  const cellule = "border-t border-ds-filet py-[14px] pr-[14px] text-[14px]";
  const bordGauche = " pl-5";
  const bordDroit = " pr-5";

  /**
   * Tout ce qu'une ligne dit de son colis, calculé UNE FOIS et servi aux deux
   * mises en page. Le tableau et les cartes montrent la même chose ; deux
   * calculs divergeraient au premier ajustement.
   */
  const decrire = (ligne: PageEnvois["lignes"][number]) => {
    const silence = decrireSilence(
      ligne.dernierMouvement === null ? null : new Date(ligne.dernierMouvement),
      maintenant,
      ligne.etat,
    );
    const silencieux = silence.etat === "silencieux";

    const anciennete =
      silence.etat === "aucun-mouvement"
        ? null
        : silencieux
          ? // AU-DELÀ DE DIX JOURS, LE RELATIF CESSE D'AIDER. « il y a 14 jours »
            // se relit moins bien qu'une date, et c'est justement le colis sur
            // lequel le vendeur va devoir écrire au transporteur.
            format.dateTime(new Date(ligne.dernierMouvement as string), {
              day: "numeric",
              month: "long",
            })
          : silence.jours === 0
            ? t("mouvement.aujourdhui")
            : silence.jours === 1
              ? t("mouvement.hier")
              : t("mouvement.jours", { n: silence.jours });

    return {
      silence,
      silencieux,
      anciennete,
      // Deux noms puis « +N ». Le compte reste celui des commandes rattachées,
      // pas celui des noms : une commande sans destinataire nommé existe quand
      // même.
      // ⚠️ LE RESTE SE COMPTE DEPUIS LES NOMS AFFICHÉS, PAS DEPUIS DEUX.
      // `clients` est filtré des destinataires sans nom, `commandes` ne l'est
      // pas : soustraire 2 sous-comptait dès qu'une commande rattachée n'avait
      // pas de nom. Deux commandes dont une nommée rendaient « Léa » tout court,
      // et il en manquait une — sur la colonne qui existe précisément pour le
      // colis groupé à destinataires partiellement nommés.
      clients:
        ligne.clients.length === 0
          ? null
          : ligne.clients.slice(0, 2).join(", ") +
            (ligne.commandes > Math.min(ligne.clients.length, 2)
              ? " +" + String(ligne.commandes - Math.min(ligne.clients.length, 2))
              : ""),
      /*
       * ⚠️ LA PASTILLE NE PORTE PLUS LE NOMBRE DE JOURS, ET C'EST UNE CORRECTION
       * VUE À LA CAPTURE, PAS À LA MESURE. « Sans mouvement · 14 j » demande
       * ~175 px ; sa colonne en offre 129. Le texte se repliait donc sur TROIS
       * lignes avec un « j » seul sur la dernière, et lui interdire de se replier
       * l'a fait DÉBORDER par-dessus la colonne voisine — pire que le défaut
       * d'origine. Ni la soustraction (qui compare des textes) ni le contrôle de
       * débordement (le document, lui, ne débordait pas) ne pouvaient le voir.
       *
       * Les jours ne sont pas perdus : ils passent dans « Prochaine étape », qui
       * était VIDE pour ces lignes-là — c'est exactement ce que le kit fait de sa
       * ligne en problème, où il écrit « Colis en attente (voir détails) ».
       */
      puce: silencieux ? (
        <Puce {...ALERTE}>{t("puce.silence")}</Puce>
      ) : (
        <Puce {...PEAU[ligne.etat]}>{t(`etat.${ligne.etat}`)}</Puce>
      ),

      // LE TRANSPORTEUR, traduit depuis le catalogue officiel du fournisseur de
      // suivi. `null` quand le code est absent ou inconnu : on n'écrit rien.
      transporteur: (() => {
        const c = lireTransporteur(ligne.transporteur);
        return c === null ? null : { nom: c.nom, monogramme: monogramme(c.nom) };
      })(),

      /*
       * LA PROCHAINE ÉTAPE, telle que le transporteur l'annonce.
       *
       * ⚠️ TROIS CAS, ET LE TROISIÈME EST LE PLUS IMPORTANT : quand rien n'est
       * annoncé, la cellule reste VIDE. Le kit écrit une phrase sur chacune de
       * ses huit lignes parce que ses données sont inventées ; nous n'écrivons
       * que ce que le transporteur a dit.
       *
       * ⚠️ ET LA PRÉVISION DISPARAÎT QUAND LE COLIS EST SILENCIEUX. C'est la
       * règle de `lib/tracking/silence` : au-delà de dix jours sans mouvement,
       * une date d'arrivée annoncée il y a deux semaines n'est plus une
       * prévision, c'est un souvenir — et l'afficher ferait attendre le vendeur
       * pour rien. Le défaut avait été vu par Wassim sur une vraie page le
       * 05/09 ; il n'est pas réintroduit ici.
       */
      /*
       * LES GESTES DE LA LIGNE. Une commande rattachée se rouvre, un
       * transporteur se consulte. Rien d'autre n'est VRAI : « resynchroniser »
       * coûterait une interrogation facturée, et « supprimer » n'existe pas sur
       * un colis — il appartient aux commandes qui le portent.
       */
      actions: (() => {
        const liste: { href: string; libelle: string; externe: boolean }[] = [];
        for (const c of ligne.commandesLiees.slice(0, 3)) {
          liste.push({
            href: `${base.replace(/\/envois$/, "/commandes")}/${c.id}`,
            libelle: t("actions.voirCommande", { reference: c.reference }),
            externe: false,
          });
        }
        const site = lireTransporteur(ligne.transporteur)?.site ?? null;
        if (site !== null) {
          liste.push({ href: site, libelle: t("actions.siteTransporteur"), externe: true });
        }
        return liste;
      })(),

      prochaine: (() => {
        /*
         * ⚠️ UNE SEULE COLONNE POUR LE TEXTE DU TRANSPORTEUR, COMME LE KIT — et
         * il y a eu DEUX colonnes pendant un tour de mesure.
         *
         * Le kit écrit « Arrivée en France », « Colis livré », « Livraison
         * prévue aujourd'hui » dans SA colonne « Prochaine étape » : c'est
         * tantôt un point de passage, tantôt une prévision. Nous avions séparé
         * les deux — « Dernier point » et « Prochaine étape » — ce qui faisait
         * ONZE colonnes contre dix, et le résultat s'est vu à la mesure : les
         * en-têtes « Dernière mise à jour » et « Dernier point » se touchaient,
         * et « DHL Express » était tronqué en « DHL Expr… ».
         *
         * La colonne dit donc, dans l'ordre de ce qui est le plus utile : ce qui
         * VA arriver quand le transporteur l'annonce, ce qu'il a DIT en dernier
         * sinon.
         */
        if (ligne.etat === "livre") return t("prochaine.livre");
        /*
         * ⚠️ POUR UN COLIS SILENCIEUX, LA COLONNE DIT LE SILENCE, PAS LE DERNIER
         * POINT. Elle rendait `dernierPoint` — souvent vide dans ce cas, et de
         * toute façon vieux de deux semaines par définition. Le fait utile, le
         * seul qui change tous les jours tant que le colis ne bouge pas, c'est
         * la DURÉE du silence : c'est elle qui décide si le vendeur écrit au
         * transporteur. Elle vivait dans la pastille, où elle ne tenait pas.
         */
        if (silencieux) return t("prochaine.silence", { n: silence.jours });
        const du = ligne.arriveeDu === null ? null : new Date(ligne.arriveeDu);
        const au = ligne.arriveeAu === null ? null : new Date(ligne.arriveeAu);
        const borne = au ?? du;
        if (borne === null || Number.isNaN(borne.getTime())) return ligne.dernierPoint;
        // AU JOUR, PAS À LA SECONDE : le transporteur annonce une journée, et
        // comparer des instants ferait basculer « aujourd'hui » à midi.
        const jour = (x: Date) => Date.UTC(x.getFullYear(), x.getMonth(), x.getDate());
        const ecart = Math.round((jour(borne) - jour(maintenant)) / 86_400_000);
        if (ecart === 0) return t("prochaine.aujourdhui");
        if (ecart < 0) return ligne.dernierPoint;
        return t("prochaine.le", {
          date: format.dateTime(borne, { day: "numeric", month: "short" }),
        });
      })(),
    };
  };


  /**
   * LA BARRE D'OUTILS DE L'ÉCRAN — pilules d'état à gauche, tri à droite.
   *
   * ⚠️ ELLE ÉTAIT UNE CARTE GRISE À DEUX RANGÉES, avec « ÉTAT » et « TRIER PAR »
   * écrits en petites majuscules. Elle coupait l'écran en deux, et au téléphone
   * la seconde rangée était TRONQUÉE — mesuré à 390 px : « Mis à jour réc… ».
   * La planche `Envois` a été RÉÉCRITE le 29/08/2026 pour dire ce que l'écran
   * fait vraiment, dans le vocabulaire que le canevas avait déjà : une rangée de
   * pilules DANS la carte du tableau, exactement comme `Commandes`.
   *
   * LES ÉTIQUETTES ONT DISPARU parce que les pilules se lisent seules : une
   * rangée d'états n'a pas besoin qu'on annonce que ce sont des états. Le tri,
   * lui, se nomme dans son propre bouton.
   */
  /*
   * LA BARRE DE FILTRES DU KIT — un menu par critere, pas une rangee de pilules.
   *
   * `ShippingView` pose un champ de recherche et trois menus deroulants
   * (« Tous les statuts », « Tous les transporteurs », « Tous les pays »), puis
   * le tri a droite. `/commandes` filtre par pilules, et c est le MEME design
   * system : deux ecrans, deux motifs. C est l ecran en cours qui fait foi, pas
   * son voisin.
   *
   * ⚠️ LA MECANIQUE RESTE `<details>` + LIENS. Le kit emploie des `<select>`
   * dont le `onChange` navigue ; cet ecran est rendu entierement cote serveur et
   * fonctionne SANS JavaScript. On reprend l apparence, pas la dependance : un
   * fournisseur qui consulte ses colis depuis un telephone bas de gamme sur un
   * reseau lent n a pas a attendre qu un composant s hydrate pour filtrer.
   *
   * ⚠️ ET LE MENU FAIT 46 px DE HAUT ICI, 42 SUR `/commandes`. Mesure sur les
   * deux pages servies : le meme composant n a pas les memes valeurs partout —
   * troisieme piege de la methode. `MENU_ENVOIS` est donc local a cet ecran, et
   * ne touche pas `PILULE_OUTIL_DS`, que `/commandes` mesure a zero ecart.
   *
   * ⚠️ « TOUS LES PAYS » N EST PAS REPRIS : aucune colonne ne porte le pays de
   * destination. Un menu a une seule option serait un contrôle qui ne commande
   * rien.
   */
  const MENU_ENVOIS =
    "flex min-h-11 w-full cursor-pointer list-none items-center gap-2.5 rounded-ds-card border lg:w-fit " +
    "border-ds-filet bg-ds-surface-carte px-[14px] text-[14px] font-medium whitespace-nowrap " +
    "text-ds-texte-fort shadow-ds-xs transition-colors hover:bg-ds-surface-teinte " +
    "lg:h-[46px] lg:min-h-0";

  /** Une option de menu : lien, etat courant, meme dessin partout. */
  const optionMenu = (actif: boolean) =>
    "flex min-h-11 items-center rounded-ds-sm px-3 text-[13px] transition-colors lg:min-h-0 lg:py-2 " +
    (actif
      ? "bg-ds-surface-teinte font-bold text-ds-accent-encre"
      : "font-medium text-ds-texte-corps hover:bg-ds-ink-50");

  /*
   * LE LIBELLE DU MENU DE STATUT DIT CE QUI EST FILTRE, comme le kit : « Tous
   * les statuts » au repos, le statut choisi sinon. Un menu qui affiche toujours
   * le meme mot oblige a l ouvrir pour savoir ou l on en est.
   */
  const libelleStatut = parametres.silencieux
    ? t("filtres.silencieux")
    : parametres.abandonnes === true
      ? t("abandonne")
      : parametres.etat === null
      ? t("filtres.tousStatuts")
      : t(`etat.${parametres.etat}`);

  const transporteursVus = [
    ...new Map(
      page.lignes
        .map((l) => lireTransporteur(l.transporteur))
        .filter((c): c is NonNullable<typeof c> => c !== null)
        .map((c) => [c.nom, c] as const),
    ).values(),
  ].sort((a, b) => a.nom.localeCompare(b.nom));

  /*
   * ⚠️ AU TÉLÉPHONE LA BARRE NE DÉFILE PLUS, depuis le 15/09/2026. Elle glissait
   * sous le pouce, le filtre suivant coupé au bord (« Tous les stat… ») : un
   * filtre caché hors de l'écran ne se découvre pas. La recherche prend sa
   * rangée, les menus viennent deux par deux, leurs libellés tronqués.
   * Planche `ShippingView`, `.ship-filters` sous 760 px.
   *
   * ⚠️ ET ELLE NE TIENT SUR UNE LIGNE QU'À PARTIR DE `2xl`. En `lg`, la
   * recherche et quatre menus débordaient la colonne : le document défilait de
   * côté, 281 px à 1 024 et 25 à 1 280 (balayage du 18/09/2026). Entre les
   * deux, la barre se replie ; la planche, mesurée à 1 675, ne change pas.
   */
  const MOITIE = " min-w-0 basis-[calc(50%-5px)] lg:basis-auto";
  const barreOutils = (
    <div className="flex flex-wrap items-center gap-2.5 lg:mb-4 lg:gap-3.5 2xl:flex-nowrap">
      {/*
        LE CHAMP DE RECHERCHE, premier element de la barre du kit — 310 px de
        large, 46 de haut, une loupe de 17 a gauche.

        ⚠️ UN `<form method="get">`, PAS UN CHAMP QUI NAVIGUE A CHAQUE FRAPPE.
        Le kit filtre a la volee parce que ses huit lignes vivent en memoire ;
        ici chaque frappe serait une requete. Le formulaire soumet a l entree,
        l ecran reste rendu cote serveur, et il fonctionne SANS JavaScript.

        ⚠️ ET LES AUTRES FILTRES VOYAGENT EN CHAMPS CACHES. Un formulaire GET
        REMPLACE la chaine de requete : sans eux, chercher un numero effacerait
        le statut et le tri choisis, en silence.
      */}
      <form method="get" action={base} className="contents">
        {parametres.etat === null ? null : (
          <input type="hidden" name="etat" value={parametres.etat} />
        )}
        {!parametres.silencieux ? null : <input type="hidden" name="silencieux" value="oui" />}
        {parametres.abandonnes === null ? null : (
          <input type="hidden" name="abandonnes" value={parametres.abandonnes ? "oui" : "non"} />
        )}
        {parametres.tri === "immobiles" ? null : (
          <input type="hidden" name="tri" value={parametres.tri} />
        )}
        {parametres.transporteur === null ? null : (
          <input type="hidden" name="transporteur" value={String(parametres.transporteur)} />
        )}
        {/*
          ⚠️ UN `<label>` ET NON UN `<span>`, ET C'EST LA CIBLE TACTILE. L'input
          nu fait 21 px de haut ; c'est son enveloppe qui en fait 44. Tant
          qu'elle était un `<span>`, le doigt n'avait que 21 px utiles — et la
          sonde l'a vu au téléphone, dans les trois langues. Enveloppé d'un
          `<label>`, le champ prend le focus depuis n'importe quel point de la
          boîte, loupe comprise : la cible EST la boîte.
        */}
        <label
          className={
            "flex min-h-11 shrink-0 basis-full cursor-text items-center gap-[11px] rounded-ds-card border border-ds-filet lg:basis-auto " +
            "bg-ds-surface-carte px-4 shadow-ds-xs lg:h-[46px] lg:min-h-0 lg:w-[310px]"
          }
        >
          <Search aria-hidden="true" size={17} strokeWidth={1.8} className="shrink-0 text-ds-texte-sourdine" />
          <input
            type="search"
            name="q"
            defaultValue={parametres.q ?? ""}
            placeholder={t("filtres.rechercher")}
            aria-label={t("filtres.rechercher")}
            className="min-w-0 flex-1 bg-transparent text-[14px] text-ds-texte-fort outline-none placeholder:text-ds-texte-corps"
          />
        </label>
      </form>

      {/* ------------------------------------------------ LE STATUT */}
      <details className={DETAILS_OUTIL_DS + MOITIE + " lg:open:relative"}>
        <summary className={MENU_ENVOIS + " lg:min-w-[190px]"}>
          <span className="min-w-0 flex-1 truncate">{libelleStatut}</span>
          <ChevronDown aria-hidden="true" size={16} strokeWidth={1.8} className="text-ds-texte-tenu" />
        </summary>
        <ul className={PANNEAU_OUTIL_DS + " flex flex-col gap-0.5 lg:w-[232px] lg:max-w-none lg:p-1.5"}>
          <li>
            <LienEcran
              href={lien(base, parametres, { etat: null, silencieux: null, abandonnes: null })}
              aria-current={
                parametres.etat === null && !parametres.silencieux && parametres.abandonnes === null
                  ? "true"
                  : undefined
              }
              className={optionMenu(
                parametres.etat === null && !parametres.silencieux && parametres.abandonnes === null,
              )}
            >
              {t("filtres.tousStatuts")}
            </LienEcran>
          </li>
          {ETATS.map((etat: Etat) => (
            <li key={etat}>
              <LienEcran
                href={lien(base, parametres, { etat, silencieux: null, abandonnes: null })}
                aria-current={parametres.etat === etat ? "true" : undefined}
                className={optionMenu(parametres.etat === etat)}
              >
                {t(`etat.${etat}`)}
              </LienEcran>
            </li>
          ))}
          {/* LE SILENCE RESTE DISTINCT, ET AMBRE : c est le seul filtre qui
              appelle un geste. Il etait une pilule a part ; il est desormais la
              derniere entree du menu, peinte comme elle. */}
          <li>
            <LienEcran
              href={lien(base, parametres, { silencieux: "oui", etat: null, abandonnes: null })}
              aria-current={parametres.silencieux ? "true" : undefined}
              className={
                "flex min-h-11 items-center rounded-ds-sm px-3 text-[13px] transition-colors lg:min-h-0 lg:py-2 " +
                (parametres.silencieux
                  ? "bg-ds-alerte-fond font-bold text-ds-alerte-encre"
                  : "font-medium text-ds-alerte-encre hover:bg-ds-alerte-fond")
              }
            >
              {t("filtres.silencieux")}
            </LienEcran>
          </li>
          {/*
            ⚠️ LE SUIVI ARRÊTÉ N'AVAIT PLUS D'ENTRÉE depuis le portage de l'écran
            (28/08) : la liste savait le filtrer (`abandonnes=oui`), le compteur
            le comptait, et aucun geste ne posait le filtre. Ce sont pourtant
            les colis dont personne ne dira plus rien — un numéro non reconnu
            se répare en précisant son transporteur dans la fiche.
          */}
          <li>
            <LienEcran
              href={lien(base, parametres, { abandonnes: "oui", etat: null, silencieux: null })}
              aria-current={parametres.abandonnes === true ? "true" : undefined}
              className={optionMenu(parametres.abandonnes === true)}
            >
              {t("abandonne")}
            </LienEcran>
          </li>
        </ul>
      </details>

      {/* ------------------------------------------ LE TRANSPORTEUR */}
      {transporteursVus.length === 0 ? null : (
        <details className={DETAILS_OUTIL_DS + MOITIE + " lg:open:relative"}>
          <summary className={MENU_ENVOIS + " lg:min-w-[215px]"}>
            <span className="min-w-0 flex-1 truncate">
              {parametres.transporteur === null
                ? t("filtres.tousTransporteurs")
                : (lireTransporteur(parametres.transporteur)?.nom ?? t("filtres.tousTransporteurs"))}
            </span>
            <ChevronDown aria-hidden="true" size={16} strokeWidth={1.8} className="text-ds-texte-tenu" />
          </summary>
          <ul className={PANNEAU_OUTIL_DS + " flex flex-col gap-0.5 lg:w-[232px] lg:max-w-none lg:p-1.5"}>
            <li>
              <LienEcran
                href={lien(base, parametres, { transporteur: null })}
                aria-current={parametres.transporteur === null ? "true" : undefined}
                className={optionMenu(parametres.transporteur === null)}
              >
                {t("filtres.tousTransporteurs")}
              </LienEcran>
            </li>
            {transporteursVus.map((c) => {
              const code = page.lignes.find(
                (l) => lireTransporteur(l.transporteur)?.nom === c.nom,
              )?.transporteur;
              return code === null || code === undefined ? null : (
                <li key={c.nom}>
                  <LienEcran
                    href={lien(base, parametres, { transporteur: String(code) })}
                    aria-current={parametres.transporteur === code ? "true" : undefined}
                    className={optionMenu(parametres.transporteur === code)}
                  >
                    {c.nom}
                  </LienEcran>
                </li>
              );
            })}
          </ul>
        </details>
      )}

      <span className="hidden flex-grow lg:block" />

      {/*
        LE TRI EST UN MENU, PAS UNE RANGÉE. Trois tris posés à plat coûtaient une
        seconde rangée sur l'écran ; repliés, ils tiennent dans un bouton qui dit
        déjà lequel est actif. `<details>` : zéro JavaScript, et Échap ferme.
      */}
      {/*
        ⚠️ CE MENU ÉTAIT INJOIGNABLE AU TÉLÉPHONE, et rien ne le disait. Il était
        `absolute` DANS la bande qui défile — et **un conteneur qui rogne en X
        rogne aussi en Y** : mesuré à 390 px, il s'ouvrait à y 242 pour 150 px de
        haut alors que sa bande s'arrête à 238. Cent pour cent hors du cadre,
        aucune erreur, aucune trace. La géométrie vit maintenant dans
        `PANNEAU_OUTIL_DS`, avec `Commandes` : feuille du bas au téléphone, panneau
        ancré au bureau.

        ⚠️ LE TRI PREND TOUTE LA LARGEUR QUAND IL EST SEUL SUR SA RANGÉE (15/09/2026) : en moitié,
        « Ce qui ne bouge plus » se lisait « Ce qui ne b… », à côté d une moitié vide.
      */}
      <details className={DETAILS_OUTIL_DS + (transporteursVus.length === 0 ? MOITIE : " min-w-0 basis-full lg:basis-auto") + " lg:open:relative"}>
        <summary className={MENU_ENVOIS + " lg:min-w-[160px]"}>
          <ArrowUpDown aria-hidden="true" size={16} strokeWidth={1.8} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate">{t(`tri.${parametres.tri}`)}</span>
          <ChevronDown aria-hidden="true" size={16} strokeWidth={1.8} className="text-ds-texte-tenu" />
        </summary>
        <ul className={PANNEAU_OUTIL_DS + " flex flex-col gap-0.5 lg:w-[232px] lg:max-w-none lg:p-1.5"}>
          {TRIS.map((tri) => (
            <li key={tri}>
              <LienEcran
                href={lien(base, parametres, { tri: tri === "immobiles" ? "" : tri })}
                aria-current={parametres.tri === tri ? "true" : undefined}
                className={optionMenu(parametres.tri === tri)}
              >
                {t(`tri.${tri}`)}
              </LienEcran>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );

  return (
    <div className="flex flex-col gap-2.5 lg:gap-5">
      {/*
        LES QUATRE COMPTEURS DE TÊTE. Ils portent leur VALEUR, jamais un
        jugement : « 4 sans mouvement depuis plus de dix jours », pas « des colis
        sont en retard ». Un chiffre se vérifie, une appréciation se discute.

        LE TROISIÈME EST EN ALERTE, les autres non — c'est le seul qui appelle un
        geste. Peindre les quatre reviendrait à n'en peindre aucun.

        DEUX AU TÉLÉPHONE, QUATRE AU BUREAU : la planche `EnvoisMobile` ne garde
        que « En transit » et « Sans mouvement ». Le total est déjà sous le titre
        et « livrés ce mois » ne se regarde pas depuis un téléphone.
      */}
      {/*
        ⚠️ CINQ TUILES, PAS QUATRE — le kit en pose cinq, et il avait raison de
        les compter ainsi : quatre états de frise plus l'alerte.

        Les siennes sont « Tous les envois · En transit · En livraison · Livrés ·
        Problèmes ». Deux ne peuvent pas être reprises telles quelles :

          « En livraison »  n'est pas une étape de NOTRE frise. La décision 4 du
                            brief la verrouille à quatre — préparation, expédié,
                            en transit, livré — et la granularité fine vit dans
                            le détail du suivi, pas dans la frise. La tuile prend
                            donc « Pas encore scanné », l'étape que le kit
                            n'affiche pas et qui est celle où le vendeur a
                            quelque chose à faire : vérifier qu'il a collé le bon
                            numéro.
          « Problèmes »     supposerait que le transporteur déclare un incident.
                            Il ne le fait pas : ce que nous savons, c'est qu'un
                            colis ne bouge plus. « Sans mouvement » est la même
                            information sans le jugement — et c'est déjà le
                            vocabulaire de l'écran.
      */}
      <section
        aria-label={t("compteurs.titre")}
        className="grid grid-cols-2 gap-3 min-[1424px]:grid-cols-5 md:gap-4"
      >
        {(
          [
            {
              cle: "total",
              valeur: compteurs.total,
              filtre: {},
              Icone: Package,
              teinte: "marque",
              alerte: false,
              mobile: false,
              /*
               * LE BADGE D'ÉVOLUTION DU KIT, « +12 % ce mois-ci » — ET IL N'EST
               * POSÉ QUE SUR CETTE TUILE-CI.
               *
               * Les colis PRIS EN CHARGE sont un flux : ce mois se compare au
               * même intervalle du mois précédent. Les trois tuiles suivantes
               * sont des ÉTATS INSTANTANÉS, et un état ne se compare à aucune
               * période — « +12 % de colis en transit » ne voudrait rien dire.
               * Le kit peut en poser cinq parce que ses chiffres sont inventés.
               *
               * ⚠️ ET IL DISPARAÎT QUAND LE MOIS PRÉCÉDENT EST VIDE : passer de
               * 0 à 5 n'est pas « +500 % », c'est un premier mois.
               */
              evolution: evolution.pris,
            },
            {
              cle: "preparation",
              valeur: compteurs.preparation,
              filtre: { etat: "preparation" },
              Icone: PackageOpen,
              teinte: "neutre",
              alerte: false,
              mobile: false,
              evolution: null,
            },
            {
              cle: "enTransit",
              valeur: compteurs.enTransit,
              filtre: { etat: "en_transit" },
              Icone: Truck,
              teinte: "info",
              alerte: false,
              mobile: true,
              evolution: null,
            },
            {
              cle: "silencieux",
              valeur: compteurs.silencieux,
              filtre: { silencieux: "oui" },
              Icone: AlertCircle,
              teinte: "alerte",
              alerte: true,
              mobile: true,
              evolution: null,
            },
            {
              cle: "livresCeMois",
              valeur: compteurs.livresCeMois,
              filtre: { etat: "livre" },
              Icone: CircleCheck,
              teinte: "succes",
              alerte: false,
              mobile: false,
              evolution: null,
            },
          ] as const
        ).map((c) => (
          <LienEcran
            key={c.cle}
            href={lien(base, parametres, {
              etat: null,
              silencieux: null,
              abandonnes: null,
              ...c.filtre,
            })}
            className={"group block h-full" + (c.mobile ? "" : " hidden lg:block")}
          >
            <TuileMetrique
              Icone={c.Icone}
              valeur={format.number(c.valeur)}
              libelle={t(`compteurs.${c.cle}`)}
              teinte={c.teinte satisfies TeinteTuile}
              valeurEnAlerte={c.alerte && c.valeur > 0}
              {...(c.evolution === null
                ? {}
                : {
                    dessous: {
                      texte:
                        (c.evolution > 0 ? "+" : "") +
                        format.number(c.evolution) +
                        " % " +
                        t("compteurs.ceMois"),
                      /* Vert à la hausse, rouge à la baisse — les deux teintes
                         du kit. Un volume qui monte est une bonne nouvelle pour
                         un vendeur ; c'est le seul endroit de l'écran où la
                         couleur porte un jugement, et il est mérité. */
                      classe: c.evolution >= 0 ? "text-ds-succes-encre" : "text-ds-erreur-encre",
                    },
                  })}
            />
          </LienEcran>
        ))}
      </section>


      {page.lignes.length === 0 ? (
        /* DEUX ÉTATS VIDES DISTINCTS. « Ce compte n'a rien » et « ce filtre ne
           rend rien » sont deux situations différentes : afficher « collez votre
           premier numéro de suivi » à un vendeur qui en a neuf mille est une
           perte de confiance immédiate. */
        <>
        {barreOutils}
        <div className={CARTE + " px-5 py-10 text-center"}>
          <p className="text-[14px] leading-5 text-ds-texte-corps">
            {aUnFiltre ? t("vide.filtre") : t("vide.compte")}
          </p>
          {aUnFiltre ? (
            <LienEcran
              href={base}
              className="mt-3 inline-flex min-h-11 items-center text-[14px] font-semibold text-ds-texte-lien underline underline-offset-2 hover:text-ds-texte-lien-survol"
            >
              {t("vide.effacer")}
            </LienEcran>
          ) : null}
        </div>
        </>
      ) : (
        <>
          {/*
            ⚠️ LA BARRE D OUTILS EST AU-DESSUS DE LA CARTE, PAS DEDANS. Le kit
            pose sa rangée de filtres entre les tuiles et la carte du tableau,
            et garde la carte pour les seules données. C est aussi ce qui permet
            à la même rangée de servir les DEUX mises en page — tableau au bureau,
            cartes au téléphone — au lieu d être écrite deux fois.
          */}
          {barreOutils}

          {/* --- LE TABLEAU, à partir de `lg` ---------------------------- */}
          {/*
            ⚠️ UN `<form method="get">` AUTOUR DU TABLEAU, ET LA BARRE DE LOT NE
            PARAÎT QUE SI QUELQUE CHOSE EST COCHÉ — en CSS, par
            `group-has-[input:checked]`, sans une ligne de JavaScript. C'est la
            mécanique déjà employée sur `/commandes`, reprise plutôt que
            réinventée.

            En GET parce qu'un export est une LECTURE : la sélection part dans
            l'URL, le navigateur télécharge, et rien n'est modifié. Un POST
            aurait exigé une garde CSRF pour une opération qui n'écrit rien.
          */}
          <form
            method="get"
            action="/api/envois/export"
            className={"group hidden xl:block " + CARTE + " xl:p-0"}
          >
            <div className="hidden flex-wrap items-center gap-3 border-b border-ds-filet px-5 py-3 group-has-[input:checked]:flex">
              <span className="text-[12px] text-ds-texte-corps">{t("lot.aide")}</span>
              <button
                type="submit"
                className="flex min-h-11 items-center rounded-ds-pill bg-ds-accent px-4 text-[13px] font-semibold text-ds-texte-sur-marque transition-colors hover:bg-ds-accent-survol lg:h-[36px] lg:min-h-0"
              >
                {t("lot.exporter")}
              </button>
            </div>
            {/*
              ⚠️ `table-fixed` : SANS LUI, LES `<col>` NE SONT QUE DES
              SUGGESTIONS. C'est le défaut qui a coûté le plus cher sur
              `/commandes` — le `colgroup` y était posé, servi, juste, et sans
              aucun effet, le navigateur dimensionnant par le contenu. Ce
              tableau-ci n'avait même pas de `colgroup` : ses colonnes tombaient
              où le texte les poussait.
            */}
            <table className="w-full table-fixed border-collapse">
              {/*
                LES DIX COLONNES, AUX PIXELS DES BOÎTES DE CONTENU DU KIT.

                Mesurées sur la référence SERVIE, ses dix colonnes rendent 38,
                174, 116, 139, 145, 128, 116, 122, 145 et 56 px de contenu, à
                l'écart de 14 dans une rangée de 1345 au remplissage `14px 20px`.

                ⚠️ LA CASE À COCHER A D'ABORD ÉTÉ ÉCARTÉE, PUIS POSÉE — ET LE
                RAISONNEMENT QUI L'ÉCARTAIT ÉTAIT FAUX SUR UN POINT.

                Une case à cocher est la PROMESSE d'une action groupée. Trois
                candidates existaient, et deux restent mauvaises :

                  · « resynchroniser » dépenserait le palier de 200 prises en
                    charge À VIE au rythme des clics, et court-circuiterait la
                    cadence de `lib/tracking` qui existe pour les espacer ;
                  · « archiver » ne veut rien dire sur un colis — ce sont les
                    COMMANDES qui s'archivent, et un colis en porte plusieurs.

                La troisième, « exporter », avait été refusée au motif qu'elle
                « ouvrirait une seconde surface de sortie de données ». C'était
                inexact : ce qui rend l'export des COMMANDES sensible, ce sont les
                `public_token` qu'il contient — des capacités, immuables à vie.
                Un export de COLIS porte un numéro de suivi que le transporteur
                et le client connaissent déjà, un nom de transporteur et des
                dates. Il est donc MOINS exposant que celui qui existe, pas plus.

                La case commande donc l'export de la sélection, et la barre
                n'apparaît que lorsqu'une case est cochée — en CSS, par
                `:has(:checked)`, sans une ligne de JavaScript.

                ⚠️ DIX `<col>` POUR DIX `<th>`. Il y en a eu neuf pendant un tour
                de mesure, et le résultat ne s'est pas vu à la lecture du code :
                la dernière colonne, privée de largeur, a poussé le tableau
                HORS de la carte — « Interrogatio » coupé au bord, les compteurs
                dans le vide, et `debordement: true` sur toute la page. Un
                `colgroup` trop court ne proteste pas ; il laisse déborder.

                ⚠️ « TRANSPORTEUR » ET « PROCHAINE ÉTAPE » ÉTAIENT DÉCLARÉES
                IMPOSSIBLES, ET ELLES NE L'ÉTAIENT PAS. La première attendait un
                catalogue de codes — il est publié par le fournisseur de suivi et
                vit désormais dans `lib/tracking/transporteurs.json` ; la seconde
                attendait une prévision d'arrivée — `estimated_from` et
                `estimated_to` existent depuis la migration 029 et sont déjà
                alimentées. Deux affirmations que personne n'avait exécutées.

                Les 38 px libérés sont redistribués AU PRORATA des colonnes qui
                restent, pas donnés à la plus large : le kit a réglé l'importance
                relative de ses colonnes, et c'est elle qu'on conserve.

                ⚠️ SAUF LA DERNIÈRE, QUI EST DIMENSIONNÉE PAR SON LIBELLÉ.
                « Interrogations » mesure 81,58 px en Inter 12/600 — mesuré au
                canvas, pas estimé — là où le kit loge « Actions » dans 56. Lui
                donner la proportion du kit faisait CHEVAUCHER les deux derniers
                en-têtes : la capture rendait « Prochaine étapeInterrogatio », et
                les compteurs sortaient de la carte. Un `<col>` en pourcentage ne
                proteste pas quand son contenu ne rentre pas : il le laisse
                déborder. Sa colonne porte donc 82 + 20 de marge, et les 26 px de
                plus sont repris au prorata sur les huit autres.

                Un `<table>` n'a pas de `gap` : l'écart de 14 est le
                `padding-right` de chaque cellule et les 20 px de marge sont
                portés par la première et la dernière. Chaque largeur vaut donc
                « contenu redistribué + 14 », les deux extrêmes « + 20 ».
                Somme : 1345, exactement la largeur de la carte.
              */}
              <colgroup>
                <col className="w-[5.370%]" />
                <col className="w-[14.072%]" />
                <col className="w-[9.728%]" />
                <col className="w-[11.450%]" />
                <col className="w-[11.900%]" />
                <col className="w-[10.627%]" />
                <col className="w-[9.728%]" />
                <col className="w-[10.177%]" />
                <col className="w-[11.900%]" />
                <col className="w-[5.048%]" />
              </colgroup>
              <thead>
                <tr>
                  {/* LES LIBELLÉS SONT CEUX DU KIT, ET C'EST LUI QUI FAIT FOI :
                      « Suivi » et non « Numéro », « Statut » et non « État »,
                      « Dernière mise à jour » et non « Dernier mouvement ». Trois
                      mots que rien n'obligeait à inventer — le design system
                      fournit son vocabulaire dans les trois langues. */}
                  {/*
                    LA COLONNE DE SÉLECTION, 38 px, comme le kit. Son en-tête ne
                    porte pas de case « tout cocher » : sans JavaScript elle ne
                    pourrait rien cocher, et une case inerte en tête de tableau
                    est le plus visible des mensonges d'interface. Le libellé y
                    est, pour les lecteurs d'écran.
                  */}
                  <th scope="col" className={enTete + bordGauche}>
                    <span className="sr-only">{t("lot.titre")}</span>
                  </th>
                  <th scope="col" className={enTete}>
                    <span className="block leading-[18px]">{t("colonnes.numero")}</span>
                  </th>
                  <th scope="col" className={enTete}>
                    <span className="block leading-[18px]">{t("colonnes.commande")}</span>
                  </th>
                  <th scope="col" className={enTete}>
                    <span className="block leading-[18px]">{t("colonnes.client")}</span>
                  </th>
                  <th scope="col" className={enTete}>
                    <span className="block leading-[18px]">{t("colonnes.transporteur")}</span>
                  </th>
                  <th scope="col" className={enTete}>
                    <span className="block leading-[18px]">{t("colonnes.etat")}</span>
                  </th>
                  {/* LA PROGRESSION, comme sur la référence : la frise se BALAIE
                      là où la pastille se LIT. Sur une colonne de quarante colis,
                      c est ce qui permet de voir d un coup ce qui avance. */}
                  <th scope="col" className={enTete}>
                    <span className="block leading-[18px]">{t("colonnes.progression")}</span>
                  </th>
                  <th scope="col" className={enTete}>
                    <span className="block leading-[18px]">{t("colonnes.mouvement")}</span>
                  </th>
                  <th scope="col" className={enTete}>
                    <span className="block leading-[18px]">{t("colonnes.prochaine")}</span>
                  </th>
                  <th scope="col" className={enTete + bordDroit + " text-center"}>
                    <span className="block leading-[18px]">{t("colonnes.actions")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {page.lignes.map((ligne) => {
                  const d = decrire(ligne);
                  return (
                    <tr
                      key={ligne.id}
                      className={
                        d.silencieux ? "bg-ds-alerte-fond" : "transition-colors hover:bg-ds-ink-50"
                      }
                    >
                      <td className={cellule + bordGauche}>
                        <input
                          type="checkbox"
                          name="selection"
                          value={ligne.id}
                          aria-label={t("lot.selectionner", { numero: ligne.numero })}
                          className="h-[18px] w-[18px] cursor-pointer rounded-ds-xs border border-ds-filet-appuye accent-ds-accent outline-offset-2"
                        />
                      </td>
                      <td className={cellule + " font-mono text-[13px] font-semibold text-ds-texte-fort"}>
                        {ligne.numero}
                        {ligne.abandonneLe !== null ? (
                          /* ON DIT QUE NOUS AVONS CESSÉ D'INTERROGER, pas que le
                             colis est perdu. La différence compte : l'un est un
                             fait sur nous, l'autre une affirmation sur le colis
                             que nous ne pouvons pas soutenir. */
                          <span className="ml-2 rounded-ds-pill bg-ds-surface-creux px-2 py-0.5 text-[12px] font-bold text-ds-texte-corps">
                            {t("abandonne")}
                          </span>
                        ) : null}
                      </td>
                      {/*
                        LA COMMANDE, PUIS LE CLIENT — deux colonnes, comme le
                        kit, et non plus une seule qui mélangeait les deux.

                        Elle affichait le destinataire sous l'en-tête
                        « Commandes liées », avec un repli sur « 2 commandes »
                        quand aucun nom n'était saisi. Un colis groupé y
                        perdait donc la seule chose qui permet de le retrouver :
                        SA commande. La référence est dérivée de l'identifiant
                        (jamais stockée), et au-delà de deux on compte le reste
                        plutôt que d'étirer la colonne.
                      */}
                      <td className={cellule + " text-ds-texte-fort"}>
                        {ligne.references.length === 0 ? (
                          <span className="text-ds-texte-tenu">—</span>
                        ) : (
                          <span className="block truncate font-medium">
                            {ligne.references.slice(0, 2).join(", ")}
                            {ligne.references.length > 2 ? (
                              <span className="text-ds-texte-sourdine">
                                {" +" + String(ligne.references.length - 2)}
                              </span>
                            ) : null}
                          </span>
                        )}
                      </td>
                      <td className={cellule + " text-ds-texte-fort"}>
                        {d.clients ?? (
                          <span className="text-ds-texte-sourdine">
                            {t("commandesRattachees", { n: ligne.commandes })}
                          </span>
                        )}
                      </td>

                      {/*
                        LE TRANSPORTEUR, avec son monogramme — le kit pose une
                        tuile de 32 px portant deux ou trois initiales, puis le
                        nom.

                        ⚠️ RIEN N'EST RENDU QUAND LE CODE EST INCONNU. 17TRACK
                        ajoute des transporteurs ; un code absent du catalogue
                        figé ne doit pas produire « Transporteur inconnu » sur la
                        ligne. *Une information absente est OMISE, jamais
                        remplacée par un texte de remplacement.*
                      */}
                      <td className={cellule}>
                        {d.transporteur === null ? null : (
                          <span className="flex min-w-0 items-center gap-[11px]">
                            <span
                              className={
                                "inline-flex h-8 w-8 flex-none items-center justify-center rounded-ds-sm text-[11px] font-extrabold tracking-[-0.02em] " +
                                (d.transporteur.monogramme.fond === null
                                  ? "bg-ds-surface-creux text-ds-texte-corps"
                                  : "")
                              }
                              style={
                                d.transporteur.monogramme.fond === null
                                  ? undefined
                                  : {
                                      background: d.transporteur.monogramme.fond,
                                      color: d.transporteur.monogramme.encre ?? undefined,
                                    }
                              }
                            >
                              {d.transporteur.monogramme.court}
                            </span>
                            <span className="truncate font-medium text-ds-texte-fort">
                              {d.transporteur.nom}
                            </span>
                          </span>
                        )}
                      </td>
                      <td className={cellule}>{d.puce}</td>

                      <td className={cellule}>
                        <FriseCompacte statut={ligne.etat} etiquette={t(`etat.${ligne.etat}`)} />
                      </td>

                      {/* LA DERNIÈRE MISE À JOUR SUR DEUX LIGNES, comme le kit : la
                          date au-dessus, l ancienneté dessous. Le kit met l heure ;
                          ici l âge est plus utile — c est la seule chose de l écran
                          qui change tous les jours quand le colis ne bouge pas. */}
                      <td className={cellule + " whitespace-nowrap"}>
                        {ligne.dernierMouvement === null ? (
                          <span className="text-ds-texte-tenu">—</span>
                        ) : (
                          /* ⚠️ `leading-[normal]`, PAS `leading-normal` : le
                             second est une valeur de l'échelle Tailwind qui vaut
                             1,5, c'est-à-dire exactement ce qu'on cherchait à
                             corriger. Le kit laisse `line-height: normal` sur ces
                             deux lignes, et la date rendait 19,5 px au lieu de
                             17. */
                          <span className="flex flex-col leading-[normal]">
                            <span className="text-[13px] leading-[normal] text-ds-texte-corps">
                              {format.dateTime(new Date(ligne.dernierMouvement), {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })}
                            </span>
                            <span
                              className={
                                "text-[12px] leading-[normal] " +
                                (d.silencieux ? "font-bold text-ds-alerte-encre" : "text-ds-texte-sourdine")
                              }
                            >
                              {d.anciennete ?? ""}
                            </span>
                          </span>
                        )}
                      </td>

                      {/*
                        LA PROCHAINE ÉTAPE. Le kit la peint en rouge quand le
                        colis a un problème ; ici c'est l'ambre du silence qui
                        joue ce rôle, et elle est déjà portée par la pastille de
                        statut et par le fond de la ligne. La peindre une
                        troisième fois n'ajouterait rien.
                      */}
                      <td className={cellule}>
                        {/* Le kit rend ce texte dans un `<span>` d'une grille ;
                            sans enveloppe, on comparerait sa boîte de texte à
                            notre cellule et à son remplissage — 18 px contre 71.
                            Même correction que pour les en-têtes de colonne. */}
                        <span className="block text-[13px] leading-[1.4] text-ds-texte-corps">
                          {d.prochaine}
                        </span>
                      </td>


                      {/*
                        LA COLONNE « ACTIONS » DU KIT — un menu par ligne.

                        ⚠️ DEUX GESTES SEULEMENT, ET LES DEUX SONT VRAIS. Le kit
                        dessine trois points sans dire ce qu'ils ouvrent ; un
                        menu qui n'ouvre rien serait un mensonge d'interface, et
                        une colonne vide un aveu. Les deux entrées mènent quelque
                        part : la commande rattachée, et le site du transporteur.

                        ⚠️ AUCUNE ACTION QUI COÛTE. « Resynchroniser » aurait été
                        l'entrée évidente : elle est écartée, parce qu'une
                        interrogation se paie sur un palier de 200 prises en
                        charge À VIE et que la cadence de `lib/tracking` existe
                        pour les espacer. Un menu ne doit pas contourner une
                        règle que le produit s'impose ailleurs.

                        Rendu par un `<details>`, comme les filtres : zéro
                        JavaScript, Échap ferme.
                      */}
                      <td className={cellule + bordDroit + " text-center"}>
                        {d.actions.length === 0 ? null : (
                          <details className={DETAILS_OUTIL_DS + " lg:open:relative"}>
                            <summary
                              aria-label={t("colonnes.actions")}
                              className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-ds-sm text-ds-texte-tenu transition-colors hover:bg-ds-ink-50 hover:text-ds-texte-corps"
                            >
                              <MoreHorizontal aria-hidden="true" size={20} strokeWidth={1.9} />
                            </summary>
                            <ul
                              className={
                                PANNEAU_OUTIL_DS +
                                " right-0 left-auto flex flex-col gap-0.5 lg:w-[248px] lg:max-w-none lg:p-1.5"
                              }
                            >
                              {d.actions.map((action) => (
                                <li key={action.href}>
                                  {action.externe ? (
                                    <a
                                      href={action.href}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={optionMenu(false) + " justify-between"}
                                    >
                                      {action.libelle}
                                      <ExternalLink aria-hidden="true" size={13} className="text-ds-texte-tenu" />
                                    </a>
                                  ) : (
                                    <LienEcran href={action.href} className={optionMenu(false)}>
                                      {action.libelle}
                                    </LienEcran>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <BandeauAide texte={t("aide")} />
          </form>

          {/* --- LES CARTES, en dessous de `lg` -------------------------- */}
          <ul className="flex flex-col gap-2.5 xl:hidden">
            {page.lignes.map((ligne) => {
              const d = decrire(ligne);
              return (
                <li
                  key={ligne.id}
                  className={
                    "rounded-ds-card border p-4 " +
                    (d.silencieux
                      ? "border-transparent bg-ds-alerte-fond"
                      : "border-ds-filet bg-ds-surface-carte shadow-ds-xs")
                  }
                >
                  <div className="mb-[9px] flex items-center justify-between gap-2.5">
                    <span className="truncate font-mono text-[13px] font-semibold text-ds-texte-fort">
                      {ligne.numero}
                    </span>
                    {d.puce}
                  </div>
                  {/*
                    ⚠️ LA MÊME PHRASE QUE LA COLONNE « PROCHAINE ÉTAPE » DU
                    BUREAU, ET ELLE NE L'ÉTAIT PAS. La carte rendait
                    `dernierPoint` pendant que le tableau rendait `prochaine` :
                    deux phrases différentes pour la même ligne selon la largeur
                    de l'écran. Vu à la capture le 17/09/2026 — un colis
                    silencieux annonçait « Sans mouvement depuis 14 jours » au
                    bureau et « Pas encore d'information du transporteur » au
                    téléphone, ce qui est FAUX : le transporteur a parlé, il y a
                    quatorze jours. Un même fait, un même calcul.
                  */}
                  <p
                    className={
                      "mb-[3px] text-[14px] leading-5 " +
                      (d.prochaine === null ? "text-ds-texte-sourdine" : "text-ds-texte-fort")
                    }
                  >
                    {d.prochaine ?? t("mouvement.aucun")}
                  </p>
                  {/* LES TROIS FAITS SECONDAIRES SUR UNE SEULE LIGNE, séparés par
                      des points médians : c'est ce que fait la planche, et cela
                      évite trois libellés pour trois valeurs courtes. */}
                  <p className="text-[12px] text-ds-texte-sourdine">
                    {[
                      // LE COMPTE PREND LE RELAIS DES NOMS, comme dans le
                      // tableau : une commande sans destinataire nommé existe,
                      // et la carte ne doit pas la faire disparaître.
                      d.clients ?? t("commandesRattachees", { n: ligne.commandes }),
                      d.anciennete,
                      t("interrogationsFaites", { n: ligne.interrogations }),
                      ligne.abandonneLe !== null ? t("abandonne") : null,
                    ]
                      .filter((v): v is string => v !== null)
                      .join(" · ")}
                  </p>
                </li>
              );
            })}

            <li>
              <BandeauAide texte={t("aideCourte")} encadre />
            </li>
          </ul>
        </>
      )}

      {/*
        LE COMPTEUR DE PAGE, comme le kit — « Affichage de 1 à 8 sur 156 envois ».

        ⚠️ SANS SES NUMÉROS DE PAGE, ET C'EST UNE CONTRAINTE, PAS UN OUBLI. Le kit
        aligne vingt pastilles numérotées ; la pagination du produit est PAR
        CURSEUR, parce qu'à la page 40 d'un jeu de 9 600 un `offset` lit 2 000
        lignes pour en rendre 50. Un curseur ne sait pas sauter à la page 17 :
        poser les numéros exigerait de revenir au décalage, donc de dégrader
        précisément celui qui a le plus de données.

        Le COMPTEUR, lui, ne coûte rien — le total est déjà lu pour les tuiles —
        et c'est la moitié utile du bloc : elle dit où l'on en est.
      */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 pb-1">
        <span className="text-[13px] leading-[normal] text-ds-texte-corps">
          {t("compteurPage", {
            de: page.lignes.length === 0 ? 0 : 1,
            a: page.lignes.length,
            total: compteurs.total,
          })}
        </span>

        {page.curseurSuivant !== null ? (
          <LienEcran
            href={lien(base, parametres, { curseur: page.curseurSuivant })}
            className="inline-flex min-h-11 items-center rounded-ds-card border border-ds-filet bg-ds-surface-carte px-6 text-[13px] font-medium text-ds-texte-corps shadow-ds-xs transition-colors hover:bg-ds-surface-teinte lg:h-9 lg:min-h-0"
          >
            {t("pageSuivante")}
          </LienEcran>
        ) : null}
      </div>
    </div>
  );
}

/**
 * LE BANDEAU D'AIDE, EN PIED DE LISTE.
 *
 * Il existe pour une seule phrase, et cette phrase évite un message au support :
 * un numéro tout juste collé n'est pas encore scanné, et l'écran affiche alors
 * « Pas encore d'information du transporteur ». Sans explication, cette ligne se
 * lit comme une panne du suivi — décision 7 du brief, dans sa forme la plus
 * concrète.
 */
function BandeauAide({ texte, encadre = false }: { readonly texte: string; readonly encadre?: boolean }) {
  return (
    <div
      className={
        "mt-4 flex items-start gap-2.5 rounded-ds-card px-3.5 py-3 lg:mt-[18px] " +
        (encadre
          ? "mt-0 border border-ds-filet bg-ds-surface-carte"
          : "bg-ds-surface-creux")
      }
    >
      {/* L'icône dessinée à la main devient celle de Lucide : le design system
          impose son jeu, et un cercle redessiné diverge dès qu'on touche au
          trait. */}
      <Info aria-hidden="true" size={16} strokeWidth={1.8} className="mt-px shrink-0 text-ds-texte-tenu" />
      <span className="text-[13px] leading-[18px] text-ds-texte-corps">
        {texte}
      </span>
    </div>
  );
}
