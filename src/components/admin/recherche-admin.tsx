import { Search } from "lucide-react";

/**
 * LA RECHERCHE DES LISTES D'ADMINISTRATION (maquette, `.recherche-envoi.adm-cherche`).
 *
 * UN FORMULAIRE GET NATIF : la recherche part en base, et son critère entre dans
 * la trace de la consultation. La maquette filtre les lignes déjà chargées ;
 * ici le serveur cherche dans TOUS les comptes, pas dans les cinquante affichés.
 * Entrée envoie. Le bouton, visuellement masqué, existe pour les lecteurs d'écran
 * (un formulaire de recherche annonce son bouton) ; hors de l'ordre de tabulation,
 * il ne laisse pas un arrêt invisible au clavier.
 */
export function RechercheAdmin({
  action,
  valeur,
  etiquette,
  exemple,
  chercher,
  garder = {},
}: {
  readonly action: string;
  readonly valeur: string;
  readonly etiquette: string;
  readonly exemple: string;
  readonly chercher: string;
  /** Les autres critères à conserver (le filtre en cours), jamais le curseur. */
  readonly garder?: Readonly<Record<string, string>>;
}) {
  return (
    <form method="get" action={action} role="search" className="recherche-envoi adm-cherche">
      {Object.entries(garder).map(([nom, v]) => (
        <input key={nom} type="hidden" name={nom} value={v} />
      ))}
      <Search aria-hidden="true" className="ic" />
      <input name="q" type="search" defaultValue={valeur} placeholder={exemple} aria-label={etiquette} autoComplete="off" spellCheck={false} />
      <button type="submit" className="sr" tabIndex={-1}>
        {chercher}
      </button>
    </form>
  );
}
