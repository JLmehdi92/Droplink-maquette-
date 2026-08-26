"use client";

import { useCallback, useEffect, useState } from "react";

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
 * Les libellés arrivent en PROPRIÉTÉS : aucun catalogue de traduction n'est
 * expédié au navigateur pour cette page.
 */

export interface EntreeVisionneur {
  readonly id: string;
  readonly type: "photo" | "video";
  readonly urlVignette: string | null;
  readonly largeur: number | null;
  readonly hauteur: number | null;
}

/**
 * Combien de tuiles suivent la pièce en grand, par largeur d'écran.
 *
 * Six et huit AVEC la pièce en grand comprise : ce sont des lignes pleines de
 * trois et de quatre, et une ligne incomplète se lit comme un chargement qui
 * n'a pas fini.
 */
const TUILES_TELEPHONE = 5;
const TUILES_BUREAU = 7;

/** La pastille de lecture d'une vidéo, posée sur sa vignette. */
function PastilleLecture({ grande = false }: { readonly grande?: boolean }) {
  return (
    <span
      className={
        "pointer-events-none absolute inset-0 flex items-center justify-center text-on-surface-variant"
      }
      aria-hidden="true"
    >
      <svg
        width={grande ? 34 : 22}
        height={grande ? 34 : 22}
        viewBox="0 0 24 24"
        fill="currentColor"
      >
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

    const surTouche = (evenement: KeyboardEvent): void => {
      if (evenement.key === "Escape") fermer();
      if (evenement.key === "ArrowRight") aller(1);
      if (evenement.key === "ArrowLeft") aller(-1);
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
    };
  }, [index, fermer, aller]);

  return (
    <>
      {/* LE FILIGRANE. Superposition à L'AFFICHAGE, jamais gravée dans le
          fichier : graver exigerait de réencoder chaque photo au dépôt, donc de
          payer un transcodage sur le téléphone du vendeur pour un résultat
          qu'un recadrage retire de toute façon.

          IL NE PROTÈGE PAS, IL DÉCOURAGE. Trois clics dans l'inspecteur le font
          disparaître, et une capture d'écran le garde. C'est exactement ce que
          l'interface de réglage doit dire — annoncer une protection qu'on
          n'apporte pas serait pire que ne rien proposer.

          `pointer-events-none` : sans lui, la couche intercepterait le clic qui
          ouvre la photo. `select-none` évite qu'on le sélectionne comme du
          texte. Aucune police n'est chargée pour lui. */}
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

        Deux bornes, parce que la grille n'a pas la même largeur sur les deux
        écrans : six tuiles visibles au téléphone, huit sur grand écran. La
        pastille « +N » porte donc deux nombres, et chacun n'apparaît que sur
        l'écran qui le rend vrai.
      */}
      {premier !== undefined ? (
        <div>
          <button
            type="button"
            onClick={() => setIndex(0)}
            className="relative block aspect-[4/3] w-full overflow-hidden bg-surface-container-highest md:aspect-[16/10] md:rounded-lg"
            aria-label={libelles.ouvrir + " 1"}
          >
            {premier.urlVignette !== null ? (
              /* eslint-disable-next-line @next/next/no-img-element -- URL
                 signée à expiration : l'optimiseur la mettrait en cache
                 au-delà de sa validité et servirait des images mortes. */
              <img
                src={premier.urlVignette}
                alt=""
                width={200}
                height={200}
                decoding="async"
                className="h-full w-full object-cover"
              />
            ) : null}
            {premier.type === "video" ? <PastilleLecture grande /> : null}
            {filigrane !== null ? (
              <span className="pointer-events-none absolute right-3 bottom-3 select-none font-label-md text-label-md text-white drop-shadow">
                {filigrane}
              </span>
            ) : null}
          </button>

          {tuiles.length > 0 ? (
            <ul className="mt-[5px] grid grid-cols-3 gap-[5px] md:mt-2 md:grid-cols-4 md:gap-2">
              {tuiles.map((media, decalage) => {
                const rang = decalage + 1;
                const resteTelephone = medias.length - TUILES_TELEPHONE - 1;
                const resteBureau = medias.length - TUILES_BUREAU - 1;

                return (
                  <li
                    key={media.id}
                    className={rang > TUILES_TELEPHONE ? "hidden md:block" : undefined}
                  >
                    <button
                      type="button"
                      onClick={() => setIndex(rang)}
                      className="relative block aspect-square w-full overflow-hidden bg-surface-container-highest md:rounded"
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
                        <span className="absolute inset-0 flex items-center justify-center bg-surface-container-highest/90 font-headline-md text-[15px] font-extrabold text-on-surface-variant md:hidden">
                          {"+" + resteTelephone}
                        </span>
                      ) : null}
                      {rang === TUILES_BUREAU && resteBureau > 0 ? (
                        <span className="absolute inset-0 hidden items-center justify-center bg-surface-container-highest/90 font-headline-md text-[16px] font-extrabold text-on-surface-variant md:flex">
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
          <div className="flex items-center justify-between p-3.5 text-white">
            <button
              type="button"
              onClick={fermer}
              autoFocus
              aria-label={libelles.fermer}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10"
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
            <span className="font-label-md text-label-md">
              {libelles.position
                .replace("{n}", String((index ?? 0) + 1))
                .replace("{total}", String(medias.length))}
            </span>
            <span className="w-11" />
          </div>

          <div className="relative flex flex-1 items-center justify-center overflow-hidden p-4">
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
                className="max-h-full max-w-full"
              />
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element -- même
                 raison : URL signée à expiration. */
              <img
                src={url}
                alt=""
                width={courant.largeur ?? undefined}
                height={courant.hauteur ?? undefined}
                className="max-h-full max-w-full object-contain"
              />
            )}

            {filigrane !== null && url !== null && !echec ? (
              <span className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 select-none rounded bg-black/45 px-3 py-1 font-label-md text-label-md text-white">
                {filigrane}
              </span>
            ) : null}
          </div>

          <div className="flex items-center justify-between p-3.5 text-white">
            <button
              type="button"
              onClick={() => aller(-1)}
              disabled={index === 0}
              aria-label={libelles.precedent}
              className="flex h-13 w-13 items-center justify-center rounded-full bg-white/10 disabled:opacity-30"
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
            <button
              type="button"
              onClick={() => aller(1)}
              disabled={index === medias.length - 1}
              aria-label={libelles.suivant}
              className="flex h-13 w-13 items-center justify-center rounded-full bg-white/10 disabled:opacity-30"
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
        </div>
      ) : null}
    </>
  );
}
