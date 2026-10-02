import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { creerBrouillon } from "@/lib/commandes/actions";
import { BoutonTiroir } from "./coque-tiroir";
import { BoutonCreerCommande } from "./bouton-creer-commande";
import { ClocheAlertes } from "./cloche-alertes";
import { RechercheGlobale } from "./recherche-globale";

/**
 * LA BARRE DU HAUT DE L'ESPACE VENDEUR (maquette, `coque.html` : `.app__haut`).
 *
 * Collante, presque opaque, SANS `backdrop-filter` : un flou recompose tout ce
 * qui défile dessous à chaque image (Commandes passait de 27 à 60 images/s sans
 * lui, mesuré sur la maquette). De gauche à droite : le bouton du tiroir (sous
 * 1 020 px), la recherche, la cloche, et « Créer une commande ».
 *
 * Le menu du compte n'est plus ici : il vit en bas de la colonne, et donc dans le
 * tiroir au téléphone, avec les paramètres et la déconnexion.
 */
export async function BarreSuperieure({
  langue,
  jamaisOuvertes,
  colisSilencieux,
}: {
  readonly langue: string;
  readonly jamaisOuvertes: number | null;
  readonly colisSilencieux: number | null;
}) {
  const t = await getTranslations("navigation");
  const tc = await getTranslations("commandes");

  return (
    <header className="app__haut">
      <BoutonTiroir />
      {/* `useSearchParams` fait sortir son porteur du rendu statique : la
          frontière le borne à ce seul champ plutôt qu'à toute la coque. */}
      <Suspense fallback={<span className="recherche" aria-hidden="true" />}>
        <RechercheGlobale
          action={`/${langue}/commandes`}
          placeholder={tc("rechercherExemple")}
          placeholderCourt={t("rechercheCourte")}
          etiquette={tc("rechercher")}
        />
      </Suspense>
      <ClocheAlertes langue={langue} jamaisOuvertes={jamaisOuvertes} colisSilencieux={colisSilencieux} />
      <form action={creerBrouillon}>
        <input type="hidden" name="langue" value={langue} />
        <BoutonCreerCommande libelle={tc("nouvelle")} libelleEnCours={tc("nouvelleEnCours")} />
      </form>
    </header>
  );
}
