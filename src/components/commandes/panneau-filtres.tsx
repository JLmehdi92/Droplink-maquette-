import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Icone } from "@/components/icone";
import { STATUTS_EXPEDITION, STATUTS_QC, TRIS, type ParametresListe } from "@/lib/commandes/liste";
import { lienListe, listeFiltree } from "@/lib/commandes/url";

/**
 * LE PANNEAU DE FILTRES COMPLET, replié par défaut.
 *
 * IL A PERDU SA COLONNE. Le canevas n'a pas de barre latérale de filtres : les
 * quatre vues courantes sont des pilules au-dessus du tableau, et tout le reste
 * — statut QC, archives, tri — vit ici, dans un panneau qu'on ouvre quand on en
 * a besoin. Une colonne permanente coûtait un quart de la largeur de l'écran le
 * plus utilisé du produit pour des réglages qu'on touche une fois par semaine.
 *
 * REPLIÉ PAR `<details>`, donc SANS JAVASCRIPT. Il s'ouvre de lui-même quand un
 * filtre est actif : sinon un vendeur verrait une liste restreinte sans voir ce
 * qui la restreint, et conclurait à une perte de données.
 *
 * TOUT PASSE PAR UN FORMULAIRE `GET`. Pas d'état client, pas de bundle, et
 * l'écran fonctionne sans JavaScript. Le vendeur peut recopier son URL, la
 * mettre en favori, revenir en arrière : c'est ce que le navigateur sait faire
 * et qu'un état interne casse toujours.
 */
export async function PanneauFiltres({
  base,
  parametres,
}: {
  readonly base: string;
  readonly parametres: ParametresListe;
}) {
  const t = await getTranslations("commandes");
  const filtree = listeFiltree(parametres);

  const champ =
    "champ-app min-h-11 w-full rounded-md border border-outline px-3 font-body-md text-body-md text-on-surface outline-none";

  return (
    <details
      open={filtree}
      className="mx-margin-mobile rounded-lg border border-outline-variant bg-surface-container-lowest md:mx-0"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-5 py-3 font-label-md text-[13px] font-bold text-on-surface-variant">
        <Icone nom="filter_list" className="text-[18px]" />
        {t("filtres")}
        {filtree ? (
          <span className="ml-auto font-body-sm text-[12px] font-normal text-secondary">
            {t("filtresActifs")}
          </span>
        ) : null}
      </summary>

      <div className="grid gap-5 border-t border-outline-variant p-5 md:grid-cols-2">
      <form method="get" action={base}>
        {/* Le tri courant survit à l'envoi du formulaire : c'est un réglage
            d'affichage, pas un filtre, et le perdre à chaque filtrage serait
            vécu comme une remise à zéro. */}
        {parametres.tri !== "recentes" ? (
          <input type="hidden" name="tri" value={parametres.tri} />
        ) : null}
        {parametres.q !== "" ? <input type="hidden" name="q" value={parametres.q} /> : null}

        <div className="flex flex-col gap-4">
          <div>
            <label
              htmlFor="statut"
              className="mb-1 block font-label-sm text-label-sm text-on-surface-variant"
            >
              {t("statutExpedition")}
            </label>
            <select id="statut" name="statut" defaultValue={parametres.statut ?? ""} className={champ}>
              <option value="">{t("tousStatuts")}</option>
              {STATUTS_EXPEDITION.map((s) => (
                <option key={s} value={s}>
                  {t("statut." + s)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="qc"
              className="mb-1 block font-label-sm text-label-sm text-on-surface-variant"
            >
              {t("statutQc")}
            </label>
            <select id="qc" name="qc" defaultValue={parametres.qc ?? ""} className={champ}>
              <option value="">{t("tousQc")}</option>
              {STATUTS_QC.map((s) => (
                <option key={s} value={s}>
                  {t("qc." + s)}
                </option>
              ))}
            </select>
          </div>

          {/*
            LA PÉRIODE, sur la date de CRÉATION — c'est ainsi que le vendeur y
            pense : « les commandes de la semaine dernière ».

            DEUX CHAMPS `date` NATIFS et non un sélecteur maison : ils ouvrent le
            calendrier du système, se saisissent au clavier, et ne coûtent pas un
            octet de JavaScript sur un écran que le fournisseur ouvre deux cents
            fois par semaine.

            ⚠️ LA BORNE HAUTE EST INCLUSE, et c'est tout le sujet de ce filtre.
            `au=2026-08-16` vaut minuit : comparé tel quel, il exclurait toute la
            journée du 16. La lecture compare donc au LENDEMAIN en strictement
            inférieur — voir `borneHauteExclusive`. Le libellé promet « jusqu'au »,
            et la base tient cette promesse.
          */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="du"
                className="mb-1 block font-label-sm text-label-sm text-on-surface-variant"
              >
                {t("periodeDu")}
              </label>
              <input
                id="du"
                name="du"
                type="date"
                defaultValue={parametres.du ?? ""}
                max={parametres.au ?? undefined}
                className={champ}
              />
            </div>
            <div>
              <label
                htmlFor="au"
                className="mb-1 block font-label-sm text-label-sm text-on-surface-variant"
              >
                {t("periodeAu")}
              </label>
              <input
                id="au"
                name="au"
                type="date"
                defaultValue={parametres.au ?? ""}
                min={parametres.du ?? undefined}
                className={champ}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface">
            <input
              type="checkbox"
              name="archivees"
              value="1"
              defaultChecked={parametres.archivees}
              className="h-4 w-4 rounded border-outline-variant accent-[var(--accent-interface)]"
            />
            {t("voirArchivees")}
          </label>

          <button
            type="submit"
            className="mt-1 min-h-11 w-full rounded-md bg-primary px-4 font-label-md text-[14px] font-bold text-on-primary transition-opacity hover:opacity-90"
          >
            {t("appliquer")}
          </button>

          {filtree ? (
            <Link
              href={base}
              className="text-center font-label-md text-[13px] text-secondary hover:underline"
            >
              {t("toutEffacer")}
            </Link>
          ) : null}
        </div>
      </form>

      <div>
        <h2 className="mb-3 flex items-center gap-2 font-label-sm text-[11px] font-bold tracking-[0.05em] text-sourdine uppercase">
          <Icone nom="schedule" className="text-[16px]" />
          {t("trier")}
        </h2>
        <ul className="flex flex-col gap-1">
          {TRIS.map((tri) => {
            const actif = parametres.tri === tri;
            return (
              <li key={tri}>
                <Link
                  href={lienListe(base, parametres, { tri })}
                  aria-current={actif ? "true" : undefined}
                  className={
                    "flex min-h-11 items-center rounded-md px-3 font-body-md text-body-md transition-colors md:min-h-0 md:py-2 " +
                    (actif
                      ? "bg-secondary-container font-semibold text-secondary"
                      : "text-on-surface-variant hover:bg-surface-container")
                  }
                >
                  {t("tri." + tri)}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
      </div>
    </details>
  );
}
