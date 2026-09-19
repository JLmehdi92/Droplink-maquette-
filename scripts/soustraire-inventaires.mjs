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

/**
 * LES ECARTS DECLARES, ET POURQUOI ILS SONT DANS UN FICHIER.
 *
 * La regle d arret dit qu un ecran n est fini que quand la soustraction est
 * VIDE. Sans declaration, elle ne peut JAMAIS l etre : le kit et le produit ne
 * montrent pas les memes donnees, le produit refuse ce que des contraintes
 * verrouillees interdisent, et la base ne porte pas tout ce que le kit dessine.
 * « Il reste trente ecarts, mais ce sont les bons » n est pas une mesure — c est
 * une opinion, et elle se re-argumente a chaque passage.
 *
 * ⚠️ ET LA LISTE ECHOUE DANS LES DEUX SENS. Une declaration qui ne designe plus
 * rien est signalee : sans ca elle grossirait jusqu a tout couvrir, et la
 * soustraction serait vide parce qu on aurait tout declare. C est la meme regle
 * que pour les exceptions des suites de tests.
 */
const declaresTous = JSON.parse(
  readFileSync(new URL("./ecarts-declares.json", import.meta.url), "utf8"),
);
if (cheminKit === undefined || cheminProduit === undefined) {
  console.error(
    "usage : node scripts/soustraire-inventaires.mjs <kit.json> <produit.json> [seuil px]",
  );
  process.exit(1);
}
/** En dessous, un ecart de boite ne se voit pas et noierait le reste. */
const SEUIL = Number(seuilBrut ?? 2);

const lireTout = (chemin) => JSON.parse(readFileSync(chemin, "utf8"));

/**
 * ⚠️ LES DEUX RELEVES DOIVENT AVOIR LA MEME LARGEUR UTILE, ET C EST UN PIEGE
 * PAYE LE 12/09.
 *
 * Le kit est plus haut que sa fenetre : il porte donc une BARRE DE DEFILEMENT,
 * et son `clientWidth` vaut 1675 la ou le produit, plus court ce jour-la, rend
 * 1690. Quinze pixels d ecart sur toute la largeur — et chaque colonne, chaque
 * onglet, chaque position en x ressort alors comme un defaut de mise en page.
 *
 * C est la meme famille que la planche telephone qui se mesure dans une fenetre
 * de 405 et non de 390. On REFUSE de soustraire deux releves qui ne portent pas
 * sur la meme largeur : comparer deux largeurs differentes ne compare rien.
 */
const verifierLargeurs = (a, b) => {
  if (a.largeur_vue === b.largeur_vue) return;
  console.error(
    `ARRET : le kit est releve sur ${a.largeur_vue} px utiles et le produit sur ` +
      `${b.largeur_vue}. Une barre de defilement presente d un seul cote decale ` +
      `TOUTES les positions et toutes les largeurs. Remesurer le produit a ` +
      `${a.largeur_vue} px, ou lui donner de quoi defiler.`,
  );
  process.exit(1);
};

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

/**
 * ⚠️ UN FILET DE ZERO PIXEL N EST PAS UN FILET, QUEL QUE SOIT SON STYLE.
 *
 * `getComputedStyle` rend `0px none rgb(...)` quand aucun filet n est declare et
 * `0px solid rgb(...)` quand une couleur l est sans largeur. Les deux ne peignent
 * RIEN. Comparees telles quelles, elles produisaient un ecart sur quinze lignes
 * du premier ecran mesure — et quinze faux ecarts cachent le vrai, qui est
 * exactement ce que cet outil existe pour trouver.
 */
const filetUtile = (f) => (String(f).startsWith("0px") ? "aucun" : f);

/**
 * ⚠️ ON N INDEXE PAS CE QUI NE SE VOIT PAS. Un `sr-only` mesure 1 x 1 : apparie
 * avec le vrai element du meme texte, il rendait « largeur 123 → 1 » et faisait
 * passer un element pour une regression. Sous 4 px de cote, rien n est peint.
 */
const indexer = (lignes) => {
  const par = new Map();
  for (const l of lignes) {
    if (l.txt === "") continue;
    if (l.l < 4 || l.h < 4) continue;
    const cle = forme(l.txt);
    if (cle.length < 2) continue;
    if (!par.has(cle)) par.set(cle, []);
    par.get(cle).push(l);
  }
  return par;
};

const kitTout = lireTout(cheminKit);
const produitTout = lireTout(cheminProduit);
verifierLargeurs(kitTout, produitTout);
const kit = kitTout.lignes;
const produit = produitTout.lignes;
const iKit = indexer(kit);
const iProduit = indexer(produit);

/** Les proprietes comparees, et le libelle sous lequel l ecart se lit. */
const PROPRIETES = [
  ["famille", "police"],
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
  /*
   * ⚠️ L'IMAGE DE FOND ÉTAIT RELEVÉE ET JAMAIS COMPARÉE (19/09/2026). La sonde l'inventorie depuis
   * le début — c'est là que vivent TOUS les dégradés —, mais cette liste s'arrêtait à `fond`, qui
   * ne porte que la couleur unie. Aucun dégradé n'avait donc jamais été confronté au kit : la
   * carte « Propulsé par DropLink » est sortie en code 0 au dégradé DropLink, là où la planche
   * peint la couleur du VENDEUR. Relevé sur les 74 inventaires : 14 écarts, dont 13 déjà déclarés
   * ou portés par un parent immédiat, et UN vrai — celui-là.
   */
  ["image", "image de fond"],
];

const manquants = [];
for (const [cle, lignes] of iKit) {
  if (!iProduit.has(cle)) manquants.push({ cle, exemple: lignes[0] });
}
const enTrop = [];
for (const [cle, lignes] of iProduit) {
  if (!iKit.has(cle)) enTrop.push({ cle, exemple: lignes[0] });
}

/**
 * ⚠️ ON APPARIE PAR PROXIMITE, NI « LE PREMIER AVEC LE PREMIER », NI PAR RANG.
 *
 * « En transit » apparait sept fois sur l ecran des commandes : dans un onglet,
 * dans une pastille de ligne, dans une frise. Comparer le premier du kit au
 * premier du produit rapprochait une pastille de tableau d un libelle de frise —
 * deux elements qui n ont aucune raison d avoir la meme largeur.
 *
 * Le rang dans l ordre du document ne suffit pas non plus : la barre laterale et
 * le contenu principal s entrelacent differemment d un document a l autre, et
 * trier par `y` mettait le titre `<h1>` du kit en face d une entree de
 * navigation du produit.
 *
 * ⚠️ CE QUI APPARIE VRAIMENT, C EST LA PLACE. Un element garde sa region entre
 * une reference et son implementation — une entree de barre laterale reste a
 * gauche, une pastille de tableau reste dans le tableau. On apparie donc au PLUS
 * PROCHE, glouton, en commencant par les couples les moins ambigus. La distance
 * est une mesure, pas une supposition.
 */
const apparier = (aKit, aProduit) => {
  const couples = [];
  const libres = new Set(aProduit.keys());
  const candidats = [];
  for (let i = 0; i < aKit.length; i += 1) {
    for (let j = 0; j < aProduit.length; j += 1) {
      const dx = aKit[i].x - aProduit[j].x;
      const dy = aKit[i].y - aProduit[j].y;
      candidats.push({ i, j, d: Math.hypot(dx, dy) });
    }
  }
  candidats.sort((u, v) => u.d - v.d);
  const prisKit = new Set();
  for (const c of candidats) {
    if (prisKit.has(c.i) || !libres.has(c.j)) continue;
    prisKit.add(c.i);
    libres.delete(c.j);
    couples.push([aKit[c.i], aProduit[c.j]]);
  }
  return couples;
};

const ecarts = [];
for (const [cle, lignesKit] of iKit) {
  const lignesProduit = iProduit.get(cle);
  if (lignesProduit === undefined) continue;
  const couples = apparier(lignesKit, lignesProduit);
  let rang = 0;
  for (const [a, b] of couples) {
    rang += 1;
    const differences = [];
    /*
     * ⚠️ `line-height: normal` ET UNE VALEUR EN PIXELS PEUVENT ETRE LA MEME
     * CHOSE. Le kit laisse `normal` sur ses libelles d en-tete, nous posons
     * `18px` — et les deux rendent une boite de 18. Comparer les CHAINES
     * signalait sept ecarts qui ne designaient rien. L interligne ne se voit
     * que par la boite qu il produit : on ne le signale donc que si la HAUTEUR
     * differe aussi.
     */
    const memeHauteur = Math.abs(a.h - b.h) <= SEUIL;
    for (const [champ, libelle] of PROPRIETES) {
      if (champ === "interligne" && memeHauteur) continue;
      const va = champ === "filet" ? filetUtile(a[champ]) : String(a[champ]);
      const vb = champ === "filet" ? filetUtile(b[champ]) : String(b[champ]);
      if (va !== vb) differences.push(`${libelle} ${va || "—"} → ${vb || "—"}`);
    }
    if (Math.abs(a.l - b.l) > SEUIL) differences.push(`largeur ${a.l} → ${b.l}`);
    if (Math.abs(a.h - b.h) > SEUIL) differences.push(`hauteur ${a.h} → ${b.h}`);
    if (Math.abs(a.x - b.x) > SEUIL || Math.abs(a.y - b.y) > SEUIL) {
      differences.push(`place (${a.x},${a.y}) → (${b.x},${b.y})`);
    }
    if (differences.length > 0) {
      const n = couples.length > 1 ? ` [${rang}/${couples.length}]` : "";
      ecarts.push({ texte: `${a.txt}${n}  <${a.t}>`, differences });
    }
  }
  /*
   * ⚠️ ET LE NOMBRE D OCCURRENCES EST LUI-MEME UN ECART. Un libelle rendu six
   * fois par le kit et deux fois par le produit signale quatre lignes, quatre
   * cellules ou quatre pastilles absentes — que la liste ① ne voit pas, puisque
   * le texte, lui, est bien present quelque part.
   */
  if (lignesKit.length !== lignesProduit.length) {
    ecarts.push({
      texte: `${lignesKit[0].txt}  <nombre d'occurrences>`,
      differences: [`rendu ${lignesKit.length} fois → ${lignesProduit.length} fois`],
    });
  }
}

/*
 * L ECRAN se deduit du nom du fichier de releve : `fr-commandes-1675.json` →
 * `fr-commandes`. On ne le passe pas en argument — un argument qu on peut se
 * tromper d ecrire est un argument qui fera declarer les ecarts d un autre
 * ecran.
 */
const nomEcran = cheminProduit
  .split(/[\\/]/)
  .pop()
  .replace(/-\d+\.json$/, "");
/*
 * ⚠️ LES TROIS LISTES SE DECLARENT, PAS SEULEMENT LA TROISIEME.
 *
 * L outil n a longtemps echoue que sur les ecarts de VALEUR. Un ecran qui ne
 * rendait rien n avait donc aucun texte commun avec le kit, donc aucun ecart, et
 * il sortait en code 0 : « un ensemble vide passe tout », la regle du depot
 * retournee contre l outil cense la faire respecter. C est le defaut que Wassim
 * avait vu a l oeil nu quand les nombres disaient que tout allait bien — il
 * manquait une barre superieure entiere et quatre colonnes de tableau.
 *
 * Le fichier de declarations porte donc trois listes par ecran :
 *   valeurs    ce qui differe sur un texte rendu des deux cotes
 *   manquants  ce que le kit rend et que le produit ne rend pas
 *   enTrop     ce que le produit rend et que le kit ne rend pas
 *
 * Une entree peut couvrir PLUSIEURS textes (`textes: [...]`) quand ils partagent
 * la meme raison — cinq libelles de facturation ne meritent pas cinq fois la
 * meme phrase — mais chacun reste NOMME : declarer par prefixe large laisserait
 * passer ce qui n a pas ete regarde.
 */
const brut = declaresTous[nomEcran];
if (brut !== undefined && Array.isArray(brut)) {
  console.error(
    `ARRET : les declarations de « ${nomEcran} » sont encore une simple liste.\n` +
      "Elles doivent porter les trois listes : { valeurs, manquants, enTrop }.\n" +
      "Sans « manquants », un ecran qui ne rend RIEN sort en code 0.",
  );
  process.exit(1);
}
const dec = brut ?? {};
const listeDe = (nom) => (Array.isArray(dec[nom]) ? dec[nom] : []);
const textesDe = (d) => (Array.isArray(d.textes) ? d.textes : d.texte === undefined ? [] : [d.texte]);

/*
 * ⚠️ LE MOTIF, RESERVE A CE QUI VARIE PAR CONSTRUCTION — ET A RIEN D AUTRE.
 *
 * Le jeu de mesure fabrique un compte jetable a chaque passage : son adresse
 * change, et les references de commande sont DERIVEES d identifiants tires au
 * hasard. Aucune declaration litterale ne peut donc etre stable, et la
 * soustraction redeviendrait rouge a chaque execution pour la seule raison que
 * la base a rendu d autres octets.
 *
 * Un motif est une porte : il couvre ce qu on n a pas lu. Il est donc borne —
 * il doit etre ANCRE aux deux bouts — et sa raison doit dire POURQUOI la valeur
 * varie. Un motif qui couvrirait un libelle d interface serait un abus : ces
 * libelles-la ne changent pas d une execution a l autre.
 */
const motifsDe = (d) => (Array.isArray(d.motifs) ? d.motifs.map((m) => new RegExp(m)) : []);

/** Construit un chercheur sur une liste de declarations, et retient ce qui a servi. */
const chercheur = (declarations, section) => {
  const vus = new Set();
  const trouver = (texte) => {
    for (const d of declarations) {
      for (const cible of textesDe(d)) {
        if (
          texte === cible ||
          texte.startsWith(cible + " [") ||
          texte.startsWith(cible + "  ")
        ) {
          vus.add(cible);
          return d;
        }
      }
      for (const m of motifsDe(d)) {
        // Le texte releve porte parfois un suffixe de role (« [1/3] », «  <span> ») :
        // le motif est confronte a la partie utile, avant ce suffixe.
        const nu = texte.split("  <")[0].replace(/ \[\d+\/\d+\]$/, "");
        if (m.test(nu)) {
          vus.add(m.source);
          return d;
        }
      }
    }
    return null;
  };
  /* Les declarations qui n ont rien designe : l echec dans l autre sens. Sans
     lui, la liste grossirait jusqu a tout couvrir et « la soustraction est
     vide » voudrait dire « j ai tout declare ». */
  /* ⚠️ `volatile: true` : LA SEULE EXCEPTION, ET ELLE EST BORNÉE. Les écrans
     d'administration lisent le journal d'audit de la base de tests, que les
     suites réécrivent à chaque passage des portes : selon l'ordre des suites,
     une ligne « Motif : » ou un âge « Il y a 12 min » existe ou non. Une
     déclaration de ces données mourait un passage sur deux, et l'écran sortait
     rouge sans défaut (15/09/2026). Elle couvre ce qu'elle couvre, sans être
     exigée quand la donnée manque ; toute autre déclaration reste exigée. */
  const mortes = () => {
    const restes = [];
    for (const d of declarations) {
      if (d.volatile === true) continue;
      for (const cible of textesDe(d)) {
        if (!vus.has(cible)) restes.push({ texte: cible, motif: d.motif, section });
      }
      for (const m of motifsDe(d)) {
        if (!vus.has(m.source)) restes.push({ texte: `/${m.source}/`, motif: d.motif, section });
      }
    }
    return restes;
  };
  return { trouver, mortes };
};

const cValeurs = chercheur(listeDe("valeurs"), "valeurs");
const cManquants = chercheur(listeDe("manquants"), "manquants");
const cEnTrop = chercheur(listeDe("enTrop"), "enTrop");

const restants = [];
const ecartesDeclares = [];
for (const e of ecarts) {
  const d = cValeurs.trouver(e.texte);
  if (d === null) restants.push(e);
  else ecartesDeclares.push({ ...e, motif: d.motif });
}

const manquantsNonDeclares = manquants.filter((m) => cManquants.trouver(m.exemple.txt) === null);
const enTropNonDeclares = enTrop.filter((m) => cEnTrop.trouver(m.exemple.txt) === null);

/*
 * ⑥ LES DÉCORS — CE QUE L'APPARIEMENT PAR TEXTE NE PEUT PAS VOIR (19/09/2026).
 *
 * Tout ce qui précède apparie des TEXTES. Un fond de page, un halo, une bande dégradée n'en
 * portent aucun : ils n'étaient comparés à rien. Relevé à la capture côte à côte, pas à la
 * soustraction : le fond dégradé de l'espace vendeur manquait sur NEUF écrans au téléphone, et
 * celui de l'administration à TOUTES les largeurs — tous sortaient en code 0.
 *
 * Un décor est ici un élément SANS texte propre, d'au moins 300 de large et 150 de haut (un
 * bouton en fait 44 à 52 ; une carte teintée raccourcie par son contenu, 259 : le seuil de 300 × 300
 * l'avait prise pour absente), qui porte un dégradé.
 * On compare les ENSEMBLES de dégradés des deux côtés (la position d'un décor fixe dépend de la
 * hauteur de page, pas du dessin). Un écart se déclare dans `decors` par le DÉBUT de sa valeur.
 */
const DECOR = (e) => !e.txt && e.l >= 300 && e.h >= 150 && /gradient/.test(e.image ?? "");
const decorsDe = (lignes) => new Set(lignes.filter(DECOR).map((e) => e.image));
const dKit = decorsDe(kit);
const dProduit = decorsDe(produit);
const decorsDeclares = listeDe("decors");
const decorsServis = new Set();
const decorDeclare = (image) => {
  const d = decorsDeclares.find((x) => (x.images ?? []).some((p) => image.startsWith(p)));
  if (d) for (const p of d.images) if (image.startsWith(p)) decorsServis.add(p);
  return d ?? null;
};
const decorsManquants = [...dKit].filter((i) => !dProduit.has(i));
const decorsEnTrop = [...dProduit].filter((i) => !dKit.has(i));
const decorsNonDeclares = [...decorsManquants.map((i) => ["manquant", i]), ...decorsEnTrop.map((i) => ["en trop", i])].filter(
  ([, i]) => decorDeclare(i) === null,
);
const decorsMorts = decorsDeclares.flatMap((d) => (d.images ?? []).filter((p) => !decorsServis.has(p)).map((p) => ({ texte: "decor " + p, motif: d.motif, section: "decors" })));

const declarationsMortes = [...cValeurs.mortes(), ...cManquants.mortes(), ...cEnTrop.mortes(), ...decorsMorts];

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
  "③ MEME TEXTE, VALEURS DIFFERENTES — NON DECLARE",
  restants.map((e) => `  « ${e.texte} »\n      ${e.differences.join("\n      ")}`),
);
bloc(
  "④ DECLARE, AVEC SA RAISON",
  ecartesDeclares.map((e) => `  [${e.motif}] « ${e.texte} »`),
);

if (decorsManquants.length + decorsEnTrop.length > 0) {
  bloc(
    "⑥ DECORS (fonds degrades sans texte, 300 x 150 au moins)",
    [...decorsManquants.map((i) => `  kit seul    ${i.slice(0, 120)}`), ...decorsEnTrop.map((i) => `  produit seul ${i.slice(0, 120)}`)],
  );
}

if (declarationsMortes.length > 0) {
  bloc(
    "⑤ DECLARATIONS QUI NE DESIGNENT PLUS RIEN — A RETIRER",
    declarationsMortes.map((d) => `  « ${d.texte} » — ${d.motif} (${d.section})`),
  );
}

console.log(
  `\n[soustraction] ${nomEcran} : kit ${kit.length} elements, produit ${produit.length} ; ` +
    `${manquants.length} manquants (${manquantsNonDeclares.length} NON DECLARES), ` +
    `${enTrop.length} en trop (${enTropNonDeclares.length} NON DECLARES), ` +
    `${restants.length} ecarts de valeur NON DECLARES (${ecartesDeclares.length} declares), ` +
    `${decorsNonDeclares.length} decors NON DECLARES (kit ${dKit.size}, produit ${dProduit.size}).`,
);

/*
 * ⚠️ LE VERDICT EST UN CODE DE SORTIE, PAS UNE PHRASE. Un rapport qu on lit
 * peut se lire vite ; un code de sortie arrete la chaine. L ecran n est fini
 * que quand il vaut zero.
 */
if (manquantsNonDeclares.length > 0) {
  console.error(
    `\nARRET : ${manquantsNonDeclares.length} element(s) que le KIT rend et que le produit ne rend pas ne sont pas declares :`,
  );
  for (const m of manquantsNonDeclares) console.error(`  « ${m.exemple.txt} »`);
}
if (enTropNonDeclares.length > 0) {
  console.error(
    `\nARRET : ${enTropNonDeclares.length} element(s) que le PRODUIT rend en plus ne sont pas declares :`,
  );
  for (const m of enTropNonDeclares) console.error(`  « ${m.exemple.txt} »`);
}

if (
  restants.length > 0 ||
  manquantsNonDeclares.length > 0 ||
  enTropNonDeclares.length > 0 ||
  decorsNonDeclares.length > 0 ||
  declarationsMortes.length > 0
) {
  process.exit(1);
}
