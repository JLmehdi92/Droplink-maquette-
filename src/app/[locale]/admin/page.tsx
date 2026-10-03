import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getFormateur } from "@/lib/format/formateur";
import type { Metadata } from "next";
import { ArrowRight, CircleAlert, Clock, Lock, Users } from "lucide-react";
import { EnTeteAdmin } from "@/components/admin/en-tete-admin";
import { exigerAdmin } from "@/lib/audit/garde";
import { lireDernieresActions } from "@/lib/audit/comptes";
import { lireAlerteContestations } from "@/lib/audit/contestation";
import { compterDoublons, type NombresDoublons } from "@/lib/audit/doublons";
import {
  lireCommandesParJour,
  lirePanneau,
  lireRepartition,
  lireSeuils,
} from "@/lib/audit/panneau";
import { AnneauStatuts } from "@/components/admin/anneau-statuts";
import { BarresAdmin } from "@/components/admin/barres-admin";
import { EntreeJournal } from "@/components/admin/entree-journal";
import { FiltresAdmin } from "@/components/admin/filtres-admin";
import { TuileVolume, Tuiles } from "@/components/admin/tuile-volume";
import { PERIODES, lirePeriode } from "@/components/admin/selecteur-periode";
import { jourCourt } from "@/components/admin/echelle";
import { mettreOctetsALEchelle } from "@/lib/format/octets";
import { creerClientServeur } from "@/lib/supabase/server";
import { estLangueSupportee } from "@/i18n/config";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // La garde court aussi ici : Next évalue les métadonnées EN PARALLÈLE du
  // rendu, et le titre partirait sinon dans le corps du 404 servi à qui n'a pas
  // les droits. Mémoïsée par requête, elle ne coûte rien de plus.
  await exigerAdmin();
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("panneau.titre"), robots: { index: false, follow: false } };
}

/** Combien de lignes du journal la maquette pose sous les volumes. */
const DERNIERES_ACTIONS = 5;

/**
 * LE PANNEAU D'ADMINISTRATION.
 *
 * LES ALERTES VIENNENT AVANT LES COMPTEURS. Un panneau qui les enterre sous des
 * chiffres oblige à CHERCHER ce qui devrait sauter aux yeux — et c'est
 * précisément le moment où l'on ne cherche pas. La planche va plus loin que
 * l'ordre : elle nomme la section « ce qui demande une décision », ce qui dit
 * aussi ce que les compteurs NE demandent pas.
 *
 * CHAQUE SIGNALEMENT PORTE SA VALEUR : « 1 840 pour un seuil de 1 200 », jamais
 * « ce compte dépasse ». Un chiffre se vérifie et se compare ; une appréciation
 * se discute, et l'on finit par ne plus la lire. Et chacun porte SON GESTE —
 * « Examiner » mène à l'écran où l'on peut décider, pas à une explication.
 *
 * LA COULEUR D'UNE ALERTE SUIT SA GRAVITÉ, ET LA GRAVITÉ VIENT DE LA BASE.
 * ⚠️ La planche peint le dépassement de colis en rouge et le planificateur en
 * ambre ; `alertes_admin` dit l'inverse — un compte qui dépasse coûte de
 * l'argent mais rien n'est cassé, un veilleur muet arrête le suivi de TOUS les
 * vendeurs. Aligner la couleur sur le dessin aurait fait dire à cet écran une
 * gravité que la donnée contredit, et la même alerte aurait changé de sens
 * selon l'endroit où on la lit.
 *
 * LES SIGNALEMENTS DE CONTENU de l'ancienne planche (« 2 signalements en attente »)
 * NE SONT PAS PORTÉS : ils partent par `mailto:`, il n'existe aucune table pour les
 * compter. L'afficher demanderait d'inventer un chiffre sur l'écran dont tout le
 * rôle est de porter des chiffres vérifiables. La contestation en attente, elle,
 * l'est depuis la migration 213 (décision de Mehdi du 03/10/2026).
 *
 * `never_ran` N'EST PAS UNE ALERTE. Une tâche posée ce matin n'a pas encore eu
 * son premier passage : la signaler ferait chercher une panne inexistante, et
 * une alerte qui se trompe est une alerte qu'on apprend à ignorer. Les trois
 * états des tâches vivent en entier sur l'écran Surveillance ; ce panneau ne
 * garde que ce qui appelle une décision.
 */
export default async function PanneauAdmin({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ jours?: string }>;
}) {
  const { locale } = await params;
  // UNE VALEUR HORS LISTE RETOMBE SUR 30, elle ne fait pas d'erreur : un
  // paramètre d'URL est une entrée EXTERNE, même sur une surface d'administration
  // — c'est le même principe que le Zod posé sur « ce qui vient de notre
  // formulaire », et la liste fermée tient lieu de schéma.
  const periode = lirePeriode((await searchParams).jours);
  const langue = estLangueSupportee(locale) ? locale : "fr";
  setRequestLocale(langue);

  await exigerAdmin();

  const supabase = await creerClientServeur();
  const seuils = await lireSeuils(supabase);
  // Les six lectures sont indépendantes : les enchaîner multiplierait l'attente
  // du premier écran que voit un administrateur.
  // UN SEUL INSTANT DE REFERENCE POUR TOUT L'ECRAN. Rappele a chaque ligne, il
  // avancerait pendant le rendu et deux lignes du meme evenement pourraient
  // s'ecrire differemment — et la borne haute de la courbe pourrait tomber un
  // jour plus loin que les dates du journal rendu juste en dessous.
  const maintenant = new Date();
  const [panneau, actions, repartition, courbe, doublons, contestations] = await Promise.all([
    lirePanneau(supabase, seuils),
    lireDernieresActions(supabase, DERNIERES_ACTIONS),
    lireRepartition(supabase),
    lireCommandesParJour(supabase, maintenant, periode),
    // UN COMPTE, PAS UNE LISTE : `compter_doublons_admin` n'écrit rien au journal
    // et ne nomme personne. Illisible, il ne pose simplement pas d'alerte (il ne
    // dit pas « aucun doublon »). La liste nominative, elle, s'ouvre en un clic.
    compterDoublons(supabase).catch((): NombresDoublons | null => null),
    // L'ALERTE DES CONTESTATIONS (213) : un nombre, la référence et la date de la plus
    // ancienne, sans trace. Trois états : une lecture en panne le DIT, elle ne se tait pas.
    lireAlerteContestations(supabase),
  ]);

  const t = await getTranslations("admin");
  const format = await getFormateur();

  // `null` porte les DEUX cas où l'on n'affiche pas de chiffre : pas de
  // mécanisme de mesure, ou pas de valeur rendue. Les distinguer à l'écran
  // n'apprendrait rien — dans les deux cas, on n'a pas mesuré.
  const taille =
    panneau.stockageMesurable && panneau.stockageOctets !== null
      ? mettreOctetsALEchelle(panneau.stockageOctets)
      : null;

  const critique = (a: { gravite: string }): boolean => a.gravite === "critique";

  /**
   * UN TIRET, JAMAIS UN ZERO.
   *
   * Zero affirmerait qu'on a compte. C'est la meme regle que le stockage, qui
   * s'affiche « indisponible » et jamais « 0 o » — et elle vaut pour la meme
   * raison : sur cet ecran, un chiffre est une piece a l'appui d'une decision.
   * La ligne qui NOMME l'indisponibilite est au-dessus des cartes.
   */
  const chiffre = (n: number | undefined): string => (n === undefined ? "—" : format.number(n));

  const ouExaminer = (genre: string, sujet: string): string =>
    genre === "veilleur_en_retard"
      ? `/${langue}/admin/surveillance`
      : `/${langue}/admin/comptes?q=${encodeURIComponent(sujet)}`;

  const doublonsAAlerter = doublons !== null && doublons.identifiants > 0 ? doublons : null;

  return (
    <main id="contenu" className="tableau adm">
      <EnTeteAdmin titre={t("panneau.titre")} sousTitre={t("panneau.sousTitre")} fil={[]} />

      {/* --- CE QUI DEMANDE UNE DÉCISION ---
          TROIS ÉTATS, PAS DEUX : « aucune alerte » sur une lecture qui n'a pas
          abouti ferait conclure que tout va bien. La troisième alerte de la
          maquette — une contestation en attente — est portée par la migration 213
          (décision de Mehdi du 03/10/2026) : elle mène à la liste des Commandes
          filtrée sur la référence (la maquette pointe une ancre de ligne que la
          liste paginée ne garantit pas). */}
      <section className="bloc adm-bloc adm-decision" aria-labelledby="adm-decision">
        <header className="bloc__tete">
          <div>
            <h2 id="adm-decision">{t("panneau.decision")}</h2>
          </div>
        </header>
        {panneau.alertes === null ? <p className="adm-texte pb-4">{t("panneau.alertesIndisponibles")}</p> : null}
        {contestations.statut === "illisible" ? <p className="adm-texte pb-4">{t("panneau.contestationsIndisponibles")}</p> : null}
        {/* Un comptage des doublons illisible se DIT, comme celui des contestations : sinon la
            section restait réduite à son titre (audit final du 03/10/2026). */}
        {doublons === null ? <p className="adm-texte pb-4">{t("panneau.doublonsIndisponibles")}</p> : null}
        {/* « Aucune alerte » exige les TROIS lectures : un comptage des doublons ou des
            contestations illisible ne vaut pas « aucun ». */}
        {panneau.alertes !== null &&
        panneau.alertes.length === 0 &&
        doublons !== null &&
        doublonsAAlerter === null &&
        contestations.statut === "aucune" ? (
          <p className="adm-texte pb-4">{t("panneau.aucuneAlerte")}</p>
        ) : null}
        {(panneau.alertes?.length ?? 0) > 0 || doublonsAAlerter !== null || contestations.statut === "ok" ? (
          <ul className="adm-alertes">
            {(panneau.alertes ?? []).map((a) => (
              <li key={a.genre + a.sujet} className="adm-alerte">
                {/* LA COULEUR SUIT LA GRAVITÉ RENDUE PAR LA BASE, pas le dessin :
                    un veilleur muet arrête le suivi de TOUS les vendeurs. */}
                <i data-ton={critique(a) ? "erreur" : "attente"} aria-hidden="true">
                  {a.genre === "veilleur_en_retard" ? <Clock className="ic" /> : <CircleAlert className="ic" />}
                </i>
                <div>
                  {/* LA VALEUR ET LE SEUIL SONT DANS LE TITRE, tous les deux. */}
                  <b>{t(`panneau.alerte.${a.genre}`, { valeur: format.number(a.valeur), seuil: format.number(a.seuil) })}</b>
                  <span>{t(`panneau.alerteDetail.${a.genre}`, { sujet: a.sujet, seuil: format.number(a.seuil) })}</span>
                </div>
                <Link prefetch={false} className="bouton-outil" href={ouExaminer(a.genre, a.sujet)}>
                  {t("panneau.examiner")}
                  <ArrowRight aria-hidden="true" className="ic" />
                </Link>
              </li>
            ))}
            {doublonsAAlerter === null ? null : (
              <li className="adm-alerte">
                <i data-ton="attente" aria-hidden="true">
                  <Users className="ic" />
                </i>
                <div>
                  <b>
                    {t("panneau.alerteDoublons", {
                      comptes: doublonsAAlerter.comptes,
                      identifiants: doublonsAAlerter.identifiants,
                    })}
                  </b>
                  <span>{t("doublons.sousTitre")}</span>
                </div>
                <Link prefetch={false} className="bouton-outil" href={`/${langue}/admin/comptes/doublons`}>
                  {t("doublons.panneauVoir")}
                  <ArrowRight aria-hidden="true" className="ic" />
                </Link>
              </li>
            )}
            {contestations.statut !== "ok" ? null : (
              <li className="adm-alerte">
                <i data-ton="attente" aria-hidden="true">
                  <Lock className="ic" />
                </i>
                <div>
                  <b>{t("panneau.alerteContestation", { n: contestations.nombre, reference: contestations.reference })}</b>
                  <span>
                    {t("panneau.alerteContestationDetail", {
                      date: format.dateTime(new Date(contestations.envoyeeLe), { day: "numeric", month: "short", year: "numeric" }),
                    })}
                  </span>
                </div>
                <Link
                  prefetch={false}
                  className="bouton-outil"
                  href={`/${langue}/admin/commandes?q=${encodeURIComponent(contestations.reference)}`}
                >
                  {t("panneau.examiner")}
                  <ArrowRight aria-hidden="true" className="ic" />
                </Link>
              </li>
            )}
          </ul>
        ) : null}
      </section>

      {/* --- LES VOLUMES ---
          L'INDISPONIBILITÉ SE DIT, elle ne se devine pas à cinq tirets.
          `parcels_registered` porte « FACTURÉ » : c'est le seul compteur du
          produit qui corresponde à une facture. */}
      <h2 className="adm-h2">{t("panneau.volumes")}</h2>
      {panneau.compteurs === null ? <p className="adm-aide">{t("panneau.compteursIndisponibles")}</p> : null}
      <Tuiles etiquette={t("chiffresCles")} colonnes={5}>
        <TuileVolume libelle={t("panneau.commandes")} valeur={chiffre(panneau.compteurs?.commandesCreeesCeMois)} complement={t("panneau.ceMoisCi")} />
        <TuileVolume
          libelle={t("panneau.comptesActifs")}
          valeur={chiffre(panneau.compteurs?.comptesActifs)}
          /* DES NOMBRES BRUTS, que le catalogue formate (03/10/2026) : la chaîne déjà
             formatée de `chiffre` tombait dans un pluriel français et rendait « NaN
             suspendus » au-delà de 999. Sans compteurs, pas de complément : un
             tiret dans un pluriel ne se dit pas. */
          complement={
            panneau.compteurs == null
              ? undefined
              : t("panneau.comptesDont", {
                  suspendus: panneau.compteurs.comptesSuspendus,
                  sansType: panneau.compteurs.comptesSansType,
                })
          }
        />
        {/* LE CHIFFRE QUI INFORME EST LE SECOND : une boutique naît à
            l'inscription ; combien sont allées jusqu'à se donner un nom, c'est
            la mesure d'activation. */}
        <TuileVolume
          libelle={t("panneau.boutiques")}
          valeur={chiffre(panneau.compteurs?.boutiques)}
          complement={t("panneau.boutiquesDont", { nommees: chiffre(panneau.compteurs?.boutiquesNommees) })}
        />
        <TuileVolume
          ton="facture"
          libelle={t("panneau.colisFactures")}
          valeur={chiffre(panneau.compteurs?.colisPrisEnChargeCeMois)}
          complement={
            <>
              <span className="adm-facture">{t("panneau.facture")}</span> {t("panneau.ceMoisCi")}
            </>
          }
        />
        {/* « INDISPONIBLE » ET JAMAIS « 0 o » : la bascule vient de l'existence
            d'un MÉCANISME de mesure (migration 049), pas d'une valeur observée. */}
        <TuileVolume
          libelle={t("panneau.stockage")}
          valeurEnSourdine={taille === null}
          valeur={
            taille === null
              ? t("panneau.stockageIndisponible")
              : t("panneau.stockageValeur", {
                  valeur: format.number(taille.valeur, {
                    minimumFractionDigits: taille.decimales,
                    maximumFractionDigits: taille.decimales,
                  }),
                  unite: t(`unites.${taille.unite}`),
                })
          }
          complement={t("panneau.stockageAide")}
        />
      </Tuiles>

      {/* --- LES COMMANDES PAR JOUR, PUIS L'ANNEAU DES STATUTS ---
          QUE DES NOMBRES : c'est ce qui les autorise sur l'écran d'accueil. Un
          tableau « Dernières commandes » nommerait les clients d'autres vendeurs
          et obligerait à un audit À CHAQUE OUVERTURE du panneau. */}
      <div className="adm-rangee adm-rangee--2">
        <section className="bloc adm-bloc" aria-labelledby="adm-courbe">
          <header className="bloc__tete">
            <div>
              <h2 id="adm-courbe">{t("panneau.courbe")}</h2>
              <p className="adm-aide">{t("panneau.commandesAide", { jours: periode })}</p>
            </div>
            {/* LA PÉRIODE SE CHOISIT (7, 30 ou 90 jours) là où la maquette pose
                une étiquette fixe : le produit l'avait, rien ne se perd. */}
            <FiltresAdmin
              etiquette={t("panneau.periodeEtiquette")}
              courant={String(periode)}
              options={PERIODES.map((j) => ({ valeur: String(j), libelle: t("panneau.periode", { jours: j }), href: `/${langue}/admin?jours=${j}` }))}
            />
          </header>
          {courbe === null ? (
            <p className="adm-texte pb-4">{t("panneau.courbeIndisponible")}</p>
          ) : courbe.length === 0 ? (
            <p className="adm-texte pb-4">{t("panneau.aucuneCommande")}</p>
          ) : (
            <BarresAdmin
              etiquette={t("panneau.commandesAide", { jours: periode })}
              debut={jourCourt(format, courbe[0]?.jour ?? "")}
              fin={jourCourt(format, courbe[courbe.length - 1]?.jour ?? "")}
              valeurs={courbe.map((j) => ({
                valeur: j.total,
                info: t("panneau.barre", { jour: jourCourt(format, j.jour), n: j.total }),
              }))}
            />
          )}
        </section>

        <section className="bloc adm-bloc adm-bloc--anneau" aria-labelledby="adm-statuts">
          <header className="bloc__tete">
            <div>
              <h2 id="adm-statuts">{t("panneau.statuts")}</h2>
              <p className="adm-aide">{t("panneau.statutsAide")}</p>
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

      {/* --- LES DERNIÈRES ACTIONS D'ADMINISTRATION ---
          LA LIRE N'ÉCRIT RIEN : `lire_journal_admin` est `stable`, PostgREST
          l'exécute en transaction lecture seule. TROIS ÉTATS : « aucune entrée »
          sur un journal qu'on n'a pas pu lire serait une affirmation fausse. */}
      <section className="bloc adm-bloc" aria-labelledby="adm-actions">
        <header className="bloc__tete">
          <div>
            <h2 id="adm-actions">{t("panneau.dernieresActions")}</h2>
          </div>
          <Link prefetch={false} className="lien-texte adm-lien" href={`/${langue}/admin/journal`}>
            {t("panneau.toutLeJournal")}
            <ArrowRight aria-hidden="true" className="ic" />
          </Link>
        </header>
        {actions === null ? (
          <p className="adm-texte pb-4">{t("panneau.dernieresActionsIndisponibles")}</p>
        ) : actions.length === 0 ? (
          <p className="adm-texte pb-4">{t("journal.vide")}</p>
        ) : (
          <ol className="adm-journal adm-journal--court">
            {actions.map((ligne) => (
              <EntreeJournal key={ligne.id} ligne={ligne} />
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
