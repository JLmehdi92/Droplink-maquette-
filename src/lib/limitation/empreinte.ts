import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";

/**
 * L'identité d'un appelant anonyme, telle qu'on a le droit de la retenir.
 *
 * Extrait de `quota.ts` parce qu'un second appelant en a besoin : le comptage
 * des vues de lien. Deux implémentations de l'empreinte finiraient par diverger
 * — un sel appliqué d'un côté, une troncature de l'autre — et la divergence ne
 * casserait rien, elle produirait simplement deux populations distinctes pour
 * un même visiteur.
 */

/**
 * Empreinte salée d'une valeur identifiante.
 *
 * Salée, parce qu'une IPv4 non salée se retrouve par force brute en quelques
 * secondes : l'espace fait quatre milliards de valeurs, et un sha256 se calcule
 * par milliards par seconde. Une empreinte non salée n'est pas une
 * pseudonymisation, c'est un encodage.
 *
 * LÈVE si le sel manque. Rendre une empreinte non salée « en attendant » est
 * exactement le défaut qu'on ne verrait jamais : la valeur aurait la FORME
 * attendue et franchirait toute validation de présence.
 */
export function empreinte(valeur: string): string {
  const sel = process.env["HASH_SALT"] ?? "";
  if (sel.length < 16) {
    throw new Error(
      "HASH_SALT absent ou trop court. Sans sel, l'empreinte d'une adresse IP " +
        "se retrouve par force brute en quelques secondes : ce ne serait pas " +
        "une pseudonymisation mais un encodage.",
    );
  }
  return createHash("sha256").update(`${sel}:${valeur}`).digest("hex").slice(0, 32);
}

/**
 * Adresse de l'appelant, telle que le bord la rapporte.
 *
 * `x-forwarded-for` est une LISTE que n'importe quel intermédiaire peut
 * rallonger, et que le client peut préremplir. On prend donc l'en-tête posé par
 * notre propre bord quand il existe, et seulement à défaut la PREMIÈRE entrée de
 * `x-forwarded-for`.
 *
 * Rend `null` si rien n'est exploitable : mieux vaut l'absence assumée qu'une
 * valeur qu'un client aurait choisie, laquelle transformerait le compteur en
 * outil pour épuiser le quota des autres.
 */
export async function adresseAppelant(): Promise<string | null> {
  const enTetes = await headers();
  const cloudflare = enTetes.get("cf-connecting-ip");
  if (cloudflare !== null && cloudflare.trim() !== "") return cloudflare.trim();

  const transmis = enTetes.get("x-forwarded-for");
  if (transmis !== null) {
    const premiere = transmis.split(",")[0]?.trim();
    if (premiere !== undefined && premiere !== "") return premiere;
  }
  return null;
}

/** Le pays que le bord rapporte, quand il en rapporte un. */
export async function paysAppelant(): Promise<string | null> {
  const enTetes = await headers();
  const pays = enTetes.get("cf-ipcountry");
  // `XX` est ce que Cloudflare rend quand il ne sait pas : le stocker ferait
  // croire à un pays nommé.
  if (pays === null || pays.trim() === "" || pays.trim().toUpperCase() === "XX") return null;
  return pays.trim().toUpperCase().slice(0, 2);
}
