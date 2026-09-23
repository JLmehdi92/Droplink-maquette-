"use client";

import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { sInscrire, type ResultatInscription } from "@/app/[locale]/connexion/actions";
import { suggererCorrection } from "@/lib/email/domaines";
import { Lock, Mail } from "lucide-react";
import {
  BoutonPrincipalDs,
  ChampAcces,
  MessageErreurDs,
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
 * ⚠️ « UN COMPTE EXISTE DÉJÀ » NE S'AFFICHE QUE DANS UN DES DEUX RÉGLAGES, et
 * la différence n'est pas un détail :
 *
 *   - confirmation d'email DÉSACTIVÉE (le choix de Wassim) : le serveur rend
 *     « User already registered ». L'oracle existe, il est ASSUMÉ, borné par
 *     les compteurs, et le taire coûterait la fuite ET l'utilisateur — qui ne
 *     saurait pas qu'il lui suffit d'aller se connecter ;
 *   - confirmation ACTIVÉE : le serveur rend un utilisateur OBFUSQUÉ sans
 *     session, et n'envoie rien. Le doublon devient indiscernable d'une
 *     inscription réussie, et l'écran de connexion affiche alors un message
 *     écrit pour couvrir les DEUX cas sans dire lequel s'applique.
 *
 * Le réglage vit dans le tableau de bord, hors du dépôt : ce composant gère les
 * deux, parce qu'il ne peut pas savoir lequel est en vigueur. Le prix, les
 * bornes et la façon de refermer sont écrits au §9 du brief.
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
                : resultat.motif === "mdp_fuite"
                  ? ti("erreurMdpFuite")
                  : resultat.motif === "deja_inscrit"
                    ? ti("erreurDejaInscrit")
                    : t("erreurIndisponible")
      : null;

  /*
   * ⚠️ CHAQUE CHAMP NE PORTE QUE LES REFUS QUI LE CONCERNENT.
   *
   * DÉFAUT TROUVÉ EN PILOTANT AU NAVIGATEUR : les deux champs portaient
   * `aria-invalid` dès qu'une erreur existait, quelle qu'elle soit. Un mot de
   * passe trop court faisait donc annoncer « adresse email, invalide » à qui
   * emploie un lecteur d'écran — on lui désignait le champ juste. Le défaut est
   * strictement invisible à l'œil, puisque le message affiché, lui, était bon.
   */
  const motif = resultat.statut === "erreur" ? resultat.motif : null;
  const emailEnCause = motif === "email_invalide" || motif === "deja_inscrit";
  const motDePasseEnCause =
    motif === "mdp_trop_court" ||
    motif === "mdp_trop_long" ||
    motif === "mdp_contient_email" ||
    motif === "mdp_fuite";

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="locale" value={locale} />

      <ChampAcces
        id="email-inscription"
        nom="email"
        type="email"
        libelle={t("labelEmail")}
        icone={Mail}
        placeholder={t("placeholderEmail")}
        autoComplete="username"
        modeSaisie="email"
        valeur={email}
        surChangement={setEmail}
        invalide={emailEnCause}
        {...(emailEnCause ? { decritPar: "erreur-inscription" } : {})}
      />

      <div>
        <ChampAcces
          id="motDePasse-inscription"
          nom="motDePasse"
          type="password"
          libelle={t("labelMotDePasse")}
          icone={Lock}
          // `new-password` : c'est ce qui fait PROPOSER un mot de passe au
          // gestionnaire, au lieu de remplir celui d'un autre compte.
          autoComplete="new-password"
          invalide={motDePasseEnCause}
          decritPar={
            motDePasseEnCause ? "aide-mot-de-passe erreur-inscription" : "aide-mot-de-passe"
          }
        />
        {/* ⚠️ DOUZE, ET LA RÉFÉRENCE DIT HUIT. Son placeholder annonce
            « Minimum 8 caractères » ; `LONGUEUR_MINIMALE` vaut DOUZE, imposé par
            Zod ET par le réglage Supabase. Afficher 8 promettrait un mot de
            passe que le serveur refuse — l'écart le plus coûteux qu'une copie
            de design puisse introduire, puisqu'il ne se voit qu'à l'échec. */}
        <p id="aide-mot-de-passe" className="mt-2 text-[12px] leading-[18px] text-ds-texte-tenu">
          {ti("aideMotDePasse")}
        </p>
      </div>

      {suggestion !== null ? (
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
        <MessageErreurDs id="erreur-inscription" texte={messageErreur} />
      ) : null}

      <BoutonPrincipalDs
        libelle={ti("bouton")}
        libelleEnCours={ti("boutonEnCours")}
        hauteur={60}
      />
    </form>
  );
}
