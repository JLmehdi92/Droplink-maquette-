import { getTranslations } from "next-intl/server";
import { Archive, ArchiveRestore, Copy, Ellipsis } from "lucide-react";
import { cheminGesteDeListe } from "@/lib/commandes/geste-liste";
import { DetailsFermable } from "@/components/app/details-fermable";
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
 * AU TÉLÉPHONE, LE MÊME MENU, ancré à DROITE sous son bouton (`.pop--droite`) : le
 * bouton est le dernier de l'en-tête, le panneau s'ouvre donc vers l'intérieur de
 * l'écran. `taille` ne sert plus qu'à la feuille (`fiche__gestes--…`).
 */
export async function MenuGestesFiche({
  langue,
  id,
  archivee,
  taille,
}: {
  readonly langue: string;
  readonly id: string;
  readonly archivee: boolean;
  readonly taille: "bureau" | "telephone";
}) {
  const t = await getTranslations("editeur");
  const action = cheminGesteDeListe(langue);
  const retour = "/" + langue + "/commandes";
  // LA REFONTE (02/10/2026) : le menu de la maquette (`.deroulant` + `.pop--menu`), le
  // même que sur la ligne de la liste. Deux formulaires POST natifs, inchangés.
  return (
    <DetailsFermable className={"deroulant fiche__gestes fiche__gestes--" + taille}>
      <summary className="bouton-outil bouton-outil--icone" aria-label={t("plusActions")} title={t("plusActions")}>
        <Ellipsis aria-hidden="true" className="ic" />
      </summary>
      <div className="pop pop--menu pop--droite">
        <form method="post" action={action}>
          <input type="hidden" name="geste" value="dupliquer" />
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="langue" value={langue} />
          <input type="hidden" name="retour" value={retour} />
          {/* Une seule soumission : un double-clic créait DEUX copies (audit du 24/09/2026). */}
          <BoutonSoumissionUnique>
            <Copy aria-hidden="true" className="ic" />
            {t("dupliquer")}
          </BoutonSoumissionUnique>
        </form>
        {/* AUCUN JETON n'est posté : la route relit en base celui de la commande archivée.
            Rendu ici au chargement, il devenait faux après une révocation (contre-audit du
            03/10/2026) — et le jeton n'a jamais à quitter le serveur pour ce geste. */}
        <form method="post" action={action}>
          <input type="hidden" name="geste" value="archiver" />
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="archiver" value={archivee ? "0" : "1"} />
          <input type="hidden" name="retour" value={retour} />
          <button type="submit">
            {archivee ? <ArchiveRestore aria-hidden="true" className="ic" /> : <Archive aria-hidden="true" className="ic" />}
            {archivee ? t("desarchiver") : t("archiver")}
          </button>
        </form>
      </div>
    </DetailsFermable>
  );
}
