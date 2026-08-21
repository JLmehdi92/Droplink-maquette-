import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { exigerAdmin } from "@/lib/audit/garde";
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

const CARTE = "rounded-xl border border-outline-variant bg-surface-container-lowest p-4";

/**
 * LE PANNEAU D'ADMINISTRATION.
 *
 * LE TITRE DE LA MAQUETTE EST ABANDONNÉ. Elle l'appelle « Global Logistics
 * Health » : nous n'exploitons aucune logistique, et ce panneau ne parle pas de
 * flux mais de comptes, de coûts et de tâches de fond.
 *
 * LES ALERTES VIENNENT AVANT LES COMPTEURS. Un panneau qui les enterre sous des
 * chiffres oblige à CHERCHER ce qui devrait sauter aux yeux — et c'est
 * précisément le moment où l'on ne cherche pas.
 *
 * CHAQUE SIGNALEMENT PORTE SA VALEUR : « 1 840 pour un seuil de 1 200 », jamais
 * « ce compte dépasse ». Un chiffre se vérifie et se compare ; une appréciation
 * se discute, et l'on finit par ne plus la lire.
 *
 * `never_ran` N'EST PAS UNE ALERTE. Une tâche posée ce matin n'a pas encore eu
 * son premier passage : la signaler ferait chercher une panne inexistante, et
 * une alerte qui se trompe est une alerte qu'on apprend à ignorer.
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
  const panneau = await lirePanneau(supabase, seuils);

  const t = await getTranslations("admin");
  const format = await getFormatter();

  // `null` porte les DEUX cas où l'on n'affiche pas de chiffre : pas de
  // mécanisme de mesure, ou pas de valeur rendue. Les distinguer à l'écran
  // n'apprendrait rien — dans les deux cas, on n'a pas mesuré.
  const taille =
    panneau.stockageMesurable && panneau.stockageOctets !== null
      ? mettreOctetsALEchelle(panneau.stockageOctets)
      : null;

  return (
    <main
      id="contenu"
      className="mx-auto w-full max-w-container-max px-margin-mobile py-12 md:px-margin-desktop"
    >
      <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface md:font-headline-lg md:text-headline-lg">
        {t("panneau.titre")}
      </h1>

      {/* --- LES ALERTES, EN PREMIER --- */}
      <section aria-label={t("panneau.alertes")} className="mt-6">
        {panneau.alertes.length === 0 ? (
          <p className={CARTE + " font-body-md text-body-md text-on-surface-variant"}>
            {t("panneau.aucuneAlerte")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {panneau.alertes.map((a) => (
              <li
                key={a.genre + a.sujet}
                className={
                  "rounded-xl border p-4 " +
                  (a.gravite === "critique"
                    ? "border-error bg-error-container"
                    : "border-outline-variant bg-surface-container-low")
                }
              >
                <p
                  className={
                    "font-label-md text-label-md " +
                    (a.gravite === "critique" ? "text-on-error-container" : "text-on-surface")
                  }
                >
                  {t(`panneau.alerte.${a.genre}`)}
                </p>
                {/* LA VALEUR ET LE SEUIL, tous les deux. Sans le seuil, on ne
                    sait pas de combien on dépasse ; sans la valeur, on ne sait
                    pas quoi vérifier. */}
                <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
                  {t("panneau.valeurContreSeuil", {
                    sujet: a.sujet,
                    valeur: format.number(a.valeur),
                    seuil: format.number(a.seuil),
                  })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* --- LES COMPTEURS, ENSUITE --- */}
      <section aria-label={t("panneau.compteurs")} className="mt-gutter">
        {/* `parcels_registered` EN TÊTE ET ENCADRÉ : c'est le seul compteur du
            produit qui corresponde à une FACTURE. Le noyer parmi les autres
            reviendrait à traiter notre seul coût variable comme une statistique
            de plus. */}
        <div className={CARTE + " border-2 border-outline"}>
          <p className="font-label-sm text-label-sm text-on-surface-variant">
            {t("panneau.colisFactures")}
          </p>
          <p className="mt-1 font-headline-lg-mobile text-headline-lg-mobile text-on-surface">
            {format.number(panneau.compteurs.colisPrisEnChargeCeMois)}
          </p>
          <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
            {t("panneau.colisFacturesAide", {
              abandonnes: format.number(panneau.compteurs.colisAbandonnesCeMois),
            })}
          </p>
        </div>

        <div className="mt-gutter grid grid-cols-2 gap-2 md:grid-cols-4">
          {(
            [
              { cle: "comptes", valeur: panneau.compteurs.comptes },
              { cle: "comptesActifs", valeur: panneau.compteurs.comptesActifs },
              { cle: "comptesSuspendus", valeur: panneau.compteurs.comptesSuspendus },
              { cle: "comptesSansType", valeur: panneau.compteurs.comptesSansType },
            ] as const
          ).map((c) => (
            <div key={c.cle} className={CARTE}>
              <p className="font-label-sm text-label-sm text-on-surface-variant">
                {t(`panneau.${c.cle}`)}
              </p>
              <p className="mt-1 font-headline-md text-headline-md text-on-surface">
                {format.number(c.valeur)}
              </p>
            </div>
          ))}
        </div>

        {/* LE STOCKAGE EST MESURÉ DEPUIS LA MIGRATION 049 : les octets sont
            tenus à l'écriture, boutique par boutique, à partir de la taille
            RELUE CÔTÉ SERVEUR au dépôt — jamais celle annoncée par le client,
            qui est la base du modèle de coût.

            IL A LONGTEMPS AFFICHÉ « INDISPONIBLE », ET C'ÉTAIT CORRECT : zéro
            aurait affirmé qu'on avait mesuré. La bascule vient de l'existence
            d'un MÉCANISME, pas d'une valeur observée — déduire « zéro donc pas
            mesuré » serait faux pour toute installation neuve, c'est-à-dire dès
            le premier jour.

            C'est l'inverse de la règle de la page publique, et c'est voulu : là
            une information absente est OMISE, ici elle est NOMMÉE. Un client
            consulte, un administrateur décide. */}
        <div className={CARTE + " mt-gutter"}>
          <p className="font-label-sm text-label-sm text-on-surface-variant">
            {t("panneau.stockage")}
          </p>
          <p className="mt-1 font-headline-md text-headline-md text-on-surface">
            {taille === null
              ? t("panneau.stockageIndisponible")
              : t("panneau.stockageValeur", {
                  valeur: format.number(taille.valeur, {
                    minimumFractionDigits: taille.decimales,
                    maximumFractionDigits: taille.decimales,
                  }),
                  unite: t(`unites.${taille.unite}`),
                })}
          </p>
          <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
            {t("panneau.stockageAide")}
          </p>
        </div>
      </section>

      {/* --- LES TÂCHES DE FOND --- */}
      <section aria-label={t("panneau.taches")} className="mt-gutter">
        <h2 className="font-headline-md text-headline-md-mobile text-on-surface">
          {t("panneau.taches")}
        </h2>

        {panneau.aucuneTacheDeployee ? (
          /* TROIS ÉTATS, PAS DEUX. « Jamais déployé » n'est PAS une panne : rien
             n'a encore été mis en service, et l'annoncer comme un retard
             enverrait chercher un défaut dans un mécanisme inexistant. */
          <p className={CARTE + " mt-3 font-body-md text-body-md text-on-surface-variant"}>
            {t("panneau.tachesJamaisDeployees")}
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {panneau.taches.map((tache) => (
              <li
                key={tache.source}
                className={
                  CARTE +
                  " flex flex-wrap items-baseline justify-between gap-2 " +
                  (tache.etat === "en_retard" ? "border-error" : "")
                }
              >
                <span className="font-label-md text-label-md text-on-surface">{tache.source}</span>
                <span className="font-body-sm text-body-sm text-on-surface-variant">
                  {t(`panneau.tache.${tache.etat}`, { n: tache.minutes })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-gutter font-body-sm text-body-sm text-on-surface-variant">
        {t("panneau.seuilsEnCours", {
          colis: format.number(seuils.colis),
          minutes: format.number(seuils.retardMinutes),
        })}
      </p>
    </main>
  );
}
