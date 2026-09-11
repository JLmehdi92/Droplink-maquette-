"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { seConnecter, type ResultatConnexion } from "@/app/[locale]/connexion/actions";
import { suggererCorrection } from "@/lib/email/domaines";
import { Lock, Mail } from "lucide-react";
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
    <form action={action} className="flex flex-col gap-[22px]" noValidate>
      <input type="hidden" name="locale" value={locale} />

      <ChampAcces
        id="email"
        nom="email"
        type="email"
        libelle={t("labelEmail")}
        icone={Mail}
        placeholder={t("placeholderEmail")}
        autoComplete="username"
        modeSaisie="email"
        valeur={email}
        surChangement={setEmail}
        invalide={messageErreur !== null}
        {...(messageErreur !== null ? { decritPar: "erreur-connexion" } : {})}
      />

      {/* LE LIEN D'OUBLI EST SUR LA LIGNE DU LIBELLÉ, comme la référence le
          dessine. Sous le champ, il se lirait comme une aide à la saisie ; ici,
          il se lit comme l'autre chose qu'on peut faire de son mot de passe.

          ⚠️ SA ZONE TACTILE PASSE PAR UN PSEUDO-ÉLÉMENT, ET C'EST LA SEULE DU
          PRODUIT DANS CE CAS. Le brief §8 exige 44 points ; ce lien en mesure
          16. La recette employée partout ailleurs — un plancher `min-h-11` plus
          une marge négative qui le compense — casse ICI : le conteneur est en
          `items-baseline`, et un `inline-flex` de 44 px porte sa baseline au
          CENTRE de sa boîte. La marge compense bien la hauteur, jamais la
          baseline : mesuré, le lien descendait de 55 px et entraînait toute la
          page avec lui.

          Un pseudo-élément en position absolue agrandit ce que le doigt touche
          sans rien peser dans le flux ni déplacer une baseline. Et il se prouve
          par `elementFromPoint`, jamais par une mesure de boîte — un
          pseudo-élément n'apparaît dans le rectangle d'aucun élément. */}
      <ChampAcces
        id="motDePasse"
        nom="motDePasse"
        type="password"
        libelle={t("labelMotDePasse")}
        icone={Lock}
        placeholder={t("placeholderMotDePasse")}
        // `current-password` et non `new-password` : c'est ce qui fait proposer
        // au gestionnaire de mots de passe celui qui est enregistré, au lieu
        // d'en suggérer un nouveau sur un écran de connexion.
        autoComplete="current-password"
        invalide={messageErreur !== null}
        {...(messageErreur !== null ? { decritPar: "erreur-connexion" } : {})}
        action={
          <Link
            href={`/${locale}/mot-de-passe-oublie`}
            className="relative text-[13px] font-medium text-ds-texte-lien underline after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-[''] hover:text-ds-texte-lien-survol"
          >
            {t("motDePasseOublie")}
          </Link>
        }
      />

      {suggestion !== null ? (
        // On SUGGÈRE, on ne corrige jamais d'office : réécrire une adresse rare
        // mais légitime ferait tenter la connexion au compte de quelqu'un
        // d'autre, et le compteur d'échecs serait consommé sur SA boîte.
        <p className="text-[14px] text-ds-texte-corps" aria-live="polite">
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

      {messageErreur !== null ? (
        <MessageErreurDs id="erreur-connexion" texte={messageErreur} />
      ) : null}

      <BoutonPrincipalDs libelle={t("bouton")} libelleEnCours={t("boutonEnCours")} />
    </form>
  );
}
