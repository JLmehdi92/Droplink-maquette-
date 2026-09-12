import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  Encart,
  Etapes,
  Etiquette,
  LigneAuteur,
  Liste,
  Paragraphe,
  Question,
  Tableau,
  TitreSection,
} from "@/components/docs/briques";
import { LienEcran } from "@/components/lien-ecran";
import { estLangueSupportee, LANGUES } from "@/i18n/config";
import { alternatesDe, openGraphDe } from "@/lib/seo/alternates";

export function generateStaticParams() {
  return LANGUES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const langue = estLangueSupportee(locale) ? locale : "fr";
  const t = await getTranslations({ locale: langue, namespace: "docs" });
  return {
    title: t("titre"),
    description: t("metaDescription"),
    alternates: alternatesDe(langue, "/docs"),
    /* ⚠️ L'APERÇU DE PARTAGE EST OBLIGATOIRE SUR UNE PAGE INDEXABLE, et la sonde
       de fumée le vérifie sur le HTML SERVI. C'est l'inverse de `/p/[token]`,
       où la décision 23 l'INTERDIT : un aperçu y montrerait le pseudo du client
       dans la conversation, à qui n'ouvre pas le lien. Ici la page est publique
       et ne porte aucune donnée de compte. */
    openGraph: openGraphDe(langue, "/docs", {
      titre: t("titre"),
      description: t("metaDescription"),
    }),
  };
}

/**
 * LA DOCUMENTATION — `ui_kits/docs` du design system, servi à 1280 px.
 *
 * ⚠️ CET ÉCRAN EXISTE POUR UNE RAISON PRÉCISE : C'EST LA CIBLE DE « PASSEZ AU
 * PRO ». La barre latérale de l'espace vendeur porte cet encart sur ses cinq
 * écrans, et son bouton doit mener quelque part. Le design system le sait : la
 * navigation de sa landing envoie « Tarifs » sur `/docs#plans`.
 *
 * ⚠️ LA STRUCTURE EST CELLE DU KIT, LE CONTENU EST CELUI DU PRODUIT — et
 * l'écart est délibéré, arbitré par Wassim le 12/09/2026 (« pour le truc que la
 * doc dit on peut le modifier nous »). Le kit décrit, comme si elles
 * existaient : la connexion Apple, un champ pays, une couleur secondaire, des
 * options d'affichage, un lien personnalisé `droplink.fr/votre-boutique`, les
 * intégrations Shopify et Google Sheets, les statuts « En livraison » et
 * « Annulée », et un lien qui expirerait 90 jours après la livraison.
 *
 * Aucune de ces choses n'existe. Les porter mot pour mot enverrait les clients
 * chercher des boutons absents — une documentation fausse coûte plus cher qu'un
 * écran mal aligné, parce qu'elle se lit comme une promesse. Les 81 phrases que
 * le kit décrit JUSTEMENT reprennent ses traductions à l'identique ; les 42
 * autres disent ce que le produit fait.
 *
 * ⚠️ ET LE PLAN PRO EST PRÉSENTÉ SANS ÊTRE APPLIQUÉ. Décision de Wassim, même
 * jour : les plafonds affichés — 10 commandes, 1 Go — ne sont vérifiés NULLE
 * PART, et aucun compte n'est bloqué. La section le dit en toutes lettres
 * plutôt que de laisser croire à une limite qui n'existe pas. Toujours aucun
 * code de paiement : la contrainte n°1 du brief tient.
 */
export default async function Documentation({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const langue = estLangueSupportee(locale) ? locale : "fr";
  setRequestLocale(langue);
  const t = await getTranslations("docs");

  const sommaire: readonly (readonly [string, readonly (readonly [string, string])[]])[] = [
    [t("grCommencer"), [["presentation", t("presentation")], ["demarrer", t("demarrer")], ["marque", t("marque")]]],
    [
      t("grUtiliser"),
      [
        ["commande", t("commande")],
        ["medias", t("medias")],
        ["suivi", t("suivi")],
        ["statuts", t("statuts")],
        ["lien", t("lien")],
      ],
    ],
    [t("grPiloter"), [["envois", t("envois")], ["analyses", t("analyses")], ["notifications", t("notifications")]]],
    [t("grCompte"), [["parametres", t("parametres")], ["plans", t("plans")]]],
    [t("grAide"), [["faq", t("faq")], ["support", t("support")]]],
  ];

  return (
    <main id="contenu" className="mx-auto flex w-full max-w-[1216px] gap-10 px-margin-mobile py-10 md:px-8">
      {/*
        LE SOMMAIRE EST COLLANT AU BUREAU ET ABSENT AU TÉLÉPHONE. Le kit le pose
        à gauche, collé ; sur 390 px il occuperait un écran entier avant le
        premier mot. Les ancres restent atteignables par le corps du texte.
      */}
      <nav
        aria-label={t("etiquette")}
        className="sticky top-10 hidden h-fit w-[232px] flex-none flex-col gap-[22px] lg:flex"
      >
        {sommaire.map(([groupe, entrees]) => (
          <div key={groupe} className="flex flex-col gap-[3px]">
            <span className="px-3 pb-1.5 text-[11.5px] font-bold tracking-[0.08em] text-ds-texte-tenu uppercase">
              {groupe}
            </span>
            {entrees.map(([id, libelle]) => (
              <a
                key={id}
                href={"#" + id}
                className="block rounded-ds-sm px-3 py-2 text-[14px] font-medium text-ds-texte-corps transition-colors hover:bg-ds-surface-teinte hover:text-ds-accent-encre"
              >
                {libelle}
              </a>
            ))}
          </div>
        ))}
      </nav>

      <article className="min-w-0 max-w-[780px]">
        <Etiquette>{t("etiquette")}</Etiquette>
        <h1 className="mt-5 text-[46px] leading-[1.05] font-extrabold tracking-[-0.045em] text-ds-texte-titre max-[560px]:text-[32px]">
          {t("titre")}
        </h1>
        <LigneAuteur
          auteur={t("auteur")}
          source={t("source")}
          misAJour={t("misAJour") + " 12/09/2026"}
          duree={t("duree")}
        />
        <Paragraphe>{t("resume")}</Paragraphe>

        <TitreSection id="presentation">{t("presentation")}</TitreSection>
        <Paragraphe>{t("presentationTexte")}</Paragraphe>
        <div className="my-[18px] flex flex-wrap items-center gap-3 rounded-ds-card-lg border border-ds-violet-200 bg-ds-surface-teinte px-5 py-[18px]">
          {[t("fluxClient"), t("fluxMedias"), t("fluxSuivi"), t("fluxLien")].map((etape, i) => (
            <span key={etape} className="flex items-center gap-3">
              {i === 0 ? null : (
                <ArrowRight aria-hidden="true" size={16} className="flex-none text-ds-accent" />
              )}
              <span className="text-[14px] font-bold whitespace-nowrap text-ds-texte-fort">{etape}</span>
            </span>
          ))}
        </div>
        <h3 className="mt-6 mb-2 text-[17.5px] font-bold text-ds-texte-fort">{t("ceQueFait")}</h3>
        <Liste items={[t("fait1"), t("fait2"), t("fait3"), t("fait4")]} />
        <h3 className="mt-6 mb-2 text-[17.5px] font-bold text-ds-texte-fort">{t("ceQueFaitPas")}</h3>
        <Paragraphe>{t("faitPasTexte")}</Paragraphe>

        <TitreSection id="demarrer">{t("demarrer")}</TitreSection>
        <Etapes
          items={[
            { titre: t("etape1"), texte: t("etape1Texte") },
            { titre: t("etape2"), texte: t("etape2Texte") },
            { titre: t("etape3"), texte: t("etape3Texte") },
          ]}
        />
        <Encart titre={t("combienTitre")}>{t("combienTexte")}</Encart>

        <TitreSection id="marque">{t("marque")}</TitreSection>
        <Paragraphe>{t("marqueTexte")}</Paragraphe>
        <Tableau
          entetes={[t("colReglage"), t("colEffet")]}
          lignes={[
            [t("regLogo"), t("regLogoE")],
            [t("regNom"), t("regNomE")],
            [t("regCouleur"), t("regCouleurE")],
            [t("regSociaux"), t("regSociauxE")],
            [t("regFiligrane"), t("regFiligraneE")],
          ]}
        />

        <TitreSection id="commande">{t("commande")}</TitreSection>
        <Paragraphe>{t("commandeTexte")}</Paragraphe>
        <Etapes
          items={[
            { titre: t("blocClient"), texte: t("blocClientTexte") },
            { titre: t("blocMedias"), texte: t("blocMediasTexte") },
            { titre: t("blocSuivi"), texte: t("blocSuiviTexte") },
          ]}
        />
        <Encart titre={t("sauvegardeTitre")}>{t("sauvegardeTexte")}</Encart>

        <TitreSection id="medias">{t("medias")}</TitreSection>
        <Paragraphe>{t("mediasTexte")}</Paragraphe>
        <Liste items={[t("media1"), t("media2"), t("media3")]} />

        <TitreSection id="suivi">{t("suivi")}</TitreSection>
        <Paragraphe>{t("suiviTexte")}</Paragraphe>
        <Encart ton="alerte" titre={t("suiviAlerteTitre")}>
          {t("suiviAlerteTexte")}
        </Encart>

        <TitreSection id="statuts">{t("statuts")}</TitreSection>
        <Paragraphe>{t("statutsTexte")}</Paragraphe>
        <Tableau
          entetes={[t("statuts"), t("colEffet")]}
          lignes={[
            [t("stPreparation"), t("stPreparationE")],
            [t("stExpedie"), t("stExpedieE")],
            [t("stTransit"), t("stTransitE")],
            [t("stLivre"), t("stLivreE")],
          ]}
        />
        <Encart ton="alerte" titre={t("silenceTitre")}>
          {t("silenceTexte")}
        </Encart>

        <TitreSection id="lien">{t("lien")}</TitreSection>
        <Paragraphe>{t("lienTexte")}</Paragraphe>
        <Encart ton="alerte" titre={t("lienAlerteTitre")}>
          {t("lienAlerteTexte")}
        </Encart>

        <TitreSection id="envois">{t("envois")}</TitreSection>
        <Paragraphe>{t("envoisTexte")}</Paragraphe>

        <TitreSection id="analyses">{t("analyses")}</TitreSection>
        <Paragraphe>{t("analysesTexte")}</Paragraphe>

        <TitreSection id="notifications">{t("notifications")}</TitreSection>
        <Paragraphe>{t("notificationsTexte")}</Paragraphe>

        <TitreSection id="parametres">{t("parametres")}</TitreSection>
        <Paragraphe>{t("parametresTexte")}</Paragraphe>

        <TitreSection id="plans">{t("plans")}</TitreSection>
        <Paragraphe>{t("plansTexte")}</Paragraphe>
        <Tableau
          entetes={["", t("planGratuit"), t("planPro")]}
          lignes={[
            [t("plCommandes"), t("plCommandesG"), t("plCommandesP")],
            [t("plStockage"), t("plStockageG"), t("plStockageP")],
            [t("plPage"), t("plPageG"), t("plPageP")],
            [t("plSupport"), t("plSupportG"), t("plSupportP")],
          ]}
        />

        <TitreSection id="faq">{t("faq")}</TitreSection>
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <Question key={n} question={t(`faqQ${n}`)} reponse={t(`faqR${n}`)} />
        ))}

        <TitreSection id="support">{t("support")}</TitreSection>
        <Paragraphe>{t("supportTexte")}</Paragraphe>

        <div className="mt-[30px] flex flex-wrap items-center gap-[18px] rounded-ds-card-lg degrade-ds-marque px-[26px] py-6 text-ds-texte-sur-marque shadow-ds-brand">
          <span className="min-w-[220px] flex-1">
            <span className="block text-[20px] font-extrabold tracking-[-0.03em]">{t("ctaTitre")}</span>
            <span className="mt-1 block text-[14.5px] opacity-[0.88]">{t("ctaTexte")}</span>
          </span>
          <LienEcran
            href={`/${langue}/inscription`}
            className="inline-flex h-12 flex-none items-center gap-[9px] rounded-ds-card bg-ds-surface-carte px-[22px] text-[15px] font-bold text-ds-accent-encre transition-shadow hover:shadow-ds-md"
          >
            {t("ctaBouton")}
            <ArrowRight aria-hidden="true" size={17} strokeWidth={2.2} />
          </LienEcran>
        </div>
      </article>
    </main>
  );
}
