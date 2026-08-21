import Link from "next/link";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { exigerAdmin } from "@/lib/audit/garde";
import { empreinteAdmin } from "@/lib/audit/empreinte-admin";
import { listerComptes, ParametresComptes } from "@/lib/audit/comptes";
import { creerClientServeur } from "@/lib/supabase/server";
import { estLangueSupportee } from "@/i18n/config";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // LA GARDE COURT AUSSI ICI. Next évalue les métadonnées EN PARALLÈLE du
  // rendu : sans elle, le titre de l'écran partait dans le corps du 404 servi à
  // un visiteur sans droits, et révélait la surface que le code de réponse
  // cachait. L'appel est mémoïsé par requête, donc il ne coûte rien de plus.
  await exigerAdmin();
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("comptes.titre"), robots: { index: false, follow: false } };
}

const CARTE = "rounded-xl border border-outline-variant bg-surface-container-lowest";

/**
 * GESTION DES COMPTES — surface d'administration.
 *
 * `/[locale]/admin/*` EST UN SEGMENT RÉEL, jamais un groupe entre parenthèses :
 * un groupe n'ajoute rien à l'URL, et les écrans tomberaient hors du filtre du
 * middleware tout en paraissant rangés au bon endroit.
 *
 * LA GARDE EST ICI, EN TÊTE, ET ELLE LIT LE RÔLE EN BASE. Le middleware n'a
 * écarté que les visiteurs sans session — il ne vérifie pas le rôle, parce qu'y
 * lire `profiles` ajouterait un aller-retour à chaque navigation du produit. Et
 * il ne couvre de toute façon pas les Server Actions.
 *
 * LA LECTURE EST INSÉPARABLE DE SON AUDIT : elle passe par une fonction en base
 * qui écrit la trace dans la MÊME transaction. Une requête directe rendrait les
 * mêmes données sans rien laisser, et rien n'échouerait.
 */
export default async function AdminComptes({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const langue = estLangueSupportee(locale) ? locale : "fr";
  setRequestLocale(langue);

  // Rend un 404 sans jamais revenir si l'appelant n'est pas administrateur
  // ACTIF. Jamais 403 : un 403 confirmerait que la surface existe.
  await exigerAdmin();

  const brut = await searchParams;
  const parametres = ParametresComptes.parse({
    q: Array.isArray(brut["q"]) ? brut["q"][0] : brut["q"],
    curseur: (Array.isArray(brut["curseur"]) ? brut["curseur"][0] : brut["curseur"]) ?? null,
  });

  const supabase = await creerClientServeur();
  const page = await listerComptes(supabase, parametres, await empreinteAdmin());

  const t = await getTranslations("admin");
  const format = await getFormatter();
  const base = `/${langue}/admin/comptes`;

  return (
    <main
      id="contenu"
      className="mx-auto w-full max-w-container-max px-margin-mobile py-12 md:px-margin-desktop"
    >
      <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface md:font-headline-lg md:text-headline-lg">
        {t("comptes.titre")}
      </h1>
      {/* ON DIT QUE LA CONSULTATION EST TRACÉE. Ce n'est pas une formalité : un
          administrateur qui sait que ses lectures laissent une trace nominative
          ne consulte pas de la même façon, et c'est précisément l'effet
          recherché. */}
      <p className="mt-3 font-body-md text-body-md text-on-surface-variant">
        {t("comptes.sousTitre")}
      </p>

      <form method="get" action={base} className="mt-6 flex flex-wrap gap-2">
        <label htmlFor="q" className="sr-only">
          {t("comptes.recherche")}
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={parametres.q}
          placeholder={t("comptes.recherchePlaceholder")}
          className="min-h-[44px] flex-1 rounded-lg border border-outline-variant bg-surface-container-lowest px-4 font-body-md text-body-md text-on-surface"
        />
        <button
          type="submit"
          className="min-h-[44px] rounded-lg bg-secondary-fixed px-6 font-label-md text-label-md text-on-surface"
        >
          {t("comptes.chercher")}
        </button>
      </form>

      {page.lignes.length === 0 ? (
        <p className={CARTE + " mt-6 p-6 text-center font-body-md text-body-md text-on-surface-variant"}>
          {parametres.q === "" ? t("comptes.videCompte") : t("comptes.videRecherche")}
        </p>
      ) : (
        <div className={CARTE + " mt-6 overflow-x-auto"}>
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="border-b border-outline-variant text-left">
                {(["email", "type", "role", "statut", "commandes", "cree"] as const).map((c) => (
                  <th
                    key={c}
                    scope="col"
                    className="p-4 font-label-sm text-label-sm text-on-surface-variant"
                  >
                    {t(`comptes.colonnes.${c}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {page.lignes.map((ligne) => (
                <tr key={ligne.id} className="border-b border-outline-variant last:border-0">
                  <td className="p-4 font-body-sm text-body-sm text-on-surface">
                    <Link
                      href={`/${langue}/admin/comptes/${ligne.id}`}
                      className="underline hover:no-underline"
                    >
                      {ligne.email}
                    </Link>
                    {ligne.boutique !== null ? (
                      <span className="ml-2 font-body-sm text-body-sm text-on-surface-variant">
                        {ligne.boutique}
                      </span>
                    ) : null}
                  </td>
                  <td className="p-4 font-body-sm text-body-sm text-on-surface-variant">
                    {/* UNE INFORMATION ABSENTE EST NOMMÉE, pas remplacée. Le type
                        de compte est nullable SANS DÉFAUT pour que le manque soit
                        visible : un défaut aurait classé tous les fournisseurs
                        comme revendeurs et faussé la segmentation d'usage, qui
                        est le livrable réel de la phase de validation. */}
                    {ligne.typeDeCompte === null
                      ? t("comptes.typeNonDeclare")
                      : t(`comptes.type.${ligne.typeDeCompte}`)}
                  </td>
                  <td className="p-4 font-body-sm text-body-sm text-on-surface-variant">
                    {t(`comptes.roles.${ligne.role}`)}
                  </td>
                  <td className="p-4 font-body-sm text-body-sm">
                    <span
                      className={
                        ligne.statut === "suspended"
                          ? "rounded-full bg-error-container px-2 py-1 font-label-sm text-label-sm text-on-error-container"
                          : "text-on-surface-variant"
                      }
                    >
                      {t(`comptes.statuts.${ligne.statut}`)}
                    </span>
                  </td>
                  <td className="p-4 font-body-sm text-body-sm text-on-surface-variant">
                    {format.number(ligne.commandes)}
                  </td>
                  <td className="p-4 font-body-sm text-body-sm text-on-surface-variant">
                    {format.dateTime(new Date(ligne.creeLe), { dateStyle: "medium" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {page.curseurSuivant !== null ? (
        <Link
          href={`${base}?${new URLSearchParams({
            ...(parametres.q === "" ? {} : { q: parametres.q }),
            curseur: page.curseurSuivant,
          }).toString()}`}
          className="mx-auto mt-6 inline-flex min-h-[44px] items-center rounded-lg border border-outline-variant px-6 font-label-md text-label-md text-on-surface"
        >
          {t("comptes.pageSuivante")}
        </Link>
      ) : null}
    </main>
  );
}
