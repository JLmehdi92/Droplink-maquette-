import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { LANGUE_DEFAUT } from "@/i18n/config";
import { SchemaLangue } from "@/i18n/schema";
import { emettreApres } from "@/lib/instrumentation/emettre";
import { EVENEMENTS } from "@/lib/instrumentation/evenements";
import { lireProfilVendeur } from "@/lib/comptes/profil";
import { creerClientServeur } from "@/lib/supabase/server";
import { invaliderCommandePublique } from "./cache";
import { archiverCommande, dupliquerCommande } from "./cycle";
import { cheminQuotaAtteint } from "./quota-atteint";

/**
 * LES TROIS GESTES DE LA LISTE — archiver, dupliquer, archiver une SÉLECTION.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI CE MODULE N'EST PLUS EN `"use server"`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ CES TROIS GESTES ÉCRIVAIENT EN BASE SANS QUE L'ÉCRAN BOUGE. Mesuré, et
 * reproduit à volonté : en build de production, une Server Action qui se termine
 * par `redirect()` vers la route où le vendeur se trouve DÉJÀ voit sa navigation
 * **jetée** par le routeur client. Pas d'erreur, pas de message, l'URL ne bouge
 * même pas. Le vendeur archive une sélection, ne voit rien, et recommence — sur
 * un lot déclaré tout-ou-rien, recommencer est exactement le geste qu'on ne veut
 * pas. La cause est en amont, dans Next : un mécanisme d'entrées de préchargement
 * « aliasées » qui est DÉSACTIVÉ en développement, ce qui explique que le défaut
 * ait traversé toute la campagne de conformité sans se montrer.
 *
 * Le contournement retenu est celui que le navigateur sait faire seul : un
 * **POST natif** vers un route handler, dont la réponse est une vraie
 * redirection HTTP. React n'intercepte que les formulaires dont l'`action` est
 * une FONCTION ; une chaîne ne l'est pas, donc rien ne s'interpose.
 *
 * C'EST UNE DÉVIATION DOCUMENTÉE de la règle « Server Actions pour les
 * mutations », du même ordre que celle déjà accordée à l'export CSV. Elle a un
 * effet secondaire qu'il faut nommer : chaque geste recharge un document (mesuré
 * à 34,8 Ko compressés sur `/fr/commandes`), là où une Server Action rendait une
 * charge RSC. C'est le prix d'un écran qui dit la vérité.
 *
 * ⚠️ ELLE PRÉSERVE CE QUE L'ÉCRAN PROTÉGEAIT DÉJÀ : ces formulaires marchent
 * SANS JavaScript. C'était l'argument qui avait écarté un îlot client, et un
 * `router.refresh()` l'aurait perdu. Un `<form method="post">` est au contraire
 * le cas le plus ancien du Web.
 *
 * ⚠️ ET IL N'Y A PLUS DE `"use server"` ICI : ces fonctions ne sont donc PLUS
 * des points d'entrée appelables depuis le navigateur. Une seule porte reste
 * ouverte — le route handler —, et elle porte sa garde d'origine ET la
 * vérification de session. Le contournement RETIRE de la surface d'attaque au
 * lieu d'en ajouter.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Aucune de ces fonctions ne redirige : elles RENDENT la destination, et c'est
 * le route handler qui en fait une réponse `303`. Un `307` rejouerait le POST
 * sur la liste — le navigateur reposterait le formulaire à chaque rafraîchissement.
 */

/** Les gestes que le route handler accepte. Toute autre valeur est refusée. */
export const GESTES_DE_LISTE = ["archiver", "dupliquer", "lot"] as const;
export type GesteDeListe = (typeof GESTES_DE_LISTE)[number];

/** Où poster. Sous `[locale]`, donc COUVERT par le middleware — pas sous `/api`. */
export function cheminGesteDeListe(langue: string): string {
  return "/" + langue + "/commandes/geste";
}

const Retour = z.string().max(500).catch("");
const Identifiant = z.string().uuid();

/**
 * Une origine qui n'existe pas, uniquement pour RÉSOUDRE le retour.
 *
 * Le nom de premier niveau `.invalid` est réservé par la RFC 2606 : il ne peut
 * appartenir à personne, donc aucune erreur de raisonnement ici ne peut envoyer
 * un vendeur quelque part.
 */
const BASE_DE_RESOLUTION = "http://retour.invalid";

/**
 * Où revenir après le geste. Toujours un chemin RELATIF de ce site.
 *
 * ⚠️ CE CONTRÔLE SE FAISAIT PAR PRÉFIXE, ET IL ÉTAIT FRANCHISSABLE. Il acceptait
 * tout ce qui commence par un `/` sans être suivi d'un second, pour écarter
 * `//exemple.test` — une URL absolue déguisée. Mesuré : `/\exemple.test/x`
 * franchit cette règle et se résout vers l'hôte `exemple.test`, parce que
 * l'analyseur d'URL traite l'ANTISLASH comme une barre pour les schémas
 * spéciaux. `/\/exemple.test` et `/\\exemple.test` aussi.
 *
 * C'est exactement la faille que ce garde existait pour fermer : un bouton
 * « archiver » devenait un tremplin vers un site tiers, et le vendeur
 * atterrissait sur une fausse page de connexion EN VENANT DE CHEZ NOUS.
 *
 * → CONTRÔLE PAR VALEUR, PAS PAR FORME. On résout la chaîne avec le MÊME
 * analyseur que celui qui construira la redirection, et on exige que l'origine
 * obtenue soit restée la nôtre.
 *
 * ⚠️ ET CELA NE SUFFISAIT PAS — LE CORRECTIF AFFIRMAIT LE CONTRAIRE. Cette
 * en-tête disait « ce qui sort d'ici ne peut plus porter d'hôte, quelle qu'ait
 * été l'entrée ». Mesuré : `/..//exemple.test` sortait en
 * `Location: https://exemple.test/`.
 *
 * Le mécanisme n'est pas une forme oubliée, c'est qu'il y a DEUX analyses. La
 * première garde bien notre origine — donc le contrôle passe — mais son
 * `pathname` vaut `//exemple.test`, et c'est cette chaîne que la route résout
 * une SECONDE fois contre l'URL de la requête. **La normalisation du premier
 * analyseur FABRIQUE l'évasion que le second suit.** Aucune liste de formes
 * interdites n'aurait fermé la classe : c'est la sortie qu'il faut contraindre,
 * pas l'entrée.
 *
 * → ON RE-RÉSOUT DONC CE QU'ON REND, et on exige que l'origine soit ENCORE la
 * nôtre. C'est exactement l'analyse que fera la route ; la faire ici, c'est
 * refuser de rendre une chaîne dont on sait qu'elle s'échappera ensuite.
 *
 * ⚠️ UNE CONDITION D'IDEMPOTENCE A ÉTÉ ÉCRITE ICI PUIS RETIRÉE. Elle exigeait
 * en plus que la sortie se rende elle-même. Falsifiée, elle n'a rien fait
 * rougir : la seconde comparaison d'origine attrape déjà toute la classe. Une
 * ligne de garde que rien n'exerce est une ligne qu'on croira protectrice le
 * jour où elle ne le sera pas.
 */
function destination(donnees: FormData, defaut: string): string {
  const brut = Retour.parse(donnees.get("retour"));
  if (brut === "") return defaut;

  try {
    const resolue = new URL(brut, BASE_DE_RESOLUTION);
    if (resolue.origin !== BASE_DE_RESOLUTION) return defaut;

    const chemin = resolue.pathname + resolue.search;

    if (new URL(chemin, BASE_DE_RESOLUTION).origin !== BASE_DE_RESOLUTION) return defaut;

    return chemin;
  } catch {
    return defaut;
  }
}

/**
 * INVALIDE LA ROUTE SUR LAQUELLE ON REVIENT.
 *
 * Le POST natif recharge le document, mais le cache de données du serveur, lui,
 * ne s'invalide pas tout seul : sans cet appel la page reconstruite pourrait
 * être servie depuis une entrée périmée. On invalide le CHEMIN, pas le motif de
 * route — le chemin est ce qui est réellement mis en cache.
 */
function invaliderRetour(retour: string): void {
  const chemin = retour.split("?")[0] ?? retour;
  revalidatePath(chemin);
}

function separateur(url: string): string {
  return url.includes("?") ? "&" : "?";
}

async function archiverUne(donnees: FormData, profilId: string): Promise<string> {
  const id = Identifiant.safeParse(donnees.get("id"));
  const jeton = z.string().max(64).safeParse(donnees.get("jeton"));
  const archiver = donnees.get("archiver") === "1";
  const retour = destination(donnees, "/fr/commandes");
  if (!id.success) return retour;

  const supabase = await creerClientServeur();
  const resultat = await archiverCommande(supabase, profilId, id.data, archiver);

  // ⚠️ L'ÉCHEC EST DIT, comme pour le lot. Sans ça, une écriture refusée (RLS, la
  // commande n'appartient plus à l'appelant…) rendait la même URL sans message :
  // le bouton reste sur « Archiver », indiscernable d'un clic sans effet
  // (contrainte n° 8). On réutilise le canal `lot`, dont les messages sont neutres
  // en nombre — « introuvable » invite à recharger, le reste dit la panne.
  if (resultat.statut !== "ok") {
    invaliderRetour(retour);
    const motif = resultat.motif === "introuvable" ? "partiel" : "ecriture";
    return retour + separateur(retour) + "lot=" + motif;
  }

  if (jeton.success && jeton.data !== "") {
    invaliderCommandePublique(jeton.data);
  }

  invaliderRetour(retour);
  return retour;
}

async function dupliquerUne(donnees: FormData, profilId: string, shopId: string): Promise<string> {
  const langue = SchemaLangue.catch(LANGUE_DEFAUT).parse(donnees.get("langue"));
  const retour = destination(donnees, "/" + langue + "/commandes");

  const id = Identifiant.safeParse(donnees.get("id"));
  if (!id.success) return retour;

  const supabase = await creerClientServeur();
  const resultat = await dupliquerCommande(supabase, profilId, shopId, id.data);

  // La copie est un GABARIT vide : on ouvre son éditeur, parce que personne ne
  // duplique pour laisser la copie en l'état. Sur échec on revient à la liste
  // plutôt que d'inventer une destination.
  // LE QUOTA SE DIT (26/09/2026) : ce chemin revenait à la liste sans un mot, et le
  // vendeur concluait que « Dupliquer » ne marchait pas.
  if (resultat.statut === "echec" && resultat.motif === "quota") {
    return cheminQuotaAtteint(langue, resultat.quota);
  }
  if (resultat.statut !== "ok") {
    invaliderRetour(retour);
    return retour;
  }
  return "/" + langue + "/commandes/" + resultat.nouvelleCommande;
}

/**
 * Archive ou désarchive une SÉLECTION, tout ou rien.
 *
 * L'atomicité est celle de la base : la fonction `archiver_lot` compare ce
 * qu'elle a modifié à ce qu'on lui a demandé et lève si les deux diffèrent, ce
 * qui annule la transaction entière. Une sélection à moitié archivée sans que le
 * vendeur sache LAQUELLE est pire que l'échec complet.
 */
async function archiverUnLot(donnees: FormData, profilId: string): Promise<string> {
  const ids = z
    .array(Identifiant)
    .max(200)
    .safeParse(donnees.getAll("selection").map(String));
  const archiver = donnees.get("archiver") === "1";
  const retour = destination(donnees, "/fr/commandes");

  // ⚠️ UNE SÉLECTION REFUSÉE N'EST PAS UNE SÉLECTION VIDE. Au-delà du plafond, ou
  // avec un identifiant altéré, ce chemin répondait `lot=vide` : l'écran disait
  // « Aucune commande sélectionnée » à un vendeur qui venait d'en cocher. Le
  // message vrai est celui de l'échec — rien n'a été modifié.
  if (!ids.success) {
    invaliderRetour(retour);
    return retour + separateur(retour) + "lot=ecriture";
  }
  if (ids.data.length === 0) {
    invaliderRetour(retour);
    return retour + separateur(retour) + "lot=vide";
  }

  const supabase = await creerClientServeur();
  const { data, error } = await supabase.rpc("archiver_lot", {
    p_ids: ids.data,
    p_archiver: archiver,
  });

  if (error !== null) {
    // L'ÉCHEC EST DIT, et distingué : « refusé » n'est pas « en panne ». Un lot
    // refusé se refait à l'identique, un lot en panne non.
    const motif = error.code === "DL038" ? "partiel" : "ecriture";
    invaliderRetour(retour);
    return retour + separateur(retour) + "lot=" + motif;
  }

  emettreApres(
    EVENEMENTS.COMMANDE_ARCHIVEE,
    { sujet: profilId },
    { lot: data ?? 0, archivee: archiver },
  );

  invaliderRetour(retour);
  return retour + separateur(retour) + "lot=ok&n=" + String(data ?? 0);
}

export type ResultatGeste =
  | { readonly statut: "ok"; readonly destination: string }
  | { readonly statut: "session" }
  | { readonly statut: "geste-inconnu" };

/**
 * Exécute le geste demandé et rend où aller.
 *
 * ⚠️ LA GARDE DE SESSION EST ICI, et pas seulement dans le route handler. Elle y
 * était déjà quand ces fonctions étaient des Server Actions, pour la même
 * raison : rien ne garantit qu'un écran les a précédées. La déplacer dans
 * l'appelant ferait dépendre l'isolation de la discipline de chaque appelant
 * futur, ce qui est exactement ce qu'une garde ne doit pas être.
 */
export async function executerGesteDeListe(donnees: FormData): Promise<ResultatGeste> {
  const profil = await lireProfilVendeur();
  if (profil === null || profil.statut !== "active") return { statut: "session" };

  const geste = z.enum(GESTES_DE_LISTE).safeParse(donnees.get("geste"));
  if (!geste.success) return { statut: "geste-inconnu" };

  switch (geste.data) {
    case "archiver":
      return { statut: "ok", destination: await archiverUne(donnees, profil.profilId) };
    case "dupliquer":
      return {
        statut: "ok",
        destination: await dupliquerUne(donnees, profil.profilId, profil.shopId),
      };
    case "lot":
      return { statut: "ok", destination: await archiverUnLot(donnees, profil.profilId) };
  }
}
