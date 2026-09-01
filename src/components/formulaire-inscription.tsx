"use client";

import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { sInscrire, type ResultatInscription } from "@/app/[locale]/connexion/actions";
import { suggererCorrection } from "@/lib/email/domaines";
import {
  BoutonPrincipal,
  CLASSE_CHAMP,
  CLASSE_LIBELLE,
  MessageErreur,
} from "@/components/acces-champs";

/**
 * CRÉER UN COMPTE — adresse et mot de passe.
 *
 * ⚠️ LES REFUS DE MOT DE PASSE SONT NOMMÉS, UN PAR UN. Un « mot de passe
 * invalide » générique se corrige au hasard, et le motif « il contient votre
 * adresse » ne se devine pas du tout : quelqu'un le retaperait trois fois à
 * l'identique en concluant que le produit est cassé.
 *
 * ⚠️ ET L'EXIGENCE EST ÉCRITE AVANT LA SAISIE, sous le champ, pas seulement
 * après un refus. Une règle qu'on découvre en échouant se lit comme un caprice ;
 * annoncée, elle se lit comme une consigne. La planche la dessine ainsi.
 *
 * CE COMPOSANT DIT « UN COMPTE EXISTE DÉJÀ », ET C'EST UN ORACLE ASSUMÉ. La
 * confirmation d'email étant désactivée, le serveur d'authentification rend
 * l'information et rien ici ne peut la retenir : une inscription réussie ouvre
 * une session, un doublon non, et la différence est observable quoi qu'on
 * affiche. Le taire coûterait donc la fuite ET l'utilisateur — qui ne saurait
 * pas qu'il lui suffit d'aller se connecter. Le prix, les bornes et la façon de
 * refermer sont écrits au §9 du brief.
 */

const INITIAL: ResultatInscription = { statut: "inactif" };

export function FormulaireInscription({ locale }: { readonly locale: string }) {
  const t = useTranslations("connexion");
  const ti = useTranslations("inscription");
  const [resultat, action] = useActionState(sInscrire, INITIAL);
  const [email, setEmail] = useState("");

  const suggestion = useMemo(() => suggererCorrection(email), [email]);

  const messageErreur =
    resultat.statut === "erreur"
      ? resultat.motif === "email_invalide"
        ? t("erreurEmailInvalide")
        : resultat.motif === "trop_de_tentatives"
          ? t("erreurTropDeTentatives")
          : resultat.motif === "mdp_trop_court"
            ? ti("erreurMdpTropCourt")
            : resultat.motif === "mdp_trop_long"
              ? ti("erreurMdpTropLong")
              : resultat.motif === "mdp_contient_email"
                ? ti("erreurMdpContientEmail")
                : resultat.motif === "deja_inscrit"
                  ? ti("erreurDejaInscrit")
                  : t("erreurIndisponible")
      : null;

  return (
    <form action={action} className="flex flex-col gap-4 md:gap-[18px]" noValidate>
      <input type="hidden" name="locale" value={locale} />

      <div>
        <label htmlFor="email-inscription" className={CLASSE_LIBELLE + " mb-2"}>
          {t("labelEmail")}
        </label>
        <input
          id="email-inscription"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          value={email}
          onChange={(evenement) => setEmail(evenement.target.value)}
          placeholder={t("placeholderEmail")}
          aria-invalid={messageErreur !== null}
          aria-describedby={messageErreur !== null ? "erreur-inscription" : undefined}
          className={CLASSE_CHAMP}
        />
      </div>

      <div>
        <label htmlFor="motDePasse-inscription" className={CLASSE_LIBELLE + " mb-2"}>
          {t("labelMotDePasse")}
        </label>
        <input
          id="motDePasse-inscription"
          name="motDePasse"
          type="password"
          // `new-password` : c'est ce qui fait PROPOSER un mot de passe au
          // gestionnaire, au lieu de remplir celui d'un autre compte.
          autoComplete="new-password"
          required
          aria-invalid={messageErreur !== null}
          aria-describedby="aide-mot-de-passe"
          className={CLASSE_CHAMP}
        />
        <p
          id="aide-mot-de-passe"
          className="mt-2 font-body-sm text-[12px] leading-[18px] text-sourdine"
        >
          {ti("aideMotDePasse")}
        </p>
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

      {messageErreur !== null ? (
        <MessageErreur id="erreur-inscription" texte={messageErreur} />
      ) : null}

      <BoutonPrincipal libelle={ti("bouton")} libelleEnCours={ti("boutonEnCours")} />
    </form>
  );
}
