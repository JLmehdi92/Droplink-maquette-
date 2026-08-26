import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Icone } from "@/components/icone";
import { STATUTS_EXPEDITION, STATUTS_QC, TRIS, type ParametresListe } from "@/lib/commandes/liste";
import { lienListe, listeFiltree } from "@/lib/commandes/url";

/**
 * Colonne de gauche de la maquette `gestion_d_inventaire_envois` : la boîte de
 * filtres, puis une boîte de même géométrie pour le tri.
 *
 * LA MAQUETTE MET DEUX ENCARTS D'INDICATEURS SOUS LES FILTRES — « durée moyenne
 * de transit », « fournisseurs actifs ». Aucun des deux ne se calcule : nous
 * n'avons ni durées de transit, ni fournisseurs. Les afficher avec une valeur
 * inventée ferait décider sur du faux ; les afficher à zéro ferait croire qu'on
 * a mesuré. La géométrie de l'emplacement est conservée, le contenu est le tri —
 * qui, lui, existe.
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
    "w-full rounded-lg border border-outline-variant champ-app px-3 py-2 font-body-sm text-body-sm text-on-surface outline-none transition-all";

  return (
    <aside className="col-span-1 flex flex-col gap-gutter md:col-span-3">
      <form method="get" action={base} className="carte rounded-xl p-6 shadow-sm">
        {/* Le tri courant survit à l'envoi du formulaire : c'est un réglage
            d'affichage, pas un filtre, et le perdre à chaque filtrage serait
            vécu comme une remise à zéro. */}
        {parametres.tri !== "recentes" ? (
          <input type="hidden" name="tri" value={parametres.tri} />
        ) : null}
        {parametres.q !== "" ? <input type="hidden" name="q" value={parametres.q} /> : null}

        <h2 className="mb-4 flex items-center gap-2 font-label-md text-label-md text-on-surface">
          <Icone nom="filter_list" className="text-[20px] text-on-surface-variant" />
          {t("filtres")}
        </h2>

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
            className="mt-2 w-full rounded-lg border-2 border-on-surface px-4 py-2 font-label-md text-label-md text-on-surface transition-colors hover:bg-surface-variant"
          >
            {t("appliquer")}
          </button>

          {filtree ? (
            <Link
              href={base}
              className="text-center font-label-sm text-label-sm text-[var(--accent-texte)] hover:underline"
            >
              {t("toutEffacer")}
            </Link>
          ) : null}
        </div>
      </form>

      <div className="carte rounded-xl p-6 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 font-label-md text-label-md text-on-surface">
          <Icone nom="schedule" className="text-[20px] text-on-surface-variant" />
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
                    "block rounded-lg px-3 py-2 font-body-sm text-body-sm transition-colors " +
                    (actif
                      ? "bg-[color-mix(in_srgb,var(--accent-interface)_12%,transparent)] font-semibold text-[var(--accent-texte)]"
                      : "text-on-surface-variant hover:bg-surface-variant")
                  }
                >
                  {t("tri." + tri)}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
