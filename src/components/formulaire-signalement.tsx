"use client";

import { useEffect, useRef, useState } from "react";
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
 * LA VALIDATION EST CELLE DE LA MAQUETTE (`public.js`) : une adresse en `https://`, une
 * description d'au moins dix caractères, une adresse e-mail ; chaque refus est dit sous
 * son champ, le focus va au premier. Aucun serveur ne reçoit ce formulaire : il n'y a
 * pas d'autorité à doubler, seulement un message à ne pas préparer à moitié.
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
  const [copie, setCopie] = useState<"repos" | "copie" | "selection">("repos");
  // Les refus de la saisie (maquette, `public.js`) : un confort, rien n'est envoyé d'ici.
  const [erreurs, setErreurs] = useState<Partial<Record<"lien" | "description" | "email", string>>>({});
  const blocPret = useRef<HTMLDivElement>(null);
  const corpsPret = useRef<HTMLPreElement>(null);

  const regles = {
    lien: (v: string) => (/^https?:\/\/\S+\.\S+/.test(v.trim()) ? "" : t("signalement.erreurLien")),
    description: (v: string) => (v.trim().length >= 10 ? "" : t("signalement.erreurDescription")),
    email: (v: string) => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? "" : t("signalement.erreurEmail")),
  };
  // Un champ refusé se réévalue à chaque frappe, et son refus s'efface dès qu'il est juste.
  const reevaluer = (champ: keyof typeof regles, v: string) => {
    if (erreurs[champ]) setErreurs((e) => ({ ...e, [champ]: regles[champ](v) }));
  };

  // Le bloc « prêt » entre (320 ms) et vient dans le champ de vision (maquette, `public.js`).
  useEffect(() => {
    const bloc = blocPret.current;
    if (pret === null || bloc === null) return;
    const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduit) {
      bloc.animate(
        [
          { opacity: 0, transform: "translateY(8px)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 320, easing: "cubic-bezier(.23,1,.32,1)" },
      );
    }
    bloc.scrollIntoView({ block: "nearest", behavior: reduit ? "auto" : "smooth" });
  }, [pret]);

  // « Message copié » revient à « Copier le message » après 2,2 s (maquette).
  useEffect(() => {
    if (copie === "repos") return;
    const minuteur = window.setTimeout(() => setCopie("repos"), 2200);
    return () => window.clearTimeout(minuteur);
  }, [copie]);

  const composer = (): { sujet: string; corps: string } => {
    const cle = CATEGORIES.find(([c]) => c === categorie)?.[1] ?? "signalement.cat_autre";
    const libelleCategorie = t(cle);
    const corps = [
      `${t("signalement.lien")} : ${lien.trim()}`,
      `${t("signalement.categorie")} : ${libelleCategorie}`,
      `${t("signalement.email")} : ${email.trim()}`,
      "",
      `${t("signalement.description")} :`,
      description.trim(),
    ].join("\n");
    return { sujet: t("signalement.sujet", { titre: t("signalementTitre"), categorie: libelleCategorie }), corps };
  };

  const copier = async (): Promise<void> => {
    if (pret === null) return;
    try {
      await navigator.clipboard.writeText(
        `${t("signalement.a")} : ${adresse}\n${t("signalement.objet")} : ${pret.sujet}\n\n${pret.corps}`,
      );
      setCopie("copie");
    } catch {
      // L'état « copié » n'est affiché qu'après succès. Refusée, la copie se DIT, et le
      // message est sélectionné pour être copié à la main (maquette, `public.js`).
      const corps = corpsPret.current;
      const selection = window.getSelection();
      if (corps !== null && selection !== null) {
        const plage = document.createRange();
        plage.selectNodeContents(corps);
        selection.removeAllRanges();
        selection.addRange(plage);
      }
      setCopie("selection");
    }
  };

  return (
    <form
      className="sig-form v4-carte"
      noValidate
      onSubmit={(evenement) => {
        evenement.preventDefault();
        const refus = {
          lien: regles.lien(lien),
          description: regles.description(description),
          email: regles.email(email),
        };
        setErreurs(refus);
        const premier = (["lien", "description", "email"] as const).find((k) => refus[k] !== "");
        if (premier !== undefined) {
          evenement.currentTarget.querySelector<HTMLElement>(`#${premier}`)?.focus();
          return;
        }
        setPret(composer());
        setCopie("repos");
      }}
    >
      <div className={"sig-champ" + (erreurs.lien ? " est-invalide" : "")}>
        <label htmlFor="lien">{t("signalement.lien")}</label>
        <input
          id="lien"
          name="lien"
          type="url"
          inputMode="url"
          required
          placeholder={t("signalement.lienExemple")}
          value={lien}
          aria-invalid={erreurs.lien ? true : undefined}
          aria-describedby={erreurs.lien ? "lien-erreur" : undefined}
          onChange={(e) => {
            setLien(e.target.value);
            reevaluer("lien", e.target.value);
            setPret(null);
          }}
        />
        {erreurs.lien ? (
          <p className="sig-erreur" id="lien-erreur" role="alert">
            {erreurs.lien}
          </p>
        ) : null}
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

      <div className={"sig-champ" + (erreurs.description ? " est-invalide" : "")}>
        <label htmlFor="description">{t("signalement.description")}</label>
        <textarea
          id="description"
          name="description"
          required
          rows={5}
          placeholder={t("signalement.descriptionExemple")}
          value={description}
          aria-invalid={erreurs.description ? true : undefined}
          aria-describedby={erreurs.description ? "description-erreur" : undefined}
          onChange={(e) => {
            setDescription(e.target.value);
            reevaluer("description", e.target.value);
            setPret(null);
          }}
        />
        {erreurs.description ? (
          <p className="sig-erreur" id="description-erreur" role="alert">
            {erreurs.description}
          </p>
        ) : null}
      </div>

      <div className={"sig-champ" + (erreurs.email ? " est-invalide" : "")}>
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
          aria-invalid={erreurs.email ? true : undefined}
          aria-describedby={erreurs.email ? "email-erreur" : undefined}
          onChange={(e) => {
            setEmail(e.target.value);
            reevaluer("email", e.target.value);
            setPret(null);
          }}
        />
        {erreurs.email ? (
          <p className="sig-erreur" id="email-erreur" role="alert">
            {erreurs.email}
          </p>
        ) : null}
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
          <div className="sig-pret" ref={blocPret}>
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
            <pre className="sig-pret__corps" ref={corpsPret}>{pret.corps}</pre>
            <div className="sig-pret__actions">
              <button type="button" className="bouton bouton--second" onClick={() => void copier()}>
                {copie === "copie" ? (
                  <Check aria-hidden="true" className="ic" />
                ) : copie === "selection" ? (
                  <TriangleAlert aria-hidden="true" className="ic" />
                ) : (
                  <Copy aria-hidden="true" className="ic" />
                )}
                {copie === "copie"
                  ? t("signalement.copie")
                  : copie === "selection"
                    ? t("signalement.copieSelection")
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
