import "server-only";

/**
 * LA CONFIGURATION DE L'EXPÉDITEUR, VALIDÉE POUR SA SUBSTANCE.
 *
 * ⚠️ L-026 : « une valeur qui a la FORME d'une configuration franchit toutes
 * les validations de présence. Valider la présence ne dit rien de la
 * substitution. » Le cas n'est pas théorique sur ce projet : `lib/contact.ts`
 * a déjà dû se défendre contre `votre-adresse@exemple.com`, qui est une adresse
 * parfaitement bien formée et parfaitement inutile.
 *
 * Ici l'enjeu est plus grave qu'ailleurs. Une adresse de contact mal
 * substituée produit un lien mort, que quelqu'un finira par signaler. Une
 * adresse d'ALERTE mal substituée produit un veilleur qui croit alerter, dont
 * les emails partent vers un domaine d'exemple, et dont personne ne remarquera
 * le silence — puisque son silence est justement l'état normal.
 *
 * D'où : on refuse tout ce qui ressemble à un gabarit, et le refus est
 * NOMMÉ (`non_configure` porte la liste de ce qui manque) plutôt que réduit à
 * un booléen. Savoir QUE ce n'est pas configuré ne suffit pas à le configurer.
 */

/**
 * Marqueurs TEXTUELS qu'un gabarit non substitué laisse derrière lui.
 *
 * ⚠️ `<` ET `[` N'Y SONT PLUS, ET LEUR RETRAIT EST UNE CORRECTION, PAS UN
 * RELÂCHEMENT. Ils y figuraient — repris de `lib/contact.ts` — et ils
 * refusaient du même coup « DropLink Veille <veille@…> », qui est la forme
 * NORMALE d'un expéditeur nommé chez Resend, et celle qui passe le mieux les
 * filtres de réception.
 *
 * Un marqueur qui refuse la bonne valeur autant que la mauvaise ne protège pas :
 * il pousse à contourner la protection. Les deux caractères sont donc vérifiés
 * plus bas, sur l'ADRESSE EXTRAITE — là où ils n'ont aucune raison d'être — et
 * plus sur la chaîne entière, où ils en ont une.
 */
const GABARITS = ["votre", "your", "exemple", "example", "todo", "xxx", "changeme", "placeholder"];

/** Caractères qui n'ont aucune raison d'être DANS une adresse. */
const CHEVRONS = ["<", ">", "[", "]"];

export interface ConfigEmail {
  readonly cle: string;
  readonly expediteur: string;
  readonly destinataire: string;
}

function adresseUtilisable(brut: string | undefined): string | null {
  if (brut === undefined) return null;
  const valeur = brut.trim();
  if (valeur === "") return null;
  if (GABARITS.some((g) => valeur.toLowerCase().includes(g))) return null;
  // Resend accepte la forme « Nom <adresse@domaine> » pour l'expéditeur ; on
  // valide donc la partie entre chevrons quand elle existe.
  const entreChevrons = /<([^>]+)>\s*$/.exec(valeur);
  const adresse = entreChevrons?.[1]?.trim() ?? valeur;

  // `<adresse>@domaine.com` franchit l'expression régulière ci-dessous —
  // `[^\s@]+` accepte les chevrons — et n'est pourtant qu'un gabarit. Le
  // contrôle porte sur l'adresse EXTRAITE : dans « Nom <a@b.c> » elle n'en
  // contient plus, dans « <adresse>@b.c » elle en contient encore.
  if (CHEVRONS.some((c) => adresse.includes(c))) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(adresse)) return null;
  return valeur;
}

/**
 * Rend la configuration, ou la LISTE de ce qui manque.
 *
 * La liste plutôt qu'un `null` : le message d'erreur d'un veilleur muet est la
 * seule chose qui dira à l'exploitant quoi poser. « Emails non configurés » est
 * une phrase qu'on relit trois fois sans savoir quoi faire.
 */
export function lireConfigEmail(): ConfigEmail | { readonly manquant: readonly string[] } {
  const manquant: string[] = [];

  const brutCle = process.env["RESEND_API_KEY"]?.trim() ?? "";
  // Une clé Resend commence par `re_`. Le vérifier n'est pas de la
  // superstition de format : c'est ce qui distingue une clé d'un gabarit, et
  // c'est gratuit. La clé n'est JAMAIS journalisée, ni entière ni tronquée.
  const cle = brutCle !== "" && brutCle.startsWith("re_") && brutCle.length >= 20 ? brutCle : null;
  if (cle === null) manquant.push("RESEND_API_KEY");

  const expediteur = adresseUtilisable(process.env["EMAIL_ALERTES_DE"]);
  if (expediteur === null) manquant.push("EMAIL_ALERTES_DE");

  const destinataire = adresseUtilisable(process.env["EMAIL_ALERTES_A"]);
  if (destinataire === null) manquant.push("EMAIL_ALERTES_A");

  if (cle === null || expediteur === null || destinataire === null) {
    return { manquant };
  }
  return { cle, expediteur, destinataire };
}

/** Vrai quand un envoi peut réellement partir. Utilisé par les sondes. */
export function envoiConfigure(): boolean {
  return !("manquant" in lireConfigEmail());
}
