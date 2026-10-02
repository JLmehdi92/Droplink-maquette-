"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * L'ENTRÉE DE CHAQUE ÉCRAN DE L'ESPACE VENDEUR ET DE L'ADMINISTRATION.
 *
 * Un `template` est remonté à chaque changement d'écran, là où le layout (la coque)
 * survit : c'est la chorégraphie de la maquette (`coque.js`, `aller`), la colonne et
 * la barre du haut restent, seul le contenu entre — en 240 ms sur 10 px, dans le sens
 * du menu (`data-sens`, posé au clic par `NavigationVendeur`). Sous mouvement réduit,
 * un fondu de 140 ms.
 *
 * ARRIVÉ PAR UNE NAVIGATION (`TransitionsEcran` a fait sortir l'écran précédent),
 * l'écran est inséré INVISIBLE et son entrée part deux images plus tard : la première
 * image d'un écran neuf porte toute sa mise en page (jusqu'à 200 ms au processeur
 * ralenti 4 fois), et une entrée qui démarrerait dessus sauterait ses premières
 * images (refonte-design.md § 6). Au premier chargement d'un document, rien n'est
 * différé : le rendu serveur et l'hydratation s'accordent (`__entreeDifferee` n'existe
 * pas encore), et la page ne reste jamais invisible faute de JavaScript.
 *
 * L'animation est en `backwards`, pas `both` : finie, elle ne reste pas active, donc
 * l'écran ne garde ni calque ni transformation (une transformation active ferait de ce
 * bloc le repère des éléments `fixed` qu'il contient).
 */
export function TemplateEcran({ children }: { readonly children: React.ReactNode }) {
  // ⚠️ UN `template` NE SE REMONTE QUE SI LE SEGMENT DE SON NIVEAU CHANGE : de la liste
  // des commandes à une fiche, le segment `commandes` reste, et l'écran ne rentrait pas
  // (relecture du 03/10/2026 : il restait même invisible, sorti par `TransitionsEcran`).
  // La clé sur le chemin fait de chaque écran un nouvel écran ; un filtre (`?…`) n'en
  // change pas le chemin, et ne remonte rien.
  const chemin = usePathname();
  return <CadreEcran key={chemin}>{children}</CadreEcran>;
}

function CadreEcran({ children }: { readonly children: React.ReactNode }) {
  const [attente, setAttente] = useState(() => typeof window !== "undefined" && window.__entreeDifferee === true);

  useEffect(() => {
    if (!attente) return;
    window.__entreeDifferee = false;
    let b = 0;
    const a = requestAnimationFrame(() => {
      b = requestAnimationFrame(() => setAttente(false));
    });
    return () => {
      cancelAnimationFrame(a);
      cancelAnimationFrame(b);
    };
  }, [attente]);

  return (
    <div className="entree-ecran" data-attente={attente ? "" : undefined}>
      {children}
    </div>
  );
}
