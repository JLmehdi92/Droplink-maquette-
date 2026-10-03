import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CircleAlert, Shield } from "lucide-react";
import { CoqueSite } from "@/components/public/coque-site";
import { GrapheJsonLd } from "@/components/seo/graphe-json-ld";
import { donneesPage } from "@/lib/seo/donnees-structurees";
import { FormulaireSignalement } from "@/components/formulaire-signalement";
import { TraductionsClient } from "@/components/traductions-client";
import { adresseAbus } from "@/lib/contact";
import { routing } from "@/i18n/routing";
import { alternatesDe, openGraphDe } from "@/lib/seo/alternates";
import { estLangueSupportee, LANGUE_DEFAUT } from "@/i18n/config";

export function generateStaticParams(): Array<{ locale: string }> {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal" });
  const langue = estLangueSupportee(locale) ? locale : LANGUE_DEFAUT;
  return {
    title: t("signalementMetaTitre"),
    description: t("signalementMetaDescription"),
    alternates: alternatesDe(langue, "/signalement"),
    openGraph: openGraphDe(langue, "/signalement", {
      titre: t("signalementMetaTitre"),
      description: t("signalementMetaDescription"),
    }),
  };
}

/**
 * LA PAGE DE SIGNALEMENT (refonte du 02/10/2026, maquette `signalement.html`).
 *
 * Au bureau, deux colonnes : à gauche l'étiquette, le titre, l'intention, les TROIS
 * ÉTAPES et l'avertissement ; à droite le formulaire dans sa carte. Au téléphone tout
 * s'empile DANS CET ORDRE, comme la maquette : l'avertissement passe avant le
 * formulaire (l'ancien écran le mettait après) — on lit ce qu'engage un signalement
 * avant de le rédiger.
 *
 * Les étapes portent des pastilles TEINTÉES, pas le dégradé : il est réservé au
 * bouton du formulaire, la seule action principale de l'écran.
 *
 * ELLE N'EXISTE PAS tant qu'aucune adresse de contact n'est configurée. Ce n'est
 * pas une dégradation, c'est le comportement voulu : publier une procédure de
 * signalement sans destinataire ferait croire qu'un canal existe. Un signalement
 * envoyé dans le vide est un signalement non traité que tout le monde croit
 * traité — y compris nous. Le lien du pied de page disparaît de la même façon.
 */
export default async function Signalement({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const adresse = adresseAbus();
  if (adresse === null) {
    notFound();
  }

  const t = await getTranslations("legal");

  const etapes = [
    { titre: t("signalement.etape1Titre"), texte: t("signalement.etape1Texte") },
    { titre: t("signalement.etape2Titre"), texte: t("signalement.etape2Texte") },
    { titre: t("signalement.etape3Titre"), texte: t("signalement.etape3Texte") },
  ];

  /* LA REFONTE (02/10/2026) suit `signalement.html` : à gauche ce qui se passe après
     l'envoi (sans ces trois étapes, un signalement part dans le silence, et c'est ce
     silence qui fait recommencer ou renoncer), à droite le formulaire. */
  return (
    <CoqueSite locale={locale} page="signalement">
      <GrapheJsonLd
        graphe={donneesPage(
          estLangueSupportee(locale) ? locale : LANGUE_DEFAUT,
          "/signalement",
          { nom: t("signalementTitre"), description: t("signalementMetaDescription") },
          "ContactPage",
        )}
      />
      <main id="contenu" className="pub">
        <div className="conteneur sig">
          <div className="sig-gauche">
            <p className="l4-etiquette">
              <span>
                <Shield aria-hidden="true" className="ic" />
              </span>
              {t("signalementSurTitre")}
            </p>
            <h1 className="pub-titre l4-titre">
              <span className="l4-ligne" style={{ "--l": 0 } as React.CSSProperties}>{t("signalementTitre")}</span>
            </h1>
            <p className="pub-chapo" data-entree>
              {t("signalement.intro")}
            </p>
            <ol className="sig-etapes">
              {etapes.map((e, i) => (
                <li key={e.titre}>
                  <span aria-hidden="true">{i + 1}</span>
                  <div>
                    <b>{e.titre}</b>
                    <p>{e.texte}</p>
                  </div>
                </li>
              ))}
            </ol>
            <aside className="sig-note" role="note">
              <CircleAlert aria-hidden="true" className="ic" />
              <p>{t("signalement.avertissement")}</p>
            </aside>
          </div>
          <TraductionsClient espaces={["legal"]}>
            <FormulaireSignalement adresse={adresse} />
          </TraductionsClient>
        </div>
      </main>
    </CoqueSite>
  );
}
