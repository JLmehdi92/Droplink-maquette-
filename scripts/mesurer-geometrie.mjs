/**
 * LA GEOMETRIE DES BOUTONS D ACTION, AVANT ET APRES.
 *
 * ⚠️ REPRENDRE UN BOUTON DANS UN COMPOSANT PARTAGE DEPLACE DES PIXELS SANS
 * PREVENIR : la grille interne avale le `gap-*` de l appelant, le texte se
 * recentre, la largeur se cale sur le libellé le plus long. La regle de
 * conformite du projet est « au millimetre pres » — donc on mesure, on ne
 * raisonne pas.
 *
 * On releve la BOITE du bouton et la position du TEXTE a l interieur : c est ce
 * second nombre qui trahit un ecart d icone modifie.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.test.local", quiet: true });
config({ path: ".env.local", quiet: true });

const base = (process.argv[2] ?? "").replace(/\/$/, "");
const urlSupabase = process.env["NEXT_PUBLIC_SUPABASE_URL"];
const service = createClient(urlSupabase, process.env["SUPABASE_SERVICE_ROLE_KEY"], {
  auth: { persistSession: false },
});
const publiable = createClient(urlSupabase, process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"], {
  auth: { persistSession: false },
});

const MOT_DE_PASSE = "Chariot-Lilas-Tempete-91";
const courriel = `geo-${Math.random().toString(36).slice(2, 8)}@droplink-tests.invalid`;
const { data: cree } = await service.auth.admin.createUser({
  email: courriel,
  password: MOT_DE_PASSE,
  email_confirm: true,
});
const userId = cree.user.id;
const { data: profil } = await service.from("profiles").select("id").eq("user_id", userId).single();
const { data: shop } = await service.from("shops").select("id").eq("owner_id", profil.id).single();
await service.from("shops").update({ name: "Atelier de mesure" }).eq("id", shop.id);
await service.from("profiles").update({ account_type: "supplier" }).eq("id", profil.id);
const { data: cmd } = await service
  .from("orders")
  .insert({ shop_id: shop.id, customer_label: "Client de mesure", product_ref: "REF-G" })
  .select("id")
  .single();

const { data: sess } = await publiable.auth.signInWithPassword({
  email: courriel,
  password: MOT_DE_PASSE,
});
const ref = new URL(urlSupabase).hostname.split(".")[0];
const s = sess.session;
const mince = {
  access_token: s.access_token,
  refresh_token: s.refresh_token,
  token_type: s.token_type,
  expires_in: s.expires_in,
  expires_at: s.expires_at,
  user: {
    id: s.user.id,
    aud: s.user.aud,
    role: s.user.role,
    email: s.user.email,
    app_metadata: {},
    user_metadata: {},
    created_at: s.user.created_at,
  },
};
const valeur = "base64-" + Buffer.from(JSON.stringify(mince)).toString("base64");
const cookies =
  valeur.length <= 3180
    ? [{ name: `sb-${ref}-auth-token`, value: valeur }]
    : (valeur.match(/.{1,3180}/g) ?? []).map((m, i) => ({
        name: `sb-${ref}-auth-token.${i}`,
        value: m,
      }));

const SONDE = String.raw`(() => {
  const boiteTexte = (el) => {
    const noeuds = [];
    const parcourir = (n) => { for (const e of n.childNodes) {
      if (e.nodeType === 3 && e.textContent.trim()) noeuds.push(e);
      else if (e.nodeType === 1) parcourir(e);
    } };
    parcourir(el);
    for (const n of noeuds) {
      const r = document.createRange(); r.selectNodeContents(n);
      const bo = r.getBoundingClientRect();
      if (bo.height > 0 && bo.width > 0) return bo;
    }
    return null;
  };
  const out = [];
  for (const el of document.querySelectorAll("button")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    const texte = (el.innerText || el.textContent || "").trim().slice(0, 26);
    if (texte === "") continue;
    const bt = boiteTexte(el);
    out.push({
      texte,
      boite: [+r.width.toFixed(1), +r.height.toFixed(1)],
      // Le décalage du texte DANS le bouton : c est lui qui bouge quand l ecart
      // icone/mot change.
      texteDansBouton: bt ? +(bt.left - r.left).toFixed(1) : null,
      y: +r.top.toFixed(1),
    });
  }
  return out;
})()`;

const { webSocketDebuggerUrl } = await (await fetch("http://127.0.0.1:9223/json/version")).json();
const nav = new WebSocket(webSocketDebuggerUrl);
await new Promise((r) => nav.addEventListener("open", r, { once: true }));
const brut = (m, p = {}, sid) =>
  new Promise((res, rej) => {
    const id = Math.floor(Math.random() * 1e9);
    const f = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id !== id) return;
      nav.removeEventListener("message", f);
      if (msg.error) rej(new Error(JSON.stringify(msg.error)));
      else res(msg.result);
    };
    nav.addEventListener("message", f);
    nav.send(JSON.stringify(sid ? { id, sessionId: sid, method: m, params: p } : { id, method: m, params: p }));
  });

const rapport = [];
for (const [chemin, largeur] of [
  ["/fr/commandes", 1280],
  ["/fr/commandes", 390],
  [`/fr/commandes/${cmd.id}`, 390],
  ["/fr/marque", 390],
]) {
  const { targetId } = await brut("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await brut("Target.attachToTarget", { targetId, flatten: true });
  const envoyer = (m, p) => brut(m, p, sessionId);
  await envoyer("Network.enable", {});
  await envoyer("Network.setExtraHTTPHeaders", { headers: { "x-real-ip": "203.0.113.7" } });
  for (const c of cookies) {
    await envoyer("Network.setCookie", {
      name: c.name,
      value: c.value,
      domain: new URL(base).hostname,
      path: "/",
    });
  }
  await envoyer("Emulation.setDeviceMetricsOverride", {
    width: largeur,
    height: 900,
    deviceScaleFactor: 1,
    mobile: largeur < 700,
  });
  await envoyer("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await envoyer("Page.enable", {});
  await envoyer("Page.navigate", { url: base + chemin });
  await new Promise((r) => setTimeout(r, 2600));
  const { result } = await envoyer("Runtime.evaluate", { expression: SONDE, returnByValue: true });
  rapport.push({ chemin: chemin.replace(/\/[0-9a-f-]{36}/, "/{id}"), largeur, boutons: result.value });
  await brut("Target.closeTarget", { targetId });
}
nav.close();
console.log(JSON.stringify(rapport, null, 1));
await service.auth.admin.deleteUser(userId);
console.error("[purge] compte supprime.");
