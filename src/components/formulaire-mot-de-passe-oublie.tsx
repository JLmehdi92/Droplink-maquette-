"use client";

import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { MailCheck } from "lucide-react";
import {
  demanderReinitialisation,
  type ResultatReinitialisation,
} from "@/app/[locale]/connexion/actions";
import { suggererCorrection } from "@/lib/email/domaines";
import { BoutonPrincipalDs, ChampAcces, MessageErreurDs } from "@/components/acces-champs";

/**
 * DEMANDER UN LIEN DE RÉINITIALISATION — `ForgotScreen` du kit `auth`, écrit le
 * 14/09/2026 avant ce formulaire, sur les champs de la connexion.
 *
 * ⚠️ L'ÉTAT DE SUCCÈS NE DIT PAS QU'UN EMAIL EST PARTI, il dit que S'IL Y A un
 * compte, un email est parti. La nuance est toute la protection : « nous vous
 * avons envoyé un lien » annoncerait que l'adresse est inscrite ici, et cette
 * page est la seule du produit où l'on peut poser la question autant de fois
 * qu'on veut sans posséder quoi que ce soit.
 *
 * Le même état s'affiche donc dans les deux cas, après le même délai — le
 * plancher de 1 200 ms côté serveur s'en charge, parce qu'un envoi d'email prend
 * du temps et une adresse inconnue n'en prend aucun.
 *
 * ⚠️ ET IL N'Y A PAS DE BOUTON « RENVOYER ». Ici on attend pour RÉPARER, c'est
 * rare, et un bouton qui rejoue la demande épuiserait en trois clics le compteur
 * de six envois par heure — donc empêcherait la personne de réessayer quand son
 * mail arrive enfin en retard.
 */

const INITIAL: ResultatReinitialisation = { statut: "inactif" };

export function FormulaireMotDePasseOublie({ locale }: { readonly locale: string }) {
  const t = useTranslations("connexion");
  const tm = useTranslations("motDePasse");
  const [resultat, action] = useActionState(demanderReinitialisation, INITIAL);
  const [email, setEmail] = useState("");

  const suggestion = useMemo(() => suggererCorrection(email), [email]);

  if (resultat.statut === "envoye") {
    return (
      <div role="status" className="flex gap-3 rounded-ds-card bg-ds-surface-teinte px-4 py-3.5">
        <MailCheck aria-hidden="true" size={18} strokeWidth={1.9} className="mt-px flex-none text-ds-accent" />
        <div className="min-w-0">
          <p className="text-[15px] leading-[normal] font-bold text-ds-texte-fort">{tm("envoyeTitre")}</p>
          <p className="mt-1 text-[13.5px] leading-[1.55] text-ds-texte-corps">{tm("envoyeTexte")}</p>
        </div>
      </div>
    );
  }

  const messageErreur =
    resultat.statut === "erreur"
      ? resultat.motif === "email_invalide"
        ? t("erreurEmailInvalide")
        : t("erreurTropDeTentatives")
      : null;

  return (
    <form action={action} className="flex flex-col gap-[22px]" noValidate>
      <input type="hidden" name="locale" value={locale} />

      <ChampAcces
        id="email-oubli"
        nom="email"
        type="email"
        libelle={t("labelEmail")}
        placeholder={t("placeholderEmail")}
        autoComplete="username"
        modeSaisie="email"
        valeur={email}
        surChangement={setEmail}
        invalide={messageErreur !== null}
        {...(messageErreur !== null ? { decritPar: "erreur-oubli" } : {})}
      />

      {suggestion !== null ? (
        <p className="-mt-3 text-[13px] leading-[1.5] text-ds-texte-corps" aria-live="polite">
          {t("suggestionPrefixe")}{" "}
          <button
            type="button"
            onClick={() => setEmail(suggestion.adresse)}
            className="font-semibold text-ds-texte-lien underline"
          >
            {suggestion.adresse}
          </button>
          {t("suggestionSuffixe")}
        </p>
      ) : null}

      {messageErreur !== null ? <MessageErreurDs id="erreur-oubli" texte={messageErreur} /> : null}

      <BoutonPrincipalDs libelle={tm("bouton")} libelleEnCours={tm("boutonEnCours")} />
    </form>
  );
}
