import { getTranslations, setRequestLocale } from "next-intl/server";
import { getFormateur } from "@/lib/format/formateur";
import type { Metadata } from "next";
import { ArrowRight, BadgeCheck, Check, ChevronRight, Crown, Link as LinkIcon, Package, Truck } from "lucide-react";
import { LienEcran } from "@/components/lien-ecran";
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
  const format = await getFormateur();
  const supabase = await creerClientServeur();

  /*
   * LES TROIS LECTURES PARTENT ENSEMBLE. Elles ne dépendent pas les unes des
   * autres, et `lireProfilVendeur()` est mémoïsée — `exigerVendeur()` vient de
   * l'appeler, donc elle ne coûte rien de plus ici.
   */
  const [profil, plafondPro, plafondGratuit, signatureLien] = await Promise.all([
    lireProfilVendeur(),
    supabase.rpc("lire_plafond_commandes"),
    supabase.rpc("lire_plafond_gratuit_a_vie"),
    // La signature de l'identifiant du compte (204), obtenue SOUS SA SESSION :
    // la base ne signe que l'appelant. Illisible → pas de lien (voir plan.ts).
    supabase.rpc("signer_lien_paiement"),
  ]);
  if (signatureLien.error !== null)
    console.error("[passer-pro] lien de paiement non signé — " + signatureLien.error.message);

  /*
   * ⚠️ UN PLAFOND QU'ON N'A PAS PU LIRE NE S'INVENTE PAS. Les deux lignes
   * disparaissent du tableau plutôt que d'afficher un nombre de secours : un
   * chiffre faux sur une page qui mène à un paiement est pire que pas de
   * chiffre du tout, et il serait indiscernable d'un vrai.
   */
  const parMois = typeof plafondPro.data === "number" ? plafondPro.data : null;
  const aVie = typeof plafondGratuit.data === "number" ? plafondGratuit.data : null;

  const nombre = (n: number): string => format.number(n);
  // L'identifiant du compte voyage DANS le lien, SIGNÉ : sans lui, un paiement
  // fait avec une autre adresse que celle du compte n'aurait pas de destinataire,
  // et sans signature le webhook ne le croirait pas.
  const paiement =
    profil === null
      ? null
      : urlPaiementPourCompte({
          profilId: profil.profilId,
          email: profil.email,
          signature: typeof signatureLien.data === "string" ? signatureLien.data : null,
        });
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
  const gras = { b: (c: React.ReactNode) => <b>{c}</b> };
  const inclus = <Check className="ic tp-oui" role="img" aria-label={t("tableau.inclus")} />;
  const LIGNES: ReadonlyArray<{
    readonly cle: string;
    readonly gratuit: React.ReactNode;
    readonly pro: React.ReactNode;
  }> = [
    ...(aVie === null
      ? []
      : [
          {
            cle: "commandes",
            gratuit: t.rich("tableau.aVie", { n: nombre(aVie), ...gras }),
            pro:
              parMois === null ? t("tableau.mensuel") : t.rich("tableau.parMois", { n: nombre(parMois), ...gras }),
          },
          {
            cle: "colis",
            // UNE FOIS le quota de commandes (201) : 5 commandes, 5 colis depuis la 210, sans marge
            // de correction payée par le budget de suivi commun.
            gratuit: t.rich("tableau.aVie", { n: nombre(aVie), ...gras }),
            pro:
              parMois === null
                ? t("tableau.mensuel")
                : // Une fois le plafond de commandes, plus deux (197) : 300 commandes, 300 colis.
                  t.rich("tableau.parMois", { n: nombre(parMois), ...gras }),
          },
        ]),
    {
      cle: "adresse",
      gratuit: <code className="tp-code">{t("tableau.adresseGratuit")}</code>,
      pro: <code className="tp-code tp-code--pro">{t("tableau.adressePro")}</code>,
    },
    { cle: "carte", gratuit: t("tableau.carteGratuit"), pro: t("tableau.cartePro") },
    { cle: "medias", gratuit: inclus, pro: inclus },
    { cle: "couleurs", gratuit: inclus, pro: inclus },
  ];

  const nom = profil?.nomAffiche ?? profil?.nomBoutique ?? null;
  const prix = t("parMois", {
    prix: format.number(PRIX_PRO_EUR, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }),
  });

  /* LA REFONTE (02/10/2026) suit `passer-pro.html` : l'accroche, les quatre
     atouts, puis le tableau Gratuit / Pro. Les plafonds et le prix sont LUS
     (base, `PRIX_PRO_EUR`) : un plafond illisible retire ses lignes plutôt que
     d'écrire un nombre. Le paiement est un lien SIGNÉ vers Lemon Squeezy (204) :
     aucun paiement ne passe par le produit (contrainte n° 1). */
  return (
    <main id="contenu" className="tableau pro-ecran">
      <div className="tableau__tete">
        <div>
          <p className="v4-fil">
            {nom === null ? null : (
              <>
                <span>{nom}</span>
                <ChevronRight aria-hidden="true" className="ic" />
              </>
            )}
            <LienEcran href={`/${langue}/parametres?section=abonnement`}>{t("filParametres")}</LienEcran>
            <ChevronRight aria-hidden="true" className="ic" />
            <b>{t("titre")}</b>
          </p>
          <h1>{t("titre")}</h1>
          <p>{t("sousTitre")}</p>
        </div>
      </div>

      <section className="pro-accroche">
        <p className="l4-etiquette">
          <span>
            <Crown aria-hidden="true" className="ic" />
          </span>
          {t("eyebrow")}
        </p>
        <h2>{t("accroche")}</h2>
        <p>{t("intro")}</p>
      </section>

      <div className="pro-atouts">
        {FEATURES.map(({ cle, Icone }) => (
          <section key={cle} className="bloc pro-atout v4-carte">
            <span className="pro-atout__icone">
              <Icone aria-hidden="true" className="ic" />
            </span>
            <div>
              <h3>{t(`features.${cle}.titre`)}</h3>
              {/* Le nombre du plafond gratuit, dès qu'il est lu ; illisible, la
                  phrase ne cite aucun nombre. */}
              <p>
                {cle === "commandes" && aVie !== null
                  ? t("features.commandes.texteNombre", { n: aVie })
                  : t(`features.${cle}.texte`)}
              </p>
            </div>
          </section>
        ))}
      </div>

      <section className="bloc pro-comparer" aria-label={t("comparaisonCourt")}>
        <div className="tp pro-tp">
          <table className="tp__table">
            <caption className="visuellement-cache">{t("comparaison")}</caption>
            <colgroup>
              <col className="tp__col-libelle" />
              <col />
              <col className="tp__col-pro" />
            </colgroup>
            <thead>
              <tr>
                <td className="tp__coin" />
                <th scope="col">
                  <span className="tp__nom">{t("gratuit")}</span>
                </th>
                <th scope="col" className="tp__pro">
                  <span className="tp__nom">{t("pro")}</span>
                  <span className="pro-prix">{prix}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {LIGNES.map((ligne) => (
                <tr key={ligne.cle}>
                  <th scope="row">{t(`tableau.${ligne.cle}`)}</th>
                  <td>{ligne.gratuit}</td>
                  <td>{ligne.pro}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer className="pro-pied">
          <p>{t("facture")}</p>
          {dejaPro ? (
            <span className="pro-actif">
              <BadgeCheck aria-hidden="true" className="ic" />
              {t("dejaPro")}
            </span>
          ) : paiement === null ? (
            <span className="pro-pied__ferme">{t("pasEncoreOuvert")}</span>
          ) : (
            <a href={paiement} target="_blank" rel="noopener noreferrer" className="bouton-app bouton-app--marque pro-pied__payer">
              {t("passer")}
              <ArrowRight aria-hidden="true" className="ic" />
            </a>
          )}
        </footer>
      </section>
    </main>
  );
}
