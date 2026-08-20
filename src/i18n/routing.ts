import { defineRouting } from "next-intl/routing";
import { LANGUES, LANGUE_DEFAUT } from "./config";

/**
 * Routage localisé de l'espace vendeur et des pages publiques de marque.
 *
 * `localePrefix: "always"` : toute URL porte sa langue (`/fr/...`, `/en/...`).
 * Un préfixe optionnel créerait DEUX adresses pour la même page — `/` et
 * `/fr/` — donc deux entrées de cache, deux URL canoniques et deux façons pour
 * un lien de se tromper.
 *
 * ⚠️ La page publique `/p/[token]` n'est PAS ici, et ne doit jamais l'être : sa
 * langue est celle du VENDEUR, pas de l'URL. Un client à qui on envoie un lien
 * ne la choisit pas, et un préfixe de langue produirait deux adresses pour un
 * jeton censé être unique — dont une que le vendeur n'a jamais envoyée.
 */
export const routing = defineRouting({
  locales: LANGUES,
  defaultLocale: LANGUE_DEFAUT,
  localePrefix: "always",
});
