import Link from "next/link";

/**
 * LES PASTILLES DE FILTRE DE L'ADMINISTRATION (maquette, `.adm-filtres`).
 *
 * CE SONT DES LIENS, PAS DES BOUTONS : le filtre vit dans l'URL (il se partage,
 * se recharge, revient avec le bouton retour), il est appliqué EN BASE, et ses
 * critères entrent dans la trace de la consultation. La maquette filtre les
 * lignes déjà chargées dans le navigateur ; ce n'est pas portable ici.
 */
export function FiltresAdmin({
  etiquette,
  courant,
  options,
}: {
  readonly etiquette: string;
  readonly courant: string;
  readonly options: readonly { readonly valeur: string; readonly libelle: string; readonly href: string }[];
}) {
  return (
    <div className="adm-filtres" role="group" aria-label={etiquette}>
      {options.map((o) => (
        <Link key={o.valeur} href={o.href} prefetch={false} aria-current={o.valeur === courant ? "true" : undefined}>
          {o.libelle}
        </Link>
      ))}
    </div>
  );
}
