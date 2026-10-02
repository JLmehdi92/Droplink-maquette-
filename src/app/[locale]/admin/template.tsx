/**
 * L'ENVELOPPE D'ENTRÉE DES ÉCRANS D'ADMINISTRATION — la même que l'espace vendeur
 * (`(app)/template.tsx`) : `.app__feuille` est une colonne flex, et sans elle le
 * contenu centré (`margin-inline: auto`) se réduirait à la largeur de son contenu.
 *
 * Ce n'est PAS un `loading.tsx` : rien n'est rendu avant que le layout ait vérifié
 * le rôle en base, donc aucun squelette ne peut fuir dans un 404.
 */
export default function TemplateAdministration({ children }: { children: React.ReactNode }) {
  return <div className="entree-ecran">{children}</div>;
}
