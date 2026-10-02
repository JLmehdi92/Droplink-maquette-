import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, test } from "vitest";
import { sansCommentaires } from "../aide/source";

/**
 * TOUTE COULEUR ÉCRITE EN DUR DANS UN COMPOSANT EST SOIT UNE COULEUR DU
 * CANEVAS, SOIT UNE EXCEPTION DÉCLARÉE AVEC SA RAISON.
 *
 * ⚠️ DÉFAUT MESURÉ LE 27/08/2026 : cinq champs de saisie portaient
 * `bg-[#F1F5F9]` — un gris bleuté qui n'existe NI dans le thème NI dans une
 * seule des 41 planches. Il ne cassait rien, ne déclenchait aucun test, et
 * rendait simplement un champ d'une couleur que personne n'avait choisie.
 *
 * C'est le mode de propagation ordinaire : une valeur en dur ne référence
 * aucun token, donc rien ne la relie au design, donc rien ne signale sa
 * dérive. Les sondes de palette et de classes servies ne peuvent pas la voir —
 * elles inspectent les tokens, et une couleur en dur n'en est pas un.
 *
 * LA SONDE INVENTORIE, le test DÉCLARE LES EXCEPTIONS avec leur raison, et il
 * échoue DANS LES DEUX SENS : une couleur inconnue qui apparaît, et une
 * exception qui ne sert plus.
 */

const RACINE = join(process.cwd(), "src");

/** Relevé sur les planches du canevas. Une couleur du canevas est toujours recevable. */
/**
 * L'INVENTAIRE EXACT des 91 couleurs distinctes des 41 planches, et non les 32
 * plus fréquentes. ⚠️ La première version de ce test ne portait que le top 32,
 * et il a immédiatement signalé `#0a0a0d` — le fond du visionneur plein écran —
 * comme étrangère au canevas alors qu'elle y figure. Un inventaire tronqué
 * accuse le code d'un défaut qui est celui de l'inventaire.
 */
const DU_CANEVAS = new Set([
  "#0058be", "#0a0a0d", "#0e0e13", "#0f766e", "#111117", "#1da851", "#2a2730", "#2f2c36",
  "#2f8f5b", "#33343c", "#34a853", "#35313c", "#363039", "#383440", "#3a3038", "#4285f4",
  "#45464d", "#4b2fb0", "#5b5d68", "#5c3fd0", "#6b4ae0", "#7c5cf5", "#83858f", "#8a6415",
  "#9a9ca6", "#9c7527", "#a4a6b0", "#a8412c", "#a97b1e", "#b5654f", "#c13584", "#c2543c",
  "#c5cbfb", "#c6c6d0", "#c9d7f0", "#cfcfda", "#d19a20", "#d3d3dd", "#d6d6de", "#d8d2f8",
  "#d9d5f4", "#d9d9e2", "#dcdce4", "#ddd5fb", "#e0674a", "#e0e0e8", "#e0e4ee", "#e11d48",
  "#e2e6ea", "#e4e2ee", "#e4e4ea", "#e6d3a8", "#e6e2e0", "#e6e6ec", "#e7f3ec", "#e8bfb4",
  "#e8e4dd", "#e9f7ee", "#ea4335", "#eab308", "#eaeaef", "#ececf0", "#eee4e0", "#eef4f0",
  "#efeaff", "#f0f0f4", "#f1eefe", "#f2765e", "#f2e2dd", "#f2f2f6", "#f3c9bd", "#f3e4c4",
  "#f4f4f8", "#f4f4fa", "#f6d9d2", "#f7f7fb", "#f8f6ff", "#f9fcfa", "#faedd2", "#fafafc",
  "#fbbc05", "#fbd9d0", "#fdded6", "#fdeeea", "#fdeef6", "#ffeee9", "#fff4f1", "#fff8f6",
  "#fffaf0", "#fffaf9", "#ffffff",
  // ── AJOUTÉES LE 08/09/2026 AVEC LES QUATRE PLANCHES DU BLOG ──
  // Le canevas est passé de 56 à 60 planches (Blog, BlogMobile, BlogArticle,
  // BlogArticleMobile). Ces deux couleurs y sont dessinées, donc elles sont
  // « du canevas » au sens de ce test — elles n'ont pas à devenir des
  // exceptions.
  //
  // ⚠️ ET C'EST BIEN CE TEST QUI LES A EXIGÉES : il a refusé les deux au
  // premier passage des portes. L'inventaire est figé par construction ; il
  // doit être étendu à la main chaque fois que le canevas l'est, sinon il
  // cesse de décrire ce qu'il prétend décrire.
  "#d7d3f8", // bordure d'une carte d'article au survol
  "#2c2d33", // l'encre du chapeau, un cran au-dessus du corps de texte
  // Le noir pur ne vient pas des planches, mais aucune couleur ne peut le
  // remplacer : il sert de repli de contraste, calculé et non dessiné.
  "#000000",
]);

/**
 * Ce qui n'est pas du canevas et n'a pas à l'être. Chaque ligne porte sa
 * raison ; le second contrôle vérifie que chacune sert encore.
 */
const EXCEPTIONS: ReadonlyArray<readonly [string, string]> = [
  ["#4285f4", "logo Google — une marque tierce ne se retouche pas"],
  /* La landing de la refonte (02/10/2026). Les deux pastilles du nuancier de
     démonstration sont des teintes de VENDEUR imaginaires — corail et jaune — que
     `resoudreAccent` corrige sous les yeux du visiteur : elles n'appartiennent à
     aucune palette, c'est tout leur propos. Et `#6A4D21` n'est pas une couleur :
     c'est la référence de la commande de démonstration (« Commande #6A4D21 »),
     que le motif hexadécimal attrape. */
  ["#e0533f", "nuancier de la landing : une teinte de vendeur imaginaire, corrigée par resoudreAccent"],
  ["#f5c518", "nuancier de la landing : un jaune trop clair pour du texte, la démonstration de l'ajustement"],
  ["#6a4d21", "pas une couleur : la référence de la commande de démonstration de la landing"],
  ["#ea4335", "logo Google"],
  ["#fbbc05", "logo Google"],
  ["#34a853", "logo Google"],
  // Instagram (#c13584) et WhatsApp (#1da851) sont sortis le 02/10/2026 : les
  // tuiles colorées des réseaux de « Ma marque » ont laissé place aux champs à
  // icône de la refonte, dans la couleur de l'interface.
  /*
   * ⚠️ LES NEUF MONOGRAMMES DE TRANSPORTEUR, ET POURQUOI CE NE SONT PAS DES
   * LOGOS RECONSTITUÉS.
   *
   * Le design system le dit dans son propre source, en anglais et en toutes
   * lettres : « No carrier logos were supplied, so each is a coloured tile with
   * its initials ». Ces neuf couples de couleurs sont donc un DESSIN DU KIT,
   * relevé dans `ui_kits/seller_app/ShippingView.jsx`, et repris à l'identique —
   * pas une marque redessinée de mémoire, ce que la règle d'iconographie
   * interdit.
   *
   * Ils n'ont pas de token parce qu'ils ne décrivent pas le produit : ils
   * appartiennent à des tiers, ils ne suivent ni le thème ni la couleur d'accent
   * du vendeur, et un token les ferait entrer dans une palette qu'ils n'ont
   * aucune raison d'habiter. Un transporteur que le kit ne dessine pas prend son
   * repli — fond creux, encre de corps — qui, lui, passe par les classes.
   */
  ["#ffd400", "monogramme La Poste / Colissimo — dessin du kit, pas un logo"],
  ["#0b0b18", "encre des monogrammes La Poste, Colissimo et SF Express — dessin du kit"],
  ["#ffcc00", "monogramme DHL — dessin du kit"],
  ["#d40511", "encre du monogramme DHL — dessin du kit"],
  ["#dc0032", "monogramme DPD — dessin du kit"],
  ["#00a3e0", "monogramme Chronopost — dessin du kit"],
  ["#351c15", "monogramme UPS — dessin du kit"],
  ["#ffb500", "encre du monogramme UPS — dessin du kit"],
  ["#8cc63f", "monogramme Relais Colis — dessin du kit"],
  ["#4d148c", "monogramme FedEx — dessin du kit"],
  ["#ff6600", "encre du monogramme FedEx — dessin du kit"],
  /*
   * LES PAGES LÉGALES, portées sur le kit `legal` le 13/09/2026. Trois couleurs
   * que le kit écrit en dur et qu'aucun token ne porte : la pastille « à
   * compléter » — filet pointillé et encre ambre — et le filet de l'encadré
   * d'avertissement. Elles ne servent qu'à dire qu'un texte juridique est
   * INCOMPLET, et c'est la seule raison de les garder hors de la palette.
   */
  /* ⚠️ TROIS EXCEPTIONS SONT PARTIES D'ICI LE 18/09/2026, ET C'EST CE TEST QUI
     L'A EXIGÉ. Elles couvraient la pastille « à compléter » — filet pointillé et
     encre ambre — et le filet de l'encadré « à faire valider par un avocat ».
     Wassim a demandé le retrait de ces mentions ; le composant `Lacune` et
     l'encadré ont disparu avec elles, et les trois couleurs ne peignaient donc
     plus rien. C'est l'AUTRE SENS du test qui les a sorties, pas une relecture :
     une exception qui ne désigne plus rien est une porte ouverte sur la valeur
     du jour où quelqu'un la réécrira. */
  /* `#f3dfb4` (filet ambre des alertes) est parti le 02/10/2026 avec les cartes
     d'alerte de l'ancienne administration. */
  /*
   * LA PAGE DU LIEN MORT, portée sur `client_link/not-found` le 13/09/2026 : un
   * cinquième lavande, et le kit le pose en dur sur cette seule page.
   */
  ["#f2f0fd", "fond de la page du lien mort — arrêt 0 %, kit client_link"],
  ["#faf9fe", "fond de la page du lien mort — arrêt 42 %, et fond des pages légales — arrêt 0 %"],
  ["#f6f2fc", "fond de la page du lien mort — arrêt 100 %"],
  // Le dernier arrêt du fond des pages légales. Il n'était PAS déclaré et la
  // garde n'a rien dit : c'est la couleur que la correction du motif a sortie.
  /* Les trois arrêts du fond de l'ancienne coque (`#f7f5fe`, `#fbfafe`, `#f8f4fd`)
     sont partis le 02/10/2026 : l'administration, dernière à les peindre, prend le
     fond de la refonte (`page-app`). */
  /* Les étoiles des témoignages de la landing — `TestimonialCard` du kit les
     peint en `#F5B843` en dur, et aucun jeton du design system ne le porte.
     Portées le 18/09/2026 avec la section, sur la liste d'écarts de Wassim. */
  /*
   * LES COULEURS RAPIDES DE L'ONBOARDING (refonte, 02/10/2026, `bienvenue.html`).
   * Ce sont des PROPOSITIONS de couleur de marque pour le vendeur, pas des
   * couleurs de notre thème : elles finissent dans `shops.accent_color` et
   * passent par `resoudreAccent()` comme une saisie libre. Les jetonner les
   * ferait suivre notre palette, alors qu'elles doivent rester des choix variés.
   * (Les trois arrêts du fond d'accès et les pastilles de la fenêtre du héros
   * sont partis le même jour avec `coque-acces` et `maquette-application`.)
   */
  ["#e5484d", "couleur rapide « corail » proposée à l'onboarding — maquette bienvenue.html"],
  ["#d97706", "couleur rapide « ambre » proposée à l'onboarding — maquette bienvenue.html"],
];
const tolerees = new Map(EXCEPTIONS);

/**
 * LES COULEURS DU DESIGN SYSTEM, LUES DANS SES JETONS — pas recopiées.
 *
 * ⚠️ CE TEST NE CONNAISSAIT QUE LE CANEVAS, MORT LE 11/09/2026. Il acceptait
 * donc l'ancien violet `#7c5cf5` et REFUSAIT l'accent du design system
 * `#5B4BF5` : mesuré le 14/09/2026, en corrigeant l'accent par défaut des
 * vendeurs, qui était resté l'ancien. Une garde ancrée à une référence la fige
 * aussi quand elle meurt.
 *
 * Les valeurs sont lues dans `globals.css`, sur les jetons `--color-ds-*` et
 * `--degrade-ds-*` : c'est la transcription versionnée du design system (son
 * dossier est gitignoré), et une liste écrite ici divergerait au premier jeton
 * ajouté.
 */
const DU_DESIGN_SYSTEM = new Set(
  readFileSync(join(RACINE, "app", "globals.css"), "utf8")
    .split(/\r?\n/)
    .filter((ligne) => /--(color-ds|degrade-ds)-/.test(ligne))
    .flatMap((ligne) => [...ligne.matchAll(/#[0-9a-fA-F]{6}(?![0-9a-fA-F])/g)].map((m) => m[0].toLowerCase())),
);

function sources(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
    const chemin = join(dossier, e.name);
    if (e.isDirectory()) return sources(chemin);
    return /\.(tsx|ts)$/.test(e.name) ? [chemin] : [];
  });
}

const trouvees = new Map<string, string[]>();
for (const fichier of sources(RACINE)) {
  const relatif = relative(RACINE, fichier).split(sep).join("/");
  /*
   * ⚠️ LA SONDE LISAIT LES COMMENTAIRES, ET S'EN SATISFAISAIT (L-031).
   *
   * L'exception `#ef0000` le disait en toutes lettres : « cité dans un
   * commentaire de contraste, jamais rendu ». Une couleur écrite dans un
   * commentaire comptait donc comme TROUVÉE — ce qui a deux effets, tous deux
   * mauvais : elle exige une exception pour un texte qui ne peint rien, et le
   * second sens du test (« aucune exception n'est devenue inutile ») pouvait
   * être maintenu vert par un commentaire seul.
   *
   * Relevé le 31/08/2026, quand une mesure de contraste écrite en commentaire —
   * `accent #ffff00 → aplat à 1,074 contre le fond` — a fait échouer un test qui
   * ne cherche que ce qui est RENDU. On dépollue donc, et l'exception `#ef0000`
   * disparaît d'elle-même : elle ne servait qu'à contourner ce défaut.
   */
  const code = sansCommentaires(readFileSync(fichier, "utf8"));
  /*
   * ⚠️ AUCUNE FRONTIÈRE DE MOT APRÈS LA COULEUR, ET C'ÉTAIT UN ANGLE MORT. Le
   * motif se terminait par la frontière de mot ; or dans une valeur arbitraire
   * de Tailwind — `bg-[linear-gradient(135deg,#F2F0FD_0%,…)]` — la couleur est
   * suivie d'un `_`, qui est un caractère de MOT. Toute couleur posée dans un
   * dégradé arbitraire échappait donc au balayage : mesuré le 13/09/2026 en
   * portant la page du lien mort, dont les trois arrêts, pourtant déclarés,
   * ressortaient comme « exceptions inutiles ». Le motif exige désormais
   * seulement qu'aucun septième chiffre hexadécimal ne suive.
   */
  for (const m of code.matchAll(/#[0-9a-fA-F]{6}(?![0-9a-fA-F])/g)) {
    const hex = m[0].toLowerCase();
    trouvees.set(hex, [...(trouvees.get(hex) ?? []), relatif]);
  }
}

describe("Les couleurs écrites en dur", () => {
  /** Un ensemble vide passe tout : on établit d'abord que la sonde voit. */
  test("la sonde en trouve réellement", () => {
    expect(trouvees.size).toBeGreaterThanOrEqual(15);
  });

  test("CONTRE-TEST : les jetons du design system sont bien lus", () => {
    // Un ensemble vide rendrait le design system muet, et le test retomberait
    // en silence sur le seul canevas.
    expect(DU_DESIGN_SYSTEM.size).toBeGreaterThanOrEqual(30);
    expect(DU_DESIGN_SYSTEM.has("#5b4bf5")).toBe(true);
  });

  test("chacune vient du canevas ou porte une raison", () => {
    const inconnues = [...trouvees.entries()]
      .filter(([hex]) => !DU_CANEVAS.has(hex) && !DU_DESIGN_SYSTEM.has(hex) && !tolerees.has(hex))
      .map(([hex, ou]) => `${hex} dans ${[...new Set(ou)].join(", ")}`);
    expect(inconnues).toEqual([]);
  });

  /**
   * L'AUTRE SENS. Une exception qui ne correspond plus à rien est une porte
   * ouverte sur la valeur du jour où quelqu'un la réécrira — et elle donne
   * l'impression que le sujet est traité alors qu'il ne l'est plus.
   */
  test("aucune exception déclarée n'est devenue inutile", () => {
    const mortes = EXCEPTIONS.filter(([hex]) => !trouvees.has(hex)).map(([hex, r]) => `${hex} — ${r}`);
    expect(mortes).toEqual([]);
  });

  test("la couleur du défaut corrigé ne revient pas", () => {
    // #F1F5F9 : ni thème, ni canevas. Cinq champs le portaient.
    expect(trouvees.has("#f1f5f9")).toBe(false);
  });
});
