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
import { Icone } from "@/components/icone";

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

/** Les quatre teintes de la maquette, reprises telles quelles. */
const TEINTES_SUGGEREES = ["#0058be", "#0b1c30", "#ba1a1a", "#10b981"] as const;

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
  const champFichier = useRef<HTMLInputElement>(null);

  const accent = useMemo(() => resoudreAccent(couleur), [couleur]);

  // UN FILIGRANE A BESOIN D'UN NOM À ÉCRIRE. La base éteint le drapeau quand il
  // n'y en a pas ; l'interface le dit AVANT plutôt que de laisser cocher une
  // case qui ne s'appliquera jamais. Un réglage qui s'active sans effet est pire
  // qu'un réglage absent.
  const filigranePossible = nom.trim() !== "";

  async function deposerLogo(fichier: File): Promise<void> {
    setLogo({ phase: "envoi" });

    const prepare = await preparerLogo(fichier.type, fichier.size);
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
      body: fichier,
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
      apercu: URL.createObjectURL(fichier),
      nom: fichier.name,
      octets: fichier.size,
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

  return (
    <form
      action={action}
      className="flex flex-col gap-8"
      style={
        {
          "--apercu-texte": accent.texte,
          "--apercu-interface": accent.interface,
          "--apercu-remplissage": accent.remplissage,
          "--apercu-sur-remplissage": accent.surRemplissage,
        } as React.CSSProperties
      }
    >
      <input type="hidden" name="couleurAccent" value={couleur} />
      <input type="hidden" name="languePublique" value={langue} />

      <div className="grid grid-cols-1 gap-gutter lg:grid-cols-2">
        {/* --- Nom et logo ---------------------------------------------- */}
        <div className="carte flex flex-col gap-6 rounded-lg p-[22px]">
          <div>
            <h2 className="flex items-center gap-2 font-headline-md text-headline-md text-on-surface">
              <Icone nom="image" className="text-[var(--apercu-texte)]" />
              {t("identiteTitre")}
            </h2>
            <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
              {t("identiteAide")}
            </p>
          </div>

          <div>
            <label htmlFor="nom" className="mb-2 block font-label-md text-label-md text-on-surface">
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
              className="min-h-[44px] w-full rounded-lg border-none bg-[#F1F5F9] px-4 font-body-md text-body-md text-on-surface transition-shadow focus:outline-none focus:ring-2 focus:ring-[var(--apercu-interface)]"
            />
            <p className="mt-2 font-body-sm text-body-sm text-on-surface-variant">{t("nomAide")}</p>
            {champsEnEchec.includes("nom") ? (
              <p role="alert" className="mt-2 font-body-sm text-body-sm text-error">
                {t("erreurNom")}
              </p>
            ) : null}
          </div>

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

          {apercuLogo !== null ? (
            <div className="flex items-center justify-between rounded-lg bg-surface-container-low p-4">
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- URL signée
                    à expiration côté serveur, ou aperçu local `blob:`.
                    L'optimiseur mettrait la première en cache au-delà de sa
                    validité et servirait une image morte. */}
                <img
                  src={apercuLogo}
                  alt=""
                  className="h-10 w-10 rounded-lg bg-white object-contain p-1"
                />
                <div>
                  <p className="font-label-md text-label-md text-on-surface">
                    {logo.phase === "pose" ? logo.nom : t("logoActuel")}
                  </p>
                  {logo.phase === "pose" ? (
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      {Math.round(logo.octets / 1024)} Ko
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => champFichier.current?.click()}
                  className="min-h-[44px] rounded-lg px-3 font-label-md text-label-md text-[var(--apercu-texte)]"
                >
                  {t("logoRemplacer")}
                </button>
                <button
                  type="button"
                  onClick={() => void retirer()}
                  className="min-h-[44px] px-2 text-error transition-colors hover:text-on-error-container"
                >
                  <Icone nom="delete" titre={t("logoRetirer")} className="text-xl" />
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => champFichier.current?.click()}
              className="group flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-outline-variant bg-surface-bright/50 p-8 text-center transition-colors hover:bg-surface-bright"
            >
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary-fixed transition-transform group-hover:scale-110">
                <Icone nom="upload" className="text-2xl text-[var(--apercu-texte)]" />
              </div>
              <p className="mb-1 font-label-md text-label-md text-on-surface">
                {logo.phase === "envoi" ? t("logoEnvoi") : t("depotTitre")}
              </p>
              {/* LES FORMATS SONT ÉNUMÉRÉS, ET LE SVG N'Y EST PAS. Il est refusé
                  côté serveur parce qu'un SVG est un document capable de porter
                  du script ; l'annoncer ici évite un refus après téléversement. */}
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                {t("depotFormats")}
              </p>
            </button>
          )}

          {logo.phase === "erreur" ? (
            <p role="alert" className="font-body-sm text-body-sm text-error">
              {logo.motif}
            </p>
          ) : null}
        </div>

        {/*
          --- Réseaux ---------------------------------------------------
          FACULTATIFS, ET LEUR ABSENCE NE SE VOIT PAS CHEZ LE CLIENT : le bloc
          entier est omis de la page publique quand les trois sont vides. Pas de
          logos grisés, pas d'invitation à en ajouter.

          TROIS RÉSEAUX, ET CES TROIS-LÀ SEULEMENT. Snapchat et Telegram sont
          écartés par décision produit.

          LE DOMAINE EST EXIGÉ. Un lien libre rendu sur la page d'un vendeur
          serait une redirection ouverte offerte à qui prend son compte. La base
          l'empêche par contrainte ; ce formulaire, lui, l'EXPLIQUE — les deux
          ne remplacent pas le même défaut.
        */}
        <div className="carte flex flex-col gap-6 rounded-lg p-[22px] lg:col-span-2">
          <div>
            <h2 className="flex items-center gap-2 font-headline-md text-headline-md text-on-surface">
              <Icone nom="link" className="text-[var(--apercu-texte)]" />
              {t("reseauxTitre")}
            </h2>
            <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
              {t("reseauxAide")}
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {(["instagram", "tiktok", "whatsapp"] as const).map((reseau) => (
              <div key={reseau}>
                <label
                  htmlFor={reseau}
                  className="mb-2 block font-label-md text-label-md text-on-surface"
                >
                  {t("reseau." + reseau)}
                </label>
                <input
                  id={reseau}
                  name={reseau}
                  type="url"
                  inputMode="url"
                  maxLength={200}
                  defaultValue={initial.reseaux[reseau] ?? ""}
                  placeholder={t("reseauExemple." + reseau)}
                  className="champ-app min-h-[44px] w-full rounded-md border border-outline px-4 font-body-md text-body-md text-on-surface"
                />
                {champsEnEchec.includes(reseau) ? (
                  <p role="alert" className="mt-2 font-body-sm text-body-sm text-error">
                    {t("reseauInvalide")}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        {/* --- Couleur -------------------------------------------------- */}
        <div className="carte flex flex-col gap-6 rounded-lg p-[22px]">
          <div>
            <h2 className="flex items-center gap-2 font-headline-md text-headline-md text-on-surface">
              <Icone nom="palette" className="text-[var(--apercu-texte)]" />
              {t("couleurTitre")}
            </h2>
            <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
              {t("couleurAide")}
            </p>
          </div>

          <div>
            <label
              htmlFor="couleurTexte"
              className="mb-2 block font-label-md text-label-md text-on-surface"
            >
              {t("couleurHex")}
            </label>
            <div className="flex gap-2">
              <label
                className="h-12 w-12 flex-shrink-0 cursor-pointer rounded-lg border border-outline-variant shadow-sm"
                style={{ backgroundColor: couleur }}
              >
                <span className="sr-only">{t("couleurTitre")}</span>
                <input
                  type="color"
                  value={couleur}
                  onChange={(e) => setCouleur(e.target.value)}
                  className="sr-only"
                />
              </label>
              <input
                id="couleurTexte"
                type="text"
                value={couleur}
                onChange={(e) => setCouleur(e.target.value.trim())}
                placeholder="#000000"
                className="min-h-[44px] w-full rounded-lg border-none bg-[#F1F5F9] px-4 font-body-md text-body-md text-on-surface transition-shadow focus:outline-none focus:ring-2 focus:ring-[var(--apercu-interface)]"
              />
            </div>
            {champsEnEchec.includes("couleurAccent") ? (
              <p role="alert" className="mt-2 font-body-sm text-body-sm text-error">
                {t("erreurCouleur")}
              </p>
            ) : null}
          </div>

          <div>
            <p className="mb-3 font-label-md text-label-md text-on-surface">{t("couleurPresets")}</p>
            <div className="flex flex-wrap gap-3">
              {TEINTES_SUGGEREES.map((teinte) => {
                const choisie = teinte.toLowerCase() === couleur.toLowerCase();
                return (
                  <button
                    key={teinte}
                    type="button"
                    onClick={() => setCouleur(teinte)}
                    aria-pressed={choisie}
                    style={{ backgroundColor: teinte }}
                    className={`flex h-10 w-10 items-center justify-center rounded-full shadow-sm transition-transform hover:scale-110 ${
                      choisie ? "border-2 border-on-surface" : "border border-outline-variant"
                    }`}
                  >
                    {choisie ? <Icone nom="done" className="text-sm text-white" /> : null}
                    <span className="sr-only">{teinte}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {accent.ajuste ? (
            // On le DIT plutôt que de corriger en silence. La couleur stockée
            // reste celle du vendeur ; c'est le RENDU qui dérive des variantes
            // lisibles. Un vendeur qui voit sa couleur affichée autrement sans
            // explication croit à un bogue.
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {t("couleurAjustee")}
            </p>
          ) : null}
        </div>

        {/* --- Langue publique et filigrane ----------------------------- */}
        <div className="carte flex flex-col gap-6 rounded-lg p-[22px] lg:col-span-2">
          <div>
            <h2 className="flex items-center gap-2 font-headline-md text-headline-md text-on-surface">
              <Icone nom="tune" className="text-[var(--apercu-texte)]" />
              {t("pageTitre")}
            </h2>
            <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
              {t("pageAide")}
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <fieldset>
              <legend className="mb-2 font-label-md text-label-md text-on-surface">
                {t("langueTitre")}
              </legend>
              {/* DEUX LANGUES DISTINCTES, ET C'EST DIT. Celle-ci habille les
                  pages que voient les clients ; celle de l'interface se règle
                  ailleurs. Un fournisseur peut travailler en anglais et livrer
                  en France, et le client ne choisit pas la langue de son lien. */}
              <p className="mb-3 font-body-sm text-body-sm text-on-surface-variant">
                {t("langueAide")}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {(["fr", "en"] as const).map((valeur) => (
                  <label
                    key={valeur}
                    className={`flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border px-4 transition-colors ${
                      langue === valeur
                        ? "border-[var(--apercu-interface)] bg-surface-container-low ring-2 ring-[var(--apercu-interface)]"
                        : "border-outline-variant hover:bg-surface-container-low"
                    }`}
                  >
                    <input
                      type="radio"
                      name="langueChoix"
                      value={valeur}
                      checked={langue === valeur}
                      onChange={() => setLangue(valeur)}
                      className="sr-only"
                    />
                    <span className="font-label-md text-label-md text-on-surface">
                      {t(`langue.${valeur}`)}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div>
              <p className="mb-2 font-label-md text-label-md text-on-surface">
                {t("filigraneTitre")}
              </p>
              <label
                className={`flex min-h-[44px] items-center gap-3 rounded-lg border px-4 ${
                  filigranePossible
                    ? "cursor-pointer border-outline-variant hover:bg-surface-container-low"
                    : "cursor-not-allowed border-outline-variant opacity-60"
                }`}
              >
                <input
                  type="checkbox"
                  name="filigrane"
                  checked={filigrane && filigranePossible}
                  disabled={!filigranePossible}
                  onChange={(e) => setFiligrane(e.target.checked)}
                  className="h-5 w-5 accent-[var(--apercu-interface)]"
                />
                <span className="font-body-md text-body-md text-on-surface">
                  {t("filigraneLabel")}
                </span>
              </label>
              {/* CE QU'IL FAIT ET CE QU'IL NE FAIT PAS. Un filigrane superposé à
                  l'affichage décourage la réutilisation ; il ne l'empêche pas.
                  Annoncer une protection qu'on n'apporte pas serait pire que ne
                  rien proposer du tout. */}
              <p className="mt-2 font-body-sm text-body-sm text-on-surface-variant">
                {filigranePossible ? t("filigraneAide") : t("filigraneSansNom")}
              </p>
            </div>
          </div>
        </div>

        {/* --- Aperçu en direct ----------------------------------------- */}
        <div className="carte flex flex-col gap-6 rounded-lg p-[22px] lg:col-span-2">
          <div>
            <h2 className="flex items-center gap-2 font-headline-md text-headline-md text-on-surface">
              <Icone nom="visibility" className="text-[var(--apercu-texte)]" />
              {t("apercuTitre")}
            </h2>
            <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
              {t("apercuAide")}
            </p>
          </div>

          <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
            {/* L'EN-TÊTE EST OMIS QUAND IL N'Y A NI NOM NI LOGO — exactement
                comme sur la page publique. L'aperçu doit montrer l'ABSENCE de
                barre, pas une barre vide : c'est le cas le plus fréquent en
                début de vie d'un compte, et c'est précisément celui qu'un vendeur
                a besoin de voir avant d'envoyer son premier lien. */}
            {nom.trim() !== "" || apercuLogo !== null ? (
              <div className="flex h-16 items-center gap-2 border-b-[0.5px] border-outline-variant bg-surface px-6">
                {apercuLogo !== null ? (
                  // eslint-disable-next-line @next/next/no-img-element -- aperçu local ou URL signée
                  <img src={apercuLogo} alt="" className="h-8 object-contain" />
                ) : null}
                {nom.trim() !== "" ? (
                  <span className="font-headline-md text-headline-md-mobile text-on-surface">
                    {nom}
                  </span>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-col gap-4 p-6">
              <span
                className="self-start rounded-full px-3 py-1 font-label-sm text-label-sm"
                style={{
                  backgroundColor: "var(--apercu-remplissage)",
                  color: "var(--apercu-sur-remplissage)",
                }}
              >
                {t("apercuStatut")}
              </span>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[0, 1, 2, 3].map((rang) => (
                  <div
                    key={rang}
                    className="relative aspect-square overflow-hidden rounded-lg bg-surface-container-highest"
                  >
                    {filigrane && filigranePossible ? (
                      <span className="pointer-events-none absolute inset-x-0 bottom-0 select-none truncate bg-black/35 px-1 py-0.5 text-center font-label-sm text-label-sm text-white">
                        {nom}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>

              <p className="font-body-sm text-body-sm text-on-surface-variant">
                {t("apercuLangue", { langue: t(`langue.${langue}`) })}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-4 border-t border-outline-variant pt-6">
        {/* LE TÉMOIN N'AFFIRME QUE CE QUE LE SERVEUR A CONFIRMÉ : « enregistré »
            n'apparaît qu'au retour de l'action, jamais à la soumission. */}
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
    </form>
  );
}
