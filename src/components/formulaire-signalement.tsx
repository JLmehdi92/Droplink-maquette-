"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, Flag, Link as IconeLien, Mail } from "lucide-react";
import { BoutonPrincipalDs, CLASSE_LIBELLE_DS, ChampAcces } from "@/components/acces-champs";

/**
 * LE FORMULAIRE DE SIGNALEMENT — la carte de droite de `legal/signalement.html`,
 * dans le vocabulaire des champs d'accès : boîtes de 56 au rayon 16, icône à
 * gauche, bouton pleine largeur au DÉGRADÉ DE MARQUE, la seule action
 * principale de l'écran.
 *
 * ⚠️ ÉCART ASSUMÉ, ET LA RAISON COMPTE. Un formulaire qui s'envoie tout seul et
 * promet un accusé de réception supposerait un point de réception. Nous n'en
 * avons AUCUN : pas de route, pas de table, pas d'envoi d'email. Publier ce
 * formulaire branché sur rien produirait la pire défaillance possible pour cette
 * page précise : un signalement que son auteur croit déposé, que personne ne
 * reçoit, et dont l'absence de réponse se lira comme un refus. C'est aussi la
 * capacité technique qui fonde notre statut d'hébergeur.
 *
 * Le bouton compose donc un message dans la messagerie du visiteur, avec tout le
 * contenu déjà rempli. Rien n'est affirmé qui ne se soit produit : le libellé dit
 * « préparer », la phrase sous le bouton dit que rien ne part tant qu'on ne
 * l'envoie pas soi-même, et l'adresse reste visible en clair pour qui n'a pas de
 * client de messagerie configuré.
 */

/*
 * LES CLÉS SONT ÉCRITES EN TOUTES LETTRES : l'inventaire des chaînes mortes lit
 * les appels du code, et une clé composée à l'exécution lui échappe.
 */
const CATEGORIES = [
  ["droits", "signalement.cat_droits"],
  ["illicite", "signalement.cat_illicite"],
  ["donnees", "signalement.cat_donnees"],
  ["autre", "signalement.cat_autre"],
] as const;

/** La boîte d'un champ d'accès, pour les deux contrôles que `ChampAcces` ne rend pas. */
const BOITE =
  "rounded-ds-card border border-ds-filet-appuye bg-ds-surface-carte transition-colors " +
  "focus-within:border-ds-filet-focus focus-within:shadow-[var(--anneau-ds-focus)]";

export function FormulaireSignalement({ adresse }: { readonly adresse: string }) {
  const t = useTranslations("legal");

  const [lien, setLien] = useState("");
  const [categorie, setCategorie] = useState<(typeof CATEGORIES)[number][0]>("droits");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");

  const composer = (): string => {
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

    const sujet = `${t("signalementTitre")} — ${libelleCategorie}`;
    return `mailto:${adresse}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`;
  };

  return (
    <form
      className="flex flex-col gap-5 rounded-ds-3xl bg-ds-surface-carte p-6 shadow-ds-lg md:px-10 md:py-9"
      onSubmit={(evenement) => {
        evenement.preventDefault();
        window.location.href = composer();
      }}
    >
      <ChampAcces
        id="lien"
        nom="lien"
        type="url"
        libelle={t("signalement.lien")}
        icone={IconeLien}
        placeholder={t("signalement.lienExemple")}
        valeur={lien}
        surChangement={setLien}
      />

      <label htmlFor="motif" className="block">
        <span className={`mb-2 block ${CLASSE_LIBELLE_DS}`}>{t("signalement.categorie")}</span>
        <span className={`flex h-14 items-center gap-3 px-[18px] ${BOITE}`}>
          <Flag aria-hidden="true" size={18} strokeWidth={1.8} className="shrink-0 text-ds-texte-sourdine" />
          <select
            id="motif"
            name="motif"
            value={categorie}
            onChange={(e) => {
              const choisie = CATEGORIES.find(([c]) => c === e.target.value);
              if (choisie !== undefined) setCategorie(choisie[0]);
            }}
            className="h-full min-w-0 flex-1 cursor-pointer appearance-none border-none bg-transparent text-[15px] text-ds-texte-fort outline-none"
          >
            {CATEGORIES.map(([c, cle]) => (
              <option key={c} value={c}>
                {t(cle)}
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden="true" size={18} strokeWidth={1.8} className="shrink-0 text-ds-texte-sourdine" />
        </span>
      </label>

      <label htmlFor="description" className="block">
        <span className={`mb-2 block ${CLASSE_LIBELLE_DS}`}>{t("signalement.description")}</span>
        <textarea
          id="description"
          name="description"
          required
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("signalement.descriptionExemple")}
          className={`block h-[132px] w-full resize-none px-[18px] py-[15px] text-[15px] leading-[1.55] text-ds-texte-fort outline-none placeholder:text-ds-texte-corps ${BOITE}`}
        />
      </label>

      <ChampAcces
        id="email"
        nom="email"
        type="email"
        libelle={t("signalement.email")}
        icone={Mail}
        placeholder={t("signalement.emailExemple")}
        autoComplete="email"
        valeur={email}
        surChangement={setEmail}
      />

      <div className="mt-1">
        <BoutonPrincipalDs libelle={t("signalement.envoyer")} libelleEnCours={t("signalement.envoyer")} />
      </div>

      {/* CE QUE LE BOUTON FAIT VRAIMENT, dit sous le bouton. Annoncer un accusé de
          réception qui n'arrivera jamais est précisément ce qui ferait
          recommencer un signalement — ou renoncer. */}
      <div className="flex flex-col gap-1.5 text-center">
        <p className="text-[12.5px] leading-[1.55] text-ds-texte-sourdine">{t("signalement.ouvreMessagerie")}</p>
        <p className="text-[12.5px] leading-[1.55] text-ds-texte-sourdine">
          {t("signalement.adresseDirecte")}{" "}
          <a href={`mailto:${adresse}`} className="font-semibold text-ds-texte-lien hover:text-ds-accent-encre">
            {adresse}
          </a>
        </p>
      </div>
    </form>
  );
}
