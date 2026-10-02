/**
 * LA VALIDATION À LA SAISIE DES PAGES D'ACCÈS (maquette, `acces.js` et `compte.js`).
 *
 * C'est un CONFORT, jamais une autorité, et elle ne refuse JAMAIS ce que le serveur
 * accepterait : la longueur se compte comme lui (unités UTF-16, `String.length`, et
 * non en points de code), l'adresse recopiée se cherche comme lui (la partie locale,
 * seulement à partir de quatre caractères : `lib/auth/mot-de-passe.ts`). Le module du
 * serveur n'est pas importé ici : il embarquerait zod dans le paquet du navigateur.
 * Rien d'ici ne dit quoi que ce soit sur l'existence d'un compte.
 */

/** La forme d'une adresse, celle de la maquette : un refus ici en est aussi un au serveur. */
export function emailValide(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}

/** Trop court, compté comme le serveur (`motDePasse.length < LONGUEUR_MINIMALE`). */
export function tropCourt(motDePasse: string, minimum: number): boolean {
  return motDePasse.length < minimum;
}

/** Un mot de passe qui recopie la partie locale de l'adresse — la règle exacte du serveur. */
export function contientAdresse(motDePasse: string, email: string): boolean {
  const arobase = email.lastIndexOf("@");
  if (arobase <= 0) return false;
  const locale = email.slice(0, arobase).trim().toLowerCase();
  return locale.length >= 4 && motDePasse.toLowerCase().includes(locale);
}

/** La valeur qui PART réellement (un remplissage automatique peut ne rien dire à React). */
export function valeurEnvoyee(formulaire: HTMLFormElement, nom: string): string {
  const v = new FormData(formulaire).get(nom);
  return typeof v === "string" ? v : "";
}

function mouvementReduit(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * La secousse d'un champ refusé (maquette : `secouer`, 360 ms). Retirer puis
 * reposer la classe ne rejoue pas l'animation dans la même image : la lecture de
 * `offsetWidth` force le style entre les deux. Sous mouvement réduit, rien ne
 * bouge : le message et le focus disent déjà le refus.
 */
export function secouer(el: Element | null | undefined): void {
  if (!(el instanceof HTMLElement) || mouvementReduit()) return;
  el.classList.remove("secoue");
  void el.offsetWidth;
  el.classList.add("secoue");
}

/** Secoue la boîte de chaque champ marqué invalide dans `portee`. */
export function secouerInvalides(portee: Element | null): void {
  portee?.querySelectorAll(".champ-acces.est-invalide .champ-acces__boite").forEach((b) => secouer(b));
}

/*
 * LE REFUS « À LA SORTIE » NE DOIT PAS DÉPLACER LE BOUTON SOUS LE DOIGT.
 *
 * Mesuré au téléphone (390 px, tactile) : taper « Envoyer » fait d'abord sortir du
 * champ ; le message qui apparaît alors pousse le bouton de 20 px, et le relâché
 * tombe à côté — aucun envoi, aucune secousse. La maquette a le même défaut. Une
 * sortie vers le bouton d'envoi est donc laissée à l'envoi, qui valide tout.
 *
 * ET VERS UN LIEN DU FORMULAIRE (audit du 02/10/2026) : la suggestion d'adresse, posée à la
 * sortie, poussait « Mot de passe oublié ? » et le lien de bascule d'une quarantaine de
 * pixels entre l'appui et le relâché. Une sortie vers un lien ou un bouton ne pose rien.
 */
let dernierAppuiEnvoi = -Infinity;
let ecoute = false;

export function ecouterAppuisEnvoi(): void {
  if (ecoute) return;
  ecoute = true;
  document.addEventListener(
    "pointerdown",
    (e) => {
      if ((e.target as Element | null)?.closest?.('button, a[href]')) dernierAppuiEnvoi = performance.now();
    },
    { capture: true, passive: true },
  );
}

export function sortieVersEnvoi(cible: EventTarget | null): boolean {
  return cible instanceof HTMLButtonElement || cible instanceof HTMLAnchorElement || performance.now() - dernierAppuiEnvoi < 400;
}
