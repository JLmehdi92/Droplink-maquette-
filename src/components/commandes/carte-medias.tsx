"use client";

import { useCallback, useRef, useState } from "react";
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
}: {
  readonly orderId: string;
  readonly initiaux: readonly MediaAffiche[];
  readonly plafondMedias: number;
  readonly plafondVideos: number;
  readonly typesAcceptes: readonly string[];
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

  return (
    <section className="carte rounded-lg p-[22px]">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="font-label-md text-label-md tracking-wider text-on-surface uppercase">
          {t("titre")}
        </h2>
        <span className="rounded-full bg-[color-mix(in_srgb,var(--accent-interface)_12%,transparent)] px-2 py-1 font-label-sm text-label-sm text-[var(--accent-texte)]">
          {t("compteur", { n: medias.length, max: plafondMedias })}
        </span>
      </div>

      {/* L'ÉCHEC EST DIT, ET IL EST DIT ICI — au-dessus de la grille, pas
          replié dans une case qui vient de disparaître. `role="alert"` pour
          qu'un lecteur d'écran l'annonce sans que l'utilisateur ait à le
          chercher : c'est le retour d'une action qu'il vient de déclencher. */}
      {echecAction !== null && (
        <p
          role="alert"
          className="mb-4 rounded-md border border-attention-filet bg-attention-fond px-3 py-2 font-body-sm text-body-sm text-attention"
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
          // Sans cette remise à zéro, redéposer le MÊME fichier ne déclenche
          // aucun événement : la valeur n'a pas changé.
          e.target.value = "";
        }}
      />

      <button
        type="button"
        disabled={complet}
        onClick={() => champFichier.current?.click()}
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
        className={
          "flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 transition-colors disabled:cursor-not-allowed disabled:opacity-50 " +
          (survol
            ? "border-[var(--accent-interface)] bg-[color-mix(in_srgb,var(--accent-interface)_5%,transparent)]"
            : "border-outline-variant bg-surface-container-lowest hover:bg-surface-container-low")
        }
      >
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--accent-interface)_12%,transparent)] text-[var(--accent-texte)]">
          <Icone nom="add" className="text-[24px]" />
        </span>
        <span className="mb-1 font-label-md text-label-md text-on-surface">
          {complet ? t("plein") : t("deposer")}
        </span>
        <span className="font-body-sm text-body-sm text-on-surface-variant">
          {t("formats", { videos: plafondVideos })}
        </span>
      </button>

      {medias.length > 0 || enCours.length > 0 ? (
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
          <SortableContext
            items={medias.map((m) => m.id)}
            strategy={rectSortingStrategy}
          >
            <ul className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3">
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
                  className="flex aspect-square flex-col items-center justify-center gap-2 rounded-lg border border-outline-variant bg-surface-container-highest p-3"
                >
                  {e.echec === null ? (
                    <>
                      <Icone
                        nom="upload"
                        className="text-[24px] text-on-surface-variant"
                      />
                      <div
                        role="progressbar"
                        aria-valuenow={e.progression}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={t("enCours", { nom: e.nom })}
                        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container"
                      >
                        <div
                          className="h-full rounded-full bg-[var(--accent-remplissage)] transition-[width]"
                          style={{ width: e.progression + "%" }}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <Icone nom="error" className="text-[24px] text-error" />
                      <p className="text-center font-body-sm text-body-sm text-error">
                        {e.echec}
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          setEnCours((liste) =>
                            liste.filter((x) => x.cleLocale !== e.cleLocale),
                          )
                        }
                        className="font-label-sm text-label-sm text-on-surface-variant underline"
                      >
                        {t("ecarter")}
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      ) : null}
    </section>
  );
}

function rang(medias: readonly MediaAffiche[], id: string | number): number {
  return medias.findIndex((m) => m.id === id) + 1;
}

/**
 * Une case de la grille.
 *
 * LA POIGNÉE DE DÉPLACEMENT EST SÉPARÉE des boutons couverture et suppression.
 * Sans cette séparation, chaque tentative de clic sur l'un d'eux démarre un
 * déplacement — surtout au doigt, où la cible fait quarante-quatre points et le
 * geste n'est jamais parfaitement immobile.
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
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: media.id,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={
        "group relative aspect-square overflow-hidden rounded-lg border border-outline-variant bg-surface-container-highest " +
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
        <span className="flex h-full w-full items-center justify-center text-on-surface-variant">
          <Icone
            nom={media.type === "video" ? "photo_camera" : "image"}
            className="text-[28px]"
          />
        </span>
      )}

      {media.type === "video" ? (
        <span className="absolute top-2 left-2 rounded-full bg-black/60 p-1 text-white">
          <Icone
            nom="photo_camera"
            className="text-[14px]"
            titre={t("estUneVideo")}
          />
        </span>
      ) : null}

      {media.estCouverture ? (
        <span className="absolute bottom-2 left-2 rounded-full bg-[var(--accent-remplissage)] px-2 py-0.5 font-label-sm text-label-sm text-[var(--accent-sur-remplissage)]">
          {t("couverture")}
        </span>
      ) : null}

      <div className="absolute top-2 right-2 flex gap-1">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab rounded-md bg-surface-container-lowest p-1.5 text-on-surface-variant shadow-sm"
          title={t("deplacer", { position: index + 1 })}
        >
          <Icone
            nom="menu"
            className="text-[16px]"
            titre={t("deplacer", { position: index + 1 })}
          />
        </button>

        {!media.estCouverture ? (
          <button
            type="button"
            onClick={onCouvrir}
            className="rounded-md bg-surface-container-lowest p-1.5 text-on-surface-variant shadow-sm"
            title={t("definirCouverture")}
          >
            <Icone
              nom="check_circle"
              className="text-[16px]"
              titre={t("definirCouverture")}
            />
          </button>
        ) : null}

        <button
          type="button"
          onClick={onSupprimer}
          className="rounded-md bg-surface-container-lowest p-1.5 text-error shadow-sm"
          title={t("supprimer")}
        >
          <Icone nom="close" className="text-[16px]" titre={t("supprimer")} />
        </button>
      </div>
    </li>
  );
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
