import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FormulaireNouveauMotDePasse } from "@/components/formulaire-nouveau-mot-de-passe";
import { TraductionsClient } from "@/components/traductions-client";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { LONGUEUR_MINIMALE } from "@/lib/auth/mot-de-passe";
import { CoqueAccesSimple } from "@/components/acces/coque-acces-simple";
import { sessionParEmail } from "@/lib/auth/recuperation";
import { creerClientServeur } from "@/lib/supabase/server";
import { cheminDeRefus, cheminDeVerification, lireEtatOuDireLaPanne } from "@/lib/comptes/apres-session";
import { estLangueSupportee } from "@/i18n/config";
import { routing } from "@/i18n/routing";

/**
 * CHOISIR UN NOUVEAU MOT DE PASSE.
 *
 * ⚠️ CETTE PAGE EXIGE UNE SESSION, et c'est tout ce qui la protège — parce que
 * c'est tout ce qui la protège CORRECTEMENT. La récupération fonctionne ainsi :
 * le lien reçu par email authentifie, la route de retour échange son code, et
 * l'on arrive ici DÉJÀ CONNECTÉ. Il n'y a donc aucun jeton à vérifier dans
 * l'URL ; ce qui sépare cet écran de n'importe qui est la possession de la
 * boîte mail.
 *
 * ⚠️ ET LA PAGE N'EST PAS LA PROTECTION. La Server Action revérifie la session
 * elle-même, par `getUser()` : dans un module `"use server"`, chaque export est
 * atteignable par une requête forgée, et le fait que cette page ne s'affiche pas
 * n'empêche rien.
 *
 * ELLE N'EST PAS DANS LE GROUPE `(app)` : ce groupe redirige vers l'onboarding
 * tant que le type de compte est nul, et quelqu'un qui répare son mot de passe
 * avant d'avoir fini son installation rebondirait indéfiniment entre les deux
 * écrans.
 */

export function generateStaticParams(): Array<{ locale: string }> {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "motDePasse" });
  return { title: t("nouveauTitre"), robots: { index: false, follow: false } };
}

export default async function NouveauMotDePasse({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const langue = estLangueSupportee(locale) ? locale : "fr";
  setRequestLocale(langue);

  const etat = await lireEtatOuDireLaPanne(langue);
  // UN COMPTE À DOUBLE AUTHENTIFICATION SAISIT D'ABORD SON CODE : Supabase refuse
  // de changer le mot de passe depuis une session `aal1` (mesuré), et la base en
  // refuse toute lecture (migration 156). L'écran de vérification ramène ici.
  if (etat.etat === "verification") redirect(cheminDeVerification(langue, "mot-de-passe"));
  const profil = etat.etat === "profil" ? etat.profil : null;
  if (profil === null) {
    // Arrivée sans session : un lien périmé, déjà consommé, ou une visite
    // directe. Les trois se réparent en redemandant un lien, et l'écran de
    // connexion le dit.
    redirect(cheminDeRefus(langue, "profil"));
  }
  if (profil.statut === "suspended") {
    redirect(cheminDeRefus(langue, "suspendu"));
  }

  /*
   * ⚠️ UNE SESSION ORDINAIRE N'A RIEN À FAIRE ICI, et c'est le défaut que cet
   * écran portait : il s'ouvrait pour n'importe quelle session valide, donc pour
   * un cookie volé. Mesuré — formulaire rendu en 200 avec le cookie de quelqu'un
   * simplement connecté par mot de passe.
   *
   * La page n'est PAS la protection — l'action revérifie de son côté, parce
   * qu'elle est atteignable par requête forgée. Mais laisser l'écran s'ouvrir
   * inviterait à taper un mot de passe qui serait ensuite refusé, ce qui est la
   * pire façon de dire non.
   */
  const supabase = await creerClientServeur();
  if (!(await sessionParEmail(supabase))) {
    redirect(cheminDeRefus(langue, "profil"));
  }

  const t = await getTranslations("motDePasse");

  return (
    <CoqueAccesSimple
      langue={langue}
      titre={t("nouveauTitre")}
      /* L'ADRESSE CONCERNÉE EST RAPPELÉE, EN CLAIR ET NON MODIFIABLE. Quelqu'un
         qui gère deux comptes doit voir lequel il change avant de taper — et
         elle vient de la SESSION, jamais de l'URL. */
      sousTitre={t.rich("nouveauSousTitre", {
        email: profil.email,
        adresse: (morceaux) => <b className="acces__adresse">{morceaux}</b>,
      })}
    >
      {/* CE QUE LE GESTE COÛTE EST DIT AVANT, pas découvert après : les autres
          appareils devront se reconnecter. C'est précisément ce qu'on vient
          chercher quand on soupçonne une intrusion. */}
      <p className="acces__note">
        <ShieldCheck aria-hidden="true" className="ic" />
        {t("avertissement")}
      </p>

      <TraductionsClient espaces={["connexion", "inscription", "motDePasse"]}>
        <FormulaireNouveauMotDePasse locale={langue} longueurMinimale={LONGUEUR_MINIMALE} adresse={profil.email} />
      </TraductionsClient>
      {/* ⚠️ UNE DÉCONNEXION, PAS UN LIEN (relecture du 02/10/2026) : cet écran tient
          une session de récupération, et `/connexion` renvoie toute session ouverte
          vers les commandes — le lien menait donc DANS l'application, sans que le mot
          de passe ait changé. Un POST natif vers la déconnexion ferme la session et
          ramène à la connexion, script ou non. */}
      <form className="acces__bascule" action={`/${langue}/deconnexion`} method="post">
        <button type="submit" className="lien-texte lien-retour min-h-11">
          <ArrowLeft aria-hidden="true" className="ic" />
          {t("retourConnexion")}
        </button>
      </form>
    </CoqueAccesSimple>
  );
}
