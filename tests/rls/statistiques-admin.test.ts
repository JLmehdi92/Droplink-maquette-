import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { promouvoirAdmin } from "../aide/admin";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import {
  creerUtilisateur,
  passerEnPro,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";
import {
  ecart,
  lireCroissance,
  lireIndicateurs,
  lireSeries,
  lireTransporteurs,
  type IndicateursPlateforme,
} from "@/lib/audit/statistiques";

/**
 * LES STATISTIQUES DE LA PLATEFORME (migration 161).
 *
 * UNE SUITE QUI COMPTE TOUTE LA BASE NE PEUT PAS AFFIRMER DES TOTAUX : d'autres
 * suites y ont laissé leurs lignes. Elle mesure donc des ÉCARTS — compter,
 * insérer ce qu'on sait, recompter — et c'est possible parce que le projet
 * `rls` exécute ses fichiers un par un (`fileParallelism: false`).
 *
 * Chaque insertion est placée dans UNE fenêtre précise : la période courante,
 * la précédente, ou hors des deux. Une fonction qui confondrait deux fenêtres
 * compterait la ligne au mauvais endroit, et l'écart le dirait.
 */

let admin: UtilisateurDeTest;
let vendeur: UtilisateurDeTest;
let catalogue: Client;

const CODE_TRANSPORTEUR = 987_654_321;

async function commande(shopId: string, ilYA: string, vues = 0): Promise<string> {
  const l = await interroger<{ id: string }>(
    catalogue,
    `insert into public.orders (shop_id, customer_label, created_at, first_content_at, views_count)
     values ($1, 'stat-client', now() - $2::interval, now() - $2::interval, $3) returning id`,
    [shopId, ilYA, vues],
  );
  const id = l[0]?.id;
  if (id === undefined) throw new Error("commande non créée");
  return id;
}

async function media(orderId: string, type: "photo" | "video", position: number, ilYA: string): Promise<void> {
  const p = await interroger<{ p: string }>(catalogue, "select public.prefixe_media_attendu($1) as p", [orderId]);
  const prefixe = p[0]?.p;
  if (prefixe === undefined) throw new Error("préfixe introuvable");
  await interroger(
    catalogue,
    `insert into public.order_media (order_id, type, cle, taille_octets, position, created_at)
     values ($1, $2, $3, 1000, $4, now() - $5::interval)`,
    [orderId, type, `${prefixe}aaaaaaaa-0000-4000-8000-${String(position).padStart(12, "0")}.${type === "photo" ? "jpg" : "mp4"}`, position, ilYA],
  );
}

async function colis(shopId: string, numero: string, ilYA: string, livreEnJours: number | null): Promise<void> {
  await interroger(
    catalogue,
    `insert into public.tracked_parcels
       (shop_id, tracking_number, carrier_code, registered_at, created_at,
        normalized_status, first_movement_at, last_movement_at)
     values ($1, $2, $3, now() - $4::interval, now() - $4::interval,
             $5, $6::timestamptz, $7::timestamptz)`,
    livreEnJours === null
      ? [shopId, numero, CODE_TRANSPORTEUR, ilYA, "en_transit", null, null]
      : [
          shopId,
          numero,
          CODE_TRANSPORTEUR,
          ilYA,
          "livre",
          new Date(Date.now() - livreEnJours * 86_400_000 - 3_600_000).toISOString(),
          new Date(Date.now() - 3_600_000).toISOString(),
        ],
  );
}

const auJourdHui = (): string => new Date().toISOString().slice(0, 10);

let avant: IndicateursPlateforme;
let apres: IndicateursPlateforme;
let commandesDuJourAvant = 0;
let transporteurAvant = 0;
let moisCourantAvant = 0;

beforeAll(async () => {
  catalogue = await ouvrirConnexionCatalogue();
  admin = await creerUtilisateur("statistiques-admin");
  vendeur = await creerUtilisateur("statistiques-vendeur");
  await promouvoirAdmin(catalogue, admin);
  // PRO : depuis la 210 un compte gratuit ne crée que 5 commandes et ne fait suivre
  // que 5 colis à vie ; ce vendeur en reçoit 6 (dont une hors des deux fenêtres),
  // et ce test mesure les statistiques de la plateforme, pas le quota.
  await passerEnPro(vendeur);

  avant = await lireIndicateurs(admin.client, "30");
  commandesDuJourAvant = (await lireSeries(admin.client, "30")).find((j) => j.jour === auJourdHui())?.commandes ?? 0;
  transporteurAvant =
    (await lireTransporteurs(admin.client, "30")).find((t) => t.carrier_code === CODE_TRANSPORTEUR)?.nombre ?? 0;
  moisCourantAvant = (await lireCroissance(admin.client)).at(-1)?.commandes ?? 0;

  // Période courante : trois commandes, dont une consultée, deux photos et une vidéo.
  const c1 = await commande(vendeur.shopId, "1 hour", 2);
  await commande(vendeur.shopId, "2 hours");
  await commande(vendeur.shopId, "3 hours");
  await media(c1, "photo", 0, "1 hour");
  await media(c1, "photo", 1, "1 hour");
  await media(c1, "video", 2, "1 hour");
  // Période précédente (entre 30 et 60 jours) : deux commandes, dont une consultée.
  await commande(vendeur.shopId, "40 days", 1);
  await commande(vendeur.shopId, "45 days");
  // Hors des deux fenêtres : ne doit compter nulle part.
  await commande(vendeur.shopId, "70 days", 5);
  // Colis : un pris en charge maintenant et livré en 4 jours, un le mois précédent.
  await colis(vendeur.shopId, `STAT${Date.now()}A`, "2 hours", 4);
  await colis(vendeur.shopId, `STAT${Date.now()}B`, "40 days", null);

  apres = await lireIndicateurs(admin.client, "30");
}, 180_000);

afterAll(async () => {
  await supprimerUtilisateur(admin);
  await supprimerUtilisateur(vendeur);
  await catalogue.end();
});

describe("Qui peut lire les statistiques", () => {
  test("un vendeur est refusé par les quatre fonctions, sans apprendre qu'elles existent", async () => {
    const appels = [
      vendeur.client.rpc("statistiques_admin", { p_jours: 30 }),
      vendeur.client.rpc("statistiques_admin_par_jour", { p_jours: 30 }),
      vendeur.client.rpc("transporteurs_admin", { p_jours: 30 }),
      vendeur.client.rpc("croissance_admin"),
    ];
    for (const r of await Promise.all(appels)) {
      expect(r.error?.code).toBe("DL031");
    }
  });

  test("une fenêtre inconnue est refusée, jamais ramenée à une autre", async () => {
    for (const p_jours of [0, 8, 365, -30]) {
      const { error } = await admin.client.rpc("statistiques_admin", { p_jours });
      expect(error?.code, `fenêtre acceptée : ${p_jours}`).toBe("DL056");
    }
  });
});

describe("Les indicateurs comptent ce qu'on a posé, dans la bonne fenêtre", () => {
  test("commandes : +3 dans la période, +2 dans la précédente, rien pour celle de 70 jours", () => {
    expect(apres.commandes - avant.commandes).toBe(3);
    expect(apres.commandes_avant - avant.commandes_avant).toBe(2);
  });

  test("liens consultés : ceux qui ont au moins une ouverture, dans leur fenêtre", () => {
    expect(apres.liens_consultes - avant.liens_consultes).toBe(1);
    expect(apres.liens_consultes_avant - avant.liens_consultes_avant).toBe(1);
  });

  test("photos : les deux photos, jamais la vidéo", () => {
    expect(apres.photos - avant.photos).toBe(2);
  });

  test("comptes actifs : le vendeur compte UNE fois, quel que soit son nombre de commandes", () => {
    expect(apres.comptes_actifs - avant.comptes_actifs).toBe(1);
    expect(apres.comptes_actifs_avant - avant.comptes_actifs_avant).toBe(1);
  });

  test("colis pris en charge : un dans chaque fenêtre, lu sur registered_at", () => {
    expect(apres.colis - avant.colis).toBe(1);
    expect(apres.colis_avant - avant.colis_avant).toBe(1);
  });

  test("le délai moyen retient le colis livré de la période", () => {
    expect(apres.delai_colis - avant.delai_colis).toBe(1);
    expect(apres.delai_jours).not.toBeNull();
  });

  test("les types de compte ne dépassent jamais le total : le reste est l'onboarding non terminé", () => {
    expect(apres.fournisseurs + apres.revendeurs).toBeLessThanOrEqual(apres.comptes);
  });
});

describe("Les séries", () => {
  test("une ligne par jour, jours vides compris, jusqu'à aujourd'hui (UTC)", async () => {
    const series = await lireSeries(admin.client, "30");
    expect(series).toHaveLength(30);
    expect(series.at(-1)?.jour).toBe(auJourdHui());
    const jours = series.map((j) => j.jour);
    expect([...jours].sort()).toEqual(jours);
  });

  test("les trois commandes du jour sont sur la ligne du jour", async () => {
    const series = await lireSeries(admin.client, "30");
    const aujourdhui = series.find((j) => j.jour === auJourdHui());
    // Les commandes posées il y a une à trois heures peuvent tomber la veille
    // si la suite tourne peu après minuit UTC : on somme les deux derniers jours.
    const deuxDerniers = series.slice(-2).reduce((n, j) => n + j.commandes, 0);
    expect(deuxDerniers - commandesDuJourAvant).toBeGreaterThanOrEqual(3);
    expect(aujourdhui).toBeDefined();
  });

  test("un jour sans commande a un taux NUL, pas zéro : on n'a rien mesuré", async () => {
    const series = await lireSeries(admin.client, "90");
    const vide = series.find((j) => j.commandes === 0);
    // CONTRE-TEST : sur 90 jours d'une base de tests, un jour vide existe.
    expect(vide, "aucun jour vide sur 90 jours : le contrôle ne contrôle rien").toBeDefined();
    expect(vide?.taux_consultes).toBeNull();
  });
});

describe("Les transporteurs et la croissance", () => {
  test("le transporteur posé gagne UN colis sur 30 jours : celui de 40 jours est hors fenêtre", async () => {
    const t = await lireTransporteurs(admin.client, "30");
    expect((t.find((x) => x.carrier_code === CODE_TRANSPORTEUR)?.nombre ?? 0) - transporteurAvant).toBe(1);
  });

  test("neuf mois, le dernier est le mois courant, et il gagne les trois commandes", async () => {
    const c = await lireCroissance(admin.client);
    expect(c).toHaveLength(9);
    expect(c.at(-1)?.mois.slice(0, 7)).toBe(new Date().toISOString().slice(0, 7));
    expect((c.at(-1)?.commandes ?? 0) - moisCourantAvant).toBeGreaterThanOrEqual(3);
  });
});

describe("Ce que les fonctions rendent — et rien d'autre", () => {
  test("des colonnes de NOMBRES, inventoriées : une colonne de nom qui apparaîtrait rougirait ici", async () => {
    // INVENTORIER, PAS SÉLECTIONNER : ces fonctions n'écrivent pas d'audit
    // parce qu'elles ne rendent aucune donnée tierce. Le jour où l'une rendrait
    // une boutique ou une adresse, elle devrait tracer — ce test l'arrête avant.
    const { data: indicateurs } = await admin.client.rpc("statistiques_admin", { p_jours: 7 });
    const { data: series } = await admin.client.rpc("statistiques_admin_par_jour", { p_jours: 7 });
    const { data: transporteurs } = await admin.client.rpc("transporteurs_admin", { p_jours: 7 });
    const { data: croissance } = await admin.client.rpc("croissance_admin");
    const lignes = [indicateurs?.[0], series?.[0], transporteurs?.[0], croissance?.[0]];
    for (const ligne of lignes) {
      expect(ligne, "une fonction n'a rendu aucune ligne à inspecter").toBeDefined();
      for (const [cle, valeur] of Object.entries(ligne ?? {})) {
        const permis = typeof valeur === "number" || valeur === null || /^(jour|mois)$/.test(cle);
        expect(permis, `colonne non numérique : ${cle} = ${JSON.stringify(valeur)}`).toBe(true);
      }
    }
  });

  test("l'écart n'invente pas de base : de zéro, il n'y a pas de pourcentage", () => {
    expect(ecart(4, 0)).toBeNull();
    expect(ecart(null, 3)).toBeNull();
    expect(ecart(12, 10)).toBe(20);
    expect(ecart(8, 10)).toBe(-20);
  });
});
