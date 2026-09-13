import { ArrowRight, MessageCircle } from "lucide-react";
import { CARTE } from "@/components/publique/carte-client";
import { ReseauxVendeur, liensDuVendeur } from "@/components/publique/reseaux-vendeur";
import type { AccentResolu } from "@/lib/design/contraste";
import type { Boutique } from "@/lib/page-publique/lecture";

/**
 * « UNE QUESTION ? » — la carte de contact du kit `client_link`.
 *
 * ⚠️ OMISE QUAND LE VENDEUR N'A CONFIGURÉ AUCUN LIEN. Le kit l'affiche toujours ;
 * un bouton « Contacter la boutique » qui ne mène nulle part serait la pire
 * forme du texte de remplacement — une promesse d'interface que l'interface ne
 * tient pas. La page ne porte AUCUN formulaire (décision 3), donc sans lien il
 * n'y a tout simplement pas de moyen de contact à offrir.
 *
 * LE BOUTON MÈNE AU PREMIER MOYEN DE JOINDRE QUELQU'UN : WhatsApp, puis
 * Instagram, puis TikTok, puis le site. C'est l'ordre du plus direct au moins
 * direct — un message WhatsApp arrive à une personne, un site à une vitrine.
 *
 * ⚠️ IL EST À LA COULEUR DU VENDEUR, JAMAIS AU DÉGRADÉ DROPLINK — règle 3 : le
 * dégradé n'apparaît pas sur cette page. Aplat et écriture viennent de
 * `resoudreAccent()`, qui tient 4,5:1 quel que soit l'accent choisi.
 */
const ORDRE_CONTACT = ["whatsapp", "instagram", "tiktok", "site"] as const;

export function CarteContact({
  boutique,
  libelles,
  libelleSite,
  accent,
}: {
  readonly boutique: Boutique;
  readonly libelles: { readonly titre: string; readonly texte: string; readonly bouton: string };
  readonly libelleSite: string;
  readonly accent: AccentResolu;
}) {
  const liens = liensDuVendeur(boutique, libelleSite);
  const principal = ORDRE_CONTACT.map((clef) => liens.find((l) => l.clef === clef)).find(
    (l) => l !== undefined,
  );

  if (principal === undefined) return null;

  return (
    <section className={CARTE}>
      <div className="mb-[18px] flex gap-3.5">
        <span
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: accent.teinte, color: accent.interface }}
        >
          <MessageCircle size={20} strokeWidth={1.9} />
        </span>
        <span className="flex flex-col gap-[5px]">
          <span className="text-[17px] font-bold text-ds-texte-fort">{libelles.titre}</span>
          <span className="text-[13px] leading-[1.55] text-ds-texte-corps">{libelles.texte}</span>
        </span>
      </div>
      <a
        href={principal.href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-13 w-full items-center justify-center gap-2 rounded-ds-card border border-transparent px-7 text-[15px] font-semibold tracking-[-0.02em] shadow-ds-sm transition-opacity hover:opacity-90"
        style={{ backgroundColor: accent.remplissage, color: accent.surRemplissage }}
      >
        {libelles.bouton}
        <ArrowRight size={18} strokeWidth={2} aria-hidden="true" />
      </a>
      <div className="mt-3.5 empty:hidden">
        <ReseauxVendeur boutique={boutique} libelleSite={libelleSite} variante="libelle" />
      </div>
    </section>
  );
}
