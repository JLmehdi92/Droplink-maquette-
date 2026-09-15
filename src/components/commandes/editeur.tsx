"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, ChevronDown, Clock, ExternalLink, Share2, TriangleAlert } from "lucide-react";
import { enregistrerChamp, type ResultatEnregistrement } from "@/lib/commandes/actions";
import { referenceCourte } from "@/lib/commandes/reference";
import { ETAPES, type Etape } from "@/lib/tracking/normalize";
import { Panneau, LienRetour, LigneInfo } from "@/components/app/panneau";
import { FriseDetail } from "./frise-detail";
import { CarteMedias, type MediaAffiche } from "./carte-medias";
import { CarteRevocation } from "./carte-revocation";
import { ApercuClient, type PaletteApercu } from "./apercu-client";
import { TuilesResume } from "./tuiles-resume";
import type { LibellesApercu } from "@/lib/boutique/phrases-apercu";

/**
 * L'éditeur d'une commande — sauvegarde automatique, sans bouton « enregistrer ».
 *
 * Un bouton d'enregistrement transforme chaque champ en promesse à tenir plus
 * tard : le vendeur qui ferme son onglet perd son travail, et c'est toujours à
 * la commande la plus longue à saisir que ça arrive.
 *
 * DEUX CADENCES. ~800 ms de temporisation sur le texte — écrire ne doit pas
 * produire une écriture par frappe — et immédiat sur les actions structurelles
 * (statut, contrôle qualité), qui sont des décisions et non de la saisie.
 *
 * L'INTERFACE N'AFFIRME JAMAIS CE QUE LA BASE N'A PAS ENREGISTRÉ. Le témoin ne
 * passe à « enregistré » qu'APRÈS confirmation du serveur. En cas d'échec, le
 * champ REVIENT à la valeur confirmée, et l'échec est NOMMÉ avec le champ
 * concerné : un retour optimiste est un pari sur le serveur, et un pari perdu
 * laisse à l'écran une valeur que personne n'a gardée — le vendeur envoie alors
 * un lien dont il croit connaître le contenu.
 *
 * ⚠️ CE COMPOSANT PORTE SON EN-TÊTE, ce qui n'était pas le cas. Le témoin de
 * sauvegarde vit dans l'îlot d'édition ; une barre rendue par le serveur ne peut
 * pas partager son état. Soit l'en-tête descend ici, soit le témoin remonte par
 * un mécanisme qu'il faudrait inventer. Il descend.
 *
 * ⚠️ ET IL A CESSÉ D'ÊTRE UNE BARRE COLLANTE LE 12/09/2026. Il était rendu en
 * `sticky` sous la barre supérieure de l'espace vendeur — donc DEUX barres
 * empilées, dont une que le kit ne dessine pas. Dans le kit, le retour, le titre
 * et les actions sont du CONTENU de page : ils défilent avec le reste, et les
 * 89 px de la barre supérieure restent la seule chose qui ne bouge pas.
 *
 * ⚠️ LE TITRE EST DEVENU LA RÉFÉRENCE COURTE, pas le nom du client. C'est ce que
 * le kit écrit (« #DLK7842 »), et c'est ce que la liste des commandes affiche
 * depuis sa reprise : deux écrans qui nomment la même commande autrement forcent
 * à retraduire mentalement à chaque aller-retour. Le nom du client n'est pas
 * perdu — il est le premier champ de la carte, et il reste le titre de l'ONGLET,
 * qui sert à retrouver une fenêtre parmi dix et non à identifier une ligne.
 */

type Etat = "repos" | "encours" | "echec";

export interface ValeursCommande {
  readonly customer_label: string;
  readonly product_ref: string;
  readonly tracking_number: string;
  readonly internal_notes: string;
  readonly status: string;
  readonly qc_status: string;
}

const DELAI_TEXTE_MS = 800;



export function Editeur({
  id,
  langue,
  jeton,
  origine,
  versPageClient,
  initiales,
  statuts,
  qcs,
  medias,
  suivi,
  dates,
  resume,
  boutique,
  historique,
}: {
  readonly id: string;
  readonly langue: string;
  readonly jeton: string;
  readonly origine: string;
  readonly versPageClient: string;
  readonly initiales: ValeursCommande;
  readonly statuts: readonly string[];
  readonly qcs: readonly string[];
  readonly medias: {
    readonly initiaux: readonly MediaAffiche[];
    readonly plafondMedias: number;
    readonly plafondVideos: number;
    readonly typesAcceptes: readonly string[];
  };
  /**
   * LE SUIVI DU COLIS, tel que la base le porte au chargement.
   *
   * Les DATES et les NOTES sont déjà formatées par le serveur : le formateur de
   * `next-intl` pèse plus que les quatre chaînes qu'il produirait ici, et cet
   * écran est celui qu'un fournisseur à 200 commandes par semaine ouvre toute la
   * journée. L'ÉTAPE COURANTE, elle, n'est pas passée : elle se lit sur
   * `valeurs.status`, donc la frise suit la liste déroulante sans aller-retour.
   */
  readonly suivi: {
    readonly numero: string | null;
    readonly abandonne: boolean;
    /** Par étape, la date à laquelle un point de passage l'a datée. */
    readonly quand: Readonly<Partial<Record<Etape, string>>>;
    /** Par étape, ce que le transporteur a dit en la franchissant. */
    readonly notes: Readonly<Partial<Record<Etape, string>>>;
  };
  /** Les deux dates de la commande, formatées côté serveur pour la même raison. */
  readonly dates: {
    readonly creeLe: string;
    readonly misAJourLe: string;
  };
  /**
   * CE QUE LA RANGÉE DE TUILES MONTRE ET QUE LE FORMULAIRE NE PORTE PAS.
   *
   * Le client, la référence et le numéro de suivi viennent de `valeurs` : ils
   * changent à la frappe, et une tuile qui les lirait ailleurs afficherait
   * autre chose que le champ posé quinze pixels plus bas.
   */
  readonly resume: {
    readonly transporteur: string | null;
    readonly vues: number;
    readonly derniereVueLe: string | null;
  };
  readonly boutique: {
    readonly nom: string | null;
    readonly logoUrl: string | null;
    readonly palette: PaletteApercu;
    /*
     * Les phrases de l'aperçu, résolues dans la LANGUE DES PAGES CLIENT de
     * cette boutique — voir `lib/boutique/libelles-apercu`. Elles vivent sous
     * `boutique` et non à côté parce qu'elles en dépendent : c'est son réglage
     * de langue qui les a produites, pas celui de l'URL.
     */
    readonly libellesApercu: LibellesApercu;
  };
  /** Rendu par le SERVEUR : ses libellés ne voyagent pas dans l'hydratation. */
  readonly historique: React.ReactNode;
}) {
  const t = useTranslations("editeur");

  // Deux états distincts, et c'est tout le mécanisme : `valeurs` est ce qui
  // s'affiche, `confirmees` est ce que la base a réellement gardé. Sans le
  // second, il n'y a rien vers quoi revenir quand une écriture échoue.
  const [valeurs, setValeurs] = useState<ValeursCommande>(initiales);
  const confirmees = useRef<ValeursCommande>(initiales);

  const [etat, setEtat] = useState<Etat>("repos");
  const [champsEnEchec, setChampsEnEchec] = useState<readonly string[]>([]);
  const minuteries = useRef<Map<string, number>>(new Map());
  // Une écriture plus ancienne qui reviendrait après une plus récente
  // écraserait la seconde : chaque champ retient le numéro de sa dernière
  // demande, et une réponse périmée est ignorée.
  const derniereDemande = useRef<Map<string, number>>(new Map());
  const compteur = useRef(0);

  // Le jeton CHANGE quand on révoque, et la barre haute doit alors copier le
  // nouveau. Une copie prise au rendu du serveur pointerait vers le lien qu'on
  // vient de tuer — précisément au moment où l'on veut envoyer le nouveau.
  const [jetonCourant, setJetonCourant] = useState(jeton);
  const [mediasCourants, setMediasCourants] = useState<readonly MediaAffiche[]>(medias.initiaux);

  const appliquer = useCallback(
    (champ: keyof ValeursCommande, valeur: string, resultat: ResultatEnregistrement): void => {
      if (resultat.statut === "ok") {
        confirmees.current = { ...confirmees.current, [champ]: valeur };
        setChampsEnEchec((precedents) => {
          const restants = precedents.filter((c) => c !== champ);
          if (restants.length === 0) setEtat("repos");
          return restants;
        });
        return;
      }

      /*
       * RETOUR À L'ÉTAT CONFIRMÉ, ET ON LE DIT.
       *
       * ⚠️ « CONFIRMÉ » VEUT DIRE « CE QUE LA BASE PORTE », PAS « CE QUE CET
       * ONGLET A VU EN DERNIER ». Le serveur rend désormais `valeurConfirmee`
       * quand il l'a relue ; on la préfère à la mémoire locale, qui peut être
       * périmée dès qu'un second onglet est ouvert — cas ordinaire pour un
       * vendeur qui compare deux commandes.
       *
       * Sans valeur relue, on retombe sur la mémoire locale : c'est le
       * comportement d'avant, et il vaut mieux que rien.
       */
      const confirmee =
        "valeurConfirmee" in resultat && typeof resultat.valeurConfirmee === "string"
          ? resultat.valeurConfirmee
          : confirmees.current[champ];
      confirmees.current = { ...confirmees.current, [champ]: confirmee };
      setValeurs((v) => ({ ...v, [champ]: confirmee }));
      setEtat("echec");
      setChampsEnEchec((precedents) =>
        precedents.includes(champ) ? precedents : [...precedents, champ],
      );
    },
    [],
  );

  const envoyer = useCallback(
    (champ: keyof ValeursCommande, valeur: string): void => {
      compteur.current += 1;
      const demande = compteur.current;
      derniereDemande.current.set(champ, demande);
      setEtat("encours");

      void enregistrerChamp(id, champ, valeur)
        .then((resultat) => {
          if (derniereDemande.current.get(champ) !== demande) return;
          appliquer(champ, valeur, resultat);
        })
        .catch(() => {
          if (derniereDemande.current.get(champ) !== demande) return;
          appliquer(champ, valeur, { statut: "echec", motif: "ecriture", champ });
        });
    },
    [id, appliquer],
  );

  const changer = useCallback(
    (champ: keyof ValeursCommande, valeur: string, immediat: boolean): void => {
      setValeurs((v) => ({ ...v, [champ]: valeur }));

      const enCours = minuteries.current.get(champ);
      if (enCours !== undefined) window.clearTimeout(enCours);

      if (immediat) {
        envoyer(champ, valeur);
        return;
      }

      minuteries.current.set(
        champ,
        window.setTimeout(() => envoyer(champ, valeur), DELAI_TEXTE_MS),
      );
    },
    [envoyer],
  );

  const relancer = useCallback((): void => {
    for (const champ of champsEnEchec) {
      envoyer(champ as keyof ValeursCommande, valeurs[champ as keyof ValeursCommande]);
    }
  }, [champsEnEchec, envoyer, valeurs]);

  const lienPublic = origine === "" ? "/p/" + jetonCourant : origine + "/p/" + jetonCourant;

  return (
    <>
      <div className="px-margin-mobile pt-4 pb-6 lg:px-8 lg:pt-[26px] lg:pb-8">
        <EnTeteDetail
          langue={langue}
          reference={referenceCourte(id)}
          creeLe={dates.creeLe}
          etat={etat}
          lienPublic={lienPublic}
          versPageClient={versPageClient}
        />

        {/*
          LA RANGÉE DE RÉSUMÉ DU KIT, et elle manquait entièrement. Elle vient
          AVANT les panneaux, comme dans `OrderDetail.jsx` : quatre faits d'un
          coup d'œil, sans avoir à lire un formulaire pour les retrouver.
        */}
        <TuilesResume
          client={valeurs.customer_label}
          reference={valeurs.product_ref}
          numeroSuivi={valeurs.tracking_number}
          transporteur={resume.transporteur}
          vues={resume.vues}
          derniereVueLe={resume.derniereVueLe}
        />

        {/*
          LES TROIS RANGÉES DU KIT, ET LEURS GRILLES EXACTES : deux rangées en
          `minmax(0,1.35fr) minmax(0,1fr)` encadrant une rangée à trois colonnes
          égales, toutes à l'écart de 18 px. Mesuré à 1690 px sur le kit servi :
          1347 px de contenu, soit 763 + 18 + 566, et 437 × 3 + 18 × 2.

          ⚠️ CHAQUE RANGÉE EST EN `display: contents` AU TÉLÉPHONE, et c'est ce
          qui permet l'ordre mobile. Les cartes deviennent alors les enfants
          directs de la colonne, donc `order` les classe une à une : les photos
          d'abord — sur 390 px, le vendeur qui ouvre une commande vient en
          déposer —, le lien à révoquer en dernier, une action irréversible ne se
          rencontrant pas au milieu d'un formulaire. Une grille par rangée aurait
          figé les cartes d'une même rangée l'une derrière l'autre.
        */}
        <div className="flex flex-col gap-3 lg:flex lg:flex-col lg:gap-[18px]">
          <div className="contents lg:grid lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-start lg:gap-[18px]">
            <div className="order-2 lg:order-none">
              <CarteCommande
                valeurs={valeurs}
                statuts={statuts}
                qcs={qcs}
                champsEnEchec={champsEnEchec}
                onChanger={changer}
              />
            </div>

            {/*
              L'APERÇU NE SE REND PAS AU TÉLÉPHONE. Sur 390 px, une miniature de
              la page publique posée sous les champs serait une seconde page à
              faire défiler avant d'atteindre quoi que ce soit — et la vraie page
              est à un bouton, en bas de l'écran.
            */}
            <div className="hidden lg:block">
              <ApercuClient
                nomBoutique={boutique.nom}
                logoUrl={boutique.logoUrl}
                palette={boutique.palette}
                client={valeurs.customer_label}
                medias={mediasCourants}
                versPageClient={versPageClient}
                libelles={boutique.libellesApercu}
              />
            </div>
          </div>

          <div className="contents lg:grid lg:grid-cols-3 lg:items-start lg:gap-[18px]">
            <div className="order-3 lg:order-none">
              <PanneauSuivi suivi={suivi} statut={valeurs.status} />
            </div>

            <div className="order-4 lg:order-none">
              <PanneauInformations
                reference={referenceCourte(id)}
                dates={dates}
                numeroSuivi={valeurs.tracking_number}
                transporteur={resume.transporteur}
                lienPublic={lienPublic}
                versPageClient={versPageClient}
              />
            </div>

            <div className="order-5 lg:order-none">{historique}</div>
          </div>

          <div className="contents lg:grid lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-start lg:gap-[18px]">
            <div className="order-1 lg:order-none">
              <CarteMedias
                orderId={id}
                initiaux={medias.initiaux}
                plafondMedias={medias.plafondMedias}
                plafondVideos={medias.plafondVideos}
                typesAcceptes={medias.typesAcceptes}
                onMedias={setMediasCourants}
              />
            </div>

            <div className="order-6 lg:order-none">
              <CarteRevocation orderId={id} jeton={jetonCourant} onNouveauJeton={setJetonCourant} />
            </div>
          </div>
        </div>
      </div>

      {/* LA BANDE D'ACTION DU TÉLÉPHONE, collée en bas comme sur la planche : à
          390 px, la barre haute a déjà le titre et le témoin, et « voir la page
          publique » est le geste qui termine le travail. */}
      <div className="sticky bottom-0 z-10 flex gap-2.5 border-t border-ds-filet bg-ds-surface-carte px-4 pt-3 pb-5 lg:hidden">
        <BoutonCopier lien={lienPublic} compact />
        <a
          href={versPageClient}
          target="_blank"
          rel="noopener noreferrer"
          className="degrade-ds-marque flex min-h-12 flex-grow items-center justify-center gap-2 rounded-ds-card text-[15px] font-semibold text-ds-texte-sur-marque shadow-ds-brand"
        >
          {t("voirPage")}
          <ExternalLink aria-hidden="true" size={16} strokeWidth={1.9} />
        </a>
      </div>

      {/* L'ÉCHEC NOMME LES CHAMPS ET PROPOSE DE REFAIRE. Sans le bouton, la
          seule façon de réessayer est de retoucher chaque champ en échec — donc
          de deviner lesquels, ce que le message vient justement d'éviter. */}
      {etat === "echec" ? (
        <div
          role="alert"
          className="fixed inset-x-0 bottom-0 z-20 border-t border-transparent bg-ds-erreur-fond px-4 py-3.5 lg:inset-x-auto lg:right-6 lg:bottom-6 lg:max-w-[420px] lg:rounded-ds-card-lg lg:border lg:shadow-ds-lg"
        >
          <p className="text-[14px] font-bold text-ds-erreur-encre">
            {t("echec", { champs: champsEnEchec.map((c) => t("nomChamp." + c)).join(", ") })}
          </p>
          <p className="mt-1 text-[13px] leading-5 text-ds-erreur-encre">{t("echecReste")}</p>
          <button
            type="button"
            onClick={relancer}
            className="mt-3 min-h-11 rounded-ds-card border border-ds-filet bg-ds-surface-carte px-[18px] text-[13px] font-semibold text-ds-erreur-encre shadow-ds-xs transition-shadow hover:shadow-ds-md lg:h-10 lg:min-h-0"
          >
            {t("reessayer")}
          </button>
        </div>
      ) : null}
    </>
  );
}

/**
 * L'EN-TÊTE DE L'ÉCRAN DE DÉTAIL — relevé au pixel sur le kit servi à 1690 px.
 *
 * Le retour est un LIEN EN TEXTE posé au-dessus du titre (14/500, écart 9),
 * puis 14 px, puis le titre à 40/800 en -0,045em sur une interligne de 1,05,
 * puis 8 px et la date de création à 15/400. À droite, les actions à 48 px de
 * haut, à l'écart de 12, alignées sur le HAUT du titre.
 *
 * LE DÉGRADÉ EST SUR « VOIR LA PAGE PUBLIQUE » et sur rien d'autre. Une seule
 * action principale par écran : c'est celle qui termine le travail, celle qu'on
 * fait avant d'envoyer le lien à son client.
 *
 * ⚠️ TROIS CHOSES DU KIT NE SONT PAS ICI, ET CHACUNE POUR UNE RAISON :
 *
 *  1. LA PILULE D'ÉTAT sous les actions (« En transit », chevron). Chez nous
 *     l'état est une liste déroulante du formulaire, 200 px plus bas. Deux
 *     contrôles pour la même valeur, sur un écran qui enregistre à la frappe,
 *     c'est deux endroits où lire un état qui peut momentanément différer.
 *  2. LE BOUTON « ··· ». Le kit y range dupliquer et archiver ; ces deux gestes
 *     vivent sur la LIGNE de la liste des commandes, pas ici. Un bouton de menu
 *     qui ouvre un menu vide est pire qu'un bouton absent.
 *  3. « MODIFIER LA COMMANDE ». Le kit sépare une vue de lecture d'un
 *     formulaire (`CreateOrder.jsx`, avec son bouton « Enregistrer en
 *     brouillon »). La décision 16 interdit le bouton d'enregistrement : notre
 *     écran EST le formulaire, et son bouton « modifier » n'aurait mené qu'à
 *     lui-même.
 */
function EnTeteDetail({
  langue,
  reference,
  creeLe,
  etat,
  lienPublic,
  versPageClient,
}: {
  readonly langue: string;
  readonly reference: string;
  readonly creeLe: string;
  readonly etat: Etat;
  readonly lienPublic: string;
  readonly versPageClient: string;
}) {
  const t = useTranslations("editeur");

  return (
    <header className="mb-[26px]">
      <LienRetour href={"/" + langue + "/commandes"} libelle={t("retour")} />

      <div className="mt-3.5 flex flex-col items-start gap-4 lg:flex-row lg:gap-5">
        <div className="min-w-0">
          <h1 className="flex items-center gap-3 text-[26px] leading-[1.05] font-extrabold tracking-[-0.045em] text-ds-texte-titre max-[560px]:text-[24px] lg:text-[40px]">
            {reference}
            {/* L'ICÔNE DU TITRE OUVRE LA PAGE CLIENT, elle n'est pas décorative :
                c'est ce que le kit dessine, et une icône de lien qui ne lie pas
                serait une promesse creuse. Elle porte donc son propre nom. */}
            <a
              href={versPageClient}
              target="_blank"
              rel="noopener noreferrer"
              className="-m-3 inline-flex min-h-11 min-w-11 items-center justify-center p-3 text-ds-accent transition-colors hover:text-ds-accent-survol lg:min-h-0 lg:min-w-0"
            >
              <ExternalLink aria-hidden="true" size={22} strokeWidth={2} />
              <span className="sr-only">{t("voirPage")}</span>
            </a>
          </h1>
          <p className="mt-2 text-[15px] leading-[1.55] text-ds-texte-corps">
            {t("creeeLe", { quand: creeLe })}
          </p>
        </div>

        <span className="hidden flex-1 lg:block" />

        <div className="hidden flex-wrap items-center gap-3 lg:flex">
          <TemoinSauvegarde etat={etat} />
          <BoutonCopier lien={lienPublic} />
          <a
            href={versPageClient}
            target="_blank"
            rel="noopener noreferrer"
            className="degrade-ds-marque flex h-12 items-center gap-2 rounded-ds-card px-[18px] text-[15px] font-semibold tracking-[-0.02em] text-ds-texte-sur-marque shadow-ds-brand transition-shadow hover:shadow-ds-brand-hover"
          >
            {t("voirPage")}
            <ExternalLink aria-hidden="true" size={16} strokeWidth={1.9} />
          </a>
        </div>

        {/* AU TÉLÉPHONE, LE TÉMOIN SEUL : les deux actions vivent dans la bande
            collée en bas, là où le pouce les atteint sans remonter. */}
        <div className="lg:hidden">
          <TemoinSauvegarde etat={etat} />
        </div>
      </div>
    </header>
  );
}

/**
 * LE PANNEAU DE SUIVI — `Panel` + `DetailTimeline` du kit.
 *
 * ⚠️ L'ÉTAPE COURANTE VIENT DU FORMULAIRE, PAS DU COLIS. `orders.status` est la
 * seule position qui fasse foi : le colis l'écrit quand il bouge (migration 090)
 * et le vendeur l'amorce avant la remise au transporteur (décision 2). La lire
 * ailleurs créerait une seconde source, et la frise montrerait autre chose que
 * la liste déroulante posée juste à côté.
 *
 * ⚠️ ET LE PANNEAU SE REND MÊME SANS NUMÉRO DE SUIVI. C'est l'état de la moitié
 * des commandes à leur création, et il est exact : « en préparation » est une
 * information, pas un vide. Ce qui est omis, ce sont les DATES et les NOTES —
 * elles n'existent que lorsqu'un transporteur les a publiées.
 */
function PanneauSuivi({
  suivi,
  statut,
}: {
  readonly suivi: {
    readonly numero: string | null;
    readonly abandonne: boolean;
    readonly quand: Readonly<Partial<Record<Etape, string>>>;
    readonly notes: Readonly<Partial<Record<Etape, string>>>;
  };
  readonly statut: string;
}) {
  const t = useTranslations("editeur");
  const courante: Etape = (ETAPES as readonly string[]).includes(statut)
    ? (statut as Etape)
    : "preparation";

  return (
    <Panneau titre={t("suiviTitre")}>
      {/* LE FOURNISSEUR A CESSÉ DE SUIVRE CE NUMÉRO, ET C'EST DIT. Un suivi qui
          s'arrête sans le dire se lit comme un suivi qui ne marche pas. */}
      {suivi.abandonne ? (
        <p className="mb-4 rounded-ds-sm bg-ds-alerte-fond p-3 text-[13px] font-medium text-ds-alerte-encre">
          {t("suiviArrete")}
        </p>
      ) : null}

      <FriseDetail
        courante={courante}
        libelleAttente={t("suiviAttente")}
        etapes={ETAPES.map((etape) => ({
          etape,
          libelle: t("statut." + etape),
          quand: suivi.quand[etape] ?? null,
          note: suivi.notes[etape] ?? null,
        }))}
      />
    </Panneau>
  );
}

/**
 * LE PANNEAU D'INFORMATIONS — `Panel` + `InfoRow` du kit.
 *
 * ⚠️ IL MET LE LIEN CLIENT EN CLAIR, et c'est le vrai apport de ce panneau. Le
 * lien n'existait à l'écran que derrière un bouton « copier » : un vendeur qui
 * veut VÉRIFIER quel lien il s'apprête à envoyer devait donc le coller quelque
 * part pour le voir. Après une révocation, c'est exactement la question qu'on
 * se pose.
 *
 * ⚠️ IL EST DANS L'ÎLOT CLIENT, pas rendu par le serveur, et ce n'est pas une
 * commodité : le numéro de suivi et le lien changent SOUS LES YEUX du vendeur —
 * l'un à la frappe, l'autre à la révocation. Rendu au serveur, ce panneau
 * afficherait la valeur du chargement, c'est-à-dire un lien mort au moment
 * précis où l'on vient le vérifier.
 *
 * ⚠️ CE BLOC AFFIRMAIT DEUX IMPOSSIBILITÉS, ET L'UNE ÉTAIT FAUSSE. Il disait
 * que « Méthode d'expédition » nommerait « un transporteur que la base porte en
 * identifiant NUMÉRIQUE 17TRACK, jamais traduit ». Le raisonnement tenait, la
 * conclusion non : 17TRACK PUBLIE son catalogue, il est figé dans le dépôt
 * depuis le 12/09 (3 502 entrées, `lib/tracking/transporteurs.json`), et la
 * ligne existe donc désormais. C'est L-014 dans sa forme la plus coûteuse — un
 * commentaire de code qui affirme un état que personne n'a exécuté, et qui a
 * servi d'excuse pour ne pas faire.
 *
 * CE QUI RESTE VRAI : « Pays de livraison » n'existe nulle part. Le destinataire
 * est un texte libre sans compte ni adresse (principe III) ; il n'y a aucune
 * adresse d'où tirer un pays, et une ligne de repli répétée à chaque commande
 * vaudrait moins que rien.
 */
function PanneauInformations({
  reference,
  dates,
  numeroSuivi,
  transporteur,
  lienPublic,
  versPageClient,
}: {
  readonly reference: string;
  readonly dates: { readonly creeLe: string; readonly misAJourLe: string };
  readonly numeroSuivi: string;
  /** Le NOM du transporteur, résolu côté serveur, ou `null` s'il est inconnu. */
  readonly transporteur: string | null;
  readonly lienPublic: string;
  readonly versPageClient: string;
}) {
  const t = useTranslations("editeur");

  return (
    <Panneau titre={t("infosTitre")}>
      <LigneInfo libelle={t("infosReference")} valeur={reference} href={versPageClient} />
      <LigneInfo libelle={t("infosCreee")} valeur={dates.creeLe} />
      <LigneInfo libelle={t("infosModifiee")} valeur={dates.misAJourLe} />
      <LigneInfo
        libelle={t("infosExpedition")}
        valeur={transporteur ?? t("infosSansTransporteur")}
      />
      {/* UNE VALEUR ABSENTE EST NOMMÉE, pas laissée à un tiret. « Aucun numéro »
          se lit ; « – » demande de deviner si la donnée manque ou si l'écran a
          échoué. */}
      <LigneInfo
        libelle={t("suivi")}
        valeur={numeroSuivi.trim() === "" ? t("infosSansSuivi") : numeroSuivi}
      />
      <LigneInfo libelle={t("infosLien")} valeur={lienPublic} href={versPageClient} />
    </Panneau>
  );
}

/**
 * Le témoin de sauvegarde, à TROIS états, EN PILULE.
 *
 * Le troisième n'est pas décoratif : « échec » sans nommer le champ oblige à
 * relire tout le formulaire pour trouver ce qui n'est pas passé, et la plupart
 * des gens ne le font pas — ils supposent que c'était secondaire. Ici la pilule
 * ne porte que l'état ; le détail vit dans le bandeau, où il y a la place de le
 * dire et un bouton pour refaire.
 */
function TemoinSauvegarde({ etat }: { readonly etat: Etat }) {
  const t = useTranslations("editeur");

  const contenu =
    etat === "encours"
      ? { Icone: Clock, texte: t("enregistrement"), classe: "bg-ds-surface-creux text-ds-texte-corps" }
      : etat === "echec"
        ? { Icone: TriangleAlert, texte: t("nonEnregistre"), classe: "bg-ds-erreur-fond text-ds-erreur-encre" }
        : { Icone: Check, texte: t("enregistre"), classe: "bg-ds-succes-fond text-ds-succes-encre" };

  return (
    <span
      // `polite` et non `assertive` : le témoin change à chaque frappe
      // temporisée, une annonce impérative couperait la parole en continu.
      aria-live="polite"
      className={
        // `Badge` du design system : rayon pilule, 12 px, gras, `padding: 5px 11px`.
        // 12 px et non 11 : la règle 5 pose 11,5 px comme plancher au téléphone,
        // et cette pilule y est rendue.
        "flex shrink-0 items-center gap-1.5 rounded-ds-pill px-[11px] py-[5px] text-[12px] font-bold whitespace-nowrap " +
        contenu.classe
      }
    >
      <contenu.Icone aria-hidden="true" size={13} strokeWidth={2.2} />
      {contenu.texte}
    </span>
  );
}

/** L'icône du bouton de copie — trois états, un seul endroit où ils sont écrits. */
function IconeCopie({ etat }: { readonly etat: "repos" | "copie" | "echec" }) {
  if (etat === "copie")
    return <Check aria-hidden="true" size={16} strokeWidth={2.2} className="text-ds-succes-encre" />;
  if (etat === "echec") return <TriangleAlert aria-hidden="true" size={16} strokeWidth={2} />;
  // À L'ACCENT, comme toutes les icônes de `DetailAction` : c'est ce qui
  // distingue ces boutons des boutons neutres du reste du produit, et la mesure
  // du kit servi le confirme — `color: var(--accent)` sur l'icône seule.
  //
  // `share-2` ET NON `copy` : c'est celle que le kit pose sur ce bouton, et
  // elle suit le libellé. Une icône de copie sous le mot « Partager » dirait
  // deux gestes différents pour un seul bouton.
  return <Share2 aria-hidden="true" size={17} strokeWidth={1.9} className="text-ds-accent" />;
}

/** Copier le lien public. Le presse-papiers n'a pas d'équivalent en HTML. */
function BoutonCopier({ lien, compact = false }: { readonly lien: string; readonly compact?: boolean }) {
  const t = useTranslations("editeur");
  const [etat, setEtat] = useState<"repos" | "copie" | "echec">("repos");

  const copier = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(lien);
      setEtat("copie");
      window.setTimeout(() => setEtat("repos"), 2000);
    } catch {
      // L'ÉTAT « COPIÉ » N'EST AFFICHÉ QU'APRÈS SUCCÈS. Un retour optimiste ici
      // est un pari sur le presse-papiers : refusé par le navigateur — ce qui
      // arrive hors contexte sécurisé et dans certaines vues intégrées — le
      // vendeur collerait le contenu précédent dans sa conversation, en croyant
      // envoyer le lien de son client.
      setEtat("echec");
    }
  };

  return (
    <button
      type="button"
      onClick={() => void copier()}
      title={etat === "echec" ? t("copieEchouee") : t("copierLien")}
      className={
        // `DetailAction` du kit : 48 px, `padding: 0 18px`, rayon de carte,
        // filet, fond carte, 14/600, ombre xs, icône à l'accent.
        "flex items-center justify-center gap-2.5 rounded-ds-card border border-ds-filet bg-ds-surface-carte " +
        "text-[14px] font-semibold shadow-ds-xs transition-colors hover:bg-ds-surface-teinte lg:h-12 " +
        (compact ? "min-h-12 w-[52px] shrink-0 lg:w-auto lg:px-[18px] " : "h-12 px-[18px] ") +
        (etat === "echec" ? "text-ds-erreur-encre" : "text-ds-texte-fort")
      }
    >
      {/* L'icône est NOMMÉE quand elle est seule, muette quand un texte
          l'accompagne — sinon un lecteur d'écran annonce deux fois la même
          chose. */}
      <IconeCopie etat={etat} />
      {/*
        ⚠️ LE LIBELLE VISIBLE EST CELUI DU KIT — « Partager » —, MAIS LE NOM
        ACCESSIBLE ET L'INFOBULLE DISENT LE GESTE EXACT.

        Le kit pose « Partager » sur ce bouton ; le nôtre copie le lien dans le
        presse-papiers, ce qui EST le geste de partage de ce produit — on envoie
        un lien dans une conversation, il n'y a rien d'autre à partager. Mais
        « Partager » ne dit pas ce qui va se passer, et c'est précisément ce
        qu'un lecteur d'écran doit annoncer : l'infobulle et le nom accessible
        gardent donc « Copier le lien ». Le retour de succès, lui, reste
        « Lien copié » — l'interface n'affirme que ce qui a eu lieu.
      */}
      {/*
        ⚠️ LE LIBELLÉ EST UN NŒUD DE TEXTE DU BOUTON, PAS UN `<span>`. Le kit
        écrit `<button>…Partager</button>` ; enveloppé, le texte devient un
        élément de 58 × 21 sans fond ni filet, et c'est LUI que la sonde
        apparie au bouton de 123 × 48 du kit. Huit propriétés d'écart sur un
        bouton parfaitement conforme : l'inventaire relève l'élément qui PORTE
        le texte, donc le balisage change ce qu'on compare.
      */}
      {compact ? (
        <span className="sr-only">{t("copierLien")}</span>
      ) : etat === "copie" ? (
        t("lienCopie")
      ) : (
        t("partager")
      )}
    </button>
  );
}

/**
 * LE CHEVRON D'UNE LISTE DÉROULANTE, DANS LE BALISAGE ET NON DANS UNE IMAGE DE
 * FOND — c'est ce que fait `SelectControl` dans le kit.
 *
 * L'ancienne façon peignait un SVG encodé en `background-image`, avec sa couleur
 * écrite EN DUR dans l'URL : elle ne pouvait suivre aucun token, et personne
 * n'aurait vu sa dérive. Ici il porte la couleur tenue du design system, comme
 * tous les autres chevrons de l'écran.
 */
const CLASSE_LISTE = "cursor-pointer appearance-none pe-11 font-semibold";

function ChampListe({ children }: { readonly children: React.ReactNode }) {
  return (
    <span className="relative block">
      {children}
      <ChevronDown
        aria-hidden="true"
        size={17}
        strokeWidth={1.8}
        className="pointer-events-none absolute end-4 top-1/2 -translate-y-1/2 text-ds-texte-tenu"
      />
    </span>
  );
}

/**
 * « La commande » — les champs, dans la grille à deux colonnes de la planche.
 *
 * LE NOM DU CLIENT EST UN TEXTE LIBRE, et le formulaire le dit sous le champ.
 * La maquette d'origine montrait une recherche de compte avec avatar et adresse
 * email : le destinataire n'a JAMAIS de compte, et une recherche laisserait
 * croire qu'il existe un annuaire d'utilisateurs — le premier réflexe serait
 * d'y chercher quelqu'un.
 *
 * ⚠️ « ÉTAT DES PHOTOS » EST UNE TROISIÈME RANGÉE QUE LA PLANCHE N'A PAS. Elle
 * dessine quatre champs ; le contrôle qualité n'en fait pas partie, parce que
 * la planche le montre là où il se décide vraiment — dans l'aperçu, côté
 * client. Mais le vendeur reçoit aussi des réponses en message privé, et
 * `qc_status` porte alors sa décision à lui. Retirer le champ aurait rendu cette
 * moitié du modèle inatteignable.
 */
function CarteCommande({
  valeurs,
  statuts,
  qcs,
  champsEnEchec,
  onChanger,
}: {
  readonly valeurs: ValeursCommande;
  readonly statuts: readonly string[];
  readonly qcs: readonly string[];
  readonly champsEnEchec: readonly string[];
  readonly onChanger: (champ: keyof ValeursCommande, valeur: string, immediat: boolean) => void;
}) {
  const t = useTranslations("editeur");

  /* `Field` du kit : 13 px, graisse moyenne, couleur de CORPS — pas d'encre
     forte. L'ancien libellé était en 12 px gras ardoise ; le design system fait
     du libellé une indication et du contenu la matière. */
  const etiquette = "mb-[9px] block text-[13px] font-medium text-ds-texte-corps";
  /*
   * ⚠️ PLUS DE `champ-editeur` NI DE `champ-liste`, ET POUR LA MÊME RAISON QUE
   * `champ-app` SUR L'ÉCRAN VOISIN. Ces classes sont déclarées HORS de toute
   * `@layer` dans `globals.css` ; Tailwind range ses utilitaires dans
   * `@layer utilities`, et une règle sans couche l'emporte sur une règle en
   * couche. Elles auraient écrasé le fond, le filet, la taille et la marge
   * droite du design system sans que rien ne le signale : les classes existent,
   * sont servies, et les gardes restent vertes. Le chevron de la liste
   * déroulante redescend donc dans le balisage, en icône Lucide — ce que fait
   * d'ailleurs `SelectControl` dans le kit.
   *
   * `CONTROL` du kit : 48 px, `padding: 0 16px`, rayon de contrôle, filet
   * appuyé, fond carte, 14 px en graisse moyenne.
   */
  const base =
    "w-full rounded-ds-control border border-ds-filet-appuye bg-ds-surface-carte px-4 text-[14px] " +
    "font-medium text-ds-texte-fort transition-shadow outline-none placeholder:font-normal " +
    "placeholder:text-ds-texte-corps focus:border-ds-filet-focus focus:shadow-[var(--anneau-ds-focus)]";
  const hauteur = "h-12";
  const enEchec = "border-ds-erreur focus:border-ds-erreur";

  const classe = (champ: keyof ValeursCommande): string =>
    base + " " + hauteur + (champsEnEchec.includes(champ) ? " " + enEchec : "");

  return (
    <Panneau titre={t("sectionCommande")}>
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2 lg:gap-4">
        <div>
          <label className={etiquette} htmlFor="customer_label">
            {t("client")}
          </label>
          <input
            id="customer_label"
            type="text"
            className={classe("customer_label")}
            placeholder={t("clientExemple")}
            value={valeurs.customer_label}
            onChange={(e) => onChanger("customer_label", e.target.value, false)}
          />
          <p className="mt-1.5 text-[13px] text-ds-texte-sourdine">{t("clientAide")}</p>
        </div>

        <div>
          <label className={etiquette} htmlFor="product_ref">
            {t("reference")}
          </label>
          <input
            id="product_ref"
            type="text"
            className={classe("product_ref")}
            placeholder={t("referenceExemple")}
            value={valeurs.product_ref}
            onChange={(e) => onChanger("product_ref", e.target.value, false)}
          />
        </div>

        <div>
          <label className={etiquette} htmlFor="tracking_number">
            {t("suivi")}
          </label>
          <input
            id="tracking_number"
            type="text"
            className={classe("tracking_number")}
            placeholder={t("suiviExemple")}
            value={valeurs.tracking_number}
            onChange={(e) => onChanger("tracking_number", e.target.value, false)}
            aria-describedby="tracking_number-aide"
          />
          {/*
            ⚠️ CETTE PHRASE EXISTAIT SUR L'ÉCRAN DES ENVOIS ET PAS ICI — c'est-à-dire
            partout SAUF à l'endroit où le vendeur colle son numéro. Il collait,
            ne voyait rien pendant des semaines, et n'avait aucun moyen de savoir
            si c'était normal. La décision 7 du brief l'impose pourtant : on dit
            « pas encore d'information du transporteur », JAMAIS « introuvable ».

            La seconde phrase vient d'une observation de Wassim : un numéro
            Colissimo remis par un fournisseur étranger n'existe dans AUCUN
            système avant la prise en charge locale — le colis a voyagé sous un
            autre identifiant. Aucun fournisseur de suivi ne peut montrer des
            événements qu'aucun transporteur n'a enregistrés sous ce numéro.
            C'est une limite du NUMÉRO, pas de la nôtre, et le vendeur a une
            action utile : réclamer le numéro d'expédition d'origine.

            ⚠️ ELLE EST ÉCRITE AU CONDITIONNEL, ET C'EST DÉLIBÉRÉ. On ne SAIT pas
            de quel type est le numéro collé : le savoir exigerait une réponse du
            fournisseur de suivi, qui n'arrive qu'APRÈS le premier scan —
            c'est-à-dire quand le vendeur a cessé de s'inquiéter. Affirmer
            « ce numéro n'est suivi qu'à l'arrivée » serait affirmer ce que la
            base n'a pas enregistré.
          */}
          <p
            id="tracking_number-aide"
            className="mt-2 text-[13px] leading-[18px] text-ds-texte-sourdine"
          >
            {t("suiviAide")}
          </p>
        </div>

        <div>
          <label className={etiquette} htmlFor="status">
            {t("sectionExpedition")}
          </label>
          {/* UNE LISTE DÉROULANTE, PAS QUATRE BOUTONS RADIO. Le statut est une
              valeur parmi quatre, et la planche lui donne la place d'un champ —
              pas d'une carte. Le changement part IMMÉDIATEMENT : c'est une
              décision, pas de la saisie. */}
          <ChampListe>
            <select
              id="status"
              className={classe("status") + " " + CLASSE_LISTE}
              value={valeurs.status}
              onChange={(e) => onChanger("status", e.target.value, true)}
            >
              {statuts.map((s) => (
                <option key={s} value={s}>
                  {t("statut." + s)}
                </option>
              ))}
            </select>
          </ChampListe>
        </div>

        <div>
          <label className={etiquette} htmlFor="qc_status">
            {t("sectionQc")}
          </label>
          <ChampListe>
            <select
              id="qc_status"
              className={classe("qc_status") + " " + CLASSE_LISTE}
              value={valeurs.qc_status}
              onChange={(e) => onChanger("qc_status", e.target.value, true)}
            >
              {qcs.map((q) => (
                <option key={q} value={q}>
                  {t("qc." + q)}
                </option>
              ))}
            </select>
          </ChampListe>
          <p className="mt-1.5 text-[13px] text-ds-texte-sourdine">{t("qcAide")}</p>
        </div>
      </div>

      <div className="mt-3.5 lg:mt-4">
        <label className={etiquette} htmlFor="internal_notes">
          {t("notes")}
        </label>
        <textarea
          id="internal_notes"
          className={
            base +
            " h-[84px] resize-none py-3 leading-[22px]" +
            (champsEnEchec.includes("internal_notes") ? " " + enEchec : "")
          }
          placeholder={t("notesExemple")}
          value={valeurs.internal_notes}
          onChange={(e) => onChanger("internal_notes", e.target.value, false)}
        />
        <p className="mt-1.5 text-[13px] text-ds-texte-sourdine">{t("notesPrivees")}</p>
      </div>
    </Panneau>
  );
}
