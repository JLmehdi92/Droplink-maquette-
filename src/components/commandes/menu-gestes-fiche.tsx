import { getTranslations } from "next-intl/server";
import { Archive, ArchiveRestore, Copy, MoreHorizontal } from "lucide-react";
import { cheminGesteDeListe } from "@/lib/commandes/geste-liste";
import { DETAILS_OUTIL_DS, PANNEAU_OUTIL_DS } from "@/components/panneau-outil";
import { BoutonSoumissionUnique } from "@/components/bouton-soumission-unique";

/**
 * LE MENU « ••• » DE LA FICHE — dupliquer, archiver ou sortir des archives.
 *
 * ⚠️ IL MANQUAIT AU TÉLÉPHONE, ET TROIS GESTES AVEC LUI. Ils ne vivaient que sur
 * la ligne du TABLEAU des commandes, rendu à partir de 1024 px ; au téléphone la
 * carte n'est qu'un lien, et la fiche avait perdu ce menu au motif qu'il serait
 * « vide ». Un vendeur sur son téléphone ne pouvait ni archiver, ni sortir des
 * archives, ni dupliquer une commande (audit d'atteignabilité du 18/09/2026). La
 * fiche est la seule page d'une commande servie à toutes les largeurs.
 *
 * DEUX FORMULAIRES `POST` VERS LA ROUTE EXISTANTE, pas une action neuve : les
 * mêmes champs que les lignes du tableau, donc la même garde de même origine,
 * le même contrôle de propriété (RLS) et la même journalisation. Un second
 * chemin serveur vers les mêmes gestes serait une seconde garde à tenir.
 *
 * ⚠️ COMPOSANT SERVEUR, ET C'EST CE QUI REND LE CONTRAT VÉRIFIABLE. Le module de
 * la route est `server-only` ; posé dans l'éditeur (client), le chemin arrivait
 * en simple chaîne, et `formulaires-et-actions` ne pouvait plus relier les
 * champs envoyés à ceux que la route lit — il l'a dit, à raison. Importé ICI,
 * le lien se lit dans le code : l'éditeur reçoit le menu tout rendu.
 *
 * AU TÉLÉPHONE, UNE FEUILLE DU BAS (`DETAILS_OUTIL_DS`), pas un panneau ancré :
 * ancré sous le bouton, le panneau de 256 px partait après le témoin de
 * sauvegarde et pouvait passer le bord droit d'un écran de 390 px. Mesuré
 * ouvert à 390 : aucun débordement, aucune cible sous 44 px.
 */
export async function MenuGestesFiche({
  langue,
  id,
  jeton,
  archivee,
  taille,
}: {
  readonly langue: string;
  readonly id: string;
  readonly jeton: string;
  readonly archivee: boolean;
  readonly taille: "bureau" | "telephone";
}) {
  const t = await getTranslations("editeur");
  const action = cheminGesteDeListe(langue);
  const retour = "/" + langue + "/commandes";
  const entree =
    "flex min-h-11 w-full items-center gap-2.5 rounded-ds-sm px-3 text-left text-[13px] font-semibold text-ds-texte-fort transition-colors hover:bg-ds-surface-teinte";
  return (
    <details className={taille === "bureau" ? "relative" : DETAILS_OUTIL_DS}>
      <summary
        className={
          "flex cursor-pointer list-none items-center justify-center rounded-ds-card border border-ds-filet bg-ds-surface-carte text-ds-texte-corps shadow-ds-xs transition-colors hover:bg-ds-surface-teinte [&::-webkit-details-marker]:hidden " +
          (taille === "bureau" ? "h-12 w-12" : "h-11 w-11")
        }
      >
        <MoreHorizontal aria-hidden="true" size={20} strokeWidth={1.8} />
        <span className="sr-only">{t("plusActions")}</span>
      </summary>
      <div
        className={
          taille === "bureau"
            ? "absolute top-full right-0 z-20 mt-1 flex w-64 flex-col rounded-ds-card border border-ds-filet bg-ds-surface-carte p-1 shadow-ds-lg"
            : PANNEAU_OUTIL_DS + " flex flex-col"
        }
      >
        <form method="post" action={action}>
          <input type="hidden" name="geste" value="dupliquer" />
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="langue" value={langue} />
          <input type="hidden" name="retour" value={retour} />
          {/* Une seule soumission : un double-clic créait DEUX copies (audit du 24/09/2026). */}
          <BoutonSoumissionUnique className={entree}>
            <Copy aria-hidden="true" size={16} strokeWidth={1.8} className="text-ds-texte-tenu" />
            {t("dupliquer")}
          </BoutonSoumissionUnique>
        </form>
        {/* Le jeton ne sert qu'à invalider la page publique après le geste ;
            l'autorisation vient de la session et de la RLS sur `orders`. */}
        <form method="post" action={action}>
          <input type="hidden" name="geste" value="archiver" />
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="jeton" value={jeton} />
          <input type="hidden" name="archiver" value={archivee ? "0" : "1"} />
          <input type="hidden" name="retour" value={retour} />
          <button type="submit" className={entree}>
            {archivee ? (
              <ArchiveRestore aria-hidden="true" size={16} strokeWidth={1.8} className="text-ds-texte-tenu" />
            ) : (
              <Archive aria-hidden="true" size={16} strokeWidth={1.8} className="text-ds-texte-tenu" />
            )}
            {archivee ? t("desarchiver") : t("archiver")}
          </button>
        </form>
      </div>
    </details>
  );
}
