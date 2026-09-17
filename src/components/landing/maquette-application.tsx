import {
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
  type LucideIcon,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

/**
 * LA MAQUETTE D'APPLICATION DU HÉROS — `AppWindowMock` du kit `marketing_site`,
 * portée le 17/09/2026 sur décision de Wassim (« oui, comme le kit »).
 *
 * Elle montre l'espace vendeur tel qu'il est : les six entrées de navigation sont
 * celles du produit, et les deux écrans que la planche dessinait sans qu'ils
 * existent — Tableau de bord et Paramètres — ont été créés depuis le 14/09/2026.
 * C'était la moitié de l'argument qui la tenait dehors, et elle était périmée.
 *
 * ⚠️ CE QU'ELLE NE PORTE PAS, ET POURQUOI :
 *  - l'encart « Passez au Pro » du kit : la contrainte n° 1 interdit tout code de
 *    facturation en phase 1, affichage compris ;
 *  - les drapeaux de pays, que le kit va chercher chez `flagcdn.com` : notre CSP
 *    n'autorise les images que depuis notre domaine et R2, donc ils seraient
 *    BLOQUÉS en production — la sonde le verrait, et le client verrait un trou ;
 *  - les photos des commandes : le kit sert quatre fichiers de son dossier
 *    d'assets, que le dépôt n'emporte pas. Un aplat tient leur place.
 *
 * ⚠️ SES CHIFFRES SONT DES ILLUSTRATIONS, PAS DES MESURES. Ils décrivent l'écran,
 * pas notre activité : aucune promesse chiffrée n'est faite au visiteur, à la
 * différence de la preuve sociale du kit (« +2 500 vendeurs »), écartée le
 * 27/08/2026 par Wassim et toujours écartée.
 *
 * ELLE EST DÉCORATIVE : `aria-hidden`, aucun lien, aucun bouton — un lecteur
 * d'écran n'a rien à faire d'une capture dessinée, et aucune de ses zones ne
 * mène nulle part. Elle ne se rend qu'à partir de `lg` : sous ce palier, c'est le
 * téléphone de la section « ce que voit le client » qui montre le produit.
 */
const NAV: ReadonlyArray<readonly [LucideIcon, string, string | null]> = [
  [Home, "navAccueil", null],
  [Briefcase, "navCommandes", "124"],
  [Truck, "navEnvois", null],
  [BarChart3, "navAnalyses", null],
  [Shield, "navMarque", null],
  [Settings, "navParametres", null],
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
  { icone: Package, valeur: "156", cle: "kpiCreees", ecart: "+12%", teinte: "bg-ds-surface-teinte text-ds-accent" },
  { icone: Check, valeur: "78", cle: "kpiLivrees", ecart: "+20%", teinte: "bg-ds-succes-fond text-ds-succes-encre" },
  { icone: Truck, valeur: "42", cle: "kpiTransit", ecart: "+8%", teinte: "bg-ds-info-fond text-ds-info" },
  { icone: Link2, valeur: "342", cle: "kpiLiens", ecart: "+18%", teinte: "bg-ds-surface-teinte text-ds-accent" },
  { icone: Clock, valeur: "6,2j", cle: "kpiDelai", ecart: "-18%", baisse: true, teinte: "bg-ds-alerte-fond text-ds-alerte-encre" },
];

const LIGNES: ReadonlyArray<readonly [string, string, string, string, string]> = [
  ["#DLK7842", "Yanis B.", "statutTransit", "ilYA1", "bg-ds-info-fond text-ds-info"],
  ["#DLK7841", "Sofia M.", "statutLivraison", "ilYA3", "bg-ds-alerte-fond text-ds-alerte-encre"],
  ["#DLK7840", "Amine K.", "statutLivree", "ilYA5", "bg-ds-succes-fond text-ds-succes-encre"],
  ["#DLK7839", "Luca R.", "statutCommandee", "ilYA7", "bg-ds-surface-teinte text-ds-accent-encre"],
];

const COLONNES = "grid grid-cols-[34px_.8fr_1fr_.95fr_.7fr] items-center gap-2.5 px-4";

export async function MaquetteApplication() {
  const t = await getTranslations("landing.maquette");

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
          <span className="px-1.5 pb-4 text-[15px] leading-[21px] font-extrabold tracking-[-0.02em] text-ds-texte-titre">
            DropLink
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
              {compte !== null ? (
                <span className="rounded-ds-pill bg-ds-surface-creux px-1.5 text-[10.5px] font-bold text-ds-texte-sourdine">
                  {compte}
                </span>
              ) : null}
            </span>
          ))}
          <span className="flex-1" />
          <span className="mt-2.5 flex items-center gap-[9px] rounded-ds-card border border-ds-filet bg-ds-surface-carte p-[9px]">
            <span className="flex h-7 w-7 items-center justify-center rounded-[999px] bg-ds-accent text-[10px] font-bold tracking-[-0.2px] text-ds-texte-sur-marque">
              NB
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[11.5px] leading-[normal] font-bold text-ds-texte-fort">{t("compte")}</span>
              <span className="truncate text-[10px] leading-[normal] text-ds-texte-sourdine">nassim@laplanque.fr</span>
            </span>
            <ChevronDown size={13} className="text-ds-texte-tenu" />
          </span>
        </div>

        <div className="flex min-w-0 flex-col border-l border-ds-filet bg-ds-surface-page">
          <div className="flex items-center gap-3.5 border-b border-ds-filet px-[18px] py-[11px]">
            <span className="flex h-[34px] max-w-[320px] flex-1 items-center gap-[9px] rounded-ds-card border border-ds-filet bg-ds-surface-carte px-3">
              <Search size={14} strokeWidth={1.8} className="text-ds-texte-sourdine" />
              <span className="flex-1 text-[11.5px] text-ds-texte-tenu">{t("recherche")}</span>
              <span className="flex gap-[3px]">
                {["Ctrl", "K"].map((touche) => (
                  <span
                    key={touche}
                    className="rounded-[5px] border border-ds-filet bg-ds-surface-page px-[5px] py-[2px] text-[9.5px] font-bold text-ds-texte-sourdine"
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
                  {t("salut")}
                </div>
                <p className="mt-1 text-[11.5px] text-ds-texte-corps">{t("salutSous")}</p>
              </div>
              <span className="flex-1" />
              <span className="inline-flex h-8 items-center gap-2 rounded-ds-card border border-ds-filet bg-ds-surface-carte px-3 text-[11px] font-medium whitespace-nowrap text-ds-texte-fort">
                <CalendarDays size={13} className="text-ds-accent" />
                {t("periode")}
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
                    <strong
                      className={
                        "text-[12px] leading-[normal] font-bold " +
                        (baisse === true ? "text-ds-erreur-encre" : "text-ds-succes-encre")
                      }
                    >
                      {ecart}
                    </strong>
                  </span>
                </span>
              ))}
            </div>

            <div className="overflow-hidden rounded-ds-card-lg border border-ds-filet bg-ds-surface-carte shadow-ds-card">
              <div className="flex items-center gap-3 px-4 pt-[13px] pb-[11px]">
                <span className="text-[14px] font-bold tracking-[-0.02em] text-ds-texte-titre">{t("recentes")}</span>
                <span className="flex-1" />
                <span className="text-[11.5px] font-semibold text-ds-accent">{t("voirTout")}</span>
              </div>
              <div
                className={
                  COLONNES + " border-t border-ds-filet py-[9px] text-[10px] font-bold tracking-[0.06em] text-ds-texte-tenu"
                }
              >
                <span />
                <span>{t("colNumero")}</span>
                <span>{t("colClient")}</span>
                <span>{t("colStatut")}</span>
                <span className="text-right">{t("colDate")}</span>
              </div>
              {LIGNES.map(([reference, client, statut, quand, teinte]) => (
                <div key={reference} className={COLONNES + " border-t border-ds-filet py-[9px]"}>
                  <span className="h-[30px] w-[30px] rounded-ds-sm border border-ds-filet bg-ds-surface-creux" />
                  <span className="text-[11.5px] font-bold whitespace-nowrap text-ds-texte-fort">{reference}</span>
                  <span className="truncate text-[11.5px] text-ds-texte-fort">{client}</span>
                  <span>
                    <span className={"inline-flex rounded-ds-pill px-2 py-1 text-[10px] font-bold " + teinte}>
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
