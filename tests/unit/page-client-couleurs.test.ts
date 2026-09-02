import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { resoudreAccent } from "../../src/lib/design/contraste";
import { ReseauxVendeur } from "../../src/components/publique/reseaux-vendeur";
import { sansCommentaires } from "../aide/source";

/**
 * DEUX RÈGLES DE LA PAGE CLIENT QUE RIEN N'INTERROGEAIT.
 *
 * DÉFAUT QUI A MOTIVÉ CE CONTRÔLE : en dessinant les maquettes, l'écriture
 * posée sur l'aplat d'accent était `#ffffff` en dur. Avec l'accent par défaut,
 * bleu, c'est juste. Avec un jaune vif — une valeur que le vendeur peut choisir
 * et que le produit accepte — c'est du blanc sur jaune, illisible. Le produit
 * possède `resoudreAccent()` précisément pour empêcher ça ; une couleur en dur
 * court-circuite le mécanisme sans rien casser nulle part.
 *
 * ET LE FLOU : le brief l'interdit sur `/p/[token]`, mais rien ne le vérifiait.
 * Une protection qui tient à ce que personne n'ajoute la classe n'est pas une
 * protection — c'est une absence, et une absence est en sursis (L-029).
 *
 * IL INVENTORIE, IL NE SÉLECTIONNE PAS. La sonde rend TOUS les fichiers de la
 * surface publique ; le test déclare ses exceptions AVEC LEUR RAISON, et il
 * échoue dans les DEUX SENS — une couleur en dur non déclarée, mais aussi une
 * exception déclarée qui ne correspond plus à rien.
 *
 * IL S'APPLIQUE AU CODE, COMMENTAIRES RETIRÉS (L-031). Ces fichiers PARLENT de
 * `#ffffff` dans leurs commentaires pour expliquer pourquoi il est interdit :
 * un motif appliqué au texte brut se satisferait de l'explication.
 */

const RACINES = ["src/app/p", "src/components/publique"] as const;

/**
 * Les fichiers autorisés à écrire une couleur fixe, et pourquoi.
 *
 * La raison est OBLIGATOIRE : sans elle, cette liste devient l'endroit où l'on
 * range ce qu'on ne veut pas expliquer, et le contrôle ne prouve plus rien.
 */
const EXCEPTIONS: ReadonlyMap<string, string> = new Map([
  [
    "visionneur.tsx",
    "le plein écran est NOTRE surface, pas celle du vendeur : un fond noir fixe " +
      "sur lequel le blanc est le seul choix possible. L'accent n'y entre pas.",
  ],
]);

/** Ce qui trahit une couleur d'écriture ou de fond posée en dur. */
const COULEUR_EN_DUR =
  /#(?:fff|ffffff|000|000000)\b|\btext-white\b|\bbg-white\b|\btext-black\b|\bbg-black\b/i;

const FLOU = /backdrop-blur|backdrop-filter/;

function fichiers(racine: string): readonly string[] {
  const trouves: string[] = [];
  const parcourir = (dossier: string): void => {
    for (const entree of readdirSync(dossier)) {
      const chemin = join(dossier, entree);
      if (statSync(chemin).isDirectory()) parcourir(chemin);
      else if (chemin.endsWith(".tsx") || chemin.endsWith(".ts")) trouves.push(chemin);
    }
  };
  parcourir(racine);
  return trouves;
}

describe("la page client ne décide jamais d'une couleur à la place du vendeur", () => {
  const tous = RACINES.flatMap((r) => fichiers(r));

  // UN ENSEMBLE VIDE PASSE TOUT. Avant de prouver que ces fichiers sont
  // corrects, il faut prouver qu'on en a trouvé — un chemin renommé rendrait
  // cette suite verte et muette.
  test("la sonde inspecte réellement la surface publique", () => {
    expect(tous.length).toBeGreaterThanOrEqual(6);
    expect(tous.some((f) => f.includes("page.tsx"))).toBe(true);
  });

  test("aucune couleur en dur hors des exceptions déclarées", () => {
    const fautifs = tous
      .filter((f) => COULEUR_EN_DUR.test(sansCommentaires(readFileSync(f, "utf8"))))
      .map((f) => f.split(/[\\/]/).pop() as string);

    const nonDeclares = fautifs.filter((n) => !EXCEPTIONS.has(n));
    expect(nonDeclares, "couleur fixe posée sur une surface qui porte l'accent").toEqual([]);
  });

  // L'AUTRE SENS. Une exception posée pour un fichier qui n'écrit plus de
  // couleur fixe continuerait de couvrir tout ce qu'on y ajouterait ensuite.
  test("chaque exception déclarée correspond encore à un fichier fautif", () => {
    const fautifs = new Set(
      tous
        .filter((f) => COULEUR_EN_DUR.test(sansCommentaires(readFileSync(f, "utf8"))))
        .map((f) => f.split(/[\\/]/).pop() as string),
    );

    for (const [nom, raison] of EXCEPTIONS) {
      expect(raison.length, `${nom} : exception sans raison`).toBeGreaterThan(30);
      expect(fautifs.has(nom), `${nom} : exception devenue inutile, à retirer`).toBe(true);
    }
  });

  test("aucun flou sur la page client", () => {
    for (const f of tous) {
      expect(FLOU.test(sansCommentaires(readFileSync(f, "utf8"))), `${f} floute`).toBe(false);
    }
  });
});

describe("les retraits de l'écriture sur accent suivent l'écriture elle-même", () => {
  /*
   * CE QUI EST VÉRIFIÉ ICI N'EST PAS UNE VALEUR MAIS UNE COHÉRENCE.
   *
   * `surRemplissageDoux` et `surRemplissageFaible` sont des versions atténuées
   * de `surRemplissage`. Le jour où l'un part du blanc alors que l'écriture est
   * noire, le résultat est invisible sur l'aplat — et rien ne le signale : ce
   * n'est faux nulle part, c'est simplement illisible.
   */
  const CAS = [
    ["#0058be", "bleu par défaut — écriture blanche"],
    ["#111111", "presque noir — écriture blanche"],
    ["#eab308", "jaune vif — écriture NOIRE, le cas qui a motivé tout ceci"],
    ["#ffffff", "blanc — écriture noire"],
    ["#e11d48", "rouge saturé"],
    ["pas-une-couleur", "valeur invalide : la page doit rester lisible"],
  ] as const;

  test.each(CAS)("%s (%s)", (couleur) => {
    const r = resoudreAccent(couleur);
    const blanche = r.surRemplissage === "#ffffff";

    // L'ÉCRITURE SOMBRE EST L'ENCRE #111117, PAS LE NOIR PUR — comme dans le
    // script de la planche Marque, qui résout le même contraste et choisit
    // entre `#ffffff` et `rgba(17,17,23,...)`. Le noir pur n'apparaît dans
    // aucune des 41 planches.
    expect(r.surRemplissageDoux.startsWith(blanche ? "rgba(255" : "rgba(17")).toBe(true);
    expect(r.surRemplissageFaible.startsWith(blanche ? "rgba(255" : "rgba(17")).toBe(true);
  });

  // CONTRE-TEST POSITIF : une suite où tout serait noir passerait à 100 % sans
  // rien prouver. Il faut qu'au moins un cas bascule dans chaque sens, sinon la
  // cohérence vérifiée plus haut ne porte que sur une branche.
  test("les deux branches sont réellement empruntées", () => {
    expect(resoudreAccent("#eab308").surRemplissage).toBe("#111117");
    expect(resoudreAccent("#0058be").surRemplissage).toBe("#ffffff");
    // Et le violet du canevas bascule bien du côté CLAIR : c'est ce que le
    // choix des candidats a changé. Avec le noir pur en lice il l'emportait
    // (4,71:1 contre 4,46:1), et le bouton d'approbation que le client voit en
    // premier s'écrivait en noir là où la planche l'écrit en blanc.
    expect(resoudreAccent("#7c5cf5").surRemplissage).toBe("#ffffff");
  });
});

describe("le rendu des réseaux ne fait pas confiance à ce qu'il lit", () => {
  /*
   * TROIS CONTRÔLES POUR UN MÊME CHAMP, ET CE N'EST PAS UNE REDITE.
   *
   * Zod et la contrainte de base protègent l'ÉCRITURE ; celui-ci protège la
   * page de CE QU'ELLE LIT. React n'assainit pas un `href` — un `javascript:`
   * arrivé en base par n'importe quel autre chemin (migration corrective,
   * import, console d'administration) s'exécuterait chez le client d'un
   * vendeur, sur une page qu'il croit être la sienne.
   *
   * Avant ce contrôle, la phrase juste était « ce serait ouvert si quelqu'un
   * écrivait en base autrement » : une protection qui tient à une ABSENCE
   * n'est pas une protection (L-029).
   */
  /** La note du pied de page bureau — sans effet sur ce que ce test éprouve. */
  const NOTE = "Les liens s'ouvrent dans un nouvel onglet.";
  const SITE = "Site web";

  const BOUTIQUE = {
    nom: "Atelier Nord",
    logo: null,
    couleur: "#0058be",
    langue: "fr",
    filigrane: false,
    instagram: null,
    tiktok: null,
    whatsapp: null,
    site: null,
  };

  test("un lien exécutable stocké en base n'est PAS rendu", () => {
    const rendu = ReseauxVendeur({
      boutique: { ...BOUTIQUE, instagram: "javascript:alert(1)" },
      titre: "Retrouvez Atelier Nord",
      note: NOTE,
      libelleSite: SITE,
    });

    // Les trois liens invalides : le bloc entier disparaît, sans un mot au
    // client — il n'y peut rien, et son vendeur ne lira jamais cette page.
    expect(rendu).toBeNull();
  });

  test.each([
    ["https://instagram.com.attaquant.example/x", "domaine en préfixe"],
    ["https://attaquant.example/instagram.com/x", "domaine en chemin"],
    ["http://instagram.com/x", "http en clair"],
    ["data:text/html,<script>", "charge inline"],
  ])("« %s » (%s) n'est pas rendu", (valeur) => {
    expect(
      ReseauxVendeur({ boutique: { ...BOUTIQUE, instagram: valeur }, titre: "t", note: NOTE, libelleSite: SITE }),
    ).toBeNull();
  });

  // CONTRE-TEST POSITIF. Une garde qui refuserait TOUT passerait ces cas à
  // 100 % en n'affichant jamais aucun réseau — c'est-à-dire en cassant la
  // fonctionnalité sans que rien ne le dise.
  test("un lien conforme EST rendu, et il porte noopener", () => {
    const rendu = ReseauxVendeur({
      boutique: { ...BOUTIQUE, instagram: "https://instagram.com/atelier.nord" },
      titre: "Retrouvez Atelier Nord",
      note: NOTE,
      libelleSite: SITE,
    });

    expect(rendu).not.toBeNull();
    const serialise = JSON.stringify(rendu);
    expect(serialise).toContain("https://instagram.com/atelier.nord");
    expect(serialise).toContain("noopener");
  });
});
