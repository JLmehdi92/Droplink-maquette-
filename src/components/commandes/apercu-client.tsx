"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ExternalLink, Monitor, Smartphone, type LucideIcon } from "lucide-react";
import { Panneau } from "@/components/app/panneau";
import { cheminApercuPageClient } from "@/lib/liens/page-client";

/**
 * « APERÇU DE LA PAGE CLIENT » — LA VRAIE PAGE, EN MOBILE OU EN DESKTOP.
 *
 * ⚠️ CE FUT UNE MAQUETTE JUSQU'AU 26/09/2026, ET WASSIM L'A VU EN UNE PHRASE :
 * « pourquoi l'aperçu n'est pas comme la vraie page client, c'est moche ». Elle
 * redessinait la page à l'échelle — trois vignettes, quatre barres, un bouton — au
 * motif que réutiliser les vrais composants ferait entrer le poids de la page dans
 * l'éditeur. C'était juste pour les COMPOSANTS, et faux pour la PAGE : un cadre ne
 * coûte rien à l'éditeur, puisque la page s'y charge dans son propre document. Et la
 * maquette ne pouvait que diverger — elle ne connaissait ni l'en-tête de boutique, ni
 * l'historique, ni la carte « Propulsé par DropLink ».
 *
 * La planche `OrderDetail` le dessinait déjà ainsi : « Live miniature of the REAL
 * client page, not a mock-up of it ». La bascule vient de `BrandPreview` (« Ma
 * marque ») : mêmes deux boutons, même téléphone de 300 px.
 *
 * CE QUI EST CHARGÉ : `/p/<jeton>/apercu` — `PageClient`, le composant de la page
 * publique, sans balise de vue et avec ses deux gestes d'écriture inertes. Voir
 * `app/p/[token]/apercu/page.tsx`.
 *
 * ⚠️ LA LARGEUR DU CADRE EST CELLE DE L'APPAREIL, JAMAIS CELLE DE LA COLONNE. La page
 * client choisit sa mise en page sur la largeur de SA fenêtre : cadrée à 520 px, elle
 * rendrait sa version tablette, qui n'est ni l'une ni l'autre. Le cadre est donc servi
 * à 390 ou 1 180 px — la largeur de référence du téléphone, et le conteneur du kit —,
 * puis RÉDUIT à l'affichage par `transform`, qui ne change pas la fenêtre de la page.
 *
 * ⚠️ PAS DE `sandbox`, ET C'EST UNE DÉCISION. La page cadrée est la nôtre, sur notre
 * origine : elle a besoin de ses scripts et de son origine pour hydrater ses îlots,
 * et `allow-scripts` + `allow-same-origin` réunis ne forment plus une frontière — le
 * document pourrait retirer son propre bac à sable. Poser l'attribut aurait affiché
 * une protection qui n'en est pas une (L-029). Ce qui protège le client est ailleurs,
 * et vérifiable : ses deux gestes d'écriture sont inertes dans l'aperçu.
 */

type Mode = "mobile" | "desktop";

/** La hauteur visible, identique dans les deux modes : basculer ne fait pas sauter la colonne. */
const HAUTEUR = 616;
/** Le téléphone de `BrandPreview` : 300 px, 8 de bord noir. */
const TELEPHONE = 300;
const BORD = 8;
/** 1 px de filet autour du cadre desktop, de chaque côté. */
const FILET = 1;
const LARGEUR_PAGE: Readonly<Record<Mode, number>> = { mobile: 390, desktop: 1180 };

/**
 * UN ENREGISTREMENT EN APPELLE SOUVENT UN AUTRE — un champ, puis le suivant. Recharger
 * à chaque réponse ferait tourner deux documents pour rien ; on attend que la saisie se
 * pose.
 */
const DELAI_RECHARGE_MS = 350;

const MODES: ReadonlyArray<{ readonly mode: Mode; readonly icone: LucideIcon }> = [
  { mode: "desktop", icone: Monitor },
  { mode: "mobile", icone: Smartphone },
];

export function ApercuClient({
  jeton,
  versPageClient,
  version,
}: {
  /** Le jeton COURANT : il change quand le vendeur révoque, et l'aperçu doit suivre. */
  readonly jeton: string;
  /** Vers la vraie page, pour l'action d'en-tête du kit. */
  readonly versPageClient: string;
  /**
   * Avance à chaque écriture CONFIRMÉE par la base — champ ou média. L'aperçu se
   * recharge alors : il montre ce que la base porte, pas ce qu'on vient de taper
   * (contrainte n° 8 — l'interface n'affirme pas ce qui n'est pas enregistré).
   */
  readonly version: number;
}) {
  const t = useTranslations("editeur");

  /*
   * MOBILE PAR DÉFAUT : c'est ce que le client ouvre, au téléphone, depuis un message
   * privé. Le desktop est à un clic.
   */
  const [mode, setMode] = useState<Mode>("mobile");

  /*
   * LA LARGEUR DE LA ZONE, MESURÉE AVANT LE PREMIER AFFICHAGE CÔTÉ NAVIGATEUR. Le
   * serveur ne la connaît pas : il rend le téléphone à sa largeur de planche, VIDE, et
   * le cadre ne naît qu'une fois la zone mesurée avec une largeur.
   *
   * ⚠️ C'EST AUSSI CE QUI EMPÊCHE LE TÉLÉPHONE DE LE CHARGER. L'éditeur cache ce panneau
   * sous `lg` (`hidden lg:block`), et le premier montage posait `loading="lazy"` en
   * croyant que ça suffisait. Mesuré au navigateur à 390 px le 26/09/2026 : DEUX
   * demandes de l'aperçu par ouverture de fiche — Chrome ne diffère PAS un cadre caché,
   * il le charge d'emblée. Une zone non affichée mesure 0 : pas de cadre, pas de rendu
   * serveur payé pour une page que personne ne regarde. L'observateur le fait naître si
   * la fenêtre s'élargit.
   */
  const zone = useRef<HTMLDivElement>(null);
  const [largeurZone, setLargeurZone] = useState<number | null>(null);
  useLayoutEffect(() => {
    const element = zone.current;
    if (element === null) return;
    const mesurer = (): void => setLargeurZone(element.clientWidth);
    mesurer();
    const observateur = new ResizeObserver(mesurer);
    observateur.observe(element);
    return () => observateur.disconnect();
  }, []);

  /*
   * DEUX CADRES LE TEMPS D'UN RECHARGEMENT. Le nouveau se charge SOUS l'ancien,
   * invisible ; il ne le remplace qu'une fois chargé, à la même hauteur de défilement.
   * Recharger le cadre visible le ferait blanchir à chaque champ enregistré, et le
   * remonterait en haut de page pendant que le vendeur regarde sa galerie.
   */
  const [affichee, setAffichee] = useState(version);
  const [enChargement, setEnChargement] = useState<number | null>(null);

  useEffect(() => {
    if (version === affichee) return;
    const minuterie = window.setTimeout(() => setEnChargement(version), DELAI_RECHARGE_MS);
    return () => window.clearTimeout(minuterie);
  }, [version, affichee]);

  const surChargement = (numero: number, cadre: HTMLIFrameElement): void => {
    if (numero !== enChargement) return;
    // L'ANCIEN CADRE EST L'AUTRE `iframe` DU MÊME CONTENEUR : il n'y en a jamais que deux,
    // et seulement le temps de ce chargement.
    const ancien = Array.from(cadre.parentElement?.querySelectorAll("iframe") ?? []).find(
      (autre) => autre !== cadre,
    );
    cadre.contentWindow?.scrollTo(0, defilementDe(ancien));
    setAffichee(numero);
    setEnChargement(null);
  };

  const largeurPage = LARGEUR_PAGE[mode];
  const cadreMobile = Math.min(TELEPHONE, largeurZone ?? TELEPHONE);
  const echelle =
    mode === "mobile"
      ? (cadreMobile - 2 * BORD) / largeurPage
      : ((largeurZone ?? 0) - 2 * FILET) / largeurPage;
  const hauteurVisible = mode === "mobile" ? HAUTEUR - 2 * BORD : HAUTEUR - 2 * FILET;
  // Plus large que son propre filet : en deçà, l'échelle du desktop serait nulle ou négative.
  const zoneAffichee = largeurZone !== null && largeurZone > 2 * FILET;

  const source = cheminApercuPageClient(jeton);
  const numeros = enChargement === null ? [affichee] : [affichee, enChargement];

  const lesCadres = !zoneAffichee
    ? null
    : numeros.map((numero) => (
        <iframe
          /* LE MODE ET LE JETON FONT PARTIE DE LA CLÉ : changer l'un ou l'autre charge un
             document neuf, sans rien à préserver — ni la largeur ni la page ne sont les
             mêmes. */
          key={mode + ":" + jeton + ":" + String(numero)}
          src={source}
          title={mode === "mobile" ? t("apercuCadreMobile") : t("apercuCadreDesktop")}
          onLoad={(evenement) => surChargement(numero, evenement.currentTarget)}
          className={
            "absolute top-0 left-0 block border-0 bg-ds-surface-carte " +
            (numero === enChargement ? "invisible" : "")
          }
          style={{
            width: largeurPage,
            height: Math.ceil(hauteurVisible / echelle),
            transform: `scale(${echelle})`,
            transformOrigin: "top left",
          }}
        />
      ));

  return (
    <Panneau
      titre={t("apercuTitre")}
      action={
        <div role="group" aria-label={t("apercuFormat")} className="flex items-center gap-2">
          {MODES.map(({ mode: valeur, icone: Icone }) => {
            const actif = mode === valeur;
            return (
              <button
                key={valeur}
                type="button"
                aria-pressed={actif}
                onClick={() => setMode(valeur)}
                className={
                  "inline-flex h-10 items-center gap-2 rounded-ds-sm border px-3.5 text-[13px] leading-[normal] transition-colors duration-160 ease-ds-standard focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent " +
                  (actif
                    ? "border-transparent bg-ds-accent font-bold text-ds-texte-sur-marque"
                    : "border-ds-filet bg-ds-surface-carte font-medium text-ds-texte-corps hover:text-ds-texte-fort")
                }
              >
                <Icone aria-hidden="true" size={16} strokeWidth={1.9} />
                {valeur === "mobile" ? t("apercuMobile") : t("apercuDesktop")}
              </button>
            );
          })}
          <a
            href={versPageClient}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 w-10 items-center justify-center rounded-ds-sm border border-ds-filet text-ds-accent transition-colors duration-160 ease-ds-standard hover:text-ds-accent-survol focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
          >
            <ExternalLink aria-hidden="true" size={16} strokeWidth={1.9} />
            <span className="sr-only">{t("voirPage")}</span>
          </a>
        </div>
      }
    >
      <div ref={zone} className="w-full">
        {mode === "mobile" ? (
          <div className="flex justify-center">
            <div
              className="rounded-[40px] bg-ds-ink-900 shadow-ds-window"
              style={{ width: cadreMobile, padding: BORD }}
            >
              <div
                className="relative overflow-hidden rounded-[33px] bg-ds-surface-carte"
                style={{ height: hauteurVisible }}
              >
                {lesCadres}
              </div>
            </div>
          </div>
        ) : (
          <div
            className="relative overflow-hidden rounded-ds-card border border-ds-filet bg-ds-surface-page"
            style={{ height: HAUTEUR }}
          >
            {lesCadres}
          </div>
        )}
      </div>
    </Panneau>
  );
}

/**
 * La hauteur de défilement d'un cadre, pour que le suivant reprenne au même endroit.
 *
 * ⚠️ LA LECTURE PEUT LEVER, et 0 est alors la bonne réponse. Le cadre est sur notre
 * origine ; il n'en sortirait que si un lien s'y ouvrait au lieu d'un nouvel onglet,
 * et le navigateur refuse alors de dire où en est une page étrangère. Repartir du haut
 * est exactement ce qu'un cadre neuf ferait de toute façon.
 */
function defilementDe(cadre: HTMLIFrameElement | undefined): number {
  if (cadre === undefined) return 0;
  try {
    return cadre.contentWindow?.scrollY ?? 0;
  } catch {
    return 0;
  }
}
