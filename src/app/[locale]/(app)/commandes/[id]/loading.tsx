import { getTranslations } from "next-intl/server";
/**
 * L'ÉDITEUR — l'écran le plus cliqué du produit.
 *
 * Un fournisseur à 200 commandes par semaine ouvre cet écran des dizaines de
 * fois par jour, depuis la liste. C'est donc là que l'absence d'état de
 * chargement se paie le plus : chaque ouverture paraissait figée le temps du
 * rendu serveur.
 *
 * Le squelette reprend la géométrie à deux colonnes du bureau pour qu'aucun
 * décalage n'ait lieu à l'arrivée du contenu. Porté sur les jetons du design
 * system le 15/09/2026, comme celui de la liste.
 */
export default async function ChargementFiche() {
  const t = await getTranslations("commun");
  // Refonte du 02/10/2026 (`commande-chargement.html`) : la géométrie de la fiche
  // (deux cartes de champs, une carte de médias), pour qu'elle ne saute pas à
  // l'arrivée des données.
  return (
    <main id="contenu" className="tableau squelette" aria-busy="true">
      <p className="sr" role="status">
        {t("chargement")}
      </p>
      <div className="squelette__corps" aria-hidden="true">
        <i className="sq sq--titre sq--large" />
        <div className="squelette__fiche">
          <div className="squelette__gauche">
            {[0, 1].map((k) => (
              <div key={k} className="squelette__carte">
                <i className="sq sq--etiquette" />
                <i className="sq sq--champ" />
                <i className="sq sq--champ" />
              </div>
            ))}
          </div>
          <div className="squelette__carte squelette__droite">
            <i className="sq sq--etiquette sq--court" />
            <div className="squelette__medias">
              <i className="sq" />
              <i className="sq" />
              <i className="sq" />
              <i className="sq" />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
