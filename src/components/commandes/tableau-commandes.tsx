import Link from "next/link";
import { LienEcran } from "@/components/lien-ecran";
import { getFormatter, getTranslations } from "next-intl/server";
import { BoutonAction } from "@/components/bouton-action";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  MoreHorizontal,
  Plus,
  Search,
} from "lucide-react";
import { TraductionsClient } from "@/components/traductions-client";
import { ActionsLigne } from "./actions-ligne";
import { BadgeStatut, ICONE_SILENCE, iconeExpedition, teinteExpedition } from "./badge-statut";
import { FriseSuivi } from "./frise-suivi";
import { PilulesFiltres } from "./pilules-filtres";
import { PanneauFiltres } from "./panneau-filtres";
import { DETAILS_OUTIL_DS, PANNEAU_OUTIL_DS, PILULE_OUTIL_DS } from "@/components/panneau-outil";
import type {
  DiagnosticListeVide,
  LigneCommande,
  PageCommandes,
  ParametresListe,
} from "@/lib/commandes/liste";
import { decrireSilence } from "@/lib/tracking/silence";
import { lienListe, listeFiltree } from "@/lib/commandes/url";
import type { EtatLot } from "@/lib/commandes/lot";
import { creerBrouillon } from "@/lib/commandes/actions";
import { cheminGesteDeListe } from "@/lib/commandes/geste-liste";

/**
 * La liste des commandes, portée sur les planches `Commandes`, `CommandesMobile`,
 * `CommandesVide` et `CommandesFiltreVide`.
 *
 * DEUX RENDUS, PAS UN TABLEAU QUI DÉFILE. La planche téléphone ne montre pas le
 * tableau réduit : elle montre une LISTE DE CARTES, une par commande, avec la
 * vignette à gauche. Un tableau à huit colonnes sur 390 px se parcourt au doigt
 * de gauche à droite pour lire une seule ligne — c'est-à-dire qu'on ne le lit
 * pas. Les deux rendus lisent les mêmes données ; seule la mise en forme change.
 *
 * LES COLONNES SONT CELLES DE LA PLANCHE : vignette, client, référence, statut,
 * photos, vues, modifiée, actions. Le numéro de suivi et l'état des photos en
 * sont sortis — ils restent cherchables et filtrables, et ils vivent dans
 * l'écran `Envois` et dans l'éditeur, là où on agit dessus.
 *
 * DEUX ÉTATS VIDES DISTINCTS. « Ce compte n'a rien » et « ce filtre ne renvoie
 * rien » sont deux écrans différents : afficher « créez votre première
 * commande » à un vendeur qui en a neuf mille est une perte de confiance
 * immédiate.
 */
export async function TableauCommandes({
  base,
  langue,
  origine,
  parametres,
  page,
  lot,
  total,
  compteurs,
}: {
  readonly base: string;
  readonly langue: string;
  readonly origine: string;
  readonly parametres: ParametresListe;
  readonly page: PageCommandes;
  /**
   * Résultat du dernier lot.
   *
   * L'état est un ENSEMBLE FERMÉ et pas une chaîne, parce qu'il finit dans une
   * clef de traduction : `t("lot." + etat)`. Une valeur libre venue de la barre
   * d'adresse ferait lever le rendu de l'écran sur une clef inexistante — un
   * `?lot=n_importe_quoi` suffirait à casser la page de n'importe quel vendeur.
   * La validation est faite par la page, en amont.
   */
  readonly lot: { readonly etat: EtatLot | null; readonly nombre: number };
  /**
   * Total des commandes non archivées, ou `null` si le compte a échoué.
   *
   * Sert le pied de liste — « 5 sur 184 » de la planche. `null` fait rendre la
   * phrase qui ne compte pas : on n'invente pas un dénominateur.
   */
  readonly total: number | null;
  /** Les compteurs de tête, pour les pastilles des onglets. */
  readonly compteurs: {
    readonly total: number;
    readonly enTransit: number;
    readonly jamaisOuvertes: number;
  } | null;
}) {
  const t = await getTranslations("commandes");
  const format = await getFormatter();
  const maintenant = new Date();

  /**
   * « il y a 2 h », « hier », « il y a 3 j » — les libellés EXACTS de la planche.
   *
   * `style: "short"` et pas le défaut : en long, la même colonne rend « il y a
   * 2 heures » et « il y a 17 minutes », qui font vingt caractères de plus dans
   * une colonne de 96 px. `numeric: "auto"` est ce qui donne « hier » plutôt que
   * « il y a 1 j » — c'est aussi ce que dessine la planche, ligne 2.
   */
  const depuis = (iso: string): string =>
    format.relativeTime(new Date(iso), { now: maintenant, style: "short" });

  // L'URL courante, pour y revenir après une action. Reconstruite depuis les
  // paramètres et non lue dans un en-tête : c'est le même calcul que celui des
  // liens de la page, donc le retour atterrit exactement là où on était.
  const retour = lienListe(base, parametres, {});

  const vide = page.lignes.length === 0;
  // Le compte vide a sa propre planche, sans carte ni barre d'outils : il n'y a
  // rien à filtrer et rien à exporter. Rendre la barre au-dessus d'un écran
  // d'accueil offrirait quatre raccourcis vers le même néant.
  const compteVide = page.diagnostic === "aucune-commande";

  /*
   * L'EN-TÊTE DE COLONNE DU DESIGN SYSTEM : 12 px, demi-gras, couleur sourdine,
   * `padding: 12px 20px`.
   *
   * ⚠️ IL N'EST PLUS EN CAPITALES, ET CE N'EST PAS UN DÉTAIL. L'ancien dessin
   * écrivait 11 px en majuscules avec un tracking de 0,05em — le motif « eyebrow »
   * du canevas condamné. Le design system réserve les capitales à ses eyebrows de
   * marketing ; ses en-têtes de tableau sont du texte ordinaire. Et 11 px passait
   * sous le plancher de 11,5 px que sa propre règle 5 impose.
   */
  /*
   * ⚠️ LA MARGE DE 20 PX EST SUR LES CELLULES DE BORD, PAS SUR LE CONTENEUR DU
   * TABLEAU, ET C'EST VISIBLE À L'ŒIL. Posée sur le conteneur, elle rentrait le
   * filet de séparation de chaque ligne de 20 px de chaque côté ; le kit pose
   * son `borderTop` sur la LIGNE — qui va d'un bord à l'autre de la carte — et
   * son `padding: 14px 20px` À L'INTÉRIEUR. Les deux rendus alignent le texte
   * au même endroit et ne séparent pas les lignes pareil.
   */
  const enTete =
    "pt-3 pb-3 pe-3.5 text-left text-[12px] leading-[16px] font-semibold whitespace-nowrap text-ds-texte-sourdine";
  const cellule = "border-t border-ds-filet py-3.5 pe-3.5 text-[14px]";
  /*
   * La première et la dernière colonne portent la marge de bord de la carte.
   *
   * ⚠️ LA DERNIÈRE EST ÉCRITE EN ENTIER PLUTÔT QU'EN AJOUTANT `pe-5` À
   * `cellule`. Deux utilitaires qui règlent la MÊME propriété — `pe-3.5` et
   * `pe-5` — se départagent par l'ordre de la feuille produite, pas par l'ordre
   * de l'attribut `class` : lequel gagne ne se lit pas dans le code. On vient de
   * payer exactement ça sur les paliers de la rangée de compteurs.
   */
  const bordGauche = " ps-5";
  const enTeteFin =
    "pt-3 pb-3 pe-5 text-left text-[12px] leading-[16px] font-semibold whitespace-nowrap text-ds-texte-sourdine";
  const celluleFin = "border-t border-ds-filet py-3.5 pe-5 text-[14px]";

  if (compteVide) {
    return <AccueilCompteVide langue={langue} />;
  }

  /*
   * LA CARTE DU DESIGN SYSTEM : fond carte, filet, rayon carte-lg, ombre carte.
   *
   * ⚠️ SANS `overflow-hidden`, ALORS QUE LE KIT EN POSE UN. Le menu « … » de
   * chaque ligne est un `<details>` ancré SOUS sa ligne : un conteneur qui rogne
   * a déjà coûté ses deux gestes — dupliquer et archiver — à la dernière commande
   * de chaque page, mesurés à 87 px hors cadre. Le kit peut se le permettre parce
   * que son « ••• » n'ouvre rien. Rien n'a besoin d'être rogné ici : ni les
   * lignes ni les onglets ne portent de fond qui déborderait des angles.
   *
   * LES BANDES PORTENT LEUR PROPRE MARGE — 20 px à gauche et à droite, comme le
   * kit — plutôt que la carte, parce que les filets de séparation doivent aller
   * d'un bord à l'autre.
   */
  return (
    <section className="flex flex-col md:mx-0 md:rounded-ds-card-lg md:border md:border-ds-filet md:bg-ds-surface-carte md:shadow-ds-card">
      {/* LE RÉSULTAT DU DERNIER LOT, DIT. Un lot refusé et un lot en panne ne se
          disent pas pareil : le premier se refait à l'identique, le second non.
          Et « rien n'a été modifié » est une information — sans elle, le vendeur
          ne sait pas s'il doit recommencer. */}
      {lot.etat !== null ? (
        <p
          role="status"
          className={
            "mx-margin-mobile mb-3.5 rounded-ds-card border px-4 py-3 text-[13px] md:mx-5 md:mt-5 md:mb-0 " +
            (lot.etat === "ok"
              ? "border-ds-filet bg-ds-surface-creux text-ds-texte-fort"
              : // Le design system ne borde pas ses surfaces teintées : le fond
                // ambré suffit à les détacher, et un filet de plus les ferait
                // ressembler à un champ de saisie.
                "border-transparent bg-ds-alerte-fond text-ds-alerte")
          }
        >
          {lot.etat === "ok" ? t("lot.ok", { n: lot.nombre }) : t("lot." + lot.etat)}
        </p>
      ) : null}

      {/*
        ⚠️ LES PILULES DE VUE RESTENT SUR UN RÉSULTAT VIDE, ET C'EST UN DÉFAUT
        QUE WASSIM A MONTRÉ EN CAPTURE le 02/09/2026.

        Ce commentaire disait « la barre d'outils ne se rend que s'il y a une
        liste à outiller », et s'appuyait sur la planche `CommandesFiltreVide`,
        qui en effet n'en dessinait pas. La planche a été corrigée d'abord : elle
        porte désormais les compteurs ET la rangée de vues, et ne vide que la
        zone du tableau.

        La raison est celle qu'il a donnée : sans elles, « c'est comme si ça
        ouvrait une deuxième page ». On perd le contexte, et surtout la
        possibilité de cliquer une AUTRE vue — il fallait repasser par « tout
        effacer » puis re-filtrer, alors que la vue qu'on cherche est là, à
        portée de clic.

        CE QUI RESTE CACHÉ, EN REVANCHE : l'export et le panneau de filtres. Il
        n'y a littéralement rien à exporter, et un fichier vide qui porte
        l'avertissement sur les liens publics est pire qu'un bouton absent.
      */}
      {/* ⚠️ LE DÉFILEMENT TIENT JUSQU'À `lg`, pas jusqu'à `md`. Sous 1024 px, six
          contrôles ne tiennent pas sur la largeur restante : « Exporter »
          dépassait de 103 px, mesurés, et la carte-page le coupait. Le
          repoussoir qui écarte l'export des pilules n'apparaît donc qu'avec la
          place de l'accueillir. */}
      {/* LA BARRE D'OUTILS DU KIT : `padding: 16px 20px 0`, les onglets à
          gauche et les contrôles à droite. Aucun filet sous les onglets — c'est
          le filet SUPÉRIEUR de l'en-tête de colonnes qui sépare les deux bandes,
          exactement comme `OrdersView` le pose en neutralisant la bordure de
          `UnderlineTabs`. */}
      <div className="defilement-discret flex items-center gap-2 overflow-x-auto px-margin-mobile md:px-5 md:pt-4 lg:relative lg:overflow-visible">
        <PilulesFiltres base={base} parametres={parametres} compteurs={compteurs} />

        {vide ? null : (
          <>
        <span className="hidden flex-grow lg:block" />

        <PanneauFiltres base={base} parametres={parametres} />

        {/*
          L'EXPORT CSV — HORS du formulaire de lot, et c'est structurel.

          Un export est une LECTURE : il porte les FILTRES de la vue et non la
          sélection cochée. Le mettre dans le formulaire de lot l'aurait fait
          dépendre des cases cochées, ce qui n'est pas ce qu'il exporte.

          ⚠️ IL NE TÉLÉCHARGE PAS AU PREMIER CLIC, et l'avertissement est la
          raison. Le fichier contient les liens publics des commandes, et un lien
          public transfère une CAPACITÉ, définitivement, puisque le jeton est
          immuable à vie. Prévenir une fois le fichier ouvert serait prévenir
          trop tard — *le vendeur ne décide pas d'une fuite, il décide d'un
          export, deux gestes différents parfois séparés de plusieurs mois.*

          La phrase vivait en travers de la carte, entre les pilules et l'en-tête
          des colonnes, faute d'un endroit où la loger. Elle en a un maintenant :
          la planche `CommandesOutils` la dessine ancrée sous son propre bouton,
          et le téléchargement n'existe qu'à l'intérieur. Deux gestes, comme la
          révocation d'un lien, et pour exactement la même raison.
        */}
        <details className={DETAILS_OUTIL_DS + " lg:open:static"}>
          <summary className={PILULE_OUTIL_DS}>
            <Download aria-hidden="true" size={16} strokeWidth={1.8} />
            {t("lot.exporter")}
            <ChevronDown aria-hidden="true" size={15} strokeWidth={1.8} className="text-ds-texte-tenu" />
          </summary>

          <div className={PANNEAU_OUTIL_DS + " lg:w-[368px]"}>
            <p className="mb-3.5 text-[13px] leading-5 text-ds-texte-corps">
              {t("lot.exportAvertissement")}
            </p>
            <a
              // LES MÊMES PARAMÈTRES QUE LA VUE, composés par la MÊME fonction
              // que tous les autres liens de l'écran. Recomposer la chaîne ici
              // ferait une seconde façon d'encoder les filtres, et deux façons
              // divergent au premier filtre ajouté — le vendeur exporterait
              // alors autre chose que ce qu'il regarde, sans s'en apercevoir.
              href={lienListe("/api/commandes/export", { ...parametres, curseur: null }, {})}
              className="flex min-h-11 items-center justify-center gap-2 rounded-ds-card bg-ds-accent px-4 text-[14px] font-semibold text-ds-texte-sur-marque transition-colors hover:bg-ds-accent-survol lg:h-[42px] lg:min-h-0"
            >
              <Download aria-hidden="true" size={16} strokeWidth={1.8} />
              {t("lot.exportTelecharger")}
            </a>
          </div>
        </details>
          </>
        )}
      </div>

      {vide ? (
        <FiltreSansResultat
          diagnostic={page.diagnostic}
          base={base}
          parametres={parametres}
          total={total}
        />
      ) : (
        <>
          {/*
            LE FORMULAIRE DE LOT ENVELOPPE LES DEUX RENDUS, et les actions de
            LIGNE sont des formulaires rendus APRÈS lui, atteints par l'attribut
            `form` de leurs boutons. HTML interdit d'imbriquer un formulaire dans
            un autre ; sans cette construction il faudrait un îlot client pour une
            opération que le navigateur sait faire seul, et l'archivage cesserait
            de fonctionner quand le JavaScript n'a pas chargé — ce qui arrive plus
            souvent qu'on ne le croit sur un téléphone en 4G.
          */}
          {/*
            ⚠️ POST NATIF, ET NON UNE SERVER ACTION. Ces trois gestes reviennent
            sur la MÊME route, et le routeur client jette une telle navigation en
            build de production : la base changeait, l'écran ne bougeait pas.
            React n'intercepte que les formulaires dont l'`action` est une
            FONCTION — une chaîne ne l'est pas. Raison complète et treize pistes
            fermées par mesure : `@/lib/commandes/geste-liste`.
          */}
          <form method="post" action={cheminGesteDeListe(langue)} className="group/lot">
            <input type="hidden" name="geste" value="lot" />
            <input type="hidden" name="retour" value={retour} />

            {/*
              LA BARRE DE LOT N'APPARAÎT QUE SI QUELQUE CHOSE EST COCHÉ, et c'est
              du CSS, pas du JavaScript : `:has(:checked)` sur le formulaire. La
              planche ne dessine aucune barre d'actions groupées ; elle n'a donc
              pas à occuper une ligne tant qu'il n'y a rien à grouper.
            */}
            <div className="mb-3.5 hidden flex-wrap items-center gap-3 px-margin-mobile group-has-[input:checked]/lot:flex md:mt-4 md:px-5">
              <span className="text-[12px] text-ds-texte-corps">{t("lot.aide")}</span>
              {/*
                ⚠️ `name` ET `value` SONT LES DONNÉES, PAS DE LA DÉCORATION :
                c'est ce bouton qui dit s'il faut archiver ou désarchiver. Un
                composant qui les avalerait enverrait un formulaire incomplet,
                et l'action refuserait — sans que rien ne l'explique à l'écran.

                ⚠️ ET C'EST L'ACTION LA PLUS LONGUE DE L'ÉCRAN : elle est
                TOUT-OU-RIEN sur toute la sélection. C'est donc celle où
                l'absence de retour coûte le plus — un vendeur qui ne voit rien
                reclique, sur une action de lot.
              */}
              <BoutonAction
                name="archiver"
                value={parametres.archivees ? "0" : "1"}
                libelles={{
                  repos: parametres.archivees ? t("lot.desarchiver") : t("lot.archiver"),
                  enCours: t("lot.enCours"),
                  reussi: parametres.archivees ? t("lot.desarchiver") : t("lot.archiver"),
                  echoue: parametres.archivees ? t("lot.desarchiver") : t("lot.archiver"),
                }}
                className="flex min-h-11 items-center rounded-ds-pill bg-ds-accent px-4 text-[13px] font-semibold text-ds-texte-sur-marque transition-colors hover:bg-ds-accent-survol lg:h-[36px] lg:min-h-0"
              />
            </div>

            {/* ---------- BUREAU : LE TABLEAU, À PARTIR DE 1024 px ---------- */}
            {/*
              ⚠️ LA BASCULE EST À `lg`, PAS À `md`, ET C'EST MESURÉ. À 768 px le
              tableau demandait 720 px là où la carte lui en laisse 470 : il
              débordait, et la carte-page — qui porte `overflow-hidden` — le
              coupait net. La colonne des actions et la moitié du bouton
              principal sortaient de l'écran, et les en-têtes se collaient en
              « CLIENTRÉFÉRENCESTATUT ».

              Le conteneur à défilement qui vivait ici masquait le problème en le
              transformant en glissement horizontal — et en rognait un autre au
              passage, voir plus bas. La liste de cartes tient jusqu'à 1024 px ;
              c'est elle qui sert cet intervalle.
            */}
            {/*
              ⚠️ PAS DE CONTENEUR À DÉFILEMENT ICI, ET C'EST UNE CORRECTION.
              Il y en avait un — `overflow-x-auto` — pour garantir une largeur
              minimale au tableau. Or `overflow-x: auto` fait calculer
              `overflow-y: auto` : le menu « … » de la DERNIÈRE ligne débordait
              alors de 87 px, mesurés, et se faisait rogner par le conteneur.
              Ses deux gestes — dupliquer, archiver — étaient inatteignables sur
              la dernière commande de chaque page, et sur elle seule.

              Le tableau se rétrécit donc plutôt que de défiler. Les cellules
              n'ont aucune marge horizontale, comme sur la planche : à l'étroit
              le texte se replie sur deux lignes au lieu de chevaucher la colonne
              voisine.
            */}
            <div className="hidden lg:block">
              <table className="w-full border-collapse text-left">
                {/*
                  LES NEUF COLONNES DU KIT, DANS SES PROPORTIONS.

                  `COLS = "38px 1.45fr .85fr 1fr 1.05fr 1.35fr 1.1fr 2.15fr 42px"`,
                  écart 14. Ici l écart est un `padding` de cellule plutôt qu un
                  `gap` de grille — un `<table>` n en a pas — donc chaque largeur
                  le contient. Rapportées à la largeur intérieure de la carte
                  mesurée à 1690 px (1 307 px), les neuf colonnes font 52, 194,
                  120, 139, 145, 182, 151, 282 et 42 px. En pourcentage, elles
                  gardent ces proportions à toute largeur.
                */}
                <colgroup>
                  <col className="w-[3.98%]" />
                  <col className="w-[14.84%]" />
                  <col className="w-[9.18%]" />
                  <col className="w-[10.63%]" />
                  <col className="w-[11.09%]" />
                  <col className="w-[13.92%]" />
                  <col className="w-[11.55%]" />
                  <col className="w-[21.58%]" />
                  <col className="w-[3.21%]" />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col" className={enTete + bordGauche}>
                      <span className="sr-only">{t("lot.titre")}</span>
                    </th>
                    {["commande", "date", "client", "produits", "numeroSuivi", "statutCourt", "suivi"].map(
                      (clef) => (
                        <th key={clef} scope="col" className={enTete}>
                          {t("colonne." + clef)}
                        </th>
                      ),
                    )}
                    <th scope="col" className={enTeteFin + " text-center"}>
                      <span className="sr-only">{t("colonne.actions")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {page.lignes.map((ligne) => {
                    // Une commande sans nom de client est le cas NORMAL d'un
                    // brouillon tout juste créé. On ne remplace pas par un nom
                    // inventé : on le nomme pour ce qu'il est.
                    const nom = ligne.client ?? t("sansNom");
                    return (
                      <tr key={ligne.id} className="group/ligne transition-colors hover:bg-ds-ink-50">
                        <td className={cellule + bordGauche}>
                          {/*
                            ⚠️ LA CASE EST VISIBLE, ALORS QU ELLE ÉTAIT CACHÉE.
                            L ancien dessin la superposait à la vignette et ne la
                            révélait qu au survol, faute de colonne pour elle. Le
                            kit lui en donne une, de 38 px, en tête de ligne : les
                            actions groupées cessent donc d être un geste qu on
                            découvre par accident.
                          */}
                          <input
                            type="checkbox"
                            name="selection"
                            value={ligne.id}
                            aria-label={t("selectionner", { client: nom })}
                            className="h-[18px] w-[18px] cursor-pointer rounded-ds-xs border border-ds-filet-appuye accent-ds-accent outline-offset-2"
                          />
                        </td>

                        {/* COMMANDE : la vignette de 40 au rayon `sm`, la
                            référence courte en 14/700 et la flèche qui ouvre. */}
                        <td className={cellule}>
                          <Link
                            href={base + "/" + ligne.id}
                            className="flex items-center gap-3"
                            title={t("ouvrirCommande", { reference: referenceCourte(ligne.id) })}
                          >
                            <Vignette url={ligne.vignettes[0] ?? null} taille={40} rayon={10} alt={nom} />
                            <span className="inline-flex items-center gap-1.5 font-bold text-ds-texte-fort transition-colors group-hover/ligne:text-ds-accent-encre">
                              {referenceCourte(ligne.id)}
                              <ExternalLink
                                aria-hidden="true"
                                size={13}
                                strokeWidth={2}
                                className="text-ds-accent"
                              />
                            </span>
                          </Link>
                        </td>

                        {/* DATE : le jour au-dessus, l heure dessous en couleur
                            sourdine — deux lignes de 13 px, comme le kit. */}
                        <td className={cellule + " text-ds-texte-corps"}>
                          <span className="flex flex-col">
                            <span className="whitespace-nowrap text-[13px]">
                              {format.dateTime(new Date(ligne.creeeLe), {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })}
                            </span>
                            <span className="whitespace-nowrap text-[13px] text-ds-texte-sourdine">
                              {format.dateTime(new Date(ligne.creeeLe), {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </span>
                        </td>

                        {/*
                          CLIENT — ET LE SIGNAL QUI COMPTE, SOUS SON NOM.

                          ⚠️ LE KIT MET UN DRAPEAU DE PAYS ICI, ET LE PRODUIT N EN A
                          PAS. `customer_label` est un TEXTE LIBRE : il n existe
                          aucun pays à afficher, et `flagcdn.com` est de toute
                          façon bloqué par la CSP. La place sert donc à ce que le
                          produit a et que le kit n a pas : savoir si le client a
                          ouvert son lien. C est la seule question pour laquelle
                          on ouvre cet écran, et elle avait sa propre colonne
                          avant que le kit la supprime.
                        */}
                        <td className={cellule}>
                          <span className="flex flex-col">
                            <span className="truncate text-[14px] font-medium text-ds-texte-fort">
                              {nom}
                            </span>
                            {ligne.vues === 0 ? (
                              <span
                                className="truncate text-[12px] font-bold text-ds-erreur"
                                title={t("jamaisOuvertAide", { client: nom })}
                              >
                                {t("jamaisOuvert")}
                              </span>
                            ) : (
                              <span
                                className="truncate text-[12px] text-ds-texte-sourdine"
                                title={
                                  ligne.derniereVueLe === null
                                    ? undefined
                                    : t("derniereVue", {
                                        date: format.dateTime(new Date(ligne.derniereVueLe), {
                                          day: "numeric",
                                          month: "short",
                                          year: "numeric",
                                        }),
                                      })
                                }
                              >
                                {t("vuesCourt", { n: ligne.vues })}
                              </span>
                            )}
                          </span>
                        </td>

                        {/* PRODUITS : deux vignettes de 38 puis « +N ». Le
                            compte restant vient de `media_count`, porté par la
                            commande — il n est pas déduit des vignettes lues. */}
                        <td className={cellule}>
                          <span className="flex items-center gap-[7px]">
                            {ligne.vignettes.map((url, rang) => (
                              <Vignette key={url} url={url} taille={38} rayon={10} alt={nom + " " + String(rang + 1)} />
                            ))}
                            {ligne.photos > ligne.vignettes.length ? (
                              <span className="inline-flex h-[38px] min-w-[34px] items-center justify-center rounded-ds-sm bg-ds-surface-creux px-2 text-[12px] font-bold text-ds-texte-sourdine">
                                {t("plusMedias", { n: ligne.photos - ligne.vignettes.length })}
                              </span>
                            ) : null}
                            {ligne.photos === 0 ? (
                              <span className="text-[14px] text-ds-texte-tenu">—</span>
                            ) : null}
                          </span>
                        </td>

                        {/*
                          NUMÉRO DE SUIVI.

                          ⚠️ LE KIT ÉCRIT « La Poste » SOUS LE NUMÉRO, ET LE PRODUIT
                          NE PEUT PAS. `orders.carrier_code` n'est pas un nom de
                          transporteur : c'est l'identifiant NUMÉRIQUE du
                          fournisseur de suivi, stocké en texte et relu par
                          `Number.parseInt` avant d'être envoyé à 17TRACK. Aucun
                          catalogue ne le traduit, et aucun écran ne permet de le
                          saisir. Rendu tel quel il afficherait « 100003 » ; rendu
                          avec un repli il afficherait « Transporteur inconnu » sur
                          CHAQUE ligne. Les deux valent moins que rien.

                          Le jour où un catalogue de transporteurs existera, la
                          sous-ligne se rajoute ici sans toucher à la colonne.
                        */}
                        <td className={cellule}>
                          {ligne.numeroSuivi === null ? (
                            <span className="text-[14px] text-ds-texte-tenu">—</span>
                          ) : (
                            <span className="block truncate text-[13px] font-semibold text-ds-texte-fort">
                              {ligne.numeroSuivi}
                            </span>
                          )}
                        </td>

                        <td className={cellule}>
                          <PuceExpedition ligne={ligne} maintenant={maintenant} libelles={t} />
                        </td>

                        <td className={cellule}>
                          <FriseSuivi
                            statut={ligne.statut}
                            libelles={{
                              preparation: t("statut.preparation"),
                              expedie: t("statut.expedie"),
                              en_transit: t("statut.en_transit"),
                              livre: t("statut.livre"),
                            }}
                          />
                        </td>

                        <td className={celluleFin + " text-center"}>
                          <div className="flex items-center justify-center">
                            {/*
                              LE MENU « … » DE LA PLANCHE, en `<details>` : trois
                              boutons au repos, pas cinq. Sans JavaScript, sans
                              îlot client, et les deux gestes qu'il contient
                              restent des soumissions de formulaire.
                            */}
                            {/* `name` partagé : ouvrir un menu ferme celui qui
                                l'était, comme un groupe de boutons radio. Sans
                                lui, cinquante menus peuvent rester ouverts en
                                même temps. Aucun JavaScript. */}
                            <details name="actions-commande" className="relative">
                              <summary className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-ds-sm text-ds-texte-tenu transition-colors hover:bg-ds-surface-teinte hover:text-ds-texte-fort">
                                <MoreHorizontal size={20} strokeWidth={1.8} aria-hidden="true" />
                                <span className="sr-only">
                                  {t("plusDActions", { client: nom })}
                                </span>
                              </summary>
                              <div className="absolute top-full right-0 z-10 mt-1 flex w-64 flex-col rounded-ds-card border border-ds-filet bg-ds-surface-carte p-1 shadow-ds-lg">
                                {/*
                                  ⚠️ COPIER ET OUVRIR DESCENDENT DANS LE MENU, ET
                                  C EST LE KIT QUI LE DIT : sa colonne d actions
                                  fait 42 px et ne porte qu un « ••• ». Les trois
                                  boutons à nu du produit en demandaient 110.

                                  Ce que le geste perd en immediateté, il le gagne
                                  en NOM : « Copier le lien » écrit vaut mieux
                                  qu une icône de presse-papiers que le vendeur
                                  confondait avec « Dupliquer ». Et la flèche de
                                  la colonne « Commande » ouvre toujours l éditeur
                                  en un clic.
                                */}
                                <TraductionsClient espaces={["commandes"]}>
                                  <ActionsLigne
                                    lien={origine + "/p/" + ligne.jetonPublic}
                                    nomClient={nom}
                                  />
                                </TraductionsClient>
                                <button
                                  type="submit"
                                  form={"dup-" + ligne.id}
                                  className="flex min-h-11 items-center gap-2.5 rounded-ds-sm px-3 text-left text-[13px] font-semibold text-ds-texte-fort transition-colors hover:bg-ds-surface-teinte"
                                >
                                  <Copy aria-hidden="true" size={16} strokeWidth={1.8} className="text-ds-texte-tenu" />
                                  {t("dupliquer")}
                                </button>
                                <button
                                  type="submit"
                                  form={"arch-" + ligne.id}
                                  className="flex min-h-11 items-center gap-2.5 rounded-ds-sm px-3 text-left text-[13px] font-semibold text-ds-texte-fort transition-colors hover:bg-ds-surface-teinte"
                                >
                                  {ligne.archiveeLe === null ? (
                                    <Archive
                                      aria-hidden="true"
                                      size={16}
                                      strokeWidth={1.8}
                                      className="text-ds-texte-tenu"
                                    />
                                  ) : (
                                    <ArchiveRestore
                                      aria-hidden="true"
                                      size={16}
                                      strokeWidth={1.8}
                                      className="text-ds-texte-tenu"
                                    />
                                  )}
                                  {ligne.archiveeLe === null ? t("archiverCourt") : t("desarchiverCourt")}
                                </button>
                              </div>
                            </details>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ---------- TÉLÉPHONE : LA LISTE DE CARTES ---------- */}
            <ul className="flex flex-col gap-2.5 px-margin-mobile md:px-5 md:pb-1 lg:hidden">
              {page.lignes.map((ligne) => {
                const nom = ligne.client ?? t("sansNom");
                const jamaisOuverte = ligne.vues === 0;
                /*
                 * ⚠️ LA CARTE EN ALERTE SUIT LE COLIS, PAS LE COMPTEUR DE VUES.
                 *
                 * Elle était peinte dès `vues === 0`, et le résultat était une
                 * liste ENTIÈREMENT rose : une commande créée il y a dix minutes
                 * n'a évidemment aucune vue, et se présentait comme un incident.
                 * Une alerte qui se déclenche partout est une alerte qu'on
                 * apprend à ignorer — c'est le même raisonnement que le seuil de
                 * dix jours du silence, et c'est le même signal.
                 *
                 * La planche est explicite : sa seule carte en alerte est celle
                 * dont la puce dit « Sans mouvement ».
                 */
                /*
                 * LA GARDE « ni livre ni preparation » A ETE RETIREE D ICI le
                 * 05/09/2026 : elle vit desormais dans `decrireSilence`, qui
                 * exige l etape. La repeter au point d appel etait exactement
                 * la cause du defaut voisin — deux appelants sur quatre y
                 * pensaient, deux l oubliaient.
                 */
                const enAlerte =
                  decrireSilence(
                    ligne.colisBougeLe === null ? null : new Date(ligne.colisBougeLe),
                    maintenant,
                    ligne.statut,
                  ).etat === "silencieux";
                return (
                  <li key={ligne.id}>
                    <Link
                      href={base + "/" + ligne.id}
                      className={
                        "flex items-center gap-[13px] rounded-ds-card border p-3.5 transition-colors " +
                        (enAlerte
                          ? "border-transparent bg-ds-alerte-fond"
                          : "border-ds-filet bg-ds-surface-carte hover:bg-ds-ink-50")
                      }
                    >
                      <Vignette url={ligne.vignettes[0] ?? null} taille={52} rayon={10} />

                      <span className="min-w-0 flex-grow">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-[15px] leading-[19px] font-bold text-ds-texte-fort">
                            {nom}
                          </span>
                          <span className="shrink-0 text-[12px] leading-[15px] text-ds-texte-sourdine">
                            {depuis(ligne.modifieeLe)}
                          </span>
                        </span>

                        <span className="mt-0.5 mb-[7px] block truncate text-[13px] leading-[17px] text-ds-texte-corps">
                          {ligne.reference ?? "—"}
                        </span>

                        <span className="flex items-center gap-2">
                          <PuceExpedition ligne={ligne} maintenant={maintenant} libelles={t} />
                          {jamaisOuverte ? (
                            <span className="text-[12px] leading-[15px] font-bold text-ds-erreur">
                              {t("jamaisOuvert")}
                            </span>
                          ) : (
                            <span className="truncate text-[12px] leading-[15px] text-ds-texte-sourdine">
                              {t("photosEtVues", { photos: ligne.photos, vues: ligne.vues })}
                            </span>
                          )}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </form>

          {/*
            LES FORMULAIRES DES ACTIONS DE LIGNE, hors du tableau et hors du
            formulaire de lot. Chacun porte SES champs : un formulaire commun
            enverrait ceux de toutes les lignes à chaque clic.
          */}
          {page.lignes.map((ligne) => (
            <div key={"formulaires-" + ligne.id} className="hidden">
              <form id={"arch-" + ligne.id} method="post" action={cheminGesteDeListe(langue)}>
                <input type="hidden" name="geste" value="archiver" />
                <input type="hidden" name="id" value={ligne.id} />
                <input type="hidden" name="jeton" value={ligne.jetonPublic} />
                <input type="hidden" name="archiver" value={ligne.archiveeLe === null ? "1" : "0"} />
                <input type="hidden" name="retour" value={retour} />
              </form>
              <form id={"dup-" + ligne.id} method="post" action={cheminGesteDeListe(langue)}>
                <input type="hidden" name="geste" value="dupliquer" />
                <input type="hidden" name="id" value={ligne.id} />
                <input type="hidden" name="langue" value={langue} />
                <input type="hidden" name="retour" value={retour} />
              </form>
            </div>
          ))}

          <PiedDeListe
            base={base}
            parametres={parametres}
            suivant={page.suivant}
            affichees={page.lignes.length}
            total={total}
          />
        </>
      )}
    </section>
  );
}

/**
 * LA RÉFÉRENCE COURTE D'UNE COMMANDE — ce que le kit écrit « #DLK7842 ».
 *
 * ⚠️ ELLE EST DÉRIVÉE DE L'IDENTIFIANT, PAS STOCKÉE, ET C'EST UN ARBITRAGE.
 * Un numéro séquentiel par boutique se lirait mieux — « commande 42 » se dit au
 * téléphone — mais il exige une colonne, un compteur par boutique pour éviter
 * la course à l'insertion, un reprise de l'existant, et une migration qui ne
 * serait appliquée en production que le jour d'un déploiement. Pour un gain de
 * LISIBILITÉ sur une référence qu'on copie plus qu'on ne récite, c'est cher.
 *
 * Les six derniers caractères de l'identifiant sont STABLES à VIE — aucune
 * édition ne les change — et ils ne divulguent rien : cet identifiant est déjà
 * dans l'URL que le vendeur a sous les yeux. Ce n'est pas le `public_token`, qui
 * transfère une capacité et ne doit jamais servir d'étiquette.
 *
 * Le jour où un numéro séquentiel sera décidé, il remplace cette fonction sans
 * toucher à une seule colonne de l'écran.
 */
export function referenceCourte(id: string): string {
  return "#" + id.replace(/-/g, "").slice(-6).toUpperCase();
}

/**
 * LA PUCE D'EXPÉDITION — ET LE CINQUIÈME ÉTAT QUE LA BASE NE PORTE PAS.
 *
 * Les planches dessinent quatre statuts et un cinquième libellé : « Sans
 * mouvement · 14 j », en alerte. Ce n'est pas un statut de plus dans l'énumération
 * — c'est le STATUT COURANT plus une DURÉE, calculée à l'affichage depuis la
 * date du dernier mouvement du colis.
 *
 * C'EST LA MÊME RÈGLE QUE SUR LA PAGE CLIENT, et elle passe par la même fonction
 * pure : dix jours, jamais moins. Deux seuils divergents auraient fini par dire
 * « bloqué » au vendeur et « en transit » à son client, ou l'inverse — et
 * personne n'aurait su lequel des deux écrans mentait.
 *
 * ⚠️ UN COLIS LIVRÉ N'EST JAMAIS SILENCIEUX. Sans cette borne, toute commande
 * livrée depuis plus de dix jours serait affichée « sans mouvement » : le
 * silence d'un colis arrivé n'est pas une alerte, c'est la fin normale.
 */
function PuceExpedition({
  ligne,
  maintenant,
  libelles,
}: {
  readonly ligne: {
    readonly statut: LigneCommande["statut"];
    readonly colisBougeLe: string | null;
  };
  readonly maintenant: Date;
  readonly libelles: (clef: string, valeurs?: Record<string, number | string>) => string;
}) {
  // MEME RAISON QU AU-DESSUS : l etape est passee, la regle n est plus recopiee.
  const silence = decrireSilence(
    ligne.colisBougeLe === null ? null : new Date(ligne.colisBougeLe),
    maintenant,
    ligne.statut,
  );

  if (silence.etat === "silencieux") {
    return (
      <BadgeStatut
        libelle={libelles("statutSansMouvement", { jours: silence.jours })}
        teinte="alerte"
        Icone={ICONE_SILENCE}
      />
    );
  }

  return (
    <BadgeStatut
      libelle={libelles("statut." + ligne.statut)}
      teinte={teinteExpedition(ligne.statut)}
      Icone={iconeExpedition(ligne.statut)}
    />
  );
}

/**
 * La tuile de couverture.
 *
 * SANS IMAGE, ON REND L'APLAT DE LA PLANCHE, pas un symbole de remplacement.
 * Les planches dessinent des carrés de couleur unie — ce sont des vignettes
 * absentes, pas des icônes « pas de photo ». Une commande sans média est l'état
 * NORMAL d'un brouillon, et un pictogramme d'avertissement à cet endroit le
 * ferait passer pour une anomalie cinquante fois par écran.
 */
function Vignette({
  url,
  taille,
  rayon,
  alt = "",
}: {
  readonly url: string | null;
  readonly taille: number;
  readonly rayon: number;
  readonly alt?: string;
}) {
  const style = { width: taille, height: taille, borderRadius: rayon };
  if (url === null) {
    return <span className="block shrink-0 bg-ds-surface-creux" style={style} />;
  }
  // URL R2 SIGNÉE, À EXPIRATION : `next/image` la remettrait en cache derrière sa
  // propre adresse, donc la servirait encore après l'expiration de la signature —
  // et une URL de média qui survit à sa signature est exactement ce que le bucket
  // privé existe pour empêcher.
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={url}
      alt={alt}
      width={taille}
      height={taille}
      loading="lazy"
      decoding="async"
      className="block shrink-0 object-cover"
      style={style}
    />
  );
}

/**
 * Le pied de liste — « 5 sur 184 » et « Charger la suite ».
 *
 * ÉCART ASSUMÉ SUR LES MAQUETTES D'ORIGINE, qui montraient des numéros de page.
 * Un numéro de page suppose un décalage, et un décalage fait lire 2 000 lignes
 * pour en rendre 50 à la page 40 : le coût croît avec le numéro, donc la lenteur
 * frappe celui qui a le plus de commandes. La planche du canevas dit exactement
 * la même chose que nous — un bouton « Charger la suite », pas de numéros.
 *
 * « PRÉCÉDENT » N'EXISTE PAS ET C'EST VOLONTAIRE : un curseur avant se
 * construirait en inversant le tri, ce qui donnerait une page décalée sur
 * égalité de dates. Le retour se fait par l'historique du navigateur, qui porte
 * exactement les URL déjà visitées.
 */
async function PiedDeListe({
  base,
  parametres,
  suivant,
  affichees,
  total,
}: {
  readonly base: string;
  readonly parametres: ParametresListe;
  readonly suivant: string | null;
  readonly affichees: number;
  readonly total: number | null;
}) {
  const t = await getTranslations("commandes");

  /*
   * ⚠️ « 7 SUR 0 ». Le total compte les commandes NON archivées ; la vue des
   * archives affiche exactement celles qu'il exclut. Le pied annonçait donc
   * « 7 sur 0 » — un dénominateur plus petit que son numérateur, c'est-à-dire un
   * chiffre visiblement faux à l'endroit qui sert à se repérer dans neuf mille
   * lignes. On ne compte pas les archives pour autant : ce serait un second
   * agrégat sur un écran qu'on ouvre rarement. On se tait.
   */
  const archives = parametres.archivees;

  return (
    <div className="mt-[18px] flex items-center justify-between gap-4 border-t border-ds-filet px-margin-mobile pt-4 md:mt-0 md:px-5 md:py-4">
      <p className="text-[13px] text-ds-texte-corps">
        {/* ON NE COMPOSE PAS UN DÉNOMINATEUR QU'ON N'A PAS. Quand le compte a
            échoué, la phrase dit s'il reste des commandes, sans prétendre savoir
            combien il y en a. */}
        {total === null || archives
          ? suivant === null
            ? t("finDeListe")
            : t("pageSuivanteDisponible")
          : t("surTotal", { n: affichees, total })}
      </p>

      {suivant !== null ? (
        <LienEcran
          href={lienListe(base, parametres, { curseur: suivant })}
          className="flex min-h-11 items-center rounded-ds-sm border border-ds-filet bg-ds-surface-carte px-[18px] text-[13px] font-medium whitespace-nowrap text-ds-texte-corps transition-colors hover:bg-ds-surface-teinte lg:h-9 lg:min-h-0"
        >
          {t("chargerLaSuite")}
        </LienEcran>
      ) : null}
    </div>
  );
}

/**
 * ÉTAT VIDE N°1 — CE COMPTE N'A RIEN, planche `CommandesVide`.
 *
 * ICI ON A LE DROIT D'ENSEIGNER : c'est le premier écran du produit. Ni
 * recherche, ni filtres, ni compteurs — rien à filtrer, rien à compter. Les
 * trois étapes numérotées sont le seul endroit du produit où l'on explique ce
 * qu'il fait, et elles disparaissent dès la première commande créée.
 */
async function AccueilCompteVide({ langue }: { readonly langue: string }) {
  const t = await getTranslations("commandes");
  const etapes = ["photos", "suivi", "lien"] as const;

  return (
    <section className="flex flex-grow items-center justify-center px-margin-mobile md:px-0">
      <div className="w-full max-w-[620px] rounded-ds-3xl border border-ds-filet bg-ds-surface-carte px-6 py-9 text-center shadow-ds-card md:px-12 md:py-11">
        <span className="degrade-ds-marque mx-auto mb-[22px] flex h-[62px] w-[62px] items-center justify-center rounded-ds-icon-tile text-ds-texte-sur-marque shadow-ds-brand">
          <Plus aria-hidden="true" size={28} strokeWidth={2} />
        </span>

        <h2 className="text-[30px] leading-[1.15] font-extrabold tracking-[-0.045em] text-ds-texte-titre">
          {t("vide.compteTitre")}
        </h2>
        <p className="mt-2.5 text-[16px] leading-[1.55] text-ds-texte-corps">
          {t("vide.compteTexte")}
        </p>

        <ol className="mt-8 mb-8 flex flex-col gap-[18px] text-left">
          {etapes.map((etape, index) => (
            <li key={etape} className="flex items-start gap-3.5">
              <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-ds-pill bg-ds-surface-teinte text-[13px] font-extrabold text-ds-accent">
                {index + 1}
              </span>
              <span>
                <span className="block text-[15px] font-bold text-ds-texte-fort">
                  {t("vide.etapes." + etape + ".titre")}
                </span>
                <span className="mt-0.5 block text-[14px] leading-[21px] text-ds-texte-corps">
                  {t("vide.etapes." + etape + ".texte")}
                </span>
              </span>
            </li>
          ))}
        </ol>

        {/* CRÉER EST UNE MUTATION, donc une Server Action et non un lien vers une
            page qui écrirait au rendu. */}
        <form action={creerBrouillon}>
          <input type="hidden" name="langue" value={langue} />
          {/*
            ⚠️ L'ICÔNE « + » RESTE, ET C'EST POURQUOI LES LIBELLÉS SONT DES
            NŒUDS. La planche dessine un plus devant le mot ; le remplacer par
            du texte nu ferait diverger l'écran de sa planche pour une raison
            purement interne. Pendant l'attente, l'anneau prend la place du
            plus — jamais les deux, qui élargiraient le bouton au clic.
          */}
          <BoutonAction
            libelles={{
              repos: (
                <>
                  <Plus aria-hidden="true" size={17} strokeWidth={2} />
                  {t("nouvelle")}
                </>
              ),
              enCours: t("nouvelleEnCours"),
              reussi: (
                <>
                  <Plus aria-hidden="true" size={17} strokeWidth={2} />
                  {t("nouvelle")}
                </>
              ),
              echoue: (
                <>
                  <Plus aria-hidden="true" size={17} strokeWidth={2} />
                  {t("nouvelle")}
                </>
              ),
            }}
            className="degrade-ds-marque mx-auto flex h-[50px] items-center gap-2 rounded-ds-card px-7 text-[15px] font-semibold text-ds-texte-sur-marque shadow-ds-brand transition-shadow hover:shadow-ds-brand-hover"
          />
        </form>

        <p className="mt-[18px] text-[13px] text-ds-texte-corps">
          {t("vide.marqueQuestion")}{" "}
          <Link
            href={"/" + langue + "/marque"}
            className="font-semibold text-ds-texte-lien underline-offset-2 hover:text-ds-texte-lien-survol hover:underline"
          >
            {t("vide.marqueLien")}
          </Link>
        </p>
      </div>
    </section>
  );
}

/**
 * ÉTAT VIDE N°2 — CE FILTRE NE RENVOIE RIEN, planche `CommandesFiltreVide`.
 *
 * ET IL NE DIT SURTOUT PAS « créez votre première commande » : ce vendeur en a
 * cent quatre-vingt-quatre. Lui proposer de commencer serait lui dire qu'on a
 * perdu son travail.
 *
 * TROISIÈME CAUSE, TROUVÉE EN PILOTANT LE PRODUIT : un compte dont TOUTES les
 * commandes sont archivées. L'écran annonçait alors « aucune ne passe les
 * filtres en cours » SANS QU'AUCUN FILTRE SOIT POSÉ, et son seul bouton
 * pointait vers l'adresse déjà ouverte. D'où la règle : UN BOUTON DONT L'ACTION
 * EST DÉJÀ L'ÉTAT COURANT NE SE REND PAS.
 */
async function FiltreSansResultat({
  diagnostic,
  base,
  parametres,
  total,
}: {
  readonly diagnostic: DiagnosticListeVide | null;
  readonly base: string;
  readonly parametres: ParametresListe;
  readonly total: number | null;
}) {
  const t = await getTranslations("commandes");

  // LE DIAGNOSTIC VIENT D'UNE LECTURE, jamais d'une déduction sur les paramètres.
  // Une déduction du genre « aucun filtre donc tout est archivé » reste vraie
  // tant que personne n'ajoute un filtre à `lireCommandes` sans l'ajouter à
  // `listeFiltree` — c'est-à-dire qu'elle tient par une ABSENCE (L-029).
  //
  // Il ne suffit pourtant pas seul : proposer « voir les archives » à qui les
  // consulte déjà rendrait un second bouton sans effet.
  const toutArchive = diagnostic === "tout-archive" && !parametres.archivees;
  const filtree = listeFiltree(parametres);

  return (
    <div className="flex flex-grow items-center justify-center border-y border-ds-filet bg-ds-surface-carte px-6 py-12 text-center md:mt-4 md:rounded-none md:border-x-0 md:border-b-0 md:p-10">
      <div className="max-w-[460px]">
        <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-ds-icon-tile bg-ds-surface-creux text-ds-texte-tenu">
          {toutArchive ? (
            <Archive aria-hidden="true" size={24} strokeWidth={1.8} />
          ) : (
            <Search aria-hidden="true" size={24} strokeWidth={1.8} />
          )}
        </span>

        <h2 className="text-[22px] leading-7 font-bold tracking-[-0.02em] text-ds-texte-titre">
          {toutArchive ? t("vide.archiveTitre") : t("vide.filtreTitre")}
        </h2>
        <p className="mt-2.5 text-[15px] leading-6 text-ds-texte-corps">
          {toutArchive
            ? t("vide.archiveTexte")
            : total === null
              ? t("vide.filtreTexte")
              : t("vide.filtreTexteChiffre", { total })}
        </p>

        {toutArchive ? (
          <LienEcran
            href={lienListe(base, parametres, { archivees: true })}
            className="mt-6 inline-flex min-h-11 items-center rounded-ds-card border border-ds-filet bg-ds-surface-carte px-[22px] text-[14px] font-semibold text-ds-texte-fort shadow-ds-xs transition-shadow hover:shadow-ds-md md:h-11 md:min-h-0"
          >
            {t("vide.voirArchives")}
          </LienEcran>
        ) : filtree ? (
          <LienEcran
            href={base}
            className="mt-6 inline-flex min-h-11 items-center rounded-ds-card border border-ds-filet bg-ds-surface-carte px-[22px] text-[14px] font-semibold text-ds-texte-fort shadow-ds-xs transition-shadow hover:shadow-ds-md md:h-11 md:min-h-0"
          >
            {t("toutEffacer")}
          </LienEcran>
        ) : null}

        {/* LA RECHERCHE IGNORE LES ACCENTS, et c'est le moment de le dire : la
            personne devant cet écran vient probablement de chercher un mot
            accentué. */}
        {parametres.q !== "" ? (
          <p className="mt-5 text-[13px] leading-5 text-ds-texte-corps">
            {t("vide.accents")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
