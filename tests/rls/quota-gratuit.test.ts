import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  clientService,
  creerUtilisateur,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";
import { PLAFOND_COMMANDES_GRATUIT_A_VIE_DEFAUT } from "@/lib/audit/panneau";

/**
 * LE QUOTA D'UN COMPTE GRATUIT EST À VIE — décision de Wassim, 20/09/2026.
 *
 * « on va faire 15 commandes a vie sur un compte gratuit, si le compte gratuit
 * a plus ces 15 commandes il doit payer un abonnement […] et ça sert a perdre
 * moins contre les mec qui vont re créer des comptes »
 *
 * ⚠️ CE QUI EST ÉPROUVÉ ICI EST L'EFFET, PAS LA DÉCLARATION. Un test qui
 * constate que la fonction existe, ou que le paramètre est dans l'inventaire,
 * ne prouve jamais que son absence bloque (L-018). On crée donc de VRAIES
 * commandes avec une VRAIE session, jusqu'au refus.
 *
 * ⚠️ ET LE CONTRE-TEST EST LA MOITIÉ QUI COMPTE. Une suite où tout est refusé
 * passe à 100 % sans rien prouver : il faut donc voir les quinze premières
 * PASSER, puis la seizième être refusée, puis le même compte passé en `pro`
 * créer à nouveau. Sans ce dernier cas, un plafond qui refuserait TOUT le monde
 * — y compris les comptes payants — serait vert ici.
 */

let vendeur: UtilisateurDeTest;
const service = clientService();

/** Crée `combien` commandes d'un coup, et rend l'erreur éventuelle. */
async function creer(combien: number, etiquette: string) {
  const lignes = Array.from({ length: combien }, (_, i) => ({
    shop_id: vendeur.shopId,
    customer_label: `${etiquette} ${i + 1}`,
  }));
  return await vendeur.client.from("orders").insert(lignes).select("id");
}

beforeAll(async () => {
  vendeur = await creerUtilisateur("quota-gratuit");
});

afterAll(async () => {
  await supprimerUtilisateur(vendeur);
});

describe("Le quota d'un compte gratuit", () => {
  test("un compte neuf naît GRATUIT", async () => {
    // Sans cela, tout ce fichier pourrait mesurer un compte `pro` et conclure
    // que le plafond ne se déclenche jamais.
    const { data } = await service
      .from("profiles")
      .select("plan")
      .eq("id", vendeur.profilId)
      .single();
    expect(data?.plan).toBe("gratuit");
  });

  test("les quinze premières commandes PASSENT, dont une d'un mois RÉVOLU", async () => {
    /*
     * ⚠️ LA COMMANDE ANTIDATÉE EST CE QUI REND CE FICHIER DISCRIMINANT, et sans
     * elle il ne prouvait PAS la décision.
     *
     * Première version : quinze commandes créées maintenant, la seizième
     * refusée. Falsifiée en remettant le décompte au MOIS (`quota-gratuit-mensuel`)
     * — et le test est resté VERT, parce que quinze commandes créées le même
     * jour sont quinze commandes de ce mois-ci. Il mesurait « il existe un
     * plafond », jamais « le plafond porte sur toute la vie ».
     *
     * Avec une commande vieille de deux mois, les deux lectures divergent : à
     * vie le compte est à quinze, ce mois-ci il est à quatorze. Le refus de la
     * seizième ne peut donc plus venir que du décompte à vie.
     */
    const { error: erreurAncienne } = await service.from("orders").insert({
      shop_id: vendeur.shopId,
      customer_label: "Commande d'un mois révolu",
      created_at: new Date(Date.now() - 62 * 24 * 60 * 60 * 1000).toISOString(),
    });
    expect(erreurAncienne, `antidatage impossible : ${erreurAncienne?.message ?? ""}`).toBeNull();

    const { data, error } = await creer(
      PLAFOND_COMMANDES_GRATUIT_A_VIE_DEFAUT - 1,
      "Sous le quota",
    );

    expect(error, `refus prématuré : ${error?.message ?? ""}`).toBeNull();
    expect(data).toHaveLength(PLAFOND_COMMANDES_GRATUIT_A_VIE_DEFAUT - 1);
  });

  test("la seizième est REFUSÉE, et le refus nomme les deux nombres", async () => {
    const { error } = await creer(1, "Au-delà du quota");

    expect(error, "le quota à vie n'a pas refusé la commande de trop").not.toBeNull();
    // Le code identifie le refus sans dépendre de la prose, qui peut être
    // traduite ou reformulée.
    expect(error?.code).toBe("DL067");
    // La prose, elle, doit porter les deux nombres ET dire que le quota ne se
    // recharge pas : un vendeur qui lit « quota atteint » sans cela attendrait
    // le mois suivant, indéfiniment.
    expect(error?.message).toContain(String(PLAFOND_COMMANDES_GRATUIT_A_VIE_DEFAUT));
    expect(error?.message).toMatch(/à vie/i);
  });

  test("CONTRE-TEST : le même compte passé en PRO peut de nouveau créer", async () => {
    /*
     * C'est la moitié qui empêche ce fichier de passer avec un plafond qui
     * refuserait tout le monde. Et c'est aussi la preuve que le plan — posé À
     * LA MAIN dans l'administration après un paiement reçu HORS du produit — est
     * bien ce qui débloque : aucun paiement ne passe par le produit.
     */
    await service.from("profiles").update({ plan: "pro" }).eq("id", vendeur.profilId);

    const { data, error } = await creer(1, "Compte Pro");

    expect(error, `un compte pro reste bloqué : ${error?.message ?? ""}`).toBeNull();
    expect(data).toHaveLength(1);

    // On rend le compte à son état d'origine : un test qui laisse le décor
    // déplacé fait échouer le suivant pour une raison qui n'est pas la sienne.
    await service.from("profiles").update({ plan: "gratuit" }).eq("id", vendeur.profilId);
  });

  test("le quota de COLIS d'un compte gratuit suit son quota de commandes", async () => {
    /*
     * ⚠️ TROU RÉEL, OUVERT PAR LA MIGRATION 176 — c'est-à-dire par moi, le même
     * jour, et mesuré ensuite sur la base de tests.
     *
     * Le plafond de colis (migration 125) vaut « deux fois le plafond MENSUEL
     * de commandes », soit 6 000. Or depuis la 176, un compte gratuit n'est plus
     * régi par ce plafond mensuel : il a 15 commandes À VIE. Les deux se sont
     * désolidarisés sans que rien ne le dise.
     *
     * Résultat mesuré : **60 colis créés sans un seul refus** par un compte à
     * 15 commandes à vie — et c'est la sonde qui s'est arrêtée, pas le produit.
     *
     * CE QUE ÇA COÛTE, ET POURQUOI C'EST LE PIRE ENDROIT POUR UN TROU : la prise
     * en charge est le SEUL geste payant du produit, et le palier du fournisseur
     * est COMMUN à tous les comptes. Un vendeur gratuit qui change le numéro de
     * suivi de ses 15 commandes toutes les trente secondes épuise le budget de
     * tout le monde en quelques minutes. Le quota de commandes ne l'arrête pas :
     * il compte les commandes, pas les colis.
     *
     * Le facteur 2 de la 125 laissait UNE correction de numéro par commande.
     * ⚠️ RETIRÉ LE 27/09/2026 (migration 201, décision de Wassim) : chaque
     * colis suivi coûte une prise en charge sur un palier commun, et le produit
     * ne peut pas offrir de seconde chance à un compte gratuit. 15 commandes,
     * 15 colis — une correction de numéro consomme l'un des quinze.
     */
    const pieton = await creerUtilisateur("quota-colis");
    try {
      const plafondAttendu = PLAFOND_COMMANDES_GRATUIT_A_VIE_DEFAUT;

      // On en crée un de moins que le plafond : tous doivent PASSER. Sans ce
      // contre-test, un plafond qui refuserait tout serait vert ici.
      const sousLePlafond = Array.from({ length: plafondAttendu - 1 }, (_, i) => ({
        shop_id: pieton.shopId,
        tracking_number: "SOUS-LE-PLAFOND-" + i,
        carrier_code: 6051,
      }));
      const { error: erreurSous } = await service.from("tracked_parcels").insert(sousLePlafond);
      expect(erreurSous, `refus prématuré : ${erreurSous?.message ?? ""}`).toBeNull();

      // Celui-ci atteint le plafond : il doit PASSER aussi.
      const { error: erreurPile } = await service.from("tracked_parcels").insert({
        shop_id: pieton.shopId,
        tracking_number: "PILE-AU-PLAFOND",
        carrier_code: 6051,
      });
      expect(erreurPile, `refus au dernier colis autorisé : ${erreurPile?.message ?? ""}`).toBeNull();

      // Celui d'après est REFUSÉ.
      const { error: erreurTrop } = await service.from("tracked_parcels").insert({
        shop_id: pieton.shopId,
        tracking_number: "AU-DELA-DU-PLAFOND",
        carrier_code: 6051,
      });
      expect(
        erreurTrop,
        "un compte gratuit a pu créer plus de colis que son quota ne l'autorise — " +
          "c'est le budget de suivi de TOUS les comptes qui est ouvert",
      ).not.toBeNull();
      expect(erreurTrop?.message).toContain(String(plafondAttendu));
    } finally {
      // Le décor est rendu même si une assertion échoue : un compte de sonde
      // résiduel déplace les compteurs de toutes les suites suivantes.
      await service.from("tracked_parcels").delete().eq("shop_id", pieton.shopId);
      await supprimerUtilisateur(pieton);
    }
  });

  test("et le quota redevient opposable dès que le compte repasse gratuit", async () => {
    // Le plan n'est pas un aiguillage qu'on franchit une fois : il est relu à
    // chaque insertion. Sans ce cas, un compte rétrogradé garderait le bénéfice
    // du plan qu'il ne paie plus.
    const { error } = await creer(1, "Redevenu gratuit");

    expect(error?.code).toBe("DL067");
  });
});
