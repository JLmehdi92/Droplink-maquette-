/**
 * COMPARER UN ECRAN DU PRODUIT A SA PAGE DE REFERENCE, VALEUR PAR VALEUR.
 *
 * ⚠️ POURQUOI CET OUTIL EXISTE, ET CE QU IL REPARE. La premiere passe de
 * migration a LU les valeurs dans le source du kit et les a transposees a la
 * main. C est exactement ce que `CLAUDE.md` interdit — « ce sont de vraies pages
 * HTML, pas des maquettes : on ne compare donc pas une impression, on compare
 * des nombres ». Lire un `height: 48` dans un fichier ne dit pas ce que le
 * navigateur rend : la reference est en `border-box` ici et en `content-box`
 * ailleurs, ses `padding` s ajoutent, ses `gap` se replient, et la moitie de ses
 * valeurs vient de variables resolues a l execution.
 *
 * ⚠️ ET LA LARGEUR DE REFERENCE N EST PAS 1440. L en-tete de chaque page du kit
 * porte `viewport="1690x1010"` : c est la largeur A LAQUELLE il est dessine.
 * Mesurer le produit a 1440 et le comparer a des nombres releves a 1690 compare
 * deux choses differentes — et l ecart se lit comme une erreur d implementation
 * alors que c est une erreur de protocole.
 *
 * Il rend, pour les deux cotes, un INVENTAIRE de boites et de styles calcules,
 * pas une impression. La comparaison est ensuite une soustraction.
 *
 * Usage :
 *   node scripts/comparer-au-kit.mjs <url> <largeur> <fichier de sortie> [capture.png]
 */
import { writeFile } from "node:fs/promises";
import { VERDICT_POLICES, exigerPolices } from "./sonde-polices.mjs";

const url = process.argv[2];
const largeur = Number(process.argv[3] ?? 1690);
const sortie = process.argv[4];
const capture = process.argv[5] ?? null;
const cookiesBrut = process.env["COOKIES_MESURE"] ?? "[]";
/*
 * ⚠️ LE KIT EST UNE APPLICATION A ETAT, PAS SIX PAGES. Ses six ecrans vendeur
 * vivent dans un seul document et se choisissent par un `setView` de React :
 * aucune URL ne les distingue. Sans ce clic, toutes les comparaisons d ecran
 * porteraient sur le MEME ecran — celui par defaut — et l ecart se lirait comme
 * une erreur d implementation alors qu on n aurait jamais ouvert la bonne page.
 */
const clic = process.env["CLIC_KIT"] ?? "";

if (url === undefined || sortie === undefined) {
  console.error("usage : node scripts/comparer-au-kit.mjs <url> <largeur> <sortie.json> [capture.png]");
  process.exit(1);
}

/**
 * CE QU ON RELEVE SUR CHAQUE ELEMENT VISIBLE PORTEUR DE TEXTE OU DE SURFACE.
 *
 * Pas une selection d elements « interessants » : la sonde rend TOUT ce qui est
 * rendu, et c est la comparaison qui trie. Un inventaire ne depend pas de ce que
 * son auteur a pense a inspecter.
 */
const RELEVE = `(() => {
  const norm = (c) => c.replace(/\\s+/g, "");
  /*
   * L OMBRE, DEBARRASSEE DE SES COUCHES VIDES.
   *
   * Tailwind empile TROIS couches dans box-shadow — anneau de decalage, anneau,
   * puis l ombre — et les deux premieres valent « rgba(0, 0, 0, 0) 0px 0px 0px
   * 0px » tant qu aucun anneau n est pose. Elles pesent 70 caracteres a elles
   * seules : la troncature a 80 ne laissait donc passer que du vide suivi du
   * debut d une couleur, et l ombre REELLE du produit n etait jamais comparee.
   *
   * Une couche qui ne peint rien n est pas une ombre, exactement comme un filet
   * de zero pixel n est pas un filet. On la retire AVANT de tronquer.
   */
  const ombreUtile = (v) => {
    if (v === "none" || !v) return "";
    // On ne coupe que sur les virgules HORS parentheses : chaque rgba() en
    // contient trois, et les separer casserait les couleurs.
    const couches = v.split(/,(?![^(]*\\))/).map((s) => s.trim());
    const utiles = couches.filter(
      (s) => !/^rgba\\(0,\\s*0,\\s*0,\\s*0\\)(\\s+0px){3,4}$/.test(s),
    );
    return utiles.join(", ").slice(0, 80);
  };
  const rendu = (e) => e.getClientRects().length > 0;
  const lignes = [];
  for (const e of document.querySelectorAll("body *")) {
    if (!rendu(e)) continue;
    if (["SCRIPT", "STYLE", "SVG", "PATH", "CIRCLE", "LINE", "RECT", "POLYLINE"].includes(e.tagName)) continue;
    const r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const c = getComputedStyle(e);
    const texte = [...e.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join(" ")
      .trim()
      .slice(0, 40);
    lignes.push({
      t: e.tagName.toLowerCase(),
      txt: texte,
      l: Math.round(r.width),
      h: Math.round(r.height),
      x: Math.round(r.x),
      y: Math.round(r.y),
      // ⚠️ LA FAMILLE COMPTE AUTANT QUE LA TAILLE. Deux textes de meme taille
      // et de meme graisse dans deux polices differentes n ont PAS la meme
      // largeur — et une largeur qui differe de cinq pixels partout se lit
      // comme un defaut de mise en page alors que c est une police de repli.
      famille: c.fontFamily.split(",")[0].replace(/["']/g, ""),
      police: parseFloat(c.fontSize),
      graisse: c.fontWeight,
      interligne: c.lineHeight,
      tracking: c.letterSpacing,
      couleur: norm(c.color),
      fond: norm(c.backgroundColor),
      image: c.backgroundImage === "none" ? "" : c.backgroundImage.slice(0, 90),
      rayon: c.borderRadius,
      filet: norm(c.borderTopWidth + " " + c.borderTopStyle + " " + c.borderTopColor),
      ombre: ombreUtile(c.boxShadow),
      marge: c.padding,
      ecart: c.gap === "normal" ? "" : c.gap,
    });
  }
  return {
    largeur_vue: document.documentElement.clientWidth,
    debordement: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    hauteur: document.documentElement.scrollHeight,
    lignes,
  };
})()`;

const { webSocketDebuggerUrl } = await (await fetch("http://127.0.0.1:9223/json/version")).json();
const nav = new WebSocket(webSocketDebuggerUrl);
let compteur = 0;
const attentes = new Map();
nav.addEventListener("message", (m) => {
  const j = JSON.parse(m.data);
  if (!attentes.has(j.id)) return;
  const { resoudre, rejeter } = attentes.get(j.id);
  attentes.delete(j.id);
  if (j.error) rejeter(new Error(JSON.stringify(j.error)));
  else resoudre(j.result);
});
await new Promise((r) => nav.addEventListener("open", r, { once: true }));
const brut = (methode, params, sessionId) =>
  new Promise((resoudre, rejeter) => {
    const id = ++compteur;
    attentes.set(id, { resoudre, rejeter });
    nav.send(JSON.stringify({ id, method: methode, params, sessionId }));
  });

const { targetId } = await brut("Target.createTarget", { url: "about:blank" });
const { sessionId } = await brut("Target.attachToTarget", { targetId, flatten: true });
const envoyer = (m, p) => brut(m, p, sessionId);

await envoyer("Network.enable", {});
/* ⚠️ SANS CECI, LA SONDE MESURE LA FEUILLE DE STYLE DU PASSAGE PRECEDENT.
   Le cache du navigateur survit d une cible a l autre : une correction
   apportee au design system restait invisible, et l on remesurait
   indefiniment le meme ecart. */
await envoyer("Network.setCacheDisabled", { cacheDisabled: true });
await envoyer("Network.setExtraHTTPHeaders", { headers: { "x-real-ip": "203.0.113.7" } });
await envoyer("Emulation.setDeviceMetricsOverride", {
  width: largeur,
  height: largeur < 700 ? 844 : 1010,
  deviceScaleFactor: 1,
  mobile: largeur < 700,
});
if (largeur < 700) {
  await envoyer("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await envoyer("Emulation.setEmitTouchEventsForMouse", { enabled: true, configuration: "mobile" });
}
for (const c of JSON.parse(cookiesBrut)) {
  await envoyer("Network.setCookie", { name: c.name, value: c.value, domain: c.domain, path: "/" });
}
await envoyer("Page.enable", {});
await envoyer("Page.navigate", { url });
// Le kit monte son propre paquet et compile ses composants a l execution : il
// lui faut plus qu un chargement de document.
await new Promise((r) => setTimeout(r, 5000));

/* `CLIC_KIT="Paramètres > Activer"` : une SÉQUENCE, depuis le 15/09/2026. Un
   état qui s'ouvre DANS un écran du kit — le panneau d'activation en deux
   étapes des paramètres — demande d'abord de choisir l'écran, puis d'ouvrir
   l'état. Chaque étape lève si son contrôle manque. */
for (const etape of clic.split(" > ").map((e) => e.trim()).filter(Boolean)) {
  const { result: ouvert } = await envoyer("Runtime.evaluate", {
    expression:
      "(() => { const c = [...document.querySelectorAll('button,a')]" +
      ".find((e) => (e.textContent || '').trim().startsWith(" +
      JSON.stringify(etape) +
      ")); if (!c) return 'INTROUVABLE'; c.click(); return c.textContent.trim().slice(0, 30); })()",
    returnByValue: true,
  });
  if (ouvert.value === "INTROUVABLE") {
    console.error(`ARRET : aucun controle ne commence par ${JSON.stringify(etape)}.`);
    process.exit(1);
  }
  console.error(`[kit] ouvert : ${ouvert.value}`);
  await new Promise((r) => setTimeout(r, 2500));
}

{
  const { result: v } = await envoyer("Runtime.evaluate", {
    expression: VERDICT_POLICES,
    returnByValue: true,
  });
  exigerPolices(v.value, `le kit (${url})`);
}

const { result } = await envoyer("Runtime.evaluate", { expression: RELEVE, returnByValue: true });
await writeFile(sortie, JSON.stringify(result.value, null, 1), "utf8");

if (capture !== null) {
  const { data } = await envoyer("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  await writeFile(capture, Buffer.from(data, "base64"));
}

await envoyer("Target.closeTarget", { targetId });
nav.close();
console.error(
  `[releve] ${url} a ${largeur} px : ${result.value.lignes.length} elements, debordement ${result.value.debordement}`,
);
