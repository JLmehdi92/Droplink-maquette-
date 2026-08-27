import Link from "next/link";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { exigerAdmin } from "@/lib/audit/garde";
import { empreinteAdmin } from "@/lib/audit/empreinte-admin";
import { listerBoutiques, ParametresBoutiques } from "@/lib/audit/boutiques";
import { mettreOctetsALEchelle } from "@/lib/format/octets";
import { creerClientServeur } from "@/lib/supabase/server";
import { estLangueSupportee } from "@/i18n/config";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // LA GARDE COURT AUSSI ICI. Next évalue les métadonnées EN PARALLÈLE du rendu :
  // sans elle, le titre partirait dans le corps du 404 servi à qui n'a pas les
  // droits, et révélerait la surface que le code de réponse cache.
  await exigerAdmin();
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("boutiques.titre"), robots: { index: false, follow: false } };
}

const CARTE = "rounded-lg border border-outline-variant bg-surface-container-lowest";

/**
 * LES BOUTIQUES — ce que chaque compte occupe.
 *
 * LA MAQUETTE EST LARGEMENT ABANDONNÉE, et il faut le dire clairement. Elle
 * s'appelle « Organizations & Partners » et propose d'ajouter des partenaires,
 * de choisir une intégration entre SAP, Oracle et Dynamics, et d'afficher une
 * colonne « White-label ». Rien de tout cela n'existe : le produit INTERDIT les
 * relations entre comptes — chacun est propriétaire de ses commandes et de ses
 * destinataires — et n'expose aucune API d'entreprise. Garder ces colonnes
 * ferait croire à des capacités absentes, sur l'écran même où l'on décide.
 *
 * CE QUI EST GARDÉ EST LA GÉOMÉTRIE : le tableau dense, la recherche en tête,
 * la pastille de statut, la colonne de volumes.
 *
 * CE N'EST PAS UNE SECONDE LISTE DE COMPTES. Celle-là répond à « qui est
 * inscrit » et se trie par date d'inscription. Celle-ci répond à « qu'est-ce que
 * ça nous coûte » et se trie par octets occupés — le seul poste de coût du
 * produit qui puisse réellement déraper.
 *
 * AUCUN CONTENU N'Y FIGURE : pas un nom de client, pas une référence produit,
 * pas une note interne, pas un jeton. Des volumes suffisent à décider.
 */
export default async function AdminBoutiques({
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
  const parametres = ParametresBoutiques.parse({
    q: Array.isArray(brut["q"]) ? brut["q"][0] : brut["q"],
    curseur: (Array.isArray(brut["curseur"]) ? brut["curseur"][0] : brut["curseur"]) ?? null,
  });

  const supabase = await creerClientServeur();
  const page = await listerBoutiques(supabase, parametres, await empreinteAdmin());

  const t = await getTranslations("admin");
  const format = await getFormatter();
  const base = `/${langue}/admin/boutiques`;

  return (
    <main id="contenu" className="px-margin-mobile py-6 md:px-[30px] md:py-[26px]">
      <h1 className="font-headline-xl text-[24px] font-extrabold tracking-[-0.03em] text-on-surface md:text-[28px]">
        {t("boutiques.titre")}
      </h1>
      {/* ON DIT QUE LA CONSULTATION EST TRACÉE. Un administrateur qui sait que
          ses lectures laissent une trace nominative ne consulte pas de la même
          façon, et c'est précisément l'effet recherché. */}
      <p className="mt-3 max-w-[640px] font-body-md text-body-md text-on-surface-variant">
        {t("boutiques.sousTitre")}
      </p>

      <form method="get" action={base} className="mt-6 flex flex-wrap gap-2">
        <label htmlFor="q" className="sr-only">
          {t("boutiques.recherche")}
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={parametres.q}
          placeholder={t("boutiques.recherchePlaceholder")}
          className="min-h-[44px] flex-1 rounded-lg border border-outline-variant bg-surface-container-lowest px-4 font-body-md text-body-md text-on-surface"
        />
        <button
          type="submit"
          className="min-h-[44px] rounded-lg bg-violet-fond px-6 font-label-md text-label-md text-on-surface"
        >
          {t("boutiques.chercher")}
        </button>
      </form>

      {page.lignes.length === 0 ? (
        /* DEUX ÉTATS VIDES DISTINCTS. Annoncer « aucune boutique » à qui vient
           de filtrer une base pleine est une perte de confiance immédiate. */
        <p
          className={
            CARTE + " mt-6 p-6 text-center font-body-md text-body-md text-on-surface-variant"
          }
        >
          {parametres.q === "" ? t("boutiques.videTout") : t("boutiques.videRecherche")}
        </p>
      ) : (
        <div className={CARTE + " mt-6 overflow-x-auto"}>
          <table className="w-full min-w-[860px] border-collapse">
            <thead>
              <tr className="border-b border-outline-variant text-left">
                {(["nom", "type", "statut", "commandes", "medias", "stockage", "colis"] as const).map(
                  (c) => (
                    <th
                      key={c}
                      scope="col"
                      className="p-4 font-label-sm text-label-sm text-on-surface-variant"
                    >
                      {t(`boutiques.colonnes.${c}`)}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {page.lignes.map((ligne) => {
                const taille = mettreOctetsALEchelle(ligne.octets);
                return (
                  <tr key={ligne.id} className="border-b border-outline-variant last:border-0">
                    <td className="p-4 font-body-sm text-body-sm text-on-surface">
                      {/* LA BOUTIQUE SANS NOM EST NOMMÉE « non configurée », pas
                          laissée vide. `shops.name` est nullable parce que la
                          ligne naît à l'inscription, avant l'onboarding : un
                          vendeur peut envoyer un lien sans avoir rien réglé, et
                          c'est le cas le plus fréquent en début de vie d'un
                          compte. Une case vide ferait croire à une anomalie. */}
                      {ligne.nom ?? (
                        <span className="text-on-surface-variant">
                          {t("boutiques.nonConfiguree")}
                        </span>
                      )}
                      <span className="mt-1 block font-body-sm text-body-sm text-on-surface-variant">
                        <Link
                          href={`/${langue}/admin/comptes/${ligne.proprietaireId}`}
                          className="underline hover:no-underline"
                        >
                          {ligne.email}
                        </Link>
                      </span>
                    </td>
                    <td className="p-4 font-body-sm text-body-sm text-on-surface-variant">
                      {/* Le type est nullable SANS DÉFAUT pour que le manque soit
                          visible : un défaut aurait classé tous les fournisseurs
                          comme revendeurs et faussé la segmentation d'usage, qui
                          est le livrable réel de la phase de validation. */}
                      {ligne.typeDeCompte === null
                        ? t("comptes.typeNonDeclare")
                        : t(`comptes.type.${ligne.typeDeCompte}`)}
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
                      {format.number(ligne.medias)}
                    </td>
                    <td className="p-4 font-body-sm text-body-sm text-on-surface">
                      {t("boutiques.taille", {
                        valeur: format.number(taille.valeur, {
                          minimumFractionDigits: taille.decimales,
                          maximumFractionDigits: taille.decimales,
                        }),
                        unite: t(`unites.${taille.unite}`),
                      })}
                    </td>
                    <td className="p-4 font-body-sm text-body-sm text-on-surface-variant">
                      {format.number(ligne.colisCeMois)}
                    </td>
                  </tr>
                );
              })}
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
          {t("boutiques.pageSuivante")}
        </Link>
      ) : null}
    </main>
  );
}
