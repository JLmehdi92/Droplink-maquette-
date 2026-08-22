import { describe, expect, test } from "vitest";
import { classeAgent } from "@/lib/limitation/empreinte";

/**
 * LA CLASSE D'AGENT BORNE UNE MÉTRIQUE DE VERDICT.
 *
 * MESURÉ AVANT CORRECTION, sur la base : cinq cents vues enregistrées sur une
 * seule commande, depuis une seule adresse, en variant l'agent utilisateur. Avec
 * le quota public actuel, 172 800 vues par jour pour une machine.
 *
 * « Vues par lien > 3 » est un des chiffres sur lesquels se décide si le produit
 * continue. Le rendre fabricable, c'est rendre fabricable le verdict.
 */

/** Ce qu'une machine réelle envoie, et ce qu'un attaquant enverrait. */
function agentsRealistes(n: number): string[] {
  const modeles = [
    (i: number) =>
      `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/1${i}.0.0.0 Safari/537.36`,
    (i: number) =>
      `Mozilla/5.0 (iPhone; CPU iPhone OS 17_${i} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.${i} Mobile/15E148 Safari/604.1`,
    (i: number) => `Mozilla/5.0 (X11; Linux x86_64; rv:12${i}.0) Gecko/20100101 Firefox/12${i}.0`,
  ];
  return Array.from({ length: n }, (_, i) => {
    const modele = modeles[i % modeles.length];
    return modele === undefined ? "" : modele(i);
  });
}

describe("Une variation d'agent ne crée plus une identité", () => {
  test("cinq cents agents distincts se réduisent à une poignée de classes", () => {
    const agents = agentsRealistes(500);

    // La sonde doit d'abord prouver qu'elle inspecte quelque chose : si les
    // agents produits étaient identiques entre eux, le contrôle passerait sans
    // rien établir. Un ensemble vide passe tout.
    expect(new Set(agents).size, "les agents de la sonde ne sont pas distincts").toBe(500);

    const classes = new Set(agents.map(classeAgent));
    expect(
      classes.size,
      `cinq cents agents produisent encore ${classes.size} identités distinctes`,
    ).toBeLessThanOrEqual(5);
  });

  test("l'espace des classes est FERMÉ, quoi qu'on envoie", () => {
    // Le contrôle qui compte vraiment : ce n'est pas « les agents connus se
    // regroupent bien », c'est « rien de ce qu'on peut envoyer n'échappe à
    // l'ensemble ». Une liste de cas connus prouverait ce que son auteur a pensé
    // à inspecter ; celle-ci vise ce qu'il n'a pas prévu.
    const hostiles = Array.from({ length: 300 }, (_, i) => `charge-arbitraire-${i}-${"x".repeat(i)}`);
    const classes = new Set(hostiles.map(classeAgent));

    expect(classes.size, "une chaîne arbitraire produit encore une classe arbitraire").toBe(1);
    expect([...classes][0]).toBe("autre/bureau");
  });

  test("contre-test positif : deux appareils VRAIMENT différents restent distincts", () => {
    // Sans lui, une correction qui rendrait une constante passerait les deux
    // tests précédents — et la métrique dirait « une vue » là où il y en a eu
    // deux cents. Une mesure impossible se dit impossible, elle ne s'arrondit
    // pas à une valeur commode.
    const iphone =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    const windows =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    expect(classeAgent(iphone)).not.toBe(classeAgent(windows));
    expect(classeAgent(iphone)).toBe("safari/mobile");
    expect(classeAgent(windows)).toBe("chrome/bureau");
  });

  test("la version du navigateur ne change RIEN", () => {
    // C'est par là que passait l'abus le plus discret : une mise à jour de
    // navigateur suffisait à recompter un visiteur, sans que personne triche.
    const base =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/VERSION Safari/537.36";
    const versions = ["118.0.0.0", "119.0.5", "120.0.0.0", "131.0.1"].map((v) =>
      classeAgent(base.replace("VERSION", v)),
    );

    expect(new Set(versions).size, "une mise à jour du navigateur recompte le visiteur").toBe(1);
  });
});
