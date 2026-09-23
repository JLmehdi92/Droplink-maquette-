import { NextResponse, type NextRequest } from "next/server";
import { estLangueSupportee } from "@/i18n/config";
import { redirigerVers } from "@/lib/http/rediriger";
import { verifierQuotaEcriturePublique } from "@/lib/limitation/quota";
import { desinscrireNotification, lireFormulaireNotification } from "@/lib/page-publique/notifications";

/**
 * LA DÉSINSCRIPTION — deux chemins, un seul effet.
 *
 * 1. EN UN CLIC depuis la messagerie (RFC 8058) : la messagerie poste sur l'adresse
 *    de `List-Unsubscribe`, le jeton dans l'URL, sans ouvrir de page. Réponse 200.
 * 2. DEPUIS LA PAGE, par son bouton : le jeton arrive dans le formulaire, avec
 *    `retour=page`. Réponse 303 vers la page de résultat.
 *
 * Le jeton est `unsubscribe_token`, DISTINCT du jeton public : le lien de
 * désinscription ne donne pas accès à la commande, et le lien de la commande ne
 * coupe pas les e-mails du client.
 */
export async function POST(requete: NextRequest): Promise<NextResponse> {
  const quota = await verifierQuotaEcriturePublique();
  if (!quota.autorise) return NextResponse.json({ erreur: "trop" }, { status: 429 });

  const typeContenu = requete.headers.get("content-type") ?? "";
  const champs = lireFormulaireNotification(
    typeContenu.includes("form") ? await requete.formData().catch(() => null) : null,
  );
  const depuisLaPage = champs.depuisLaPage;
  // Le jeton se LIT dans la requête ; aucune adresse n'en est fabriquée.
  const jeton = depuisLaPage ? champs.jeton : requete.nextUrl.searchParams.get("j");

  const resultat = await desinscrireNotification(jeton);

  if (depuisLaPage) {
    const langueBrute = champs.langue;
    const langue = typeof langueBrute === "string" && estLangueSupportee(langueBrute) ? langueBrute : "fr";
    return resultat.statut === "ok"
      ? redirigerVers(`/${resultat.langue}/notification?etat=desinscrite`, 303)
      : redirigerVers(`/${langue}/notification?etat=invalide`, 303);
  }
  return resultat.statut === "ok"
    ? NextResponse.json({ statut: "desinscrit" }, { status: 200 })
    : NextResponse.json({ erreur: "introuvable" }, { status: 404 });
}
