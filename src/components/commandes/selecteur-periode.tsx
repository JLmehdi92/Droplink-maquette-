import { Calendar, ChevronDown } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import type { ParametresListe } from "@/lib/commandes/liste";
import { lienListe } from "@/lib/commandes/url";
import { LienEcran } from "@/components/lien-ecran";
import { DETAILS_OUTIL_DS, PANNEAU_OUTIL_DS } from "@/components/panneau-outil";

/**
 * LE SÉLECTEUR DE PÉRIODE DE L'EN-TÊTE — le `DateRangePicker` du kit.
 *
 * ⚠️ IL DÉMÉNAGE DEPUIS LE PANNEAU DE FILTRES, IL NE S'Y AJOUTE PAS. Le kit met
 * la période DANS l'en-tête, à gauche de l'action principale, et laisse au
 * panneau ce qui reste — statut, état des photos, archives. Garder les deux
 * ferait deux endroits pour un même critère, et deux endroits pour un critère
 * divergent au premier réglage ajouté.
 *
 * LES VALEURS DU KIT : bouton 257 × 50, rayon de carte, fond carte, filet,
 * ombre xs, 14 px en graisse moyenne, icône de calendrier de 18 à l'accent,
 * chevron de 16 en couleur tenue, écart 12, `padding: 0 16px`.
 *
 * ⚠️ DEUX CHAMPS `date` NATIFS À L'INTÉRIEUR, et non un calendrier maison : ils
 * ouvrent celui du système, se saisissent au clavier, et ne coûtent pas un octet
 * de JavaScript sur un écran qu'un fournisseur ouvre deux cents fois par
 * semaine. C'est ce que le panneau de filtres faisait déjà ; seul l'endroit
 * change.
 *
 * ⚠️ LA BORNE HAUTE EST INCLUSE. `au=2026-08-16` vaut minuit : comparé tel quel,
 * il exclurait toute la journée du 16. La lecture compare au LENDEMAIN en
 * strictement inférieur — voir `borneHauteExclusive`. Le libellé promet
 * « jusqu'au », et la base tient cette promesse.
 */
export async function SelecteurPeriode({
  base,
  parametres,
}: {
  readonly base: string;
  readonly parametres: ParametresListe;
}) {
  const t = await getTranslations("commandes");
  const format = await getFormatter();

  const jour = (valeur: string): string =>
    format.dateTime(new Date(valeur + "T00:00:00Z"), {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });

  const libelle =
    parametres.du !== null && parametres.au !== null
      ? t("periodeEntreCourt", { du: jour(parametres.du), au: jour(parametres.au) })
      : parametres.du !== null
        ? t("periodeDepuisCourt", { du: jour(parametres.du) })
        : parametres.au !== null
          ? t("periodeJusquaCourt", { au: jour(parametres.au) })
          : t("periodeToutes");

  const posee = parametres.du !== null || parametres.au !== null;
  const champ =
    "min-h-11 w-full rounded-ds-control border border-ds-filet-appuye bg-ds-surface-carte px-3 text-[14px] " +
    "font-medium text-ds-texte-fort transition-shadow outline-none " +
    "focus:border-ds-filet-focus focus:shadow-[var(--anneau-ds-focus)] lg:h-[42px] lg:min-h-0";

  return (
    <details className={DETAILS_OUTIL_DS + " lg:open:relative"}>
      <summary
        className={
          "flex min-h-11 w-fit cursor-pointer list-none items-center gap-3 rounded-ds-card border " +
          "border-ds-filet bg-ds-surface-carte px-4 text-[14px] font-medium whitespace-nowrap " +
          "shadow-ds-xs transition-shadow hover:shadow-ds-md lg:h-[50px] lg:min-h-0 " +
          (posee ? "text-ds-accent-encre" : "text-ds-texte-fort")
        }
      >
        <Calendar aria-hidden="true" size={18} strokeWidth={1.8} className="text-ds-accent" />
        {libelle}
        <ChevronDown aria-hidden="true" size={16} strokeWidth={1.8} className="text-ds-texte-tenu" />
      </summary>

      <div className={PANNEAU_OUTIL_DS + " lg:w-[340px] lg:max-w-none"}>
        <form method="get" action={base} className="flex flex-col gap-3.5">
          {/*
            LES AUTRES CRITÈRES VOYAGENT EN CHAMPS CACHÉS. Poser une période ne
            doit pas défaire le filtre de statut qu'on vient de choisir — c'est
            la même règle que la recherche, et elle se paie au premier oubli.
          */}
          {parametres.statut !== null ? (
            <input type="hidden" name="statut" value={parametres.statut} />
          ) : null}
          {parametres.qc !== null ? <input type="hidden" name="qc" value={parametres.qc} /> : null}
          {parametres.tri !== "recentes" ? (
            <input type="hidden" name="tri" value={parametres.tri} />
          ) : null}
          {parametres.q !== "" ? <input type="hidden" name="q" value={parametres.q} /> : null}
          {parametres.archivees ? <input type="hidden" name="archivees" value="1" /> : null}

          <div>
            <label
              htmlFor="du"
              className="mb-[9px] block text-[13px] font-medium text-ds-texte-corps"
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
              className="mb-[9px] block text-[13px] font-medium text-ds-texte-corps"
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

          <div className="flex items-center gap-3.5 lg:mt-0.5">
            <button
              type="submit"
              className="flex min-h-11 items-center rounded-ds-card bg-ds-accent px-[22px] text-[14px] font-semibold text-ds-texte-sur-marque transition-colors hover:bg-ds-accent-survol lg:h-[42px] lg:min-h-0"
            >
              {t("appliquer")}
            </button>
            {/* UN LIEN QUI N'EFFACE RIEN NE SE REND PAS : il enseignerait que
                l'interface ne répond pas. */}
            {posee ? (
              <LienEcran
                href={lienListe(base, parametres, { du: null, au: null })}
                className="text-[13px] font-bold text-ds-texte-lien underline-offset-2 hover:text-ds-texte-lien-survol hover:underline"
              >
                {t("toutEffacer")}
              </LienEcran>
            ) : null}
          </div>
        </form>
      </div>
    </details>
  );
}
