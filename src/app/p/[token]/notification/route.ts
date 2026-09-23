import { NextResponse } from "next/server";
import { signalerJetonInconnu, verifierQuotaEcriturePublique } from "@/lib/limitation/quota";
import { demanderNotification } from "@/lib/page-publique/notifications";
import { origineDuSite } from "@/lib/site";

/**
 * LE CLIENT DEMANDE À ÊTRE PRÉVENU PAR E-MAIL — depuis sa page, sans compte.
 *
 * Même garde que l'arbitrage QC, l'autre écriture d'un visiteur anonyme : le
 * quota d'écriture publique d'abord, puis un refus INDISCERNABLE pour un jeton
 * inconnu. La base borne en plus à trois demandes par heure et par commande.
 *
 * La réponse ne porte JAMAIS le jeton de confirmation : il ne part que par
 * e-mail, c'est tout le sens du double consentement.
 */
export async function POST(
  requete: Request,
  contexte: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await contexte.params;

  const quota = await verifierQuotaEcriturePublique();
  if (!quota.autorise) return NextResponse.json({ erreur: "trop" }, { status: 429 });

  // L'adresse du lien de confirmation part dans un e-mail : elle doit venir de
  // la configuration, jamais de l'en-tête `Host` de la requête.
  const origine = await origineDuSite();
  if (origine === null) return NextResponse.json({ erreur: "indisponible" }, { status: 503 });

  const corps: unknown = await requete.json().catch(() => null);
  const resultat = await demanderNotification(token, corps, origine);

  switch (resultat.statut) {
    case "envoye":
      return NextResponse.json({ statut: "envoye" }, { status: 202, headers: { "cache-control": "no-store" } });
    case "invalide":
      return NextResponse.json({ erreur: "invalide" }, { status: 400 });
    case "trop":
      return NextResponse.json({ erreur: "trop" }, { status: 429 });
    case "introuvable":
      await signalerJetonInconnu();
      return NextResponse.json({ erreur: "introuvable" }, { status: 404 });
    case "indisponible":
      return NextResponse.json({ erreur: "indisponible" }, { status: 503 });
  }
}
