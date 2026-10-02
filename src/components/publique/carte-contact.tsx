import { ArrowRight, MessageCircle } from "lucide-react";
import { liensDuVendeur } from "@/components/publique/reseaux-vendeur";
import type { Boutique } from "@/lib/page-publique/lecture";

/** WhatsApp d'abord : c'est la messagerie où l'on attend une réponse. Le site en dernier. */
const ORDRE_CONTACT = ["whatsapp", "instagram", "tiktok", "site"] as const;

/**
 * « UNE QUESTION ? » (maquette v3, `.cv-contact`) : le bouton principal mène au premier
 * réseau configuré, puis chaque messagerie est nommée. Le site n'est pas une messagerie :
 * il ne figure pas parmi les puces nommées, et il n'est le bouton que faute d'autre chose.
 *
 * ABSENTE quand le vendeur n'a configuré aucun moyen de contact : « contactez la
 * boutique » sans rien sur quoi cliquer serait une promesse creuse.
 */
export function CarteContact({
  boutique,
  libelles,
  libelleSite,
}: {
  readonly boutique: Boutique;
  readonly libelles: { readonly titre: string; readonly texte: string; readonly bouton: string };
  readonly libelleSite: string;
}) {
  const liens = liensDuVendeur(boutique, libelleSite);
  const principal = ORDRE_CONTACT.map((clef) => liens.find((l) => l.clef === clef)).find((l) => l !== undefined);
  if (principal === undefined) return null;
  const messageries = liens.filter((l) => l.clef !== "site");

  return (
    <section className="cv-carte cv-contact cv-entree" aria-labelledby="cv-contact">
      <div className="cv-contact__tete">
        <span className="cv-rond-teinte" aria-hidden="true">
          <MessageCircle className="ic" />
        </span>
        <div>
          <h2 className="cv-titre" id="cv-contact">
            {libelles.titre}
          </h2>
          <p>{libelles.texte}</p>
        </div>
      </div>
      <a href={principal.href} target="_blank" rel="noopener noreferrer" className="cv-bouton cv-bouton--plein cv-bouton--large">
        {libelles.bouton}
        <ArrowRight aria-hidden="true" className="ic" />
      </a>
      {messageries.map((lien) => (
        <a key={lien.clef} href={lien.href} target="_blank" rel="noopener noreferrer" className="cv-reseau-libelle">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="cl-marque-reseau">
            <path d={lien.trace} />
          </svg>
          {lien.libelle}
        </a>
      ))}
    </section>
  );
}
