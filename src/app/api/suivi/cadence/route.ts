import { NextResponse } from "next/server";
import { secretDeTacheValide } from "@/lib/taches/secret";
import { passerLaCadence } from "@/lib/tracking/cadence";

/**
 * LE DÉCLENCHEUR DE LA TÂCHE DE FOND.
 *
 * ⚠️ `/api` est exclu du matcher du middleware : cette route n'est protégée que
 * par sa propre garde. Et ce qu'elle déclenche COÛTE DE L'ARGENT — chaque
 * passage interroge le fournisseur. Une route de tâche de fond laissée ouverte
 * est un robinet que n'importe qui peut ouvrir à nos frais.
 *
 * La garde — comparaison à temps constant, refus si le secret n'est pas
 * configuré, 404 plutôt que 401 — est passée dans `lib/taches/secret.ts` le
 * jour où la veille mutuelle en a eu besoin à l'identique. Elle n'est pas
 * affaiblie : elle est la MÊME, et il n'en existe plus qu'un exemplaire.
 */

export const dynamic = "force-dynamic";
/** Un passage traite au plus cinquante colis ; il doit tenir largement. */
export const maxDuration = 60;

export async function POST(requete: Request): Promise<NextResponse> {
  if (!secretDeTacheValide(requete)) {
    // 404 et non 401 : ne pas révéler l'existence de la surface. Une route de
    // tâche de fond dont on sait qu'elle existe est une route qu'on essaiera.
    return NextResponse.json({ erreur: "introuvable" }, { status: 404 });
  }

  try {
    // L'INSTANT EST PRIS ICI, une seule fois, et passé à la cadence. Un lot doit
    // décrire un instant, pas une durée : sinon deux colis à égalité seraient
    // traités selon des règles imperceptiblement différentes.
    const bilan = await passerLaCadence(new Date());
    return NextResponse.json(bilan, { headers: { "cache-control": "no-store" } });
  } catch (erreur) {
    // L'ÉCHEC EST UN 500, PAS UN 200 SILENCIEUX. C'est ce code que le
    // planificateur voit, et c'est la seule chose qui distingue un passage qui a
    // travaillé d'un passage qui a acquiescé. Le battement, lui, n'est pas
    // écrit : un passage qui n'a pas veillé ne doit pas certifier l'avoir fait.
    console.error(
      "[suivi] cadence en échec : " + (erreur instanceof Error ? erreur.message : String(erreur)),
    );
    return NextResponse.json({ erreur: "cadence" }, { status: 500 });
  }
}

/**
 * `GET` refusé EXPLICITEMENT.
 *
 * Sans cet export, Next répond 405 de lui-même — correct, mais qui tient à une
 * ABSENCE. Une protection qui tient à une absence n'est pas une protection : le
 * jour où quelqu'un ajoute un `GET` « pour vérifier que la tâche répond », il
 * ajoute un déclencheur sans secret. Et un `GET` est suivi par les
 * préchargements, les aspirateurs et les scanners.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ erreur: "introuvable" }, { status: 404 });
}
