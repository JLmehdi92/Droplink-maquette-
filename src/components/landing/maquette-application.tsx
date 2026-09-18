import {
  ArrowRight,
  BarChart3,
  Bell,
  Briefcase,
  CalendarDays,
  Check,
  ChevronDown,
  Clock,
  Home,
  Link2,
  Package,
  Search,
  Settings,
  Shield,
  Truck,
  Zap,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { LogoMarque } from "@/components/acces/coque-acces";
/*
 * ⚠️ IMPORTS STATIQUES, PAS DES CHEMINS EN CHAÎNE — et ça n'est pas un détail de
 * style. Écrits `src="/marque/…"`, ces fichiers passent par `/_next/image`, qui
 * va les rechercher sur leur URL publique ; le middleware de langue y répond
 * **307** vers `/fr/marque/…`, et l'optimiseur rend « The requested resource
 * isn't a valid image » — un 400, donc quatre vignettes et un téléphone CASSÉS.
 * Importés, ils sont servis depuis `/_next/static/`, hors du filtre. C'est déjà
 * la convention du dépôt (`logo-droplink.png` dans la coque d'accès) ; je ne
 * l'avais pas suivie, et c'est la sonde réseau qui l'a dit.
 */
import maquetteClient from "@/../public/marque/maquette-page-client.webp";
import apercuSneaker from "@/../public/marque/apercu-sneaker.jpg";
import apercuCap from "@/../public/marque/apercu-cap.jpg";
import apercuHoodie from "@/../public/marque/apercu-hoodie.jpg";
import apercuJogger from "@/../public/marque/apercu-jogger.jpg";
import drapeauFr from "@/../public/marque/drapeaux/fr.png";
import drapeauBe from "@/../public/marque/drapeaux/be.png";
import drapeauIt from "@/../public/marque/drapeaux/it.png";

const APERCUS = {
  sneaker: apercuSneaker,
  cap: apercuCap,
  hoodie: apercuHoodie,
  jogger: apercuJogger,
} as const;

const DRAPEAUX = { fr: drapeauFr, be: drapeauBe, it: drapeauIt } as const;

/**
 * LE TÉLÉPHONE DU HÉROS — `PhoneMock` de la planche `marketing_site`.
 *
 * ⚠️ C'EST UNE IMAGE, PAS UN RENDU. La planche sert un rendu de 735 × 1488 de la
 * page client (`mock-phone-client-page.png`) et le pose à 286 px de large. Le
 * refaire en balisage vivant coûterait la page client entière en miniature, pour
 * un dessin que personne ne lit.
 *
 * ⚠️ IL ÉTAIT ABSENT, ET C'EST CE QUE WASSIM A VU EN PREMIER : « le téléphone à
 * côté du dashboard ». Le héros de la planche montre les DEUX surfaces côte à
 * côte — ce que le vendeur voit, et ce que son client voit. La moitié droite
 * manquait.
 *
 * ⚠️ 120 Ko EN WEBP, PAS 1,5 Mo EN PNG. La source de la planche pèse un mégaoctet
 * et demi pour un dessin rendu à 286 px ; elle est redimensionnée à 572 (deux
 * fois la taille d'affichage) et convertie, transparence comprise.
 */
export function TelephoneClient({ largeur = 286 }: { readonly largeur?: number }) {
  return (
    <Image
      src={maquetteClient}
      alt=""
      aria-hidden="true"
      className="block h-auto w-auto flex-none select-none [filter:drop-shadow(0_34px_70px_rgba(28,22,78,0.26))]"
      style={{ width: largeur }}
    />
  );
}

/**
 * LA MAQUETTE D'APPLICATION DU HÉROS — `AppWindowMock` du kit `marketing_site`,
 * portée le 17/09/2026 sur décision de Wassim (« oui, comme le kit »).
 *
 * Elle montre l'espace vendeur tel qu'il est : les six entrées de navigation sont
 * celles du produit, et les deux écrans que la planche dessinait sans qu'ils
 * existent — Tableau de bord et Paramètres — ont été créés depuis le 14/09/2026.
 * C'était la moitié de l'argument qui la tenait dehors, et elle était périmée.
 *
 * ⚠️ LES DRAPEAUX DE PAYS SONT SERVIS PAR LE DÉPÔT, PAS PAR `flagcdn.com`.
 * Le kit va les chercher chez ce fournisseur ; notre CSP n'autorise les images
 * que depuis notre domaine et R2, donc ils seraient BLOQUÉS en production. Les
 * trois fichiers (100 octets chacun) ont été récupérés une fois et importés.
 *
 * ⚠️ LES PHOTOS DES COMMANDES ÉTAIENT DES APLATS GRIS, ET C'ÉTAIT FAUX DE DIRE
 * QUE LE DÉPÔT NE LES EMPORTAIT PAS. Ce commentaire affirmait « le kit sert
 * quatre fichiers de son dossier d'assets, que le dépôt n'emporte pas » —
 * L-014 : personne n'avait vérifié. Le dépôt copie DÉJÀ des assets du kit dans
 * `public/marque/` (le logo, les deux illustrations de colis) ; rien
 * n'empêchait d'y copier les quatre vignettes. Elles y sont, ramenées de
 * 526 Ko à 1 Ko chacune — la planche sert une photo pleine taille pour un
 * dessin de 30 px.
 *
 * ⚠️ SES CHIFFRES SONT DES ILLUSTRATIONS, PAS DES MESURES : ils décrivent
 * l'écran, pas notre activité.
 *
 * ELLE EST DÉCORATIVE : `aria-hidden`, aucun lien, aucun bouton — un lecteur
 * d'écran n'a rien à faire d'une capture dessinée, et aucune de ses zones ne
 * mène nulle part. Elle se rend à toutes les largeurs, réduite par la page
 * (0,68 au bureau, 0,2856 puis 0,204 aux paliers de la planche).
 */
const NAV: ReadonlyArray<readonly [LucideIcon, string, string | null]> = [
  [Home, "appNavHome", null],
  [Briefcase, "appNavOrders", "124"],
  [Truck, "appNavShip", null],
  [BarChart3, "appNavStats", null],
  [Shield, "appNavBrand", null],
  [Settings, "appNavSettings", null],
];

/** Les cinq tuiles du kit : valeur, libellé, écart, et la teinte de sa pastille. */
const TUILES: ReadonlyArray<{
  readonly icone: LucideIcon;
  readonly valeur: string;
  readonly cle: string;
  readonly ecart: string;
  readonly baisse?: boolean;
  readonly teinte: string;
}> = [
  { icone: Package, valeur: "156", cle: "kpiCreated", ecart: "+12%", teinte: "bg-ds-surface-teinte text-ds-accent" },
  { icone: Check, valeur: "78", cle: "kpiDelivered", ecart: "+20%", teinte: "bg-ds-succes-fond text-ds-succes-encre" },
  { icone: Truck, valeur: "42", cle: "kpiTransit", ecart: "+8%", teinte: "bg-ds-info-fond text-ds-info" },
  { icone: Link2, valeur: "342", cle: "kpiLinks", ecart: "+18%", teinte: "bg-ds-surface-teinte text-ds-accent" },
  { icone: Clock, valeur: "6,2j", cle: "kpiDelay", ecart: "-18%", baisse: true, teinte: "bg-ds-alerte-fond text-ds-alerte-encre" },
];

/* La vignette de chaque ligne est celle de la planche, redimensionnée au dépôt :
   la planche sert des photos de 526 Ko pour une vignette de 30 px. */
const LIGNES: ReadonlyArray<
  readonly [string, string, keyof typeof DRAPEAUX, string, string, string, keyof typeof APERCUS]
> = [
  ["#DLK7842", "Yanis B.", "fr", "stTransit", "ago1", "bg-ds-info-fond text-ds-info", "sneaker"],
  ["#DLK7841", "Sofia M.", "fr", "stDelivering", "ago3", "bg-ds-alerte-fond text-ds-alerte-encre", "cap"],
  ["#DLK7840", "Amine K.", "be", "stDelivered", "ago5", "bg-ds-succes-fond text-ds-succes-encre", "hoodie"],
  ["#DLK7839", "Luca R.", "it", "stOrdered", "ago7", "bg-ds-violet-100 text-ds-accent-encre", "jogger"],
];

const COLONNES = "grid grid-cols-[34px_.8fr_1fr_.95fr_.7fr] items-center gap-2.5 px-4";

export async function MaquetteApplication() {
  const t = await getTranslations("landing.kit");

  return (
    <div
      aria-hidden="true"
      className="w-[1180px] overflow-hidden rounded-ds-window border border-ds-filet bg-ds-surface-carte shadow-ds-window select-none"
    >
      {/* Les trois pastilles de fenêtre : c'est ce qui dit « application », et
          c'est la seule chose de cette maquette qui ne soit pas notre écran. */}
      <div className="flex gap-1.5 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
      </div>

      <div className="grid min-h-[440px] grid-cols-[224px_1fr]">
        <div className="flex flex-col gap-[3px] px-3 pt-1.5 pb-3.5">
          {/* ⚠️ LE LOGO, PAS LE MOT. La planche pose `<Logo height={21} />` ;
              j'avais écrit « DropLink » en texte, ce qui donnait une barre
              latérale sans marque — le premier détail que Wassim a vu. */}
          <span className="block px-1.5 pb-4">
            <LogoMarque hauteur={21} />
          </span>
          {NAV.map(([Icone, cle, compte], rang) => (
            <span
              key={cle}
              className={
                /* Remplissage 14 et écart 14 : les valeurs de `SidebarItem`, que la
                   maquette ne redéfinit pas (elle ne change que la hauteur et la taille). */
                "flex h-9 items-center gap-3.5 rounded-ds-card px-3.5 text-[12.5px] " +
                (rang === 0
                  ? "bg-ds-surface-teinte font-bold text-ds-accent-encre"
                  : "font-medium text-ds-texte-corps")
              }
            >
              <Icone size={20} strokeWidth={rang === 0 ? 2.1 : 1.8} />
              {/* `leading-[normal]` : le kit n'impose aucun interligne ici, et le défaut
                  de Tailwind (1,5) rendait une ligne de 18,75 px au lieu de 10. */}
              <span className="min-w-0 flex-1 truncate leading-[normal]">{t(cle)}</span>
              {/* ⚠️ UNE PILULE SUR CHAQUE ENTRÉE, MÊME SANS COMPTEUR. Le kit passe
                  `null` et `SidebarItem` teste `count !== undefined` : il rend donc
                  une pilule VIDE, un trait de 18 × 4 à droite de chaque libellé
                  (violet sur l'entrée active). C'est ce que la planche montre. */}
              <span
                className={
                  "rounded-ds-pill px-[9px] py-0.5 text-[11.5px] leading-[normal] font-bold md:text-[11px] " +
                  (rang === 0 ? "bg-ds-accent text-ds-texte-sur-marque" : "bg-ds-surface-creux text-ds-texte-sourdine")
                }
              >
                {compte}
              </span>
            </span>
          ))}
          <span className="flex-1" />
          {/*
            ⚠️ CET ENCART A ÉTÉ OMIS PAR ERREUR, ET SON MOTIF ÉTAIT PÉRIMÉ.
            L'en-tête de ce fichier disait « la contrainte n° 1 interdit tout
            code de facturation, affichage compris » — c'était la bonne règle
            jusqu'au 12/09/2026, quand Wassim a tranché (« jcompte mettre un
            pricing genre un gratuit et un pro ») et que la VRAIE barre latérale
            du produit a reçu le sien. Le dessin contredisait donc l'écran qu'il
            dessine, et il le contredisait au nom d'une décision renversée.

            Ce qui n'a pas changé : aucun code de paiement. Ici c'est un dessin
            inerte ; dans l'espace vendeur, le bouton mène à `/docs#plans`.

            Valeurs relevées au kit servi : carte de 200 × 118 au rayon 16, fond
            `--degrade-ds-teinte` (le jeton EST le dégradé du kit, au stop près),
            filet `violet-200`, remplissage 12 ; titre 12/700 à l'encre d'accent,
            texte 10,5/400 en interligne 14,7, bouton de 35 au dégradé de marque.
          */}
          <span className="flex flex-col rounded-ds-card border border-ds-violet-200 bg-[image:var(--degrade-ds-teinte)] p-3">
            <span className="flex items-center gap-[7px] text-[12px] leading-[normal] font-bold text-ds-accent-encre">
              <Zap size={14} strokeWidth={2.2} />
              {t("appProTitle")}
            </span>
            <span className="mt-[3px] text-[10.5px] leading-[14.7px] text-ds-texte-corps">{t("appProBody")}</span>
            <span className="degrade-ds-marque mt-[9px] flex h-[35px] items-center justify-center gap-2 rounded-ds-pill border border-transparent px-4 text-[13px] font-semibold tracking-[-0.02em] text-ds-texte-sur-marque shadow-ds-brand">
              {t("appProCta")}
              <ArrowRight size={16} strokeWidth={2.2} />
            </span>
          </span>
          <span className="mt-2.5 flex items-center gap-[9px] rounded-ds-card border border-ds-filet bg-ds-surface-carte p-[9px]">
            <span className="flex h-7 w-7 items-center justify-center rounded-[999px] bg-ds-accent text-[10px] font-bold tracking-[-0.2px] text-ds-texte-sur-marque">
              NB
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[11.5px] leading-[normal] font-bold text-ds-texte-fort">{t("appAccount")}</span>
              <span className="truncate text-[10px] leading-[normal] text-ds-texte-sourdine">nassim@laplanque.fr</span>
            </span>
            <ChevronDown size={13} className="text-ds-texte-tenu" />
          </span>
        </div>

        <div className="flex min-w-0 flex-col border-l border-ds-filet bg-ds-surface-page">
          <div className="flex items-center gap-3.5 border-b border-ds-filet px-[18px] py-[11px]">
            <span className="flex h-[34px] max-w-[320px] flex-1 items-center gap-[9px] rounded-ds-card border border-ds-filet bg-ds-surface-carte px-3">
              <Search size={14} strokeWidth={1.8} className="text-ds-texte-sourdine" />
              <span className="flex-1 text-[11.5px] leading-[normal] text-ds-texte-tenu">{t("appSearch")}</span>
              <span className="flex gap-[3px]">
                {["Ctrl", "K"].map((touche) => (
                  <span
                    key={touche}
                    className="rounded-[5px] border border-ds-filet bg-ds-surface-page px-[5px] py-[2px] text-[9.5px] leading-[normal] font-bold text-ds-texte-sourdine"
                  >
                    {touche}
                  </span>
                ))}
              </span>
            </span>
            <span className="flex-1" />
            <span className="relative flex text-ds-texte-sourdine">
              <Bell size={17} strokeWidth={1.8} />
              <span className="absolute -top-[3px] -right-1 grid h-3.5 w-3.5 place-items-center rounded-full bg-ds-erreur text-[8.5px] font-extrabold text-ds-texte-sur-marque">
                3
              </span>
            </span>
            <span className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-[999px] bg-ds-accent text-[10px] font-bold tracking-[-0.2px] text-ds-texte-sur-marque">
                NB
              </span>
              <span className="text-[11.5px] leading-[normal] font-semibold whitespace-nowrap text-ds-texte-fort">
                Nassim B.
              </span>
              <ChevronDown size={13} className="text-ds-texte-tenu" />
            </span>
          </div>

          <div className="flex min-w-0 flex-col gap-3.5 p-[18px]">
            <div className="flex items-end gap-3.5">
              <div className="min-w-0">
                <div className="text-[21px] leading-[1.1] font-extrabold tracking-[-0.04em] text-ds-texte-fort">
                  {t("appHello")}
                </div>
                {/* ⚠️ `leading-[1.55]`, PAS L'INTERLIGNE PAR DÉFAUT. Le kit rend
                    17,8 px ici — l'interligne de corps du design system — et sans
                    lui la ligne tombe à 14 : quatre pixels qui décalaient tout ce
                    qui suit dans la colonne, jusqu'à dix en bas de la fenêtre. */}
                <p className="mt-1 text-[11.5px] leading-[1.55] text-ds-texte-corps">{t("appHelloSub")}</p>
              </div>
              <span className="flex-1" />
              <span className="inline-flex h-8 items-center gap-2 rounded-ds-card border border-ds-filet bg-ds-surface-carte px-3 text-[11.5px] md:text-[11px] font-medium whitespace-nowrap text-ds-texte-fort">
                <CalendarDays size={13} className="text-ds-accent" />
                {t("appRange")}
              </span>
            </div>

            {/* `MetricTile` du design system, valeurs relevées dans le bundle : pastille
                de 48 au rayon pilule, écart 16, valeur 26/800 à l'interligne 1,1,
                libellé 13/400 à 1,35, et l'écart en TEXTE — le kit ne lui met pas de
                pilule. Remplissage 12, que la maquette impose à la place de 18/20. */}
            <div className="grid grid-cols-5 gap-[9px]">
              {TUILES.map(({ icone: Icone, valeur, cle, ecart, baisse, teinte }) => (
                <span
                  key={cle}
                  className="flex min-w-0 items-center gap-4 rounded-ds-card-lg border border-ds-filet bg-ds-surface-carte p-3 shadow-ds-card"
                >
                  <span className={"flex h-12 w-12 flex-none items-center justify-center rounded-ds-pill " + teinte}>
                    <Icone size={22} strokeWidth={1.9} />
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-[26px] leading-[1.1] font-extrabold tracking-[-0.04em] text-ds-texte-fort">
                      {valeur}
                    </span>
                    <span className="text-[13px] leading-[1.35] text-ds-texte-corps">{t(cle)}</span>
                    {/* ⚠️ `mt-0.5` EN PLUS DE L'ÉCART DE LA COLONNE. Le kit laisse
                        4 px entre le libellé et l'écart, et 2 seulement entre la
                        valeur et le libellé : un écart uniforme rendait la tuile
                        trois pixels trop courte. */}
                    <span className="mt-0.5 text-[12px] leading-[normal] whitespace-nowrap">
                      <strong
                        className={"font-bold " + (baisse === true ? "text-ds-erreur-encre" : "text-ds-succes-encre")}
                      >
                        {ecart}
                      </strong>
                    </span>
                  </span>
                </span>
              ))}
            </div>

            <div className="overflow-hidden rounded-ds-card-lg border border-ds-filet bg-ds-surface-carte leading-[normal] shadow-ds-card">
              <div className="flex items-center gap-3 px-4 pt-[13px] pb-[11px]">
                {/* Au gris de corps : le kit ne donne pas de couleur à ce titre, qui hérite
                    de la carte. */}
                <span className="text-[14px] font-bold tracking-[-0.02em] text-ds-texte-corps">{t("recentOrders")}</span>
                <span className="flex-1" />
                <span className="inline-flex items-center gap-[5px] text-[11.5px] font-semibold text-ds-accent">
                  {t("seeAll")}
                  <ArrowRight size={12} />
                </span>
              </div>
              <div
                className={
                  COLONNES + " border-t border-ds-filet py-[9px] text-[10px] font-bold tracking-[0.06em] text-ds-texte-tenu"
                }
              >
                <span />
                <span>{t("colNo")}</span>
                <span>{t("colClient")}</span>
                <span>{t("colStatus")}</span>
                <span className="text-right">{t("colDate")}</span>
              </div>
              {LIGNES.map(([reference, client, pays, statut, quand, teinte, apercu]) => (
                <div key={reference} className={COLONNES + " border-t border-ds-filet py-[9px]"}>
                  {/* ⚠️ LA PHOTO, PAS UN APLAT. La planche sert une vraie vignette
                      de produit ; j'avais mis un carré gris, et quatre carrés gris
                      dans un tableau ressemblent à une page qui n'a pas fini de
                      charger. `alt` vide : la maquette entière est `aria-hidden`. */}
                  <Image
                    src={APERCUS[apercu]}
                    alt=""
                    width={30}
                    height={30}
                    className="h-[30px] w-[30px] rounded-ds-sm border border-ds-filet object-cover"
                  />
                  <span className="text-[11.5px] font-bold whitespace-nowrap text-ds-texte-fort">{reference}</span>
                  <span className="flex min-w-0 items-center gap-[7px]">
                    <Image
                      src={DRAPEAUX[pays]}
                      alt=""
                      width={16}
                      height={11}
                      className="h-[11px] w-4 flex-none rounded-[2px] object-cover"
                    />
                    <span className="truncate text-[11.5px] text-ds-texte-fort">{client}</span>
                  </span>
                  <span>
                    <span
                      className={
                        "inline-flex items-center gap-1.5 rounded-ds-pill px-2 py-1 text-[10px] font-bold tracking-[-0.02em] whitespace-nowrap " +
                        teinte
                      }
                    >
                      {t(statut)}
                    </span>
                  </span>
                  <span className="text-right text-[10.5px] whitespace-nowrap text-ds-texte-sourdine">{t(quand)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
