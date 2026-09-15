import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ArgumentAcces, FondAcces, LogoMarque, NoteSecurite } from "@/components/acces/coque-acces";

/**
 * LA COQUE DES ÉCRANS D'ACCÈS SANS INSCRIPTION — `AuthShellSimple` du kit
 * `auth`, écrite le 14/09/2026 pour le mot de passe oublié et le nouveau mot de
 * passe, sur la géométrie de la vérification en deux étapes : logo seul en
 * en-tête (la personne a déjà un compte, rien à lui vendre), argument à gauche
 * au bureau, carte de 520 px à droite, note de sécurité, pied de documentation.
 *
 * ⚠️ CES ÉCRANS PORTAIENT ENCORE L'ANCIEN CANEVAS jusqu'à cette date — cadre
 * lavande, carte-page à rayon 28, volet illustré, violet `#7c5cf5` — à un clic
 * d'une connexion portée au pixel sur le design system. Le passage de l'une à
 * l'autre changeait de produit.
 */
export async function CoqueAccesSimple({
  langue,
  icone: Icone,
  titre,
  sousTitre,
  children,
}: {
  readonly langue: string;
  readonly icone: LucideIcon;
  readonly titre: string;
  readonly sousTitre: ReactNode;
  readonly children: ReactNode;
}) {
  const tl = await getTranslations("landing");

  return (
    <>
      <FondAcces />
      <div className="relative flex min-h-dvh flex-col px-4 pt-[22px] pb-6 leading-[normal] md:px-14 md:pt-10 md:pb-8">
        <header className="flex flex-wrap items-center gap-3">
          <Link href={`/${langue}`} className="inline-flex min-h-11 items-center">
            <LogoMarque hauteur={44} className="md:h-13 md:w-auto" />
          </Link>
        </header>

        <main
          id="contenu"
          className="grid flex-1 grid-cols-[minmax(0,1fr)] items-start gap-20 py-5 lg:grid-cols-[minmax(0,1fr)_520px] lg:items-center lg:py-12"
        >
          <div className="hidden lg:block">
            <ArgumentAcces />
          </div>

          <div className="mx-auto flex w-full max-w-[520px] flex-col gap-[22px] rounded-ds-3xl bg-ds-surface-carte px-5 pt-6 pb-[30px] shadow-ds-lg md:px-12 md:py-11">
            <div className="flex flex-col items-center gap-[14px] text-center">
              <span className="inline-flex h-16 w-16 items-center justify-center rounded-ds-pill bg-ds-surface-teinte text-ds-accent">
                <Icone aria-hidden="true" size={30} strokeWidth={1.8} />
              </span>
              <h1 className="text-[24px] leading-[1.1] font-extrabold tracking-[-0.04em] text-ds-texte-titre md:text-[34px]">
                {titre}
              </h1>
              <p className="text-[15px] leading-[1.55] text-ds-texte-corps">{sousTitre}</p>
            </div>

            {children}

            <NoteSecurite />
          </div>
        </main>

        <footer className="flex items-end">
          <span className="text-[12px] text-ds-texte-tenu">
            <Link
              href={`/${langue}/docs`}
              className="-my-3.5 inline-flex min-h-11 items-center font-semibold text-ds-texte-corps hover:underline lg:my-0 lg:min-h-0"
            >
              {tl("menu.docs")}
            </Link>
            {"  ·  "}
            {tl("piedDroits", { annee: new Date().getFullYear() })}
          </span>
        </footer>
      </div>
    </>
  );
}
