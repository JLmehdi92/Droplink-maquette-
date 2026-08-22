import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";

/**
 * L'identité d'un appelant anonyme, telle qu'on a le droit de la retenir.
 *
 * Extrait de `quota.ts` parce qu'un second appelant en a besoin : le comptage
 * des vues de lien. Deux implémentations de l'empreinte finiraient par diverger
 * — un sel appliqué d'un côté, une troncature de l'autre — et la divergence ne
 * casserait rien, elle produirait simplement deux populations distinctes pour
 * un même visiteur.
 */

/**
 * Empreinte salée d'une valeur identifiante.
 *
 * Salée, parce qu'une IPv4 non salée se retrouve par force brute en quelques
 * secondes : l'espace fait quatre milliards de valeurs, et un sha256 se calcule
 * par milliards par seconde. Une empreinte non salée n'est pas une
 * pseudonymisation, c'est un encodage.
 *
 * LÈVE si le sel manque. Rendre une empreinte non salée « en attendant » est
 * exactement le défaut qu'on ne verrait jamais : la valeur aurait la FORME
 * attendue et franchirait toute validation de présence.
 */
export function empreinte(valeur: string): string {
  const sel = process.env["HASH_SALT"] ?? "";
  if (sel.length < 16) {
    throw new Error(
      "HASH_SALT absent ou trop court. Sans sel, l'empreinte d'une adresse IP " +
        "se retrouve par force brute en quelques secondes : ce ne serait pas " +
        "une pseudonymisation mais un encodage.",
    );
  }
  return createHash("sha256").update(`${sel}:${valeur}`).digest("hex").slice(0, 32);
}

/**
 * Adresse de l'appelant, telle que le bord la rapporte.
 *
 * `x-forwarded-for` est une LISTE que n'importe quel intermédiaire peut
 * rallonger, et que le client peut préremplir. On prend donc l'en-tête posé par
 * notre propre bord quand il existe, et seulement à défaut la PREMIÈRE entrée de
 * `x-forwarded-for`.
 *
 * Rend `null` si rien n'est exploitable : mieux vaut l'absence assumée qu'une
 * valeur qu'un client aurait choisie, laquelle transformerait le compteur en
 * outil pour épuiser le quota des autres.
 */
export async function adresseAppelant(): Promise<string | null> {
  const enTetes = await headers();
  const cloudflare = enTetes.get("cf-connecting-ip");
  if (cloudflare !== null && cloudflare.trim() !== "") return cloudflare.trim();

  const transmis = enTetes.get("x-forwarded-for");
  if (transmis !== null) {
    const premiere = transmis.split(",")[0]?.trim();
    if (premiere !== undefined && premiere !== "") return premiere;
  }
  return null;
}

/** Le pays que le bord rapporte, quand il en rapporte un. */
export async function paysAppelant(): Promise<string | null> {
  const enTetes = await headers();
  const pays = enTetes.get("cf-ipcountry");
  // `XX` est ce que Cloudflare rend quand il ne sait pas : le stocker ferait
  // croire à un pays nommé.
  if (pays === null || pays.trim() === "" || pays.trim().toUpperCase() === "XX") return null;
  return pays.trim().toUpperCase().slice(0, 2);
}

/**
 * LA CLASSE D'UN AGENT UTILISATEUR — grossière, et c'est le point.
 *
 * MESURÉ AVANT CORRECTION : cinq cents vues enregistrées sur UNE SEULE commande,
 * depuis UNE SEULE adresse, en variant l'agent utilisateur cinq cents fois. Avec
 * le quota public actuel — cent vingt requêtes par minute — cela porte à
 * 172 800 vues par jour ce qu'une seule machine peut inscrire.
 *
 * Or « vues par lien > 3 » est une MÉTRIQUE DE VERDICT : c'est un des chiffres
 * sur lesquels se décide si le produit continue. Un vendeur qui veut se
 * rassurer, un concurrent qui veut nous faire conclure à tort, ou simplement un
 * outil de test un peu bavard suffisaient à la rendre fausse — et une métrique
 * légèrement faussée reste crédible.
 *
 * LA CAUSE EST QUE L'AGENT ÉTAIT PRIS ENTIER. Sa chaîne complète est presque
 * unique par machine : versions du navigateur, du système, du moteur, parfois
 * du modèle d'appareil. Elle offrait donc un espace pratiquement infini de
 * valeurs distinctes pour une même personne, alors que la clé de déduplication
 * repose dessus.
 *
 * CE QU'ON PERD EST ASSUMÉ. Deux visiteurs derrière la même adresse partagée,
 * avec le même navigateur et le même type d'appareil, ne comptent plus que pour
 * un. C'est le bon sens de l'erreur : sous-compter une métrique de verdict est
 * moins dangereux que la sur-compter, parce qu'un chiffre qui confirme ce qu'on
 * espère ne se remet jamais en question.
 *
 * Le résultat vit dans un ensemble FERMÉ de quelques dizaines de valeurs. C'est
 * lui qu'on empreinte, jamais la chaîne d'origine.
 */
export function classeAgent(agentBrut: string): string {
  const a = agentBrut.toLowerCase();

  // L'ordre compte : presque tous les navigateurs se déclarent « mozilla », et
  // Chrome, Edge et les navigateurs embarqués se déclarent tous « safari ». On
  // reconnaît donc du plus spécifique au plus général.
  const navigateur =
    a.includes("edg/") || a.includes("edga/")
      ? "edge"
      : a.includes("opr/") || a.includes("opera")
        ? "opera"
        : a.includes("samsungbrowser")
          ? "samsung"
          : a.includes("firefox") || a.includes("fxios")
            ? "firefox"
            : a.includes("chrome") || a.includes("crios")
              ? "chrome"
              : a.includes("safari")
                ? "safari"
                : "autre";

  const appareil = a.includes("ipad") || a.includes("tablet")
    ? "tablette"
    : a.includes("mobi") || a.includes("android") || a.includes("iphone")
      ? "mobile"
      : "bureau";

  return `${navigateur}/${appareil}`;
}
