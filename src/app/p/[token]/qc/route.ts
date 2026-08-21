import { NextResponse } from "next/server";
import { arbitrerQc } from "@/lib/page-publique/qc";
import { verifierQuotaEcriturePublique } from "@/lib/limitation/quota";

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
    return NextResponse.json({ erreur: "introuvable" }, { status: 404 });
  }

  return NextResponse.json({ qc: resultat.qc }, { headers: { "cache-control": "no-store" } });
}
