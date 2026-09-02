import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Icone } from "@/components/icone";

/**
 * CE QUE VOIT UN VENDEUR QUAND UNE COMMANDE N'EXISTE PAS.
 *
 * ⚠️ DÉFAUT MESURÉ LE 02/09/2026. `commandes/[id]/page.tsx` appelle bien
 * `notFound()`, et il n'existait AUCUN `not-found` sur cette surface — un seul
 * dans tout le produit, sur la page client. Résultat, avec une vraie session :
 *
 *   /fr/commandes/00000000-…-000000000000  → 200 · titre « Nouvelle commande »
 *   /fr/commandes/pas-un-uuid              → 200 · titre « Nouvelle commande »
 *
 * Trois choses fausses d'un coup. Le STATUT annonce que la page existe ; le
 * TITRE affirme une commande neuve, qui est le libellé écrit pour l'instant qui
 * suit une création ; et le CORPS servait la page d'erreur native de Next —
 * « This page could not be found », en anglais en dur, hors du canevas, sur une
 * locale `fr`.
 *
 * Le cas n'est pas théorique : une URL d'éditeur périmée est un lien collé dans
 * une conversation, ou un onglet gardé ouvert après une suppression. Et sans
 * JavaScript, le squelette de `loading.tsx` restait à l'écran sans jamais se
 * résoudre.
 *
 * ⚠️ CETTE PAGE EST DANS LE VOCABULAIRE DE `CommandesFiltreVide`, VALEUR POUR
 * VALEUR : même carte, même pastille de 56 px en `rounded-[16px]`, même titre en
 * 22/28 extrabold, même texte en 15/24, même bouton de 46 px. La planche de cet
 * ÉTAT-LÀ n'existe pas encore au canevas — c'est une dette déclarée, pas un
 * motif inventé : rien ici n'introduit de forme que les planches ne portent
 * déjà.
 *
 * L'ISOLATION N'EST PAS EN CAUSE : la commande d'un autre vendeur rend
 * exactement cette page, sans qu'aucune de ses données n'ait été lue. C'est le
 * RENDU du refus qui était fautif, pas le refus.
 */
export default async function CommandeIntrouvable() {
  const t = await getTranslations("commandes");

  return (
    <main className="flex flex-grow items-center justify-center px-margin-mobile py-12 text-center md:px-0">
      <div className="max-w-[460px]">
        <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-[16px] bg-fond-neutre">
          <Icone nom="search" className="text-[24px] text-gris-inactif" />
        </span>

        <h1 className="font-headline-md text-[22px] leading-7 font-extrabold tracking-[-0.025em] text-on-surface">
          {t("introuvable.titre")}
        </h1>
        <p className="mt-2.5 font-body-md text-[15px] leading-6 text-sourdine">
          {t("introuvable.texte")}
        </p>

        {/*
          UN LIEN ORDINAIRE, ET LA DESTINATION EST LA LISTE.
          Le chemin est relatif à la langue courante, résolue par le middleware :
          écrire `/fr/commandes` en dur enverrait un vendeur anglophone sur une
          page française, ce que la surface entière évite déjà.
        */}
        <Link
          href="./"
          className="mt-6 inline-flex min-h-11 items-center rounded-[12px] border border-filet-controle bg-surface-container-lowest px-[22px] font-label-md text-[15px] font-bold text-on-surface transition-colors hover:bg-fond-neutre md:h-[46px] md:min-h-0"
        >
          {t("introuvable.retour")}
        </Link>
      </div>
    </main>
  );
}
