import { getFormatter, getTranslations } from "next-intl/server";
import { ChevronDown, ChevronsUpDown, CircleAlert, Ellipsis, ExternalLink, Package, Search } from "lucide-react";
import { decrireSilence } from "@/lib/tracking/silence";
import type { CompteursEnvois, Etat, EvolutionEnvois, PageEnvois, ParametresEnvois } from "@/lib/envois/liste";
import { ETATS, TRIS } from "@/lib/envois/liste";
import { DetailsFermable } from "@/components/app/details-fermable";
import { ValeurRoulee } from "@/components/app/couche-v4";
import { LienEcran } from "@/components/lien-ecran";
import { BarreLot, CaseTout } from "@/components/commandes/selection-lot";
import { lireTransporteur } from "@/lib/tracking/transporteurs";

/**
 * LE SUIVI D'ENVOIS DE LA REFONTE (maquette, `envois.html` et `envois.js`).
 *
 * Comme pour les commandes, la maquette filtre dans le navigateur et le produit
 * non : statut, transporteur, recherche, tri et pagination sont des LIENS et un
 * formulaire `GET`, lus par le serveur (curseur). L'écran reprend le DESSIN.
 *
 * Ce que le produit garde et que la maquette n'a pas :
 *  - la sélection EXPORTE (formulaire `GET` vers `/api/envois/export`) — rien
 *    n'est écrit, aucune garde CSRF à poser pour une lecture ;
 *  - aucune « interrogation maintenant » : chaque interrogation se paie sur un
 *    palier de prises en charge À VIE, et la cadence de `lib/tracking` existe
 *    pour les espacer ;
 *  - le transporteur inconnu n'affiche RIEN, jamais « Transporteur inconnu ».
 */

function lien(base: string, actuels: ParametresEnvois, modif: Record<string, string | null>): string {
  const p = new URLSearchParams();
  if (actuels.tri !== "immobiles") p.set("tri", actuels.tri);
  if (actuels.etat !== null) p.set("etat", actuels.etat);
  if (actuels.q !== null) p.set("q", actuels.q);
  if (actuels.transporteur !== null) p.set("transporteur", String(actuels.transporteur));
  if (actuels.silencieux) p.set("silencieux", "oui");
  if (actuels.abandonnes !== null) p.set("abandonnes", actuels.abandonnes ? "oui" : "non");
  for (const [cle, valeur] of Object.entries(modif)) {
    if (valeur === null || valeur === "") p.delete(cle);
    else p.set(cle, valeur);
  }
  // Un filtre qui change repart du début : un curseur ne vaut que pour SA liste.
  if (!("curseur" in modif)) p.delete("curseur");
  const q = p.toString();
  return q === "" ? base : base + "?" + q;
}

const ETAPES = ["preparation", "expedie", "en_transit", "livre"] as const;
const TON: Readonly<Record<Etat, string>> = { preparation: "attente", expedie: "transit", en_transit: "transit", livre: "livre" };

export async function TableauEnvois({
  base,
  langue,
  parametres,
  page,
  compteurs,
  evolution,
  maintenant,
}: {
  readonly base: string;
  readonly langue: string;
  readonly parametres: ParametresEnvois;
  readonly page: PageEnvois;
  readonly compteurs: CompteursEnvois;
  readonly evolution: EvolutionEnvois;
  readonly maintenant: Date;
}) {
  const t = await getTranslations("envois");
  const format = await getFormatter();
  const aUnFiltre =
    parametres.etat !== null || parametres.silencieux || parametres.abandonnes !== null || parametres.transporteur !== null || parametres.q !== null;
  const commandes = base.replace(/\/envois$/, "/commandes");

  const decrire = (ligne: PageEnvois["lignes"][number]) => {
    const silence = decrireSilence(ligne.dernierMouvement === null ? null : new Date(ligne.dernierMouvement), maintenant, ligne.etat);
    const silencieux = silence.etat === "silencieux";
    const anciennete =
      silence.etat === "aucun-mouvement"
        ? null
        : silence.jours === 0
          ? t("mouvement.aujourdhui")
          : silence.jours === 1
            ? t("mouvement.hier")
            : t("mouvement.jours", { n: silence.jours });
    const prochaine = ((): { texte: string | null; ton?: string } => {
      if (ligne.etat === "livre") return { texte: t("prochaine.livre"), ton: "livre" };
      if (silencieux) return { texte: t("prochaine.silence", { n: silence.jours }), ton: "silence" };
      const borne = ligne.arriveeAu === null ? (ligne.arriveeDu === null ? null : new Date(ligne.arriveeDu)) : new Date(ligne.arriveeAu);
      if (borne === null || Number.isNaN(borne.getTime())) return { texte: ligne.dernierPoint };
      const jour = (x: Date) => Date.UTC(x.getFullYear(), x.getMonth(), x.getDate());
      const ecart = Math.round((jour(borne) - jour(maintenant)) / 86_400_000);
      if (ecart === 0) return { texte: t("prochaine.aujourdhui"), ton: "bientot" };
      if (ecart < 0) return { texte: ligne.dernierPoint };
      return { texte: t("prochaine.le", { date: format.dateTime(borne, { day: "numeric", month: "long" }) }) };
    })();
    return { silencieux, silence, anciennete, prochaine, transporteur: lireTransporteur(ligne.transporteur) };
  };

  const libelleStatut = parametres.silencieux
    ? t("filtres.silencieux")
    : parametres.abandonnes === true
      ? t("abandonne")
      : parametres.etat === null
        ? t("filtres.tousStatuts")
        : t(`etat.${parametres.etat}`);
  // Les transporteurs proposés sont ceux de la page lue : le catalogue entier
  // proposerait des filtres qui ne rendent rien.
  const transporteursVus = [
    ...new Map(
      page.lignes
        .filter((l) => l.transporteur !== null && lireTransporteur(l.transporteur) !== null)
        .map((l) => [lireTransporteur(l.transporteur)?.nom ?? "", l.transporteur as number] as const),
    ),
  ].sort((a, b) => a[0].localeCompare(b[0]));
  const statutActif = parametres.etat !== null || parametres.silencieux || parametres.abandonnes === true;

  const tuiles = [
    { cle: "total", valeur: compteurs.total, filtre: {}, actif: !statutActif, alerte: false },
    { cle: "preparation", valeur: compteurs.preparation, filtre: { etat: "preparation" }, actif: parametres.etat === "preparation", alerte: false },
    { cle: "enTransit", valeur: compteurs.enTransit, filtre: { etat: "en_transit" }, actif: parametres.etat === "en_transit", alerte: false },
    { cle: "silencieux", valeur: compteurs.silencieux, filtre: { silencieux: "oui" }, actif: parametres.silencieux, alerte: true },
    { cle: "livresCeMois", valeur: compteurs.livresCeMois, filtre: { etat: "livre" }, actif: parametres.etat === "livre", alerte: false },
  ] as const;

  return (
    <>
      {/* LES CINQ COMPTEURS FILTRENT LA LISTE (maquette) : ce sont des liens.
          Le seul jugement de couleur est l'alerte « sans mouvement » : un chiffre
          se vérifie, une appréciation se discute. */}
      <nav className="compteurs compteurs--5 compteurs--liens v4-carte" aria-label={t("compteurs.titre")}>
        {tuiles.map((c) => (
          <LienEcran
            key={c.cle}
            className="compteur-app compteur-app--bouton"
            href={lien(base, parametres, { etat: null, silencieux: null, abandonnes: null, ...c.filtre })}
            aria-current={c.actif ? "true" : undefined}
            data-alerte={c.alerte && c.valeur > 0 ? "" : undefined}
          >
            <span className="compteur-app__titre">{t(`compteurs.${c.cle}`)}</span>
            <span className="compteur-app__valeur">
              <ValeurRoulee texte={format.number(c.valeur)} />
            </span>
            {c.cle === "total" && evolution.pris !== null ? (
              <span className="compteur-app__dessous">
                {/* `pris` est un POURCENTAGE d'évolution (`variation()`), pas un nombre
                    de colis : sans son « % », « +12 » se lirait douze colis de plus. */}
                <span className="delta" data-ton={evolution.pris > 0 ? "hausse" : evolution.pris < 0 ? "baisse" : undefined}>
                  {t("compteurs.evolution", {
                    valeur: format.number(evolution.pris / 100, { style: "percent", signDisplay: "exceptZero" }),
                  })}
                </span>
              </span>
            ) : null}
          </LienEcran>
        ))}
      </nav>

      <div className="barre-envois">
        <div className="barre-envois__filtres">
          <DetailsFermable className="deroulant">
            <summary className="bouton-outil" data-actif={statutActif || undefined}>
              <span>{libelleStatut}</span>
              <ChevronDown aria-hidden="true" className="ic ic--petit" />
            </summary>
            <div className="pop pop--menu">
              <LienEcran
                href={lien(base, parametres, { etat: null, silencieux: null, abandonnes: null })}
                aria-current={!statutActif ? "true" : undefined}
              >
                {t("filtres.tousStatuts")}
              </LienEcran>
              {ETATS.map((etat: Etat) => (
                <LienEcran
                  key={etat}
                  href={lien(base, parametres, { etat, silencieux: null, abandonnes: null })}
                  aria-current={parametres.etat === etat ? "true" : undefined}
                >
                  {t(`etat.${etat}`)}
                </LienEcran>
              ))}
              <LienEcran
                href={lien(base, parametres, { silencieux: "oui", etat: null, abandonnes: null })}
                aria-current={parametres.silencieux ? "true" : undefined}
              >
                {t("filtres.silencieux")}
              </LienEcran>
              {/* Les colis dont personne ne dira plus rien : un numéro non reconnu
                  se répare en précisant son transporteur dans la fiche. */}
              <LienEcran
                href={lien(base, parametres, { abandonnes: "oui", etat: null, silencieux: null })}
                aria-current={parametres.abandonnes === true ? "true" : undefined}
              >
                {t("abandonne")}
              </LienEcran>
            </div>
          </DetailsFermable>
          {transporteursVus.length === 0 && parametres.transporteur === null ? null : (
            <DetailsFermable className="deroulant">
              <summary className="bouton-outil" data-actif={parametres.transporteur !== null || undefined}>
                <span>
                  {parametres.transporteur === null
                    ? t("filtres.tousTransporteurs")
                    : (lireTransporteur(parametres.transporteur)?.nom ?? t("filtres.tousTransporteurs"))}
                </span>
                <ChevronDown aria-hidden="true" className="ic ic--petit" />
              </summary>
              <div className="pop pop--menu">
                <LienEcran href={lien(base, parametres, { transporteur: null })} aria-current={parametres.transporteur === null ? "true" : undefined}>
                  {t("filtres.tousTransporteurs")}
                </LienEcran>
                {transporteursVus.map(([nom, code]) => (
                  <LienEcran
                    key={code}
                    href={lien(base, parametres, { transporteur: String(code) })}
                    aria-current={parametres.transporteur === code ? "true" : undefined}
                  >
                    {nom}
                  </LienEcran>
                ))}
              </div>
            </DetailsFermable>
          )}
          {/* La recherche porte sur le NUMÉRO. À la frappe, 160 ms après la dernière lettre
              (maquette `envois.js`, `data-frappe-directe`) — pas une requête par lettre — et
              à l'entrée ; sans JavaScript, à l'entrée seulement. Les autres filtres voyagent
              en champs cachés. */}
          <form method="get" action={base} className="recherche-envoi" role="search" data-sur-place="" data-frappe-directe="">
            {parametres.etat === null ? null : <input type="hidden" name="etat" value={parametres.etat} />}
            {parametres.silencieux ? <input type="hidden" name="silencieux" value="oui" /> : null}
            {parametres.abandonnes === null ? null : <input type="hidden" name="abandonnes" value={parametres.abandonnes ? "oui" : "non"} />}
            {parametres.tri === "immobiles" ? null : <input type="hidden" name="tri" value={parametres.tri} />}
            {parametres.transporteur === null ? null : <input type="hidden" name="transporteur" value={String(parametres.transporteur)} />}
            <Search aria-hidden="true" className="ic" />
            <input
              type="search"
              name="q"
              defaultValue={parametres.q ?? ""}
              placeholder={t("filtres.rechercher")}
              aria-label={t("filtres.rechercher")}
              autoComplete="off"
              spellCheck={false}
              autoCapitalize="characters"
            />
          </form>
        </div>
        <DetailsFermable className="deroulant">
          <summary className="bouton-outil">
            <ChevronsUpDown aria-hidden="true" className="ic" />
            <span className="visuellement-cache">{t("trier")} : </span>
            <span>{t(`tri.${parametres.tri}`)}</span>
          </summary>
          <div className="pop pop--droite pop--menu">
            {TRIS.map((tri) => (
              <LienEcran
                key={tri}
                href={lien(base, parametres, { tri: tri === "immobiles" ? null : tri })}
                aria-current={parametres.tri === tri ? "true" : undefined}
              >
                {t(`tri.${tri}`)}
              </LienEcran>
            ))}
          </div>
        </DetailsFermable>
      </div>

      <p className="aide-envois">
        <CircleAlert aria-hidden="true" className="ic" />
        {t("aide")}
      </p>

      <section className="bloc liste" aria-label={t("titre")}>
        {page.lignes.length === 0 ? (
          /* « Aucun colis » et « ce filtre ne rend rien » sont deux situations :
             dire « collez votre premier numéro » à qui en a neuf mille serait
             une perte de confiance immédiate. */
          <div className="liste__vide">
            <p className="liste__vide-titre">{aUnFiltre ? t("vide.filtre") : t("vide.compte")}</p>
            {aUnFiltre ? (
              <LienEcran className="bouton-app bouton-app--second" href={base}>
                {t("vide.effacer")}
              </LienEcran>
            ) : null}
          </div>
        ) : (
          /* LA SÉLECTION EXPORTE : un `GET` qui ne modifie rien. */
          <form method="get" action="/api/envois/export" className="liste__lot">
            <div className="liste__table" role="table" aria-label={t("titre")} data-table>
              <div className="rangee rangee--tete rangee--envoi" role="row">
                <span role="columnheader">
                  <CaseTout libelle={t("lot.toutSelectionner")} />
                </span>
                <span role="columnheader">{t("colonnes.numero")}</span>
                <span role="columnheader">{t("colonnes.commande")}</span>
                <span role="columnheader">{t("colonnes.client")}</span>
                <span role="columnheader">{t("colonnes.transporteur")}</span>
                <span role="columnheader">{t("colonnes.etat")}</span>
                <span role="columnheader">{t("colonnes.progression")}</span>
                <span role="columnheader">{t("colonnes.mouvement")}</span>
                <span role="columnheader">{t("colonnes.prochaine")}</span>
                <span role="columnheader">
                  <span className="visuellement-cache">{t("colonnes.actions")}</span>
                </span>
              </div>
              {page.lignes.map((ligne, rang) => {
                const d = decrire(ligne);
                const k = ETAPES.indexOf(ligne.etat);
                const premiere = ligne.commandesLiees[0];
                const site = d.transporteur?.site ?? null;
                return (
                  <div key={ligne.id} className="rangee rangee--envoi" role="none">
                    <div className="rangee__corps" role="row">
                      <span role="cell">
                        <label className="coche">
                          <input type="checkbox" name="selection" value={ligne.id} aria-label={t("lot.selectionner", { numero: ligne.numero })} />
                          <i />
                        </label>
                      </span>
                      <span role="cell" className="col-numero">
                        {ligne.numero}
                        {/* « Suivi arrêté » est un fait sur NOUS, pas une
                            affirmation sur le colis (qu'on ne dit jamais perdu). */}
                        {ligne.abandonneLe !== null ? (
                          <span className="badge" data-ton="attente">
                            {t("abandonne")}
                          </span>
                        ) : null}
                      </span>
                      <span role="cell" className="col-ref">
                        {premiere === undefined ? (
                          <span className="vide">—</span>
                        ) : (
                          ligne.commandesLiees.slice(0, 2).map((c, i) => (
                            <span key={c.id}>
                              {i > 0 ? ", " : null}
                              <LienEcran href={`${commandes}/${c.id}`}>{c.reference}</LienEcran>
                            </span>
                          ))
                        )}
                        {ligne.commandesLiees.length > 2 ? (
                          <small aria-label={t("autresCommandes", { n: ligne.commandesLiees.length - 2 })}> +{ligne.commandesLiees.length - 2}</small>
                        ) : null}
                      </span>
                      <span role="cell" className="col-client-envoi">
                        {ligne.clients.length === 0 ? (
                          <span className="vide">{t("commandesRattachees", { n: ligne.commandes })}</span>
                        ) : (
                          ligne.clients.slice(0, 2).join(", ") +
                          (ligne.commandes > Math.min(ligne.clients.length, 2) ? " +" + String(ligne.commandes - Math.min(ligne.clients.length, 2)) : "")
                        )}
                      </span>
                      <span role="cell" className="col-transp" title={d.transporteur?.nom}>
                        {d.transporteur?.nom ?? null}
                      </span>
                      <span role="cell" className="col-statut">
                        {d.silencieux ? (
                          <span className="badge" data-ton="silence">
                            {t("puce.silence")}
                          </span>
                        ) : (
                          <span className="badge" data-ton={TON[ligne.etat]}>
                            {t(`etat.${ligne.etat}`)}
                          </span>
                        )}
                      </span>
                      <span role="cell" className="col-progression">
                        <span
                          className="mini-frise"
                          data-ton={ligne.etat === "livre" ? "livre" : d.silencieux ? "silence" : undefined}
                          style={{ "--k": k, "--i": rang } as React.CSSProperties}
                        >
                          <span className="visuellement-cache">{d.silencieux ? t("puce.silence") : t(`etat.${ligne.etat}`)}</span>
                          {ETAPES.map((e, i) => (
                            <i key={e} aria-hidden="true" data-etat={i < k || ligne.etat === "livre" ? "fait" : i === k ? "actuel" : "avenir"} />
                          ))}
                        </span>
                      </span>
                      <span role="cell" className="col-maj" title={t("interrogationsFaites", { n: ligne.interrogations })}>
                        {/* Au toucher un `title` est invisible : la carte du téléphone l'écrit. */}
                        <small className="col-maj__interro">{t("interrogationsFaites", { n: ligne.interrogations })}</small>
                        {ligne.dernierMouvement === null ? (
                          <span className="vide">{t("mouvement.aucun")}</span>
                        ) : (
                          <>
                            <span>{d.anciennete}</span>
                            <small>
                              {format.dateTime(new Date(ligne.dernierMouvement), {
                                day: "numeric",
                                month: "short",
                                ...(new Date(ligne.dernierMouvement).getFullYear() === maintenant.getFullYear() ? {} : { year: "numeric" }),
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </small>
                          </>
                        )}
                      </span>
                      <span role="cell" className="col-prochaine" data-ton={d.prochaine.ton}>
                        {d.prochaine.texte ?? ""}
                      </span>
                      <span role="cell" className="col-actions">
                        {ligne.commandesLiees.length > 1 ? (
                          /* Un colis groupé mène à CHACUNE de ses commandes (trois au plus),
                             et au site du transporteur : un menu, posé en position fixe. */
                          <DetailsFermable className="deroulant" name="actions-envoi" fixe>
                            <summary className="action-ligne" aria-label={t("colonnes.actions")}>
                              <Ellipsis aria-hidden="true" className="ic" />
                            </summary>
                            <div className="pop pop--menu pop--ligne">
                              {ligne.commandesLiees.slice(0, 3).map((c) => (
                                <LienEcran key={c.id} href={`${commandes}/${c.id}`}>
                                  <Package aria-hidden="true" className="ic" />
                                  {t("actions.voirCommande", { reference: c.reference })}
                                </LienEcran>
                              ))}
                              {site === null ? null : (
                                <a href={site} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink aria-hidden="true" className="ic" />
                                  {t("actions.siteDe", { nom: d.transporteur?.nom ?? "" })}
                                </a>
                              )}
                            </div>
                          </DetailsFermable>
                        ) : (
                          <>
                            {premiere === undefined ? null : (
                              <LienEcran
                                className="action-ligne"
                                href={`${commandes}/${premiere.id}`}
                                aria-label={t("actions.voirCommande", { reference: premiere.reference })}
                                title={t("actions.voirCommande", { reference: premiere.reference })}
                              >
                                <Package aria-hidden="true" className="ic" />
                              </LienEcran>
                            )}
                            {site === null ? null : (
                              <a
                                className="action-ligne"
                                href={site}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={t("actions.siteDe", { nom: d.transporteur?.nom ?? "" })}
                                title={t("actions.siteDe", { nom: d.transporteur?.nom ?? "" })}
                              >
                                <ExternalLink aria-hidden="true" className="ic" />
                              </a>
                            )}
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                );
              })}
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
              <button type="submit" className="bouton-app bouton-app--plein">
                {t("lot.exporter")}
              </button>
            </BarreLot>
          </form>
        )}
        {/* Pas de pagination numérotée : la liste avance PAR CURSEUR (à la page
            40 d'un jeu de 9 600, un décalage lirait 2 000 lignes pour en rendre
            50). Le compteur, lui, ne coûte rien : le total est déjà lu. */}
        {page.lignes.length === 0 ? null : (
          <p className="liste__pied">
            {/* Le total du compte ne vaut que pour la liste entière, première page :
                « 1 à 12 sur 156 » sous un filtre, ou en page deux, serait faux. */}
            <span>
              {!aUnFiltre && parametres.curseur === null
                ? t("compteurPage", { de: 1, a: page.lignes.length, total: compteurs.total })
                : page.curseurSuivant === null
                  ? t("finDeListe")
                  : null}
            </span>
            {page.curseurSuivant !== null ? (
              <LienEcran className="liste__suite" href={lien(base, parametres, { curseur: page.curseurSuivant })}>
                {t("pageSuivante")}
              </LienEcran>
            ) : null}
          </p>
        )}
      </section>
    </>
  );
}
