import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  clientAnonyme,
  clientService,
  creerUtilisateur,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";

/**
 * LES ABONNEMENTS, ÉPROUVÉS EN BASE — décision de Wassim, 20/09/2026.
 *
 * « je veux que quand le mec a prix son abonnement et que il a payé via stripe
 * ou lemon squeezy et bah il a son abonnement automatiquement sur le saas ! »
 *
 * Ce fichier éprouve l'EFFET, jamais la déclaration : de vraies lignes, un vrai
 * utilisateur authentifié, et le plan relu en base après coup.
 */

let vendeur: UtilisateurDeTest;
let voisin: UtilisateurDeTest;
const service = clientService();

const dansNJours = (n: number): string =>
  new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString();

async function planDe(profilId: string): Promise<string | null> {
  const { data } = await service.from("profiles").select("plan").eq("id", profilId).single();
  return data?.plan ?? null;
}

async function appliquer(
  profilId: string,
  statut: string,
  finLe: string | null = null,
  abonnement = "sonde-" + profilId.slice(0, 8),
) {
  return await service.rpc("appliquer_abonnement", {
    p_provider: "lemon_squeezy",
    p_subscription_id: abonnement,
    p_profil: profilId,
    p_statut: statut,
    p_renews_at: null,
    p_ends_at: finLe,
  });
}

beforeAll(async () => {
  vendeur = await creerUtilisateur("abonnement-vendeur");
  voisin = await creerUtilisateur("abonnement-voisin");
}, 120_000);

afterAll(async () => {
  await supprimerUtilisateur(vendeur);
  await supprimerUtilisateur(voisin);
});

describe("La traduction d'un statut en plan", () => {
  const cas: readonly [string, string | null, string][] = [
    ["active", null, "pro"],
    ["on_trial", null, "pro"],
    // Le prélèvement a échoué, le fournisseur va réessayer. Couper au premier
    // échec punirait une carte expirée comme une résiliation.
    ["past_due", null, "pro"],
    ["expired", null, "gratuit"],
    ["unpaid", null, "gratuit"],
    ["paused", null, "gratuit"],
  ];

  test.each(cas)("« %s » donne %s", async (statut, finLe, attendu) => {
    const { data, error } = await service.rpc("plan_pour_statut", {
      p_statut: statut,
      p_ends_at: finLe,
    });
    expect(error, error?.message ?? "").toBeNull();
    expect(data).toBe(attendu);
  });

  test("RÉSILIÉ mais PAYÉ JUSQU'À LA FIN DU MOIS : le vendeur reste PRO", async () => {
    /*
     * ⚠️ C'EST LA RÈGLE QUI SE PERD LE PLUS FACILEMENT, ET LA PLUS CHÈRE.
     *
     * Chez Lemon Squeezy, `cancelled` ne veut PAS dire « coupé » : l'abonnement
     * est résilié mais COURT JUSQU'À `ends_at`. Un vendeur qui résilie le 2 du
     * mois a payé jusqu'au 30. Le couper à l'instant du clic lui vole ce qu'il
     * a réglé — et c'est le genre de défaut dont on n'entend parler qu'une
     * fois, en public.
     */
    const { data } = await service.rpc("plan_pour_statut", {
      p_statut: "cancelled",
      p_ends_at: dansNJours(28),
    });
    expect(data).toBe("pro");
  });

  test("RÉSILIÉ et la période est PASSÉE : il repasse gratuit", async () => {
    // Le contre-test de la règle ci-dessus : sans lui, un `cancelled` toujours
    // « pro » donnerait un abonnement à vie, gratuitement.
    const { data } = await service.rpc("plan_pour_statut", {
      p_statut: "cancelled",
      p_ends_at: dansNJours(-1),
    });
    expect(data).toBe("gratuit");
  });
});

describe("L'application d'un abonnement", () => {
  test("un compte neuf est GRATUIT avant tout paiement", async () => {
    // Sans ce point de départ, « il est passé pro » ne prouverait rien.
    expect(await planDe(vendeur.profilId)).toBe("gratuit");
  });

  test("un paiement le passe en PRO, et l'abonnement est consigné", async () => {
    const { data, error } = await appliquer(vendeur.profilId, "active");
    expect(error, error?.message ?? "").toBeNull();
    expect(data).toBe("pro");
    expect(await planDe(vendeur.profilId)).toBe("pro");

    const { data: lignes } = await service
      .from("subscriptions")
      .select("status, provider, provider_subscription_id")
      .eq("profile_id", vendeur.profilId);
    expect(lignes).toHaveLength(1);
    expect(lignes?.[0]?.status).toBe("active");
    expect(lignes?.[0]?.provider).toBe("lemon_squeezy");
  });

  test("REJOUER le même événement ne lève pas et ne duplique rien", async () => {
    /*
     * Un webhook se rejoue — c'est le comportement NORMAL du fournisseur quand
     * une réponse se perd. Un chemin d'idempotence qui lève transformerait une
     * reprise ordinaire en incident, et un `insert` sans `on conflict` ferait
     * de « l'abonnement courant » une question ouverte.
     */
    const { error } = await appliquer(vendeur.profilId, "active");
    expect(error, error?.message ?? "").toBeNull();

    const { data: lignes } = await service
      .from("subscriptions")
      .select("id")
      .eq("profile_id", vendeur.profilId);
    expect(lignes, "le rejeu a créé une seconde ligne").toHaveLength(1);
  });

  test("l'expiration le fait repasser GRATUIT", async () => {
    const { data } = await appliquer(vendeur.profilId, "expired");
    expect(data).toBe("gratuit");
    expect(await planDe(vendeur.profilId)).toBe("gratuit");
  });

  test("et l'interrupteur réservé au Pro RETOMBE avec le plan", async () => {
    // Même règle qu'en migration 167 : un réglage que le compte ne peut plus
    // tenir ne doit pas rester affiché comme levé dans « Ma marque ».
    await appliquer(vendeur.profilId, "active");
    await service
      .from("shops")
      .update({ hide_droplink_brand: true })
      .eq("owner_id", vendeur.profilId);

    await appliquer(vendeur.profilId, "expired");

    const { data } = await service
      .from("shops")
      .select("hide_droplink_brand")
      .eq("owner_id", vendeur.profilId)
      .single();
    expect(data?.hide_droplink_brand).toBe(false);
  });

  test("un profil INCONNU est refusé, jamais avalé", async () => {
    // Un paiement qu'on ne sait pas rattacher doit se signaler. S'il passait en
    // silence, il serait encaissé chez le fournisseur et sans effet ici — le
    // seul résultat que personne ne remarquerait.
    const { error } = await appliquer(
      "00000000-0000-4000-8000-000000000000",
      "active",
      null,
      "sonde-fantome",
    );
    expect(error).not.toBeNull();
    expect(error?.code).toBe("DL031");
  });
});

describe("Le budget de suivi se réconcilie avec le fournisseur", () => {
  /*
   * ⚠️ DÉFAUT RÉEL, TROUVÉ EN MESURANT LA PRODUCTION LE 20/09/2026 : notre base
   * comptait 2 prises en charge consommées, le fournisseur en annonçait 9.
   * L'alerte aurait donc annoncé « 198 restantes » quand il en restait 191 —
   * fausse DANS LE SENS RASSURANT, ce que ce dépôt interdit partout ailleurs.
   *
   * Sept unités avaient été payées avant le 06/09, par des suites qui visaient
   * encore la production, et leurs lignes effacées. L'argent, lui, était parti :
   * le fournisseur décompte à la prise en charge, pas au stockage de la ligne.
   *
   * CE QUE CE FICHIER ÉPROUVE : que le décalage est réellement ADDITIONNÉ. Un
   * réglage écrivable que rien ne lit produirait une ligne, une trace et un
   * affichage parfaitement crédibles — et ne changerait aucune alerte.
   */
  async function poser(cle: string, valeur: number | null): Promise<void> {
    if (valeur === null) {
      await service.from("system_settings").delete().eq("key", cle);
      return;
    }
    await service.from("system_settings").upsert({ key: cle, value: valeur as never });
  }

  async function budget() {
    const { data } = await service.rpc("etat_budget_suivi");
    return Array.isArray(data) ? data[0] : null;
  }

  afterAll(async () => {
    // Le décor est rendu : une clé laissée derrière ferait échouer la suite
    // suivante pour une raison qui n'est pas la sienne.
    await poser("budget_suivi_deja_consomme", null);
    await poser("budget_suivi_total", null);
  });

  test("sans décalage, « utilisées » ne compte que nos lignes", async () => {
    await poser("budget_suivi_deja_consomme", null);
    const avant = await budget();
    expect(avant, "la sonde ne lit rien").not.toBeNull();
    expect(Number(avant?.total)).toBe(200);
  });

  test("le décalage S'AJOUTE aux dépenses et RETIRE d'autant le reste", async () => {
    const avant = await budget();
    await poser("budget_suivi_deja_consomme", 7);
    const apres = await budget();

    expect(Number(apres?.utilisees) - Number(avant?.utilisees)).toBe(7);
    expect(Number(apres?.restantes)).toBe(Number(avant?.restantes) - 7);
  });

  test("le TOTAL ne bouge pas — il dit ce que le palier donne, pas ce qu'il reste", async () => {
    // Écrire 193 dans le total donnerait le bon reste aujourd'hui et mentirait
    // sur le palier réel, que plus personne ne pourrait retrouver.
    await poser("budget_suivi_deja_consomme", 7);
    expect(Number((await budget())?.total)).toBe(200);
  });

  test("le reste ne descend JAMAIS sous zéro", async () => {
    // Un négatif se lirait comme un crédit dans un message d'alerte.
    await poser("budget_suivi_deja_consomme", 100_000);
    expect(Number((await budget())?.restantes)).toBe(0);
  });
});

describe("Qui peut toucher aux abonnements", () => {
  test("`anon` ne peut PAS appliquer un abonnement", async () => {
    /*
     * ⚠️ SI CET APPEL PASSAIT, LE PRODUIT SERAIT GRATUIT POUR QUI SAIT LIRE.
     * PostgREST expose toute fonction exécutable : sans révocation, il
     * suffirait d'un POST sur `/rest/v1/rpc/appliquer_abonnement` avec la clé
     * publiable — qui est DANS le bundle — pour s'offrir le plan payant.
     */
    const { error } = await clientAnonyme().rpc("appliquer_abonnement", {
      p_provider: "lemon_squeezy",
      p_subscription_id: "attaque",
      p_profil: voisin.profilId,
      p_statut: "active",
      p_renews_at: null,
      p_ends_at: null,
    });
    expect(error, "anon a pu poser un plan payant").not.toBeNull();
    expect(await planDe(voisin.profilId)).toBe("gratuit");
  });

  test("un vendeur AUTHENTIFIÉ ne peut pas s'appliquer un abonnement", async () => {
    // Le contournement évident : être client du produit et s'auto-promouvoir.
    const { error } = await vendeur.client.rpc("appliquer_abonnement", {
      p_provider: "lemon_squeezy",
      p_subscription_id: "auto-promotion",
      p_profil: vendeur.profilId,
      p_statut: "active",
      p_renews_at: null,
      p_ends_at: null,
    });
    expect(error, "un vendeur a pu se poser le plan payant").not.toBeNull();
  });

  test("un vendeur lit SON abonnement, et celui de personne d'autre", async () => {
    await appliquer(vendeur.profilId, "active");
    await appliquer(voisin.profilId, "active", null, "sonde-voisin");

    const { data } = await vendeur.client.from("subscriptions").select("profile_id");
    expect(data, "le vendeur ne voit pas son propre abonnement").toHaveLength(1);
    expect(data?.[0]?.profile_id).toBe(vendeur.profilId);
  });

  test("un vendeur ne peut pas ÉCRIRE dans les abonnements", async () => {
    // Un abonnement n'est pas une déclaration de l'utilisateur : c'est un fait
    // du fournisseur. Pouvoir l'écrire reviendrait à pouvoir se payer soi-même.
    const { error } = await vendeur.client.from("subscriptions").insert({
      profile_id: vendeur.profilId,
      provider: "lemon_squeezy",
      provider_subscription_id: "ecriture-directe",
      status: "active",
    });
    expect(error, "un vendeur a pu écrire un abonnement").not.toBeNull();
  });

  test("`anon` ne lit RIEN du journal des paiements", async () => {
    // Il porte la charge brute des webhooks, donc les adresses e-mail des
    // vendeurs et les identifiants du fournisseur.
    const { data, error } = await clientAnonyme().from("payment_events").select("id");
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });
});
