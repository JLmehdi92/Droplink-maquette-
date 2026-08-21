import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { lireProfilVendeur } from "@/lib/comptes/profil";
import { estLangueSupportee } from "@/i18n/config";

/**
 * Enveloppe de l'espace authentifié.
 *
 * CE LAYOUT N'EST PAS LA PROTECTION, il en est la première couche. Un layout
 * s'exécute avant les pages qu'il contient, mais une Server Action appelée
 * depuis l'une d'elles ne passe PAS par lui : les Server Actions sont des points
 * d'entrée à part entière, atteignables directement par une requête forgée.
 * Chacune porte donc sa propre garde.
 *
 * Ce que ce layout apporte vraiment : un utilisateur non connecté ne voit jamais
 * la coquille d'un écran qu'il n'a pas le droit de voir, et la redirection est
 * faite une fois plutôt que répétée dans chaque page.
 *
 * LE STATUT DU COMPTE EST VÉRIFIÉ EN BASE, à chaque requête, et non lu dans le
 * jeton. Un jeton reste valide jusqu'à son expiration même après une suspension
 * — s'y fier laisserait un compte suspendu travailler jusqu'à une heure de plus,
 * et c'est cette coupure qui fonde notre statut d'hébergeur.
 */
export default async function LayoutApplication({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const langue = estLangueSupportee(locale) ? locale : "fr";
  setRequestLocale(langue);

  const profil = await lireProfilVendeur();

  if (profil === null) {
    redirect(`/${langue}/connexion?erreur=session`);
  }

  if (profil.statut === "suspended") {
    // On ne détaille pas le motif ici : l'écran de connexion porte un message
    // neutre. Expliquer une suspension dans l'interface du suspendu revient à
    // lui donner la liste de ce qu'il doit contourner.
    redirect(`/${langue}/connexion?erreur=suspendu`);
  }

  const t = await getTranslations("navigation");

  // LA NAVIGATION EST RENDUE CÔTÉ SERVEUR, en liens simples. Un composant client
  // ici coûterait du bundle sur TOUS les écrans de l'espace vendeur, pour un
  // menu qui ne fait que naviguer — et le dashboard est l'écran le plus vu du
  // produit. `aria-current` n'est pas posé : le layout ne connaît pas le chemin
  // courant sans lire l'URL, et l'annoncer de travers serait pire que ne rien
  // annoncer à un lecteur d'écran.
  return (
    <div className="min-h-dvh bg-surface">
      <nav
        aria-label={t("espaceVendeur")}
        className="border-b border-outline-variant bg-surface-container-lowest"
      >
        <ul className="mx-auto flex w-full max-w-container-max gap-2 px-margin-mobile md:px-margin-desktop">
          {[
            { href: `/${langue}/commandes`, libelle: t("mesCommandes") },
            { href: `/${langue}/envois`, libelle: t("mesEnvois") },
            { href: `/${langue}/marque`, libelle: t("maMarque") },
          ].map((entree) => (
            <li key={entree.href}>
              <Link
                href={entree.href}
                className="flex min-h-[44px] items-center px-3 font-label-md text-label-md text-on-surface-variant transition-colors hover:text-on-surface"
              >
                {entree.libelle}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {children}
    </div>
  );
}
