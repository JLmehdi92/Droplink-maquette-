import { createHmac } from "node:crypto";
import { describe, expect, test } from "vitest";
import {
  EVENEMENTS_TRAITES,
  FOURNISSEUR,
  destinataireDe,
  lireEvenement,
  verifierSignature,
} from "@/lib/paiement/lemon-squeezy";

/**
 * LA GARDE QUI PROTÈGE LE REVENU.
 *
 * Décision de Wassim, 20/09/2026 : « je veux que quand le mec a prix son
 * abonnement et que il a payé […] il a son abonnement automatiquement ».
 *
 * ⚠️ CETTE SURFACE EST LA PREMIÈRE DU PRODUIT QUI DÉCIDE DE CE QU'UN COMPTE A
 * LE DROIT DE FAIRE, et `/api/*` est exclu du middleware : elle n'est protégée
 * par rien d'autre que la signature. Sans elle, n'importe qui POSTerait
 * `{"status":"active"}` avec un identifiant de profil et s'offrirait le plan
 * payant. Ce fichier éprouve donc surtout ce que la garde REFUSE.
 *
 * ⚠️ ET LE CONTRE-TEST POSITIF EST OBLIGATOIRE : une vérification qui refuse
 * TOUT passerait tous les cas de refus sans rien prouver — et casserait
 * l'encaissement en silence, ce qui est pire que de ne pas l'avoir écrite.
 */

const SECRET = "secret-de-sonde";
const AUTRE_SECRET = "un-autre-secret-de-sonde";

const signer = (corps: string, secret = SECRET): string =>
  createHmac("sha256", secret).update(corps, "utf8").digest("hex");

const charge = (surcharge: Record<string, unknown> = {}): string =>
  JSON.stringify({
    meta: {
      event_name: "subscription_created",
      custom_data: { profil_id: "3f7c2b1e-5a4d-4c8e-9b1a-2d3e4f5a6b7c", signature: "ab".repeat(32) },
    },
    data: {
      id: "987654",
      attributes: {
        status: "active",
        user_email: "vendeur@exemple.invalid",
        renews_at: "2026-10-20T08:00:00.000Z",
        ends_at: null,
        ...surcharge,
      },
    },
  });

describe("La signature du webhook", () => {
  test("CONTRE-TEST : une signature juste est acceptée", () => {
    // Sans ce cas, un `return false` inconditionnel passerait tout le reste de
    // ce fichier — et aucun abonnement ne serait jamais appliqué.
    const corps = charge();
    expect(verifierSignature(corps, signer(corps), SECRET)).toBe(true);
  });

  test("un corps MODIFIÉ d'un seul caractère est refusé", () => {
    const corps = charge();
    const signature = signer(corps);
    // C'est l'attaque réelle : intercepter un événement légitime et changer le
    // profil destinataire pour s'offrir l'abonnement de quelqu'un d'autre.
    const falsifie = corps.replace("987654", "987655");
    expect(verifierSignature(falsifie, signature, SECRET)).toBe(false);
  });

  test("une signature calculée avec un AUTRE secret est refusée", () => {
    const corps = charge();
    expect(verifierSignature(corps, signer(corps, AUTRE_SECRET), SECRET)).toBe(false);
  });

  test("une signature absente ou vide est refusée, sans lever", () => {
    const corps = charge();
    // ⚠️ `timingSafeEqual` LÈVE sur des longueurs différentes. Une exception sur
    // un chemin de garde se lirait comme une panne — donc comme un 500, que le
    // fournisseur REJOUERAIT — au lieu d'un refus franc.
    expect(() => verifierSignature(corps, null, SECRET)).not.toThrow();
    expect(verifierSignature(corps, null, SECRET)).toBe(false);
    expect(verifierSignature(corps, "", SECRET)).toBe(false);
  });

  test("une signature de longueur ABERRANTE est refusée, sans lever", () => {
    const corps = charge();
    expect(() => verifierSignature(corps, "aa", SECRET)).not.toThrow();
    expect(verifierSignature(corps, "aa", SECRET)).toBe(false);
    expect(verifierSignature(corps, "f".repeat(500), SECRET)).toBe(false);
  });

  test("un secret VIDE refuse tout, au lieu de tout accepter", () => {
    /*
     * LE CAS DE LA MAUVAISE CONFIGURATION, et c'est le plus dangereux : si un
     * secret absent produisait un HMAC « de la chaîne vide » comparé à lui-même,
     * la garde s'ouvrirait entièrement le jour où la variable manque — c'est-à-
     * dire au premier déploiement mal configuré.
     */
    const corps = charge();
    expect(verifierSignature(corps, signer(corps, ""), "")).toBe(false);
  });
});

describe("La lecture d'un événement", () => {
  test("lit un abonnement complet", () => {
    const lecture = lireEvenement(charge());
    expect(lecture.statut).toBe("ok");
    if (lecture.statut !== "ok") return;
    expect(lecture.evenement.data.id).toBe("987654");
    expect(lecture.evenement.data.attributes.status).toBe("active");
  });

  test("un JSON invalide est NOMMÉ, pas avalé", () => {
    const lecture = lireEvenement("{ceci n'est pas du json");
    expect(lecture.statut).toBe("illisible");
  });

  test("un STATUT INCONNU est refusé plutôt que rabattu sur « gratuit »", () => {
    /*
     * ⚠️ LE PIÈGE QUE CE CAS FERME. La traduction en plan rend `gratuit` pour
     * tout ce qu'elle ne reconnaît pas. Si l'analyse acceptait n'importe quelle
     * chaîne, le jour où Lemon Squeezy ajoute un statut à sa liste, tous les
     * vendeurs qui le portent perdraient leur plan PAYANT — en silence, et sans
     * qu'aucune erreur ne soit levée nulle part.
     *
     * Refuser l'événement le laisse rejouable et visible, ce qui est réparable.
     */
    const lecture = lireEvenement(charge({ status: "statut_invente_par_le_fournisseur" }));
    expect(lecture.statut).toBe("illisible");
  });

  test("le motif d'échec ne recopie PAS la charge", () => {
    // Elle porte l'adresse e-mail d'un vendeur ; un journal n'est pas l'endroit
    // où la ranger.
    const lecture = lireEvenement(charge({ status: "inconnu" }));
    expect(lecture.statut).toBe("illisible");
    if (lecture.statut !== "illisible") return;
    expect(lecture.motif).not.toContain("vendeur@exemple.invalid");
  });
});

describe("Le destinataire d'un abonnement", () => {
  const lire = (corps: string) => {
    const l = lireEvenement(corps);
    if (l.statut !== "ok") throw new Error("charge de sonde illisible : " + l.motif);
    return l.evenement;
  };

  test("un identifiant ACCOMPAGNÉ de sa signature est le candidat", () => {
    // Le profil et sa signature viennent de NOUS (le lien signé, 204). La route
    // fait juger la signature par la base avant de croire quoi que ce soit.
    const d = destinataireDe(lire(charge()));
    expect(d.par).toBe("profil");
    if (d.par !== "profil") return;
    expect(d.profilId).toBe("3f7c2b1e-5a4d-4c8e-9b1a-2d3e4f5a6b7c");
    expect(d.signature).toBe("ab".repeat(32));
  });

  test("⚠️ l'adresse e-mail ne rattache PLUS RIEN (204)", () => {
    /*
     * Ce test disait l'inverse : « sans identifiant, l'adresse e-mail sert de
     * FILET ». C'était la faille de l'audit ECC du 27/09/2026 — l'adresse saisie
     * chez le fournisseur n'est prouvée par personne, et qui connaissait celle
     * d'un vendeur pouvait poser ou retirer son plan. Une adresse seule, même
     * celle d'un vrai compte, ne désigne plus personne.
     */
    const sansProfil = JSON.parse(charge()) as { meta: { custom_data?: unknown } };
    sansProfil.meta.custom_data = {};
    expect(destinataireDe(lire(JSON.stringify(sansProfil))).par).toBe("rien");
  });

  test("un identifiant SANS signature n'est pas un candidat", () => {
    // Le lien d'avant la 204, ou un lien retouché à la main pour retirer la
    // signature : l'identifiant nu ne vaut rien.
    const nu = JSON.parse(charge()) as { meta: { custom_data?: unknown } };
    nu.meta.custom_data = { profil_id: "3f7c2b1e-5a4d-4c8e-9b1a-2d3e4f5a6b7c" };
    expect(destinataireDe(lire(JSON.stringify(nu))).par).toBe("rien");
  });

  test("sans rien, on N'INVENTE PAS de destinataire", () => {
    /*
     * Poser un plan sur le mauvais compte est plus grave que de ne pas le
     * poser : le second se voit — un vendeur réclame —, le premier ne se voit
     * jamais. D'où « rien », que l'appelant doit signaler.
     */
    const anonyme = JSON.parse(charge()) as {
      meta: { custom_data?: unknown };
      data: { attributes: { user_email?: unknown } };
    };
    anonyme.meta.custom_data = {};
    anonyme.data.attributes.user_email = null;
    expect(destinataireDe(lire(JSON.stringify(anonyme))).par).toBe("rien");
  });
});

describe("Le catalogue d'événements", () => {
  test("la sonde inspecte réellement quelque chose", () => {
    // Un ensemble vide passe tout.
    expect(EVENEMENTS_TRAITES.length).toBeGreaterThan(0);
    expect(FOURNISSEUR).toBe("lemon_squeezy");
  });

  test("les deux événements qui OUVRENT et qui FERMENT l'accès y sont", () => {
    // Oublier `subscription_expired` laisserait des comptes payants à vie.
    expect(EVENEMENTS_TRAITES).toContain("subscription_created");
    expect(EVENEMENTS_TRAITES).toContain("subscription_expired");
  });
});
