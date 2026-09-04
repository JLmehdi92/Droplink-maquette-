/**
 * LE POINT DE RÉCEPTION 17TRACK ACCEPTE-T-IL CE QU'IL DOIT ACCEPTER ?
 *
 * ⚠️ ON NE SAVAIT QUE LA MOITIÉ DE LA CHOSE. Les mesures de déploiement avaient
 * établi que la route REFUSE — 401 sans signature, 401 sur une signature fausse,
 * 405 en GET. C'est nécessaire et ça ne prouve rien de ce qui compte : *une
 * suite où tout est refusé passe à 100 % sans rien prouver*. Une route qui
 * refuserait TOUT, y compris les vraies notifications, rendrait exactement les
 * mêmes trois codes — et la page du client ne bougerait jamais, sans une ligne
 * d'erreur nulle part.
 *
 * Cette sonde ferme l'autre moitié : elle fabrique la notification que 17TRACK
 * enverra, la SIGNE comme eux, et exige que le colis bouge en base ET sur la
 * page du client.
 *
 * ⚠️ ELLE NE COÛTE AUCUN QUOTA. Elle n'appelle jamais 17TRACK : elle imite leur
 * appel ENTRANT. Le palier gratuit est de 200 prises en charge À VIE, pas par
 * mois — une sonde qui en consommerait une à chaque exécution serait pire que
 * pas de sonde du tout.
 *
 *   node scripts/verifier-notification.mjs https://droplink.fr
 *
 * Signature : `sha256(corpsBrut + "/" + TRACKING_API_KEY)`, en hexadécimal
 * minuscule, portée par l'en-tête `sign` ou `x-17track-signature`. Le corps
 * BRUT fait foi — le re-sérialiser changerait l'ordre des clefs et les espaces,
 * donc la signature.
 */

import { createHash } from "node:crypto";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { fetchResilient } from "./transport.mjs";

config({ path: ".env.local", quiet: true });

const base = (process.argv[2] ?? "").replace(/\/$/, "");
if (!base.startsWith("http")) {
  console.error("Usage : node scripts/verifier-notification.mjs <base-url>");
  process.exit(2);
}

const cle = process.env["TRACKING_API_KEY"];
if (!cle || cle.trim() === "") {
  console.error(
    "TRACKING_API_KEY absente en local : la sonde ne peut pas signer, donc elle\n" +
      "ne peut rien prouver. Une mesure impossible se dit impossible.",
  );
  process.exit(2);
}

const service = createClient(
  process.env["NEXT_PUBLIC_SUPABASE_URL"],
  process.env["SUPABASE_SERVICE_ROLE_KEY"],
  { auth: { persistSession: false } },
);

const controles = [];
const constate = (ok, libelle) => controles.push([ok, libelle]);

const poster = async (corps, signature) => {
  const enTetes = { "content-type": "application/json" };
  if (signature !== null) enTetes["sign"] = signature;
  const r = await fetchResilient(`${base}/api/suivi/notification`, {
    method: "POST",
    headers: enTetes,
    body: corps,
  });
  await r.arrayBuffer().catch(() => undefined);
  return r.status;
};

const signer = (corps) => createHash("sha256").update(corps + "/" + cle, "utf8").digest("hex");

let compte = null;

try {
  // ── LE JEU DE MESURE ──
  //
  // Un numéro à nous, jamais déposé chez 17TRACK. L'unicité est
  // `(shop_id, tracking_number)` : un numéro inventé sur une boutique jetable
  // ne peut heurter aucun colis réel.
  const numero = `SONDE${Date.now()}FR`;
  const courriel = `fumee-${Date.now()}@exemple.test`;

  const { data: u, error: e } = await service.auth.admin.createUser({
    email: courriel,
    email_confirm: true,
    password: "Chariot-Lilas-Tempete-91",
  });
  if (e !== null || !u?.user) throw new Error(`compte non créé : ${e?.message}`);
  compte = u.user.id;

  const { data: p } = await service
    .from("profiles")
    .select("id")
    .eq("user_id", compte)
    .maybeSingle();
  await service.from("profiles").update({ account_type: "reseller" }).eq("id", p.id);

  const { data: shop } = await service
    .from("shops")
    .select("id")
    .eq("owner_id", p.id)
    .maybeSingle();

  const { data: cmd } = await service
    .from("orders")
    .insert({
      shop_id: shop.id,
      customer_label: "Client de mesure",
      product_ref: "REF-NOTIF",
      tracking_number: numero,
    })
    .select("id, public_token")
    .single();

  const { data: colis, error: eColis } = await service
    .from("tracked_parcels")
    .insert({ shop_id: shop.id, tracking_number: numero })
    .select("id")
    .single();
  if (eColis !== null) throw new Error(`colis de mesure non créé : ${eColis.message}`);
  await service.from("order_parcels").insert({ order_id: cmd.id, parcel_id: colis.id });

  console.log(`  jeu de mesure : ${numero} — /p/${cmd.public_token}`);

  /*
   * LA NOTIFICATION, DANS LEUR FORME. `event` + `data.number` +
   * `data.track_info`, avec un point de passage daté. Elle est écrite UNE FOIS
   * en chaîne et signée telle quelle : la re-sérialiser changerait les octets
   * sur lesquels porte la signature.
   */
  const instant = new Date(Date.now() - 60_000).toISOString().replace(/\.\d{3}Z$/, "+00:00");
  const corps = JSON.stringify({
    event: "TRACKING_UPDATED",
    data: {
      number: numero,
      track_info: {
        latest_status: { status: "InTransit" },
        latest_event: {
          time_iso: instant,
          description: "Depart du centre de tri",
          location: "Paris",
          stage: "InTransit",
        },
        tracking: {
          providers: [
            {
              events: [
                {
                  time_iso: instant,
                  description: "Depart du centre de tri",
                  location: "Paris",
                  stage: "InTransit",
                },
              ],
            },
          ],
        },
      },
    },
  });

  // ── CONTRE-TESTS : LA ROUTE REFUSE CE QU'ELLE DOIT REFUSER ──
  //
  // Ils viennent en premier. Sans eux, un « 200 » plus bas serait tout aussi
  // vrai d'une route qui accepte n'importe quoi.
  constate((await poster(corps, null)) === 401, "CONTRE-TEST : non signée -> 401");
  constate(
    (await poster(corps, "0".repeat(64))) === 401,
    "CONTRE-TEST : signature fausse -> 401",
  );
  // Un octet changé APRÈS la signature : c'est la falsification que la
  // signature existe pour attraper, et elle est plus fine que « pas de clé ».
  constate(
    (await poster(corps.replace("Paris", "Lyonn"), signer(corps))) === 401,
    "CONTRE-TEST : corps modifié après signature -> 401",
  );

  // ── CE QU'ELLE ACCEPTE ──
  const statut = await poster(corps, signer(corps));
  constate(statut === 200, `une notification VRAIMENT signée est acceptée (${statut})`);

  // ── ET CE QU'ELLE EN FAIT : « il répond » ne prouve pas qu'il a accepté ──
  //
  // C'est L-024. Un point d'ingestion qui rend 200 peut n'avoir rien écrit.
  const { data: apres } = await service
    .from("tracked_parcels")
    .select("normalized_status, last_movement_at")
    .eq("id", colis.id)
    .single();
  constate(
    apres?.normalized_status === "en_transit",
    `le colis a changé d'état en base (${apres?.normalized_status})`,
  );
  constate(apres?.last_movement_at !== null, "la date du dernier mouvement est écrite");

  const { count } = await service
    .from("parcel_checkpoints")
    .select("id", { count: "exact", head: true })
    .eq("parcel_id", colis.id);
  constate(count === 1, `le point de passage est enregistré (${count})`);

  // ── ET SURTOUT : LE CLIENT LE VOIT ──
  //
  // Tout ce qui précède peut être vrai pendant que la page reste périmée : le
  // cache est le mode de défaillance silencieux de ce produit.
  const r = await fetchResilient(`${base}/p/${cmd.public_token}`, {
    headers: { "user-agent": "sonde-notification/1", accept: "text/html" },
  });
  const html = await r.text();
  constate(r.status === 200, `la page client répond (${r.status})`);
  constate(
    html.includes("Depart du centre de tri"),
    "le point de passage apparaît SUR LA PAGE DU CLIENT",
  );

  // ── UN REJEU NE COMPTE PAS DEUX FOIS ──
  //
  // Leur point de réception réémet en cas de doute. Sans dédoublonnage, la
  // frise du client se remplirait de doublons à chaque réémission.
  constate((await poster(corps, signer(corps))) === 200, "un rejeu est accepté");
  const { count: apresRejeu } = await service
    .from("parcel_checkpoints")
    .select("id", { count: "exact", head: true })
    .eq("parcel_id", colis.id);
  constate(apresRejeu === 1, `le rejeu n'a PAS dupliqué le passage (${apresRejeu})`);
} catch (erreur) {
  constate(false, `la sonde s'est interrompue : ${erreur.message}`);
} finally {
  if (compte !== null) {
    const { error } = await service.auth.admin.deleteUser(compte);
    if (error !== null) console.error(`⚠️ compte ${compte} NON supprimé : ${error.message}`);
  }
}

const PLANCHER = 10;
console.log("");
for (const [ok, l] of controles) console.log(`  ${ok ? "OK  " : "ÉCART"} ${l}`);
const ecarts = controles.filter(([ok]) => !ok).length;
console.log(
  `\n${controles.length} contrôle(s), ${ecarts} écart(s)` +
    (controles.length < PLANCHER ? ` — INSUFFISANT, il en faut ${PLANCHER}` : ""),
);
process.exit(ecarts > 0 || controles.length < PLANCHER ? 1 : 0);
