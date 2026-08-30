import { describe, expect, test } from "vitest";
import { sansDonneesPersonnelles } from "@/lib/tracking/provider/dix-sept-track";

/**
 * LA RÉPONSE BRUTE DU FOURNISSEUR NE DOIT PAS PORTER DE DONNÉES PERSONNELLES.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI CE TEST EXISTE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ RELEVÉ LE 30/08/2026 DANS LEUR DOCUMENTATION. La charge utile d'une
 * notification `TRACKING_UPDATED` contient `track_info.shipping_info` avec
 * `recipient_address` — pays, région, ville, RUE, code postal et coordonnées du
 * DESTINATAIRE — plus `consignee`, `phone_number`, `phone_number_last_4` et
 * `cpf_or_cnpj`.
 *
 * Nous ne demandons rien de tout cela : notre `/register` n'envoie que le numéro
 * et parfois le transporteur. C'est le TRANSPORTEUR qui les publie. Et nous les
 * écrivions tels quels dans `tracking_snapshots.raw_payload`, conservés
 * quatre-vingt-dix jours après le dernier mouvement.
 *
 * Ce n'était pas une fuite — cette table porte la RLS sans aucune policy, donc
 * n'est atteignable qu'en service-role, et rien n'atteint jamais un écran. Mais
 * c'était une COLLECTE : des données personnelles sur le client d'un vendeur,
 * que le produit s'interdit par principe. Le destinataire n'a pas de compte, et
 * son nom même n'est qu'un pseudo en texte libre.
 *
 * La réponse brute existe pour DIAGNOSTIQUER. L'adresse d'un tiers n'a aucune
 * valeur de diagnostic.
 *
 * ⚠️ CE TEST PORTE SUR UNE CHARGE UTILE RECOPIÉE DE LEUR DOCUMENTATION, pas sur
 * un exemple inventé : un jeu qu'on fabrique soi-même ne contient que ce à quoi
 * on avait déjà pensé.
 */

/** Extrait de leur exemple `TRACKING_UPDATED`, réduit à ce qui compte ici. */
const CHARGE_REELLE = {
  event: "TRACKING_UPDATED",
  data: {
    number: "RR123456789CN",
    carrier: 3011,
    shipper: "Un expéditeur",
    consignee: "Nom du client",
    phone_number: "+33600000000",
    phone_number_last_4: "0000",
    cpf_or_cnpj: "123.456.789-00",
    tag: "myID",
    track_info: {
      shipping_info: {
        shipper_address: { country: "CN", city: "SHENZHEN", postal_code: "518000" },
        recipient_address: {
          country: "FR",
          state: "IDF",
          city: "PARIS",
          street: "12 rue de la Paix",
          postal_code: "75002",
          coordinates: { longitude: "2.331", latitude: "48.869" },
        },
      },
      latest_status: { status: "InfoReceived", sub_status: "InfoReceived" },
      latest_event: {
        time_utc: "2022-03-03T02:43:24Z",
        description: "Shipment information sent to carrier",
        location: "NJ",
        stage: "InfoReceived",
      },
      milestone: [{ key_stage: "InfoReceived", time_utc: "2023-08-14T05:00:00Z" }],
      time_metrics: { days_of_transit: 7 },
    },
  },
};

/** Toute valeur de chaîne présente quelque part dans l'objet. */
function chaines(valeur: unknown, dans: string[] = []): string[] {
  if (typeof valeur === "string") dans.push(valeur);
  else if (Array.isArray(valeur)) for (const v of valeur) chaines(v, dans);
  else if (valeur !== null && typeof valeur === "object") {
    for (const v of Object.values(valeur as Record<string, unknown>)) chaines(v, dans);
  }
  return dans;
}

describe("La réponse brute stockée ne porte aucune donnée personnelle", () => {
  const propre = sansDonneesPersonnelles(CHARGE_REELLE);
  const restantes = chaines(propre);

  test("CONTRE-TEST : la charge d'origine porte BIEN ces données", () => {
    // Sans ce contrôle, un jeu qui n'aurait jamais contenu d'adresse ferait
    // passer le nettoyage à 100 % sans rien prouver. On établit d'abord qu'il y
    // a quelque chose à retirer.
    const avant = chaines(CHARGE_REELLE);
    for (const secret of ["12 rue de la Paix", "Nom du client", "+33600000000", "75002"]) {
      expect(avant, `« ${secret} » n'est pas dans le jeu : il ne prouve rien`).toContain(secret);
    }
  });

  test("CONTRÔLE PAR VALEUR : aucune des valeurs personnelles ne survit", () => {
    // On cherche les VALEURS dans tout ce qui reste, à n'importe quelle
    // profondeur — pas les noms de champs. Une valeur republiée sous un autre
    // nom survivrait à un contrôle par nom ; elle ne survit pas à celui-ci.
    for (const secret of [
      "12 rue de la Paix",
      "Nom du client",
      "+33600000000",
      "0000",
      "123.456.789-00",
      "Un expéditeur",
      "75002",
      "2.331",
      "48.869",
    ]) {
      expect(restantes, `« ${secret} » est encore stocké`).not.toContain(secret);
    }
  });

  test("CONTRE-TEST POSITIF : ce qui sert au diagnostic est CONSERVÉ", () => {
    // Un nettoyage qui viderait tout passerait le contrôle ci-dessus à 100 % et
    // détruirait la seule raison d'être de la réponse brute.
    expect(restantes).toContain("RR123456789CN");
    expect(restantes).toContain("InfoReceived");
    expect(restantes).toContain("Shipment information sent to carrier");
    expect(restantes).toContain("TRACKING_UPDATED");
    expect(restantes).toContain("myID");
    expect(JSON.stringify(propre)).toContain("3011");
    expect(JSON.stringify(propre)).toContain("days_of_transit");
  });

  test("le nettoyage porte à N'IMPORTE QUELLE profondeur", () => {
    // Leur schéma place `shipping_info` sous `track_info`. Rien ne garantit
    // qu'il n'apparaisse pas ailleurs, et un contrôle qui ne regarde qu'un
    // chemin précis regarde là où le défaut n'est peut-être plus.
    const enfoui = { a: { b: [{ c: { shipping_info: { recipient_address: { city: "LYON" } } } }] } };
    expect(chaines(sansDonneesPersonnelles(enfoui))).not.toContain("LYON");
  });

  test("il ne casse ni les tableaux, ni les nombres, ni les nuls", () => {
    const varie = { n: 3011, z: null, l: [1, "x", null], o: { k: false } };
    expect(sansDonneesPersonnelles(varie)).toEqual(varie);
  });
});
