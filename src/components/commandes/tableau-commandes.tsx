import Link from "next/link";
import { LienEcran } from "@/components/lien-ecran";
import { getFormatter, getTranslations } from "next-intl/server";
import { Icone } from "@/components/icone";
import { TraductionsClient } from "@/components/traductions-client";
import { ActionsLigne } from "./actions-ligne";
import { BadgeStatut, teinteExpedition } from "./badge-statut";
import { PilulesFiltres } from "./pilules-filtres";
import type {
  DiagnosticListeVide,
  LigneCommande,
  PageCommandes,
  ParametresListe,
} from "@/lib/commandes/liste";
import { decrireSilence } from "@/lib/tracking/silence";
import { lienListe, listeFiltree } from "@/lib/commandes/url";
import type { EtatLot } from "@/lib/commandes/lot";
import {
  archiverDepuisListe,
  archiverLot,
  creerBrouillon,
  dupliquerDepuisListe,
} from "@/lib/commandes/actions";

/**
 * La liste des commandes, portée sur les planches `Commandes`, `CommandesMobile`,
 * `CommandesVide` et `CommandesFiltreVide`.
 *
 * DEUX RENDUS, PAS UN TABLEAU QUI DÉFILE. La planche téléphone ne montre pas le
 * tableau réduit : elle montre une LISTE DE CARTES, une par commande, avec la
 * vignette à gauche. Un tableau à huit colonnes sur 390 px se parcourt au doigt
 * de gauche à droite pour lire une seule ligne — c'est-à-dire qu'on ne le lit
 * pas. Les deux rendus lisent les mêmes données ; seule la mise en forme change.
 *
 * LES COLONNES SONT CELLES DE LA PLANCHE : vignette, client, référence, statut,
 * photos, vues, modifiée, actions. Le numéro de suivi et l'état des photos en
 * sont sortis — ils restent cherchables et filtrables, et ils vivent dans
 * l'écran `Envois` et dans l'éditeur, là où on agit dessus.
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
  total,
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
  /**
   * Total des commandes non archivées, ou `null` si le compte a échoué.
   *
   * Sert le pied de liste — « 5 sur 184 » de la planche. `null` fait rendre la
   * phrase qui ne compte pas : on n'invente pas un dénominateur.
   */
  readonly total: number | null;
}) {
  const t = await getTranslations("commandes");
  const format = await getFormatter();
  const maintenant = new Date();

  /**
   * « il y a 2 h », « hier », « il y a 3 j » — les libellés EXACTS de la planche.
   *
   * `style: "short"` et pas le défaut : en long, la même colonne rend « il y a
   * 2 heures » et « il y a 17 minutes », qui font vingt caractères de plus dans
   * une colonne de 96 px. `numeric: "auto"` est ce qui donne « hier » plutôt que
   * « il y a 1 j » — c'est aussi ce que dessine la planche, ligne 2.
   */
  const depuis = (iso: string): string =>
    format.relativeTime(new Date(iso), { now: maintenant, style: "short" });

  // L'URL courante, pour y revenir après une action. Reconstruite depuis les
  // paramètres et non lue dans un en-tête : c'est le même calcul que celui des
  // liens de la page, donc le retour atterrit exactement là où on était.
  const retour = lienListe(base, parametres, {});

  const vide = page.lignes.length === 0;
  // Le compte vide a sa propre planche, sans carte ni barre d'outils : il n'y a
  // rien à filtrer et rien à exporter. Rendre la barre au-dessus d'un écran
  // d'accueil offrirait quatre raccourcis vers le même néant.
  const compteVide = page.diagnostic === "aucune-commande";

  const enTete =
    "pb-3 text-left font-label-sm text-[11px] leading-[14px] font-bold tracking-[0.05em] whitespace-nowrap text-gris-entete uppercase";
  const cellule = "border-t border-filet-ligne py-3.5 font-body-md text-[14px]";

  if (compteVide) {
    return <AccueilCompteVide langue={langue} />;
  }

  return (
    <section className="flex flex-col md:mx-0 md:rounded-[18px] md:border md:border-outline-variant md:bg-surface-container-lowest md:px-[22px] md:py-5">
      {/* LE RÉSULTAT DU DERNIER LOT, DIT. Un lot refusé et un lot en panne ne se
          disent pas pareil : le premier se refait à l'identique, le second non.
          Et « rien n'a été modifié » est une information — sans elle, le vendeur
          ne sait pas s'il doit recommencer. */}
      {lot.etat !== null ? (
        <p
          role="status"
          className={
            "mx-margin-mobile mb-3.5 rounded-[11px] border px-4 py-3 font-body-md text-[13px] md:mx-0 " +
            (lot.etat === "ok"
              ? "border-outline-variant bg-fond-neutre text-on-surface"
              : "border-alerte-filet bg-alerte-fond-doux text-alerte")
          }
        >
          {lot.etat === "ok" ? t("lot.ok", { n: lot.nombre }) : t("lot." + lot.etat)}
        </p>
      ) : null}

      {/*
        LA BARRE D'OUTILS NE SE REND QUE S'IL Y A UNE LISTE À OUTILLER, et c'est
        la planche `CommandesFiltreVide` qui le dit : elle ne dessine ni pilules
        ni export au-dessus de son écran vide. Il n'y a rien à exporter, et les
        raccourcis de vue mèneraient tous au même néant. La sortie se fait par
        les puces de critères, au-dessus de la carte, où chacun se retire seul.
      */}
      {vide ? null : (
      <>
      {/* ⚠️ LE DÉFILEMENT TIENT JUSQU'À `lg`, pas jusqu'à `md`. Sous 1024 px, six
          contrôles ne tiennent pas sur la largeur restante : « Exporter »
          dépassait de 103 px, mesurés, et la carte-page le coupait. Le
          repoussoir qui écarte l'export des pilules n'apparaît donc qu'avec la
          place de l'accueillir. */}
      <div className="defilement-discret flex items-center gap-2 overflow-x-auto px-margin-mobile md:px-0 lg:mb-4 lg:overflow-visible">
        <PilulesFiltres base={base} parametres={parametres} />

        <span className="hidden flex-grow lg:block" />

        {/*
          L'EXPORT CSV — HORS du formulaire de lot, et c'est structurel.

          C'est un LIEN, pas un bouton de ce formulaire : un export est une
          lecture, il porte les FILTRES de la vue et non la sélection cochée. Le
          mettre dans le formulaire de lot l'aurait fait dépendre des cases
          cochées, ce qui n'est pas ce qu'il exporte.
        */}
        <a
          // LES MÊMES PARAMÈTRES QUE LA VUE, composés par la MÊME fonction que
          // tous les autres liens de l'écran. Recomposer la chaîne ici ferait une
          // seconde façon d'encoder les filtres, et deux façons divergent au
          // premier filtre ajouté — le vendeur exporterait alors autre chose que
          // ce qu'il regarde, sans s'en apercevoir.
          href={lienListe("/api/commandes/export", { ...parametres, curseur: null }, {})}
          className="flex min-h-11 shrink-0 items-center gap-[7px] rounded-full border border-filet-controle bg-surface-container-lowest px-[13px] font-label-md text-[13px] font-semibold whitespace-nowrap text-ardoise transition-colors hover:bg-fond-neutre md:h-[34px] md:min-h-0"
        >
          <Icone nom="download" className="text-[14px]" />
          {t("lot.exporter")}
        </a>
      </div>

      {/*
        L'AVERTISSEMENT D'EXPORT — ÉCART ASSUMÉ SUR LA PLANCHE, qui dessine
        « Exporter » nu.

        Le fichier contient les liens publics des commandes, et un lien public
        transfère une CAPACITÉ, définitivement, puisque le jeton est immuable à
        vie. Prévenir une fois le fichier ouvert serait prévenir trop tard, et le
        vendeur ne décide pas d'une fuite : il décide d'un export — deux gestes
        différents, parfois séparés de plusieurs mois. La planche n'a pas prévu
        où loger cette phrase ; la retirer aurait retiré la seule occasion de la
        lire.
      */}
      <p className="mt-2 px-margin-mobile font-body-sm text-[12px] text-sourdine md:px-0 lg:mt-0 lg:mb-4">
        {t("lot.exportAvertissement")}
      </p>
      </>
      )}

      {vide ? (
        <FiltreSansResultat
          diagnostic={page.diagnostic}
          base={base}
          parametres={parametres}
          total={total}
        />
      ) : (
        <>
          {/*
            LE FORMULAIRE DE LOT ENVELOPPE LES DEUX RENDUS, et les actions de
            LIGNE sont des formulaires rendus APRÈS lui, atteints par l'attribut
            `form` de leurs boutons. HTML interdit d'imbriquer un formulaire dans
            un autre ; sans cette construction il faudrait un îlot client pour une
            opération que le navigateur sait faire seul, et l'archivage cesserait
            de fonctionner quand le JavaScript n'a pas chargé — ce qui arrive plus
            souvent qu'on ne le croit sur un téléphone en 4G.
          */}
          <form action={archiverLot} className="group/lot">
            <input type="hidden" name="retour" value={retour} />

            {/*
              LA BARRE DE LOT N'APPARAÎT QUE SI QUELQUE CHOSE EST COCHÉ, et c'est
              du CSS, pas du JavaScript : `:has(:checked)` sur le formulaire. La
              planche ne dessine aucune barre d'actions groupées ; elle n'a donc
              pas à occuper une ligne tant qu'il n'y a rien à grouper.
            */}
            <div className="mb-3.5 hidden flex-wrap items-center gap-3 px-margin-mobile group-has-[input:checked]/lot:flex md:px-0">
              <span className="font-label-sm text-[12px] text-sourdine">{t("lot.aide")}</span>
              <button
                type="submit"
                name="archiver"
                value={parametres.archivees ? "0" : "1"}
                className="flex h-[34px] items-center rounded-full border border-primary bg-primary px-3.5 font-label-md text-[13px] font-semibold text-on-primary"
              >
                {parametres.archivees ? t("lot.desarchiver") : t("lot.archiver")}
              </button>
            </div>

            {/* ---------- BUREAU : LE TABLEAU, À PARTIR DE 1024 px ---------- */}
            {/*
              ⚠️ LA BASCULE EST À `lg`, PAS À `md`, ET C'EST MESURÉ. À 768 px le
              tableau demandait 720 px là où la carte lui en laisse 470 : il
              débordait, et la carte-page — qui porte `overflow-hidden` — le
              coupait net. La colonne des actions et la moitié du bouton
              principal sortaient de l'écran, et les en-têtes se collaient en
              « CLIENTRÉFÉRENCESTATUT ».

              Le conteneur à défilement qui vivait ici masquait le problème en le
              transformant en glissement horizontal — et en rognait un autre au
              passage, voir plus bas. La liste de cartes tient jusqu'à 1024 px ;
              c'est elle qui sert cet intervalle.
            */}
            {/*
              ⚠️ PAS DE CONTENEUR À DÉFILEMENT ICI, ET C'EST UNE CORRECTION.
              Il y en avait un — `overflow-x-auto` — pour garantir une largeur
              minimale au tableau. Or `overflow-x: auto` fait calculer
              `overflow-y: auto` : le menu « … » de la DERNIÈRE ligne débordait
              alors de 87 px, mesurés, et se faisait rogner par le conteneur.
              Ses deux gestes — dupliquer, archiver — étaient inatteignables sur
              la dernière commande de chaque page, et sur elle seule.

              Le tableau se rétrécit donc plutôt que de défiler. Les cellules
              n'ont aucune marge horizontale, comme sur la planche : à l'étroit
              le texte se replie sur deux lignes au lieu de chevaucher la colonne
              voisine.
            */}
            <div className="hidden lg:block">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr>
                    <th scope="col" className={enTete + " w-[34px]"}>
                      <span className="sr-only">{t("lot.titre")}</span>
                    </th>
                    {["client", "reference", "statutCourt", "photos", "vues", "modifiee"].map(
                      (clef) => (
                        <th key={clef} scope="col" className={enTete}>
                          {t("colonne." + clef)}
                        </th>
                      ),
                    )}
                    <th scope="col" className={enTete + " text-right"}>
                      {t("colonne.actions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {page.lignes.map((ligne) => {
                    // Une commande sans nom de client est le cas NORMAL d'un
                    // brouillon tout juste créé. On ne remplace pas par un nom
                    // inventé : on le nomme pour ce qu'il est.
                    const nom = ligne.client ?? t("sansNom");
                    return (
                      <tr key={ligne.id} className="group/ligne">
                        <td className={cellule}>
                          <VignetteEtSelection ligne={ligne} nom={nom} libelle={t("selectionner", { client: nom })} />
                        </td>

                        <td className={cellule + " font-semibold text-on-surface"}>
                          <Link href={base + "/" + ligne.id} className="hover:underline">
                            {nom}
                          </Link>
                        </td>

                        <td className={cellule + " text-on-surface"}>{ligne.reference ?? "—"}</td>

                        <td className={cellule}>
                          <PuceExpedition ligne={ligne} maintenant={maintenant} libelles={t} />
                        </td>

                        <td className={cellule + " text-on-surface"}>{ligne.photos}</td>

                        {/* LE COMPTEUR DE VUES, et surtout le ZÉRO. C'est
                            l'information pour laquelle le vendeur ouvre cet
                            écran : savoir qui n'a pas encore regardé ses photos.
                            La planche l'écrit en rouge et en gras — c'est le seul
                            nombre de la ligne qui appelle une action. */}
                        <td
                          className={
                            cellule +
                            " whitespace-nowrap " +
                            (ligne.vues === 0 ? "font-semibold text-alerte" : "text-on-surface")
                          }
                          title={
                            ligne.vues === 0
                              ? t("jamaisOuvertAide", { client: nom })
                              : ligne.derniereVueLe === null
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
                          {ligne.vues}
                        </td>

                        <td
                          className={cellule + " whitespace-nowrap text-sourdine"}
                          title={format.dateTime(new Date(ligne.modifieeLe), {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                            hour: "numeric",
                            minute: "numeric",
                          })}
                        >
                          {depuis(ligne.modifieeLe)}
                        </td>

                        <td className={cellule + " text-right"}>
                          <div className="flex items-center justify-end gap-0.5">
                            <TraductionsClient espaces={["commandes"]}>
                              <ActionsLigne
                                lien={origine + "/p/" + ligne.jetonPublic}
                                nomClient={nom}
                              />
                            </TraductionsClient>

                            {/*
                              LE MENU « … » DE LA PLANCHE, en `<details>` : trois
                              boutons au repos, pas cinq. Sans JavaScript, sans
                              îlot client, et les deux gestes qu'il contient
                              restent des soumissions de formulaire.
                            */}
                            {/* `name` partagé : ouvrir un menu ferme celui qui
                                l'était, comme un groupe de boutons radio. Sans
                                lui, cinquante menus peuvent rester ouverts en
                                même temps. Aucun JavaScript. */}
                            <details name="actions-commande" className="relative">
                              <summary className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-[9px] text-sourdine transition-colors hover:bg-fond-neutre hover:text-on-surface">
                                <Icone
                                  nom="more_vert"
                                  className="text-[16px]"
                                  titre={t("plusDActions", { client: nom })}
                                />
                              </summary>
                              <div className="absolute top-full right-0 z-10 mt-1 flex w-56 flex-col rounded-[11px] border border-outline-variant bg-surface-container-lowest p-1 shadow-[0_12px_30px_-12px_rgba(14,14,19,0.35)]">
                                <button
                                  type="submit"
                                  form={"dup-" + ligne.id}
                                  className="flex min-h-11 items-center gap-2.5 rounded-[9px] px-3 text-left font-label-md text-[13px] font-semibold text-on-surface transition-colors hover:bg-fond-neutre"
                                >
                                  <Icone nom="file_copy" className="text-[16px] text-sourdine" />
                                  {t("dupliquer")}
                                </button>
                                <button
                                  type="submit"
                                  form={"arch-" + ligne.id}
                                  className="flex min-h-11 items-center gap-2.5 rounded-[9px] px-3 text-left font-label-md text-[13px] font-semibold text-on-surface transition-colors hover:bg-fond-neutre"
                                >
                                  <Icone
                                    nom={ligne.archiveeLe === null ? "inventory_2" : "unarchive"}
                                    className="text-[16px] text-sourdine"
                                  />
                                  {ligne.archiveeLe === null ? t("archiverCourt") : t("desarchiverCourt")}
                                </button>
                              </div>
                            </details>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ---------- TÉLÉPHONE : LA LISTE DE CARTES ---------- */}
            <ul className="flex flex-col gap-2.5 px-margin-mobile md:px-0 lg:hidden">
              {page.lignes.map((ligne) => {
                const nom = ligne.client ?? t("sansNom");
                const jamaisOuverte = ligne.vues === 0;
                /*
                 * ⚠️ LA CARTE EN ALERTE SUIT LE COLIS, PAS LE COMPTEUR DE VUES.
                 *
                 * Elle était peinte dès `vues === 0`, et le résultat était une
                 * liste ENTIÈREMENT rose : une commande créée il y a dix minutes
                 * n'a évidemment aucune vue, et se présentait comme un incident.
                 * Une alerte qui se déclenche partout est une alerte qu'on
                 * apprend à ignorer — c'est le même raisonnement que le seuil de
                 * dix jours du silence, et c'est le même signal.
                 *
                 * La planche est explicite : sa seule carte en alerte est celle
                 * dont la puce dit « Sans mouvement ».
                 */
                const enAlerte =
                  ligne.statut !== "livre" &&
                  ligne.statut !== "preparation" &&
                  decrireSilence(
                    ligne.colisBougeLe === null ? null : new Date(ligne.colisBougeLe),
                    maintenant,
                  ).etat === "silencieux";
                return (
                  <li key={ligne.id}>
                    <Link
                      href={base + "/" + ligne.id}
                      className={
                        "flex items-center gap-[13px] rounded-lg border p-3.5 " +
                        (enAlerte
                          ? "border-alerte-filet bg-alerte-fond-doux"
                          : "border-outline-variant bg-surface-container-lowest")
                      }
                    >
                      <Vignette url={ligne.vignette} taille={52} rayon={12} />

                      <span className="min-w-0 flex-grow">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate font-label-md text-[15px] leading-[19px] font-bold text-on-surface">
                            {nom}
                          </span>
                          <span className="shrink-0 font-body-sm text-[12px] leading-[15px] text-sourdine">
                            {depuis(ligne.modifieeLe)}
                          </span>
                        </span>

                        <span className="mt-0.5 mb-[7px] block truncate font-body-sm text-[13px] leading-[17px] text-sourdine">
                          {ligne.reference ?? "—"}
                        </span>

                        <span className="flex items-center gap-2">
                          <PuceExpedition
                            ligne={ligne}
                            maintenant={maintenant}
                            libelles={t}
                            taille="telephone"
                          />
                          {jamaisOuverte ? (
                            <span className="font-label-sm text-[12px] leading-[15px] font-semibold text-alerte">
                              {t("jamaisOuvert")}
                            </span>
                          ) : (
                            <span className="truncate font-body-sm text-[12px] leading-[15px] text-sourdine">
                              {t("photosEtVues", { photos: ligne.photos, vues: ligne.vues })}
                            </span>
                          )}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
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

          <PiedDeListe
            base={base}
            parametres={parametres}
            suivant={page.suivant}
            affichees={page.lignes.length}
            total={total}
          />
        </>
      )}
    </section>
  );
}

/**
 * LA PUCE D'EXPÉDITION — ET LE CINQUIÈME ÉTAT QUE LA BASE NE PORTE PAS.
 *
 * Les planches dessinent quatre statuts et un cinquième libellé : « Sans
 * mouvement · 14 j », en alerte. Ce n'est pas un statut de plus dans l'énumération
 * — c'est le STATUT COURANT plus une DURÉE, calculée à l'affichage depuis la
 * date du dernier mouvement du colis.
 *
 * C'EST LA MÊME RÈGLE QUE SUR LA PAGE CLIENT, et elle passe par la même fonction
 * pure : dix jours, jamais moins. Deux seuils divergents auraient fini par dire
 * « bloqué » au vendeur et « en transit » à son client, ou l'inverse — et
 * personne n'aurait su lequel des deux écrans mentait.
 *
 * ⚠️ UN COLIS LIVRÉ N'EST JAMAIS SILENCIEUX. Sans cette borne, toute commande
 * livrée depuis plus de dix jours serait affichée « sans mouvement » : le
 * silence d'un colis arrivé n'est pas une alerte, c'est la fin normale.
 */
function PuceExpedition({
  ligne,
  maintenant,
  libelles,
  taille = "bureau",
}: {
  readonly ligne: {
    readonly statut: LigneCommande["statut"];
    readonly colisBougeLe: string | null;
  };
  readonly maintenant: Date;
  readonly libelles: (clef: string, valeurs?: Record<string, number | string>) => string;
  readonly taille?: "bureau" | "telephone";
}) {
  const silence =
    ligne.statut === "livre" || ligne.statut === "preparation"
      ? { etat: "recent" as const, jours: 0 }
      : decrireSilence(ligne.colisBougeLe === null ? null : new Date(ligne.colisBougeLe), maintenant);

  if (silence.etat === "silencieux") {
    return (
      <BadgeStatut
        libelle={libelles("statutSansMouvement", { jours: silence.jours })}
        teinte="alerte"
        taille={taille}
      />
    );
  }

  return (
    <BadgeStatut
      libelle={libelles("statut." + ligne.statut)}
      teinte={teinteExpedition(ligne.statut)}
      taille={taille}
    />
  );
}

/**
 * La tuile de 34 px de la planche, et la case de sélection par-dessus.
 *
 * ⚠️ ÉCART ASSUMÉ, ET IL EST DÉLIBÉRÉ. La planche ne dessine aucune case à
 * cocher : sa première colonne ne porte que la vignette. Mais le brief §7 exige
 * les actions groupées — « chaque lot est tout ou tout rien » — et le serveur
 * qui les traite existe, est testé, et resterait injoignable.
 *
 * La case est donc là SANS OCCUPER DE PLACE : invisible et intouchable au
 * repos, elle apparaît au survol de la ligne, au focus clavier, et dès qu'une
 * case est cochée quelque part. L'écran au repos est celui de la planche, au
 * pixel près, et le geste reste possible.
 *
 * `pointer-events-none` AU REPOS N'EST PAS DÉCORATIF : sans lui, un clic sur la
 * vignette cocherait une case qu'on ne voit pas, et le vendeur archiverait en
 * lot une commande qu'il n'a jamais désignée.
 */
function VignetteEtSelection({
  ligne,
  nom,
  libelle,
}: {
  readonly ligne: { readonly id: string; readonly vignette: string | null };
  readonly nom: string;
  readonly libelle: string;
}) {
  return (
    <span className="relative block h-[34px] w-[34px]">
      <Vignette url={ligne.vignette} taille={34} rayon={9} alt={nom} />
      <input
        type="checkbox"
        name="selection"
        value={ligne.id}
        aria-label={libelle}
        className="pointer-events-none absolute inset-0 m-auto h-[18px] w-[18px] cursor-pointer opacity-0 accent-primary outline-offset-2 group-hover/ligne:pointer-events-auto group-hover/ligne:opacity-100 group-has-[input:checked]/lot:pointer-events-auto group-has-[input:checked]/lot:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 checked:pointer-events-auto checked:opacity-100"
      />
    </span>
  );
}

/**
 * La tuile de couverture.
 *
 * SANS IMAGE, ON REND L'APLAT DE LA PLANCHE, pas un symbole de remplacement.
 * Les planches dessinent des carrés de couleur unie — ce sont des vignettes
 * absentes, pas des icônes « pas de photo ». Une commande sans média est l'état
 * NORMAL d'un brouillon, et un pictogramme d'avertissement à cet endroit le
 * ferait passer pour une anomalie cinquante fois par écran.
 */
function Vignette({
  url,
  taille,
  rayon,
  alt = "",
}: {
  readonly url: string | null;
  readonly taille: number;
  readonly rayon: number;
  readonly alt?: string;
}) {
  const style = { width: taille, height: taille, borderRadius: rayon };
  if (url === null) {
    return <span className="block shrink-0 bg-fond-avatar" style={style} />;
  }
  // URL R2 SIGNÉE, À EXPIRATION : `next/image` la remettrait en cache derrière sa
  // propre adresse, donc la servirait encore après l'expiration de la signature —
  // et une URL de média qui survit à sa signature est exactement ce que le bucket
  // privé existe pour empêcher.
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={url}
      alt={alt}
      width={taille}
      height={taille}
      loading="lazy"
      decoding="async"
      className="block shrink-0 object-cover"
      style={style}
    />
  );
}

/**
 * Le pied de liste — « 5 sur 184 » et « Charger la suite ».
 *
 * ÉCART ASSUMÉ SUR LES MAQUETTES D'ORIGINE, qui montraient des numéros de page.
 * Un numéro de page suppose un décalage, et un décalage fait lire 2 000 lignes
 * pour en rendre 50 à la page 40 : le coût croît avec le numéro, donc la lenteur
 * frappe celui qui a le plus de commandes. La planche du canevas dit exactement
 * la même chose que nous — un bouton « Charger la suite », pas de numéros.
 *
 * « PRÉCÉDENT » N'EXISTE PAS ET C'EST VOLONTAIRE : un curseur avant se
 * construirait en inversant le tri, ce qui donnerait une page décalée sur
 * égalité de dates. Le retour se fait par l'historique du navigateur, qui porte
 * exactement les URL déjà visitées.
 */
async function PiedDeListe({
  base,
  parametres,
  suivant,
  affichees,
  total,
}: {
  readonly base: string;
  readonly parametres: ParametresListe;
  readonly suivant: string | null;
  readonly affichees: number;
  readonly total: number | null;
}) {
  const t = await getTranslations("commandes");

  /*
   * ⚠️ « 7 SUR 0 ». Le total compte les commandes NON archivées ; la vue des
   * archives affiche exactement celles qu'il exclut. Le pied annonçait donc
   * « 7 sur 0 » — un dénominateur plus petit que son numérateur, c'est-à-dire un
   * chiffre visiblement faux à l'endroit qui sert à se repérer dans neuf mille
   * lignes. On ne compte pas les archives pour autant : ce serait un second
   * agrégat sur un écran qu'on ouvre rarement. On se tait.
   */
  const archives = parametres.archivees;

  return (
    <div className="mt-[18px] flex items-center justify-between gap-4 border-t border-filet-ligne px-margin-mobile pt-4 md:px-0">
      <p className="font-body-sm text-[13px] text-sourdine">
        {/* ON NE COMPOSE PAS UN DÉNOMINATEUR QU'ON N'A PAS. Quand le compte a
            échoué, la phrase dit s'il reste des commandes, sans prétendre savoir
            combien il y en a. */}
        {total === null || archives
          ? suivant === null
            ? t("finDeListe")
            : t("pageSuivanteDisponible")
          : t("surTotal", { n: affichees, total })}
      </p>

      {suivant !== null ? (
        <LienEcran
          href={lienListe(base, parametres, { curseur: suivant })}
          className="flex min-h-11 items-center rounded-[11px] border border-filet-controle bg-surface-container-lowest px-[18px] font-label-md text-[14px] font-semibold whitespace-nowrap text-on-surface transition-colors hover:bg-fond-neutre md:h-[38px] md:min-h-0"
        >
          {t("chargerLaSuite")}
        </LienEcran>
      ) : null}
    </div>
  );
}

/**
 * ÉTAT VIDE N°1 — CE COMPTE N'A RIEN, planche `CommandesVide`.
 *
 * ICI ON A LE DROIT D'ENSEIGNER : c'est le premier écran du produit. Ni
 * recherche, ni filtres, ni compteurs — rien à filtrer, rien à compter. Les
 * trois étapes numérotées sont le seul endroit du produit où l'on explique ce
 * qu'il fait, et elles disparaissent dès la première commande créée.
 */
async function AccueilCompteVide({ langue }: { readonly langue: string }) {
  const t = await getTranslations("commandes");
  const etapes = ["photos", "suivi", "lien"] as const;

  return (
    <section className="flex flex-grow items-center justify-center px-margin-mobile md:px-0">
      <div className="w-full max-w-[620px] rounded-[22px] border border-outline-variant bg-surface-container-lowest px-6 py-9 text-center md:px-12 md:py-11">
        <span className="degrade-marque mx-auto mb-[22px] flex h-[62px] w-[62px] items-center justify-center rounded-[18px] shadow-[0_14px_30px_-12px_rgba(124,92,245,0.7)]">
          <Icone nom="add" className="text-[27px]" />
        </span>

        <h2 className="font-headline-lg text-[26px] leading-8 font-extrabold tracking-[-0.03em] text-on-surface">
          {t("vide.compteTitre")}
        </h2>
        <p className="mt-2.5 font-body-md text-[15px] leading-6 text-sourdine">
          {t("vide.compteTexte")}
        </p>

        <ol className="mt-8 mb-8 flex flex-col gap-[18px] text-left">
          {etapes.map((etape, index) => (
            <li key={etape} className="flex items-start gap-3.5">
              <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-violet-fond font-label-md text-[13px] font-extrabold text-violet">
                {index + 1}
              </span>
              <span>
                <span className="block font-label-md text-[15px] font-bold text-on-surface">
                  {t("vide.etapes." + etape + ".titre")}
                </span>
                <span className="mt-0.5 block font-body-md text-[14px] leading-[21px] text-sourdine">
                  {t("vide.etapes." + etape + ".texte")}
                </span>
              </span>
            </li>
          ))}
        </ol>

        {/* CRÉER EST UNE MUTATION, donc une Server Action et non un lien vers une
            page qui écrirait au rendu. */}
        <form action={creerBrouillon}>
          <input type="hidden" name="langue" value={langue} />
          <button
            type="submit"
            className="degrade-marque mx-auto flex h-[50px] items-center gap-[9px] rounded-[13px] px-[26px] font-label-md text-[15px] font-bold shadow-[0_10px_24px_-10px_rgba(124,92,245,0.66)] transition-opacity hover:opacity-90"
          >
            <Icone nom="add" className="text-[16px]" />
            {t("nouvelle")}
          </button>
        </form>

        <p className="mt-[18px] font-body-sm text-[13px] text-sourdine">
          {t("vide.marqueQuestion")}{" "}
          <Link
            href={"/" + langue + "/marque"}
            className="font-semibold text-violet hover:text-violet-survol"
          >
            {t("vide.marqueLien")}
          </Link>
        </p>
      </div>
    </section>
  );
}

/**
 * ÉTAT VIDE N°2 — CE FILTRE NE RENVOIE RIEN, planche `CommandesFiltreVide`.
 *
 * ET IL NE DIT SURTOUT PAS « créez votre première commande » : ce vendeur en a
 * cent quatre-vingt-quatre. Lui proposer de commencer serait lui dire qu'on a
 * perdu son travail.
 *
 * TROISIÈME CAUSE, TROUVÉE EN PILOTANT LE PRODUIT : un compte dont TOUTES les
 * commandes sont archivées. L'écran annonçait alors « aucune ne passe les
 * filtres en cours » SANS QU'AUCUN FILTRE SOIT POSÉ, et son seul bouton
 * pointait vers l'adresse déjà ouverte. D'où la règle : UN BOUTON DONT L'ACTION
 * EST DÉJÀ L'ÉTAT COURANT NE SE REND PAS.
 */
async function FiltreSansResultat({
  diagnostic,
  base,
  parametres,
  total,
}: {
  readonly diagnostic: DiagnosticListeVide | null;
  readonly base: string;
  readonly parametres: ParametresListe;
  readonly total: number | null;
}) {
  const t = await getTranslations("commandes");

  // LE DIAGNOSTIC VIENT D'UNE LECTURE, jamais d'une déduction sur les paramètres.
  // Une déduction du genre « aucun filtre donc tout est archivé » reste vraie
  // tant que personne n'ajoute un filtre à `lireCommandes` sans l'ajouter à
  // `listeFiltree` — c'est-à-dire qu'elle tient par une ABSENCE (L-029).
  //
  // Il ne suffit pourtant pas seul : proposer « voir les archives » à qui les
  // consulte déjà rendrait un second bouton sans effet.
  const toutArchive = diagnostic === "tout-archive" && !parametres.archivees;
  const filtree = listeFiltree(parametres);

  return (
    <div className="flex flex-grow items-center justify-center border-y border-outline-variant bg-surface-container-lowest px-6 py-12 text-center md:rounded-[18px] md:border md:p-10">
      <div className="max-w-[460px]">
        <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-[16px] bg-fond-neutre">
          <Icone
            nom={toutArchive ? "inventory_2" : "search"}
            className="text-[24px] text-gris-inactif"
          />
        </span>

        <h2 className="font-headline-md text-[22px] leading-7 font-extrabold tracking-[-0.025em] text-on-surface">
          {toutArchive ? t("vide.archiveTitre") : t("vide.filtreTitre")}
        </h2>
        <p className="mt-2.5 font-body-md text-[15px] leading-6 text-sourdine">
          {toutArchive
            ? t("vide.archiveTexte")
            : total === null
              ? t("vide.filtreTexte")
              : t("vide.filtreTexteChiffre", { total })}
        </p>

        {toutArchive ? (
          <LienEcran
            href={lienListe(base, parametres, { archivees: true })}
            className="mt-6 inline-flex min-h-11 items-center rounded-[12px] border border-filet-controle bg-surface-container-lowest px-[22px] font-label-md text-[15px] font-bold text-on-surface transition-colors hover:bg-fond-neutre md:h-[46px] md:min-h-0"
          >
            {t("vide.voirArchives")}
          </LienEcran>
        ) : filtree ? (
          <LienEcran
            href={base}
            className="mt-6 inline-flex min-h-11 items-center rounded-[12px] border border-filet-controle bg-surface-container-lowest px-[22px] font-label-md text-[15px] font-bold text-on-surface transition-colors hover:bg-fond-neutre md:h-[46px] md:min-h-0"
          >
            {t("toutEffacer")}
          </LienEcran>
        ) : null}

        {/* LA RECHERCHE IGNORE LES ACCENTS, et c'est le moment de le dire : la
            personne devant cet écran vient probablement de chercher un mot
            accentué. */}
        {parametres.q !== "" ? (
          <p className="mt-5 font-body-sm text-[13px] leading-5 text-sourdine">
            {t("vide.accents")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
