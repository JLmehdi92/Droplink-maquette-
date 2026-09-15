"use client";

import { useRef, useState } from "react";
import { BoutonAction } from "@/components/bouton-action";
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
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ L'ACTION EST APPELÉE DIRECTEMENT, ET L'ÉCRAN SE RECHARGE ENSUITE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * DÉFAUT MESURÉ LE 29/08/2026, en pilotant l'écran sur un vrai compte. Avec
 * `<form action={dispatch}>` de `useActionState` : le compte EST suspendu — la
 * colonne passe à `suspended`, l'audit est inscrit, la page est même re-rendue
 * côté serveur (une seconde trace `comptes.detail` suit immédiatement) — et
 * l'écran ne montre RIEN. Pas de message, pas de pilule « Suspendu », le
 * dialogue reste ouvert avec son bouton « Suspendre ». Observé sept secondes
 * durant.
 *
 * C'est le pire endroit du produit où ce défaut pouvait vivre : la coupure de
 * suspension est la capacité technique qui fonde notre statut d'hébergeur.
 * Un administrateur qui ne voit rien recommence — ou conclut que ça n'a pas
 * marché, alors que si.
 *
 * Le même défaut a été trouvé le même jour sur l'écran des paramètres, par la
 * même mesure : `useActionState` ne rend jamais son résultat au composant, et
 * `router.refresh()` ne redessine rien. On cesse donc de dépendre d'une
 * invalidation : l'action est appelée comme une fonction, et une fois qu'elle a
 * confirmé, la page est RECHARGÉE. Grossier, mais c'est le seul mécanisme dont
 * on ait établi qu'il montre l'état réel — et cette décision-là se prend une
 * fois par mois, pas dix fois par minute.
 */

const INITIAL: EtatSuspension = { statut: "inactif" };

/**
 * LE BOUTON DE CONFIRMATION DE LA MODALE.
 *
 * ⚠️ IL S'APPELAIT `BoutonAction`, ET C'ÉTAIT UN HOMONYME DU COMPOSANT PARTAGÉ.
 * Deux composants du même nom, l'un local et l'autre dans
 * `@/components/bouton-action`, avec des propriétés différentes : relever « qui
 * porte un état d'attente » par une recherche du nom donnait un faux positif
 * ici. Renommé, et son travail délégué au vrai.
 *
 * ⚠️ IL N'ANNONCE NI RÉUSSITE NI ÉCHEC, et ses deux libellés répètent celui du
 * repos. Une suspension réussie FERME la modale et redessine la fiche ; un échec
 * s'affiche dans le message de la modale, qui nomme le motif. Un « Échoué » sur
 * le bouton remplacerait un motif par un constat.
 */
function BoutonConfirmation({
  libelle,
  enCours,
  danger,
  desactive,
  travaille,
  onConfirmer,
}: {
  readonly libelle: string;
  readonly enCours: string;
  readonly danger: boolean;
  readonly desactive: boolean;
  readonly travaille: boolean;
  readonly onConfirmer: () => void;
}) {
  return (
    <BoutonAction
      type="button"
      enAttente={travaille}
      disabled={desactive}
      onClick={onConfirmer}
      libelles={{ repos: libelle, enCours, reussi: libelle, echoue: libelle }}
      /* ⚠️ `bg-error text-on-error` ET `bg-primary text-on-primary` ÉTAIENT DES
         JETONS DE L'ANCIEN CANEVAS — un bouton noir, ou rouge #ba1a1a, au milieu
         d'un écran du design system. Le geste dangereux prend le contour rouge
         du bouton qui l'ouvre : même couleur au départ et à l'arrivée. */
      className={
        "flex h-11 items-center justify-center rounded-ds-card border bg-ds-surface-carte px-5 text-[14px] font-bold transition-colors disabled:opacity-50 " +
        (danger
          ? "border-ds-erreur text-ds-erreur hover:bg-ds-erreur-fond"
          : "border-ds-filet-appuye text-ds-texte-fort hover:bg-ds-surface-creux")
      }
    />
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
  const [etat, setEtat] = useState<EtatSuspension>(INITIAL);
  const [travaille, setTravaille] = useState(false);
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

  async function confirmer(): Promise<void> {
    setTravaille(true);
    const donnees = new FormData();
    donnees.set("profilId", profilId);
    donnees.set("motif", motif);
    if (!suspendu) donnees.set("confirmation", confirmation);

    const resultat = await (suspendu ? reactiver : suspendre)(INITIAL, donnees);
    setEtat(resultat);
    setTravaille(false);
    // ON NE RECHARGE QU'APRÈS UNE CONFIRMATION DE LA BASE. Recharger sur un
    // échec effacerait le message d'erreur ET la saisie, en laissant croire que
    // quelque chose s'est passé.
    if (resultat.statut === "ok") window.location.reload();
  }

  function fermer(): void {
    setOuvert(false);
    setMotif("");
    setConfirmation("");
    setColle(false);
  }

  /* LE TITRE ET CE QUE LE GESTE FAIT SONT LISIBLES AVANT D'OUVRIR — planche
     `#compte` du kit admin. Les découvrir seulement une fois le formulaire
     ouvert, c'était demander de s'engager pour savoir à quoi. */
  const entete = (
    <div className="mb-[18px]">
      <h2 className="text-[18px] leading-[19.8px] font-bold tracking-[-0.025em] text-ds-texte-titre">
        {suspendu ? t("titreReactivation") : t("titreSuspension")}
      </h2>
      <p className="mt-[3px] text-[13px] leading-[1.55] text-ds-texte-corps">
        {suspendu ? t("aideReactivation") : t("aideSuspension")}
      </p>
    </div>
  );

  /* Planche `#compte-suspension` du kit admin (15/09/2026), dans le vocabulaire
     des paramètres : le libellé ENVELOPPE son champ, en colonne à 6 px. */
  const groupe = "flex flex-col gap-1.5";
  const libelle = "text-[12.5px] font-semibold text-ds-texte-sourdine";
  const aide = "text-[12.5px] leading-[1.5] text-ds-texte-corps";
  const champ =
    "w-full rounded-ds-sm border border-ds-filet bg-ds-surface-carte text-[13.5px] text-ds-texte-fort outline-none focus:border-ds-filet-focus focus:shadow-[var(--anneau-ds-focus)]";

  if (!ouvert) {
    return (
      <div>
        {entete}
        <button
          type="button"
          onClick={() => setOuvert(true)}
          className={
            "flex h-11 w-full items-center justify-center rounded-ds-card border bg-ds-surface-carte px-[18px] text-[14px] font-bold transition-colors " +
            (suspendu
              ? "border-ds-filet-appuye text-ds-texte-fort hover:bg-ds-surface-creux"
              : "border-ds-erreur text-ds-erreur hover:bg-ds-erreur-fond")
          }
        >
          {suspendu ? t("rouvrir") : t("ouvrir")}
        </button>
        {etat.statut === "ok" ? (
          <p role="status" className="mt-2 text-[13px] text-ds-texte-corps">
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
    >
      {entete}
      <div className="flex flex-col gap-4">
        <label className={groupe}>
          <span className={libelle}>{t("motif")}</span>
          {/* LE MOTIF EST LA PIÈCE QU'ON DEMANDERAIT EN CAS DE LITIGE. Il
              s'affiche en clair sur la ligne du journal, pas replié derrière un
              détail que personne n'ouvre. */}
          <textarea
            name="motif"
            rows={3}
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            className={champ + " resize-none px-[13px] py-[11px] leading-[1.55]"}
          />
          <span className={aide}>{t("motifAide", { n: motifMin })}</span>
        </label>

        {!suspendu ? (
          <label className={groupe}>
            <span className={libelle}>{t("recopier")}</span>
            <span className="font-mono text-[13px] text-ds-texte-fort select-none">{email}</span>
            <input
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
              className={champ + " h-11 px-[13px] font-mono"}
            />
            <span className={aide}>{colle ? t("collageRefuse") : t("collageAide")}</span>
          </label>
        ) : null}

        {etat.statut === "erreur" ? (
          <p role="alert" className="text-[13px] text-ds-erreur">
            {t(`erreur.${etat.motif}`)}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-end gap-3">
          {/* ANNULER EST UN BOUTON ORDINAIRE, jamais désactivé : la sortie ne
              doit dépendre d'aucune condition. */}
          <button
            type="button"
            onClick={fermer}
            className="h-11 px-4 text-[14px] font-semibold text-ds-texte-corps transition-colors hover:text-ds-texte-fort"
          >
            {t("annuler")}
          </button>
          <BoutonConfirmation
            libelle={suspendu ? t("confirmerReactivation") : t("confirmerSuspension")}
            enCours={t("enCours")}
            danger={!suspendu}
            desactive={!pret}
            travaille={travaille}
            onConfirmer={() => void confirmer()}
          />
        </div>
      </div>
    </div>
  );
}
