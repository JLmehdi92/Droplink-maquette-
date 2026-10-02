"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, Check, ChevronDown, CircleCheck, Copy, Mail, TriangleAlert } from "lucide-react";

/**
 * LE SIGNALEMENT, PRÉPARÉ DANS LA PAGE (refonte du 02/10/2026, décision n° 11 de Mehdi :
 * la maquette `signalement.html`).
 *
 * RIEN NE PART D'ICI. Le formulaire compose un message et le MONTRE — destinataire,
 * objet, corps — avec deux gestes : le copier, ou l'ouvrir dans la messagerie. C'est la
 * même mécanique qu'avant (un lien `mailto:`), rendue visible : un `mailto:` qui ne
 * s'ouvre pas (aucune messagerie configurée, poste partagé) laissait l'utilisateur
 * devant un bouton qui ne faisait rien. Annoncer un accusé de réception qui n'arrivera
 * jamais ferait recommencer un signalement, ou renoncer.
 *
 * LE MESSAGE PRÉPARÉ DISPARAÎT DÈS QU'UN CHAMP CHANGE : il affirmerait un contenu que
 * le formulaire ne porte plus, et c'est l'ancien texte qui partirait.
 *
 * LA VALIDATION EST CELLE DU NAVIGATEUR (`required`, `type="url"`, `type="email"`) :
 * aucun serveur ne reçoit ce formulaire, il n'y a donc pas d'autorité à doubler.
 */
const CATEGORIES = [
  ["droits", "signalement.cat_droits"],
  ["illicite", "signalement.cat_illicite"],
  ["donnees", "signalement.cat_donnees"],
  ["autre", "signalement.cat_autre"],
] as const;

export function FormulaireSignalement({ adresse }: { readonly adresse: string }) {
  const t = useTranslations("legal");

  const [lien, setLien] = useState("");
  const [categorie, setCategorie] = useState<(typeof CATEGORIES)[number][0]>("droits");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [pret, setPret] = useState<{ readonly sujet: string; readonly corps: string } | null>(null);
  const [copie, setCopie] = useState<"repos" | "copie" | "echec">("repos");

  const composer = (): { sujet: string; corps: string } => {
    const cle = CATEGORIES.find(([c]) => c === categorie)?.[1] ?? "signalement.cat_autre";
    const libelleCategorie = t(cle);
    const corps = [
      `${t("signalement.lien")} : ${lien}`,
      `${t("signalement.categorie")} : ${libelleCategorie}`,
      `${t("signalement.email")} : ${email}`,
      "",
      `${t("signalement.description")} :`,
      description,
    ].join("\n");
    return { sujet: `${t("signalementTitre")} — ${libelleCategorie}`, corps };
  };

  const copier = async (): Promise<void> => {
    if (pret === null) return;
    try {
      await navigator.clipboard.writeText(`${adresse}\n${pret.sujet}\n\n${pret.corps}`);
      setCopie("copie");
    } catch {
      // L'état « copié » n'est affiché qu'après succès : refusée, la copie se DIT.
      setCopie("echec");
    }
  };

  return (
    <form
      className="sig-form v4-carte"
      onSubmit={(evenement) => {
        evenement.preventDefault();
        setPret(composer());
        setCopie("repos");
      }}
    >
      <div className="sig-champ">
        <label htmlFor="lien">{t("signalement.lien")}</label>
        <input
          id="lien"
          name="lien"
          type="url"
          inputMode="url"
          required
          placeholder={t("signalement.lienExemple")}
          value={lien}
          onChange={(e) => {
            setLien(e.target.value);
            setPret(null);
          }}
        />
      </div>

      <div className="sig-champ">
        <label htmlFor="motif">{t("signalement.categorie")}</label>
        <span className="sig-liste">
          <select
            id="motif"
            name="motif"
            value={categorie}
            onChange={(e) => {
              const choisie = CATEGORIES.find(([c]) => c === e.target.value);
              if (choisie !== undefined) setCategorie(choisie[0]);
              setPret(null);
            }}
          >
            {CATEGORIES.map(([c, cle]) => (
              <option key={c} value={c}>
                {t(cle)}
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden="true" className="ic" />
        </span>
      </div>

      <div className="sig-champ">
        <label htmlFor="description">{t("signalement.description")}</label>
        <textarea
          id="description"
          name="description"
          required
          rows={5}
          placeholder={t("signalement.descriptionExemple")}
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            setPret(null);
          }}
        />
      </div>

      <div className="sig-champ">
        <label htmlFor="email">{t("signalement.email")}</label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder={t("signalement.emailExemple")}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setPret(null);
          }}
        />
      </div>

      <button className="bouton bouton--marque bouton--large" type="submit">
        {t("signalement.envoyer")}
        <ArrowRight aria-hidden="true" className="ic" />
      </button>
      <p className="sig-aide">{t("signalement.ouvreMessagerie")}</p>

      {/* L'ANNONCE EST COURTE, à part des contrôles : un `role="status"` autour du bloc
          entier faisait lire tout le corps du message. */}
      <p className="sr-only" role="status">
        {pret === null ? "" : t("signalement.pretTitre")}
      </p>
      <div>
        {pret === null ? null : (
          <div className="sig-pret">
            <p className="sig-pret__tete">
              <CircleCheck aria-hidden="true" className="ic" />
              <b>{t("signalement.pretTitre")}</b>
            </p>
            <dl>
              <div>
                <dt>{t("signalement.a")}</dt>
                <dd>
                  <span className="sig-copiable">{adresse}</span>
                </dd>
              </div>
              <div>
                <dt>{t("signalement.objet")}</dt>
                <dd>{pret.sujet}</dd>
              </div>
            </dl>
            <pre className="sig-pret__corps">{pret.corps}</pre>
            <div className="sig-pret__actions">
              <button type="button" className="bouton bouton--second" onClick={() => void copier()}>
                {copie === "copie" ? (
                  <Check aria-hidden="true" className="ic" />
                ) : copie === "echec" ? (
                  <TriangleAlert aria-hidden="true" className="ic" />
                ) : (
                  <Copy aria-hidden="true" className="ic" />
                )}
                {copie === "copie"
                  ? t("signalement.copie")
                  : copie === "echec"
                    ? t("signalement.copieRefusee")
                    : t("signalement.copier")}
              </button>
              <a
                className="bouton bouton--plein"
                href={`mailto:${adresse}?subject=${encodeURIComponent(pret.sujet)}&body=${encodeURIComponent(pret.corps)}`}
              >
                <Mail aria-hidden="true" className="ic" />
                {t("signalement.ouvrir")}
              </a>
            </div>
            <p className="sig-aide">{t("signalement.rienEnvoye")}</p>
          </div>
        )}
      </div>

      <p className="sig-directe">
        {t("signalement.adresseDirecte")}{" "}
        <a className="sig-copiable" href={`mailto:${adresse}`}>
          {adresse}
        </a>
      </p>
    </form>
  );
}
