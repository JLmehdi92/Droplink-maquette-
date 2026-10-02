export interface LigneLivraison {
  readonly cle: "transporteur" | "numero" | "estimation" | "destinataire" | "reference";
  readonly libelle: string;
  readonly valeur: string;
}

/**
 * « INFORMATIONS DE LIVRAISON » (maquette v3, `.cv-infos`) : libellé à gauche, valeur à
 * droite ; la référence, souvent longue, passe sous son libellé.
 *
 * UNE LIGNE ABSENTE EST OMISE, jamais remplie (décision 26) : la page publique ne dit
 * que ce que la base porte. Sans aucune ligne, la carte n'existe pas.
 */
export function CarteLivraison({
  titre,
  lignes,
}: {
  readonly titre: string;
  readonly lignes: readonly LigneLivraison[];
}) {
  if (lignes.length === 0) return null;
  return (
    <section className="cv-carte cv-entree" aria-labelledby="cv-livraison">
      <h2 className="cv-titre" id="cv-livraison">
        {titre}
      </h2>
      <dl className="cv-infos">
        {lignes.map((ligne) => (
          <div key={ligne.cle} className={ligne.cle === "reference" ? "cv-infos__pile" : undefined}>
            <dt>{ligne.libelle}</dt>
            <dd className={ligne.cle === "numero" ? "cv-numero" : undefined}>{ligne.valeur}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
