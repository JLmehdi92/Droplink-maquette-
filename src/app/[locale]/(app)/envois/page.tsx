import { redirect } from "next/navigation";
import { EnTeteEcran } from "@/components/app/en-tete-ecran";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { TableauEnvois } from "@/components/envois/tableau-envois";
import { lireProfilVendeur, onboardingAFaire } from "@/lib/comptes/profil";
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

  const profil = await lireProfilVendeur();
  if (profil === null) redirect(`/${langue}/connexion?erreur=session`);
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

  return (
    <>
      <EnTeteEcran titre={t("titre")} sousTitre={t("sousTitre")} />

      <main id="contenu" className="px-margin-mobile py-5 md:px-[30px] md:pt-0 md:pb-[26px]">
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
