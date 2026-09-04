import Link from "next/link";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { Icone } from "@/components/icone";
import { EnTeteAdmin } from "@/components/admin/en-tete-admin";
import { exigerAdmin } from "@/lib/audit/garde";
import { natureDAction } from "@/lib/admin/nature-d-action";
import { lireDernieresActions } from "@/lib/audit/comptes";
import { lirePanneau, lireSeuils } from "@/lib/audit/panneau";
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

const CARTE = "rounded-[16px] border border-outline-variant bg-surface-container-lowest p-4 md:rounded-[18px] md:p-5";
const SUR_TITRE =
  "font-headline-md text-[11px] leading-[13px] font-bold tracking-[0.08em] text-gris-entete uppercase";

/**
 * LA PASTILLE D'UNE LIGNE DE JOURNAL, par famille d'action.
 *
 * Elle se lit à la couleur SEULE, ce qui serait insuffisant si elle portait une
 * information : elle ne fait que doubler le libellé qui suit, lequel dit déjà
 * de quelle action il s'agit. C'est un repère de balayage, pas un code.
 */
const PASTILLE = {
  suspension: "bg-alerte-puce",
  reactivation: "bg-succes",
  parametre: "bg-violet",
  consultation: "bg-gris-inactif",
} as const;

function couleurPastille(action: string): string {
  return PASTILLE[natureDAction(action)];
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
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const langue = estLangueSupportee(locale) ? locale : "fr";
  setRequestLocale(langue);

  await exigerAdmin();

  const supabase = await creerClientServeur();
  const seuils = await lireSeuils(supabase);
  // Les deux lectures sont indépendantes : les enchaîner doublerait l'attente du
  // premier écran que voit un administrateur.
  const [panneau, actions] = await Promise.all([
    lirePanneau(supabase, seuils),
    lireDernieresActions(supabase, DERNIERES_ACTIONS),
  ]);

  const t = await getTranslations("admin");
  const format = await getFormatter();
  // UN SEUL INSTANT DE REFERENCE POUR TOUT L'ECRAN. Rappele a chaque ligne, il
  // avancerait pendant le rendu et deux lignes du meme evenement pourraient
  // s'ecrire differemment.
  const maintenant = new Date();

  // `null` porte les DEUX cas où l'on n'affiche pas de chiffre : pas de
  // mécanisme de mesure, ou pas de valeur rendue. Les distinguer à l'écran
  // n'apprendrait rien — dans les deux cas, on n'a pas mesuré.
  const taille =
    panneau.stockageMesurable && panneau.stockageOctets !== null
      ? mettreOctetsALEchelle(panneau.stockageOctets)
      : null;

  const critique = (a: { gravite: string }): boolean => a.gravite === "critique";

  const ouExaminer = (genre: string, sujet: string): string =>
    genre === "veilleur_en_retard"
      ? `/${langue}/admin/surveillance`
      : `/${langue}/admin/comptes?q=${encodeURIComponent(sujet)}`;

  return (
    <main id="contenu" className="md:px-[30px] md:py-[26px]">
      <EnTeteAdmin titre={t("panneau.titre")} sousTitre={t("panneau.sousTitre")} />

      <div className="p-4 md:mt-[22px] md:p-0">
        {/* --- CE QUI DEMANDE UNE DÉCISION --- */}
        <section aria-label={t("panneau.decision")}>
          <p className={SUR_TITRE + " mb-3"}>{t("panneau.decision")}</p>

          {panneau.alertes.length === 0 ? (
            <p className={CARTE + " font-body-md text-body-md text-on-surface-variant"}>
              {t("panneau.aucuneAlerte")}
            </p>
          ) : (
            <ul className="flex flex-col gap-2.5 md:gap-2.5">
              {panneau.alertes.map((a) => (
                <li
                  key={a.genre + a.sujet}
                  className={
                    "flex flex-col gap-[13px] rounded-[16px] border p-4 md:flex-row md:items-start md:rounded-[15px] md:px-[18px] md:py-4 " +
                    (critique(a)
                      ? "border-alerte-filet bg-alerte-fond-carte"
                      : "border-attention-filet bg-attention-fond")
                  }
                >
                  <div className="flex gap-[11px] md:flex-grow md:gap-[13px]">
                    {/* La pastille double la couleur de fond, elle ne la
                        remplace pas : une couleur seule ne se lit pas de la même
                        façon selon les yeux. */}
                    <span
                      aria-hidden="true"
                      className={
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] md:h-[34px] md:w-[34px] " +
                        (critique(a)
                          ? "bg-alerte-puce-fond text-alerte"
                          : "bg-attention-puce text-attention-icone")
                      }
                    >
                      <Icone
                        nom={critique(a) ? "warning" : "schedule"}
                        className="text-[16px] md:text-[17px]"
                      />
                    </span>

                    <div className="min-w-0">
                      {/* LA VALEUR ET LE SEUIL SONT DANS LE TITRE, tous les
                          deux. Sans le seuil, on ne sait pas de combien on
                          dépasse ; sans la valeur, on ne sait pas quoi
                          vérifier. */}
                      <p
                        className={
                          "font-headline-md text-[14px] leading-5 font-bold md:text-[15px] md:leading-[19px] " +
                          (critique(a) ? "text-alerte-titre" : "text-attention")
                        }
                      >
                        {t(`panneau.alerte.${a.genre}`, {
                          valeur: format.number(a.valeur),
                          seuil: format.number(a.seuil),
                        })}
                      </p>
                      <p
                        className={
                          "mt-[3px] font-headline-md text-[13px] leading-[19px] font-normal md:leading-5 " +
                          (critique(a) ? "text-alerte-texte" : "text-attention-doux")
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
                      "flex min-h-11 shrink-0 items-center justify-center rounded-[11px] border bg-surface-container-lowest px-[15px] font-headline-md text-[14px] leading-[18px] font-bold md:h-[38px] md:min-h-0 md:rounded-[10px] md:text-[13px] md:leading-4 " +
                      (critique(a)
                        ? "border-alerte-bordure text-alerte"
                        : "border-attention-bordure text-attention")
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

          <div className="flex flex-col gap-2.5 xl:grid xl:grid-cols-4 xl:gap-3">
            {/* `parcels_registered` EN TÊTE ET ENCADRÉ : c'est le seul compteur
                du produit qui corresponde à une FACTURE. Le noyer parmi les
                autres reviendrait à traiter notre seul coût variable comme une
                statistique de plus. */}
            <div className={CARTE + " border-violet-filet bg-violet-carte md:border-violet-filet"}>
              <div className="mb-[7px] flex items-center gap-[7px] md:mb-2">
                <p className="font-headline-md text-[12px] leading-[15px] font-bold text-violet-encre">
                  {t("panneau.colisFactures")}
                </p>
                <span className="rounded-full bg-violet px-1.5 py-0.5 font-headline-md text-[9px] leading-[11px] font-bold text-white md:px-[7px] md:text-[10px] md:leading-3">
                  {t("panneau.facture")}
                </span>
              </div>
              <p className="font-headline-xl text-[30px] leading-[38px] font-extrabold tracking-[-0.035em] text-violet-sombre">
                {format.number(panneau.compteurs.colisPrisEnChargeCeMois)}
              </p>
              <p className="mt-[5px] font-headline-md text-[12px] leading-[15px] font-normal text-violet-encre md:mt-1.5">
                {t("panneau.ceMoisCi")}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5 xl:contents">
              <div className={CARTE}>
                <p className="mb-1.5 font-body-sm text-[12px] leading-[15px] text-sourdine md:mb-2">
                  {t("panneau.comptesActifs")}
                </p>
                <p className="font-headline-xl text-[24px] leading-[30px] font-extrabold tracking-[-0.03em] text-on-surface md:text-[30px] md:leading-[38px] md:tracking-[-0.035em]">
                  {format.number(panneau.compteurs.comptesActifs)}
                </p>
                {/* LES DEUX AUTRES ÉTATS DE COMPTE TIENNENT DANS CETTE LIGNE.
                    La planche n'en met qu'un ; sortir « sans type » de l'écran
                    aurait fait disparaître le seul endroit où l'on voit d'un
                    coup combien d'inscrits n'ont jamais fini leur onboarding —
                    et cette colonne existe précisément pour être mesurée. */}
                <p className="mt-1.5 hidden font-body-sm text-[12px] leading-[15px] text-sourdine md:block">
                  {t("panneau.comptesDont", {
                    suspendus: format.number(panneau.compteurs.comptesSuspendus),
                    sansType: format.number(panneau.compteurs.comptesSansType),
                  })}
                </p>
              </div>

              <div className={CARTE}>
                <p className="mb-1.5 font-body-sm text-[12px] leading-[15px] text-sourdine md:mb-2">
                  <span className="md:hidden">{t("panneau.commandesCourt")}</span>
                  <span className="hidden md:inline">{t("panneau.commandes")}</span>
                </p>
                <p className="font-headline-xl text-[24px] leading-[30px] font-extrabold tracking-[-0.03em] text-on-surface md:text-[30px] md:leading-[38px] md:tracking-[-0.035em]">
                  {format.number(panneau.compteurs.commandesCreeesCeMois)}
                </p>
                <p className="mt-1.5 hidden font-body-sm text-[12px] leading-[15px] text-sourdine md:block">
                  {t("panneau.ceMoisCi")}
                </p>
              </div>
            </div>

            {/* LE STOCKAGE EST MESURÉ DEPUIS LA MIGRATION 049 : les octets sont
                tenus à l'écriture, boutique par boutique, à partir de la taille
                RELUE CÔTÉ SERVEUR au dépôt — jamais celle annoncée par le
                client, qui est la base du modèle de coût.

                IL A LONGTEMPS AFFICHÉ « INDISPONIBLE », ET C'ÉTAIT CORRECT :
                zéro aurait affirmé qu'on avait mesuré. La bascule vient de
                l'existence d'un MÉCANISME, pas d'une valeur observée — déduire
                « zéro donc pas mesuré » serait faux pour toute installation
                neuve, c'est-à-dire dès le premier jour.

                C'est l'inverse de la règle de la page publique, et c'est voulu :
                là une information absente est OMISE, ici elle est NOMMÉE. Un
                client consulte, un administrateur décide. */}
            <div className={CARTE}>
              <p className="mb-1.5 font-body-sm text-[12px] leading-[15px] text-sourdine md:mb-2">
                {t("panneau.stockage")}
              </p>
              {taille === null ? (
                <p className="font-headline-md text-[19px] leading-6 font-bold tracking-[-0.02em] text-sourdine md:text-[22px] md:leading-7">
                  {t("panneau.stockageIndisponible")}
                </p>
              ) : (
                <p className="font-headline-md text-[19px] leading-6 font-bold tracking-[-0.02em] text-on-surface md:text-[22px] md:leading-7">
                  {t("panneau.stockageValeur", {
                    valeur: format.number(taille.valeur, {
                      minimumFractionDigits: taille.decimales,
                      maximumFractionDigits: taille.decimales,
                    }),
                    unite: t(`unites.${taille.unite}`),
                  })}
                </p>
              )}
              <p className="mt-[5px] font-body-sm text-[12px] leading-[18px] text-sourdine md:mt-1.5 md:leading-[17px]">
                {t("panneau.stockageAide")}
              </p>
            </div>
          </div>
        </section>

        {/* --- LES DERNIÈRES ACTIONS D'ADMINISTRATION ---

            AU BUREAU SEULEMENT, comme la planche. Rien n'est perdu au
            téléphone : le journal complet est à un onglet, et cette carte n'en
            est qu'un aperçu.

            LA LIRE N'ÉCRIT RIEN. `lire_journal_admin` est déclarée `stable`,
            donc PostgREST l'exécute en transaction lecture seule : le panneau ne
            peut pas se remplir de sa propre consultation. */}
        <section aria-label={t("panneau.dernieresActions")} className="mt-4 hidden md:block">
          <div className="rounded-[16px] border border-outline-variant bg-surface-container-lowest p-4 md:rounded-[18px] md:p-[22px]">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="font-headline-md text-[16px] leading-[21px] font-bold tracking-[-0.015em] text-on-surface">
                {t("panneau.dernieresActions")}
              </h2>
              <Link
                href={`/${langue}/admin/journal`}
                className="shrink-0 font-headline-md text-[13px] leading-4 font-semibold text-violet hover:text-violet-survol"
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
              <p className="font-body-md text-body-md text-on-surface-variant">
                {t("panneau.dernieresActionsIndisponibles")}
              </p>
            ) : actions.length === 0 ? (
              <p className="font-body-md text-body-md text-on-surface-variant">
                {t("journal.vide")}
              </p>
            ) : (
              <ul className="flex flex-col gap-3.5">
                {actions.map((ligne) => (
                  <li key={ligne.id} className="flex items-center gap-[13px]">
                    <span
                      aria-hidden="true"
                      className={
                        "h-[7px] w-[7px] shrink-0 rounded-full " + couleurPastille(ligne.action)
                      }
                    />
                    <span className="min-w-0 flex-grow truncate font-headline-md text-[14px] leading-[18px] font-normal text-on-surface">
                      {/* Le point devient un souligné : next-intl le traite comme
                          un séparateur de NIVEAU, et `journal.actions.compte.suspension`
                          irait chercher une clé imbriquée qui n'existe pas. */}
                      {t.has(`journal.actions.${ligne.action.replaceAll(".", "_")}`)
                        ? t(`journal.actions.${ligne.action.replaceAll(".", "_")}`)
                        : ligne.action}
                      {ligne.cibleEmail !== null ? (
                        <>
                          {" — "}
                          <strong className="font-bold">{ligne.cibleEmail}</strong>
                        </>
                      ) : null}
                    </span>
                    <span className="shrink-0 font-body-sm text-[13px] leading-4 text-sourdine">
                      {format.relativeTime(new Date(ligne.quand), {
                        now: maintenant,
                        style: "short",
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
