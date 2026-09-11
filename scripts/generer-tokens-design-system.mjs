// Génère le bloc `@theme` des tokens du design system, LU depuis sa source.
//
// ⚠️ POURQUOI UNE MACHINE ET PAS UNE RECOPIE. 80 valeurs transcrites à la main,
// c'est 80 occasions de se tromper d'un caractère — et un violet voisin ne se
// voit pas. Ce script lit `tokens/*.css` et rend le bloc ; la vérification est
// de le relancer et de comparer.
import { readFileSync } from "node:fs";

const DS = "C:/Users/mehdi/Desktop/droplink/.claude/skills/droplink-design/tokens";
const lire = (f) => readFileSync(`${DS}/${f}`, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Les déclarations `--nom:valeur` d'un fichier, dans l'ordre. */
function declarations(source) {
  const out = new Map();
  for (const m of source.matchAll(/--([a-z0-9-]+)\s*:\s*([^;}]+)/g)) {
    out.set(m[1], m[2].trim());
  }
  return out;
}

const couleurs = declarations(lire("colors.css"));
const typo = declarations(lire("typography.css"));
const rayons = declarations(lire("radius.css"));
const ombres = declarations(lire("elevation.css"));
const mouvement = declarations(lire("motion.css"));

/** `var(--x)` → la valeur littérale de `--x`, résolue dans le même fichier. */
function resoudre(valeur, table) {
  let v = valeur;
  for (let i = 0; i < 5 && v.includes("var("); i += 1) {
    v = v.replace(/var\(--([a-z0-9-]+)\)/g, (_, nom) => table.get(nom) ?? `var(--${nom})`);
  }
  return v.trim();
}

const lignes = [];
const pose = (prefixe, nom, valeur) => lignes.push(`  --${prefixe}-ds-${nom}: ${valeur};`);

// ── Couleurs : rampes puis sémantiques, toutes résolues en littéral ─────────
const RAMPES = /^(violet|magenta|pink|coral|ink|lavender|green|red|blue|amber|white)/;
for (const [nom, valeur] of couleurs) {
  if (!RAMPES.test(nom)) continue;
  pose("color", nom, resoudre(valeur, couleurs));
}
const SEMANTIQUES = {
  accent: "accent", "accent-hover": "accent-survol", "accent-soft": "accent-doux",
  "accent-ink": "accent-encre",
  "surface-page": "surface-page", "surface-card": "surface-carte",
  "surface-tint": "surface-teinte", "surface-sunken": "surface-creux",
  "surface-inverse": "surface-inverse", "surface-lavender": "surface-lavande",
  "border-subtle": "filet", "border-default": "filet-appuye",
  "border-brand": "filet-marque", "border-focus": "filet-focus",
  "text-strong": "texte-fort", "text-title": "texte-titre", "text-body": "texte-corps",
  "text-muted": "texte-sourdine", "text-faint": "texte-tenu",
  "text-on-brand": "texte-sur-marque", "text-link": "texte-lien",
  "text-link-hover": "texte-lien-survol",
  "status-success": "succes", "status-success-bg": "succes-fond",
  "status-danger": "erreur", "status-danger-bg": "erreur-fond",
  "status-info": "info", "status-info-bg": "info-fond",
  "status-warning": "alerte", "status-warning-bg": "alerte-fond",
};
for (const [source, cible] of Object.entries(SEMANTIQUES)) {
  const brute = couleurs.get(source);
  if (brute === undefined) throw new Error(`token de couleur absent : --${source}`);
  pose("color", cible, resoudre(brute, couleurs));
}

// ── Rayons, ombres, tailles de texte, cadences ─────────────────────────────
//
// ⚠️ LES NOMS DE CES FICHIERS PORTENT DÉJÀ LEUR ESPACE — `--radius-card`,
// `--shadow-card`, `--text-body`. Le préfixer sans le retirer produit
// `--radius-ds-radius-card`, qui ne génère aucune classe Tailwind utilisable et
// ne lève rien : le token existe, il est simplement inatteignable.
const sansEspace = (nom, espace) => nom.replace(new RegExp(`^${espace}-`), "");

for (const [nom, valeur] of rayons) {
  pose("radius", sansEspace(nom, "radius"), resoudre(valeur, rayons));
}
for (const [nom, valeur] of ombres) {
  if (/^(blur|inset|ring)/.test(nom)) continue;
  pose("shadow", sansEspace(nom, "shadow"), resoudre(valeur, ombres));
}
for (const [nom, valeur] of typo) {
  if (!/^text-/.test(nom)) continue;
  pose("text", sansEspace(nom, "text"), valeur);
}
for (const [nom, valeur] of mouvement) {
  if (!nom.startsWith("ease-")) continue;
  pose("ease", nom.replace(/^ease-/, ""), valeur);
}

console.log(lignes.join("\n"));
console.error(`${lignes.length} tokens générés.`);

// ── L'inventaire figé pour la garde ────────────────────────────────────────
// Le design system est IGNORÉ PAR GIT : un test qui le lirait serait rouge chez
// quiconque ne l'a pas, donc inutilisable comme porte. On fige donc ses valeurs,
// produites par cette même machine — jamais recopiées.
if (process.argv.includes("--inventaire")) {
  const lignes2 = lignes.map((l) => {
    const m = /^\s*--([a-z0-9-]+):\s*(.+);$/.exec(l);
    return `  ["--${m[1]}", ${JSON.stringify(m[2])}],`;
  });
  console.log("const TOKENS_DU_DESIGN_SYSTEM: ReadonlyArray<readonly [string, string]> = [");
  console.log(lignes2.join("\n"));
  console.log("];");
}
