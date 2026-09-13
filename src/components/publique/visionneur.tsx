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
 * plus que la grille, qui s'arrête à dix — mais elle ne vit QUE pendant que le
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
   * LA DÉRIVÉE 900 PX — le REPLI d'une tuile dont la vignette manque.
   *
   * Elle servait la pièce en grand de la planche du canevas, et le kit
   * `client_link` n'en dessine plus : sa grille est uniforme, et chaque tuile
   * prend la vignette. La dérivée ne sert donc plus qu'à ne pas laisser une case
   * vide quand la vignette n'existe pas — une image trop lourde bat une tuile
   * vide.
   */
  readonly urlCouverture?: string | null;
  readonly largeur: number | null;
  readonly hauteur: number | null;
}

/**
 * Combien de tuiles la grille rend, par largeur d'écran.
 *
 * ⚠️ LA PIÈCE EN GRAND A DISPARU AVEC LE KIT `client_link`, ET LE NOMBRE DE
 * TUILES AVEC ELLE. La planche du canevas posait la couverture à 900 px puis
 * sept tuiles ; le kit dessine une grille UNIFORME de carrés — cinq colonnes au
 * bureau, deux au téléphone. La couverture choisie par le vendeur reste la
 * PREMIÈRE tuile : l'appelant la place en tête.
 *
 * DIX AU BUREAU, SIX AU TÉLÉPHONE : deux rangées pleines de cinq, trois rangées
 * pleines de deux. Une rangée à moitié vide se lit comme un chargement
 * inachevé. Au-delà, la dernière tuile porte « +N » et ouvre le plein écran,
 * dont la pellicule montre tout.
 *
 * ⚠️ LES TUILES AU-DELÀ DE LA BORNE NE SONT PAS RENDUES, pas masquées : une
 * vignette masquée par CSS est tout de même téléchargée. Seules les tuiles 7 à
 * 10 existent au téléphone en `hidden`, et elles sont en `loading="lazy"` —
 * Chrome ne demande pas une image différée qui n'a pas de boîte.
 */
const TUILES_TELEPHONE = 6;
const TUILES_BUREAU = 10;

/** Au-delà de ce déplacement horizontal, un glissement du doigt change de média. */
const SEUIL_BALAYAGE_PX = 40;

/**
 * La pastille de lecture d'une vidéo, posée sur sa vignette — celle du kit :
 * un voile sombre sur la tuile, un disque blanc de 38 px, un triangle à l'encre.
 */
function PastilleLecture() {
  return (
    <span
      className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[rgba(11,11,24,.22)]"
      aria-hidden="true"
    >
      <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-white/[.92] text-ds-texte-fort">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="ml-0.5">
          <path d="M8 5v14l11-7z" />
        </svg>
      </span>
    </span>
  );
}

/**
 * CE QUI S'AFFICHE QUAND UN MÉDIA N'A PAS D'APERÇU.
 *
 * ⚠️ DÉFAUT MESURÉ LE 02/09/2026 : la page annonçait « 2 éléments » et ne
 * rendait AUCUNE image. La tuile était un carré vide, la couverture aussi. Le
 * client lit ça comme « c'est cassé », sur la seule page que le produit existe
 * pour montrer — et son vendeur, lui, voit une icône de repli dans son éditeur,
 * donc il ne peut même pas reproduire ce qu'on lui décrit.
 *
 * ET CE N'EST PAS UN ACCIDENT RARE : la vignette est produite dans le
 * NAVIGATEUR du vendeur, et son échec est délibérément non bloquant — refuser
 * un média parce qu'on n'a pas su en faire une vignette ferait payer au vendeur
 * une limite qui est la nôtre. `cle_vignette` nullable est donc, comme le brief
 * l'écrit, un cas NORMAL.
 *
 * ON N'INVENTE RIEN ET ON NE CACHE RIEN. Le média EXISTE : le compteur qui
 * l'annonce dit vrai, et le clic ouvre bien la photo en plein écran, signée à
 * l'ouverture. Seul son aperçu manque, et c'est exactement ce que ce repli dit.
 *
 * PAS DE REPLI SUR LA PHOTO PLEINE, malgré la tentation : elle pèse cent fois
 * la vignette, et surtout la mettre dans le document distribuerait une capacité
 * de plus à qui lit la source — c'est la règle que le visionneur applique
 * partout ailleurs.
 *
 * Le tracé est le même que celui de l'éditeur du vendeur : une image pour une
 * photo, un triangle de lecture pour une vidéo. Les deux écrans disent la même
 * chose du même média.
 *
 * CE QU'UNE TUILE DOIT MONTRER — la décision, séparée du rendu.
 *
 * Elle vit ici plutôt que dans le JSX pour une raison : c'est cette décision-là
 * qui était fausse, et le JSX d'un composant à état ne s'éprouve pas sans
 * navigateur. Sortie en fonction pure, elle s'interroge par l'EFFET, dans les
 * portes, à chaque commit.
 */
export function apercuDe(
  media: {
    readonly type: "photo" | "video";
    readonly urlVignette: string | null;
    readonly urlCouverture?: string | null;
  },
): { readonly url: string } | { readonly repli: "photo" | "video" } {
  /*
   * ⚠️ LA VIGNETTE D'ABORD, ET C'EST UN DÉFAUT PAYÉ. Mesuré au navigateur le
   * 03/09/2026 : chaque tuile de 197 px téléchargeait la dérivée 900 px, 77 à
   * 89 Ko, contre un PLAFOND DUR de 20 Ko par vignette. La fonction servait
   * alors aussi la pièce en grand, qui voulait l'inverse ; le kit l'a retirée,
   * et le paramètre de surface avec elle.
   */
  const url = media.urlVignette ?? media.urlCouverture;
  return url !== null && url !== undefined ? { url } : { repli: media.type };
}

function ApercuIndisponible({ video }: { readonly video: boolean }) {
  return (
    <span
      className="pointer-events-none absolute inset-0 flex items-center justify-center text-ds-texte-tenu"
      aria-hidden="true"
    >
      <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
        {video ? (
          <path d="M8 5v14l11-7z" />
        ) : (
          <path d="M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm1 13h12l-3.6-4.8-2.9 3.6-2-2.4L6 17zm2.5-6a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" />
        )}
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
  /** À quel média `url` et `echec` correspondent, pour les remettre à zéro quand il change. */
  const [mediaCharge, setMediaCharge] = useState<string | null>(null);

  const courant = index === null ? undefined : medias[index];
  const tuiles = medias.slice(0, TUILES_BUREAU);

  /*
   * ⚠️ LA REMISE À ZÉRO SE FAIT PENDANT LE RENDU, PLUS DANS L'EFFET.
   *
   * Elle vivait dans le corps de l'effet ci-dessous, et Next 16 l'a signalée :
   * un `setState` synchrone dans un effet fait PEINDRE l'écran intermédiaire
   * avant de re-rendre. Concrètement, en changeant de média, l'ancienne photo
   * restait visible une image de plus sous le nouveau titre — le défaut est
   * discret, mais c'est exactement celui qu'on prétend éviter en jetant l'URL.
   *
   * Le motif employé est celui que React documente pour ajuster un état quand
   * une propriété change : comparer à la valeur précédente GARDÉE EN ÉTAT (et
   * non dans une `ref`, qu'on n'a pas le droit de muter pendant un rendu), puis
   * corriger. React recalcule alors avant de peindre quoi que ce soit.
   */
  const idCourant = courant?.id ?? null;
  if (mediaCharge !== idCourant) {
    setMediaCharge(idCourant);
    setUrl(null);
    setEchec(false);
  }

  // L'URL pleine est demandée à CHAQUE ouverture, et jetée à la fermeture : une
  // URL signée a une durée de vie, la garder en mémoire ferait échouer une
  // réouverture tardive sans rien dire.
  useEffect(() => {
    if (courant === undefined) return;

    let abandonne = false;

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
        LA GALERIE DU KIT : une grille uniforme de carrés, au rayon de carte,
        chacun encadré d'un filet.

        CINQ COLONNES AU BUREAU, TROIS ENTRE 768 ET 1 023 PX, DEUX AU
        TÉLÉPHONE — les paliers du kit, ramenés aux familles de Tailwind. Deux
        colonnes au téléphone est aussi une règle du brief : sur une colonne
        pleine largeur, une vignette de 200 px serait agrandie de 80 % et floue.

        LA PREMIÈRE TUILE EST L'ÉLÉMENT LCP de la page, et elle n'est pas
        différée. Les autres le sont.
      */}
      {tuiles.length > 0 ? (
        <ul className="grid grid-cols-2 gap-2.5 md:grid-cols-3 md:gap-3.5 lg:grid-cols-5">
          {tuiles.map((media, rang) => {
            const resteTelephone = medias.length - TUILES_TELEPHONE;
            const resteBureau = medias.length - TUILES_BUREAU;
            const apercu = apercuDe(media);

            return (
              <li key={media.id} className={rang >= TUILES_TELEPHONE ? "hidden lg:block" : undefined}>
                <button
                  type="button"
                  onClick={() => ouvrirA(rang)}
                  className="relative block aspect-square w-full overflow-hidden rounded-ds-card border border-ds-filet bg-ds-surface-creux"
                  aria-label={libelles.ouvrir + " " + (rang + 1)}
                >
                  {"url" in apercu ? (
                    /* eslint-disable-next-line @next/next/no-img-element -- URL
                       signée à expiration : l'optimiseur la mettrait en cache
                       au-delà de sa validité et servirait des images mortes. */
                    <img
                      src={apercu.url}
                      alt=""
                      width={200}
                      height={200}
                      loading={rang === 0 ? undefined : "lazy"}
                      fetchPriority={rang === 0 ? "high" : undefined}
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ApercuIndisponible video={apercu.repli === "video"} />
                  )}
                  {media.type === "video" && "url" in apercu ? <PastilleLecture /> : null}

                  {rang === TUILES_TELEPHONE - 1 && resteTelephone > 0 ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-ds-surface-creux/90 text-[15px] font-extrabold text-ds-texte-corps lg:hidden">
                      {"+" + resteTelephone}
                    </span>
                  ) : null}
                  {rang === TUILES_BUREAU - 1 && resteBureau > 0 ? (
                    <span className="absolute inset-0 hidden items-center justify-center bg-ds-surface-creux/90 text-[16px] font-extrabold text-ds-texte-corps lg:flex">
                      {"+" + resteBureau}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
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
              className="text-[14px] font-bold tracking-[0.02em]"
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
              <p className="text-white">{libelles.indisponible}</p>
            ) : url === null ? (
              <p className="text-white">{libelles.chargement}</p>
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
              <span className="pointer-events-none absolute right-5 bottom-5 select-none text-[13px] font-bold tracking-[0.02em] text-white/40">
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
            <span className="text-[13px] text-white/50 lg:hidden">
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
                      /* ⚠️ `rounded-ds-sm` VAUT 16 DANS CE THÈME, la planche dit 8.
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
