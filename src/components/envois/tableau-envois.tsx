import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { decrireSilence } from "@/lib/tracking/silence";
import type { CompteursEnvois, Etat, PageEnvois, ParametresEnvois } from "@/lib/envois/liste";
import { ETATS, TRIS } from "@/lib/envois/liste";

/**
 * L'ÉCRAN DES ENVOIS, portés sur le canevas Claude Design.
 *
 * LA GÉOMÉTRIE DES DEUX MAQUETTES EST REPRISE, leur vocabulaire non. Elles
 * parlent de fournisseurs, d'entrepôts, de palettes, de lots et de tolérances —
 * d'un métier qui n'est pas le nôtre. Ce qui est portable, c'est la structure :
 * une bande de compteurs, une barre de filtres, un tableau dense.
 *
 * DEUX MAQUETTES, UN SEUL ÉCRAN. La première montre le tableau, la seconde les
 * compteurs qui le surplombent. Les livrer séparément aurait donné un écran de
 * chiffres sans liste et une liste sans chiffres, chacun renvoyant à l'autre.
 *
 * RENDU ENTIÈREMENT CÔTÉ SERVEUR, filtres et pagination en LIENS. Zéro octet de
 * bundle, et l'écran fonctionne sans JavaScript. Un fournisseur qui consulte ses
 * envois depuis un téléphone bas de gamme sur un réseau lent n'a pas à attendre
 * qu'un composant s'hydrate pour voir où en sont ses colis.
 *
 * LE CODE TRANSPORTEUR N'EST PAS AFFICHÉ. C'est un identifiant numérique du
 * fournisseur de suivi, et nous n'avons aucune table de correspondance vers un
 * nom lisible. Afficher « 3011 » n'apprendrait rien à personne ; inventer un
 * libellé serait pire. Une information qu'on ne sait pas rendre lisible est
 * omise — la même règle que sur la page publique.
 */

/** Construit un lien de filtre en conservant les autres paramètres. */
function lien(base: string, actuels: ParametresEnvois, modif: Record<string, string | null>): string {
  const p = new URLSearchParams();

  if (actuels.tri !== "immobiles") p.set("tri", actuels.tri);
  if (actuels.etat !== null) p.set("etat", actuels.etat);
  if (actuels.silencieux) p.set("silencieux", "oui");
  if (actuels.abandonnes !== null) p.set("abandonnes", actuels.abandonnes ? "oui" : "non");

  for (const [cle, valeur] of Object.entries(modif)) {
    if (valeur === null) p.delete(cle);
    else p.set(cle, valeur);
  }

  // LE CURSEUR EST TOUJOURS RETIRÉ QUAND UN FILTRE CHANGE. Le garder ferait
  // reprendre la nouvelle liste au milieu de l'ancienne : le vendeur cliquerait
  // « sans mouvement » et tomberait sur une page vide en concluant qu'il n'en a
  // aucun.
  if (!("curseur" in modif)) p.delete("curseur");

  const q = p.toString();
  return q === "" ? base : base + "?" + q;
}

const CARTE = "rounded-xl border border-outline-variant bg-surface-container-lowest p-4";

export async function TableauEnvois({
  base,
  parametres,
  page,
  compteurs,
  maintenant,
}: {
  readonly base: string;
  readonly parametres: ParametresEnvois;
  readonly page: PageEnvois;
  readonly compteurs: CompteursEnvois;
  readonly maintenant: Date;
}) {
  const t = await getTranslations("envois");
  const format = await getFormatter();

  const aUnFiltre =
    parametres.etat !== null || parametres.silencieux || parametres.abandonnes !== null;

  return (
    <div className="flex flex-col gap-gutter">
      {/* --- LES COMPTEURS. Ils portent leur VALEUR, jamais un jugement :
              « 12 sans mouvement depuis plus de 10 jours », pas « des colis sont
              en retard ». Un chiffre se vérifie, une appréciation se discute. --- */}
      <section aria-label={t("compteurs.titre")} className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {(
          [
            { cle: "total", valeur: compteurs.total, filtre: {} },
            { cle: "enTransit", valeur: compteurs.enTransit, filtre: { etat: "en_transit" } },
            { cle: "silencieux", valeur: compteurs.silencieux, filtre: { silencieux: "oui" } },
            { cle: "abandonnes", valeur: compteurs.abandonnes, filtre: { abandonnes: "oui" } },
          ] as const
        ).map((c) => (
          <Link
            key={c.cle}
            href={lien(base, parametres, { etat: null, silencieux: null, abandonnes: null, ...c.filtre })}
            className={CARTE + " transition-colors hover:bg-surface-container-low"}
          >
            <p className="font-label-sm text-label-sm text-on-surface-variant">
              {t(`compteurs.${c.cle}`)}
            </p>
            <p className="mt-1 font-headline-md text-headline-md text-on-surface">
              {format.number(c.valeur)}
            </p>
          </Link>
        ))}
      </section>

      {/* --- LES FILTRES --- */}
      <section aria-label={t("filtres.titre")} className={CARTE}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-label-sm text-label-sm text-on-surface-variant">
            {t("filtres.etat")}
          </span>
          <Link
            href={lien(base, parametres, { etat: null })}
            aria-current={parametres.etat === null ? "true" : undefined}
            className={
              "min-h-[44px] rounded-full px-3 py-2 font-label-sm text-label-sm transition-colors " +
              (parametres.etat === null
                ? "bg-violet-fond text-on-surface"
                : "text-on-surface-variant hover:bg-surface-container-low")
            }
          >
            {t("filtres.tous")}
          </Link>
          {ETATS.map((etat: Etat) => (
            <Link
              key={etat}
              href={lien(base, parametres, { etat })}
              aria-current={parametres.etat === etat ? "true" : undefined}
              className={
                "min-h-[44px] rounded-full px-3 py-2 font-label-sm text-label-sm transition-colors " +
                (parametres.etat === etat
                  ? "bg-violet-fond text-on-surface"
                  : "text-on-surface-variant hover:bg-surface-container-low")
              }
            >
              {t(`etat.${etat}`)}
            </Link>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-outline-variant pt-3">
          <span className="font-label-sm text-label-sm text-on-surface-variant">
            {t("filtres.tri")}
          </span>
          {TRIS.map((tri) => (
            <Link
              key={tri}
              href={lien(base, parametres, { tri: tri === "immobiles" ? "" : tri })}
              aria-current={parametres.tri === tri ? "true" : undefined}
              className={
                "min-h-[44px] rounded-full px-3 py-2 font-label-sm text-label-sm transition-colors " +
                (parametres.tri === tri
                  ? "bg-violet-fond text-on-surface"
                  : "text-on-surface-variant hover:bg-surface-container-low")
              }
            >
              {t(`tri.${tri}`)}
            </Link>
          ))}
        </div>
      </section>

      {/* --- LE TABLEAU --- */}
      {page.lignes.length === 0 ? (
        /* DEUX ÉTATS VIDES DISTINCTS. « Ce compte n'a rien » et « ce filtre ne
           rend rien » sont deux situations différentes : afficher « collez votre
           premier numéro de suivi » à un vendeur qui en a neuf mille est une
           perte de confiance immédiate. */
        <div className={CARTE + " text-center"}>
          <p className="font-body-md text-body-md text-on-surface-variant">
            {aUnFiltre ? t("vide.filtre") : t("vide.compte")}
          </p>
          {aUnFiltre ? (
            <Link
              href={base}
              className="mt-3 inline-flex min-h-[44px] items-center font-label-md text-label-md text-on-surface underline"
            >
              {t("vide.effacer")}
            </Link>
          ) : null}
        </div>
      ) : (
        <div className={CARTE + " overflow-x-auto p-0"}>
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr className="border-b border-outline-variant text-left">
                <th scope="col" className="p-4 font-label-sm text-label-sm text-on-surface-variant">
                  {t("colonnes.numero")}
                </th>
                <th scope="col" className="p-4 font-label-sm text-label-sm text-on-surface-variant">
                  {t("colonnes.etat")}
                </th>
                <th scope="col" className="p-4 font-label-sm text-label-sm text-on-surface-variant">
                  {t("colonnes.mouvement")}
                </th>
                <th scope="col" className="p-4 font-label-sm text-label-sm text-on-surface-variant">
                  {t("colonnes.commandes")}
                </th>
              </tr>
            </thead>
            <tbody>
              {page.lignes.map((ligne) => {
                // La base rend un horodatage en chaîne ; le module de silence
                // travaille sur des dates. La conversion est faite ICI, une fois
                // par ligne, plutôt que dans le module — qui reste ainsi pur et
                // testable sans supposer d'où vient sa donnée.
                const silence = decrireSilence(
                  ligne.dernierMouvement === null ? null : new Date(ligne.dernierMouvement),
                  maintenant,
                );
                return (
                  <tr key={ligne.id} className="border-b border-outline-variant last:border-0">
                    <td className="p-4 font-body-sm text-body-sm text-on-surface">
                      <span className="font-mono">{ligne.numero}</span>
                      {ligne.abandonneLe !== null ? (
                        /* ON DIT QUE NOUS AVONS CESSÉ D'INTERROGER, pas que le
                           colis est perdu. La différence compte : l'un est un
                           fait sur nous, l'autre une affirmation sur le colis
                           que nous ne pouvons pas soutenir. */
                        <span className="ml-2 rounded-full bg-surface-container-high px-2 py-1 font-label-sm text-label-sm text-on-surface-variant">
                          {t("abandonne")}
                        </span>
                      ) : null}
                    </td>
                    <td className="p-4 font-body-sm text-body-sm text-on-surface-variant">
                      {t(`etat.${ligne.etat}`)}
                    </td>
                    <td className="p-4 font-body-sm text-body-sm text-on-surface-variant">
                      {/* L'ANCIENNETÉ EN CLAIR. C'est le seul élément de l'écran
                          qui change tous les jours quand le colis ne bouge pas —
                          un silence nommé est une information, un silence subi
                          se lit comme une panne. */}
                      {silence.etat === "aucun-mouvement"
                        ? t("mouvement.aucun")
                        : silence.jours === 0
                          ? t("mouvement.aujourdhui")
                          : t("mouvement.jours", { n: silence.jours })}
                    </td>
                    <td className="p-4 font-body-sm text-body-sm text-on-surface-variant">
                      {t("commandesRattachees", { n: ligne.commandes })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {page.curseurSuivant !== null ? (
        <Link
          href={lien(base, parametres, { curseur: page.curseurSuivant })}
          className="mx-auto inline-flex min-h-[44px] items-center rounded-lg border border-outline-variant px-6 font-label-md text-label-md text-on-surface transition-colors hover:bg-surface-container-low"
        >
          {t("pageSuivante")}
        </Link>
      ) : null}
    </div>
  );
}
