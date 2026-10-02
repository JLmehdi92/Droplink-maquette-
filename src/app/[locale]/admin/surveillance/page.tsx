import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { EnTeteAdmin } from "@/components/admin/en-tete-admin";
import { BarresAdmin } from "@/components/admin/barres-admin";
import { jourCourt } from "@/components/admin/echelle";
import { exigerAdmin } from "@/lib/audit/garde";
import { lireSeuils } from "@/lib/audit/panneau";
import { JOURS_DE_FRISE, lireSurveillance } from "@/lib/audit/surveillance";
import { DEGRADATION, seuil, type Surface } from "@/lib/limitation/quota";
import { creerClientServeur } from "@/lib/supabase/server";
import { estLangueSupportee } from "@/i18n/config";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // LA GARDE COURT AUSSI ICI. Next évalue les métadonnées EN PARALLÈLE du rendu :
  // sans elle, le titre partirait dans le corps du 404 servi à qui n'a pas les
  // droits, et révélerait la surface que le code de réponse cache.
  await exigerAdmin();
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("surveillance.titre"), robots: { index: false, follow: false } };
}

/**
 * LES SURFACES QUE L'ÉCRAN MONTRE.
 *
 * ⚠️ CE COMMENTAIRE DISAIT « TROIS SUR SEPT ». Il y en a douze — trois pour le
 * mot de passe depuis le 01/09, une pour l'export depuis le 02/09 — et le
 * chiffre n'avait été relu à aucun de ces ajouts. C'est le motif que le brief
 * nomme : *les décomptes se périment à chaque session, les remplacer par la
 * requête qui les produit*. Aucun décompte n'est donc réécrit ici ; la liste
 * ci-dessous EST l'inventaire, et `Surface` reste la seule source du reste.
 *
 * Ce qui est affiché est un CHOIX, et il ne change pas : ce sont les surfaces
 * dont la saturation change ce qu'on fait. Une saturation de la page publique
 * peut être un vendeur qui perce ; un pic de jetons INCONNUS est une
 * aspiration ; l'administration qui sature, c'est nous.
 *
 * Toutes les autres sont comptées et protégées — le contrôle d'inventaire
 * `tests/unit/surfaces-a-plafond` l'établit surface par surface, dans les deux
 * sens — elles n'appellent simplement aucune décision de surveillance : leur
 * saturation se règle toute seule en refusant.
 */
const SURFACES_AFFICHEES: readonly Surface[] = [
  "publique-requetes",
  "publique-inconnu",
  "admin",
] as const;

/*
 * Refonte du 02/10/2026 : maquette `admin-surveillance.html` — tâches et
 * consommation côte à côte, la frise des colis, puis limitation et non-mesuré.
 */
export default async function SurveillanceAdmin({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const langue = estLangueSupportee(locale) ? locale : "fr";
  setRequestLocale(langue);

  await exigerAdmin();

  const supabase = await creerClientServeur();
  const seuils = await lireSeuils(supabase);
  const surveillance = await lireSurveillance(supabase, seuils.retardMinutes);

  const t = await getTranslations("admin");
  const format = await getFormatter();

  // LES PLAFONDS VIENNENT DE LA CONFIGURATION, jamais d'une constante recopiée :
  // une barre remplie contre un plafond faux est pire qu'une barre absente.
  const plafonds = new Map(
    SURFACES_AFFICHEES.map((surface) => [surface, seuil(surface).plafond] as const),
  );
  /**
   * ⚠️ `null` N'EST PAS ZÉRO, ET C'EST TOUT L'ENJEU DE CET ÉCRAN.
   *
   * Un pic à 0 sur une lecture qui n'a pas abouti afficherait une barre vide,
   * donc « aucune requête » — sur l'écran dont le rôle est de dire si les
   * plafonds sont approchés. L'indisponibilité est donc NOMMÉE au-dessus des
   * barres, et le chiffre devient un tiret plutôt qu'un zéro.
   */
  const pic = (surface: string): number | null =>
    surveillance.indicateurs === null
      ? null
      : (surveillance.indicateurs.find((i) => i.indicateur === `pic_${surface}`)?.valeur ?? 0);

  const colisParJour = surveillance.colisParJour ?? [];
  // UN TIRET, JAMAIS UN ZÉRO : une lecture muette ne vaut pas « aucune consommation ».
  const indicateur = (cle: string): string => {
    const v = surveillance.indicateurs?.find((i) => i.indicateur === cle)?.valeur;
    return v === undefined ? "—" : format.number(v);
  };
  const BADGE_TACHE = { actif: { statut: "active" }, en_retard: { ton: "alerte" }, jamais_executee: {} } as const;

  return (
    <main id="contenu" className="tableau adm">
      <EnTeteAdmin titre={t("surveillance.titre")} sousTitre={t("surveillance.sousTitre")} />

      <div className="adm-rangee adm-rangee--2">
        {/* --- LES TÂCHES DE FOND ---
            TROIS ÉTATS, PAS DEUX : sur une lecture muette, la jointure ferait
            afficher « jamais exécutée » pour chaque tâche — une alerte inventée.
            Et « jamais exécutée » est NEUTRE (ni vert ni ambre) : une tâche posée
            ce matin n'a pas encore eu son premier passage. */}
        <section className="bloc adm-bloc" aria-labelledby="adm-taches">
          <header className="bloc__tete">
            <div>
              <h2 id="adm-taches">{t("surveillance.taches")}</h2>
            </div>
          </header>
          {surveillance.surveillees === null ? (
            <p className="adm-texte pb-4">{t("surveillance.tachesIndisponibles")}</p>
          ) : (
            <ul className="adm-taches">
              {surveillance.surveillees.map((tache) => (
                <li key={tache.source}>
                  <span className="adm-pouls" data-etat={tache.etat} aria-hidden="true" />
                  <div>
                    <b>{t.has(`surveillance.tache.${tache.source}`) ? t(`surveillance.tache.${tache.source}`) : tache.source}</b>
                    <small>
                      {tache.etat === "jamais_executee"
                        ? t("surveillance.jamaisExecuteeAide")
                        : tache.etat === "en_retard"
                          ? t("surveillance.enRetardAide", { n: tache.minutes ?? 0, seuil: seuils.retardMinutes })
                          : t("surveillance.actifAide", { n: tache.minutes ?? 0 })}
                    </small>
                  </div>
                  <span
                    className="adm-badge"
                    data-statut={"statut" in BADGE_TACHE[tache.etat] ? "active" : undefined}
                    data-ton={"ton" in BADGE_TACHE[tache.etat] ? "alerte" : undefined}
                  >
                    <i aria-hidden="true" />
                    {t(`surveillance.etat.${tache.etat}`)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* --- LA CONSOMMATION DU MOIS ---
            Trois chiffres que `sante_infrastructure` rendait déjà (migration 052)
            et que l'écran ne montrait pas : la maquette les remet sous les yeux.
            Le seul poste facturé est dit comme tel. */}
        <section className="bloc adm-bloc" aria-labelledby="adm-conso">
          <header className="bloc__tete">
            <div>
              <h2 id="adm-conso">{t("surveillance.consommation")}</h2>
            </div>
          </header>
          {surveillance.indicateurs === null ? <p className="adm-aide adm-aide--haut">{t("surveillance.indicateursIndisponibles")}</p> : null}
          <dl className="adm-dl adm-dl--chiffres">
            <div>
              <dt>{t("surveillance.indicateur.interrogations_ce_mois")}</dt>
              <dd>{indicateur("interrogations_ce_mois")}</dd>
            </div>
            <div>
              <dt>
                {t("surveillance.indicateur.colis_pris_en_charge_ce_mois")}{" "}
                <span className="adm-facture">{t("surveillance.seulPosteFacture")}</span>
              </dt>
              <dd>{indicateur("colis_pris_en_charge_ce_mois")}</dd>
            </div>
            <div>
              <dt>{t("surveillance.indicateur.abandons_ce_mois")}</dt>
              <dd>{indicateur("abandons_ce_mois")}</dd>
            </div>
          </dl>
        </section>
      </div>

      {/* --- LA FRISE DES COLIS PAR JOUR ---
          14 jours (`JOURS_DE_FRISE`, argument de la RPC) là où la maquette en
          dessine 30 : la donnée du produit gagne. Une barre nulle garde 2 % de
          hauteur, pour qu'un jour sans colis se voie comme un jour. */}
      <section className="bloc adm-bloc" aria-labelledby="adm-frise">
        <header className="bloc__tete">
          <div>
            <h2 id="adm-frise">{t("surveillance.colisParJour")}</h2>
            <p className="adm-aide">{t("surveillance.friseLegende", { n: JOURS_DE_FRISE })}</p>
          </div>
        </header>
        {surveillance.colisParJour === null ? (
          <p className="adm-texte pb-4">{t("surveillance.friseIndisponible")}</p>
        ) : colisParJour.length === 0 ? (
          <p className="adm-texte pb-4">{t("statistiques.aucunColis")}</p>
        ) : (
          <BarresAdmin
            etiquette={t("surveillance.friseAide", { n: JOURS_DE_FRISE })}
            hauteurMinimale={0.02}
            debut={jourCourt(format, colisParJour[0]?.jour ?? "")}
            fin={jourCourt(format, colisParJour[colisParJour.length - 1]?.jour ?? "")}
            valeurs={colisParJour.map((j) => ({ valeur: j.n, info: t("surveillance.barre", { jour: jourCourt(format, j.jour), n: j.n }) }))}
          />
        )}
      </section>

      <div className="adm-rangee adm-rangee--2">
        {/* --- LA LIMITATION DE DÉBIT ---
            Les plafonds viennent de `seuil()`, jamais recopiés. La phrase de
            comportement en panne n'apparaît qu'au changement de règle : la page
            publique AUTORISE, l'administration REFUSE. */}
        <section className="bloc adm-bloc" aria-labelledby="adm-limites">
          <header className="bloc__tete">
            <div>
              <h2 id="adm-limites">{t("surveillance.limitation")}</h2>
            </div>
          </header>
          <ul className="adm-limites">
            {SURFACES_AFFICHEES.map((surface, rang) => {
              const plafond = plafonds.get(surface) ?? 1;
              const valeur = pic(surface);
              const precedente = SURFACES_AFFICHEES[rang - 1];
              const nouvelleRegle = precedente === undefined || DEGRADATION[precedente] !== DEGRADATION[surface];
              return (
                <li key={surface}>
                  <p>
                    <b>{t(`surveillance.surface.${surface}`)}</b>
                    <span>
                      {t("surveillance.surPlafond", {
                        valeur: valeur === null ? "—" : format.number(valeur),
                        plafond: format.number(plafond),
                      })}
                    </span>
                  </p>
                  <i aria-hidden="true">
                    <b style={{ "--k": String(valeur === null ? 0 : Math.min(valeur / Math.max(plafond, 1), 1)) } as React.CSSProperties} />
                  </i>
                  {nouvelleRegle ? <small>{t(`surveillance.degradation.${DEGRADATION[surface]}`)}</small> : null}
                </li>
              );
            })}
          </ul>
        </section>

        {/* --- CE QUI N'EST PAS MESURÉ, NOMMÉ --- */}
        <section className="bloc adm-bloc" aria-labelledby="adm-absents">
          <header className="bloc__tete">
            <div>
              <h2 id="adm-absents">{t("surveillance.nonMesure")}</h2>
            </div>
          </header>
          <p className="adm-texte">{t("surveillance.nonMesureAide")}</p>
          <ul className="adm-absents">
            {surveillance.nonMesure.map((cle) => (
              <li key={cle}>
                <span>{t(`surveillance.absent.${cle}`)}</span>
                <b>{t("surveillance.nonMesure")}</b>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
