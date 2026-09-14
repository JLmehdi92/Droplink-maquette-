import Link from "next/link";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { CoquePublique } from "@/components/coque-publique";
import { MetaArticle } from "@/components/blog/meta-article";
import { CorpsArticle } from "@/components/blog/corps-article";
import { articleParSlug, estLangueDuBlog, LANGUE_DU_BLOG, slugs } from "@/lib/blog/articles";
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
  return {
    title: `${article.titreMeta ?? article.titre} — DropLink`,
    description: article.description,
    alternates: alternatesUneSeuleLangue(langue, chemin),
    openGraph: openGraphDe(langue, chemin, {
      titre: article.titre,
      description: article.description,
    }),
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
  const graphe = donneesArticle(langue, article);

  return (
    <CoquePublique locale={locale} pastille="Blog" enteteSecondaire>
      {/* Le graphe est rendu CÔTÉ SERVEUR : Google traite les données
          structurées injectées par JS avec un retard de plusieurs jours, et ne
          rend pas le JS sur une page en statut non-200. Seul `<` est neutralisé
          — il pourrait fermer la balise ; la valeur ne vient d'aucune entrée
          utilisateur. */}
      {graphe === null ? null : (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(graphe).replace(/</g, "\\u003c") }}
        />
      )}

      {/* `blog/index.html#<slug>` du design system. 760 px de texte : au-delà
          d'environ 90 caractères par ligne, l'œil perd le début de la ligne
          suivante. */}
      <main id="contenu" className="mx-auto w-full max-w-[828px] flex-1 px-4 pt-6 pb-12 md:px-[34px] md:pt-10 md:pb-[88px]">
        <Link
          href={`/${locale}/blog`}
          className="-my-3.5 inline-flex min-h-11 items-center gap-2 text-[14px] font-semibold text-ds-texte-corps hover:text-ds-accent-encre md:my-0 md:min-h-0"
        >
          <ArrowLeft aria-hidden="true" size={16} strokeWidth={1.9} />
          Le blog
        </Link>

        <div className="mt-[22px]">
          <span className="inline-flex items-center gap-2 rounded-ds-pill border border-ds-violet-200 bg-ds-surface-teinte px-3.5 py-[7px] text-[12.5px] font-bold text-ds-accent-encre">
            {article.etiquette}
          </span>
        </div>

        <h1 className="mt-5 text-[28px] leading-[1.06] font-extrabold tracking-[-0.045em] text-balance text-ds-texte-fort sm:text-[34px] md:text-[44px]">
          {article.titre}
        </h1>

        <div className="mt-5 mb-[26px] border-y border-ds-filet py-3.5">
          <MetaArticle date={article.date} duree={`${article.minutes} min de lecture`} />
        </div>

        <CorpsArticle blocs={article.blocs} />

        {/* L'APPEL DE FIN, en bas et une seule fois : il prend le dégradé, et
            l'en-tête passe en secondaire (règle 3). */}
        <div className="mt-12 rounded-ds-card-lg border border-ds-filet bg-ds-surface-carte px-5 py-7 text-center shadow-ds-card md:p-8">
          <h2 className="text-[20px] font-extrabold tracking-[-0.03em] text-ds-texte-fort md:text-[22px]">
            Essayez sur votre prochaine commande
          </h2>
          <p className="mt-2 mb-5 text-[15px] leading-[1.6] text-ds-texte-corps">
            Gratuit pendant le lancement. Aucune carte demandée.
          </p>
          <Link
            href={`/${locale}/inscription`}
            className="degrade-ds-marque inline-flex h-[52px] min-h-11 w-full items-center justify-center gap-2 rounded-ds-pill border border-transparent px-7 text-[15px] font-semibold tracking-[-0.02em] text-ds-texte-sur-marque shadow-ds-brand transition-shadow hover:shadow-ds-brand-hover md:w-auto"
          >
            Créer ma première commande
            <ArrowRight aria-hidden="true" size={18} strokeWidth={1.9} />
          </Link>
        </div>
      </main>
    </CoquePublique>
  );
}
