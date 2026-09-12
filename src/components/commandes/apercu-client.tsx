"use client";

import { useTranslations } from "next-intl";
import { substituerNom, type LibellesApercu } from "@/lib/boutique/phrases-apercu";
import type { MediaAffiche } from "./carte-medias";

/**
 * « CE QUE VOIT LE CLIENT » — l'aperçu en direct de la page publique.
 *
 * IL MANQUAIT, et il est exigé deux fois : par la planche `Editeur`, qui lui
 * donne toute la colonne de droite, et par le brief §7 — « aperçu en direct de
 * ce que voit le client, côte à côte ».
 *
 * POURQUOI IL COMPTE PLUS QU'IL N'EN A L'AIR. Le produit vend une chose : la
 * crédibilité d'un lien envoyé en message privé. Le vendeur ne peut pas la
 * juger depuis un formulaire — il faut qu'il voie sa couleur, son nom et ses
 * photos assemblés. Sans cet aperçu, la seule façon de vérifier est d'ouvrir la
 * page publique dans un onglet, donc de compter une vue sur sa propre commande.
 *
 * CE N'EST PAS LA PAGE PUBLIQUE EN MINIATURE, et il ne faut pas qu'il le
 * devienne. Réutiliser les vrais composants ferait entrer tout le poids de la
 * page cliente dans l'éditeur, et ferait dépendre l'aperçu d'un rendu qui n'a
 * pas les mêmes contraintes. C'est une MAQUETTE, à l'échelle, avec les mêmes
 * couleurs résolues — ce que la planche dessine, exactement.
 *
 * AUCUNE COULEUR D'ÉCRITURE N'EST POSÉE EN DUR SUR L'APLAT D'ACCENT. Un accent
 * clair — un jaune vif, un blanc cassé — rendrait un texte blanc illisible.
 * `resoudreAccent()` a déjà tranché côté serveur, ici on applique.
 */
export interface PaletteApercu {
  readonly remplissage: string;
  readonly surRemplissage: string;
  readonly surRemplissageDoux: string;
  readonly surRemplissageFaible: string;
}

export function ApercuClient({
  nomBoutique,
  logoUrl,
  palette,
  client,
  medias,
  libelles,
}: {
  readonly nomBoutique: string | null;
  readonly logoUrl: string | null;
  readonly palette: PaletteApercu;
  readonly client: string;
  readonly medias: readonly MediaAffiche[];
  /*
   * ⚠️ LES PHRASES DE LA MAQUETTE ARRIVENT RÉSOLUES, DANS LA LANGUE DE LA
   * BOUTIQUE — pas dans celle de l'URL. `useTranslations` reste juste au-dessus
   * pour le CADRE, qui parle au VENDEUR ; ce qui est montré COMME étant la page
   * du client doit être dans la langue du client, sinon cet encart affirme le
   * contraire de ce que le lien produira. Mesuré le 06/09/2026 : sur `/en`, il
   * annonçait « What your customer sees » puis « Your order » pour une boutique
   * en français.
   */
  readonly libelles: LibellesApercu;
}) {
  const t = useTranslations("editeur");

  const nom = client.trim();
  const vignettes = medias.slice(0, 3);

  return (
    <section className="rounded-ds-card-lg border border-ds-filet bg-ds-surface-carte p-5 shadow-ds-card">
      <div className="mb-3.5 flex items-center justify-between gap-3">
        <h2 className="text-[18px] font-bold tracking-[-0.025em] text-ds-texte-titre">
          {t("apercuTitre")}
        </h2>
        <span className="text-[13px] text-ds-texte-sourdine">{t("apercuDirect")}</span>
      </div>

      {/* `aria-hidden` : c'est une IMAGE de la page, pas la page. Un lecteur
          d'écran qui la parcourrait annoncerait deux fois le nom du client et un
          bouton « Approuver » sur lequel il n'y a rien à approuver ici. */}
      <div
        aria-hidden="true"
        className="overflow-hidden rounded-ds-card border border-ds-filet"
      >
        <div
          className="px-3.5 py-4"
          style={{ backgroundColor: palette.remplissage, color: palette.surRemplissage }}
        >
          <div className="flex items-center gap-[7px]">
            {logoUrl !== null ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={logoUrl}
                alt=""
                width={20}
                height={20}
                className="h-5 w-5 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span
                className="h-5 w-5 shrink-0 rounded-full"
                style={{ backgroundColor: palette.surRemplissageFaible }}
              />
            )}
            {/*
              L'EN-TÊTE EST OMIS QUAND NI NOM NI LOGO — décision 24. On ne rend
              pas de barre vide ni de libellé de remplacement : ici le nom
              disparaît, et il ne reste que la pastille.
            */}
            {nomBoutique !== null ? (
              <span className="truncate text-[11px] font-bold">{nomBoutique}</span>
            ) : null}
          </div>

          {/* Inter, comme la vraie page client depuis sa migration : l'aperçu doit
              porter la MÊME police que ce qu'il annonce montrer. */}
          <p className="mt-2 mb-px text-[17px] font-extrabold tracking-[-0.03em]">
            {libelles.commande}
          </p>

          {/* UNE INFORMATION ABSENTE EST OMISE, jamais remplacée par un texte
              inventé : sans nom de client, la ligne « pour … » disparaît. */}
          {nom !== "" ? (
            <p className="truncate text-[11px]" style={{ color: palette.surRemplissageDoux }}>
              {substituerNom(libelles.pourGabarit, nom)}
            </p>
          ) : null}
        </div>

        <div className="p-3">
          {/* LA FRISE À QUATRE ÉTAPES, réduite à ses barres : c'est sa forme, et
              c'est tout ce qu'on peut en montrer à cette échelle. */}
          <div className="mb-3 grid grid-cols-4 gap-1">
            {[0, 1, 2, 3].map((etape) => (
              <span
                key={etape}
                className="h-[5px] rounded-full"
                style={{
                  backgroundColor: etape < 3 ? palette.remplissage : "var(--color-outline-variant)",
                }}
              />
            ))}
          </div>

          {/* TROIS VIGNETTES, ET DES CASES VIDES QUAND IL Y EN A MOINS. La
              grille garde sa hauteur : un aperçu qui se replie à chaque dépôt
              ferait sauter la colonne entière pendant qu'on travaille. */}
          <div className="mb-3 grid grid-cols-3 gap-1">
            {[0, 1, 2].map((rang) => {
              const media = vignettes[rang];
              return media?.urlVignette != null ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={media.id}
                  src={media.urlVignette}
                  alt=""
                  className="aspect-square w-full rounded-ds-xs object-cover"
                />
              ) : (
                <span
                  key={"vide-" + rang}
                  className="aspect-square w-full rounded-ds-xs bg-ds-surface-creux"
                />
              );
            })}
          </div>

          <div
            className="flex h-9 items-center justify-center rounded-[9px]"
            style={{ backgroundColor: palette.remplissage, color: palette.surRemplissage }}
          >
            <span className="text-[12px] font-bold">{libelles.approuver}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
