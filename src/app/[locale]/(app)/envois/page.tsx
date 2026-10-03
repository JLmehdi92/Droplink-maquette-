import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getFormateur } from "@/lib/format/formateur";
import type { Metadata } from "next";
import { TableauEnvois } from "@/components/envois/tableau-envois";
import { onboardingAFaire } from "@/lib/comptes/profil";
import { exigerVendeur } from "@/lib/comptes/apres-session";
import {
  analyserParametres,
  compterEnvois,
  lireEnvois,
  lireEvolution,
  lireFraicheur,
} from "@/lib/envois/liste";
import { EnTeteEnvois } from "@/components/envois/en-tete-envois";
import { creerClientServeur } from "@/lib/supabase/server";
import { estLangueSupportee } from "@/i18n/config";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "envois" });
  return { title: t("titre"), robots: { index: false, follow: false } };
}

/**
 * LES ENVOIS — les colis du vendeur, pas ses commandes.
 *
 * L'unité n'est pas la même que sur le tableau de bord : un numéro de suivi
 * porte souvent PLUSIEURS commandes, et c'est le cas normal quand un fournisseur
 * groupe un envoi. Une liste de commandes répéterait le colis autant de fois
 * qu'il transporte de commandes, et le vendeur relancerait le transporteur trois
 * fois pour un seul paquet.
 *
 * LA GARDE EST ICI, PAS SEULEMENT DANS LE LAYOUT : une page qui suppose qu'un
 * parent l'a protégée devient fausse le jour où elle est déplacée.
 *
 * L'INSTANT EST PRIS UNE SEULE FOIS et descendu en propriété. Lu séparément par
 * chaque ligne, il changerait entre la première et la dernière — et deux colis
 * immobiles depuis la même date afficheraient des anciennetés différentes.
 */
export default async function Envois({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const langue = estLangueSupportee(locale) ? locale : "fr";
  setRequestLocale(langue);

  // ⚠️ `exigerVendeur` REMPLACE une garde qui ne regardait que `profil === null`.
  // Elle laissait donc passer un compte SUSPENDU, dont le tableau de bord
  // continuait de répondre — la coupure ne tenait que sur `/p/[token]`, et c'est
  // elle qui fonde notre statut d'hébergeur.
  const profil = await exigerVendeur(langue);
  if (onboardingAFaire(profil)) redirect(`/${langue}/bienvenue`);

  const parametres = analyserParametres(await searchParams);
  const maintenant = new Date();

  // LE CLIENT PORTE LA SESSION, donc la RLS s'applique. Aucun filtre sur
  // `shop_id` n'est écrit nulle part : l'isolation vient de la base, pas d'une
  // requête bien rédigée.
  const supabase = await creerClientServeur();

  // Les trois lectures sont indépendantes : les enchaîner tripleraient la
  // latence de l'écran pour rien, et la fraîcheur n'est qu'un ornement
  // d'en-tête — elle n'a aucune raison d'attendre son tour.
  const [page, compteurs, fraicheur, evolution] = await Promise.all([
    lireEnvois(supabase, parametres, maintenant),
    compterEnvois(supabase),
    lireFraicheur(supabase),
    lireEvolution(supabase, maintenant),
  ]);

  const t = await getTranslations("envois");
  const format = await getFormateur();

  /*
   * ⚠️ CET ÉCRAN NE DÉGRADE PAS, ET C'EST UNE DÉCISION, pas un oubli.
   *
   * `compterEnvois` rend `null` quand le transport a lâché — c'est la règle
   * partagée de `lib/reseau/panne.ts`, posée après cinq occurrences du même
   * défaut. Mais ici les compteurs ne sont pas une section : ils alimentent le
   * SOUS-TITRE et les pilules de filtre du tableau. Un écran d'envois sans eux
   * n'est pas un écran dégradé, c'est un écran faux.
   *
   * On relève donc, et la frontière d'erreur de l'espace vendeur fait ce
   * qu'elle sait faire : une page en français, dans la mise en page, avec un
   * bouton « réessayer ». C'est le bon mécanisme pour une lecture QUI EST
   * l'écran — contrairement à Analyses, dont les quatre lectures sont quatre
   * sections indépendantes.
   */
  if (compteurs === null) {
    throw new Error("comptage des envois momentanément illisible");
  }

  /* LA REFONTE (02/10/2026) suit `envois.html` : fil d'Ariane, titre, et la
     fraîcheur des données avec « Actualiser » à droite. */
  const nom = profil.nomAffiche ?? profil.nomBoutique;
  return (
    <main id="contenu" className="tableau envois-ecran">
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
        <EnTeteEnvois
          libelleActualiser={t("actualiser")}
          libelleFraicheur={t("derniereMaj")}
          fraicheur={fraicheur === null ? null : format.dateTime(fraicheur, { dateStyle: "long", timeStyle: "short" })}
        />
      </div>
      <TableauEnvois
        base={`/${langue}/envois`}
        langue={langue}
        parametres={parametres}
        page={page}
        compteurs={compteurs}
        evolution={evolution}
        maintenant={maintenant}
      />
    </main>
  );
}
