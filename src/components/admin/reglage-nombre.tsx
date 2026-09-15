"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  enregistrerParametre,
  type EtatParametre,
} from "@/app/[locale]/admin/parametres/actions";

/**
 * UN SEUIL MODIFIABLE — un envoi par réglage, jamais un envoi global.
 *
 * Un formulaire unique réécrirait TOUS les seuils à chaque envoi, y compris ceux
 * qu'on n'a pas touchés : chacun repartirait avec sa trace, son auteur et sa
 * date. Le jour où l'on cherche qui a abaissé un seuil, on trouverait dix
 * modifications qui n'en sont pas.
 *
 * ⚠️ LE BOUTON N'APPARAÎT QU'APRÈS UNE FRAPPE, et c'est un écart assumé avec la
 * planche, qui ne dessine que le champ. Au repos la rangée lui est donc
 * identique. Mais un champ qui enregistre tout seul à la sortie du focus est une
 * mutation sans geste : sur l'écran qui porte le plafond capable de REFUSER une
 * écriture à un vendeur, la décision doit être un clic, et ce clic doit dire
 * ensuite si la base a accepté.
 *
 * ⚠️ L'ACTION EST APPELÉE DIRECTEMENT, et l'écran redessine la valeur que le
 * SERVEUR A RELUE après l'écriture. Les mesures qui l'imposent sont dans
 * `reglage-interrupteur.tsx` : `useActionState`, `router.refresh()` et la
 * transition écrivaient tous les trois en base sans que l'écran bouge, ce qui
 * lui faisait affirmer un état que la base n'avait plus.
 */

const INITIAL: EtatParametre = { statut: "inactif" };

export interface ReglageVu {
  readonly cle: string;
  readonly valeur: number;
  readonly defaut: number;
  readonly min: number;
  readonly max: number;
  readonly ecrit: boolean;
  readonly origine: string;
}

export function ReglageNombre({ reglage }: { reglage: ReglageVu }) {
  const t = useTranslations("admin.parametres");
  const [etat, setEtat] = useState<EtatParametre>(INITIAL);
  const [modifie, setModifie] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const champRef = useRef<HTMLInputElement>(null);

  const champ = `parametre-${reglage.cle}`;

  // CE QUE L'ÉCRAN DESSINE : la valeur relue en base si l'on vient d'écrire,
  // sinon celle du rendu serveur. Jamais celle qu'on a saisie.
  const apres = etat.statut === "ok" ? etat.apres : null;
  const ecrit = apres === null ? reglage.ecrit : apres.ecrit;
  const origine = apres === null ? reglage.origine : apres.origine;

  const enregistrer = async (): Promise<void> => {
    const saisie = champRef.current?.value ?? "";
    setEnCours(true);
    const donnees = new FormData();
    donnees.set("cle", reglage.cle);
    donnees.set("valeur", saisie);

    const resultat = await enregistrerParametre(INITIAL, donnees);
    setEtat(resultat);
    setEnCours(false);
    // LE BOUTON DISPARAÎT PARCE QUE LA VALEUR EST DÉSORMAIS CELLE DU SERVEUR,
    // pas parce qu'on a cliqué : sur un échec il reste, et la saisie avec lui.
    if (resultat.statut === "ok") setModifie(false);
  };

  return (
    <div className="border-t border-ds-filet py-4">
      <div className="flex items-center justify-between gap-6">
        <div className="min-w-0">
          <label
            htmlFor={champ}
            className="block text-[14px] leading-[18px] font-semibold text-ds-texte-fort"
          >
            {t(`cles.${reglage.cle}.titre`)}
          </label>
          <p className="mt-[2px] text-[12px] leading-[15px] text-ds-texte-sourdine">
            {t(`cles.${reglage.cle}.aide`)}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* ⚠️ LA CLÉ CHANGE AVEC LA VALEUR RELUE, ce qui remonte le champ. Sans
              cela, le champ garderait ce qui a été SAISI — et si quelqu'un
              d'autre a écrit entre-temps, l'écran afficherait un nombre que la
              base ne porte pas, juste après avoir dit « enregistré ». */}
          <input
            key={apres === null ? "serveur" : String(apres.valeur)}
            ref={champRef}
            id={champ}
            name="valeur"
            type="number"
            inputMode="numeric"
            required
            min={reglage.min}
            max={reglage.max}
            step={1}
            defaultValue={apres === null ? reglage.valeur : apres.valeur}
            onChange={() => setModifie(true)}
            className="h-[42px] min-h-11 w-[120px] rounded-ds-control border border-ds-filet-appuye bg-[#fafafc] px-[13px] text-right font-mono text-[14px] text-ds-texte-fort md:min-h-0"
          />
          {modifie ? (
            <button
              type="button"
              disabled={enCours}
              onClick={() => void enregistrer()}
              className="h-12 shrink-0 rounded-ds-card bg-ds-accent px-[18px] text-[14px] font-semibold text-ds-texte-sur-marque transition-colors hover:bg-ds-accent-survol disabled:opacity-60"
            >
              {enCours ? t("enCours") : t("enregistrer")}
            </button>
          ) : null}
        </div>
      </div>

      {/* LES BORNES SONT ÉCRITES EN CLAIR, mais seulement pendant qu'on modifie :
          `min`/`max` sont une aide du navigateur, jamais la règle — elle est
          refaite côté serveur. Les afficher évite de découvrir la limite par un
          refus ; les afficher en permanence noierait la prose de la planche. */}
      {modifie ? (
        <p className="mt-[6px] text-[12px] leading-[15px] text-ds-texte-sourdine">
          {t("bornes", { min: reglage.min, max: reglage.max, defaut: reglage.defaut })}
        </p>
      ) : null}

      {/* TROIS ÉTATS, PAS DEUX : « jamais décidé » n'est pas « décidé à cette
          valeur ». Un défaut subi et un défaut choisi portent le même chiffre et
          n'appellent pas la même décision. Rien ne s'affiche tant que personne
          n'a décidé — c'est l'état du produit neuf, et celui de la planche. */}
      {ecrit ? (
        <p className="mt-[6px] text-[12px] leading-[15px] text-ds-texte-sourdine">
          {origine}
        </p>
      ) : null}

      <p aria-live="polite" className="text-[12px] leading-[16px] empty:hidden">
        {etat.statut === "ok" ? (
          <span className="mt-[6px] block text-ds-texte-fort">{t("fait")}</span>
        ) : etat.statut === "erreur" ? (
          <span className="mt-[6px] block text-ds-erreur-encre">{t(`erreur.${etat.motif}`)}</span>
        ) : null}
      </p>
    </div>
  );
}
