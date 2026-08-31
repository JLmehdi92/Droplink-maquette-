"use client";

import { useTranslations } from "next-intl";

/**
 * LA FRONTIÈRE D'ERREUR DE LA PAGE CLIENT.
 *
 * ⚠️ ELLE N'EXISTAIT PAS, et c'est la surface où son absence coûtait le plus.
 * `not-found.tsx` traite le lien mort avec soin — icône, texte, aucune
 * divulgation — mais une erreur de RENDU tombait sur la page générique de
 * Next : Times New Roman, anglais, aucun rapport avec ce que le destinataire
 * vient de recevoir en message privé. Le lecteur n'est pas le vendeur, c'est
 * son client : il ne peut ni comprendre ce qu'il voit, ni le signaler à
 * quiconque. L'asymétrie avec le 404 était un oubli, pas une décision.
 *
 * ON DIT CE QUI EST VRAI ET RIEN D'AUTRE. Cette frontière n'attrape que des
 * échecs de rendu : le jeton n'est pas en cause, et le lien reste valable.
 * L'affirmer n'est pas un pari — c'est la seule chose que le visiteur se
 * demande à cet instant, et c'est aussi la seule qu'on puisse tenir.
 *
 * AUCUNE RÉFÉRENCE D'INCIDENT ICI, contrairement à l'espace vendeur. Le `digest`
 * y sert parce que le vendeur a un interlocuteur ; le client d'un vendeur n'en
 * a aucun, et lui montrer un identifiant interne serait de la surface offerte
 * sans contrepartie.
 *
 * AUCUNE COULEUR D'ACCENT, pour la même raison que `not-found.tsx` : à cet
 * instant on ne sait pas de quelle boutique il s'agit, et si on le savait,
 * l'afficher serait déjà une fuite.
 */
export default function ErreurPagePublique({ reset }: { readonly reset: () => void }) {
  const t = useTranslations("page-publique.erreur");

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-surface-container-lowest px-6 py-8">
      <div className="mb-[26px] flex h-[68px] w-[68px] items-center justify-center rounded-[20px] bg-fond-neutre">
        {/* Un point d'attention, pas un maillon rompu : le lien n'est pas en
            cause, et le dire par le dessin autant que par le texte évite de
            faire croire au visiteur qu'il doit en redemander un. */}
        <svg
          width="30"
          height="30"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-gris-inactif"
          aria-hidden="true"
        >
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
          <circle cx="12" cy="12" r="9" />
        </svg>
      </div>

      <h1 className="mb-3 text-center text-[26px] leading-[32px] font-extrabold tracking-[-0.03em] text-on-surface">
        {t("titre")}
      </h1>

      <p className="max-w-[320px] text-center font-body-md text-[15px] leading-[24px] text-sourdine">
        {t("texte")}
      </p>

      <button
        type="button"
        onClick={reset}
        className="mt-7 min-h-[44px] rounded-md bg-primary px-6 font-label-md text-[15px] font-bold text-surface-container-lowest"
      >
        {t("reessayer")}
      </button>
    </div>
  );
}
