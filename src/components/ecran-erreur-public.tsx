import Image from "next/image";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import logoDropLink from "@/../public/marque/logo-droplink.png";

/**
 * L'ÉCRAN D'ERREUR DES SURFACES PUBLIQUES — `ui_kits/erreurs`, écrit le
 * 14/09/2026 : le 404 général (`introuvable.html`) et la frontière d'erreur
 * (`erreur.html`). Même fond que le lien mort du client, mais c'est une surface
 * DropLink : le dégradé y est permis, pour sa seule action.
 *
 * AUCUN CROCHET, AUCUNE TRADUCTION, AUCUN LIEN DE ROUTEUR : il sert à la fois
 * `global-not-found`, qui remplace la racine et n'a aucun routeur au-dessus de
 * lui, et `[locale]/error`, une frontière d'erreur donc un composant client. Les
 * textes et l'action arrivent résolus.
 */
export function EcranErreurPublic({
  icone: Icone,
  titre,
  texte,
  children,
}: {
  readonly icone: LucideIcon;
  readonly titre: string;
  readonly texte: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-[linear-gradient(135deg,#F2F0FD_0%,#FAF9FE_42%,#F6F2FC_100%)] bg-fixed leading-[normal]">
      <header className="flex items-center px-4 py-[18px] sm:px-[34px] sm:py-[26px]">
        <Image src={logoDropLink} alt="DropLink" height={34} width={Math.round((34 * 2172) / 724)} />
      </header>

      <main id="contenu" className="flex flex-1 flex-col items-center justify-center px-6 pt-5 pb-10 text-center">
        <span className="mb-8 flex h-[88px] w-[88px] items-center justify-center rounded-ds-3xl border border-ds-filet bg-ds-surface-carte text-ds-accent shadow-ds-md">
          <Icone aria-hidden="true" size={38} strokeWidth={1.8} />
        </span>
        <h1 className="max-w-[760px] text-[32px] leading-[1.1] font-extrabold tracking-[-0.045em] text-balance text-ds-texte-fort sm:text-[44px]">
          {titre}
        </h1>
        <p className="mt-4 max-w-[520px] text-[16px] leading-[1.5] text-ds-texte-corps sm:text-[18px]">{texte}</p>
        {children}
      </main>

      <footer className="flex flex-col items-center px-6 pb-[34px]">
        <Image src={logoDropLink} alt="DropLink" height={22} width={Math.round((22 * 2172) / 724)} />
      </footer>
    </div>
  );
}

/** L'action principale, au dégradé de marque — lien ou bouton. */
export const CLASSE_ACTION_ERREUR =
  "mt-8 inline-flex h-14 items-center gap-2.5 rounded-ds-card border-none px-8 text-[16px] font-bold text-ds-texte-sur-marque shadow-ds-brand transition-shadow hover:shadow-ds-brand-hover degrade-ds-marque";
