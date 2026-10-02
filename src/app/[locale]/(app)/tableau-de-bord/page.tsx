import { redirect } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";
import { SelecteurPeriode } from "@/components/tableau/selecteur-periode";
import { CompteursApp } from "@/components/tableau/compteurs-app";
import { GrapheTableau, type PointGraphe } from "@/components/tableau/graphe-tableau";
import {
  ActionsRapidesBloc,
  ActiviteBloc,
  BlocIndisponible,
  DERNIERES_COMMANDES,
  DernieresCommandesBloc,
  RepartitionBloc,
  TransporteursBloc,
} from "@/components/tableau/blocs-tableau";
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
  SEMAINES_FRISE,
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
 * ⚠️ LA REFONTE (02/10/2026) suit la maquette, `tableau.html` : compteurs en
 * une bande, graphique à bascule (semaines / liens clients), dernières commandes
 * avec l'aperçu de la vraie page au survol, actions rapides, puis répartition,
 * transporteurs et activité. La période change sans recharger (décision n° 10
 * de Mehdi). La carte de lancement et la carte « Passer au Pro » quittent cet
 * écran : le bouton « Nouvelle commande » de la barre supérieure et l'encart
 * Pro de la barre latérale les portent sur TOUS les écrans.
 *
 * CE QUE LA MAQUETTE DESSINE ET QUI N'EST PAS RENDU :
 *  - le prénom du vendeur : le produit ne stocke que le nom qu'il s'est donné,
 *    sinon celui de sa boutique — c'est lui qui est salué, ou personne ;
 *  - un écart à la période précédente sur chaque compteur : seul celui des
 *    commandes créées est vérifié ;
 *  - les drapeaux de pays : aucun pays n'est stocké.
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
      lireCommandes(analyserParametresListe({})).catch((erreur: unknown) => {
        console.error("[tableau] dernières commandes illisibles", erreur);
        return null;
      }),
    ]);

  const t = await getTranslations("tableau");
  const ta = await getTranslations("analyses");
  const nav = await getTranslations("navigation");
  const format = await getFormatter();
  const base = `/${langue}/tableau-de-bord`;
  const nom = profil.nomAffiche ?? profil.nomBoutique;

  /* Les deux séries du graphique arrivent au client prêtes : dates formatées ici,
     dans la langue de l'écran, pour que le composant ne compte ni ne formate rien. */
  const courtJour = (d: Date) => format.dateTime(d, { day: "numeric", month: "short", timeZone: "UTC" });
  const longJour = (d: Date) => format.dateTime(d, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const pointsSemaines: readonly PointGraphe[] | null =
    semaines?.map((s) => ({
      valeur: s.total,
      court: courtJour(s.debut),
      long: t("graphe.semaineDuDate", { date: format.dateTime(s.debut, { day: "numeric", month: "long", timeZone: "UTC" }) }),
    })) ?? null;
  const pointsOuvertures: readonly PointGraphe[] | null =
    ouvertures?.map((o) => {
      const d = new Date(`${o.jour}T12:00:00Z`);
      return { valeur: o.total, court: courtJour(d), long: longJour(d) };
    }) ?? null;
  const n = semaines?.length ?? SEMAINES_FRISE;
  const totalOuvertures = ouvertures?.reduce((somme, o) => somme + o.total, 0) ?? 0;

  return (
    <main id="contenu" className="tableau">
      <div className="tableau__tete">
        <div>
          <p className="v4-fil">
            {nom === null ? null : (
              <>
                <span>{nom}</span>
                <ChevronRight aria-hidden="true" className="ic" />
              </>
            )}
            <b>{nav("tableauDeBord")}</b>
          </p>
          <h1>{nom === null ? t("bonjour") : t("bonjourNom", { nom })}</h1>
          <p>{t("sousTitre")}</p>
        </div>
        <SelecteurPeriode
          etiquette={ta("periode.titre")}
          actif={periode}
          periodes={PERIODES.map((p) => ({
            cle: p,
            libelle: ta(`periode.${p}`),
            href: p === "30j" ? base : `${base}?periode=${p}`,
          }))}
        />
      </div>

      {/* ⚠️ CHAQUE PANNEAU SE REND OU SE NOMME, JAMAIS N'INVENTE : une lecture qui
          échoue affiche « indisponible », pas zéro — la règle des analyses. */}
      {activite === null ? (
        <p className="bloc bloc__vide">{ta("indisponible")}</p>
      ) : (
        <CompteursApp activite={activite} delai={delai} />
      )}

      <div className="tableau__haut">
        <GrapheTableau
          semaines={pointsSemaines}
          ouvertures={pointsOuvertures}
          textes={{
            bascule: t("graphe.bascule"),
            commandes: t("graphe.commandes"),
            liens: t("graphe.liens"),
            titreSemaines: ta("frise.titre"),
            aideSemaines: t("graphe.aideSemaines", { n }),
            titreLiens: ta("liens.titre"),
            aideLiens: ta("liens.aide"),
            voirValeurs: t("graphe.voirValeurs"),
            semaineDu: t("graphe.semaineDu"),
            creees: t("graphe.creees"),
            jour: t("graphe.jour"),
            ouvertures: t("graphe.ouvertures"),
            cetteSemaine: t("graphe.cetteSemaine"),
            zoneSemaines: t("graphe.zoneSemaines", { n }),
            zoneLiens: t("graphe.zoneLiens", { n: totalOuvertures }),
            videSemaines: semaines === null ? ta("indisponible") : ta("frise.vide"),
            videLiens: ouvertures === null ? ta("indisponible") : ta("liens.aucun"),
          }}
        />
        <div className="pile">
          {commandes === null ? (
            <BlocIndisponible titre={t("dernieres.titre")} />
          ) : (
            <DernieresCommandesBloc commandes={commandes.lignes.slice(0, DERNIERES_COMMANDES)} langue={langue} />
          )}
          <ActionsRapidesBloc langue={langue} />
        </div>
      </div>

      <div className="tableau__bas">
        {colis === null ? <BlocIndisponible titre={ta("colis.titre")} /> : <RepartitionBloc compteurs={colis} />}
        {transporteurs === null ? (
          <BlocIndisponible titre={ta("transporteurs.titre")} />
        ) : (
          <TransporteursBloc parts={transporteurs} voirTout={`/${langue}/envois`} />
        )}
        {recente === null ? (
          <BlocIndisponible titre={ta("activite.titre")} />
        ) : (
          <ActiviteBloc faits={recente} langue={langue} />
        )}
      </div>
    </main>
  );
}
