"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Mail } from "lucide-react";
import {
  demanderReinitialisation,
  type ResultatReinitialisation,
} from "@/app/[locale]/connexion/actions";
import { suggererCorrection } from "@/lib/email/domaines";
import { BoutonPrincipalDs, ChampAcces, MessageErreurDs } from "@/components/acces-champs";
import { emailValide, secouer, secouerInvalides, valeurEnvoyee } from "@/components/acces/validation-locale";

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
  const [erreurEmail, setErreurEmail] = useState("");
  const formulaire = useRef<HTMLFormElement>(null);
  const envoye = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (resultat.statut === "erreur") secouerInvalides(formulaire.current);
    // La confirmation remplace le formulaire : le focus la suit (maquette, `acces.js`),
    // sans quoi il tomberait sur le document.
    if (resultat.statut === "envoye") envoye.current?.focus();
  }, [resultat]);

  const suggestion = useMemo(() => suggererCorrection(email), [email]);

  if (resultat.statut === "envoye") {
    return (
      <div role="status" className="envoye">
        <span className="envoye__icone" aria-hidden="true">
          <Mail className="ic" />
        </span>
        {/* Le focus suit la confirmation (maquette, `acces.js`), sans quoi il tomberait
            sur le document une fois le formulaire retiré. */}
        <h2 ref={envoye} tabIndex={-1}>
          {tm("envoyeTitre")}
        </h2>
        <p>{tm("envoyeTexte")}</p>
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
    <form
      ref={formulaire}
      action={action}
      className="formulaire v4-carte"
      noValidate
      onSubmit={(e) => {
        if (emailValide(valeurEnvoyee(e.currentTarget, "email"))) {
          setErreurEmail("");
          return;
        }
        e.preventDefault();
        setErreurEmail(t("erreurEmailInvalide"));
        const champ = e.currentTarget.querySelector<HTMLInputElement>("#email-oubli");
        secouer(champ?.closest(".champ-acces__boite"));
        champ?.focus();
      }}
    >
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
        surChangement={(v) => {
          setEmail(v);
          if (erreurEmail !== "" && emailValide(v)) setErreurEmail("");
        }}
        surSortie={() => {
          if (email !== "" && !emailValide(email)) setErreurEmail(t("erreurEmailInvalide"));
        }}
        erreurLocale={erreurEmail}
        invalide={messageErreur !== null}
        {...(messageErreur !== null ? { decritPar: "erreur-oubli" } : {})}
      >
        {/* La suggestion de faute de frappe reste LOCALE : aucune requête. */}
        {suggestion !== null ? (
          <p className="champ-acces__suggestion" aria-live="polite">
            {t("suggestionPrefixe")}{" "}
            <button
              type="button"
              onClick={() => {
                setEmail(suggestion.adresse);
                setErreurEmail("");
              }}
            >
              {suggestion.adresse}
            </button>
            {t("suggestionSuffixe")}
          </p>
        ) : null}
      </ChampAcces>

      {messageErreur !== null ? <MessageErreurDs id="erreur-oubli" texte={messageErreur} /> : null}

      <BoutonPrincipalDs libelle={tm("bouton")} libelleEnCours={tm("boutonEnCours")} />
    </form>
  );
}
