"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Clock,
  Copy,
  ExternalLink,
  TriangleAlert,
} from "lucide-react";
import { enregistrerChamp, type ResultatEnregistrement } from "@/lib/commandes/actions";
import { titreDeCommande } from "@/lib/commandes/titre";
import { CarteMedias, type MediaAffiche } from "./carte-medias";
import { CarteRevocation } from "./carte-revocation";
import { ApercuClient, type PaletteApercu } from "./apercu-client";
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
 * ⚠️ CE COMPOSANT PORTE LA BARRE HAUTE, ce qui n'était pas le cas. Les deux
 * planches y posent le témoin de sauvegarde en PILULE, à côté du nom du client.
 * Un témoin qui vit dans l'îlot d'édition et une barre rendue par le serveur ne
 * peuvent pas partager d'état : soit la barre descend ici, soit le témoin
 * remonte par un mécanisme qu'il faudrait inventer. Elle descend. Effet de bord
 * heureux : le titre suit la saisie, comme l'aperçu.
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
      <BarreHaute
        langue={langue}
        titre={titreDeCommande(valeurs.customer_label, t("titre"))}
        reference={valeurs.product_ref}
        etat={etat}
        lienPublic={lienPublic}
        versPageClient={versPageClient}
      />

      <div className="flex flex-col gap-3 px-margin-mobile py-3.5 lg:grid lg:grid-cols-[1fr_372px] lg:items-start lg:gap-[18px] lg:px-[26px] lg:py-5">
        {/*
          L'ORDRE DES CARTES N'EST PAS LE MÊME AU TÉLÉPHONE ET AU BUREAU, et les
          planches sont explicites : au bureau « La commande » puis « Photos »,
          au téléphone l'inverse. La raison tient au geste — sur 390 px, le
          vendeur qui ouvre une commande vient déposer des photos ; au bureau, il
          voit les deux cartes d'un coup et lit de haut en bas.
        */}
        <div className="flex flex-col gap-3 lg:gap-4">
          <div className="order-2 lg:order-1">
            <CarteCommande
              valeurs={valeurs}
              statuts={statuts}
              qcs={qcs}
              champsEnEchec={champsEnEchec}
              onChanger={changer}
            />
          </div>

          <div className="order-1 lg:order-2">
            <CarteMedias
              orderId={id}
              initiaux={medias.initiaux}
              plafondMedias={medias.plafondMedias}
              plafondVideos={medias.plafondVideos}
              typesAcceptes={medias.typesAcceptes}
              onMedias={setMediasCourants}
            />
          </div>

          <div className="order-3">
            <CarteRevocation orderId={id} jeton={jetonCourant} onNouveauJeton={setJetonCourant} />
          </div>
        </div>

        {/*
          L'APERÇU ET L'HISTORIQUE NE SE RENDENT PAS AU TÉLÉPHONE, et les
          planches non plus. Sur 390 px, un aperçu de la page publique posé sous
          les champs serait une seconde page à faire défiler avant d'atteindre
          quoi que ce soit — et la vraie page est à un bouton, en bas de l'écran.
        */}
        <div className="hidden flex-col gap-4 lg:flex">
          <ApercuClient
            nomBoutique={boutique.nom}
            logoUrl={boutique.logoUrl}
            palette={boutique.palette}
            client={valeurs.customer_label}
            medias={mediasCourants}
            libelles={boutique.libellesApercu}
          />
          {historique}
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
          <p className="text-[14px] font-bold text-ds-erreur">
            {t("echec", { champs: champsEnEchec.map((c) => t("nomChamp." + c)).join(", ") })}
          </p>
          <p className="mt-1 text-[13px] leading-5 text-ds-erreur">{t("echecReste")}</p>
          <button
            type="button"
            onClick={relancer}
            className="mt-3 min-h-11 rounded-ds-card border border-ds-filet bg-ds-surface-carte px-[18px] text-[13px] font-semibold text-ds-erreur shadow-ds-xs transition-shadow hover:shadow-ds-md lg:h-10 lg:min-h-0"
          >
            {t("reessayer")}
          </button>
        </div>
      ) : null}
    </>
  );
}

/**
 * LA BARRE HAUTE : d'où l'on vient, ce qu'on édite, l'état de la sauvegarde, et
 * les deux gestes qui suivent l'édition — copier le lien, l'ouvrir.
 *
 * LE DÉGRADÉ EST SUR « VOIR LA PAGE PUBLIQUE » et sur rien d'autre. Une seule
 * action principale par écran : c'est celle qui termine le travail, celle qu'on
 * fait avant d'envoyer le lien à son client.
 */
function BarreHaute({
  langue,
  titre,
  reference,
  etat,
  lienPublic,
  versPageClient,
}: {
  readonly langue: string;
  readonly titre: string;
  readonly reference: string;
  readonly etat: Etat;
  readonly lienPublic: string;
  readonly versPageClient: string;
}) {
  const t = useTranslations("editeur");

  return (
    <header className="sticky top-0 z-20 flex shrink-0 items-center gap-3 border-b border-ds-filet bg-ds-surface-carte px-4 py-3 lg:gap-[18px] lg:px-[26px] lg:py-3.5">
      {/* 44 px au doigt sur fond gris, 38 px bordé à la souris : les deux
          planches ne dessinent pas le même bouton de retour. */}
      <Link
        href={"/" + langue + "/commandes"}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-ds-card bg-ds-surface-teinte text-ds-accent-encre transition-colors hover:bg-ds-lavender-200 lg:h-10 lg:w-10 lg:border lg:border-ds-filet lg:bg-ds-surface-carte lg:text-ds-texte-corps lg:hover:bg-ds-surface-teinte lg:hover:text-ds-texte-fort"
        title={t("retour")}
      >
        <ArrowLeft aria-hidden="true" size={18} strokeWidth={1.9} />
        <span className="sr-only">{t("retour")}</span>
      </Link>

      <div className="min-w-0 flex-grow lg:flex-grow-0">
        <h1 className="truncate text-[16px] font-bold tracking-[-0.025em] text-ds-texte-titre lg:text-[18px]">
          {titre}
        </h1>
        {reference.trim() !== "" ? (
          <p className="truncate text-[13px] text-ds-texte-corps">{reference}</p>
        ) : null}
      </div>

      <TemoinSauvegarde etat={etat} />

      <span className="hidden flex-grow lg:block" />

      <div className="hidden items-center gap-2.5 lg:flex">
        <BoutonCopier lien={lienPublic} />
        <a
          href={versPageClient}
          target="_blank"
          rel="noopener noreferrer"
          className="degrade-ds-marque flex h-12 items-center gap-2 rounded-ds-card px-[18px] text-[14px] font-semibold text-ds-texte-sur-marque shadow-ds-brand transition-shadow hover:shadow-ds-brand-hover"
        >
          {t("voirPage")}
          <ExternalLink aria-hidden="true" size={16} strokeWidth={1.9} />
        </a>
      </div>
    </header>
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
        ? { Icone: TriangleAlert, texte: t("nonEnregistre"), classe: "bg-ds-erreur-fond text-ds-erreur" }
        : { Icone: Check, texte: t("enregistre"), classe: "bg-ds-succes-fond text-ds-succes" };

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
    return <Check aria-hidden="true" size={16} strokeWidth={2.2} className="text-ds-succes" />;
  if (etat === "echec") return <TriangleAlert aria-hidden="true" size={16} strokeWidth={2} />;
  return <Copy aria-hidden="true" size={16} strokeWidth={1.9} />;
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
        (etat === "echec" ? "text-ds-erreur" : "text-ds-texte-fort")
      }
    >
      {/* L'icône est NOMMÉE quand elle est seule, muette quand un texte
          l'accompagne — sinon un lecteur d'écran annonce deux fois la même
          chose. */}
      <IconeCopie etat={etat} />
      {compact ? (
        <span className="sr-only">{t("copierLien")}</span>
      ) : (
        <span>{etat === "copie" ? t("lienCopie") : t("copierLien")}</span>
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
    "placeholder:text-ds-texte-tenu focus:border-ds-filet-focus focus:shadow-[var(--anneau-ds-focus)]";
  const hauteur = "h-12";
  const enEchec = "border-ds-erreur focus:border-ds-erreur";

  const classe = (champ: keyof ValeursCommande): string =>
    base + " " + hauteur + (champsEnEchec.includes(champ) ? " " + enEchec : "");

  return (
    <section className="rounded-ds-card-lg border border-ds-filet bg-ds-surface-carte p-5 shadow-ds-card lg:p-6">
      {/* `Panel` du kit : titre 18 px, gras, tracking -0,025em, 20 px sous lui. */}
      <h2 className="mb-5 text-[18px] font-bold tracking-[-0.025em] text-ds-texte-titre">
        {t("sectionCommande")}
      </h2>

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
    </section>
  );
}
