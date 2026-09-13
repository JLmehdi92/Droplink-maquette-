import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import Link from "next/link";
import { CalendarPlus, Check, Clock, PackageCheck, ShoppingCart, Truck } from "lucide-react";
import { EnTeteAdmin } from "@/components/admin/en-tete-admin";
import { EncartTrace } from "@/components/admin/encart-trace";
import { RechercheAdmin } from "@/components/admin/recherche-admin";
import { SelecteurAdmin } from "@/components/admin/selecteur-admin";
import { TuileVolume } from "@/components/admin/tuile-volume";
import { AnneauStatuts } from "@/components/admin/anneau-statuts";
import { Icone } from "@/components/icone";
import { LienEcran } from "@/components/lien-ecran";
import { exigerAdmin } from "@/lib/audit/garde";
import { empreinteAdmin } from "@/lib/audit/empreinte-admin";
import {
  FENETRES,
  listerCommandesAdmin,
  ParametresCommandes,
  STATUTS_FILTRABLES,
  type LigneCommandeAdmin,
} from "@/lib/audit/commandes";
import { lireCompteurs, lireRepartition } from "@/lib/audit/panneau";
import { lireTransporteur, monogramme } from "@/lib/tracking/transporteurs";
import { creerClientServeur } from "@/lib/supabase/server";
import { estLangueSupportee } from "@/i18n/config";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // LA GARDE COURT AUSSI ICI : Next évalue les métadonnées EN PARALLÈLE du
  // rendu, et le titre partirait sinon dans le corps du 404 servi à qui n'a pas
  // les droits.
  await exigerAdmin();
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("commandes.titre"), robots: { index: false, follow: false } };
}

/*
 * LES GÉOMÉTRIES DES ÉCRANS DE LISTE DU KIT ADMIN — celles de `boutiques` et
 * `comptes`, relevées sur la page servie.
 */
const PILULE =
  "inline-flex items-center gap-1.5 rounded-ds-pill px-[9px] py-[3px] text-[11.5px] leading-[normal] font-bold tracking-[-0.02em] whitespace-nowrap xl:px-[11px] xl:py-1.5";
const EN_TETE_COLONNE =
  "pb-3 pr-3 text-left text-[12.5px] leading-[normal] font-semibold whitespace-nowrap text-ds-texte-sourdine last:pr-0 last:text-right";
/* SANS TAILLE NI GRAISSE : chaque colonne pose les siennes. Une taille commune
   surchargée par une autre dans la même liste de classes se résout dans l'ordre
   de la feuille, pas dans celui de l'attribut — la référence sortait en 400 et
   les dates en 14, mesuré. */
const CELLULE = "border-t border-ds-filet py-3 pr-3 leading-[18px] last:pr-0";
const PANNEAU =
  "flex min-w-0 flex-col rounded-ds-card-lg border border-ds-filet bg-ds-surface-carte p-4 shadow-ds-card md:p-[22px]";
const PANNEAU_TITRE = "text-[18px] leading-[19.8px] font-bold tracking-[-0.025em] text-ds-texte-titre";
const PANNEAU_AIDE = "mt-[3px] text-[13px] leading-[1.55] text-ds-texte-corps";

/*
 * LES CLÉS DE LIBELLÉ SONT ÉCRITES EN TOUTES LETTRES, jamais composées
 * (`commandes.statuts.${statut}`) : l'inventaire des chaînes mortes lit les
 * appels du code, et une clé fabriquée à l'exécution lui est invisible — il
 * déclarait mortes les six chaînes que cet écran affiche.
 */
const LIBELLE_STATUT = {
  "": "commandes.statuts.tous",
  preparation: "commandes.statuts.preparation",
  expedie: "commandes.statuts.expedie",
  en_transit: "commandes.statuts.en_transit",
  livre: "commandes.statuts.livre",
} as const;

const LIBELLE_FENETRE = {
  "": "commandes.fenetres.toutes",
  "7": "commandes.fenetres.7",
  "30": "commandes.fenetres.30",
} as const;

/**
 * LA TEINTE DE CHAQUE STATUT — celle de l'anneau, pour qu'une pilule et sa part
 * d'anneau se reconnaissent d'un coup d'œil.
 */
const TEINTE_STATUT: Record<LigneCommandeAdmin["statut"], string> = {
  preparation: "bg-ds-alerte-fond text-ds-alerte",
  expedie: "bg-ds-surface-teinte text-ds-accent-encre",
  en_transit: "bg-ds-info-fond text-ds-info",
  livre: "bg-ds-succes-fond text-ds-succes",
};

/**
 * LES COMMANDES DE LA PLATEFORME — décision de Wassim du 14/09/2026.
 *
 * ⚠️ UNE SUPERVISION, PAS UNE CONSULTATION DE CONTENU. Le kit dessine une
 * colonne « Client » (pseudo et adresse) et un tiroir qui ouvre la page du
 * client. Ni l'un ni l'autre : le pseudo et l'adresse appartiennent à quelqu'un
 * qui n'a jamais eu de compte chez nous, et le lien de la page transfère la
 * capacité de l'ouvrir. La colonne porte donc le COMPTE du vendeur, et « Voir »
 * mène à sa fiche — elle-même auditée.
 *
 * ⚠️ AUCUNE CASE À COCHER, AUCUN EXPORT, AUCUN « NOUVELLE COMMANDE ». Un
 * administrateur ne crée pas de commande pour un vendeur (contrainte 3 : chacun
 * est propriétaire des siennes), et une sélection n'aurait aucune action à
 * porter ; un export de toute la plateforme serait le fichier le plus précieux
 * que ce produit puisse laisser sortir.
 *
 * PAGINATION PAR CURSEUR, filtres dans l'URL : la vue se partage, se recharge,
 * et ses critères entrent dans la trace.
 */
export default async function AdminCommandes({
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

  // UN FILTRE INCONNU RETOMBE SUR « AUCUN FILTRE », et l'écran le DIT : le
  // sélecteur affiche « Tous les statuts ». La base, elle, le refuse.
  const parametres = ParametresCommandes.parse({
    q: seul("q"),
    statut: seul("statut"),
    jours: seul("jours"),
    curseur: seul("curseur") ?? null,
  });

  const supabase = await creerClientServeur();
  const [page, compteurs, repartition] = await Promise.all([
    listerCommandesAdmin(supabase, parametres, await empreinteAdmin()),
    lireCompteurs(supabase),
    lireRepartition(supabase),
  ]);

  const t = await getTranslations("admin");
  const format = await getFormatter();
  const base = `/${langue}/admin/commandes`;

  /** L'URL d'une vue : les critères donnés, et JAMAIS le curseur — il encode
   *  une position dans un classement que changer de filtre change. */
  const lien = (criteres: { q?: string; statut?: string; jours?: string }): string => {
    const p = new URLSearchParams();
    const q = criteres.q ?? parametres.q;
    const statut = criteres.statut ?? parametres.statut;
    const jours = criteres.jours ?? parametres.jours;
    if (q !== "") p.set("q", q);
    if (statut !== "") p.set("statut", statut);
    if (jours !== "") p.set("jours", jours);
    const suffixe = p.toString();
    return suffixe === "" ? base : `${base}?${suffixe}`;
  };

  const lienSuivant =
    page.curseurSuivant === null
      ? null
      : `${lien({})}${lien({}).includes("?") ? "&" : "?"}curseur=${encodeURIComponent(page.curseurSuivant)}`;

  const total = repartition?.total ?? null;
  const part = (n: number): string =>
    t("commandes.partDuTotal", {
      part: total === null || total === 0 ? 0 : Math.round((n / total) * 100),
    });
  /** UN TIRET, JAMAIS UN ZÉRO : zéro affirmerait qu'on a compté. La phrase qui
   *  nomme l'indisponibilité est au-dessus des tuiles. */
  const nombre = (n: number | undefined): string => (n === undefined ? "—" : format.number(n));

  const filtre = parametres.statut !== "" || parametres.jours !== "" || parametres.q !== "";

  /** Le transporteur nommé par le catalogue, ou rien : un code inconnu est omis. */
  const transporteur = (code: number | null) => {
    const c = lireTransporteur(code);
    return c === null ? null : { nom: c.nom, monogramme: monogramme(c.nom) };
  };

  const pastilleBoutique = (l: LigneCommandeAdmin, taille: string) => (
    <span
      aria-hidden="true"
      className={
        "flex shrink-0 items-center justify-center rounded-ds-pill " +
        taille +
        (l.boutiqueNom === null ? " bg-ds-surface-creux" : "")
      }
      {...(l.boutiqueNom === null ? {} : { style: { backgroundColor: l.accent } })}
    >
      {l.boutiqueNom === null ? (
        <Icone nom="storefront" className="text-[14px] text-ds-texte-tenu" />
      ) : null}
    </span>
  );

  const nomBoutique = (l: LigneCommandeAdmin, classes: string) =>
    l.boutiqueNom === null ? (
      <span className={classes + " italic text-ds-texte-sourdine"}>{t("commandes.nonConfiguree")}</span>
    ) : (
      <span className={classes + " text-ds-texte-corps"}>{l.boutiqueNom}</span>
    );

  const pilule = (l: LigneCommandeAdmin) => (
    <span className={PILULE + " " + TEINTE_STATUT[l.statut]}>{t(LIBELLE_STATUT[l.statut])}</span>
  );

  const date = (l: LigneCommandeAdmin): string =>
    format.dateTime(new Date(l.creeLe), { dateStyle: "short", timeStyle: "short" });

  return (
    <main id="contenu" className="md:px-8 md:pt-0 md:pb-8">
      <EnTeteAdmin
        titre={t("commandes.titre")}
        sousTitre={t("commandes.sousTitreListe")}
        sousTitreAuBureauSeulement
      />

      <div className="flex flex-col gap-2.5 px-4 py-3.5 md:mt-5 md:gap-[18px] md:px-0 md:py-0">
        <EncartTrace texte={t("commandes.trace")} />

        {repartition === null ? (
          <p className="text-ds-texte-corps">{t("panneau.compteursIndisponibles")}</p>
        ) : null}

        {/* --- LES VOLUMES ---

            SIX TUILES, COMME LE KIT, ET AUCUNE N'EST INVENTÉE. Ses « Problèmes »
            et « Annulées » n'existent pas — la décision 4 arrête la frise à
            quatre étapes — : leurs places portent « Expédiées », la quatrième
            étape que le kit ne compte pas, et les commandes créées ce mois-ci,
            le compteur que la vue d'ensemble affiche déjà. Aucun badge
            « +12 % » : aucun compteur ne porte son historique. */}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-6 xl:gap-3.5">
          <TuileVolume
            icone={ShoppingCart}
            compacte
            libelle={t("commandes.tuileTotal")}
            valeur={nombre(repartition?.total)}
            valeurEnSourdine={repartition === null}
            complement={t("commandes.tuileTotalAide")}
          />
          <TuileVolume
            icone={Truck}
            compacte
            teinte="info"
            libelle={t("commandes.tuileEnTransit")}
            valeur={nombre(repartition?.enTransit)}
            valeurEnSourdine={repartition === null}
            complement={repartition === null ? null : part(repartition.enTransit)}
          />
          <TuileVolume
            icone={Check}
            compacte
            teinte="succes"
            libelle={t("commandes.tuileLivrees")}
            valeur={nombre(repartition?.livre)}
            valeurEnSourdine={repartition === null}
            complement={repartition === null ? null : part(repartition.livre)}
          />
          <TuileVolume
            icone={Clock}
            compacte
            teinte="alerte"
            libelle={t("commandes.tuilePreparation")}
            valeur={nombre(repartition?.preparation)}
            valeurEnSourdine={repartition === null}
            complement={repartition === null ? null : part(repartition.preparation)}
          />
          <TuileVolume
            icone={PackageCheck}
            compacte
            libelle={t("commandes.tuileExpediees")}
            valeur={nombre(repartition?.expedie)}
            valeurEnSourdine={repartition === null}
            complement={repartition === null ? null : part(repartition.expedie)}
          />
          <TuileVolume
            icone={CalendarPlus}
            compacte
            teinte="info"
            libelle={t("commandes.tuileCeMois")}
            valeur={format.number(compteurs.commandesCreeesCeMois)}
            complement={t("commandes.tuileCeMoisAide")}
          />
        </div>

        {/* --- LA BARRE DE FILTRES ---

            Recherche, statut, date et réinitialisation, comme le kit. Ses
            « transporteurs » et « boutiques » n'y sont pas : une liste de toutes
            les boutiques ne tient pas dans un menu à trois mille entrées — la
            recherche les trouve par leur nom —, et les codes de transporteur ne
            forment pas un inventaire fermé qu'un menu puisse énumérer. */}
        <div className="flex flex-wrap items-center gap-3 rounded-ds-card-lg border border-ds-filet bg-ds-surface-carte p-3.5 shadow-ds-card">
          <div className="min-w-[240px] flex-1 md:max-w-[320px]">
            <RechercheAdmin
              action={base}
              valeur={parametres.q}
              etiquette={t("commandes.recherche")}
              exemple={t("commandes.recherchePlaceholder")}
              chercher={t("commandes.chercher")}
            />
          </div>
          <SelecteurAdmin
            etiquette={t("commandes.filtreStatut")}
            courant={parametres.statut}
            options={(["", ...STATUTS_FILTRABLES] as const).map((statut) => ({
              valeur: statut,
              libelle: t(LIBELLE_STATUT[statut]),
              href: lien({ statut }),
            }))}
          />
          <SelecteurAdmin
            etiquette={t("commandes.filtreJours")}
            courant={parametres.jours}
            options={(["", ...FENETRES] as const).map((jours) => ({
              valeur: jours,
              libelle: t(LIBELLE_FENETRE[jours]),
              href: lien({ jours }),
            }))}
          />
          <Link
            href={base}
            className="flex h-[42px] min-h-11 shrink-0 items-center rounded-ds-sm border border-ds-filet bg-ds-surface-carte px-[18px] text-[13.5px] leading-[normal] font-semibold text-ds-accent-encre transition-colors hover:bg-ds-surface-creux md:ml-auto"
          >
            {t("commandes.reinitialiser")}
          </Link>
        </div>

        {/* --- LA LISTE, ET L'ANNEAU DE STATUT À SA DROITE ---

            ⚠️ LE PANNEAU « ACTIVITÉ RÉCENTE » DU KIT N'EST PAS PORTÉ : il nomme
            des commandes et des vendeurs tiers qu'on n'a pas demandé à voir, à
            chaque ouverture — la même raison que sur les boutiques. */}
        <div className="grid gap-2.5 md:gap-[18px] xl:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)] xl:items-start">
          <section className={PANNEAU + " xl:px-0 xl:pb-0"}>
            <header className="mb-[18px] xl:px-[22px]">
              <h2 className={PANNEAU_TITRE}>{t("commandes.liste")}</h2>
              {total === null ? null : (
                <p className={PANNEAU_AIDE}>{t("commandes.listeTotal", { total })}</p>
              )}
            </header>

            {page.lignes.length === 0 ? (
              /* DEUX ÉTATS VIDES DISTINCTS : annoncer « aucune commande » à qui
                 vient de filtrer une plateforme pleine est une perte de
                 confiance immédiate. */
              <p className="py-6 text-center text-ds-texte-corps">
                {filtre ? t("commandes.videFiltre") : t("commandes.videTout")}
              </p>
            ) : (
              <>
                {/* --- LE TABLEAU, au bureau --- */}
                <div className="hidden xl:block">
                  <table className="w-full table-fixed border-collapse">
                    <colgroup>
                      <col className="w-[92px]" />
                      <col />
                      <col />
                      <col className="w-[118px]" />
                      <col />
                      <col className="w-[128px]" />
                      <col className="w-[74px]" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th scope="col" className={EN_TETE_COLONNE + " pl-[18px]"}>
                          {t("commandes.colonnes.reference")}
                        </th>
                        <th scope="col" className={EN_TETE_COLONNE}>
                          {t("commandes.colonnes.compte")}
                        </th>
                        <th scope="col" className={EN_TETE_COLONNE}>
                          {t("commandes.colonnes.boutique")}
                        </th>
                        <th scope="col" className={EN_TETE_COLONNE}>
                          {t("commandes.colonnes.statut")}
                        </th>
                        <th scope="col" className={EN_TETE_COLONNE}>
                          {t("commandes.colonnes.transporteur")}
                        </th>
                        <th scope="col" className={EN_TETE_COLONNE}>
                          {t("commandes.colonnes.date")}
                        </th>
                        <th scope="col" className={EN_TETE_COLONNE + " pr-[18px] last:pr-[18px]"}>
                          {t("commandes.colonnes.actions")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {page.lignes.map((l) => {
                        const c = transporteur(l.transporteur);
                        return (
                          <tr key={l.id}>
                            <td className={CELLULE + " pl-[18px] text-[14px] font-bold whitespace-nowrap text-ds-texte-fort"}>
                              {l.reference}
                            </td>
                            <td className={CELLULE}>
                              <span className="block truncate text-[14px] text-ds-texte-corps">
                                {l.proprietaireEmail}
                              </span>
                            </td>
                            <td className={CELLULE}>
                              <span className="flex min-w-0 items-center gap-2.5">
                                {pastilleBoutique(l, "h-7 w-7")}
                                {nomBoutique(l, "truncate text-[14px]")}
                              </span>
                            </td>
                            <td className={CELLULE}>{pilule(l)}</td>
                            <td className={CELLULE}>
                              {c === null ? null : (
                                <span className="flex min-w-0 items-center gap-2.5">
                                  <span
                                    className={
                                      "inline-flex h-7 w-7 flex-none items-center justify-center rounded-ds-sm text-[10.5px] font-extrabold tracking-[-0.02em] " +
                                      (c.monogramme.fond === null
                                        ? "bg-ds-surface-creux text-ds-texte-corps"
                                        : "")
                                    }
                                    style={
                                      c.monogramme.fond === null
                                        ? undefined
                                        : {
                                            background: c.monogramme.fond,
                                            color: c.monogramme.encre ?? undefined,
                                          }
                                    }
                                  >
                                    {c.monogramme.court}
                                  </span>
                                  <span className="truncate text-[13.5px] text-ds-texte-corps">{c.nom}</span>
                                </span>
                              )}
                            </td>
                            <td className={CELLULE}>
                              <span className="text-[13.5px] leading-[normal] whitespace-nowrap text-ds-texte-sourdine">
                                {date(l)}
                              </span>
                            </td>
                            <td className={CELLULE + " pr-[18px] text-right last:pr-[18px]"}>
                              <Link
                                href={`/${langue}/admin/comptes/${l.proprietaireId}`}
                                aria-label={t("commandes.voirLong", { email: l.proprietaireEmail })}
                                className="inline-flex h-[34px] items-center rounded-ds-sm border border-ds-filet bg-ds-surface-carte px-4 text-[13px] leading-4 font-semibold text-ds-texte-fort transition-colors hover:bg-ds-surface-creux"
                              >
                                {t("commandes.voir")}
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* --- LES CARTES, sous `xl` --- */}
                <ul className="flex flex-col gap-2.5 xl:hidden">
                  {page.lignes.map((l) => {
                    const c = transporteur(l.transporteur);
                    return (
                      <li
                        key={l.id}
                        className="min-w-0 rounded-ds-card border border-ds-filet bg-ds-surface-carte p-4"
                      >
                        <div className="mb-3 flex items-center justify-between gap-2.5">
                          <span className="text-[15px] leading-[19px] font-bold text-ds-texte-fort">
                            {l.reference}
                          </span>
                          {pilule(l)}
                        </div>
                        <div className="mb-3 flex min-w-0 items-center gap-2.5">
                          {pastilleBoutique(l, "h-8 w-8")}
                          <div className="min-w-0">
                            {nomBoutique(l, "block truncate text-[14px] leading-[18px] font-semibold")}
                            <span className="block truncate text-[12px] leading-[15px] text-ds-texte-sourdine">
                              {l.proprietaireEmail}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2.5 border-t border-ds-filet pt-3">
                          <span className="min-w-0 truncate text-[12.5px] text-ds-texte-sourdine">
                            {c === null ? date(l) : `${c.nom} · ${date(l)}`}
                          </span>
                          <Link
                            href={`/${langue}/admin/comptes/${l.proprietaireId}`}
                            aria-label={t("commandes.voirLong", { email: l.proprietaireEmail })}
                            className="inline-flex min-h-11 shrink-0 items-center rounded-ds-sm border border-ds-filet bg-ds-surface-carte px-4 text-[13px] font-semibold text-ds-texte-fort"
                          >
                            {t("commandes.voir")}
                          </Link>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            {lienSuivant === null ? null : (
              <LienEcran
                href={lienSuivant}
                className="mx-auto my-4 inline-flex min-h-11 items-center rounded-ds-control border border-ds-filet-appuye bg-ds-surface-carte px-6 text-[14px] leading-[18px] font-semibold text-ds-texte-fort"
              >
                {t("commandes.pageSuivante")}
              </LienEcran>
            )}
          </section>

          <section className={PANNEAU}>
            <header className="mb-[18px]">
              <h2 className={PANNEAU_TITRE}>{t("commandes.repartition")}</h2>
            </header>
            {repartition === null ? (
              <p className="text-[14px] text-ds-texte-corps">{t("panneau.statutsIndisponible")}</p>
            ) : (
              <AnneauStatuts repartition={repartition} variante="commandes" />
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
