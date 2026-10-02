"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { adresseTransmise } from "@/components/acces/bascule-acces";
import { sInscrire, type ResultatInscription } from "@/app/[locale]/connexion/actions";
import { useSuggestionAdresse } from "@/components/acces/suggestion-adresse";
import {
  BoutonPrincipalDs,
  ChampAcces,
  MessageErreurDs,
} from "@/components/acces-champs";
import {
  contientAdresse,
  emailValide,
  secouer,
  secouerInvalides,
  tropCourt,
  valeurEnvoyee,
} from "@/components/acces/validation-locale";

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

/**
 * `longueurMinimale` arrive du serveur (`LONGUEUR_MINIMALE`) plutôt qu'importée
 * ici : son module construit un schéma zod au chargement, et l'importer depuis un
 * composant client embarquait zod entier dans le bundle de `/inscription`.
 */
export function FormulaireInscription({
  locale,
  longueurMinimale,
}: {
  readonly locale: string;
  readonly longueurMinimale: number;
}) {
  const t = useTranslations("connexion");
  const ti = useTranslations("inscription");
  const [resultat, action] = useActionState(sInscrire, INITIAL);
  // L'adresse tapée sur l'autre page d'accès suit la bascule (maquette, `acces.js`).
  const [email, setEmail] = useState(adresseTransmise);
  const [motDePasse, setMotDePasse] = useState("");
  // Les refus de la saisie (maquette, `acces.js`) : un confort, le serveur décide.
  const [erreurEmail, setErreurEmail] = useState("");
  const [erreurMdp, setErreurMdp] = useState("");
  const formulaire = useRef<HTMLFormElement>(null);

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

  // La jauge compte vers la seule règle que le navigateur peut voir : la longueur.
  // Le serveur reste l'autorité (fuites, longueur maximale, adresse recopiée).
  const longueur = [...motDePasse].length;
  const assez = longueur >= longueurMinimale;

  return (
    <form
      ref={formulaire}
      action={action}
      className="formulaire v4-carte"
      noValidate
      onSubmit={(e) => {
        // On valide ce qui PART, pas l'état React (un remplissage automatique peut le taire).
        const f = e.currentTarget;
        const adresse = valeurEnvoyee(f, "email");
        const mdp = valeurEnvoyee(f, "motDePasse");
        const eEmail = emailValide(adresse) ? "" : t("erreurEmailInvalide");
        const eMdp = tropCourt(mdp, longueurMinimale)
          ? ti("erreurMdpTropCourt")
          : contientAdresse(mdp, adresse)
              ? ti("erreurMdpContientEmail")
              : "";
        setErreurEmail(eEmail);
        setErreurMdp(eMdp);
        if (eEmail === "" && eMdp === "") return;
        e.preventDefault();
        const fautifs = [
          eEmail !== "" ? "email-inscription" : null,
          eMdp !== "" ? "motDePasse-inscription" : null,
        ].filter((x): x is string => x !== null);
        fautifs.forEach((id) => secouer(f.querySelector(`#${id}`)?.closest(".champ-acces__boite")));
        f.querySelector<HTMLInputElement>(`#${fautifs[0] ?? "email-inscription"}`)?.focus();
      }}
    >
      <input type="hidden" name="locale" value={locale} />

      <ChampAcces
        id="email-inscription"
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
        invalide={emailEnCause}
        {...(emailEnCause ? { decritPar: "erreur-inscription" } : {})}
      >
        {suggestion !== null ? (
          <p className="champ-acces__suggestion" aria-live="polite">
            {t("suggestionPrefixe")}{" "}
            <button
              type="button"
              onClick={() => {
                setEmail(suggestion.adresse);
                document.getElementById("email-inscription")?.focus();
                setErreurEmail("");
              }}
            >
              {suggestion.adresse}
            </button>
            {t("suggestionSuffixe")}
          </p>
        ) : null}
      </ChampAcces>

      <ChampAcces
        id="motDePasse-inscription"
        nom="motDePasse"
        type="password"
        libelle={t("labelMotDePasse")}
        placeholder={ti("placeholderMotDePasse")}
        autoComplete="new-password"
        valeur={motDePasse}
        surChangement={(v) => {
          setMotDePasse(v);
          // Le refus de longueur s'efface dès que le minimum est atteint ; celui de
          // l'adresse recopiée, dès qu'elle n'y est plus.
          if (erreurMdp !== "" && !tropCourt(v, longueurMinimale) && !contientAdresse(v, email)) setErreurMdp("");
        }}
        surSortie={() => {
          if (contientAdresse(motDePasse, email)) setErreurMdp(ti("erreurMdpContientEmail"));
        }}
        erreurLocale={erreurMdp}
        libellesOeil={{ afficher: t("afficherMotDePasse"), masquer: t("masquerMotDePasse") }}
        invalide={motDePasseEnCause}
        decritPar={motDePasseEnCause ? "aide-mot-de-passe erreur-inscription" : "aide-mot-de-passe"}
      >
        <div
          className={"jauge-mdp" + (assez ? " est-ok" : "")}
          style={{ "--remplie": String(Math.min(1, longueur / longueurMinimale)) } as React.CSSProperties}
          aria-hidden="true"
        >
          <i />
        </div>
        {/* ⚠️ LE MINIMUM VIENT DE `LONGUEUR_MINIMALE`, jamais écrit ici : afficher
            un autre nombre promettrait un mot de passe que le serveur refuse. */}
        <p id="aide-mot-de-passe" className={"champ-acces__aide" + (assez ? " est-ok" : "")}>
          {ti.rich("compteurMotDePasse", {
            n: longueur,
            min: longueurMinimale,
            b: (morceau) => <span>{morceau}</span>,
          })}
        </p>
      </ChampAcces>

      {messageErreur !== null ? <MessageErreurDs id="erreur-inscription" texte={messageErreur} /> : null}

      <BoutonPrincipalDs libelle={ti("bouton")} libelleEnCours={ti("boutonEnCours")} />
    </form>
  );
}
