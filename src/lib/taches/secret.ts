import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * LA GARDE DES ROUTES DE TÂCHE DE FOND — une seule implémentation, deux routes.
 *
 * ⚠️ `/api` est exclu du matcher du middleware. Une route de tâche n'est donc
 * protégée par RIEN d'autre que ce qui est écrit ici, et son emplacement sous
 * `/api` donnerait l'impression contraire à qui la relit.
 *
 * Elle vivait en toutes lettres dans `api/suivi/cadence/route.ts`. La veille
 * mutuelle en ajoute une seconde qui a besoin de la MÊME garde : recopier
 * trente lignes de comparaison à temps constant aurait produit deux exemplaires
 * libres de diverger, et c'est l'exemplaire oublié qui aurait été la porte.
 *
 * ── LES TROIS PROPRIÉTÉS, ET POURQUOI CHACUNE ──────────────────────────────
 *
 * 1. COMPARAISON À TEMPS CONSTANT. Une comparaison de chaînes s'arrête au
 *    premier octet différent, et cet écart se mesure. Même raison que pour la
 *    signature des notifications de suivi.
 *
 * 2. SANS SECRET CONFIGURÉ, ON REFUSE. Jamais de « mode ouvert pour le
 *    développement » : un défaut de configuration qui OUVRE une porte est
 *    exactement celui qu'on ne remarque pas, parce que tout continue de
 *    marcher. Le seuil de 16 caractères écarte aussi un secret présent mais
 *    dérisoire — une valeur qui a la FORME d'une configuration franchit toute
 *    validation de présence (L-026).
 *
 * 3. LE REFUS EST UN 404, PAS UN 401. Un 401 confirmerait l'existence de la
 *    surface à qui n'y a pas droit, et une route de tâche de fond dont on sait
 *    qu'elle existe est une route qu'on essaiera.
 *
 * ⚠️ LE MÊME SECRET POUR LES DEUX ROUTES, ET C'EST UN CHOIX.
 *
 * Deux secrets distincts isoleraient une route compromise de l'autre. Ils
 * doubleraient aussi le nombre de valeurs à poser au déploiement — et le
 * défaut qu'on répare ici est précisément qu'AUCUN planificateur n'a jamais été
 * posé. Une veille qui n'est pas déployée protège moins bien qu'une veille qui
 * partage un secret. Les deux routes sont dans le même processus, sur le même
 * hôte, avec la même clé de service : les séparer n'isolerait rien de réel.
 */

/** Longueur minimale d'un secret qui protège quelque chose. */
const LONGUEUR_MINIMALE = 16;

export function secretDeTacheValide(requete: Request): boolean {
  const attendu = (process.env["CRON_SECRET"] ?? "").trim();
  if (attendu.length < LONGUEUR_MINIMALE) return false;

  const entete = requete.headers.get("authorization") ?? "";
  const fourni = (entete.startsWith("Bearer ") ? entete.slice(7) : entete).trim();

  const a = Buffer.from(attendu, "utf8");
  const b = Buffer.from(fourni, "utf8");

  // `timingSafeEqual` LÈVE sur des longueurs différentes, et l'exception
  // révélerait par sa seule existence que la longueur ne correspondait pas.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
