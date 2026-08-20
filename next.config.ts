import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Racine epinglee : un `package-lock.json` traine dans le dossier
  // utilisateur, et Next.js l'elisait comme racine d'espace de travail. La
  // resolution des modules serait alors partie d'un dossier sans rapport.
  turbopack: { root: path.join(__dirname) },
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
