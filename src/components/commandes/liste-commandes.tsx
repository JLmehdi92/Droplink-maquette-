import Link from "next/link";
import { AnnonceAuChargement } from "@/components/app/annonce";
import { getFormatter, getTranslations } from "next-intl/server";
import {
  Archive,
  ArchiveRestore,
  CalendarDays,
  ChevronDown,
  ChevronsUpDown,
  CircleAlert,
  Copy,
  Download,
  Ellipsis,
  ExternalLink,
  Images,
  ListFilter,
  Plus,
  X,
} from "lucide-react";
import { LienEcran } from "@/components/lien-ecran";
import { RepliArchivage } from "@/components/commandes/repli-archivage";
import { BoutonAction } from "@/components/bouton-action";
import { BoutonSoumissionUnique } from "@/components/bouton-soumission-unique";
import { DetailsFermable } from "@/components/app/details-fermable";
import { referenceCourte } from "@/lib/commandes/reference";
import {
  STATUTS_EXPEDITION,
  STATUTS_QC,
  TRIS,
  type DiagnosticListeVide,
  type LigneCommande,
  type PageCommandes,
  type ParametresListe,
} from "@/lib/commandes/liste";
import { decrireSilence } from "@/lib/tracking/silence";
import { lienListe, listeFiltree } from "@/lib/commandes/url";
import type { EtatLot } from "@/lib/commandes/lot";
import { creerBrouillon } from "@/lib/commandes/actions";
import { cheminGesteDeListe } from "@/lib/commandes/geste-liste";
import { lienPageClient } from "@/lib/liens/page-client";
import { CopierLienLigne } from "./copier-lien-ligne";
import { BarreLot, CaseTout } from "./selection-lot";
import { VuesListe } from "./vues-liste";

/**
 * LA LISTE DES COMMANDES DE LA REFONTE (maquette, `commandes.html` et
 * `commandes.js`).
 *
 * ⚠️ LA MAQUETTE FILTRE DANS LE NAVIGATEUR, LE PRODUIT NON — ET C'EST LE PRODUIT
 * QUI GAGNE. Un fournisseur à 9 600 commandes ne télécharge pas sa liste pour la
 * trier : vues, filtres, tri, période et pagination restent des LIENS et des
 * formulaires `GET`, lus par le serveur (pagination par curseur, recherche sans
 * accents servie par une colonne générée). L'écran reprend le DESSIN de la
 * maquette, pas son moteur. Archiver une sélection reste un POST natif : il
 * fonctionne même si le JavaScript n'a pas chargé.
 *
 * Ce que la maquette fait et que le produit ne refait pas :
 *  - « Ouvrir la page » ouvre la VRAIE page client dans un onglet, pas une
 *    imitation dans une fenêtre ;
 *  - la frise ne s'anime pas au chargement : elle est rendue par le serveur à
 *    chaque page, et l'animer à chaque « Charger la suite » ferait clignoter la
 *    liste qu'on est en train de lire.
 */

type T = Awaited<ReturnType<typeof getTranslations<"commandes">>>;

const ETAPES = ["preparation", "expedie", "en_transit", "livre"] as const;

/* ---------- les outils de l'en-tête ---------- */

export async function OutilPeriode({ base, parametres }: { readonly base: string; readonly parametres: ParametresListe }) {
  const t = await getTranslations("commandes");
  const format = await getFormatter();
  const jour = (valeur: string): string =>
    format.dateTime(new Date(valeur + "T00:00:00Z"), { day: "numeric", month: "short", timeZone: "UTC" });
  const libelle =
    parametres.du !== null && parametres.au !== null
      ? t("periodeEntreCourt", { du: jour(parametres.du), au: jour(parametres.au) })
      : parametres.du !== null
        ? t("periodeDepuisCourt", { du: jour(parametres.du) })
        : parametres.au !== null
          ? t("periodeJusquaCourt", { au: jour(parametres.au) })
          : t("periodeToutes");
  const posee = parametres.du !== null || parametres.au !== null;
  return (
    <DetailsFermable className="deroulant">
      <summary className="bouton-outil" data-actif={posee || undefined}>
        <CalendarDays aria-hidden="true" className="ic" />
        <span>{libelle}</span>
        <ChevronDown aria-hidden="true" className="ic ic--petit" />
      </summary>
      {/* Les autres critères voyagent en champs cachés : poser une période ne
          défait pas le statut qu'on vient de choisir. */}
      <form method="get" action={base} className="pop pop--droite">
        <ChampsCaches parametres={parametres} sauf={["du", "au"]} />
        <label>
          {t("periodeDu")}
          <input name="du" type="date" defaultValue={parametres.du ?? ""} max={parametres.au ?? undefined} />
        </label>
        <label>
          {t("periodeAu")}
          <input name="au" type="date" defaultValue={parametres.au ?? ""} min={parametres.du ?? undefined} />
        </label>
        <div className="pop__pied">
          {posee ? (
            <LienEcran className="bouton-texte" href={lienListe(base, parametres, { du: null, au: null })}>
              {t("periodeToutes")}
            </LienEcran>
          ) : (
            <span />
          )}
          <button type="submit" className="bouton-app bouton-app--plein">
            {t("appliquer")}
          </button>
        </div>
      </form>
    </DetailsFermable>
  );
}

/**
 * L'EXPORT NE TÉLÉCHARGE PAS AU PREMIER CLIC : le fichier contient les liens
 * publics, et un lien public transfère une capacité, définitivement. Le
 * téléchargement n'existe que sous l'avertissement — deux gestes, comme la
 * révocation d'un lien. Il porte les FILTRES de la vue, pas la sélection.
 */
export async function OutilExport({ parametres }: { readonly parametres: ParametresListe }) {
  const t = await getTranslations("commandes");
  return (
    <DetailsFermable className="deroulant">
      <summary className="bouton-outil">
        <Download aria-hidden="true" className="ic" />
        <span>{t("lot.exporter")}</span>
      </summary>
      <div className="pop pop--droite pop--export">
        <p className="pop__avert">
          <CircleAlert aria-hidden="true" className="ic" />
          {t("lot.exportAvertissement")}
        </p>
        <a className="bouton-app bouton-app--plein" href={lienListe("/api/commandes/export", { ...parametres, curseur: null }, {})}>
          {t("lot.exportTelecharger")}
        </a>
      </div>
    </DetailsFermable>
  );
}

/* ---------- la barre de la liste : vues, filtres, tri ---------- */

export async function BarreListe({
  base,
  parametres,
  outils,
}: {
  readonly base: string;
  readonly parametres: ParametresListe;
  /** Faux sur un résultat vide : il n'y a rien à filtrer ni à trier dans rien. */
  readonly outils: boolean;
}) {
  const t = await getTranslations("commandes");
  const restrictif = parametres.tri === "jamais-ouvert" || parametres.tri === "bloquees";
  const sortir = restrictif ? { tri: "recentes" as const } : {};
  const vues = [
    { clef: "toutes", href: lienListe(base, parametres, { statut: null, ...sortir }), actif: parametres.statut === null && !restrictif },
    { clef: "enTransit", href: lienListe(base, parametres, { statut: "en_transit", ...sortir }), actif: parametres.statut === "en_transit" && !restrictif },
    { clef: "jamaisOuvertes", href: lienListe(base, parametres, { tri: "jamais-ouvert", statut: null }), actif: parametres.tri === "jamais-ouvert" },
    { clef: "bloquees", href: lienListe(base, parametres, { tri: "bloquees", statut: null }), actif: parametres.tri === "bloquees" },
  ].map((v) => ({ ...v, libelle: t(`vues.${v.clef}`) }));
  const nFiltres = [parametres.statut !== null && parametres.statut !== "en_transit", parametres.qc !== null, parametres.archivees].filter(Boolean).length;

  return (
    <div className="barre-liste">
      <VuesListe etiquette={t("vuesTitre")} vues={vues} />
      {outils ? (
        <div className="barre-liste__outils">
          <DetailsFermable className="deroulant">
            <summary className="bouton-outil">
              <ListFilter aria-hidden="true" className="ic" />
              <span>{t("filtres")}</span>
              {nFiltres > 0 ? <b className="bouton-outil__n">{nFiltres}</b> : null}
            </summary>
            <form method="get" action={base} className="pop pop--droite pop--filtres">
              <ChampsCaches parametres={parametres} sauf={["statut", "qc", "archivees"]} />
              <label>
                {t("statutExpedition")}
                <select name="statut" defaultValue={parametres.statut ?? ""}>
                  <option value="">{t("tousStatuts")}</option>
                  {STATUTS_EXPEDITION.map((s) => (
                    <option key={s} value={s}>
                      {t(`statut.${s}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("statutQc")}
                <select name="qc" defaultValue={parametres.qc ?? ""}>
                  <option value="">{t("tousQc")}</option>
                  {STATUTS_QC.map((s) => (
                    <option key={s} value={s}>
                      {t(`qc.${s}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="case">
                <input type="checkbox" name="archivees" value="1" defaultChecked={parametres.archivees} />
                <span>{t("voirArchivees")}</span>
              </label>
              <div className="pop__pied">
                {listeFiltree(parametres) ? (
                  <LienEcran className="bouton-texte" href={base}>
                    {t("toutEffacer")}
                  </LienEcran>
                ) : (
                  <span />
                )}
                <button type="submit" className="bouton-app bouton-app--plein">
                  {t("appliquer")}
                </button>
              </div>
            </form>
          </DetailsFermable>
          {/* Le tri est fait de LIENS : il se pose d'un geste et se lit dans l'URL. */}
          <DetailsFermable className="deroulant">
            <summary className="bouton-outil">
              <ChevronsUpDown aria-hidden="true" className="ic" />
              <span>{parametres.tri === "recentes" ? t("trier") : t(`tri.${parametres.tri}`)}</span>
            </summary>
            <div className="pop pop--droite pop--menu">
              {TRIS.map((tri) => (
                <LienEcran
                  key={tri}
                  href={lienListe(base, parametres, { tri })}
                  aria-current={parametres.tri === tri ? "true" : undefined}
                >
                  {t(`tri.${tri}`)}
                </LienEcran>
              ))}
            </div>
          </DetailsFermable>
        </div>
      ) : null}
    </div>
  );
}

/** Les critères en cours, chacun retirable seul (maquette, `.puces`). */
export async function PucesFiltres({ base, parametres }: { readonly base: string; readonly parametres: ParametresListe }) {
  if (!listeFiltree(parametres)) return null;
  const t = await getTranslations("commandes");
  const format = await getFormatter();
  const jour = (valeur: string): string =>
    format.dateTime(new Date(valeur + "T00:00:00Z"), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const periode =
    parametres.du !== null && parametres.au !== null
      ? t("puce.periodeEntre", { du: jour(parametres.du), au: jour(parametres.au) })
      : parametres.du !== null
        ? t("puce.periodeDepuis", { du: jour(parametres.du) })
        : parametres.au !== null
          ? t("puce.periodeJusqua", { au: jour(parametres.au) })
          : null;
  const puces = [
    parametres.q !== "" ? { clef: "q", libelle: t("puce.recherche", { q: parametres.q }), href: lienListe(base, parametres, { q: "" }) } : null,
    // « En transit » est une VUE : son onglet le dit déjà, une puce le dirait deux fois.
    parametres.statut !== null && parametres.statut !== "en_transit"
      ? { clef: "statut", libelle: t("puce.statut", { valeur: t(`statut.${parametres.statut}`) }), href: lienListe(base, parametres, { statut: null }) }
      : null,
    parametres.qc !== null ? { clef: "qc", libelle: t("puce.qc", { valeur: t(`qc.${parametres.qc}`) }), href: lienListe(base, parametres, { qc: null }) } : null,
    periode !== null ? { clef: "periode", libelle: periode, href: lienListe(base, parametres, { du: null, au: null }) } : null,
    parametres.archivees ? { clef: "archivees", libelle: t("puce.archivees"), href: lienListe(base, parametres, { archivees: false }) } : null,
  ].filter((p) => p !== null);
  if (puces.length === 0) return null;
  return (
    <div className="puces">
      <span className="puces__titre">{t("filtresActifsLabel")}</span>
      {puces.map((p) => (
        <LienEcran key={p.clef} className="puce" href={p.href} aria-label={t("retirerFiltre", { filtre: p.libelle })}>
          {p.libelle}
          <X aria-hidden="true" className="ic" />
        </LienEcran>
      ))}
      <LienEcran className="bouton-texte" href={base}>
        {t("toutEffacer")}
      </LienEcran>
    </div>
  );
}

/* ---------- la liste ---------- */

export async function ListeCommandes({
  base,
  langue,
  origine,
  nomDeLien,
  parametres,
  page,
  lot,
  total,
}: {
  readonly base: string;
  readonly langue: string;
  readonly origine: string;
  readonly nomDeLien: string | null;
  readonly parametres: ParametresListe;
  readonly page: PageCommandes;
  readonly lot: { readonly etat: EtatLot | null; readonly nombre: number };
  readonly total: number | null;
}) {
  const t = await getTranslations("commandes");
  const format = await getFormatter();
  const maintenant = new Date();
  const retour = lienListe(base, parametres, {});
  const geste = cheminGesteDeListe(langue);
  // Sur une page suivante (curseur), « n sur total » compterait la page seule.
  const avecTotal =
    total !== null && parametres.curseur === null && !parametres.archivees && !listeFiltree(parametres) && parametres.tri !== "jamais-ouvert" && parametres.tri !== "bloquees";

  if (page.diagnostic === "aucune-commande") return <AccueilCompteVide langue={langue} />;

  const dateLongue = (iso: string) =>
    format.dateTime(new Date(iso), { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

  return (
    <>
      {/* Le résultat du dernier lot, dit : un lot refusé et un lot en panne ne se
          disent pas pareil, et « rien n'a été modifié » est une information. */}
      {/* UN SUCCÈS SE DIT DANS LA BULLE (maquette : « 3 commandes traitées. »), un refus
          reste écrit au-dessus de la liste : il demande qu'on le relise. Sans JavaScript, le
          succès reste écrit aussi. */}
      {lot.etat === "ok" ? (
        <>
          <AnnonceAuChargement texte={t("lot.ok", { n: lot.nombre })} retirer={["lot", "n"]} />
          <noscript>
            <p className="message-lot" data-ton="ok">
              {t("lot.ok", { n: lot.nombre })}
            </p>
          </noscript>
        </>
      ) : lot.etat !== null ? (
        <p role="status" className="message-lot" data-ton="refus">
          {t(`lot.${lot.etat}`)}
        </p>
      ) : null}

      <section className="bloc liste" aria-label={t("titre")}>
        <RepliArchivage />
        {page.lignes.length === 0 ? (
          <FiltreSansResultat diagnostic={page.diagnostic} base={base} parametres={parametres} total={total} />
        ) : (
          <>
            {/* LE FORMULAIRE DE LOT ENVELOPPE LA LISTE ; les gestes d'une ligne sont
                des formulaires rendus APRÈS lui, atteints par l'attribut `form` de
                leurs boutons (HTML interdit d'imbriquer deux formulaires). POST
                natif et non Server Action : ces gestes reviennent sur la MÊME
                route, et le routeur client jette une telle navigation en
                production (`@/lib/commandes/geste-liste`). */}
            <form method="post" action={geste} className="liste__lot">
              <input type="hidden" name="geste" value="lot" />
              <input type="hidden" name="retour" value={retour} />
              <div className="liste__table" role="table" aria-label={t("titre")} data-table>
                <div className="rangee rangee--tete" role="row">
                  <span role="columnheader">
                    <CaseTout libelle={t("toutSelectionner")} />
                  </span>
                  <span role="columnheader">{t("colonne.commande")}</span>
                  <span role="columnheader">{t("colonne.date")}</span>
                  <span role="columnheader">{t("colonne.client")}</span>
                  <span role="columnheader" className="col-produits">
                    {t("colonne.produits")}
                  </span>
                  <span role="columnheader">{t("colonne.numeroSuivi")}</span>
                  <span role="columnheader">{t("colonne.statutCourt")}</span>
                  <span role="columnheader">{t("colonne.suivi")}</span>
                  <span role="columnheader">
                    <span className="visuellement-cache">{t("colonne.actions")}</span>
                  </span>
                </div>
                {page.lignes.map((ligne, rang) => (
                  <Ligne
                    key={ligne.id}
                    rang={rang}
                    ligne={ligne}
                    base={base}
                    lien={lienPageClient(origine, ligne.jetonPublic, nomDeLien)}
                    maintenant={maintenant}
                    t={t}
                    jour={format.dateTime(new Date(ligne.creeeLe), {
                      day: "numeric",
                      month: "short",
                      // L'année seulement quand elle n'est pas la courante : sinon ambiguë.
                      ...(new Date(ligne.creeeLe).getFullYear() === maintenant.getFullYear() ? {} : { year: "numeric" }),
                    })}
                    heure={format.dateTime(new Date(ligne.creeeLe), { hour: "2-digit", minute: "2-digit" })}
                    derniereVue={ligne.derniereVueLe === null ? null : dateLongue(ligne.derniereVueLe)}
                    dernierMouvement={ligne.colisBougeLe === null ? null : dateLongue(ligne.colisBougeLe)}
                  />
                ))}
              </div>
              <BarreLot
                langue={langue}
                libelles={{
                  region: t("lot.titre"),
                  un: t("lot.selectionUn"),
                  plusieurs: t("lot.selectionPlusieurs"),
                  fermer: t("lot.toutDeselectionner"),
                }}
              >
                {/* `name` ET `value` SONT LES DONNÉES : c'est ce bouton qui dit
                    s'il faut archiver ou désarchiver. Tout ou rien. */}
                <BoutonAction
                  name="archiver"
                  value={parametres.archivees ? "0" : "1"}
                  libelles={{
                    repos: parametres.archivees ? t("lot.desarchiver") : t("lot.archiver"),
                    enCours: t("lot.enCours"),
                    reussi: parametres.archivees ? t("lot.desarchiver") : t("lot.archiver"),
                    echoue: parametres.archivees ? t("lot.desarchiver") : t("lot.archiver"),
                  }}
                  className="bouton-app bouton-app--plein"
                />
              </BarreLot>
            </form>
            {/* Les formulaires des gestes de ligne, hors du formulaire de lot :
                chacun porte SES champs. */}
            <div hidden>
              {page.lignes.map((ligne) => (
                <div key={ligne.id}>
                  <form id={"arch-" + ligne.id} method="post" action={geste}>
                    <input type="hidden" name="geste" value="archiver" />
                    <input type="hidden" name="id" value={ligne.id} />
                    <input type="hidden" name="archiver" value={ligne.archiveeLe === null ? "1" : "0"} />
                    <input type="hidden" name="retour" value={retour} />
                  </form>
                  <form id={"dup-" + ligne.id} method="post" action={geste}>
                    <input type="hidden" name="geste" value="dupliquer" />
                    <input type="hidden" name="id" value={ligne.id} />
                    <input type="hidden" name="langue" value={langue} />
                    <input type="hidden" name="retour" value={retour} />
                  </form>
                </div>
              ))}
            </div>
            <p className="liste__pied">
              {/* On ne compose pas un dénominateur qu'on n'a pas : le jeu filtré
                  n'est jamais compté exactement, aucun index ne le rattraperait.
                  Le total des commandes actives ne vaut que pour la liste entière. */}
              <span>
                {avecTotal && total !== null
                  ? t("surTotal", { n: page.lignes.length, total })
                  : page.suivant === null
                    ? t("finDeListe")
                    : t("pageSuivanteDisponible")}
              </span>
              {page.suivant !== null ? (
                <LienEcran className="liste__suite" href={lienListe(base, parametres, { curseur: page.suivant })}>
                  {t("chargerLaSuite")}
                </LienEcran>
              ) : avecTotal ? (
                <span>{t("finDeListe")}</span>
              ) : null}
            </p>
          </>
        )}
      </section>
    </>
  );
}

function Ligne({
  rang,
  ligne,
  base,
  lien,
  maintenant,
  t,
  jour,
  heure,
  derniereVue,
  dernierMouvement,
}: {
  /** Le rang de la ligne : la frise se remplit en cascade au premier chargement. */
  readonly rang: number;
  readonly ligne: LigneCommande;
  readonly base: string;
  readonly lien: string;
  readonly maintenant: Date;
  readonly t: T;
  readonly jour: string;
  readonly heure: string;
  readonly derniereVue: string | null;
  readonly dernierMouvement: string | null;
}) {
  const nom = ligne.client ?? t("sansNom");
  const ref = referenceCourte(ligne.id);
  const silence = decrireSilence(ligne.colisBougeLe === null ? null : new Date(ligne.colisBougeLe), maintenant, ligne.statut);
  const enSilence = silence.etat === "silencieux";
  const k = ETAPES.indexOf(ligne.statut);
  const info =
    dernierMouvement !== null
      ? t("frise.dernierMouvement", { date: dernierMouvement })
      : ligne.numeroSuivi !== null
        ? t("frise.sansInfo")
        : t("frise.sansNumero");
  const ton = ligne.statut === "livre" ? "livre" : ligne.statut === "preparation" ? "attente" : "transit";
  const vues = ligne.vues === 0 ? t("jamaisOuvert") : t("vuesCourt", { n: ligne.vues });

  return (
    <div className="rangee" role="none">
      <div className="rangee__corps" role="row">
        <span role="cell">
          <label className="coche">
            <input type="checkbox" name="selection" value={ligne.id} aria-label={t("selectionner", { client: nom })} />
            <i />
          </label>
        </span>
        <span role="cell" className="col-commande">
          <Vignette url={ligne.vignettes[0] ?? null} taille={36} />
          <Link href={`${base}/${ligne.id}`} aria-label={t("ouvrirCommande", { reference: ref })}>
            {ref}
          </Link>
        </span>
        <span role="cell" className="col-date">
          <span>{jour}</span>
          <small>{heure}</small>
        </span>
        <span role="cell" className="col-client">
          <b>{nom}</b>
          {ligne.vues === 0 ? (
            <small className="jamais" title={t("jamaisOuvertAide", { client: nom })}>
              {vues}
            </small>
          ) : (
            <small title={derniereVue === null ? undefined : t("derniereVue", { date: derniereVue })}>{vues}</small>
          )}
        </span>
        <span role="cell" className="col-produits">
          {ligne.photos === 0 ? (
            <span className="vide">—</span>
          ) : (
            <span className="vignettes">
              {ligne.vignettes.map((url) => (
                <Vignette key={url} url={url} taille={30} />
              ))}
              {ligne.photos > ligne.vignettes.length ? <em>{t("plusMedias", { n: ligne.photos - ligne.vignettes.length })}</em> : null}
            </span>
          )}
        </span>
        <span role="cell" className="col-suivi">
          {ligne.numeroSuivi ?? <span className="vide">{t("aucunSuivi")}</span>}
        </span>
        <span role="cell" className="col-statut">
          {enSilence ? (
            <span className="badge" data-ton="silence">
              {t("statutSansMouvement", { jours: silence.jours })}
            </span>
          ) : (
            <span className="badge" data-ton={ton}>
              {t(`statut.${ligne.statut}`)}
            </span>
          )}
          {/* Le lien bloqué par l'administration : un état du LIEN, qui s'ajoute au
              statut du colis sans le remplacer. */}
          {ligne.lienBloqueLe === null ? null : (
            <span className="badge" data-ton="refus">
              {t("lienBloque")}
            </span>
          )}
        </span>
        <span role="cell" className="col-frise">
          <span
            className="frise"
            data-ton={ligne.statut === "livre" ? "livre" : enSilence ? "silence" : undefined}
            style={{ "--k": k } as React.CSSProperties}
            title={info}
          >
            <span className="visuellement-cache">
              {enSilence ? t("frise.silence", { jours: silence.jours }) : t(`statut.${ligne.statut}`)}. {info}.
            </span>
            <i className="frise__rail" aria-hidden="true">
              <i className="frise__plein" style={{ "--i": rang } as React.CSSProperties} />
            </i>
            {ETAPES.map((e, i) => (
              <span
                key={e}
                className="frise__etape"
                data-etat={i < k || ligne.statut === "livre" ? "fait" : i === k ? "actuel" : "avenir"}
                aria-hidden="true"
              >
                <i />
                <small>{t(`statut.${e}`)}</small>
              </span>
            ))}
          </span>
        </span>
        <span role="cell" className="col-actions">
          <CopierLienLigne lien={lien} libelles={{ copier: t("copierLien", { client: nom }), echec: t("copieEchouee"), copie: t("lienCopie", { client: nom }) }} />
          <a className="action-ligne" href={lien} target="_blank" rel="noopener noreferrer" aria-label={t("ouvrirPage", { client: nom })} title={t("ouvrirPage", { client: nom })}>
            <ExternalLink aria-hidden="true" className="ic" />
          </a>
          {/* Un `name` partagé : ouvrir un menu ferme celui qui l'était. */}
          <DetailsFermable className="deroulant" name="actions-commande" fixe>
            <summary className="action-ligne" aria-label={t("plusDActions", { client: nom })}>
              <Ellipsis aria-hidden="true" className="ic" />
            </summary>
            <div className="pop pop--menu pop--ligne">
              {/* Une seule soumission : un double-clic créait DEUX copies, chacune
                  décomptée du quota du compte. */}
              <BoutonSoumissionUnique form={"dup-" + ligne.id}>
                <Copy aria-hidden="true" className="ic" />
                {t("dupliquer")}
              </BoutonSoumissionUnique>
              <button type="submit" form={"arch-" + ligne.id}>
                {ligne.archiveeLe === null ? <Archive aria-hidden="true" className="ic" /> : <ArchiveRestore aria-hidden="true" className="ic" />}
                {ligne.archiveeLe === null ? t("archiverCourt") : t("desarchiverCourt")}
              </button>
            </div>
          </DetailsFermable>
        </span>
        {/* Au téléphone, la date et le compte de vues de la colonne « Client » sont
            masqués : la carte les dit ici (lu par un lecteur d'écran, puisque la
            colonne ne l'est plus). Invisible au bureau. */}
        <span className="carte-meta" role="cell">
          {jour} · {t("nbPhotos", { n: ligne.photos })} · {vues}
        </span>
      </div>
    </div>
  );
}

function Vignette({ url, taille }: { readonly url: string | null; readonly taille: number }) {
  if (url === null) {
    return (
      <span className="vignette-vide" style={{ width: taille, height: taille }} aria-hidden="true">
        <Images className="ic" />
      </span>
    );
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element --
       URL signée à expiration : `next/image` la resservirait après expiration. */
    <img src={url} alt="" width={taille} height={taille} loading="lazy" decoding="async" />
  );
}

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
  const toutArchive = diagnostic === "tout-archive" && !parametres.archivees;
  return (
    <div className="liste__vide">
      <p className="liste__vide-titre">{toutArchive ? t("vide.archiveTitre") : t("vide.filtreTitre")}</p>
      <p>
        {toutArchive ? t("vide.archiveTexte") : total === null ? t("vide.filtreTexte") : t("vide.filtreTexteChiffre", { total })}
      </p>
      {/* La recherche ignore les accents, et c'est le moment de le dire. */}
      {parametres.q !== "" ? <p>{t("vide.accents")}</p> : null}
      {toutArchive ? (
        <LienEcran className="bouton-app bouton-app--second" href={lienListe(base, parametres, { archivees: true })}>
          {t("vide.voirArchives")}
        </LienEcran>
      ) : listeFiltree(parametres) || parametres.tri !== "recentes" ? (
        <LienEcran className="bouton-app bouton-app--second" href={base}>
          {t("toutEffacer")}
        </LienEcran>
      ) : null}
    </div>
  );
}

/**
 * LE COMPTE VIDE : ni recherche, ni compteurs, ni filtres — il n'y a rien à
 * chercher dans rien. Trois étapes et une seule action. La maquette ne dessine
 * pas cet état ; il prend la grammaire de ses états (`.etat`).
 */
async function AccueilCompteVide({ langue }: { readonly langue: string }) {
  const t = await getTranslations("commandes");
  const etapes = ["photos", "suivi", "lien"] as const;
  return (
    <section className="bloc compte-vide">
      <span className="compte-vide__tuile" aria-hidden="true">
        <Plus className="ic" />
      </span>
      <h2>{t("vide.compteTitre")}</h2>
      <p>{t("vide.compteTexte")}</p>
      <ol className="compte-vide__etapes">
        {etapes.map((etape, i) => (
          <li key={etape}>
            <span aria-hidden="true">{i + 1}</span>
            <span>
              <b>{t(`vide.etapes.${etape}.titre`)}</b>
              <small>{t(`vide.etapes.${etape}.texte`)}</small>
            </span>
          </li>
        ))}
      </ol>
      <form action={creerBrouillon}>
        <input type="hidden" name="langue" value={langue} />
        <BoutonAction
          libelles={{
            repos: t("nouvelle"),
            enCours: t("nouvelleEnCours"),
            reussi: t("nouvelle"),
            echoue: t("nouvelle"),
          }}
          className="bouton-app bouton-app--plein"
        />
      </form>
      <p className="compte-vide__marque">
        {t("vide.marqueQuestion")}{" "}
        <LienEcran className="lien-texte" href={`/${langue}/marque`}>
          {t("vide.marqueLien")}
        </LienEcran>
      </p>
    </section>
  );
}

/** Les critères en cours, recopiés en champs cachés (sauf ceux que le formulaire saisit). */
function ChampsCaches({
  parametres,
  sauf,
}: {
  readonly parametres: ParametresListe;
  readonly sauf: ReadonlyArray<"statut" | "qc" | "archivees" | "du" | "au">;
}) {
  const champs: Array<[string, string]> = [];
  if (parametres.q !== "") champs.push(["q", parametres.q]);
  if (parametres.tri !== "recentes") champs.push(["tri", parametres.tri]);
  if (!sauf.includes("statut") && parametres.statut !== null) champs.push(["statut", parametres.statut]);
  if (!sauf.includes("qc") && parametres.qc !== null) champs.push(["qc", parametres.qc]);
  if (!sauf.includes("archivees") && parametres.archivees) champs.push(["archivees", "1"]);
  if (!sauf.includes("du") && parametres.du !== null) champs.push(["du", parametres.du]);
  if (!sauf.includes("au") && parametres.au !== null) champs.push(["au", parametres.au]);
  return (
    <>
      {champs.map(([nom, valeur]) => (
        <input key={nom} type="hidden" name={nom} value={valeur} />
      ))}
    </>
  );
}
