import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { FormulaireVerification } from "@/components/formulaire-verification";
import { TraductionsClient } from "@/components/traductions-client";
import { BoutonDeconnexion } from "@/components/bouton-deconnexion";
import { ArgumentAcces, FondAcces, LogoMarque, NoteSecurite } from "@/components/acces/coque-acces";
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
  const suite = (await searchParams)["suite"] === "mot-de-passe" ? "mot-de-passe" : null;
  if (!aUnFacteur || niveau?.currentLevel === "aal2") {
    redirect(suite === "mot-de-passe" ? `/${langue}/nouveau-mot-de-passe` : `/${langue}/commandes`);
  }

  const [t, tl] = await Promise.all([getTranslations("verification"), getTranslations("landing")]);

  return (
    <>
      <FondAcces />
      <div className="relative flex min-h-dvh flex-col px-4 pt-[22px] pb-6 leading-[normal] md:px-14 md:pt-10 md:pb-8">
        <header className="flex flex-wrap items-center gap-3">
          <Link href={`/${langue}`} className="inline-flex min-h-11 items-center">
            <LogoMarque hauteur={44} className="md:h-13 md:w-auto" />
          </Link>
        </header>

        <main
          id="contenu"
          className="grid flex-1 grid-cols-[minmax(0,1fr)] items-start gap-20 py-5 lg:grid-cols-[minmax(0,1fr)_520px] lg:items-center lg:py-12"
        >
          {/* CENTRÉE, À LA DIFFÉRENCE DE LA CONNEXION : ici le kit ne pose que
              l'argument et ses trois points — la même colonne que la nôtre —, et
              il la centre dans la grille. */}
          <div className="hidden lg:block">
            <ArgumentAcces />
          </div>

          <div className="mx-auto flex w-full max-w-[520px] flex-col gap-[22px] rounded-ds-3xl bg-ds-surface-carte px-5 pt-6 pb-[30px] shadow-ds-lg md:px-12 md:py-11">
            <div className="flex flex-col items-center gap-[14px] text-center">
              <span className="inline-flex h-16 w-16 items-center justify-center rounded-ds-pill bg-ds-surface-teinte text-ds-accent">
                <ShieldCheck aria-hidden="true" size={30} strokeWidth={1.8} />
              </span>
              <h1 className="text-[24px] leading-[1.1] font-extrabold tracking-[-0.04em] text-ds-texte-titre md:text-[34px]">
                {t("titre")}
              </h1>
              <p className="text-[15px] leading-[1.55] text-ds-texte-corps">{t("sousTitre")}</p>
            </div>

            <TraductionsClient espaces={["verification"]}>
              <FormulaireVerification locale={langue} suite={suite} />
            </TraductionsClient>

            <p className="text-center text-[13px] leading-[1.55] text-ds-texte-corps">{t("perdu")}</p>

            {/* ⚠️ UN `div` ET PAS UN `p` : `BoutonDeconnexion` rend un `<form>`, et
                un formulaire n'a pas le droit d'être dans un paragraphe. Le
                navigateur fermait le `<p>` avant lui en analysant le HTML, l'arbre
                ne correspondait plus à celui de React, et l'écran levait « Minified
                React error #418 » à chaque ouverture — React jette alors le HTML du
                serveur et reconstruit la page. Invisible à toutes les portes ;
                trouvé le 17/09/2026 par la sonde, qui lit désormais la console. */}
            <div className="text-center text-[14px] text-ds-texte-corps">
              {t("pasVous")} <BoutonDeconnexion langue={langue} variante="lien" />
            </div>

            <NoteSecurite />
          </div>
        </main>

        <footer className="flex items-end">
          <span className="text-[12px] text-ds-texte-tenu">
            <Link
              href={`/${langue}/docs`}
              className="-my-3.5 inline-flex min-h-11 items-center font-semibold text-ds-texte-corps hover:underline lg:my-0 lg:min-h-0"
            >
              {tl("menu.docs")}
            </Link>
            {"  ·  "}
            {tl("piedDroits", { annee: new Date().getFullYear() })}
          </span>
        </footer>
      </div>
    </>
  );
}
