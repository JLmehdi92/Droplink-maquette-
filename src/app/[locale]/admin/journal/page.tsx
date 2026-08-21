import Link from "next/link";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { exigerAdmin } from "@/lib/audit/garde";
import { lireJournal } from "@/lib/audit/comptes";
import { creerClientServeur } from "@/lib/supabase/server";
import { estLangueSupportee } from "@/i18n/config";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("journal.titre"), robots: { index: false, follow: false } };
}

/**
 * LE JOURNAL D'AUDIT.
 *
 * LE TITRE DE LA MAQUETTE EST ABANDONNÉ. Elle l'appelle « QC Master Logs » :
 * personne n'inspecte de contrôle qualité chez nous, et ce journal ne parle pas
 * de commandes mais de ce que NOUS avons consulté chez les autres.
 *
 * LIRE CETTE PAGE N'ÉCRIT RIEN. Sans cette règle, l'ouvrir y ajouterait une
 * ligne, laquelle apparaîtrait à la consultation suivante : le journal se
 * remplirait de sa propre consultation et noierait ce qu'il conserve. La
 * garantie n'est pas dans ce fichier — la fonction en base est déclarée
 * `stable`, donc PostgREST l'exécute en transaction lecture seule et le moteur
 * refuserait toute écriture qu'on y ajouterait.
 *
 * LE MOTIF EST EN CLAIR, LE RESTE DE LA CHARGE UTILE NON. Le motif est la pièce
 * qu'on demanderait en cas de litige, et le replier derrière un détail que
 * personne n'ouvre reviendrait à ne pas l'avoir. Étaler tout le reste ferait de
 * ce journal une surface de fuite de plus — celle-là consultable par tous les
 * administrateurs à la fois.
 */
export default async function AdminJournal({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const langue = estLangueSupportee(locale) ? locale : "fr";
  setRequestLocale(langue);

  await exigerAdmin();

  const brut = await searchParams;
  const curseurBrut = Array.isArray(brut["curseur"]) ? brut["curseur"][0] : brut["curseur"];

  const supabase = await creerClientServeur();
  const page = await lireJournal(supabase, curseurBrut ?? null);

  const t = await getTranslations("admin");
  const format = await getFormatter();

  return (
    <main
      id="contenu"
      className="mx-auto w-full max-w-container-max px-margin-mobile py-12 md:px-margin-desktop"
    >
      <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface md:font-headline-lg md:text-headline-lg">
        {t("journal.titre")}
      </h1>
      <p className="mt-3 font-body-md text-body-md text-on-surface-variant">
        {t("journal.sousTitre")}
      </p>

      {page.lignes.length === 0 ? (
        <p className="mt-6 rounded-xl border border-outline-variant bg-surface-container-lowest p-6 text-center font-body-md text-body-md text-on-surface-variant">
          {t("journal.vide")}
        </p>
      ) : (
        <ol className="mt-6 flex flex-col gap-2">
          {page.lignes.map((ligne) => (
            <li
              key={ligne.id}
              className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4"
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-label-md text-label-md text-on-surface">
                  {t(`journal.actions.${ligne.action}`, { defaut: ligne.action })}
                </span>
                <span className="font-body-sm text-body-sm text-on-surface-variant">
                  {ligne.adminEmail}
                </span>
                <span className="ml-auto font-body-sm text-body-sm text-on-surface-variant">
                  {format.dateTime(new Date(ligne.quand), { dateStyle: "short", timeStyle: "short" })}
                </span>
              </div>

              {/* L'ENTRÉE SURVIT À LA SUPPRESSION DU COMPTE VISÉ : l'email est
                  dénormalisé à l'écriture, la clé étrangère se dénoue. Sans lui,
                  la ligne deviendrait « quelqu'un a consulté quelque chose »,
                  exactement quand on en a le plus besoin. */}
              {ligne.cibleEmail !== null ? (
                <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
                  {t("journal.cible", { email: ligne.cibleEmail })}
                </p>
              ) : null}

              {ligne.motif !== null ? (
                <p className="mt-2 rounded-lg bg-surface-container-low p-3 font-body-sm text-body-sm text-on-surface">
                  {ligne.motif}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      )}

      {page.curseurSuivant !== null ? (
        <Link
          href={`/${langue}/admin/journal?curseur=${encodeURIComponent(page.curseurSuivant)}`}
          className="mx-auto mt-6 inline-flex min-h-[44px] items-center rounded-lg border border-outline-variant px-6 font-label-md text-label-md text-on-surface"
        >
          {t("journal.pageSuivante")}
        </Link>
      ) : null}
    </main>
  );
}
