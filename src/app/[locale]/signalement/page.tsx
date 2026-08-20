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
        <p className="font-body-md text-body-md text-on-surface-variant">{t("signalement.intro")}</p>
        <p className="mt-4">
          <a
            href={`mailto:${adresse}`}
            className="font-label-md text-label-md text-[var(--accent-texte)] underline"
          >
            {adresse}
          </a>
        </p>
      </section>

      <section>
        <h2 className="font-headline-md text-headline-md-mobile text-on-surface">
          {sections[0].titre}
        </h2>
        <ul className="mt-2 list-disc pl-5 font-body-md text-body-md text-on-surface-variant">
          <li>{t("signalement.quoi1")}</li>
          <li>{t("signalement.quoi2")}</li>
          <li>{t("signalement.quoi3")}</li>
        </ul>
      </section>

      <section>
        <h2 className="font-headline-md text-headline-md-mobile text-on-surface">
          {sections[1].titre}
        </h2>
        <p className="mt-2 font-body-md text-body-md text-on-surface-variant">{sections[1].texte}</p>
      </section>
    </PageLegale>
  );
}
