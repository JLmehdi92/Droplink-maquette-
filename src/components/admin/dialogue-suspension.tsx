"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import {
  reactiver,
  suspendre,
  type EtatSuspension,
} from "@/app/[locale]/admin/comptes/[id]/actions";

/**
 * LE DIALOGUE DE SUSPENSION.
 *
 * LA GÊNE EST LE MÉCANISME, PAS UN EFFET SECONDAIRE.
 *
 * Cette confirmation n'existe pas pour rattraper une faute de frappe : elle
 * existe pour FORCER À LIRE quel compte on suspend. Une case à cocher se coche
 * sans regarder — on l'a tous fait. Un email se recopie en le regardant, et
 * c'est tout ce qu'on demande.
 *
 * LE COLLAGE EST BLOQUÉ pour la même raison. Coller l'email, c'est reproduire
 * une chaîne sans la lire, donc contourner exactement ce que le geste cherche à
 * obtenir. Le blocage est ANNONCÉ à l'écran : un champ qui refuse le collage
 * sans explication passe pour un bogue, et l'on cherche alors comment le
 * contourner plutôt que pourquoi il est là.
 *
 * ⚠️ Il reste un chemin sans friction — un administrateur peut toujours appeler
 * la fonction en base directement. C'est assumé : cette confirmation protège
 * contre l'INATTENTION, jamais contre la détermination. Ce qui protège contre la
 * détermination, c'est le journal d'audit, qui consigne le geste avec son auteur
 * et son motif.
 *
 * ÉCHAP FERME, et la fermeture ne suspend rien : la sortie doit toujours être
 * plus facile que l'action.
 */

const INITIAL: EtatSuspension = { statut: "inactif" };

function BoutonAction({
  libelle,
  enCours,
  danger,
  desactive,
}: {
  libelle: string;
  enCours: string;
  danger: boolean;
  desactive: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || desactive}
      className={
        "min-h-[44px] rounded-lg px-6 font-label-md text-label-md transition-opacity disabled:opacity-50 " +
        (danger ? "bg-error text-on-error" : "bg-violet-fond text-on-surface")
      }
    >
      {pending ? enCours : libelle}
    </button>
  );
}

export function DialogueSuspension({
  profilId,
  email,
  suspendu,
  motifMin,
}: {
  readonly profilId: string;
  readonly email: string;
  readonly suspendu: boolean;
  /**
   * REÇU EN PROPRIÉTÉ, jamais importé. Le module qui porte cette constante est
   * `server-only` — l'importer ici faisait ÉCHOUER LE BUILD, ce qui est
   * exactement le comportement recherché : la barrière existe pour qu'un module
   * serveur ne puisse pas atteindre le navigateur par accident, et elle vaut
   * mieux qu'une fuite silencieuse. Le plancher reste défini à un seul endroit,
   * du côté qui fait autorité.
   */
  readonly motifMin: number;
}) {
  const t = useTranslations("admin.suspension");
  const [etat, action] = useActionState(suspendu ? reactiver : suspendre, INITIAL);
  const [ouvert, setOuvert] = useState(false);
  const [motif, setMotif] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [colle, setColle] = useState(false);
  const zone = useRef<HTMLDivElement>(null);

  const motifSuffisant = motif.trim().length >= motifMin;
  // La comparaison ignore la casse et les espaces de bord : un email n'y est pas
  // sensible, et refuser « Alice@ » pour « alice@ » ferait douter de l'outil au
  // lieu de faire relire le compte.
  const confirme = confirmation.trim().toLowerCase() === email.trim().toLowerCase();
  const pret = suspendu ? motifSuffisant : motifSuffisant && confirme;

  function fermer(): void {
    setOuvert(false);
    setMotif("");
    setConfirmation("");
    setColle(false);
  }

  if (!ouvert) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOuvert(true)}
          className={
            "flex min-h-11 w-full items-center justify-center rounded-[11px] border bg-surface-container-lowest px-[18px] font-headline-md text-[14px] leading-[18px] font-bold transition-colors md:min-h-0 md:h-[42px] " +
            (suspendu
              ? "border-filet-controle text-on-surface hover:bg-fond-neutre"
              : "border-alerte-bordure text-alerte hover:bg-alerte-fond-carte")
          }
        >
          {suspendu ? t("rouvrir") : t("ouvrir")}
        </button>
        {etat.statut === "ok" ? (
          <p role="status" className="mt-2 font-body-sm text-body-sm text-on-surface-variant">
            {t("fait")}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div
      ref={zone}
      onKeyDown={(e) => {
        // Échap ferme. La sortie doit toujours être plus facile que l'action.
        if (e.key === "Escape") fermer();
      }}
      className="rounded-lg border border-outline-variant bg-surface-container-low p-4"
    >
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="profilId" value={profilId} />

        <div>
          <h3 className="font-headline-md text-headline-md-mobile text-on-surface">
            {suspendu ? t("titreReactivation") : t("titreSuspension")}
          </h3>
          <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
            {suspendu ? t("aideReactivation") : t("aideSuspension")}
          </p>
        </div>

        <div>
          <label
            htmlFor="motif"
            className="mb-2 block font-label-md text-label-md text-on-surface"
          >
            {t("motif")}
          </label>
          {/* LE MOTIF EST LA PIÈCE QU'ON DEMANDERAIT EN CAS DE LITIGE. Il
              s'affiche en clair sur la ligne du journal, pas replié derrière un
              détail que personne n'ouvre. */}
          <textarea
            id="motif"
            name="motif"
            rows={3}
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest p-3 font-body-md text-body-md text-on-surface"
          />
          <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
            {t("motifAide", { n: motifMin })}
          </p>
        </div>

        {!suspendu ? (
          <div>
            <label
              htmlFor="confirmation"
              className="mb-2 block font-label-md text-label-md text-on-surface"
            >
              {t("recopier")}
            </label>
            <p className="mb-2 select-none font-mono text-body-md text-on-surface">{email}</p>
            <input
              id="confirmation"
              name="confirmation"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              onPaste={(e) => {
                // COLLER, C'EST REPRODUIRE SANS LIRE — donc contourner
                // exactement ce que ce champ cherche à obtenir. Le refus est
                // annoncé juste en dessous : un champ qui refuse sans expliquer
                // passe pour un bogue, et l'on cherche alors à le contourner.
                e.preventDefault();
                setColle(true);
              }}
              className="min-h-[44px] w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-4 font-mono text-body-md text-on-surface"
            />
            <p className="mt-2 font-body-sm text-body-sm text-on-surface-variant">
              {colle ? t("collageRefuse") : t("collageAide")}
            </p>
          </div>
        ) : null}

        {etat.statut === "erreur" ? (
          <p role="alert" className="font-body-sm text-body-sm text-error">
            {t(`erreur.${etat.motif}`)}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-end gap-3">
          {/* ANNULER EST UN BOUTON ORDINAIRE, jamais désactivé : la sortie ne
              doit dépendre d'aucune condition. */}
          <button
            type="button"
            onClick={fermer}
            className="min-h-[44px] px-4 font-label-md text-label-md text-on-surface-variant"
          >
            {t("annuler")}
          </button>
          <BoutonAction
            libelle={suspendu ? t("confirmerReactivation") : t("confirmerSuspension")}
            enCours={t("enCours")}
            danger={!suspendu}
            desactive={!pret}
          />
        </div>
      </form>
    </div>
  );
}
