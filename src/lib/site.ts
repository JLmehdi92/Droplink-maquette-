import "server-only";
import { headers } from "next/headers";

/**
 * Origine canonique du site.
 *
 * POURQUOI NE PAS SE CONTENTER DE L'EN-TÊTE `Origin` OU `Host`.
 *
 * L'URL de retour d'un lien magique porte le pouvoir d'ouvrir un compte. La
 * construire à partir d'un en-tête de requête revient à laisser l'appelant
 * choisir où le lien atterrira : une requête forgée avec `Host: exemple-mal.tld`
 * produirait un email, envoyé à la VRAIE adresse de la victime, dont le lien
 * mène chez l'attaquant. La victime clique un lien qui vient bien de nous, et
 * son jeton part ailleurs.
 *
 * Deux barrières, et l'ordre compte :
 *   1. Supabase refuse toute redirection absente de sa liste d'autorisation.
 *      C'est la barrière qui FAIT AUTORITÉ, parce qu'elle est hors de notre
 *      code et ne peut pas être oubliée dans un nouveau chemin.
 *   2. Ce module, qui préfère une valeur configurée à un en-tête. C'est la
 *      défense en profondeur : elle ne remplace pas la première, elle évite de
 *      dépendre entièrement d'un réglage posé dans une console.
 *
 * En développement, où aucune origine n'est configurée, l'en-tête sert de repli
 * — mais seulement parce que la liste d'autorisation de Supabase, elle, reste en
 * vigueur.
 */

function origineConfiguree(): string | null {
  const brut = process.env["NEXT_PUBLIC_SITE_URL"];
  if (brut === undefined || brut.trim() === "") return null;
  try {
    const url = new URL(brut.trim());
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      // Une origine non chiffrée hors développement ferait voyager le jeton en
      // clair. Mieux vaut retomber sur l'en-tête, que Supabase filtrera.
      return null;
    }
    return url.origin;
  } catch {
    // Une origine illisible est traitée comme absente : on ne devine pas une
    // URL de retour, on préfère le repli explicite.
    return null;
  }
}

export async function origineDuSite(): Promise<string | null> {
  const configuree = origineConfiguree();
  if (configuree !== null) return configuree;

  const enTetes = await headers();
  const origine = enTetes.get("origin");
  if (origine !== null && origine !== "") return origine;

  const hote = enTetes.get("host");
  if (hote === null || hote === "") return null;
  const protocole = enTetes.get("x-forwarded-proto") ?? "http";
  return `${protocole}://${hote}`;
}
