import { NextResponse } from "next/server";
import { lireEtatDuCompte, SessionIndisponible } from "@/lib/comptes/profil";
import { exporterDonnees } from "@/lib/comptes/export-donnees";
import { origineDuSite } from "@/lib/site";
import { verifierQuotaExport } from "@/lib/limitation/quota";
import { creerClientServeur } from "@/lib/supabase/server";

/**
 * « EXPORTER MES DONNÉES » — l'écran Paramètres.
 *
 * ROUTE HANDLER ET NON SERVER ACTION : un téléchargement exige
 * `Content-Disposition`, que la seconde ne peut pas fixer — la déviation
 * documentée au brief, celle de l'export CSV.
 *
 * `/api` EST EXCLU DU MATCHER : la route porte SA garde. Elle lit l'état du
 * compte EN BASE et répond 404 — jamais 401 — à qui n'a pas de session active,
 * ET à une session `aal1` d'un compte à double authentification : un export est
 * exactement ce que la vérification en deux étapes existe pour protéger.
 *
 * LE PLAFOND DE DÉBIT EST CELUI DE L'EXPORT CSV, partagé : le fichier porte les
 * liens publics, et deux compteurs distincts doubleraient ce qu'on peut en
 * faire sortir.
 */

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  let etat;
  try {
    etat = await lireEtatDuCompte();
  } catch (e) {
    // Une panne transitoire du serveur d'auth n'est PAS « pas de session » : la
    // confondre rendait 404 (« l'export n'existe pas ») à un vendeur actif. On
    // dit 503 — réessayez — et on ne l'avale plus en silence.
    if (e instanceof SessionIndisponible) return new NextResponse(null, { status: 503 });
    throw e;
  }
  if (etat === null || etat.etat !== "profil" || etat.profil.statut !== "active") {
    return new NextResponse(null, { status: 404 });
  }

  const quota = await verifierQuotaExport(etat.profil.profilId);
  if (!quota.autorise) {
    return new NextResponse(null, { status: 429, headers: { "retry-after": "3600" } });
  }

  const origine = await origineDuSite();
  if (origine === null) return new NextResponse(null, { status: 503 });

  let contenu: string;
  try {
    contenu = JSON.stringify(await exporterDonnees(await creerClientServeur(), origine, etat.profil.nomDeLien), null, 2);
  } catch (erreur) {
    // Un fichier à moitié rempli se lirait comme complet : on ne rend rien.
    console.error("[export] " + (erreur instanceof Error ? erreur.message : String(erreur)));
    return new NextResponse(null, { status: 503 });
  }

  const jour = new Date().toISOString().slice(0, 10);
  return new NextResponse(contenu, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="droplink-donnees-${jour}.json"`,
      "cache-control": "no-store, private",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function POST(): Promise<NextResponse> {
  return new NextResponse(null, { status: 405 });
}
