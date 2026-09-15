"use client";

import { ACCEPT_LOGO } from "@/lib/boutique/types-logo";
import { useActionState, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ImagePlus, MessageCircle, Store, Upload, Users, X } from "lucide-react";
import type { LibellesApercu } from "@/lib/boutique/phrases-apercu";
import {
  confirmerDepotLogo,
  preparerDepotLogo,
  terminerOnboarding,
  type ResultatOnboarding,
} from "@/app/[locale]/bienvenue/actions";
import { ACCENT_DEFAUT, resoudreAccent } from "@/lib/design/contraste";
import { BoutonPrincipalDs, ChampAcces, MessageErreurDs } from "@/components/acces-champs";

/**
 * L'ONBOARDING — `OnboardingScreen` du kit `auth`, écrit le 14/09/2026 avant ce
 * formulaire. Il portait encore l'ancien canevas : cadre lavande, carte-page à
 * rayon 28, bouton noir, bandeau d'aperçu à la couleur du vendeur — une page
 * client qui n'existe plus.
 *
 * LE FORMULAIRE REND LES DEUX COLONNES : l'aperçu dépend de ce qu'on est en
 * train de saisir, donc il ne peut pas vivre dans un composant serveur qui ne
 * verra jamais ces frappes.
 *
 * ⚠️ « PASSER POUR L'INSTANT » N'EXISTE PAS, ni dans le kit ni ici.
 * `onboardingAFaire()` répond « oui » tant que `account_type` est nul — et cette
 * colonne est NULLABLE SANS DÉFAUT exprès, pour que le manque soit visible. Passer
 * reboucherait sur cette page ; l'honorer demanderait un état « a refusé de
 * répondre », qui fausserait la segmentation que la colonne existe pour mesurer.
 */

const INITIAL: ResultatOnboarding = { statut: "inactif" };

const LIBELLE = "mb-2 block text-[14px] leading-[normal] font-semibold text-ds-texte-fort";

type EtatLogo =
  | { phase: "vide" }
  | { phase: "envoi"; pourcent: number }
  | { phase: "pose"; apercu: string; nom: string; octets: number }
  | { phase: "erreur"; motif: string };

/*
 * LES CLÉS SONT ÉCRITES EN TOUTES LETTRES : l'inventaire des chaînes mortes lit
 * les appels du code, et une clé composée à l'exécution lui échappe.
 */
const TYPES = [
  { valeur: "supplier", icone: Users, titre: "type.supplier.titre", detail: "type.supplier.detail" },
  { valeur: "reseller", icone: MessageCircle, titre: "type.reseller.titre", detail: "type.reseller.detail" },
] as const;

export function FormulaireOnboarding({
  locale,
  libelles,
}: {
  readonly locale: string;
  readonly libelles: LibellesApercu;
}) {
  const t = useTranslations("onboarding");
  const [resultat, action] = useActionState(terminerOnboarding, INITIAL);

  const [typeDeCompte, setTypeDeCompte] = useState<"supplier" | "reseller" | "">("");
  const [nom, setNom] = useState("");
  const [couleur, setCouleur] = useState(ACCENT_DEFAUT);
  const [logo, setLogo] = useState<EtatLogo>({ phase: "vide" });
  const champFichier = useRef<HTMLInputElement>(null);

  const accent = useMemo(() => resoudreAccent(couleur), [couleur]);

  // ⚠️ `session` EST AUSSI UN MOTIF DE REFUS DU DÉPÔT, et la clé composée
  // `logoErreur.${motif}` ne l'avait pas : une session expirée affichait
  // l'identifiant de traduction brut à la place d'une phrase.
  const erreurLogo = {
    type: t("logoErreur.type"),
    taille: t("logoErreur.taille"),
    session: t("erreurSession"),
  } as const;

  async function deposerLogo(fichier: File): Promise<void> {
    setLogo({ phase: "envoi", pourcent: 0 });

    const prepare = await preparerDepotLogo(fichier.type, fichier.size);
    if (prepare.statut === "erreur") {
      setLogo({ phase: "erreur", motif: erreurLogo[prepare.motif] });
      return;
    }

    // Dépôt DIRECT navigateur → stockage, par URL présignée : une Server Action
    // plafonne son corps à 1 Mo, et un logo le dépasse vite.
    const envoi = await new Promise<boolean>((resoudre) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", prepare.url, true);
      for (const [nomEnTete, valeur] of Object.entries(prepare.enTetes)) {
        // Le navigateur pose lui-même la longueur ; la forcer lève une erreur.
        if (nomEnTete.toLowerCase() === "content-length") continue;
        xhr.setRequestHeader(nomEnTete, valeur);
      }
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setLogo({ phase: "envoi", pourcent: Math.round((e.loaded / e.total) * 100) });
        }
      };
      xhr.onload = () => resoudre(xhr.status >= 200 && xhr.status < 300);
      xhr.onerror = () => resoudre(false);
      xhr.send(fichier);
    });

    if (!envoi) {
      setLogo({ phase: "erreur", motif: t("logoErreur.envoi") });
      return;
    }

    // La taille est RELUE côté serveur : le navigateur n'est jamais cru sur ce
    // qu'il affirme avoir envoyé.
    const confirme = await confirmerDepotLogo(prepare.cle);
    if (confirme.statut === "erreur") {
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

  const champsEnEchec =
    resultat.statut === "erreur" && resultat.motif === "saisie" ? (resultat.champs ?? []) : [];

  return (
    <form
      action={action}
      className="grid grid-cols-[minmax(0,1fr)] items-center gap-20 lg:grid-cols-[minmax(0,620px)_minmax(0,1fr)]"
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="couleurAccent" value={couleur} />

      {/* ================= LES RÉGLAGES ================================== */}
      <div className="mx-auto flex w-full max-w-[620px] flex-col gap-[22px] rounded-ds-3xl bg-ds-surface-carte px-5 pt-6 pb-[30px] shadow-ds-lg md:px-12 md:py-10">
        {/* ⚠️ « ÉTAPE 1 SUR 2 » EST VRAI : la seconde étape est la première
            commande, et c'est là que mène « Continuer ». Un compteur d'étapes qui
            promettrait une suite inexistante affirmerait ce qui n'est pas. */}
        <div aria-hidden="true" className="grid grid-cols-2 gap-1.5">
          <span className="h-1 rounded-ds-pill bg-ds-accent" />
          <span className="h-1 rounded-ds-pill bg-ds-ink-200" />
        </div>

        <div>
          <h1 className="text-[24px] leading-[1.1] font-extrabold tracking-[-0.04em] text-ds-texte-titre md:text-[34px]">
            {t("titre")}
          </h1>
          <p className="mt-2.5 text-[15px] leading-[1.55] text-ds-texte-corps">{t("sousTitre")}</p>
        </div>

        {/* --- Le nom de la boutique ------------------------------------ */}
        <ChampAcces
          id="nom"
          nom="nom"
          libelle={t("nomTitre")}
          icone={Store}
          placeholder={t("nomPlaceholder")}
          requis={false}
          valeur={nom}
          surChangement={setNom}
          invalide={champsEnEchec.includes("nom")}
        />

        {/* --- Le logo -------------------------------------------------- */}
        <div>
          <span className={LIBELLE}>{t("logoTitre")}</span>
          <div className="flex items-center gap-3.5">
            {logo.phase === "pose" ? (
              // eslint-disable-next-line @next/next/no-img-element -- aperçu local (blob:), hors optimiseur d'images
              <img
                src={logo.apercu}
                alt=""
                className="h-14 w-14 shrink-0 rounded-ds-card border border-ds-filet bg-ds-surface-carte object-contain p-1.5"
              />
            ) : (
              <span
                aria-hidden="true"
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-ds-card border border-dashed border-ds-filet-appuye bg-ds-surface-creux text-ds-texte-sourdine"
              >
                <ImagePlus size={20} strokeWidth={1.8} />
              </span>
            )}
            <div className="min-w-0">
              <button
                type="button"
                onClick={() => champFichier.current?.click()}
                className="inline-flex h-11 items-center gap-[9px] rounded-ds-card border border-ds-filet bg-ds-surface-carte px-4 text-[14px] font-semibold text-ds-texte-fort shadow-ds-xs transition-colors hover:bg-ds-surface-creux"
              >
                <Upload aria-hidden="true" size={16} strokeWidth={1.9} className="text-ds-accent" />
                {logo.phase === "envoi"
                  ? t("logoEnvoi", { pourcent: logo.pourcent })
                  : logo.phase === "pose"
                    ? t("logoRemplacer")
                    : t("logoChoisir")}
              </button>
              <p className="mt-1.5 truncate text-[12.5px] leading-[1.55] text-ds-texte-sourdine">
                {logo.phase === "pose" ? logo.nom : t("logoFormats")}
              </p>
            </div>
            {logo.phase === "pose" ? (
              <button
                type="button"
                onClick={() => setLogo({ phase: "vide" })}
                aria-label={t("logoRetirer")}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-ds-sm text-ds-texte-sourdine transition-colors hover:text-ds-erreur-encre"
              >
                <X aria-hidden="true" size={18} strokeWidth={1.9} />
              </button>
            ) : null}
          </div>
          {logo.phase === "erreur" ? (
            <p role="alert" className="mt-2 text-[13px] text-ds-erreur-encre">
              {logo.motif}
            </p>
          ) : null}
        </div>

        {/* --- La couleur ----------------------------------------------- */}
        <div>
          <label htmlFor="couleurTexte" className={LIBELLE}>
            {t("couleurTitre")}
          </label>
          <span className="flex h-14 items-center gap-3 rounded-ds-card border border-ds-filet-appuye bg-ds-surface-carte px-[18px] focus-within:border-ds-filet-focus focus-within:shadow-[var(--anneau-ds-focus)]">
            {/* LA CIBLE FAIT 44 PX, LA PASTILLE 28 : les marges négatives rendent
                à la ligne l'encombrement du kit, sans rétrécir ce qu'on touche. */}
            <label className="-mx-2 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center">
              <span
                aria-hidden="true"
                className="h-7 w-7 rounded-ds-xs shadow-[inset_0_0_0_1px_rgba(11,11,24,0.08)]"
                style={{ backgroundColor: couleur }}
              />
              <span className="sr-only">{t("couleurTitre")}</span>
              <input type="color" value={couleur} onChange={(e) => setCouleur(e.target.value)} className="sr-only" />
            </label>
            <input
              id="couleurTexte"
              type="text"
              value={couleur}
              onChange={(e) => setCouleur(e.target.value.trim())}
              placeholder="#000000"
              className="h-full min-w-0 flex-1 border-none bg-transparent font-mono text-[15px] text-ds-texte-fort uppercase outline-none"
            />
          </span>
          {/* LA PHRASE DIT DÉJÀ QUE L'AJUSTEMENT EST AUTOMATIQUE : un
              avertissement « couleur ajustée » s'afficherait ici avant que le
              vendeur ait rien choisi, sur la couleur par défaut. */}
          <p className="mt-2 text-[12.5px] leading-[1.5] text-ds-texte-sourdine">{t("couleurAide")}</p>
        </div>

        {/* --- Le type de compte ---------------------------------------- */}
        <fieldset>
          {/* LA SEULE COLONNE SANS VALEUR PAR DÉFAUT EN BASE : un défaut aurait
              classé tous les fournisseurs comme revendeurs, et faussé la
              segmentation d'usage qui est le livrable de la phase de validation. */}
          <legend className={LIBELLE}>{t("typeTitre")}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {TYPES.map((type) => {
              const choisi = typeDeCompte === type.valeur;
              const Icone = type.icone;
              return (
                <label
                  key={type.valeur}
                  className={
                    "flex cursor-pointer items-start gap-3 rounded-ds-card border p-4 transition-colors " +
                    (choisi
                      ? "border-ds-accent bg-ds-surface-teinte shadow-[var(--anneau-ds-focus)]"
                      : "border-ds-filet bg-ds-surface-carte hover:bg-ds-surface-creux")
                  }
                >
                  <input
                    type="radio"
                    name="typeDeCompte"
                    value={type.valeur}
                    checked={choisi}
                    onChange={() => setTypeDeCompte(type.valeur)}
                    className="sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className={
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-ds-sm text-ds-accent " +
                      (choisi ? "bg-ds-surface-carte" : "bg-ds-surface-teinte")
                    }
                  >
                    <Icone size={17} strokeWidth={1.9} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[14.5px] leading-[normal] font-bold text-ds-texte-fort">{t(type.titre)}</span>
                    <span className="mt-0.5 block text-[13px] leading-[1.45] text-ds-texte-corps">{t(type.detail)}</span>
                  </span>
                </label>
              );
            })}
          </div>
          {champsEnEchec.includes("typeDeCompte") ? (
            <p role="alert" className="mt-2 text-[13px] text-ds-erreur-encre">
              {t("erreurType")}
            </p>
          ) : null}
        </fieldset>

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

        {resultat.statut === "erreur" && resultat.motif !== "saisie" ? (
          <MessageErreurDs
            id="erreur-onboarding"
            texte={resultat.motif === "session" ? t("erreurSession") : t("erreurEcriture")}
          />
        ) : null}

        <BoutonPrincipalDs libelle={t("valider")} libelleEnCours={t("validationEnCours")} />
      </div>

      {/* ================= L'APERÇU EN DIRECT ============================= */}
      {/* MASQUÉ SOUS `lg` : il ne porte aucune information dont le formulaire
          dépende, et au téléphone il repousserait le bouton sous trois écrans. */}
      <div className="hidden flex-col items-center gap-5 lg:flex">
        <span className="text-[11px] leading-[normal] font-extrabold tracking-[0.12em] text-ds-texte-sourdine uppercase">
          {t("apercuTitre")}
        </span>
        <div aria-hidden="true" className="w-[300px] rounded-[40px] bg-ds-ink-900 p-2 shadow-ds-window">
          {/* LA PAGE CLIENT TELLE QU'ELLE EST : carte d'identité, carte de
              commande et sa frise, galerie. Les couleurs sont celles que
              `resoudreAccent` donnera réellement au client — jamais un blanc en
              dur sur l'aplat, un accent clair le rendrait illisible. */}
          <div className="flex min-h-[540px] flex-col gap-2.5 overflow-hidden rounded-[32px] bg-ds-surface-page p-3.5">
            <div className="flex items-center gap-2.5 rounded-ds-card border border-ds-filet bg-ds-surface-carte p-3">
              {logo.phase === "pose" ? (
                // eslint-disable-next-line @next/next/no-img-element -- aperçu local (blob:)
                <img src={logo.apercu} alt="" className="h-[34px] w-[34px] shrink-0 rounded-full object-cover" />
              ) : (
                <span className="h-[34px] w-[34px] shrink-0 rounded-full" style={{ backgroundColor: accent.remplissage }} />
              )}
              <span className="truncate text-[14px] font-bold text-ds-texte-fort">
                {nom.trim() === "" ? t("sansNom") : nom}
              </span>
            </div>
            <div className="rounded-ds-card border border-ds-filet bg-ds-surface-carte p-3.5">
              <span className="block text-[16px] font-extrabold tracking-[-0.03em] text-ds-texte-fort">
                {libelles.commande}
              </span>
              <div className="mt-3 grid grid-cols-4 gap-1">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-[5px] rounded-full" style={{ backgroundColor: accent.interface }} />
                ))}
                <span className="h-[5px] rounded-full bg-ds-ink-200" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className="aspect-square rounded-ds-sm bg-ds-surface-creux" />
              ))}
            </div>
            <span
              className="flex h-[42px] items-center justify-center rounded-ds-card text-[13px] font-bold"
              style={{ backgroundColor: accent.remplissage, color: accent.surRemplissage }}
            >
              {libelles.approuver}
            </span>
          </div>
        </div>
      </div>
    </form>
  );
}
