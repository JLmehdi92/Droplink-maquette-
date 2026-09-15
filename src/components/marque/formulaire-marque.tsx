"use client";

import { ACCEPT_LOGO } from "@/lib/boutique/types-logo";

import { normaliserLien } from "@/lib/boutique/normaliser-lien";
import { useActionState, useMemo, useRef, useState } from "react";
import { BoutonAction, type LibellesBoutonAction } from "@/components/bouton-action";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { Eye, IdCard, Link as LinkIcon, Palette } from "lucide-react";
import { Panneau } from "@/components/app/panneau";
import { LANGUES, estLangueSupportee, type Langue } from "@/i18n/config";
import { substituerNom, type LibellesApercu } from "@/lib/boutique/phrases-apercu";
import {
  confirmerLogo,
  enregistrerMarque,
  preparerLogo,
  supprimerLogo,
  type ResultatMarque,
} from "@/app/[locale]/(app)/marque/actions";
import { resoudreAccent } from "@/lib/design/contraste";
import { DESCRIPTION_MAX } from "@/lib/boutique/bornes";
import { logoReduit } from "@/lib/medias/vignette";
import { limites } from "@/lib/storage/limites";

/**
 * RÉGLAGES DE MARQUE, porté sur le canevas Claude Design.
 *
 * La géométrie de la maquette est reprise telle quelle : grille bento, cartes
 * `rounded-xl shadow-sm p-6`, zone de dépôt en pointillés, saisie hexadécimale
 * précédée de son échantillon, pastilles de teintes, aperçu pleine largeur,
 * barre d'actions séparée par un filet.
 *
 * SON VOCABULAIRE, LUI, NE L'EST PAS. La maquette propose de « remplacer la
 * marque DropLink » sur les pages clients : le produit ne fait pas ça. La page
 * publique porte le nom du vendeur dès le départ, et la mention « Powered by
 * DropLink » reste. On règle sa propre marque, on n'en retire pas une autre.
 *
 * PAS DE SAUVEGARDE AUTOMATIQUE, contrairement à l'éditeur de commande. Celui-ci
 * touche une commande que personne ne regarde à cet instant ; ici, un seul geste
 * rhabille toutes les pages du vendeur en même temps. Enregistrer à chaque
 * frappe ferait défiler des couleurs intermédiaires chez ses clients pendant
 * qu'il tape un code hexadécimal.
 *
 * L'APERÇU MONTRE LE CONTRASTE RÉSOLU, jamais la couleur brute : le brief exige
 * que la conformité soit obtenue automatiquement, sans que le vendeur ait à
 * chercher une couleur qui marche.
 */

const INITIAL: ResultatMarque = { statut: "inactif" };


type EtatLogo =
  | { phase: "aucun" }
  | { phase: "existant"; url: string }
  | { phase: "envoi" }
  | { phase: "pose"; apercu: string; nom: string; octets: number }
  | { phase: "erreur"; motif: string };

/**
 * ⚠️ IL PORTAIT LA COULEUR DU VENDEUR, IL PORTE LE DÉGRADÉ DE MARQUE.
 *
 * C'est une action de DropLink sur une surface DropLink — exactement la
 * correction déjà faite sur la connexion, où le bouton principal peignait
 * `--accent-remplissage`. La couleur que le vendeur est en train de choisir se
 * démontre dans l'aperçu, à droite, et dans les trois mesures de contraste ;
 * elle n'a pas à peindre nos propres commandes, et un bouton qui change de
 * teinte pendant qu'on tape un code hexadécimal ne se lit plus comme un bouton.
 *
 * PLEINE LARGEUR AU TÉLÉPHONE : c'est la seule action de l'écran, en bas d'une
 * colonne qu'on parcourt au pouce. La coincer à droite en ferait la plus petite
 * cible d'une page qui n'en a qu'une.
 */
/**
 * ⚠️ L'ÉTAT DE RÉUSSITE VIENT DU SERVEUR, PAS DU CLIC. `statut` est ce que
 * `enregistrerMarque` a RÉPONDU : « enregistre » n'existe que si l'écriture a
 * abouti. C'est le principe XII — l'interface n'affirme jamais ce que la base
 * n'a pas enregistré — et c'est la raison pour laquelle ce mappage vit ici,
 * dans le seul endroit qui connaît la réponse, plutôt que dans le bouton.
 */
function BoutonEnregistrer({
  libelles,
  statut,
}: {
  readonly libelles: LibellesBoutonAction;
  readonly statut: ResultatMarque["statut"];
}) {
  return (
    <BoutonAction
      libelles={libelles}
      resultat={statut === "enregistre" ? "reussi" : statut === "erreur" ? "echoue" : null}
      /* 48 px et rayon de CARTE : c'est le bouton principal du kit, le même que
         « Voir la page publique » de l'éditeur. Son ombre était écrite en dur sur
         l'ANCIEN violet `#7c5cf5` ; `shadow-ds-brand` la porte sur `#5B4BF5`,
         donc sur l'accent réel. */
      className="degrade-ds-marque flex h-12 w-full items-center justify-center gap-2 rounded-ds-card px-[18px] text-[15px] font-semibold tracking-[-0.02em] text-ds-texte-sur-marque shadow-ds-brand transition-shadow hover:shadow-ds-brand-hover disabled:opacity-60 lg:w-auto"
    />
  );
}

export function FormulaireMarque({
  initial,
  libelles,
}: {
  /*
   * ⚠️ LES DEUX LANGUES ARRIVENT, PAS UNE. Cet écran porte le sélecteur qui
   * DÉCIDE de la langue des pages client : son aperçu doit basculer sous les
   * yeux du vendeur au moment où il choisit, sinon le réglage reste abstrait —
   * et c'est précisément ce qui a produit le malentendu du 06/09/2026. Un
   * aller-retour serveur par changement de `<select>` serait absurde pour six
   * chaînes ; les deux jeux pèsent quelques centaines d'octets.
   */
  readonly libelles: Record<Langue, LibellesApercu>;
  readonly initial: {
    readonly nom: string;
    readonly description: string;
    /** L'origine publique du site, pour le champ verrouillé de la section 5. */
    readonly origine: string;
    /**
     * Le plafond du logo, en kilo-octets, tel que la configuration le pose.
     *
     * ⚠️ IL DESCEND DU SERVEUR PLUTOT QUE D ETRE ECRIT ICI : il vient de
     * `DEPOT_LOGO_MAX_KO`, donc il change sans que ce fichier bouge. Un
     * nombre recopie dans une phrase promettrait au vendeur une limite que
     * le depot refuserait — et il ne le decouvrirait qu au refus.
     */
    readonly plafondLogoKo: number;
    readonly couleur: string;
    readonly languePublique: Langue;
    readonly filigrane: boolean;
    readonly logoUrl: string | null;
    readonly reseaux: {
      readonly instagram: string | null;
      readonly tiktok: string | null;
      readonly whatsapp: string | null;
      readonly site: string | null;
    };
  };
}) {
  const t = useTranslations("marque");
  const [resultat, action] = useActionState(enregistrerMarque, INITIAL);

  const [nom, setNom] = useState(initial.nom);
  /*
   * L'ORIGINE MONTRÉE DANS LE CHAMP VERROUILLÉ DE LA SECTION 5.
   *
   * ⚠️ ELLE VIENT DU SERVEUR, jamais de `window.location` : cet écran est un
   * îlot client, et lire l'origine du navigateur ferait afficher
   * `localhost:3000` sur une capture de développement et le domaine réel
   * ailleurs — deux vérités pour un seul texte. Vide, on n'affiche que la
   * barre oblique plutôt qu'un domaine inventé.
   */
  const origineLisible =
    initial.origine === "" ? "/" : initial.origine.replace(/^https?:\/\//, "") + "/";
  const [description, setDescription] = useState(initial.description);
  const [couleur, setCouleur] = useState(initial.couleur);
  const [langue, setLangue] = useState<Langue>(initial.languePublique);
  /*
   * CE QUE VERRONT LES CLIENTS, dans la langue que le vendeur est en train de
   * choisir — jamais dans celle de son interface. `t(...)` reste employé partout
   * ailleurs sur cet écran : il parle au VENDEUR.
   */
  const phrasesClient = libelles[langue];
  const [filigrane, setFiligrane] = useState(initial.filigrane);
  const [logo, setLogo] = useState<EtatLogo>(
    initial.logoUrl === null ? { phase: "aucun" } : { phase: "existant", url: initial.logoUrl },
  );
  /*
   * LES RÉSEAUX SONT CONTRÔLÉS, et ils ne l'étaient pas.
   *
   * L'aperçu montre le pied de page du client : il doit refléter ce qui est
   * SAISI à l'instant, pas ce que la base portait au chargement. Un champ non
   * contrôlé rendrait un aperçu qui ne bouge jamais — donc un aperçu qui ment
   * sur la seule chose qu'il promet de montrer.
   */
  const [reseaux, setReseaux] = useState<Record<"instagram" | "tiktok" | "whatsapp" | "site", string>>({
    instagram: initial.reseaux.instagram ?? "",
    tiktok: initial.reseaux.tiktok ?? "",
    whatsapp: initial.reseaux.whatsapp ?? "",
    site: initial.reseaux.site ?? "",
  });
  const champFichier = useRef<HTMLInputElement>(null);

  const accent = useMemo(() => resoudreAccent(couleur), [couleur]);

  // UN FILIGRANE A BESOIN D'UN NOM À ÉCRIRE. La base éteint le drapeau quand il
  // n'y en a pas ; l'interface le dit AVANT plutôt que de laisser cocher une
  // case qui ne s'appliquera jamais. Un réglage qui s'active sans effet est pire
  // qu'un réglage absent.
  const filigranePossible = nom.trim() !== "";

  async function deposerLogo(fichier: File): Promise<void> {
    setLogo({ phase: "envoi" });

    /*
     * LE LOGO EST RÉDUIT AVANT D'ÊTRE ENVOYÉ, et c'est le geste qui manquait.
     *
     * Mesuré le 27/08/2026 : un logo déposé partait tel quel — 1254 × 1254,
     * 1 682,9 Ko — pour être affiché en 40 px, et il était rechargé par chaque
     * client de chaque commande. Les photos, elles, reçoivent une vignette
     * depuis le premier jour ; le logo était le seul média du produit à ne
     * traverser AUCUNE réduction.
     *
     * ON ENVOIE LE RÉDUIT, PAS L'ORIGINAL, et la préparation est signée sur ses
     * caractéristiques à LUI. Signer sur l'original puis envoyer le réduit
     * ferait mentir la signature sur le type comme sur la taille.
     *
     * ÉCHEC DE RÉDUCTION = REFUS, contrairement à la vignette d'une photo. Là,
     * l'échec est sans conséquence : la photo pleine reste servie. Ici, le
     * fichier réduit EST le logo — se rabattre sur l'original ramènerait
     * exactement le défaut qu'on corrige, en silence.
     */
    const reduit = await logoReduit(fichier, limites().logoOctets);
    if (reduit === null) {
      setLogo({ phase: "erreur", motif: t("logoErreur.illisible") });
      return;
    }

    const prepare = await preparerLogo(reduit.type, reduit.size);
    if (prepare.statut !== "pret") {
      setLogo({ phase: "erreur", motif: t(`logoErreur.${prepare.motif}`) });
      return;
    }

    // LE FICHIER VA DIRECTEMENT À R2. Les Server Actions plafonnent leur corps à
    // un mégaoctet, et le piège est vicieux parce qu'il PASSE en développement
    // sur de petites images de test.
    const envoi = await fetch(prepare.url, {
      method: "PUT",
      headers: prepare.enTetes,
      body: reduit,
    }).catch(() => null);

    if (envoi === null || !envoi.ok) {
      setLogo({ phase: "erreur", motif: t("logoErreur.reseau") });
      return;
    }

    // La taille est RELUE côté serveur ici : on ne croit jamais le client sur la
    // taille d'un fichier, c'est la base du modèle de coût. Tant que cette
    // confirmation n'a pas abouti, l'interface n'affirme rien.
    const confirme = await confirmerLogo(prepare.cle);
    if (confirme.statut !== "ok") {
      setLogo({ phase: "erreur", motif: t("logoErreur.confirmation") });
      return;
    }

    setLogo({
      phase: "pose",
      apercu: URL.createObjectURL(reduit),
      nom: fichier.name,
      // La taille MONTRÉE est celle qui part réellement, jamais celle du fichier
      // choisi : afficher 1 683 Ko pour un objet de 4 Ko ferait croire au vendeur
      // qu'il alourdit la page de son client alors qu'il ne l'alourdit plus.
      octets: reduit.size,
    });
  }

  async function retirer(): Promise<void> {
    const avant = logo;
    setLogo({ phase: "envoi" });
    const r = await supprimerLogo();
    // RETOUR À L'ÉTAT CONFIRMÉ, ET ON LE DIT. Un retour optimiste est un pari
    // sur le serveur ; pari perdu, l'écran revient à ce que la base porte
    // réellement plutôt que d'afficher une suppression qui n'a pas eu lieu.
    setLogo(r.statut === "ok" ? { phase: "aucun" } : avant);
  }

  const champsEnEchec =
    resultat.statut === "erreur" && resultat.motif === "saisie" ? (resultat.champs ?? []) : [];

  const apercuLogo =
    logo.phase === "existant" ? logo.url : logo.phase === "pose" ? logo.apercu : null;

  /*
   * LES TROIS RÉSEAUX, ET CES TROIS-LÀ SEULEMENT. La teinte de la pastille est
   * celle de LEUR marque, jamais l'accent du vendeur : un Instagram vert parce
   * que la boutique est verte ne se reconnaît plus, et c'est la reconnaissance
   * qui fait cliquer.
   */
  const RESEAUX = [
    {
      clef: "instagram",
      fond: "#fdeef6",
      encre: "#c13584",
      trace:
        "M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.2 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.4 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .4-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.4-1-.4-2.2-.1-1.3-.1-1.7-.1-4.9s0-3.6.1-4.9c.1-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.4 2.2-.4 1.3-.1 1.7-.1 4.9-.1zm0 3.2a6.6 6.6 0 1 0 0 13.2 6.6 6.6 0 0 0 0-13.2zm0 10.9a4.3 4.3 0 1 1 0-8.6 4.3 4.3 0 0 1 0 8.6zm6.9-11.2a1.5 1.5 0 1 1-3.1 0 1.5 1.5 0 0 1 3.1 0z",
    },
    {
      clef: "tiktok",
      fond: "var(--color-ds-surface-creux)",
      encre: "var(--color-ds-texte-fort)",
      trace:
        "M14.7 3h2.5a5.3 5.3 0 0 0 4.3 4.3v2.5a7.7 7.7 0 0 1-4.3-1.4v5.9a5.9 5.9 0 1 1-5.9-5.9c.3 0 .6 0 .9.1v2.6a3.3 3.3 0 1 0 2.5 3.2z",
    },
    {
      clef: "whatsapp",
      fond: "#e9f7ee",
      encre: "#1da851",
      trace:
        "M12 3.5a8.4 8.4 0 0 0-7.2 12.7L3.6 20.4l4.3-1.1A8.4 8.4 0 1 0 12 3.5zm4.8 11.9c-.2.6-1.2 1.1-1.7 1.1-.4 0-1 .1-3-.8-2.5-1.1-4.1-3.7-4.2-3.9-.1-.2-1-1.3-1-2.5 0-1.2.6-1.8.9-2 .2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 1.9c.1.2 0 .4-.1.5l-.3.4c-.1.2-.3.3-.1.6.2.3.7 1.1 1.4 1.8.9.8 1.7 1.1 2 1.2.2.1.4.1.5-.1l.7-.8c.2-.2.3-.2.6-.1l1.7.8c.2.1.4.2.4.3.1.2.1.7-.1 1.4z",
    },
    /*
     * LE SITE DU VENDEUR, quatrième ligne de la même carte — c'est ce que
     * dessine la planche depuis le 02/09/2026, sous le titre « Vos réseaux et
     * votre site ». Il n'a pas de marque à lui, donc pas de teinte à emprunter :
     * il porte le violet DropLink, la seule couleur du système qui ne prétende
     * appartenir à personne d'autre.
     *
     * ⚠️ C'ÉTAIT L'ANCIEN VIOLET, `#7c5cf5` sur `#f1eefe` — celui du canevas mort
     * le 11/09. Aucune sonde ne l'a vu : ce sont des propriétés d'un tracé SVG,
     * et la pastille n'apparaît que si le vendeur a renseigné son site. Relevé le
     * 14/09/2026 en cherchant les anciennes valeurs dans le code.
     */
    {
      clef: "site",
      fond: "#F1F0FE",
      encre: "#5B4BF5",
      trace:
        "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 6h-2.9a15.6 15.6 0 0 0-1.4-3.6A8 8 0 0 1 18.9 8zM12 4c.8 1.1 1.4 2.5 1.8 4h-3.6c.4-1.5 1-2.9 1.8-4zM4.3 14a8 8 0 0 1 0-4h3.3a17 17 0 0 0 0 4H4.3zm.8 2h2.9c.3 1.3.8 2.5 1.4 3.6A8 8 0 0 1 5.1 16zm2.9-8H5.1a8 8 0 0 1 4.3-3.6A15.6 15.6 0 0 0 8 8zM12 20c-.8-1.1-1.4-2.5-1.8-4h3.6c-.4 1.5-1 2.9-1.8 4zm2.2-6H9.8a15 15 0 0 1 0-4h4.4a15 15 0 0 1 0 4zm.4 5.6c.6-1.1 1.1-2.3 1.4-3.6h2.9a8 8 0 0 1-4.3 3.6zm1.8-5.6a17 17 0 0 0 0-4h3.3a8 8 0 0 1 0 4h-3.3z",
    },
  ] as const;

  /*
   * ⚠️ PLUS DE `champ-app`, ET C'EST LE QUATRIÈME PIÈGE DE LA MÉTHODE PAYÉ ICI.
   * Cette classe est déclarée HORS de toute `@layer` dans `globals.css` ;
   * Tailwind range ses utilitaires dans `@layer utilities`, et une règle sans
   * couche l'emporte sur une règle en couche quelle que soit la spécificité.
   * Elle écrasait donc en silence le fond, le filet et la taille du design
   * system sur chacun des sept champs de cet écran — et les deux gardes qui la
   * surveillent restaient vertes, parce qu'elles vérifient qu'une classe existe
   * et pointe sur une variable définie, jamais qui GAGNE la cascade.
   *
   * ⚠️ LA HAUTEUR RESTE SORTIE DE LA BASE. Écrire `champ + " h-11 lg:h-[42px]"`
   * laissait DEUX `lg:h-[…]` sur le même élément, et c'est l'ordre dans la
   * FEUILLE qui tranche, pas l'ordre dans l'attribut : mesuré, les champs de
   * réseaux rendaient 46 px là où le kit en dessine 42.
   */
  const champBase =
    "w-full rounded-ds-control border border-ds-filet-appuye bg-ds-surface-carte px-4 text-[14px] " +
    "font-medium text-ds-texte-fort transition-shadow outline-none placeholder:font-normal " +
    "placeholder:text-ds-texte-tenu focus:border-ds-filet-focus focus:shadow-[var(--anneau-ds-focus)]";
  const champ = champBase + " h-12";
  const champReseau = champBase + " h-11 lg:h-[46px]";
  // Le kit écrit ses étiquettes de champ en 13/500 sur l'encre de corps, et ses
  // textes d'aide en 13/400 sur la même encre. Douze en gras était l'ancien
  // canevas — deux graisses pour deux rôles que le design system distingue par
  // la TAILLE, pas par le poids.
  /* ⚠️ `leading-[normal]` ET NON `leading-normal` : le second vaut 1,5 dans
     l'échelle Tailwind, exactement ce qu'on corrige. Le kit laisse ses
     étiquettes de champ sur le `normal` du CSS — 16 px de boîte au lieu
     de 20. */
  const etiquette =
    "mb-[9px] block text-[13px] leading-[normal] font-medium text-ds-texte-corps";
  const aide = "text-[13px] leading-[19px] text-ds-texte-sourdine";

  const aUnEnTete = nom.trim() !== "" || apercuLogo !== null;
  const reseauxConfigures = RESEAUX.filter((r) => reseaux[r.clef].trim() !== "");

  /*
   * L'APERÇU EST LA RAISON D'ÊTRE DE CET ÉCRAN.
   *
   * Régler une couleur sans écran où la voir revient à demander au vendeur de
   * choisir à l'aveugle. Il vient donc EN PREMIER au téléphone — c'est ce que
   * dessine `MarqueMobile` — et occupe une colonne fixe de 372 px sur grand
   * écran, où il reste visible pendant qu'on modifie les champs.
   *
   * IL MONTRE LE CONTRASTE RÉSOLU, jamais la couleur brute : la conformité doit
   * être obtenue automatiquement, sans que le vendeur ait à chercher « une
   * couleur qui marche ».
   */
  const apercu = (
    <Panneau
      titre={t("apercuTitre")}
      sousTitre={t("apercuAide")}
      action={
        /*
          ⚠️ CE N'EST PAS UNE BASCULE DE LARGEUR, ET LE KIT NON PLUS N'EN FAIT
          PAS UNE. Ses deux boutons « Desktop » et « Mobile » changent le CADRE
          de l'aperçu ; le nôtre est déjà une maquette à l'échelle qui se rend
          identiquement aux deux largeurs — ce qui change entre un bureau et un
          téléphone, sur la page client, c'est l'ORDRE des blocs (la galerie
          passe avant l'expédition), pas la marque.

          Rendre deux boutons qui ne changeraient rien serait pire que ne rien
          rendre : le vendeur cliquerait, rien ne bougerait, et il conclurait
          que l'aperçu est cassé. On garde donc la mention « en direct », qui
          dit une propriété VRAIE de cet encart — il suit la frappe.
        */
        <span className="shrink-0 pt-1 text-[13px] text-ds-texte-sourdine">
          {t("apercuDirect")}
        </span>
      }
    >

      {/* `aria-hidden` : c'est une IMAGE de la page, pas la page. Un lecteur
          d'écran y annoncerait un bouton « Approuver » sur lequel il n'y a
          rien à approuver. */}
      <div
        aria-hidden="true"
        className="overflow-hidden rounded-ds-card border border-ds-filet lg:rounded-ds-card"
      >
        {/* L'EN-TÊTE EST OMIS QUAND IL N'Y A NI NOM NI LOGO — exactement comme
            sur la page publique. L'aperçu doit montrer l'ABSENCE de barre, pas
            une barre vide : c'est le cas le plus fréquent en début de vie d'un
            compte, et c'est celui qu'un vendeur a besoin de voir avant
            d'envoyer son premier lien. */}
        <div
          className="px-[13px] py-[15px] lg:px-3.5 lg:py-4"
          style={{ backgroundColor: accent.remplissage, color: accent.surRemplissage }}
        >
          {aUnEnTete ? (
            <div className="flex items-center gap-[7px]">
              {apercuLogo !== null ? (
                /* eslint-disable-next-line @next/next/no-img-element -- aperçu
                   local `blob:` ou URL signée à expiration. */
                <img
                  src={apercuLogo}
                  alt=""
                  className="h-[21px] w-[21px] shrink-0 rounded-full object-cover lg:h-[22px] lg:w-[22px]"
                />
              ) : (
                <span
                  className="h-[21px] w-[21px] shrink-0 rounded-full lg:h-[22px] lg:w-[22px]"
                  style={{ backgroundColor: accent.surRemplissageFaible }}
                />
              )}
              {nom.trim() !== "" ? (
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[12px] font-bold lg:text-[12px]">{nom}</span>
                  {/* LA DESCRIPTION SUIT LE NOM, ET SEULEMENT LUI. Sans nom,
                      l'en-tête est omis en entier (décision 24) : une
                      description seule flotterait au-dessus du contenu sans
                      dire de qui elle parle. C'est la même règle que la
                      fonction de lecture publique applique en base. */}
                  {description.trim() === "" ? null : (
                    <span
                      /* 10,5 px AU BUREAU, comme la maquette ; 11,5 en dessous,
                         plancher de la regle 5. L apercu est `aria-hidden`, mais
                         c est du texte qu un oeil lit quand meme — et la regle
                         protege l oeil, pas le lecteur d ecran. */
                      className="truncate text-[11.5px] leading-[normal] lg:text-[10.5px]"
                      style={{ color: accent.surRemplissageDoux }}
                    >
                      {description}
                    </span>
                  )}
                </span>
              ) : null}
            </div>
          ) : null}

          <p
            className={
              "text-[17px] font-extrabold tracking-[-0.02em] lg:text-[18px] " +
              (aUnEnTete ? "mt-2 mb-px lg:mt-[9px]" : "mb-px")
            }
          >
            {phrasesClient.commande}
          </p>
          <p className="text-[12px]" style={{ color: accent.surRemplissageDoux }}>
            {phrasesClient.pourGenerique}
          </p>
        </div>

        <div className="p-3 lg:p-[13px]">
          <div className="mb-3 grid grid-cols-4 gap-1 lg:mb-[13px]">
            {[0, 1, 2, 3].map((etape) => (
              <span
                key={etape}
                className="h-[5px] rounded-full"
                style={{
                  backgroundColor:
                    etape < 3 ? accent.remplissage : "var(--color-ds-ink-200)",
                }}
              />
            ))}
          </div>

          {/* Trois vignettes au téléphone, quatre sur grand écran : la colonne
              d'aperçu est plus étroite que la carte pleine largeur. */}
          <div className="mb-3 grid grid-cols-3 gap-[5px] lg:mb-[13px] lg:grid-cols-2">
            {["bg-ds-surface-creux", "bg-[#eee4e0]", "bg-[#e0e4ee]", "bg-[#eaeaef] hidden lg:block"].map(
              (fond, rang) => (
                <span
                  key={rang}
                  className={"aspect-square w-full rounded-ds-sm " + fond}
                />
              ),
            )}
          </div>

          <div
            className="mb-[13px] flex h-[38px] items-center justify-center rounded-[10px] lg:mb-3.5 lg:h-10"
            style={{ backgroundColor: accent.remplissage, color: accent.surRemplissage }}
          >
            <span className="text-[12px] font-bold lg:text-[13px]">
              {phrasesClient.approuver}
            </span>
          </div>

          {/* LE PIED DES RÉSEAUX N'EXISTE QUE S'IL Y EN A, et son titre n'existe
              que s'il y a un nom à écrire. « Retrouvez le vendeur » serait un
              texte de remplacement — ce que la décision 26 interdit. */}
          {reseauxConfigures.length > 0 ? (
            <div className="border-t border-ds-filet pt-3 text-center lg:pt-[13px]">
              {nom.trim() !== "" ? (
                <p className="mb-[7px] text-[10px] text-ds-texte-corps lg:mb-2">
                  {substituerNom(phrasesClient.reseauxGabarit, nom)}
                </p>
              ) : null}
              <div className="flex justify-center gap-[7px] lg:gap-2">
                {reseauxConfigures.map((reseau) => (
                  <span
                    key={reseau.clef}
                    className="flex h-[30px] w-[30px] items-center justify-center rounded-ds-sm bg-ds-surface-creux text-ds-texte-sourdine"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d={reseau.trace} />
                    </svg>
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Panneau>
  );

  return (
    <form
      action={action}
      // ⚠️ LES DEUX VARIABLES D'APERÇU ONT DISPARU AVEC LE BOUTON QUI LES LISAIT.
      // L'aperçu, lui, n'en a jamais eu besoin : il peint avec `accent.*` en
      // ligne. Les laisser posées aurait fait deux déclarations que plus
      // personne ne lit — le défaut exact que la sonde de fumée a déjà attrapé
      // une fois sur l'onboarding.
      className="flex flex-col gap-3 lg:gap-[18px]"
    >
      <input type="hidden" name="couleurAccent" value={couleur} />
      <input type="hidden" name="languePublique" value={langue} />

      {/*
        DEUX CELLULES, UNE RANGÉE. L'aperçu est le PREMIER de la source parce
        que c'est sa place au téléphone ; sur grand écran il passe en colonne de
        droite par un placement explicite. Une grille à deux rangées aurait
        distribué la hauteur de la colonne gauche entre elles.

        ⚠️ LA BASCULE EST À `xl`, PAS À `lg`, ET C'EST UNE MESURE QUI L'A DIT.
        La colonne d'aperçu est FIXE à 372 px : à 1 024 px de fenêtre il ne
        restait que 303 px pour tout le reste, et la grille débordait de 8 px
        — la colonne de droite sortait de la carte-page. Entre 1 024 et
        1 279 px, une seule colonne : les cartes prennent toute la largeur et
        l'aperçu reste en tête, comme au téléphone.

        `minmax(0, 1fr)` et non `1fr` : le plancher d'un `1fr` est son
        contenu minimum, et c'est exactement ce plancher qui produisait le
        débordement.
      */}
      <div className="flex flex-col gap-3 lg:gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:items-start xl:gap-5">
        <div className="xl:col-start-2 xl:row-start-1">{apercu}</div>

        <div className="flex flex-col gap-3 lg:gap-4 xl:col-start-1 xl:row-start-1">
          {/* --- Identité ------------------------------------------------ */}
          <Panneau titre={t("identiteTitre")} sousTitre={t("identiteAide")} icone={IdCard} taille="section">
            {/*
              DEUX COLONNES AU BUREAU, comme le kit : le logo à gauche, le nom et
              la description à droite. En une seule colonne, chaque étiquette
              s'étirait sur 614 px pour trois mots, et la section faisait deux
              fois la hauteur de celle du kit.

              ⚠️ LE LOGO EST PREMIER DANS LA SOURCE parce que c'est sa place au
              téléphone : c'est l'élément qu'on reconnaît d'un coup d'œil, et
              c'est celui que le kit met en tête de sa colonne gauche.
            */}
            <div className="grid gap-x-4 gap-y-[18px] lg:grid-cols-[minmax(0,auto)_minmax(0,1fr)] lg:gap-y-5">
              <div className="min-w-0">
            <span className={etiquette}>{t("logoTitre")}</span>
            <input
              ref={champFichier}
              type="file"
              accept={ACCEPT_LOGO}
              className="sr-only"
              onChange={(e) => {
                const fichier = e.target.files?.[0];
                if (fichier !== undefined) void deposerLogo(fichier);
              }}
            />
            <div className="flex flex-wrap items-center gap-3 lg:gap-3.5">
              <span className="flex h-[54px] w-[54px] shrink-0 items-center justify-center overflow-hidden rounded-ds-card bg-ds-surface-creux lg:h-[60px] lg:w-[60px] lg:rounded-ds-card">
                {apercuLogo !== null ? (
                  /* eslint-disable-next-line @next/next/no-img-element -- URL
                     signée à expiration, ou aperçu local `blob:`. */
                  <img src={apercuLogo} alt="" className="h-full w-full object-contain p-1" />
                ) : null}
              </span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => champFichier.current?.click()}
                  className="inline-flex h-12 shrink-0 items-center gap-2.5 rounded-ds-card border border-ds-filet bg-ds-surface-carte px-[18px] text-[14px] font-semibold text-ds-texte-fort shadow-ds-xs transition-colors hover:bg-ds-surface-teinte"
                >
                  {logo.phase === "envoi"
                    ? t("logoEnvoi")
                    : apercuLogo === null
                      ? t("depotTitre")
                      : t("logoRemplacer")}
                </button>
                {/* « RETIRER » N'EXISTE QUE S'IL Y A QUELQUE CHOSE À RETIRER.
                    La planche dessine les deux boutons côte à côte, mais elle
                    dessine une boutique QUI A un logo : un bouton qui ne peut
                    rien faire est une commande morte. */}
                {apercuLogo !== null ? (
                  <button
                    type="button"
                    onClick={() => void retirer()}
                    className="inline-flex h-12 shrink-0 items-center gap-2.5 rounded-ds-card border border-ds-filet bg-ds-surface-carte px-[18px] text-[14px] font-semibold text-ds-erreur shadow-ds-xs transition-colors hover:bg-ds-surface-teinte"
                  >
                    {t("logoRetirer")}
                  </button>
                ) : null}
              </div>
            </div>
            {/* LES FORMATS SONT ÉNUMÉRÉS, ET LE SVG N'Y EST PAS. Il est refusé
                côté serveur parce qu'un SVG est un document capable de porter du
                script ; l'annoncer ici évite un refus après téléversement. */}
            <p className={"mt-2 " + aide + " text-[12px]"}>{t("depotFormats", { n: initial.plafondLogoKo })}</p>

            {logo.phase === "erreur" ? (
              <p role="alert" className="mt-2 text-[13px] text-ds-erreur">
                {logo.motif}
              </p>
            ) : null}
              </div>
              <div className="min-w-0">

            <label htmlFor="nom" className={etiquette}>
              {t("nomTitre")}
            </label>
            <input
              id="nom"
              name="nom"
              type="text"
              maxLength={60}
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder={t("nomPlaceholder")}
              className={champ}
            />
            <p className={"mt-1.5 " + aide + " text-[12px]"}>{t("nomAide")}</p>
            {champsEnEchec.includes("nom") ? (
              <p role="alert" className="mt-2 text-[13px] text-ds-erreur">
                {t("erreurNom")}
              </p>
            ) : null}

            <div className="h-[18px] lg:h-5" />

            {/*
              LA DESCRIPTION — une ligne sous le nom, sur la page du client.

              ⚠️ SON COMPTEUR N'EST PAS DÉCORATIF. Le champ est borné à 150 par
              `maxLength`, donc la saisie s'arrête d'elle-même ; sans compteur,
              elle s'arrête SANS RIEN DIRE, et le vendeur croit à un clavier qui
              saute des touches. Le compteur est la seule chose qui transforme
              une limite silencieuse en limite lisible — c'est ce que fait le
              kit, et c'est de lui que vient le nombre.
            */}
            <label htmlFor="description" className={etiquette}>
              {t("descriptionTitre")}
            </label>
            <span className="relative block">
              <textarea
                id="description"
                name="description"
                rows={2}
                maxLength={DESCRIPTION_MAX}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("descriptionPlaceholder")}
                className={champ + " min-h-[84px] resize-y py-3 pb-7"}
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute end-3.5 bottom-2.5 text-[11.5px] leading-[normal] text-ds-texte-sourdine lg:text-[11px]"
              >
                {t("descriptionCompteur", { n: description.length, max: DESCRIPTION_MAX })}
              </span>
            </span>
            <p className={"mt-1.5 " + aide + " text-[12px]"}>{t("descriptionAide")}</p>
            {champsEnEchec.includes("description") ? (
              <p role="alert" className="mt-2 text-[13px] text-ds-erreur">
                {t("erreurDescription", { max: DESCRIPTION_MAX })}
              </p>
            ) : null}

              </div>
            </div>
          </Panneau>

          {/* --- Couleur ------------------------------------------------- */}
          <Panneau
            titre={t("couleurTitre")}
            sousTitre={t("couleurAide")}
            taille="section"
            icone={Palette}
            /*
              LE BADGE DIT CE QUE LA MACHINE A ÉTABLI, pas ce qu'on espère.
              `resoudreAccent()` garantit 4,5:1 sur le texte et 3:1 sur
              l'interface pour N'IMPORTE QUELLE valeur — y compris invalide, où
              elle retombe sur le défaut. Le badge n'est donc jamais rouge : il
              rappelle au vendeur qu'il n'a pas à chercher une couleur qui
              marche.
            */
            action={
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-ds-pill bg-ds-succes-fond px-2.5 py-1 text-[12px] font-bold text-ds-succes">
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                <span className="lg:hidden">{t("contrasteCourt")}</span>
                <span className="hidden lg:inline">{t("contrasteConforme")}</span>
              </span>
            }
          >

            {/*
              ⚠️ LE LIBELLE ETAIT `sr-only`, ET LE KIT L'ECRIT EN CLAIR. « Code
              de la couleur » ne vivait que pour les lecteurs d'écran : à l'œil,
              la pastille et le champ hexadécimal flottaient sans titre, seuls
              champs de l'écran dans ce cas. Le kit pose « Couleur principale »
              au-dessus, comme tous ses autres champs.
            */}
            <label htmlFor="couleurTexte" className={etiquette}>
              {t("couleurPrincipale")}
            </label>
            <div className="mb-2.5 flex items-center gap-2.5 lg:mb-[18px] lg:gap-3">
              <label
                className="h-[46px] w-[46px] shrink-0 cursor-pointer rounded-ds-md border border-ds-filet"
                style={{ backgroundColor: couleur }}
              >
                <span className="sr-only">{t("couleurHex")}</span>
                <input
                  type="color"
                  value={couleur}
                  onChange={(e) => setCouleur(e.target.value)}
                  className="sr-only"
                />
              </label>
              <input
                id="couleurTexte"
                aria-label={t("couleurHex")}
                type="text"
                value={couleur}
                onChange={(e) => setCouleur(e.target.value.trim())}
                placeholder="#000000"
                className={champ + " font-mono text-[14px] lg:w-40"}
              />
            </div>

            {champsEnEchec.includes("couleurAccent") ? (
              <p role="alert" className="mt-2 text-[13px] text-ds-erreur">
                {t("erreurCouleur")}
              </p>
            ) : null}

            {/*
              LES TROIS DÉMONSTRATIONS, sur grand écran seulement.

              Elles ne décorent pas : elles montrent les TROIS emplois de la
              couleur sur la page du client — texte sur blanc, aplat de bouton,
              bandeau — avec le seuil que chacun doit tenir. C'est la seule façon
              de rendre visible que le produit ajuste tout seul, et donc que le
              vendeur peut choisir la couleur qu'il veut.
            */}
            <div className="mt-4 hidden grid-cols-3 gap-2.5 lg:grid">
              <div className="rounded-ds-control border border-ds-filet p-3">
                <p className={"mb-2 " + aide + " text-[12px]"}>{t("demoTexte")}</p>
                <p
                  className="text-[15px] font-bold"
                  style={{ color: accent.texte }}
                >
                  {phrasesClient.statut}
                </p>
                <p className={"mt-1.5 " + aide + " text-[10px]"}>{t("demoTexteSeuil")}</p>
              </div>

              <div className="rounded-ds-control border border-ds-filet p-3">
                <p className={"mb-2 " + aide + " text-[12px]"}>{t("demoBouton")}</p>
                <div
                  className="flex h-[30px] items-center justify-center rounded-ds-sm"
                  style={{
                    backgroundColor: accent.remplissage,
                    color: accent.surRemplissage,
                  }}
                >
                  <span className="text-[12px] font-bold">
                    {phrasesClient.approuver}
                  </span>
                </div>
                <p className={"mt-1.5 " + aide + " text-[10px]"}>{t("demoBoutonSeuil")}</p>
              </div>

              <div className="rounded-ds-control border border-ds-filet p-3">
                <p className={"mb-2 " + aide + " text-[12px]"}>{t("demoBandeau")}</p>
                <div
                  className="flex h-[30px] items-center overflow-hidden rounded-ds-sm px-2.5"
                  style={{
                    backgroundColor: accent.remplissage,
                    color: accent.surRemplissage,
                  }}
                >
                  <span className="truncate text-[12px] font-bold">
                    {nom.trim() === "" ? phrasesClient.commande : nom}
                  </span>
                </div>
                <p className={"mt-1.5 " + aide + " text-[10px]"}>{t("demoBandeauSeuil")}</p>
              </div>
            </div>

            {accent.ajuste ? (
              // On le DIT plutôt que de corriger en silence. La couleur stockée
              // reste celle du vendeur ; c'est le RENDU qui dérive des variantes
              // lisibles. Un vendeur qui voit sa couleur affichée autrement sans
              // explication croit à un bogue.
              <p className={"mt-3 " + aide}>{t("couleurAjustee")}</p>
            ) : null}
          </Panneau>

          {/* --- Réseaux ------------------------------------------------- */}
          <Panneau
            titre={t("reseauxTitre")}
            sousTitre={t("reseauxAide")}
            taille="section"
            icone={LinkIcon}
            action={
              <span className="shrink-0 pt-1 text-[13px] text-ds-texte-sourdine">
                {t("reseauxFacultatif")}
              </span>
            }
          >

            {/*
              DEUX COLONNES AU BUREAU, comme le kit : Instagram | TikTok, puis
              WhatsApp | Site web. En une seule colonne, chaque étiquette
              s'étirait sur 562 px pour un mot de neuf caractères, et la section
              faisait deux fois la hauteur de celle du kit.
            */}
            <div className="flex flex-col gap-3.5 lg:grid lg:grid-cols-2 lg:gap-x-4 lg:gap-y-3">
              {RESEAUX.map((reseau) => (
                <div key={reseau.clef} className="flex items-end gap-[11px] lg:gap-3">
                  <span
                    className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-ds-control lg:mb-px lg:h-10 lg:w-10"
                    style={{ backgroundColor: reseau.fond, color: reseau.encre }}
                    aria-hidden="true"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d={reseau.trace} />
                    </svg>
                  </span>
                  <div className="min-w-0 flex-grow">
                    <label htmlFor={reseau.clef} className={etiquette + " mb-[5px]"}>
                      {t("reseau." + reseau.clef)}
                    </label>
                    <input
                      id={reseau.clef}
                      name={reseau.clef}
                      /*
                       * ⚠️ `type="text"`, PAS `type="url"` — ET LA PLANCHE LE
                       * DISAIT DÉJÀ.
                       *
                       * DÉFAUT RÉEL, TROUVÉ PAR WASSIM LE 02/09/2026 : il a
                       * collé `www.tiktok.com/@laplanque92`, l'adresse de son
                       * propre compte recopiée depuis sa barre d'adresse, et le
                       * NAVIGATEUR l'a refusée avant même l'envoi — « Veuillez
                       * saisir une URL ». Aucune trace serveur, aucun journal :
                       * le refus vient du contrôle natif de `type="url"`, qui
                       * exige un schéma.
                       *
                       * `Marque.dc.html` dessine `type="text"` avec la valeur
                       * `@ateliernord`, et pour WhatsApp le substitut « Numéro
                       * au format international ». La planche décrivait donc un
                       * champ qui accepte un pseudo et un numéro ; c'est le code
                       * qui avait ajouté l'exigence. `inputMode="url"` reste :
                       * il choisit le clavier, il ne refuse rien.
                       */
                      type="text"
                      inputMode="url"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      maxLength={200}
                      value={reseaux[reseau.clef]}
                      onChange={(e) =>
                        setReseaux((actuels) => ({ ...actuels, [reseau.clef]: e.target.value }))
                      }
                      /*
                       * LA NORMALISATION SE VOIT, ET ELLE SE VOIT AU MOMENT OÙ
                       * L'ON QUITTE LE CHAMP.
                       *
                       * Le serveur normalise de toute façon — c'est lui qui fait
                       * autorité. Mais si l'écran gardait `@laplanque92` pendant
                       * que la base reçoit `https://www.tiktok.com/@laplanque92`,
                       * il affirmerait autre chose que ce qui est enregistré :
                       * exactement le principe XII à l'envers. Normaliser à
                       * CHAQUE frappe serait pire — le curseur sauterait au
                       * troisième caractère tapé.
                       */
                      onBlur={(e) =>
                        setReseaux((actuels) => ({
                          ...actuels,
                          [reseau.clef]: normaliserLien(reseau.clef, e.target.value),
                        }))
                      }
                      placeholder={t("reseauExemple." + reseau.clef)}
                      className={champReseau}
                    />
                    {champsEnEchec.includes(reseau.clef) ? (
                      <p role="alert" className="mt-2 text-[13px] text-ds-erreur">
                        {t("reseauInvalide." + reseau.clef)}
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            {/* CE QUE LE LIEN FAIT ET CE QU'IL NE FAIT PAS. Il s'ouvre hors de
                la page, il ne crée aucun compte et ne demande rien au client —
                c'est la promesse centrale du produit, elle mérite d'être écrite
                là où le vendeur colle ses adresses. */}
            <div className="mt-4 flex items-start gap-2.5 rounded-ds-control bg-ds-surface-creux px-3.5 py-3">
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="mt-px shrink-0 text-ds-texte-sourdine"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 16v-4" />
                <path d="M12 8h.01" />
              </svg>
              <span className={aide}>{t("reseauxNouvelOnglet")}</span>
            </div>
          </Panneau>

          {/* --- Options ------------------------------------------------- */}
          <Panneau titre={t("optionsTitre")} sousTitre={t("optionsAide")} icone={Eye} taille="section">

            <div className="mt-3 flex items-center justify-between gap-4 border-t border-ds-filet py-3.5 lg:mt-0 lg:border-t-0 lg:border-b lg:pt-0 lg:pb-4">
              <div>
                <p className="mb-0.5 text-[15px] font-semibold text-ds-texte-fort">
                  {t("filigraneTitre")}
                </p>
                <p className="text-[13px] leading-5 text-ds-texte-corps">
                  {filigranePossible ? t("filigraneAide") : t("filigraneSansNom")}
                </p>
              </div>

              {/*
                L'INTERRUPTEUR EST DESSINÉ, pas une case native — c'est ce que
                montre la planche, et une case de 13 px n'est pas une cible au
                pouce. La case reste dans le document, en `sr-only` : c'est elle
                qui porte le nom du champ, l'état coché et le focus clavier.
                Un interrupteur peint sans champ derrière ne s'envoie pas.
              */}
              <label
                className={
                  "relative inline-flex h-[27px] w-[46px] shrink-0 items-center rounded-full px-[3px] transition-colors " +
                  "before:absolute before:inset-x-0 before:top-1/2 before:h-11 before:-translate-y-1/2 before:content-[''] " +
                  (filigranePossible ? "cursor-pointer" : "cursor-not-allowed opacity-50")
                }
                style={{
                  backgroundColor:
                    filigrane && filigranePossible
                      ? accent.remplissage
                      : "var(--color-ds-ink-200)",
                }}
              >
                <input
                  type="checkbox"
                  name="filigrane"
                  checked={filigrane && filigranePossible}
                  disabled={!filigranePossible}
                  onChange={(e) => setFiligrane(e.target.checked)}
                  className="peer sr-only"
                />
                <span
                  className="h-[21px] w-[21px] rounded-full transition-transform peer-checked:translate-x-[19px]"
                  style={{
                    backgroundColor:
                      filigrane && filigranePossible
                        ? accent.surRemplissage
                        : "var(--color-ds-surface-carte)",
                  }}
                />
                <span className="sr-only">{t("filigraneLabel")}</span>
              </label>
            </div>

            <div className="border-t border-ds-filet pt-3.5 lg:flex lg:items-center lg:justify-between lg:gap-5 lg:border-t-0 lg:pt-4">
              <div>
                <p className="mb-0.5 text-[15px] font-semibold text-ds-texte-fort">
                  {t("langueTitre")}
                </p>
                <p className="text-[13px] leading-5 text-ds-texte-corps">
                  {t("langueAide")}
                </p>
              </div>
              {/* UNE LISTE, ET NON DES BOUTONS RADIO : la planche dessine une
                  liste, et elle a accueilli la troisième langue sans être
                  redessinée — ce que son commentaire d'origine annonçait.

                  ⚠️ LES OPTIONS SONT ENGENDRÉES PAR `LANGUES`, ELLES NE SONT
                  PLUS ÉNUMÉRÉES. Elles l'étaient, et le `onChange` portait
                  `e.target.value === "en" ? "en" : "fr"` : une valeur inconnue
                  y retombait sur le français EN SILENCE. Pire, un `<select>`
                  dont la `value` ne correspond à aucune `<option>` affiche la
                  PREMIÈRE — un vendeur réglé en chinois aurait donc lu
                  « Français », et son prochain enregistrement aurait écrasé son
                  propre choix. Rien, dans aucun de ces deux défauts, n'aurait
                  fait rougir le compilateur. */}
              <select
                aria-label={t("langueTitre")}
                value={langue}
                onChange={(e) => {
                  const choisie = e.target.value;
                  if (estLangueSupportee(choisie)) setLangue(choisie);
                }}
                className={champ + " champ-liste mt-2.5 cursor-pointer lg:mt-0 lg:w-[150px]"}
              >
                {LANGUES.map((code) => (
                  <option key={code} value={code}>
                    {t(`langue.${code}`)}
                  </option>
                ))}
              </select>
            </div>
          </Panneau>

          {/*
            5. LE LIEN PERSONNALISÉ — AFFICHÉ, JAMAIS APPLIQUÉ.

            ⚠️ C'EST LA DÉCISION DE WASSIM DU 12/09 : les plans se MONTRENT,
            aucun plafond ne s'applique, et il n'existe toujours aucune ligne de
            code de facturation — la contrainte n°1 tient. Le kit dessine cette
            section verrouillée, avec son champ inerte et sa carte « Pro » ; on
            la rend telle quelle.

            ⚠️ ET LE CHAMP EST RÉELLEMENT INERTE, pas seulement grisé : il est
            `disabled` et ne porte AUCUN `name`, donc rien ne part au serveur et
            rien ne serait accepté s'il partait. Un champ désactivé à l'écran mais
            soumis quand même est la façon la plus courante de croire qu'on a
            fermé une porte.

            ⚠️ ELLE NE PROMET RIEN DE DATÉ. Le kit n'écrit aucune échéance, et
            nous n'en inventons pas : une fonctionnalité annoncée pour une date
            est une dette qu'on ne peut pas tenir depuis un écran.
          */}
          <Panneau
            titre={
              <>
                {t("lienTitre")}{" "}
                <span className="font-medium text-ds-texte-sourdine">{t("lienPro")}</span>
              </>
            }
            sousTitre={t("lienAide")}
            taille="section"
            icone={LinkIcon}
          >
            <div className="flex flex-col gap-3.5 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-4">
              <span className="flex min-w-0 items-stretch overflow-hidden rounded-ds-control border border-ds-filet bg-ds-surface-carte">
                <span className="flex flex-none items-center bg-ds-surface-creux px-3.5 text-[14px] leading-[normal] text-ds-texte-sourdine">
                  {origineLisible}
                </span>
                <input
                  type="text"
                  disabled
                  defaultValue=""
                  placeholder={t("lienPlaceholder")}
                  aria-label={t("lienTitre")}
                  /* 44 px AU TELEPHONE : la sonde compte ce champ comme une
                     cible parce qu il porte un nom accessible, et un champ de
                     formulaire sous le plancher se rate au pouce — qu il soit
                     desactive aujourd hui n y change rien, il ne le sera pas
                     toujours. */
                  className="min-h-11 min-w-0 flex-1 bg-transparent px-3.5 py-3 text-[14px] leading-[normal] font-semibold text-ds-texte-fort placeholder:font-normal placeholder:text-ds-texte-tenu lg:min-h-0"
                />
              </span>
              <span className="flex items-center gap-3 rounded-ds-card bg-ds-surface-teinte px-4 py-3.5">
                <span className="inline-flex flex-none items-center rounded-ds-pill bg-ds-accent px-2.5 py-1 text-[11.5px] leading-[normal] font-bold text-ds-texte-sur-marque lg:text-[11px]">
                  {t("lienProBadge")}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-[14px] leading-[normal] font-bold text-ds-accent-encre">
                    {t("lienProTitre")}
                  </span>
                  <span className="text-[12px] leading-[normal] text-ds-texte-corps">
                    {t("lienProAide")}
                  </span>
                </span>
              </span>
            </div>
          </Panneau>

          {/*
            LA BARRE D'ENREGISTREMENT.

            ⚠️ AUCUNE DES DEUX PLANCHES NE LA DESSINE, et elle est conservée
            quand même. Ici, un seul geste rhabille TOUTES les pages du vendeur,
            y compris les liens déjà envoyés : enregistrer à chaque frappe ferait
            défiler des couleurs intermédiaires chez ses clients pendant qu'il
            tape un code hexadécimal. La sauvegarde automatique de l'éditeur ne
            touche, elle, qu'une commande que personne ne regarde à cet instant.
          */}
        </div>
      </div>

      <div className="flex flex-col gap-2 pt-1 lg:flex-row lg:items-center lg:justify-end lg:gap-3">
            {/*
              LA CONFIRMATION EST UNE PILULE VERTE, ET C'EST UNE DEMANDE DE
              WASSIM, LE 09/09/2026 : « faudrait qu'il mette un petit message en
              vert quand on clique et que ça enregistre vraiment ».

              ⚠️ ELLE NE FAIT PAS DOUBLON AVEC LE BOUTON, parce que le bouton ne
              dit plus « Enregistré » : son libellé de réussite est celui du
              repos. Un « Enregistré » écrit DANS le bouton violet se lit comme un
              libellé d'action, pas comme une confirmation. Une version
              intermédiaire avait les deux, et c'était deux fois la même phrase —
              à l'œil, et pour un lecteur d'écran.

              ⚠️ LE MOTIF N'EST PAS NEUF : c'est la pilule de l'indicateur de
              sauvegarde de l'éditeur, mêmes jetons `succes-fond` et `succes`.
              Deux écrans qui confirment une écriture doivent le dire pareil —
              c'est la règle du vocabulaire du canevas.

              `role="status"` et non `role="alert"` : une réussite s'annonce quand
              le lecteur d'écran a fini sa phrase en cours, elle ne l'interrompt
              pas.
            */}
            {resultat.statut === "enregistre" ? (
              <p
                role="status"
                className="inline-flex items-center gap-[7px] self-center rounded-full bg-ds-succes-fond px-[13px] py-[7px] text-[13px] font-semibold text-ds-succes lg:self-auto"
              >
                <Check aria-hidden="true" size={14} strokeWidth={2.2} />
                {t("enregistre")}
              </p>
            ) : null}
            {resultat.statut === "erreur" && resultat.motif !== "saisie" ? (
              <p role="alert" className="text-[13px] text-ds-erreur">
                {t(`erreur.${resultat.motif}`)}
              </p>
            ) : null}
            <BoutonEnregistrer
              libelles={{
                repos: t("enregistrer"),
                enCours: t("enregistrement"),
                // ⚠️ LE MEME LIBELLE QU AU REPOS, DELIBEREMENT : la pilule verte
                // porte la confirmation, le bouton redevient simplement cliquable.
                reussi: t("enregistrer"),
                echoue: t("reessayer"),
              }}
              statut={resultat.statut}
            />
          </div>
    </form>
  );
}
