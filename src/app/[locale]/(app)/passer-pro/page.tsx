import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { ArrowRight, BadgeCheck, Crown, Link as LinkIcon, Package, Truck } from "lucide-react";
import { EnTeteEcranDs } from "@/components/app/en-tete-ecran";
import { exigerVendeur } from "@/lib/comptes/apres-session";
import { lireProfilVendeur } from "@/lib/comptes/profil";
import { creerClientServeur } from "@/lib/supabase/server";
import { estLangueSupportee } from "@/i18n/config";
import { PRIX_PRO_EUR, urlPaiementPourCompte } from "@/lib/paiement/plan";

/**
 * « PASSER AU PRO ».
 *
 * Décision de Wassim du 20/09/2026 : « tu feras l'écran passer pro avec toute
 * les features du pro », et « un pop up ou alors une page » → LES DEUX. Le
 * panneau est la carte « Pro » posée à côté de chaque réglage verrouillé de
 * « Ma marque » ; elle mène ici.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ QUATRE FEATURES, ET CE SONT LES SEULES QUI EXISTENT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le kit en annonçait quatre autres — « Statistiques avancées », « Support
 * prioritaire », « Plus de fonctionnalités », « Stockage 50 Go ». Aucune n'a la
 * moindre ligne de code : il n'y a pas de statistiques réservées au Pro, pas de
 * file de support, pas de quota de stockage par plan. Une maquette peut le
 * dire ; une page qui mène à un paiement, non.
 *
 * Ce qui existe, migration par migration :
 *   1. le lien client au nom du vendeur              (182-185)
 *   2. la carte « Propulsé par DropLink » retirée    (167)
 *   3. le plafond de commandes MENSUEL au lieu d'un total à vie  (175-176)
 *   4. le plafond de colis suivis MENSUEL, même règle            (181)
 *
 * ⚠️ LES NOMBRES SONT LUS, JAMAIS ÉCRITS EN DUR. Les deux plafonds se règlent
 * dans l'administration ; une page qui figerait « 300 commandes » ferait mentir
 * le produit le jour où Wassim écrit un autre nombre, et rien ne le
 * signalerait. Les colis suivent le facteur 2 de la migration 125, qui laisse
 * UNE correction de numéro de suivi par commande.
 *
 * ⚠️ AUCUN FORMULAIRE DE PAIEMENT ICI, ET AUCUN CHAMP DE CARTE. L'encaissement
 * appartient au fournisseur — Lemon Squeezy est MERCHANT OF RECORD : il
 * encaisse, facture et collecte la TVA. Cette page ne fait que mener à sa page
 * de paiement, et le webhook (migrations 177-181) pose le plan au retour.
 *
 * ⚠️ ET SANS ADRESSE DE PAIEMENT CONFIGURÉE, IL N'Y A PAS DE BOUTON. Un bouton
 * mort sur une page d'abonnement fait conclure que le produit est cassé, pas
 * que l'abonnement n'est pas encore ouvert — c'est le principe VIII : on
 * n'affirme jamais ce qui n'est pas là.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale: estLangueSupportee(locale) ? locale : "fr",
    namespace: "passerPro",
  });
  return { title: t("titre"), robots: { index: false, follow: false } };
}

export default async function PasserProPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const langue = estLangueSupportee(locale) ? locale : "fr";
  setRequestLocale(langue);

  await exigerVendeur(langue);

  const t = await getTranslations("passerPro");
  const format = await getFormatter();
  const supabase = await creerClientServeur();

  /*
   * LES TROIS LECTURES PARTENT ENSEMBLE. Elles ne dépendent pas les unes des
   * autres, et `lireProfilVendeur()` est mémoïsée — `exigerVendeur()` vient de
   * l'appeler, donc elle ne coûte rien de plus ici.
   */
  const [profil, plafondPro, plafondGratuit] = await Promise.all([
    lireProfilVendeur(),
    supabase.rpc("lire_plafond_commandes"),
    supabase.rpc("lire_plafond_gratuit_a_vie"),
  ]);

  /*
   * ⚠️ UN PLAFOND QU'ON N'A PAS PU LIRE NE S'INVENTE PAS. Les deux lignes
   * disparaissent du tableau plutôt que d'afficher un nombre de secours : un
   * chiffre faux sur une page qui mène à un paiement est pire que pas de
   * chiffre du tout, et il serait indiscernable d'un vrai.
   */
  const parMois = typeof plafondPro.data === "number" ? plafondPro.data : null;
  const aVie = typeof plafondGratuit.data === "number" ? plafondGratuit.data : null;

  const nombre = (n: number): string => format.number(n);
  // L'identifiant du compte voyage DANS le lien : sans lui, un paiement fait
  // avec une autre adresse que celle du compte n'aurait pas de destinataire.
  const paiement = profil === null ? null : urlPaiementPourCompte(profil);
  const dejaPro = profil?.planPro === true;

  const FEATURES = [
    { cle: "lien", Icone: LinkIcon },
    { cle: "marque", Icone: BadgeCheck },
    { cle: "commandes", Icone: Package },
    { cle: "colis", Icone: Truck },
  ] as const;

  /*
   * LE TABLEAU DIT AUSSI CE QUI NE CHANGE PAS, et ses deux dernières lignes ne
   * vendent rien. C'est leur rôle : un vendeur qui hésite doit pouvoir voir que
   * le plan gratuit n'est pas une version mutilée du produit. Les photos, les
   * vidéos, le suivi automatique et sa page à ses couleurs y sont déjà.
   */
  const LIGNES: ReadonlyArray<{
    readonly cle: string;
    readonly gratuit: string;
    readonly pro: string;
  }> = [
    ...(aVie === null
      ? []
      : [
          {
            cle: "commandes",
            gratuit: t("tableau.aVie", { n: nombre(aVie) }),
            pro:
              parMois === null ? t("tableau.mensuel") : t("tableau.parMois", { n: nombre(parMois) }),
          },
          {
            cle: "colis",
            gratuit: t("tableau.aVie", { n: nombre(aVie * 2) }),
            pro:
              parMois === null
                ? t("tableau.mensuel")
                : t("tableau.parMois", { n: nombre(parMois * 2) }),
          },
        ]),
    { cle: "adresse", gratuit: t("tableau.adresseGratuit"), pro: t("tableau.adressePro") },
    { cle: "carte", gratuit: t("tableau.carteGratuit"), pro: t("tableau.cartePro") },
    { cle: "medias", gratuit: t("tableau.inclus"), pro: t("tableau.inclus") },
    { cle: "couleurs", gratuit: t("tableau.inclus"), pro: t("tableau.inclus") },
  ];

  return (
    <>
      <EnTeteEcranDs titre={t("titre")} sousTitre={t("sousTitre")} />

      <main id="contenu" className="px-margin-mobile py-5 md:px-8 md:pt-0 md:pb-8">
        {/* 32 px DANS la boîte de 1180, comme la planche (`padding: 0 32px`, maxWidth 1180) :
            sans eux la colonne commençait 32 px plus à gauche (remesure du 24/09/2026). Et 8 px
            en bas : la planche en pose 40, la page 32. */}
        <div className="mx-auto w-full max-w-[1180px] md:px-8 md:pb-2">
          <header className="max-w-[720px] pt-1 pb-6">
            <span className="mb-3.5 inline-flex items-center gap-2 rounded-ds-pill bg-ds-surface-teinte px-3 py-[5px] text-[11px] leading-[normal] font-extrabold tracking-[0.12em] text-ds-accent-encre uppercase">
              <Crown aria-hidden="true" size={13} strokeWidth={2.2} />
              {t("eyebrow")}
            </span>
            <h2 className="text-[30px] leading-[1.1] font-extrabold tracking-[-0.045em] text-ds-texte-fort">
              {t("accroche")}
            </h2>
            <p className="mt-2.5 text-[16px] leading-[1.55] text-ds-texte-corps">{t("intro")}</p>
          </header>

          <div className="mb-6 grid gap-4 md:grid-cols-2 lg:gap-[18px]">
            {FEATURES.map(({ cle, Icone }) => (
              <section
                key={cle}
                className="flex items-start gap-3.5 rounded-ds-card-lg border border-ds-filet bg-ds-surface-carte p-[22px] shadow-ds-card"
              >
                <span className="inline-flex size-11 flex-none items-center justify-center rounded-ds-icon-tile bg-ds-surface-teinte text-ds-accent">
                  <Icone aria-hidden="true" size={20} strokeWidth={1.9} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[17px] leading-[normal] font-bold tracking-[-0.025em] text-ds-texte-fort">
                    {t(`features.${cle}.titre`)}
                  </span>
                  <span className="mt-[5px] block text-[13.5px] leading-[1.55] text-ds-texte-corps">
                    {/* Le quota à vie est DIT, comme la planche (« borné à 15 commandes À
                        VIE »), dès qu'il est lu ; illisible, la phrase ne cite aucun nombre. */}
                    {cle === "commandes" && aVie !== null
                      ? t("features.commandes.texteNombre", { n: nombre(aVie) })
                      : t(`features.${cle}.texte`)}
                  </span>
                </span>
              </section>
            ))}
          </div>

          <section className="rounded-ds-card-lg border border-ds-filet bg-ds-surface-carte p-6 shadow-ds-card">
            {/*
              ⚠️ TROIS COLONNES NE TIENNENT PAS À 390 px, ET LA SONDE L'A DIT :
              « droplink.fr/votre-boutique/… » sortait de sa carte. Au téléphone
              chaque ligne devient un bloc — le libellé, puis les deux valeurs
              nommées —, et l'en-tête de colonnes n'a plus rien à coiffer.
            */}
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ds-filet-appuye pb-3.5 md:hidden">
              <span className="text-[13px] leading-[normal] font-bold text-ds-accent-encre">
                {t("pro")}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-ds-pill bg-ds-violet-100 px-[11px] py-[5px] text-[11.5px] leading-[normal] font-bold tracking-[-0.02em] text-ds-accent-encre">
                {t("parMois", {
                  prix: format.number(PRIX_PRO_EUR, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }),
                })}
              </span>
            </div>

            <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] items-baseline gap-4 border-b border-ds-filet-appuye pb-3.5 md:grid">
              <span />
              <span className="text-[13px] leading-[normal] font-bold text-ds-texte-sourdine">
                {t("gratuit")}
              </span>
              <span className="flex flex-wrap items-baseline gap-2">
                <span className="text-[13px] leading-[normal] font-bold text-ds-accent-encre">
                  {t("pro")}
                </span>
                {/* 11,5 px est le PLANCHER du téléphone (règle 5) ; le kit
                    descend à 11 px, et c'est réservé au bureau. */}
                <span className="inline-flex items-center gap-1.5 rounded-ds-pill bg-ds-violet-100 px-[11px] py-[5px] text-[11.5px] leading-[normal] font-bold tracking-[-0.02em] text-ds-accent-encre lg:text-[11px]">
                  {t("parMois", {
                    prix: format.number(PRIX_PRO_EUR, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }),
                  })}
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
                  {t(`tableau.${ligne.cle}`)}
                </span>
                {/* Au téléphone les deux valeurs portent leur nom : sans en-tête
                    de colonne, « Affichée » tout seul ne dit pas de quel plan.
                    Au bureau la valeur est un BLOC, comme la cellule du kit : en ligne,
                    elle héritait de l'interligne de 24 px de la page — 53 px par
                    rangée au lieu de 46 (remesure du 24/09/2026). */}
                <span className="mt-1.5 flex min-w-0 items-baseline justify-between gap-3 md:mt-0 md:block">
                  <span className="flex-none text-[12.5px] leading-[normal] text-ds-texte-sourdine md:hidden">
                    {t("gratuit")}
                  </span>
                  <span className="min-w-0 text-right text-[14px] leading-[normal] break-words text-ds-texte-corps md:block md:text-left">
                    {ligne.gratuit}
                  </span>
                </span>
                <span className="mt-1 flex min-w-0 items-baseline justify-between gap-3 md:mt-0 md:block">
                  <span className="flex-none text-[12.5px] leading-[normal] text-ds-texte-sourdine md:hidden">
                    {t("pro")}
                  </span>
                  <span className="min-w-0 text-right text-[14px] leading-[normal] font-semibold break-words text-ds-accent-encre md:block md:text-left">
                    {ligne.pro}
                  </span>
                </span>
              </div>
            ))}

            <div className="mt-[22px] flex flex-wrap items-center justify-between gap-5">
              <span className="max-w-[520px] text-[12.5px] leading-[1.55] text-ds-texte-sourdine">
                {t("facture")}
              </span>

              {/*
                TROIS ÉTATS, ET AUCUN NE MENT.
                — déjà Pro : rien à vendre, on le dit ;
                — adresse de paiement configurée : le bouton mène au fournisseur ;
                — pas d'adresse : pas de bouton, et une phrase qui dit pourquoi.
              */}
              {dejaPro ? (
                <span className="inline-flex min-h-11 items-center gap-2 rounded-ds-pill bg-ds-surface-teinte px-5 text-[14px] leading-[normal] font-bold text-ds-accent-encre">
                  <BadgeCheck aria-hidden="true" size={17} strokeWidth={2} />
                  {t("dejaPro")}
                </span>
              ) : paiement === null ? (
                <span className="text-[13px] leading-[1.55] text-ds-texte-sourdine">
                  {t("pasEncoreOuvert")}
                </span>
              ) : (
                <a
                  href={paiement}
                  /*
                   * `noopener noreferrer` : la page de paiement est un domaine
                   * TIERS, et `window.opener` lui donnerait prise sur l'onglet
                   * du vendeur — celui où sa session est ouverte.
                   */
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-11 items-center gap-2 rounded-ds-pill border border-transparent bg-[image:var(--degrade-ds-marque)] px-[22px] text-[14px] leading-[normal] font-semibold tracking-[-0.02em] text-ds-texte-sur-marque shadow-ds-brand transition-transform active:scale-[.98]"
                >
                  {/* Le `Button primary` du kit : flèche à droite, demi-gras, 22 px. */}
                  {t("passer")}
                  <ArrowRight aria-hidden="true" size={16} strokeWidth={2.2} />
                </a>
              )}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
