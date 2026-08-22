import { NextResponse, type NextRequest } from "next/server";
import { lireProfilVendeur } from "@/lib/comptes/profil";
import { exporterCommandes } from "@/lib/commandes/export-csv";
import { ParametresListe } from "@/lib/commandes/liste";
import { origineDuSite } from "@/lib/site";
import { emettre } from "@/lib/instrumentation/emettre";
import { EVENEMENTS } from "@/lib/instrumentation/evenements";

/**
 * L'EXPORT CSV DES COMMANDES DU VENDEUR CONNECTÉ.
 *
 * ⚠️ `/api` EST EXCLUE DU MIDDLEWARE. Cette route n'est donc protégée par RIEN
 * d'autre que la garde écrite ici, et son emplacement donnerait l'impression
 * contraire à qui la relit. C'est le piège structurel nommé au brief.
 *
 * Route handler et non Server Action : un téléchargement exige
 * `Content-Disposition`, qu'une Server Action ne peut pas fixer. C'est la
 * déviation documentée — et un export est une LECTURE.
 *
 * LA LECTURE SE FAIT SOUS RLS, AVEC LA SESSION. Le module d'export appelle
 * `lireCommandes` sans lui passer de client, donc celui à session. Employer le
 * service-role ici produirait un fichier contenant les commandes de tous les
 * vendeurs, qui SORT de l'application — la fuite la moins rattrapable du
 * produit.
 */

export const dynamic = "force-dynamic";

export async function GET(requete: NextRequest): Promise<NextResponse> {
  const profil = await lireProfilVendeur().catch(() => null);

  /*
   * 404 ET NON 401. La règle de l'admin s'applique ici pour une raison
   * différente mais aussi bonne : une route d'export qui répond 401 confirme
   * qu'elle existe et ce qu'elle fait. Un compte suspendu reçoit la même chose
   * qu'un visiteur anonyme — un seul chemin de sortie.
   */
  if (profil === null || profil.statut !== "active") {
    return new NextResponse(null, { status: 404 });
  }

  const origine = await origineDuSite();
  if (origine === null) {
    // Sans origine fiable, les liens publics de l'export seraient construits sur
    // un en-tête que l'appelant choisit : le fichier porterait des liens menant
    // ailleurs. On refuse plutôt que d'exporter des liens faux.
    return new NextResponse(null, { status: 503 });
  }

  // ZOD SUR TOUTE ENTRÉE EXTERNE, y compris « ce qui vient de notre écran » :
  // ces valeurs arrivent d'une barre d'adresse.
  const p = requete.nextUrl.searchParams;
  const parametres = ParametresListe.parse({
    q: p.get("q") ?? "",
    statut: p.get("statut"),
    qc: p.get("qc"),
    tri: p.get("tri") ?? "recentes",
    archivees: p.get("archivees") === "1",
    curseur: null,
  });

  const resultat = await exporterCommandes(parametres, origine);

  await emettre(
    EVENEMENTS.EXPORT_CSV,
    { sujet: profil.profilId },
    { lignes: resultat.lignes, tronque: resultat.tronque },
  );

  const jour = new Date().toISOString().slice(0, 10);

  return new NextResponse(resultat.csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="commandes-${jour}.csv"`,
      // Le fichier contient les liens publics des commandes : il ne doit être
      // gardé ni par un intermédiaire, ni par le navigateur.
      "cache-control": "no-store, private",
      // Le navigateur ne doit pas deviner un autre type et rendre le contenu.
      "x-content-type-options": "nosniff",
    },
  });
}

/**
 * Toute autre méthode est refusée explicitement.
 *
 * Sans cet export, Next répondrait 405 de lui-même — correct, mais tenant à une
 * ABSENCE. Le jour où quelqu'un ajoute un `POST` « pour déclencher l'export en
 * tâche de fond », il n'y a plus rien.
 */
export async function POST(): Promise<NextResponse> {
  return new NextResponse(null, { status: 405 });
}
