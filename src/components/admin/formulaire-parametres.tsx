"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import {
  enregistrerParametre,
  type EtatParametre,
} from "@/app/[locale]/admin/parametres/actions";

/**
 * UN FORMULAIRE PAR PARAMÈTRE, jamais un formulaire global.
 *
 * Un seul formulaire réécrirait TOUS les seuils à chaque envoi, y compris ceux
 * qu'on n'a pas touchés : chacun repartirait avec une trace, un auteur et une
 * date. Le journal deviendrait illisible — et le jour où l'on cherche qui a
 * abaissé un seuil, on trouverait dix modifications qui n'en sont pas.
 *
 * L'INTITULÉ DIT CE QUE LE SEUIL DÉCLENCHE, pas ce qu'il vaut. « Au-delà, le
 * compte est signalé » se relit dans six mois ; « seuil de colis » ne se relit
 * pas, il se devine.
 */

const INITIAL: EtatParametre = { statut: "inactif" };

function Bouton({ libelle, enCours }: { libelle: string; enCours: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-[44px] rounded-lg bg-primary px-4 font-label-md text-label-md text-on-primary disabled:opacity-60"
    >
      {pending ? enCours : libelle}
    </button>
  );
}

export interface ParametreVu {
  readonly cle: string;
  readonly valeur: number;
  readonly defaut: number;
  readonly min: number;
  readonly max: number;
  readonly ecrit: boolean;
  readonly origine: string;
}

export function FormulaireParametre({ parametre }: { parametre: ParametreVu }) {
  const t = useTranslations("admin.parametres");
  const [etat, action] = useActionState(enregistrerParametre, INITIAL);

  const champ = `parametre-${parametre.cle}`;

  return (
    <form
      action={action}
      className="rounded-lg border border-outline-variant bg-surface-container-lowest p-4"
    >
      <input type="hidden" name="cle" value={parametre.cle} />

      <label htmlFor={champ} className="font-label-md text-label-md text-on-surface">
        {t(`cles.${parametre.cle}.titre`)}
      </label>
      <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
        {t(`cles.${parametre.cle}.aide`)}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          id={champ}
          name="valeur"
          type="number"
          inputMode="numeric"
          required
          min={parametre.min}
          max={parametre.max}
          step={1}
          defaultValue={parametre.valeur}
          className="min-h-[44px] w-32 rounded-lg border border-outline bg-surface px-3 font-body-md text-body-md text-on-surface"
        />
        <Bouton libelle={t("enregistrer")} enCours={t("enCours")} />
      </div>

      {/* LES BORNES SONT ÉCRITES EN CLAIR. L'attribut `min`/`max` est une aide
          du navigateur, pas une règle : elle est refaite côté serveur. Les
          afficher évite de faire découvrir la limite par un refus. */}
      <p className="mt-2 font-body-sm text-body-sm text-on-surface-variant">
        {t("bornes", { min: parametre.min, max: parametre.max, defaut: parametre.defaut })}
      </p>

      {/* TROIS ÉTATS, PAS DEUX : « jamais décidé » n'est pas « décidé à cette
          valeur ». Un défaut subi et un défaut choisi portent le même chiffre et
          n'appellent pas la même décision. */}
      <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
        {parametre.origine}
      </p>

      <p aria-live="polite" className="mt-2 font-body-sm text-body-sm">
        {etat.statut === "ok" ? (
          <span className="text-on-surface">{t("fait")}</span>
        ) : etat.statut === "erreur" ? (
          <span className="text-error">{t(`erreur.${etat.motif}`)}</span>
        ) : null}
      </p>
    </form>
  );
}
