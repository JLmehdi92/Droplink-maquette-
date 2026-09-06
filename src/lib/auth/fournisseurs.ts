import "server-only";

/**
 * LES FOURNISSEURS D'IDENTITÉ EXTERNES.
 *
 * UN SEUL AUJOURD'HUI, ET C'EST UNE DÉCISION. Le produit s'adresse à toute
 * organisation qui expédie : le fournisseur d'identité proposé doit être neutre
 * et reconnu partout. Google l'est.
 *
 * CE QUI N'EST PAS PROPOSÉ, ET POURQUOI :
 *
 *   - WeChat et Alipay ne sont pas connus du serveur d'authentification, et
 *     surtout leur plateforme ouverte exige une ENTITÉ COMMERCIALE CHINOISE
 *     enregistrée. Tant que cette entité n'existe pas, la question ne se pose
 *     pas — et c'est précisément le fournisseur chinois qui en aurait eu
 *     l'usage, Google lui étant inaccessible.
 *
 *     ⚠️ CETTE LIGNE DISAIT « pour lui, le lien magique par email reste
 *     l'unique porte, et c'est la délivrabilité de cet email qui décide de
 *     tout ». LE LIEN MAGIQUE EST SUPPRIMÉ depuis le 01/09/2026, et le
 *     raisonnement se retournait déjà contre lui-même : si la délivrabilité
 *     vers les boîtes chinoises est le point faible — et elle l'est —, alors
 *     faire dépendre CHAQUE connexion d'un email était le pire choix
 *     possible. Le fournisseur entre par email + mot de passe, comme tout le
 *     monde ; la délivrabilité ne porte plus que le RECOURS.
 *
 *     C'est le fichier qu'on relit au moment d'activer Google : y lire qu'une
 *     autre porte existe pour ce persona ferait renoncer à celle-ci sans
 *     raison.
 *   - Les réseaux sociaux grand public sont techniquement disponibles et
 *     écartés : un bouton de connexion dit en une seconde à qui s'adresse le
 *     produit, et celui-ci s'adresse aussi à des entreprises établies.
 *
 * LE BOUTON N'APPARAÎT QUE S'IL EST CONFIGURÉ. Un bouton qui mène à une erreur
 * de configuration est pire que pas de bouton : l'utilisateur conclut que le
 * produit est cassé, et il a raison. La configuration se lit ICI, côté serveur,
 * et le drapeau ne traverse jamais le réseau — il décide seulement de ce qui est
 * rendu.
 */

export type FournisseurExterne = "google";

/**
 * Vrai quand le fournisseur est réellement branché.
 *
 * LA VARIABLE N'EST PAS PRÉFIXÉE `NEXT_PUBLIC_`. Elle n'a rien à faire dans un
 * bundle : c'est le serveur qui décide d'afficher le bouton, et l'action qui
 * décide de l'honorer. Le client n'a aucune décision à prendre.
 *
 * ELLE EXIGE UNE VALEUR EXPLICITE. Une variable simplement PRÉSENTE mais vide,
 * ou laissée à un texte de remplacement du genre `à-remplir`, franchirait un
 * contrôle de présence sans que rien ne soit configuré — une valeur qui a la
 * FORME d'une configuration n'en est pas une.
 */
export function fournisseurActif(fournisseur: FournisseurExterne): boolean {
  if (fournisseur !== "google") return false;
  return (process.env["AUTH_GOOGLE_ACTIF"] ?? "").trim() === "1";
}

/** Les fournisseurs à proposer sur les écrans de connexion et d'inscription. */
export function fournisseursActifs(): readonly FournisseurExterne[] {
  return (["google"] as const).filter(fournisseurActif);
}
