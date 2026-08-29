import { config } from "dotenv";

/**
 * AMORÇAGE GLOBAL DES SUITES QUI TOUCHENT LA BASE.
 *
 * Il s'exécute UNE FOIS par projet, avant tout fichier de test — donc avant
 * tout `beforeAll` susceptible d'échouer. C'est ce qui le rend fiable là où un
 * `afterAll` ne l'est pas : `afterAll` ne s'exécute pas quand la mise en place
 * a échoué, et c'est précisément dans ce cas qu'il reste des résidus.
 *
 * `globalSetup` tourne dans son propre contexte : les fichiers de `setupFiles`
 * n'y ont pas encore chargé l'environnement, il faut donc le charger ici.
 */
config({ path: ".env.local", quiet: true });

export async function setup(): Promise<void> {
  const { purgerResidusDeTest, rendreLesParametresAuDefaut } = await import("./purger-residus");
  await purgerResidusDeTest();
  await rendreLesParametresAuDefaut();
}
