import { getFormatter, getTranslations } from "next-intl/server";
import { Eye, SlidersHorizontal, UserCheck, UserX } from "lucide-react";
import { natureDAction } from "@/lib/admin/nature-d-action";
import type { LigneJournal } from "@/lib/audit/comptes";

/**
 * UNE ENTRÉE DU JOURNAL D'AUDIT (maquette, `.adm-entree`), commune au journal et
 * aux « Dernières actions » de la vue d'ensemble.
 *
 * LA COULEUR SUIT LA NATURE, PAS LA FAMILLE : une réactivation est verte, une
 * suspension rouge. L'icône double le libellé, elle ne le remplace pas.
 *
 * L'ENTRÉE SURVIT À LA SUPPRESSION DU COMPTE VISÉ : l'adresse est dénormalisée
 * à l'écriture. Elle est rendue en texte, SANS lien vers la fiche : le journal ne
 * porte pas l'identifiant du compte, et une adresse peut désigner un compte
 * supprimé (la maquette met un lien ; il mènerait à un 404 ou au mauvais compte).
 *
 * LE MOTIF ET L'AVANT → APRÈS D'UN PARAMÈTRE SONT EN CLAIR ; les critères d'une
 * consultation restent fermés (ils contiennent des recherches).
 */
const ICONES = { suspension: UserX, reactivation: UserCheck, parametre: SlidersHorizontal, consultation: Eye } as const;

export async function EntreeJournal({ ligne }: { readonly ligne: LigneJournal }) {
  const t = await getTranslations("admin");
  const format = await getFormatter();
  const nature = natureDAction(ligne.action);
  const Icone = ICONES[nature];
  // LE POINT DEVIENT UN SOULIGNÉ : next-intl traite le point comme un séparateur de NIVEAU.
  const cle = `journal.actions.${ligne.action.replaceAll(".", "_")}`;
  const quand = new Date(ligne.quand);
  return (
    <li className="adm-entree">
      <i data-ton={nature} aria-hidden="true">
        <Icone className="ic" />
      </i>
      <div>
        <b>{t.has(cle) ? t(cle) : ligne.action}</b>
        {ligne.cibleEmail === null ? null : (
          <span>
            {t("journal.cibleAvant")} <strong>{ligne.cibleEmail}</strong>
          </span>
        )}
        {ligne.apres === null ? null : (
          <span>
            {ligne.idRessource === null
              ? null
              : `${t.has(`parametres.cles.${ligne.idRessource}.titre`) ? t(`parametres.cles.${ligne.idRessource}.titre`) : ligne.idRessource} `}
            {ligne.avant === null ? null : (
              <>
                {ligne.avant} <small aria-hidden="true">→</small>{" "}
              </>
            )}
            <strong>{ligne.apres}</strong>
          </span>
        )}
        {ligne.motif === null ? null : (
          <span className="adm-motif">
            {t("journal.motifAvant")} {ligne.motif}
          </span>
        )}
      </div>
      <p>
        <time dateTime={ligne.quand}>
          {format.dateTime(quand, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
        </time>
        <small>
          {t("journal.parQui")} {ligne.adminEmail}
        </small>
      </p>
    </li>
  );
}
