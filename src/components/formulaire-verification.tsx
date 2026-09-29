"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Check, KeyRound } from "lucide-react";
import { verifierCode, type ResultatVerification } from "@/app/[locale]/verification/actions";
import { BoutonPrincipalDs, ChampAcces, MessageErreurDs } from "@/components/acces-champs";

const INITIAL: ResultatVerification = { statut: "inactif" };

/**
 * LE CODE À 6 CHIFFRES — `VerifyScreen` du kit `auth`.
 *
 * `one-time-code` : les téléphones proposent le code de l'application
 * d'authentification ou du presse-papiers au-dessus du clavier, et un clavier
 * NUMÉRIQUE s'ouvre. Le champ n'est jamais prérempli ni renvoyé par l'état.
 */
export function FormulaireVerification({
  locale,
  suite,
}: {
  readonly locale: string;
  readonly suite: "mot-de-passe" | "admin" | null;
}) {
  const t = useTranslations("verification");
  const [resultat, action] = useActionState(verifierCode, INITIAL);
  // Une table EXPLICITE et non `erreurs.${motif}` : la garde des chaînes mortes
  // doit pouvoir voir chaque clé appelée.
  const message =
    resultat.statut !== "erreur"
      ? null
      : {
          code: t("erreurs.code"),
          invalide: t("erreurs.invalide"),
          trop: t("erreurs.trop"),
          indisponible: t("erreurs.indisponible"),
        }[resultat.motif];

  return (
    <form action={action} className="flex flex-col gap-[22px]" noValidate>
      <input type="hidden" name="locale" value={locale} />
      {suite === null ? null : <input type="hidden" name="suite" value={suite} />}
      <ChampAcces
        id="code"
        nom="code"
        libelle={t("libelle")}
        icone={KeyRound}
        placeholder="123456"
        autoComplete="one-time-code"
        modeSaisie="numeric"
        invalide={message !== null}
        {...(message !== null ? { decritPar: "erreur-verification" } : {})}
      />
      {message !== null ? <MessageErreurDs id="erreur-verification" texte={message} /> : null}
      {/* « Se souvenir de cet appareil » (203) : jamais dans le flux de
          réinitialisation (`suite`), où la session ne devient pas durable. */}
      {suite === null ? (
        <label className="flex min-h-[44px] cursor-pointer items-center gap-[9px] lg:min-h-0">
          <input type="checkbox" name="souvenir" value="on" defaultChecked className="peer sr-only" />
          <span
            aria-hidden="true"
            className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-ds-xs border border-ds-filet-appuye bg-ds-surface-carte transition-colors peer-checked:border-ds-accent peer-checked:bg-ds-accent peer-checked:text-ds-texte-sur-marque peer-focus-visible:border-ds-accent"
          >
            <Check className="opacity-0 peer-checked:opacity-100" size={12} strokeWidth={3} aria-hidden="true" />
          </span>
          <span className="text-[14px] leading-[1.5] text-ds-texte-corps">{t("souvenirAppareil")}</span>
        </label>
      ) : null}
      <BoutonPrincipalDs libelle={t("bouton")} libelleEnCours={t("enCours")} />
    </form>
  );
}
