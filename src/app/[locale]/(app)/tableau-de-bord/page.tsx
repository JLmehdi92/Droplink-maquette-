import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { EnTeteEcranDs } from "@/components/app/en-tete-ecran";
import { LienEcran } from "@/components/lien-ecran";
import { CompteursAnalyses } from "@/components/analyses/compteurs-analyses";
import { FriseSemaines } from "@/components/analyses/frise-semaines";
import { RepartitionColis } from "@/components/analyses/repartition-colis";
import { ActiviteRecente } from "@/components/analyses/activite-recente";
import { LiensParJour } from "@/components/analyses/liens-par-jour";
import { PartsTransporteurs } from "@/components/analyses/parts-transporteurs";
import { ActionsRapides } from "@/components/tableau/actions-rapides";
import { CarteLancement } from "@/components/tableau/carte-lancement";
import { CartePro } from "@/components/tableau/carte-pro";
import {
  DERNIERES_COMMANDES,
  DernieresCommandes,
} from "@/components/tableau/dernieres-commandes";
import { onboardingAFaire } from "@/lib/comptes/profil";
import { exigerVendeur } from "@/lib/comptes/apres-session";
import {
  analyserParametres,
  lireActivite,
  lireDelaiLivraison,
  lireOuverturesParJour,
  lireSemaines,
  lireTransporteurs,
  PERIODES,
} from "@/lib/analyses/activite";
import { lireActiviteRecente } from "@/lib/analyses/recente";
import {
  analyserParametres as analyserParametresListe,
  lireCommandes,
} from "@/lib/commandes/liste";
import { compterEnvois } from "@/lib/envois/liste";
import { creerClientServeur } from "@/lib/supabase/server";
import { estLangueSupportee } from "@/i18n/config";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "tableau" });
  return { title: t("titre"), robots: { index: false, follow: false } };
}

/**
 * LE TABLEAU DE BORD, créé sur `DashboardHome` du kit vendeur.
 *
 * ⚠️ UN ÉCRAN CRÉÉ, PAS MIGRÉ — ET IL NE LIT RIEN DE NOUVEAU. Chacun de ses
 * nombres vient d'une lecture que `/analyses` fait déjà, sous la même RLS :
 * compteurs, frise des semaines, répartition des colis, ouvertures de liens,
 * transporteurs, activité récente. Seules les cinq dernières commandes viennent
 * de la liste des commandes. Un tableau de bord qui calculerait ses propres
 * chiffres montrerait tôt ou tard au vendeur deux nombres différents pour la
 * même chose.
 *
 * ⚠️ IL N'EST PAS LA PAGE D'ARRIVÉE, ET C'EST UNE DÉCISION. La connexion mène
 * toujours à la liste des commandes : le brief la décrit comme l'écran où un
 * fournisseur à 200 commandes par semaine passe sa journée, et lui imposer un
 * écran d'aperçu à chaque connexion lui coûterait un clic de plus, deux cents
 * fois par semaine. Le tableau de bord est une entrée de navigation.
 *
 * CE QUE LE KIT DESSINE ET QUI N'EST PAS RENDU :
 *  - « Bonjour Nassim » : le produit ne stocke aucun nom de vendeur, seulement
 *    celui de sa boutique — c'est lui qui est salué, ou personne ;
 *  - les pourcentages d'évolution « +12 % ce mois-ci » : les compteurs sont
 *    ceux des analyses, qui ne portent qu'un seul écart vérifié ;
 *  - les drapeaux de pays des dernières commandes : aucun pays n'est stocké.
 */
export default async function TableauDeBord({
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

  const { periode } = analyserParametres(await searchParams);
  const maintenant = new Date();
  const supabase = await creerClientServeur();

  // Les lectures sont indépendantes : les enchaîner multiplierait la latence.
  const [activite, semaines, colis, transporteurs, delai, ouvertures, recente, commandes] =
    await Promise.all([
      lireActivite(supabase, periode, maintenant),
      lireSemaines(supabase, maintenant),
      compterEnvois(supabase),
      lireTransporteurs(supabase, periode, maintenant),
      lireDelaiLivraison(supabase, periode, maintenant),
      lireOuverturesParJour(supabase, periode, maintenant),
      lireActiviteRecente(supabase, periode, maintenant),
      lireCommandes(analyserParametresListe({})).catch(() => null),
    ]);

  const t = await getTranslations("tableau");
  const ta = await getTranslations("analyses");
  const base = `/${langue}/tableau-de-bord`;

  /* ⚠️ CHAQUE PANNEAU SE REND OU SE NOMME, JAMAIS N'INVENTE : une lecture qui
     échoue affiche « indisponible », pas zéro — la règle des analyses. */
  const INDISPONIBLE =
    "rounded-ds-card-lg border border-ds-filet bg-ds-surface-carte p-4 text-[14px] text-ds-texte-corps shadow-ds-card lg:p-6";

  const pilule = (actif: boolean): string =>
    "inline-flex h-11 items-center rounded-ds-sm border px-[15px] text-[13px] leading-4 transition-colors lg:h-[38px] " +
    (actif
      ? "border-transparent bg-ds-accent font-bold text-ds-texte-sur-marque"
      : "border-ds-filet bg-ds-surface-carte font-medium text-ds-texte-corps shadow-ds-xs hover:bg-ds-surface-teinte");

  return (
    <>
      <EnTeteEcranDs
        titre={
          /* Le nom que le vendeur s'est donné dans ses paramètres, sinon celui de
             sa boutique, sinon personne. */
          (profil.nomAffiche ?? profil.nomBoutique) === null
            ? t("bonjour")
            : t("bonjourNom", { nom: profil.nomAffiche ?? profil.nomBoutique ?? "" })
        }
        sousTitre={t("sousTitre")}
        actions={
          <nav aria-label={ta("periode.titre")} className="flex flex-wrap gap-2">
            {PERIODES.map((p) => (
              <LienEcran
                key={p}
                href={p === "30j" ? base : `${base}?periode=${p}`}
                aria-current={periode === p ? "true" : undefined}
                className={pilule(periode === p)}
              >
                {ta(`periode.${p}`)}
              </LienEcran>
            ))}
          </nav>
        }
      />

      <main
        id="contenu"
        className="flex flex-col gap-3 px-margin-mobile pt-3.5 pb-6 lg:gap-[18px] lg:px-8 lg:pt-0 lg:pb-8"
      >
        {activite === null ? (
          <p className={INDISPONIBLE}>{ta("indisponible")}</p>
        ) : (
          <CompteursAnalyses activite={activite} delai={delai} />
        )}

        {/* LA PREMIÈRE RANGÉE DU KIT : 1,35fr / 1fr / 0,82fr, alignée en haut.

            ⚠️ EN GRILLE À PARTIR DE `2xl` SEULEMENT, comme la seconde rangée.
            Posées dès `xl`, les trois colonnes laissaient ~286 px aux dernières
            commandes (« il y a 1 s » SORTAIT de la carte) et ~270 au graphique,
            dont les douze dates SE CHEVAUCHAIENT à 1 280 px (balayage du
            18/09/2026). En dessous, les panneaux s'empilent pleine largeur. */}
        <div className="flex flex-col gap-3 lg:gap-[18px] 2xl:grid 2xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,0.82fr)] 2xl:items-start">
          <div className="flex min-w-0 flex-col gap-3 lg:gap-[18px]">
            <CarteLancement langue={langue} />
            {semaines === null ? (
              <p className={INDISPONIBLE}>{ta("indisponible")}</p>
            ) : (
              <FriseSemaines semaines={semaines} taille="section" />
            )}
          </div>

          {commandes === null ? (
            <p className={INDISPONIBLE}>{ta("indisponible")}</p>
          ) : (
            <DernieresCommandes
              commandes={commandes.lignes.slice(0, DERNIERES_COMMANDES)}
              langue={langue}
            />
          )}

          <div className="flex min-w-0 flex-col gap-3 lg:gap-[18px]">
            <ActionsRapides langue={langue} />
            {colis === null ? (
              <p className={INDISPONIBLE}>{ta("indisponible")}</p>
            ) : (
              <RepartitionColis compteurs={colis} taille="section" />
            )}
          </div>
        </div>

        {/* LA SECONDE RANGÉE : quatre panneaux au dessin du kit — la carte « Passez
            au Pro », quatrième, n'est rendue qu'à un compte gratuit (audit du
            24/09/2026 : elle manquait depuis que l'offre existe). Pour un compte
            Pro, les trois autres se partagent la rangée. */}
        <div
          className={
            "flex flex-col gap-3 lg:gap-[18px] 2xl:grid 2xl:items-start " +
            (profil.planPro
              ? "2xl:grid-cols-3"
              : "2xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.1fr)_minmax(0,1.1fr)_minmax(0,0.95fr)]")
          }
        >
          {ouvertures === null || activite === null ? (
            <p className={INDISPONIBLE}>{ta("indisponible")}</p>
          ) : (
            <LiensParJour jours={ouvertures} total={activite.vuesTotales} taille="section" />
          )}
          {transporteurs === null ? (
            <p className={INDISPONIBLE}>{ta("indisponible")}</p>
          ) : (
            <PartsTransporteurs parts={transporteurs} taille="section" voirTout={`/${langue}/envois`} />
          )}
          {recente === null ? (
            <p className={INDISPONIBLE}>{ta("indisponible")}</p>
          ) : (
            <ActiviteRecente faits={recente} langue={langue} variante="tableau" />
          )}
          {profil.planPro ? null : <CartePro langue={langue} />}
        </div>
      </main>
    </>
  );
}
