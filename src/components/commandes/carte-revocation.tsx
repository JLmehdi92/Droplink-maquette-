"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { revoquerLienPublic } from "@/lib/commandes/actions";
import { BoutonAction } from "@/components/bouton-action";

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

      {/*
        ⚠️ CE BOUTON N'EST PAS DANS UN `<form action={…}>` : il attend une
        promesse déclenchée à la main, donc `useFormStatus` y rendrait toujours
        `false`. Il passe son propre `enAttente` — et c'est précisément pour ces
        actions-là que `BoutonAction` l'accepte.

        ⚠️ NI « RÉUSSI » NI « ÉCHOUÉ » NE SONT ANNONCÉS PAR LE BOUTON, et les
        deux libellés répètent donc celui du repos. En cas de succès, c'est la
        carte entière qui change — le nouveau lien apparaît, copiable
        immédiatement ; en cas d'échec, le paragraphe `role="alert"` ci-dessus
        le dit, et il dit AUSSI ce qui reste vrai : « l'ancien lien reste
        actif ». Un « Échec » sur le bouton ne porterait pas cette seconde
        moitié, qui est la seule qui compte pour décider quoi faire ensuite.
      */}
      <BoutonAction
        type="button"
        enAttente={enCours}
        disabled={!compris}
        onClick={() => void revoquer()}
        libelles={{
          repos: t("revocation.confirmer"),
          enCours: t("revocation.enCours"),
          reussi: t("revocation.confirmer"),
          echoue: t("revocation.confirmer"),
        }}
        className="flex min-h-[46px] w-full items-center justify-center rounded-xl border border-alerte-bordure bg-surface-container-lowest px-[18px] font-label-md text-[14px] font-bold text-alerte transition-opacity disabled:cursor-not-allowed disabled:opacity-45 lg:h-[42px] lg:min-h-0 lg:w-auto lg:rounded-[11px]"
      />
    </section>
  );
}
