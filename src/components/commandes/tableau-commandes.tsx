import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Icone } from "@/components/icone";
import { TraductionsClient } from "@/components/traductions-client";
import { ActionsLigne } from "./actions-ligne";
import { BadgeStatut, teinteExpedition, teinteQc } from "./badge-statut";
import type { PageCommandes, ParametresListe } from "@/lib/commandes/liste";
import { lienListe, listeFiltree } from "@/lib/commandes/url";

/**
 * Le tableau des commandes, porté sur la maquette `gestion_d_inventaire_envois`.
 *
 * CORRESPONDANCE DES COLONNES. La maquette parle d'expéditions de fret :
 * identifiant d'envoi, fournisseur, destination, statut, livraison estimée. Nous
 * portons ce qu'un vendeur cherche du regard quand il ouvre son écran : le
 * client, la référence, le numéro de suivi, le statut, la dernière modification.
 * La géométrie et le rythme des cellules sont ceux de la maquette.
 *
 * DEUX ÉTATS VIDES DISTINCTS. « Ce compte n'a rien » et « ce filtre ne renvoie
 * rien » sont deux écrans différents : afficher « créez votre première
 * commande » à un vendeur qui en a neuf mille est une perte de confiance
 * immédiate.
 */
export async function TableauCommandes({
  base,
  origine,
  parametres,
  page,
}: {
  readonly base: string;
  readonly origine: string;
  readonly parametres: ParametresListe;
  readonly page: PageCommandes;
}) {
  const t = await getTranslations("commandes");
  const format = await getFormatter();

  const cellule = "px-6 py-4 font-body-sm text-body-sm";

  return (
    <section className="col-span-1 flex h-full min-h-[600px] flex-col overflow-hidden rounded-xl shadow-md md:col-span-9 glass-card">
      <div className="flex flex-col items-start justify-between gap-4 border-b border-outline-variant/30 bg-surface-container-lowest/50 p-6 sm:flex-row sm:items-center">
        <form method="get" action={base} className="relative w-full sm:w-96">
          {/* Les autres réglages voyagent avec la recherche : chercher ne doit
              pas défaire le filtre qu'on vient de poser. */}
          {parametres.statut !== null ? (
            <input type="hidden" name="statut" value={parametres.statut} />
          ) : null}
          {parametres.qc !== null ? <input type="hidden" name="qc" value={parametres.qc} /> : null}
          {parametres.tri !== "recentes" ? (
            <input type="hidden" name="tri" value={parametres.tri} />
          ) : null}
          {parametres.archivees ? <input type="hidden" name="archivees" value="1" /> : null}

          <Icone
            nom="search"
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[20px] text-on-surface-variant"
          />
          <input
            type="search"
            name="q"
            defaultValue={parametres.q}
            placeholder={t("rechercherExemple")}
            aria-label={t("rechercher")}
            className="champ-verre w-full rounded-lg border border-outline-variant py-2 pr-4 pl-10 font-body-sm text-body-sm text-on-surface transition-all"
          />
        </form>

        <Link
          href={base + "/nouvelle"}
          className="flex items-center gap-2 rounded-lg bg-[var(--accent-remplissage)] px-4 py-2 font-label-md text-label-md text-[var(--accent-sur-remplissage)] shadow-md transition-opacity hover:opacity-90"
        >
          <Icone nom="add" className="text-[18px]" />
          {t("nouvelle")}
        </Link>
      </div>

      {page.lignes.length === 0 ? (
        <EtatVide compteVide={page.compteVide} base={base} parametres={parametres} />
      ) : (
        <>
          <div className="flex-grow overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-outline-variant/50 bg-surface-container-lowest/30">
                  {["client", "reference", "suivi", "statutCourt", "qcCourt", "modifiee"].map(
                    (clef) => (
                      <th
                        key={clef}
                        scope="col"
                        className="px-6 py-4 font-label-md text-label-md whitespace-nowrap text-on-surface-variant"
                      >
                        {t("colonne." + clef)}
                      </th>
                    ),
                  )}
                  <th
                    scope="col"
                    className="px-6 py-4 text-right font-label-md text-label-md whitespace-nowrap text-on-surface-variant"
                  >
                    {t("colonne.actions")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {page.lignes.map((ligne) => {
                  // Une commande sans nom de client est le cas NORMAL d'un
                  // brouillon tout juste créé. On ne remplace pas par un nom
                  // inventé : on le nomme pour ce qu'il est.
                  const nom = ligne.client ?? t("sansNom");
                  return (
                    <tr key={ligne.id} className="group transition-colors hover:bg-surface-bright/50">
                      <td
                        className={
                          cellule +
                          " border-l-2 border-transparent font-medium text-on-surface group-hover:border-[var(--accent-interface)]"
                        }
                      >
                        <Link href={base + "/" + ligne.id} className="hover:underline">
                          {nom}
                        </Link>
                      </td>
                      <td className={cellule + " text-on-surface"}>{ligne.reference ?? "—"}</td>
                      <td className={cellule + " text-on-surface-variant"}>
                        {ligne.numeroSuivi ?? "—"}
                      </td>
                      <td className="px-6 py-4">
                        <BadgeStatut
                          libelle={t("statut." + ligne.statut)}
                          teinte={teinteExpedition(ligne.statut)}
                        />
                      </td>
                      <td className="px-6 py-4">
                        <BadgeStatut
                          libelle={t("qc." + ligne.qc)}
                          teinte={teinteQc(ligne.qc)}
                        />
                      </td>
                      <td className={cellule + " whitespace-nowrap text-on-surface"}>
                        {format.dateTime(new Date(ligne.modifieeLe), {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <TraductionsClient espaces={["commandes"]}>
                          <ActionsLigne lien={origine + "/p/" + ligne.jetonPublic} nomClient={nom} />
                        </TraductionsClient>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Pagination base={base} parametres={parametres} suivant={page.suivant} />
        </>
      )}
    </section>
  );
}

/**
 * Barre de pagination.
 *
 * ÉCART ASSUMÉ SUR LA MAQUETTE, qui montre des numéros de page (1, 2, 3…). Un
 * numéro de page suppose un décalage, et un décalage fait lire 2 000 lignes pour
 * en rendre 50 à la page 40 : le coût croît avec le numéro, donc la lenteur
 * frappe celui qui a le plus de commandes. La géométrie de la barre est
 * conservée, la navigation est par curseur.
 *
 * « PRÉCÉDENT » N'EXISTE PAS ET C'EST VOLONTAIRE : un curseur avant se
 * construirait en inversant le tri, ce qui donnerait une page décalée sur
 * égalité de dates. Le retour se fait par l'historique du navigateur, qui porte
 * exactement les URL déjà visitées.
 */
async function Pagination({
  base,
  parametres,
  suivant,
}: {
  readonly base: string;
  readonly parametres: ParametresListe;
  readonly suivant: string | null;
}) {
  const t = await getTranslations("commandes");

  return (
    <div className="flex items-center justify-between gap-4 border-t border-outline-variant/30 bg-surface-container-lowest/50 px-6 py-4">
      <p className="font-label-sm text-label-sm text-on-surface-variant">
        {suivant === null ? t("finDeListe") : t("pageSuivanteDisponible")}
      </p>

      {suivant !== null ? (
        <Link
          href={lienListe(base, parametres, { curseur: suivant })}
          className="flex items-center gap-1 rounded-md border border-outline-variant px-3 py-1 font-label-sm text-label-sm text-on-surface transition-colors hover:bg-surface-variant"
        >
          {t("pageSuivante")}
          <Icone nom="arrow_forward" className="text-[16px]" />
        </Link>
      ) : null}
    </div>
  );
}

async function EtatVide({
  compteVide,
  base,
  parametres,
}: {
  readonly compteVide: boolean;
  readonly base: string;
  readonly parametres: ParametresListe;
}) {
  const t = await getTranslations("commandes");
  const filtree = listeFiltree(parametres);

  // `compteVide` fait autorité : il vient d'une lecture sans filtre. Déduire
  // « pas de filtre donc compte vide » serait faux le jour où une lecture
  // échoue, et proposerait de créer une première commande à qui en a des
  // milliers.
  const vraimentVide = compteVide && !filtree;

  return (
    <div className="flex flex-grow flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <span className="rounded-full bg-surface-container-low p-4 text-on-surface-variant">
        <Icone nom={vraimentVide ? "add" : "search"} className="text-[32px]" />
      </span>

      <h2 className="font-headline-md text-headline-md-mobile text-on-surface">
        {vraimentVide ? t("vide.compteTitre") : t("vide.filtreTitre")}
      </h2>
      <p className="max-w-md font-body-md text-body-md text-on-surface-variant">
        {vraimentVide ? t("vide.compteTexte") : t("vide.filtreTexte")}
      </p>

      {vraimentVide ? (
        <Link
          href={base + "/nouvelle"}
          className="flex items-center gap-2 rounded-lg bg-[var(--accent-remplissage)] px-6 py-3 font-label-md text-label-md text-[var(--accent-sur-remplissage)] shadow-md transition-opacity hover:opacity-90"
        >
          <Icone nom="add" className="text-[18px]" />
          {t("vide.creer")}
        </Link>
      ) : (
        <Link
          href={base}
          className="rounded-lg border border-outline-variant px-6 py-3 font-label-md text-label-md text-on-surface transition-colors hover:bg-surface-variant"
        >
          {t("toutEffacer")}
        </Link>
      )}
    </div>
  );
}
