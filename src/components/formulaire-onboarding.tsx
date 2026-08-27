"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import {
  confirmerDepotLogo,
  preparerDepotLogo,
  terminerOnboarding,
  type ResultatOnboarding,
} from "@/app/[locale]/bienvenue/actions";
import { ACCENT_DEFAUT, resoudreAccent } from "@/lib/design/contraste";
import { Icone } from "@/components/icone";

/**
 * Onboarding, porté sur le canevas Claude Design.
 *
 * POURQUOI CETTE MAQUETTE-LÀ. L'onboarding n'a pas d'écran dédié dans le zip,
 * mais celui des réglages de marque demande EXACTEMENT les mêmes choses : un
 * logo, une couleur, et un aperçu de ce que verra le client. Reprendre sa
 * structure évite d'inventer un écran quand il en existe déjà un.
 *
 * STRUCTURE REPRISE : grille bento `grid grid-cols-1 lg:grid-cols-2 gap-gutter`,
 * cartes de verre en `rounded-xl shadow-sm p-6 flex flex-col gap-6`, zone de
 * dépôt en pointillés avec sa pastille de 64 px, saisie hexadécimale précédée de
 * son échantillon de 48 px, pastilles de teintes suggérées, aperçu en pleine
 * largeur, et barre d'actions séparée par un filet.
 *
 * DEUX AJOUTS, imposés par le produit :
 *
 * 1. LE TYPE DE COMPTE, absent de la maquette parce qu'il n'appartient qu'à
 *    l'onboarding. C'est la seule colonne sans valeur par défaut en base : un
 *    défaut aurait classé tous les fournisseurs comme revendeurs et faussé
 *    irrémédiablement la segmentation d'usage, qui est le livrable réel de la
 *    phase de validation.
 * 2. LE NOM DE BOUTIQUE, que la maquette n'a pas — elle suppose le logo seul.
 *    Il reste FACULTATIF : la page publique omet son en-tête quand il n'y a ni
 *    nom ni logo, et un vendeur peut envoyer un lien sans avoir rien configuré.
 *
 * L'APERÇU MONTRE LE CONTRASTE RÉSOLU, pas la couleur brute. Le brief exige que
 * la conformité soit obtenue automatiquement, « sans que le vendeur ait à
 * chercher une couleur qui marche ».
 *
 * Le dépôt du logo va DIRECTEMENT du navigateur à R2 : les Server Actions ont
 * une limite de corps d'un mégaoctet, et le piège est vicieux parce qu'il PASSE
 * en développement sur de petites images de test.
 */

const INITIAL: ResultatOnboarding = { statut: "inactif" };


function BoutonValider({ libelle, enCours }: { libelle: string; enCours: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-[44px] rounded-lg bg-[var(--apercu-remplissage)] px-6 py-3 font-label-md text-label-md text-[var(--apercu-sur-remplissage)] shadow-md transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {pending ? enCours : libelle}
    </button>
  );
}

type EtatLogo =
  | { phase: "vide" }
  | { phase: "envoi"; pourcent: number }
  | { phase: "pose"; apercu: string; nom: string; octets: number }
  | { phase: "erreur"; motif: string };

export function FormulaireOnboarding({ locale }: { locale: string }) {
  const t = useTranslations("onboarding");
  const [resultat, action] = useActionState(terminerOnboarding, INITIAL);

  const [typeDeCompte, setTypeDeCompte] = useState<"supplier" | "reseller" | "">("");
  const [nom, setNom] = useState("");
  const [couleur, setCouleur] = useState(ACCENT_DEFAUT);
  const [logo, setLogo] = useState<EtatLogo>({ phase: "vide" });
  const champFichier = useRef<HTMLInputElement>(null);

  const accent = useMemo(() => resoudreAccent(couleur), [couleur]);

  async function deposerLogo(fichier: File): Promise<void> {
    setLogo({ phase: "envoi", pourcent: 0 });

    const prepare = await preparerDepotLogo(fichier.type, fichier.size);
    if (prepare.statut === "erreur") {
      setLogo({ phase: "erreur", motif: t(`logoErreur.${prepare.motif}`) });
      return;
    }

    // `XMLHttpRequest` et non `fetch` : c'est la seule API qui rapporte la
    // progression d'un envoi. Sur une connexion lente — le cas du fournisseur en
    // Chine — une barre qui n'avance pas se lit comme une panne.
    const envoi = await new Promise<boolean>((resoudre) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", prepare.url, true);
      for (const [nomEnTete, valeur] of Object.entries(prepare.enTetes)) {
        // `content-length` est un en-tête interdit au script : le navigateur le
        // calcule lui-même depuis le corps. On ne pose donc que ce qu'on a le
        // droit de poser, et la valeur calculée doit coïncider avec celle qui a
        // été signée.
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

    // On n'affirme le succès qu'APRÈS confirmation du serveur, qui relit la
    // taille réelle. Annoncer avant serait un pari sur le serveur, et un pari
    // perdu laisserait le vendeur croire son logo posé.
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
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="couleurAccent" value={couleur} />

      <div className="grid grid-cols-1 gap-gutter lg:grid-cols-2">
        {/* --- Type de compte : propre à l'onboarding ------------------- */}
        <fieldset className="carte flex flex-col gap-6 rounded-xl p-6 shadow-sm lg:col-span-2">
          <div>
            <legend className="flex items-center gap-2 font-headline-md text-headline-md text-on-surface">
              <Icone nom="storefront" className="text-[var(--apercu-texte)]" />
              {t("typeTitre")}
            </legend>
            <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">{t("typeAide")}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {(["supplier", "reseller"] as const).map((valeur) => (
              <label
                key={valeur}
                className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-4 transition-colors ${
                  typeDeCompte === valeur
                    ? "border-[var(--apercu-interface)] bg-surface-container-low ring-2 ring-[var(--apercu-interface)]"
                    : "border-outline-variant hover:bg-surface-container-low"
                }`}
              >
                <input
                  type="radio"
                  name="typeDeCompte"
                  value={valeur}
                  checked={typeDeCompte === valeur}
                  onChange={() => setTypeDeCompte(valeur)}
                  className="sr-only"
                />
                <span className="font-label-md text-label-md text-on-surface">
                  {t(`type.${valeur}.titre`)}
                </span>
                <span className="font-body-sm text-body-sm text-on-surface-variant">
                  {t(`type.${valeur}.detail`)}
                </span>
              </label>
            ))}
          </div>

          {champsEnEchec.includes("typeDeCompte") ? (
            <p role="alert" className="font-body-sm text-body-sm text-error">
              {t("erreurType")}
            </p>
          ) : null}
        </fieldset>

        {/* --- Marque : nom + logo -------------------------------------- */}
        <div className="carte flex flex-col gap-6 rounded-xl p-6 shadow-sm">
          <div>
            <h2 className="flex items-center gap-2 font-headline-md text-headline-md text-on-surface">
              <Icone nom="image" className="text-[var(--apercu-texte)]" />
              {t("marqueTitre")}
            </h2>
            <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
              {t("marqueAide")}
            </p>
          </div>

          <div>
            <label
              htmlFor="nomBoutique"
              className="mb-2 block font-label-md text-label-md text-on-surface"
            >
              {t("nomTitre")}
            </label>
            <input
              id="nomBoutique"
              name="nomBoutique"
              type="text"
              maxLength={60}
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder={t("nomPlaceholder")}
              className="min-h-[44px] w-full rounded-lg champ-app px-4 font-body-md text-body-md text-on-surface transition-shadow focus:outline-none focus:ring-2 focus:ring-[var(--apercu-interface)]"
            />
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

          {logo.phase === "pose" ? (
            <div className="flex items-center justify-between rounded-lg bg-surface-container-low p-4">
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- aperçu local (blob:), jamais une URL distante */}
                <img
                  src={logo.apercu}
                  alt=""
                  className="h-10 w-10 rounded-lg bg-white object-contain p-1"
                />
                <div>
                  <p className="font-label-md text-label-md text-on-surface">{logo.nom}</p>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    {Math.round(logo.octets / 1024)} Ko
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLogo({ phase: "vide" })}
                className="text-error transition-colors hover:text-on-error-container"
              >
                <Icone nom="close" titre={t("logoRetirer")} className="text-xl" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => champFichier.current?.click()}
              className="group flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-outline-variant bg-surface-bright/50 p-8 text-center transition-colors hover:bg-surface-bright"
            >
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-violet-fond transition-transform group-hover:scale-110">
                <Icone nom="upload" className="text-2xl text-[var(--apercu-texte)]" />
              </div>
              <p className="mb-1 font-label-md text-label-md text-on-surface">
                {logo.phase === "envoi"
                  ? t("logoEnvoi", { pourcent: logo.pourcent })
                  : t("depotTitre")}
              </p>
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

        {/* --- Couleur -------------------------------------------------- */}
        <div className="carte flex flex-col gap-6 rounded-xl p-6 shadow-sm">
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
                className="min-h-[44px] w-full rounded-lg champ-app px-4 font-body-md text-body-md text-on-surface transition-shadow focus:outline-none focus:ring-2 focus:ring-[var(--apercu-interface)]"
              />
            </div>
          </div>


          {accent.ajuste ? (
            // On le DIT plutôt que de corriger en silence. Un vendeur qui voit
            // sa couleur rendue différemment sans explication croit à un bogue.
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {t("couleurAjustee")}
            </p>
          ) : null}
        </div>

        {/* --- Aperçu en direct, pleine largeur ------------------------- */}
        <div className="carte flex flex-col gap-6 rounded-xl p-6 shadow-sm lg:col-span-2">
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
            <div className="flex h-16 items-center justify-between border-b-[0.5px] border-outline-variant bg-surface px-6">
              <div className="flex items-center gap-2">
                {logo.phase === "pose" ? (
                  // eslint-disable-next-line @next/next/no-img-element -- aperçu local (blob:)
                  <img src={logo.apercu} alt="" className="h-8 object-contain" />
                ) : null}
                <span className="font-headline-md text-headline-md-mobile text-on-surface">
                  {nom.trim() === "" ? t("sansNom") : nom}
                </span>
              </div>
              <span className="font-body-sm text-body-sm text-on-surface-variant">
                {t("apercuEnTete")}
              </span>
            </div>

            <div className="flex min-h-[300px] flex-col items-center justify-center bg-background p-8">
              <div className="w-full max-w-md rounded-lg border border-outline-variant bg-surface-container-lowest p-6">
                <h3 className="mb-4 text-center font-headline-md text-headline-md text-on-surface">
                  {t("apercuCommande")}
                </h3>

                {/* Deux colonnes de vignettes : c'est la disposition que le
                    brief impose à la galerie sur mobile. */}
                <div className="mb-8 grid grid-cols-2 gap-2">
                  {[0, 1, 2, 3].map((i) => (
                    <span key={i} className="block h-16 rounded-lg bg-surface-container-high" />
                  ))}
                </div>

                <div className="relative">
                  <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-surface-variant" />
                  <div className="relative mb-6 flex items-start gap-4">
                    <div className="z-10 h-6 w-6 flex-shrink-0 rounded-full border-4 border-white bg-[var(--apercu-remplissage)] shadow-sm" />
                    <div>
                      <p className="font-label-md text-label-md text-on-surface">
                        {t("apercuEtape1")}
                      </p>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">
                        {t("apercuEtape1Date")}
                      </p>
                    </div>
                  </div>
                  <div className="relative flex items-start gap-4 opacity-50">
                    <div className="z-10 h-6 w-6 flex-shrink-0 rounded-full border-4 border-white bg-surface-variant shadow-sm" />
                    <div>
                      <p className="font-label-md text-label-md text-on-surface">
                        {t("apercuEtape2")}
                      </p>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">
                        {t("apercuEtape2Date")}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {resultat.statut === "erreur" && resultat.motif !== "saisie" ? (
        <p role="alert" className="font-body-sm text-body-sm text-error">
          {resultat.motif === "session" ? t("erreurSession") : t("erreurEcriture")}
        </p>
      ) : null}

      {/* Barre d'actions de la maquette : filet au-dessus, boutons à droite. */}
      <div className="mt-4 flex justify-end gap-4 border-t border-outline-variant pt-6">
        <BoutonValider libelle={t("valider")} enCours={t("validationEnCours")} />
      </div>
    </form>
  );
}
