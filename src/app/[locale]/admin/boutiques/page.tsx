import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { EnTeteAdmin } from "@/components/admin/en-tete-admin";
import { Icone } from "@/components/icone";
import { EncartTrace } from "@/components/admin/encart-trace";
import { RechercheAdmin } from "@/components/admin/recherche-admin";
import { exigerAdmin } from "@/lib/audit/garde";
import { empreinteAdmin } from "@/lib/audit/empreinte-admin";
import {
  listerBoutiques,
  ParametresBoutiques,
  TYPES_FILTRABLES,
  type LigneBoutique,
} from "@/lib/audit/boutiques";
import { lireCompteurs, lirePanneau, lireSeuils } from "@/lib/audit/panneau";
import { Anneau } from "@/components/admin/anneau";
import { SelecteurAdmin } from "@/components/admin/selecteur-admin";
import { TuileVolume } from "@/components/admin/tuile-volume";
import Link from "next/link";
import { CircleCheck, HardDrive, ShoppingCart, Store } from "lucide-react";
import { mettreOctetsALEchelle } from "@/lib/format/octets";
import { creerClientServeur } from "@/lib/supabase/server";
import { estLangueSupportee } from "@/i18n/config";
import { LienEcran } from "@/components/lien-ecran";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // LA GARDE COURT AUSSI ICI : Next évalue les métadonnées EN PARALLÈLE du
  // rendu, et le titre partirait sinon dans le corps du 404 servi à qui n'a pas
  // les droits. Mémoïsée par requête, elle ne coûte rien de plus.
  await exigerAdmin();
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("boutiques.titre"), robots: { index: false, follow: false } };
}

/*
 * GÉOMÉTRIES RELEVÉES SUR LE KIT SERVI — `AdminShops`, les mêmes que
 * `AdminUsers` : pilule 11,5/700 à l'interlettrage -0,02em et au remplissage
 * 6/11 ; en-tête de colonne 12,5/600 en sourdine, SANS majuscules ni
 * interlettrage ; panneau au rayon `card-lg`, filet, ombre de carte,
 * remplissage 22, titre 18/700 à -0,025em, sous-titre 13/400 à 3 px.
 */
const PILULE =
  "inline-flex items-center gap-1.5 rounded-ds-pill px-[9px] py-[3px] text-[11.5px] leading-[normal] font-bold tracking-[-0.02em] xl:px-[11px] xl:py-1.5";
const PILULE_NEUTRE = PILULE + " bg-ds-surface-creux text-ds-texte-corps";
/* L'ECART DE 12 PX DU KIT ENTRE SES COLONNES. Sans lui, les entetes numeriques
   se touchent : « CommandesColisMedias » — mesure a l'appui. */
const EN_TETE_COLONNE =
  "pb-3 pr-3 text-left text-[12.5px] leading-[normal] font-semibold whitespace-nowrap text-ds-texte-sourdine last:pr-0";
const CELLULE =
  "border-t border-ds-filet py-3.5 pr-3 text-[14px] leading-[18px] font-normal last:pr-0";
const PANNEAU =
  "flex min-w-0 flex-col rounded-ds-card-lg border border-ds-filet bg-ds-surface-carte p-4 shadow-ds-card md:p-[22px]";
const PANNEAU_TITRE = "text-[18px] leading-[19.8px] font-bold tracking-[-0.025em] text-ds-texte-titre";
const PANNEAU_AIDE = "mt-[3px] text-[13px] leading-[1.55] text-ds-texte-corps";

/**
 * LES BOUTIQUES — ce que chaque compte OCCUPE.
 *
 * CET ÉCRAN NE MONTRE AUCUN CONTENU : ni nom de client, ni référence, ni note,
 * ni média. Des volumes, un nom de boutique et une adresse — ce qui permet de
 * décider, et rien de plus. Le contenu appartient au vendeur et à ses clients.
 *
 * IL EST TRIÉ PAR STOCKAGE, DÉCROISSANT, et c'est le seul tri qui ait un sens
 * ici : le stockage est le poste de coût qui peut réellement déraper, et une
 * liste alphabétique obligerait à parcourir 218 comptes pour trouver les trois
 * qui comptent.
 *
 * ⚠️ LE STOCKAGE EST DONC AFFICHÉ, alors que la planche ne dessine que trois
 * chiffres par carte — commandes, colis, médias. Une liste triée sur un nombre
 * qu'on ne voit pas est une liste dont on ne peut pas vérifier l'ordre.
 *
 * PAGINATION PAR CURSEUR, jamais par décalage : à la page 40 d'un jeu de 9 600,
 * un `offset` lit 2 000 lignes pour en rendre 50 — le coût croît avec le numéro
 * de page, donc l'inconfort arrive chez celui qui a le plus de données.
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

  await exigerAdmin();

  const brut = await searchParams;
  const seul = (cle: string): string | undefined =>
    Array.isArray(brut[cle]) ? brut[cle][0] : brut[cle];

  // UN TYPE INCONNU RETOMBE SUR « AUCUN FILTRE », et l'écran le DIT : la pilule
  // « Toutes » s'allume, donc ce qui est affiché correspond à ce qui est
  // annoncé. La base, elle, REFUSE la valeur inconnue — cette garde-là ne sert
  // pas cette page, qui n'en envoie jamais, mais tout appel direct à la RPC.
  const parametres = ParametresBoutiques.parse({
    q: seul("q"),
    type: seul("type"),
    curseur: seul("curseur") ?? null,
  });

  const supabase = await creerClientServeur();
  // LES SEUILS D'ABORD : le panneau les prend en argument, donc les lire deux
  // fois en parallèle coûterait un aller-retour pour la même réponse.
  const seuils = await lireSeuils(supabase);
  const [page, compteurs, panneau] = await Promise.all([
    listerBoutiques(supabase, parametres, await empreinteAdmin()),
    lireCompteurs(supabase),
    // LE STOCKAGE TOTAL VIT DANS LE PANNEAU, et c'est la MÊME source que la
    // tuile de la vue d'ensemble : deux lectures distinctes du même volume
    // finiraient par se contredire sans que rien ne le dise.
    lirePanneau(supabase, seuils),
  ]);

  const t = await getTranslations("admin");
  const format = await getFormatter();
  const base = `/${langue}/admin/boutiques`;

  /** L'URL d'un filtre, en conservant la recherche et en JETANT le curseur. */
  const lienFiltre = (type: string): string => {
    const params = new URLSearchParams();
    if (parametres.q !== "") params.set("q", parametres.q);
    if (type !== "") params.set("type", type);
    // ⚠️ LE CURSEUR NE SUIT PAS LE FILTRE. Il encode une position dans un
    // classement ; changer de filtre change le classement, et le reprendre
    // ouvrirait la nouvelle liste au milieu, parfois après sa fin.
    const suffixe = params.toString();
    return suffixe === "" ? base : `${base}?${suffixe}`;
  };

  const lienSuivant =
    page.curseurSuivant === null
      ? null
      : `${base}?${new URLSearchParams({
          ...(parametres.q === "" ? {} : { q: parametres.q }),
          ...(parametres.type === "" ? {} : { type: parametres.type }),
          curseur: page.curseurSuivant,
        }).toString()}`;

  const suspendue = (b: LigneBoutique): boolean => b.statut === "suspended";
  const auDessus = (b: LigneBoutique): boolean => b.colisCeMois > seuils.colis;

  /** La part d'une population dans le total des boutiques. */
  const part = (n: number): number =>
    compteurs.boutiques === 0 ? 0 : Math.round((n / compteurs.boutiques) * 100);

  const nonConfigurees = compteurs.boutiques - compteurs.boutiquesNommees;

  const stockage =
    panneau.stockageMesurable && panneau.stockageOctets !== null
      ? mettreOctetsALEchelle(panneau.stockageOctets)
      : null;

  /** Le libellé d'une taille, dans l'unité que l'échelle a choisie. */
  const taille = (octets: number): string => {
    const e = mettreOctetsALEchelle(octets);
    return t("boutiques.taille", {
      valeur: format.number(e.valeur, {
        minimumFractionDigits: e.decimales,
        maximumFractionDigits: e.decimales,
      }),
      unite: t(`unites.${e.unite}`),
    });
  };

  return (
    <main id="contenu" className="md:px-8 md:pt-0 md:pb-8">
      <EnTeteAdmin
        titre={t("boutiques.titre")}
        // LE DÉCOMPTE A QUITTÉ LE SOUS-TITRE POUR LES TUILES, qui le disent
        // mieux : quatre chiffres nommés valent une phrase qui en porte un.
        sousTitre={t("boutiques.sousTitreListe")}
        sousTitreAuBureauSeulement
      />

      <div className="flex flex-col gap-2.5 px-4 py-3.5 md:mt-5 md:gap-[18px] md:px-0 md:py-0">
        <EncartTrace texte={t("boutiques.trace")} />

        {/* --- LES VOLUMES ---

            Le kit en pose SIX. Deux comptent les plans Pro et Gratuit : aucune
            colonne de plan n'existe, et la contrainte n°1 interdit d'en créer
            une. Une septième, « liens clients actifs », demanderait un agrégat
            de `link_views` sur toute la plateforme, qu'aucune fonction ne rend.
            Les quatre qui restent sont les nôtres.

            ⚠️ « ACTIVES » DU KIT DEVIENT « CONFIGURÉES », et ce n'est pas un
            synonyme. Une boutique naît à l'inscription et n'a pas d'état propre :
            c'est le COMPTE qui est actif ou suspendu. Ce qui distingue réellement
            deux boutiques, c'est qu'un vendeur soit allé jusqu'à se donner un
            nom — et c'est la mesure d'activation, celle sur laquelle on
            décidera. */}
        <div className="flex flex-col gap-2.5 xl:grid xl:grid-cols-4 xl:gap-[18px]">
          <TuileVolume
            icone={Store}
            compacte
            libelle={t("boutiques.tuileTotal")}
            valeur={format.number(compteurs.boutiques)}
            complement={t("boutiques.tuileTotalAide")}
          />
          <TuileVolume
            icone={CircleCheck}
            compacte
            teinte="succes"
            libelle={t("boutiques.tuileConfigurees")}
            valeur={format.number(compteurs.boutiquesNommees)}
            complement={t("boutiques.partDuTotal", {
              part: part(compteurs.boutiquesNommees),
            })}
          />
          <TuileVolume
            icone={ShoppingCart}
            compacte
            teinte="info"
            libelle={t("boutiques.tuileCommandes")}
            valeur={format.number(compteurs.commandesCreeesCeMois)}
            complement={t("boutiques.ceMoisCi")}
          />
          <TuileVolume
            icone={HardDrive}
            compacte
            teinte="alerte"
            libelle={t("boutiques.tuileStockage")}
            valeurEnSourdine={stockage === null}
            valeur={
              stockage === null
                ? t("panneau.stockageIndisponible")
                : t("boutiques.taille", {
                    valeur: format.number(stockage.valeur, {
                      minimumFractionDigits: stockage.decimales,
                      maximumFractionDigits: stockage.decimales,
                    }),
                    unite: t(`unites.${stockage.unite}`),
                  })
            }
            complement={t("boutiques.stockageAide")}
          />
        </div>

        {/* --- LA BARRE DE FILTRES ---

            ⚠️ LES QUATRE PILULES SONT DEVENUES UNE LISTE DÉROULANTE, comme le
            kit. Elles disaient la même chose et faisaient la même chose ; ce
            qu'elles faisaient de PLUS, c'était deux rangées au téléphone, qui
            repoussaient la première carte hors de l'écran d'ouverture.

            Le filtre reste dans l'URL : il se partage, se recharge et revient
            avec le bouton retour — et le CRITÈRE ENTRE DANS LA TRACE, la
            fonction en base l'écrivant dans la charge utile de l'audit. */}
        <div className="flex flex-wrap items-center gap-3 rounded-ds-card-lg border border-ds-filet bg-ds-surface-carte p-3.5 shadow-ds-card">
          <div className="min-w-[240px] flex-1 md:max-w-[320px]">
            <RechercheAdmin
              action={base}
              valeur={parametres.q}
              etiquette={t("boutiques.recherche")}
              exemple={t("boutiques.recherchePlaceholder")}
              chercher={t("boutiques.chercher")}
            />
          </div>
          <SelecteurAdmin
            etiquette={t("boutiques.filtreType")}
            courant={parametres.type}
            options={(["", ...TYPES_FILTRABLES] as const).map((type) => ({
              valeur: type,
              libelle: t(`boutiques.filtre.${type === "" ? "toutes" : type}`),
              href: lienFiltre(type),
            }))}
          />
          <Link
            href={base}
            className="flex h-[42px] min-h-11 shrink-0 items-center rounded-ds-sm border border-ds-filet bg-ds-surface-carte px-[18px] text-[13.5px] leading-[normal] font-semibold text-ds-accent-encre transition-colors hover:bg-ds-surface-creux md:ml-auto"
          >
            {t("boutiques.reinitialiser")}
          </Link>
        </div>

        {/* --- LA LISTE, ET L'ANNEAU DE STATUT À SA DROITE ---

            ⚠️ LE KIT POSE TROIS PANNEAUX À DROITE. Un anneau « Répartition des
            boutiques par plan », que rien ne peut remplir, et un flux
            « Activité récente » qui nomme des vendeurs tiers à chaque ouverture —
            donc une entrée d'audit par chargement d'écran, qui noierait les
            consultations délibérées que le journal existe pour retrouver. Le
            nôtre ne rend que des nombres. */}
        <div className="grid gap-2.5 md:gap-[18px] xl:grid-cols-[minmax(0,1fr)_minmax(0,424px)] xl:items-start">
          <section className={PANNEAU}>
            <header className="mb-[18px]">
              <h2 className={PANNEAU_TITRE}>{t("boutiques.liste")}</h2>
              <p className={PANNEAU_AIDE}>
                {t("boutiques.listeTotal", { total: compteurs.boutiques })}
              </p>
            </header>

            {page.lignes.length === 0 ? (
              /* DEUX ÉTATS VIDES DISTINCTS. Annoncer « aucune boutique » à qui
                 vient de filtrer une base pleine est une perte de confiance
                 immédiate. */
              <p className="py-6 text-center text-ds-texte-corps">
                {parametres.q === "" && parametres.type === ""
                  ? t("boutiques.videTout")
                  : parametres.q === ""
                    ? t("boutiques.videFiltre")
                    : t("boutiques.videRecherche")}
              </p>
            ) : (
              <>
                {/* --- LE TABLEAU, au bureau ---

                    ⚠️ IL BASCULE À `xl`, PAS À `md`. Huit colonnes derrière une
                    colonne de navigation de 236 px : à 768 il resterait 472 px,
                    soit 59 par colonne, et « 1 840 / 1 200 » en réclame 90 à lui
                    seul. */}
                <div className="hidden xl:block">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th scope="col" className={EN_TETE_COLONNE}>
                          {t("boutiques.colonnes.nom")}
                        </th>
                        <th scope="col" className={EN_TETE_COLONNE}>
                          {t("boutiques.colonneProprietaire")}
                        </th>
                        <th scope="col" className={EN_TETE_COLONNE}>
                          {t("boutiques.colonnes.commandes")}
                        </th>
                        <th scope="col" className={EN_TETE_COLONNE}>
                          {t("boutiques.colonnes.colis")}
                        </th>
                        <th scope="col" className={EN_TETE_COLONNE}>
                          {t("boutiques.colonnes.medias")}
                        </th>
                        <th scope="col" className={EN_TETE_COLONNE}>
                          {t("boutiques.colonnes.stockage")}
                        </th>
                        <th scope="col" className={EN_TETE_COLONNE}>
                          {t("boutiques.colonneCreation")}
                        </th>
                        <th scope="col" className={EN_TETE_COLONNE}>
                          {t("boutiques.colonnes.statut")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {page.lignes.map((b) => (
                        <tr key={b.id}>
                          <td className={CELLULE}>
                            <span className="flex items-center gap-3">
                              {/* LA PASTILLE PORTE LA COULEUR DU VENDEUR quand
                                  il en a choisi une. Sans nom de boutique elle
                                  reste neutre : une couleur inventée ferait
                                  croire à une configuration. */}
                              <span
                                aria-hidden="true"
                                className={
                                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-ds-pill " +
                                  (b.nom === null ? "bg-ds-surface-creux" : "")
                                }
                                {...(b.nom === null
                                  ? {}
                                  : { style: { backgroundColor: b.accent } })}
                              >
                                {b.nom === null ? (
                                  <Icone
                                    nom="storefront"
                                    className="text-[15px] text-ds-texte-tenu"
                                  />
                                ) : null}
                              </span>
                              {/* HUIT COLONNES DANS 755 PX : le nom se tronque a
                                  150, l adresse a 130. Sans ces deux bornes, le
                                  tableau depassait son panneau de 83 px — mesure. */}
                              {b.nom === null ? (
                                <span className="max-w-[150px] truncate font-semibold italic text-ds-texte-sourdine">
                                  {t("boutiques.nonConfiguree")}
                                </span>
                              ) : (
                                <span className="max-w-[150px] truncate font-semibold text-ds-texte-fort">
                                  {b.nom}
                                </span>
                              )}
                            </span>
                          </td>
                          {/* ⚠️ L ADRESSE SE TRONQUE, ELLE NE SE REPLIE NI NE POUSSE.
                              Repliee, elle chevauchait le nom de la ligne voisine ;
                              en `nowrap` seul, elle a pousse le tableau hors de son
                              panneau — deux mesures, deux defauts, meme cause : une
                              adresse jetable de 37 caracteres dans une colonne qui
                              n en a pas la place. Le nom de boutique, lui, reste
                              entier : c est par lui qu on identifie la ligne. */}
                          <td className={CELLULE + " text-ds-texte-sourdine"}>
                            <span className="block max-w-[120px] truncate">{b.email}</span>
                          </td>
                          <td className={CELLULE + " text-ds-texte-fort"}>
                            {format.number(b.commandes)}
                          </td>
                          {/* LE COLIS PORTE SON SEUIL quand il le dépasse :
                              « 1 840 / 1 200 » se vérifie et se compare ; « au-dessus »
                              se discute, et l'on finit par ne plus le lire. */}
                          <td
                            className={
                              CELLULE +
                              (auDessus(b)
                                ? " font-bold text-ds-erreur"
                                : " text-ds-texte-fort")
                            }
                          >
                            {auDessus(b)
                              ? t("comptes.colisSurSeuil", {
                                  valeur: format.number(b.colisCeMois),
                                  seuil: format.number(seuils.colis),
                                })
                              : format.number(b.colisCeMois)}
                          </td>
                          <td className={CELLULE + " text-ds-texte-fort"}>
                            {format.number(b.medias)}
                          </td>
                          <td className={CELLULE + " text-ds-texte-fort"}>{taille(b.octets)}</td>
                          <td className={CELLULE + " whitespace-nowrap text-ds-texte-sourdine"}>
                            {format.dateTime(new Date(b.creeLe), { dateStyle: "medium" })}
                          </td>
                          <td className={CELLULE}>
                            {suspendue(b) ? (
                              <span className={PILULE + " bg-ds-erreur text-ds-erreur"}>
                                {t("boutiques.suspendue")}
                              </span>
                            ) : (
                              <span className={PILULE + " bg-ds-succes-fond text-ds-succes"}>
                                {t("boutiques.activeEtat")}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* --- LES CARTES, sous `xl` --- */}
                <ul className="flex flex-col gap-2.5 xl:hidden">
                  {page.lignes.map((b) => (
                    <li
                      key={b.id}
                      className="min-w-0 rounded-ds-card border border-ds-filet bg-ds-surface-carte p-[18px]"
                    >
                      <div className="mb-4 flex items-center gap-3">
                        <span
                          aria-hidden="true"
                          className={
                            "flex h-11 w-11 shrink-0 items-center justify-center rounded-ds-control " +
                            (b.nom === null ? "bg-ds-surface-creux" : "")
                          }
                          {...(b.nom === null ? {} : { style: { backgroundColor: b.accent } })}
                        >
                          {b.nom === null ? (
                            <Icone nom="storefront" className="text-[18px] text-ds-texte-tenu" />
                          ) : null}
                        </span>
                        <div className="min-w-0 flex-grow">
                          {b.nom === null ? (
                            <p className="truncate text-[15px] leading-[19px] font-semibold italic text-ds-texte-sourdine">
                              {t("boutiques.nonConfiguree")}
                            </p>
                          ) : (
                            <p className="truncate text-[15px] leading-[19px] font-bold text-ds-texte-fort">
                              {b.nom}
                            </p>
                          )}
                          <p className="mt-px truncate text-[12px] leading-[15px] text-ds-texte-sourdine">
                            {b.email}
                          </p>
                        </div>
                      </div>

                      <div className="mb-3.5 flex flex-wrap gap-1.5">
                        <span className={PILULE_NEUTRE}>
                          {b.typeDeCompte === null
                            ? t("comptes.typeNonDeclare")
                            : t(`comptes.type.${b.typeDeCompte}`)}
                        </span>
                        {/* UNE SEULE PILULE D'ÉTAT, ET C'EST LA PLUS GRAVE QUI
                            GAGNE. Une boutique suspendue qui dépasse aussi son
                            plafond n'a pas besoin qu'on le lui dise : elle ne
                            prend plus rien en charge. */}
                        {suspendue(b) ? (
                          <span className={PILULE + " bg-ds-erreur text-ds-erreur"}>
                            {t("boutiques.suspendue")}
                          </span>
                        ) : auDessus(b) ? (
                          <span className={PILULE + " bg-ds-erreur text-ds-erreur"}>
                            {t("boutiques.plafondDepasse")}
                          </span>
                        ) : (
                          <span className={PILULE + " bg-ds-succes-fond text-ds-succes"}>
                            {t("boutiques.activeEtat")}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-4 gap-2 border-t border-ds-filet pt-3.5">
                        {(
                          [
                            { cle: "commandes", valeur: format.number(b.commandes), alerte: false },
                            { cle: "colis", valeur: format.number(b.colisCeMois), alerte: auDessus(b) },
                            { cle: "medias", valeur: format.number(b.medias), alerte: false },
                            { cle: "stockage", valeur: taille(b.octets), alerte: false },
                          ] as const
                        ).map((c) => (
                          <div key={c.cle} className="min-w-0">
                            <p className="mb-0.5 text-[11.5px] leading-[14px] text-ds-texte-sourdine">
                              {t(`boutiques.colonnes.${c.cle}`)}
                            </p>
                            <p
                              className={
                                "truncate text-[15px] leading-[19px] font-bold " +
                                (c.alerte ? "text-ds-erreur" : "text-ds-texte-fort")
                              }
                            >
                              {c.valeur}
                            </p>
                          </div>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {lienSuivant === null ? null : (
              <LienEcran
                href={lienSuivant}
                className="mx-auto mt-4 inline-flex min-h-11 items-center rounded-ds-control border border-ds-filet-appuye bg-ds-surface-carte px-6 text-[14px] leading-[18px] font-semibold text-ds-texte-fort"
              >
                {t("boutiques.pageSuivante")}
              </LienEcran>
            )}
          </section>

          <section className={PANNEAU}>
            <header className="mb-[18px]">
              <h2 className={PANNEAU_TITRE}>{t("boutiques.repartition")}</h2>
            </header>
            <Anneau
              variante="liste"
              total={compteurs.boutiques}
              unite={t("boutiques.unite")}
              part={(pourcent) => t("boutiques.part", { part: pourcent })}
              parts={[
                {
                  cle: "configurees",
                  // LES LIBELLES DE LEGENDE SONT COURTS : la colonne du kit
                  // TRONQUE a 150 px, et « Boutiques configurees » y rendait
                  // « Boutiques c... ». Le panneau dit deja de quoi il parle.
                  libelle: t("boutiques.legendeConfigurees"),
                  valeur: compteurs.boutiquesNommees,
                  trait: "var(--color-ds-succes)",
                },
                {
                  cle: "sans",
                  libelle: t("boutiques.legendeSansNom"),
                  valeur: nonConfigurees,
                  trait: "var(--color-ds-filet-appuye)",
                },
              ]}
            />
          </section>
        </div>
      </div>
    </main>
  );
}
