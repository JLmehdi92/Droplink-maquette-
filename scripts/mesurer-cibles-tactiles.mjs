/**
 * LA ZONE REELLEMENT TOUCHABLE, MESUREE PAR SONDAGE DE POINTS.
 *
 * ⚠️ `getBoundingClientRect()` NE MESURE PAS CE QUE LE DOIGT ATTEINT. Un
 * pseudo-element `::before` etendu appartient a l element pour le test de
 * pointage, mais n entre PAS dans sa boite. Une sonde qui lit la boite declare
 * donc « 46x27 » sur un controle dont la zone active fait 46x44 — et ferait
 * corriger deux fois la meme chose, ou pire, conclure que la correction n a
 * rien fait.
 *
 * On demande donc au navigateur ce qu il ferait : `elementFromPoint` a chaque
 * point d une grille autour du centre. La zone rendue est celle des points qui
 * atteignent VRAIMENT la cible.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.test.local", quiet: true });
config({ path: ".env.local", quiet: true });

const base = (process.argv[2] ?? "").replace(/\/$/, "");
const largeur = Number(process.argv[3] ?? 390);
const urlSupabase = process.env["NEXT_PUBLIC_SUPABASE_URL"];
const service = createClient(urlSupabase, process.env["SUPABASE_SERVICE_ROLE_KEY"], {
  auth: { persistSession: false },
});
const publiable = createClient(urlSupabase, process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"], {
  auth: { persistSession: false },
});

const MOT_DE_PASSE = "Chariot-Lilas-Tempete-91";
const marque = Math.random().toString(36).slice(2, 8);
const courriel = `zone-${marque}@droplink-tests.invalid`;
const { data: cree, error: eCree } = await service.auth.admin.createUser({
  email: courriel,
  password: MOT_DE_PASSE,
  email_confirm: true,
});
if (eCree) throw new Error(eCree.message);
const userId = cree.user.id;
const { data: profil } = await service.from("profiles").select("id").eq("user_id", userId).single();
const { data: shop } = await service.from("shops").select("id").eq("owner_id", profil.id).single();
await service.from("shops").update({ name: "Atelier de mesure" }).eq("id", shop.id);
await service
  .from("profiles")
  .update({ account_type: "supplier", role: "admin" })
  .eq("id", profil.id);

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
  const SELECTEUR = 'a[href], button, [role="button"], input:not([type="hidden"]), select, textarea, summary';
  // La cible « atteinte » : le point tombe sur l element, sur un de ses
  // descendants, ou sur le <label> qui le commande.
  const atteint = (el, pt) => {
    if (pt === null) return false;
    if (pt === el || el.contains(pt)) return true;
    const lab = pt.closest ? pt.closest("label") : null;
    if (lab === null) return false;
    if (lab.contains(el)) return true;
    const pour = lab.getAttribute("for");
    return pour !== null && el.id === pour;
  };
  const zone = (el) => {
    // SANS CE DEFILEMENT, TOUT CE QUI EST SOUS LA LIGNE DE FLOTTAISON SORT DU
    // CADRE et elementFromPoint rend null : la sonde declarait alors
    // « recouvert » sur 67 controles dont la plupart sont parfaitement bons.
    el.scrollIntoView({ block: "center", inline: "center" });
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (!atteint(el, document.elementFromPoint(cx, cy))) return null; // reellement recouvert
    // Pas de 0,5 px : elementFromPoint exclut le bord, donc un pas entier
    // coute jusqu a 2 px sur la mesure d une zone de 44.
    const pousser = (dx, dy) => {
      let bon = 0;
      for (let d = 0.5; d <= 40; d += 0.5) {
        const x = cx + dx * d, y = cy + dy * d;
        if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) break;
        if (!atteint(el, document.elementFromPoint(x, y))) break;
        bon = d;
      }
      return bon;
    };
    return {
      l: +(pousser(-1, 0) + pousser(1, 0)).toFixed(1),
      h: +(pousser(0, -1) + pousser(0, 1)).toFixed(1),
    };
  };
  // ON OUVRE TOUS LES MENUS REPLIES AVANT DE MESURER. Une entree de menu ferme
  // n est pas une cible tactile — mais la declarer « legitime » sans l avoir
  // ouverte serait exactement l erreur qu on cherche a eviter : on ne saurait
  // pas si elle est conforme UNE FOIS OUVERTE, c est-a-dire quand le doigt la
  // vise reellement.
  for (const d of document.querySelectorAll("details")) d.open = true;
  const out = [];
  for (const el of document.querySelectorAll(SELECTEUR)) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const r = el.getBoundingClientRect();
    const srOnly = (el.getAttribute("class") || "").split(/\s+/).includes("sr-only");
    if (r.width === 0 && r.height === 0) continue;
    // UN ELEMENT sr-only N EST PAS UNE CIBLE TANT QU IL N A PAS LE FOCUS : il
    // fait 1x1 au repos et le point de son centre tombe sur ce qu il y a
    // derriere. Le mesurer au repos rend « recouvert » et ne dit rien. On le
    // mesure donc DANS L ETAT OU IL EST ATTEIGNABLE.
    if (srOnly) el.focus();
    const z = zone(el);
    if (srOnly) el.blur();
    const boite = { l: +r.width.toFixed(1), h: +r.height.toFixed(1) };
    if (z !== null && z.l >= 44 && z.h >= 44) continue;
    out.push({
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute("type") || null,
      texte: (el.innerText || el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 40),
      boite, zone: z, srOnly,
      classe: (el.getAttribute("class") || "").slice(0, 60),
    });
  }
  return { url: location.pathname, restants: out.length, elements: out };
})()`;

const { webSocketDebuggerUrl } = await (await fetch("http://127.0.0.1:9223/json/version")).json();
const nav = new WebSocket(webSocketDebuggerUrl);
await new Promise((r) => nav.addEventListener("open", r, { once: true }));
const brut = (methode, params = {}, sessionId) =>
  new Promise((resoudre, rejeter) => {
    const id = Math.floor(Math.random() * 1e9);
    const surMessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id !== id) return;
      nav.removeEventListener("message", surMessage);
      if (m.error) rejeter(new Error(JSON.stringify(m.error)));
      else resoudre(m.result);
    };
    nav.addEventListener("message", surMessage);
    nav.send(
      JSON.stringify(sessionId ? { id, sessionId, method: methode, params } : { id, method: methode, params }),
    );
  });

const { data: cmd } = await service
  .from("orders")
  .insert({ shop_id: shop.id, customer_label: "Client de mesure", product_ref: "REF-Z", status: "en_transit" })
  .select("id")
  .single();

/*
 * Les ecrans a mesurer.
 *
 * ⚠️ LA LISTE EST SURCHARGEABLE PAR LE QUATRIEME ARGUMENT, et c est la refonte
 * du design qui l a exigee : elle migre ecran par ecran, et chaque ecran veut
 * etre mesure SEUL — mesurer les quatorze a chaque fois noierait le seul
 * resultat qui compte sous treize deja connus. Sans argument, on retombe sur
 * l inventaire complet des surfaces authentifiees, qui reste la campagne de
 * reference.
 *
 * `node scripts/mesurer-cibles-tactiles.mjs <base> 390 /fr/connexion,/fr/inscription`
 */
const ecransDemandes = (process.argv[4] ?? "")
  .split(",")
  .map((c) => c.trim())
  .filter(Boolean);

const ECRANS_AUTHENTIFIES = [
  "/fr/commandes",
  `/fr/commandes/${cmd.id}`,
  "/fr/envois",
  "/fr/analyses",
  "/fr/marque",
  "/fr/admin",
  "/fr/admin/comptes",
  `/fr/admin/comptes/${profil.id}`,
  "/fr/admin/boutiques",
  "/fr/admin/journal",
  "/fr/admin/surveillance",
  "/fr/admin/parametres",
];

const rapport = [];
for (const chemin of ecransDemandes.length > 0 ? ecransDemandes : ECRANS_AUTHENTIFIES) {
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
    height: 844,
    deviceScaleFactor: 1,
    mobile: largeur < 700,
  });
  /* ⚠️ SANS CECI, `@media (pointer: coarse)` NE S APPLIQUE PAS — et le produit
   * en depend : `globals.css` y pose un plancher de 44 px sur les boutons, les
   * cases et les radios. `setDeviceMetricsOverride({mobile:true})` NE SUFFIT
   * PAS : il change la mise en page, pas la nature du pointeur. Une premiere
   * campagne a donc mesure un rendu A LA SOURIS en croyant tenir le telephone,
   * et a compte pour defauts des controles que le produit protege deja. */
  await envoyer("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await envoyer("Emulation.setEmitTouchEventsForMouse", { enabled: true, configuration: "mobile" });
  await envoyer("Page.enable", {});
  await envoyer("Page.navigate", { url: base + chemin });
  await new Promise((r) => setTimeout(r, 2600));
  const { result } = await envoyer("Runtime.evaluate", { expression: SONDE, returnByValue: true });
  rapport.push({ chemin, ...result.value });
  await brut("Target.closeTarget", { targetId });
}
nav.close();
console.log(JSON.stringify(rapport, null, 1));
await service.auth.admin.deleteUser(userId);
console.error("[purge] compte supprime.");
