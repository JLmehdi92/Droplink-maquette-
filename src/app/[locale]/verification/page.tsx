import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { KeyRound, ShieldCheck } from "lucide-react";
import { FormulaireVerification } from "@/components/formulaire-verification";
import { TraductionsClient } from "@/components/traductions-client";
import { BoutonDeconnexion } from "@/components/bouton-deconnexion";
import { CoqueAccesSimple } from "@/components/acces/coque-acces-simple";
import { creerClientServeur } from "@/lib/supabase/server";
import { estLangueSupportee } from "@/i18n/config";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "verification" });
  return { title: t("titre"), robots: { index: false, follow: false } };
}

/**
 * LA VÉRIFICATION EN DEUX ÉTAPES — `VerifyScreen`, écrit dans le kit `auth` le
 * 13/09/2026 avant cette page, sur la coque de la connexion : c'est la même
 * page qui continue.
 *
 * ELLE NE S'OUVRE QU'À UNE SESSION QUI EN A BESOIN. Sans session, retour à la
 * connexion ; sans facteur vérifié, ou déjà `aal2`, il n'y a rien à saisir —
 * la page renvoie à l'espace vendeur, dont la garde décide du reste. Un écran de
 * code affiché à qui n'a pas de code serait une impasse.
 *
 * « Se déconnecter » est la seule autre sortie, et c'est un formulaire POST : la
 * déconnexion porte la garde CSRF de sa route, et un lien GET se ferait
 * précharger.
 */
export default async function Verification({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const langue = estLangueSupportee(locale) ? locale : "fr";
  setRequestLocale(langue);

  const supabase = await creerClientServeur();
  const { data, error } = await supabase.auth.getUser();
  if (error !== null || data.user === null) redirect(`/${langue}/connexion?erreur=session`);

  const aUnFacteur = (data.user.factors ?? []).some((f) => f.status === "verified");
  const { data: niveau } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const suiteBrute = (await searchParams)["suite"];
  // `admin` (30/09/2026) : un administrateur connecté par un appareil fiable n'a
  // qu'un facteur ; l'administration l'envoie ici taper son code, puis l'y ramène.
  const suite = suiteBrute === "mot-de-passe" || suiteBrute === "admin" ? suiteBrute : null;
  if (!aUnFacteur || niveau?.currentLevel === "aal2") {
    redirect(
      suite === "mot-de-passe"
        ? `/${langue}/nouveau-mot-de-passe`
        : suite === "admin"
          ? `/${langue}/admin`
          : `/${langue}/commandes`,
    );
  }

  const t = await getTranslations("verification");

  return (
    <CoqueAccesSimple langue={langue} icone={ShieldCheck} titre={t("titre")} sousTitre={t("sousTitre")}>
      <TraductionsClient espaces={["verification"]}>
        <FormulaireVerification locale={langue} suite={suite} />
      </TraductionsClient>
      <p className="acces__note acces__note--douce">
        <KeyRound aria-hidden="true" className="ic" />
        {t("perdu")}
      </p>
      {/* ⚠️ UN `div` ET PAS UN `p` : `BoutonDeconnexion` rend un `<form>`, et un formulaire
          dans un paragraphe fait lever « React error #418 » à chaque ouverture (le
          navigateur ferme le `<p>` avant lui, l'arbre ne correspond plus). Trouvé le
          17/09/2026 par la sonde, qui lit la console. */}
      <div className="acces__bascule">
        {t("pasVous")} <BoutonDeconnexion langue={langue} variante="lien" />
      </div>
    </CoqueAccesSimple>
  );
}
