"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { KeyRound } from "lucide-react";
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
  readonly suite: "mot-de-passe" | null;
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
      <BoutonPrincipalDs libelle={t("bouton")} libelleEnCours={t("enCours")} />
    </form>
  );
}
