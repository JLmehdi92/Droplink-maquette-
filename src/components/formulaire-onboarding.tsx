"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import {
  confirmerDepotLogo,
  preparerDepotLogo,
  terminerOnboarding,
  type ResultatOnboarding,
} from "@/app/[locale]/(app)/bienvenue/actions";
import { ACCENT_DEFAUT, resoudreAccent } from "@/lib/design/contraste";

/**
 * Onboarding en soixante secondes.
 *
 * L'APERÇU MONTRE LE CONTRASTE RÉSOLU, pas la couleur brute. Le brief exige que
 * la conformité soit obtenue AUTOMATIQUEMENT, « sans que le vendeur ait à
 * chercher une couleur qui marche ». Afficher le rendu réel, y compris quand la
 * couleur a dû être ajustée pour rester lisible, c'est la seule façon de tenir
 * cette promesse sans transformer le choix d'une couleur en épreuve.
 *
 * Le dépôt du logo va DIRECTEMENT du navigateur à R2. Les Server Actions ont une
 * limite de corps d'un mégaoctet : y faire transiter un fichier échoue dès qu'il
 * dépasse cette taille, et le piège est vicieux parce qu'il PASSE en
 * développement sur de petites images de test.
 */

const INITIAL: ResultatOnboarding = { statut: "inactif" };

function BoutonValider({ libelle, enCours }: { libelle: string; enCours: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[var(--apercu-remplissage)] px-6 py-3 font-label-md text-label-md text-[var(--apercu-sur-remplissage)] disabled:opacity-60"
    >
      {pending ? enCours : libelle}
    </button>
  );
}

type EtatLogo =
  | { phase: "vide" }
  | { phase: "envoi"; pourcent: number }
  | { phase: "pose"; apercu: string }
  | { phase: "erreur"; motif: string };

export function FormulaireOnboarding({ locale }: { locale: string }) {
  const t = useTranslations("onboarding");
  const [resultat, action] = useActionState(terminerOnboarding, INITIAL);

  const [typeDeCompte, setTypeDeCompte] = useState<"supplier" | "reseller" | "">("");
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
      for (const [nom, valeur] of Object.entries(prepare.enTetes)) {
        // `content-length` est un en-tête interdit au script : le navigateur le
        // calcule lui-même depuis le corps. On ne pose donc que ce qu'on a le
        // droit de poser, et la valeur calculée doit coïncider avec celle qui a
        // été signée.
        if (nom.toLowerCase() === "content-length") continue;
        xhr.setRequestHeader(nom, valeur);
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

    setLogo({ phase: "pose", apercu: URL.createObjectURL(fichier) });
  }

  const champsEnEchec =
    resultat.statut === "erreur" && resultat.motif === "saisie" ? (resultat.champs ?? []) : [];

  return (
    <form
      action={action}
      className="flex flex-col gap-10"
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

      <fieldset className="flex flex-col gap-3">
        <legend className="font-label-md text-label-md text-on-surface">{t("typeTitre")}</legend>
        <p className="font-body-sm text-body-sm text-on-surface-variant">{t("typeAide")}</p>
        <div className="mt-1 grid gap-3 sm:grid-cols-2">
          {(["supplier", "reseller"] as const).map((valeur) => (
            <label
              key={valeur}
              className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-4 ${
                typeDeCompte === valeur
                  ? "border-[var(--apercu-interface)] ring-2 ring-[var(--apercu-interface)]"
                  : "border-outline-variant"
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
              <span className="font-label-md text-label-md text-on-surface">{t(`type.${valeur}.titre`)}</span>
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

      <div className="flex flex-col gap-2">
        <label htmlFor="nomBoutique" className="font-label-md text-label-md text-on-surface">
          {t("nomTitre")}
        </label>
        <p className="font-body-sm text-body-sm text-on-surface-variant">{t("nomAide")}</p>
        <input
          id="nomBoutique"
          name="nomBoutique"
          type="text"
          maxLength={60}
          placeholder={t("nomPlaceholder")}
          className="min-h-[44px] rounded-lg border border-outline-variant bg-surface-container-low px-4 py-3 font-body-md text-body-md text-on-surface outline-none focus:border-[var(--apercu-interface)] focus:ring-2 focus:ring-[var(--apercu-interface)]"
        />
      </div>

      <div className="flex flex-col gap-3">
        <span className="font-label-md text-label-md text-on-surface">{t("couleurTitre")}</span>
        <p className="font-body-sm text-body-sm text-on-surface-variant">{t("couleurAide")}</p>
        <div className="flex flex-wrap items-center gap-4">
          <input
            type="color"
            aria-label={t("couleurTitre")}
            value={couleur}
            onChange={(e) => setCouleur(e.target.value)}
            className="h-11 w-16 cursor-pointer rounded-lg border border-outline-variant bg-surface-container-low"
          />
          <div className="flex items-center gap-3 rounded-lg border border-outline-variant px-4 py-3">
            <span className="font-label-md text-label-md text-[var(--apercu-texte)]">
              {t("apercuTexte")}
            </span>
            <span className="inline-flex min-h-[36px] items-center rounded-lg bg-[var(--apercu-remplissage)] px-4 font-label-md text-label-md text-[var(--apercu-sur-remplissage)]">
              {t("apercuBouton")}
            </span>
          </div>
        </div>
        {accent.ajuste ? (
          // On le DIT plutôt que de corriger en silence. Un vendeur qui voit sa
          // couleur rendue différemment sans explication croit à un bogue ; on
          // lui apprend au contraire que la lisibilité est garantie quoi qu'il
          // choisisse.
          <p className="font-body-sm text-body-sm text-on-surface-variant">{t("couleurAjustee")}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-3">
        <span className="font-label-md text-label-md text-on-surface">{t("logoTitre")}</span>
        <p className="font-body-sm text-body-sm text-on-surface-variant">{t("logoAide")}</p>
        <div className="flex flex-wrap items-center gap-4">
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
          <button
            type="button"
            onClick={() => champFichier.current?.click()}
            className="inline-flex min-h-[44px] items-center rounded-lg border border-[var(--apercu-interface)] px-4 py-2 font-label-md text-label-md text-[var(--apercu-texte)]"
          >
            {logo.phase === "pose" ? t("logoRemplacer") : t("logoChoisir")}
          </button>
          {logo.phase === "envoi" ? (
            <span aria-live="polite" className="font-body-sm text-body-sm text-on-surface-variant">
              {t("logoEnvoi", { pourcent: logo.pourcent })}
            </span>
          ) : null}
          {logo.phase === "pose" ? (
            // eslint-disable-next-line @next/next/no-img-element -- aperçu local (blob:), jamais une URL distante
            <img src={logo.apercu} alt="" className="h-11 w-11 rounded-lg object-contain" />
          ) : null}
          {logo.phase === "erreur" ? (
            <span role="alert" className="font-body-sm text-body-sm text-error">
              {logo.motif}
            </span>
          ) : null}
        </div>
      </div>

      {resultat.statut === "erreur" && resultat.motif !== "saisie" ? (
        <p role="alert" className="font-body-sm text-body-sm text-error">
          {resultat.motif === "session" ? t("erreurSession") : t("erreurEcriture")}
        </p>
      ) : null}

      <div>
        <BoutonValider libelle={t("valider")} enCours={t("validationEnCours")} />
      </div>
    </form>
  );
}
