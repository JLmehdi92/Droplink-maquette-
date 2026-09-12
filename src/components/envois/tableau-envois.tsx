import { getFormatter, getTranslations } from "next-intl/server";
import { decrireSilence } from "@/lib/tracking/silence";
import type { CompteursEnvois, Etat, PageEnvois, ParametresEnvois } from "@/lib/envois/liste";
import { ETATS, TRIS } from "@/lib/envois/liste";
import {
  AlertCircle,
  ArrowUpDown,
  ChevronDown,
  CircleCheck,
  Info,
  Package,
  PackageOpen,
  Truck,
} from "lucide-react";
import { DETAILS_OUTIL_DS, PANNEAU_OUTIL_DS, PILULE_OUTIL_DS } from "@/components/panneau-outil";
import { TuileMetrique, type TeinteTuile } from "@/components/app/tuile-metrique";
import { FriseCompacte } from "@/components/commandes/frise-suivi";
import { LienEcran } from "@/components/lien-ecran";

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
 * LE CODE TRANSPORTEUR N'EST PAS AFFICHÉ. C'est un identifiant numérique du
 * fournisseur de suivi, et nous n'avons aucune table de correspondance vers un
 * nom lisible. Afficher « 3011 » n'apprendrait rien à personne ; inventer un
 * libellé serait pire. Une information qu'on ne sait pas rendre lisible est
 * omise — la même règle que sur la page publique.
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
  livre: { fond: "bg-ds-succes-fond", encre: "text-ds-succes", pastille: "bg-ds-succes" },
};

/* AMBRE, PAS ROUGE : un colis immobile n'est pas une erreur, c'est une attente
   qu'il faut relancer. Même arbitrage que la pastille « sans mouvement » de
   l'écran Commandes. */
const ALERTE = {
  fond: "bg-ds-alerte-fond",
  encre: "text-ds-alerte",
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
        "inline-flex shrink-0 items-center gap-1.5 rounded-ds-pill px-3 py-[7px] text-[12px] font-bold tracking-[-0.02em] " +
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
  maintenant,
}: {
  readonly base: string;
  readonly parametres: ParametresEnvois;
  readonly page: PageEnvois;
  readonly compteurs: CompteursEnvois;
  readonly maintenant: Date;
}) {
  const t = await getTranslations("envois");
  const format = await getFormatter();

  const aUnFiltre =
    parametres.etat !== null || parametres.silencieux || parametres.abandonnes !== null;

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
  const enTete =
    "pt-4 pb-4 pr-[14px] text-left text-[12px] font-semibold whitespace-nowrap text-ds-texte-sourdine";
  const cellule = "border-t border-ds-filet py-[14px] pr-[14px] text-[14px]";
  const bordGauche = " pl-5";
  const bordDroit = " pr-5";

  /**
   * LA PILULE DE VUE, celle du canevas : bordée, noire quand elle est active.
   *
   * ⚠️ ELLE ÉTAIT VIOLETTE SANS BORDURE, et elle ne l'est nulle part ailleurs.
   * La planche pose `background: #111117` ET `border: 1px solid #111117` sur
   * l'active, blanc bordé `#e6e6ec` sur les autres — c'est ce que rend déjà
   * `PilulesFiltres` sur Commandes. Deux écrans voisins qui dessinent
   * différemment le même contrôle apprennent au vendeur qu'ils sont deux
   * produits.
   *
   * 44 px au doigt, 34 px à la souris : la planche téléphone écrit
   * `min-height: 44px` là où la planche bureau écrit `height: 34px`.
   */
  /*
   * `FilterTabs` du design system : 36 px, `padding: 0 16px`, rayon pilule,
   * 13 px gras. L'active prend la SURFACE INVERSE — l'encre, pas l'accent — avec
   * son ombre ; les autres restent des cartes bordées.
   *
   * ⚠️ L'ÉCRAN COMMANDES EMPLOIE DES ONGLETS SOULIGNÉS ET CELUI-CI DES PILULES,
   * ET CE N'EST PAS UNE INCOHÉRENCE : le kit dessine l'un avec `UnderlineTabs`
   * DANS la carte du tableau, l'autre avec une rangée de filtres AU-DESSUS. Les
   * deux idiomes existent chez lui, chacun à sa place.
   */
  const pilule = (actif: boolean): string =>
    "flex min-h-11 shrink-0 items-center rounded-ds-pill border px-4 text-[13px] font-bold whitespace-nowrap transition-colors lg:h-9 lg:min-h-0 " +
    (actif
      ? "border-transparent bg-ds-surface-inverse text-ds-texte-sur-marque shadow-ds-sm"
      : "border-ds-filet bg-ds-surface-carte text-ds-texte-corps hover:bg-ds-surface-teinte");

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
      puce: silencieux ? (
        <Puce {...ALERTE}>{t("puce.silence", { n: silence.jours })}</Puce>
      ) : (
        <Puce {...PEAU[ligne.etat]}>{t(`etat.${ligne.etat}`)}</Puce>
      ),
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
  const barreOutils = (
    <div className="defilement-discret -mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-0.5 lg:mx-0 lg:mb-4 lg:overflow-visible lg:px-0 lg:pb-0">
      <LienEcran
        href={lien(base, parametres, { etat: null, silencieux: null })}
        aria-current={parametres.etat === null && !parametres.silencieux ? "true" : undefined}
        className={pilule(parametres.etat === null && !parametres.silencieux)}
      >
        {t("filtres.tous")}
      </LienEcran>

      {ETATS.map((etat: Etat) => (
        <LienEcran
          key={etat}
          href={lien(base, parametres, { etat, silencieux: null })}
          aria-current={parametres.etat === etat ? "true" : undefined}
          className={pilule(parametres.etat === etat)}
        >
          {t(`etat.${etat}`)}
        </LienEcran>
      ))}

      {/* LE SILENCE EST UNE PILULE D'ALERTE, et c'est le seul filtre qui appelle
          un geste. Le peindre comme les autres l'aurait noyé ; peindre les
          autres comme lui n'aurait rien mis en avant. */}
      <LienEcran
        href={lien(base, parametres, { silencieux: parametres.silencieux ? null : "oui", etat: null })}
        aria-current={parametres.silencieux ? "true" : undefined}
        className={
          /*
            ⚠️ L'ACTIVE PREND L'ENCRE COMME LES AUTRES, PAS L'AMBRE PLEINE. Un
            aplat `--status-warning` porte du blanc à 2,6:1 — sous le plancher de
            4,5:1 que le produit s'impose partout ailleurs. L'emphase passe donc
            par le REPOS, qui reste ambré là où les autres pilules sont blanches.
          */
          "flex min-h-11 shrink-0 items-center rounded-ds-pill border px-4 text-[13px] font-bold whitespace-nowrap transition-colors lg:h-9 lg:min-h-0 " +
          (parametres.silencieux
            ? "border-transparent bg-ds-surface-inverse text-ds-texte-sur-marque shadow-ds-sm"
            : "border-transparent bg-ds-alerte-fond text-ds-alerte hover:bg-ds-amber-100")
        }
      >
        {t("filtres.silencieux")}
      </LienEcran>

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
        `PANNEAU_OUTIL`, avec `Commandes` : feuille du bas au téléphone, panneau
        ancré au bureau.
      */}
      <details className={DETAILS_OUTIL_DS + " lg:open:relative"}>
        <summary className={PILULE_OUTIL_DS}>
          <ArrowUpDown aria-hidden="true" size={16} strokeWidth={1.8} />
          {t(`tri.${parametres.tri}`)}
          <ChevronDown aria-hidden="true" size={15} strokeWidth={1.8} className="text-ds-texte-tenu" />
        </summary>
        <ul className={PANNEAU_OUTIL_DS + " flex flex-col gap-0.5 lg:w-[232px] lg:max-w-none lg:p-1.5"}>
          {TRIS.map((tri) => (
            <li key={tri}>
              <LienEcran
                href={lien(base, parametres, { tri: tri === "immobiles" ? "" : tri })}
                aria-current={parametres.tri === tri ? "true" : undefined}
                className={
                  "flex min-h-11 items-center rounded-ds-sm px-3 text-[13px] transition-colors lg:min-h-0 lg:py-2 " +
                  (parametres.tri === tri
                    ? "bg-ds-surface-teinte font-bold text-ds-accent-encre"
                    : "font-medium text-ds-texte-corps hover:bg-ds-ink-50")
                }
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
            },
            {
              cle: "preparation",
              valeur: compteurs.preparation,
              filtre: { etat: "preparation" },
              Icone: PackageOpen,
              teinte: "neutre",
              alerte: false,
              mobile: false,
            },
            {
              cle: "enTransit",
              valeur: compteurs.enTransit,
              filtre: { etat: "en_transit" },
              Icone: Truck,
              teinte: "info",
              alerte: false,
              mobile: true,
            },
            {
              cle: "silencieux",
              valeur: compteurs.silencieux,
              filtre: { silencieux: "oui" },
              Icone: AlertCircle,
              teinte: "alerte",
              alerte: true,
              mobile: true,
            },
            {
              cle: "livresCeMois",
              valeur: compteurs.livresCeMois,
              filtre: { etat: "livre" },
              Icone: CircleCheck,
              teinte: "succes",
              alerte: false,
              mobile: false,
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
          <div className={"hidden xl:block " + CARTE + " xl:p-0"}>
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
                LES HUIT COLONNES, AUX PIXELS DES BOÎTES DE CONTENU DU KIT.

                Mesurées sur la référence SERVIE, ses dix colonnes rendent 38,
                174, 116, 139, 145, 128, 116, 122, 145 et 56 px de contenu, à
                l'écart de 14 dans une rangée de 1345 au remplissage `14px 20px`.

                DEUX N'EXISTENT PAS CHEZ NOUS et ne sont donc pas reprises :
                  · la case à cocher (38) — il n'y a pas d'action groupée sur cet
                    écran, et une colonne de cases qui ne commandent rien est
                    pire qu'absente ;
                  · « Transporteur » (145) — `carrier_code` est l'identifiant
                    NUMÉRIQUE du fournisseur de suivi, pas un nom, et aucun
                    catalogue ne le traduit. Même arbitrage que sur `/commandes`,
                    écrit au même endroit : « 100003 » n'apprend rien, et
                    « Transporteur inconnu » sur chaque ligne vaut moins que rien.

                Les 183 px libérés sont redistribués AU PRORATA des colonnes qui
                restent, pas donnés à la plus large : le kit a réglé l'importance
                relative de ses colonnes, et c'est elle qu'on conserve.

                Un `<table>` n'a pas de `gap` : l'écart de 14 est le
                `padding-right` de chaque cellule et les 20 px de marge sont
                portés par la première et la dernière. Chaque largeur vaut donc
                « contenu redistribué + 14 », les deux extrêmes « + 20 ».
                Somme : 1345, exactement la largeur de la carte.
              */}
              <colgroup>
                <col className="w-[18.205%]" />
                <col className="w-[11.493%]" />
                <col className="w-[13.565%]" />
                <col className="w-[12.574%]" />
                <col className="w-[11.493%]" />
                <col className="w-[12.033%]" />
                <col className="w-[14.105%]" />
                <col className="w-[6.533%]" />
              </colgroup>
              <thead>
                <tr>
                  {/* LES LIBELLÉS SONT CEUX DU KIT, ET C'EST LUI QUI FAIT FOI :
                      « Suivi » et non « Numéro », « Statut » et non « État »,
                      « Dernière mise à jour » et non « Dernier mouvement ». Trois
                      mots que rien n'obligeait à inventer — le design system
                      fournit son vocabulaire dans les trois langues. */}
                  <th scope="col" className={enTete + bordGauche}>
                    <span className="block leading-[18px]">{t("colonnes.numero")}</span>
                  </th>
                  <th scope="col" className={enTete}>
                    <span className="block leading-[18px]">{t("colonnes.commande")}</span>
                  </th>
                  <th scope="col" className={enTete}>
                    <span className="block leading-[18px]">{t("colonnes.client")}</span>
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
                    <span className="block leading-[18px]">{t("colonnes.point")}</span>
                  </th>
                  <th scope="col" className={enTete + bordDroit + " text-right"}>
                    <span className="block leading-[18px]">{t("colonnes.interrogations")}</span>
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
                      <td className={cellule + bordGauche + " font-mono text-[13px] font-semibold text-ds-texte-fort"}>
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
                                (d.silencieux ? "font-bold text-ds-alerte" : "text-ds-texte-sourdine")
                              }
                            >
                              {d.anciennete ?? ""}
                            </span>
                          </span>
                        )}
                      </td>
                      <td
                        className={
                          cellule +
                          " " +
                          (ligne.dernierPoint === null ? "text-ds-texte-sourdine" : "text-ds-texte-fort")
                        }
                      >
                        {ligne.dernierPoint ?? t("mouvement.aucun")}
                      </td>
                      <td className={cellule + bordDroit + " text-right text-ds-texte-sourdine"}>
                        {format.number(ligne.interrogations)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <BandeauAide texte={t("aide")} />
          </div>

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
                  <p
                    className={
                      "mb-[3px] text-[14px] leading-5 " +
                      (ligne.dernierPoint === null ? "text-ds-texte-sourdine" : "text-ds-texte-fort")
                    }
                  >
                    {ligne.dernierPoint ?? t("mouvement.aucun")}
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
