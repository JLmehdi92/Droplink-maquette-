import Link from "next/link";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { CoquePublique } from "@/components/coque-publique";
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
    <CoquePublique
      locale={locale}
      action={
        <Link
          href={`/${locale}`}
          className="-my-3.5 inline-flex min-h-11 items-center font-headline-md text-[13px] leading-4 font-semibold text-ardoise transition-colors hover:text-on-surface md:text-[14px]"
        >
          Découvrir DropLink
        </Link>
      }
    >
      <div className="px-5 pt-[30px] pb-9 md:px-10 md:pt-14 md:pb-16">
        <div className="max-w-[720px]">
          <span className="inline-block rounded-full bg-[#f1eefe] px-[11px] py-[5px] font-headline-md text-[10px] font-bold tracking-[0.04em] text-violet md:text-[11px]">
            LE BLOG
          </span>
          <h1 className="mt-3.5 mb-2.5 font-headline-xl text-[30px] leading-9 font-extrabold tracking-[-0.03em] text-on-surface md:mt-4 md:mb-3 md:text-[46px] md:leading-[52px]">
            Vendre en direct, sans y passer ses soirées
          </h1>
          <p className="font-body-lg text-[15px] leading-[25px] text-ardoise md:text-[16px] md:leading-[27px]">
            {DESCRIPTION}
          </p>
        </div>

        {/* UNE COLONNE EN TÉLÉPHONE, TROIS EN BUREAU. Deux cartes côte à côte
            dans 350 px couperaient chaque titre en cinq lignes ; au-delà de
            trois colonnes, les titres se coupent aussi. */}
        <div className="mt-7 grid gap-3.5 md:mt-11 md:grid-cols-3 md:gap-5">
          {articles.map((a) => (
            <Link
              key={a.slug}
              href={`/${locale}/blog/${a.slug}`}
              className="block rounded-2xl border border-filet-controle bg-surface-container-lowest p-[18px] transition-colors hover:border-[#d7d3f8] md:p-6"
            >
              <span className="font-headline-md text-[11px] font-semibold text-sourdine md:text-[12px]">
                <time dateTime={a.date}>{dateLisible(a.date)}</time> · {a.minutes} min
              </span>
              <h2 className="mt-2 mb-1.5 font-headline-md text-[18px] leading-6 font-bold tracking-[-0.02em] text-on-surface md:mt-2.5 md:mb-2 md:text-[20px] md:leading-[26px]">
                {a.titre}
              </h2>
              <p className="font-body-lg text-[13px] leading-[21px] text-ardoise md:text-[14px] md:leading-[23px]">
                {a.resume}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </CoquePublique>
  );
}

/**
 * La date en toutes lettres.
 *
 * ⚠️ EN DUR PLUTÔT QU'AVEC `Intl.DateTimeFormat`. Le blog n'existe que dans une
 * langue : passer par une API de localisation ferait dépendre l'affichage du
 * fuseau et de la locale du serveur, pour un résultat qui doit être français
 * quoi qu'il arrive. Et `new Date("2026-09-08")` est interprété en UTC, ce qui
 * décale la date d'un jour dans les fuseaux négatifs — un article publié le 8
 * s'afficherait « 7 septembre » pour une partie des lecteurs.
 */
const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
] as const;

function dateLisible(iso: string): string {
  const [annee, mois, jour] = iso.split("-");
  const indice = Number(mois) - 1;
  const nom = MOIS[indice];
  if (annee === undefined || jour === undefined || nom === undefined) return iso;
  return `${Number(jour)} ${nom} ${annee}`;
}
