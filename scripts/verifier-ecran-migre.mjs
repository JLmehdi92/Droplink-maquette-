/**
 * LA CHECK-LIST D UN ECRAN MIGRE, EXECUTEE.
 *
 * ⚠️ POURQUOI UN OUTIL PLUTOT QUE ONZE MESURES A LA MAIN. La refonte du design
 * migre une vingtaine d ecrans, et la consigne de Wassim est la meme pour
 * chacun : bureau, telephone a 390 px, les trois langues, `prefers-reduced-motion`,
 * puis les portes. Refaire la check-list a la main a chaque ecran, c est
 * l oublier au troisieme — et l oubli ne se voit pas, puisqu il ne produit
 * aucune ligne.
 *
 * ⚠️ IL EMULE REELLEMENT LE TACTILE, et il l AFFIRME. `setDeviceMetricsOverride`
 * change la mise en page, PAS la nature du pointeur : sans
 * `setTouchEmulationEnabled`, `@media (pointer: coarse)` ne s applique jamais et
 * le plancher de 44 px de `globals.css` non plus. La sonde rend `coarse` dans
 * son rapport ; un rapport ou il vaut `false` ne decrit pas un telephone.
 *
 * ⚠️ IL SE SERT CONTRE LA BASE DE TESTS, JAMAIS LA PRODUCTION. Il cree son
 * compte, mesure, et le purge. L ordre de chargement `.env.test.local` d abord
 * est une propriete de securite, pas un detail (L-032).
 *
 * Usage :
 *   node scripts/verifier-ecran-migre.mjs <base> "<routes>" [largeurs] [dossier de captures]
 *   node scripts/verifier-ecran-migre.mjs http://localhost:3000 "/fr/commandes" 1440,390
 */
import { config } from "dotenv";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.test.local", quiet: true });
config({ path: ".env.local", quiet: true });

const base = (process.argv[2] ?? "").replace(/\/$/, "");
const routes = (process.argv[3] ?? "")
  .split(",")
  .map((r) => r.trim())
  .filter(Boolean);
/*
 * ⚠️ LA CAPTURE EXISTE PARCE QUE LES NOMBRES NE DISENT PAS TOUT. Le rapport
 * etablit qu un ecran ne deborde pas, qu il a un seul `h1` et aucune cible sous
 * 44 px — il ne dit RIEN de sa ressemblance avec la reference, qui est
 * pourtant la consigne : « comparer a la page de reference, valeur par valeur ».
 * Deux fois deja, un ecran a passe tous les seuils en rendant autre chose que
 * ce qui etait dessine.
 *
 * Elle est FACULTATIVE et hors du chemin par defaut : une capture ne se compare
 * pas toute seule, c est un oeil qui la lit.
 */
const dossierCaptures = process.argv[5] ?? null;
const largeurs = (process.argv[4] ?? "1440,390")
  .split(",")
  .map((l) => Number(l.trim()))
  .filter((l) => Number.isFinite(l));

if (base === "" || routes.length === 0) {
  console.error('usage : node scripts/verifier-ecran-migre.mjs <base> "/fr/commandes,/fr/envois" [1440,390]');
  process.exit(1);
}

const urlSupabase = process.env["NEXT_PUBLIC_SUPABASE_URL"];
const refProd = process.env["SUPABASE_PROJECT_REF"];
if (refProd !== undefined && (urlSupabase ?? "").includes(refProd)) {
  console.error(`ARRET : la base visee est la PRODUCTION (${urlSupabase}).`);
  process.exit(1);
}

const service = createClient(urlSupabase, process.env["SUPABASE_SERVICE_ROLE_KEY"], {
  auth: { persistSession: false },
});
const publiable = createClient(urlSupabase, process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"], {
  auth: { persistSession: false },
});

const MOT_DE_PASSE = "Chariot-Lilas-Tempete-91";
const marque = Math.random().toString(36).slice(2, 8);
const courriel = `ecran-${marque}@droplink-tests.invalid`;
const { data: cree, error: eCree } = await service.auth.admin.createUser({
  email: courriel,
  password: MOT_DE_PASSE,
  email_confirm: true,
});
if (eCree) throw new Error(eCree.message);

const { data: profil } = await service
  .from("profiles")
  .select("id")
  .eq("user_id", cree.user.id)
  .single();
await service.from("profiles").update({ account_type: "reseller", role: "admin" }).eq("id", profil.id);
const { data: shop } = await service.from("shops").select("id").eq("owner_id", profil.id).single();
await service.from("shops").update({ name: "Atelier de verification" }).eq("id", shop.id);
/*
 * ⚠️ QUATRE COMMANDES, UNE PAR STATUT, ET PAS UNE SEULE.
 *
 * Avec une seule ligne en transit, la sonde ne voyait qu UNE pastille de statut
 * sur quatre et des compteurs a zero — donc elle ne pouvait pas rougir sur une
 * teinte oubliee ni sur un chiffre a deux caracteres. Un jeu qui n exerce qu un
 * cas certifie ce cas et se tait sur les autres.
 */
const { data: commandes } = await service
  .from("orders")
  .insert(
    [
      ["Client de verification", "REF-V", "en_transit"],
      ["Cliente en preparation", "REF-P", "preparation"],
      ["Client expedie", "REF-E", "expedie"],
      ["Cliente livree", "REF-L", "livre"],
    ].map(([customer_label, product_ref, status]) => ({
      shop_id: shop.id,
      customer_label,
      product_ref,
      status,
    })),
  )
  .select("id");

/*
 * ⚠️ LES ECRANS DE DETAIL ONT UN IDENTIFIANT DANS LEUR URL, et on ne peut pas
 * l ecrire a l avance. Le jeton `{commande}` dans une route est remplace par
 * l identifiant de la premiere commande creee : sans lui, `/fr/commandes/[id]`
 * — l editeur, l ecran le plus dense du produit — n etait tout simplement pas
 * mesurable par cet outil.
 */
const idCommande = commandes?.[0]?.id ?? "";

const { data: sess } = await publiable.auth.signInWithPassword({
  email: courriel,
  password: MOT_DE_PASSE,
});

/*
 * ⚠️ LE COOKIE DE SESSION N EST PAS `sb-access-token`. Supabase le nomme
 * `sb-<ref>-auth-token` et y met la session ENTIERE, encodee en base64 avec un
 * prefixe litteral. Poser deux cookies aux noms inventes ne leve rien : le
 * middleware ne trouve pas de session, redirige vers la connexion, et la sonde
 * mesure l ecran de connexion en croyant mesurer le tableau de bord. C est
 * exactement ce qui s est produit au premier essai.
 *
 * Au-dela de 3180 octets le cookie est decoupe en `.0`, `.1`, … — un compte
 * reel depasse cette borne des que ses metadonnees grossissent.
 */
const s = sess.session;
const ref = new URL(urlSupabase).hostname.split(".")[0];
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
const valeurCookie = "base64-" + Buffer.from(JSON.stringify(mince)).toString("base64");
const cookies =
  valeurCookie.length <= 3180
    ? [{ name: `sb-${ref}-auth-token`, value: valeurCookie }]
    : (valeurCookie.match(/.{1,3180}/g) ?? []).map((m, i) => ({
        name: `sb-${ref}-auth-token.${i}`,
        value: m,
      }));

const { webSocketDebuggerUrl } = await (await fetch("http://127.0.0.1:9223/json/version")).json();
const nav = new WebSocket(webSocketDebuggerUrl);
let compteur = 0;
const attentes = new Map();
nav.addEventListener("message", (m) => {
  const j = JSON.parse(m.data);
  if (attentes.has(j.id)) {
    const { resoudre, rejeter } = attentes.get(j.id);
    attentes.delete(j.id);
    if (j.error) rejeter(new Error(JSON.stringify(j.error)));
    else resoudre(j.result);
  }
});
await new Promise((r) => nav.addEventListener("open", r, { once: true }));
const brut = (methode, params, sessionId) =>
  new Promise((resoudre, rejeter) => {
    const id = ++compteur;
    attentes.set(id, { resoudre, rejeter });
    nav.send(JSON.stringify({ id, method: methode, params, sessionId }));
  });

/**
 * Le releve d un ecran a une largeur. Tout ce que la consigne demande, et rien
 * de plus : les nombres qu on compare a la reference, et les regles qui ne se
 * negocient pas.
 */
const RELEVE = `(() => {
  const de = document.documentElement;
  /*
   * ⚠️ CE QUI N EST PAS RENDU N EST PAS UNE POLICE TROP PETITE. La sonde
   * comptait les feuilles de TOUT le document, masquees comprises : a 390 px
   * elle signalait les 11 px du bloc de compte de la barre laterale, qui est en
   * \`display: none\` a cette largeur, et a 1440 px les 10 px de la barre
   * d onglets du telephone, masquee elle aussi. Cinq faux positifs a chaque
   * ecran, aux DEUX largeurs — et cinq faux positifs apprennent a ignorer le
   * sixieme, qui serait vrai.
   *
   * \`getClientRects().length === 0\` est le test qui le dit : il vaut zero pour
   * tout ce que la mise en page ne place pas, sans qu il faille enumerer les
   * facons de masquer un element.
   */
  const rendu = (e) => e.getClientRects().length > 0;
  const feuilles = [...document.querySelectorAll('body *')].filter(
    (e) => e.children.length === 0 && (e.textContent || '').trim().length > 1 &&
           !['SCRIPT','STYLE','TITLE'].includes(e.tagName) && rendu(e));
  const interactifs = [...document.querySelectorAll('a,button,input,select,textarea')];
  const boite = (e) => { const r = e.getBoundingClientRect(); return { l: Math.round(r.width), h: Math.round(r.height) }; };
  const aside = document.querySelector('aside');
  const main = document.querySelector('main');
  const cartes = [...document.querySelectorAll('div,section,article')]
    .filter((e) => { const c = getComputedStyle(e), r = e.getBoundingClientRect();
      return parseFloat(c.borderRadius) >= 12 && r.width > 180 && r.height > 60; })
    .map((e) => getComputedStyle(e).borderRadius);
  const rayons = {}; for (const r of cartes) rayons[r] = (rayons[r] || 0) + 1;
  return {
    coarse: matchMedia('(pointer: coarse)').matches,
    largeur_doc: de.scrollWidth, largeur_vue: de.clientWidth,
    debordement: de.scrollWidth > de.clientWidth,
    h1: document.querySelectorAll('h1').length,
    polices_sous_11_5: feuilles
      .map((e) => ({ texte: (e.textContent || '').trim().slice(0, 30), px: parseFloat(getComputedStyle(e).fontSize) }))
      .filter((x) => x.px < 11.5),
    /*
     * ⚠️ LES PANNEAUX QUI S OUVRENT SONT MESURES OUVERTS, PARCE QU UNE SONDE
     * QUI NE REGARDE QUE L ETAT DE REPOS NE VOIT JAMAIS LEUR GEOMETRIE.
     *
     * Ce depot a deja paye deux fois a cet endroit : un panneau ancre sur un
     * NOMBRE qui recouvrait sa propre pilule — donc le seul geste qui le
     * referme au doigt — et un autre qui sortait de la carte par la gauche sans
     * sortir de la fenetre, donc sans que rien ne le signale. Les deux se
     * lisent en une mesure : le haut du panneau est-il SOUS le bas de son
     * bouton, et reste-t-il dans la fenetre.
     */
    panneaux: [...document.querySelectorAll('details')].map((d) => {
      const s = d.querySelector('summary');
      const ouvert = d.open;
      d.open = true;
      const pan = [...d.children].find((e) => e !== s);
      const bs = s ? s.getBoundingClientRect() : null;
      const bp = pan ? pan.getBoundingClientRect() : null;
      d.open = ouvert;
      if (!bs || !bp || bp.width === 0) return null;
      return {
        quoi: (s.textContent || '').trim().slice(0, 20),
        recouvre_son_bouton: bp.top < bs.bottom - 1,
        hors_fenetre: bp.right > de.clientWidth + 1 || bp.left < -1,
        largeur: Math.round(bp.width),
      };
    }).filter((x) => x !== null && (x.recouvre_son_bouton || x.hors_fenetre)),
    interlettrage_non_nul: [...document.querySelectorAll('body *')]
      .filter((e) => { const v = getComputedStyle(e).letterSpacing; return v !== 'normal' && v !== '0px'; }).length,
    /*
     * ⚠️ LES CONTROLES \`sr-only\` SONT ECARTES, ET CE N EST PAS UNE INDULGENCE.
     * Un lien d evitement mesure 1x1 tant qu il n a pas le focus : c est sa
     * definition. Le compter parmi les cibles trop petites ferait signaler un
     * defaut a chaque ecran, et treize faux positifs apprennent a ignorer le
     * quatorzieme, qui serait vrai.
     */
    cibles_sous_44: interactifs
      .filter((e) => { const c = getComputedStyle(e);
        return !(c.position === 'absolute' && parseFloat(c.width) <= 2) &&
               !/(^|\s)sr-only(\s|$)/.test(e.className || ''); })
      .map((e) => ({ quoi: (e.textContent || e.getAttribute('aria-label') || e.id || e.tagName).trim().slice(0, 30), ...boite(e) }))
      .filter((c) => c.h > 0 && c.h < 44),
    barre_laterale: aside ? { ...boite(aside), filet: getComputedStyle(aside).borderRightColor } : null,
    principal: main ? { ...boite(main), colonnes: getComputedStyle(main).gridTemplateColumns, gap: getComputedStyle(main).gap, maxW: getComputedStyle(main).maxWidth } : null,
    rayons_de_carte: rayons,
  };
})()`;

const rapport = [];
for (const modele of routes) {
  const chemin = modele.replaceAll("{commande}", idCommande);
  for (const largeur of largeurs) {
    const { targetId } = await brut("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await brut("Target.attachToTarget", { targetId, flatten: true });
    const envoyer = (m, p) => brut(m, p, sessionId);
    await envoyer("Network.enable", {});
    // L admin refuse toute requete sans adresse d appelant exploitable.
    await envoyer("Network.setExtraHTTPHeaders", { headers: { "x-real-ip": "203.0.113.7" } });
    await envoyer("Emulation.setDeviceMetricsOverride", {
      width: largeur,
      height: largeur < 700 ? 844 : 1000,
      deviceScaleFactor: largeur < 700 ? 3 : 1,
      mobile: largeur < 700,
    });
    if (largeur < 700) {
      await envoyer("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
      await envoyer("Emulation.setEmitTouchEventsForMouse", { enabled: true, configuration: "mobile" });
    }
    const hote = new URL(base).hostname;
    for (const c of cookies) {
      await envoyer("Network.setCookie", { name: c.name, value: c.value, domain: hote, path: "/" });
    }
    await envoyer("Page.enable", {});
    await envoyer("Page.navigate", { url: base + chemin });
    await new Promise((r) => setTimeout(r, 3000));
    const { result } = await envoyer("Runtime.evaluate", {
      expression: RELEVE,
      returnByValue: true,
    });
    rapport.push({ chemin, largeur, ...result.value });
    if (dossierCaptures !== null) {
      // `captureBeyondViewport` : sans lui on ne capture que le premier ecran,
      // et c est exactement la moitie qu on a deja regardee en la mesurant.
      const { data } = await envoyer("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: true,
      });
      const nom = chemin.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + largeur + ".png";
      await writeFile(join(dossierCaptures, nom), Buffer.from(data, "base64"));
      console.error("[capture] " + nom);
    }
    await envoyer("Target.closeTarget", { targetId });
  }
}
nav.close();

await service.auth.admin.deleteUser(cree.user.id);
console.error("[purge] compte supprime.");
console.log(JSON.stringify(rapport, null, 1));
