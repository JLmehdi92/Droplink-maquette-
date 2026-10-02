import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Crown, Tag } from "lucide-react";
import { CoquePublique } from "@/components/coque-publique";
import { creerClientServeur } from "@/lib/supabase/server";
import { PRIX_PRO_EUR } from "@/lib/paiement/plan";
import { routing } from "@/i18n/routing";
import { alternatesDe, openGraphDe } from "@/lib/seo/alternates";
import { estLangueSupportee, LANGUE_DEFAUT } from "@/i18n/config";

/**
 * LA PAGE TARIFS — planche `ui_kits/legal/tarifs.html`, écrite le 26/09/2026
 * avant cette route.
 *
 * Wassim : « tu créer la page et tu mets l'offre que on a mit hier ». Le lien
 * « Tarifs » de la landing menait à une section de la documentation, et Lemon
 * Squeezy demande un « detailed pricing plan » avant d'ouvrir les paiements.
 *
 * ⚠️ LE CONTENU EST CELUI DE « PASSER AU PRO », PAS UNE COPIE. Les features, le
 * tableau et la mention de facturation sont lus dans le catalogue `passerPro` :
 * la page qui vend et l'écran qui encaisse ne peuvent pas dire deux choses
 * différentes. Le prix vient de `PRIX_PRO_EUR`, comme partout.
 *
 * ⚠️ LES DEUX PLAFONDS SONT LUS EN BASE, aussi par `anon` (migration 196) : ils se
 * règlent dans l'administration, sans une ligne de code, et une page qui les
 * recopierait les contredirait au premier réglage. Illisibles, les phrases
 * perdent leur nombre plutôt que d'en inventer un.
 *
 * RENDUE À LA REQUÊTE : figée au build, la page afficherait les plafonds du
 * jour du déploiement, pas ceux que l'administration vient de régler.
 */
export const dynamic = "force-dynamic";

export function generateStaticParams(): Array<{ locale: string }> {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const langue = estLangueSupportee(locale) ? locale : LANGUE_DEFAUT;
  const t = await getTranslations({ locale: langue, namespace: "tarifs" });
  const format = await getFormatter({ locale: langue });
  const description = t("metaDescription", {
    prix: format.number(PRIX_PRO_EUR, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }),
  });
  return {
    title: t("metaTitre"),
    description,
    alternates: alternatesDe(langue, "/tarifs"),
    openGraph: openGraphDe(langue, "/tarifs", { titre: t("metaTitre"), description }),
  };
}

const BOUTON =
  "inline-flex h-11 w-full items-center justify-center gap-2 rounded-ds-pill border px-[22px] text-[14px] leading-[normal] font-semibold tracking-[-0.02em] transition-shadow";

export default async function Tarifs({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("tarifs");
  const p = await getTranslations("passerPro");
  const nav = await getTranslations("navigation");
  const format = await getFormatter();

  // Le client serveur ordinaire : `anon` pour un visiteur, `authenticated` pour un
  // vendeur connecté — les deux ont le droit de lire ces deux nombres (096, 176, 196).
  // `anon.ts` reste réservé à la page client, par la règle de lint qui l'impose.
  const supabase = await creerClientServeur();
  const [plafondPro, plafondGratuit] = await Promise.all([
    supabase.rpc("lire_plafond_commandes"),
    supabase.rpc("lire_plafond_gratuit_a_vie"),
  ]);
  // Une lecture qui échoue retire son nombre de la page — elle ne le fait pas en silence.
  for (const [nom, lu] of [
    ["mensuel", plafondPro],
    ["a vie", plafondGratuit],
  ] as const) {
    if (lu.error !== null) console.error(`[tarifs] plafond ${nom} illisible — ${lu.error.message}`);
  }
  const parMois = typeof plafondPro.data === "number" ? plafondPro.data : null;
  const aVie = typeof plafondGratuit.data === "number" ? plafondGratuit.data : null;

  const nombre = (n: number): string => format.number(n);
  const prix = format.number(PRIX_PRO_EUR, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const zero = format.number(0, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

  const inclusGratuit = [
    p("tableau.medias"),
    p("tableau.couleurs"),
    aVie === null ? t("gratuitQuotaSansNombre") : t("gratuitQuota", { n: nombre(aVie) }),
  ];
  const inclusPro = [
    t("toutLeGratuit"),
    p("features.lien.titre"),
    p("features.marque.titre"),
    parMois === null ? t("proQuotaSansNombre") : t("proQuota", { n: nombre(parMois) }),
  ];

  /* Le tableau de « Passer au Pro », ligne pour ligne : un plafond illisible
     fait disparaître ses deux lignes plutôt que d'afficher un nombre de secours. */
  const gras = { b: (c: React.ReactNode) => <b>{c}</b> };
  const LIGNES: ReadonlyArray<{ readonly cle: string; readonly gratuit: React.ReactNode; readonly pro: React.ReactNode }> = [
    ...(aVie === null
      ? []
      : [
          {
            cle: "commandes",
            gratuit: p.rich("tableau.aVie", { n: nombre(aVie), ...gras }),
            pro: parMois === null ? p("tableau.mensuel") : p.rich("tableau.parMois", { n: nombre(parMois), ...gras }),
          },
          {
            cle: "colis",
            // UNE FOIS le quota de commandes (201) : 5 commandes, 5 colis depuis la 210, sans marge
            // de correction payée par le budget de suivi commun.
            gratuit: p.rich("tableau.aVie", { n: nombre(aVie), ...gras }),
            // Une fois le plafond de commandes, plus deux (197) : 300 commandes, 300 colis.
            pro: parMois === null ? p("tableau.mensuel") : p.rich("tableau.parMois", { n: nombre(parMois), ...gras }),
          },
        ]),
    { cle: "adresse", gratuit: p("tableau.adresseGratuit"), pro: p("tableau.adressePro") },
    { cle: "carte", gratuit: p("tableau.carteGratuit"), pro: p("tableau.cartePro") },
    { cle: "medias", gratuit: p("tableau.inclus"), pro: p("tableau.inclus") },
    { cle: "couleurs", gratuit: p("tableau.inclus"), pro: p("tableau.inclus") },
  ];

  const carte = (pro: boolean): string =>
    "flex flex-col gap-5 rounded-ds-card-lg border bg-ds-surface-carte p-[22px] md:p-7 " +
    (pro ? "border-ds-violet-200 shadow-ds-md" : "border-ds-filet shadow-ds-card");

  const liste = (elements: readonly string[]) => (
    <ul className="flex flex-1 flex-col gap-3 border-t border-ds-filet pt-5">
      {elements.map((x) => (
        <li key={x} className="flex items-start gap-2.5 text-[14px] leading-[1.45] text-ds-texte-corps">
          <span className="mt-px inline-flex flex-none text-ds-accent">
            <Check aria-hidden="true" size={16} strokeWidth={2.2} />
          </span>
          <span>{x}</span>
        </li>
      ))}
    </ul>
  );

  return (
    // Le dégradé revient au bouton de la carte Pro (règle 3) : « Créer un compte »
    // passe en secondaire dans l'en-tête, comme sur le signalement.
    <CoquePublique locale={locale} pastille={t("pastille")} enteteSecondaire>
      <main id="contenu" className="mx-auto box-border w-full max-w-[1180px] flex-1 px-4 pt-6 pb-12 md:px-[34px] md:pt-12 md:pb-20">
        <div className="max-w-[720px]">
          <span className="mb-3.5 inline-flex items-center gap-2 rounded-ds-pill bg-ds-surface-teinte px-3 py-[5px] text-[11.5px] leading-[normal] font-extrabold tracking-[0.12em] text-ds-accent-encre uppercase md:text-[11px]">
            <Tag aria-hidden="true" size={13} strokeWidth={2.2} />
            {t("eyebrow")}
          </span>
          <h1 className="text-[27px] leading-[1.06] font-extrabold tracking-[-0.045em] text-balance text-ds-texte-fort sm:text-[32px] md:text-[44px]">
            {t("titre")}
          </h1>
          <p className="mt-3.5 text-[16px] leading-[1.55] text-ds-texte-corps">{t("intro")}</p>
        </div>

        <div className="mt-8 grid gap-[18px] md:grid-cols-2">
          <section className={carte(false)}>
            <div>
              <span className="flex items-center gap-2 text-[15px] leading-[normal] font-bold text-ds-texte-fort">
                {p("gratuit")}
              </span>
              <span className="mt-3 block text-[44px] leading-none font-extrabold tracking-[-0.045em] text-ds-texte-fort">
                {zero}
              </span>
              <span className="mt-2 block text-[13.5px] leading-[normal] text-ds-texte-sourdine">{t("gratuitSous")}</span>
            </div>
            {liste(inclusGratuit)}
            <Link
              href={`/${locale}/inscription`}
              className={BOUTON + " border-ds-filet bg-ds-surface-carte text-ds-texte-fort shadow-ds-sm hover:shadow-ds-md"}
            >
              {t("ctaGratuit")}
              <ArrowRight aria-hidden="true" size={16} strokeWidth={1.9} />
            </Link>
          </section>

          <section className={carte(true)}>
            <div>
              <span className="flex items-center gap-2 text-[15px] leading-[normal] font-bold text-ds-accent-encre">
                <Crown aria-hidden="true" size={16} strokeWidth={2.2} />
                {p("pro")}
              </span>
              <span className="mt-3 block text-[44px] leading-none font-extrabold tracking-[-0.045em] text-ds-texte-fort">
                {prix}
              </span>
              <span className="mt-2 block text-[13.5px] leading-[normal] text-ds-texte-sourdine">{t("proSous")}</span>
            </div>
            {liste(inclusPro)}
            <div className="flex flex-col gap-2.5">
              <Link
                href={`/${locale}/inscription`}
                className={
                  BOUTON +
                  " degrade-ds-marque border-transparent text-ds-texte-sur-marque shadow-ds-brand hover:shadow-ds-brand-hover"
                }
              >
                {t("ctaPro")}
                <ArrowRight aria-hidden="true" size={16} strokeWidth={1.9} />
              </Link>
              <span className="text-[12.5px] leading-[1.55] text-ds-texte-sourdine">
                {t("noteCompte")} {t("dejaInscrit")}{" "}
                <Link href={`/${locale}/connexion`} className="font-semibold text-ds-texte-lien hover:text-ds-texte-lien-survol">
                  {nav("seConnecter")}
                </Link>
              </span>
            </div>
          </section>
        </div>

        <h2 className="mt-12 mb-4 text-[22px] font-bold tracking-[-0.03em] text-balance text-ds-texte-fort">
          {t("comparer")}
        </h2>
        <section className="rounded-ds-card-lg border border-ds-filet bg-ds-surface-carte p-6 shadow-ds-card">
          <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] items-baseline gap-4 border-b border-ds-filet-appuye pb-3.5 md:grid">
            <span />
            <span className="text-[13px] leading-[normal] font-bold text-ds-texte-sourdine">{p("gratuit")}</span>
            <span className="flex flex-wrap items-baseline gap-2">
              <span className="text-[13px] leading-[normal] font-bold text-ds-accent-encre">{p("pro")}</span>
              <span className="inline-flex items-center gap-1.5 rounded-ds-pill bg-ds-violet-100 px-[11px] py-[5px] text-[11px] leading-[normal] font-bold tracking-[-0.02em] text-ds-accent-encre">
                {p("parMois", { prix })}
              </span>
            </span>
          </div>

          {LIGNES.map((ligne, i) => (
            <div
              key={ligne.cle}
              className={
                "py-3.5 md:grid md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] md:items-center md:gap-4 " +
                (i === LIGNES.length - 1 ? "" : "border-b border-ds-filet")
              }
            >
              <span className="block text-[14px] leading-[normal] font-semibold text-ds-texte-fort">
                {p(`tableau.${ligne.cle}`)}
              </span>
              {/* Au téléphone chaque valeur porte son plan : sans en-tête de colonne,
                  « Affichée » seul ne dit pas duquel. */}
              <span className="mt-1.5 flex min-w-0 items-baseline justify-between gap-3 md:mt-0 md:block">
                <span className="flex-none text-[12.5px] leading-[normal] text-ds-texte-sourdine md:hidden">
                  {p("gratuit")}
                </span>
                <span className="min-w-0 text-right text-[14px] leading-[normal] break-words text-ds-texte-corps md:block md:text-left">
                  {ligne.gratuit}
                </span>
              </span>
              <span className="mt-1.5 flex min-w-0 items-baseline justify-between gap-3 md:mt-0 md:block">
                <span className="flex-none text-[12.5px] leading-[normal] text-ds-texte-sourdine md:hidden">
                  {p("pro")}
                </span>
                <span className="min-w-0 text-right text-[14px] leading-[normal] font-semibold break-words text-ds-accent-encre md:block md:text-left">
                  {ligne.pro}
                </span>
              </span>
            </div>
          ))}

          <p className="mt-[22px] max-w-[520px] text-[12.5px] leading-[1.55] text-ds-texte-sourdine">{p("facture")}</p>
        </section>

        <p className="mt-7 text-[14px] leading-[1.55] text-ds-texte-corps">
          {t("question")}{" "}
          <Link href={`/${locale}/docs#faq`} className="font-semibold text-ds-texte-lien hover:text-ds-texte-lien-survol">
            {t("voirDocs")}
          </Link>
        </p>
      </main>
    </CoquePublique>
  );
}
