"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowUpRight, Monitor, Smartphone, type LucideIcon } from "lucide-react";
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
 * LA REFONTE (02/10/2026) le pose dans le téléphone de `commande.html` (`.telephone--fiche`),
 * avec la mention « en direct ». La maquette ne garde que le téléphone ; la bascule
 * Desktop reste, parce que c'est une fonction du produit (l'aperçu desktop), et la
 * maquette de « Ma marque » dessine la même. Les dimensions du cadre sont MESURÉES sur
 * l'écran du téléphone : c'est la feuille qui les décide, plus des constantes d'ici.
 *
 * ⚠️ PAS DE `sandbox`, ET C'EST UNE DÉCISION. La page cadrée est la nôtre, sur notre
 * origine : elle a besoin de ses scripts et de son origine pour hydrater ses îlots,
 * et `allow-scripts` + `allow-same-origin` réunis ne forment plus une frontière — le
 * document pourrait retirer son propre bac à sable. Poser l'attribut aurait affiché
 * une protection qui n'en est pas une (L-029). Ce qui protège le client est ailleurs,
 * et vérifiable : ses deux gestes d'écriture sont inertes dans l'aperçu.
 */

type Mode = "mobile" | "desktop";

/** Un document chargé dans un cadre : l'adresse demandée, et la version qu'elle montrait. */
interface Chargement {
  readonly version: number;
  readonly source: string;
}

const cle = (charge: Chargement): string => charge.source + ":" + String(charge.version);

const LARGEUR_PAGE: Readonly<Record<Mode, number>> = { mobile: 390, desktop: 1180 };

/**
 * Le rechargement attend un temps de repos : une rafale de sauvegardes (six champs
 * saisis à la suite) ne recharge la page qu'une fois, sur la dernière version.
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
  readonly jeton: string;
  readonly versPageClient: string;
  /** Avance à chaque écriture CONFIRMÉE par la base : l'aperçu se recharge sur elle. */
  readonly version: number;
}) {
  const t = useTranslations("editeur");
  const [mode, setMode] = useState<Mode>("mobile");

  // L'écran (téléphone ou fenêtre desktop) est mesuré : la page y est posée à
  // l'échelle exacte de sa largeur, sur toute sa hauteur.
  const ecran = useRef<HTMLDivElement>(null);
  const [taille, setTaille] = useState<{ readonly l: number; readonly h: number } | null>(null);
  useLayoutEffect(() => {
    const element = ecran.current;
    if (element === null) return;
    const mesurer = (): void =>
      setTaille((a) =>
        a !== null && a.l === element.clientWidth && a.h === element.clientHeight
          ? a
          : { l: element.clientWidth, h: element.clientHeight },
      );
    mesurer();
    const observateur = new ResizeObserver(mesurer);
    observateur.observe(element);
    return () => observateur.disconnect();
  }, [mode]);

  /*
   * DEUX CADRES LE TEMPS D'UN RECHARGEMENT. Le nouveau se charge invisible derrière
   * l'ancien, qui reste affiché ; il ne prend sa place qu'une fois chargé, au même
   * défilement. Recharger le seul cadre faisait clignoter une page blanche à chaque
   * champ enregistré.
   *
   * ⚠️ L'ADRESSE SUIT LE JETON COURANT : après une révocation, l'ancien jeton ne
   * répond plus, et un aperçu qui le garderait montrerait une page introuvable.
   */
  const source = cheminApercuPageClient(jeton);
  const [affichee, setAffichee] = useState<Chargement>({ version, source });
  const [enChargement, setEnChargement] = useState<Chargement | null>(null);

  useEffect(() => {
    if (version === affichee.version && source === affichee.source) return;
    const minuterie = window.setTimeout(() => setEnChargement({ version, source }), DELAI_RECHARGE_MS);
    return () => window.clearTimeout(minuterie);
  }, [version, source, affichee]);

  const surChargement = (charge: Chargement, cadre: HTMLIFrameElement): void => {
    if (enChargement === null || cle(charge) !== cle(enChargement)) return;
    const ancien = Array.from(cadre.parentElement?.querySelectorAll("iframe") ?? []).find(
      (autre) => autre !== cadre,
    );
    cadre.contentWindow?.scrollTo(0, defilementDe(ancien));
    setAffichee(charge);
    setEnChargement(null);
  };

  const largeurPage = LARGEUR_PAGE[mode];
  const echelle = taille === null || taille.l === 0 ? null : taille.l / largeurPage;
  const charges = enChargement === null ? [affichee] : [affichee, enChargement];

  const lesCadres =
    echelle === null || taille === null
      ? null
      : charges.map((charge) => (
          <iframe
            // La CLÉ porte le mode : basculer recrée le cadre, dont le défilement n'a
            // plus de sens — la largeur de la page n'est plus la même.
            key={mode + ":" + cle(charge)}
            src={charge.source}
            title={mode === "mobile" ? t("apercuCadreMobile") : t("apercuCadreDesktop")}
            // HORS DE L'ORDRE DE TABULATION (26/09/2026) : sans lui, Tab traversait tous
            // les liens de la page encadrée avant de revenir à l'éditeur.
            tabIndex={-1}
            onLoad={(evenement) => surChargement(charge, evenement.currentTarget)}
            className={
              "ed-apercu__cadre" +
              (enChargement !== null && cle(charge) === cle(enChargement) ? " est-en-chargement" : "")
            }
            style={{
              width: largeurPage,
              height: Math.ceil(taille.h / echelle),
              transform: `scale(${echelle})`,
            }}
          />
        ));

  return (
    <section className="bloc ed-carte ed-carte--apercu" aria-labelledby="ed-apercu">
      <header className="ed-carte__tete">
        <h2 id="ed-apercu">{t("apercuTitre")}</h2>
        <p className="direct">
          <i aria-hidden="true" />
          {t("apercuDirect")}
        </p>
      </header>
      <div className="apercu-format" role="group" aria-label={t("apercuFormat")}>
        {MODES.map(({ mode: valeur, icone: Icone }) => (
          <button key={valeur} type="button" aria-pressed={mode === valeur} onClick={() => setMode(valeur)}>
            <Icone aria-hidden="true" className="ic" />
            {valeur === "mobile" ? t("apercuMobile") : t("apercuDesktop")}
          </button>
        ))}
        <a href={versPageClient} target="_blank" rel="noopener noreferrer" className="apercu-format__lien">
          <ArrowUpRight aria-hidden="true" className="ic" />
          <span className="sr">{t("voirPage")}</span>
        </a>
      </div>
      <div className="ed-apercu">
        {mode === "mobile" ? (
          <div className="telephone telephone--fiche">
            <div ref={ecran} className="telephone__ecran">
              {lesCadres}
            </div>
          </div>
        ) : (
          <div ref={ecran} className="ed-apercu__bureau">
            {lesCadres}
          </div>
        )}
      </div>
    </section>
  );
}

/** Le défilement d'un cadre de même origine ; 0 s'il est illisible. */
function defilementDe(cadre: HTMLIFrameElement | undefined): number {
  if (cadre === undefined) return 0;
  try {
    return cadre.contentWindow?.scrollY ?? 0;
  } catch {
    return 0;
  }
}
