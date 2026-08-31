"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * LE VISIONNEUR PLEIN ÉCRAN, ÉCRIT À LA MAIN.
 *
 * Une bibliothèque de carrousel pèse 40 à 90 Ko. Le budget de cette page est de
 * 300 Ko hors médias, dont ~102 Ko de socle incompressible : une bibliothèque
 * consommerait la moitié de ce qui reste, pour afficher une image en grand.
 *
 * DEUX PROPRIÉTÉS QUI COMPTENT PLUS QUE LE POIDS :
 *
 *  1. LA PHOTO PLEINE N'EST PAS DANS LE DOCUMENT tant que le visionneur est
 *     fermé. Une balise `img` masquée par `display:none` est TOUT DE MÊME
 *     téléchargée — c'est la façon la plus courante de croire qu'on a différé un
 *     chargement sans l'avoir fait. Ici il n'y a pas de balise du tout : elle est
 *     créée à l'ouverture.
 *  2. L'URL PLEINE EST DEMANDÉE AU SERVEUR À L'OUVERTURE, et non rendue avec la
 *     page. Vingt URL signées dans le document, c'est vingt capacités
 *     distribuées à qui lit la source, pour une seule qui sera regardée.
 *
 * LA PELLICULE OBÉIT À LA MÊME RÈGLE. Elle rend une vignette par média — donc
 * plus que la grille, qui s'arrête à sept — mais elle ne vit QUE pendant que le
 * visionneur est ouvert, et ses vignettes sont en `loading="lazy"` : celles qui
 * sont hors du champ ne sont pas demandées. Le coût est payé par qui regarde,
 * pas par qui ouvre le lien.
 *
 * Les libellés arrivent en PROPRIÉTÉS : aucun catalogue de traduction n'est
 * expédié au navigateur pour cette page.
 */

export interface EntreeVisionneur {
  readonly id: string;
  readonly type: "photo" | "video";
  readonly urlVignette: string | null;
  /**
   * LA DÉRIVÉE 900 PX, pour la seule image qui est rendue en grand.
   *
   * ⚠️ La couverture était servie par la VIGNETTE : 200 × 200 étirés en
   * 899 × 562, soit un agrandissement de 4,49× au bureau et 5,85× sur un
   * téléphone en DPR 3. Le plus gros élément de la page — celui que le client
   * vient voir — était flou, à l'endroit exact où le produit prétend montrer
   * un contrôle qualité.
   *
   * Nulle pour tout média déposé avant qu'elle existe, et pour les vidéos,
   * dont la vignette est une capture. La couverture retombe alors sur la
   * vignette : l'écran reste celui d'avant, il ne casse pas.
   */
  readonly urlCouverture?: string | null;
  readonly largeur: number | null;
  readonly hauteur: number | null;
}

/**
 * Combien de tuiles suivent la pièce en grand, par largeur d'écran.
 *
 * ⚠️ LE TÉLÉPHONE EN PORTAIT CINQ, ET LA PLANCHE EN DESSINE SIX. Cinq tuiles
 * dans une grille de trois colonnes, c'est une rangée pleine et une rangée à
 * moitié vide — exactement ce qui se lit comme un chargement inachevé. Six
 * remplit deux rangées. Le bureau en montre sept sur quatre colonnes, et la
 * planche `PageClientDesktop` laisse délibérément la huitième case libre.
 */
const TUILES_TELEPHONE = 6;
const TUILES_BUREAU = 7;

/** Au-delà de ce déplacement horizontal, un glissement du doigt change de média. */
const SEUIL_BALAYAGE_PX = 40;

/** La pastille de lecture d'une vidéo, posée sur sa vignette. */
function PastilleLecture({ taille = 22 }: { readonly taille?: number }) {
  return (
    <span
      className="pointer-events-none absolute inset-0 flex items-center justify-center text-ardoise"
      aria-hidden="true"
    >
      <svg width={taille} height={taille} viewBox="0 0 24 24" fill="currentColor">
        <path d="M8 5v14l11-7z" />
      </svg>
    </span>
  );
}

export function Visionneur({
  jeton,
  medias,
  libelles,
  filigrane,
}: {
  readonly jeton: string;
  readonly medias: readonly EntreeVisionneur[];
  /**
   * Texte du filigrane, ou `null`. Le NON-FILIGRANE est `null` et pas la chaîne
   * vide : une chaîne vide produirait une bande transparente sans texte, donc un
   * filigrane invisible que personne ne saurait diagnostiquer. La décision
   * d'afficher est prise EN BASE — un filigrane demandé sans nom de boutique n'a
   * rien à écrire et arrive ici déjà éteint.
   */
  readonly filigrane: string | null;
  readonly libelles: {
    readonly ouvrir: string;
    readonly fermer: string;
    readonly precedent: string;
    readonly suivant: string;
    readonly chargement: string;
    readonly indisponible: string;
    readonly position: string;
    readonly balayez: string;
  };
}) {
  const [index, setIndex] = useState<number | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [echec, setEchec] = useState(false);

  const courant = index === null ? undefined : medias[index];
  const premier = medias[0];
  const tuiles = medias.slice(1, TUILES_BUREAU + 1);

  // L'URL pleine est demandée à CHAQUE ouverture, et jetée à la fermeture : une
  // URL signée a une durée de vie, la garder en mémoire ferait échouer une
  // réouverture tardive sans rien dire.
  useEffect(() => {
    if (courant === undefined) {
      setUrl(null);
      setEchec(false);
      return;
    }

    let abandonne = false;
    setUrl(null);
    setEchec(false);

    fetch("/p/" + encodeURIComponent(jeton) + "/media/" + encodeURIComponent(courant.id))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((corps: { url?: string }) => {
        if (abandonne) return;
        if (typeof corps.url !== "string") {
          setEchec(true);
          return;
        }
        setUrl(corps.url);
      })
      .catch(() => {
        if (!abandonne) setEchec(true);
      });

    return () => {
      abandonne = true;
    };
  }, [courant, jeton]);

  /**
   * D'OÙ L'ON VIENT — mémorisé À L'INSTANT DU CLIC, pas dans l'effet.
   *
   * ⚠️ DÉFAUT RÉEL, TROUVÉ LE 31/08/2026 PAR LE TEST QUI MANQUAIT.
   *
   * L'effet d'ouverture lisait `document.activeElement` pour savoir à qui
   * rendre le focus à la fermeture. C'était trop tard : React applique
   * `autoFocus` pendant le COMMIT, et un `useEffect` ne tourne qu'APRÈS. À cet
   * instant l'élément actif n'est plus la vignette cliquée — c'est déjà le
   * bouton « fermer » du dialogue.
   *
   * Le visionneur mémorisait donc, comme point de retour, un bouton qui
   * appartient au dialogue lui-même. À la fermeture ce bouton n'existe plus,
   * `isConnected` est faux, et le focus retombe sur `<body>` — exactement ce
   * que la correction prétendait avoir réparé. Rien ne le montrait : à l'écran
   * la fermeture est identique, et le coût ne se paie qu'au clavier.
   *
   * C'est la démonstration de ce que le brief répète : une correction posée
   * sans test ne prouve rien, et celle-ci était FAUSSE.
   */
  const declencheur = useRef<HTMLElement | null>(null);

  /**
   * Ouvre le plein écran sur `rang`, en retenant d'où l'on vient.
   *
   * Passer par un seul ouvreur plutôt que par cinq `setIndex(…)` dispersés :
   * un point d'ouverture oublié rendrait le focus à la mauvaise vignette, ou à
   * rien, sans qu'aucune porte ne s'en aperçoive.
   */
  const ouvrirA = useCallback((rang: number) => {
    declencheur.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setIndex(rang);
  }, []);

  const fermer = useCallback(() => setIndex(null), []);

  const aller = useCallback(
    (pas: number) => {
      setIndex((actuel) => {
        if (actuel === null) return null;
        const suivant = actuel + pas;
        if (suivant < 0 || suivant >= medias.length) return actuel;
        return suivant;
      });
    },
    [medias.length],
  );

  useEffect(() => {
    if (index === null) return;

    /*
     * ⚠️ LE FOCUS SORTAIT DERRIÈRE LA COUCHE PLEIN ÉCRAN.
     *
     * DÉFAUT RÉEL, TROUVÉ À L'AUDIT DU 31/08/2026. `role="dialog"` et
     * `aria-modal` étaient bien posés, Échap fermait, `autoFocus` amenait le
     * focus sur la fermeture — mais RIEN ne retenait la tabulation. Au clavier,
     * elle sortait du visionneur après la pellicule et parcourait la galerie,
     * l'arbitrage QC et le pied de page DERRIÈRE la couche opaque : le focus
     * devenait invisible, et le visiteur pilotait une page qu'il ne voyait plus.
     *
     * `aria-modal` masque le fond au lecteur d'écran ; il ne contraint PAS le
     * Tab. Les deux propriétés se ressemblent assez pour qu'on croie l'une
     * acquise en posant l'autre.
     *
     * ET LE FOCUS EST RENDU À SA VIGNETTE. Il retombait sur `<body>`, donc sur
     * une galerie de vingt médias il fallait tout retraverser pour rouvrir la
     * suivante — le genre de coût qu'on ne mesure jamais parce qu'on ne le paie
     * pas soi-même.
     */
    const focalisables = (): HTMLElement[] => {
      const boite = dialogue.current;
      if (boite === null) return [];
      return [
        ...boite.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), video[controls], [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((e) => e.offsetParent !== null || e === document.activeElement);
    };

    const surTouche = (evenement: KeyboardEvent): void => {
      if (evenement.key === "Escape") fermer();
      if (evenement.key === "ArrowRight") aller(1);
      if (evenement.key === "ArrowLeft") aller(-1);
      if (evenement.key !== "Tab") return;

      // LA BOUCLE EST FERMÉE À LA MAIN plutôt que par `inert` sur le fond : le
      // visionneur est monté DANS le flux de la page, et rendre inerte tout ce
      // qui l'entoure demanderait de connaître ses frères — c'est-à-dire de
      // savoir ce que la page publique contient, ce que cet îlot ne doit pas
      // avoir à savoir.
      const liste = focalisables();
      const premier = liste[0];
      const dernier = liste[liste.length - 1];
      if (premier === undefined || dernier === undefined) return;

      const actif = document.activeElement;
      if (evenement.shiftKey && (actif === premier || !liste.includes(actif as HTMLElement))) {
        evenement.preventDefault();
        dernier.focus();
      } else if (!evenement.shiftKey && actif === dernier) {
        evenement.preventDefault();
        premier.focus();
      }
    };
    window.addEventListener("keydown", surTouche);

    // Le fond ne défile pas pendant qu'on regarde une photo : sur mobile, un
    // défilement derrière une couche plein écran donne l'impression que la page
    // a sauté quand on ferme.
    const avant = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", surTouche);
      document.body.style.overflow = avant;
      // Rendu à la vignette d'où l'on vient, si elle est toujours là. La
      // référence a été prise AU CLIC : la lire ici reviendrait à lire le
      // bouton « fermer » que `autoFocus` vient de saisir.
      const retour = declencheur.current;
      if (retour !== null && retour.isConnected) retour.focus();
    };
  }, [index, fermer, aller]);

  /*
   * LE BALAYAGE, parce que la planche l'ANNONCE en toutes lettres.
   *
   * Écrire « Balayez pour changer de photo » sous une couche qui ne réagit pas
   * au doigt serait la pire sorte de texte : une promesse d'interface que
   * l'interface ne tient pas, et que personne ne signalera puisque le client ne
   * reviendra pas dire qu'il a essayé.
   *
   * Le départ est mémorisé dans une ref et non dans un état : un `setState` par
   * `touchmove` re-rendrait la couche plein écran à chaque pixel.
   */
  /** Le conteneur du plein écran, pour y borner la tabulation. */
  const dialogue = useRef<HTMLDivElement | null>(null);
  const departX = useRef<number | null>(null);

  const surDebutToucher = (e: React.TouchEvent): void => {
    departX.current = e.touches[0]?.clientX ?? null;
  };

  const surFinToucher = (e: React.TouchEvent): void => {
    const depart = departX.current;
    departX.current = null;
    const fin = e.changedTouches[0]?.clientX;
    if (depart === null || fin === undefined) return;
    const ecart = fin - depart;
    if (Math.abs(ecart) < SEUIL_BALAYAGE_PX) return;
    aller(ecart < 0 ? 1 : -1);
  };

  return (
    <>
      {/*
        LA GALERIE DU CANEVAS : une pièce en grand, puis les autres en tuiles.

        Ce n'est pas un choix d'esthétique. La première photo est celle que le
        vendeur a désignée comme couverture ; c'est elle que le client veut
        voir, et une grille uniforme la noie parmi les autres.

        LE NOMBRE DE TUILES EST BORNÉ, et les tuiles au-delà de la borne ne
        sont PAS RENDUES du tout — pas masquées. Une vignette masquée par CSS
        est tout de même téléchargée, et c'est la façon la plus courante de
        croire qu'on a différé un chargement sans l'avoir fait. À vingt médias,
        rendre toute la grille ferait treize requêtes que personne ne regarde.

        PLEINE LARGEUR ET SANS RAYON AU TÉLÉPHONE, encadrée sur grand écran :
        c'est ce que les deux planches dessinent. Sur 390 px, une marge de
        chaque côté coûterait un dixième de la surface de chaque photo.
      */}
      {premier !== undefined ? (
        <div>
          <button
            type="button"
            onClick={() => ouvrirA(0)}
            className="relative block aspect-[4/3] w-full overflow-hidden bg-fond-avatar lg:aspect-[16/10] lg:rounded-lg"
            aria-label={libelles.ouvrir + " 1"}
          >
            {(premier.urlCouverture ?? premier.urlVignette) !== null ? (
              /* eslint-disable-next-line @next/next/no-img-element -- URL
                 signée à expiration : l'optimiseur la mettrait en cache
                 au-delà de sa validité et servirait des images mortes. */
              <img
                src={premier.urlCouverture ?? (premier.urlVignette as string)}
                alt=""
                // Les dimensions déclarées SUIVENT la source réellement
                // servie. Annoncer 200 × 200 pour une image de 900 px ferait
                // réserver la mauvaise place et produirait le décalage que le
                // budget de cette page interdit (< 0,1).
                width={premier.urlCouverture != null ? 900 : 200}
                height={premier.urlCouverture != null ? 563 : 200}
                // LA COUVERTURE EST L'ÉLÉMENT LCP de la page. La différer la
                // ferait attendre le premier passage de mise en page, ce qui
                // est exactement ce qu'on cherche à éviter ici.
                fetchPriority="high"
                decoding="async"
                className="h-full w-full object-cover"
              />
            ) : null}
            {premier.type === "video" ? <PastilleLecture taille={34} /> : null}
            {filigrane !== null ? (
              <span className="pointer-events-none absolute right-3 bottom-3 select-none font-label-md text-label-md text-white drop-shadow">
                {filigrane}
              </span>
            ) : null}
          </button>

          {tuiles.length > 0 ? (
            <ul className="mt-[5px] grid grid-cols-3 gap-[5px] lg:mt-2 lg:grid-cols-4 lg:gap-2">
              {tuiles.map((media, decalage) => {
                const rang = decalage + 1;
                const resteTelephone = medias.length - TUILES_TELEPHONE - 1;
                const resteBureau = medias.length - TUILES_BUREAU - 1;

                return (
                  <li
                    key={media.id}
                    className={rang > TUILES_TELEPHONE ? "hidden lg:block" : undefined}
                  >
                    <button
                      type="button"
                      onClick={() => ouvrirA(rang)}
                      className="relative block aspect-square w-full overflow-hidden bg-fond-avatar lg:rounded"
                      aria-label={libelles.ouvrir + " " + (rang + 1)}
                    >
                      {media.urlVignette !== null ? (
                        /* eslint-disable-next-line @next/next/no-img-element --
                           même raison : URL signée à expiration, et une
                           vignette de 200 px n'a rien à optimiser. */
                        <img
                          src={media.urlVignette}
                          alt=""
                          width={200}
                          height={200}
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                      {media.type === "video" ? <PastilleLecture /> : null}

                      {rang === TUILES_TELEPHONE && resteTelephone > 0 ? (
                        <span className="absolute inset-0 flex items-center justify-center bg-surface-container-high/90 font-headline-md text-[15px] font-extrabold text-ardoise lg:hidden">
                          {"+" + resteTelephone}
                        </span>
                      ) : null}
                      {rang === TUILES_BUREAU && resteBureau > 0 ? (
                        <span className="absolute inset-0 hidden items-center justify-center bg-surface-container-high/90 font-headline-md text-[16px] font-extrabold text-ardoise lg:flex">
                          {"+" + resteBureau}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}

      {courant !== undefined ? (
        <div
          ref={dialogue}
          role="dialog"
          aria-modal="true"
          aria-label={libelles.position
            .replace("{n}", String((index ?? 0) + 1))
            .replace("{total}", String(medias.length))}
          className="fixed inset-0 z-50 flex flex-col bg-[#0a0a0d]"
          onClick={(e) => {
            if (e.target === e.currentTarget) fermer();
          }}
        >
          {/* La fermeture est à GAUCHE et ronde, le compteur au centre : le
              pouce d'une main qui tient le téléphone atteint le coin haut
              gauche, pas le coin haut droit. */}
          <div className="flex items-center justify-between px-3.5 pt-3.5 pb-2.5 text-white">
            <button
              type="button"
              onClick={fermer}
              autoFocus
              aria-label={libelles.fermer}
              className="flex h-[46px] w-[46px] items-center justify-center rounded-full bg-white/12"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
            {/* « 3 / 7 » : la planche écrit la position telle quelle. La forme
                lisible — « 3 sur 7 » — reste sur le dialogue lui-même, pour qui
                ne lit pas l'écran. */}
            <span
              aria-hidden="true"
              className="font-label-md text-[14px] font-bold tracking-[0.02em]"
            >
              {(index ?? 0) + 1} / {medias.length}
            </span>
            <span className="w-[46px]" />
          </div>

          {/*
            LA PHOTO PLEINE. La planche `Visionneur` lui donne un cadre 3/4, un
            rayon de 4 et 8 px de marge latérale — le rayon et la marge sont
            repris tels quels.

            LE CADRE 3/4 NE L'EST PAS, et c'est délibéré : sur la planche c'est
            un aplat gris, ici c'est une vraie photo. Imposer un portrait à une
            photo posée à plat ajouterait deux bandes noires et RÉDUIRAIT le
            sujet, sur l'écran dont le produit tout entier promet qu'on y voit
            l'article. `object-contain` dans l'espace disponible donne le même
            résultat que la planche pour une photo portrait, et un meilleur
            pour les autres.
          */}
          <div
            className="relative flex flex-1 items-center justify-center overflow-hidden px-2"
            onTouchStart={surDebutToucher}
            onTouchEnd={surFinToucher}
          >
            {echec ? (
              <p className="font-body-md text-body-md text-white">{libelles.indisponible}</p>
            ) : url === null ? (
              <p className="font-body-md text-body-md text-white">{libelles.chargement}</p>
            ) : courant.type === "video" ? (
              // `preload="none"` : la vidéo ne se télécharge qu'au moment où on
              // demande à la lire. Le poster est la vignette déjà en cache.
              <video
                src={url}
                poster={courant.urlVignette ?? undefined}
                controls
                preload="none"
                playsInline
                className="max-h-full max-w-full rounded-[4px]"
              />
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element -- même
                 raison : URL signée à expiration. */
              <img
                src={url}
                alt=""
                width={courant.largeur ?? undefined}
                height={courant.hauteur ?? undefined}
                className="max-h-full max-w-full rounded-[4px] object-contain"
              />
            )}

            {/* LE FILIGRANE. Superposition à L'AFFICHAGE, jamais gravée dans le
                fichier : graver exigerait de réencoder chaque photo au dépôt,
                donc de payer un transcodage sur le téléphone du vendeur pour un
                résultat qu'un recadrage retire de toute façon.

                IL NE PROTÈGE PAS, IL DÉCOURAGE. Trois clics dans l'inspecteur
                le font disparaître, et une capture d'écran le garde.

                `pointer-events-none` : sans lui, la couche intercepterait le
                balayage. Aucune police n'est chargée pour lui. */}
            {filigrane !== null && url !== null && !echec ? (
              <span className="pointer-events-none absolute right-5 bottom-5 select-none font-label-md text-[13px] font-bold tracking-[0.02em] text-white/40">
                {filigrane}
              </span>
            ) : null}
          </div>

          {/* NAVIGATION : cibles larges, pouce en bas d'écran. */}
          <div className="flex items-center justify-between px-3.5 pt-4 pb-2.5 text-white">
            <button
              type="button"
              onClick={() => aller(-1)}
              disabled={index === 0}
              aria-label={libelles.precedent}
              className="flex h-13 w-13 items-center justify-center rounded-full bg-white/12 disabled:opacity-30"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m15 6-6 6 6 6" />
              </svg>
            </button>
            <span className="font-body-sm text-[13px] text-white/50 lg:hidden">
              {libelles.balayez}
            </span>
            <button
              type="button"
              onClick={() => aller(1)}
              disabled={index === medias.length - 1}
              aria-label={libelles.suivant}
              className="flex h-13 w-13 items-center justify-center rounded-full bg-white/12 disabled:opacity-30"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m9 6 6 6-6 6" />
              </svg>
            </button>
          </div>

          {/*
            LA PELLICULE — on sait toujours combien il en reste et où l'on est.

            Elle manquait, et c'est la seule pièce du visionneur qui répond à
            « combien y en a-t-il encore » sans compter. La tuile courante porte
            un liseré ; les autres sont assombries, ce qui distingue la position
            sans ajouter un mot.
          */}
          {medias.length > 1 ? (
            <ul className="defilement-discret flex gap-1.5 overflow-x-auto px-3.5 pt-1.5 pb-[22px]">
              {medias.map((media, rang) => (
                <li key={media.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => ouvrirA(rang)}
                    aria-label={libelles.ouvrir + " " + (rang + 1)}
                    aria-current={rang === index ? "true" : undefined}
                    ref={
                      rang === index
                        ? (element) => {
                            element?.scrollIntoView({ block: "nearest", inline: "center" });
                          }
                        : undefined
                    }
                    className={
                      /* ⚠️ `rounded-lg` VAUT 16 DANS CE THÈME, la planche dit 8.
                         Un token de rayon NOMMÉ n'est pas une valeur de rayon :
                         c'est le même piège que les trois boutons de la liste
                         des commandes, qui portaient 28 pour 12. */
                      "relative block h-[52px] w-[52px] overflow-hidden rounded-[8px] bg-[#2a2730] " +
                      (rang === index ? "ring-2 ring-white" : "opacity-50")
                    }
                  >
                    {media.urlVignette !== null ? (
                      /* eslint-disable-next-line @next/next/no-img-element --
                         URL signée à expiration. */
                      <img
                        src={media.urlVignette}
                        alt=""
                        width={200}
                        height={200}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                    {media.type === "video" ? (
                      <span
                        className="pointer-events-none absolute inset-0 flex items-center justify-center text-white/70"
                        aria-hidden="true"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
