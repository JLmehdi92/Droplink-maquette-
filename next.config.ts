import path from "path";
import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Racine epinglee : un `package-lock.json` traine dans le dossier
  // utilisateur, et Next.js l'elisait comme racine d'espace de travail. La
  // resolution des modules serait alors partie d'un dossier sans rapport.
  turbopack: { root: path.join(__dirname) },
  outputFileTracingRoot: path.join(__dirname),
};

// Le plugin indique a Next ou trouver `getRequestConfig`. Sans lui, les
// Server Components rendent les cles brutes au lieu des traductions — un
// echec qui ne leve pas et se voit seulement a l ecran.
const avecIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default avecIntl(nextConfig);
