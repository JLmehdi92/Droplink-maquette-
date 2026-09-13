import "server-only";
import { cleCouverture, cleVignette } from "./cles";
import { supprimer } from "./r2";

/**
 * PURGER DES OBJETS R2 — ceux d'un compte ou de données supprimés.
 *
 * Une clé de MÉDIA emporte ses deux dérivées, vignette et couverture : elles sont
 * dérivées de la clé et ne vivent sur aucune ligne. Une clé de LOGO n'en a pas.
 *
 * UNE CLÉ N'EST « PURGÉE » QUE SI TOUT CE QU'ELLE EMPORTE A RÉPONDU. `DELETE` est
 * idempotent chez R2 (une absence répond 404, compté comme un succès) : rejouer
 * une clé à moitié purgée ne coûte rien, alors que la déclarer purgée la sortirait
 * de la file avec une vignette encore dans le bucket.
 *
 * Par lots de dix : assez pour qu'un compte de quelques centaines de médias parte
 * en quelques secondes, pas assez pour ouvrir des centaines de connexions d'un
 * coup vers le fournisseur.
 */
export async function purgerCles(
  cles: readonly string[],
): Promise<{ readonly purgees: readonly string[]; readonly echecs: number }> {
  const purgees: string[] = [];
  let echecs = 0;

  for (let i = 0; i < cles.length; i += 10) {
    const lot = cles.slice(i, i + 10);
    const resultats = await Promise.allSettled(
      lot.map(async (cle) => {
        const objets = cle.startsWith("medias/") ? [cle, cleVignette(cle), cleCouverture(cle)] : [cle];
        await Promise.all(objets.map((objet) => supprimer(objet)));
        return cle;
      }),
    );
    for (const r of resultats) {
      if (r.status === "fulfilled") purgees.push(r.value);
      else {
        echecs += 1;
        console.error("[purge] " + (r.reason instanceof Error ? r.reason.message : String(r.reason)));
      }
    }
  }

  return { purgees, echecs };
}
