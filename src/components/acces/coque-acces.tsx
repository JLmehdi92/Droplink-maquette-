import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { BarChart3, Package, ShieldCheck, Zap, type LucideIcon } from "lucide-react";
import logoDropLink from "@/../public/marque/logo-droplink.png";

/**
 * LES PIÈCES DE LA COQUE DES ÉCRANS D'ACCÈS — connexion et inscription.
 *
 * Toutes des composants SERVEUR : aucune n'a d'état ni de gestionnaire, donc
 * aucune n'expédie une ligne de JavaScript. C'est l'écran qu'un fournisseur
 * ouvre en 4G depuis la Chine ; ce qui peut être rendu au serveur doit l'être.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * MIGRÉ SUR LE DESIGN SYSTEM LE 11/09/2026 — valeurs mesurées dans Chrome sur
 * le kit `auth` servi en HTTP, jamais estimées à l'œil.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Le fond lavande et ses quatre halos.
 *
 * `fixed` et `aria-hidden` : c'est un décor, il ne défile pas et n'a rien à
 * annoncer. AUCUNE animation — cet écran est celui où l'on tape un mot de
 * passe, pas celui où l'on regarde bouger.
 *
 * ⚠️ LES QUATRE FORMES SONT DES DÉGRADÉS RADIAUX, PAS UN FLOU. Le brief
 * interdit `backdrop-blur` sur la page client et le déconseille partout où il
 * ne floute rien : sur un aplat, un `blur` coûte une couche de composition pour
 * un résultat qu'un `radial-gradient` rend gratuitement.
 */
export function FondAcces() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 -z-10 overflow-hidden"
      style={{ background: "linear-gradient(135deg,#F3F1FE 0%,#FAF8FE 42%,#F7F2FC 100%)" }}
    >
      <div
        className="absolute -top-[200px] -left-[260px] h-[720px] w-[720px] rounded-full"
        style={{ background: "radial-gradient(circle,rgba(140,126,249,.20),transparent 68%)" }}
      />
      <div
        className="absolute -right-[200px] top-10 h-[620px] w-[620px] rounded-full"
        style={{ background: "radial-gradient(circle,rgba(232,120,180,.14),transparent 68%)" }}
      />
      <div
        className="absolute -bottom-[280px] -left-[180px] h-[700px] w-[700px] rounded-full"
        style={{ background: "radial-gradient(circle,rgba(140,126,249,.16),transparent 68%)" }}
      />
      <div
        className="absolute -bottom-[120px] right-[120px] h-[460px] w-[460px] rotate-[24deg] rounded-[90px]"
        style={{
          background: "linear-gradient(135deg,rgba(192,184,251,.16),rgba(255,255,255,0))",
        }}
      />
    </div>
  );
}

/**
 * Le logo de marque.
 *
 * ⚠️ SERVI PAR `next/image`, ET C'EST NÉCESSAIRE. Le fichier fourni est un PNG
 * de 2172 × 724 pour 574 Ko — le design system signale lui-même qu'il manque un
 * SVG. Rendu tel quel à 52 px de haut, il ferait payer un demi-mégaoctet pour
 * quelques milliers de pixels. `next/image` en produit les variantes au build,
 * depuis notre domaine : aucune requête tierce, et la règle qui écarte
 * l'optimiseur ne vaut que pour les URL R2 SIGNÉES, qu'il remettrait en cache
 * derrière leur expiration.
 */
export function LogoMarque({
  hauteur,
  className = "",
}: {
  readonly hauteur: number;
  readonly className?: string;
}) {
  return (
    <Image
      src={logoDropLink}
      alt="DropLink"
      height={hauteur}
      width={Math.round((hauteur * 2172) / 724)}
      priority
      className={className}
    />
  );
}

/** Le filet séparateur, avec son libellé centré. */
export function SeparateurAcces({ libelle }: { readonly libelle: string }) {
  return (
    <div className="flex items-center gap-4">
      <span className="h-px flex-1 bg-ds-filet" />
      <span className="text-[13px] font-semibold text-ds-texte-sourdine">{libelle}</span>
      <span className="h-px flex-1 bg-ds-filet" />
    </div>
  );
}

/** La note de bas de carte : un fait, pas une promesse commerciale. */
export async function NoteSecurite() {
  const t = await getTranslations("connexion");
  return (
    <div className="flex items-center justify-center gap-[9px] text-ds-texte-sourdine">
      <ShieldCheck aria-hidden="true" size={16} strokeWidth={1.8} className="text-ds-accent" />
      <span className="text-[13px]">{t("noteSecurite")}</span>
    </div>
  );
}

/**
 * La colonne de gauche : ce que le produit fait, en trois points.
 *
 * ⚠️ TROIS BLOCS DE LA RÉFÉRENCE NE SONT PAS REPRIS, ET C'EST UNE DÉCISION
 * PRODUIT, PAS UN OUBLI.
 *
 * — La preuve sociale « +2 500 vendeurs » et ses cinq portraits : le produit
 *   compte UN compte. Un chiffre inventé sur un écran d'entrée est un mensonge
 *   qui se mesure, et la décision du 27/08 l'écarte déjà pour la landing.
 * — Le témoignage attribué à « Yanis, vendeur sur Vinted » : une citation
 *   inventée est un faux avis. L'emplacement reste vide jusqu'à ce qu'un vrai
 *   vendeur nous en donne un.
 * — La rangée de marketplaces (Vinted, eBay, Amazon, Shopify…) : le brief §2
 *   range les marchands Shopify parmi les ANTI-personas. DropLink sert celui
 *   qui vend SANS boutique ; afficher leurs noms vendrait un autre produit.
 *
 * Ce qui reste est vérifiable, et c'est le seul critère.
 */
export async function ArgumentAcces({
  variante = "connexion",
}: {
  readonly variante?: "connexion" | "inscription";
} = {}) {
  const t = await getTranslations("connexion");
  const ti = await getTranslations("inscription");
  const inscription = variante === "inscription";

  /*
   * ⚠️ LE PREMIER ATOUT CHANGE ENTRE LES DEUX ÉCRANS, LES DEUX AUTRES NON.
   * La référence le fait exprès : sur la connexion il vend la RAPIDITÉ D'USAGE
   * (« Créez vos commandes en quelques clics »), sur l'inscription la RAPIDITÉ
   * D'ENTRÉE (« Créez votre compte en moins d'une minute »). On arrive sur ces
   * deux écrans avec une question différente ; y répondre par la même phrase
   * serait plus simple et moins juste.
   */
  const atouts: ReadonlyArray<{ icone: LucideIcon; titre: string; texte: string }> = [
    inscription
      ? { icone: Zap, titre: ti("atoutTitre1"), texte: ti("atoutTexte1") }
      : { icone: Zap, titre: t("atoutTitre1"), texte: t("atoutTexte1") },
    { icone: Package, titre: t("atoutTitre2"), texte: t("atoutTexte2") },
    { icone: BarChart3, titre: t("atoutTitre3"), texte: t("atoutTexte3") },
  ];

  return (
    <div className={`flex flex-col ${inscription ? "gap-[34px]" : "gap-9"} max-w-[460px]`}>
      <div>
        {inscription ? (
          <span className="mb-5 inline-flex rounded-ds-pill border border-ds-filet bg-white/[0.78] px-4 py-2 text-[11px] font-bold tracking-[0.1em] text-ds-ink-600 uppercase">
            {ti("badge")}
          </span>
        ) : null}
        {/*
         * ⚠️ 58 px, PAS 64. Le design system pose le hero à 64 ; la référence
         * `auth` rend 58 — mesuré sur sa page servie à 1440. Recopier la valeur
         * du token aurait donné un titre trop grand de six pixels sur le seul
         * écran qui le porte.
         */}
        {/*
         * ⚠️ UN `<p>`, PAS UN `<h1>`, ET C'EST UNE CORRECTION DE STRUCTURE.
         * La référence met son grand titre ici et un `<h2>` dans la carte. Mais
         * cette colonne DISPARAÎT sous `lg` : au téléphone, la page se
         * retrouvait sans aucun `<h1>`, et au bureau elle en portait DEUX —
         * relevé en mesurant les titres rendus, jamais visible à l'œil puisque
         * les deux sont dessinés pareil.
         *
         * Le `<h1>` est donc le titre de la CARTE, qui est présent à toutes les
         * largeurs. Celui-ci garde son dessin au pixel près et rend sa balise.
         */}
        <p
          className={
            "font-extrabold tracking-[-0.045em] text-ds-texte-titre " +
            (inscription
              ? "text-[36px] leading-[1.0] md:text-[52px]"
              : "text-[40px] leading-[0.98] md:text-[58px]")
          }
        >
          {t("argumentTitreA")}
          <span className="degrade-ds-marque bg-clip-text text-transparent">
            {t("argumentTitreB")}
          </span>
        </p>
        <p className="mt-[18px] text-[17px] leading-[1.5] text-ds-texte-corps">
          {inscription ? (
            ti("accroche")
          ) : (
            <>
              <strong className="font-bold text-ds-texte-fort">{t("argumentTexteFort")}</strong>
              {t("argumentTexteSuite")}
            </>
          )}
        </p>
      </div>

      <div className="flex flex-col gap-[22px]">
        {atouts.map(({ icone: Icone, titre, texte }) => (
          <div key={titre} className="flex items-start gap-[18px]">
            <span className="flex h-13 w-13 flex-none items-center justify-center rounded-ds-card bg-ds-surface-teinte text-ds-accent">
              <Icone aria-hidden="true" size={23} strokeWidth={1.9} />
            </span>
            <div className="flex flex-col gap-1 pt-1">
              <span className="text-[17px] font-bold tracking-[-0.02em] text-ds-texte-fort">
                {titre}
              </span>
              <span className="text-[14px] text-ds-texte-corps">{texte}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
