import { getTranslations } from "next-intl/server";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { STATUTS_EXPEDITION, STATUTS_QC, TRIS, type ParametresListe } from "@/lib/commandes/liste";
import { lienListe, listeFiltree } from "@/lib/commandes/url";
import { LienEcran } from "@/components/lien-ecran";
import { DETAILS_OUTIL_DS, PANNEAU_OUTIL_DS, PILULE_OUTIL_DS } from "@/components/panneau-outil";

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

  /*
   * ⚠️ PLUS DE `champ-app`, ET CE N'ÉTAIT PAS UN NETTOYAGE DE CONFORT.
   *
   * `.champ-app` est déclarée HORS de toute `@layer` dans `globals.css`, et
   * Tailwind v4 range ses utilitaires dans `@layer utilities`. Or une règle SANS
   * couche l'emporte sur une règle EN couche, quelle que soit sa spécificité :
   * elle écrasait donc `bg-ds-surface-carte`, `border-ds-filet` et `text-[14px]`
   * par le fond, le filet et les 15 px de l'ancien thème.
   *
   * Le défaut est parfaitement silencieux : les classes du design system sont
   * bien ÉCRITES, bien SERVIES, et les deux gardes qui les surveillent restent
   * vertes — elles vérifient qu'une classe existe et qu'elle pointe sur une
   * variable définie, jamais qui gagne la cascade. Seul le champ rendu le dit.
   *
   * Les deux autres appelants de `.champ-app` — l'éditeur de marque et
   * l'arbitrage QC — la gardent : ils ne sont pas migrés, et c'est encore leur
   * dessin.
   */
  const champ =
    "min-h-11 w-full rounded-ds-control border border-ds-filet bg-ds-surface-carte px-3 text-[14px] " +
    "text-ds-texte-fort transition-shadow outline-none " +
    "focus:border-ds-filet-focus focus:shadow-[var(--anneau-ds-focus)] lg:h-[42px] lg:min-h-0";

  return (
    <details className={DETAILS_OUTIL_DS + " lg:open:static"}>
      <summary className={PILULE_OUTIL_DS}>
        <SlidersHorizontal aria-hidden="true" size={16} strokeWidth={1.8} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left lg:flex-none">{t("filtres")}</span>
        <ChevronDown aria-hidden="true" size={15} strokeWidth={1.8} className="text-ds-texte-tenu" />
      </summary>

      <div
        className={
          PANNEAU_OUTIL_DS +
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
              className="mb-1.5 block text-[12px] leading-[15px] font-semibold text-ds-texte-corps"
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
              className="mb-1.5 block text-[12px] leading-[15px] font-semibold text-ds-texte-corps"
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
            ⚠️ LA PÉRIODE A QUITTÉ CE PANNEAU POUR L EN-TÊTE DE L ÉCRAN. Le kit
            l y met, à gauche de l action principale, et ne laisse ici que le
            statut, l état des photos et les archives. Elle voyage donc en champ
            caché : appliquer un statut ne doit pas défaire la période qu on vient
            de poser.
          */}
          {/*
            ⚠️ … SAUF SOUS 1024 PX, OÙ L'EN-TÊTE NE LA REND PAS. Le sélecteur de
            période n'existe qu'à partir de `lg`, et la planche téléphone l'a
            retiré de son en-tête sans lui donner d'autre place : au téléphone et
            à la tablette, filtrer par date était devenu impossible (audit du
            18/09/2026). Les deux champs vivent donc ICI, visibles sous `lg`.

            AU BUREAU ILS SONT MASQUÉS, PAS RETIRÉS : un champ masqué par CSS est
            tout de même envoyé, et c'est exactement le rôle que tenaient les
            deux champs cachés qu'ils remplacent — appliquer un statut ne défait
            pas la période posée dans l'en-tête. Identifiants propres (`filtre-`)
            : `du` et `au` sont déjà ceux du sélecteur de l'en-tête.
          */}
          <div className="grid grid-cols-2 gap-3 lg:hidden">
            <div>
              <label htmlFor="filtre-du" className="mb-1.5 block text-[12px] leading-[15px] font-semibold text-ds-texte-corps">
                {t("periodeDu")}
              </label>
              <input
                id="filtre-du"
                name="du"
                type="date"
                defaultValue={parametres.du ?? ""}
                max={parametres.au ?? undefined}
                className={champ}
              />
            </div>
            <div>
              <label htmlFor="filtre-au" className="mb-1.5 block text-[12px] leading-[15px] font-semibold text-ds-texte-corps">
                {t("periodeAu")}
              </label>
              <input
                id="filtre-au"
                name="au"
                type="date"
                defaultValue={parametres.au ?? ""}
                min={parametres.du ?? undefined}
                className={champ}
              />
            </div>
          </div>

          {/* ⚠️ `lg:pointer-fine:` ET NON `lg:` : le libellé porte la cible tactile de
              la case (`globals.css`), et une tablette tactile en paysage passe
              `lg` sans avoir de souris — `lg:min-h-0` lui retirait les 44 px. */}
          <label className="flex min-h-11 items-center gap-2.5 text-[14px] text-ds-texte-fort lg:leading-[18px] lg:pointer-fine:min-h-0">
            <input
              type="checkbox"
              name="archivees"
              value="1"
              defaultChecked={parametres.archivees}
              className="h-4 w-4 rounded-ds-xs border-ds-filet-appuye accent-ds-accent"
            />
            {t("voirArchivees")}
          </label>

          <div className="flex items-center gap-3.5 lg:mt-0.5">
            <button
              type="submit"
              className="flex min-h-11 items-center rounded-ds-card bg-ds-accent px-[22px] text-[14px] font-semibold text-ds-texte-sur-marque transition-colors hover:bg-ds-accent-survol lg:h-[42px] lg:min-h-0"
            >
              {t("appliquer")}
            </button>

            {filtree ? (
              <LienEcran
                href={base}
                className="text-[13px] font-bold text-ds-texte-lien underline-offset-2 hover:text-ds-texte-lien-survol hover:underline"
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
        {/* Masquée au bureau : le tri y a son propre bouton dans la barre d'outils,
            comme dans la planche (`tableau-commandes.tsx`). */}
        <div className="border-t border-ds-filet pt-4 lg:hidden">
          {/* 12 px, demi-gras, sourdine — comme les en-têtes de colonnes du kit.
              Les capitales de 11 px de l'ancien dessin passaient sous le
              plancher de 11,5 px de la règle 5. */}
          <h2 className="mb-3 text-[12px] font-semibold text-ds-texte-sourdine">
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
                      "flex min-h-11 items-center rounded-ds-sm px-3 text-[14px] transition-colors lg:min-h-9 " +
                      (actif
                        ? "bg-ds-surface-teinte font-bold text-ds-accent-encre"
                        : "font-medium text-ds-texte-corps hover:bg-ds-ink-50")
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
