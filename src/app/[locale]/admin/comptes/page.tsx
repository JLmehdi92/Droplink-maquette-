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
import { lireCompteurs, lireInscriptionsRecentes, lireSeuils } from "@/lib/audit/panneau";
import { Anneau } from "@/components/admin/anneau";
import { SelecteurAdmin } from "@/components/admin/selecteur-admin";
import { TuileVolume } from "@/components/admin/tuile-volume";
import { UserCheck, UserPlus, UserX, Users } from "lucide-react";
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

/*
 * GÉOMÉTRIES RELEVÉES SUR LE KIT SERVI — `AdminUsers`.
 *
 * En-tête de colonne : 12,5/600 en sourdine, 12 px de retrait sous la ligne, SANS
 * majuscules ni interlettrage. Les majuscules étaient une habitude de l'ancien
 * canevas ; le kit écrit ses entêtes en casse normale, et c'est ce qui les
 * distingue d'un eyebrow de section.
 *
 * Pilule d'état : 11,5/700 à l'interlettrage -0,02em, remplissage 6/11,
 * hauteur 26.
 */
const EN_TETE_COLONNE =
  "pb-3 text-left text-[12.5px] leading-[normal] font-semibold text-ds-texte-sourdine";
const CELLULE = "border-t border-ds-filet py-3.5 text-[14px] leading-[18px] font-normal";
const PILULE =
  "inline-flex items-center gap-[5px] rounded-ds-pill px-[9px] py-[3px] text-[11.5px] leading-[normal] font-bold tracking-[-0.02em] " +
  "xl:gap-1.5 xl:px-[11px] xl:py-1.5";
const PILULE_NEUTRE = PILULE + " bg-ds-surface-creux text-ds-texte-corps";

/* Le panneau du kit admin — les mêmes valeurs que sur la vue d'ensemble. */
const PANNEAU =
  "flex min-w-0 flex-col rounded-ds-card-lg border border-ds-filet bg-ds-surface-carte p-4 shadow-ds-card md:p-[22px]";
const PANNEAU_TITRE = "text-[18px] leading-[19.8px] font-bold tracking-[-0.025em] text-ds-texte-titre";
const PANNEAU_AIDE = "mt-[3px] text-[13px] leading-[1.55] text-ds-texte-corps";

/** La fenêtre de la tuile « nouveaux inscrits », celle de la courbe du panneau. */
const JOURS_INSCRIPTIONS = 30;

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
    statut: Array.isArray(brut["statut"]) ? brut["statut"][0] : brut["statut"],
  });

  const supabase = await creerClientServeur();
  const maintenant = new Date();
  const [page, seuils, compteurs, nouveaux] = await Promise.all([
    listerComptes(supabase, parametres, await empreinteAdmin()),
    lireSeuils(supabase),
    lireCompteurs(supabase),
    lireInscriptionsRecentes(supabase, maintenant, JOURS_INSCRIPTIONS),
  ]);

  const t = await getTranslations("admin");
  const format = await getFormatter();
  const base = `/${langue}/admin/comptes`;

  /** La part d'une population dans le total, arrondie — jamais un total nul divisé. */
  const part = (n: number): number =>
    compteurs.comptes === 0 ? 0 : Math.round((n / compteurs.comptes) * 100);

  /*
   * LE LIEN D'UN FILTRE REPART DE LA PREMIÈRE PAGE, ET C'EST OBLIGATOIRE.
   * Garder le curseur en changeant de filtre le ferait désigner une position
   * dans une liste qui n'existe plus : on ouvrirait la page 3 d'un ensemble
   * qu'on vient de réduire à deux lignes, et l'écran paraîtrait vide.
   */
  const lienFiltre = (statut: string): string => {
    const p = new URLSearchParams();
    if (parametres.q !== "") p.set("q", parametres.q);
    if (statut !== "tous") p.set("statut", statut);
    const q = p.toString();
    return q === "" ? base : `${base}?${q}`;
  };

  const suspendu = (l: LigneCompte): boolean => l.statut === "suspended";
  const auDessus = (l: LigneCompte): boolean => l.colisCeMois > seuils.colis;

  const lienSuivant =
    page.curseurSuivant === null
      ? null
      : `${base}?${new URLSearchParams({
          ...(parametres.q === "" ? {} : { q: parametres.q }),
          // LE FILTRE VOYAGE AVEC LE CURSEUR. Sans lui, la page 2 rendrait un
          // autre ensemble que la page 1 et le curseur désignerait une position
          // dans une liste qui n'est plus la même.
          ...(parametres.statut === "tous" ? {} : { statut: parametres.statut }),
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
        (suspendu(l) ? "bg-ds-erreur-fond text-ds-erreur-encre" : "bg-ds-succes-fond text-ds-succes-encre")
      }
    >
      {/* ⚠️ LA PASTILLE DE COULEUR A DISPARU, ET LE KIT N'EN A JAMAIS POSÉ.
          Elle doublait le mot qui suit — « Actif » dit déjà ce qu'elle disait —
          et elle élargissait la pilule de douze pixels, mesurés contre la
          référence. Ce qui reste de son intention est intact : la pilule se lit
          sans lire, par sa couleur de fond. */}
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
        // LE DÉCOMPTE A QUITTÉ LE SOUS-TITRE POUR LES TUILES, qui le disent
        // mieux : quatre chiffres nommés valent une phrase qui en porte deux.
        // Ce qui reste ici est ce que le kit écrit — à quoi sert l'écran.
        sousTitre={t("comptes.sousTitreListe")}
        // L'encart violet répète l'avertissement trois centimètres plus bas. Au
        // téléphone, le redire dans le noir pousse le champ de recherche hors de
        // l'écran d'ouverture, qui est exactement ce qu'on vient y faire.
        sousTitreAuBureauSeulement
      />

      <div className="flex flex-col gap-2.5 px-4 py-3.5 md:mt-5 md:gap-[18px] md:px-0 md:py-0">
        <EncartTrace texte={t("comptes.trace")} />

        {/* --- LES VOLUMES, en quatre tuiles ---

            Le kit en pose SIX : deux d'entre elles comptent les plans Pro et
            Gratuit, et aucune colonne de plan n'existe — la contrainte n°1
            interdit d'en créer une. Les plans peuvent être AFFICHÉS sur la
            tarification ; ils ne sont jamais APPLIQUÉS, donc il n'y a rien à
            compter. Les quatre autres sont exactement les nôtres. */}
        <div className="flex flex-col gap-2.5 xl:grid xl:grid-cols-4 xl:gap-[18px]">
          <TuileVolume
            icone={Users}
            compacte
            libelle={t("comptes.tuileTotal")}
            valeur={format.number(compteurs.comptes)}
            /* LE CHIFFRE QUI INFORME SOUS UN TOTAL : combien d'inscrits n'ont
               jamais fini leur onboarding. `account_type` est nullable SANS
               DÉFAUT pour que ce manque soit visible — un défaut aurait classé
               tous les fournisseurs comme revendeurs et faussé la segmentation
               d'usage, qui est le livrable réel de la phase de validation. Les
               suspendus, eux, ont leur propre tuile. */
            complement={t("comptes.tuileTotalAide", {
              sansType: format.number(compteurs.comptesSansType),
            })}
          />
          {/* « vs période précédente » du kit est remplacé par la FENÊTRE. Aucun
              compteur du produit ne porte son historique ; un écart calculé sur
              rien aurait la FORME d'une mesure. Dire sur quels jours on compte
              est la seule chose vraie qu'on puisse écrire là. */}
          <TuileVolume
            icone={UserPlus}
            compacte
            teinte="info"
            libelle={t("comptes.tuileNouveaux")}
            valeurEnSourdine={nouveaux === null}
            valeur={
              nouveaux === null
                ? t("panneau.stockageIndisponible")
                : format.number(nouveaux)
            }
            complement={t("comptes.surJours", { jours: JOURS_INSCRIPTIONS })}
          />
          <TuileVolume
            icone={UserCheck}
            compacte
            teinte="succes"
            libelle={t("comptes.tuileActifs")}
            valeur={format.number(compteurs.comptesActifs)}
            complement={t("comptes.partDuTotal", { part: part(compteurs.comptesActifs) })}
          />
          <TuileVolume
            icone={UserX}
            compacte
            teinte="alerte"
            libelle={t("comptes.tuileSuspendus")}
            valeur={format.number(compteurs.comptesSuspendus)}
            complement={t("comptes.partDuTotal", { part: part(compteurs.comptesSuspendus) })}
          />
        </div>

        {/* --- LA BARRE DE FILTRES ---

            ⚠️ UN SEUL DES QUATRE FILTRES DU KIT EST PORTÉ, ET C'EST CELUI QUE LA
            BASE SAIT APPLIQUER. Les plans n'existent pas ; la « boutique » n'est
            pas une dimension distincte du compte, un compte en ayant exactement
            une ; et une plage de dates ne se combine pas avec une pagination PAR
            CURSEUR sans changer le contrat de la fonction. Le statut, lui, vit
            dans `profiles` depuis la première migration — et c'est le filtre pour
            lequel on ouvre cet écran.

            LE CRITÈRE ENTRE DANS LA TRACE : la fonction en base l'écrit dans la
            charge utile de l'entrée d'audit, sans quoi le journal ne pourrait
            pas dire ce qui a réellement été consulté. */}
        <div className="flex flex-wrap items-center gap-3 rounded-ds-card-lg border border-ds-filet bg-ds-surface-carte p-3.5 shadow-ds-card">
          <div className="min-w-[240px] flex-1 md:max-w-[320px]">
            <RechercheAdmin
              action={base}
              valeur={parametres.q}
              etiquette={t("comptes.recherche")}
              exemple={t("comptes.recherchePlaceholder")}
              chercher={t("comptes.chercher")}
            />
          </div>
          <SelecteurAdmin
            etiquette={t("comptes.filtreStatut")}
            courant={parametres.statut}
            options={[
              { valeur: "tous", libelle: t("comptes.statutTous"), href: lienFiltre("tous") },
              {
                valeur: "active",
                libelle: t("comptes.statuts.active"),
                href: lienFiltre("active"),
              },
              {
                valeur: "suspended",
                libelle: t("comptes.statuts.suspended"),
                href: lienFiltre("suspended"),
              },
            ]}
          />
          <Link
            href={base}
            className="flex h-[42px] min-h-11 shrink-0 items-center rounded-ds-sm border border-ds-filet bg-ds-surface-carte px-[18px] text-[13.5px] leading-[normal] font-semibold text-ds-accent-encre transition-colors hover:bg-ds-surface-creux md:ml-auto"
          >
            {t("comptes.reinitialiser")}
          </Link>
        </div>

        {/* --- LA LISTE, ET L'ANNEAU DE STATUT À SA DROITE ---

            Deux panneaux, comme la planche. Celui de droite ne rend QUE DES
            NOMBRES : compter n'est pas consulter, donc il n'ajoute aucune entrée
            au journal là où la liste, elle, en écrit une par consultation.

            ⚠️ LE KIT EN POSE TROIS : un anneau « Répartition par plan », que rien
            ne peut remplir, et un flux « Activité récente » qui nomme des
            vendeurs tiers à chaque ouverture — donc une entrée d'audit par
            chargement d'écran, qui noierait les consultations délibérées que le
            journal existe pour retrouver. */}
        <div className="grid gap-2.5 md:gap-[18px] xl:grid-cols-[minmax(0,1fr)_minmax(0,424px)] xl:items-start">
          <section className={PANNEAU}>
            <header className="mb-[18px]">
              <h2 className={PANNEAU_TITRE}>{t("comptes.liste")}</h2>
              <p className={PANNEAU_AIDE}>
                {t("comptes.listeTotal", { total: compteurs.comptes })}
              </p>
            </header>
        {page.lignes.length === 0 ? (
          <p className="rounded-ds-card border border-ds-filet bg-ds-surface-carte p-6 text-center text-ds-texte-corps md:rounded-ds-card-lg">
            {parametres.q === "" && parametres.statut === "tous"
              ? t("comptes.videCompte")
              : parametres.q === ""
                ? t("comptes.videFiltre")
                : t("comptes.videRecherche")}
          </p>
        ) : (
          <>
            {/* --- LE TABLEAU, au bureau ---

                ⚠️ IL BASCULE À `xl`, PAS À `md`. Sept colonnes derrière une
                colonne de navigation de 236 px : à 768 il resterait 472 px, soit
                67 par colonne, et « 1 840 / 1 200 » en réclame 90 à lui seul. Le
                même calcul a déjà fait basculer Envois, Analyses et le Panneau. */}
            <div className="hidden xl:block">
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
                          CELLULE + (auDessus(ligne) ? " font-bold text-ds-erreur-encre" : " text-ds-texte-fort")
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
                      <span className={PILULE + " bg-ds-erreur-fond text-ds-erreur-encre"}>
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
          </section>

          <section className={PANNEAU}>
            <header className="mb-[18px]">
              <h2 className={PANNEAU_TITRE}>{t("comptes.repartition")}</h2>
            </header>
            <Anneau
              variante="liste"
              total={compteurs.comptes}
              unite={t("comptes.unite")}
              part={(pourcent) => t("comptes.part", { part: pourcent })}
              parts={[
                {
                  cle: "actifs",
                  libelle: t("comptes.statuts.active"),
                  valeur: compteurs.comptesActifs,
                  trait: "var(--color-ds-succes)",
                },
                {
                  cle: "suspendus",
                  libelle: t("comptes.statuts.suspended"),
                  valeur: compteurs.comptesSuspendus,
                  trait: "var(--color-ds-erreur)",
                },
              ]}
            />
          </section>
        </div>
      </div>
    </main>
  );
}
