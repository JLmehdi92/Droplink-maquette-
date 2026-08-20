import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PageLegale } from "@/components/page-legale";
import { adresseAbus } from "@/lib/contact";
import { routing } from "@/i18n/routing";

export function generateStaticParams(): Array<{ locale: string }> {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal" });
  return { title: t("signalementTitre") };
}

/**
 * Page de signalement de contenu.
 *
 * Elle N'EXISTE PAS tant qu'aucune adresse de contact n'est configurée. Ce
 * n'est pas une dégradation, c'est le comportement voulu : publier une
 * procédure de signalement sans destinataire ferait croire qu'un canal existe.
 * Un signalement envoyé dans le vide est un signalement non traité que tout le
 * monde croit traité — y compris nous.
 *
 * Le lien du pied de page disparaît de la même façon et pour la même raison.
 */
export default async function Signalement({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const adresse = adresseAbus();
  if (adresse === null) {
    notFound();
  }

  const t = await getTranslations("legal");

  const sections = [
    { titre: t("signalement.quoiTitre"), texte: "" },
    { titre: t("signalement.suiteTitre"), texte: t("signalement.suiteTexte") },
  ] as const;

  return (
    <PageLegale locale={locale} titre={t("signalementTitre")} sections={[]}>
      <section>
        <p className="text-base leading-7 text-encre-douce">{t("signalement.intro")}</p>
        <p className="mt-4">
          <a
            href={`mailto:${adresse}`}
            className="text-base font-semibold text-[var(--accent-texte)] underline"
          >
            {adresse}
          </a>
        </p>
      </section>

      <section>
        <h2 className="font-[family-name:var(--font-titre)] text-xl font-semibold text-encre">
          {sections[0].titre}
        </h2>
        <ul className="mt-2 list-disc pl-5 text-base leading-7 text-encre-douce">
          <li>{t("signalement.quoi1")}</li>
          <li>{t("signalement.quoi2")}</li>
          <li>{t("signalement.quoi3")}</li>
        </ul>
      </section>

      <section>
        <h2 className="font-[family-name:var(--font-titre)] text-xl font-semibold text-encre">
          {sections[1].titre}
        </h2>
        <p className="mt-2 text-base leading-7 text-encre-douce">{sections[1].texte}</p>
      </section>
    </PageLegale>
  );
}
