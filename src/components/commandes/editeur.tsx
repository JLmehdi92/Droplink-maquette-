"use client";

import { relireJusquaNouveau } from "@/lib/commandes/relecture-historique";
import { useCallback, useEffect, useRef, useState } from "react";
import { relireHistorique } from "@/app/[locale]/(app)/commandes/[id]/actions";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight, ChevronDown, ChevronRight, Lock } from "lucide-react";
import { enregistrerChamp, type ResultatEnregistrement } from "@/lib/commandes/actions";
import { lienPageClient } from "@/lib/liens/page-client";
import type { QuotaAtteint } from "@/lib/commandes/quota-atteint";
import { referenceCourte } from "@/lib/commandes/reference";
import { ETAPES, type Etape } from "@/lib/tracking/normalize";
import { FriseDetail } from "./frise-detail";
import { CarteMedias, type MediaAffiche } from "./carte-medias";
import { CarteRevocation } from "./carte-revocation";
import { ApercuClient } from "./apercu-client";
import { TuilesResume } from "./tuiles-resume";
import { BoutonCopierFiche } from "./copier-fiche";
import { titreDeCommande } from "@/lib/commandes/titre";

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
 * ⚠️ CE COMPOSANT PORTE SON EN-TÊTE : le témoin de sauvegarde vit dans l'îlot
 * d'édition, et une barre rendue par le serveur ne pourrait pas partager son état.
 *
 * LA REFONTE (02/10/2026) suit `commande.html` : fil d'Ariane, titre, témoin et
 * référence dans la même ligne, résumé en quatre compteurs, puis la grille de six
 * cartes. LE TITRE EST REDEVENU LE NOM DU CLIENT (« Nouvelle commande » sans lui) :
 * c'est la décision n° 7 de Mehdi, la maquette — la référence courte reste à côté
 * du témoin. Le panneau « Informations » disparaît avec elle : la référence, la
 * création, le numéro, le transporteur et le lien sont chacun à leur place
 * ailleurs sur l'écran ; seule la date de dernière modification n'y est plus, et
 * l'historique dit chaque modification avec son heure.
 */

type Etat = "repos" | "encours" | "echec";

export interface ValeursCommande {
  readonly customer_label: string;
  readonly product_ref: string;
  readonly tracking_number: string;
  /** Code 17TRACK du transporteur, ou "" pour la détection automatique. */
  readonly carrier_code: string;
  readonly internal_notes: string;
  readonly status: string;
  readonly qc_status: string;
}

const DELAI_TEXTE_MS = 800;



export function Editeur({
  id,
  langue,
  boutique,
  jeton,
  menusGestes,
  bandeau,
  origine,
  nomDeLien,
  versPageClient,
  initiales,
  statuts,
  qcs,
  transporteurs,
  medias,
  suivi,
  dates,
  resume,
  historique,
  historiquePlusRecent,
}: {
  readonly id: string;
  readonly langue: string;
  /** Le nom affiché de la boutique, premier maillon du fil d'Ariane ; `null` s'il n'y en a pas. */
  readonly boutique: string | null;
  readonly jeton: string;
  /**
   * Le menu « ••• » (dupliquer, archiver), rendu CÔTÉ SERVEUR par la page
   * (`MenuGestesFiche`) : son module de route est `server-only`, et c'est
   * l'import qui rend vérifiable le contrat des champs envoyés.
   */
  readonly menusGestes: { readonly bureau: ReactNode; readonly telephone: ReactNode };
  /** Le lien bloqué par l'administration (168), rendu par le serveur ; `null` sinon. */
  readonly bandeau?: ReactNode;
  readonly origine: string;
  /** Le nom de lien de la boutique, `null` si aucun n'a ete pose. */
  readonly nomDeLien: string | null;
  readonly versPageClient: string;
  readonly initiales: ValeursCommande;
  readonly statuts: readonly string[];
  /** Les transporteurs proposés, résolus côté serveur (le catalogue est `server-only`). */
  readonly transporteurs: readonly { readonly code: string; readonly nom: string }[];
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
    /** Abandonné sans jamais avoir été pris en charge : le fournisseur n'a pas reconnu le numéro. */
    readonly nonReconnu: boolean;
    /**
     * Un numéro saisi, aucun colis attaché, et la base dit que le quota de colis est
     * atteint (199) : le suivi n'a pas démarré. `null` partout ailleurs.
     */
    readonly bloque: QuotaAtteint | null;
    /** Par étape, la date à laquelle un point de passage l'a datée. */
    readonly quand: Readonly<Partial<Record<Etape, string>>>;
    /** Par étape, ce que le transporteur a dit en la franchissant. */
    readonly notes: Readonly<Partial<Record<Etape, string>>>;
  };
  /** La date de création, formatée côté serveur pour la même raison. */
  readonly dates: {
    readonly creeLe: string;
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
  /** Rendu par le SERVEUR : ses libellés ne voyagent pas dans l'hydratation. */
  readonly historique: React.ReactNode;
  /** L'identifiant de la ligne la plus récente de `historique` (`null` : aucune ligne). */
  readonly historiquePlusRecent: string | null;
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
  /*
   * LE SUIVI BLOQUÉ PAR LE QUOTA DE COLIS. Lu par le serveur au chargement (199), puis
   * tenu à jour par chaque sauvegarde du numéro ou du transporteur : une attache refusée
   * le pose, une attache réussie — ou un numéro effacé — le retire. Une sauvegarde d'un
   * AUTRE champ n'en dit rien et n'y touche pas.
   */
  const [suiviBloque, setSuiviBloque] = useState<QuotaAtteint | null>(suivi.bloque);
  /*
   * LE NUMÉRO DE VERSION DE L'APERÇU : il avance à chaque écriture que la base a
   * CONFIRMÉE — un champ, un média —, et l'aperçu se recharge sur lui. Jamais sur
   * la frappe : l'aperçu montre la page que le client recevrait maintenant, donc ce
   * que la base porte, pas ce que le champ affiche avant la réponse du serveur.
   */
  const [versionApercu, setVersionApercu] = useState(0);
  const apercuPerime = useCallback((): void => setVersionApercu((v) => v + 1), []);

  /*
   * ⚠️ L'HISTORIQUE NE SE RELISAIT PAS (audit de fidélité du 03/10/2026) : rendu par
   * le serveur et jamais relu, il ne montrait aucune des modifications qu'on venait
   * d'enregistrer, alors qu'il est la pièce qu'on relit en cas de litige. Il est
   * désormais relu après chaque écriture CONFIRMÉE (la même horloge que l'aperçu : un
   * champ, un média, la révocation), une fois par rafale (700 ms de calme), par une
   * action qui ne lit QUE lui (`relireHistorique`) — jamais par `router.refresh()`, qui
   * réexécutait toute la page et comptait une ouverture d'éditeur de plus à chaque fois.
   * Jamais sur la frappe : l'historique dit ce que la base a écrit.
   */
  const [historiqueRelu, setHistoriqueRelu] = useState<{ readonly bloc: ReactNode; readonly plusRecent: string } | null>(
    null,
  );
  // UN HISTORIQUE NEUF DU SERVEUR (navigation, rechargement) remplace la relecture : sans
  // cela, une relecture plus ancienne resterait affichée par-dessus (contre-audit du 03/10).
  const [historiqueVu, setHistoriqueVu] = useState(historique);
  if (historiqueVu !== historique) {
    setHistoriqueVu(historique);
    setHistoriqueRelu(null);
  }
  const plusRecentConnu = historiqueRelu?.plusRecent ?? historiquePlusRecent;
  // Lu dans l'effet sans le relancer : seul un nouveau geste relance la série.
  const plusRecentRef = useRef(plusRecentConnu);
  useEffect(() => {
    plusRecentRef.current = plusRecentConnu;
  }, [plusRecentConnu]);
  /*
   * LE JOURNAL S'ÉCRIT APRÈS LA RÉPONSE (`journaliserApres`) : une seule relecture à
   * 700 ms pouvait le devancer. On relit à 700 ms, 1,5 s puis 3 s, jusqu'à ce que la ligne
   * la plus récente change (`relireJusquaNouveau`). Les rafales ne sont PAS fusionnées en
   * une ligne, contrairement à la démonstration de la maquette (`commande.js`) : chaque
   * ligne est une écriture réelle en base, et l'historique sert de preuve.
   */
  // Une série encore en cours quand un nouveau geste arrive : la suivante ira jusqu'au bout.
  const serieEnCours = useRef(false);
  useEffect(() => {
    if (versionApercu === 0) return;
    let abandonne = false;
    const jusquAuBout = serieEnCours.current;
    serieEnCours.current = true;
    relireJusquaNouveau({
      relire: () => relireHistorique(id),
      connu: plusRecentRef.current,
      attendre: (ms) => new Promise((ok) => window.setTimeout(ok, ms)),
      abandonne: () => abandonne,
      jusquAuBout,
      surNouvelle: (relue) => {
        if (!abandonne) setHistoriqueRelu(relue);
      },
    })
      .then((relue) => {
        if (abandonne) return;
        serieEnCours.current = false;
        if (relue !== null) setHistoriqueRelu(relue);
      })
      .catch((erreur: unknown) => {
        // L'historique affiché reste celui d'avant : il est vrai, simplement en retard.
        console.error("[editeur] relecture de l'historique impossible", erreur);
      });
    return () => {
      abandonne = true;
    };
  }, [versionApercu, id]);

  // Une commande toute neuve (aucun client encore) : le curseur attend le nom du client
  // (maquette, `commande.js`) — à la souris seulement, au téléphone le clavier couvrirait
  // l'écran. Décidé à l'OUVERTURE de la fiche, une fois : jamais en cours de saisie.
  const [nomInitial] = useState(initiales.customer_label);
  useEffect(() => {
    if (nomInitial.trim() !== "" || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    document.getElementById("customer_label")?.focus({ preventScroll: true });
  }, [nomInitial]);

  const appliquer = useCallback(
    (champ: keyof ValeursCommande, valeur: string, resultat: ResultatEnregistrement): void => {
      if (resultat.statut === "ok") {
        apercuPerime();
        if (champ === "tracking_number" || champ === "carrier_code") {
          setSuiviBloque(resultat.suiviBloque ?? null);
        }
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
    [apercuPerime],
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

  // UN SEUL POINT D'EMISSION pour l'adresse de la page client : cinq ecrans
  // la fabriquaient a la main, et depuis les migrations 182-184 il y en a DEUX
  // formes. Voir `lib/liens/page-client.ts`.
  const lienPublic = lienPageClient(origine, jetonCourant, nomDeLien);

  const titre = titreDeCommande(valeurs.customer_label, t("titre"));
  // L'ONGLET SUIT LA FRAPPE, comme le titre (maquette `commande.js`) : la même règle
  // (`titreDeCommande`) que les métadonnées du serveur, donc le même texte au rechargement.
  useEffect(() => {
    document.title = titre;
  }, [titre]);

  return (
    <>
      <div className="tableau__tete fiche__tete">
        <div>
          <p className="v4-fil">
            {boutique === null ? null : (
              <>
                <span>{boutique}</span>
                <ChevronRight aria-hidden="true" className="ic" />
              </>
            )}
            <Link href={"/" + langue + "/commandes"}>{t("filCommandes")}</Link>
            <ChevronRight aria-hidden="true" className="ic" />
            <b>{titre}</b>
          </p>
          {/* LE TITRE SUIT LE NOM DU CLIENT, à la frappe (décision n° 7 de Mehdi :
              la maquette). Sans nom, « Nouvelle commande » — la même règle que
              l'onglet du navigateur, `titreDeCommande`, écrite une seule fois. */}
          <h1>{titre}</h1>
          <p className="fiche__meta">
            <TemoinSauvegarde etat={etat} />
            <span aria-hidden="true">·</span>
            <span>{t("creeeLe", { quand: dates.creeLe })}</span>
            <span aria-hidden="true">·</span>
            <span className="fiche__ref">{referenceCourte(id)}</span>
          </p>
        </div>
        <div className="fiche__actions">
          {/* Le menu « ••• » (dupliquer, archiver, sortir des archives) : la maquette
              n'en dessine pas, mais ces gestes n'ont pas d'autre chemin au téléphone. */}
          {menusGestes.bureau}
          <BoutonCopierFiche lien={lienPublic} className="bouton-outil" avecTexte />
          <a className="ed-voir" href={versPageClient} target="_blank" rel="noopener noreferrer">
            <span>{t("voirPage")}</span>
            <ArrowUpRight aria-hidden="true" className="ic" />
          </a>
        </div>
        <div className="fiche__actions-mobile">{menusGestes.telephone}</div>
      </div>

      {/* Le lien bloqué d'abord : c'est ce qui a changé pour le client. */}
      {bandeau ?? null}

      <TuilesResume
        client={valeurs.customer_label}
        reference={valeurs.product_ref}
        numeroSuivi={valeurs.tracking_number}
        transporteur={resume.transporteur}
        vues={resume.vues}
        derniereVueLe={resume.derniereVueLe}
      />

      {/*
        LA GRILLE DE LA MAQUETTE (`.fiche__grille`, par zones) : la commande et
        l'aperçu, les médias et le lien, le suivi et l'historique. Sous 1 100 px elle
        passe sur une colonne, dans l'ordre du travail au téléphone : les photos
        d'abord — le vendeur qui ouvre une commande vient en déposer —, le lien à
        révoquer en dernier. L'aperçu n'y est plus : la vraie page est à un bouton,
        dans la bande du bas.
      */}
      <div className="fiche__grille">
        <CarteCommande
          valeurs={valeurs}
          statuts={statuts}
          qcs={qcs}
          transporteurs={transporteurs}
          champsEnEchec={champsEnEchec}
          onChanger={changer}
        />
        <ApercuClient jeton={jetonCourant} versPageClient={versPageClient} version={versionApercu} />
        <CarteMedias
          orderId={id}
          initiaux={medias.initiaux}
          plafondMedias={medias.plafondMedias}
          plafondVideos={medias.plafondVideos}
          typesAcceptes={medias.typesAcceptes}
          onEnregistre={apercuPerime}
        />
        <CarteRevocation
          orderId={id}
          lienPublic={lienPublic}
          onNouveauJeton={(nouveau) => {
            setJetonCourant(nouveau);
            apercuPerime();
          }}
        />
        <PanneauSuivi
          suivi={suivi}
          bloque={suiviBloque}
          versPasserPro={"/" + langue + "/passer-pro"}
          statut={valeurs.status}
        />
        {historiqueRelu?.bloc ?? historique}
      </div>

      {/* LA BANDE D'ACTION DU TÉLÉPHONE, collée en bas : « voir la page client » est
          le geste qui termine le travail, et le pouce l'atteint sans remonter. */}
      <div className="ed-barre-mobile">
        <BoutonCopierFiche lien={lienPublic} className="ed-barre-mobile__copier" />
        <a className="ed-barre-mobile__voir" href={versPageClient} target="_blank" rel="noopener noreferrer">
          {t("voirPage")}
          <ArrowUpRight aria-hidden="true" className="ic" />
        </a>
      </div>

      {/* L'ÉCHEC NOMME LES CHAMPS ET PROPOSE DE REFAIRE. Sans le bouton, la seule
          façon de réessayer serait de retoucher chaque champ en échec — donc de
          deviner lesquels, ce que le message vient justement d'éviter. */}
      {etat === "echec" ? (
        <div role="alert" className="ed-echec">
          <p className="ed-echec__titre">
            {t("echec", { champs: champsEnEchec.map((c) => t("nomChamp." + c)).join(", ") })}
          </p>
          <p>{t("echecReste")}</p>
          <button type="button" onClick={relancer} className="bouton-app bouton-app--second">
            {t("reessayer")}
          </button>
        </div>
      ) : null}
    </>
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
  bloque,
  versPasserPro,
  statut,
}: {
  readonly bloque: QuotaAtteint | null;
  readonly versPasserPro: string;
  readonly suivi: {
    readonly numero: string | null;
    readonly abandonne: boolean;
    readonly nonReconnu: boolean;
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
    <section className="bloc ed-carte ed-carte--suivi" aria-labelledby="ed-suivi-titre">
      <header className="ed-carte__tete">
        <h2 id="ed-suivi-titre">{t("suiviTitre")}</h2>
      </header>
      {/* LE FOURNISSEUR A CESSÉ DE SUIVRE CE NUMÉRO, ET LA CAUSE EST NOMMÉE :
          « non reconnu » appelle un geste (préciser le transporteur, qui relance le
          suivi) ; « arrêté » n'en appelle aucun. */}
      {suivi.abandonne ? (
        <p className="ed-avis">{suivi.nonReconnu ? t("suiviNonReconnu") : t("suiviArrete")}</p>
      ) : null}

      {/* LE SUIVI N'A PAS DÉMARRÉ (quota de colis, 199), ET C'EST DIT : sans cet avis,
          la frise dirait « en attente » pour toujours. En gratuit le quota est à vie,
          le seul geste est le Pro ; en Pro il se recharge le 1er. */}
      {bloque !== null ? (
        <p role="status" className="ed-avis">
          {bloque === "gratuit" ? (
            <>
              {t("suiviBloqueGratuit")}{" "}
              {/* INSÉCABLE : coupé en « Passer au » / « Pro », le geste se lisait en deux morceaux. */}
              <Link href={versPasserPro} className="ed-avis__lien">
                {t("suiviBloquePasserPro")}
              </Link>
            </>
          ) : (
            t("suiviBloqueMensuel")
          )}
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
    </section>
  );
}

/**
 * LE TÉMOIN DE SAUVEGARDE (maquette, `.temoin`), à TROIS états.
 *
 * Le troisième n'est pas décoratif : « échec » sans nommer le champ oblige à relire
 * tout le formulaire. Ici le témoin ne porte que l'état ; le détail vit dans
 * l'encart d'échec, où il y a la place de le dire et un bouton pour refaire.
 * `polite` et non `assertive` : il change à chaque frappe temporisée, une annonce
 * impérative couperait la parole en continu.
 */
function TemoinSauvegarde({ etat }: { readonly etat: Etat }) {
  const t = useTranslations("editeur");
  const texte = etat === "encours" ? t("enregistrement") : etat === "echec" ? t("nonEnregistre") : t("enregistre");
  return (
    <span
      className="temoin"
      data-etat={etat === "encours" ? "cours" : etat === "echec" ? "echec" : "ok"}
      role="status"
      aria-live="polite"
    >
      <i aria-hidden="true" />
      <span>{texte}</span>
    </span>
  );
}

/**
 * UNE LISTE DÉROULANTE DE LA MAQUETTE (`.ed-liste`) : le chevron dans le balisage,
 * en icône Lucide, jamais en image de fond à la couleur écrite en dur.
 */
function ChampListe({ children }: { readonly children: React.ReactNode }) {
  return (
    <span className="ed-liste">
      {children}
      <ChevronDown aria-hidden="true" className="ic" />
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
  transporteurs,
  champsEnEchec,
  onChanger,
}: {
  readonly valeurs: ValeursCommande;
  readonly statuts: readonly string[];
  readonly qcs: readonly string[];
  readonly transporteurs: readonly { readonly code: string; readonly nom: string }[];
  readonly champsEnEchec: readonly string[];
  readonly onChanger: (champ: keyof ValeursCommande, valeur: string, immediat: boolean) => void;
}) {
  const t = useTranslations("editeur");
  // Un champ dont l'écriture a échoué se marque (`aria-invalid`), et la feuille le
  // peint : le témoin dit « non enregistré », le champ dit lequel.
  const enEchec = (champ: keyof ValeursCommande): true | undefined =>
    champsEnEchec.includes(champ) ? true : undefined;

  return (
    <section className="bloc ed-carte ed-carte--commande" aria-labelledby="ed-commande">
      <header className="ed-carte__tete">
        <h2 id="ed-commande">{t("sectionCommande")}</h2>
      </header>
      <div className="ed-champs">
        <div className="ed-champ">
          <label htmlFor="customer_label">{t("client")}</label>
          <input
            id="customer_label"
            type="text"
            autoComplete="off"
            placeholder={t("clientExemple")}
            value={valeurs.customer_label}
            aria-invalid={enEchec("customer_label")}
            aria-describedby="customer_label-aide"
            onChange={(e) => onChanger("customer_label", e.target.value, false)}
          />
          {/* UN TEXTE LIBRE, et le formulaire le dit : le destinataire n'a JAMAIS de
              compte, et une recherche laisserait croire à un annuaire d'utilisateurs. */}
          <p className="ed-aide" id="customer_label-aide">
            {t("clientAide")}
          </p>
        </div>

        <div className="ed-champ">
          <label htmlFor="product_ref">{t("reference")}</label>
          <input
            id="product_ref"
            type="text"
            autoComplete="off"
            placeholder={t("referenceExemple")}
            value={valeurs.product_ref}
            aria-invalid={enEchec("product_ref")}
            onChange={(e) => onChanger("product_ref", e.target.value, false)}
          />
        </div>

        <div className="ed-champ">
          <label htmlFor="tracking_number">{t("suivi")}</label>
          {/*
            ⚠️ AUCUN « Colissimo reconnu » DEVINÉ DANS LE NAVIGATEUR, contrairement à la
            maquette (arbitrage du § 5) : la détection réelle est serveur, et afficher
            une supposition serait affirmer ce que la base n'a pas (contrainte 8). Le
            transporteur reconnu s'affiche dans le résumé, une fois lu en base.
          */}
          <span className="ed-suivi">
            <input
              id="tracking_number"
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder={t("suiviExemple")}
              value={valeurs.tracking_number}
              aria-invalid={enEchec("tracking_number")}
              aria-describedby="tracking_number-aide"
              onChange={(e) => onChanger("tracking_number", e.target.value, false)}
            />
          </span>
          {/*
            LA PHRASE EST AU CONDITIONNEL, ET C'EST DÉLIBÉRÉ (décision 7 : « pas encore
            d'information », jamais « introuvable »). On ne SAIT pas de quel type est le
            numéro collé avant le premier scan ; un numéro remis par un fournisseur
            étranger peut n'exister chez aucun transporteur avant la prise en charge
            locale — une limite du NUMÉRO, et le vendeur a un geste utile : réclamer le
            numéro d'expédition d'origine.
          */}
          <p className="ed-aide" id="tracking_number-aide">
            {t("suiviAide")}
          </p>
        </div>

        <div className="ed-champ">
          <label htmlFor="carrier_code">{t("transporteur")}</label>
          {/*
            LE SEUL GESTE QUI RÉPARE UN NUMÉRO NON RECONNU : le fournisseur abandonne
            alors le suivi et attend qu'on lui nomme le transporteur ; la base relance
            la prise en charge quand un transporteur NOUVEAU est choisi (164). Une liste
            et pas un texte libre : la base attend un code du fournisseur. Le choix part
            immédiatement — c'est une décision, pas de la saisie.
          */}
          <ChampListe>
            <select
              id="carrier_code"
              value={valeurs.carrier_code}
              aria-invalid={enEchec("carrier_code")}
              aria-describedby="carrier_code-aide"
              onChange={(e) => onChanger("carrier_code", e.target.value, true)}
            >
              <option value="">{t("transporteurAuto")}</option>
              {transporteurs.map((tr) => (
                <option key={tr.code} value={tr.code}>
                  {tr.nom}
                </option>
              ))}
            </select>
          </ChampListe>
          <p className="ed-aide" id="carrier_code-aide">
            {t("transporteurAide")}
          </p>
        </div>

        <div className="ed-champ">
          <label htmlFor="status">{t("sectionExpedition")}</label>
          <ChampListe>
            <select
              id="status"
              value={valeurs.status}
              aria-invalid={enEchec("status")}
              onChange={(e) => onChanger("status", e.target.value, true)}
            >
              {statuts.map((st) => (
                <option key={st} value={st}>
                  {t("statut." + st)}
                </option>
              ))}
            </select>
          </ChampListe>
        </div>

        {/* L'ÉTAT DES PHOTOS : le vendeur reçoit aussi des réponses en message privé,
            et `qc_status` porte alors SA décision. */}
        <div className="ed-champ">
          <label htmlFor="qc_status">{t("sectionQc")}</label>
          <ChampListe>
            <select
              id="qc_status"
              value={valeurs.qc_status}
              aria-invalid={enEchec("qc_status")}
              aria-describedby="qc_status-aide"
              onChange={(e) => onChanger("qc_status", e.target.value, true)}
            >
              {qcs.map((q) => (
                <option key={q} value={q}>
                  {t("qc." + q)}
                </option>
              ))}
            </select>
          </ChampListe>
          <p className="ed-aide" id="qc_status-aide">
            {t("qcAide")}
          </p>
        </div>

        <div className="ed-champ ed-champ--large">
          <label htmlFor="internal_notes">
            {t("notes")}
            <Lock aria-hidden="true" className="ic" />
          </label>
          <textarea
            id="internal_notes"
            rows={3}
            placeholder={t("notesExemple")}
            value={valeurs.internal_notes}
            aria-invalid={enEchec("internal_notes")}
            aria-describedby="internal_notes-aide"
            onChange={(e) => onChanger("internal_notes", e.target.value, false)}
          />
          <p className="ed-aide" id="internal_notes-aide">
            {t("notesPrivees")}
          </p>
        </div>
      </div>
    </section>
  );
}
