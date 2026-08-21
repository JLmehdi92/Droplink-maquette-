import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { dixSeptTrack } from "@/lib/tracking/provider/dix-sept-track";

/**
 * LA VÉRIFICATION DE SIGNATURE DU POINT DE RÉCEPTION.
 *
 * C'est la seule chose qui sépare « le transporteur nous dit que le colis est
 * livré » de « n'importe qui nous dit que le colis est livré ». Un numéro de
 * suivi n'est pas un secret — il figure sur l'étiquette, dans la conversation,
 * parfois dans une capture d'écran publique. Sans cette garde, il suffirait d'en
 * connaître un pour écrire dans la commande d'un vendeur inconnu.
 *
 * LA CLÉ DE TEST EST POSÉE ICI ET RETIRÉE ENSUITE. Elle n'a rien à voir avec la
 * vraie : ce qu'on éprouve est le SCHÉMA, pas le secret.
 */

const CLE = "cle-de-test-8f2b91d4c7";
const CORPS = JSON.stringify({
  event: "TRACKING_UPDATED",
  data: { number: "RR123456789CN", carrier: 3011, tag: null },
});

function signer(corps: string, cle: string): string {
  return createHash("sha256").update(corps + "/" + cle, "utf8").digest("hex");
}

let ancienne: string | undefined;

beforeAll(() => {
  ancienne = process.env["TRACKING_API_KEY"];
  process.env["TRACKING_API_KEY"] = CLE;
});

afterAll(() => {
  if (ancienne === undefined) delete process.env["TRACKING_API_KEY"];
  else process.env["TRACKING_API_KEY"] = ancienne;
});

describe("Ce qui est accepté", () => {
  test("une signature juste passe — sinon la sonde ne prouve rien", () => {
    // LE CONTRE-TEST POSITIF EN PREMIER. Une suite où tout est refusé passe à
    // 100 % sans rien prouver, et c'est exactement ce qu'une vérification cassée
    // produirait.
    expect(dixSeptTrack.verifierNotification(CORPS, signer(CORPS, CLE))).toBe(true);
  });

  test("la casse de la signature reçue n'a pas d'importance", () => {
    expect(dixSeptTrack.verifierNotification(CORPS, signer(CORPS, CLE).toUpperCase())).toBe(true);
  });

  test("les espaces autour de la signature non plus", () => {
    expect(dixSeptTrack.verifierNotification(CORPS, "  " + signer(CORPS, CLE) + "\n")).toBe(true);
  });
});

describe("Ce qui est refusé", () => {
  test("aucune signature du tout", () => {
    // Un point de réception qui accepte une notification non signée est un canal
    // d'écriture ouvert sur les commandes de tous les vendeurs.
    expect(dixSeptTrack.verifierNotification(CORPS, null)).toBe(false);
    expect(dixSeptTrack.verifierNotification(CORPS, "")).toBe(false);
  });

  test("une signature calculée avec une AUTRE clé", () => {
    expect(dixSeptTrack.verifierNotification(CORPS, signer(CORPS, "une-autre-cle"))).toBe(false);
  });

  /**
   * LE CAS QUI COMPTE VRAIMENT. Le corps est modifié APRÈS signature : c'est ce
   * que ferait un intermédiaire pour transformer « en transit » en « livré »,
   * ou pour rediriger la notification vers le numéro d'un autre vendeur.
   */
  test("un corps modifié après signature", () => {
    const signature = signer(CORPS, CLE);
    const falsifie = CORPS.replace("RR123456789CN", "RR999999999CN");
    expect(falsifie).not.toBe(CORPS);
    expect(dixSeptTrack.verifierNotification(falsifie, signature)).toBe(false);
  });

  test("un corps RÉORDONNÉ, même équivalent en JSON", () => {
    // La signature porte sur les OCTETS, pas sur le sens. C'est la raison pour
    // laquelle la route lit le corps BRUT : un aller-retour par `JSON.parse`
    // puis `JSON.stringify` réordonne les clefs et invaliderait tout.
    const reordonne = JSON.stringify({
      data: { tag: null, carrier: 3011, number: "RR123456789CN" },
      event: "TRACKING_UPDATED",
    });
    expect(dixSeptTrack.verifierNotification(reordonne, signer(CORPS, CLE))).toBe(false);
  });

  /**
   * LA SIGNATURE EST COMPARÉE EN ENTIER, pas seulement son début.
   *
   * Trouvé en falsifiant : une comparaison tronquée aux huit premiers caractères
   * passait TOUS les autres tests de cette suite. C'est logique — deux
   * signatures tirées au hasard diffèrent dès le premier caractère, donc aucune
   * de mes fausses signatures ne l'éprouvait. Il faut une signature qui PARTAGE
   * le préfixe de la bonne et n'en diffère qu'à la fin.
   *
   * Le défaut n'est pas théorique : c'est exactement ce que produit une
   * comparaison qui s'arrête « quand on en a assez vu », et une signature dont
   * seuls quelques octets comptent se force en quelques secondes.
   */
  test("une signature au bon PRÉFIXE mais fausse à la fin est refusée", () => {
    const bonne = signer(CORPS, CLE);
    const dernier = bonne.slice(-1);
    const autre = dernier === "0" ? "1" : "0";
    const presque = bonne.slice(0, -1) + autre;

    expect(presque).not.toBe(bonne);
    expect(presque.slice(0, 32), "le préfixe doit être identique").toBe(bonne.slice(0, 32));
    expect(dixSeptTrack.verifierNotification(CORPS, presque)).toBe(false);
  });

  test("une signature fausse dès le DÉBUT est refusée aussi", () => {
    // Les deux bouts : un test d'un seul côté laisse passer une comparaison qui
    // ne regarderait que la fin.
    const bonne = signer(CORPS, CLE);
    const premier = bonne.slice(0, 1);
    const autre = premier === "0" ? "1" : "0";
    expect(dixSeptTrack.verifierNotification(CORPS, autre + bonne.slice(1))).toBe(false);
  });

  test("une signature mal formée ne fait pas LEVER la vérification", () => {
    // `timingSafeEqual` LÈVE si les deux tampons n'ont pas la même longueur, et
    // une exception ici deviendrait une erreur 500 — donc un oracle : elle
    // distinguerait « mauvaise longueur » de « mauvaise valeur ».
    for (const mauvaise of ["abc", "zz".repeat(32), "0".repeat(63), "0".repeat(65), "not-hex"]) {
      expect(() => dixSeptTrack.verifierNotification(CORPS, mauvaise)).not.toThrow();
      expect(dixSeptTrack.verifierNotification(CORPS, mauvaise)).toBe(false);
    }
  });

  test("sans clé configurée, la vérification LÈVE au lieu d'accepter", () => {
    const memoire = process.env["TRACKING_API_KEY"];
    delete process.env["TRACKING_API_KEY"];
    try {
      // Le pire défaut possible serait de rendre `true` faute de clé. Le second
      // pire serait de rendre `false` en silence : le suivi cesserait de
      // fonctionner sans que personne ne sache pourquoi.
      expect(() => dixSeptTrack.verifierNotification(CORPS, signer(CORPS, CLE))).toThrow();
    } finally {
      process.env["TRACKING_API_KEY"] = memoire;
    }
  });
});

describe("La lecture d'une notification vérifiée", () => {
  test("elle rend le numéro et l'état", () => {
    const corps = JSON.stringify({
      event: "TRACKING_UPDATED",
      data: {
        number: "RR123456789CN",
        carrier: 3011,
        track_info: {
          latest_status: { status: "InTransit" },
          latest_event: {
            time_utc: "2026-08-10T12:00:00Z",
            description: "Départ du centre de tri",
            location: "Shenzhen",
          },
          milestone: [{ key_stage: "PickedUp", time_utc: "2026-08-09T09:00:00Z" }],
        },
      },
    });

    const lu = dixSeptTrack.lireNotification(corps);
    expect(lu.statut).toBe("ok");
    expect(lu.numero).toBe("RR123456789CN");
    if (lu.statut !== "ok") return;
    expect(lu.etat.statutBrut).toBe("InTransit");
    expect(lu.etat.points.length).toBe(1);
    expect(lu.etat.jalons.length).toBe(1);
  });

  test("une notification sans état est VIDE, pas en erreur", () => {
    // Le fournisseur pousse aussi des arrêts de suivi, qui ne portent aucun
    // état. Les traiter comme des erreurs ferait chercher une panne inexistante.
    const corps = JSON.stringify({
      event: "TRACKING_STOPPED",
      data: { number: "RR123456789CN", carrier: 3011, param: null, tag: "" },
    });
    const lu = dixSeptTrack.lireNotification(corps);
    expect(lu.statut).toBe("vide");
    expect(lu.numero).toBe("RR123456789CN");
  });

  test("un JSON illisible est refusé sans lever", () => {
    const lu = dixSeptTrack.lireNotification("{ pas du json");
    expect(lu.statut).toBe("refuse");
  });

  test("une forme inattendue est refusée, pas devinée", () => {
    const lu = dixSeptTrack.lireNotification(JSON.stringify({ event: "X" }));
    expect(lu.statut).toBe("refuse");
  });

  test("un champ ajouté par le fournisseur ne casse rien", () => {
    // Leur API s'enrichit sans prévenir. Un schéma strict ferait échouer TOUT le
    // suivi le jour où ils ajoutent un champ — et ce jour-là, personne ne
    // comprendrait pourquoi les colis ont cessé d'avancer.
    const corps = JSON.stringify({
      event: "TRACKING_UPDATED",
      champ_de_demain: { quelque: "chose" },
      data: {
        number: "RR123456789CN",
        nouveau_champ: 42,
        track_info: { latest_status: { status: "Delivered" }, encore_un: true },
      },
    });
    const lu = dixSeptTrack.lireNotification(corps);
    expect(lu.statut).toBe("ok");
    if (lu.statut !== "ok") return;
    expect(lu.etat.statutBrut).toBe("Delivered");
  });
});
