import Link from "next/link";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import {
  Eye,
  HardDrive,
  Package,
  ShoppingCart,
  SlidersHorizontal,
  Store,
  UserCheck,
  UserX,
  Users,
} from "lucide-react";
import { Clock, TriangleAlert } from "lucide-react";
import { EnTeteAdmin } from "@/components/admin/en-tete-admin";
import { exigerAdmin } from "@/lib/audit/garde";
import { natureDAction } from "@/lib/admin/nature-d-action";
import { lireDernieresActions } from "@/lib/audit/comptes";
import {
  lireCommandesParJour,
  lirePanneau,
  lireRepartition,
  lireSeuils,
} from "@/lib/audit/panneau";
import { AnneauStatuts } from "@/components/admin/anneau-statuts";
import { CourbeCommandes } from "@/components/admin/courbe-commandes";
import { TuileVolume } from "@/components/admin/tuile-volume";
import { SelecteurPeriode, lirePeriode } from "@/components/admin/selecteur-periode";
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

/** Combien de lignes du journal la planche pose sous les volumes. */
const DERNIERES_ACTIONS = 4;

const CARTE = "rounded-ds-card-lg border border-ds-filet bg-ds-surface-carte p-4 shadow-ds-card md:p-6";
const SUR_TITRE =
  "text-[11.5px] leading-[13px] font-bold tracking-[0.08em] text-ds-texte-sourdine uppercase";

/*
 * LE PANNEAU DU KIT ADMIN — valeurs relevées sur la page servie : carte blanche
 * au rayon `card-lg`, filet, ombre de carte, remplissage 22 ; titre 18/700 à
 * l'interlettrage -0,025em et l'interligne 19,8 px ; sous-titre 13/400 en corps
 * à 3 px sous le titre, interligne 1,55.
 */
const PANNEAU =
  "flex min-w-0 flex-col rounded-ds-card-lg border border-ds-filet bg-ds-surface-carte p-4 shadow-ds-card md:p-[22px]";
const PANNEAU_TITRE = "text-[18px] leading-[19.8px] font-bold tracking-[-0.025em] text-ds-texte-titre";
const PANNEAU_AIDE = "mt-[3px] text-[13px] leading-[1.55] text-ds-texte-corps";

/**
 * LA TUILE RONDE D'UNE LIGNE DE JOURNAL, par famille d'action.
 *
 * ⚠️ ELLE NE PORTE AUCUNE INFORMATION, ET C'EST DÉLIBÉRÉ. Ni sa couleur ni son
 * icône ne disent quoi que ce soit que le libellé juste à côté ne dise déjà en
 * toutes lettres : c'est un repère de balayage, pas un code à apprendre. D'où
 * l'`aria-hidden` — annoncée, elle répéterait la ligne.
 *
 * Valeurs relevées sur le kit : 38 de côté, ronde, fond de la teinte d'état,
 * icône de 17 au trait 1,9.
 */
const TUILE = {
  suspension: { fond: "bg-ds-erreur-fond text-ds-erreur", icone: UserX },
  reactivation: { fond: "bg-ds-succes-fond text-ds-succes", icone: UserCheck },
  parametre: { fond: "bg-ds-surface-teinte text-ds-accent", icone: SlidersHorizontal },
  consultation: { fond: "bg-ds-info-fond text-ds-info", icone: Eye },
} as const;

function tuileDAction(action: string): (typeof TUILE)[keyof typeof TUILE] {
  return TUILE[natureDAction(action)];
}

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
 * LA TROISIÈME ALERTE DE LA PLANCHE — « 2 signalements de contenu en attente » —
 * N'EST PAS PORTÉE : les signalements partent par `mailto:`, il n'existe aucune
 * table pour les compter. L'afficher demanderait d'inventer un chiffre sur
 * l'écran dont tout le rôle est de porter des chiffres vérifiables.
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
  // Les trois lectures sont indépendantes : les enchaîner triplerait l'attente
  // du premier écran que voit un administrateur.
  // UN SEUL INSTANT DE REFERENCE POUR TOUT L'ECRAN. Rappele a chaque ligne, il
  // avancerait pendant le rendu et deux lignes du meme evenement pourraient
  // s'ecrire differemment — et la borne haute de la courbe pourrait tomber un
  // jour plus loin que les dates du journal rendu juste en dessous.
  const maintenant = new Date();
  const [panneau, actions, repartition, courbe] = await Promise.all([
    lirePanneau(supabase, seuils),
    lireDernieresActions(supabase, DERNIERES_ACTIONS),
    lireRepartition(supabase),
    lireCommandesParJour(supabase, maintenant, periode),
  ]);

  const t = await getTranslations("admin");
  const format = await getFormatter();

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

  return (
    <main id="contenu" className="md:px-8 md:pt-0 md:pb-8">
      <EnTeteAdmin titre={t("panneau.titre")} sousTitre={t("panneau.sousTitre")} />

      <div className="p-4 md:mt-[22px] md:p-0">
        {/* --- CE QUI DEMANDE UNE DÉCISION --- */}
        <section aria-label={t("panneau.decision")}>
          <p className={SUR_TITRE + " mb-3"}>{t("panneau.decision")}</p>

          {/* TROIS ÉTATS, PAS DEUX. « Aucune alerte » sur une lecture qui n'a
              pas abouti ferait conclure que tout va bien — c'est exactement ce
              que le brief interdit, et sur la section qu'il range en tête. */}
          {panneau.alertes === null ? (
            <p className={CARTE + " text-ds-texte-corps"}>
              {t("panneau.alertesIndisponibles")}
            </p>
          ) : panneau.alertes.length === 0 ? (
            <p className={CARTE + " text-ds-texte-corps"}>
              {t("panneau.aucuneAlerte")}
            </p>
          ) : (
            <ul className="flex flex-col gap-2.5 md:gap-2.5">
              {panneau.alertes.map((a) => (
                <li
                  key={a.genre + a.sujet}
                  className={
                    "flex flex-col gap-[13px] rounded-ds-card border p-4 md:flex-row md:items-start md:rounded-ds-card md:px-[18px] md:py-4 " +
                    (critique(a)
                      ? "border-ds-erreur bg-ds-erreur-fond"
                      : "border-ds-alerte bg-ds-alerte-fond")
                  }
                >
                  <div className="flex gap-[11px] md:flex-grow md:gap-[13px]">
                    {/* La pastille double la couleur de fond, elle ne la
                        remplace pas : une couleur seule ne se lit pas de la même
                        façon selon les yeux. */}
                    <span
                      aria-hidden="true"
                      className={
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-ds-sm md:h-[34px] md:w-[34px] " +
                        (critique(a)
                          ? "bg-alerte-puce-fond text-ds-erreur"
                          : "bg-ds-alerte-fond text-ds-alerte")
                      }
                    >
                      {critique(a) ? (
                        <TriangleAlert aria-hidden="true" size={17} strokeWidth={1.9} />
                      ) : (
                        <Clock aria-hidden="true" size={17} strokeWidth={1.9} />
                      )}
                    </span>

                    <div className="min-w-0">
                      {/* LA VALEUR ET LE SEUIL SONT DANS LE TITRE, tous les
                          deux. Sans le seuil, on ne sait pas de combien on
                          dépasse ; sans la valeur, on ne sait pas quoi
                          vérifier. */}
                      <p
                        className={
                          "text-[14px] leading-5 font-bold md:text-[15px] md:leading-[19px] " +
                          (critique(a) ? "text-alerte-titre" : "text-ds-alerte")
                        }
                      >
                        {t(`panneau.alerte.${a.genre}`, {
                          valeur: format.number(a.valeur),
                          seuil: format.number(a.seuil),
                        })}
                      </p>
                      <p
                        className={
                          "mt-[3px] text-[13px] leading-[19px] font-normal md:leading-5 " +
                          (critique(a) ? "text-ds-erreur" : "text-ds-alerte")
                        }
                      >
                        {t(`panneau.alerteDetail.${a.genre}`, {
                          sujet: a.sujet,
                          seuil: format.number(a.seuil),
                        })}
                      </p>
                    </div>
                  </div>

                  <Link
                    href={ouExaminer(a.genre, a.sujet)}
                    className={
                      "flex min-h-11 shrink-0 items-center justify-center rounded-ds-control border bg-ds-surface-carte px-[15px] text-[14px] leading-[18px] font-bold md:h-[38px] md:min-h-0 md:rounded-ds-sm md:text-[13px] md:leading-4 " +
                      (critique(a)
                        ? "border-alerte-bordure text-ds-erreur"
                        : "border-attention-bordure text-ds-alerte")
                    }
                  >
                    {t("panneau.examiner")}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* --- LES VOLUMES --- */}
        <section aria-label={t("panneau.volumes")} className="mt-5 md:mt-7">
          <p className={SUR_TITRE + " mb-3"}>{t("panneau.volumes")}</p>

          {/* L'INDISPONIBILITÉ SE DIT, elle ne se devine pas à quatre tirets.
              Un tiret seul se lirait comme « zéro mal affiché » ; cette ligne
              est ce qui distingue « on n'a pas pu compter » de « il n'y a
              rien », et c'est la distinction qui compte pour qui décide. */}
          {panneau.compteurs === null ? (
            <p className="mb-2.5 text-ds-texte-corps">
              {t("panneau.compteursIndisponibles")}
            </p>
          ) : null}

          {/* CINQ TUILES là où le kit en pose quatre. Sa quatrième est un
              revenu d'abonnements que la contrainte n°1 interdit ; les nôtres
              sont les colis facturés, les comptes, les commandes, les boutiques
              et le stockage. Elles gardent l'anatomie de `AdminStat`. */}
          <div className="flex flex-col gap-2.5 xl:grid xl:grid-cols-5 xl:gap-[18px]">
            {/* `parcels_registered` EN TÊTE ET ENCADRÉ : c'est le seul compteur
                du produit qui corresponde à une FACTURE. Le noyer parmi les
                autres reviendrait à traiter notre seul coût variable comme une
                statistique de plus. */}
            <TuileVolume
              icone={Package}
              accent
              libelle={t("panneau.colisFactures")}
              valeur={chiffre(panneau.compteurs?.colisPrisEnChargeCeMois)}
              badge={
                <span className="rounded-ds-pill bg-ds-accent px-2 py-0.5 text-[11.5px] leading-[15px] font-bold text-ds-texte-sur-marque">
                  {t("panneau.facture")}
                </span>
              }
              complement={t("panneau.ceMoisCi")}
            />

            <TuileVolume
              icone={Users}
              libelle={t("panneau.comptesActifs")}
              valeur={chiffre(panneau.compteurs?.comptesActifs)}
              /* LES DEUX AUTRES ÉTATS DE COMPTE TIENNENT DANS CETTE LIGNE. La
                 planche n'en met qu'un ; sortir « sans type » de l'écran aurait
                 fait disparaître le seul endroit où l'on voit d'un coup combien
                 d'inscrits n'ont jamais fini leur onboarding — et cette colonne
                 existe précisément pour être mesurée. */
              complement={t("panneau.comptesDont", {
                suspendus: chiffre(panneau.compteurs?.comptesSuspendus),
                sansType: chiffre(panneau.compteurs?.comptesSansType),
              })}
            />

            <TuileVolume
              icone={ShoppingCart}
              libelle={t("panneau.commandes")}
              valeur={chiffre(panneau.compteurs?.commandesCreeesCeMois)}
              complement={t("panneau.ceMoisCi")}
            />

            {/*
              LES BOUTIQUES — la troisième tuile du kit, et elle manquait.

              ⚠️ LE CHIFFRE QUI INFORME EST LE SECOND. Une boutique naît à
              l'inscription : il y en a exactement autant que de comptes, et
              afficher ce seul total annoncerait « 20 boutiques » pour vingt
              comptes dont dix-huit n'ont jamais rien configuré. La ligne du
              dessous dit combien sont allés jusqu'à se donner un nom — c'est la
              mesure d'activation, pas de volume.
            */}
            <TuileVolume
              icone={Store}
              libelle={t("panneau.boutiques")}
              valeur={chiffre(panneau.compteurs?.boutiques)}
              complement={t("panneau.boutiquesDont", {
                nommees: chiffre(panneau.compteurs?.boutiquesNommees),
              })}
            />

            {/* LE STOCKAGE EST MESURÉ DEPUIS LA MIGRATION 049 : les octets sont
                tenus à l'écriture, boutique par boutique, à partir de la taille
                RELUE CÔTÉ SERVEUR au dépôt — jamais celle annoncée par le
                client, qui est la base du modèle de coût.

                IL A LONGTEMPS AFFICHÉ « INDISPONIBLE », ET C'ÉTAIT CORRECT :
                zéro aurait affirmé qu'on avait mesuré. La bascule vient de
                l'existence d'un MÉCANISME, pas d'une valeur observée — déduire
                « zéro donc pas mesuré » serait faux pour toute installation
                neuve, c'est-à-dire dès le premier jour.

                C'est l'inverse de la règle de la page publique, et c'est voulu :
                là une information absente est OMISE, ici elle est NOMMÉE. Un
                client consulte, un administrateur décide. */}
            <TuileVolume
              icone={HardDrive}
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
          </div>
        </section>

        {/*
          --- LA RANGÉE DU KIT : LA COURBE, PUIS L'ANNEAU DES STATUTS ---

          Deux panneaux à 1,45 contre 1, comme la planche. Ils répondent à deux
          questions qu'on ne pose pas ensemble : combien de commandes naissent
          chaque jour, et où en sont celles qui existent.

          ⚠️ ILS NE RENDENT QUE DES NOMBRES, et c'est ce qui les autorise à vivre
          sur l'écran d'accueil. Le kit pose à leur droite un tableau
          « Dernières commandes » portant le pseudo du client, la boutique et le
          transporteur de commandes appartenant à d'autres vendeurs : le brief
          obligerait à écrire un audit À CHAQUE OUVERTURE du panneau, et cette
          entrée-là noierait les consultations délibérées que le journal existe
          pour retrouver.
        */}
        <div className="mt-5 grid gap-[18px] md:mt-7 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
          <section className={PANNEAU}>
            {/* L'EN-TÊTE PARTAGE SA LIGNE AVEC LE SÉLECTEUR, comme le kit : la
                colonne du titre se replie à 180 px, elle ne prend pas toute la
                largeur du panneau. */}
            <header className="mb-[18px] flex flex-wrap items-start gap-3.5">
              <div className="min-w-0 flex-[1_1_180px]">
                <h2 className={PANNEAU_TITRE}>{t("panneau.courbe")}</h2>
                <p className={PANNEAU_AIDE}>
                  {t("panneau.commandesAide", { jours: periode })}
                </p>
              </div>
              <SelecteurPeriode langue={langue} periode={periode} />
            </header>
            {courbe === null ? (
              <p className="text-[14px] text-ds-texte-corps">{t("panneau.courbeIndisponible")}</p>
            ) : (
              <CourbeCommandes jours={courbe} />
            )}
          </section>

          <section className={PANNEAU}>
            <header className="mb-[18px]">
              <h2 className={PANNEAU_TITRE}>{t("panneau.statuts")}</h2>
              <p className={PANNEAU_AIDE}>{t("panneau.statutsAide")}</p>
            </header>
            {repartition === null ? (
              <p className="text-[14px] text-ds-texte-corps">
                {t("panneau.statutsIndisponible")}
              </p>
            ) : repartition.total === 0 ? (
              <p className="text-[14px] text-ds-texte-corps">{t("panneau.aucuneCommande")}</p>
            ) : (
              <AnneauStatuts repartition={repartition} />
            )}
          </section>
        </div>

        {/* --- LES DERNIÈRES ACTIONS D'ADMINISTRATION ---

            AU BUREAU SEULEMENT, comme la planche. Rien n'est perdu au
            téléphone : le journal complet est à un onglet, et cette carte n'en
            est qu'un aperçu.

            LA LIRE N'ÉCRIT RIEN. `lire_journal_admin` est déclarée `stable`,
            donc PostgREST l'exécute en transaction lecture seule : le panneau ne
            peut pas se remplir de sa propre consultation. */}
        <section aria-label={t("panneau.dernieresActions")} className="mt-[18px] hidden md:block">
          <div className={PANNEAU}>
            <div className="mb-[18px] flex items-start justify-between gap-3.5">
              <h2 className={PANNEAU_TITRE}>{t("panneau.dernieresActions")}</h2>
              <Link
                href={`/${langue}/admin/journal`}
                className="shrink-0 text-[13px] leading-4 font-semibold text-ds-accent hover:text-ds-accent-survol"
              >
                {t("panneau.toutLeJournal")}
              </Link>
            </div>

            {/* TROIS ÉTATS, PAS DEUX. « Aucune entrée » sur un journal qu'on
                n'a PAS PU LIRE serait une affirmation fausse, et posée sur
                l'écran dont tout le rôle est de porter des faits vérifiables.
                Côté administration une information absente se NOMME — c'est
                l'inverse de la page publique, et c'est voulu : un client
                consulte, un administrateur décide. */}
            {actions === null ? (
              <p className="text-ds-texte-corps">
                {t("panneau.dernieresActionsIndisponibles")}
              </p>
            ) : actions.length === 0 ? (
              <p className="text-ds-texte-corps">
                {t("journal.vide")}
              </p>
            ) : (
              <ul className="flex flex-col">
                {actions.map((ligne, rang) => {
                  const tuile = tuileDAction(ligne.action);
                  const IconeDeLigne = tuile.icone;
                  return (
                    <li
                      key={ligne.id}
                      className={
                        "flex items-center gap-[13px] py-[13px] " +
                        (rang === 0 ? "" : "border-t border-ds-filet")
                      }
                    >
                      <span
                        aria-hidden="true"
                        className={
                          "flex h-[38px] w-[38px] flex-none items-center justify-center rounded-ds-pill " +
                          tuile.fond
                        }
                      >
                        <IconeDeLigne size={17} strokeWidth={1.9} />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-[14px] leading-[normal] font-bold text-ds-texte-fort">
                          {/* Le point devient un souligné : next-intl le traite
                              comme un séparateur de NIVEAU, et
                              `journal.actions.compte.suspension` irait chercher
                              une clé imbriquée qui n'existe pas. */}
                          {t.has(`journal.actions.${ligne.action.replaceAll(".", "_")}`)
                            ? t(`journal.actions.${ligne.action.replaceAll(".", "_")}`)
                            : ligne.action}
                        </span>
                        {/* LA LIGNE DE DESSOUS NE NAÎT QUE SI ELLE A QUELQUE CHOSE
                            À DIRE. Un tiret de remplissage sur chaque action sans
                            cible ferait une colonne de tirets, et l'œil
                            apprendrait à sauter l'endroit où s'écrit l'email. */}
                        {ligne.cibleEmail === null ? null : (
                          <span className="truncate text-[13px] leading-[normal] text-ds-texte-sourdine">
                            {ligne.cibleEmail}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-[12.5px] leading-[normal] whitespace-nowrap text-ds-texte-sourdine">
                        {format.relativeTime(new Date(ligne.quand), {
                          now: maintenant,
                          style: "short",
                        })}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
