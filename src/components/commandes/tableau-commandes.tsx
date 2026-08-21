import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Icone } from "@/components/icone";
import { TraductionsClient } from "@/components/traductions-client";
import { ActionsLigne } from "./actions-ligne";
import { BadgeStatut, teinteExpedition, teinteQc } from "./badge-statut";
import type { PageCommandes, ParametresListe } from "@/lib/commandes/liste";
import { lienListe, listeFiltree } from "@/lib/commandes/url";
import type { EtatLot } from "@/lib/commandes/lot";
import {
  archiverDepuisListe,
  archiverLot,
  creerBrouillon,
  dupliquerDepuisListe,
} from "@/lib/commandes/actions";

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
  langue,
  origine,
  parametres,
  page,
  lot,
}: {
  readonly base: string;
  readonly langue: string;
  readonly origine: string;
  readonly parametres: ParametresListe;
  readonly page: PageCommandes;
  /**
   * Résultat du dernier lot.
   *
   * L'état est un ENSEMBLE FERMÉ et pas une chaîne, parce qu'il finit dans une
   * clef de traduction : `t("lot." + etat)`. Une valeur libre venue de la barre
   * d'adresse ferait lever le rendu de l'écran sur une clef inexistante — un
   * `?lot=n_importe_quoi` suffirait à casser la page de n'importe quel vendeur.
   * La validation est faite par la page, en amont.
   */
  readonly lot: { readonly etat: EtatLot | null; readonly nombre: number };
}) {
  const t = await getTranslations("commandes");
  const format = await getFormatter();

  // L'URL courante, pour y revenir après une action. Reconstruite depuis les
  // paramètres et non lue dans un en-tête : c'est le même calcul que celui des
  // liens de la page, donc le retour atterrit exactement là où on était.
  const retour = lienListe(base, parametres, {});

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

        {/* CRÉER EST UNE MUTATION, donc une Server Action et non un lien vers
            une page qui écrirait au rendu. Un lien serait suivi par le
            préchargement du navigateur, par un aspirateur, par une visite
            accidentelle — et chacun créerait un brouillon. */}
        <form action={creerBrouillon}>
          <input type="hidden" name="langue" value={langue} />
          <button
            type="submit"
            className="flex items-center gap-2 rounded-lg bg-[var(--accent-remplissage)] px-4 py-2 font-label-md text-label-md text-[var(--accent-sur-remplissage)] shadow-md transition-opacity hover:opacity-90"
          >
            <Icone nom="add" className="text-[18px]" />
            {t("nouvelle")}
          </button>
        </form>
      </div>

      {page.lignes.length === 0 ? (
        <EtatVide
          compteVide={page.compteVide}
          base={base}
          langue={langue}
          parametres={parametres}
        />
      ) : (
        <>
          {/* LE RÉSULTAT DU DERNIER LOT, DIT. Un lot refusé et un lot en panne
              ne se disent pas pareil : le premier se refait à l'identique, le
              second non. Et « rien n'a été modifié » est une information — sans
              elle, le vendeur ne sait pas s'il doit recommencer. */}
          {lot.etat !== null ? (
            <p
              role="status"
              className={
                "border-b border-outline-variant/30 px-6 py-3 font-body-sm text-body-sm " +
                (lot.etat === "ok" ? "text-on-surface" : "text-error")
              }
            >
              {lot.etat === "ok" ? t("lot.ok", { n: lot.nombre }) : t("lot." + lot.etat)}
            </p>
          ) : null}

          {/*
            LE FORMULAIRE DE LOT ENVELOPPE LE TABLEAU, et les actions de LIGNE
            sont des formulaires rendus APRÈS lui, atteints par l'attribut `form`
            de leurs boutons. HTML interdit d'imbriquer un formulaire dans un
            autre ; sans cette construction il faudrait un îlot client pour une
            opération que le navigateur sait faire seul, et l'archivage cesserait
            de fonctionner quand le JavaScript n'a pas chargé — ce qui arrive plus
            souvent qu'on ne le croit sur un téléphone en 4G.
          */}
          <form action={archiverLot}>
            <input type="hidden" name="retour" value={retour} />
          <div className="flex-grow overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-outline-variant/50 bg-surface-container-lowest/30">
                  <th scope="col" className="w-12 px-4 py-4">
                    <span className="sr-only">{t("lot.titre")}</span>
                  </th>
                  {["client", "reference", "suivi", "statutCourt", "qcCourt", "vues", "modifiee"].map(
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
                      <td className="w-12 px-4 py-4">
                        <input
                          type="checkbox"
                          name="selection"
                          value={ligne.id}
                          aria-label={t("selectionner", { client: nom })}
                          className="h-4 w-4 accent-[var(--accent-remplissage)]"
                        />
                      </td>
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
                      {/* LE COMPTEUR DE VUES, et surtout « JAMAIS OUVERT ».
                          C'est l'information pour laquelle le vendeur ouvre cet
                          écran : savoir qui n'a pas encore regardé ses photos.
                          Zéro n'est pas affiché comme un chiffre — un « 0 » se
                          lit de loin comme n'importe quel autre nombre. */}
                      <td className={cellule + " whitespace-nowrap"}>
                        {ligne.vues === 0 ? (
                          <span
                            className="rounded-full bg-surface-container-high px-2 py-1 font-label-sm text-label-sm text-on-surface-variant"
                            title={t("jamaisOuvertAide", { client: nom })}
                          >
                            {t("jamaisOuvert")}
                          </span>
                        ) : (
                          <span
                            className="text-on-surface"
                            title={
                              ligne.derniereVueLe === null
                                ? undefined
                                : t("derniereVue", {
                                    date: format.dateTime(new Date(ligne.derniereVueLe), {
                                      day: "numeric",
                                      month: "short",
                                      year: "numeric",
                                    }),
                                  })
                            }
                          >
                            {t("vuesNombre", { n: ligne.vues })}
                          </span>
                        )}
                      </td>
                      <td className={cellule + " whitespace-nowrap text-on-surface"}>
                        {format.dateTime(new Date(ligne.modifieeLe), {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <TraductionsClient espaces={["commandes"]}>
                            <ActionsLigne
                              lien={origine + "/p/" + ligne.jetonPublic}
                              nomClient={nom}
                            />
                          </TraductionsClient>

                          <button
                            type="submit"
                            form={"dup-" + ligne.id}
                            className="rounded-md p-2 text-on-surface-variant transition-colors hover:bg-surface-variant hover:text-[var(--accent-texte)]"
                            title={t("dupliquerLigne", { client: nom })}
                          >
                            <Icone
                              nom="file_copy"
                              className="text-[18px]"
                              titre={t("dupliquerLigne", { client: nom })}
                            />
                          </button>

                          <button
                            type="submit"
                            form={"arch-" + ligne.id}
                            className="rounded-md p-2 text-on-surface-variant transition-colors hover:bg-surface-variant hover:text-[var(--accent-texte)]"
                            title={
                              ligne.archiveeLe === null
                                ? t("archiver", { client: nom })
                                : t("desarchiver", { client: nom })
                            }
                          >
                            <Icone
                              nom={ligne.archiveeLe === null ? "inventory_2" : "unarchive"}
                              className="text-[18px]"
                              titre={
                                ligne.archiveeLe === null
                                  ? t("archiver", { client: nom })
                                  : t("desarchiver", { client: nom })
                              }
                            />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* LA BARRE DE LOT. Un seul bouton, dont le sens dépend de la vue
              courante : proposer « archiver » dans les archives n'aurait pas de
              sens. `name` et `value` d'un bouton partent avec le formulaire — le
              navigateur sait donc lequel a été pressé, sans JavaScript. */}
          <div className="flex flex-wrap items-center gap-3 border-t border-outline-variant/30 bg-surface-container-lowest/50 px-6 py-4">
            <span className="font-label-sm text-label-sm text-on-surface-variant">
              {t("lot.aide")}
            </span>
            <button
              type="submit"
              name="archiver"
              value={parametres.archivees ? "0" : "1"}
              className="rounded-lg border border-outline-variant px-4 py-2 font-label-md text-label-md text-on-surface transition-colors hover:bg-surface-variant"
            >
              {parametres.archivees ? t("lot.desarchiver") : t("lot.archiver")}
            </button>
          </div>
          </form>

          {/*
            LES FORMULAIRES DES ACTIONS DE LIGNE, hors du tableau et hors du
            formulaire de lot. Chacun porte SES champs : un formulaire commun
            enverrait ceux de toutes les lignes à chaque clic.
          */}
          {page.lignes.map((ligne) => (
            <div key={"formulaires-" + ligne.id} className="hidden">
              <form id={"arch-" + ligne.id} action={archiverDepuisListe}>
                <input type="hidden" name="id" value={ligne.id} />
                <input type="hidden" name="jeton" value={ligne.jetonPublic} />
                <input type="hidden" name="archiver" value={ligne.archiveeLe === null ? "1" : "0"} />
                <input type="hidden" name="retour" value={retour} />
              </form>
              <form id={"dup-" + ligne.id} action={dupliquerDepuisListe}>
                <input type="hidden" name="id" value={ligne.id} />
                <input type="hidden" name="langue" value={langue} />
                <input type="hidden" name="retour" value={retour} />
              </form>
            </div>
          ))}

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
  langue,
  parametres,
}: {
  readonly compteVide: boolean;
  readonly base: string;
  readonly langue: string;
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
        <form action={creerBrouillon}>
          <input type="hidden" name="langue" value={langue} />
          <button
            type="submit"
            className="flex items-center gap-2 rounded-lg bg-[var(--accent-remplissage)] px-6 py-3 font-label-md text-label-md text-[var(--accent-sur-remplissage)] shadow-md transition-opacity hover:opacity-90"
          >
            <Icone nom="add" className="text-[18px]" />
            {t("vide.creer")}
          </button>
        </form>
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
