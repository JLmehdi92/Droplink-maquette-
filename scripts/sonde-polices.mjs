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
 * ⚠️ ELLE MESURE L'EFFET, ELLE N'INVENTORIE PAS LES FACES — et la première
 * version faisait l'inverse. Elle comptait les `FontFace` en erreur et refusait
 * dès qu'il y en avait UNE : or la feuille du kit en déclare quinze, une par
 * sous-ensemble Unicode, et celles du cyrillique ou du vietnamien échouent sans
 * aucune conséquence sur un écran écrit en français. Elle a donc refusé de
 * mesurer `/marque` alors que la face latine — la seule qui compte ici — était
 * bien chargée. *Un garde qui refuse à tort est un garde qu'on apprend à
 * contourner.*
 *
 * Ce qui est mesuré désormais : la LARGEUR d'une chaîne témoin rendue en
 * « Inter », comparée à la même chaîne rendue dans une famille qui n'existe
 * pas — donc dans la police de repli du système. Égales, Inter n'est pas
 * appliquée, quelle qu'en soit la raison. C'est la règle du dépôt appliquée à
 * son propre outillage : *interroger l'EFFET, pas le mot.*
 *
 * `document.fonts.check()` ne conviendrait pas : avec un `unicode-range`, il
 * répond `false` sur sa chaîne de test par défaut alors que la face est chargée
 * et employée.
 */
export const VERDICT_POLICES = `(() => {
  const largeur = (famille) => {
    const s = document.createElement("span");
    s.textContent = "Retour aux commandes 0123456789";
    s.style.cssText =
      "position:absolute;left:-9999px;white-space:nowrap;font-size:14px;" +
      "font-weight:500;font-family:" + famille;
    document.body.appendChild(s);
    const l = s.getBoundingClientRect().width;
    s.remove();
    return Math.round(l * 100) / 100;
  };
  const faces = [...document.fonts].filter((f) => /Inter/.test(f.family));
  return {
    total: faces.length,
    chargees: faces.filter((f) => f.status === "loaded").length,
    enErreur: faces.filter((f) => f.status === "error").length,
    enInter: largeur("Inter"),
    enRepli: largeur('"DropLinkPoliceAbsente"'),
  };
})()`;

/**
 * Arrête le programme si la page n'a pas rendu son texte en Inter.
 *
 * @param {{total:number, chargees:number, enErreur:number, enInter:number, enRepli:number}} v
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
  /*
   * ⚠️ LE VERDICT PORTE SUR LA LARGEUR, PAS SUR LE NOMBRE DE FACES EN ERREUR.
   * Une face de sous-ensemble qui échoue — cyrillique, vietnamien — ne change
   * rien à un écran écrit en français. Ce qui compte est que le texte NE SOIT
   * PAS rendu dans la police de repli, et ça se mesure.
   */
  if (v.enInter === v.enRepli) {
    console.error(
      [
        `ARRET : ${quoi} n a PAS rendu son texte en Inter.`,
        `La chaine temoin mesure ${v.enInter} px en Inter et ${v.enRepli} px dans la police`,
        "de repli du systeme : les deux sont EGALES, donc Inter n est pas appliquee",
        `(${v.chargees} face(s) chargee(s), ${v.enErreur} en erreur sur ${v.total}).`,
        "TOUTES les largeurs relevees seraient fausses d environ 7 % — dans le sens qui",
        "fait passer l autre cote pour fautif.",
        "Causes deja vues : le cache HTTP du navigateur sert une ancienne feuille (les",
        "sondes le desactivent), ou la face LATINE vient d un CDN injoignable.",
      ].join("\n"),
    );
    process.exit(1);
  }
}
