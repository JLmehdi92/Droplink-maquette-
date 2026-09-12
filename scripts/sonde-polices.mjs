/**
 * LA GARDE DE POLICE DES DEUX SONDES DE MESURE.
 *
 * ⚠️ POURQUOI ELLE EXISTE. Le 12/09/2026, le kit servi rendait TOUT son texte
 * dans la police de repli du système : la face latine d'Inter, chargée depuis
 * `fonts.gstatic.com` par un `@import`, rendait un `NetworkError` reproductible
 * dans le Chrome sans fenêtre. Rien ne le disait —
 * `getComputedStyle(...).fontFamily` répondait « Inter », `document.fonts.status`
 * valait « loaded », la page s'affichait, la capture était belle.
 *
 * Les conséquences ne sont pas cosmétiques : « Retour aux commandes » mesurait
 * 149,8 px chez le kit contre 157,9 px chez le produit, pour la même chaîne, la
 * même taille et la même graisse. SEPT POUR CENT D'ÉCART SUR CHAQUE LARGEUR DE
 * TEXTE, dans le sens qui fait passer le produit pour fautif. La soustraction
 * les rapportait comme des défauts d'implémentation, et ils étaient
 * irréparables par construction — on ne peut pas rétrécir du texte pour
 * rattraper une police qui n'est pas la bonne.
 *
 * C'est la forme exacte du défaut que ce dépôt attrape depuis le début : une
 * sonde qui mesure autre chose que ce qu'elle croit, et qui rend des chiffres
 * cohérents. « Une sonde qui mesure un 404 certifie le 404 » ; celle-ci
 * certifiait une police de repli.
 *
 * ⚠️ ELLE LÈVE, ELLE NE SIGNALE PAS. Une ligne de rapport dans un flot de deux
 * cents s'apprend à ignorer ; un inventaire faux écrit sur le disque sera
 * comparé, déclaré, et commité. Il vaut mieux pas de mesure qu'une mauvaise.
 */

/**
 * L'expression à évaluer DANS LA PAGE, juste avant le relevé.
 *
 * Elle n'emploie pas `document.fonts.check()` : avec un `unicode-range`, il
 * répond `false` sur sa chaîne de test par défaut alors que la face EST
 * chargée et employée. On interroge donc les faces elles-mêmes, qui portent
 * leur état réel.
 */
export const VERDICT_POLICES = `(() => {
  const faces = [...document.fonts].filter((f) => /Inter/.test(f.family));
  return {
    total: faces.length,
    chargees: faces.filter((f) => f.status === "loaded").length,
    enErreur: faces.filter((f) => f.status === "error").length,
  };
})()`;

/**
 * Arrête le programme si la page n'a pas rendu son texte en Inter.
 *
 * @param {{total:number, chargees:number, enErreur:number}} v ce que rend `VERDICT_POLICES`
 * @param {string} quoi de quelle page il s'agit, pour le message
 */
export function exigerPolices(v, quoi) {
  if (v.total === 0) {
    console.error(
      `ARRET : ${quoi} ne declare AUCUNE face « Inter ». La page n a pas charge ` +
        "sa feuille de style, ou la sonde mesure une autre page que celle visee.",
    );
    process.exit(1);
  }
  if (v.enErreur > 0 || v.chargees === 0) {
    console.error(
      `ARRET : ${quoi} n a PAS rendu son texte en Inter — ${v.chargees} face(s) ` +
        `chargee(s), ${v.enErreur} en erreur sur ${v.total}.\n` +
        "Le texte est donc rendu dans la police de repli du systeme, et TOUTES les\n" +
        "largeurs relevees seraient fausses d environ 7 % — dans le sens qui fait\n" +
        "passer l autre cote pour fautif.\n" +
        "Causes deja vues : le cache HTTP du navigateur sert une ancienne feuille\n" +
        "(les sondes le desactivent), ou la face vient d un CDN injoignable.",
    );
    process.exit(1);
  }
}
