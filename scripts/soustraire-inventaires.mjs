/**
 * LA SOUSTRACTION DE DEUX INVENTAIRES — le geste 4 de la methode, en PROGRAMME.
 *
 * ⚠️ POURQUOI CE FICHIER EXISTE, ET CE QU IL REPARE. `CLAUDE.md` prescrit depuis
 * le 12/09 : « comparer les DEUX captures cote a cote, et les deux inventaires
 * PAR SOUSTRACTION ». Les quatre premiers gestes etaient outilles ; le
 * quatrieme, non. Je l ai donc fait A L OEIL, ecran apres ecran, et j ai ecrit
 * « migre et mesure au pixel » dans les commits — sur des ecrans dont je n avais
 * compare ni les tailles de texte, ni les graisses, ni les positions.
 *
 * Wassim l a dit sans detour : « t es meme pas capable de regarder les ecrans de
 * Claude Design et comparer pixel par pixel a chaque fois ». C etait exact.
 *
 * Un oeil compare ce qu il regarde. Un programme compare TOUT, et c est la
 * difference entre une impression et une mesure — exactement l argument qui a
 * fait naitre la methode.
 *
 * Usage :
 *   node scripts/soustraire-inventaires.mjs <kit.json> <produit.json> [seuil]
 *
 * Il rend TROIS listes, et aucune n est un jugement :
 *   1. ce que le kit REND et que le produit ne rend pas (par texte) ;
 *   2. ce que le produit rend en PLUS ;
 *   3. pour chaque texte present des DEUX cotes, les proprietes qui different —
 *      taille, graisse, interligne, interlettrage, couleur, fond, rayon, filet,
 *      ombre, remplissage, ecart, et la boite.
 *
 * C est a la lecture qu on trie : un ecart peut etre un defaut, une contrainte
 * verrouillee, ou une donnee que la base n a pas. Le programme ne le sait pas,
 * et il ne doit pas pretendre le savoir.
 */
import { readFileSync } from "node:fs";

const [cheminKit, cheminProduit, seuilBrut] = process.argv.slice(2);
if (cheminKit === undefined || cheminProduit === undefined) {
  console.error(
    "usage : node scripts/soustraire-inventaires.mjs <kit.json> <produit.json> [seuil px]",
  );
  process.exit(1);
}
/** En dessous, un ecart de boite ne se voit pas et noierait le reste. */
const SEUIL = Number(seuilBrut ?? 2);

const lire = (chemin) => JSON.parse(readFileSync(chemin, "utf8")).lignes;

/**
 * LA CLE D APPARIEMENT EST LE TEXTE, PAS LA POSITION.
 *
 * Deux pages qui disent la meme chose ne la placent pas au meme pixel — c est
 * precisement ce qu on mesure. Apparier par position reviendrait a supposer la
 * reponse. Le texte, lui, est le seul point commun stable entre une reference
 * et son implementation.
 *
 * ⚠️ ET IL EST NORMALISE. Le kit ecrit « 8 sept. 2025 » la ou le produit ecrit
 * « 12 septembre 2026 » : les chiffres et les mois different toujours, puisque
 * les deux jeux de donnees different. On compare donc la FORME du texte, pas sa
 * valeur — sinon chaque date, chaque compteur et chaque reference ressortirait
 * comme « absent », et trois cents faux ecarts cacheraient les vrais.
 */
const forme = (txt) =>
  txt
    .toLowerCase()
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim();

const indexer = (lignes) => {
  const par = new Map();
  for (const l of lignes) {
    if (l.txt === "") continue;
    const cle = forme(l.txt);
    if (cle.length < 2) continue;
    if (!par.has(cle)) par.set(cle, []);
    par.get(cle).push(l);
  }
  return par;
};

const kit = lire(cheminKit);
const produit = lire(cheminProduit);
const iKit = indexer(kit);
const iProduit = indexer(produit);

/** Les proprietes comparees, et le libelle sous lequel l ecart se lit. */
const PROPRIETES = [
  ["police", "taille"],
  ["graisse", "graisse"],
  ["interligne", "interligne"],
  ["tracking", "interlettrage"],
  ["couleur", "couleur"],
  ["fond", "fond"],
  ["rayon", "rayon"],
  ["filet", "filet"],
  ["ombre", "ombre"],
  ["marge", "remplissage"],
  ["ecart", "ecart"],
];

const manquants = [];
for (const [cle, lignes] of iKit) {
  if (!iProduit.has(cle)) manquants.push({ cle, exemple: lignes[0] });
}
const enTrop = [];
for (const [cle, lignes] of iProduit) {
  if (!iKit.has(cle)) enTrop.push({ cle, exemple: lignes[0] });
}

const ecarts = [];
for (const [cle, lignesKit] of iKit) {
  const lignesProduit = iProduit.get(cle);
  if (lignesProduit === undefined) continue;
  // Le premier de chaque cote : quand un texte apparait plusieurs fois, ses
  // occurrences partagent leur style dans les deux documents.
  const a = lignesKit[0];
  const b = lignesProduit[0];
  const differences = [];
  for (const [champ, libelle] of PROPRIETES) {
    if (String(a[champ]) !== String(b[champ])) {
      differences.push(`${libelle} ${a[champ] || "—"} → ${b[champ] || "—"}`);
    }
  }
  if (Math.abs(a.l - b.l) > SEUIL) differences.push(`largeur ${a.l} → ${b.l}`);
  if (Math.abs(a.h - b.h) > SEUIL) differences.push(`hauteur ${a.h} → ${b.h}`);
  if (differences.length > 0) ecarts.push({ texte: a.txt, differences });
}

const bloc = (titre, lignes) => {
  console.log(`\n${titre} (${lignes.length})`);
  console.log("─".repeat(78));
  for (const l of lignes) console.log(l);
};

bloc(
  "① LE KIT LE REND, LE PRODUIT NON",
  manquants.map((m) => `  « ${m.exemple.txt} »  ${m.exemple.police}/${m.exemple.graisse}`),
);
bloc(
  "② LE PRODUIT LE REND EN PLUS",
  enTrop.map((m) => `  « ${m.exemple.txt} »  ${m.exemple.police}/${m.exemple.graisse}`),
);
bloc(
  "③ MEME TEXTE, VALEURS DIFFERENTES",
  ecarts.map((e) => `  « ${e.texte} »\n      ${e.differences.join("\n      ")}`),
);

console.log(
  `\n[soustraction] kit ${kit.length} elements, produit ${produit.length} ; ` +
    `${manquants.length} manquants, ${enTrop.length} en trop, ${ecarts.length} ecarts de valeur.`,
);
