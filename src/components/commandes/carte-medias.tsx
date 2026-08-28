"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Icone } from "@/components/icone";
import {
  definirCouverture,
  demanderDepot,
  demanderDepotCouverture,
  demanderDepotVignette,
  ordonnerMedias,
  retirerMedia,
  validerDepot,
} from "@/lib/commandes/actions-medias";
import { apercuDepuisVideo, couvertureDepuisImage, vignetteDepuisImage } from "@/lib/medias/vignette";
import { limites } from "@/lib/storage/limites";
import { creerSuiviDeCouverture } from "@/lib/commandes/suivi-couverture";

/**
 * La carte des médias, porté sur le canevas Claude Design : zone de
 * dépôt pleine largeur, grille en dessous, compteur « n/N » dans l'en-tête.
 *
 * RIEN N'EST AFFICHÉ QUE LA BASE N'AIT ENREGISTRÉ. Une vignette apparaît quand
 * le serveur a confirmé l'écriture, jamais avant : un média fantôme — affiché
 * alors que le fichier n'existe pas — se découvre chez le destinataire, des
 * semaines plus tard. Pendant le dépôt, la case porte une barre de progression,
 * et elle porte l'échec si le dépôt échoue.
 */

export interface MediaAffiche {
  readonly id: string;
  readonly type: "photo" | "video";
  readonly urlVignette: string | null;
  readonly estCouverture: boolean;
  /**
   * Durée d'une vidéo, en secondes, ou `null`.
   *
   * `null` pour une photo, mais AUSSI pour une vidéo dont la durée n'a pas pu
   * être lue au dépôt — c'est un cas normal, pas une anomalie. La pastille est
   * alors omise : afficher « 0:00 » affirmerait une durée qu'on n'a pas mesurée.
   */
  readonly dureeS: number | null;
}

type EnCours = {
  readonly cleLocale: string;
  readonly nom: string;
  readonly progression: number;
  readonly echec: string | null;
};

export function CarteMedias({
  orderId,
  initiaux,
  plafondMedias,
  plafondVideos,
  typesAcceptes,
  onMedias,
}: {
  readonly orderId: string;
  readonly initiaux: readonly MediaAffiche[];
  readonly plafondMedias: number;
  readonly plafondVideos: number;
  readonly typesAcceptes: readonly string[];
  /**
   * Appelé à chaque changement de la liste.
   *
   * L'APERÇU « CE QUE VOIT LE CLIENT » EST EN DIRECT, et il doit l'être sur les
   * photos autant que sur les champs. Sans ce rappel, il montrerait les médias
   * du chargement de la page — donc mentirait dès le premier dépôt, à l'endroit
   * exact où il promet de dire la vérité.
   */
  readonly onMedias?: (medias: readonly MediaAffiche[]) => void;
}) {
  const t = useTranslations("medias");

  /**
   * Traduit un motif de refus.
   *
   * La liste est ÉNUMÉRÉE plutôt que passée telle quelle à la traduction : un
   * motif inconnu produirait sinon une clé brute à l'écran, et le vendeur lirait
   * « refus.trop_de_videos » au lieu d'une phrase. Un motif absent de la liste
   * est un défaut à corriger, pas un texte à afficher.
   */
  const libelleRefus = useCallback(
    (motif: string): string => {
      const CONNUS = [
        "type_non_accepte",
        "trop_lourd",
        "trop_de_medias",
        "trop_de_videos",
        "video_trop_longue",
        "saisie",
        "introuvable",
        "absent",
        "ecriture",
        "stockage",
        "session",
        "reseau",
      ] as const;
      return CONNUS.includes(motif as (typeof CONNUS)[number])
        ? t("refus." + motif)
        : t("refus.inconnu");
    },
    [t],
  );

  const [medias, setMedias] = useState<readonly MediaAffiche[]>(initiaux);
  const [enCours, setEnCours] = useState<readonly EnCours[]>([]);

  /*
   * LE RAPPEL PART D'UN EFFET, PAS DE CHAQUE `setMedias`.
   *
   * Il y a six endroits où la liste change — dépôt, couverture, suppression,
   * réordonnancement, et deux retours en arrière après échec. En appeler un
   * septième à la main dans chacun garantit qu'on en oubliera un, et l'oubli ne
   * casserait rien : l'aperçu afficherait simplement l'avant-dernier état, ce
   * que personne ne remarque avant que ça compte.
   */
  useEffect(() => {
    onMedias?.(medias);
  }, [medias, onMedias]);

  /**
   * Le nombre de médias CONFIRMÉS, tenu à jour à la main.
   *
   * ⚠️ DÉFAUT RÉEL, TROUVÉ À L'AUDIT DU 26/08/2026, ET IL SE VOYAIT CHEZ LE
   * CLIENT.
   *
   * `deposer` lisait `medias.length`, capturé à la construction du `useCallback`.
   * `ajouter` chaîne les fichiers d'un même lot sur UNE SEULE instance de
   * `deposer` : pour les huit fichiers d'une sélection, `medias.length` valait
   * donc `0`. `definirCouverture` était appelée huit fois, la DERNIÈRE gagnait
   * en base — pendant que l'écran, lui, évaluait `liste.length === 0` sur la
   * liste fraîche et encadrait la PREMIÈRE.
   *
   * Le vendeur envoyait son lien en croyant avoir mis en avant la photo 1 ; son
   * client voyait la photo 8. Rien ne cassait, rien n'apparaissait dans un
   * journal, et il ne pouvait s'en apercevoir qu'en rouvrant sa page publique.
   *
   * POURQUOI UNE RÉFÉRENCE ET NON L'ÉTAT : elle est exacte À L'INSTANT de la
   * lecture, alors qu'une valeur d'état est celle du rendu qui a créé la
   * fermeture. Elle est mise à jour à chaque mutation du nombre — ajout et
   * suppression — et le réordonnancement n'y touche pas, puisqu'il ne change
   * pas le compte.
   */
  const suiviCouverture = useRef(creerSuiviDeCouverture(initiaux.length));

  /**
   * Ce que la dernière action a échoué à faire, en clair.
   *
   * « Pari perdu → retour à l'état confirmé, ET ON LE DIT » : la première
   * moitié était tenue partout, la seconde nulle part. Le vendeur cliquait
   * « supprimer », la vignette restait, aucun message — il concluait que le
   * bouton était cassé, ou réessayait en croyant avoir supprimé.
   */
  const [echecAction, setEchecAction] = useState<string | null>(null);
  const [survol, setSurvol] = useState(false);
  const champFichier = useRef<HTMLInputElement>(null);
  const compteur = useRef(0);

  const capteurs = useSensors(
    // 8 px au pointeur : sans ce seuil, un simple clic produit un déplacement
    // d'un pixel, donc une écriture et un événement d'historique inutiles.
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    // 200 ms au toucher : sur mobile, sans délai, chaque tentative de défilement
    // dans la grille démarre un déplacement.
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    // Le clavier DÈS LE DÉPART, et non « plus tard » : un réordonnancement qui
    // n'existe qu'à la souris n'a jamais été rattrapé dans aucun produit.
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const majEnCours = useCallback(
    (cleLocale: string, modif: Partial<EnCours>): void => {
      setEnCours((liste) =>
        liste.map((e) => (e.cleLocale === cleLocale ? { ...e, ...modif } : e)),
      );
    },
    [],
  );

  /** Dépose UN fichier, de bout en bout. */
  const deposer = useCallback(
    async (fichier: File): Promise<void> => {
      compteur.current += 1;
      const cleLocale = String(compteur.current);
      setEnCours((liste) => [
        ...liste,
        { cleLocale, nom: fichier.name, progression: 0, echec: null },
      ]);

      const estVideo = fichier.type.startsWith("video/");

      // La vignette est produite AVANT de demander la signature : si le
      // navigateur ne sait pas décoder le fichier, autant le savoir maintenant.
      // Son échec n'est PAS bloquant — refuser un média parce qu'on n'a pas su
      // en faire une vignette ferait payer au vendeur une limite qui est la
      // nôtre.
      // Les deux chemins sont ramenés à LA MÊME FORME. Une union dont un membre
      // porte `dimensions` et l'autre non oblige chaque lecture à se demander
      // dans quelle branche elle se trouve — et c'est exactement le genre de
      // question qu'on finit par trancher de travers.
      const rendu: {
        vignette: { blob: Blob } | null;
        couverture: { blob: Blob } | null;
        dureeSecondes: number | null;
        dimensions: { largeur: number; hauteur: number } | null;
      } = estVideo
        ? { ...(await apercuDepuisVideo(fichier)), couverture: null, dimensions: null }
        : await vignetteDepuisImage(fichier).then(async (r) =>
            r === null
              ? { vignette: null, couverture: null, dureeSecondes: null, dimensions: null }
              : {
                  vignette: r.vignette,
                  /*
                   * LA COUVERTURE EST PRODUITE ICI, avec la vignette, et pas
                   * ailleurs : c'est le seul instant où le fichier est déjà
                   * décodé en mémoire. La fabriquer à la lecture ferait payer ce
                   * coût à CHAQUE consultation, pour toujours — et la page
                   * publique est vue en 4G sur un téléphone d'entrée de gamme.
                   *
                   * PAS POUR LES VIDÉOS : leur couverture serait l'image
                   * capturée, déjà servie comme vignette et comme poster. Une
                   * dérivée 900 px d'une capture vidéo coûterait du stockage
                   * pour un gain que personne ne verrait.
                   */
                  couverture: await couvertureDepuisImage(fichier, limites().couvertureOctets).then(
                    (c) => (c === null ? null : { blob: c.blob }),
                  ),
                  dureeSecondes: null,
                  dimensions: r.dimensions,
                },
          );

      const dimensions = rendu.dimensions;

      const preparation = await demanderDepot({
        orderId,
        typeMime: fichier.type,
        tailleAnnoncee: fichier.size,
        ...(rendu.dureeSecondes === null
          ? {}
          : { dureeSecondes: rendu.dureeSecondes }),
      });

      if (preparation.statut !== "ok") {
        const motif = "motif" in preparation ? preparation.motif : "inconnu";
        majEnCours(cleLocale, { echec: libelleRefus(motif) });
        return;
      }

      try {
        await envoyer(preparation.url, preparation.enTetes, fichier, (p) =>
          majEnCours(cleLocale, { progression: p }),
        );
      } catch {
        majEnCours(cleLocale, { echec: libelleRefus("reseau") });
        return;
      }

      // Les deux dérivées partent ensuite, et leur échec ne compromet pas le
      // média : la page publique retombe sur ce qu'elle a.
      for (const [derivee, demander] of [
        [rendu.vignette, demanderDepotVignette],
        [rendu.couverture, demanderDepotCouverture],
      ] as const) {
        if (derivee === null) continue;
        const signature = await demander({
          orderId,
          mediaId: preparation.mediaId,
          typeMime: fichier.type,
          tailleAnnoncee: derivee.blob.size,
        });
        if (signature.statut === "ok") {
          await envoyer(signature.url, signature.enTetes, derivee.blob, () => undefined).catch(
            () => undefined,
          );
        }
      }

      const confirmation = await validerDepot({
        orderId,
        mediaId: preparation.mediaId,
        typeMime: fichier.type,
        ...(dimensions === null
          ? {}
          : { largeur: dimensions.largeur, hauteur: dimensions.hauteur }),
        ...(rendu.dureeSecondes === null
          ? {}
          : { dureeSecondes: rendu.dureeSecondes }),
      });

      if (confirmation.statut !== "ok") {
        const motif = "motif" in confirmation ? confirmation.motif : "inconnu";
        majEnCours(cleLocale, { echec: libelleRefus(motif) });
        return;
      }

      // La ligne existe : on peut afficher. L'URL locale sert de vignette en
      // attendant le prochain rendu serveur — elle décrit le fichier que le
      // serveur vient d'accepter, pas un pari sur ce qu'il aurait accepté.
      // LE COMPTE EST LU AVANT L'AJOUT, et une seule fois : c'est ce qui rend
      // « le premier du lot » vrai pour un seul fichier, et non pour tous.
      const premier = suiviCouverture.current.ajouter();

      const apercu =
        rendu.vignette === null
          ? null
          : URL.createObjectURL(rendu.vignette.blob);
      setMedias((liste) => [
        ...liste,
        {
          id: confirmation.mediaId,
          type: estVideo ? "video" : "photo",
          urlVignette: apercu,
          // Rien n'est affirmé ici : la couverture n'est posée à l'écran
          // qu'APRÈS que la base l'a confirmée, quelques lignes plus bas.
          estCouverture: false,
          dureeS: rendu.dureeSecondes,
        },
      ]);
      setEnCours((liste) => liste.filter((e) => e.cleLocale !== cleLocale));

      if (premier) {
        // La première photo devient la couverture — mais l'écran ne le dit
        // qu'une fois la base d'accord. `definirCouverture` NE LÈVE PAS : elle
        // rend un statut. Le `.catch()` qui vivait ici ne pouvait donc rien
        // attraper, et l'échec était jeté en silence.
        const resultat = await definirCouverture(orderId, confirmation.mediaId);
        if (resultat.statut === "ok") {
          setMedias((liste) =>
            liste.map((m) => ({
              ...m,
              estCouverture: m.id === confirmation.mediaId,
            })),
          );
        } else {
          setEchecAction(t("echecCouverture"));
        }
      }
    },
    [orderId, libelleRefus, majEnCours, t],
  );

  const ajouter = useCallback(
    (fichiers: FileList | null): void => {
      if (fichiers === null) return;
      // En SÉRIE et non en parallèle : vingt dépôts simultanés sur une 4G
      // saturent le lien et font échouer les derniers, alors que la même
      // séquence passe.
      void [...fichiers].reduce(
        (chaine, f) => chaine.then(() => deposer(f)),
        Promise.resolve(),
      );
    },
    [deposer],
  );

  const supprimer = useCallback(
    async (id: string): Promise<void> => {
      const resultat = await retirerMedia(orderId, id);
      if (resultat.statut !== "ok") {
        setEchecAction(t("echecSuppression"));
        return;
      }
      setEchecAction(null);
      suiviCouverture.current.retirer();
      setMedias((liste) => liste.filter((m) => m.id !== id));
    },
    [orderId, t],
  );

  const couvrir = useCallback(
    async (id: string): Promise<void> => {
      const resultat = await definirCouverture(orderId, id);
      if (resultat.statut !== "ok") {
        setEchecAction(t("echecCouverture"));
        return;
      }
      setEchecAction(null);
      setMedias((liste) =>
        liste.map((m) => ({ ...m, estCouverture: m.id === id })),
      );
    },
    [orderId, t],
  );

  const deplacer = useCallback(
    async (evenement: DragEndEvent): Promise<void> => {
      const { active, over } = evenement;
      if (over === null || active.id === over.id) return;

      const avant = medias;
      const depuis = avant.findIndex((m) => m.id === active.id);
      const vers = avant.findIndex((m) => m.id === over.id);
      if (depuis < 0 || vers < 0) return;

      const apres = arrayMove([...avant], depuis, vers);
      setMedias(apres);

      const resultat = await ordonnerMedias(
        orderId,
        apres.map((m) => m.id),
      );

      // PARI PERDU : retour à l'état confirmé. Un réordonnancement optimiste
      // laissé à l'écran après un appel échoué est l'un des trois défauts qui
      // ont fait adopter la règle — il ne casse rien, n'apparaît nulle part, et
      // se manifeste chez le destinataire.
      if (resultat.statut !== "ok") {
        setMedias(avant);
        setEchecAction(t("echecOrdre"));
        return;
      }
      setEchecAction(null);
    },
    [medias, orderId, t],
  );

  const total = medias.length + enCours.length;
  const complet = total >= plafondMedias;
  const videos = medias.filter((m) => m.type === "video").length;

  return (
    <section className="carte rounded-lg p-[18px] lg:rounded-[18px] lg:p-[22px]">
      <div className="mb-3.5 flex items-center justify-between gap-3 lg:mb-4">
        <h2 className="font-headline-md text-[15px] font-bold tracking-[-0.015em] text-on-surface lg:text-[16px]">
          {t("titre")}
        </h2>
        {/* LE COMPTE DES VIDEOS N'EST DIT QU'AU BUREAU. La planche telephone
            ecrit « 7 sur 20 » et rien de plus : la ligne n'a pas la place, et
            c'est le plafond global qu'on approche en premier. */}
        <span className="shrink-0 font-body-sm text-[12px] text-sourdine">
          {t("compteur", { n: medias.length, max: plafondMedias })}
          <span className="hidden lg:inline">
            {" \u00b7 "}
            {t("videos", { n: videos, max: plafondVideos })}
          </span>
        </span>
      </div>

      {/* L'ECHEC EST DIT, ET IL EST DIT ICI — au-dessus de la grille, pas
          replie dans une case qui vient de disparaitre. `role="alert"` pour
          qu'un lecteur d'ecran l'annonce sans que l'utilisateur ait a le
          chercher : c'est le retour d'une action qu'il vient de declencher. */}
      {echecAction !== null && (
        <p
          role="alert"
          className="mb-3.5 rounded-[12px] border border-alerte-filet bg-alerte-fond-doux px-4 py-3.5 font-body-sm text-[13px] leading-5 text-alerte"
        >
          {echecAction}
        </p>
      )}

      <input
        ref={champFichier}
        type="file"
        multiple
        accept={typesAcceptes.join(",")}
        className="hidden"
        onChange={(e) => {
          ajouter(e.target.files);
          // Sans cette remise a zero, redeposer le MEME fichier ne declenche
          // aucun evenement : la valeur n'a pas change.
          e.target.value = "";
        }}
      />

      {/*
        LA ZONE DE DEPOT EST UNE CASE DE LA GRILLE, pas un grand rectangle
        au-dessus. C'est ce que dessinent les deux planches, et la raison se voit
        a vingt medias : un rectangle de depot de cent pixels de haut pose
        au-dessus de la grille repousse chaque photo d'autant, sur l'ecran ou le
        vendeur passe son temps. En case, il occupe la place d'une vignette.

        Le depot par glisser reste accepte sur TOUTE la grille, et pas seulement
        sur cette case : viser un carre de cent pixels avec un fichier au bout du
        curseur est un geste que personne ne reussit du premier coup.
      */}
      <DndContext
        sensors={capteurs}
        collisionDetection={closestCenter}
        onDragEnd={(e) => void deplacer(e)}
        accessibility={{
          announcements: {
            onDragStart: ({ active }) =>
              t("annonce.debut", { position: rang(medias, active.id) }),
            onDragOver: ({ active, over }) =>
              over === null
                ? t("annonce.horsZone")
                : t("annonce.survol", {
                    position: rang(medias, active.id),
                    cible: rang(medias, over.id),
                  }),
            onDragEnd: ({ over }) =>
              over === null
                ? t("annonce.annule")
                : t("annonce.depose", { cible: rang(medias, over.id) }),
            onDragCancel: () => t("annonce.annule"),
          },
        }}
      >
        <SortableContext items={medias.map((m) => m.id)} strategy={rectSortingStrategy}>
          <ul
            onDragOver={(e) => {
              e.preventDefault();
              setSurvol(true);
            }}
            onDragLeave={() => setSurvol(false)}
            onDrop={(e) => {
              e.preventDefault();
              setSurvol(false);
              ajouter(e.dataTransfer.files);
            }}
            className="grid grid-cols-3 gap-2 lg:grid-cols-6 lg:gap-[9px]"
          >
            {medias.map((media, index) => (
              <Case
                key={media.id}
                media={media}
                index={index}
                onSupprimer={() => void supprimer(media.id)}
                onCouvrir={() => void couvrir(media.id)}
              />
            ))}

            {enCours.map((e) => (
              <li
                key={e.cleLocale}
                className="flex aspect-square flex-col items-center justify-center gap-2 rounded-[11px] border border-outline-variant bg-surface-container-low p-2"
              >
                {e.echec === null ? (
                  <>
                    <Icone nom="upload" className="text-[20px] text-gris-inactif" />
                    <div
                      role="progressbar"
                      aria-valuenow={e.progression}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={t("enCours", { nom: e.nom })}
                      className="h-1.5 w-full overflow-hidden rounded-full bg-fond-barre"
                    >
                      <div
                        className="h-full rounded-full bg-violet transition-[width]"
                        style={{ width: e.progression + "%" }}
                      />
                    </div>
                    <span className="font-body-sm text-[11px] text-sourdine">
                      {e.progression} %
                    </span>
                  </>
                ) : (
                  <>
                    <Icone nom="error" className="text-[20px] text-alerte" />
                    {/* LE MOTIF ET LA TAILLE REELLE, TOUJOURS LES DEUX : sans la
                        taille, le vendeur ne sait pas de combien il s'est
                        trompe, donc ne sait pas quoi faire du fichier. */}
                    <p className="text-center font-body-sm text-[11px] leading-4 text-alerte">
                      {e.echec}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        setEnCours((liste) => liste.filter((x) => x.cleLocale !== e.cleLocale))
                      }
                      className="font-label-sm text-[11px] font-semibold text-alerte underline"
                    >
                      {t("ecarter")}
                    </button>
                  </>
                )}
              </li>
            ))}

            {complet ? null : (
              <li>
                <button
                  type="button"
                  onClick={() => champFichier.current?.click()}
                  aria-label={t("deposer")}
                  title={t("formats", { videos: plafondVideos })}
                  className={
                    "flex aspect-square w-full flex-col items-center justify-center gap-[5px] rounded-[11px] border border-dashed transition-colors " +
                    (survol
                      ? "border-violet bg-violet-fond"
                      : "border-filet-depot bg-surface-container-low hover:bg-fond-neutre")
                  }
                >
                  <Icone nom="add" className="text-[19px] text-gris-inactif" />
                  <span className="font-label-sm text-[10px] font-semibold text-sourdine">
                    {t("ajouter")}
                  </span>
                </button>
              </li>
            )}
          </ul>
        </SortableContext>
      </DndContext>

      {complet ? (
        <p className="mt-3.5 font-body-sm text-[12px] text-alerte">{t("plein")}</p>
      ) : null}

      {/* L'AIDE AU DEPLACEMENT, et elle ne dit pas la meme chose selon l'engin :
          au doigt, il faut MAINTENIR la poignee 200 ms avant que le deplacement
          demarre — sans quoi chaque effleurement de la grille pendant qu'on fait
          defiler la page deplacerait une photo. */}
      <div className="mt-3.5 hidden items-center gap-[9px] rounded-[11px] bg-surface-container-low px-[13px] py-[11px] lg:flex">
        <Icone nom="error" className="shrink-0 text-[15px] text-sourdine" />
        <span className="font-body-sm text-[12px] text-sourdine">{t("aideOrdre")}</span>
      </div>
      <p className="mt-3 font-body-sm text-[11px] leading-[17px] text-sourdine lg:hidden">
        {t("aideOrdreTelephone")}
      </p>
    </section>
  );
}

function rang(medias: readonly MediaAffiche[], id: string | number): number {
  return medias.findIndex((m) => m.id === id) + 1;
}

/**
 * Une case de la grille, portée sur `.vig` des deux planches.
 *
 * LA POIGNÉE DE DÉPLACEMENT EST EN HAUT À GAUCHE, SEULE DE SON CÔTÉ, et les
 * deux planches le dessinent ainsi. Ce n'est pas un choix graphique : sans cette
 * séparation, chaque tentative de clic sur « supprimer » démarre un déplacement
 * — surtout au doigt, où la cible fait quarante-quatre points et le geste n'est
 * jamais parfaitement immobile. C'est la décision 19 du brief, et la planche la
 * confirme en écartant les deux boutons aux coins opposés.
 *
 * LE CHOIX DE COUVERTURE N'APPARAÎT QU'AU SURVOL, et c'est un écart assumé : la
 * planche ne dessine que deux boutons par case. Le retirer aurait laissé la
 * couverture au seul ordre des vignettes, alors que la base porte un
 * `cover_media_id` explicite et que le vendeur peut vouloir mettre en avant une
 * photo qui n'est pas la première. Au repos, la case est celle de la planche.
 */
function Case({
  media,
  index,
  onSupprimer,
  onCouvrir,
}: {
  readonly media: MediaAffiche;
  readonly index: number;
  readonly onSupprimer: () => void;
  readonly onCouvrir: () => void;
}) {
  const t = useTranslations("medias");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: media.id,
  });

  // 24 px au bureau, 26 au téléphone : les deux planches ne posent pas la même
  // valeur, et au doigt deux pixels de plus se sentent.
  const coin =
    "absolute flex h-[26px] w-[26px] items-center justify-center rounded-[8px] bg-white/94 lg:h-6 lg:w-6 lg:rounded-[7px] lg:bg-white/92";

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={
        "group/case relative aspect-square overflow-hidden rounded-[11px] bg-fond-avatar " +
        (media.estCouverture ? "shadow-[0_0_0_2px_var(--color-violet)] " : "") +
        (isDragging ? "z-10 opacity-80 shadow-lg" : "")
      }
    >
      {media.urlVignette !== null ? (
        /* URL SIGNÉE À EXPIRATION : l'optimiseur de `next/image` la mettrait en
           cache au-delà de sa validité, et l'écran servirait ensuite des images
           mortes. La vignette fait 200 × 200 et pèse au plus 20 Ko — il n'y a
           rien à optimiser. */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={media.urlVignette}
          alt={t("apercu", { position: index + 1 })}
          width={200}
          height={200}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-gris-inactif">
          <Icone nom={media.type === "video" ? "play_arrow" : "image"} className="text-[24px]" />
        </span>
      )}

      {media.type === "video" ? (
        <>
          {media.urlVignette !== null ? (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-white drop-shadow-[0_1px_3px_rgba(14,14,19,0.6)]">
              <Icone nom="play_arrow" className="text-[24px]" titre={t("estUneVideo")} />
            </span>
          ) : null}

          {/* LA DURÉE N'EST ÉCRITE QUE SI ELLE A ÉTÉ MESURÉE. Une vidéo dont la
              capture a échoué n'a pas de durée connue, et « 0:00 » affirmerait
              une mesure qu'on n'a pas faite. */}
          {media.dureeS !== null ? (
            <span className="absolute right-[5px] bottom-[5px] rounded-[5px] bg-[rgba(14,14,19,0.72)] px-[6px] py-[2px] font-label-sm text-[9px] font-bold text-white lg:right-1.5 lg:bottom-1.5 lg:rounded-md lg:px-[7px] lg:text-[10px]">
              {duree(media.dureeS)}
            </span>
          ) : null}
        </>
      ) : null}

      {media.estCouverture ? (
        <span className="absolute bottom-[5px] left-[5px] rounded-full bg-violet px-[7px] py-[3px] font-label-sm text-[9px] font-bold text-white lg:bottom-1.5 lg:left-1.5 lg:px-2 lg:text-[10px]">
          {t("couverture")}
        </span>
      ) : (
        <button
          type="button"
          onClick={onCouvrir}
          className={
            coin +
            " bottom-[5px] left-[5px] text-ardoise opacity-0 transition-opacity group-hover/case:opacity-100 focus-visible:opacity-100 lg:bottom-1.5 lg:left-1.5"
          }
          title={t("definirCouverture")}
        >
          <Icone nom="check_circle" className="text-[13px]" titre={t("definirCouverture")} />
        </button>
      )}

      <button
        type="button"
        {...attributes}
        {...listeners}
        className={coin + " top-[5px] left-[5px] cursor-grab text-ardoise lg:top-1.5 lg:left-1.5"}
        title={t("deplacer", { position: index + 1 })}
      >
        <Icone
          nom="drag_indicator"
          className="text-[13px]"
          titre={t("deplacer", { position: index + 1 })}
        />
      </button>

      <button
        type="button"
        onClick={onSupprimer}
        className={coin + " top-[5px] right-[5px] text-alerte lg:top-1.5 lg:right-1.5"}
        title={t("supprimer")}
      >
        <Icone nom="close" className="text-[12px]" titre={t("supprimer")} />
      </button>
    </li>
  );
}

/** « 0:42 » — la forme de la planche. Les heures n'existent pas : le plafond
 *  produit est de soixante secondes par vidéo. */
function duree(secondes: number): string {
  const m = Math.floor(secondes / 60);
  const s = secondes % 60;
  return m + ":" + String(s).padStart(2, "0");
}

/**
 * Envoie un fichier par `PUT` signé, avec progression.
 *
 * `XMLHttpRequest` et non `fetch` : `fetch` ne rapporte pas la progression de
 * l'envoi. Une barre qui n'avance pas pendant une vidéo de vingt mégaoctets sur
 * une 4G se lit comme un blocage, et le vendeur relance — donc dépose deux fois.
 *
 * Les en-têtes fournis sont renvoyés TELS QUELS : ils font partie de la
 * signature. `content-length` n'y est pas posé par nous — le navigateur
 * l'interdit — mais il le calcule à partir du corps, ce qui rend la borne de
 * taille réelle plutôt que déclarative.
 */
function envoyer(
  url: string,
  enTetes: Record<string, string>,
  corps: Blob,
  surProgres: (pourcentage: number) => void,
): Promise<void> {
  return new Promise((resoudre, rejeter) => {
    const requete = new XMLHttpRequest();
    requete.open("PUT", url, true);

    for (const [nom, valeur] of Object.entries(enTetes)) {
      // `content-length` est un en-tête interdit à JavaScript : le navigateur le
      // pose lui-même. Tenter de l'écrire lève une exception dans certains
      // navigateurs et est ignoré dans d'autres.
      if (nom.toLowerCase() === "content-length") continue;
      requete.setRequestHeader(nom, valeur);
    }

    requete.upload.onprogress = (evenement) => {
      if (!evenement.lengthComputable) return;
      surProgres(Math.round((evenement.loaded / evenement.total) * 100));
    };

    requete.onload = () => {
      if (requete.status >= 200 && requete.status < 300) {
        surProgres(100);
        resoudre();
        return;
      }
      rejeter(new Error("dépôt refusé : " + requete.status));
    };
    requete.onerror = () => rejeter(new Error("réseau"));
    requete.send(corps);
  });
}
