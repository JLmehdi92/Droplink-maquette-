import { ChevronRight, Clock, X } from "lucide-react";
import { FeuilleHistorique } from "@/components/publique/feuille-historique";

/** Un passage du transporteur, déjà formaté par le serveur (la page n'expédie aucun formateur). */
export interface LignePassage {
  readonly cle: string;
  /** Le jour, pour les intertitres de la feuille (« 29 septembre »). */
  readonly jour: string;
  /** L'heure seule (« 08:40 »). */
  readonly heure: string;
  /** Le jour et l'heure, pour l'aperçu du bureau et la carte du dernier mouvement. */
  readonly quand: string;
  readonly description: string;
  readonly lieu: string | null;
}

export interface LibellesHistorique {
  readonly titre: string;
  readonly voirTout: string;
  readonly fermer: string;
  readonly arrete: string;
  readonly attenteTitre: string;
  readonly attenteTexte: string;
  /** « Colissimo · 6A30… » : qui suit, et quel numéro. */
  readonly sousTitreFeuille: string | null;
}

const ID_TITRE = "cv-historique-titre";

/**
 * LE SUIVI DU COLIS SUR LA PAGE CLIENT (maquette v3) : la carte du DERNIER mouvement,
 * qui ouvre l'historique complet dans une feuille, et au bureau un aperçu des trois
 * derniers.
 *
 * OMIS tant qu'aucun colis n'est enregistré (la page n'appelle pas ce composant) : une
 * carte vide affirmerait qu'il y a quelque chose à y lire.
 *
 * LE TRANSPORTEUR A CESSÉ DE SUIVRE LE NUMÉRO : c'est DIT. Un suivi qui s'arrête sans le
 * dire se lit comme un suivi qui ne marche pas.
 *
 * ZÉRO PASSAGE VEUT DIRE ZÉRO MOUVEMENT (`appliquer_etat_colis` le calcule sur les
 * passages), et l'attente se dit CALME, jamais en ambre : la décision 7 nomme
 * l'absence — « pas encore d'information du transporteur », jamais « introuvable ».
 */
export function SuiviClient({
  lignes,
  abandonne,
  libelles,
}: {
  readonly lignes: readonly LignePassage[];
  readonly abandonne: boolean;
  readonly libelles: LibellesHistorique;
}) {
  const dernier = lignes[0];
  return (
    <>
      {abandonne ? <p className="cv-avis cv-entree">{libelles.arrete}</p> : null}

      {dernier === undefined ? (
        abandonne ? null : (
          <section className="cv-carte cv-attente cv-entree" aria-labelledby="cv-attente">
            <span className="cv-rond-teinte" aria-hidden="true">
              <Clock className="ic" />
            </span>
            <div>
              <b id="cv-attente">{libelles.attenteTitre}</b>
              <p>{libelles.attenteTexte}</p>
            </div>
          </section>
        )
      ) : (
        <button type="button" className="cv-carte cv-dernier cv-entree" aria-haspopup="dialog" data-ouvrir-historique="">
          <span className="cv-direct" aria-hidden="true">
            <i />
          </span>
          <span className="cv-dernier__texte">
            <small>{dernier.quand}</small>
            <b>{dernier.description}</b>
            {dernier.lieu === null ? null : <span>{dernier.lieu}</span>}
          </span>
          <span className="cv-dernier__lien">
            {libelles.titre} <em>{lignes.length}</em>
            <ChevronRight aria-hidden="true" className="ic" />
          </span>
        </button>
      )}
    </>
  );
}

/** Au bureau, les trois derniers mouvements se lisent sans ouvrir la feuille. */
export function ApercuHistorique({
  lignes,
  libelles,
}: {
  readonly lignes: readonly LignePassage[];
  readonly libelles: LibellesHistorique;
}) {
  if (lignes.length === 0) return null;
  return (
    <section className="cv-carte cv-apercu-fil cv-entree" aria-labelledby="cv-apercu-fil">
      <div className="cv-section__tete">
        <h2 id="cv-apercu-fil">{libelles.titre}</h2>
        {lignes.length > 3 ? (
          <button type="button" className="cv-lien-fort" aria-haspopup="dialog" data-ouvrir-historique="">
            {libelles.voirTout}
            <ChevronRight aria-hidden="true" className="ic" />
          </button>
        ) : null}
      </div>
      <ol className="cv-fil cv-fil--court">
        {lignes.slice(0, 3).map((l, rang) => (
          <li key={l.cle} className={rang === 0 ? "est-recent" : undefined}>
            <i aria-hidden="true" />
            <span>
              <b>{l.description}</b>
              {l.lieu === null ? null : <small>{l.lieu}</small>}
            </span>
            <time>{l.quand}</time>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * LA FEUILLE : tout l'historique, groupé par jour, du plus récent au plus ancien. Elle
 * se ferme par un `<form method="dialog">` — sans une ligne de JavaScript.
 */
export function FeuilleSuivi({
  lignes,
  libelles,
}: {
  readonly lignes: readonly LignePassage[];
  readonly libelles: LibellesHistorique;
}) {
  if (lignes.length === 0) return null;
  return (
    <FeuilleHistorique titreId={ID_TITRE}>
      <div className="cv-feuille__panneau">
        <div className="cv-feuille__poignee" aria-hidden="true">
          <i />
        </div>
        <div className="cv-feuille__tete">
          <div>
            <h2 id={ID_TITRE}>{libelles.titre}</h2>
            {libelles.sousTitreFeuille === null ? null : <p>{libelles.sousTitreFeuille}</p>}
          </div>
          <form method="dialog">
            <button type="submit" className="cv-rond" aria-label={libelles.fermer}>
              <X aria-hidden="true" className="ic" />
            </button>
          </form>
        </div>
        <ol className="cv-fil">
          {lignes.flatMap((l, rang) => {
            const nouveauJour = rang === 0 || lignes[rang - 1]?.jour !== l.jour;
            const ligne = (
              <li key={l.cle} className={rang === 0 ? "est-recent" : undefined}>
                <i aria-hidden="true" />
                <span>
                  <b>{l.description}</b>
                  {l.lieu === null ? null : <small>{l.lieu}</small>}
                </span>
                <time>{l.heure}</time>
              </li>
            );
            return nouveauJour
              ? [
                  <li key={"jour-" + l.cle} className="cv-fil__jour">
                    {l.jour}
                  </li>,
                  ligne,
                ]
              : [ligne];
          })}
        </ol>
      </div>
    </FeuilleHistorique>
  );
}
