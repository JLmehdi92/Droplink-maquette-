import Link from "next/link";
import { LienEcran } from "@/components/lien-ecran";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { EnTeteAdmin } from "@/components/admin/en-tete-admin";
import { EncartTrace } from "@/components/admin/encart-trace";
import { RechercheAdmin } from "@/components/admin/recherche-admin";
import { exigerAdmin } from "@/lib/audit/garde";
import { empreinteAdmin } from "@/lib/audit/empreinte-admin";
import { listerComptes, ParametresComptes, type LigneCompte } from "@/lib/audit/comptes";
import { lireCompteurs, lireSeuils } from "@/lib/audit/panneau";
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

const EN_TETE_COLONNE =
  "pb-3 text-left text-[11.5px] leading-[13px] font-bold tracking-[0.05em] text-ds-texte-sourdine uppercase";
const CELLULE = "border-t border-ds-filet py-3.5 text-[14px] leading-[18px] font-normal";
const PILULE =
  "inline-flex items-center gap-[5px] rounded-ds-pill px-[9px] py-[3px] text-[11.5px] leading-[13px] font-semibold " +
  "xl:gap-1.5 xl:px-2.5 xl:py-1 xl:text-[12px] xl:leading-[15px]";
const PILULE_NEUTRE = PILULE + " bg-ds-surface-creux text-ds-texte-corps";

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
 *
 * LA COLONNE « COMMANDES » COMPTE LE CONTENU RÉEL, pas les lignes de `orders`.
 * ⚠️ Elle comptait les lignes jusqu'à la migration 111, pendant que l'écran des
 * boutiques lisait le compteur tenu par déclencheur : deux écrans de la même
 * surface donnaient deux nombres pour le même compte, et le seul écart était
 * les brouillons abandonnés. Aucun des deux ne mentait sur son calcul — il y
 * avait deux définitions du mot « commande » et rien pour le signaler.
 *
 * LA COLONNE DE RÔLE DE L'ANCIEN TABLEAU A DISPARU, mais pas l'information : la
 * planche n'en dessine pas, et un rôle identique sur 99 % des lignes est une
 * colonne qui ne sert qu'à la centième. Une pilule apparaît donc À CÔTÉ DU NOM
 * quand — et seulement quand — le compte est administrateur. C'est l'exception
 * qu'on cherche, jamais la règle.
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
  const [page, seuils, compteurs] = await Promise.all([
    listerComptes(supabase, parametres, await empreinteAdmin()),
    lireSeuils(supabase),
    lireCompteurs(supabase),
  ]);

  const t = await getTranslations("admin");
  const format = await getFormatter();
  const base = `/${langue}/admin/comptes`;

  const suspendu = (l: LigneCompte): boolean => l.statut === "suspended";
  const auDessus = (l: LigneCompte): boolean => l.colisCeMois > seuils.colis;

  const lienSuivant =
    page.curseurSuivant === null
      ? null
      : `${base}?${new URLSearchParams({
          ...(parametres.q === "" ? {} : { q: parametres.q }),
          curseur: page.curseurSuivant,
        }).toString()}`;

  /** Le nom de boutique, ou le fait qu'il n'y en ait pas — jamais une invention. */
  const nom = (l: LigneCompte, style: string): React.ReactNode =>
    l.boutique === null ? (
      <span className={style + " italic text-ds-texte-sourdine"}>{t("comptes.sansNom")}</span>
    ) : (
      <span className={style}>{l.boutique}</span>
    );

  /** La pilule d'état, la seule chose de la ligne qui se lise sans lire. */
  const pilluleEtat = (l: LigneCompte) => (
    <span
      className={
        PILULE +
        " shrink-0 " +
        (suspendu(l) ? "bg-ds-erreur text-ds-erreur" : "bg-ds-succes-fond text-ds-succes")
      }
    >
      <span
        aria-hidden="true"
        className={
          "h-[5px] w-[5px] rounded-ds-pill xl:h-1.5 xl:w-1.5 " +
          (suspendu(l) ? "bg-ds-erreur" : "bg-ds-succes")
        }
      />
      {t(`comptes.statuts.${l.statut}`)}
    </span>
  );

  const typeLisible = (l: LigneCompte): string =>
    // UNE INFORMATION ABSENTE EST NOMMÉE, pas remplacée. Le type de compte est
    // nullable SANS DÉFAUT pour que le manque soit visible : un défaut aurait
    // classé tous les fournisseurs comme revendeurs et faussé la segmentation
    // d'usage, qui est le livrable réel de la phase de validation.
    l.typeDeCompte === null ? t("comptes.typeNonDeclare") : t(`comptes.type.${l.typeDeCompte}`);

  return (
    <main id="contenu" className="md:px-8 md:pt-0 md:pb-8">
      <EnTeteAdmin
        titre={t("comptes.titre")}
        sousTitre={t("comptes.decompte", {
          // LES NOMBRES PARTENT BRUTS : c'est ICU qui accorde, et il ne sait pas
          // le faire sur une chaîne déjà formatée. « 1 comptes » se lisait sur la
          // capture, et le français met 0 au singulier là où l'anglais met le
          // pluriel — une règle par langue, dans le catalogue, jamais ici.
          total: compteurs.comptes,
          suspendus: compteurs.comptesSuspendus,
        })}
        // L'encart violet répète l'avertissement trois centimètres plus bas. Au
        // téléphone, le redire dans le noir pousse le champ de recherche hors de
        // l'écran d'ouverture, qui est exactement ce qu'on vient y faire.
        sousTitreAuBureauSeulement
      >
        <RechercheAdmin
          action={base}
          valeur={parametres.q}
          etiquette={t("comptes.recherche")}
          exemple={t("comptes.recherchePlaceholder")}
          chercher={t("comptes.chercher")}
        />
      </EnTeteAdmin>

      <div className="flex flex-col gap-2.5 px-4 py-3.5 md:mt-5 md:gap-[18px] md:px-0 md:py-0">
        <EncartTrace texte={t("comptes.trace")} />

        {page.lignes.length === 0 ? (
          <p className="rounded-ds-card border border-ds-filet bg-ds-surface-carte p-6 text-center text-ds-texte-corps md:rounded-ds-card-lg">
            {parametres.q === "" ? t("comptes.videCompte") : t("comptes.videRecherche")}
          </p>
        ) : (
          <>
            {/* --- LE TABLEAU, au bureau ---

                ⚠️ IL BASCULE À `xl`, PAS À `md`. Sept colonnes derrière une
                colonne de navigation de 236 px : à 768 il resterait 472 px, soit
                67 par colonne, et « 1 840 / 1 200 » en réclame 90 à lui seul. Le
                même calcul a déjà fait basculer Envois, Analyses et le Panneau. */}
            <div className="hidden rounded-ds-card-lg border border-ds-filet bg-ds-surface-carte p-6 shadow-ds-card xl:block">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th scope="col" className={EN_TETE_COLONNE}>
                      {t("comptes.colonnes.email")}
                    </th>
                    <th scope="col" className={EN_TETE_COLONNE}>
                      {t("comptes.colonnes.type")}
                    </th>
                    <th scope="col" className={EN_TETE_COLONNE}>
                      {t("comptes.colonnes.statut")}
                    </th>
                    <th scope="col" className={EN_TETE_COLONNE}>
                      {t("comptes.colonnes.commandes")}
                    </th>
                    <th scope="col" className={EN_TETE_COLONNE}>
                      {t("comptes.colonnes.colis")}
                    </th>
                    <th scope="col" className={EN_TETE_COLONNE}>
                      {t("comptes.colonnes.cree")}
                    </th>
                    <th scope="col" className={EN_TETE_COLONNE + " text-right"}>
                      {t("comptes.colonnes.action")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {page.lignes.map((ligne) => (
                    <tr key={ligne.id}>
                      <td className={CELLULE}>
                        <span className="flex items-center gap-2">
                          {nom(ligne, "font-semibold text-ds-texte-fort")}
                          {ligne.role === "admin" ? (
                            <span className={PILULE_NEUTRE}>{t("comptes.roles.admin")}</span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block text-[12px] leading-[15px] text-ds-texte-sourdine">
                          {ligne.email}
                        </span>
                      </td>
                      <td className={CELLULE + " text-ds-texte-sourdine"}>
                        {typeLisible(ligne)}
                      </td>
                      <td className={CELLULE}>{pilluleEtat(ligne)}</td>
                      <td className={CELLULE + " text-ds-texte-fort"}>
                        {format.number(ligne.commandes)}
                      </td>
                      {/* LE COLIS PORTE SON SEUIL quand il le dépasse : « 1 840 /
                          1 200 » se vérifie et se compare ; « au-dessus » se
                          discute, et l'on finit par ne plus le lire. */}
                      <td
                        className={
                          CELLULE + (auDessus(ligne) ? " font-bold text-ds-erreur" : " text-ds-texte-fort")
                        }
                      >
                        {auDessus(ligne)
                          ? t("comptes.colisSurSeuil", {
                              valeur: format.number(ligne.colisCeMois),
                              seuil: format.number(seuils.colis),
                            })
                          : format.number(ligne.colisCeMois)}
                      </td>
                      <td className={CELLULE + " text-ds-texte-sourdine"}>
                        {format.dateTime(new Date(ligne.creeLe), { dateStyle: "medium" })}
                      </td>
                      <td className={CELLULE + " text-right"}>
                        <Link
                          href={`${base}/${ligne.id}`}
                          className="inline-flex h-[34px] items-center rounded-ds-sm border border-ds-filet-appuye bg-ds-surface-carte px-[13px] text-[13px] leading-4 font-semibold text-ds-texte-fort transition-colors hover:bg-ds-surface-creux"
                        >
                          {t("comptes.ouvrir")}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* --- LES CARTES, sous `xl` --- */}
            <ul className="flex flex-col gap-2.5 xl:hidden">
              {page.lignes.map((ligne) => (
                <li
                  key={ligne.id}
                  className={
                    "rounded-ds-card border p-4 " +
                    (suspendu(ligne)
                      ? "border-ds-erreur bg-ds-erreur-fond"
                      : "border-ds-filet bg-ds-surface-carte")
                  }
                >
                  <div className="mb-2.5 flex items-center justify-between gap-2.5">
                    <div className="min-w-0">
                      {nom(ligne, "block truncate text-[15px] leading-[19px] font-bold text-ds-texte-fort")}
                      <span className="mt-px block truncate text-[12px] leading-[15px] text-ds-texte-sourdine">
                        {ligne.email}
                      </span>
                    </div>
                    {pilluleEtat(ligne)}
                  </div>

                  <div className="mb-3 flex flex-wrap gap-1.5">
                    <span className={PILULE_NEUTRE}>{typeLisible(ligne)}</span>
                    {ligne.role === "admin" ? (
                      <span className={PILULE_NEUTRE}>{t("comptes.roles.admin")}</span>
                    ) : null}
                    {auDessus(ligne) ? (
                      <span className={PILULE + " bg-ds-erreur text-ds-erreur"}>
                        {t("comptes.colisSurSeuilLong", {
                          valeur: format.number(ligne.colisCeMois),
                          seuil: format.number(seuils.colis),
                        })}
                      </span>
                    ) : (
                      <span className={PILULE_NEUTRE}>
                        {t("comptes.commandesLong", { n: format.number(ligne.commandes) })}
                      </span>
                    )}
                  </div>

                  <Link
                    href={`${base}/${ligne.id}`}
                    className="flex min-h-11 w-full items-center justify-center rounded-ds-control border border-ds-filet-appuye bg-ds-surface-carte text-[14px] leading-[18px] font-semibold text-ds-texte-fort"
                  >
                    {t("comptes.ouvrir")}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}

        {lienSuivant === null ? null : (
          <LienEcran
            href={lienSuivant}
            className="mx-auto inline-flex min-h-11 items-center rounded-ds-control border border-ds-filet-appuye bg-ds-surface-carte px-6 text-[14px] leading-[18px] font-semibold text-ds-texte-fort"
          >
            {t("comptes.pageSuivante")}
          </LienEcran>
        )}
      </div>
    </main>
  );
}
