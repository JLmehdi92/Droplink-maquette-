import { getFormatter, getTranslations } from "next-intl/server";
import { Panneau } from "@/components/app/panneau";
import { LienEcran } from "@/components/lien-ecran";
import { BadgeStatut, iconeExpedition, teinteExpedition } from "@/components/commandes/badge-statut";
import { referenceCourte } from "@/lib/commandes/reference";
import type { LigneCommande } from "@/lib/commandes/liste";

/** Cinq lignes, comme le kit : un aperçu, pas la liste. */
export const DERNIERES_COMMANDES = 5;

/**
 * « DERNIÈRES COMMANDES » — le panneau central du tableau de bord.
 *
 * Chaque ligne mène à SA commande : vignette, référence courte, client, statut,
 * et l'ancienneté de la dernière modification — c'est l'ordre de la liste des
 * commandes, qui trie par défaut sur la plus récemment touchée.
 *
 * ⚠️ LE DRAPEAU DU KIT N'EST PAS RENDU. Le kit pose un drapeau de pays entre la
 * référence et le client : le destinataire n'a pas d'adresse chez nous, son
 * nom est un pseudo en texte libre. Un pays deviné serait une information
 * inventée.
 */
export async function DernieresCommandes({
  commandes,
  langue,
}: {
  readonly commandes: readonly LigneCommande[];
  readonly langue: string;
}) {
  const t = await getTranslations("tableau.dernieres");
  const tc = await getTranslations("commandes");
  const format = await getFormatter();
  const maintenant = new Date();

  return (
    <Panneau
      taille="section"
      serre
      titre={t("titre")}
      action={
        <LienEcran
          href={`/${langue}/commandes`}
          className="inline-flex min-h-11 items-center gap-1.5 text-[13px] leading-[normal] font-semibold text-ds-accent hover:text-ds-accent-encre lg:min-h-0"
        >
          {t("voirTout")}
          <span aria-hidden="true">→</span>
        </LienEcran>
      }
    >
      {commandes.length === 0 ? (
        <p className="text-[14px] text-ds-texte-corps">{t("vide")}</p>
      ) : (
        <ol>
          {commandes.map((c, i) => (
            <li key={c.id} className={i === 0 ? "" : "border-t border-ds-filet"}>
              <LienEcran
                href={`/${langue}/commandes/${c.id}`}
                className="flex min-h-11 items-center gap-3 py-[11px] transition-colors hover:text-ds-accent-encre"
              >
                {c.vignettes[0] === undefined ? (
                  <span className="block h-[38px] w-[38px] shrink-0 rounded-ds-sm bg-ds-surface-creux" />
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element -- URL R2
                     signée à expiration : `next/image` la servirait encore après
                     l'expiration de sa signature. */
                  <img
                    src={c.vignettes[0]}
                    alt=""
                    width={38}
                    height={38}
                    loading="lazy"
                    decoding="async"
                    className="block h-[38px] w-[38px] shrink-0 rounded-ds-sm object-cover"
                  />
                )}
                <span className="text-[14px] leading-[normal] font-bold whitespace-nowrap text-ds-texte-fort">
                  {referenceCourte(c.id)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[14px] leading-[normal] text-ds-texte-corps">
                  {c.client ?? t("sansNom")}
                </span>
                <BadgeStatut
                  libelle={tc("statut." + c.statut)}
                  teinte={teinteExpedition(c.statut)}
                  Icone={iconeExpedition(c.statut)}
                  compacte
                />
                <span className="hidden text-[12px] leading-[normal] whitespace-nowrap text-ds-texte-sourdine sm:inline">
                  {format.relativeTime(new Date(c.modifieeLe), { now: maintenant, style: "short" })}
                </span>
              </LienEcran>
            </li>
          ))}
        </ol>
      )}
    </Panneau>
  );
}
