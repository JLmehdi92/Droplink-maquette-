import "server-only";
import { adresseAppelant, empreinte } from "@/lib/limitation/empreinte";

/**
 * L'EMPREINTE DE L'ADMINISTRATEUR QUI CONSULTE.
 *
 * Le journal doit dire D'OÙ un accès a eu lieu : c'est la pièce qui distingue
 * une consultation légitime d'un accès depuis un poste ou un pays qui n'a rien à
 * y faire, et c'est ce qu'on regarderait en premier après un incident.
 *
 * L'ADRESSE EST SALÉE, JAMAIS STOCKÉE EN CLAIR. Sans sel, une IPv4 se retrouve
 * par force brute en quelques secondes — l'espace fait quatre milliards de
 * valeurs, ce qui ne résiste à rien. Un journal de sécurité qui deviendrait
 * lui-même un fichier d'adresses en clair serait un beau retournement.
 *
 * UNE ADRESSE ABSENTE NE BLOQUE PAS LA CONSULTATION. La chaîne vide est écrite,
 * et la base la retraduit en `null`. Le raisonnement inverse — refuser l'accès
 * faute d'adresse — donnerait à qui sait masquer la sienne le pouvoir de couper
 * l'administration, c'est-à-dire exactement l'outil dont on a besoin au moment
 * où quelqu'un s'y intéresse d'un peu trop près.
 */
export async function empreinteAdmin(): Promise<string> {
  const adresse = await adresseAppelant();
  if (adresse === null) return "";
  return empreinte(adresse);
}
