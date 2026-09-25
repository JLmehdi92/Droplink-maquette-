import { Suspense } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { BoutonDeconnexion } from "@/components/bouton-deconnexion";
import { LienParametres } from "@/components/app/lien-parametres";
import { LogoMarque } from "@/components/acces/coque-acces";
import { ClocheAlertes } from "./cloche-alertes";
import { RechercheGlobale } from "./recherche-globale";

/**
 * LA BARRE SUPÉRIEURE DE L'ESPACE VENDEUR — `Topbar` du kit.
 *
 * Elle n'existait pas : le produit posait sa recherche dans l'en-tête de
 * l'écran des commandes, et l'identité du compte uniquement en bas de la
 * colonne. Le kit en fait une bande à part, commune aux six écrans, qui porte
 * ce qui ne dépend pas de l'écran ouvert — chercher, et savoir qui l'on est.
 *
 * LES VALEURS, RELEVÉES SUR LA RÉFÉRENCE SERVIE À 1690 px :
 *   bande        89 px de haut, 32 px de marge à gauche et à droite
 *   recherche    551 × 46, rayon de carte, filet, fond carte, ombre xs
 *   séparateur   1 × 26, couleur de filet, 20 px de chaque côté
 *   pastille     52 de haut, rayon pilule, avatar 38, nom 14/600, chevron 16
 *
 * ⚠️ AU TÉLÉPHONE ELLE SE REND DEPUIS LE 15/09/2026, COMPACTE — et ce bloc
 * disait le contraire. Il la refusait parce qu'elle « redirait ce que le bas
 * montre déjà ». C'était vrai des DESTINATIONS, faux du COMPTE : sans elle, les
 * paramètres ne s'ouvraient au téléphone que depuis le tableau de bord, la
 * déconnexion que depuis les commandes, et la cloche d'alertes nulle part —
 * Envois, Analyses et Ma marque n'offraient aucun accès au compte. Mesuré en
 * passant les 37 écrans à 390 px contre le design system.
 *
 * Planche `AppShell` (TabBar, AccountMenu) : 62 px et non 89 — logo, cloche,
 * avatar et son menu, la recherche restant dans l'en-tête de Commandes, au
 * pouce. Les onglets du bas ne changent pas.
 */
export async function BarreSuperieure({
  langue,
  email,
  nomBoutique,
  logoSigne,
  jamaisOuvertes,
  colisSilencieux,
}: {
  readonly langue: string;
  readonly email: string;
  readonly nomBoutique: string | null;
  readonly logoSigne: string | null;
  readonly jamaisOuvertes: number | null;
  readonly colisSilencieux: number | null;
}) {
  const t = await getTranslations("navigation");
  const tc = await getTranslations("commandes");

  return (
    <header className="flex h-[62px] shrink-0 items-center gap-2.5 border-b border-ds-filet px-[14px] md:h-[89px] md:gap-5 md:border-b-0 md:px-8">
      {/* Le logo mène au tableau de bord (voir le layout de l'espace vendeur) ;
          `min-h-11` : 44 px de cible au téléphone, le logo n'en fait que 28. */}
      <Link href={`/${langue}/tableau-de-bord`} className="flex min-h-11 items-center md:hidden">
        <LogoMarque hauteur={28} />
      </Link>
      {/* `useSearchParams` fait sortir son porteur du rendu statique : la
          frontière le borne à ce seul champ plutôt qu à toute la coque. */}
      <div className="hidden w-full max-w-[551px] min-w-0 md:block">
        <Suspense fallback={<span className="block h-[46px] w-full" />}>
          <RechercheGlobale
            action={`/${langue}/commandes`}
            placeholder={tc("rechercherExemple")}
            etiquette={tc("rechercher")}
          />
        </Suspense>
      </div>

      <span className="flex-1" />

      <ClocheAlertes
        langue={langue}
        jamaisOuvertes={jamaisOuvertes}
        colisSilencieux={colisSilencieux}
      />

      <span aria-hidden="true" className="h-[26px] w-px shrink-0 bg-ds-filet" />

      <details className="group relative shrink-0">
        <summary className="flex cursor-pointer list-none items-center gap-[11px] rounded-ds-pill py-[7px] pr-3 pl-[7px] transition-colors hover:bg-ds-surface-teinte">
          <Avatar logoSigne={logoSigne} source={nomBoutique ?? email} />
          <span className="hidden max-w-[180px] truncate text-[14px] font-semibold text-ds-texte-fort lg:block">
            {nomBoutique ?? t("monCompte")}
          </span>
          <ChevronDown
            aria-hidden="true"
            size={16}
            strokeWidth={1.8}
            className="shrink-0 text-ds-texte-tenu transition-transform group-open:rotate-180"
          />
          <span className="sr-only">{t("monCompte")}</span>
        </summary>
        <div className="absolute end-0 top-full z-30 mt-1.5 w-64 rounded-ds-card border border-ds-filet bg-ds-surface-carte p-1.5 shadow-ds-lg">
          <p className="truncate px-3 py-2 text-[12px] text-ds-texte-sourdine">{email}</p>
          <LienParametres langue={langue} variante="menu" />
          <BoutonDeconnexion langue={langue} variante="menu" />
        </div>
      </details>
    </header>
  );
}

/**
 * Le logo de la boutique, ou ses initiales sur l'accent.
 *
 * ⚠️ PAS DE DISQUE GRIS VIDE. Le kit dessine un avatar d'initiales quand il n'y
 * a pas d'image ; un rond gris ne dit pas à qui appartient le compte, et c'est
 * la seule chose que ce coin de l'écran a à dire.
 */
function Avatar({
  logoSigne,
  source,
}: {
  readonly logoSigne: string | null;
  readonly source: string;
}) {
  if (logoSigne !== null) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element --
         URL signée à expiration : l'optimiseur de Next la mettrait en cache sous
         une clé stable et servirait une image dont la signature a expiré. */
      <img
        src={logoSigne}
        alt=""
        width={38}
        height={38}
        className="h-[38px] w-[38px] shrink-0 rounded-ds-pill object-cover"
      />
    );
  }
  const mots = source
    .replace(/@.*$/, "")
    .split(/[\s._-]+/)
    .filter((m) => m !== "");
  const lettres = mots.slice(0, 2).map((m) => m.charAt(0));
  return (
    <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-ds-pill bg-ds-accent text-[14px] font-bold text-ds-texte-sur-marque">
      {lettres.join("").toUpperCase() || "?"}
    </span>
  );
}
