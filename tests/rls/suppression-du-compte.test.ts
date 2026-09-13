import { afterAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { randomUUID } from "node:crypto";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import {
  clientAnonyme,
  clientService,
  creerUtilisateur,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";

/**
 * LA SUPPRESSION PAR LE TITULAIRE — le geste le plus irréversible du produit.
 *
 * Ce qui doit tenir, et chaque propriété a son contre-test :
 *  1. TOUT PART : profil, boutique, commandes, médias, vues, colis, compte auth.
 *  2. RIEN NE PART CHEZ LE VOISIN — une suppression qui filtrerait mal serait la
 *     pire panne concevable du produit, et elle serait silencieuse.
 *  3. CE QUE L'HÉBERGEUR DOIT GARDER RESTE : adresse et dates, un an.
 *  4. LES OBJETS R2 SONT EN FILE avant que leurs lignes disparaissent : sans
 *     cela, les photos des clients resteraient dans le bucket sans plus aucune
 *     trace qu'elles existent.
 *  5. UN COMPTE SUSPENDU NE S'EFFACE PAS, et une confirmation fausse n'efface rien.
 */

let catalogue: Client;
const aSupprimer: UtilisateurDeTest[] = [];

async function ouvrir(): Promise<Client> {
  catalogue ??= await ouvrirConnexionCatalogue();
  return catalogue;
}

/** Un vendeur avec une commande, un média, une vue et un colis rattaché. */
async function vendeurGarni(etiquette: string) {
  const u = await creerUtilisateur(etiquette);
  aSupprimer.push(u);
  const service = clientService();
  const { data: commande, error } = await u.client
    .from("orders")
    .insert({ shop_id: u.shopId, customer_label: `Client ${etiquette}` })
    .select("id")
    .single();
  if (error !== null) throw new Error("commande : " + error.message);

  const cle = `medias/${u.shopId}/${commande.id}/${randomUUID()}.jpg`;
  const { error: eMedia } = await service.from("order_media").insert({
    order_id: commande.id,
    type: "photo",
    cle,
    position: 0,
    taille_octets: 1000,
    largeur: 10,
    hauteur: 10,
  });
  if (eMedia !== null) throw new Error("média : " + eMedia.message);

  const { data: colis, error: eColis } = await service
    .from("tracked_parcels")
    .insert({ shop_id: u.shopId, tracking_number: `DLKSUPP${Date.now()}${etiquette.length}`, carrier_code: 100003 })
    .select("id")
    .single();
  if (eColis !== null) throw new Error("colis : " + eColis.message);
  await service.from("order_parcels").insert({ order_id: commande.id, parcel_id: colis.id });

  return { u, commandeId: commande.id as string, cle, colisId: colis.id as string };
}

afterAll(async () => {
  for (const u of aSupprimer) {
    // Les comptes déjà supprimés par le test rendent une erreur : sans objet.
    await supprimerUtilisateur(u).catch(() => undefined);
  }
  const bd = await ouvrir();
  await interroger(bd, "delete from public.comptes_supprimes where email like '%@droplink-test.invalid'");
  await interroger(bd, "delete from public.purges_r2 where cle like 'medias/%' and demande_le > now() - interval '1 hour'");
  await bd.end();
});

describe("Supprimer le compte", () => {
  test("une confirmation fausse n'efface RIEN", async () => {
    const { u, commandeId } = await vendeurGarni("supp-faux");
    const { error } = await u.client.rpc("supprimer_mon_compte", { p_confirmation: "autre@droplink-test.invalid" });
    expect(error?.code).toBe("DL054");
    const { data } = await clientService().from("orders").select("id").eq("id", commandeId);
    expect(data ?? []).toHaveLength(1);
  }, 120_000);

  test("un compte SUSPENDU ne peut pas s'effacer", async () => {
    const { u, commandeId } = await vendeurGarni("supp-suspendu");
    const bd = await ouvrir();
    await interroger(bd, "update public.profiles set status = 'suspended' where id = $1", [u.profilId]);
    const { error } = await u.client.rpc("supprimer_mon_compte", { p_confirmation: u.email });
    expect(error?.code).toBe("DL053");
    const { data } = await clientService().from("orders").select("id").eq("id", commandeId);
    expect(data ?? []).toHaveLength(1);
  }, 120_000);

  test("tout part, le voisin reste, la conservation et la file de purge sont écrites", async () => {
    const cible = await vendeurGarni("supp-cible");
    const voisin = await vendeurGarni("supp-voisin");
    const bd = await ouvrir();

    const { data: cles, error } = await cible.u.client.rpc("supprimer_mon_compte", {
      p_confirmation: `  ${cible.u.email.toUpperCase()} `,
    });
    expect(error).toBeNull();
    expect(cles ?? []).toContain(cible.cle);

    // 1. Tout part — compté en base, par le rôle qui voit tout.
    const [restes] = await interroger<{ auth: string; profils: string; boutiques: string; commandes: string; medias: string; colis: string }>(
      bd,
      `select (select count(*) from auth.users where id = $1)::text as auth,
              (select count(*) from public.profiles where id = $2)::text as profils,
              (select count(*) from public.shops where id = $3)::text as boutiques,
              (select count(*) from public.orders where id = $4)::text as commandes,
              (select count(*) from public.order_media where cle = $5)::text as medias,
              (select count(*) from public.tracked_parcels where id = $6)::text as colis`,
      [cible.u.userId, cible.u.profilId, cible.u.shopId, cible.commandeId, cible.cle, cible.colisId],
    );
    expect(restes).toEqual({ auth: "0", profils: "0", boutiques: "0", commandes: "0", medias: "0", colis: "0" });

    // 2. Le voisin garde tout.
    const [voisinReste] = await interroger<{ commandes: string; medias: string; colis: string }>(
      bd,
      `select (select count(*) from public.orders where id = $1)::text as commandes,
              (select count(*) from public.order_media where cle = $2)::text as medias,
              (select count(*) from public.tracked_parcels where id = $3)::text as colis`,
      [voisin.commandeId, voisin.cle, voisin.colisId],
    );
    expect(voisinReste).toEqual({ commandes: "1", medias: "1", colis: "1" });

    // 3. La conservation : adresse et dates, un an.
    const conservation = await interroger<{ email: string; un_an: boolean }>(
      bd,
      `select email, (conserver_jusqu_au - supprime_le) between interval '364 days' and interval '366 days' as un_an
         from public.comptes_supprimes where user_id = $1`,
      [cible.u.userId],
    );
    expect(conservation).toEqual([{ email: cible.u.email, un_an: true }]);

    // 4. L'objet R2 est en file ; celui du voisin non.
    const file = await interroger<{ cle: string }>(bd, "select cle from public.purges_r2 where cle = any($1)", [
      [cible.cle, voisin.cle],
    ]);
    expect(file.map((l) => l.cle)).toEqual([cible.cle]);
  }, 180_000);
});

describe("Supprimer toutes les données", () => {
  test("les commandes et les colis partent, le compte et la boutique restent, le voisin aussi", async () => {
    const cible = await vendeurGarni("donnees-cible");
    const voisin = await vendeurGarni("donnees-voisin");
    const bd = await ouvrir();

    const { data: cles, error } = await cible.u.client.rpc("supprimer_mes_donnees", { p_confirmation: cible.u.email });
    expect(error).toBeNull();
    expect(cles ?? []).toContain(cible.cle);

    const [etat] = await interroger<{ profils: string; boutiques: string; commandes: string; colis: string; voisin: string; voisin_colis: string }>(
      bd,
      `select (select count(*) from public.profiles where id = $1)::text as profils,
              (select count(*) from public.shops where id = $2)::text as boutiques,
              (select count(*) from public.orders where shop_id = $2)::text as commandes,
              (select count(*) from public.tracked_parcels where shop_id = $2)::text as colis,
              (select count(*) from public.orders where id = $3)::text as voisin,
              (select count(*) from public.tracked_parcels where id = $4)::text as voisin_colis`,
      [cible.u.profilId, cible.u.shopId, voisin.commandeId, voisin.colisId],
    );
    expect(etat).toEqual({ profils: "1", boutiques: "1", commandes: "0", colis: "0", voisin: "1", voisin_colis: "1" });

    // Pas de conservation : le compte existe encore.
    const conservation = await interroger(bd, "select 1 from public.comptes_supprimes where user_id = $1", [cible.u.userId]);
    expect(conservation).toHaveLength(0);
  }, 180_000);
});

describe("Qui peut appeler quoi", () => {
  test("un anonyme n'appelle aucune des deux suppressions", async () => {
    for (const f of ["supprimer_mon_compte", "supprimer_mes_donnees"] as const) {
      const { error } = await clientAnonyme().rpc(f, { p_confirmation: "x@y.invalid" });
      expect(error?.code, f).toBe("42501");
    }
  }, 60_000);

  test("un vendeur ne lit ni la conservation ni la file, et n'appelle pas la veille", async () => {
    const u = await creerUtilisateur("supp-droits");
    aSupprimer.push(u);
    for (const table of ["comptes_supprimes", "purges_r2"] as const) {
      const { error } = await u.client.from(table).select("*").limit(1);
      expect(error?.code, table).toBe("42501");
    }
    for (const [f, args] of [
      ["cles_a_purger", { p_limite: 10 }],
      ["purges_effectuees", { p_cles: ["x"] }],
      ["purger_comptes_supprimes", {}],
      ["mettre_en_file_la_boutique", { p_shop: u.shopId, p_avec_logo: true }],
    ] as const) {
      const { error } = await u.client.rpc(f, args);
      expect(error?.code, f).toBe("42501");
    }
  }, 60_000);
});
