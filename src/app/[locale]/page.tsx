import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Check,
  Heart,
  Image as ImageIcon,
  Layers,
  Link2,
  Menu,
  MessageCircle,
  Package,
  Plus,
  Star,
  Store,
  Truck,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { routing } from "@/i18n/routing";
import { LogoMarque } from "@/components/acces/coque-acces";
import { MaquetteApplication, TelephoneClient } from "@/components/landing/maquette-application";
import { ChampDeLien, FriseDeSuivi, ZoneDeDepot } from "@/components/landing/illustrations-etapes";
import { SelecteurLangue } from "@/components/landing/selecteur-langue";
import { IconeInstagram, IconeTwitter, IconeYoutube } from "@/components/landing/icones-reseaux";
import { alternatesDe, openGraphDe } from "@/lib/seo/alternates";
import { donneesStructurees } from "@/lib/seo/donnees-structurees";
import { estLangueSupportee, LANGUE_DEFAUT } from "@/i18n/config";
import avatar1 from "@/../public/marque/avatar-1.jpg";
import avatar2 from "@/../public/marque/avatar-2.jpg";
import avatar3 from "@/../public/marque/avatar-3.jpg";
import avatar4 from "@/../public/marque/avatar-4.jpg";
import avatar5 from "@/../public/marque/avatar-5.jpg";

/**
 * LA LANDING — `ui_kits/marketing_site/index.html`, SECTION PAR SECTION.
 *
 * ⚠️ RÉÉCRITE LE 18/09/2026 SUR LA PLANCHE, ET POURQUOI. La version précédente
 * s'en écartait sur quatorze points, et la plupart venaient d'avoir REDESSINÉ au
 * lieu de COPIER : une section inventée (« Vos clients n'ont rien à installer »),
 * un téléphone reconstruit à la main, les textes des six cartes réécrits, la
 * navigation modifiée, un pied à deux colonnes. Wassim a fourni la liste ; elle
 * vit dans le commit. La règle de cette page est donc la sienne : on ne
 * redessine rien, on ne réécrit aucun texte, on n'ajoute aucune section.
 *
 * LES HUIT SECTIONS DE LA PLANCHE, DANS CET ORDRE, ET RIEN D'AUTRE :
 *   en-tête · héros · plateformes · fonctionnalités · étapes · témoignages ·
 *   bannière · pied
 *
 * LES TEXTES VIENNENT DU CATALOGUE DE LA PLANCHE, clé pour clé (`landing.kit`),
 * versés par programme depuis son `strings.js` dans les trois langues — aucune
 * chaîne n'a été retraduite à la main.
 *
 * LES PALIERS SONT CEUX DE SA FEUILLE — 1180, 900, 760, 640, 560 — et sont
 * écrits en `max-[…]` / `min-[…]` à la valeur exacte : un palier Tailwind
 * standard les aurait décalés de plusieurs dizaines de pixels.
 *
 * ⚠️ À UN PIXEL PRÈS, ET DANS LE BON SENS. La planche écrit `max-width: 900px`,
 * donc 900 INCLUS ; `max-[900px]:` de Tailwind v4 compile en `width < 900px`,
 * donc 900 EXCLU. Mesuré le 18/09/2026 à la largeur exacte de chaque palier :
 * à 900 et à 640 le produit ne basculait pas — titre de 64 au lieu de 46,
 * cartes sur trois colonnes au lieu de deux. Les bornes hautes s'écrivent
 * donc `max-[901px]`, `max-[641px]`… et les basses `min-[901px]`.
 *
 * ⚠️ CE QUI S'ÉCARTE DE LA PLANCHE, ET C'EST DIT ICI PLUTÔT QUE CACHÉ :
 *  - « Voir un exemple de page client » mène à la section de la documentation
 *    qui décrit cette page (`/docs#lien`). La planche vise une page de
 *    démonstration que le dépôt n'a pas ; en faire une vraie demande de rendre
 *    `/p/[token]` indépendante de sa lecture en base.
 *  - « À propos » mène à la présentation de la documentation : la planche
 *    l'écrit `href="#"`, un lien qui ne mène nulle part.
 *  - « Restez informé » n'a pas de liste de diffusion derrière lui : le champ
 *    envoie vers l'inscription, qui est la seule suite honnête.
 *  - l'année du pied est l'année courante : la planche écrit « © 2025 ».
 */

export function generateStaticParams(): Array<{ locale: string }> {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "landing" });
  const langue = estLangueSupportee(locale) ? locale : LANGUE_DEFAUT;
  return {
    title: t("metaTitre"),
    description: t("metaDescription"),
    robots: { index: true, follow: true, "max-image-preview": "large" },
    alternates: alternatesDe(langue, ""),
    openGraph: openGraphDe(langue, "", {
      titre: t("metaTitre"),
      description: t("metaDescription"),
    }),
  };
}

/* ---------------------------------------------------------------------------
 * LES BOUTONS DU DESIGN SYSTEM — `Button`, tailles `sm` (36 · 16 · 13) et `lg`
 * (52 · 28 · 15), graisse 600, interlettrage -0,02em, rayon pilule.
 * ⚠️ Le dégradé porte TOUJOURS `text-ds-texte-sur-marque` : sans lui l'appel
 * principal héritait de l'encre — du noir sur violet (13/09/2026).
 * ------------------------------------------------------------------------- */
const BOUTON_LG =
  "inline-flex h-13 items-center justify-center gap-2 rounded-ds-pill px-7 text-[15px] font-semibold tracking-[-0.02em] whitespace-nowrap transition-shadow";
const BOUTON_SM =
  "inline-flex h-9 items-center justify-center gap-2 rounded-ds-pill px-4 text-[13px] font-semibold tracking-[-0.02em] whitespace-nowrap transition-shadow";
const PRIMAIRE =
  "degrade-ds-marque border border-transparent text-ds-texte-sur-marque shadow-ds-brand hover:shadow-ds-brand-hover";
const SECONDAIRE =
  "border border-ds-filet bg-ds-surface-carte text-ds-texte-fort shadow-ds-sm hover:shadow-ds-md";

/** `SectionHeading` : eyebrow, titre de 44 au mot final en dégradé, sous-titre. */
function EnTeteSection({
  surtitre,
  titre,
  motFort,
  sousTitre,
}: {
  readonly surtitre: string;
  readonly titre: string;
  readonly motFort: string;
  readonly sousTitre: string;
}) {
  return (
    <div className="mx-auto flex max-w-[720px] flex-col items-center gap-[18px] text-center">
      <span className="inline-flex items-center gap-2 rounded-ds-pill bg-ds-surface-teinte px-3.5 py-1.5 text-[11.5px] leading-[normal] font-bold tracking-[0.12em] text-ds-accent-encre uppercase md:text-[11px]">
        <span aria-hidden="true" className="h-1 w-1 rounded-full bg-current opacity-60" />
        {surtitre}
        <span aria-hidden="true" className="h-1 w-1 rounded-full bg-current opacity-60" />
      </span>
      <h2 className="text-[44px] leading-[1.05] font-extrabold tracking-[-0.045em] text-balance text-ds-texte-fort [:lang(zh-CN)_&]:leading-[1.24]">
        {titre}
        {/* Vide en chinois pour le titre des étapes : la planche n'y met aucun mot
            en dégradé, et une `span` vide n'a rien à peindre. */}
        {motFort === "" ? null : (
          <>
            {" "}
            <span className="degrade-ds-marque bg-clip-text text-transparent [-webkit-text-fill-color:transparent]">
              {motFort}
            </span>
          </>
        )}
      </h2>
      <p className="text-[16px] leading-[1.55] text-pretty text-ds-texte-corps">{sousTitre}</p>
    </div>
  );
}

/** Une `Card` du design system : fond carte, filet, rayon 16, ombre de carte. */
const CARTE = "rounded-ds-card border border-ds-filet bg-ds-surface-carte shadow-ds-card";

export default async function Accueil({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const langue = estLangueSupportee(locale) ? locale : LANGUE_DEFAUT;
  const t = await getTranslations("landing");
  const k = await getTranslations("landing.kit");

  const graphe = donneesStructurees(langue, {
    nom: "DropLink",
    description: t("metaDescription"),
  });

  const inscription = `/${locale}/inscription`;
  const connexion = `/${locale}/connexion`;
  const exemple = `/${locale}/docs#lien`;

  /* La navigation de la planche : cinq entrées, dans cet ordre. */
  const NAV: ReadonlyArray<readonly [string, string]> = [
    [k("navFeatures"), "#fonctionnalites"],
    [k("navHow"), "#etapes"],
    [k("navPricing"), `/${locale}/docs#plans`],
    [k("navDocs"), `/${locale}/docs`],
    [k("navFaq"), `/${locale}/docs#faq`],
  ];

  const PASTILLES: ReadonlyArray<readonly [LucideIcon, string, string, string]> = [
    [Upload, k("chip1"), k("chip1c"), "left-0 top-[170px]"],
    [Truck, k("chip2"), k("chip2c"), "-left-[18px] top-[300px]"],
    [Link2, k("chip3"), k("chip3c"), "right-0 top-[170px]"],
    [Store, k("chip4"), k("chip4c"), "-right-3 top-[300px]"],
  ];

  const FONCTIONNALITES: ReadonlyArray<readonly [LucideIcon, string, string]> = [
    [Package, k("f1"), k("f1b")],
    [ImageIcon, k("f2"), k("f2b")],
    [Truck, k("f3"), k("f3b")],
    [Link2, k("f4"), k("f4b")],
    [BarChart3, k("f5"), k("f5b")],
    [Layers, k("f6"), k("f6b")],
  ];

  const TEMOIGNAGES = [
    { nom: "Yanis", role: k("q1role"), citation: k("q1"), avatar: avatar2 },
    { nom: "Sarah", role: k("q2role"), citation: k("q2"), avatar: avatar3 },
    { nom: "Mehdi", role: k("q3role"), citation: k("q3"), avatar: avatar4 },
  ] as const;

  /* La planche écrit « © 2025 » en dur ; l'année est celle du rendu. */
  const droits = k("footRights").replace(/\b20\d\d\b/, String(new Date().getFullYear()));

  /* Liens du pied : la planche fait 44 px au téléphone par marge négative. */
  const lienPied =
    "text-[13px] leading-[normal] font-medium text-ds-texte-sourdine hover:text-ds-texte-fort max-[767.98px]:-my-[5px] max-[767.98px]:inline-flex max-[767.98px]:min-h-11 max-[767.98px]:items-center max-[767.98px]:self-start";

  return (
    <div className="min-h-screen bg-[image:var(--degrade-ds-page)] bg-fixed">
      {graphe === null ? null : (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(graphe).replace(/</g, "\\u003c") }}
        />
      )}

      {/* `#root` de la planche : 1280 de large, gouttière 32 · 20 sous 900 · 16 sous 640. */}
      <div className="mx-auto w-full max-w-[1280px] px-4 min-[641px]:px-5 min-[901px]:px-8">
        {/* ==== 1 · EN-TÊTE ============================================== */}
        <header className="relative mx-auto w-full max-w-[1180px] py-[18px]">
          <div className="flex items-center justify-between gap-4">
            <Link href={`/${locale}`} aria-label="DropLink" className="flex min-h-11 flex-none items-center md:min-h-0">
              <LogoMarque hauteur={38} />
            </Link>
            <nav aria-label={k("menu")} className="hidden gap-7 min-[1181px]:flex">
              {NAV.map(([libelle, cible]) => (
                <a
                  key={cible}
                  href={cible}
                  className="text-[14px] leading-[normal] font-semibold whitespace-nowrap text-ds-texte-corps hover:text-ds-texte-fort"
                >
                  {libelle}
                </a>
              ))}
            </nav>
            <div className="flex items-center gap-2.5">
              <SelecteurLangue locale={locale} compact />
              <span className="hidden items-center gap-2.5 min-[641px]:flex">
                <Link href={connexion} className={BOUTON_SM + " " + SECONDAIRE}>
                  {k("login")}
                </Link>
                <Link href={inscription} className={BOUTON_SM + " " + PRIMAIRE}>
                  {k("signup")}
                  <ArrowRight aria-hidden="true" size={15} strokeWidth={2} />
                </Link>
              </span>
              {/* LE BURGER N'APPARAÎT QUE SOUS 640 : entre 640 et 1180 la
                  navigation disparaît sans lui, comme dans la planche. */}
              <details className="group min-[641px]:hidden">
                <summary
                  aria-label={k("menu")}
                  className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-ds-card border border-ds-filet bg-ds-surface-carte text-ds-texte-fort [&::-webkit-details-marker]:hidden"
                >
                  <Menu aria-hidden="true" size={19} />
                </summary>
                <div className="absolute inset-x-0 top-full z-40 mt-3.5 flex flex-col gap-1 rounded-ds-card-lg border border-ds-filet bg-ds-surface-carte p-3 shadow-ds-card">
                  {NAV.map(([libelle, cible]) => (
                    <a
                      key={cible}
                      href={cible}
                      className="flex min-h-11 items-center rounded-ds-sm px-3 text-[15px] font-semibold text-ds-texte-corps"
                    >
                      {libelle}
                    </a>
                  ))}
                  <Link
                    href={connexion}
                    className="flex min-h-11 items-center rounded-ds-sm px-3 text-[15px] font-semibold text-ds-texte-corps"
                  >
                    {k("login")}
                  </Link>
                  <Link href={inscription} className={"mt-1 w-full " + BOUTON_LG.replace("h-13", "h-11") + " " + PRIMAIRE}>
                    {k("signup")}
                    <ArrowRight aria-hidden="true" size={16} strokeWidth={2} />
                  </Link>
                </div>
              </details>
            </div>
          </div>
        </header>

        <main id="contenu">
          {/* ==== 2 · HÉROS =============================================== */}
          <section className="relative mx-auto w-full max-w-[1180px] pt-[34px] text-center max-[641px]:text-left">
            {/* Le badge de confiance : « + », cinq avatars qui se chevauchent
                (30 % de leur côté), le texte en 12/700. */}
            <div className="inline-flex max-w-full items-center gap-3 rounded-ds-pill bg-[rgba(255,255,255,0.8)] py-[7px] pr-4 pl-2.5 shadow-ds-sm max-[641px]:mb-1 backdrop-blur-[14px] backdrop-saturate-[1.4]">
              <Plus aria-hidden="true" size={14} className="flex-none text-ds-accent" />
              <span className="inline-flex flex-none items-center">
                {[avatar1, avatar2, avatar3, avatar4, avatar5].map((a, i) => (
                  <Image
                    key={i}
                    src={a}
                    alt=""
                    width={26}
                    height={26}
                    className={"h-[26px] w-[26px] rounded-full object-cover ring-2 ring-ds-surface-carte" + (i === 0 ? "" : " -ml-[7.8px]")}
                  />
                ))}
              </span>
              <span className="text-[12px] leading-[normal] font-bold text-ds-texte-corps max-[767.98px]:text-[11.5px]">
                {k("trust")}
              </span>
            </div>

            {/* Deux lignes par un `<br>`, comme la planche ; l'espace avant lui
                garde la phrase lisible d'un seul tenant pour un lecteur d'écran
                et un moteur (il disparaît en fin de ligne). */}
            <h1 className="mt-[26px] text-[64px] leading-[0.98] font-extrabold tracking-[-0.045em] text-balance text-ds-texte-fort max-[901px]:text-[46px] max-[641px]:text-[34px] max-[641px]:leading-[1.06] [:lang(zh-CN)_&]:leading-[1.24]">
              {k("heroTitle1")}{" "}
              <br />
              {k("heroTitle2")}
              <span className="degrade-ds-marque bg-clip-text text-transparent [-webkit-text-fill-color:transparent]">
                {k("heroTitleHl")}
              </span>
            </h1>
            <p className="mx-auto mt-5 max-w-[500px] text-[17px] leading-[1.55] text-pretty text-ds-texte-corps max-[641px]:text-[15.5px]">
              {k("heroLead")}
            </p>

            <div className="mt-7 flex flex-wrap justify-center gap-3.5 max-[641px]:flex-col max-[641px]:items-stretch">
              <Link href={inscription} className={BOUTON_LG + " " + PRIMAIRE}>
                {k("ctaPrimary")}
                <ArrowRight aria-hidden="true" size={17} strokeWidth={2} />
              </Link>
              <Link href={exemple} className={BOUTON_LG + " " + SECONDAIRE}>
                {k("ctaSecondary")}
              </Link>
            </div>

            <ul className="mt-[22px] flex flex-wrap justify-center gap-7 max-[641px]:flex-col max-[641px]:items-start max-[641px]:gap-2.5">
              {[k("perk1"), k("perk2"), k("perk3")].map((garantie) => (
                <li key={garantie} className="inline-flex items-center gap-[9px]">
                  <span className="inline-flex h-[18px] w-[18px] flex-none items-center justify-center rounded-ds-xs border border-ds-accent bg-ds-accent text-ds-texte-sur-marque">
                    <Check aria-hidden="true" size={12} strokeWidth={3} />
                  </span>
                  <span className="text-[14px] leading-[normal] font-medium text-ds-texte-corps">{garantie}</span>
                </li>
              ))}
            </ul>

            {/* Les quatre pastilles, absolues dans le conteneur de 1180, aux
                coordonnées de la planche. Masquées sous 1181 : pas la place. */}
            <div aria-hidden="true" className="hidden min-[1181px]:block">
              {PASTILLES.map(([Icone, titre, legende, place]) => (
                <span
                  key={titre}
                  className={
                    "absolute inline-flex items-center gap-[11px] rounded-ds-card border border-[rgba(255,255,255,0.9)] bg-[rgba(255,255,255,0.86)] py-[11px] pr-4 pl-[11px] text-left shadow-ds-md backdrop-blur-[14px] backdrop-saturate-[1.4] " +
                    place
                  }
                >
                  <span className="inline-flex h-[34px] w-[34px] flex-none items-center justify-center rounded-ds-sm bg-ds-surface-teinte text-ds-accent">
                    <Icone size={16} strokeWidth={1.9} />
                  </span>
                  <span className="flex flex-col gap-px">
                    <span className="text-[13px] leading-[normal] font-bold text-ds-texte-fort">{titre}</span>
                    <span className="text-[11.5px] leading-[normal] font-medium text-ds-texte-sourdine md:text-[11px]">{legende}</span>
                  </span>
                </span>
              ))}
            </div>

            {/* LES DEUX MAQUETTES. Au-dessus de 1180, bloc de 600 et téléphone en
                absolu ; en dessous, ils s'empilent.

                ⚠️ DEUX TRANSFORMATIONS EMBOÎTÉES, PAS UNE SEULE À 0,204. La planche
                réduit la fenêtre à 0,68 sur elle-même, puis son ENVELOPPE à 0,42 et
                0,30 sous 760 et 560 — enveloppe qui est aussi rognée à la largeur
                de la colonne. Chacune tourne autour de son propre haut-centre : le
                produit l'avait écrit en un seul facteur composé (0,2856 et 0,204),
                même taille mais pas le même recadrage, et toute la maquette
                s'affichait 39 px plus à gauche qu'au kit, à 390 px. */}
            <div className="relative mt-8 flex flex-col items-center gap-2 min-[761px]:gap-6 min-[1181px]:mt-10 min-[1181px]:block min-[1181px]:h-[600px]">
              <div className="h-[190px] max-w-full origin-top scale-[0.3] overflow-hidden min-[561px]:h-[260px] min-[561px]:scale-[0.42] min-[761px]:h-auto min-[761px]:scale-100 min-[1181px]:absolute min-[1181px]:left-1/2 min-[1181px]:-translate-x-[64%]">
                <div className="w-[1180px] origin-top scale-[0.68]">
                  <MaquetteApplication />
                </div>
              </div>
              <div className="min-[1181px]:absolute min-[1181px]:-top-2.5 min-[1181px]:-right-[30px]">
                <TelephoneClient largeur={286} />
              </div>
            </div>
          </section>

          {/* ==== 3 · PLATEFORMES ========================================= */}
          <div className="pt-9 pb-3.5 text-center">
            <div className="text-[12px] leading-[normal] font-semibold text-ds-texte-sourdine">{k("usedOn")}</div>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-[54px] max-[901px]:gap-7">
              <span className="text-[22px] font-semibold leading-[normal] tracking-[-0.02em] text-ds-ink-300 italic">Vinted</span>
              <span className="text-[22px] font-bold leading-[normal] tracking-[-0.02em] text-ds-ink-300">ebay</span>
              <span className="text-[22px] font-semibold leading-[normal] tracking-[-0.02em] text-ds-ink-300">amazon</span>
              <span className="text-[21px] font-bold leading-[normal] tracking-[-0.02em] text-ds-ink-300">shopify</span>
              <span className="text-[20px] font-bold leading-[normal] tracking-[-0.02em] text-ds-ink-300">Leboncoin</span>
              <span className="text-[20px] font-bold leading-[normal] tracking-[-0.02em] text-ds-ink-300">TikTok Shop</span>
            </div>
          </div>

          {/* ==== 4 · FONCTIONNALITÉS ===================================== */}
          <section id="fonctionnalites" className="mx-auto w-full max-w-[1180px] scroll-mt-6 py-[72px]">
            <EnTeteSection
              surtitre={k("featEyebrow")}
              titre={k("featTitle")}
              motFort={k("featHl")}
              sousTitre={k("featSub")}
            />
            <div className="mt-11 grid grid-cols-3 gap-5 max-[901px]:grid-cols-2 max-[641px]:grid-cols-1">
              {FONCTIONNALITES.map(([Icone, titre, corps]) => (
                <div
                  key={titre}
                  className={
                    CARTE +
                    " flex items-start gap-4 p-[22px] transition-[transform,box-shadow] duration-[240ms] hover:-translate-y-0.5 hover:shadow-ds-md"
                  }
                >
                  <span className="inline-flex h-11 w-11 flex-none items-center justify-center rounded-ds-md bg-ds-surface-teinte text-ds-accent">
                    <Icone aria-hidden="true" size={20} strokeWidth={1.9} />
                  </span>
                  <div className="flex flex-col gap-1.5">
                    <h3 className="text-[18px] leading-[1.1] font-bold tracking-[-0.02em] text-ds-texte-fort">{titre}</h3>
                    <p className="text-[14px] leading-[1.55] font-medium text-ds-texte-corps">{corps}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ==== 5 · ÉTAPES ============================================== */}
          <section id="etapes" className="mx-auto w-full max-w-[1180px] scroll-mt-6 pt-10 pb-[72px]">
            <EnTeteSection
              surtitre={k("howEyebrow")}
              titre={k("howTitle")}
              motFort={k("howHl")}
              sousTitre={k("howSub")}
            />
            <div className="mt-11 grid grid-cols-3 items-start gap-5 max-[901px]:grid-cols-2 max-[641px]:grid-cols-1">
              {(
                [
                  ["01", k("s1"), k("s1b"), <ZoneDeDepot key="depot" />],
                  ["02", k("s2"), k("s2b"), <ChampDeLien key="lien" />],
                  ["03", k("s3"), k("s3b"), <FriseDeSuivi key="frise" />],
                ] as const
              ).map(([numero, titre, corps, illustration]) => (
                <div key={numero} className={CARTE + " flex flex-col gap-4 p-6"}>
                  <div className="flex items-start gap-3.5">
                    <span className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-ds-pill bg-ds-surface-teinte text-[14px] font-extrabold text-ds-accent-encre">
                      {numero}
                    </span>
                    <div className="flex flex-col gap-1.5">
                      <h3 className="text-[18px] leading-[1.1] font-bold tracking-[-0.045em] text-ds-texte-fort">{titre}</h3>
                      <p className="text-[14px] leading-[1.55] font-medium text-ds-texte-corps">{corps}</p>
                    </div>
                  </div>
                  {illustration}
                </div>
              ))}
            </div>
          </section>

          {/* ==== 6 · TÉMOIGNAGES ========================================= */}
          <section id="temoignages" className="mx-auto w-full max-w-[1180px] scroll-mt-6 pb-[72px]">
            <EnTeteSection
              surtitre={k("testiEyebrow")}
              titre={k("testiTitle")}
              motFort={k("testiHl")}
              sousTitre={k("testiSub")}
            />
            <div className="mt-11 grid grid-cols-3 gap-5 max-[901px]:grid-cols-2 max-[641px]:grid-cols-1">
              {TEMOIGNAGES.map((q) => (
                <figure key={q.nom} className={CARTE + " flex flex-col gap-3 p-5"}>
                  <figcaption className="flex items-center gap-[11px]">
                    <Image src={q.avatar} alt="" width={34} height={34} className="h-[34px] w-[34px] rounded-full object-cover" />
                    <span className="flex flex-col gap-px">
                      <span className="text-[14px] leading-[normal] font-bold text-ds-texte-fort">{q.nom}</span>
                      <span className="text-[13px] leading-[normal] font-medium text-ds-texte-sourdine">{q.role}</span>
                    </span>
                  </figcaption>
                  <span aria-hidden="true" className="flex gap-0.5">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <Star key={i} size={13} strokeWidth={0} className="fill-[#F5B843]" />
                    ))}
                  </span>
                  <blockquote className="text-[14px] leading-[1.55] font-medium text-ds-texte-corps">
                    “{q.citation}”
                  </blockquote>
                </figure>
              ))}
            </div>
          </section>

          {/* ==== 7 · BANNIÈRE ============================================ */}
          <section className="mx-auto w-full max-w-[1180px] pb-14">
            <div className="degrade-ds-marque-diagonal relative overflow-hidden rounded-ds-3xl px-14 py-[52px] shadow-ds-lg max-[901px]:px-7 max-[901px]:py-[34px]">
              <div className="relative z-10 max-w-[520px]">
                <h2 className="text-[40px] leading-[1.05] font-extrabold tracking-[-0.04em] text-ds-texte-sur-marque max-[901px]:text-[32px] max-[641px]:text-[27px] [:lang(zh-CN)_&]:leading-[1.24]">
                  {k("bannerTitle1")}
                  <br />
                  {k("bannerTitle2")}
                </h2>
                <p className="mt-3.5 text-[15px] leading-[1.55] text-[rgba(255,255,255,0.88)]">{k("bannerSub")}</p>
                <div className="mt-[26px] flex flex-wrap gap-3">
                  <Link href={inscription} className={BOUTON_LG + " " + SECONDAIRE}>
                    {k("ctaPrimary")}
                    <ArrowRight aria-hidden="true" size={17} strokeWidth={2} />
                  </Link>
                  <Link
                    href={exemple}
                    className={BOUTON_LG + " border border-[rgba(255,255,255,0.5)] text-ds-texte-sur-marque hover:bg-[rgba(255,255,255,0.12)]"}
                  >
                    {k("ctaSecondaryShort")}
                  </Link>
                </div>
              </div>
              {/* Recadré par l'`overflow: hidden` de la bande ; masqué sous 900. */}
              <div aria-hidden="true" className="pointer-events-none absolute top-2.5 right-[30px] hidden min-[901px]:block">
                <TelephoneClient largeur={272} />
              </div>
            </div>
          </section>
        </main>

        {/* ==== 8 · PIED ===================================================== */}
        <footer className="mx-auto w-full max-w-[1180px] pt-12 pb-7">
          <div className="grid grid-cols-[1.4fr_1fr_1fr_1.3fr] gap-8 max-[901px]:grid-cols-2 max-[901px]:gap-[26px] max-[641px]:grid-cols-1">
            {/* Sous 768, la planche retire l'écart des colonnes du pied et pose 5 px
                sous chacun de leurs `span` directs : le texte et le sélecteur de
                langue ici, pas le logo, qui n'y est pas enveloppé. */}
            <div className="flex flex-col gap-3 max-[767.98px]:gap-0">
              <span className="self-start">
                <LogoMarque hauteur={32} />
              </span>
              <span className="text-[13px] leading-[normal] font-medium text-ds-texte-sourdine max-[767.98px]:mb-[5px]">
                {k("footTag")}
              </span>
              <div aria-hidden="true" className="mt-1 flex gap-3.5 text-ds-texte-sourdine">
                <IconeTwitter />
                <IconeInstagram />
                <IconeYoutube />
                <MessageCircle size={16} />
              </div>
              <div className="self-start max-[767.98px]:mb-[5px]">
                <SelecteurLangue locale={locale} versLeHaut />
              </div>
            </div>

            <div className="flex flex-col gap-[9px] max-[767.98px]:gap-0">
              <span className="mb-[3px] text-[13px] leading-[normal] font-extrabold text-ds-texte-fort max-[767.98px]:mb-[5px]">
                {k("footProduct")}
              </span>
              <a href="#fonctionnalites" className={lienPied}>{k("navFeatures")}</a>
              <a href="#etapes" className={lienPied}>{k("navHow")}</a>
              <Link href={`/${locale}/docs`} className={lienPied}>{k("navDocs")}</Link>
              <Link href={`/${locale}/docs#faq`} className={lienPied}>{k("footFaq")}</Link>
            </div>

            <div className="flex flex-col gap-[9px] max-[767.98px]:gap-0">
              <span className="mb-[3px] text-[13px] leading-[normal] font-extrabold text-ds-texte-fort max-[767.98px]:mb-[5px]">
                {k("footCompany")}
              </span>
              <Link href={`/${locale}/docs#presentation`} className={lienPied}>{k("footAbout")}</Link>
              <Link href={`/${locale}/docs#support`} className={lienPied}>{k("footContact")}</Link>
              <Link href={`/${locale}/conditions`} className={lienPied}>{k("footTerms")}</Link>
              <Link href={`/${locale}/confidentialite`} className={lienPied}>{k("footPrivacy")}</Link>
            </div>

            <div className="flex flex-col gap-2.5 max-[767.98px]:gap-0">
              <span className="text-[13px] leading-[normal] font-extrabold text-ds-texte-fort max-[767.98px]:mb-[5px]">
                {k("footNews")}
              </span>
              <form
                action={inscription}
                className="flex items-center gap-2 rounded-ds-pill border border-ds-filet bg-ds-surface-carte py-1.5 pr-1.5 pl-4"
              >
                <input
                  type="email"
                  aria-label={k("footMail")}
                  placeholder={k("footMail")}
                  className="min-w-0 flex-1 border-none bg-transparent text-[13px] font-medium max-[767.98px]:min-h-11 text-ds-texte-fort outline-none placeholder:text-ds-texte-corps"
                />
                <button
                  type="submit"
                  aria-label={k("footNews")}
                  className="degrade-ds-marque inline-flex h-[30px] w-[30px] flex-none items-center justify-center rounded-ds-sm text-ds-texte-sur-marque max-[767.98px]:-my-[7px] max-[767.98px]:min-h-11 max-[767.98px]:w-11"
                >
                  <ArrowRight aria-hidden="true" size={14} />
                </button>
              </form>
            </div>
          </div>

          {/* 12 px d'écart à toutes les largeurs : la feuille de la planche demande
              8 sous 640, mais son style en ligne (12) l'emporte, et c'est 12 qu'elle
              rend. */}
          <div className="mt-8 flex justify-between gap-3 border-t border-ds-filet pt-[18px] text-[12px] leading-[normal] font-medium text-ds-texte-tenu max-[641px]:flex-col">
            <span>{droits}</span>
            <span className="inline-flex items-center gap-1.5">
              {k("footMade")}
              <Heart aria-hidden="true" size={12} className="fill-ds-coral-500 text-ds-coral-500" />
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
