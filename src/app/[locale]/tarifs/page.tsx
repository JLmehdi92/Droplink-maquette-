import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Crown, Tag } from "lucide-react";
import { CoqueSite } from "@/components/public/coque-site";
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

export default async function Tarifs({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("tarifs");
  const p = await getTranslations("passerPro");
  const nav = await getTranslations("navigation");
  const a = await getTranslations("accueil");
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
  const inclus = <Check className="ic tp-oui" role="img" aria-label={p("tableau.inclus")} />;
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
    {
      cle: "adresse",
      gratuit: <code className="tp-code">{p("tableau.adresseGratuit")}</code>,
      pro: <code className="tp-code tp-code--pro">{p("tableau.adressePro")}</code>,
    },
    { cle: "carte", gratuit: p("tableau.carteGratuit"), pro: p("tableau.cartePro") },
    { cle: "medias", gratuit: inclus, pro: inclus },
    { cle: "couleurs", gratuit: inclus, pro: inclus },
  ];

  const liste = (elements: readonly string[]) => (
    <ul className="tf-inclus">
      {elements.map((x) => (
        <li key={x}>
          <Check aria-hidden="true" className="ic" />
          <span>{x}</span>
        </li>
      ))}
    </ul>
  );

  /* LA REFONTE (02/10/2026) suit `tarifs.html` : en-tête de page, les deux plans, le
     tableau de comparaison. Plafonds et prix LUS (base, `PRIX_PRO_EUR`). Le dégradé est
     sur « Commencer avec Pro », la seule action principale de l'écran (règle 3). */
  return (
    <CoqueSite locale={locale} page="tarifs">
      <main id="contenu" className="pub">
        <section className="pub-tete conteneur">
          <p className="l4-etiquette">
            <span>
              <Tag aria-hidden="true" className="ic" />
            </span>
            {t("eyebrow")}
          </p>
          <h1 className="pub-titre">{t("titre")}</h1>
          <p className="pub-chapo">{t("intro")}</p>
        </section>

        <section className="conteneur tf-plans" aria-label={t("comparer")}>
          <article className="tf-plan v4-carte">
            <header>
              <h2>{p("gratuit")}</h2>
              <p className="tf-prix">
                <b>{zero}</b>
              </p>
              <p className="tf-sous">{t("gratuitSous")}</p>
            </header>
            {liste(inclusGratuit)}
            <Link className="bouton bouton--second bouton--large" href={`/${locale}/inscription`}>
              {t("ctaGratuit")}
              <ArrowRight aria-hidden="true" className="ic" />
            </Link>
          </article>
          <article className="tf-plan tf-plan--pro v4-carte">
            <header>
              <h2>
                <Crown aria-hidden="true" className="ic" />
                {p("pro")}
              </h2>
              <p className="tf-prix">
                <b>{prix}</b>
                <small>{a("tarifs.parMois")}</small>
              </p>
              <p className="tf-sous">{t("proSous")}</p>
            </header>
            {liste(inclusPro)}
            <div className="tf-pro-actions">
              <Link className="bouton bouton--marque bouton--large" href={`/${locale}/inscription`}>
                {t("ctaPro")}
                <ArrowRight aria-hidden="true" className="ic" />
              </Link>
              <p className="tf-note">
                {t("noteCompte")} {t("dejaInscrit")}{" "}
                <Link className="lien-texte" href={`/${locale}/connexion`}>
                  {nav("seConnecter")}
                </Link>
              </p>
            </div>
          </article>
        </section>

        <section className="conteneur tf-comparer" aria-labelledby="tf-comparer">
          <h2 id="tf-comparer" className="pub-h2">
            {t("comparer")}
          </h2>
          <div className="tp tf-tp">
            <table className="tp__table">
              <caption className="sr">{t("comparer")}</caption>
              <colgroup>
                <col className="tp__col-libelle" />
                <col />
                <col className="tp__col-pro" />
              </colgroup>
              <thead>
                <tr>
                  <td className="tp__coin" />
                  <th scope="col">
                    <span className="tp__nom">{p("gratuit")}</span>
                    <span className="tp__prix">
                      <b>{zero}</b>
                    </span>
                  </th>
                  <th scope="col" className="tp__pro">
                    <span className="tp__nom">{p("pro")}</span>
                    <span className="tp__prix">
                      <b>{prix}</b>
                      <small>{a("tarifs.parMois")}</small>
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {LIGNES.map((ligne) => (
                  <tr key={ligne.cle}>
                    <th scope="row">{p(`tableau.${ligne.cle}`)}</th>
                    <td>{ligne.gratuit}</td>
                    <td>{ligne.pro}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="tf-question">
            {t("question")}{" "}
            <Link className="lien-texte" href={`/${locale}/docs#plans`}>
              {t("voirDocs")}
              <ArrowRight aria-hidden="true" className="ic" />
            </Link>
          </p>
        </section>
      </main>
    </CoqueSite>
  );
}
