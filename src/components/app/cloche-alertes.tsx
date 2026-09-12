import { Bell, EyeOff, TriangleAlert } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

/**
 * LA CLOCHE DE LA BARRE SUPÉRIEURE — `NotificationsBell` du kit.
 *
 * ⚠️ ELLE NE MONTRE PAS CE QUE LE KIT MONTRE, ET C'EST LA SEULE FAÇON DE LA
 * FAIRE HONNÊTEMENT.
 *
 * Le kit la nourrit de cinq notifications d'expédition — « colis livré »,
 * « colis en livraison », « problème de livraison », « nouvelle commande » —
 * avec un compte de non-lues et un « tout marquer comme lu ». Trois choses
 * manquent au produit pour rendre cela :
 *
 *   1. IL N'ÉCRIT AUCUN ÉVÉNEMENT D'EXPÉDITION. `order_events` porte les gestes
 *      du VENDEUR — commande créée, modifiée, média ajouté — pas les mouvements
 *      du colis. Un fil nourri de ces événements annoncerait au vendeur ce
 *      qu'il vient lui-même de faire ;
 *   2. IL N'A AUCUN ÉTAT DE LECTURE. « Non lue » exige une colonne et un chemin
 *      d'écriture ; les inventer pour une pastille serait une migration en
 *      attente de déploiement au service d'un ornement ;
 *   3. « NOUVELLE COMMANDE CRÉÉE » N'EST PAS UNE NOTIFICATION. C'est le vendeur
 *      qui vient de la créer.
 *
 * CE QUE LA CLOCHE PORTE DONC : ce qui demande un GESTE, et rien d'autre. Deux
 * familles, toutes deux déjà comptées par le produit, toutes deux décroissantes
 * quand le vendeur agit — donc sans état de lecture à inventer :
 *
 *   - les commandes que le client n'a JAMAIS ouvertes : un lien peut-être jamais
 *     reçu, et c'est la question pour laquelle on ouvre ce produit ;
 *   - les colis SANS MOUVEMENT depuis plus de dix jours : le silence nommé de la
 *     décision 8 du brief.
 *
 * ⚠️ ET LA PASTILLE COMPTE EXACTEMENT CE QUE LE PANNEAU LISTE. Une pastille qui
 * annonce un nombre que le panneau ne montre pas est la forme la plus banale du
 * mensonge d'interface : on l'ouvre, on ne trouve pas les trois choses
 * annoncées, et on cesse de la regarder.
 *
 * LES VALEURS DU KIT : bouton 42 × 42 au rayon de carte ; pastille de 18 au
 * rayon pilule, 10,5 px en 800, blanc sur `--status-danger`, cerclée de 2 px de
 * la couleur de la carte ; panneau de 400 au rayon carte-lg avec l'ombre lg ;
 * rangée à tuile d'icône de 36, titre 14/700, corps 13, `padding: 14px 18px`.
 */
export async function ClocheAlertes({
  langue,
  jamaisOuvertes,
  colisSilencieux,
}: {
  readonly langue: string;
  /** `null` quand la lecture a échoué : on ne compte pas ce qu'on n'a pas lu. */
  readonly jamaisOuvertes: number | null;
  readonly colisSilencieux: number | null;
}) {
  const t = await getTranslations("alertes");

  const familles = [
    {
      clef: "jamaisOuvertes" as const,
      valeur: jamaisOuvertes,
      href: `/${langue}/commandes?tri=jamais-ouvert`,
      Icone: EyeOff,
      peau: "bg-ds-erreur-fond text-ds-erreur",
    },
    {
      clef: "silencieux" as const,
      valeur: colisSilencieux,
      href: `/${langue}/envois?silencieux=oui`,
      Icone: TriangleAlert,
      peau: "bg-ds-alerte-fond text-ds-alerte",
    },
  ].filter((f) => f.valeur !== null && f.valeur > 0);

  const total = familles.reduce((n, f) => n + (f.valeur ?? 0), 0);

  return (
    <details className="relative shrink-0">
      <summary
        className={
          "flex h-[42px] w-[42px] cursor-pointer list-none items-center justify-center rounded-ds-card " +
          "border border-transparent text-ds-texte-corps transition-colors " +
          "hover:bg-ds-surface-teinte hover:text-ds-accent " +
          "open:border-ds-filet open:bg-ds-surface-teinte open:text-ds-accent"
        }
      >
        <span className="relative inline-flex">
          <Bell aria-hidden="true" size={20} strokeWidth={1.8} />
          {total > 0 ? (
            <span className="absolute -top-1.5 -right-2 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-ds-pill bg-ds-erreur px-[5px] text-[10.5px] font-extrabold text-white shadow-[0_0_0_2px_var(--color-ds-surface-carte)]">
              {total}
            </span>
          ) : null}
        </span>
        <span className="sr-only">
          {total > 0 ? t("titreAvec", { n: total }) : t("titre")}
        </span>
      </summary>

      <div className="absolute end-0 top-full z-40 mt-2.5 w-[400px] overflow-hidden rounded-ds-card-lg border border-ds-filet bg-ds-surface-carte shadow-ds-lg">
        <header className="flex items-center gap-3 px-[18px] py-4">
          <h2 className="text-[16px] font-bold tracking-[-0.02em] text-ds-texte-titre">
            {t("titre")}
          </h2>
          {total > 0 ? (
            <span className="rounded-ds-pill bg-ds-surface-teinte px-[9px] py-[3px] text-[11px] font-bold text-ds-accent-encre">
              {total}
            </span>
          ) : null}
        </header>

        {familles.length === 0 ? (
          /* ⚠️ « RIEN » SE DIT. Un panneau vide se lit comme un panneau cassé —
             et celui-ci est vide la plupart du temps, ce qui est une bonne
             nouvelle qu'il faut annoncer comme telle. */
          <p className="border-t border-ds-filet px-[18px] py-6 text-center text-[13px] text-ds-texte-corps">
            {t("rien")}
          </p>
        ) : (
          familles.map((f) => (
            <Link
              key={f.clef}
              href={f.href}
              className="flex items-start gap-[13px] border-t border-ds-filet px-[18px] py-3.5 transition-colors hover:bg-ds-ink-50"
            >
              <span
                className={
                  "inline-flex h-9 w-9 flex-none items-center justify-center rounded-ds-pill " + f.peau
                }
              >
                <f.Icone aria-hidden="true" size={17} strokeWidth={1.9} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                <span className="text-[14px] font-bold text-ds-texte-fort">
                  {t(f.clef + ".titre", { n: f.valeur ?? 0 })}
                </span>
                <span className="text-[13px] leading-[1.45] text-ds-texte-corps">
                  {t(f.clef + ".texte")}
                </span>
              </span>
            </Link>
          ))
        )}
      </div>
    </details>
  );
}
