// Génère le sprite SVG des icônes Lucide à partir du paquet installé (aucun tracé dessiné à la main).
import { writeFileSync } from "node:fs";
import path from "node:path";
const racine = process.argv[2];
const noms = ["arrow-right","check","package","truck","images","link","palette","languages","calendar-days","shield-check","message-circle","chevron-down","plus","eye","user-round","copy","menu","x","globe","circle-check","eye-off","mail","arrow-left","loader-circle","lock-keyhole","sparkles","layout-dashboard","chart-column","settings","search","bell","trending-up","trending-down","command","corner-down-left","external-link","panel-left","house","timer","circle-alert","circle-dashed","list-filter","clock","badge-check","smartphone","upload","scan-line","share-2","arrow-up-right","sun","moon","infinity","send","chevrons-up-down","ellipsis","circle-x","chevron-right","clock-alert","package-check","inbox","download","archive","archive-restore","refresh-cw","map-pin","package-open","monitor","sliders-horizontal","lock","shield","monitor-smartphone","laptop","database","trash-2=trash","crown","life-buoy","circle-help=circle-question-mark","file-text","user","chevron-left","chevron-up", "tag", "key-round", "log-out", "users", "store", "flag", "ban", "bell-off", "activity", "scroll-text", "mail-check", "qr-code", "credit-card", "lock-open", "user-plus", "triangle-alert", "rotate-ccw", "unlink"];
const attrs = (o) => Object.entries(o).filter(([k]) => k !== "key").map(([k, v]) => `${k}="${v}"`).join(" ");
let out = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">\n`;
for (const entree of noms) {
  // « id=fichier » : Lucide renomme ses icônes et garde l'ancien nom en simple alias
  const [n, fichier = n] = entree.split("=");
  const { __iconData } = await import(path.join(racine, `${fichier}.mjs`));
  const node = __iconData.node;
  out += `<symbol id="i-${n}" viewBox="0 0 24 24">${node.map(([t, a]) => `<${t} ${attrs(a)}/>`).join("")}</symbol>\n`;
}
out += `</svg>`;
writeFileSync(process.argv[3], out);
console.log(noms.length, "icônes");
