import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Icone } from "@/components/icone";
import { TraductionsClient } from "@/components/traductions-client";
import { ActionsLigne } from "./actions-ligne";
import { BadgeStatut, teinteExpedition, teinteQc } from "./badge-statut";
import type { DiagnosticListeVide, PageCommandes, ParametresListe } from "@/lib/commandes/liste";
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

  const cellule = "px-4 py-3.5 font-body-md text-[14px] first:pl-5 last:pr-5";

  return (
    <section className="flex flex-col overflow-hidden border-y border-outline-variant bg-surface-container-lowest md:mx-0 md:rounded-lg md:border">
      {page.lignes.length === 0 ? (
        <EtatVide
          diagnostic={page.diagnostic}
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
                "border-b border-outline-variant px-5 py-3 font-body-md text-body-md " +
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
                <tr className="border-b border-outline-variant">
                  <th scope="col" className="w-12 px-4 py-3 pl-5">
                    <span className="sr-only">{t("lot.titre")}</span>
                  </th>
                  {["client", "reference", "suivi", "statutCourt", "qcCourt", "vues", "modifiee"].map(
                    (clef) => (
                      <th
                        key={clef}
                        scope="col"
                        className="px-4 py-3 font-label-sm text-[11px] font-bold tracking-[0.05em] whitespace-nowrap text-sourdine uppercase"
                      >
                        {t("colonne." + clef)}
                      </th>
                    ),
                  )}
                  <th
                    scope="col"
                    className="px-4 py-3 pr-5 text-right font-label-sm text-[11px] font-bold tracking-[0.05em] whitespace-nowrap text-sourdine uppercase"
                  >
                    {t("colonne.actions")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {page.lignes.map((ligne) => {
                  // Une commande sans nom de client est le cas NORMAL d'un
                  // brouillon tout juste créé. On ne remplace pas par un nom
                  // inventé : on le nomme pour ce qu'il est.
                  const nom = ligne.client ?? t("sansNom");
                  return (
                    <tr key={ligne.id} className="group transition-colors hover:bg-surface-container-low">
                      <td className="w-12 px-4 py-3.5 pl-5">
                        <input
                          type="checkbox"
                          name="selection"
                          value={ligne.id}
                          aria-label={t("selectionner", { client: nom })}
                          className="h-4 w-4 accent-[var(--accent-remplissage)]"
                        />
                      </td>
                      <td
                        className={cellule + " font-semibold text-on-surface"}
                      >
                        <Link href={base + "/" + ligne.id} className="hover:underline">
                          {nom}
                        </Link>
                      </td>
                      <td className={cellule + " text-on-surface"}>{ligne.reference ?? "—"}</td>
                      <td className={cellule + " text-on-surface-variant"}>
                        {ligne.numeroSuivi ?? "—"}
                      </td>
                      <td className="px-4 py-3.5">
                        <BadgeStatut
                          libelle={t("statut." + ligne.statut)}
                          teinte={teinteExpedition(ligne.statut)}
                        />
                      </td>
                      <td className="px-4 py-3.5">
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
                      <td className="px-4 py-3.5 pr-5">
                        <div className="flex items-center justify-end gap-0.5">
                          <TraductionsClient espaces={["commandes"]}>
                            <ActionsLigne
                              lien={origine + "/p/" + ligne.jetonPublic}
                              nomClient={nom}
                            />
                          </TraductionsClient>

                          <button
                            type="submit"
                            form={"dup-" + ligne.id}
                            className="flex h-11 w-11 items-center justify-center rounded-[9px] text-sourdine transition-colors hover:bg-surface-container hover:text-on-surface md:h-8 md:w-8"
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
                            className="flex h-11 w-11 items-center justify-center rounded-[9px] text-sourdine transition-colors hover:bg-surface-container hover:text-on-surface md:h-8 md:w-8"
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
          <div className="flex flex-wrap items-center gap-3 border-t border-outline-variant px-5 py-4">
            <span className="font-label-sm text-label-sm text-on-surface-variant">
              {t("lot.aide")}
            </span>
            <button
              type="submit"
              name="archiver"
              value={parametres.archivees ? "0" : "1"}
              className="flex min-h-11 items-center rounded-full border border-outline px-3.5 font-label-md text-[13px] font-semibold text-on-surface-variant transition-colors hover:bg-surface-container md:min-h-0 md:h-[34px]"
            >
              {parametres.archivees ? t("lot.desarchiver") : t("lot.archiver")}
            </button>
          </div>
          </form>

          {/*
            L'EXPORT CSV — HORS du formulaire de lot, et c'est structurel.

            C'est un LIEN, pas un bouton de ce formulaire : un export est une
            lecture, il porte les FILTRES de la vue et non la sélection cochée.
            Le mettre dans le formulaire de lot l'aurait fait dépendre des cases
            cochées, ce qui n'est pas ce qu'il exporte.

            L'AVERTISSEMENT EST À CÔTÉ DU LIEN, jamais après le téléchargement.
            Le fichier contient les liens publics des commandes, et un lien
            public transfère une CAPACITÉ, définitivement : le prévenir une fois
            le fichier ouvert serait le prévenir trop tard.
          */}
          <div className="flex flex-wrap items-center gap-3 border-t border-outline-variant px-5 py-4">
            <a
              // LES MÊMES PARAMÈTRES QUE LA VUE, composés par la MÊME fonction
              // que tous les autres liens de l'écran. Recomposer la chaîne ici
              // ferait une seconde façon d'encoder les filtres, et deux façons
              // divergent au premier filtre ajouté — le vendeur exporterait
              // alors autre chose que ce qu'il regarde, sans s'en apercevoir.
              href={lienListe("/api/commandes/export", { ...parametres, curseur: null }, {})}
              className="flex min-h-11 items-center rounded-full border border-outline px-3.5 font-label-md text-[13px] font-semibold text-on-surface-variant transition-colors hover:bg-surface-container md:min-h-0 md:h-[34px]"
            >
              {t("lot.exporter")}
            </a>
            <span className="font-label-sm text-label-sm text-on-surface-variant">
              {t("lot.exportAvertissement")}
            </span>
          </div>

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
    <div className="flex items-center justify-between gap-4 border-t border-outline-variant px-5 py-4">
      <p className="font-label-sm text-label-sm text-on-surface-variant">
        {suivant === null ? t("finDeListe") : t("pageSuivanteDisponible")}
      </p>

      {suivant !== null ? (
        <Link
          href={lienListe(base, parametres, { curseur: suivant })}
          className="flex min-h-11 items-center gap-1 rounded-md border border-outline px-[18px] font-label-md text-[14px] font-semibold text-on-surface transition-colors hover:bg-surface-container md:min-h-[38px]"
        >
          {t("pageSuivante")}
          <Icone nom="arrow_forward" className="text-[16px]" />
        </Link>
      ) : null}
    </div>
  );
}

/**
 * L'ÉCRAN VIDE DIT LA CAUSE, ET N'OFFRE QUE DES GESTES QUI FONT QUELQUE CHOSE.
 *
 * Trois causes, trois écrans. La troisième — « tout est archivé » — manquait, et
 * son absence produisait exactement le défaut que Wassim a signalé le
 * 27/08/2026 : sur un compte dont les cinq commandes étaient archivées, l'écran
 * annonçait « aucune ne passe les filtres en cours » SANS QU'AUCUN FILTRE SOIT
 * POSÉ, et son seul bouton, « Tout effacer », pointait vers l'adresse déjà
 * ouverte. Cliquer ne changeait rien — non par panne, mais parce qu'il n'y avait
 * rien à effacer.
 *
 * D'où la règle qui vaut au-delà de cet écran : UN BOUTON DONT L'ACTION EST
 * DÉJÀ L'ÉTAT COURANT NE SE REND PAS. « Tout effacer » n'apparaît donc que
 * lorsqu'un filtre est réellement posé — sans quoi il enseigne au vendeur que
 * l'interface ne répond pas, ce qui est plus coûteux que l'absence de bouton.
 */
async function EtatVide({
  diagnostic,
  base,
  langue,
  parametres,
}: {
  readonly diagnostic: DiagnosticListeVide | null;
  readonly base: string;
  readonly langue: string;
  readonly parametres: ParametresListe;
}) {
  const t = await getTranslations("commandes");

  // Le diagnostic vient d'une LECTURE, pas d'une déduction sur les paramètres.
  // Il ne suffit pourtant pas seul : proposer « voir les archives » à qui les
  // consulte déjà rendrait un second bouton sans effet.
  const toutArchive = diagnostic === "tout-archive" && !parametres.archivees;
  const compteVide = diagnostic === "aucune-commande";

  // Le lien vers les archives GARDE les autres critères : le vendeur qui filtrait
  // sur un statut ne veut pas le reperdre en changeant de pile.
  const lienArchives = lienListe(base, parametres, { archivees: true });

  const titre = compteVide
    ? t("vide.compteTitre")
    : toutArchive
      ? t("vide.archiveTitre")
      : t("vide.filtreTitre");

  const texte = compteVide
    ? t("vide.compteTexte")
    : toutArchive
      ? t("vide.archiveTexte")
      : t("vide.filtreTexte");

  return (
    <div className="flex flex-grow flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <span className="rounded-full bg-surface-container p-4 text-sourdine">
        <Icone
          nom={compteVide ? "add" : toutArchive ? "inventory_2" : "search"}
          className="text-[32px]"
        />
      </span>

      <h2 className="font-headline-md text-headline-md-mobile text-on-surface">{titre}</h2>
      <p className="max-w-md font-body-md text-body-md text-on-surface-variant">{texte}</p>

      {compteVide ? (
        <form action={creerBrouillon}>
          <input type="hidden" name="langue" value={langue} />
          <button
            type="submit"
            className="degrade-marque flex min-h-11 items-center gap-2 rounded-md px-6 font-label-md text-[14px] font-bold transition-opacity hover:opacity-90"
          >
            <Icone nom="add" className="text-[18px]" />
            {t("vide.creer")}
          </button>
        </form>
      ) : toutArchive ? (
        <Link
          href={lienArchives}
          className="flex min-h-11 items-center rounded-md border border-outline px-6 font-label-md text-[14px] font-semibold text-on-surface transition-colors hover:bg-surface-container"
        >
          {t("vide.voirArchives")}
        </Link>
      ) : listeFiltree(parametres) ? (
        <Link
          href={base}
          className="flex min-h-11 items-center rounded-md border border-outline px-6 font-label-md text-[14px] font-semibold text-on-surface transition-colors hover:bg-surface-container"
        >
          {t("toutEffacer")}
        </Link>
      ) : null}
    </div>
  );
}
