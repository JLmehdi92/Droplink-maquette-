import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { FormulaireOnboarding } from "@/components/formulaire-onboarding";
import { libellesApercu } from "@/lib/boutique/libelles-apercu";
import { TraductionsClient } from "@/components/traductions-client";
import { onboardingAFaire } from "@/lib/comptes/profil";
import { lireEtatOuDireLaPanne } from "@/lib/comptes/apres-session";
import { estLangueSupportee } from "@/i18n/config";
import { LANGUE_PAGE_CLIENT_PAR_DEFAUT } from "@/lib/boutique/reglages";
import Link from "next/link";
import { CoucheV4, ScriptEntreeV4 } from "@/components/app/couche-v4";
import { LogoDropLink } from "@/components/logo-droplink";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "onboarding" });
  return { title: t("titre"), robots: { index: false, follow: false } };
}

/**
 * Onboarding. Vu une fois, juste après la première connexion.
 *
 * Un vendeur qui l'a déjà fait est renvoyé chez lui plutôt que de le refaire :
 * réafficher un écran d'accueil à quelqu'un qui a déjà cent commandes est le
 * genre de détail qui fait douter de tout le reste.
 */
export default async function Bienvenue({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const langue = estLangueSupportee(locale) ? locale : "fr";
  setRequestLocale(langue);

  const etat = await lireEtatOuDireLaPanne(langue);
  if (etat.etat === "verification") redirect(`/${langue}/verification`);
  const profil = etat.etat === "profil" ? etat.profil : null;
  // Le layout a déjà écarté l'absence de session. On revérifie ici sans s'en
  // remettre à lui : une page qui suppose qu'un parent l'a protégée devient
  // fausse le jour où elle est déplacée.
  if (profil === null) redirect(`/${langue}/connexion?erreur=session`);
  if (profil.statut !== "active") redirect(`/${langue}/connexion?erreur=suspendu`);
  // ⚠️ CHEZ LUI, C'EST SON TABLEAU DE BORD, PAS NOTRE PAGE DE VENTE. Cette
  // ligne renvoyait sur `/${langue}`, la landing : un vendeur déjà inscrit qui
  // rouvrait un ancien lien vers l'onboarding se retrouvait devant l'argumentaire
  // commercial du produit qu'il utilise déjà. L'en-tête de ce fichier annonçait
  // pourtant « renvoyé chez lui » — le commentaire décrivait une intention que le
  // code ne tenait pas. C'est aussi la destination que l'action choisit
  // elle-même quand l'onboarding réussit.
  if (!onboardingAFaire(profil)) redirect(`/${langue}/commandes`);

  const t = await getTranslations("onboarding");
  const ta = await getTranslations("accueil");
  const nav = await getTranslations("navigation");

  // Coquille de la maquette (`bienvenue.html`) : logo et étape en haut, puis
  // le formulaire et l'aperçu de la page client côte à côte. `main` ne fait
  // qu'envelopper : c'est le formulaire qui porte la grille, parce que l'aperçu
  // lit l'état de ses champs.
  return (
    <div className="page-acces v4 onb-page">
      {/* La couche « v4 » de la maquette (`bienvenue.html` charge `v4.js`). */}
      <ScriptEntreeV4 />
      <CoucheV4 />
      <a className="evitement" href="#contenu">
        {nav("allerAuContenu")}
      </a>
      <div className="onb">
        <header className="onb__haut">
          <Link className="logo min-h-11" href={`/${langue}`} aria-label={ta("accueil")}>
            <LogoDropLink />
          </Link>
          <p className="onb__etape">
            <span>{t("etape")}</span>
            <i aria-hidden="true">
              <b />
            </i>
          </p>
        </header>
        <main id="contenu" className="grid">
          <TraductionsClient espaces={["onboarding"]}>
            {/* L'APERÇU PARLE LA LANGUE DE LA PAGE CLIENT, pas celle de l'écran :
                l'onboarding pose l'anglais par défaut (migration 205), et c'est
                dans cette langue que le client la recevra. */}
            <FormulaireOnboarding
              locale={langue}
              languePage={LANGUE_PAGE_CLIENT_PAR_DEFAUT}
              libelles={await libellesApercu(LANGUE_PAGE_CLIENT_PAR_DEFAUT)}
            />
          </TraductionsClient>
        </main>
      </div>
    </div>
  );
}
