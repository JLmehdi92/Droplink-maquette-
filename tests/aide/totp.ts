import { createHmac } from "node:crypto";

/**
 * UN CODE TOTP RÉEL (RFC 6238 : SHA-1, 30 secondes, 6 chiffres) — pour éprouver
 * la double authentification avec de VRAIS facteurs, jamais un faux serveur.
 *
 * Écrit ici plutôt que tiré d'une bibliothèque : vingt lignes, et un paquet de
 * plus dans les dépendances de TEST serait une surface de plus à auditer pour
 * une fonction que la RFC décrit entièrement.
 */
function base32(secret: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.replace(/=+$/, "").toUpperCase()) {
    const valeur = alphabet.indexOf(c);
    if (valeur < 0) throw new Error(`Caractère base32 invalide : ${c}`);
    bits += valeur.toString(2).padStart(5, "0");
  }
  const octets: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) octets.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(octets);
}

export function codeTotp(secret: string, instant = Date.now()): string {
  const compteur = Buffer.alloc(8);
  compteur.writeBigUInt64BE(BigInt(Math.floor(instant / 30_000)));
  const empreinte = createHmac("sha1", base32(secret)).update(compteur).digest();
  const decalage = (empreinte[19] ?? 0) & 0x0f;
  const nombre = empreinte.readUInt32BE(decalage) & 0x7fffffff;
  return String(nombre % 1_000_000).padStart(6, "0");
}
