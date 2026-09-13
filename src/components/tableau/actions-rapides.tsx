import { getTranslations } from "next-intl/server";
import { ArrowRight, BarChart3, CirclePlus, Palette, Truck, type LucideIcon } from "lucide-react";
import { Panneau } from "@/components/app/panneau";
import { LienEcran } from "@/components/lien-ecran";
import { creerBrouillon } from "@/lib/commandes/actions";

/**
 * « ACTIONS RAPIDES » — quatre raccourcis, au dessin de `QuickAction` du kit :
 * 56 px, rayon de carte, pastille ronde de 34, flèche à droite.
 *
 * ⚠️ « CRÉER UNE COMMANDE » EST UN FORMULAIRE, PAS UN LIEN. Créer écrit en base :
 * un lien serait suivi par le préchargement du navigateur, par un aspirateur,
 * par une visite accidentelle, et chacun créerait un brouillon. C'est la même
 * Server Action que le bouton de la liste des commandes.
 *
 * ⚠️ « GÉRER MES LIENS CLIENTS » DEVIENT « PERSONNALISER MA PAGE CLIENT ». Le kit
 * y envoie vers l'écran de marque ; il n'existe pas d'écran de gestion des
 * liens — un lien vit dans sa commande —, et le libellé promettrait un écran
 * qu'on ne trouve pas.
 */
const CLASSE =
  "flex h-14 w-full items-center gap-[13px] rounded-ds-card border border-ds-filet bg-ds-surface-carte px-4 text-left transition-colors hover:border-ds-violet-300 hover:bg-ds-surface-teinte";

function Contenu({ icone: Icone, libelle }: { readonly icone: LucideIcon; readonly libelle: string }) {
  return (
    <>
      <span className="inline-flex h-[34px] w-[34px] flex-none items-center justify-center rounded-ds-pill bg-ds-surface-teinte text-ds-accent">
        <Icone aria-hidden="true" size={17} strokeWidth={1.9} />
      </span>
      <span className="min-w-0 flex-1 text-[14.5px] leading-[normal] font-semibold text-ds-texte-fort">
        {libelle}
      </span>
      <ArrowRight aria-hidden="true" size={16} className="text-ds-texte-tenu" />
    </>
  );
}

export async function ActionsRapides({ langue }: { readonly langue: string }) {
  const t = await getTranslations("tableau.actions");
  const tc = await getTranslations("commandes");

  const liens: ReadonlyArray<{ href: string; libelle: string; icone: LucideIcon }> = [
    { href: `/${langue}/marque`, libelle: t("marque"), icone: Palette },
    { href: `/${langue}/envois`, libelle: t("envois"), icone: Truck },
    { href: `/${langue}/analyses`, libelle: t("analyses"), icone: BarChart3 },
  ];

  return (
    <Panneau taille="section" serre titre={t("titre")}>
      <ul className="flex flex-col gap-3">
        <li>
          <form action={creerBrouillon}>
            <input type="hidden" name="langue" value={langue} />
            <button type="submit" className={CLASSE}>
              <Contenu icone={CirclePlus} libelle={tc("nouvelle")} />
            </button>
          </form>
        </li>
        {liens.map((l) => (
          <li key={l.href}>
            <LienEcran href={l.href} className={CLASSE}>
              <Contenu icone={l.icone} libelle={l.libelle} />
            </LienEcran>
          </li>
        ))}
      </ul>
    </Panneau>
  );
}
