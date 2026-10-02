"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { seConnecter, type ResultatConnexion } from "@/app/[locale]/connexion/actions";
import { suggererCorrection } from "@/lib/email/domaines";
import {
  BoutonPrincipalDs,
  ChampAcces,
  MessageErreurDs,
} from "@/components/acces-champs";

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
  const [email, setEmail] = useState("");

  const suggestion = useMemo(() => suggererCorrection(email), [email]);

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
    <form action={action} className="formulaire" noValidate>
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
        surChangement={setEmail}
        invalide={messageErreur !== null}
        {...(messageErreur !== null ? { decritPar: "erreur-connexion" } : {})}
      >
        {/* La suggestion de faute de frappe reste LOCALE : aucune requête, donc
            rien à apprendre sur nos comptes en observant le réseau. */}
        {suggestion !== null ? (
          <p className="champ-acces__suggestion" aria-live="polite">
            {t("suggestionPrefixe")}{" "}
            <button type="button" onClick={() => setEmail(suggestion.adresse)}>
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
        libellesOeil={{ afficher: t("afficherMotDePasse"), masquer: t("masquerMotDePasse") }}
        invalide={messageErreur !== null}
        {...(messageErreur !== null ? { decritPar: "erreur-connexion" } : {})}
        action={
          <Link href={`/${locale}/mot-de-passe-oublie`} className="lien-texte min-h-11">
            {t("motDePasseOublie")}
          </Link>
        }
      />

      {messageErreur !== null ? <MessageErreurDs id="erreur-connexion" texte={messageErreur} /> : null}

      <BoutonPrincipalDs libelle={t("bouton")} libelleEnCours={t("boutonEnCours")} />
    </form>
  );
}
