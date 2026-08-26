"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Icone } from "@/components/icone";
import { archiver, dupliquer, revoquerLienPublic } from "@/lib/commandes/actions";

/**
 * Les actions de cycle de vie d'une commande : dupliquer, archiver, révoquer.
 *
 * LA RÉVOCATION EST VOLONTAIREMENT INCONFORTABLE, et l'inconfort EST le
 * mécanisme, pas un effet secondaire. Elle coupe définitivement un lien déjà
 * envoyé à quelqu'un : la seule erreur possible est irréversible, et elle se
 * découvre chez le destinataire.
 *
 *   - deux gestes séparés : ouvrir, puis confirmer ;
 *   - une case à cocher explicite, décochée par défaut ;
 *   - AUCUN formulaire, donc aucune soumission par Entrée — c'est la façon la
 *     plus courante de valider une boîte qu'on n'a pas lue ;
 *   - aucun raccourci clavier vers l'action ;
 *   - Échap ferme, parce que sortir doit rester facile ; c'est entrer qui doit
 *     être difficile.
 *
 * LE NOUVEAU LIEN EST COPIABLE IMMÉDIATEMENT, sans rechargement. Un vendeur qui
 * doit rafraîchir pour retrouver son lien hésitera à révoquer — et le lien
 * fuité restera actif.
 */
export function ActionsCommande({
  orderId,
  langue,
  jeton,
  origine,
  estArchivee,
}: {
  readonly orderId: string;
  readonly langue: string;
  readonly jeton: string;
  readonly origine: string;
  readonly estArchivee: boolean;
}) {
  const t = useTranslations("actions");

  const [ouvert, setOuvert] = useState(false);
  const [compris, setCompris] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [jetonCourant, setJetonCourant] = useState(jeton);
  const [archivee, setArchivee] = useState(estArchivee);
  const [copie, setCopie] = useState(false);
  const [echec, setEchec] = useState<string | null>(null);
  const boiteRef = useRef<HTMLDivElement>(null);

  // Échap ferme. Sortir reste facile — c'est entrer qui doit être difficile.
  useEffect(() => {
    if (!ouvert) return;
    const surTouche = (evenement: KeyboardEvent): void => {
      if (evenement.key === "Escape") setOuvert(false);
    };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [ouvert]);

  useEffect(() => {
    if (ouvert) boiteRef.current?.focus();
  }, [ouvert]);

  const lien = origine === "" ? "/p/" + jetonCourant : origine + "/p/" + jetonCourant;

  const revoquer = useCallback(async (): Promise<void> => {
    setEnCours(true);
    setEchec(null);
    const resultat = await revoquerLienPublic(orderId, jetonCourant);
    setEnCours(false);

    if (resultat.statut !== "ok") {
      // L'interface n'affirme jamais ce que la base n'a pas enregistré : la
      // boîte RESTE ouverte, l'ancien lien reste affiché, et l'échec est dit.
      setEchec(t("revocation.echec"));
      return;
    }

    setJetonCourant(resultat.nouveauJeton);
    setCompris(false);
    setOuvert(false);
  }, [orderId, jetonCourant, t]);

  const copier = useCallback(async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(lien);
      setCopie(true);
      window.setTimeout(() => setCopie(false), 2000);
    } catch {
      setEchec(t("copieEchouee"));
    }
  }, [lien, t]);

  const basculerArchive = useCallback(async (): Promise<void> => {
    const cible = !archivee;
    const resultat = await archiver(orderId, jetonCourant, cible);
    if (resultat.statut !== "ok") {
      setEchec(t("archivage.echec"));
      return;
    }
    setArchivee(resultat.archivee);
  }, [archivee, orderId, jetonCourant, t]);

  const bouton =
    "flex w-full items-center justify-between gap-2 rounded-lg border border-outline-variant px-4 py-3 font-label-md text-label-md text-on-surface transition-colors hover:bg-surface-container-low";

  return (
    <section className="carte rounded-lg p-[22px]">
      <h2 className="mb-[18px] font-headline-md text-[16px] font-bold tracking-[-0.015em] text-on-surface">
        {t("titre")}
      </h2>

      <div className="mb-6">
        <p className="mb-2 font-label-sm text-label-sm text-on-surface-variant">{t("lien")}</p>
        <p className="mb-2 rounded-lg bg-surface-container-low px-3 py-2 font-body-sm text-body-sm break-all text-on-surface">
          {lien}
        </p>
        <button
          type="button"
          onClick={() => void copier()}
          className="flex items-center gap-1.5 font-label-sm text-label-sm text-[var(--accent-texte)] hover:underline"
        >
          <Icone nom={copie ? "done" : "content_copy"} className="text-[16px]" />
          {copie ? t("copie") : t("copier")}
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {/* Dupliquer est une MUTATION : un formulaire, pas un lien. */}
        <form action={() => void dupliquer(orderId, langue)}>
          <button type="submit" className={bouton}>
            <span className="flex items-center gap-2">
              <Icone nom="content_copy" className="text-[18px]" />
              {t("dupliquer")}
            </span>
            <Icone nom="arrow_forward" className="text-[16px]" />
          </button>
        </form>
        <p className="-mt-1 font-body-sm text-body-sm text-on-surface-variant">
          {t("dupliquerAide")}
        </p>

        <button type="button" onClick={() => void basculerArchive()} className={bouton}>
          <span className="flex items-center gap-2">
            <Icone nom="archive" className="text-[18px]" />
            {archivee ? t("desarchiver") : t("archiver")}
          </span>
        </button>
        <p className="-mt-1 font-body-sm text-body-sm text-on-surface-variant">
          {t("archiverAide")}
        </p>

        <button
          type="button"
          onClick={() => {
            setCompris(false);
            setEchec(null);
            setOuvert(true);
          }}
          className="flex w-full items-center gap-2 rounded-lg border border-error/40 px-4 py-3 font-label-md text-label-md text-error transition-colors hover:bg-error-container/30"
        >
          <Icone nom="warning" className="text-[18px]" />
          {t("revocation.ouvrir")}
        </button>
      </div>

      {echec !== null ? (
        <p role="alert" className="mt-4 font-body-sm text-body-sm text-error">
          {echec}
        </p>
      ) : null}

      {ouvert ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-margin-mobile"
          onClick={(e) => {
            // Un clic HORS de la boîte ferme, comme Échap. À l'intérieur, non :
            // fermer par accident pendant qu'on lit serait la même impatience
            // qu'on cherche à contrarier.
            if (e.target === e.currentTarget) setOuvert(false);
          }}
        >
          {/* PAS UN `<form>` : une boîte qui se soumet à la touche Entrée est
              exactement ce qu'on cherche à empêcher. */}
          <div
            ref={boiteRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="revocation-titre"
            tabIndex={-1}
            className="w-full max-w-md rounded-xl bg-surface-container-lowest p-6 shadow-lg"
          >
            <h3
              id="revocation-titre"
              className="mb-4 font-headline-md text-headline-md-mobile text-on-surface"
            >
              {t("revocation.titre")}
            </h3>

            <p className="mb-4 font-body-md text-body-md text-on-surface-variant">
              {t("revocation.explication")}
            </p>

            <label className="mb-6 flex cursor-pointer items-start gap-3 rounded-lg border border-outline-variant p-3">
              <input
                type="checkbox"
                checked={compris}
                onChange={(e) => setCompris(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[var(--accent-interface)]"
              />
              <span className="font-body-sm text-body-sm text-on-surface">
                {t("revocation.jeComprends")}
              </span>
            </label>

            {echec !== null ? (
              <p role="alert" className="mb-4 font-body-sm text-body-sm text-error">
                {echec}
              </p>
            ) : null}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setOuvert(false)}
                className="rounded-lg border border-outline-variant px-4 py-2 font-label-md text-label-md text-on-surface"
              >
                {t("revocation.annuler")}
              </button>
              <button
                type="button"
                disabled={!compris || enCours}
                onClick={() => void revoquer()}
                className="rounded-lg bg-error px-4 py-2 font-label-md text-label-md text-on-error disabled:cursor-not-allowed disabled:opacity-40"
              >
                {enCours ? t("revocation.enCours") : t("revocation.confirmer")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
