import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { randomBytes } from "node:crypto";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import { clientService, creerUtilisateur, supprimerUtilisateur, type UtilisateurDeTest } from "../aide/utilisateurs";

/**
 * LE RGPD, ÉPROUVÉ EN BASE — audit du 29/09/2026.
 *
 * Quatre défauts confirmés, chacun avec son contre-test :
 *  1. La politique promettait qu'une demande d'e-mail de suivi NON CONFIRMÉE
 *     est effacée après vingt-quatre heures : rien ne l'effaçait.
 *  2. Les vues de page client (empreintes, pays) n'avaient aucune durée : 13 mois.
 *  3. Les archives de webhook de paiement n'avaient aucune durée : 3 ans.
 *  4. SUPPRIMER UN COMPTE PRO NE RÉSILIAIT PAS L'ABONNEMENT : le vendeur
 *     continuait d'être prélevé par Lemon Squeezy pour un compte qui n'existait
 *     plus. La base refuse désormais la suppression tant qu'un abonnement
 *     peut encore prélever.
 */

let bd: Client;
const service = clientService();
let vendeur: UtilisateurDeTest;
let commandeId: string;
const aSupprimer: UtilisateurDeTest[] = [];

const hex = (): string => randomBytes(32).toString("hex");

beforeAll(async () => {
  bd = await ouvrirConnexionCatalogue();
  vendeur = await creerUtilisateur("rgpd-vendeur");
  aSupprimer.push(vendeur);
  const { data, error } = await vendeur.client
    .from("orders")
    .insert({ shop_id: vendeur.shopId, customer_label: "Client RGPD" })
    .select("id")
    .single();
  if (error !== null) throw new Error("commande : " + error.message);
  commandeId = data.id as string;
}, 120_000);

afterAll(async () => {
  for (const u of aSupprimer) await supprimerUtilisateur(u).catch(() => undefined);
  await interroger(bd, "delete from public.payment_events where provider = 'sonde-rgpd'");
  await interroger(bd, "delete from public.comptes_supprimes where email like '%@droplink-test.invalid'");
  await bd.end();
});

async function purger(): Promise<Record<string, number>> {
  const { data, error } = await service.rpc("purger_donnees_expirees");
  expect(error, error?.message).toBeNull();
  return data as Record<string, number>;
}

describe("Ce que la politique de confidentialité promet est réellement effacé", () => {
  test("une demande d'e-mail non confirmée disparaît après 24 h — et pas avant", async () => {
    const perimee = `perimee-${Date.now()}@exemple.test`;
    const fraiche = `fraiche-${Date.now()}@exemple.test`;
    await interroger(
      bd,
      `insert into public.notification_requests (order_id, email, token_hash, expires_at, created_at)
       values ($1, $2, $3, now() - interval '1 hour', now() - interval '25 hours'),
              ($1, $4, $5, now() + interval '23 hours', now() - interval '1 hour')`,
      [commandeId, perimee, hex(), fraiche, hex()],
    );

    await purger();

    const restantes = await interroger<{ email: string }>(
      bd,
      "select email from public.notification_requests where order_id = $1",
      [commandeId],
    );
    const emails = restantes.map((r) => r.email);
    expect(emails, "la demande expirée est toujours en base").not.toContain(perimee);
    // CONTRE-TEST : une demande encore valable n'est pas touchée.
    expect(emails, "la purge a effacé une demande encore valable").toContain(fraiche);
  });

  test("une vue de plus de 13 mois disparaît, une vue récente reste, le compteur ne bouge pas", async () => {
    await interroger(
      bd,
      `insert into public.link_views (order_id, viewed_at, ip_hash, user_agent_hash)
       values ($1, now() - interval '14 months', $2, $3),
              ($1, now() - interval '11 months', $4, $5)`,
      [commandeId, hex(), hex(), hex(), hex()],
    );
    const avant = await interroger(bd, "select views_count from public.orders where id = $1", [commandeId]);

    await purger();

    const vues = await interroger<{ vieille: boolean }>(
      bd,
      "select viewed_at < now() - interval '13 months' as vieille from public.link_views where order_id = $1",
      [commandeId],
    );
    expect(vues.filter((r) => r.vieille), "une vue de 14 mois est restée").toHaveLength(0);
    expect(vues, "la purge a effacé la vue de 11 mois").toHaveLength(1);
    // Le compteur dénormalisé (027) est une MESURE : il ne doit pas reculer.
    const apres = await interroger(bd, "select views_count from public.orders where id = $1", [commandeId]);
    expect(apres[0]?.views_count).toBe(avant[0]?.views_count);
  });

  test("une archive de paiement de plus de 3 ans disparaît, une récente reste", async () => {
    await interroger(
      bd,
      `insert into public.payment_events (provider, event_name, signature, payload, issue, received_at)
       values ('sonde-rgpd', 'subscription_updated', $1, '{}'::jsonb, 'applique', now() - interval '37 months'),
              ('sonde-rgpd', 'subscription_updated', $2, '{}'::jsonb, 'applique', now() - interval '35 months')`,
      [hex(), hex()],
    );

    await purger();

    const restantes = await interroger<{ vieille: boolean }>(
      bd,
      "select received_at < now() - interval '3 years' as vieille from public.payment_events where provider = 'sonde-rgpd'",
    );
    expect(restantes.filter((r) => r.vieille), "une archive de 37 mois est restée").toHaveLength(0);
    expect(restantes, "la purge a effacé une archive de 35 mois").toHaveLength(1);
  });
});

describe("Les archives de paiement ne gardent aucune donnée personnelle du payeur", () => {
  // L'EFFET D'ABORD : une archive écrite avec la charge telle que le
  // fournisseur l'envoie. Sans ce test, l'inventaire ci-dessous passerait sur
  // une table vide — un ensemble vide passe tout.
  test("une charge complète est réduite à ses identifiants, statut et dates", async () => {
    const charge = {
      meta: {
        event_name: "subscription_created",
        test_mode: true,
        custom_data: { profil_id: "00000000-0000-4000-8000-000000000001", signature: "a".repeat(64) },
      },
      data: {
        id: "sonde-rgpd-charge",
        type: "subscriptions",
        attributes: {
          status: "active",
          renews_at: "2026-10-29T00:00:00Z",
          customer_id: 42,
          user_name: "Jeanne Payeuse",
          user_email: "jeanne.payeuse@exemple.test",
          card_brand: "visa",
          card_last_four: "4242",
          urls: { customer_portal: "https://boutique.lemonsqueezy.com/billing?signature=x" },
        },
      },
    };
    const lignes = await interroger<{ payload: typeof charge }>(
      bd,
      `insert into public.payment_events (provider, event_name, signature, payload, issue)
       values ('sonde-rgpd', 'subscription_created', $1, $2::jsonb, 'recu') returning payload`,
      [hex(), JSON.stringify(charge)],
    );
    const archivee = JSON.stringify(lignes[0]?.payload);
    for (const donnee of ["Jeanne Payeuse", "jeanne.payeuse@exemple.test", "visa", "4242", "customer_portal", "custom_data"]) {
      expect(archivee, `l'archive garde encore « ${donnee} »`).not.toContain(donnee);
    }
    // CONTRE-TEST : ce qui sert à rattacher et relire l'événement est gardé.
    expect(lignes[0]?.payload.data.id).toBe("sonde-rgpd-charge");
    expect(lignes[0]?.payload.data.attributes.status).toBe("active");
    expect(lignes[0]?.payload.data.attributes.customer_id).toBe(42);
  });

  // INVENTAIRE, pas sélection : on parcourt TOUTES les archives, quelle que soit
  // leur origine (webhook réel, fumée, rejeu), et on cherche les clés que le
  // fournisseur y met pour identifier le payeur.
  test("aucune archive ne porte nom, e-mail, carte, adresse ou lien signé", async () => {
    const rows = await interroger(
      bd,
      `select count(*)::int as n from public.payment_events
        where payload::text ~ '"(user_name|user_email|card_brand|card_last_four|customer_portal|update_payment_method|custom_data)"'`,
    );
    expect(rows[0]?.n, "des archives de paiement portent encore des données du payeur").toBe(0);
  });
});

describe("Supprimer un compte ne peut pas laisser un prélèvement courir", () => {
  async function abonner(u: UtilisateurDeTest, statut: string, finLe: string | null): Promise<void> {
    const { error } = await service.rpc("appliquer_abonnement", {
      p_provider: "lemon_squeezy",
      p_subscription_id: "sonde-rgpd-" + u.profilId.slice(0, 8),
      p_profil: u.profilId,
      p_statut: statut,
      p_renews_at: null,
      p_ends_at: finLe,
    });
    if (error !== null) throw new Error("abonnement : " + error.message);
  }

  test("un abonnement actif : la base REFUSE la suppression (DL077), le compte reste", async () => {
    const u = await creerUtilisateur("rgpd-pro-actif");
    aSupprimer.push(u);
    await abonner(u, "active", null);

    const { error } = await u.client.rpc("supprimer_mon_compte", { p_confirmation: u.email });
    expect(error?.code, "la suppression d'un compte encore prélevé a été acceptée").toBe("DL077");

    const { data } = await service.from("profiles").select("id").eq("id", u.profilId).maybeSingle();
    expect(data, "le compte a disparu malgré le refus").not.toBeNull();
  }, 60_000);

  test("un abonnement EN PAUSE bloque aussi : une pause peut reprendre seule, et le prélèvement avec (207)", async () => {
    // Doc Lemon Squeezy, « Pausing a subscription » : `resumes_at` REPREND
    // l'abonnement automatiquement. On ne stocke pas cette date : toute pause
    // est donc traitée comme un prélèvement possible.
    const u = await creerUtilisateur("rgpd-pro-pause");
    aSupprimer.push(u);
    await abonner(u, "paused", null);

    const { error } = await u.client.rpc("supprimer_mon_compte", { p_confirmation: u.email });
    expect(error?.code, "un compte en pause a été supprimé alors que la pause peut reprendre").toBe("DL077");
  }, 60_000);

  test("CONTRE-TEST : un abonnement résilié (plus de prélèvement) n'empêche pas la suppression", async () => {
    const u = await creerUtilisateur("rgpd-pro-resilie");
    aSupprimer.push(u);
    const dansDixJours = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString();
    await abonner(u, "cancelled", dansDixJours);

    const { error } = await u.client.rpc("supprimer_mon_compte", { p_confirmation: u.email });
    expect(error, error?.message).toBeNull();

    const { data } = await service.from("profiles").select("id").eq("id", u.profilId).maybeSingle();
    expect(data, "le compte résilié n'a pas été supprimé").toBeNull();
  }, 60_000);
});
