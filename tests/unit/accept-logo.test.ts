import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ACCEPT_LOGO, TYPES_LOGO_ACCEPTES } from "@/lib/boutique/types-logo";
import { sansCommentaires } from "../aide/source";

/**
 * AUCUN SÉLECTEUR DE FICHIERS NE PROPOSE UN TYPE QUE LE SERVEUR REFUSERA.
 *
 * ⚠️ DÉFAUT MESURÉ LE 02/09/2026 : l'onboarding portait
 * `accept="image/png,image/jpeg,image/webp,image/svg+xml"`, l'écran « Ma
 * marque » n'annonçait que les trois premiers, et `preparerLogo("image/svg+xml")`
 * rend `{"statut":"erreur","motif":"type"}`.
 *
 * Le vendeur choisissait donc un fichier que le sélecteur lui montrait, et se
 * faisait refuser après coup — au PREMIER écran du produit, dans la minute où
 * il le découvre. Et les deux écrans ne disaient déjà pas la même chose.
 *
 * ⚠️ IL INVENTORIE, IL NE SÉLECTIONNE PAS. Il rend TOUS les `accept=` de la
 * surface et exige qu'ils soient DÉRIVÉS, pas recopiés. Un contrôle qui
 * vérifierait seulement les deux fichiers connus regarderait là où le défaut
 * n'est plus dès le troisième sélecteur ajouté.
 *
 * ⚠️ ET IL S'APPLIQUE AU CODE, COMMENTAIRES RETIRÉS (L-031) : ces fichiers
 * PARLENT du SVG pour expliquer pourquoi il est refusé.
 */
const RACINES = ["src/components", "src/app"] as const;

function fichiers(racine: string): readonly string[] {
  const trouves: string[] = [];
  const parcourir = (dossier: string): void => {
    for (const entree of readdirSync(dossier)) {
      const chemin = join(dossier, entree);
      if (statSync(chemin).isDirectory()) parcourir(chemin);
      else if (chemin.endsWith(".tsx")) trouves.push(chemin);
    }
  };
  parcourir(racine);
  return trouves;
}

describe("Les sélecteurs de fichiers disent ce que le serveur accepte", () => {
  const tous = RACINES.flatMap((r) => fichiers(r));
  const avecAccept = tous.filter((f) => /accept=/.test(sansCommentaires(readFileSync(f, "utf8"))));

  test("la sonde trouve réellement des sélecteurs", () => {
    // UN ENSEMBLE VIDE PASSE TOUT : un renommage de dossier rendrait cette
    // suite verte et muette.
    expect(tous.length).toBeGreaterThan(20);
    expect(avecAccept.length, "aucun `accept=` trouvé dans la surface").toBeGreaterThanOrEqual(2);
  });

  test("aucun `accept=` n'énumère des types en dur", () => {
    /*
     * LA RÈGLE EST « DÉRIVÉ, PAS RECOPIÉ ». Une liste écrite à la main est
     * juste le jour où on l'écrit : c'est en la recopiant deux fois qu'on a
     * obtenu deux écrans qui ne disent pas la même chose, dont un qui ment.
     *
     * Les sélecteurs de MÉDIAS ont leur propre liste — photos et vidéos — et ne
     * sont pas jugés ici : ce contrôle porte sur le LOGO.
     */
    const enDur = avecAccept.filter((f) => {
      const code = sansCommentaires(readFileSync(f, "utf8"));
      return /accept="[^"]*image\/(png|jpeg|webp|svg)[^"]*"/.test(code);
    });
    expect(
      enDur.map((f) => f.split(/[\/]/).pop()),
      "types de logo énumérés en dur : ils divergeront du serveur",
    ).toEqual([]);
  });

  test("le SVG est refusé, et la valeur dérivée ne le propose pas", () => {
    // L'EFFET, pas le texte : ce que le sélecteur annonce doit être exactement
    // ce que le serveur accepte.
    expect(TYPES_LOGO_ACCEPTES).not.toContain("image/svg+xml");
    expect(ACCEPT_LOGO).not.toContain("svg");
    expect(ACCEPT_LOGO.split(",")).toEqual([...TYPES_LOGO_ACCEPTES]);
  });

  test("CONTRE-TEST : la valeur dérivée propose bien les trois types acceptés", () => {
    // Sans lui, une liste VIDE passerait les deux contrôles ci-dessus — et le
    // sélecteur n'accepterait plus aucun fichier.
    for (const type of ["image/png", "image/jpeg", "image/webp"]) {
      expect(ACCEPT_LOGO, `${type} devrait être proposé`).toContain(type);
    }
  });
});
