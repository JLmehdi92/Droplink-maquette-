import Link from "next/link";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import {
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  CircleCheck,
  CircleHelp,
  CircleX,
  Crown,
  Database,
  Download,
  LifeBuoy,
  SlidersHorizontal,
} from "lucide-react";
import { EnTeteEcranDs } from "@/components/app/en-tete-ecran";
import { LienEcran } from "@/components/lien-ecran";
import { TraductionsClient } from "@/components/traductions-client";
import { CarteReglage, LigneAction } from "@/components/parametres/carte-reglage";
import {
  CLASSE_BOUTON,
  CLASSE_CHAMP,
  CLASSE_CHAMP_ETIQUETE,
  CLASSE_ENTREE,
  CLASSE_LIBELLE,
} from "@/components/parametres/classes";
import {
  CarteCompte,
  CarteSecurite,
  LigneSuppression,
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
  const adresseSuivie = (await searchParams)["adresse"] === "suivie";
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
  // UNE LECTURE ÉCHOUÉE SE LIT « NON ACTIVÉE » : l'écran propose alors d'activer,
  // et l'action d'enrôlement relit l'état chez le serveur d'authentification
  // avant de rien faire — elle refuse si un facteur vérifié existe déjà.
  const deuxEtapesActive = (facteurs.data ?? []).length > 0;

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

  return (
    <>
      <EnTeteEcranDs titre={t("titre")} sousTitre={t("sousTitre")} pleineLargeur />

      <main
        id="contenu"
        className="grid grid-cols-1 items-start gap-5 px-margin-mobile pt-3.5 pb-6 md:px-8 md:pt-0 md:pb-8 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]"
      >
        <TraductionsClient espaces={["parametres"]}>
          <div className="flex min-w-0 flex-col gap-[18px]">
            <CarteCompte
              nomActuel={profil.nomAffiche}
              adresse={profil.email}
              initiales={initiales}
              locale={langue}
              adresseSuivie={adresseSuivie}
            />

            <CarteReglage icone={SlidersHorizontal} titre={t("preferences.titre")} sousTitre={t("preferences.aide")}>
              {/* UN FORMULAIRE SERVEUR, ET UN BOUTON « APPLIQUER » QUE LE KIT N'A
                  PAS. Changer de langue recharge l'écran dans une autre URL : le
                  faire au simple changement du menu déclencherait la navigation à
                  chaque flèche du clavier, et un changement de contexte sur une
                  simple saisie est ce que le critère WCAG 3.2.2 interdit. */}
              <form action={changerLangueInterface} className="flex flex-col gap-3">
                <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2">
                  <div className={CLASSE_CHAMP_ETIQUETE}>
                    <label htmlFor="langue-interface" className={CLASSE_LIBELLE}>
                      {t("preferences.langue")}
                    </label>
                    <span className={CLASSE_CHAMP + " relative"}>
                      <select
                        id="langue-interface"
                        name="langue"
                        defaultValue={langue}
                        className={CLASSE_ENTREE + " cursor-pointer appearance-none pr-6"}
                      >
                        {LANGUES.map((l) => (
                          <option key={l} value={l}>
                            {tl(l)}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        aria-hidden="true"
                        size={17}
                        className="pointer-events-none absolute right-3.5 text-ds-texte-tenu"
                      />
                    </span>
                  </div>
                  <div>
                    <button type="submit" className={CLASSE_BOUTON}>
                      {t("preferences.appliquer")}
                    </button>
                  </div>
                </div>
                <p className="text-[12.5px] leading-[1.5] text-ds-texte-sourdine">
                  <Link
                    href={`/${langue}/marque`}
                    className="inline-flex min-h-11 items-center font-semibold text-ds-texte-lien hover:underline lg:min-h-0"
                  >
                    {t("preferences.languePubliqueAide")}
                  </Link>
                </p>
              </form>
            </CarteReglage>

            <CarteSecurite
              sessions={sessions}
              appareilsFiables={appareilsFiables}
              deuxEtapesActive={deuxEtapesActive}
              adresse={profil.email}
              locale={langue}
            />

            <CarteReglage icone={Database} titre={t("donnees.titre")} sousTitre={t("donnees.aide")}>
              <LigneAction premiere icone={Download} titre={t("donnees.exporter")} sousTitre={t("donnees.exporterAide")}>
                {/* UN LIEN ET NON UN BOUTON : la route rend le fichier avec
                    `Content-Disposition`, le navigateur le télécharge sans quitter
                    l'écran, et rien n'a besoin de JavaScript. */}
                <a href="/api/compte/export" download className={CLASSE_BOUTON}>
                  {t("donnees.bouton")}
                </a>
              </LigneAction>
              <LigneSuppression variante="donnees" adresse={profil.email} locale={langue} />
              <p className="mt-1 text-[12.5px] leading-[1.5] text-ds-texte-sourdine">{t("donnees.avertissement")}</p>
            </CarteReglage>
          </div>
        </TraductionsClient>

        <div className="flex min-w-0 flex-col gap-[18px]">
          <CarteReglage icone={Crown} titre={t("abonnement.titre")} sousTitre={t("abonnement.aide")}>
            {/*
              ⚠️ CETTE CARTE MENTAIT DEPUIS LE 20/09/2026 — audit avant mise en ligne, 24/09.
              Elle affirmait « DropLink est gratuit et sans limite » alors qu'un compte
              gratuit est borné à quinze commandes À VIE (175-176), et elle disait « Plan
              actuel : Gratuit » en dur, y compris à un compte qui PAIE le Pro. Deux
              affirmations que la base contredit (contrainte n° 8).

              Au dessin de la planche `SettingsView` (« Abonnement »), dont la liste
              inventait elle aussi trois lignes sur six — corrigée d'abord dans le kit :
              en gratuit, ce qui est inclus coché et les vraies fonctions Pro barrées, puis
              « Passer au Pro » ; en Pro, tout coché et AUCUN bouton.
            */}
            <div className="rounded-ds-card border border-ds-violet-200 bg-[image:var(--degrade-ds-teinte)] p-[22px]">
              <span className="inline-flex items-center gap-1.5 rounded-ds-pill bg-ds-violet-100 px-[11px] py-[5px] text-[11.5px] leading-[normal] font-bold tracking-[-0.02em] text-ds-accent-encre lg:text-[11px]">
                {t("abonnement.planActuel")}
              </span>
              <p className="mt-2.5 mb-1 text-[30px] leading-[normal] font-extrabold tracking-[-0.045em] text-ds-texte-fort">
                {profil.planPro ? t("abonnement.pro") : t("abonnement.gratuit")}
              </p>
              <p className="text-[13px] leading-[normal] text-ds-texte-corps">
                {profil.planPro ? t("abonnement.proAide") : t("abonnement.gratuitAide")}
              </p>
              <ul className={"flex flex-col gap-[11px] " + (profil.planPro ? "mt-5" : "mt-5 mb-[22px]")}>
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
                  <li key={ligne.cle} className="flex items-center gap-[11px]">
                    {ligne.inclus ? (
                      <CircleCheck
                        aria-hidden="true"
                        size={17}
                        strokeWidth={1.8}
                        className="shrink-0 fill-ds-accent text-ds-white"
                      />
                    ) : (
                      <CircleX
                        aria-hidden="true"
                        size={17}
                        strokeWidth={1.8}
                        className="shrink-0 fill-ds-ink-300 text-ds-white"
                      />
                    )}
                    <span
                      className={
                        "text-[14px] leading-[normal] " +
                        (ligne.inclus ? "font-medium text-ds-texte-fort" : "text-ds-texte-tenu")
                      }
                    >
                      {/* Une ligne barrée se DIT absente au lecteur d'écran : le
                          pictogramme seul porterait l'information (règle de la couleur). */}
                      {ligne.inclus ? null : <span className="sr-only">{t("abonnement.nonInclus")} </span>}
                      {ligne.texte}
                    </span>
                  </li>
                ))}
              </ul>
              {profil.planPro ? null : (
                <LienEcran
                  href={`/${langue}/passer-pro`}
                  className="degrade-ds-marque flex h-[52px] w-full items-center justify-center gap-2 rounded-ds-card border border-transparent px-7 text-[15px] font-semibold tracking-[-0.02em] text-ds-texte-sur-marque shadow-ds-brand transition-shadow hover:shadow-ds-brand-hover"
                >
                  {t("abonnement.bouton")}
                  <ArrowRight aria-hidden="true" size={18} strokeWidth={2.2} />
                </LienEcran>
              )}
            </div>
          </CarteReglage>

          <CarteReglage icone={LifeBuoy} titre={t("support.titre")} sousTitre={t("support.aide")}>
            <LigneAction premiere icone={CircleHelp} titre={t("support.centre")} sousTitre={t("support.centreAide")}>
              <Link href={`/${langue}/docs`} className={CLASSE_BOUTON}>
                {t("support.ouvrir")}
                <ArrowUpRight aria-hidden="true" size={15} />
              </Link>
            </LigneAction>
          </CarteReglage>
        </div>
      </main>
    </>
  );
}
