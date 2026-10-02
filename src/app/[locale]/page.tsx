import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  CircleCheck,
  ClockAlert,
  EyeOff,
  Link as IconeLien,
  Package,
  Palette,
  Plus,
  Share2,
  Truck,
  Upload,
} from "lucide-react";
import { routing } from "@/i18n/routing";
import { alternatesDe, openGraphDe } from "@/lib/seo/alternates";
import { donneesStructurees } from "@/lib/seo/donnees-structurees";
import { estLangueSupportee, LANGUE_DEFAUT } from "@/i18n/config";
import { lirePlafondsPublics } from "@/lib/page-publique/plafonds";
import { limites } from "@/lib/storage/limites";
import { PRIX_PRO_EUR } from "@/lib/paiement/plan";
import { LogoDropLink } from "@/components/logo-droplink";
import { EntetePublique } from "@/components/public/entete-publique";
import { PiedPublic } from "@/components/public/pied-public";
import { SelecteurLangue } from "@/components/landing/selecteur-langue";
import { PageClientDemo } from "@/components/landing/page-client-demo";
import { IMAGES_DEMO } from "@/components/landing/images-demo";
import { AnimationsLanding } from "@/components/landing/animations-landing";

/*
 * LA LANDING DE LA REFONTE (maquette, `design/maquette/src/index.html`, « l4 »).
 *
 * Ce qui la distingue de la maquette, et pourquoi :
 * - les QUOTAS et le PRIX sont lus en base et dans `PRIX_PRO_EUR` (décision n° 3
 *   de Mehdi) : un plafond illisible retire la ligne, ou la phrase se dit sans
 *   nombre — jamais un chiffre de secours ;
 * - la page reste PRÉRENDUE, revalidée toutes les cinq minutes : les plafonds se
 *   lisent sans session (`lirePlafondsPublics`), et un changement d'administration
 *   arrive sur la landing en cinq minutes au plus ;
 * - partent, comme dans la maquette, les témoignages, « +2 500 vendeurs », la ligne
 *   « Utilisé par des vendeurs sur Vinted, eBay… » et « Fonctionne avec Vinted,
 *   eBay… » : des affirmations invérifiables (décisions des 01 et 02/10/2026) ;
 * - le sélecteur de langue, les mentions légales et le JSON-LD du produit restent ;
 * - aucun thème sombre ;
 * - un seul dégradé : « Commencer gratuitement » du héros (règle 3).
 *
 * Le mouvement est porté par UN îlot client (`AnimationsLanding`) qui anime ce que
 * le serveur a rendu ; sans lui, tout reste lisible, dans son état final.
 */

export const revalidate = 300;

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

/** Les dates de la démonstration (28 sept. → 1 oct.), formatées par la langue de la page. */
const JOURS_DEMO = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01"] as const;

export default async function Accueil({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const langue = estLangueSupportee(locale) ? locale : LANGUE_DEFAUT;
  const t = await getTranslations("accueil");
  const tl = await getTranslations("landing");
  const nav = await getTranslations("navigation");
  const pp = await getTranslations("page-publique");
  const format = await getFormatter();

  const [{ gratuitAVie, proParMois }, enCatalogues] = await Promise.all([
    lirePlafondsPublics(),
    Promise.all(
      routing.locales.map(async (l) => {
        const tp = await getTranslations({ locale: l, namespace: "page-publique" });
        return { code: l, commandeDe: tp("commandeDe"), titre: tp("titre") };
      }),
    ),
  ]);
  const maxMedias = limites().mediasParCommande;
  const prix = format.number(PRIX_PRO_EUR, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const zero = format.number(0, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const jourDemo = (j: string) =>
    format.dateTime(new Date(`${j}T12:00:00Z`), { day: "numeric", month: "short", timeZone: "UTC" });
  const datesEtapes = [jourDemo(JOURS_DEMO[0]), jourDemo(JOURS_DEMO[1]), jourDemo(JOURS_DEMO[2]), jourDemo(JOURS_DEMO[3])] as const;
  const dateHistorique = (iso: string): string =>
    format.dateTime(new Date(iso), { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

  const graphe = donneesStructurees(langue, { nom: "DropLink", description: tl("metaDescription") });
  const inscription = `/${locale}/inscription`;
  const offertes =
    gratuitAVie === null ? t("garanties.offertesSansNombre") : t("garanties.offertes", { n: gratuitAVie });
  const garanties = [offertes, t("garanties.carte"), t("garanties.compte")];
  const gras = { b: (morceau: React.ReactNode) => <b>{morceau}</b> };

  const ETAPES_HEROS = [
    ["preparation", "fait"],
    ["expedie", "actuel"],
    ["en_transit", ""],
    ["livre", ""],
  ] as const;
  const GESTES = [
    [t("studio.g1"), t("studio.g1t")],
    [t("studio.g2"), t("studio.g2t", { n: maxMedias })],
    [t("studio.g3"), t("studio.g3t")],
    [t("studio.g4"), t("studio.g4t")],
  ] as const;
  const QUESTIONS = [
    t("probleme.q1"),
    t("probleme.q2"),
    t("probleme.q3"),
    t("probleme.q4"),
    t("probleme.q5"),
    t("probleme.q6"),
    t("probleme.q7"),
    t("probleme.q8"),
  ];
  const TEINTES = [
    ["#5B4BF5", t("client.violet")],
    ["#E0533F", t("client.corail")],
    ["#0F766E", t("client.vert")],
    ["#F5C518", t("client.jaune")],
  ] as const;
  const inclus = <Check className="ic tp-oui" role="img" aria-label={t("tarifs.inclus")} />;
  const nonInclus = (
    <span className="tp-non">
      <span className="visuellement-cache">{t("tarifs.nonInclus")}</span>
    </span>
  );

  return (
    <div className="l4">
      {graphe === null ? null : (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(graphe).replace(/</g, "\\u003c") }}
        />
      )}
      {/* Le mouvement de la landing est gardé par la classe `js`, posée avant le
          premier rendu par `ScriptJs` (coque de langue), comme sur toutes les surfaces. */}
      <a className="evitement" href="#contenu">
        {nav("allerAuContenu")}
      </a>
      <EntetePublique
        accueil={`/${locale}`}
        libelleAccueil={t("accueil")}
        logo={<LogoDropLink />}
        etiquetteNav={t("nav.principale")}
        liens={[
          { href: "#studio", libelle: t("nav.comment") },
          { href: "#client", libelle: t("nav.client") },
          { href: "#tarifs", libelle: t("nav.tarifs") },
          { href: "#questions", libelle: t("nav.questions") },
        ]}
        connexion={{ href: `/${locale}/connexion`, libelle: nav("seConnecter") }}
        inscription={{ href: inscription, libelle: nav("creerCompte") }}
        selecteurLangue={<SelecteurLangue locale={locale} compact />}
        libellesMenu={{ ouvrir: nav("ouvrirMenu"), fermer: nav("fermerMenu") }}
      />

      <main id="contenu">
        {/* ==== HÉROS ==== */}
        <section className="heros">
          <div className="conteneur heros__grille">
            <div className="heros__texte">
              <a className="l4-pastille" href="#tarifs" data-entree>
                <span>{t("heros.pastillePro")}</span>
                <i className="l4-pastille__texte">
                  {t("heros.pastille")}
                  <em>{t("heros.pastilleUrl")}</em>
                </i>
                <ArrowRight aria-hidden="true" className="ic" />
              </a>
              <h1 className="heros__titre l4-titre">
                <span className="l4-ligne" style={{ "--l": 0 } as React.CSSProperties}>
                  {t("heros.titre1")}
                </span>{" "}
                <span className="l4-ligne" style={{ "--l": 1 } as React.CSSProperties}>
                  <span>{t("heros.titre2")}</span>
                </span>
              </h1>
              <p className="heros__chapo" data-entree>
                {t("heros.chapo")}
              </p>
              <div className="heros__actions" data-entree>
                <Link className="bouton bouton--marque" href={inscription}>
                  {t("heros.cta")}
                  <ArrowRight aria-hidden="true" className="ic" />
                </Link>
                <a className="bouton bouton--second" href="#client">
                  {t("heros.cta2")}
                </a>
              </div>
              <ul className="l4-garanties" data-entree>
                {garanties.map((g) => (
                  <li key={g}>
                    <Check aria-hidden="true" className="ic" />
                    {g}
                  </li>
                ))}
              </ul>
            </div>

            <div className="heros__scene hx" data-hx role="img" aria-label={t("scene.description")}>
              <div className="hx__scene" aria-hidden="true">
                <svg className="hx__fils" data-hx-fils />
                <article className="hx__carte hx__carte--suivi pc" data-hx-carte style={{ "--p": 1.5 } as React.CSSProperties}>
                  <header className="hx__boutique">
                    <i className="hx__monogramme">AN</i>
                    <p>
                      <b>{t("scene.boutique")}</b>
                      <small>{t("scene.pour")}</small>
                    </p>
                    <p className="hx__ref">
                      <small>{t("scene.commande")}</small>
                      <b>6A4D21</b>
                    </p>
                  </header>
                  <div className="hx__ligne">
                    <div className="pc__date">
                      <i className="pc__tuile">
                        <CalendarDays aria-hidden="true" className="ic" />
                      </i>
                      <p>
                        <small>{pp("commande.dateEstimee")}</small>
                        <strong>{t("scene.dates")}</strong>
                      </p>
                    </div>
                    <em className="hx__direct" data-hx-direct>
                      <i />
                      {t("scene.direct")}
                    </em>
                  </div>
                  <ol className="pc__frise" data-hx-frise style={{ "--avance": 1 } as React.CSSProperties}>
                    {ETAPES_HEROS.map(([cle, etat], i) => (
                      <li key={cle} className={etat}>
                        <i>
                          <Check aria-hidden="true" className="ic" />
                        </i>
                        <b>{pp(`frise.${cle}`)}</b>
                        <small className="pc__quand">{datesEtapes[i]}</small>
                        <small className="pc__pastille">{pp("frise.enCours")}</small>
                        <small className="pc__attente">{pp("frise.enAttente")}</small>
                      </li>
                    ))}
                  </ol>
                  <div className="pc__bandeau">
                    <Truck aria-hidden="true" className="ic" />
                    <p>
                      <strong data-hx-bandeau data-apres={pp("bandeau.en_transit")}>
                        {pp("bandeau.expedie")}
                      </strong>
                      <small data-hx-mouvement data-apres={t("scene.mouvementAujourdhui")}>
                        {t("scene.mouvementHier")}
                      </small>
                    </p>
                  </div>
                </article>

                <article className="hx__carte hx__carte--photos pc" data-hx-carte style={{ "--p": 1 } as React.CSSProperties}>
                  <p className="hx__titre">
                    <span>
                      {t("scene.photos")}
                      <span className="hx__long">{t("scene.etVideos")}</span>
                    </span>
                    <em className="hx__compte">4</em>
                  </p>
                  <div className="pc__grille">
                    {IMAGES_DEMO.map((img, i) => (
                      <figure key={i} data-hx-photo>
                        <Image src={img} alt="" width={90} height={90} sizes="90px" />
                      </figure>
                    ))}
                  </div>
                  <p className="hx__tampon" data-hx-tampon>
                    <CircleCheck aria-hidden="true" className="ic" />
                    <span>
                      {t("scene.approuvees")} <span>{t("scene.parLea")}</span>
                    </span>
                  </p>
                </article>

                <div className="message hx__message" data-hx-message style={{ "--p": 0.6 } as React.CSSProperties}>
                  <div className="message__entete">
                    <span className="avatar">AN</span>
                    <span>
                      <strong>{t("scene.boutique")}</strong>
                      <small>{t("scene.aLea")}</small>
                    </span>
                  </div>
                  <p className="message__bulle">{t("scene.message")}</p>
                  <div className="apercu-lien" data-hx-lien>
                    <Image src={IMAGES_DEMO[0]} alt="" width={44} height={44} sizes="44px" />
                    <div>
                      <strong>{t("scene.commandeRef", { ref: "6A4D21" })}</strong>
                      <span>droplink.fr/p/k7Qm2xR9vLpA</span>
                    </div>
                  </div>
                  <p className="message__statut">
                    <Check aria-hidden="true" className="ic" />
                    {t("scene.vu")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ==== CHIFFRES : ceux du produit, rien d'autre ==== */}
        <section className="l4-chiffres" aria-label={t("chiffres.titre")}>
          <div className="conteneur l4-chiffres__grille">
            {(
              [
                [maxMedias, t("chiffres.medias")],
                [4, t("chiffres.etapes")],
                [routing.locales.length, t("chiffres.langues")],
                [0, t("chiffres.compte")],
              ] as const
            ).map(([n, libelle]) => (
              <p key={libelle}>
                <b className="l4-compteur" data-compteur={n}>
                  {n}
                </b>
                <span>{libelle}</span>
              </p>
            ))}
          </div>
        </section>

        {/* ==== LE PROBLÈME ==== */}
        <section className="probleme" aria-labelledby="probleme-titre">
          <div className="conteneur conteneur--etroit">
            <h2 id="probleme-titre" className="titre-section l4-mots" data-mots>
              <Mots texte={t("probleme.titre1")} />
              <br />
              <Mots texte={t("probleme.titre2")} />
            </h2>
          </div>
          <div className="defileur" aria-hidden="true">
            <div className="defileur__piste" data-defileur>
              {[...QUESTIONS, ...QUESTIONS].map((q, i) => (
                <span key={i} className="question">
                  {q}
                </span>
              ))}
            </div>
          </div>
          <div className="conteneur conteneur--etroit">
            <p className="probleme__reponse" data-apparait>
              {t("probleme.reponse1")} <span>{t("probleme.reponse2")}</span>
            </p>
          </div>
        </section>

        {/* ==== STUDIO : l'éditeur et la page client, côte à côte ==== */}
        <section className="studio" id="studio" aria-labelledby="studio-titre">
          <div className="conteneur">
            <div className="entete-section" data-apparait>
              <p className="l4-etiquette">
                <span>01</span>
                {t("studio.etiquette")}
              </p>
              <h2 id="studio-titre" className="titre-section">
                {t("studio.titre1")}
                <br />
                {t("studio.titre2")}
              </h2>
              <p className="chapo">{t("studio.chapo")}</p>
            </div>

            <div className="studio__onglets" role="tablist" aria-label={t("studio.gestes")} data-onglets data-apparait>
              {GESTES.map(([titre, texte], i) => (
                <button
                  key={titre}
                  role="tab"
                  type="button"
                  aria-selected={i === 0}
                  aria-controls="studio-plan"
                  id={`onglet-${i}`}
                  data-onglet={i}
                  tabIndex={i === 0 ? 0 : -1}
                >
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <b className="l4-geste">
                    {titre}
                    <small>{texte}</small>
                  </b>
                  <i className="studio__jauge" />
                </button>
              ))}
            </div>

            <div
              className="studio__plan"
              id="studio-plan"
              role="tabpanel"
              aria-labelledby="onglet-0"
              data-studio
              data-etape="0"
              data-apparait
              data-legendes={JSON.stringify(GESTES.map(([, texte]) => texte))}
              data-compte-modele={t("studio.compteMedias", { n: "{n}", max: maxMedias })}
            >
              <p className="studio__legende" data-legende>
                {GESTES[0][1]}
              </p>
              <div className="studio__scene">
                <div className="editeur" aria-hidden="true">
                  <div className="editeur__tete">
                    <div>
                      <small>{t("studio.commandes")}</small>
                      <b>#6A4D21</b>
                    </div>
                    <div className="editeur__actions">
                      <span className="editeur__enregistre">
                        <Check aria-hidden="true" className="ic" />
                        {t("studio.enregistre")}
                      </span>
                      <span className="editeur__partager" data-partager>
                        <span className="editeur__partager-a">
                          <Share2 aria-hidden="true" className="ic" />
                          {t("studio.partager")}
                        </span>
                        <span className="editeur__partager-b">
                          <Check aria-hidden="true" className="ic" />
                          {t("studio.copie")}
                        </span>
                      </span>
                    </div>
                  </div>
                  <div className="editeur__carte">
                    <b className="editeur__titre">{t("studio.laCommande")}</b>
                    <div className="editeur__grille">
                      <div className="champ" data-champ="client">
                        <small>{t("studio.champClient")}</small>
                        <span className="champ__boite">
                          <span className="champ__valeur" data-saisie="Léa M." />
                          <i className="champ__curseur" />
                          <span className="champ__vide">{t("studio.exClient")}</span>
                        </span>
                        <em>{t("studio.aideClient")}</em>
                      </div>
                      <div className="champ">
                        <small>{t("studio.champRef")}</small>
                        <span className="champ__boite">
                          <span className="champ__valeur">{t("studio.valeurRef")}</span>
                        </span>
                      </div>
                      <div className="champ" data-champ="suivi">
                        <small>{t("studio.champSuivi")}</small>
                        <span className="champ__boite">
                          <span className="champ__valeur" data-saisie="6A30489215734" />
                          <i className="champ__curseur" />
                          <span className="champ__vide">{t("studio.collez")}</span>
                        </span>
                      </div>
                      <div className="champ" data-champ="transporteur">
                        <small>{t("studio.champTransporteur")}</small>
                        <span className="champ__boite champ__boite--liste">
                          <span className="transporteur" data-transporteur>
                            <span className="transporteur__a">{t("studio.detection")}</span>
                            <span className="transporteur__b">
                              <CircleCheck aria-hidden="true" className="ic" />
                              Colissimo
                            </span>
                          </span>
                          <ChevronDown aria-hidden="true" className="ic" />
                        </span>
                      </div>
                    </div>
                    <div className="depot" data-depot>
                      <div className="depot__tete">
                        <b>{t("studio.medias")}</b>
                        <small data-compte-medias>{t("studio.compteMedias", { n: 0, max: maxMedias })}</small>
                      </div>
                      <div className="depot__grille">
                        {IMAGES_DEMO.map((img, i) => (
                          <figure key={i} className="depot__media">
                            <Image src={img} alt="" width={90} height={90} sizes="90px" />
                            {i === 0 ? <span>{t("studio.couverture")}</span> : null}
                          </figure>
                        ))}
                        <span className="depot__ajouter">
                          <Upload aria-hidden="true" className="ic" />
                          {t("studio.ajouter")}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="lien-partage" data-lien>
                    <IconeLien aria-hidden="true" className="ic" />
                    <span>droplink.fr/p/k7Qm2xR9vLpA</span>
                    <small>{t("studio.lienFixe")}</small>
                  </div>
                </div>
                <div className="studio__apercu" aria-hidden="true">
                  <div className="telephone telephone--studio">
                    <div className="telephone__ecran">
                      <PageClientDemo datesEtapes={datesEtapes} />
                    </div>
                  </div>
                  <p className="studio__sync">
                    <i />
                    {t("studio.apercu")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ==== CE QUE LE CLIENT OUVRE ==== */}
        <section className="client" id="client" aria-labelledby="client-titre">
          <div className="conteneur">
            <div className="entete-section" data-apparait>
              <p className="l4-etiquette">
                <span>02</span>
                {t("client.etiquette")}
              </p>
              <h2 id="client-titre" className="titre-section">
                {t("client.titre")}
              </h2>
              <p className="chapo">{t("client.chapo")}</p>
            </div>

            <div className="grille-client">
              <article className="case case--couleurs" data-apparait>
                <div className="case__texte">
                  <h3>{t("client.couleursTitre")}</h3>
                  <p>{t("client.couleursTexte")}</p>
                  <div className="nuancier" role="radiogroup" aria-label={t("client.nuancier")}>
                    {TEINTES.map(([hex, nom], i) => (
                      <button
                        key={hex}
                        type="button"
                        role="radio"
                        aria-checked={i === 0}
                        tabIndex={i === 0 ? 0 : -1}
                        data-teinte={hex}
                        style={{ "--pastille": hex } as React.CSSProperties}
                      >
                        <span className="sr">{nom}</span>
                      </button>
                    ))}
                    <label className="nuancier__libre">
                      <input type="color" defaultValue="#5B4BF5" data-couleur-libre aria-label={t("client.libre")} />
                      <Palette aria-hidden="true" className="ic" />
                    </label>
                  </div>
                  <p
                    className="nuancier__code"
                    aria-live="polite"
                    data-code-couleur
                    data-ajuste={t("client.ajuste")}
                  >
                    {t("client.choisie")} <code>#5B4BF5</code>
                  </p>
                </div>
                <div className="telephone telephone--case" aria-hidden="true">
                  <div className="telephone__ecran" data-teinte-cible>
                    <PageClientDemo datesEtapes={datesEtapes} />
                  </div>
                </div>
              </article>

              <article className="case case--livraison" data-apparait>
                <div className="case__texte">
                  <h3>{t("client.livraisonTitre")}</h3>
                  <p>{t("client.livraisonTexte")}</p>
                </div>
                <div className="mini-suivi" aria-hidden="true">
                  <div className="pc__date">
                    <i className="pc__tuile">
                      <CalendarDays aria-hidden="true" className="ic" />
                    </i>
                    <p>
                      <small>{pp("commande.dateEstimee")}</small>
                      <strong>{t("scene.dates")}</strong>
                    </p>
                  </div>
                  <ol className="pc__frise" data-frise-demo style={{ "--avance": 2 } as React.CSSProperties}>
                    {(["preparation", "expedie", "en_transit", "livre"] as const).map((cle, i) => (
                      <li key={cle} className={i < 2 ? "fait" : i === 2 ? "actuel" : ""}>
                        <i>
                          <Check aria-hidden="true" className="ic" />
                        </i>
                        <b>{pp(`frise.${cle}`)}</b>
                        <small className="pc__quand">{datesEtapes[i]}</small>
                        <small className="pc__pastille">{pp("frise.enCours")}</small>
                        <small className="pc__attente">{pp("frise.enAttente")}</small>
                      </li>
                    ))}
                  </ol>
                </div>
              </article>

              <article className="case case--validation" data-apparait>
                <div className="case__texte">
                  <h3>{t("client.validationTitre")}</h3>
                  <p>{t("client.validationTexte")}</p>
                </div>
                <div className="qc" data-qc data-approuve={pp("qc.approuve")} data-refuse={pp("qc.refuse")}>
                  <div className="qc__question" data-qc-question>
                    <b>{pp("qc.titre")}</b>
                    <p>{pp("qc.texte")}</p>
                    <div className="qc__vignettes" aria-hidden="true">
                      {IMAGES_DEMO.map((img, i) => (
                        <Image key={i} src={img} alt="" width={90} height={90} sizes="90px" />
                      ))}
                    </div>
                    <div className="qc__actions">
                      <button type="button" className="qc__refuser" data-qc-refuser>
                        {pp("qc.refuser")}
                      </button>
                      <button type="button" className="qc__approuver" data-qc-approuver>
                        {pp("qc.approuver")}
                      </button>
                    </div>
                  </div>
                  <div className="qc__reponse" hidden data-qc-reponse>
                    <span className="qc__sceau" data-qc-sceau>
                      <Check aria-hidden="true" className="ic" data-sceau="ok" />
                    </span>
                    <b data-qc-texte>{pp("qc.approuve")}</b>
                    <button type="button" className="qc__changer" data-qc-changer>
                      {pp("qc.modifier")}
                    </button>
                  </div>
                </div>
              </article>

              <article className="case case--langues" data-apparait>
                <div className="case__texte">
                  <h3>{t("client.languesTitre")}</h3>
                  <p>{t("client.languesTexte")}</p>
                </div>
                <p className="langues" aria-hidden="true">
                  {enCatalogues.map((c, i) => (
                    <span key={c.code} className={"langues__ligne" + (i === 0 ? " est-actif" : "")} lang={c.code}>
                      <small>
                        {c.commandeDe} {t("scene.boutique")}
                      </small>
                      {c.titre}
                    </span>
                  ))}
                </p>
              </article>

              <article className="case case--historique" data-apparait>
                <div className="case__texte">
                  <h3>{t("client.historiqueTitre")}</h3>
                  <p>{t("client.historiqueTexte")}</p>
                </div>
                <ol className="historique" aria-label={t("client.historiqueEtiquette")}>
                  <li className="historique__recent">
                    <i>
                      <Truck aria-hidden="true" className="ic" />
                    </i>
                    <p>
                      <small>{dateHistorique("2026-09-30T07:19:00Z")}</small>
                      <b>{t("client.h1")}</b>
                      <span>{t("client.h1lieu")}</span>
                    </p>
                  </li>
                  <li>
                    <i>
                      <Package aria-hidden="true" className="ic" />
                    </i>
                    <p>
                      <small>{dateHistorique("2026-09-29T18:19:00Z")}</small>
                      <b>{t("client.h2")}</b>
                      <span>{t("client.h2lieu")}</span>
                    </p>
                  </li>
                  <li>
                    <i>
                      <Package aria-hidden="true" className="ic" />
                    </i>
                    <p>
                      <small>{dateHistorique("2026-09-28T11:19:00Z")}</small>
                      <b>{t("client.h3")}</b>
                    </p>
                  </li>
                </ol>
              </article>
            </div>
          </div>
        </section>

        {/* ==== CÔTÉ VENDEUR ==== */}
        <section className="l4-vendeur" id="vendeur" aria-labelledby="vendeur-titre">
          <div className="conteneur">
            <div className="entete-section" data-apparait>
              <p className="l4-etiquette">
                <span>03</span>
                {t("vendeur.etiquette")}
              </p>
              <h2 id="vendeur-titre" className="titre-section">
                {t("vendeur.titre1")}
                <br />
                {t("vendeur.titre2")}
              </h2>
              <p className="chapo">{t("vendeur.chapo")}</p>
            </div>
            <div className="l4-bento">
              <article className="l4-carte l4-carte--alertes" data-anime>
                <div className="l4-carte__texte">
                  <h3>{t("vendeur.alertesTitre")}</h3>
                  <p>{t("vendeur.alertesTexte")}</p>
                </div>
                <div className="l4-alertes" aria-hidden="true">
                  <p className="l4-alertes__tete">
                    <Bell aria-hidden="true" className="ic" />
                    {(await getTranslations("alertes"))("titre")} <span>2</span>
                  </p>
                  <AlerteDemo ton="attente" famille="jamaisOuvertes" />
                  <AlerteDemo ton="silence" famille="silencieux" />
                </div>
              </article>

              <article className="l4-carte l4-carte--vues" data-anime>
                <div className="l4-carte__texte">
                  <h3>{t("vendeur.vuesTitre")}</h3>
                  <p>{t("vendeur.vuesTexte")}</p>
                </div>
                <div className="l4-vues" aria-hidden="true">
                  <p className="l4-vues__total">
                    <b className="l4-compteur" data-compteur="142">
                      142
                    </b>
                    <span>{t("vendeur.ouvertures")}</span>
                  </p>
                  <div className="l4-barres">
                    {[0.32, 0.45, 0.38, 0.6, 0.52, 0.74, 0.66, 0.9, 0.71, 0.84, 1, 0.88].map((h, i) => (
                      <i key={i} style={{ "--h": h, "--n": i } as React.CSSProperties} />
                    ))}
                  </div>
                  <ol className="l4-classement">
                    {(
                      [
                        ["Luca R.", 9],
                        ["Maëlys D.", 8],
                        ["Yanis B.", 7],
                      ] as const
                    ).map(([nom, n], i) => (
                      <li key={nom}>
                        <span>{i + 1}</span>
                        <b>{nom}</b>
                        <small>{t("vendeur.vues", { n })}</small>
                      </li>
                    ))}
                  </ol>
                </div>
              </article>

              <article className="l4-carte l4-carte--envois" data-anime>
                <div className="l4-carte__texte">
                  <h3>{t("vendeur.envoisTitre")}</h3>
                  <p>{t("vendeur.envoisTexte")}</p>
                </div>
                <ul className="l4-envois" aria-hidden="true">
                  {(
                    [
                      ["transit", t("vendeur.enTransit"), "6A30489215734", "Colissimo · Léa M.", t("vendeur.e1")],
                      ["transit", t("vendeur.enTransit"), "6A30571182466", "Colissimo · Ethan G.", t("vendeur.e2")],
                      ["livre", t("vendeur.livre"), "6A29917702231", "Colissimo · Luca R.", t("vendeur.e3")],
                      ["silence", t("vendeur.sansMouvement"), "LA982231665FR", "Inès D.", t("vendeur.e4")],
                    ] as const
                  ).map(([etat, libelle, numero, qui, dernier], i) => (
                    <li key={numero} style={{ "--n": i } as React.CSSProperties}>
                      <span className="l4-etat" data-etat={etat}>
                        {libelle}
                      </span>
                      <b>{numero}</b>
                      <small>{qui}</small>
                      <em>{dernier}</em>
                    </li>
                  ))}
                </ul>
              </article>
            </div>
          </div>
        </section>

        {/* ==== TARIFS : les plafonds viennent de la base ==== */}
        <section className="tarifs" id="tarifs" aria-labelledby="tarifs-titre">
          <div className="conteneur">
            <div className="entete-section entete-section--centre" data-apparait>
              <p className="l4-etiquette">
                <span>04</span>
                {t("tarifs.etiquette")}
              </p>
              <h2 id="tarifs-titre" className="titre-section">
                {t("tarifs.titre1")}
                <br />
                {t("tarifs.titre2")}
              </h2>
            </div>
            <div className="tp" data-anime>
              <table className="tp__table">
                <caption className="visuellement-cache">{t("tarifs.legende")}</caption>
                <colgroup>
                  <col className="tp__col-libelle" />
                  <col />
                  <col className="tp__col-pro" />
                </colgroup>
                <thead>
                  <tr>
                    <td className="tp__coin">
                      <p>{t("tarifs.coin")}</p>
                    </td>
                    <th scope="col">
                      <span className="tp__nom">{t("tarifs.gratuit")}</span>
                      <span className="tp__prix">
                        <b>{zero}</b>
                      </span>
                      <span className="tp__note">{t("tarifs.sansCarte")}</span>
                      <Link className="bouton bouton--second bouton--large" href={inscription}>
                        {t("tarifs.ctaGratuit")}
                      </Link>
                    </th>
                    <th scope="col" className="tp__pro">
                      <span className="tp__nom">{t("tarifs.pro")}</span>
                      <span className="tp__prix">
                        <b>{prix}</b>
                        <small>{t("tarifs.parMois")}</small>
                      </span>
                      <span className="tp__note">{t("tarifs.sansEngagement")}</span>
                      <Link className="bouton bouton--plein bouton--large" href={inscription}>
                        {t("tarifs.ctaPro")}
                      </Link>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {gratuitAVie === null || proParMois === null
                    ? null
                    : (["commandes", "colis"] as const).map((cle, i) => (
                        <tr key={cle} style={{ "--i": i } as React.CSSProperties}>
                          <th scope="row">{t(`tarifs.${cle}`)}</th>
                          <td>{t.rich("tarifs.auTotal", { ...gras, n: format.number(gratuitAVie) })}</td>
                          <td>{t.rich("tarifs.parMoisN", { ...gras, n: format.number(proParMois) })}</td>
                        </tr>
                      ))}
                  {(
                    [
                      ["medias", t("tarifs.parCommande", { n: maxMedias }), t("tarifs.parCommande", { n: maxMedias })],
                      ["suiviAuto", inclus, inclus],
                      ["couleurs", inclus, inclus],
                      ["lien", nonInclus, <span key="url" className="tp-url">{t("tarifs.lienUrl")}</span>],
                      ["sansMention", nonInclus, inclus],
                    ] as const
                  ).map(([cle, gratuit, pro], i) => (
                    <tr key={cle} style={{ "--i": i + 2 } as React.CSSProperties}>
                      <th scope="row">{t(`tarifs.${cle}`)}</th>
                      <td>{gratuit}</td>
                      <td>{pro}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="tp__actions">
                <Link className="bouton bouton--plein bouton--large" href={inscription}>
                  {t("tarifs.ctaPro")}
                </Link>
                <Link className="bouton bouton--second bouton--large" href={inscription}>
                  {t("tarifs.ctaGratuit")}
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ==== QUESTIONS ==== */}
        <section className="questions" id="questions" aria-labelledby="questions-titre">
          <div className="conteneur questions__grille">
            <div>
              <p className="l4-etiquette">
                <span>05</span>
                {t("questions.etiquette")}
              </p>
              <h2 id="questions-titre" className="titre-section">
                {t("questions.titre")}
              </h2>
            </div>
            <div className="accordeon">
              {(
                [
                  [t("questions.q1"), t("questions.r1")],
                  [t("questions.q2"), t("questions.r2")],
                  [t("questions.q3"), t("questions.r3")],
                  gratuitAVie === null || proParMois === null
                    ? [t("questions.q4SansNombre"), t("questions.r4SansNombre", { prix })]
                    : [
                        t("questions.q4", { n: gratuitAVie }),
                        t("questions.r4", {
                          gratuit: format.number(gratuitAVie),
                          pro: format.number(proParMois),
                          prix,
                        }),
                      ],
                ] as const
              ).map(([question, reponse]) => (
                <details key={question} name="faq">
                  <summary>
                    {question}
                    <Plus aria-hidden="true" className="ic" />
                  </summary>
                  <div className="accordeon__corps">
                    <p>{reponse}</p>
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ==== APPEL FINAL ==== */}
        <section className="final" aria-labelledby="final-titre">
          <div className="conteneur final__boite">
            <h2 id="final-titre" className="final__titre" data-apparait>
              {t("final.titre")}
            </h2>
            <Link className="l4-champ-final" href={inscription} data-apparait>
              <span className="l4-champ-final__url" aria-hidden="true">
                droplink.fr/
                <b data-slug data-slugs={t("final.slugs")}>
                  {t("final.slugs").split("|")[0]}
                </b>
                <i className="l4-curseur" />
              </span>
              <span className="bouton bouton--plein">
                {t("heros.cta")}
                <ArrowRight aria-hidden="true" className="ic" />
              </span>
            </Link>
            <ul className="faits" data-apparait>
              {garanties.map((g) => (
                <li key={g}>
                  <Check aria-hidden="true" className="ic" />
                  {g}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <PiedPublic locale={locale} />
      <AnimationsLanding />
    </div>
  );
}

/** Une phrase découpée en mots, pour qu'elle s'éclaire mot à mot au défilement. */
function Mots({ texte }: { readonly texte: string }) {
  const morceaux = texte.split(/(\s+)/).filter((m) => m !== "");
  return (
    <>
      {morceaux.map((m, i) => (/^\s+$/.test(m) ? m : <span key={i} className="l4-mot">{m}</span>))}
    </>
  );
}

/** Une alerte de la cloche, en miniature : les vrais libellés du produit (`alertes.*`). */
async function AlerteDemo({ ton, famille }: { readonly ton: "attente" | "silence"; readonly famille: "jamaisOuvertes" | "silencieux" }) {
  const t = await getTranslations("alertes");
  const Icone = ton === "attente" ? EyeOff : ClockAlert;
  return (
    <div className="l4-alerte" data-ton={ton}>
      <i>
        <Icone aria-hidden="true" className="ic" />
      </i>
      <span>
        <b>{t(`${famille}.titre`, { n: 1 })}</b>
        <small>{t(`${famille}.texte`)}</small>
      </span>
    </div>
  );
}
