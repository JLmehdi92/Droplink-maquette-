"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { adresseTransmise, transmettreAdresse } from "@/components/acces/bascule-acces";
import { seConnecter, type ResultatConnexion } from "@/app/[locale]/connexion/actions";
import { useSuggestionAdresse } from "@/components/acces/suggestion-adresse";
import {
  BoutonPrincipalDs,
  ChampAcces,
  MessageErreurDs,
} from "@/components/acces-champs";
import { emailValide, secouer, secouerInvalides, valeurEnvoyee } from "@/components/acces/validation-locale";

/**
 * SE CONNECTER — adresse et mot de passe.
 *
 * ⚠️ CE COMPOSANT SERVAIT AUSSI L'INSCRIPTION jusqu'au 01/09/2026, avec une
 * propriété `intention` qui ne changeait que le libellé du bouton. C'était juste
 * tant que le serveur faisait la même chose des deux côtés — envoyer un lien à
 * une adresse. Avec un mot de passe, l'un vérifie et l'autre crée : garder un
 * composant unique aurait fait passer par le même chemin deux gestes qui n'ont
 * plus ni les mêmes champs, ni les mêmes refus, ni les mêmes compteurs.
 *
 * IL N'Y A AUCUN ÉTAT DE SUCCÈS. Une connexion réussie REDIRIGE — la Server
 * Action lève, ce composant ne se réaffiche jamais. C'est ce qui remplace
 * l'écran « regardez votre boîte mail » du lien magique, et c'est tout ce que
 * Wassim demandait : on tape, on entre.
 *
 * La suggestion de faute de frappe reste, et reste LOCALE : quelques dizaines de
 * comparaisons sur des chaînes courtes, aucune requête, donc aucun moyen
 * d'apprendre quoi que ce soit sur nos comptes en observant le réseau. C'est
 * elle qui permet au serveur de répondre la même chose à tout le monde sans que
 * l'utilisateur y perde.
 */

const INITIAL: ResultatConnexion = { statut: "inactif" };

export function FormulaireConnexion({ locale }: { readonly locale: string }) {
  const t = useTranslations("connexion");
  const [resultat, action] = useActionState(seConnecter, INITIAL);
  // L'adresse tapée sur l'autre page d'accès suit la bascule (maquette, `acces.js`).
  const [email, setEmail] = useState(adresseTransmise);
  const [motDePasse, setMotDePasse] = useState("");
  // Les refus de la saisie (maquette, `acces.js`) : un confort, le serveur décide.
  const [erreurEmail, setErreurEmail] = useState("");
  const [erreurMdp, setErreurMdp] = useState("");
  const formulaire = useRef<HTMLFormElement>(null);

  // Un refus du SERVEUR secoue aussi les champs qu'il désigne : même geste, même sens.
  useEffect(() => {
    if (resultat.statut === "erreur") secouerInvalides(formulaire.current);
  }, [resultat]);

  const { suggestion, aLaSortie } = useSuggestionAdresse(email);

  const messageErreur =
    resultat.statut === "erreur"
      ? resultat.motif === "email_invalide"
        ? t("erreurEmailInvalide")
        : resultat.motif === "trop_de_tentatives"
          ? t("erreurTropDeTentatives")
          : resultat.motif === "indisponible"
            ? t("erreurIndisponible")
            : t("erreurIdentifiants")
      : null;

  return (
    <form
      ref={formulaire}
      action={action}
      className="formulaire v4-carte"
      noValidate
      onSubmit={(e) => {
        // Ce qui est refusé ici ne part pas : la secousse, le message sous le champ,
        // et le focus sur le premier champ fautif (maquette, `acces.js`).
        // On valide ce qui PART, pas l'état React (un remplissage automatique peut le taire).
        const f = e.currentTarget;
        const eEmail = emailValide(valeurEnvoyee(f, "email")) ? "" : t("erreurEmailInvalide");
        const eMdp = valeurEnvoyee(f, "motDePasse") === "" ? t("erreurMdpVide") : "";
        setErreurEmail(eEmail);
        setErreurMdp(eMdp);
        if (eEmail === "" && eMdp === "") return;
        e.preventDefault();
        const fautifs = [eEmail !== "" ? "email" : null, eMdp !== "" ? "motDePasse" : null].filter(
          (x): x is string => x !== null,
        );
        fautifs.forEach((id) => secouer(f.querySelector(`#${id}`)?.closest(".champ-acces__boite")));
        f.querySelector<HTMLInputElement>(`#${fautifs[0] ?? "email"}`)?.focus();
      }}
    >
      <input type="hidden" name="locale" value={locale} />

      <ChampAcces
        id="email"
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
          aLaSortie();
          if (email !== "" && !emailValide(email)) setErreurEmail(t("erreurEmailInvalide"));
        }}
        erreurLocale={erreurEmail}
        invalide={messageErreur !== null}
        {...(messageErreur !== null ? { decritPar: "erreur-connexion" } : {})}
      >
        {/* La suggestion de faute de frappe reste LOCALE : aucune requête, donc
            rien à apprendre sur nos comptes en observant le réseau. */}
        {suggestion !== null ? (
          <p className="champ-acces__suggestion" aria-live="polite">
            {t("suggestionPrefixe")}{" "}
            <button
              type="button"
              onClick={() => {
                setEmail(suggestion.adresse);
                document.getElementById("email")?.focus();
                setErreurEmail("");
              }}
            >
              {suggestion.adresse}
            </button>
            {t("suggestionSuffixe")}
          </p>
        ) : null}
      </ChampAcces>

      {/* LE LIEN D'OUBLI EST SUR LA LIGNE DU LIBELLÉ : il se lit comme l'autre
          chose qu'on peut faire de son mot de passe. Il mène à la ROUTE
          `/mot-de-passe-oublie` (des liens existants y pointent) plutôt qu'au
          panneau de la maquette : même action `demanderReinitialisation`. Sa
          cible fait 44 px par `.champ-acces__ligne .lien-texte` (marge négative
          qui ne déplace aucune ligne). */}
      <ChampAcces
        id="motDePasse"
        nom="motDePasse"
        type="password"
        libelle={t("labelMotDePasse")}
        placeholder={t("placeholderMotDePasse")}
        autoComplete="current-password"
        valeur={motDePasse}
        surChangement={(v) => {
          setMotDePasse(v);
          if (v !== "") setErreurMdp("");
        }}
        erreurLocale={erreurMdp}
        libellesOeil={{ afficher: t("afficherMotDePasse"), masquer: t("masquerMotDePasse") }}
        invalide={messageErreur !== null}
        {...(messageErreur !== null ? { decritPar: "erreur-connexion" } : {})}
        action={
          <Link href={`/${locale}/mot-de-passe-oublie`} className="lien-texte min-h-11" onClick={() => transmettreAdresse(email)}>
            {t("motDePasseOublie")}
          </Link>
        }
      />

      {messageErreur !== null ? <MessageErreurDs id="erreur-connexion" texte={messageErreur} /> : null}

      <BoutonPrincipalDs libelle={t("bouton")} libelleEnCours={t("boutonEnCours")} />
    </form>
  );
}
