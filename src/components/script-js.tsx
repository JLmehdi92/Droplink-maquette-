"use client";

import { useEffect } from "react";

/**
 * LA CLASSE `js` DE TOUTES LES SURFACES DROPLINK (maquette : chaque script de page
 * commence par `racine.classList.add("js")`).
 *
 * Elle garde le mouvement : sans elle, tout est posé dans son état final. Elle est
 * posée par un script EN LIGNE, avant le premier rendu (posée après l'hydratation,
 * un contenu s'afficherait, disparaîtrait puis reviendrait). Les entrées
 * (`.pret`) attendent que la page soit posée — la police chargée, deux images —,
 * avec un plafond de 900 ms (refonte-design.md § 6) ; d'ici là, `.attente` gèle
 * toutes les animations déjà parties (`socle.css`), titre et formulaire compris.
 *
 * LE FILET : si React n'a pas hydraté en 2,5 s, la classe est retirée et tout
 * s'affiche. Le marqueur `data-hydrate` est posé par `MarqueurHydratation`, monté
 * dans la même coque. La page client `/p` est hors de cette coque : elle n'a pas
 * de `js` (sa maquette, `client.js`, n'en pose pas).
 *
 * Une navigation cliente ne rejoue pas ce script : la classe vit avec le document,
 * comme dans la maquette où chaque page en recharge un.
 */
export function ScriptJs() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html:
          '(function(){var r=document.documentElement;r.classList.add("js","attente");var f=false;function p(){if(f)return;f=true;requestAnimationFrame(function(){requestAnimationFrame(function(){r.classList.remove("attente");r.classList.add("pret")})})}(document.fonts?document.fonts.ready:Promise.resolve()).then(p,p);setTimeout(p,900);setTimeout(function(){if(!r.hasAttribute("data-hydrate"))r.classList.remove("js","attente")},2500)})();',
      }}
    />
  );
}

export function MarqueurHydratation() {
  useEffect(() => {
    document.documentElement.setAttribute("data-hydrate", "");
  }, []);
  return null;
}
