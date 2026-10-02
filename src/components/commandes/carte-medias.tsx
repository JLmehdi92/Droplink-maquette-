"use client";

import { annoncer } from "@/components/app/annonce";
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
import { GripVertical, Image as ImageIcon, Play, Star, Trash2, TriangleAlert, Upload } from "lucide-react";
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
  onEnregistre,
}: {
  readonly orderId: string;
  readonly initiaux: readonly MediaAffiche[];
  readonly plafondMedias: number;
  readonly plafondVideos: number;
  readonly typesAcceptes: readonly string[];
  /**
   * Appelé après chaque écriture que la base a CONFIRMÉE : dépôt, couverture,
   * suppression, nouvel ordre.
   *
   * L'APERÇU DE LA PAGE CLIENT EST LA VRAIE PAGE, rechargée sur ce signal. Il
   * doit l'être sur les photos autant que sur les champs, sans quoi il montrerait
   * les médias du chargement de l'écran.
   *
   * ⚠️ CE RAPPEL PARTAIT D'UN EFFET SUR LA LISTE, ET IL NE LE PEUT PLUS (26/09/2026).
   * Le réordonnancement est OPTIMISTE : la liste change avant que la base ait
   * répondu. Tant que l'aperçu était une maquette dessinée depuis cette liste,
   * c'était juste ; il relit désormais la base, et un rechargement parti sur le
   * pari relirait l'ANCIEN ordre — puis plus rien ne le rechargerait. Le signal
   * part donc des cinq endroits où la base a dit oui, et d'aucun retour en arrière :
   * après un échec, la base porte ce que l'aperçu montre déjà.
   */
  readonly onEnregistre?: () => void;
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
        "cadence",
      ] as const;
      return CONNUS.includes(motif as (typeof CONNUS)[number])
        ? t("refus." + motif)
        : t("refus.inconnu");
    },
    [t],
  );

  const [medias, setMedias] = useState<readonly MediaAffiche[]>(initiaux);
  // Les médias déjà là à l'ouverture de la fiche n'entrent pas : seuls ceux qu'on
  // ajoute ensuite (maquette, `commande.js` : 420 ms, léger rebond).
  const [presents] = useState<ReadonlySet<string>>(() => new Set(initiaux.map((m) => m.id)));
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
  /*
   * LES APERÇUS LOCAUX (`blob:`) RETIENNENT LEUR FICHIER EN MÉMOIRE tant qu'on
   * ne les libère pas — et ils ne l'étaient jamais (audit ECC du 24/09/2026) :
   * vingt médias par commande, plusieurs commandes par session, jusqu'au
   * rechargement de l'onglet. Libérés au retrait du média, et au démontage.
   */
  const apercusLocaux = useRef(new Set<string>());
  useEffect(() => {
    const ensemble = apercusLocaux.current;
    return () => {
      for (const url of ensemble) URL.revokeObjectURL(url);
      ensemble.clear();
    };
  }, []);

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
          // La preuve que ce `mediaId` vient de `demanderDepot`. Sans elle,
          // l'identifiant serait libre et le stockage écrivable sans mesure.
          laissezPasser: preparation.laissezPasser,
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
      if (apercu !== null) apercusLocaux.current.add(apercu);
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
      onEnregistre?.();

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
          onEnregistre?.();
        } else {
          setEchecAction(t("echecCouverture"));
        }
      }
    },
    [orderId, libelleRefus, majEnCours, onEnregistre, t],
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
      setMedias((liste) => {
        const retire = liste.find((m) => m.id === id)?.urlVignette ?? null;
        if (retire !== null && apercusLocaux.current.delete(retire)) URL.revokeObjectURL(retire);
        return liste.filter((m) => m.id !== id);
      });
      annoncer(t("annonceSuppression"));
      onEnregistre?.();
    },
    [orderId, onEnregistre, t],
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
      annoncer(t("annonceCouverture"));
      onEnregistre?.();
    },
    [orderId, onEnregistre, t],
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
      onEnregistre?.();
    },
    [medias, onEnregistre, orderId, t],
  );

  const total = medias.length + enCours.length;
  const complet = total >= plafondMedias;
  const videos = medias.filter((m) => m.type === "video").length;

  return (
    <section className="bloc ed-carte ed-carte--medias" aria-labelledby="ed-medias">
      <header className="ed-carte__tete">
        <h2 id="ed-medias">{t("titre")}</h2>
        <p className="ed-compteur">
          {t.rich("compteur", { n: medias.length, max: plafondMedias, b: (c) => <b>{c}</b> })}
          <span className="ed-compteur__videos">
            {" \u00b7 "}
            {t("videos", { n: videos, max: plafondVideos })}
          </span>
        </p>
      </header>
      <div className="ed-medias">
        {/* L'ÉCHEC EST DIT ICI, au-dessus de la grille, pas replié dans une case qui
            vient de disparaître. `role="alert"` : c'est le retour d'un geste qu'on
            vient de faire. */}
        {echecAction === null ? null : (
          <p role="alert" className="ed-medias__echec">
            {echecAction}
          </p>
        )}

        {/*
          LA ZONE DE DÉPÔT DE LA MAQUETTE (`.ed-depot`) : un `<label>` autour du champ
          fichier, donc un clic ou Entrée l'ouvre sans script. Elle disparaît au plafond,
          qui se dit alors en toutes lettres. Le dépôt par glisser est AUSSI accepté sur
          la grille : viser un rectangle avec un fichier au bout du curseur ne réussit
          pas toujours du premier coup.
        */}
        {complet ? (
          <p className="ed-medias__plein">{t("plein")}</p>
        ) : (
          <label
            className={"ed-depot" + (survol ? " est-survolee" : "")}
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
          >
            <input
              type="file"
              multiple
              accept={typesAcceptes.join(",")}
              className="sr"
              onChange={(e) => {
                ajouter(e.target.files);
                // Sans cette remise à zéro, redéposer le MÊME fichier ne déclenche
                // aucun événement : la valeur n'a pas changé.
                e.target.value = "";
              }}
            />
            <span className="ed-depot__icone" aria-hidden="true">
              <Upload className="ic" />
            </span>
            <b>{t("deposer")}</b>
            <small>{t("formats", { videos: plafondVideos })}</small>
          </label>
        )}

        <DndContext
          sensors={capteurs}
          collisionDetection={closestCenter}
          onDragEnd={(e) => void deplacer(e)}
          accessibility={{
            announcements: {
              onDragStart: ({ active }) => t("annonce.debut", { position: rang(medias, active.id) }),
              onDragOver: ({ active, over }) =>
                over === null
                  ? t("annonce.horsZone")
                  : t("annonce.survol", {
                      position: rang(medias, active.id),
                      cible: rang(medias, over.id),
                    }),
              onDragEnd: ({ over }) =>
                over === null ? t("annonce.annule") : t("annonce.depose", { cible: rang(medias, over.id) }),
              onDragCancel: () => t("annonce.annule"),
            },
          }}
        >
          <SortableContext items={medias.map((m) => m.id)} strategy={rectSortingStrategy}>
            <ol
              className="ed-grille"
              aria-label={t("titre")}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes("Files")) e.preventDefault();
              }}
              onDrop={(e) => {
                if (e.dataTransfer.files.length === 0) return;
                e.preventDefault();
                ajouter(e.dataTransfer.files);
              }}
            >
              {medias.map((media, index) => (
                <Case
                  key={media.id}
                  media={media}
                  index={index}
                  nouvelle={!presents.has(media.id)}
                  onSupprimer={() => void supprimer(media.id)}
                  onCouvrir={() => void couvrir(media.id)}
                />
              ))}

              {enCours.map((e) => (
                <li key={e.cleLocale} className="ed-vignette ed-vignette--envoi">
                  {e.echec === null ? (
                    <>
                      <Upload aria-hidden="true" className="ic" />
                      <div
                        role="progressbar"
                        aria-valuenow={e.progression}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={t("enCours", { nom: e.nom })}
                        className="ed-vignette__barre"
                      >
                        <i style={{ width: e.progression + "%" }} />
                      </div>
                      <span className="ed-vignette__pourcent">{e.progression} %</span>
                    </>
                  ) : (
                    <>
                      <TriangleAlert aria-hidden="true" className="ic ed-vignette__alerte" />
                      {/* LE MOTIF ET LA TAILLE RÉELLE, TOUJOURS LES DEUX : sans la taille, le
                          vendeur ne sait pas de combien il s'est trompé. `role="alert"` :
                          pendant un dépôt en lot, il est ailleurs dans la page (WCAG 4.1.3). */}
                      <p role="alert" className="ed-vignette__refus">
                        {e.echec}
                      </p>
                      <button
                        type="button"
                        onClick={() => setEnCours((liste) => liste.filter((x) => x.cleLocale !== e.cleLocale))}
                        className="ed-lien"
                      >
                        {t("ecarter")}
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ol>
          </SortableContext>
        </DndContext>

        {/* L'AIDE AU DÉPLACEMENT, dès qu'il y a un ordre à changer — et elle ne dit pas
            la même chose au doigt : il faut y MAINTENIR la poignée avant que le
            déplacement démarre, sans quoi chaque défilement déplacerait une photo. */}
        {medias.length < 2 ? null : (
          <>
            <p className="ed-aide ed-aide--souris">{t("aideOrdre")}</p>
            <p className="ed-aide ed-aide--doigt">{t("aideOrdreTelephone")}</p>
          </>
        )}
      </div>
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
  nouvelle,
  onSupprimer,
  onCouvrir,
}: {
  readonly media: MediaAffiche;
  readonly index: number;
  /** Ajoutée depuis l'ouverture de la fiche : elle entre (maquette). */
  readonly nouvelle: boolean;
  readonly onSupprimer: () => void;
  readonly onCouvrir: () => void;
}) {
  const t = useTranslations("medias");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: media.id,
  });
  const caseLi = useRef<HTMLLIElement | null>(null);
  const entree = useRef(nouvelle);
  useEffect(() => {
    const li = caseLi.current;
    if (!entree.current || li === null || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    entree.current = false;
    li.animate(
      [
        { opacity: 0, transform: "translateY(-10px) scale(.92)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 420, easing: "cubic-bezier(.2,.9,.25,1.15)", fill: "backwards" },
    );
  }, []);

  return (
    <li
      ref={(el) => {
        setNodeRef(el);
        caseLi.current = el;
      }}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={
        "ed-vignette" + (media.estCouverture ? " est-couverture" : "") + (isDragging ? " est-saisie" : "")
      }
    >
      {media.urlVignette !== null ? (
        /* URL SIGNÉE À EXPIRATION : l'optimiseur de `next/image` la garderait en cache
           au-delà de sa validité. La vignette fait 200 × 200 : rien à optimiser. */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={media.urlVignette}
          alt={t("apercu", { position: index + 1 })}
          width={200}
          height={200}
          className="ed-vignette__photo"
          loading="lazy"
        />
      ) : media.type === "video" ? (
        <Play aria-hidden="true" className="ic ed-vignette__vide" />
      ) : (
        <ImageIcon aria-hidden="true" className="ic ed-vignette__vide" />
      )}

      {/* LA DURÉE N'EST ÉCRITE QUE SI ELLE A ÉTÉ MESURÉE : « 0:00 » affirmerait une mesure
          qu'on n'a pas faite. */}
      {media.type === "video" ? (
        <span className="ed-vignette__video">
          <Play aria-hidden="true" className="ic" />
          {media.dureeS === null ? null : duree(media.dureeS)}
          <span className="sr">{t("estUneVideo")}</span>
        </span>
      ) : null}

      {media.estCouverture ? (
        <span className="ed-vignette__couverture">{t("couverture")}</span>
      ) : (
        <button type="button" onClick={onCouvrir} className="ed-vignette__geste ed-vignette__etoile" aria-label={t("definirCouverture")} title={t("definirCouverture")}>
          <Star aria-hidden="true" className="ic" />
        </button>
      )}

      {/*
        LA POIGNÉE DE DÉPLACEMENT, SEULE DE SON CÔTÉ (décision 19). La maquette fait
        glisser toute la vignette ; ici une case entière qui démarrerait un déplacement
        rendrait chaque clic sur « supprimer » hasardeux au doigt, et la poignée porte le
        clavier (Espace, flèches) — que le glisser natif de la maquette n'offre pas.
      */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="ed-vignette__geste ed-vignette__poignee"
        aria-label={t("deplacer", { position: index + 1 })}
        title={t("deplacer", { position: index + 1 })}
      >
        <GripVertical aria-hidden="true" className="ic" />
      </button>

      <button
        type="button"
        onClick={onSupprimer}
        className="ed-vignette__geste ed-vignette__geste--suppr"
        aria-label={t("supprimer")}
        title={t("supprimer")}
      >
        <Trash2 aria-hidden="true" className="ic" />
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
