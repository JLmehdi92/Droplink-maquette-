import { NextResponse, type NextRequest } from "next/server";
import { lireProfilVendeur } from "@/lib/comptes/profil";
import { exporterEnvois } from "@/lib/envois/export-csv";

/**
 * L'EXPORT CSV DES COLIS DU VENDEUR CONNECTÉ.
 *
 * ⚠️ `/api` EST EXCLUE DU MIDDLEWARE. Cette route n'est donc protégée par RIEN
 * d'autre que la garde écrite ici, et son emplacement donnerait l'impression
 * contraire à qui la relit. C'est le piège structurel nommé au brief, et il vaut
 * pour cette route comme pour celle des commandes.
 *
 * Route handler et non Server Action : un téléchargement exige
 * `Content-Disposition`, qu'une Server Action ne peut pas fixer.
 *
 * ⚠️ PAS DE PLAFOND DE DÉBIT ICI, ET C'EST UNE DIFFÉRENCE ASSUMÉE AVEC L'EXPORT
 * DES COMMANDES. Celui-là est compté parce qu'il fait sortir jusqu'à 5 000
 * `public_token` — des CAPACITÉS, immuables à vie. Celui-ci sort des numéros de
 * suivi que le transporteur et le client connaissent déjà, un nom de
 * transporteur et des dates : le rejouer n'expose rien de plus que la page qui
 * l'a produit. Le plafond de LIGNES, lui, reste — il protège la mémoire du
 * serveur, pas le vendeur.
 */

export const dynamic = "force-dynamic";

export async function GET(requete: NextRequest): Promise<NextResponse> {
  const profil = await lireProfilVendeur().catch(() => null);

  /*
   * 404 ET NON 401, comme l'export des commandes : une route qui répond 401
   * confirme qu'elle existe et ce qu'elle fait. Un compte suspendu reçoit la
   * même chose qu'un visiteur anonyme — un seul chemin de sortie.
   */
  if (profil === null || profil.statut !== "active") {
    return new NextResponse(null, { status: 404 });
  }

  /*
   * ⚠️ LA SÉLECTION EST BORNÉE AVANT D'ALLER EN BASE. `getAll` rend autant
   * d'entrées que l'URL en porte ; sans borne, une adresse forgée ferait
   * construire un `in (…)` de plusieurs milliers d'éléments. On garde le
   * plafond de lignes de l'export, et on ne retient que ce qui a la FORME d'un
   * identifiant — la RLS ferait le reste, mais une protection qui tient à ce
   * qu'une autre couche rattrape n'est pas une protection.
   */
  const selection = requete.nextUrl.searchParams
    .getAll("selection")
    .filter((v) => /^[0-9a-f-]{36}$/i.test(v))
    .slice(0, 5000);

  const resultat = await exporterEnvois(selection);

  const jour = new Date().toISOString().slice(0, 10);
  return new NextResponse(resultat.csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="droplink-envois-${jour}.csv"`,
      /* Un export est une photographie : le mettre en cache ferait retélécharger
         un fichier périmé au rechargement suivant. */
      "cache-control": "no-store",
    },
  });
}
