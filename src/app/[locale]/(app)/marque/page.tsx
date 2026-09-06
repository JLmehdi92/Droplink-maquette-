import { redirect } from "next/navigation";
import { EnTeteEcran } from "@/components/app/en-tete-ecran";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { FormulaireMarque } from "@/components/marque/formulaire-marque";
import { tousLesLibellesApercu } from "@/lib/boutique/libelles-apercu";
import { TraductionsClient } from "@/components/traductions-client";
import { onboardingAFaire } from "@/lib/comptes/profil";
import { exigerVendeur } from "@/lib/comptes/apres-session";
import { signerLecture } from "@/lib/storage/r2";
import { estLangueSupportee } from "@/i18n/config";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "marque" });
  return { title: t("titre"), robots: { index: false, follow: false } };
}

/**
 * RÉGLAGES DE MARQUE.
 *
 * Vient APRÈS la page publique dans l'ordre des lots, et ce n'est pas un hasard :
 * c'est elle qui donne un sens visible à chacun de ces réglages. Régler une
 * couleur d'accent sans écran où la voir revient à demander au vendeur de
 * choisir à l'aveugle.
 *
 * LA GARDE EST ICI, PAS SEULEMENT DANS LE LAYOUT. Une page qui suppose qu'un
 * parent l'a protégée devient fausse le jour où elle est déplacée — et le layout
 * ne couvre de toute façon pas les Server Actions, qui portent chacune la leur.
 */
export default async function Marque({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const langue = estLangueSupportee(locale) ? locale : "fr";
  setRequestLocale(langue);

  // ⚠️ `exigerVendeur` REMPLACE une garde qui ne regardait que `profil === null`.
  // Elle laissait donc passer un compte SUSPENDU, dont le tableau de bord
  // continuait de répondre — la coupure ne tenait que sur `/p/[token]`, et c'est
  // elle qui fonde notre statut d'hébergeur.
  const profil = await exigerVendeur(langue);
  // Un vendeur qui n'a pas fini son onboarding y est renvoyé : les deux écrans
  // règlent les mêmes colonnes, et les laisser ouverts en parallèle produirait
  // deux vérités concurrentes sur la même boutique.
  if (onboardingAFaire(profil)) redirect(`/${langue}/bienvenue`);

  const t = await getTranslations("marque");

  // LE LOGO EST SERVI PAR UNE URL SIGNÉE À EXPIRATION. Le bucket est privé sans
  // exception : une URL publique rendrait tous les logos de tous les vendeurs
  // atteignables par balayage de clés.
  //
  // Une signature qui échoue n'est PAS une erreur d'écran : le logo est
  // simplement omis, et le vendeur peut en redéposer un. Faire échouer la page
  // entière pour une image ferait perdre l'accès à tous les autres réglages.
  const logoUrl =
    profil.logoUrl === null ? null : await signerLecture(profil.logoUrl).catch(() => null);

  return (
    <>
      <EnTeteEcran titre={t("titre")} sousTitre={t("sousTitre")} />

      <main id="contenu" className="px-margin-mobile py-5 md:px-[30px] md:pt-0 md:pb-[26px]">
        <div>
        <TraductionsClient espaces={["marque"]}>
          <FormulaireMarque
            /*
             * ⚠️ LES DEUX JEUX, RÉSOLUS CÔTÉ SERVEUR. Le `<select>` de langue
             * bascule côté client : l'aperçu doit donc pouvoir changer de langue
             * sans aller-retour. Et aucun des deux ne vient de `locale` — ce que
             * verront les clients ne dépend pas de l'URL du vendeur.
             */
            libelles={await tousLesLibellesApercu()}
            initial={{
              // La chaîne vide représente l'absence CÔTÉ FORMULAIRE : un champ
              // texte ne peut pas porter `null`. La conversion inverse se fait à
              // l'écriture, où la chaîne vide redevient `null` en base — c'est
              // `null` qui fait omettre l'en-tête sur la page publique.
              nom: profil.nomBoutique ?? "",
              couleur: profil.couleurAccent,
              languePublique: profil.languePublique,
              filigrane: profil.filigrane,
              logoUrl,
              reseaux: profil.reseaux,
            }}
          />
        </TraductionsClient>
      </div>
      </main>
    </>
  );
}
