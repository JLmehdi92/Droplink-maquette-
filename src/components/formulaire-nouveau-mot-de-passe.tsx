"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  changerMotDePasse,
  type ResultatChangement,
} from "@/app/[locale]/nouveau-mot-de-passe/actions";
import {
  BoutonPrincipal,
  CLASSE_CHAMP,
  CLASSE_LIBELLE,
  MessageErreur,
} from "@/components/acces-champs";

/**
 * SAISIR LE NOUVEAU MOT DE PASSE.
 *
 * AUCUN CHAMP D'ADRESSE, et aucune adresse en entrée cachée non plus : elle est
 * lue DANS LA SESSION côté serveur. La faire voyager par le formulaire
 * permettrait d'en soumettre une autre, donc de contourner le seul contrôle de
 * contenu qu'on applique — celui qui refuse un mot de passe contenant l'identité
 * qu'il protège.
 *
 * PAS DE SECOND CHAMP DE CONFIRMATION. Il servait à attraper les fautes de
 * frappe à l'époque où l'on ne pouvait pas relire ce qu'on tapait ; aujourd'hui
 * le gestionnaire de mots de passe remplit les deux à l'identique, et quelqu'un
 * qui se trompe quand même a le chemin de réparation juste derrière lui — il
 * vient précisément de l'emprunter.
 */

const INITIAL: ResultatChangement = { statut: "inactif" };

export function FormulaireNouveauMotDePasse({ locale }: { readonly locale: string }) {
  const t = useTranslations("connexion");
  const tm = useTranslations("motDePasse");
  const ti = useTranslations("inscription");
  const [resultat, action] = useActionState(changerMotDePasse, INITIAL);

  const messageErreur =
    resultat.statut === "erreur"
      ? resultat.motif === "trop_court"
        ? ti("erreurMdpTropCourt")
        : resultat.motif === "trop_long"
          ? ti("erreurMdpTropLong")
          : resultat.motif === "contient_email"
            ? ti("erreurMdpContientEmail")
            : resultat.motif === "session"
              ? tm("erreurSession")
              : t("erreurIndisponible")
      : null;

  return (
    <form action={action} className="flex flex-col gap-4 md:gap-[18px]" noValidate>
      <input type="hidden" name="locale" value={locale} />

      <div>
        <label htmlFor="nouveau-mot-de-passe" className={CLASSE_LIBELLE + " mb-2"}>
          {tm("labelNouveau")}
        </label>
        <input
          id="nouveau-mot-de-passe"
          name="motDePasse"
          type="password"
          autoComplete="new-password"
          required
          autoFocus
          aria-invalid={messageErreur !== null}
          aria-describedby="aide-nouveau-mot-de-passe"
          className={CLASSE_CHAMP}
        />
        <p
          id="aide-nouveau-mot-de-passe"
          className="mt-2 font-body-sm text-[12px] leading-[18px] text-sourdine"
        >
          {ti("aideMotDePasse")}
        </p>
      </div>

      {messageErreur !== null ? (
        <MessageErreur id="erreur-nouveau-mot-de-passe" texte={messageErreur} />
      ) : null}

      <BoutonPrincipal libelle={tm("boutonEnregistrer")} libelleEnCours={tm("boutonEnCours")} />
    </form>
  );
}
