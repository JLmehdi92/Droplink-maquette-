import Link from "next/link";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { BookOpen } from "lucide-react";
import { CoquePublique } from "@/components/coque-publique";
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

const TITRE = "Le blog — DropLink";
const DESCRIPTION =
  "Ce qu'on apprend en parlant à des vendeurs qui envoient leurs commandes en message privé : les outils, les pièges, et ce qui fait qu'un client cesse de demander où en est son colis.";

/**
 * ⚠️ ON NE PRÉREND QUE LA LANGUE DU BLOG. Rendre les trois créerait deux pages
 * dont le seul travail est d'appeler `notFound()`.
 */
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

  const articles = tousLesArticles();

  return (
    <CoquePublique locale={locale} pastille="Blog" enteteSecondaire={false}>
      {/* `blog/index.html` du design system, écrit le 14/09/2026 avant ce
          fichier. « Créer un compte » garde le dégradé : l'index n'a pas
          d'autre action. */}
      <main
        id="contenu"
        className="mx-auto w-full max-w-[1240px] flex-1 px-4 pt-8 pb-12 md:px-[34px] md:pt-14 md:pb-[88px]"
      >
        <span className="inline-flex items-center gap-2 rounded-ds-pill border border-ds-violet-200 bg-ds-surface-teinte px-3.5 py-[7px] text-[12.5px] font-bold text-ds-accent-encre">
          <BookOpen aria-hidden="true" size={14} strokeWidth={2} />
          Le blog
        </span>
        <h1 className="mt-5 max-w-[760px] text-[30px] leading-[1.06] font-extrabold tracking-[-0.045em] text-balance text-ds-texte-fort sm:text-[36px] md:text-[44px]">
          Vendre en direct, sans y passer ses soirées
        </h1>
        <p className="mt-[18px] max-w-[680px] text-[16px] leading-[1.65] text-pretty text-ds-texte-corps md:text-[17px]">
          {DESCRIPTION}
        </p>

        {/* UNE COLONNE EN TÉLÉPHONE, TROIS EN BUREAU. Deux cartes côte à côte
            dans 350 px couperaient chaque titre en cinq lignes ; au-delà de
            trois colonnes, les titres se coupent aussi. */}
        <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-3.5 md:mt-11 md:grid-cols-3 md:gap-5">
          {articles.map((a) => (
            <Link
              key={a.slug}
              href={`/${locale}/blog/${a.slug}`}
              className="flex flex-col gap-3 rounded-ds-card-lg border border-ds-filet bg-ds-surface-carte p-6 shadow-ds-card transition-shadow hover:shadow-ds-md"
            >
              <span className="text-[11.5px] font-extrabold tracking-[0.12em] text-ds-accent-encre uppercase md:text-[11px]">
                {a.etiquette}
              </span>
              <h2 className="text-[20px] leading-[1.3] font-bold tracking-[-0.02em] text-balance text-ds-texte-fort">{a.titre}</h2>
              <p className="flex-1 text-[14.5px] leading-[1.6] text-ds-texte-corps">{a.resume}</p>
              <MetaArticle date={a.date} duree={`${a.minutes} min`} />
            </Link>
          ))}
        </div>
      </main>
    </CoquePublique>
  );
}
