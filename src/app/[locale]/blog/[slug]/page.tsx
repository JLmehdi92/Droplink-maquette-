import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { ArrowLeft, ArrowRight, FileText } from "lucide-react";
import { CoqueSite } from "@/components/public/coque-site";
import { GrapheJsonLd } from "@/components/seo/graphe-json-ld";
import { MetaArticle } from "@/components/blog/meta-article";
import { CorpsArticle } from "@/components/blog/corps-article";
import { articleParSlug, estLangueDuBlog, LANGUE_DU_BLOG, slugs, tousLesArticles } from "@/lib/blog/articles";
import { alternatesUneSeuleLangue, openGraphDe } from "@/lib/seo/alternates";
import { donneesArticle } from "@/lib/seo/donnees-structurees";
import { estLangueSupportee, LANGUE_DEFAUT } from "@/i18n/config";

/**
 * UN ARTICLE.
 *
 * ⚠️ LES DEUX PARAMÈTRES SONT VALIDÉS AVANT TOUT AFFICHAGE. `slug` vient de
 * l'URL : un segment inconnu doit rendre 404, jamais une page vide ni une
 * erreur de rendu. `locale` aussi — le blog n'existe qu'en français, et servir
 * du français sous `<html lang="en">` serait une page indexable qui ment sur sa
 * langue.
 *
 * ⚠️ AUCUNE DONNÉE UTILISATEUR N'ENTRE ICI. Un article est un objet TypeScript
 * compilé dans le bundle : il n'y a ni requête, ni base, ni entrée à valider au
 * sens de Zod. La seule entrée externe est le `slug`, et il ne sert qu'à
 * chercher dans une liste fermée.
 */
/**
 * HORS DE LA LISTE, LA ROUTE N'EXISTE PAS (audit final du 03/10/2026) : une autre langue ou
 * un article inconnu passait par `notFound()` dans une page prérendue, et c'est la page
 * générique de Next qui répondait — anglais en dur, Times New Roman, `lang` vide. Une route
 * inexistante, elle, est servie par `global-not-found`, l'écran introuvable de la refonte.
 * `notFound()` reste plus bas, en filet.
 */
export const dynamicParams = false;

export function generateStaticParams(): Array<{ locale: string; slug: string }> {
  return slugs().map((slug) => ({ locale: LANGUE_DU_BLOG, slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const langue = estLangueSupportee(locale) ? locale : LANGUE_DEFAUT;
  const article = articleParSlug(slug);

  // Les métadonnées d'une page qui rendra 404 n'ont pas à décrire un article.
  if (article === null || !estLangueDuBlog(langue)) return {};

  const chemin = `/blog/${article.slug}`;
  // Sans origine, `openGraphDe` ne rend rien : on n'ajoute alors pas un `og:type` orphelin.
  const ogArticle = openGraphDe(
    langue,
    chemin,
    { titre: article.titre, description: article.description },
    { uneSeuleLangue: true },
  );
  return {
    title: `${article.titreMeta ?? article.titre} — DropLink`,
    description: article.description,
    alternates: alternatesUneSeuleLangue(langue, chemin),
    // Un article se partage comme un ARTICLE, avec sa date de publication (audit SEO
    // du 03/10/2026) ; le reste — image, locale, URL — est celui de toutes les pages.
    openGraph: ogArticle === undefined ? undefined : { ...ogArticle, type: "article", publishedTime: article.date },
  };
}

export default async function ArticleDuBlog({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const langue = estLangueSupportee(locale) ? locale : LANGUE_DEFAUT;
  if (!estLangueDuBlog(langue)) notFound();

  const article = articleParSlug(slug);
  if (article === null) notFound();

  setRequestLocale(locale);
  // La durée de lecture se dit par règle de traduction, pas en dur (contre-audit du 03/10/2026).
  const tc = await getTranslations("commun");
  const graphe = donneesArticle(langue, article);

  // « À lire aussi » : les deux articles qui suivent dans la liste, en boucle.
  const tous = tousLesArticles();
  const rang = tous.findIndex((a) => a.slug === article.slug);
  const suite = [1, 2].map((k) => tous[(rang + k) % tous.length]).filter((a) => a !== undefined && a.slug !== article.slug);

  return (
    <CoqueSite locale={locale} page="blog">
      {/* Le graphe est rendu CÔTÉ SERVEUR : Google traite les données structurées
          injectées par JS avec retard. Seul `<` est neutralisé — il pourrait fermer
          la balise ; la valeur ne vient d'aucune entrée utilisateur. */}
      <GrapheJsonLd graphe={graphe} />

      {/* LA REFONTE (02/10/2026) suit les articles de la maquette (`.art`) : 760 px de
          texte, au-delà l'œil perd le début de la ligne suivante. La barre de progression
          de lecture est portée (décision de Mehdi, 02/10/2026) : `AnimationsPubliques`
          la tient, une écriture par image au plus ; masquée au téléphone par le CSS. */}
      <main id="contenu" className="pub">
        <div className="art-progres" aria-hidden="true" data-progres />
        <article className="conteneur art">
          <Link className="art-retour min-h-11" href={`/${locale}/blog`}>
            <ArrowLeft aria-hidden="true" className="ic" />
            Tous les articles
          </Link>
          <p className="l4-etiquette art-etiquette">
            <span>
              <FileText aria-hidden="true" className="ic" />
            </span>
            {article.etiquette}
          </p>
          <h1 className="pub-titre art-titre">{article.titre}</h1>
          <p className="art-meta">
            <MetaArticle date={article.date} duree={tc("dureeCourte", { n: article.minutes })} />
          </p>

          <CorpsArticle blocs={article.blocs} />

          {/* L'APPEL DE FIN, une seule fois, et le seul dégradé de l'écran (règle 3).
              « Gratuit pendant le lancement » n'est plus vrai depuis le plan Pro : le texte
              de la maquette, juste, le remplace. */}
          <aside className="pub-cta v4-carte" data-anime>
            <h2>Un seul lien pour toute la commande</h2>
            <p>Compte gratuit, sans carte bancaire, prêt en moins d’une minute.</p>
            <Link className="bouton bouton--marque bouton--large min-h-11" href={`/${locale}/inscription`}>
              Créer mon compte
              <ArrowRight aria-hidden="true" className="ic" />
            </Link>
          </aside>

          {suite.length === 0 ? null : (
            <nav className="art-suite" aria-label="À lire aussi">
              <p className="art-suite__titre">À lire aussi</p>
              {suite.map((a) =>
                a === undefined ? null : (
                  <Link key={a.slug} className="blog-carte v4-carte" href={`/${locale}/blog/${a.slug}`}>
                    <span className="blog-carte__etiquette">{a.etiquette}</span>
                    <h2>{a.titre}</h2>
                    <span className="blog-carte__pied">
                      <MetaArticle date={a.date} duree={tc("dureeCourte", { n: a.minutes })} />
                      <span className="blog-carte__lire">
                        Lire
                        <ArrowRight aria-hidden="true" className="ic" />
                      </span>
                    </span>
                  </Link>
                ),
              )}
            </nav>
          )}
        </article>
      </main>
    </CoqueSite>
  );
}
