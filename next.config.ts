import path from "path";
import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

/**
 * EN-TÊTES DE SÉCURITÉ.
 *
 * Il n'en existait AUCUN avant l'audit — ni `Referrer-Policy`, ni
 * `X-Frame-Options`, ni `Content-Security-Policy`. Les deux premiers manquaient
 * là où ils comptent le plus.
 *
 * LE JETON EST UNE CAPACITÉ, PAS UNE DONNÉE. Il est dans l'URL de `/p/{jeton}`,
 * il est immuable à vie, et la page charge des vignettes depuis des URL
 * présignées R2 — donc vers une AUTRE origine. Le défaut des navigateurs
 * actuels (`strict-origin-when-cross-origin`) n'envoie que l'origine, donc rien
 * ne fuit aujourd'hui. Mais la phrase juste était « ce serait ouvert si le
 * défaut du navigateur changeait, ou si quelqu'un posait une politique plus
 * permissive ». Une protection qui tient à un défaut tiers n'en est pas une.
 *
 * `no-referrer` SUR LA PAGE PUBLIQUE, et pas ailleurs : c'est la seule surface
 * dont l'URL porte un secret.
 */
const enTetesCommuns = [
  // Le type déclaré fait foi : sans cela, un navigateur peut « deviner » qu'un
  // fichier servi en `image/jpeg` est en réalité du HTML et l'exécuter.
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Le produit ne demande ni caméra, ni micro, ni position. Le dire ferme ces
  // capacités pour tout ce que la page charge, y compris un cadre tiers.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  // Racine epinglee : un `package-lock.json` traine dans le dossier
  // utilisateur, et Next.js l'elisait comme racine d'espace de travail. La
  // resolution des modules serait alors partie d'un dossier sans rapport.
  turbopack: { root: path.join(__dirname) },
  outputFileTracingRoot: path.join(__dirname),

  async headers() {
    return [
      {
        source: "/:path*",
        headers: enTetesCommuns,
      },
      {
        /*
         * LA PAGE PUBLIQUE EST TRAITÉE À PART, pour deux raisons distinctes.
         *
         * 1. `no-referrer` : son URL CONTIENT le jeton. Toute requête sortante
         *    — une vignette signée sur R2 — emporterait l'en-tête `Referer`, et
         *    avec lui la capacité d'ouvrir la commande, définitivement.
         *
         * 2. `frame-ancestors 'none'` : l'arbitrage QC y est exposé à un
         *    visiteur NON authentifié, sans étape de confirmation. Cadrée en
         *    transparence par quiconque détient le lien, la page ferait
         *    approuver la commande par le client à son insu — et l'approbation
         *    est précisément l'acte qui engage.
         *
         * `X-Frame-Options: DENY` est conservé en plus : les deux disent la
         * même chose, mais aux navigateurs de générations différentes.
         */
        source: "/p/:path*",
        headers: [
          ...enTetesCommuns.filter((h) => h.key !== "Referrer-Policy"),
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
    ];
  },
};

// Le plugin indique a Next ou trouver `getRequestConfig`. Sans lui, les
// Server Components rendent les cles brutes au lieu des traductions — un
// echec qui ne leve pas et se voit seulement a l ecran.
const avecIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default avecIntl(nextConfig);
