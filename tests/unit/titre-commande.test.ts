import { describe, expect, test } from "vitest";
import { titreDeCommande } from "@/lib/commandes/titre";

/**
 * COMMENT UNE COMMANDE S'APPELLE.
 *
 * ⚠️ DÉFAUT RÉEL, TROUVÉ EN PILOTANT LE 29/08/2026 : l'onglet du navigateur
 * annonçait « Nouvelle commande » pour TOUTES les commandes, remplies et
 * expédiées comprises. La règle juste existait déjà — mais dans l'en-tête de
 * l'écran seulement, et `generateMetadata` en avait écrit une autre.
 *
 * ⚠️ CE FICHIER NE PROUVE PAS QUE LE DÉFAUT EST CORRIGÉ. Il fixe la règle ; ce
 * qui prouve que les DEUX surfaces l'appliquent est la sonde de `pnpm fumee`,
 * qui lit le `<title>` réellement servi derrière une vraie session — et qui
 * échoue dans les deux sens. Un test qui constate qu'une fonction existe ne
 * prouve jamais que son absence bloque.
 */

describe("Le titre d'une commande", () => {
  test("porte le nom du client dès qu'il y en a un", () => {
    expect(titreDeCommande("dimeh", "Nouvelle commande")).toBe("dimeh");
  });

  test("retombe sur le libellé de brouillon quand le nom est vide", () => {
    expect(titreDeCommande("", "Nouvelle commande")).toBe("Nouvelle commande");
    expect(titreDeCommande(null, "Nouvelle commande")).toBe("Nouvelle commande");
    expect(titreDeCommande(undefined, "Nouvelle commande")).toBe("Nouvelle commande");
  });

  test("ne prend pas des espaces pour un nom", () => {
    // Un champ où l'on a frappé la barre d'espace n'est pas un nom : sans cette
    // coupe, l'onglet porterait une chaîne vide, et le navigateur y mettrait ce
    // qu'il trouve — mesuré : « Revenir à mes commandes ».
    expect(titreDeCommande("   ", "Nouvelle commande")).toBe("Nouvelle commande");
    expect(titreDeCommande("\n\t ", "Nouvelle commande")).toBe("Nouvelle commande");
  });

  test("rend le nom tel qu'il est saisi, sans le rogner", () => {
    // Le nom est un pseudo choisi par le vendeur pour son client. Le tronquer
    // ici le tronquerait aussi dans l'en-tête, qui partage cette fonction.
    const long = "un pseudo vraiment très long que personne ne raccourcit ici";
    expect(titreDeCommande(long, "Nouvelle commande")).toBe(long);
  });

  test("le libellé de brouillon vient de l'appelant, jamais d'ici", () => {
    // Ce module ne connaît pas la langue : une chaîne visible en dur y serait
    // invisible aux sondes de traduction.
    expect(titreDeCommande(null, "New order")).toBe("New order");
  });
});
