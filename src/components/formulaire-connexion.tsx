"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import {
  envoyerLienConnexion,
  type ResultatConnexion,
} from "@/app/[locale]/connexion/actions";

/**
 * Formulaire de connexion par lien email.
 *
 * PAS DE MOT DE PASSE, PAS DE SSO. La maquette Stitch montrait « Corporate
 * Email », un champ mot de passe et un bouton « Enterprise SSO » : ce sont les
 * codes d'un produit d'entreprise, pas de celui-ci.
 *
 * Le lien email n'est pas un confort, c'est l'UNIQUE porte d'entrée du
 * fournisseur en Chine, pour qui la connexion Google est inaccessible. Ce
 * chemin doit donc être irréprochable : renvoi possible sans blocage abusif, et
 * surtout un message d'erreur EXPLICITE quand l'envoi échoue — un formulaire
 * qui ne dit rien laisse conclure que le produit ne marche pas.
 *
 * Ce composant ne porte QUE l'état du formulaire. L'appel réseau vit dans une
 * Server Action : le SDK Supabase ne part pas dans le navigateur.
 */
function BoutonEnvoi({ libelle, libelleEnCours }: { libelle: string; libelleEnCours: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-[var(--accent-remplissage)] px-6 py-3 text-sm font-semibold text-[var(--accent-sur-remplissage)] disabled:opacity-60"
    >
      {pending ? libelleEnCours : libelle}
    </button>
  );
}

const INITIAL: ResultatConnexion = { statut: "inactif" };

export function FormulaireConnexion({ locale }: { locale: string }) {
  const t = useTranslations("connexion");
  const [resultat, action] = useActionState(envoyerLienConnexion, INITIAL);

  if (resultat.statut === "envoye") {
    return (
      <div role="status" className="flex flex-col gap-3">
        <h2 className="font-[family-name:var(--font-titre)] text-xl font-semibold text-encre">
          {t("succesTitre")}
        </h2>
        <p className="text-base leading-7 text-encre-douce">
          {t("succesTexte", { email: resultat.email })}
        </p>
        <form action={action}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="email" value={resultat.email} />
          <button
            type="submit"
            className="mt-2 self-start text-sm font-semibold text-[var(--accent-texte)] underline"
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
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <div className="flex flex-col gap-2">
        <label htmlFor="email" className="text-sm font-semibold text-encre">
          {t("labelEmail")}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          placeholder={t("placeholderEmail")}
          aria-invalid={messageErreur !== null}
          aria-describedby={messageErreur !== null ? "erreur-connexion" : undefined}
          className="min-h-[44px] rounded-md border border-trait bg-surface-basse px-4 py-3 text-base text-encre outline-none focus:border-[var(--accent-interface)] focus:ring-2 focus:ring-[var(--accent-interface)]"
        />
      </div>

      {messageErreur !== null ? (
        <p id="erreur-connexion" role="alert" className="text-sm text-erreur">
          {messageErreur}
        </p>
      ) : null}

      <BoutonEnvoi libelle={t("envoyer")} libelleEnCours={t("envoiEnCours")} />
    </form>
  );
}
