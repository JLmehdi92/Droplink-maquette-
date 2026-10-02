import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import {
  Encart,
  Etapes,
  Etiquette,
  LigneAuteur,
  Liste,
  Paragraphe,
  Question,
  Section,
  SousTitre,
  Tableau,
} from "@/components/docs/briques";
import { SommaireDocs } from "@/components/docs/sommaire-docs";
import { CoqueSite } from "@/components/public/coque-site";

/** La date de la dernière révision du contenu — Paramètres, 2FA, export, suppression. */
const MISE_A_JOUR = new Date("2026-09-14T00:00:00Z");
import { LienEcran } from "@/components/lien-ecran";
import { estLangueSupportee, LANGUES } from "@/i18n/config";
import { PRIX_PRO_EUR } from "@/lib/paiement/plan";
import { creerClientServeur } from "@/lib/supabase/server";
import { alternatesDe, openGraphDe } from "@/lib/seo/alternates";

/*
 * ⚠️ LES PLAFONDS SONT LUS EN BASE, COMME SUR `/tarifs` (26/09/2026). La page les écrivait
 * en dur — « 15 au total », « 300 par mois » — pendant que Tarifs et « Passer au Pro » les
 * lisaient : le premier réglage dans l'administration faisait se contredire deux pages
 * publiques. Trouvé en relisant le SaaS écran par écran. RENDUE À LA REQUÊTE pour la même
 * raison que Tarifs : figée au build, elle montrerait les plafonds du jour du déploiement.
 */
export const dynamic = "force-dynamic";

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
  const supabase = await creerClientServeur();
  const [t, legal, format, plafondPro, plafondGratuit] = await Promise.all([
    getTranslations("docs"),
    getTranslations("legal"),
    getFormatter(),
    supabase.rpc("lire_plafond_commandes"),
    supabase.rpc("lire_plafond_gratuit_a_vie"),
  ]);
  // Une lecture qui échoue retire ses nombres de la page — elle ne le fait pas en silence.
  for (const [nom, lu] of [
    ["mensuel", plafondPro],
    ["a vie", plafondGratuit],
  ] as const) {
    if (lu.error !== null) console.error(`[docs] plafond ${nom} illisible — ${lu.error.message}`);
  }
  const parMois = typeof plafondPro.data === "number" ? format.number(plafondPro.data) : null;
  const aVie = typeof plafondGratuit.data === "number" ? format.number(plafondGratuit.data) : null;

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


  /* LES MARQUES DU KIT DANS LE TEXTE : nom d'écran en gras, renvoi interne en
     lien. Elles vivent dans les catalogues, pour que les trois langues posent
     les mêmes au même mot. */
  // Le gras du kit garde la couleur du paragraphe ; seul « En résumé : » passe à l'encre forte.
  const gras = (morceau: React.ReactNode) => <b>{morceau}</b>;
  const ancre = (vers: string) =>
    function Ancre(morceau: React.ReactNode) {
      return (
        <a href={vers} className="lien-texte">
          {morceau}
        </a>
      );
    };

  /** La pastille de chaque statut, dans le vocabulaire de la maquette (`.doc-badge`). */
  const BADGE = { preparation: "attente", expedie: "expedie", en_transit: "transit", livre: "livre" } as const;
  const statuts = [
    ["preparation", t("stPreparation"), t("stPreparationE")],
    ["expedie", t("stExpedie"), t("stExpedieE")],
    ["en_transit", t("stTransit"), t("stTransitE")],
    ["livre", t("stLivre"), t("stLivreE")],
  ] as const;

  return (
    <CoqueSite locale={langue} page="docs">
      <main id="contenu" className="pub">
        <div className="conteneur doc">
          <aside className="doc-cote">
            <SommaireDocs etiquette={t("etiquette")} titre={legal("sommaireTitre")} groupes={sommaire} />
          </aside>
          <article className="doc-article">
            <Etiquette>{t("etiquette")}</Etiquette>
            <h1 className="pub-titre doc-titre">
              {t("titre")}
            </h1>
            <LigneAuteur
              auteur={t("auteur")}
              source={t("source")}
              misAJour={
                <>
                  {t("misAJour")}{" "}
                  <time dateTime={MISE_A_JOUR.toISOString().slice(0, 10)}>
                    {format.dateTime(MISE_A_JOUR, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}
                  </time>
                </>
              }
              duree={t("duree")}
            />
            <p className="doc-resume">
              <b>{t("resumeEtiquette")}</b>{" "}
              {t.rich("resume", {
                analyses: (morceau) => (
                  <a href="#analyses" className="lien-texte">
                    {morceau}
                  </a>
                ),
              })}
            </p>

            <Section id="presentation" titre={t("presentation")}>
              <Paragraphe>{t("presentationTexte")}</Paragraphe>
              <div className="doc-flux">
                {[t("fluxClient"), t("fluxMedias"), t("fluxSuivi"), t("fluxLien")].map((etape, i, tout) => (
                  <span key={etape} className="contents">
                    {i === 0 ? null : <ArrowRight aria-hidden="true" className="ic" />}
                    <span className={"doc-flux__etape" + (i === tout.length - 1 ? " est-lien" : "")}>{etape}</span>
                  </span>
                ))}
              </div>
              <SousTitre>{t("ceQueFait")}</SousTitre>
              <Liste items={[t("fait1"), t("fait2"), t("fait3"), t("fait4")]} />
              <SousTitre>{t("ceQueFaitPas")}</SousTitre>
              <Paragraphe>{t("faitPasTexte")}</Paragraphe>
            </Section>

            <Section id="demarrer" titre={t("demarrer")}>
              <Etapes
                items={[
                  { titre: t("etape1"), texte: t.rich("etape1Texte", { lien: ancre(`/${langue}/inscription`) }) },
                  { titre: t("etape2"), texte: t("etape2Texte") },
                  { titre: t("etape3"), texte: t("etape3Texte") },
                ]}
              />
              <Encart titre={t("combienTitre")}>{t("combienTexte")}</Encart>
            </Section>

            <Section id="marque" titre={t("marque")}>
              <Paragraphe>{t.rich("marqueTexte", { b: gras, lien: ancre("#lien") })}</Paragraphe>
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
            </Section>

            <Section id="commande" titre={t("commande")}>
              <Paragraphe>{t.rich("commandeTexte", { b: gras })}</Paragraphe>
              <Etapes
                items={[
                  { titre: t("blocClient"), texte: t("blocClientTexte") },
                  { titre: t("blocMedias"), texte: t("blocMediasTexte") },
                  { titre: t("blocSuivi"), texte: t("blocSuiviTexte") },
                ]}
              />
              <Encart titre={t("sauvegardeTitre")}>{t("sauvegardeTexte")}</Encart>
            </Section>

            <Section id="medias" titre={t("medias")}>
              <Paragraphe>{t("mediasTexte")}</Paragraphe>
              <Liste items={[t("media1"), t("media2"), t("media3")]} />
            </Section>

            <Section id="suivi" titre={t("suivi")}>
              <Paragraphe>{t("suiviTexte")}</Paragraphe>
              <Encart ton="alerte" titre={t("suiviAlerteTitre")}>
                {t("suiviAlerteTexte")}
              </Encart>
              <SousTitre>{t("transporteurs")}</SousTitre>
              <Paragraphe>{t.rich("transporteursTexte", { analyses: ancre("#analyses") })}</Paragraphe>
            </Section>

            <Section id="statuts" titre={t("statuts")}>
              <Paragraphe>{t("statutsTexte")}</Paragraphe>
              {/* LES CARTES DE STATUT DU KIT, AVEC LES QUATRE ÉTAPES DU PRODUIT. Le kit
                  en dessine six, dont « En livraison », « Problème » et « Annulée »,
                  que la frise n'a pas (décision 4 du brief). */}
              <div className="doc-statuts">
                {statuts.map(([statut, libelle, sens]) => (
                  <div key={statut} className="doc-statut">
                    <span className="doc-badge" data-statut={BADGE[statut]}>
                      <i aria-hidden="true" />
                      {libelle}
                    </span>
                    <p>{sens}</p>
                  </div>
                ))}
              </div>
              <Encart ton="alerte" titre={t("silenceTitre")}>
                {t("silenceTexte")}
              </Encart>
            </Section>

            <Section id="lien" titre={t("lien")}>
              <Paragraphe>{t("lienTexte")}</Paragraphe>
              <Liste
                items={[
                  t("clientVoit1"),
                  t("clientVoit2"),
                  t("clientVoit3"),
                  t("clientVoit4"),
                  t("clientVoit5"),
                  t("clientVoit6"),
                ]}
              />
              <Encart ton="alerte" titre={t("lienAlerteTitre")}>
                {t("lienAlerteTexte")}
              </Encart>
            </Section>

            <Section id="envois" titre={t("envois")}>
              <Paragraphe>{t.rich("envoisTexte", { b: gras })}</Paragraphe>
            </Section>

            <Section id="analyses" titre={t("analyses")}>
              <Paragraphe>{t("analysesTexte")}</Paragraphe>
              {/* LES QUATRE INDICATEURS QUE L'ÉCRAN AFFICHE RÉELLEMENT — le kit en
                  liste cinq, dont un « taux de validation des photos » qui n'existe
                  pas. Le délai se mesure du premier au dernier mouvement du colis. */}
              <Tableau
                entetes={[t("colIndicateur"), t("colMesure")]}
                lignes={[
                  [t("kpiCrees"), t("kpiCreesE")],
                  [t("kpiLivrees"), t("kpiLivreesE")],
                  [t("kpiLiens"), t("kpiLiensE")],
                  [t("kpiDelai"), t("kpiDelaiE")],
                ]}
              />
              <Paragraphe>{t("analysesSuite")}</Paragraphe>
            </Section>

            <Section id="notifications" titre={t("notifications")}>
              <Paragraphe>{t("notificationsTexte")}</Paragraphe>

              {/* CE QUE L'ÉCRAN PARAMÈTRES FAIT RÉELLEMENT depuis le 13/09/2026 — la
                  liste du kit, tenue au produit : pas de photo, de téléphone, de
                  fuseau, de notifications ni de passage au Pro. */}
            </Section>

            <Section id="parametres" titre={t("parametres")}>
              <Liste items={[t("param1"), t("param2"), t("param3"), t("param4"), t("param5"), t("param6")]} />
            </Section>

            <Section id="plans" titre={t("plans")}>
              <Paragraphe>
                {aVie !== null && parMois !== null
                  ? t("plansTexte", { gratuit: aVie, pro: parMois })
                  : t("plansTexteSansNombre")}
              </Paragraphe>
              {/*
                ⚠️ CE TABLEAU AVAIT QUATRE LIGNES, ET TROIS ÉTAIENT FAUSSES — servies
                en production. Vérifiées une à une le 20/09/2026 :

                  « 1 Go / 50 Go »        → AUCUN plafond de stockage n'existe. L'écran
                                            d'administration le déclare lui-même absent.
                  « lien à votre nom »    → `shops.slug` existe en base, AUCUNE route ne
                                            la sert : l'adresse promise ne répond pas.
                  « Support prioritaire » → aucun système de tickets.

                Et la quatrième mentait des deux côtés depuis les migrations 175-176
                (« 10 par mois » / « Illimitées »).

                Les deux lignes qui restent sont les deux seules que le produit
                applique réellement. Un tableau tarifaire n'est pas une feuille de
                route : c'est un engagement, et celui-ci était déjà public.
              */}
              <Tableau
                /* ⚠️ LE PRIX VIENT DE `lib/paiement/plan.ts`, ET IL ETAIT ECRIT EN
                   DUR DANS LES TROIS CATALOGUES. Trois copies d'un meme nombre
                   divergent au premier changement : on corrige `fr.json`, on
                   oublie `zh-CN.json`, et un vendeur chinois lit un montant
                   different de celui qu'on lui facture. Un fait, un point
                   d'emission. */
                entetes={[
                  "",
                  t("planGratuit"),
                  t("planPro", {
                    prix: format.number(PRIX_PRO_EUR, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }),
                  }),
                ]}
                /* Un plafond illisible fait disparaître la ligne plutôt que d'afficher un
                   nombre de secours — la règle de `/tarifs`. */
                lignes={[
                  ...(aVie !== null && parMois !== null
                    ? [[t("plCommandes"), t("plCommandesG", { n: aVie }), t("plCommandesP", { n: parMois })]]
                    : []),
                  [t("plPage"), t("plPageG"), t("plPageP")],
                ]}
              />
            </Section>

            <Section id="faq" titre={t("faq")}>
              <div className="doc-faq">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <Question key={n} question={t(`faqQ${n}`)} reponse={t(`faqR${n}`)} />
                ))}
              </div>
            </Section>

            <Section id="support" titre={t("support")}>
              <Paragraphe>{t("supportTexte")}</Paragraphe>
            </Section>

            {/* L'APPEL FINAL : une carte, et le dégradé sur son bouton — la seule action
                principale de l'écran (règle 3). */}
            <aside className="pub-cta v4-carte">
              <h2>{t("ctaTitre")}</h2>
              <p>{t("ctaTexte")}</p>
              <LienEcran href={`/${langue}/inscription`} className="bouton bouton--marque bouton--large min-h-11">
                {t("ctaBouton")}
                <ArrowRight aria-hidden="true" className="ic" />
              </LienEcran>
            </aside>
          </article>
        </div>
      </main>
    </CoqueSite>
  );
}
