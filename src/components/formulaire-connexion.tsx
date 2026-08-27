"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import {
  envoyerLienConnexion,
  type ResultatConnexion,
} from "@/app/[locale]/connexion/actions";
import { suggererCorrection } from "@/lib/email/domaines";
import { Icone } from "@/components/icone";

/**
 * Formulaire d'accès par lien email, partagé par la connexion et l'inscription.
 *
 * PAS DE MOT DE PASSE, PAS DE SSO. La maquette Stitch montrait « Corporate
 * Email », un champ mot de passe et un bouton « Enterprise SSO » : ce sont les
 * codes d'un produit d'entreprise, pas de celui-ci.
 *
 * Le lien email n'est pas un confort, c'est l'UNIQUE porte d'entrée du
 * fournisseur en Chine, pour qui la connexion Google est inaccessible.
 *
 * UN SEUL COMPOSANT POUR LES DEUX ÉCRANS, parce que le serveur fait strictement
 * la même chose dans les deux cas — et qu'il doit continuer à le faire. Deux
 * formulaires distincts dériveraient l'un de l'autre, et la première différence
 * de comportement serait un moyen de savoir si une adresse a un compte.
 *
 * La suggestion de faute de frappe vit ICI, à la saisie, sans qu'aucune requête
 * ne parte. C'est ce qui permet au serveur de répondre la même chose à tout le
 * monde sans que l'utilisateur y perde : les deux besoins sont traités là où ils
 * se produisent.
 */

function BoutonEnvoi({ libelle, libelleEnCours }: { libelle: string; libelleEnCours: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[var(--accent-remplissage)] py-3 font-label-md text-label-md text-[var(--accent-sur-remplissage)] shadow-md transition-all duration-200 hover:shadow-sm active:shadow-none disabled:opacity-60"
    >
      <span>{pending ? libelleEnCours : libelle}</span>
      {pending ? null : <Icone nom="arrow_forward" className="text-[18px]" />}
    </button>
  );
}

const INITIAL: ResultatConnexion = { statut: "inactif" };

export function FormulaireConnexion({
  locale,
  intention = "connexion",
}: {
  locale: string;
  intention?: "connexion" | "inscription";
}) {
  const t = useTranslations("connexion");
  const [resultat, action] = useActionState(envoyerLienConnexion, INITIAL);
  const [email, setEmail] = useState("");

  // Le calcul est purement local et borné : quelques dizaines de comparaisons
  // sur des chaînes courtes. Aucune requête, donc aucun moyen d'apprendre quoi
  // que ce soit sur nos comptes en observant le réseau.
  const suggestion = useMemo(() => suggererCorrection(email), [email]);

  if (resultat.statut === "envoye") {
    return (
      <div role="status" className="flex flex-col gap-3">
        <h2 className="font-headline-md text-headline-md-mobile text-on-surface">
          {t("succesTitre")}
        </h2>
        <p className="font-body-md text-body-md text-on-surface-variant">
          {t("succesTexte", { email: resultat.email })}
        </p>
        <form action={action}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="intention" value={intention} />
          <input type="hidden" name="email" value={resultat.email} />
          <button
            type="submit"
            className="mt-2 self-start font-label-md text-label-md text-[var(--accent-texte)] underline"
          >
            {t("renvoyer")}
          </button>
        </form>
      </div>
    );
  }

  const messageErreur =
    resultat.statut === "erreur"
      ? resultat.motif === "email_invalide"
        ? t("erreurEmailInvalide")
        : resultat.motif === "trop_de_tentatives"
          ? t("erreurTropDeTentatives")
          : t("erreurEnvoi")
      : null;

  return (
    <form action={action} className="space-y-6" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="intention" value={intention} />
      <div>
        <label
          htmlFor="email"
          className="mb-1.5 block font-label-md text-label-md text-on-surface"
        >
          {t("labelEmail")}
        </label>
        {/* Icône DANS le champ, fond ardoise et non blanc, halo de 2 px au
            focus : la spécification « Input Fields » du design system, et le
            rendu exact de la maquette. */}
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-outline">
            <Icone nom="mail" className="text-[20px]" />
          </div>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            onChange={(evenement) => setEmail(evenement.target.value)}
            placeholder={t("placeholderEmail")}
            aria-invalid={messageErreur !== null}
            aria-describedby={messageErreur !== null ? "erreur-connexion" : undefined}
            className="w-full min-h-[44px] rounded-lg champ-app py-3 pl-10 pr-4 font-body-md text-body-md text-on-surface transition-all duration-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-interface)]"
          />
        </div>
      </div>

      {suggestion !== null ? (
        // On SUGGÈRE, on ne corrige jamais d'office : réécrire une adresse rare
        // mais légitime enverrait le lien d'accès au compte à quelqu'un d'autre.
        // Le coût d'une suggestion ignorée est nul, celui d'une correction
        // erronée est un compte livré à un tiers.
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
        <p id="erreur-connexion" role="alert" className="font-body-sm text-body-sm text-error">
          {messageErreur}
        </p>
      ) : null}

      <BoutonEnvoi
        libelle={intention === "inscription" ? t("envoyerInscription") : t("envoyer")}
        libelleEnCours={t("envoiEnCours")}
      />
    </form>
  );
}
