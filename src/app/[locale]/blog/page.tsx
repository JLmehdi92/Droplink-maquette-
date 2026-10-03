import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { ArrowRight, FileText } from "lucide-react";
import { CoqueSite } from "@/components/public/coque-site";
import { GrapheJsonLd } from "@/components/seo/graphe-json-ld";
import { donneesPage } from "@/lib/seo/donnees-structurees";
import { MetaArticle } from "@/components/blog/meta-article";
import { estLangueDuBlog, LANGUE_DU_BLOG, tousLesArticles } from "@/lib/blog/articles";
import { alternatesUneSeuleLangue, openGraphDe } from "@/lib/seo/alternates";
import { estLangueSupportee, LANGUE_DEFAUT } from "@/i18n/config";
import { routing } from "@/i18n/routing";

/**
 * L'INDEX DU BLOG.
 *
 * ⚠️ IL N'EXISTE QU'EN FRANÇAIS, ET LES AUTRES LANGUES RENDENT 404.
 *
 * Le réflexe serait de servir la version française sous `/en/blog` plutôt que
 * de refuser. Ce serait pire : une page indexable qui ment sur sa langue, dans
 * un `<html lang="en">` qui annonce de l'anglais. Le layout le refuse déjà pour
 * une langue inconnue, pour la même raison.
 *
 * ⚠️ ET LE PLAN DE SITE NE DOIT ANNONCER QUE LES URL FRANÇAISES. Une entrée
 * `/en/blog` qui rend 404 abîme la confiance accordée au plan entier.
 */
const CHEMIN = "/blog";

/** Le nom de la page, tel que l'étiquette l'affiche et que le fil d'Ariane le dit. */
const NOM = "Le blog";
const TITRE = `${NOM} — DropLink`;
const DESCRIPTION =
  "Ce qu'on apprend en parlant à des vendeurs qui envoient leurs commandes en message privé : les outils, les pièges, et ce qui fait qu'un client cesse de demander où en est son colis.";

/**
 * ⚠️ ON NE PRÉREND QUE LA LANGUE DU BLOG. Rendre les trois créerait deux pages
 * dont le seul travail est d'appeler `notFound()`.
 */
/**
 * HORS DE LA LISTE, LA ROUTE N'EXISTE PAS (audit final du 03/10/2026) : une autre langue ou
 * un article inconnu passait par `notFound()` dans une page prérendue, et c'est la page
 * générique de Next qui répondait — anglais en dur, Times New Roman, `lang` vide. Une route
 * inexistante, elle, est servie par `global-not-found`, l'écran introuvable de la refonte.
 * `notFound()` reste plus bas, en filet.
 */
export const dynamicParams = false;

export function generateStaticParams(): Array<{ locale: string }> {
  return routing.locales
    .filter((l) => l === LANGUE_DU_BLOG)
    .map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const langue = estLangueSupportee(locale) ? locale : LANGUE_DEFAUT;
  return {
    title: TITRE,
    description: DESCRIPTION,
    alternates: alternatesUneSeuleLangue(langue, CHEMIN),
    openGraph: openGraphDe(langue, CHEMIN, { titre: TITRE, description: DESCRIPTION }),
  };
}

export default async function Blog({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const langue = estLangueSupportee(locale) ? locale : LANGUE_DEFAUT;
  if (!estLangueDuBlog(langue)) notFound();
  setRequestLocale(locale);
  // La durée de lecture se dit par règle de traduction, pas en dur (contre-audit du 03/10/2026).
  const tc = await getTranslations("commun");

  const articles = tousLesArticles();

  /* LA REFONTE (02/10/2026) suit `blog.html` : en-tête de page, puis la grille de cartes,
     la plus récente « à la une » sur deux colonnes. Le blog n'existe qu'en français : ses
     textes vivent dans `lib/blog/articles`, pas dans les catalogues. */
  return (
    <CoqueSite locale={locale} page="blog">
      <GrapheJsonLd graphe={donneesPage(langue, CHEMIN, { nom: NOM, description: DESCRIPTION }, "CollectionPage")} />
      <main id="contenu" className="pub">
        <section className="pub-tete conteneur">
          <p className="l4-etiquette">
            <span>
              <FileText aria-hidden="true" className="ic" />
            </span>
            {NOM}
          </p>
          <h1 className="pub-titre l4-titre">
            <span className="l4-ligne" style={{ "--l": 0 } as React.CSSProperties}>Vendre en direct, sans y passer ses soirées</span>
          </h1>
          <p className="pub-chapo" data-entree>
            {DESCRIPTION}
          </p>
        </section>
        <section className="conteneur blog-grille" aria-label="Articles">
          {articles.map((a, rang) => (
            <Link
              key={a.slug}
              href={`/${locale}/blog/${a.slug}`}
              className={"blog-carte v4-carte" + (rang === 0 ? " blog-carte--une" : "")}
              data-anime
            >
              <span className="blog-carte__etiquette">{a.etiquette}</span>
              <h2>{a.titre}</h2>
              <p>{a.resume}</p>
              <span className="blog-carte__pied">
                <MetaArticle date={a.date} duree={tc("dureeCourte", { n: a.minutes })} />
                <span className="blog-carte__lire">
                  Lire
                  <ArrowRight aria-hidden="true" className="ic" />
                </span>
              </span>
            </Link>
          ))}
        </section>
      </main>
    </CoqueSite>
  );
}
