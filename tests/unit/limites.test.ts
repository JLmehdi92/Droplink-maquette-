import { afterEach, describe, expect, test } from "vitest";
import { deciderDepot, estVideo, limites } from "@/lib/storage/limites";

const MO = 1024 * 1024;

const VARIABLES = [
  "DEPOT_PHOTO_MAX_MO",
  "DEPOT_VIDEO_MAX_MO",
  "DEPOT_MEDIAS_PAR_COMMANDE",
  "DEPOT_VIDEOS_PAR_COMMANDE",
  "DEPOT_VIDEO_DUREE_MAX_S",
] as const;

afterEach(() => {
  for (const v of VARIABLES) delete process.env[v];
});

describe("Plafonds de dépôt", () => {
  test("les seuils viennent de la CONFIGURATION, pas du code", () => {
    // Le seuil vidéo est provisoire : il ne sera juste qu'après calibrage sur de
    // vrais fichiers. Ce test établit qu'on pourra le corriger sans redéployer.
    expect(limites().videoOctets).toBe(20 * MO);
    process.env["DEPOT_VIDEO_MAX_MO"] = "35";
    expect(limites().videoOctets).toBe(35 * MO);
  });

  test("une configuration illisible retombe sur le défaut, jamais sur zéro", () => {
    // Un plafond dégradé à zéro refuserait tout, et on chercherait la panne du
    // côté des fichiers déposés — c'est-à-dire au mauvais endroit.
    // « 3.7 » et « 20abc » sont les cas traîtres : `parseInt` les convertit
    // sans broncher en 3 et 20, deux entiers positifs qui franchissent toute
    // validation portant sur le résultat plutôt que sur la forme.
    for (const absurde of ["", "  ", "zero", "-5", "0", "3.7", "20abc", "1e3", " 35 x"]) {
      process.env["DEPOT_VIDEO_MAX_MO"] = absurde;
      expect(limites().videoOctets, `« ${absurde} » a produit un plafond faux`).toBe(20 * MO);
    }
  });

  test("un refus porte TOUJOURS son motif et la taille réelle", () => {
    // Sans la taille, on saurait qu'on a refusé sans savoir de combien on s'est
    // trompé — donc sans pouvoir corriger le seuil autrement qu'au jugé.
    const decision = deciderDepot({
      typeMime: "video/mp4",
      tailleOctets: 47_300_000,
      mediasExistants: 0,
      videosExistantes: 0,
    });
    expect(decision.accepte).toBe(false);
    if (decision.accepte) throw new Error("inatteignable");
    expect(decision.motif).toBe("trop_lourd");
    expect(decision.tailleReelle).toBe(47_300_000);
    expect(decision.plafond).toBe(20 * MO);
  });

  test("photo et vidéo ne partagent pas le même plafond", () => {
    const taille = 15 * MO;
    expect(
      deciderDepot({
        typeMime: "image/jpeg",
        tailleOctets: taille,
        mediasExistants: 0,
        videosExistantes: 0,
      }).accepte,
      "une photo de 15 Mo devrait être refusée",
    ).toBe(false);
    expect(
      deciderDepot({
        typeMime: "video/mp4",
        tailleOctets: taille,
        mediasExistants: 0,
        videosExistantes: 0,
      }).accepte,
      "une vidéo de 15 Mo devrait être acceptée",
    ).toBe(true);
  });

  test("les plafonds de nombre sont appliqués, et distingués", () => {
    const base = { typeMime: "video/mp4", tailleOctets: 1000 };

    const tropDeMedias = deciderDepot({ ...base, mediasExistants: 20, videosExistantes: 0 });
    expect(tropDeMedias.accepte).toBe(false);
    if (!tropDeMedias.accepte) expect(tropDeMedias.motif).toBe("trop_de_medias");

    const tropDeVideos = deciderDepot({ ...base, mediasExistants: 5, videosExistantes: 3 });
    expect(tropDeVideos.accepte).toBe(false);
    if (!tropDeVideos.accepte) expect(tropDeVideos.motif).toBe("trop_de_videos");

    const tropLongue = deciderDepot({
      ...base,
      mediasExistants: 0,
      videosExistantes: 0,
      dureeSecondes: 91,
    });
    expect(tropLongue.accepte).toBe(false);
    if (!tropLongue.accepte) expect(tropLongue.motif).toBe("video_trop_longue");
  });

  test("le compte de médias plafonne AUSSI les photos", () => {
    // Falsification hors du cas motivant : le plafond de nombre a été écrit en
    // pensant aux vidéos, qui sont le poste de coût. Une photo doit s'y heurter
    // exactement pareil.
    const decision = deciderDepot({
      typeMime: "image/png",
      tailleOctets: 1000,
      mediasExistants: 20,
      videosExistantes: 0,
    });
    expect(decision.accepte).toBe(false);
  });

  test("contre-test positif : un dépôt normal est ACCEPTÉ", () => {
    // Sans lui, une implémentation qui refuse tout passerait cette suite à 100 %.
    expect(
      deciderDepot({
        typeMime: "image/jpeg",
        tailleOctets: 2 * MO,
        mediasExistants: 4,
        videosExistantes: 1,
      }).accepte,
    ).toBe(true);
    expect(
      deciderDepot({
        typeMime: "video/mp4",
        tailleOctets: 18 * MO,
        mediasExistants: 4,
        videosExistantes: 2,
        dureeSecondes: 58,
      }).accepte,
    ).toBe(true);
  });

  test("la détection de vidéo résiste aux paramètres et à la casse", () => {
    expect(estVideo("VIDEO/MP4")).toBe(true);
    expect(estVideo("video/quicktime; codecs=hvc1")).toBe(true);
    expect(estVideo("image/jpeg")).toBe(false);
  });
});
