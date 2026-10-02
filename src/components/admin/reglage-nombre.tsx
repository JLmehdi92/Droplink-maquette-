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
    <form
      className={"adm-reglage" + (etat.statut === "erreur" ? " est-erreur" : "")}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (modifie && !enCours) void enregistrer();
      }}
    >
      <div>
        <label htmlFor={champ}>{t(`cles.${reglage.cle}.titre`)}</label>
        <p>{t(`cles.${reglage.cle}.aide`)}</p>
        {/* LES BORNES SONT ÉCRITES EN CLAIR : `min`/`max` ne sont qu'une aide du
            navigateur, la règle est refaite côté serveur. */}
        <small>{t("bornes", { min: reglage.min, max: reglage.max, defaut: reglage.defaut })}</small>
        {/* TROIS ÉTATS : « jamais décidé » n'est pas « décidé à cette valeur ». */}
        <small className="adm-origine">{ecrit ? origine : t("origine.jamaisDecide")}</small>
      </div>
      <div className="adm-reglage__saisie">
        {/* ⚠️ LA CLÉ CHANGE AVEC LA VALEUR RELUE, ce qui remonte le champ : sans
            cela il garderait ce qui a été SAISI, et si quelqu'un d'autre a écrit
            entre-temps l'écran afficherait un nombre que la base ne porte pas. */}
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
        />
        {/* ENREGISTRER N'EXISTE QUE SUR UNE VALEUR MODIFIÉE : grisé sinon. */}
        <button type="submit" className="bouton-outil" disabled={!modifie || enCours}>
          {enCours ? t("enCours") : t("enregistrer")}
        </button>
      </div>
      <p className="adm-reglage__retour" role="status" aria-live="polite">
        {etat.statut === "ok" ? t("fait") : etat.statut === "erreur" ? t(`erreur.${etat.motif}`) : null}
      </p>
    </form>
  );
}
