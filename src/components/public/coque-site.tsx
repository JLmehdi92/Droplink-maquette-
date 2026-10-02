import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { LogoDropLink } from "@/components/logo-droplink";
import { EntetePublique } from "@/components/public/entete-publique";
import { PiedPublic } from "@/components/public/pied-public";
import { SelecteurLangue } from "@/components/landing/selecteur-langue";

export type PagePublique = "tarifs" | "docs" | "blog" | "legal" | "signalement";

/**
 * LA COQUE DES PAGES PUBLIQUES (refonte du 02/10/2026) : l'en-tête et le pied de la
 * landing, avec la navigation des pages de la maquette (« Comment ça marche », Tarifs,
 * Documentation, Blog) et l'entrée courante marquée (`aria-current="page"`).
 *
 * Le blog n'existe qu'en français : son entrée n'apparaît que dans cette langue, comme
 * dans le pied.
 */
export async function CoqueSite({
  locale,
  page,
  children,
}: {
  readonly locale: string;
  readonly page: PagePublique;
  readonly children: ReactNode;
}) {
  const t = await getTranslations("accueil");
  const nav = await getTranslations("navigation");
  const liens = [
    { href: `/${locale}#studio`, libelle: t("nav.comment") },
    { href: `/${locale}/tarifs`, libelle: t("nav.tarifs"), courant: page === "tarifs" },
    { href: `/${locale}/docs`, libelle: t("pied.documentation"), courant: page === "docs" },
    ...(locale === "fr" ? [{ href: "/fr/blog", libelle: t("pied.blog"), courant: page === "blog" }] : []),
  ];

  return (
    <div className={"l4 publique publique--" + page}>
      <a className="evitement" href="#contenu">
        {nav("allerAuContenu")}
      </a>
      <EntetePublique
        accueil={`/${locale}`}
        libelleAccueil={t("accueil")}
        logo={<LogoDropLink />}
        etiquetteNav={t("nav.principale")}
        liens={liens}
        connexion={{ href: `/${locale}/connexion`, libelle: nav("seConnecter") }}
        inscription={{ href: `/${locale}/inscription`, libelle: nav("creerCompte") }}
        selecteurLangue={<SelecteurLangue locale={locale} compact />}
        libellesMenu={{ ouvrir: nav("ouvrirMenu"), fermer: nav("fermerMenu") }}
      />
      {children}
      <PiedPublic locale={locale} />
    </div>
  );
}
