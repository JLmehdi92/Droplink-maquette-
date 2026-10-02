"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import {
  changerMotDePasse,
  type ResultatChangement,
} from "@/app/[locale]/nouveau-mot-de-passe/actions";
import { BoutonPrincipalDs, ChampAcces, MessageErreurDs } from "@/components/acces-champs";

/**
 * SAISIR LE NOUVEAU MOT DE PASSE — `ResetScreen` du kit `auth`, écrit le
 * 14/09/2026 avant ce formulaire.
 *
 * AUCUN CHAMP D'ADRESSE, et aucune adresse en entrée cachée non plus : elle est
 * lue DANS LA SESSION côté serveur. La faire voyager par le formulaire
 * permettrait d'en soumettre une autre, donc de contourner le seul contrôle de
 * contenu qu'on applique — celui qui refuse un mot de passe contenant l'identité
 * qu'il protège.
 *
 * PAS DE SECOND CHAMP DE CONFIRMATION : le gestionnaire de mots de passe remplit
 * les deux à l'identique, et le champ du kit se dévoile d'un geste.
 */

const INITIAL: ResultatChangement = { statut: "inactif" };

export function FormulaireNouveauMotDePasse({
  locale,
  longueurMinimale,
}: {
  readonly locale: string;
  /** Arrive du serveur (`LONGUEUR_MINIMALE`) : afficher un autre nombre promettrait un mot de passe refusé. */
  readonly longueurMinimale: number;
}) {
  const t = useTranslations("connexion");
  const tm = useTranslations("motDePasse");
  const ti = useTranslations("inscription");
  const [resultat, action] = useActionState(changerMotDePasse, INITIAL);
  const [motDePasse, setMotDePasse] = useState("");

  const messageErreur =
    resultat.statut === "erreur"
      ? resultat.motif === "trop_court"
        ? ti("erreurMdpTropCourt")
        : resultat.motif === "trop_long"
          ? ti("erreurMdpTropLong")
          : resultat.motif === "contient_email"
            ? ti("erreurMdpContientEmail")
            : resultat.motif === "fuite"
              ? ti("erreurMdpFuite")
              : resultat.motif === "session"
                ? tm("erreurSession")
                : t("erreurIndisponible")
      : null;

  const longueur = [...motDePasse].length;
  const assez = longueur >= longueurMinimale;

  return (
    <form action={action} className="formulaire" noValidate>
      <input type="hidden" name="locale" value={locale} />

      {/* LA JAUGE DE LA MAQUETTE, comme à l'inscription : elle compte vers la seule règle
          que le navigateur peut voir, la longueur. Le serveur reste l'autorité. */}
      <ChampAcces
        id="nouveau-mot-de-passe"
        nom="motDePasse"
        type="password"
        libelle={tm("labelNouveau")}
        placeholder={ti("placeholderMotDePasse")}
        autoComplete="new-password"
        valeur={motDePasse}
        surChangement={setMotDePasse}
        libellesOeil={{ afficher: t("afficherMotDePasse"), masquer: t("masquerMotDePasse") }}
        invalide={messageErreur !== null}
        decritPar={
          messageErreur !== null ? "aide-nouveau-mot-de-passe erreur-nouveau-mot-de-passe" : "aide-nouveau-mot-de-passe"
        }
      >
        <div
          className={"jauge-mdp" + (assez ? " est-ok" : "")}
          style={{ "--remplie": String(Math.min(1, longueur / longueurMinimale)) } as React.CSSProperties}
          aria-hidden="true"
        >
          <i />
        </div>
        <p id="aide-nouveau-mot-de-passe" className={"champ-acces__aide" + (assez ? " est-ok" : "")}>
          {ti.rich("compteurMotDePasse", {
            n: longueur,
            min: longueurMinimale,
            b: (morceau) => <span>{morceau}</span>,
          })}
        </p>
      </ChampAcces>

      {messageErreur !== null ? (
        <MessageErreurDs id="erreur-nouveau-mot-de-passe" texte={messageErreur} />
      ) : null}

      <BoutonPrincipalDs libelle={tm("boutonEnregistrer")} libelleEnCours={tm("boutonEnCours")} />
    </form>
  );
}
