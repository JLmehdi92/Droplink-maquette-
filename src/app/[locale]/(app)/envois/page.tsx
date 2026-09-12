import { redirect } from "next/navigation";
import { EnTeteEcranDs } from "@/components/app/en-tete-ecran";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { TableauEnvois } from "@/components/envois/tableau-envois";
import { onboardingAFaire } from "@/lib/comptes/profil";
import { exigerVendeur } from "@/lib/comptes/apres-session";
import { analyserParametres, compterEnvois, lireEnvois } from "@/lib/envois/liste";
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

  // Les deux lectures sont indépendantes : les enchaîner doublerait la latence
  // de l'écran pour rien.
  const [page, compteurs] = await Promise.all([
    lireEnvois(supabase, parametres, maintenant),
    compterEnvois(supabase),
  ]);

  const t = await getTranslations("envois");

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

  return (
    <>
      {/* LE NOMBRE EST DANS LE SOUS-TITRE, et pas seulement dans la carte
          « Colis suivis » : celle-ci n'est pas rendue au téléphone, où la
          planche `EnvoisMobile` ne garde que deux compteurs sur quatre. */}
      <EnTeteEcranDs titre={t("titre")} sousTitre={t("sousTitre", { n: compteurs.total })} />

      <main id="contenu" className="px-margin-mobile pt-3.5 pb-5 md:px-8 md:pt-0 md:pb-[26px]">
        <div>
        <TableauEnvois
          base={`/${langue}/envois`}
          parametres={parametres}
          page={page}
          compteurs={compteurs}
          maintenant={maintenant}
        />
      </div>
      </main>
    </>
  );
}
