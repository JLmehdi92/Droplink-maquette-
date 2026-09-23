import type { NextResponse } from "next/server";
import { estLangueSupportee } from "@/i18n/config";
import { redirigerVers } from "@/lib/http/rediriger";
import { verifierQuotaEcriturePublique } from "@/lib/limitation/quota";
import { confirmerNotification, lireFormulaireNotification } from "@/lib/page-publique/notifications";

/**
 * LE BOUTON « CONFIRMER » DE LA PAGE DE NOTIFICATION — un POST natif.
 *
 * Le lien reçu par e-mail ouvre une PAGE ; seul ce POST confirme. Les antivirus de
 * messagerie ouvrent les liens des e-mails : une confirmation à l'ouverture serait
 * faite par un robot, et le double consentement ne prouverait plus rien.
 *
 * `303` et non `307` : le navigateur repasse en GET sur la page de résultat, et un
 * rafraîchissement ne rejoue pas le POST.
 */
export async function POST(requete: Request): Promise<NextResponse> {
  const champs = lireFormulaireNotification(await requete.formData().catch(() => null));
  const langueBrute = champs.langue;
  const langue = typeof langueBrute === "string" && estLangueSupportee(langueBrute) ? langueBrute : "fr";

  const quota = await verifierQuotaEcriturePublique();
  // Le quota refusé ne rend pas le lien invalide : le dire serait faux
  // (contrainte n° 8). Le lien reste valable, on le dit.
  if (!quota.autorise) return redirigerVers(`/${langue}/notification?etat=indisponible`, 303);

  const resultat = await confirmerNotification(champs.jeton);
  return resultat.statut === "ok"
    ? redirigerVers(`/${resultat.langue}/notification?etat=confirmee`, 303)
    : redirigerVers(`/${langue}/notification?etat=invalide`, 303);
}
