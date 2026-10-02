"use client";

import { useActionState, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { verifierCode, type ResultatVerification } from "@/app/[locale]/verification/actions";
import { BoutonPrincipalDs, MessageErreurDs } from "@/components/acces-champs";

const INITIAL: ResultatVerification = { statut: "inactif" };

/**
 * LE CODE À 6 CHIFFRES, EN SIX CASES (maquette `verification.html`, arbitrage du § 5).
 *
 * UN SEUL CHAMP PART : `code`, caché, recomposé des six cases (qui n'ont pas de
 * `name`). La première porte `one-time-code` : les téléphones y proposent le code au-
 * dessus du clavier, et le code collé ou proposé se répartit dans les six cases. Un
 * chiffre tapé avance d'une case, l'effacement d'une case vide recule.
 *
 * AUCUN ENVOI AUTOMATIQUE AU SIXIÈME CHIFFRE : chaque envoi consomme le quota partagé
 * avec la connexion, et une faute de frappe le dépenserait sans qu'on l'ait voulu.
 * Les cases ne sont jamais préremplies ni renvoyées par l'état.
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
  const [chiffres, setChiffres] = useState<readonly string[]>(["", "", "", "", "", ""]);
  const cases = useRef<Array<HTMLInputElement | null>>([]);

  /** Pose des chiffres à partir d'une case (frappe, collage ou proposition du téléphone). */
  const poser = (depuis: number, saisie: string): void => {
    const nouveaux = saisie.replace(/\D/g, "").slice(0, 6 - depuis).split("");
    if (nouveaux.length === 0) {
      setChiffres((c) => c.map((x, i) => (i === depuis ? "" : x)));
      return;
    }
    setChiffres((c) => c.map((x, i) => (i >= depuis && i < depuis + nouveaux.length ? (nouveaux[i - depuis] ?? x) : x)));
    cases.current[Math.min(depuis + nouveaux.length, 5)]?.focus();
  };
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
    <form action={action} className="formulaire" noValidate>
      <input type="hidden" name="locale" value={locale} />
      {suite === null ? null : <input type="hidden" name="suite" value={suite} />}
      <input type="hidden" name="code" value={chiffres.join("")} />
      <fieldset className={"code-2fa" + (message !== null ? " est-invalide" : "")}>
        <legend>{t("libelle")}</legend>
        <div className="code-2fa__cases">
          {chiffres.map((chiffre, i) => (
            <input
              key={i}
              ref={(el) => {
                cases.current[i] = el;
              }}
              type="text"
              inputMode="numeric"
              autoComplete={i === 0 ? "one-time-code" : "off"}
              pattern="[0-9]*"
              aria-label={t("chiffre", { n: i + 1 })}
              aria-describedby={message !== null ? "erreur-verification" : undefined}
              aria-invalid={message !== null ? true : undefined}
              value={chiffre}
              onChange={(e) => poser(i, e.target.value)}
              onPaste={(e) => {
                e.preventDefault();
                poser(i, e.clipboardData.getData("text"));
              }}
              onKeyDown={(e) => {
                if (e.key === "Backspace" && chiffre === "" && i > 0) cases.current[i - 1]?.focus();
                if (e.key === "ArrowLeft" && i > 0) cases.current[i - 1]?.focus();
                if (e.key === "ArrowRight" && i < 5) cases.current[i + 1]?.focus();
              }}
              onFocus={(e) => e.target.select()}
            />
          ))}
        </div>
      </fieldset>
      {message !== null ? <MessageErreurDs id="erreur-verification" texte={message} /> : null}
      {/* « Se souvenir de cet appareil » (203) : jamais dans le flux de
          réinitialisation (`suite`), où la session ne devient pas durable. */}
      {suite === null ? (
        <label className="coche-acces">
          <input type="checkbox" name="souvenir" value="on" defaultChecked />
          <span>{t("souvenirAppareil")}</span>
        </label>
      ) : null}
      <BoutonPrincipalDs libelle={t("bouton")} libelleEnCours={t("enCours")} />
    </form>
  );
}
