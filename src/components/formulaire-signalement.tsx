"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Icone } from "./icone";

/**
 * Formulaire de signalement, porté sur la maquette
 * `droplink_signaler_un_probl_me_final_harmonization`.
 *
 * ÉCART ASSUMÉ, ET LA RAISON COMPTE : la maquette montre un formulaire qui
 * s'envoie tout seul. Nous n'avons aucun point de réception — pas de route, pas
 * de table, pas d'envoi vérifié. Publier le même formulaire branché sur rien
 * produirait la pire défaillance possible pour cette page précise : un
 * signalement que son auteur croit déposé, que personne ne reçoit, et dont
 * l'absence de réponse se lira comme un refus. C'est aussi la capacité
 * technique qui fonde notre statut d'hébergeur.
 *
 * Le bouton compose donc un message dans la messagerie du visiteur, avec tout
 * le contenu déjà rempli. Rien n'est affirmé qui ne se soit produit : la page ne
 * dit jamais « envoyé », elle dit qu'elle ouvre la messagerie — et l'adresse
 * reste visible en clair, pour qui n'a pas de client de messagerie configuré.
 *
 * La zone de dépôt de fichiers de la maquette garde sa géométrie mais pas sa
 * fonction : un `mailto:` ne peut pas porter de pièce jointe, et une zone qui
 * accepterait des fichiers pour les perdre serait le même mensonge.
 */
export function FormulaireSignalement({ adresse }: { readonly adresse: string }) {
  const t = useTranslations("legal");

  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [lien, setLien] = useState("");
  const [categorie, setCategorie] = useState("");
  const [description, setDescription] = useState("");

  const CATEGORIES = ["illicite", "droits", "donnees", "securite", "autre"] as const;

  const composer = (): string => {
    const libelleCategorie =
      categorie === "" ? t("signalement.categorieDefaut") : t(`signalement.cat_${categorie}`);

    const corps = [
      `${t("signalement.nom")} : ${nom}`,
      `${t("signalement.email")} : ${email}`,
      `${t("signalement.lien")} : ${lien}`,
      `${t("signalement.categorie")} : ${libelleCategorie}`,
      "",
      `${t("signalement.description")} :`,
      description,
    ].join("\n");

    const sujet = `${t("signalementTitre")} — ${libelleCategorie}`;
    return `mailto:${adresse}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`;
  };

  const champ =
    "champ-app w-full rounded-lg border border-outline-variant px-4 py-3 font-body-md text-body-md text-on-surface placeholder:text-outline";

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(evenement) => {
        evenement.preventDefault();
        window.location.href = composer();
      }}
    >
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label className="font-label-sm text-label-sm text-on-surface" htmlFor="nom">
            {t("signalement.nom")}
          </label>
          <input
            id="nom"
            name="nom"
            type="text"
            required
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder={t("signalement.nomExemple")}
            className={champ}
          />
        </div>
        <div className="flex flex-col gap-2">
          <label className="font-label-sm text-label-sm text-on-surface" htmlFor="email">
            {t("signalement.email")}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("signalement.emailExemple")}
            className={champ}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="font-label-sm text-label-sm text-on-surface" htmlFor="lien">
          {t("signalement.lien")}
        </label>
        <input
          id="lien"
          name="lien"
          type="url"
          required
          value={lien}
          onChange={(e) => setLien(e.target.value)}
          placeholder={t("signalement.lienExemple")}
          className={champ}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="font-label-sm text-label-sm text-on-surface" htmlFor="categorie">
          {t("signalement.categorie")}
        </label>
        <div className="relative">
          <select
            id="categorie"
            name="categorie"
            required
            value={categorie}
            onChange={(e) => setCategorie(e.target.value)}
            className={`${champ} cursor-pointer appearance-none`}
          >
            <option value="" disabled>
              {t("signalement.categorieDefaut")}
            </option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`signalement.cat_${c}`)}
              </option>
            ))}
          </select>
          <Icone
            nom="expand_more"
            className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-[24px] text-outline"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="font-label-sm text-label-sm text-on-surface" htmlFor="description">
          {t("signalement.description")}
        </label>
        <textarea
          id="description"
          name="description"
          rows={5}
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("signalement.descriptionExemple")}
          className={`${champ} resize-none`}
        />
      </div>

      <div className="mt-2 flex flex-col gap-2">
        <span className="font-label-sm text-label-sm text-on-surface">
          {t("signalement.piecesTitre")}
        </span>
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-outline-variant bg-surface-container-low px-6 py-10">
          <span className="mb-4 rounded-full bg-surface p-4 shadow-sm text-[var(--accent-texte)]">
            <Icone nom="attach_file" className="text-[32px]" />
          </span>
          <p className="text-center font-body-sm text-body-sm text-on-surface-variant">
            {t("signalement.piecesTexte")}
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-col items-end gap-3">
        <button
          type="submit"
          className="flex items-center gap-2 rounded-lg bg-[var(--accent-remplissage)] px-8 py-3.5 font-label-md text-label-md text-[var(--accent-sur-remplissage)] shadow-md transition-all duration-200 hover:shadow-lg active:scale-[0.98]"
        >
          {t("signalement.envoyer")}
          <Icone nom="send" className="text-[18px]" />
        </button>
        <p className="text-right font-body-sm text-body-sm text-on-surface-variant">
          {t("signalement.ouvreMessagerie")}
        </p>
      </div>
    </form>
  );
}
