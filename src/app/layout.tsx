import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { LANGUE_DEFAUT } from "@/i18n/config";

/*
 * `next/font` télécharge les polices AU BUILD et les sert depuis notre propre
 * domaine. Aucune requête vers Google au moment du rendu : une dépendance
 * réseau sur le chemin critique de la page publique échouerait en silence
 * derrière un pare-feu, et le texte partirait dans une police de repli sans que
 * rien ne le signale.
 */
const titre = Plus_Jakarta_Sans({
  variable: "--font-titre",
  subsets: ["latin"],
  display: "swap",
});

const corps = Inter({
  variable: "--font-corps",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "DropLink",
  description: "Une page privée par commande : photos, vidéos et suivi, dans un seul lien.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang={LANGUE_DEFAUT}>
      <body className={`${titre.variable} ${corps.variable} antialiased`}>{children}</body>
    </html>
  );
}
