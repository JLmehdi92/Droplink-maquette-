"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { seConnecter, type ResultatConnexion } from "@/app/[locale]/connexion/actions";
import { suggererCorrection } from "@/lib/email/domaines";
import {
  BoutonPrincipal,
  CLASSE_CHAMP,
  CLASSE_LIBELLE,
  MessageErreur,
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
    <form action={action} className="flex flex-col gap-4 md:gap-[18px]" noValidate>
      <input type="hidden" name="locale" value={locale} />

      <div>
        <label htmlFor="email" className={CLASSE_LIBELLE + " mb-2"}>
          {t("labelEmail")}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          value={email}
          onChange={(evenement) => setEmail(evenement.target.value)}
          placeholder={t("placeholderEmail")}
          aria-invalid={messageErreur !== null}
          aria-describedby={messageErreur !== null ? "erreur-connexion" : undefined}
          className={CLASSE_CHAMP}
        />
      </div>

      <div>
        {/* LE LIEN D'OUBLI EST SUR LA LIGNE DU LIBELLÉ, comme la planche le
            dessine. Sous le champ, il se lirait comme une aide à la saisie ;
            ici, il se lit comme l'autre chose qu'on peut faire de son mot de
            passe. */}
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <label htmlFor="motDePasse" className={CLASSE_LIBELLE}>
            {t("labelMotDePasse")}
          </label>
          <Link
            href={`/${locale}/mot-de-passe-oublie`}
            className="font-headline-md text-[12px] leading-4 font-semibold text-violet hover:underline"
          >
            {t("motDePasseOublie")}
          </Link>
        </div>
        <input
          id="motDePasse"
          name="motDePasse"
          type="password"
          // `current-password` et non `new-password` : c'est ce qui fait
          // proposer au gestionnaire de mots de passe celui qui est enregistré,
          // au lieu d'en suggérer un nouveau sur un écran de connexion.
          autoComplete="current-password"
          required
          aria-invalid={messageErreur !== null}
          aria-describedby={messageErreur !== null ? "erreur-connexion" : undefined}
          className={CLASSE_CHAMP}
        />
      </div>

      {suggestion !== null ? (
        // On SUGGÈRE, on ne corrige jamais d'office : réécrire une adresse rare
        // mais légitime ferait tenter la connexion au compte de quelqu'un
        // d'autre, et le compteur d'échecs serait consommé sur SA boîte.
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
        <MessageErreur id="erreur-connexion" texte={messageErreur} />
      ) : null}

      <BoutonPrincipal libelle={t("bouton")} libelleEnCours={t("boutonEnCours")} />
    </form>
  );
}
