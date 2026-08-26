import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";

/**
 * Expédie au navigateur les seuls espaces de traduction dont CETTE page a
 * besoin.
 *
 * POURQUOI PAS UN PROVIDER UNIQUE À LA RACINE. Un provider racine expédie les
 * mêmes messages à toutes les pages. Mesuré en servant les pages : avec le
 * catalogue entier, la landing pesait 31,1 Ko et transportait les libellés des
 * mentions légales et de l'onboarding. En restreignant à ce que les composants
 * clients utilisent, elle est descendue à 23,7 Ko — mais elle portait encore
 * l'onboarding, qu'aucun composant de la landing n'emploie.
 *
 * Le défaut ne casse rien et CROÎT : chaque écran client ajouté au produit
 * alourdirait toutes les pages, y compris la landing, qui est l'écran d'entrée
 * ouvert en 4G depuis un message privé. Un provider par page fait que le coût
 * d'un nouvel écran reste sur ce nouvel écran.
 *
 * Les Server Components n'ont pas besoin de ce composant : `getTranslations()`
 * résout côté serveur et n'expédie que le texte rendu.
 */

export class EspaceDeTraductionIntrouvable extends Error {
  constructor(espace: string) {
    super(
      `L'espace de traduction « ${espace} » n'existe pas dans le catalogue. ` +
        "Les composants clients qui le demandent afficheraient leurs clés en " +
        "toutes lettres à l'écran. Vérifier l'orthographe de l'espace, et que " +
        "`messages/fr.json` ET `messages/en.json` le portent.",
    );
    this.name = "EspaceDeTraductionIntrouvable";
  }
}

/**
 * Résout un espace éventuellement POINTÉ — `admin.suspension` — dans le
 * catalogue imbriqué, et rend le même chemin, imbriqué.
 *
 * ⚠️ DÉFAUT RÉEL, TROUVÉ À L'AUDIT DU 26/08/2026.
 *
 * Ce composant faisait `complet[espace]`, une indexation À PLAT. Le catalogue,
 * lui, est IMBRIQUÉ : `admin` puis `suspension`. Pour tout espace pointé,
 * l'indexation rendait `undefined` — et la ligne suivante était
 * `if (bloc !== undefined)`, qui TRANSFORMAIT L'ERREUR EN ABSENCE.
 *
 * Le dialogue de suspension recevait donc un provider vide et rendait
 * `admin.suspension.ouvrir`, `admin.suspension.titreSuspension`… en toutes
 * lettres — sur l'écran qui coupe les pages publiques d'un vendeur. Le même
 * défaut avait déjà frappé la landing ; le contrôle posé alors prouve que la
 * clé EXISTE au catalogue, pas qu'elle est EXPÉDIÉE au navigateur.
 *
 * DEUX CHOSES CHANGENT ICI, ET LA SECONDE EST LA PLUS IMPORTANTE :
 *
 *   1. le chemin est résolu segment par segment, donc un espace pointé marche ;
 *   2. un espace introuvable LÈVE. Le silence était le vrai défaut : une
 *      condition qui ignore ce qu'elle ne trouve pas ne signale jamais rien, et
 *      la panne ne se voit qu'à l'écran, chez celui qui utilise le produit.
 *      Un écran cassé au rendu est un incident ; un écran qui affiche ses clés
 *      brutes est une honte silencieuse qui peut vivre des semaines.
 */
function extraire(complet: Record<string, unknown>, espace: string): unknown {
  let courant: unknown = complet;
  for (const segment of espace.split(".")) {
    if (typeof courant !== "object" || courant === null) return undefined;
    courant = (courant as Record<string, unknown>)[segment];
  }
  return courant;
}

/** Reconstruit `{ admin: { suspension: bloc } }` à partir de `admin.suspension`. */
function greffer(cible: Record<string, unknown>, espace: string, bloc: unknown): void {
  const segments = espace.split(".");
  const dernier = segments.pop() as string;

  let noeud = cible;
  for (const segment of segments) {
    const existant = noeud[segment];
    // Deux espaces frères — `admin.suspension` et `admin.parametres` — doivent
    // pouvoir cohabiter sous le même parent sans que le second écrase le
    // premier.
    if (typeof existant !== "object" || existant === null) noeud[segment] = {};
    noeud = noeud[segment] as Record<string, unknown>;
  }
  noeud[dernier] = bloc;
}

/**
 * La restriction, PURE et exportée — donc éprouvable sans rendu.
 *
 * Elle vivait dans le corps du composant, où elle n'était atteignable que par
 * un rendu serveur complet. Une garde qu'on ne peut éprouver qu'en montant tout
 * l'appareil finit par n'être éprouvée jamais : c'est ce qui a laissé
 * l'indexation à plat survivre.
 */
export function restreindre(
  complet: Record<string, unknown>,
  espaces: readonly string[],
): Record<string, unknown> {
  const restreint: Record<string, unknown> = {};
  for (const espace of espaces) {
    const bloc = extraire(complet, espace);
    if (bloc === undefined) throw new EspaceDeTraductionIntrouvable(espace);
    greffer(restreint, espace, bloc);
  }
  return restreint;
}

export async function TraductionsClient({
  espaces,
  children,
}: {
  readonly espaces: readonly string[];
  readonly children: React.ReactNode;
}) {
  const complet = (await getMessages()) as unknown as Record<string, unknown>;
  return (
    <NextIntlClientProvider messages={restreindre(complet, espaces)}>
      {children}
    </NextIntlClientProvider>
  );
}
