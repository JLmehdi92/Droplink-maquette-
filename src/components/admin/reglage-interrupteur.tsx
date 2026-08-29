"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  enregistrerParametre,
  type EtatParametre,
} from "@/app/[locale]/admin/parametres/actions";

/**
 * UN INTERRUPTEUR — un bouton, jamais une case qui bascule seule.
 *
 * ⚠️ AUCUN ÉTAT OPTIMISTE ICI, ET C'EST LA PROPRIÉTÉ QUI COMPTE. Une bascule qui
 * change de couleur au clic puis laisse l'écriture échouer affiche « suivi
 * coupé » sur un suivi qui tourne — c'est-à-dire l'inverse exact de ce qu'on est
 * venu vérifier, sur les deux seuls réglages du produit capables d'arrêter une
 * dépense ou de fermer la porte d'entrée. La position dessinée est TOUJOURS
 * celle que le serveur vient de rendre. Pendant l'envoi la bascule ne bouge pas,
 * elle pâlit : un mouvement pendant l'attente serait un état optimiste déguisé
 * en animation.
 *
 * IL N'Y A PAS DE `<form>` : ce qu'il portait — la clé, la valeur — est
 * construit à l'appel, et un bouton `submit` déclencherait un envoi natif qui
 * contournerait la promesse qu'on vient d'aller chercher.
 */
/*
 * ⚠️ NI `useActionState`, NI `router.refresh()` — LES DEUX RENONCEMENTS SONT
 * MESURÉS, écran piloté le 29/08/2026, requêtes lues octet par octet.
 *
 * `useActionState` : le POST part, répond 200, porte `x-action-revalidated`,
 * son corps contient le résultat `{"statut":"ok"}` ET l'arbre rafraîchi, la
 * base est écrite, l'audit inscrit — et l'état du composant reste `inactif`
 * INDÉFINIMENT. Observé huit secondes durant, à intervalles d'une demi-seconde.
 * Tout ce que le serveur devait faire, il l'a fait ; le client n'applique rien.
 *
 * `router.refresh()` : appelé après un `await` ordinaire, il ne redessine RIEN.
 * La base valait 0, l'écran affichait toujours « actif », dix secondes après.
 * Et appelé À L'INTÉRIEUR de la transition, il laisse `isPending` à vrai pour
 * toujours : le bouton reste désactivé et le clic SUIVANT est avalé sans un
 * mot. Le sortir dans un `useEffect` ne suffit pas — l'effet naît du rendu que
 * la transition a déclenché, il lui appartient encore.
 *
 * CE QUI MARCHE, ET POURQUOI : ne dépendre d'AUCUNE invalidation. La Server
 * Action RELIT la valeur en base après l'avoir écrite et la renvoie avec son
 * résultat ; le composant dessine ce qu'elle a lu. On n'affirme donc jamais ce
 * que la base n'a pas enregistré, et l'écran ne repose plus sur un mécanisme
 * qui échoue en silence.
 *
 * ⚠️ LA TRANSITION EST ÉCARTÉE ELLE AUSSI : appeler l'action dans un
 * `startTransition` fait bien appliquer l'arbre rafraîchi, mais `isPending` ne
 * retombe jamais — quatre bascules d'affilée, le bouton restait désactivé après
 * la première. Un état booléen ordinaire se termine, lui.
 *
 * Ces quelques lignes ont coûté quatre allers-retours de mesure. Elles sont
 * écrites pour qu'on ne les redéfasse pas.
 */

const INITIAL: EtatParametre = { statut: "inactif" };

export interface InterrupteurVu {
  readonly cle: string;
  readonly actif: boolean;
  readonly ecrit: boolean;
  readonly origine: string;
}

export function ReglageInterrupteur({ reglage }: { reglage: InterrupteurVu }) {
  const t = useTranslations("admin.parametres");
  const [etat, setEtat] = useState<EtatParametre>(INITIAL);
  const [enCours, setEnCours] = useState(false);

  // CE QUE L'ÉCRAN DESSINE : la valeur relue en base si l'on vient d'écrire,
  // sinon celle du rendu serveur. Jamais celle qu'on a demandée.
  const apres = etat.statut === "ok" ? etat.apres : null;
  const actif = apres === null ? reglage.actif : apres.valeur !== 0;
  const ecrit = apres === null ? reglage.ecrit : apres.ecrit;
  const origine = apres === null ? reglage.origine : apres.origine;

  const basculer = async (): Promise<void> => {
    setEnCours(true);
    const donnees = new FormData();
    donnees.set("cle", reglage.cle);
    // LA VALEUR ENVOYÉE EST L'INVERSE DE CELLE AFFICHÉE, et celle affichée vient
    // du serveur : on ne déduit donc jamais le sens du geste d'un état client
    // qui aurait pu diverger.
    donnees.set("valeur", actif ? "0" : "1");

    setEtat(await enregistrerParametre(INITIAL, donnees));
    setEnCours(false);
  };

  return (
    <div className="border-t border-filet-ligne py-4">
      <div className="flex items-center justify-between gap-6">
        <div className="min-w-0">
          <p className="font-headline-md text-[14px] leading-[18px] font-semibold text-on-surface">
            {t(`cles.${reglage.cle}.titre`)}
          </p>
          <p className="mt-[2px] font-body-sm text-[12px] leading-[15px] text-sourdine">
            {t(`cles.${reglage.cle}.aide`)}
          </p>
        </div>

        {/*
         * ⚠️ LA CIBLE TACTILE EST SUR LE BOUTON, LA PILULE EST DEDANS. Le
         * plancher de 44 px posé sous `pointer: coarse` s'applique au BOUTON :
         * dessiner la pilule directement dessus la faisait passer de 27 à 44 px
         * de haut au téléphone — mesuré. Le doigt garde ses 44 px, l'œil garde
         * les 27 de la planche.
         */}
        <button
          type="button"
          role="switch"
          aria-checked={actif}
          aria-label={t(`cles.${reglage.cle}.titre`)}
          disabled={enCours}
          onClick={() => void basculer()}
          className="flex shrink-0 items-center justify-center disabled:opacity-60"
        >
          <span
            className={
              "flex h-[27px] w-[46px] items-center rounded-full px-[3px] " +
              (actif ? "justify-end bg-violet" : "justify-start bg-[#dcdce4]")
            }
          >
            <span className="block h-[21px] w-[21px] rounded-full bg-white" />
          </span>
        </button>
      </div>

      {ecrit ? (
        <p className="mt-[6px] font-body-sm text-[12px] leading-[15px] text-sourdine">
          {origine}
        </p>
      ) : null}

      <p aria-live="polite" className="font-body-sm text-[12px] leading-[16px] empty:hidden">
        {etat.statut === "ok" ? (
          <span className="mt-[6px] block text-on-surface">{t("fait")}</span>
        ) : etat.statut === "erreur" ? (
          <span className="mt-[6px] block text-alerte">{t(`erreur.${etat.motif}`)}</span>
        ) : null}
      </p>
    </div>
  );
}
