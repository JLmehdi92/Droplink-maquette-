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
 * LE BORD À QUI L'ON FAIT CONFIANCE, déclaré et non supposé.
 *
 * `cloudflare` (défaut) — seul `cf-connecting-ip` est cru. Cet en-tête est
 *   RÉÉCRIT par Cloudflare à chaque requête : ce que le client envoie sous ce
 *   nom est écrasé, donc infalsifiable depuis l'extérieur.
 * `xff` — la première entrée de `x-forwarded-for`. À ne poser que derrière un
 *   bord qui la réécrit lui aussi. C'est le mode des sondes locales.
 * `aucun` — aucune adresse n'est déduite d'un en-tête.
 *
 * POURQUOI CE RÉGLAGE EXISTE. `x-forwarded-for` était cru SANS CONDITION : c'est
 * une LISTE que n'importe quel intermédiaire rallonge et que le client peut
 * préremplir. Toute la limitation de débit publique se contournait donc en
 * changeant un en-tête — il suffisait d'en varier la valeur pour repartir avec
 * un quota neuf à chaque requête, et le comptage des vues reposait sur la même
 * source.
 *
 * Le commentaire d'origine disait bien « on prend l'en-tête posé par notre
 * propre bord QUAND IL EXISTE, et seulement à défaut `x-forwarded-for` ». Le
 * défaut, c'est justement le « seulement à défaut » : il suffit de ne pas
 * envoyer `cf-connecting-ip` — ce que fait tout appelant qui n'est pas
 * Cloudflare — pour que le repli s'applique. La protection tenait à ce que
 * l'attaquant se donne la peine de poser un en-tête qu'il n'a aucune raison de
 * poser.
 *
 * LE DÉFAUT EST LE MODE LE PLUS STRICT qui laisse le produit fonctionner sur sa
 * cible de déploiement. Un défaut permissif serait la valeur en vigueur partout
 * où personne n'a lu ce fichier.
 */
type BordDeConfiance = "cloudflare" | "xff" | "aucun";

function bordDeConfiance(): BordDeConfiance {
  const brut = (process.env["BORD_DE_CONFIANCE"] ?? "").trim().toLowerCase();
  if (brut === "xff" || brut === "aucun") return brut;
  // Toute autre valeur — absente, mal orthographiée, héritée d'un copier-coller
  // — retombe sur le mode strict. Une configuration illisible ne doit jamais
  // ouvrir quelque chose ; c'est le sens de la lecture qui compte, pas la
  // présence d'une valeur.
  return "cloudflare";
}

/**
 * Adresse de l'appelant, telle que le bord de confiance la rapporte.
 *
 * Rend `null` si rien n'est exploitable : mieux vaut l'absence assumée qu'une
 * valeur que l'appelant aurait choisie, laquelle transformerait le compteur en
 * outil pour épuiser le quota des autres — ou en moyen de n'en consommer aucun.
 */
export async function adresseAppelant(): Promise<string | null> {
  const mode = bordDeConfiance();
  if (mode === "aucun") return null;

  const enTetes = await headers();

  const cloudflare = enTetes.get("cf-connecting-ip");
  if (cloudflare !== null && cloudflare.trim() !== "") return cloudflare.trim();

  // PAS DE REPLI EN MODE `cloudflare`. C'était le défaut : l'absence de
  // `cf-connecting-ip` rouvrait `x-forwarded-for`, que l'appelant contrôle.
  if (mode !== "xff") return null;

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
