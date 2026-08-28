"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { revoquerLienPublic } from "@/lib/commandes/actions";

/**
 * « Révoquer le lien » — la carte en alerte du bas de la colonne d'édition.
 *
 * LA RÉVOCATION EST VOLONTAIREMENT INCONFORTABLE, et l'inconfort EST le
 * mécanisme, pas un effet secondaire. Elle coupe définitivement un lien déjà
 * envoyé à quelqu'un : la seule erreur possible est irréversible, et elle se
 * découvre chez le destinataire.
 *
 *   - DEUX GESTES SÉPARÉS : cocher, puis presser. Le bouton reste inerte tant
 *     que la case ne l'est pas ;
 *   - AUCUN FORMULAIRE, donc aucune soumission par Entrée — c'est la façon la
 *     plus courante de valider ce qu'on n'a pas lu ;
 *   - aucun raccourci clavier vers l'action.
 *
 * ⚠️ ELLE VIVAIT DANS UNE BOÎTE MODALE, les deux planches la dessinent EN
 * LIGNE. Ce qui change : il n'y a plus de premier geste « ouvrir », et Échap n'a
 * plus rien à fermer. Ce qui ne change pas, et qui portait l'essentiel : la case
 * à cocher décochée par défaut, l'absence de formulaire, et le texte qui dit ce
 * qui se passe AVANT que ça se passe. La case reste le verrou.
 *
 * LE NOUVEAU LIEN EST UTILISABLE IMMÉDIATEMENT, sans rechargement — c'est
 * l'appelant qui le reçoit et le propage à la barre haute. Un vendeur qui doit
 * rafraîchir pour retrouver son lien hésitera à révoquer, et le lien fuité
 * restera actif.
 */
export function CarteRevocation({
  orderId,
  jeton,
  onNouveauJeton,
}: {
  readonly orderId: string;
  readonly jeton: string;
  readonly onNouveauJeton: (jeton: string) => void;
}) {
  const t = useTranslations("actions");

  const [compris, setCompris] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [echec, setEchec] = useState<string | null>(null);

  const revoquer = useCallback(async (): Promise<void> => {
    setEnCours(true);
    setEchec(null);
    const resultat = await revoquerLienPublic(orderId, jeton);
    setEnCours(false);

    if (resultat.statut !== "ok") {
      // L'interface n'affirme jamais ce que la base n'a pas enregistré :
      // l'ancien lien reste affiché, la case reste cochée, et l'échec est dit.
      setEchec(t("revocation.echec"));
      return;
    }

    onNouveauJeton(resultat.nouveauJeton);
    setCompris(false);
  }, [orderId, jeton, onNouveauJeton, t]);

  return (
    <section className="rounded-lg border border-alerte-filet bg-alerte-fond-doux p-[18px] lg:rounded-[18px] lg:p-[22px]">
      <h2 className="mb-1.5 font-headline-md text-[15px] font-bold tracking-[-0.015em] text-alerte lg:text-[16px]">
        {t("revocation.titre")}
      </h2>
      <p className="mb-3 font-body-sm text-[13px] leading-5 text-sourdine lg:mb-3.5 lg:leading-[21px]">
        {t("revocation.explication")}
      </p>

      <label className="mb-3 flex cursor-pointer items-start gap-2.5 lg:mb-3.5">
        <input
          type="checkbox"
          checked={compris}
          onChange={(e) => setCompris(e.target.checked)}
          className="mt-px h-[18px] w-[18px] shrink-0 accent-alerte"
        />
        <span className="font-body-sm text-[13px] leading-5 text-on-surface">
          {t("revocation.jeComprends")}
        </span>
      </label>

      {echec !== null ? (
        <p role="alert" className="mb-3 font-body-sm text-[13px] text-alerte">
          {echec}
        </p>
      ) : null}

      <button
        type="button"
        disabled={!compris || enCours}
        onClick={() => void revoquer()}
        className="min-h-[46px] w-full rounded-xl border border-alerte-bordure bg-surface-container-lowest px-[18px] font-label-md text-[14px] font-bold text-alerte transition-opacity disabled:cursor-not-allowed disabled:opacity-45 lg:h-[42px] lg:min-h-0 lg:w-auto lg:rounded-[11px]"
      >
        {enCours ? t("revocation.enCours") : t("revocation.confirmer")}
      </button>
    </section>
  );
}
