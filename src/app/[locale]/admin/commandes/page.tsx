import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import Link from "next/link";
import { EnTeteAdmin } from "@/components/admin/en-tete-admin";
import { EncartTrace } from "@/components/admin/encart-trace";
import { RechercheAdmin } from "@/components/admin/recherche-admin";
import { FiltresAdmin } from "@/components/admin/filtres-admin";
import { TuileVolume, Tuiles } from "@/components/admin/tuile-volume";
import { AnneauStatuts } from "@/components/admin/anneau-statuts";
import { BlocageLien } from "@/components/admin/blocage-lien";
import { ContestationLien } from "@/components/admin/contestation-lien";
import { TraductionsClient } from "@/components/traductions-client";
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
import { liensBloquesParmi } from "@/lib/audit/blocage-lien";
import { contestationsEnAttenteParmi } from "@/lib/audit/contestation";
import { MOTIF_MIN } from "@/lib/audit/suspension";
import { lireTransporteur } from "@/lib/tracking/transporteurs";
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
  /* LES LIENS BLOQUÉS DE CETTE PAGE (décision de Wassim, 19/09/2026). Si la lecture
     échoue, l écran n affiche NI pastille NI bouton : montrer « bloquer » sur un lien
     peut-être déjà bloqué affirmerait un état que la base n a pas rendu (contrainte 8). */
  // Les deux lectures sont indépendantes : elles partent ensemble (audit du 24/09/2026).
  const identifiants = page.lignes.map((l) => l.id);
  const [blocages, contestations] = await Promise.all([
    liensBloquesParmi(supabase, identifiants),
    contestationsEnAttenteParmi(supabase, identifiants),
  ]);
  const bloque = (l: LigneCommandeAdmin): boolean | null =>
    blocages.statut === "ok" ? blocages.bloques.has(l.id) : null;
  /* LES CONTESTATIONS EN ATTENTE (168), lues comme les blocages : des identifiants seulement,
     sans rien écrire au journal — la lecture tracée part à l'ouverture du dialogue. En échec,
     la ligne garde le geste de déblocage : il reste juste, la contestation se lira plus tard. */
  const conteste = (l: LigneCommandeAdmin): boolean =>
    contestations.statut === "ok" && contestations.ids.has(l.id);

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
  /* LE LIEN BLOQUÉ S'AJOUTE À LA RÉFÉRENCE, il ne remplace pas le statut : c'est
     un état du LIEN, la commande garde le sien. Si la lecture des blocages a
     échoué, ni pastille ni bouton (contrainte 8). */
  const date = (l: LigneCommandeAdmin): string =>
    format.dateTime(new Date(l.creeLe), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  /* UNE CONTESTATION EN ATTENTE REMPLACE LE DÉBLOCAGE DIRECT : débloquer passe
     alors par sa lecture (tracée à l'ouverture) et sa réponse, qui part au vendeur.
     Sa pastille se pose dans la cellule de référence, comme la maquette. */
  const geste = (l: LigneCommandeAdmin) => {
    const etat = bloque(l);
    if (etat === true && conteste(l)) return null;
    return etat === null ? null : <BlocageLien commandeId={l.id} reference={l.reference} bloque={etat} motifMin={MOTIF_MIN} />;
  };

  return (
    <main id="contenu" className="tableau adm">
      <EnTeteAdmin titre={t("commandes.titre")} sousTitre={t("commandes.sousTitreListe")} sousTitreAuBureauSeulement />
      <EncartTrace texte={t("commandes.trace")} />
      {repartition === null ? <p className="adm-aide">{t("panneau.compteursIndisponibles")}</p> : null}

      {/* SIX TUILES ET AUCUNE N'EST INVENTÉE : les quatre étapes de la frise
          (décision 4), le total, et les commandes créées ce mois-ci. */}
      <Tuiles etiquette={t("commandes.titre")} colonnes={6}>
        <TuileVolume libelle={t("commandes.tuileTotal")} valeur={nombre(repartition?.total)} valeurEnSourdine={repartition === null} complement={t("commandes.tuileTotalAide")} />
        <TuileVolume
          libelle={t("commandes.tuilePreparation")}
          valeur={nombre(repartition?.preparation)}
          valeurEnSourdine={repartition === null}
          complement={repartition === null ? undefined : part(repartition.preparation)}
        />
        <TuileVolume
          libelle={t("commandes.tuileExpediees")}
          valeur={nombre(repartition?.expedie)}
          valeurEnSourdine={repartition === null}
          complement={repartition === null ? undefined : part(repartition.expedie)}
        />
        <TuileVolume
          libelle={t("commandes.tuileEnTransit")}
          valeur={nombre(repartition?.enTransit)}
          valeurEnSourdine={repartition === null}
          complement={repartition === null ? undefined : part(repartition.enTransit)}
        />
        <TuileVolume
          libelle={t("commandes.tuileLivrees")}
          valeur={nombre(repartition?.livre)}
          valeurEnSourdine={repartition === null}
          complement={repartition === null ? undefined : part(repartition.livre)}
        />
        <TuileVolume libelle={t("commandes.tuileCeMois")} valeur={format.number(compteurs.commandesCreeesCeMois)} complement={t("commandes.tuileCeMoisAide")} />
      </Tuiles>

      <div className="adm-rangee adm-rangee--pleine">
        <section className="bloc adm-bloc" aria-labelledby="adm-liste">
          <header className="bloc__tete">
            <div>
              <h2 id="adm-liste">{t("commandes.liste")}</h2>
              {total === null ? null : <p className="adm-aide">{t("commandes.listeTotal", { total })}</p>}
            </div>
          </header>
          {/* Statut et fenêtre, appliqués EN BASE, critères tracés. Les
              « transporteurs » et « boutiques » ne forment pas un inventaire fermé
              qu'un filtre puisse énumérer : la recherche les trouve. */}
          <div className="adm-outils">
            <FiltresAdmin
              etiquette={t("commandes.filtreStatut")}
              courant={parametres.statut}
              options={(["", ...STATUTS_FILTRABLES] as const).map((statut) => ({ valeur: statut, libelle: t(LIBELLE_STATUT[statut]), href: lien({ statut }) }))}
            />
            <FiltresAdmin
              etiquette={t("commandes.filtreJours")}
              courant={parametres.jours}
              options={(["", ...FENETRES] as const).map((jours) => ({ valeur: jours, libelle: t(LIBELLE_FENETRE[jours]), href: lien({ jours }) }))}
            />
            <RechercheAdmin
              action={base}
              valeur={parametres.q}
              etiquette={t("commandes.recherche")}
              exemple={t("commandes.recherchePlaceholder")}
              chercher={t("commandes.chercher")}
              garder={{
                ...(parametres.statut === "" ? {} : { statut: parametres.statut }),
                ...(parametres.jours === "" ? {} : { jours: parametres.jours }),
              }}
            />
          </div>

          {page.lignes.length === 0 ? (
            <p className="adm-vide">{filtre ? t("commandes.videFiltre") : t("commandes.videTout")}</p>
          ) : (
            <TraductionsClient espaces={["admin.blocage", "admin.contestation", "admin.dialogue"]}>
              {/* AUCUN CONTENU : ni client, ni référence produit, ni lien. « Voir »
                  mène à la fiche du COMPTE, jamais à la commande. */}
              <div className="adm-defil">
                <table className="adm-table">
                  <thead>
                    <tr>
                      <th scope="col">{t("commandes.colonnes.reference")}</th>
                      <th scope="col">{t("commandes.colonnes.compte")}</th>
                      <th scope="col">{t("commandes.colonnes.boutique")}</th>
                      <th scope="col">{t("commandes.colonnes.statut")}</th>
                      <th scope="col">{t("commandes.colonnes.transporteur")}</th>
                      <th scope="col">{t("commandes.colonnes.date")}</th>
                      <th scope="col">
                        <span className="sr">{t("commandes.colonnes.actions")}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.lignes.map((l) => {
                      const c = lireTransporteur(l.transporteur);
                      return (
                        <tr key={l.id}>
                          <td className="adm-ref">
                            {l.reference}
                            {bloque(l) === true ? (
                              <span className="adm-badge" data-ton="erreur">
                                <i aria-hidden="true" />
                                {t("commandes.lienBloque")}
                              </span>
                            ) : null}
                            {/* LA CONTESTATION EN ATTENTE s'ouvre depuis sa pastille ;
                                sa lecture est tracée au geste, jamais au rendu. */}
                            {bloque(l) === true && conteste(l) ? <ContestationLien commandeId={l.id} reference={l.reference} motifMin={MOTIF_MIN} /> : null}
                          </td>
                          <td className="adm-email">{l.proprietaireEmail}</td>
                          <td>{l.boutiqueNom === null ? <span className="adm-sourdine">{t("commandes.nonConfiguree")}</span> : l.boutiqueNom}</td>
                          <td>
                            <span className="adm-badge" data-cmd={l.statut}>
                              <i aria-hidden="true" />
                              {t(LIBELLE_STATUT[l.statut])}
                            </span>
                          </td>
                          {/* SANS COLIS, « Aucun transporteur » est un fait. Un code
                              présent mais inconnu, lui, ne se remplace par rien : un
                              repli deviné vaudrait moins que rien. */}
                          <td>{l.transporteur === null ? <span className="adm-sourdine">{t("commandes.aucunTransporteur")}</span> : c === null ? null : c.nom}</td>
                          <td className="adm-date">{date(l)}</td>
                          <td>
                            <div className="adm-actions">
                              <Link prefetch={false} className="bouton-outil" href={`/${langue}/admin/comptes/${l.proprietaireId}`} aria-label={t("commandes.voirLong", { email: l.proprietaireEmail })}>
                                {t("commandes.voir")}
                              </Link>
                              {geste(l)}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </TraductionsClient>
          )}

          {/* « X SUR N » COMME LA MAQUETTE, mais N seulement SANS FILTRE : le total est
              celui de la répartition (toute la plateforme). Filtré, le nombre de lignes
              qui correspondent n'est compté par aucune fonction — l'écrire ferait lire
              le total de la plateforme comme celui du filtre (contrainte n° 8). Et
              seulement en PREMIÈRE page : plus loin, « 12 sur 1 248 » se lirait comme
              « on n'en voit que 12 ». */}
          {page.lignes.length === 0 ? null : (
            <footer className="adm-pied">
              <span>
                {!filtre && total !== null && parametres.curseur === null
                  ? t("commandes.surTotal", { affichees: page.lignes.length, total })
                  : t("commandes.affichees", { affichees: page.lignes.length })}
              </span>
              {lienSuivant === null ? null : (
                <LienEcran prefetch={false} href={lienSuivant} className="bouton-outil">
                  {t("commandes.pageSuivante")}
                </LienEcran>
              )}
            </footer>
          )}
        </section>

        <section className="bloc adm-bloc adm-bloc--anneau" aria-labelledby="adm-repartition">
          <header className="bloc__tete">
            <div>
              <h2 id="adm-repartition">{t("commandes.repartition")}</h2>
            </div>
          </header>
          {repartition === null ? (
            <p className="adm-texte pb-4">{t("panneau.statutsIndisponible")}</p>
          ) : repartition.total === 0 ? (
            <p className="adm-texte pb-4">{t("panneau.aucuneCommande")}</p>
          ) : (
            <AnneauStatuts repartition={repartition} />
          )}
        </section>
      </div>
    </main>
  );
}
