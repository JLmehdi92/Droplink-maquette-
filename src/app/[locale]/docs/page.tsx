import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import {
  CarteStatut,
  Encart,
  Etapes,
  Etiquette,
  LigneAuteur,
  Liste,
  Paragraphe,
  Question,
  SousTitre,
  Tableau,
  TitreSection,
} from "@/components/docs/briques";
import { SommaireDocs } from "@/components/docs/sommaire-docs";
import { SommaireRepliable } from "@/components/sommaire-repliable";
import { LogoMarque } from "@/components/acces/coque-acces";
import { BadgeStatut, iconeExpedition, teinteExpedition } from "@/components/commandes/badge-statut";

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
  const [t, nav, legal, format, plafondPro, plafondGratuit] = await Promise.all([
    getTranslations("docs"),
    getTranslations("navigation"),
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

  const lienEntete =
    "-my-3.5 inline-flex min-h-11 items-center text-[14.5px] font-medium text-ds-texte-corps hover:text-ds-accent-encre md:my-0 md:min-h-0";

  /* LES MARQUES DU KIT DANS LE TEXTE : nom d'écran en gras, renvoi interne en
     lien. Elles vivent dans les catalogues, pour que les trois langues posent
     les mêmes au même mot. */
  // Le gras du kit garde la couleur du paragraphe ; seul « En résumé : » passe à l'encre forte.
  const gras = (morceau: React.ReactNode) => <b className="font-bold">{morceau}</b>;
  const ancre = (vers: string) =>
    function Ancre(morceau: React.ReactNode) {
      return (
        <a href={vers} className="text-ds-texte-lien hover:text-ds-accent-encre">
          {morceau}
        </a>
      );
    };

  const statuts = [
    ["preparation", t("stPreparation"), t("stPreparationE")],
    ["expedie", t("stExpedie"), t("stExpedieE")],
    ["en_transit", t("stTransit"), t("stTransitE")],
    ["livre", t("stLivre"), t("stLivreE")],
  ] as const;

  return (
    <div className="flex min-h-screen flex-col bg-[linear-gradient(180deg,#FAF9FE_0%,#FBFAFE_60%,#F8F3FD_100%)] bg-fixed leading-[normal]">
      {/* L'EN-TÊTE DU KIT, COLLANT ET TRANSLUCIDE — celui des pages légales, avec
          « Se connecter » à la place de « Documentation ». Le flou est permis :
          la règle 2 ne l'interdit que sur `/p/[token]`. */}
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-2.5 border-b border-ds-filet bg-[rgba(255,255,255,0.82)] px-3.5 py-2.5 backdrop-blur-[12px] md:gap-5 md:px-[34px] md:py-4">
        <a
          href="#contenu"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-ds-sm focus:bg-ds-surface-carte focus:px-4 focus:py-2 focus:text-ds-texte-fort focus:shadow-ds-md"
        >
          {nav("allerAuContenu")}
        </a>
        <LienEcran href={`/${langue}`} className="inline-flex min-h-11 items-center md:min-h-0">
          <LogoMarque hauteur={30} />
        </LienEcran>
        <span className="rounded-ds-pill border border-ds-violet-200 bg-ds-surface-teinte px-[11px] py-[5px] text-[12px] font-bold text-ds-accent-encre">
          {t("pastille")}
        </span>
        <span className="flex-1" />
        <LienEcran href={`/${langue}`} className={lienEntete + " max-[560px]:hidden"}>
          {t("accueil")}
        </LienEcran>
        <LienEcran href={`/${langue}/connexion`} className={lienEntete}>
          {t("seConnecter")}
        </LienEcran>
        {/* LE SEUL DÉGRADÉ D'ACTION DE L'ÉCRAN — règle 3. La carte finale est un
            fond de marque, et son bouton est blanc. */}
        <LienEcran
          href={`/${langue}/inscription`}
          className="degrade-ds-marque inline-flex h-11 items-center gap-2 rounded-ds-pill border border-transparent px-[22px] text-[14px] font-semibold tracking-[-0.02em] text-ds-texte-sur-marque shadow-ds-brand transition-shadow hover:shadow-ds-brand-hover"
        >
          {nav("creerCompte")}
          <ArrowRight aria-hidden="true" size={16} strokeWidth={1.9} />
        </LienEcran>
      </header>

      <div className="mx-auto grid w-full max-w-[1240px] flex-1 grid-cols-[minmax(0,1fr)] items-start gap-7 px-4 pt-6 pb-12 min-[761px]:px-[34px] min-[761px]:pt-10 min-[761px]:pb-20 min-[981px]:grid-cols-[268px_minmax(0,1fr)] min-[981px]:gap-12">
        {/* AU-DESSUS DU CONTENU sous 980 px, filet dessous, comme au kit : on
            garde la carte de la page quand la colonne disparaît. */}
        <aside className="min-[981px]:sticky min-[981px]:top-24">
          {/* ⚠️ AU TÉLÉPHONE, REPLIÉ (15/09/2026) : ses vingt entrées de 44 px
              passaient avant la première ligne de la documentation. */}
          <SommaireRepliable titre={legal("sommaireTitre")} masque="min-[981px]:hidden">
            <SommaireDocs etiquette={t("etiquette")} groupes={sommaire} />
          </SommaireRepliable>
          <div className="hidden min-[981px]:block">
            <SommaireDocs etiquette={t("etiquette")} groupes={sommaire} />
          </div>
        </aside>

        <main id="contenu" className="min-w-0">
          <article className="min-w-0 max-w-[780px]">
            <Etiquette>{t("etiquette")}</Etiquette>
            <h1 className="mt-5 text-[46px] leading-[1.05] font-extrabold tracking-[-0.045em] text-balance text-ds-texte-fort max-[760px]:text-[32px] max-[560px]:text-[26px]">
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
            <Paragraphe>
              <b className="text-ds-texte-fort">{t("resumeEtiquette")}</b>{" "}
              {t.rich("resume", {
                analyses: (morceau) => (
                  <a href="#analyses" className="text-ds-texte-lien hover:text-ds-accent-encre">
                    {morceau}
                  </a>
                ),
              })}
            </Paragraphe>

            <TitreSection id="presentation">{t("presentation")}</TitreSection>
            <Paragraphe>{t("presentationTexte")}</Paragraphe>
            <div className="mt-[18px] mb-[22px] flex flex-wrap items-center gap-3 rounded-ds-card-lg border border-ds-violet-200 bg-[image:var(--degrade-ds-teinte)] px-5 py-[18px]">
              {[t("fluxClient"), t("fluxMedias"), t("fluxSuivi"), t("fluxLien")].map((etape, i) => (
                <span key={etape} className="contents">
                  {i === 0 ? null : <ArrowRight aria-hidden="true" size={16} className="flex-none text-ds-accent" />}
                  <span className="text-[14px] font-bold whitespace-nowrap text-ds-texte-fort">{etape}</span>
                </span>
              ))}
            </div>
            <SousTitre>{t("ceQueFait")}</SousTitre>
            <Liste items={[t("fait1"), t("fait2"), t("fait3"), t("fait4")]} />
            <SousTitre>{t("ceQueFaitPas")}</SousTitre>
            <Paragraphe>{t("faitPasTexte")}</Paragraphe>

            <TitreSection id="demarrer">{t("demarrer")}</TitreSection>
            <Etapes
              items={[
                { titre: t("etape1"), texte: t.rich("etape1Texte", { lien: ancre(`/${langue}/inscription`) }) },
                { titre: t("etape2"), texte: t("etape2Texte") },
                { titre: t("etape3"), texte: t("etape3Texte") },
              ]}
            />
            <Encart titre={t("combienTitre")}>{t("combienTexte")}</Encart>

            <TitreSection id="marque">{t("marque")}</TitreSection>
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

            <TitreSection id="commande">{t("commande")}</TitreSection>
            <Paragraphe>{t.rich("commandeTexte", { b: gras })}</Paragraphe>
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
            <SousTitre>{t("transporteurs")}</SousTitre>
            <Paragraphe>{t.rich("transporteursTexte", { analyses: ancre("#analyses") })}</Paragraphe>

            <TitreSection id="statuts">{t("statuts")}</TitreSection>
            <Paragraphe>{t("statutsTexte")}</Paragraphe>
            {/* LES CARTES DE STATUT DU KIT, AVEC LES QUATRE ÉTAPES DU PRODUIT. Le kit
                en dessine six, dont « En livraison », « Problème » et « Annulée »,
                que la frise n'a pas (décision 4 du brief). */}
            <div className="my-5 flex flex-col gap-2.5">
              {statuts.map(([statut, libelle, sens]) => (
                <CarteStatut
                  key={statut}
                  pastille={
                    <BadgeStatut
                      compacte
                      largeurFixe
                      libelle={libelle}
                      teinte={teinteExpedition(statut)}
                      Icone={iconeExpedition(statut)}
                    />
                  }
                  texte={sens}
                />
              ))}
            </div>
            <Encart ton="alerte" titre={t("silenceTitre")}>
              {t("silenceTexte")}
            </Encart>

            <TitreSection id="lien">{t("lien")}</TitreSection>
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

            <TitreSection id="envois">{t("envois")}</TitreSection>
            <Paragraphe>{t.rich("envoisTexte", { b: gras })}</Paragraphe>

            <TitreSection id="analyses">{t("analyses")}</TitreSection>
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

            <TitreSection id="notifications">{t("notifications")}</TitreSection>
            <Paragraphe>{t("notificationsTexte")}</Paragraphe>

            {/* CE QUE L'ÉCRAN PARAMÈTRES FAIT RÉELLEMENT depuis le 13/09/2026 — la
                liste du kit, tenue au produit : pas de photo, de téléphone, de
                fuseau, de notifications ni de passage au Pro. */}
            <TitreSection id="parametres">{t("parametres")}</TitreSection>
            <Liste items={[t("param1"), t("param2"), t("param3"), t("param4"), t("param5"), t("param6")]} />

            <TitreSection id="plans">{t("plans")}</TitreSection>
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
                <ArrowRight aria-hidden="true" size={16} strokeWidth={2} />
              </LienEcran>
            </div>
          </article>
        </main>
      </div>

      <footer className="flex flex-wrap items-center gap-[18px] border-t border-ds-filet px-4 py-[26px] md:px-[34px]">
        <LogoMarque hauteur={22} />
        <span className="min-w-[120px] flex-1" />
        <span className="flex flex-wrap items-center gap-x-[18px]">
          <a href="#support" className="-my-3.5 inline-flex min-h-11 items-center text-[13px] text-ds-texte-corps hover:text-ds-accent-encre md:my-0 md:min-h-0">
            {t("piedContact")}
          </a>
          <LienEcran href={`/${langue}/conditions`} className="-my-3.5 inline-flex min-h-11 items-center text-[13px] text-ds-texte-corps hover:text-ds-accent-encre md:my-0 md:min-h-0">
            {legal("conditionsTitre")}
          </LienEcran>
          <LienEcran href={`/${langue}/confidentialite`} className="-my-3.5 inline-flex min-h-11 items-center text-[13px] text-ds-texte-corps hover:text-ds-accent-encre md:my-0 md:min-h-0">
            {legal("confidentialiteTitre")}
          </LienEcran>
          <span className="text-[13px] text-ds-texte-sourdine">
            {nav("piedDePage", { annee: new Date().getFullYear() })}
          </span>
        </span>
      </footer>
    </div>
  );
}
