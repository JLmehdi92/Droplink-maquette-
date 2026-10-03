import Link from "next/link";
import { BoutonAppliquerLangue } from "@/components/parametres/bouton-appliquer-langue";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import {
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleX,
  Crown,
  Database,
  Download,
  LifeBuoy,
  Lock,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import { LienEcran } from "@/components/lien-ecran";
import { TraductionsClient } from "@/components/traductions-client";
import { VuesListe } from "@/components/commandes/vues-liste";
import {
  BlocAdresse,
  BlocAppareilsFiables,
  BlocDeuxEtapes,
  BlocMotDePasse,
  BlocNom,
  PanneauReglages,
  BlocSessions,
  BlocSuppression,
  type AppareilFiableAffiche,
  type SessionAffichee,
} from "@/components/parametres/formulaires-parametres";
import { changerLangueInterface } from "./actions";
import { onboardingAFaire } from "@/lib/comptes/profil";
import { exigerVendeur } from "@/lib/comptes/apres-session";
import { decrireAppareil, lireMesSessions, type AppareilDecrit } from "@/lib/comptes/sessions";
import { creerClientServeur } from "@/lib/supabase/server";
import { LANGUES, estLangueSupportee } from "@/i18n/config";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "parametres" });
  return { title: t("titre"), robots: { index: false, follow: false } };
}

/** Marques et systèmes ne se traduisent pas (CLAUDE.md, « Multilingue »). */
const NAVIGATEURS = {
  edge: "Edge",
  opera: "Opera",
  samsung: "Samsung Internet",
  chrome: "Chrome",
  firefox: "Firefox",
  safari: "Safari",
} as const;
const SYSTEMES = { windows: "Windows", macos: "macOS", ios: "iOS", android: "Android", linux: "Linux" } as const;

function libelleAppareil({ navigateur, systeme }: AppareilDecrit): string | null {
  const parties = [
    navigateur === null ? null : NAVIGATEURS[navigateur],
    systeme === null ? null : SYSTEMES[systeme],
  ].filter((p) => p !== null);
  return parties.length === 0 ? null : parties.join(" · ");
}

/**
 * LES PARAMÈTRES DU VENDEUR, créés sur `SettingsView` du kit.
 *
 * ⚠️ UN ÉCRAN CRÉÉ, ET TOUT CE QU'IL AFFICHE EST RÉEL. Chaque ligne lit ou écrit
 * une donnée que la base porte ; aucune bascule ne décore une fonction absente.
 *
 * CE QUE LE KIT DESSINE ET QUI N'EST PAS ICI, avec la raison de chacun :
 *  - le téléphone : aucune fonction ne s'en sert, et collecter une donnée
 *    personnelle inemployée est ce que la minimisation interdit ;
 *  - la photo de profil : le compte porte déjà le logo de la boutique, et un
 *    second dépôt d'image est une surface d'écriture de plus sur R2 ;
 *  - le fuseau horaire : les dates sont formatées sans fuseau déclaré ;
 *    enregistrer une préférence que rien n'applique serait affirmer ce que le
 *    produit ne fait pas (principe XII) ;
 *  - les quatre bascules de notification : le produit n'envoie aucune
 *    notification au vendeur. Des interrupteurs sans effet sont des mensonges ;
 *  - les intégrations Shopify, Google Sheets, Webhook : aucune n'existe ;
 *  - « Nous contacter » : la seule adresse du produit est celle des
 *    signalements d'abus, et en faire un canal d'assistance mélangerait les
 *    deux — un signalement noyé dans les questions est un signalement en retard.
 *
 * LA SUPPRESSION du compte et des données suit la décision de Wassim du
 * 13/09/2026 (option A) : tout part, sauf l'adresse et les dates, gardées un an.
 * Voir la migration 157 et `actions.ts`.
 */
const SECTIONS = ["compte", "preferences", "securite", "abonnement", "donnees", "support"] as const;

export default async function Parametres({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const langue = estLangueSupportee(locale) ? locale : "fr";
  setRequestLocale(langue);

  const profil = await exigerVendeur(langue);
  if (onboardingAFaire(profil)) redirect(`/${langue}/bienvenue`);

  const [t, tl, format, supabase] = await Promise.all([
    getTranslations("parametres"),
    getTranslations("marque.langue"),
    getFormatter(),
    creerClientServeur(),
  ]);
  const requete = await searchParams;
  const adresseSuivie = requete["adresse"] === "suivie";
  const [lues, facteurs, quota, appareils] = await Promise.all([
    lireMesSessions(supabase),
    supabase.rpc("lister_mes_facteurs"),
    supabase.rpc("lire_plafond_gratuit_a_vie"),
    // Les appareils fiables ENCORE actifs (203), sous RLS : le vendeur ne lit que
    // les siens. Révoqués ou expirés, ils ne s'affichent pas.
    supabase
      .from("appareils_fiables")
      .select("id, agent, expire_le")
      .is("revoque_le", null)
      .gt("expire_le", new Date().toISOString())
      .order("cree_le", { ascending: false }),
  ]);
  // Le quota à vie d'un compte gratuit (175-176), lu en base : il se règle dans
  // l'administration. Illisible, la ligne disparaît plutôt que d'afficher un
  // nombre de secours — indiscernable d'un vrai.
  const quotaAVie = typeof quota.data === "number" ? quota.data : null;
  if (facteurs.error !== null) console.error("[parametres] facteurs illisibles — " + facteurs.error.message);
  // UNE LECTURE ÉCHOUÉE N'EST NI « ACTIVÉE » NI « DÉSACTIVÉE » (contrainte n° 8) :
  // l'écran le dit, et propose quand même d'activer — l'action d'enrôlement relit
  // l'état chez le serveur d'authentification et refuse si un facteur vérifié existe.
  const deuxEtapesActive: boolean | null = facteurs.error !== null ? null : (facteurs.data ?? []).length > 0;

  const sessions: readonly SessionAffichee[] | null =
    lues === null
      ? null
      : lues.map((s) => ({
          id: s.id,
          libelle: libelleAppareil(s.appareil),
          mobile: s.appareil.systeme === "ios" || s.appareil.systeme === "android",
          // Formatée ICI : une date formatée dans le navigateur prendrait son
          // fuseau, et l'hydratation divergerait du rendu serveur.
          activeLe: format.dateTime(new Date(s.activeLe), { dateStyle: "medium", timeStyle: "short" }),
          cetAppareil: s.cetAppareil,
        }));

  if (appareils.error !== null)
    console.error("[parametres] appareils fiables illisibles — " + appareils.error.message);
  // Illisibles → `null`, la liste dit « lecture impossible » plutôt que « aucun » :
  // un appareil fiable caché par une panne est un mensonge de sécurité.
  const appareilsFiables: readonly AppareilFiableAffiche[] | null =
    appareils.error !== null
      ? null
      : (appareils.data ?? []).map((a) => {
          const decrit = decrireAppareil(a.agent);
          return {
            id: a.id,
            libelle: libelleAppareil(decrit),
            mobile: decrit.systeme === "ios" || decrit.systeme === "android",
            actifJusqu: format.dateTime(new Date(a.expire_le), { dateStyle: "medium" }),
          };
        });

  const initiales = (profil.nomAffiche ?? profil.nomBoutique ?? profil.email)
    .split(/\s+/)
    .filter((m) => m !== "")
    .slice(0, 2)
    .map((m) => m[0]?.toUpperCase() ?? "")
    .join("");

  /*
   * LA REFONTE (02/10/2026) suit `parametres.html` : six onglets, une colonne de
   * blocs `.bloc-r`. Les onglets sont des LIENS (`?section=`), lus ici : l'écran
   * marche sans JavaScript, comme le reste de l'espace vendeur, et un lien mène
   * droit à une section (le retour d'un changement d'adresse ouvre « Compte »).
   */
  const section = SECTIONS.find((s) => s === requete["section"]) ?? "compte";
  const base = `/${langue}/parametres`;
  const nom = profil.nomAffiche ?? profil.nomBoutique;
  const onglets = [
    { clef: "compte", Icone: UserRound },
    { clef: "preferences", Icone: SlidersHorizontal },
    { clef: "securite", Icone: Lock },
    { clef: "abonnement", Icone: Crown },
    { clef: "donnees", Icone: Database },
    { clef: "support", Icone: LifeBuoy },
  ] as const;

  return (
    <main id="contenu" className="tableau reglages-ecran">
      <div className="tableau__tete">
        <div>
          <p className="v4-fil">
            {nom === null ? null : (
              <>
                <span>{nom}</span>
                <ChevronRight aria-hidden="true" className="ic" />
              </>
            )}
            <b>{t("titre")}</b>
          </p>
          <h1>{t("titre")}</h1>
          <p>{t("sousTitre")}</p>
        </div>
      </div>

      <div className="reglages__corps">
        {/* Une NAVIGATION nommée « Paramètres » autour des onglets, comme la maquette. */}
        <nav className="barre-liste reglages__onglets" aria-label={t("titre")}>
          <VuesListe
            etiquette={t("onglets.titre")}
            onglets={{ panneau: "panneau-reglages", toutesTouches: true }}
            vues={onglets.map(({ clef, Icone }) => ({
              clef,
              href: clef === "compte" ? base : `${base}?section=${clef}`,
              actif: section === clef,
              libelle: (
                <>
                  <Icone aria-hidden="true" className="ic" />
                  {t(`onglets.${clef}`)}
                </>
              ),
            }))}
          />
        </nav>

        <div className="reglages">
          <TraductionsClient espaces={["parametres"]}>
            <PanneauReglages key={section} id="panneau-reglages" onglet={`onglet-${section}`}>
              {section === "compte" ? (
                <>
                  <BlocNom nomActuel={profil.nomAffiche} initiales={initiales} repli={profil.nomBoutique ?? profil.email} />
                  <BlocAdresse adresse={profil.email} locale={langue} adresseSuivie={adresseSuivie} />
                  <BlocMotDePasse adresse={profil.email} />
                  <BlocSuppression variante="compte" adresse={profil.email} locale={langue} />
                </>
              ) : null}

              {section === "preferences" ? (
                /* « Appliquer » et non un changement au menu : déclencher la
                   navigation à chaque flèche du clavier est ce que WCAG 3.2.2
                   interdit. */
                <form action={changerLangueInterface} className="bloc-r">
                  <div className="bloc-r__corps">
                    <div className="bloc-r__tete">
                      <h2>{t("preferences.langue")}</h2>
                      <p>{t("preferences.aide")}</p>
                    </div>
                    <div className="champ-r champ-r--select">
                      <label htmlFor="langue-interface" className="visuellement-cache">
                        {t("preferences.langue")}
                      </label>
                      <select id="langue-interface" name="langue" defaultValue={langue}>
                        {LANGUES.map((l) => (
                          <option key={l} value={l}>
                            {tl(l)}
                          </option>
                        ))}
                      </select>
                      <ChevronDown aria-hidden="true" className="ic" />
                    </div>
                  </div>
                  <footer className="bloc-r__pied">
                    <p>
                      <LienEcran className="lien-r" href={`/${langue}/marque`}>
                        {t("preferences.languePubliqueAide")}
                      </LienEcran>
                    </p>
                    <BoutonAppliquerLangue initiale={langue}>{t("preferences.appliquer")}</BoutonAppliquerLangue>
                  </footer>
                </form>
              ) : null}

              {section === "securite" ? (
                <>
                  <BlocDeuxEtapes active={deuxEtapesActive} />
                  <BlocSessions sessions={sessions} />
                  {deuxEtapesActive === true ? <BlocAppareilsFiables appareils={appareilsFiables} /> : null}
                </>
              ) : null}

              {section === "abonnement" ? (
                /* LE PLAN EST LU EN BASE, jamais écrit en dur : « Plan actuel :
                   Gratuit » à un compte qui paie le Pro serait une affirmation que
                   la base contredit (contrainte n° 8). En gratuit, ce qui est inclus
                   est coché et les vraies fonctions Pro sont barrées. */
                <section className="bloc-r" aria-labelledby="r-plan">
                  <div className="bloc-r__corps">
                    <div className="bloc-r__tete">
                      <h2 id="r-plan">{t("abonnement.titre")}</h2>
                      <p>{t("abonnement.aide")}</p>
                    </div>
                    <div className="plan-r">
                      <div className="plan-r__nom">
                        <span className="etiquette-r">{t("abonnement.planActuel")}</span>
                        <b>{profil.planPro ? t("abonnement.pro") : t("abonnement.gratuit")}</b>
                        <small>{profil.planPro ? t("abonnement.proAide") : t("abonnement.gratuitAide")}</small>
                      </div>
                      <ul className="plan-r__liste">
                        {(
                          [
                            { cle: "photos", texte: t("abonnement.inclusPhotos"), inclus: true },
                            { cle: "couleurs", texte: t("abonnement.inclusCouleurs"), inclus: true },
                            ...(profil.planPro || quotaAVie === null
                              ? []
                              : [{ cle: "total", texte: t("abonnement.inclusTotal", { n: quotaAVie }), inclus: true }]),
                            { cle: "lien", texte: t("abonnement.proLien"), inclus: profil.planPro },
                            { cle: "marque", texte: t("abonnement.proMarque"), inclus: profil.planPro },
                            { cle: "plafond", texte: t("abonnement.proPlafond"), inclus: profil.planPro },
                          ] as const
                        ).map((ligne) => (
                          <li key={ligne.cle} data-inclus={ligne.inclus ? undefined : "non"}>
                            {ligne.inclus ? <CircleCheck aria-hidden="true" className="ic" /> : <CircleX aria-hidden="true" className="ic" />}
                            {/* Une ligne barrée se DIT absente : le pictogramme seul porterait l'information. */}
                            {ligne.inclus ? null : <span className="visuellement-cache">{t("abonnement.nonInclus")} </span>}
                            {ligne.texte}
                          </li>
                        ))}
                      </ul>
                      <LienEcran className="lien-texte plan-r__detail" href={`/${langue}/passer-pro`}>
                        {profil.planPro ? t("abonnement.detail") : t("abonnement.bouton")}
                        <ArrowRight aria-hidden="true" className="ic" />
                      </LienEcran>
                    </div>
                  </div>
                </section>
              ) : null}

              {section === "donnees" ? (
                <>
                  <section className="bloc-r" aria-labelledby="r-export">
                    <div className="bloc-r__corps">
                      <div className="bloc-r__tete">
                        <h2 id="r-export">{t("donnees.exporter")}</h2>
                        <p>{t("donnees.exporterAide")}</p>
                      </div>
                    </div>
                    <footer className="bloc-r__pied">
                      <p>{t("donnees.avertissement")}</p>
                      {/* UN LIEN ET NON UN BOUTON : la route rend le fichier avec
                          `Content-Disposition`, le navigateur le télécharge sans
                          quitter l'écran, et rien n'a besoin de JavaScript. */}
                      <a href="/api/compte/export" download className="bouton-app bouton-app--second">
                        <Download aria-hidden="true" className="ic" />
                        {t("donnees.bouton")}
                      </a>
                    </footer>
                  </section>
                  <BlocSuppression variante="donnees" adresse={profil.email} locale={langue} />
                </>
              ) : null}

              {section === "support" ? (
                <section className="bloc-r" aria-labelledby="r-support">
                  <div className="bloc-r__corps">
                    <div className="bloc-r__tete">
                      <h2 id="r-support">{t("support.centre")}</h2>
                      <p>{t("support.centreAide")}</p>
                    </div>
                  </div>
                  <footer className="bloc-r__pied">
                    <p>{t("support.aide")}</p>
                    <Link href={`/${langue}/docs`} className="bouton-app bouton-app--second">
                      {t("support.ouvrir")}
                      <ArrowUpRight aria-hidden="true" className="ic" />
                    </Link>
                  </footer>
                </section>
              ) : null}
            </PanneauReglages>
          </TraductionsClient>
        </div>
      </div>
    </main>
  );
}
