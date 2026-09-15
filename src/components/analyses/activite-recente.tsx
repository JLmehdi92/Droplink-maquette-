import { getFormatter, getTranslations } from "next-intl/server";
import {
  Archive,
  ArrowUpDown,
  CircleCheck,
  CircleX,
  Copy,
  ImageMinus,
  ImagePlus,
  Link2,
  Package,
  Pencil,
  type LucideIcon,
} from "lucide-react";
import { Panneau } from "@/components/app/panneau";
import { LienEcran } from "@/components/lien-ecran";
import type { FaitRecent } from "@/lib/analyses/recente";
import type { TypeEvenement } from "@/lib/commandes/journal";

/**
 * ACTIVITÉ RÉCENTE — le dernier panneau de la rangée du kit.
 *
 * Valeurs relevées : lignes à l'écart 13, `13px 0`, filet EN HAUT sauf la
 * première, pastille ronde de 36 portant une icône de 17 au trait 1,9, titre
 * 14/700, sous-ligne 13/400 dont la référence est à l'accent en 600, et
 * l'ancienneté à 12 en sourdine, à droite, insécable.
 *
 * ⚠️ LES CINQ FAITS DU KIT NE SONT PAS LES NÔTRES, ET ON NE LES INVENTE PAS.
 * Il écrit « Colis livré », « Colis en transit », « Nouveau lien ouvert » — des
 * faits que produirait l'ingestion du suivi. Elle n'écrit aucun événement :
 * `order_events` porte dix types, tous émis par une mutation du vendeur ou une
 * réponse de son client. Rendre les autres afficherait un journal que la base
 * n'a pas tenu, sur l'écran qui sert précisément à décider (principe XII).
 *
 * ⚠️ CHAQUE LIGNE MÈNE À SA COMMANDE, et c'est ce que le kit fait aussi — ses
 * lignes sont des boutons qui ouvrent le détail. Un journal dont on ne peut pas
 * atteindre le sujet oblige à retrouver la commande à la main, sur l'écran d'où
 * l'on vient de partir.
 */

/** Une icône par type, exhaustive PAR LE TYPAGE : un type sans icône ne compile plus. */
const ICONES: Record<TypeEvenement, LucideIcon> = {
  commande_creee: Package,
  commande_modifiee: Pencil,
  commande_archivee: Archive,
  commande_dupliquee: Copy,
  media_ajoute: ImagePlus,
  media_supprime: ImageMinus,
  medias_reordonnes: ArrowUpDown,
  lien_revoque: Link2,
  qc_approuve: CircleCheck,
  qc_refuse: CircleX,
};

/**
 * La teinte de la pastille — trois familles, et pas une par type.
 *
 * Le kit en emploie quatre, une par nature de fait. Peindre chaque type d'une
 * couleur ferait de la pastille une décoration : ce qu'on lit d'un coup d'œil,
 * c'est « quelque chose s'est bien passé », « quelque chose demande une
 * attention », « le reste ».
 */
const TEINTES: Partial<Record<TypeEvenement, string>> = {
  qc_approuve: "bg-ds-succes-fond text-ds-succes-encre",
  qc_refuse: "bg-ds-erreur-fond text-ds-erreur-encre",
  lien_revoque: "bg-ds-alerte-fond text-ds-alerte-encre",
};

export async function ActiviteRecente({
  faits,
  langue,
  variante = "analyses",
}: {
  readonly faits: readonly FaitRecent[];
  readonly langue: string;
  /**
   * LE MÊME PANNEAU, DEUX DESSINS DU KIT. `AnalyticsView` le pose avec un
   * titre de 19, un bouton « Voir tout » encadré et des lignes à pastille de
   * 36 ; `DashboardHome` avec un titre de 17, un simple lien fléché et des
   * lignes plus serrées — pastille de 32, titre 13,5 / 600, légende 12,5 en
   * sourdine.
   */
  readonly variante?: "analyses" | "tableau";
}) {
  const tableau = variante === "tableau";
  const t = await getTranslations("analyses");
  const tHisto = await getTranslations("editeur.historique");
  const format = await getFormatter();
  const maintenant = new Date();

  return (
    <Panneau
      taille={tableau ? "section" : "panneau"}
      serre={tableau}
      titre={t("activite.titre")}
      action={
        /* « VOIR TOUT » MÈNE AUX COMMANDES, la seule liste du produit où tous
           ces faits se retrouvent — chacun dans l'historique de sa commande. Le
           kit dessine un bouton sans destination ; un bouton qui ne mène nulle
           part est pire qu'un bouton absent. */
        tableau ? (
          <LienEcran
            href={`/${langue}/commandes`}
            className="inline-flex min-h-11 items-center gap-1.5 text-[13px] leading-[normal] font-semibold text-ds-accent hover:text-ds-accent-encre lg:min-h-0"
          >
            {t("activite.voirTout")}
            <span aria-hidden="true">→</span>
          </LienEcran>
        ) : (
          <LienEcran
            href={`/${langue}/commandes`}
            /*
              ⚠️ CE N'EST PAS UN `DetailAction`, ET LA MESURE L'A DIT. Le premier
              essai reprenait la classe partagée — 48 px, rayon de carte, ombre xs,
              14/600 en encre. Le kit pose ici un bouton PLUS PETIT : 34 px de
              haut, rayon `sm`, `0 14px`, 13/600 à l'encre d'accent, et AUCUNE
              ombre. Une action d'en-tête de panneau n'a pas le poids d'une action
              de barre d'outils.

              Le plancher tactile de 44 px ne vaut qu'au téléphone, où les 34 px du
              kit se ratent au pouce.
            */
            className="inline-flex min-h-11 items-center rounded-ds-sm border border-ds-filet bg-ds-surface-carte px-3.5 text-[13px] leading-[normal] font-semibold text-ds-accent-encre transition-colors hover:bg-ds-surface-teinte lg:h-[34px] lg:min-h-0"
          >
            {t("activite.voirTout")}
          </LienEcran>
        )
      }
    >
      {faits.length === 0 ? (
        <p className="text-[14px] text-ds-texte-corps">{t("activite.aucune")}</p>
      ) : (
        <ol>
          {faits.map((f, i) => {
            const Icone = ICONES[f.type];
            return (
              <li key={f.id} className={i === 0 ? "" : "border-t border-ds-filet"}>
                <LienEcran
                  href={`/${langue}/commandes/${f.commandeId}`}
                  className={
                    (tableau ? "flex items-center gap-3 py-[11px]" : "flex items-center gap-[13px] py-[13px]") +
                    " transition-colors hover:text-ds-accent-encre"
                  }
                >
                  <span
                    className={
                      (tableau ? "inline-flex h-8 w-8 " : "inline-flex h-9 w-9 ") +
                      "flex-none items-center justify-center rounded-ds-pill " +
                      (TEINTES[f.type] ?? "bg-ds-surface-teinte text-ds-accent")
                    }
                  >
                    <Icone aria-hidden="true" size={tableau ? 15 : 17} strokeWidth={1.9} />
                  </span>
                  <span className={"flex min-w-0 flex-1 flex-col " + (tableau ? "gap-px" : "gap-0.5")}>
                    <span
                      className={
                        tableau
                          ? "text-[13.5px] leading-[normal] font-semibold text-ds-texte-fort"
                          : "text-[14px] leading-[normal] font-bold text-ds-texte-fort"
                      }
                    >
                      {tHisto(`types.${f.type}`)}
                    </span>
                    <span
                      className={
                        tableau
                          ? "text-[12.5px] leading-[normal] text-ds-texte-sourdine"
                          : "text-[13px] leading-[normal] text-ds-texte-corps"
                      }
                    >
                      {t("activite.commande")}{" "}
                      <span className="font-semibold text-ds-accent">{f.reference}</span>
                    </span>
                  </span>
                  <span className="text-[12px] leading-[normal] whitespace-nowrap text-ds-texte-sourdine">
                    {format.relativeTime(new Date(f.quand), { now: maintenant, style: "short" })}
                  </span>
                </LienEcran>
              </li>
            );
          })}
        </ol>
      )}
    </Panneau>
  );
}
