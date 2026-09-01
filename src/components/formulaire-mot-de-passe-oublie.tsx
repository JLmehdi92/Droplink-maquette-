"use client";

import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  demanderReinitialisation,
  type ResultatReinitialisation,
} from "@/app/[locale]/connexion/actions";
import { suggererCorrection } from "@/lib/email/domaines";
import {
  BoutonPrincipal,
  CLASSE_CHAMP,
  CLASSE_LIBELLE,
  MessageErreur,
} from "@/components/acces-champs";

/**
 * DEMANDER UN LIEN DE RÉINITIALISATION.
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
 * ⚠️ ET IL N'Y A PAS DE BOUTON « RENVOYER ». Il existait pour le lien magique,
 * où l'on attendait le mail pour ENTRER ; ici on attend pour RÉPARER, c'est
 * beaucoup plus rare, et un bouton qui rejoue la demande épuiserait en trois
 * clics le compteur de six envois par heure — donc empêcherait la personne de
 * réessayer quand son mail arrive enfin en retard.
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
      <div role="status" className="flex flex-col gap-3">
        <h2 className="font-headline-md text-headline-md-mobile text-on-surface">
          {tm("envoyeTitre")}
        </h2>
        <p className="font-body-md text-body-md text-on-surface-variant">{tm("envoyeTexte")}</p>
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
    <form action={action} className="flex flex-col gap-4 md:gap-[18px]" noValidate>
      <input type="hidden" name="locale" value={locale} />

      <div>
        <label htmlFor="email-oubli" className={CLASSE_LIBELLE + " mb-2"}>
          {t("labelEmail")}
        </label>
        <input
          id="email-oubli"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          value={email}
          onChange={(evenement) => setEmail(evenement.target.value)}
          placeholder={t("placeholderEmail")}
          aria-invalid={messageErreur !== null}
          aria-describedby={messageErreur !== null ? "erreur-oubli" : undefined}
          className={CLASSE_CHAMP}
        />
      </div>

      {suggestion !== null ? (
        <p className="font-body-sm text-body-sm text-on-surface-variant" aria-live="polite">
          {t("suggestionPrefixe")}{" "}
          <button
            type="button"
            onClick={() => setEmail(suggestion.adresse)}
            className="font-label-md text-label-md text-[var(--accent-texte)] underline"
          >
            {suggestion.adresse}
          </button>
          {t("suggestionSuffixe")}
        </p>
      ) : null}

      {messageErreur !== null ? <MessageErreur id="erreur-oubli" texte={messageErreur} /> : null}

      <BoutonPrincipal libelle={tm("bouton")} libelleEnCours={tm("boutonEnCours")} />
    </form>
  );
}
