import "server-only";
import { headers } from "next/headers";

/**
 * Origine canonique du site.
 *
 * POURQUOI NE PAS SE CONTENTER DE L'EN-TÊTE `Origin` OU `Host`.
 *
 * L'URL de retour d'un email d'authentification porte le pouvoir d'ouvrir un
 * compte. La construire à partir d'un en-tête de requête revient à laisser
 * l'appelant choisir où le lien atterrira : une requête forgée avec
 * `Host: exemple-mal.tld` produirait un email, envoyé à la VRAIE adresse de la
 * victime, dont le lien mène chez l'attaquant. La victime clique un lien qui
 * vient bien de nous, et son jeton part ailleurs.
 *
 * ⚠️ CE PARAGRAPHE DISAIT « d'un lien magique », ET CE MÉCANISME N'EXISTE PLUS
 * — supprimé le 01/09/2026, décision de Wassim. La menace, elle, n'a pas
 * disparu : elle a CHANGÉ DE PORTEUR. L'email qui ouvre encore un compte est
 * celui de la RÉINITIALISATION, et il est devenu le seul recours d'un
 * utilisateur enfermé dehors — donc la seule chose qui sépare un compte de qui
 * saurait lire sa boîte. Nommer un mécanisme retiré laissait conclure que cette
 * variable ne protégeait plus rien.
 *
 * Deux barrières, et l'ordre compte :
 *   1. Supabase refuse toute redirection absente de sa liste d'autorisation.
 *      C'est la barrière qui FAIT AUTORITÉ, parce qu'elle est hors de notre
 *      code et ne peut pas être oubliée dans un nouveau chemin.
 *   2. Ce module, qui préfère une valeur configurée à un en-tête. C'est la
 *      défense en profondeur : elle ne remplace pas la première, elle évite de
 *      dépendre entièrement d'un réglage posé dans une console.
 *
 * En développement, où aucune origine n'est configurée, l'en-tête sert de repli
 * — mais seulement parce que la liste d'autorisation de Supabase, elle, reste en
 * vigueur.
 */

function origineConfiguree(): string | null {
  const brut = process.env["NEXT_PUBLIC_SITE_URL"];
  if (brut === undefined || brut.trim() === "") return null;
  try {
    const url = new URL(brut.trim());
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      // Une origine non chiffrée hors développement ferait voyager le jeton en
      // clair. Mieux vaut retomber sur l'en-tête, que Supabase filtrera.
      return null;
    }
    return url.origin;
  } catch {
    // Une origine illisible est traitée comme absente : on ne devine pas une
    // URL de retour, on préfère le repli explicite.
    return null;
  }
}

export async function origineDuSite(): Promise<string | null> {
  const configuree = origineConfiguree();
  if (configuree !== null) return configuree;

  /*
   * EN PRODUCTION, AUCUN REPLI. L'origine DOIT être configurée.
   *
   * Le repli sur `Origin` puis `Host` existait pour le développement, et le
   * commentaire ci-dessus le justifiait par « la liste d'autorisation de
   * Supabase reste en vigueur ». C'est vrai, et c'est précisément le problème :
   * la seule barrière restante était un réglage de console que rien dans ce
   * dépôt ne vérifie, ne teste ni ne documente. Une protection dont on ne peut
   * pas dire par exécution qu'elle est en place n'est pas une protection.
   *
   * Le mode de défaillance était SILENCIEUX dans le mauvais sens : déployer sans
   * `NEXT_PUBLIC_SITE_URL` ne cassait rien, ne signalait rien, et laissait
   * l'origine des emails de connexion dépendre d'un en-tête de requête. Il est
   * maintenant bruyant — la demande de lien échoue et le dit — ce qui se
   * découvre à la première connexion plutôt qu'à la première victime.
   */
  if (process.env["NODE_ENV"] === "production") {
    console.error(
      "[site] NEXT_PUBLIC_SITE_URL absente ou invalide en production. " +
        "L'URL de retour d'une réinitialisation de mot de passe porte le pouvoir " +
        "d'ouvrir un compte : on refuse de la déduire d'un en-tête de requête.",
    );
    return null;
  }

  const enTetes = await headers();
  const origine = enTetes.get("origin");
  if (origine !== null && origine !== "") return origine;

  const hote = enTetes.get("host");
  if (hote === null || hote === "") return null;
  const protocole = enTetes.get("x-forwarded-proto") ?? "http";
  return `${protocole}://${hote}`;
}
