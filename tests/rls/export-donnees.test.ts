import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { clientService, creerUtilisateur, supprimerUtilisateur, type UtilisateurDeTest } from "../aide/utilisateurs";
import { exporterDonnees } from "@/lib/comptes/export-donnees";
import type { ClientLecture } from "@/lib/commandes/liste";

/**
 * « EXPORTER MES DONNÉES » — contrôlé PAR VALEUR, jamais par nom de colonne.
 *
 * Une valeur voyage sous n'importe quel nom : une note interne republiée sous
 * `commentaire` ou `meta` passerait un contrôle qui cherche la clé
 * `internal_notes`. On pose donc des SENTINELLES uniques dans les colonnes qui
 * ne doivent jamais sortir, et on les cherche dans le fichier entier, sérialisé.
 *
 * ET LES CONTRE-TESTS POSITIFS : le fichier doit bien porter la commande du
 * vendeur, son client et son lien — un export vide passerait tous les refus.
 */

const SENTINELLE_NOTE = "SENTINELLE-NOTE-EXPORT-8841";
const SENTINELLE_EMAIL = "sentinelle-client-8841@droplink-tests.invalid";
const SENTINELLE_CLIENT_VOISIN = "SENTINELLE-VOISIN-8841";
const ORIGINE = "https://exemple.invalid";

let vendeur: UtilisateurDeTest;
let voisin: UtilisateurDeTest;
let jetonDesabonnement = "";
let jetonPublic = "";

beforeAll(async () => {
  vendeur = await creerUtilisateur("export-vendeur");
  voisin = await creerUtilisateur("export-voisin");

  const { data, error } = await vendeur.client
    .from("orders")
    .insert({
      shop_id: vendeur.shopId,
      customer_label: "Client exporté",
      product_ref: "REF-EXPORT",
      internal_notes: SENTINELLE_NOTE,
    })
    .select("id")
    .single();
  if (error !== null) throw new Error("commande : " + error.message);

  // L'ADRESSE DU CLIENT n'est plus écrivable par le vendeur (migration 188) :
  // elle n'entre que par la confirmation du client. Elle est posée ici par le
  // service, comme la confirmation la pose.
  const { error: eAdresse } = await clientService()
    .from("orders")
    .update({ notify_email: SENTINELLE_EMAIL })
    .eq("id", data.id);
  if (eAdresse !== null) throw new Error("adresse du client : " + eAdresse.message);

  const { data: jetons } = await clientService()
    .from("orders")
    .select("public_token, unsubscribe_token")
    .eq("id", data.id)
    .single();
  jetonPublic = jetons?.public_token ?? "";
  jetonDesabonnement = jetons?.unsubscribe_token ?? "";

  const { error: eVoisin } = await voisin.client
    .from("orders")
    .insert({ shop_id: voisin.shopId, customer_label: SENTINELLE_CLIENT_VOISIN });
  if (eVoisin !== null) throw new Error("commande voisine : " + eVoisin.message);
}, 120_000);

afterAll(async () => {
  await supprimerUtilisateur(vendeur);
  await supprimerUtilisateur(voisin);
});

describe("Le fichier d'export", () => {
  test("porte la commande du vendeur, son client et son lien", async () => {
    const fichier = await exporterDonnees(vendeur.client as unknown as ClientLecture, ORIGINE, null);
    expect(fichier.commandes).toHaveLength(1);
    const texte = JSON.stringify(fichier);
    expect(texte).toContain("Client exporté");
    expect(texte).toContain("REF-EXPORT");
    expect(jetonPublic.length, "le jeton témoin doit exister").toBeGreaterThan(10);
    expect(texte).toContain(`${ORIGINE}/p/${jetonPublic}`);
    expect(fichier.tronque).toBe(false);
  }, 60_000);

  test("ne laisse sortir AUCUNE des valeurs exclues, sous aucun nom", async () => {
    const texte = JSON.stringify(await exporterDonnees(vendeur.client as unknown as ClientLecture, ORIGINE, null));
    expect(jetonDesabonnement.length, "le jeton de désabonnement témoin doit exister").toBeGreaterThan(10);
    for (const [nom, valeur] of [
      ["note interne (décision 15)", SENTINELLE_NOTE],
      ["adresse du client final", SENTINELLE_EMAIL],
      ["jeton de désabonnement", jetonDesabonnement],
    ] as const) {
      expect(texte.includes(valeur), `${nom} sort dans l'export`).toBe(false);
    }
  }, 60_000);

  test("ne porte RIEN du voisin", async () => {
    const texte = JSON.stringify(await exporterDonnees(vendeur.client as unknown as ClientLecture, ORIGINE, null));
    expect(texte).not.toContain(SENTINELLE_CLIENT_VOISIN);
    expect(texte).not.toContain(voisin.email);

    // Contre-test : la sentinelle du voisin existe bel et bien, dans SON export.
    const sien = JSON.stringify(await exporterDonnees(voisin.client as unknown as ClientLecture, ORIGINE, null));
    expect(sien).toContain(SENTINELLE_CLIENT_VOISIN);
  }, 60_000);
});
