import "server-only";

/**
 * LE PLAN PRO — SON PRIX, ET L'ENDROIT OÙ ON LE PAIE.
 *
 * ⚠️ UN SEUL ENDROIT POUR LE PRIX, ET CE N'EST PAS UNE PRÉFÉRENCE DE RANGEMENT.
 * Un prix écrit dans les trois catalogues de traduction diverge au premier
 * changement : quelqu'un corrige `fr.json`, oublie `zh-CN.json`, et un vendeur
 * chinois lit un montant différent de celui qu'on lui facture. Le nombre vit
 * ici, et les catalogues ne portent que la PHRASE autour.
 *
 * ⚠️ 20 € EST LE CHIFFRE DE WASSIM, pas celui du kit. La planche
 * d'administration affiche encore 19,90 € : c'est une ancienne maquette, et
 * elle n'a jamais été une décision. Sa phrase du 20/09/2026 : « on avait
 * l'abonnement pro a 20€ ».
 *
 * ⚠️ ET CE NOMBRE DOIT CORRESPONDRE AU PRODUIT LEMON SQUEEZY. Rien, ici, ne
 * peut le vérifier — le fournisseur ne nous le dit pas avant qu'un paiement
 * arrive. C'est une affirmation de l'application, et c'est pourquoi la page
 * ajoute que la facture est émise par le fournisseur : le montant qui fait foi
 * est celui de la page de paiement, que le vendeur voit avant de payer.
 */
export const PRIX_PRO_EUR = 20;

/*
 * Le plafond de commandes d'un compte Pro n'est PAS écrit ici, et c'est une
 * décision : il se règle dans l'administration (`plafond_commandes_mensuel`).
 * La page le LIT. Une page qui figerait « 300 » ferait mentir le produit le
 * jour où Wassim écrit un autre nombre — et ce jour-là, rien ne le signalerait.
 */

/**
 * Les hôtes de paiement acceptés, comparés par ÉGALITÉ.
 *
 * ⚠️ UN `includes` ACCEPTERAIT `lemonsqueezy.com.pirate.net`. C'est la même
 * garde que sur l'adresse de l'alerte Discord, et pour la même raison : cette
 * URL est lue depuis l'environnement, donc elle peut être fausse par accident
 * comme par malveillance — et ce qu'elle reçoit est un vendeur qui va taper un
 * numéro de carte.
 */
const HOTES = new Set(["lemonsqueezy.com", "store.lemonsqueezy.com"]);

/**
 * L'adresse de paiement, ou `null` si elle n'est pas configurée.
 *
 * ⚠️ `null` N'EST PAS UNE PANNE, C'EST L'ÉTAT NORMAL AUJOURD'HUI. Le produit
 * Lemon Squeezy n'existe pas encore ; l'écran doit donc savoir se présenter
 * SANS bouton plutôt que d'en afficher un qui ne mène nulle part. Un bouton
 * mort sur une page de paiement est pire qu'une page sans bouton : le vendeur
 * conclut que le produit est cassé, pas que l'abonnement n'est pas ouvert.
 *
 * ⚠️ ET LA PRÉSENCE NE SUFFIT PAS. Une valeur qui a la FORME d'une
 * configuration franchit toutes les validations de présence (L-026) : on exige
 * `https` et un hôte de la liste. Un refus est DIT côté serveur — une adresse
 * de paiement mal configurée est un incident d'exploitation, pas un détail —
 * et se présente au vendeur comme une absence, jamais comme une erreur qu'il ne
 * peut pas corriger.
 */
export function urlPaiementPro(): string | null {
  const brut = process.env["LEMON_SQUEEZY_CHECKOUT_URL"];
  if (brut === undefined || brut.trim() === "") return null;

  let url: URL;
  try {
    url = new URL(brut.trim());
  } catch {
    console.error("[paiement] LEMON_SQUEEZY_CHECKOUT_URL n'est pas une URL.");
    return null;
  }

  if (url.protocol !== "https:") {
    console.error("[paiement] LEMON_SQUEEZY_CHECKOUT_URL n'est pas en https.");
    return null;
  }

  const hote = url.hostname.toLowerCase();
  const accepte = HOTES.has(hote) || [...HOTES].some((h) => hote.endsWith(`.${h}`));
  if (!accepte) {
    console.error(`[paiement] hôte de paiement refusé : ${hote}`);
    return null;
  }

  return url.toString();
}

/**
 * L'adresse de paiement POUR CE COMPTE : celle de `urlPaiementPro`, qui y porte
 * l'identifiant du compte et pré-remplit son e-mail.
 *
 * ⚠️ SANS ELLE, UN PAIEMENT POUVAIT ARRIVER SANS PLAN (audit ECC, 24/09/2026).
 * Le webhook rattache par `meta.custom_data.profil_id`, et à défaut par l'e-mail
 * du PAYEUR. Le bouton envoyait l'adresse brute : un vendeur qui payait avec une
 * autre adresse que celle de son compte était débité sans recevoir le Pro.
 * Lemon Squeezy renvoie dans `custom_data` ce que le lien porte en
 * `checkout[custom][…]`.
 *
 * L'identifiant n'autorise RIEN : le webhook n'est cru que signé, et un lien
 * modifié pour porter l'identifiant d'un autre compte ne ferait que lui OFFRIR
 * l'abonnement payé.
 */
export function urlPaiementPourCompte(compte: { readonly profilId: string; readonly email: string }): string | null {
  const base = urlPaiementPro();
  if (base === null) return null;
  const url = new URL(base);
  url.searchParams.set("checkout[custom][profil_id]", compte.profilId);
  if (compte.email !== "") url.searchParams.set("checkout[email]", compte.email);
  return url.toString();
}
