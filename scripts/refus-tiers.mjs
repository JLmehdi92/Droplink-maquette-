/**
 * PRÉCHARGÉ DANS LE SERVEUR DE MESURE (`node --import`), AVANT NEXT.
 *
 * Le serveur de mesure est un processus à part : le transport du harnais (`transport.mjs`), qui
 * refuse les tiers payants dans les suites, ne l'atteignait pas. Le 20/09/2026, Wassim a relevé
 * 191 / 200 sur 17TRACK : le parcours navigateur saisissait des numéros inventés dans l'éditeur,
 * et ce serveur, qui avait hérité de la VRAIE clé par `.env.local`, les prenait en charge.
 *
 * Remplacer la clé ne suffit pas, et ne doit pas suffire : une protection qui tient à l'absence
 * d'une clé n'en est pas une (L-029) — une clé qui revient par un autre chemin rouvre tout. Ici,
 * c'est le TRANSPORT qui refuse, et il refuse bruyamment : même hôtes, même refus que les suites.
 */
import { refusDHote } from "./transport.mjs";

const natif = globalThis.fetch.bind(globalThis);

globalThis.fetch = /** @type {typeof globalThis.fetch} */ ((entree, options) => {
  const refus = refusDHote(entree);
  if (refus !== null) {
    console.error(refus.message);
    return Promise.reject(refus);
  }
  return natif(entree, options);
});

console.log("[mesure] tiers payants refusés au transport : 17TRACK, PostHog, Resend");
