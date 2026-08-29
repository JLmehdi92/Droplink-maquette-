import { getTranslations } from "next-intl/server";
import { Icone } from "@/components/icone";
import { STATUTS_EXPEDITION, STATUTS_QC, TRIS, type ParametresListe } from "@/lib/commandes/liste";
import { lienListe, listeFiltree } from "@/lib/commandes/url";
import { LienEcran } from "@/components/lien-ecran";
import { DETAILS_OUTIL, PANNEAU_OUTIL, PILULE_OUTIL } from "@/components/panneau-outil";

/**
 * LE PANNEAU DE FILTRES COMPLET, replié dans la barre d'outils du tableau.
 *
 * IL A PERDU SA COLONNE, PUIS SA CARTE. Le canevas n'a jamais eu de barre
 * latérale de filtres : les quatre vues courantes sont des pilules au-dessus du
 * tableau, et tout le reste — statut QC, période, archives, tri — vit ici.
 *
 * ⚠️ IL ÉTAIT UNE CARTE À PART, POSÉE ENTRE LES PUCES ET LE TABLEAU. Deux
 * cartes empilées au-dessus d'une liste, dont l'une ne sert qu'à en régler
 * l'autre : la planche `Commandes` n'en dessine qu'une, et c'est elle qui a
 * raison. La planche `CommandesOutils`, écrite le 29/08/2026, montre désormais
 * l'état ouvert — une pilule dans la rangée, un panneau ancré dessous.
 *
 * ⚠️ LE PANNEAU RECOUVRE, IL NE POUSSE PAS, et ce n'est pas un choix
 * d'implantation. Déplié dans le flux, il descend le tableau de près de 360 px :
 * la liste qu'on est en train de filtrer sort de l'écran au moment précis où on
 * la règle. Ancré, il se referme sur la même liste, au même endroit.
 *
 * REPLIÉ PAR `<details>`, donc SANS JAVASCRIPT, et Échap ferme.
 *
 * ⚠️ IL S'OUVRAIT DE LUI-MÊME dès qu'un filtre était actif, pour que le vendeur
 * voie ce qui restreint sa liste. Ce n'est plus son travail : les PUCES DE
 * CRITÈRES au-dessus de la carte le disent, chacune retirable seule, comme la
 * planche `CommandesFiltreVide` l'exige.
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
    "champ-app min-h-11 w-full rounded-[11px] border border-filet-controle px-3 font-body-md text-[14px] text-on-surface outline-none lg:h-[42px] lg:min-h-0";

  return (
    <details className={DETAILS_OUTIL + " lg:open:static"}>
      <summary className={PILULE_OUTIL}>
        <Icone nom="filter_list" className="text-[14px]" />
        {t("filtres")}
        <Icone nom="expand_more" className="text-[14px]" />
      </summary>

      <div
        className={
          PANNEAU_OUTIL +
          " flex flex-col gap-5 lg:grid lg:w-[666px] lg:grid-cols-[minmax(0,1fr)_240px] lg:gap-[22px]"
        }
      >
        <form method="get" action={base} className="flex flex-col gap-3.5">
          {/* Le tri courant survit à l'envoi du formulaire : c'est un réglage
              d'affichage, pas un filtre, et le perdre à chaque filtrage serait
              vécu comme une remise à zéro. */}
          {parametres.tri !== "recentes" ? (
            <input type="hidden" name="tri" value={parametres.tri} />
          ) : null}
          {parametres.q !== "" ? <input type="hidden" name="q" value={parametres.q} /> : null}

          <div>
            <label
              htmlFor="statut"
              className="mb-1.5 block font-label-md text-[12px] leading-[15px] font-semibold text-ardoise"
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
              className="mb-1.5 block font-label-md text-[12px] leading-[15px] font-semibold text-ardoise"
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
                className="mb-1.5 block font-label-md text-[12px] leading-[15px] font-semibold text-ardoise"
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
                className="mb-1.5 block font-label-md text-[12px] leading-[15px] font-semibold text-ardoise"
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

          <label className="flex min-h-11 items-center gap-2.5 font-body-md text-[14px] text-on-surface lg:min-h-0 lg:leading-[18px]">
            <input
              type="checkbox"
              name="archivees"
              value="1"
              defaultChecked={parametres.archivees}
              className="h-4 w-4 rounded-[5px] border-outline-variant accent-[var(--accent-interface)]"
            />
            {t("voirArchivees")}
          </label>

          <div className="flex items-center gap-3.5 lg:mt-0.5">
            <button
              type="submit"
              className="flex min-h-11 items-center rounded-[11px] bg-primary px-[22px] font-label-md text-[14px] font-bold text-on-primary transition-opacity hover:opacity-90 lg:h-[42px] lg:min-h-0"
            >
              {t("appliquer")}
            </button>

            {filtree ? (
              <LienEcran
                href={base}
                className="font-label-md text-[13px] font-bold text-violet hover:underline"
              >
                {t("toutEffacer")}
              </LienEcran>
            ) : null}
          </div>
        </form>

        {/*
          LE TRI N'EST PAS DANS LE FORMULAIRE : ce sont des LIENS. Un tri se pose
          d'un geste et se lit dans l'URL ; le passer par « Appliquer » ferait
          payer deux gestes pour un réglage qu'on change en parcourant la liste.
        */}
        <div className="border-t border-filet-ligne pt-4 lg:border-t-0 lg:border-s lg:pt-0 lg:ps-5">
          <h2 className="mb-3 font-label-sm text-[11px] font-bold tracking-[0.05em] text-gris-entete uppercase">
            {t("trier")}
          </h2>
          <ul className="flex flex-col gap-0.5">
            {TRIS.map((tri) => {
              const actif = parametres.tri === tri;
              return (
                <li key={tri}>
                  <LienEcran
                    href={lienListe(base, parametres, { tri })}
                    aria-current={actif ? "true" : undefined}
                    className={
                      "flex min-h-11 items-center rounded-[8px] px-3 font-body-md text-[14px] transition-colors lg:min-h-9 " +
                      (actif
                        ? "bg-violet-fond font-semibold text-violet"
                        : "text-ardoise hover:bg-surface-container")
                    }
                  >
                    {t("tri." + tri)}
                  </LienEcran>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </details>
  );
}
