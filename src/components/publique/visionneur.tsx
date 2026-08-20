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

export function Visionneur({
  jeton,
  medias,
  libelles,
}: {
  readonly jeton: string;
  readonly medias: readonly EntreeVisionneur[];
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
      {/* LA GRILLE. Deux colonnes sur mobile — sur une seule colonne pleine
          largeur, une vignette de 200 px serait agrandie de 80 % et floue. Les
          dimensions sont RÉSERVÉES avant chargement : sans elles, l'arrivée des
          images pousse le contenu et le décalage cumulé explose. */}
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {medias.map((media, rang) => (
          <li key={media.id}>
            <button
              type="button"
              onClick={() => setIndex(rang)}
              className="block aspect-square w-full overflow-hidden rounded-lg bg-surface-container-highest"
              aria-label={libelles.ouvrir + " " + (rang + 1)}
            >
              {media.urlVignette !== null ? (
                /* eslint-disable-next-line @next/next/no-img-element -- URL
                   signée à expiration : l'optimiseur la mettrait en cache
                   au-delà de sa validité et servirait des images mortes. Et
                   c'est une vignette de 200 px : il n'y a rien à optimiser. */
                <img
                  src={media.urlVignette}
                  alt=""
                  width={200}
                  height={200}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center font-label-sm text-label-sm text-on-surface-variant">
                  {rang + 1}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>

      {courant !== undefined ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={libelles.position
            .replace("{n}", String((index ?? 0) + 1))
            .replace("{total}", String(medias.length))}
          className="fixed inset-0 z-50 flex flex-col bg-black/95"
          onClick={(e) => {
            if (e.target === e.currentTarget) fermer();
          }}
        >
          <div className="flex items-center justify-between p-4 text-white">
            <span className="font-label-md text-label-md">
              {libelles.position
                .replace("{n}", String((index ?? 0) + 1))
                .replace("{total}", String(medias.length))}
            </span>
            <button
              type="button"
              onClick={fermer}
              autoFocus
              className="rounded-full px-4 py-2 font-label-md text-label-md"
            >
              {libelles.fermer}
            </button>
          </div>

          <div className="flex flex-1 items-center justify-center overflow-hidden p-4">
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
          </div>

          <div className="flex justify-between p-4 text-white">
            <button
              type="button"
              onClick={() => aller(-1)}
              disabled={index === 0}
              className="rounded-lg px-4 py-3 font-label-md text-label-md disabled:opacity-30"
            >
              {libelles.precedent}
            </button>
            <button
              type="button"
              onClick={() => aller(1)}
              disabled={index === medias.length - 1}
              className="rounded-lg px-4 py-3 font-label-md text-label-md disabled:opacity-30"
            >
              {libelles.suivant}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
