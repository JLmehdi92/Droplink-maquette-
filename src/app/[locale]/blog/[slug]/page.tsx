import Link from "next/link";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { CoquePublique } from "@/components/coque-publique";
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
    <CoquePublique
      locale={locale}
      action={
        <Link
          href={`/${locale}/blog`}
          className="-my-3.5 inline-flex min-h-11 items-center font-headline-md text-[13px] leading-4 font-semibold text-ardoise transition-colors hover:text-on-surface md:text-[14px]"
        >
          Le blog
        </Link>
      }
    >
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

      <div className="px-5 pt-[26px] pb-9 md:px-10 md:pt-11 md:pb-16">
        {/* 720 px : au-delà d'environ 90 caractères par ligne, l'œil perd le
            début de la ligne suivante. */}
        <div className="mx-auto max-w-[720px]">
          <Link
            href={`/${locale}/blog`}
            className="-my-[14.5px] inline-flex min-h-11 items-center font-headline-md text-[12px] font-semibold text-sourdine transition-colors hover:text-violet md:text-[13px]"
          >
            ← Le blog
          </Link>

          <span className="mt-4 inline-block rounded-full bg-[#f1eefe] px-[11px] py-[5px] font-headline-md text-[10px] font-bold tracking-[0.04em] text-violet md:mt-[18px] md:text-[11px]">
            {article.etiquette}
          </span>

          <h1 className="mt-3 mb-2.5 font-headline-xl text-[28px] leading-[34px] font-extrabold tracking-[-0.03em] text-on-surface md:mt-3.5 md:mb-3.5 md:text-[42px] md:leading-[50px]">
            {article.titre}
          </h1>

          <p className="mb-6 font-headline-md text-[13px] font-semibold text-sourdine md:mb-8 md:text-[14px]">
            <time dateTime={article.date}>{dateLisible(article.date)}</time> ·{" "}
            {article.minutes} min de lecture
          </p>

          <CorpsArticle blocs={article.blocs} />

          {/* L'APPEL DE FIN, en bas et une seule fois. Le dégradé de marque est
              réservé à UNE action principale par écran. */}
          <div className="mt-[34px] rounded-2xl border border-filet-controle px-[18px] py-[22px] text-center md:mt-11 md:p-7">
            <p className="mb-2 font-headline-md text-[18px] font-extrabold tracking-[-0.02em] text-on-surface md:text-[20px]">
              Essayez sur votre prochaine commande
            </p>
            <p className="mb-4 font-body-lg text-[13px] leading-[21px] text-sourdine md:mb-[18px] md:text-[14px] md:leading-[22px]">
              Gratuit pendant le lancement. Aucune carte demandée.
            </p>
            <Link
              href={`/${locale}/inscription`}
              className="degrade-marque flex min-h-13 w-full items-center justify-center gap-[9px] rounded-full px-[26px] font-headline-md text-[15px] font-bold transition-opacity hover:opacity-90 md:inline-flex md:h-12 md:w-auto md:min-h-0"
            >
              Créer ma première commande
            </Link>
          </div>
        </div>
      </div>
    </CoquePublique>
  );
}

const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
] as const;

/** Voir la note de `blog/page.tsx` : en dur plutôt que par `Intl`. */
function dateLisible(iso: string): string {
  const [annee, mois, jour] = iso.split("-");
  const nom = MOIS[Number(mois) - 1];
  if (annee === undefined || jour === undefined || nom === undefined) return iso;
  return `${Number(jour)} ${nom} ${annee}`;
}
