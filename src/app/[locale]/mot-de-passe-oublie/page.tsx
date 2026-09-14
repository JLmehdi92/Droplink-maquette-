import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import Link from "next/link";
import { FormulaireMotDePasseOublie } from "@/components/formulaire-mot-de-passe-oublie";
import { TraductionsClient } from "@/components/traductions-client";
import { Mail } from "lucide-react";
import { CoqueAccesSimple } from "@/components/acces/coque-acces-simple";
import { estLangueSupportee } from "@/i18n/config";
import { routing } from "@/i18n/routing";

/**
 * MOT DE PASSE OUBLIÉ.
 *
 * `ForgotScreen` du kit `auth`, écrit le 14/09/2026 avant cette page, sur la
 * coque de la vérification. Un écran qu'on atteint depuis la connexion et qui y
 * ramène ne doit pas dépayser : il en garde le fond, le logo, l'argument et la
 * carte.
 *
 * ⚠️ AUCUN BOUTON GOOGLE. Ce n'est pas une porte d'entrée mais la réparation
 * d'un mot de passe : proposer Google ici enverrait vers une identité
 * DIFFÉRENTE de celle qu'on essaie de récupérer, et quelqu'un se retrouverait
 * connecté sans comprendre qu'il n'a rien réparé.
 *
 * ⚠️ AUCUNE MENTION DE CONDITIONS non plus, contrairement à la connexion et à
 * l'inscription : rien n'est accepté ni créé ici.
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
  return { title: t("oublieTitre"), robots: { index: false, follow: false } };
}

export default async function MotDePasseOublie({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const langue = estLangueSupportee(locale) ? locale : "fr";
  setRequestLocale(langue);
  const t = await getTranslations("motDePasse");

  return (
    <CoqueAccesSimple langue={langue} icone={Mail} titre={t("oublieTitre")} sousTitre={t("oublieSousTitre")}>
      <TraductionsClient espaces={["connexion", "motDePasse"]}>
        <FormulaireMotDePasseOublie locale={langue} />
      </TraductionsClient>

      <p className="text-center text-[14px] text-ds-texte-corps">
        <Link
          href={`/${langue}/connexion`}
          className="-my-3 inline-flex min-h-11 items-center font-bold text-ds-texte-lien hover:underline lg:my-0 lg:min-h-0"
        >
          {t("retourConnexion")}
        </Link>
      </p>
    </CoqueAccesSimple>
  );
}
