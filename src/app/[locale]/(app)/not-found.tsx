import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, Search } from "lucide-react";
import { CarteEtatVide } from "@/components/app/carte-etat-vide";

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
 * ⚠️ LA PLANCHE DE CET ÉTAT-LÀ EXISTE DEPUIS LE 14/09/2026 : la vue
 * `#introuvable` du kit `seller_app`, écrite dans le vocabulaire d'`EmptyView`
 * — carte, pastille teintée de 58, titre 22/800, bouton secondaire de retour.
 * Cette page portait jusque-là l'ancien canevas, Plus Jakarta Sans compris.
 *
 * L'ISOLATION N'EST PAS EN CAUSE : la commande d'un autre vendeur rend
 * exactement cette page, sans qu'aucune de ses données n'ait été lue. C'est le
 * RENDU du refus qui était fautif, pas le refus.
 */
export default async function CommandeIntrouvable() {
  const t = await getTranslations("commandes");

  return (
    <main id="contenu" className="tableau etat-ecran">
      <CarteEtatVide icone={Search} titre={t("introuvable.titre")} texte={t("introuvable.texte")}>
        {/*
          UN LIEN ORDINAIRE, ET LA DESTINATION EST LA LISTE.
          Le chemin est relatif à la langue courante, résolue par le middleware :
          écrire `/fr/commandes` en dur enverrait un vendeur anglophone sur une
          page française, ce que la surface entière évite déjà.
        */}
        <Link href="./" className="etat__bouton">
          <ArrowLeft aria-hidden="true" className="ic" />
          <span>{t("introuvable.retour")}</span>
        </Link>
      </CarteEtatVide>
    </main>
  );
}
