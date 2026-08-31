import { NextResponse } from "next/server";
import { arbitrerQc } from "@/lib/page-publique/qc";
import { signalerJetonInconnu, verifierQuotaEcriturePublique } from "@/lib/limitation/quota";

/**
 * L'arbitrage QC. La SEULE écriture que la page publique autorise.
 *
 * Hors du matcher du middleware comme tout `/p` : elle porte donc SA garde —
 * limitation de débit propre à l'écriture, validation Zod du corps, et
 * arbitrage EN BASE de ce que le jeton désigne. Le middleware ne protège aucune
 * donnée à lui seul.
 *
 * DEUX RÉPONSES SEULEMENT. `200` avec le nouveau statut, `404` pour tout le
 * reste : jeton inconnu, jeton révoqué, compte suspendu, corps invalide. Un code
 * par cas dirait au visiteur lequel il vient de rencontrer, et c'est exactement
 * ce qu'un balayage cherche à apprendre.
 */
export async function POST(
  requete: Request,
  contexte: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await contexte.params;

  const quota = await verifierQuotaEcriturePublique();
  if (!quota.autorise) {
    return NextResponse.json({ erreur: "trop_de_demandes" }, { status: 429 });
  }

  // Un corps illisible est traité comme un corps invalide, pas comme une panne :
  // `await requete.json()` lève sur du JSON malformé, et une route publique en
  // reçoit par construction.
  const corps: unknown = await requete.json().catch(() => null);

  const resultat = await arbitrerQc(token, corps);
  if (resultat.statut !== "ok") {
    /*
     * CETTE ROUTE ÉTAIT L'ORACLE LE PLUS NET DU PRODUIT, et il était gratuit.
     *
     * Elle distingue 200 (jeton valide, compte actif) de 404 (inconnu, révoqué
     * ou suspendu) — ce qui est correct pour son usage. Mais elle n'armait pas
     * le compteur des jetons INCONNUS : un balayeur obtenait donc un signal
     * binaire en une requête, sans consommer un seul des vingt essais que la
     * page publique, elle, lui aurait décomptés. Il suffisait de choisir cette
     * entrée-ci plutôt que celle-là.
     *
     * Le compteur d'écriture (10/min) s'appliquait bien, mais il ne défend pas
     * contre la même chose : il borne le volume d'écritures, pas la découverte
     * de jetons.
     */
    /*
     * ⚠️ LE COMPTEUR N'EST ARMÉ QUE POUR UN JETON, JAMAIS POUR UN CORPS.
     *
     * Les deux cas rendaient `refuse`, donc les deux armaient le compteur des
     * jetons inconnus. Un client légitime dont le corps est malformé brûlait
     * ainsi son budget, et sa propre page devenait un 404 pour lui au bout de
     * vingt essais. La réponse, elle, reste rigoureusement identique : même
     * statut, même corps. Ce qui change n'est pas visible du visiteur.
     */
    if (resultat.statut !== "demande-invalide") await signalerJetonInconnu();
    return NextResponse.json({ erreur: "introuvable" }, { status: 404 });
  }

  return NextResponse.json({ qc: resultat.qc }, { headers: { "cache-control": "no-store" } });
}
