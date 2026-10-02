import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { LogoDropLink } from "@/components/logo-droplink";

/**
 * L'ÉCRAN D'ERREUR DES SURFACES PUBLIQUES — `ui_kits/erreurs`, écrit le
 * 14/09/2026 : le 404 général (`introuvable.html`) et la frontière d'erreur
 * (`erreur.html`). Même fond que le lien mort du client, mais c'est une surface
 * DropLink : le dégradé y est permis, pour sa seule action.
 *
 * AUCUN CROCHET, AUCUNE TRADUCTION, AUCUN LIEN DE ROUTEUR : il sert à la fois
 * `global-not-found`, qui remplace la racine et n'a aucun routeur au-dessus de
 * lui, et `[locale]/error`, une frontière d'erreur donc un composant client. Les
 * textes et l'action arrivent résolus.
 */
export function EcranErreurPublic({
  icone: Icone,
  titre,
  texte,
  children,
  accueil,
}: {
  readonly icone: LucideIcon;
  readonly titre: string;
  readonly texte: string;
  readonly children: ReactNode;
  /** L'adresse de l'accueil dans la langue résolue, et son nom accessible. */
  readonly accueil: { readonly href: string; readonly libelle: string };
}) {
  // Refonte du 02/10/2026 (`erreur.html`, `introuvable.html`) : le logo en haut,
  // l'icône, le titre, le texte, l'action, et le petit logo au pied. Un `<a>`
  // natif : ces écrans vivent parfois hors de tout routeur (404 global).
  return (
    <div className="page-erreur">
      <div className="err-page">
        <header className="err-haut">
          <a className="logo" href={accueil.href} aria-label={accueil.libelle}>
            <LogoDropLink hauteur={34} />
          </a>
        </header>
        <main id="contenu" className="err-corps">
          <span className="err-icone" aria-hidden="true">
            <Icone className="ic" />
          </span>
          <h1>{titre}</h1>
          <p>{texte}</p>
          {children}
        </main>
        <footer className="err-pied">
          <span className="logo logo--petit">
            <LogoDropLink hauteur={22} />
          </span>
        </footer>
      </div>
    </div>
  );
}

/** L'action principale d'un écran d'erreur public (`.bouton--marque`, maquette). */
export const CLASSE_ACTION_ERREUR = "bouton bouton--marque err-action";
