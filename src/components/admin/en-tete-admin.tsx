import Link from "next/link";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { ChevronRight } from "lucide-react";

/**
 * L'EN-TÊTE DE CHAQUE ÉCRAN D'ADMINISTRATION — refonte du 02/10/2026
 * (maquette, `outils/admin.mjs`, `.tableau__tete`) : le fil d'Ariane qui part
 * de « Administration », le titre, le sous-titre, et les actions à droite.
 *
 * SOUS-TITRE OBLIGATOIRE : chacun dit ce que la page montre, et la plupart
 * rappellent que la consultation est tracée. Le rendre facultatif aurait fait
 * disparaître ce rappel du premier écran où l'on aurait oublié de le passer.
 *
 * `sousTitreMobile` sert au Journal, dont l'encart de garantie est masqué au
 * téléphone : le sous-titre y porte la garantie avec le décompte.
 * `sousTitreAuBureauSeulement` sert quand un encart redit juste en dessous le
 * même avertissement.
 */
export async function EnTeteAdmin({
  titre,
  sousTitre,
  sousTitreMobile,
  sousTitreAuBureauSeulement = false,
  fil,
  children,
}: {
  readonly titre: string;
  readonly sousTitre: string;
  readonly sousTitreMobile?: string;
  readonly sousTitreAuBureauSeulement?: boolean;
  /**
   * Les étapes après « Administration » ; la dernière est la page (sans lien). Par
   * défaut, le titre seul ; `[]` pour la vue d'ensemble, qui EST la racine.
   */
  readonly fil?: readonly { readonly href?: string; readonly libelle: string }[];
  readonly children?: ReactNode;
}) {
  const t = await getTranslations("admin");
  const etapes = fil ?? [{ libelle: titre }];
  return (
    <div className="tableau__tete">
      <div className="min-w-0">
        <p className="v4-fil">
          <span>{t("navigation")}</span>
          {etapes.map((e) => (
            <span key={e.libelle} className="contents">
              <ChevronRight aria-hidden="true" className="ic" />
              {e.href === undefined ? (
                <b>{e.libelle}</b>
              ) : (
                <Link href={e.href} prefetch={false}>
                  {e.libelle}
                </Link>
              )}
            </span>
          ))}
        </p>
        <h1>{titre}</h1>
        <p className={sousTitreAuBureauSeulement ? "max-md:hidden" : undefined}>
          {sousTitreMobile === undefined ? (
            sousTitre
          ) : (
            <>
              <span className="md:hidden">{sousTitreMobile}</span>
              <span className="max-md:hidden">{sousTitre}</span>
            </>
          )}
        </p>
      </div>
      {children}
    </div>
  );
}
