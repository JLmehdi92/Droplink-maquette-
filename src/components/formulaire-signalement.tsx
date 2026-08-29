"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Icone } from "./icone";

/**
 * LE FORMULAIRE DE SIGNALEMENT, porté sur ses deux planches.
 *
 * ⚠️ ÉCART ASSUMÉ, ET LA RAISON COMPTE. La planche montre un formulaire qui
 * s'envoie tout seul et promet un accusé de réception. Nous n'avons AUCUN point
 * de réception : pas de route, pas de table, pas d'envoi d'email — Resend n'est
 * même pas installé. Publier le même formulaire branché sur rien produirait la
 * pire défaillance possible pour cette page précise : un signalement que son
 * auteur croit déposé, que personne ne reçoit, et dont l'absence de réponse se
 * lira comme un refus. C'est aussi la capacité technique qui fonde notre statut
 * d'hébergeur.
 *
 * Le bouton compose donc un message dans la messagerie du visiteur, avec tout le
 * contenu déjà rempli. Rien n'est affirmé qui ne se soit produit : le libellé dit
 * « préparer », la phrase sous le bouton dit que rien ne part tant qu'on ne
 * l'envoie pas soi-même, et l'adresse reste visible en clair pour qui n'a pas de
 * client de messagerie configuré. La promesse d'accusé de réception de la
 * planche est remplacée par cette phrase-là, pas supprimée en silence.
 *
 * LA GÉOMÉTRIE, ELLE, EST CELLE DE LA PLANCHE : carte #fafafc rayon 22 padding
 * 34 au bureau (20 et 22 au téléphone), champs de 50 px au rayon 13, libellés de
 * 13 px en gras, et le bouton pleine largeur au DÉGRADÉ DE MARQUE — c'est une
 * surface DropLink, la seule action principale de l'écran.
 */
export function FormulaireSignalement({ adresse }: { readonly adresse: string }) {
  const t = useTranslations("legal");

  const [lien, setLien] = useState("");
  const [categorie, setCategorie] = useState("droits");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");

  const CATEGORIES = ["droits", "illicite", "donnees", "autre"] as const;

  const composer = (): string => {
    const libelleCategorie = t(`signalement.cat_${categorie}`);

    const corps = [
      `${t("signalement.lien")} : ${lien}`,
      `${t("signalement.categorie")} : ${libelleCategorie}`,
      `${t("signalement.email")} : ${email}`,
      "",
      `${t("signalement.description")} :`,
      description,
    ].join("\n");

    const sujet = `${t("signalementTitre")} — ${libelleCategorie}`;
    return `mailto:${adresse}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`;
  };

  const libelle = "mb-2 block font-headline-md text-[13px] leading-4 font-bold text-ardoise";
  const champ =
    "w-full rounded-[13px] border border-filet-controle bg-[#fafafc] px-[15px] font-body-md text-[15px] text-on-surface placeholder:text-gris-inactif";
  const hauteur = "h-[50px]";

  return (
    <form
      className="self-start rounded-[20px] border border-outline-variant bg-[#fafafc] p-[22px] md:rounded-[22px] md:p-[34px]"
      onSubmit={(evenement) => {
        evenement.preventDefault();
        window.location.href = composer();
      }}
    >
      <label className={libelle} htmlFor="lien">
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
        className={`${champ} ${hauteur}`}
      />

      <div className="h-5" />

      <label className={libelle} htmlFor="motif">
        {t("signalement.categorie")}
      </label>
      <select
        id="motif"
        name="motif"
        value={categorie}
        onChange={(e) => setCategorie(e.target.value)}
        className={`${champ} ${hauteur} cursor-pointer`}
      >
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {t(`signalement.cat_${c}`)}
          </option>
        ))}
      </select>

      <div className="h-5" />

      <label className={libelle} htmlFor="description">
        {t("signalement.description")}
      </label>
      <textarea
        id="description"
        name="description"
        required
        rows={4}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={t("signalement.descriptionExemple")}
        className={`${champ} h-28 resize-none py-[13px] leading-[23px] md:h-32`}
      />

      <div className="h-5" />

      <label className={libelle} htmlFor="email">
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
        className={`${champ} ${hauteur}`}
      />

      <div className="h-6" />

      <button
        type="submit"
        className="inline-flex min-h-[52px] w-full items-center justify-center gap-2.5 degrade-marque rounded-[13px] font-headline-md text-[15px] font-bold text-white shadow-[0_10px_24px_-10px_rgba(124,92,245,0.6)] transition-opacity hover:opacity-95"
      >
        {t("signalement.envoyer")}
        <Icone nom="arrow_forward" className="text-[15px]" />
      </button>

      {/* CE QUE LE BOUTON FAIT VRAIMENT, dit sous le bouton. La planche promet
          ici un accusé de réception ; nous n'en envoyons aucun, et annoncer un
          accusé qui n'arrivera jamais est précisément ce qui ferait recommencer
          un signalement — ou renoncer. */}
      <p className="mt-3.5 text-center font-body-sm text-[12px] leading-[19px] text-sourdine">
        {t("signalement.ouvreMessagerie")}
      </p>
      <p className="mt-1.5 text-center font-body-sm text-[12px] leading-[19px] text-sourdine">
        {t("signalement.adresseDirecte")}{" "}
        <a href={`mailto:${adresse}`} className="font-semibold text-violet">
          {adresse}
        </a>
      </p>
    </form>
  );
}
