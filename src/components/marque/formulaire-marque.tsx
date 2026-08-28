"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import {
  confirmerLogo,
  enregistrerMarque,
  preparerLogo,
  supprimerLogo,
  type ResultatMarque,
} from "@/app/[locale]/(app)/marque/actions";
import { resoudreAccent } from "@/lib/design/contraste";
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

function BoutonEnregistrer({ libelle, enCours }: { libelle: string; enCours: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        backgroundColor: "var(--apercu-remplissage)",
        color: "var(--apercu-sur-remplissage)",
      }}
      className="min-h-[44px] rounded-lg px-6 font-label-md text-label-md shadow-sm transition-opacity disabled:opacity-60"
    >
      {pending ? enCours : libelle}
    </button>
  );
}

export function FormulaireMarque({
  initial,
}: {
  readonly initial: {
    readonly nom: string;
    readonly couleur: string;
    readonly languePublique: "fr" | "en";
    readonly filigrane: boolean;
    readonly logoUrl: string | null;
    readonly reseaux: {
      readonly instagram: string | null;
      readonly tiktok: string | null;
      readonly whatsapp: string | null;
    };
  };
}) {
  const t = useTranslations("marque");
  const [resultat, action] = useActionState(enregistrerMarque, INITIAL);

  const [nom, setNom] = useState(initial.nom);
  const [couleur, setCouleur] = useState(initial.couleur);
  const [langue, setLangue] = useState<"fr" | "en">(initial.languePublique);
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
  const [reseaux, setReseaux] = useState<Record<"instagram" | "tiktok" | "whatsapp", string>>({
    instagram: initial.reseaux.instagram ?? "",
    tiktok: initial.reseaux.tiktok ?? "",
    whatsapp: initial.reseaux.whatsapp ?? "",
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
      fond: "var(--color-filet-section)",
      encre: "var(--color-on-surface)",
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
  ] as const;

  const carte = "carte rounded-lg p-[18px] lg:rounded-[18px] lg:p-6";
  const titreCarte =
    "font-headline-md text-[15px] leading-[19px] font-bold text-on-surface lg:text-[16px] lg:leading-5 lg:tracking-[-0.015em]";
  /*
   * ⚠️ `rounded-xl` VAUT 28 DANS CE THÈME. La planche dit 12 pour un champ.
   *
   * ⚠️ ET LA HAUTEUR EST SORTIE DE LA BASE. Écrire `champ + " h-11 lg:h-[42px]"`
   * laissait DEUX `lg:h-[…]` sur le même élément, et c'est l'ordre dans la
   * FEUILLE qui tranche, pas l'ordre dans l'attribut : mesuré, les champs de
   * réseaux rendaient 46 px là où la planche en dessine 42.
   */
  const champBase = "champ-app w-full rounded-[12px] px-3.5 text-on-surface";
  const champ = champBase + " h-12 lg:h-[46px]";
  const champReseau = champBase + " h-11 lg:h-[42px]";
  const etiquette = "mb-[7px] block font-label-md text-[12px] font-bold text-ardoise";
  const aide = "font-body-sm text-[12px] leading-[18px] text-on-surface-variant";

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
    <section className={carte + " lg:p-[18px]"} aria-labelledby="titre-apercu">
      <div className="mb-3.5 flex items-center justify-between gap-3">
        <h2 id="titre-apercu" className="font-headline-md text-[14px] font-bold text-on-surface">
          {t("apercuTitre")}
        </h2>
        <span className="font-body-sm text-[11px] text-on-surface-variant">
          {t("apercuDirect")}
        </span>
      </div>

      {/* `aria-hidden` : c'est une IMAGE de la page, pas la page. Un lecteur
          d'écran y annoncerait un bouton « Approuver » sur lequel il n'y a
          rien à approuver. */}
      <div
        aria-hidden="true"
        className="overflow-hidden rounded-[14px] border border-outline-variant lg:rounded-[15px]"
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
                <span className="truncate font-label-md text-[11px] font-bold lg:text-[12px]">
                  {nom}
                </span>
              ) : null}
            </div>
          ) : null}

          <p
            className={
              "font-headline-md text-[17px] font-extrabold tracking-[-0.02em] lg:text-[18px] " +
              (aUnEnTete ? "mt-2 mb-px lg:mt-[9px]" : "mb-px")
            }
          >
            {t("apercuCommande")}
          </p>
          <p className="font-body-sm text-[11px]" style={{ color: accent.surRemplissageDoux }}>
            {t("apercuPour")}
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
                    etape < 3 ? accent.remplissage : "var(--color-outline-variant)",
                }}
              />
            ))}
          </div>

          {/* Trois vignettes au téléphone, quatre sur grand écran : la colonne
              d'aperçu est plus étroite que la carte pleine largeur. */}
          <div className="mb-3 grid grid-cols-3 gap-[5px] lg:mb-[13px] lg:grid-cols-2">
            {["bg-fond-avatar", "bg-[#eee4e0]", "bg-[#e0e4ee]", "bg-[#eaeaef] hidden lg:block"].map(
              (fond, rang) => (
                <span
                  key={rang}
                  className={"aspect-square w-full rounded-[8px] lg:rounded-[9px] " + fond}
                />
              ),
            )}
          </div>

          <div
            className="mb-[13px] flex h-[38px] items-center justify-center rounded-[10px] lg:mb-3.5 lg:h-10"
            style={{ backgroundColor: accent.remplissage, color: accent.surRemplissage }}
          >
            <span className="font-label-md text-[12px] font-bold lg:text-[13px]">
              {t("apercuApprouver")}
            </span>
          </div>

          {/* LE PIED DES RÉSEAUX N'EXISTE QUE S'IL Y EN A, et son titre n'existe
              que s'il y a un nom à écrire. « Retrouvez le vendeur » serait un
              texte de remplacement — ce que la décision 26 interdit. */}
          {reseauxConfigures.length > 0 ? (
            <div className="border-t border-filet-section pt-3 text-center lg:pt-[13px]">
              {nom.trim() !== "" ? (
                <p className="mb-[7px] font-body-sm text-[10px] text-on-surface-variant lg:mb-2">
                  {t("apercuReseaux", { nom })}
                </p>
              ) : null}
              <div className="flex justify-center gap-[7px] lg:gap-2">
                {reseauxConfigures.map((reseau) => (
                  <span
                    key={reseau.clef}
                    className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-fond-neutre text-ardoise-doux lg:h-[30px] lg:w-[30px] lg:rounded-[9px]"
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
    </section>
  );

  return (
    <form
      action={action}
      className="flex flex-col gap-3 lg:gap-[18px]"
      style={
        {
          "--apercu-remplissage": accent.remplissage,
          "--apercu-sur-remplissage": accent.surRemplissage,
        } as React.CSSProperties
      }
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
      <div className="flex flex-col gap-3 lg:gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_372px] xl:items-start xl:gap-[18px]">
        <div className="xl:col-start-2 xl:row-start-1">{apercu}</div>

        <div className="flex flex-col gap-3 lg:gap-4 xl:col-start-1 xl:row-start-1">
          {/* --- Identité ------------------------------------------------ */}
          <section className={carte} aria-labelledby="titre-identite">
            <h2 id="titre-identite" className={titreCarte + " mb-4 lg:mb-5"}>
              {t("identiteTitre")}
            </h2>

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
            <p className={"mt-1.5 " + aide + " text-[11px]"}>{t("nomAide")}</p>
            {champsEnEchec.includes("nom") ? (
              <p role="alert" className="mt-2 font-body-sm text-body-sm text-error">
                {t("erreurNom")}
              </p>
            ) : null}

            <div className="h-[18px] lg:h-5" />

            <span className={etiquette}>{t("logoTitre")}</span>
            <input
              ref={champFichier}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(e) => {
                const fichier = e.target.files?.[0];
                if (fichier !== undefined) void deposerLogo(fichier);
              }}
            />
            <div className="flex flex-wrap items-center gap-3 lg:gap-3.5">
              <span className="flex h-[54px] w-[54px] shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-fond-avatar lg:h-[60px] lg:w-[60px] lg:rounded-[15px]">
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
                  className="min-h-11 rounded-[12px] border border-filet-controle px-4 font-label-md text-[14px] font-semibold text-on-surface lg:h-10 lg:min-h-0 lg:rounded-[11px] lg:px-[15px]"
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
                    className="min-h-11 rounded-[12px] border border-filet-controle px-4 font-label-md text-[14px] font-semibold text-alerte lg:h-10 lg:min-h-0 lg:rounded-[11px] lg:px-[15px]"
                  >
                    {t("logoRetirer")}
                  </button>
                ) : null}
              </div>
            </div>
            {/* LES FORMATS SONT ÉNUMÉRÉS, ET LE SVG N'Y EST PAS. Il est refusé
                côté serveur parce qu'un SVG est un document capable de porter du
                script ; l'annoncer ici évite un refus après téléversement. */}
            <p className={"mt-2 " + aide + " text-[11px]"}>{t("depotFormats")}</p>

            {logo.phase === "erreur" ? (
              <p role="alert" className="mt-2 font-body-sm text-body-sm text-error">
                {logo.motif}
              </p>
            ) : null}
          </section>

          {/* --- Couleur ------------------------------------------------- */}
          <section className={carte} aria-labelledby="titre-couleur">
            <div className="mb-3.5 flex items-center justify-between gap-3 lg:mb-[18px]">
              <h2 id="titre-couleur" className={titreCarte}>
                {t("couleurTitre")}
              </h2>
              {/*
                LE BADGE DIT CE QUE LA MACHINE A ÉTABLI, pas ce qu'on espère.
                `resoudreAccent()` garantit 4,5:1 sur le texte et 3:1 sur
                l'interface pour N'IMPORTE QUELLE valeur — y compris invalide,
                où elle retombe sur le défaut. Le badge n'est donc jamais rouge :
                il rappelle au vendeur qu'il n'a pas à chercher une couleur qui
                marche.
              */}
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-succes-fond px-2.5 py-1 font-label-md text-[11px] font-bold text-succes">
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
            </div>

            <div className="mb-2.5 flex items-center gap-2.5 lg:mb-[18px] lg:gap-3">
              <label
                className="h-[46px] w-[46px] shrink-0 cursor-pointer rounded-[13px] border border-outline-variant"
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
              <span className={"hidden lg:block " + aide}>{t("couleurAide")}</span>
            </div>
            <p className={"lg:hidden " + aide}>{t("couleurAide")}</p>

            {champsEnEchec.includes("couleurAccent") ? (
              <p role="alert" className="mt-2 font-body-sm text-body-sm text-error">
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
              <div className="rounded-[12px] border border-outline-variant p-3">
                <p className={"mb-2 " + aide + " text-[11px]"}>{t("demoTexte")}</p>
                <p
                  className="font-headline-md text-[15px] font-bold"
                  style={{ color: accent.texte }}
                >
                  {t("apercuStatut")}
                </p>
                <p className={"mt-1.5 " + aide + " text-[10px]"}>{t("demoTexteSeuil")}</p>
              </div>

              <div className="rounded-[12px] border border-outline-variant p-3">
                <p className={"mb-2 " + aide + " text-[11px]"}>{t("demoBouton")}</p>
                <div
                  className="flex h-[30px] items-center justify-center rounded-[8px]"
                  style={{
                    backgroundColor: accent.remplissage,
                    color: accent.surRemplissage,
                  }}
                >
                  <span className="font-label-md text-[12px] font-bold">
                    {t("apercuApprouver")}
                  </span>
                </div>
                <p className={"mt-1.5 " + aide + " text-[10px]"}>{t("demoBoutonSeuil")}</p>
              </div>

              <div className="rounded-[12px] border border-outline-variant p-3">
                <p className={"mb-2 " + aide + " text-[11px]"}>{t("demoBandeau")}</p>
                <div
                  className="flex h-[30px] items-center overflow-hidden rounded-[8px] px-2.5"
                  style={{
                    backgroundColor: accent.remplissage,
                    color: accent.surRemplissage,
                  }}
                >
                  <span className="truncate font-label-md text-[11px] font-bold">
                    {nom.trim() === "" ? t("apercuCommande") : nom}
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
          </section>

          {/* --- Réseaux ------------------------------------------------- */}
          <section className={carte} aria-labelledby="titre-reseaux">
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <h2 id="titre-reseaux" className={titreCarte}>
                {t("reseauxTitre")}
              </h2>
              <span className="shrink-0 font-body-sm text-[12px] text-on-surface-variant">
                {t("reseauxFacultatif")}
              </span>
            </div>
            <p className="mb-4 font-body-sm text-[13px] leading-5 text-on-surface-variant lg:mb-[18px]">
              {t("reseauxAide")}
            </p>

            <div className="flex flex-col gap-3.5 lg:gap-3">
              {RESEAUX.map((reseau) => (
                <div key={reseau.clef} className="flex items-end gap-[11px] lg:gap-3">
                  <span
                    className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[12px] lg:mb-px lg:h-10 lg:w-10"
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
                      type="url"
                      inputMode="url"
                      maxLength={200}
                      value={reseaux[reseau.clef]}
                      onChange={(e) =>
                        setReseaux((actuels) => ({ ...actuels, [reseau.clef]: e.target.value }))
                      }
                      placeholder={t("reseauExemple." + reseau.clef)}
                      className={champReseau}
                    />
                    {champsEnEchec.includes(reseau.clef) ? (
                      <p role="alert" className="mt-2 font-body-sm text-body-sm text-error">
                        {t("reseauInvalide")}
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
            <div className="mt-4 flex items-start gap-2.5 rounded-[11px] bg-surface-container-low px-3.5 py-3">
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
                className="mt-px shrink-0 text-sourdine"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 16v-4" />
                <path d="M12 8h.01" />
              </svg>
              <span className={aide}>{t("reseauxNouvelOnglet")}</span>
            </div>
          </section>

          {/* --- Options ------------------------------------------------- */}
          <section className={carte} aria-labelledby="titre-options">
            <h2 id="titre-options" className={titreCarte + " mb-1 lg:mb-[18px]"}>
              {t("optionsTitre")}
            </h2>

            <div className="mt-3 flex items-center justify-between gap-4 border-t border-filet-ligne py-3.5 lg:mt-0 lg:border-t-0 lg:border-b lg:pt-0 lg:pb-4">
              <div>
                <p className="mb-0.5 font-body-md text-[15px] font-semibold text-on-surface">
                  {t("filigraneTitre")}
                </p>
                <p className="font-body-sm text-[13px] leading-5 text-on-surface-variant">
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
                  (filigranePossible ? "cursor-pointer" : "cursor-not-allowed opacity-50")
                }
                style={{
                  backgroundColor:
                    filigrane && filigranePossible
                      ? accent.remplissage
                      : "var(--color-fond-barre)",
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
                        : "var(--color-surface-container-lowest)",
                  }}
                />
                <span className="sr-only">{t("filigraneLabel")}</span>
              </label>
            </div>

            <div className="border-t border-filet-ligne pt-3.5 lg:flex lg:items-center lg:justify-between lg:gap-5 lg:border-t-0 lg:pt-4">
              <div>
                <p className="mb-0.5 font-body-md text-[15px] font-semibold text-on-surface">
                  {t("langueTitre")}
                </p>
                <p className="font-body-sm text-[13px] leading-5 text-on-surface-variant">
                  {t("langueAide")}
                </p>
              </div>
              {/* UNE LISTE, ET NON DEUX BOUTONS RADIO : deux options
                  aujourd'hui, et la planche dessine une liste — une troisième
                  langue ne redessinerait pas l'écran. */}
              <select
                aria-label={t("langueTitre")}
                value={langue}
                onChange={(e) => setLangue(e.target.value === "en" ? "en" : "fr")}
                className={champ + " champ-liste mt-2.5 cursor-pointer lg:mt-0 lg:w-[150px]"}
              >
                <option value="fr">{t("langue.fr")}</option>
                <option value="en">{t("langue.en")}</option>
              </select>
            </div>
          </section>

          {/*
            LA BARRE D'ENREGISTREMENT.

            ⚠️ AUCUNE DES DEUX PLANCHES NE LA DESSINE, et elle est conservée
            quand même. Ici, un seul geste rhabille TOUTES les pages du vendeur,
            y compris les liens déjà envoyés : enregistrer à chaque frappe ferait
            défiler des couleurs intermédiaires chez ses clients pendant qu'il
            tape un code hexadécimal. La sauvegarde automatique de l'éditeur ne
            touche, elle, qu'une commande que personne ne regarde à cet instant.
          */}
          <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
            {/* LE TÉMOIN N'AFFIRME QUE CE QUE LE SERVEUR A CONFIRMÉ :
                « enregistré » n'apparaît qu'au retour de l'action, jamais à la
                soumission. */}
            {resultat.statut === "enregistre" ? (
              <p role="status" className="font-body-sm text-body-sm text-on-surface-variant">
                {t("enregistre")}
              </p>
            ) : null}
            {resultat.statut === "erreur" && resultat.motif !== "saisie" ? (
              <p role="alert" className="font-body-sm text-body-sm text-error">
                {t(`erreur.${resultat.motif}`)}
              </p>
            ) : null}
            <BoutonEnregistrer libelle={t("enregistrer")} enCours={t("enregistrement")} />
          </div>
        </div>
      </div>
    </form>
  );
}
