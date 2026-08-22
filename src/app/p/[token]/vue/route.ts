import { NextResponse } from "next/server";
import { enregistrerVue } from "@/lib/page-publique/vue";
import { verifierQuotaPublique } from "@/lib/limitation/quota";

/**
 * La balise de consultation. `POST`, appelée APRÈS le rendu.
 *
 * POURQUOI `POST` ET PAS `GET`. Un `GET` est préchargeable, préconnectable et
 * rejouable : les messageries et les navigateurs en déclenchent d'eux-mêmes.
 * Une vue déclenchée par un préchargement n'est pas une vue, et gonflerait la
 * métrique du côté rassurant.
 *
 * Cette route est HORS du matcher du middleware comme tout le reste de `/p`.
 * Elle porte donc SA garde : limitation de débit, validation du jeton, et
 * arbitrage en base de ce que le jeton désigne.
 *
 * ELLE RÉPOND 204 DANS TOUS LES CAS. Un code distinct selon que la vue a été
 * enregistrée, dédupliquée ou ignorée dirait au visiteur si son jeton existe —
 * un oracle de plus, sur la seule surface qui n'en doit avoir aucun.
 */
export async function POST(
  _requete: Request,
  contexte: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await contexte.params;

  const quota = await verifierQuotaPublique();
  if (!quota.autorise) {
    return new NextResponse(null, { status: 429, headers: { "cache-control": "no-store" } });
  }

  /*
   * ELLE NE SIGNALE PAS LES JETONS INCONNUS, ET C'EST DÉLIBÉRÉ.
   *
   * `enregistrerVue` rend « ignoree » aussi bien pour un jeton invalide que pour
   * un visiteur sans agent utilisateur lisible, et « deja-vue-aujourdhui » sans
   * dire si le jeton existe. Armer le compteur de balayage ici punirait donc des
   * visiteurs légitimes pour un signal qu'on ne sait pas distinguer.
   *
   * Ce n'est pas un oracle pour autant : la réponse est 204 dans TOUS les cas,
   * corps vide compris. Rien ne permet de deviner si le jeton existe — au
   * contraire de `/qc`, qui rendait 200 ou 404 et qui, elle, arme le compteur.
   */
  await enregistrerVue(token);

  return new NextResponse(null, { status: 204, headers: { "cache-control": "no-store" } });
}
