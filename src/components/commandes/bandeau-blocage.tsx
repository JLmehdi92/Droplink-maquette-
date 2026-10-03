"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ImagePlus, Link2Off, MessageSquareWarning } from "lucide-react";
import { BoutonAction } from "@/components/bouton-action";
import { demanderImageContestation, envoyerContestation } from "@/lib/commandes/actions-contestation";

/**
 * LE LIEN BLOQUÉ, VU DU VENDEUR — planche `#commande-bloquee` et ses trois états (19/09/2026).
 *
 * « Oui il doit le savoir » (Wassim) : quand l'administration bloque le lien d'une commande, son
 * vendeur le lit ICI, en tête de la commande, et peut CONTESTER — une explication obligatoire,
 * une image facultative.
 *
 * Le bandeau prend le rouge des ÉTATS, jamais le dégradé : il n'est pas l'action principale de
 * l'écran, il en suspend une. Rien n'est affirmé avant la base (contrainte 8) : la contestation
 * n'apparaît « envoyée » qu'après le rechargement qui la relit ; un échec se dit, avec sa cause,
 * et laisse le texte saisi en place.
 *
 * L'IMAGE PASSE DIRECTEMENT DU NAVIGATEUR À R2, sur une URL signée par le serveur (jamais par une
 * Server Action, limitée à 1 Mo), puis le serveur relit sa taille réelle avant de l'accepter.
 */

export type ContestationAffichee = {
  readonly id: string;
  readonly statut: "en_attente" | "refusee" | "acceptee";
  readonly message: string;
  /** Déjà formatée par le serveur, dans la langue de l'interface. */
  readonly creeeLe: string;
  readonly decideeLe: string | null;
  readonly reponse: string | null;
};

type Erreur =
  | "saisie"
  | "image"
  | "type"
  | "taille"
  | "cadence"
  | "deja"
  | "plafond"
  | "non-bloque"
  | "introuvable"
  | "session"
  | "ecriture";

const TYPES_ACCEPTES = "image/jpeg,image/png,image/webp";

const BOUTON_SECONDAIRE =
  "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-ds-pill border border-ds-filet bg-ds-surface-carte px-[22px] text-[14px] font-semibold tracking-[-0.02em] whitespace-nowrap text-ds-texte-fort shadow-ds-sm transition-shadow hover:shadow-ds-md";
const CARTE = "flex flex-col gap-3 rounded-ds-card border border-ds-filet bg-ds-surface-carte p-3.5 lg:gap-3.5 lg:p-4";
const LIBELLE = "text-[12.5px] leading-[normal] font-semibold text-ds-texte-sourdine";
const AIDE = "text-[12.5px] leading-[1.5] text-ds-texte-corps";

export function BandeauBlocage({
  commandeId,
  depuis,
  motif,
  contestations,
  peutContester,
  restantes,
  explicationMin,
  imageMaxMo,
}: {
  readonly commandeId: string;
  readonly depuis: string;
  /** Écrit par l'administration POUR le vendeur (169) ; null sur un blocage antérieur sans motif relu. */
  readonly motif: string | null;
  readonly contestations: readonly ContestationAffichee[];
  readonly peutContester: boolean;
  readonly restantes: number;
  /** Reçus en propriété : les bornes vivent dans des modules `server-only`. */
  readonly explicationMin: number;
  readonly imageMaxMo: number;
}) {
  const t = useTranslations("blocageVendeur");
  const [ouvert, setOuvert] = useState(false);
  const [message, setMessage] = useState("");
  const [fichier, setFichier] = useState<File | null>(null);
  const [travaille, setTravaille] = useState(false);
  const [erreur, setErreur] = useState<Erreur | null>(null);
  const champFichier = useRef<HTMLInputElement>(null);

  const derniere = contestations[0];

  function fermer(): void {
    setOuvert(false);
    setMessage("");
    setFichier(null);
    setErreur(null);
  }

  async function envoyer(): Promise<void> {
    setTravaille(true);
    setErreur(null);
    let cleImage: string | null = null;
    if (fichier !== null) {
      const depot = await demanderImageContestation({
        commandeId,
        typeMime: fichier.type,
        tailleOctets: fichier.size,
      });
      if (depot.statut !== "pret") {
        setErreur(depot.motif);
        setTravaille(false);
        return;
      }
      const reponse = await fetch(depot.url, { method: "PUT", headers: depot.enTetes, body: fichier }).catch(
        () => null,
      );
      if (reponse === null || !reponse.ok) {
        setErreur("image");
        setTravaille(false);
        return;
      }
      cleImage = depot.cle;
    }
    const resultat = await envoyerContestation({ commandeId, message, cleImage });
    if (resultat.statut !== "ok") {
      setErreur(resultat.motif);
      setTravaille(false);
      return;
    }
    // La base a enregistré : on relit la page, qui affichera ce qu'elle porte réellement.
    window.location.reload();
  }

  const formulaire = (
    <div className={CARTE}>
      <label className="flex flex-col gap-1.5">
        <span className={LIBELLE}>{t("explication")}</span>
        <textarea
          name="message"
          rows={4}
          // LE FOCUS SUIT L'OUVERTURE (audit du 20/09/2026) : « Contester le blocage » disparaît
          // avec le clic, et le focus retombait sur la page.
          autoFocus
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full resize-none rounded-ds-sm border border-ds-filet bg-ds-surface-carte px-[13px] py-[11px] text-[13.5px] leading-[1.55] text-ds-texte-fort outline-none focus:border-ds-filet-focus focus:shadow-[var(--anneau-ds-focus)]"
        />
        <span className={AIDE}>{t("explicationAide", { n: explicationMin })}</span>
      </label>

      <div className="flex flex-col gap-1.5">
        <span className={LIBELLE}>{t("image")}</span>
        <input
          ref={champFichier}
          type="file"
          accept={TYPES_ACCEPTES}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => setFichier(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          onClick={() => champFichier.current?.click()}
          className="inline-flex min-h-11 items-center justify-center gap-[9px] self-stretch rounded-ds-card border border-dashed border-ds-violet-300 bg-ds-surface-teinte px-4 text-[14px] font-semibold text-ds-accent-encre lg:self-start"
        >
          <ImagePlus aria-hidden="true" size={17} strokeWidth={1.9} />
          {fichier === null ? t("joindre") : t("changer")}
        </button>
        {fichier === null ? (
          <span className={AIDE}>{t("imageAide", { n: imageMaxMo })}</span>
        ) : (
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="min-w-0 truncate text-[12.5px] font-semibold text-ds-texte-fort">{fichier.name}</span>
            <button
              type="button"
              onClick={() => {
                setFichier(null);
                if (champFichier.current !== null) champFichier.current.value = "";
              }}
              className="-my-3 inline-flex min-h-11 items-center text-[12.5px] font-semibold text-ds-accent-encre hover:underline lg:my-0 lg:min-h-0"
            >
              {t("retirer")}
            </button>
          </span>
        )}
      </div>

      {erreur === null ? null : (
        <p role="alert" className="text-[13px] text-ds-erreur-encre">
          {/* Le minimum vient de la base, jamais écrit dans le message (passe du 03/10/2026). */}
          {t(`erreur.${erreur}`, { n: explicationMin })}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <button
          type="button"
          disabled={travaille}
          onClick={fermer}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-ds-pill border border-transparent px-[22px] text-[14px] font-semibold tracking-[-0.02em] text-ds-texte-fort transition-colors hover:bg-ds-accent-doux disabled:opacity-50"
        >
          {t("annuler")}
        </button>
        <BoutonAction
          type="button"
          enAttente={travaille}
          disabled={message.trim().length < explicationMin}
          onClick={() => void envoyer()}
          libelles={{ repos: t("envoyer"), enCours: t("enCours"), reussi: t("envoyer"), echoue: t("envoyer") }}
          className="inline-flex h-11 items-center justify-center rounded-ds-pill border border-transparent bg-ds-accent px-[22px] text-[14px] font-semibold tracking-[-0.02em] whitespace-nowrap text-ds-texte-sur-marque shadow-ds-sm transition-colors hover:bg-ds-accent-survol disabled:opacity-45"
        />
      </div>
    </div>
  );

  return (
    <section
      aria-label={t("titre")}
      className="mb-3 flex flex-col gap-3.5 rounded-ds-card-lg border border-[color-mix(in_srgb,var(--color-ds-erreur)_24%,var(--color-ds-surface-carte))] bg-ds-erreur-fond p-4 lg:mb-5 lg:gap-4 lg:px-5 lg:py-[18px]"
    >
      <div className="flex flex-col gap-3.5 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-3.5">
          <span className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-ds-pill bg-ds-surface-carte text-ds-erreur-encre">
            <Link2Off aria-hidden="true" size={19} strokeWidth={1.9} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] leading-[1.3] font-bold tracking-[-0.02em] text-ds-texte-fort">{t("titre")}</h2>
            <p className="mt-1 text-[13.5px] leading-[1.55] text-ds-texte-corps">{t("texte", { date: depuis })}</p>
            {motif === null ? null : (
              <p className="mt-2 text-[13.5px] leading-[1.55] break-words text-ds-texte-fort">
                <span className="font-bold">{t("motif")}</span> {motif}
              </p>
            )}
          </div>
        </div>
        {derniere === undefined && !ouvert ? (
          <button type="button" onClick={() => setOuvert(true)} className={BOUTON_SECONDAIRE}>
            <MessageSquareWarning aria-hidden="true" size={17} strokeWidth={1.9} />
            {t("contester")}
          </button>
        ) : null}
      </div>

      {derniere?.statut === "en_attente" ? (
        <div className={CARTE}>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-[14px] leading-[normal] font-bold text-ds-texte-fort">{t("envoyee", { date: derniere.creeeLe })}</span>
            <span className="inline-flex items-center gap-1.5 rounded-ds-pill bg-ds-alerte-fond px-[11px] py-1.5 text-[11.5px] leading-[normal] font-bold tracking-[-0.02em] text-ds-alerte-encre">
              {t("enAttente")}
            </span>
          </div>
          <p className="border-l-[3px] border-ds-filet-appuye pl-3 text-[13.5px] leading-[1.55] text-ds-texte-corps">
            {derniere.message}
          </p>
        </div>
      ) : null}

      {derniere?.statut === "refusee" ? (
        <div className={CARTE}>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-[14px] leading-[normal] font-bold text-ds-texte-fort">
              {t("refusee", { date: derniere.decideeLe ?? derniere.creeeLe })}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-ds-pill bg-ds-erreur-fond px-[11px] py-1.5 text-[11.5px] leading-[normal] font-bold tracking-[-0.02em] text-ds-erreur-encre">
              {t("refuseeBadge")}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={LIBELLE}>{t("reponse")}</span>
            <p className="text-[13.5px] leading-[1.55] text-ds-texte-fort">{derniere.reponse}</p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className={AIDE}>{peutContester ? t("restantes", { n: restantes }) : t("aucuneRestante")}</span>
            {peutContester && !ouvert ? (
              <button type="button" onClick={() => setOuvert(true)} className={BOUTON_SECONDAIRE}>
                <MessageSquareWarning aria-hidden="true" size={17} strokeWidth={1.9} />
                {t("recontester")}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {ouvert && peutContester ? formulaire : null}
    </section>
  );
}
