import { NextResponse } from "next/server";
import { secretDeTacheValide } from "@/lib/taches/secret";
import { passerLaVeille } from "@/lib/veille/passer";

/**
 * LE SECOND PLANIFICATEUR — celui qui ne fait que regarder l'autre.
 *
 * ⚠️ IL DOIT ÊTRE APPELÉ PAR UN PLANIFICATEUR DIFFÉRENT DE CELUI DE LA CADENCE.
 * C'est la seule chose qui donne un sens à cette route, et c'est une propriété
 * du DÉPLOIEMENT que ce dépôt ne peut pas garantir seul. Deux tâches sur le
 * même planificateur ne veillent rien : elles s'arrêtent ensemble, et l'on
 * retombe très exactement sur le défaut que L-022 nomme — « le veilleur ne peut
 * pas être ce qu'il veille ».
 *
 * ── POURQUOI UNE ROUTE ENTIÈRE POUR SI PEU DE TRAVAIL ──────────────────────
 *
 * Ce passage ne lit que deux valeurs et n'écrit qu'un battement. On aurait pu
 * l'accrocher à la cadence. C'aurait été inutile : un veilleur greffé sur la
 * tâche qu'il surveille meurt avec elle, et son silence deviendrait alors le
 * seul symptôme de la panne — c'est-à-dire aucun symptôme.
 *
 * La cadence, elle, appelle AUSSI la veille, dans l'autre sens. Les deux se
 * regardent : la mort de l'une est constatée par l'autre. Ce qu'aucune des deux
 * ne peut couvrir, c'est leur mort simultanée — il faudrait un tiers qui nous
 * attende. C'est dit dans `lib/veille/taches.ts` plutôt que passé sous silence.
 *
 * ── L'ORDRE : VEILLER, PUIS BATTRE ─────────────────────────────────────────
 *
 * Le battement est écrit APRÈS la veille, et seulement si elle a abouti. Un
 * passage qui n'a pas pu lire l'état n'a pas veillé ; le certifier par un
 * battement ferait de ce mécanisme un menteur — et le mensonge tomberait
 * précisément le jour où il compte.
 */

export const dynamic = "force-dynamic";
/** Deux lectures et au plus deux envois : trente secondes sont larges. */
export const maxDuration = 30;

export async function POST(requete: Request): Promise<NextResponse> {
  if (!secretDeTacheValide(requete)) {
    // 404 et non 401, comme la cadence : ne pas révéler l'existence de la
    // surface à qui n'y a pas droit.
    return NextResponse.json({ erreur: "introuvable" }, { status: 404 });
  }

  try {
    const bilan = await passerLaVeille(new Date());
    return NextResponse.json(bilan, { headers: { "cache-control": "no-store" } });
  } catch (erreur) {
    // 500 ET NON 200. C'est ce code que le planificateur voit, et c'est la
    // seule chose qui distingue un passage qui a veillé d'un passage qui a
    // acquiescé. Le battement n'est pas écrit non plus : `passerLaVeille` ne l'écrit
    // qu'après avoir abouti.
    console.error(
      "[veille] passage en échec : " + (erreur instanceof Error ? erreur.message : String(erreur)),
    );
    return NextResponse.json({ erreur: "veille" }, { status: 500 });
  }
}

/**
 * `GET` refusé EXPLICITEMENT.
 *
 * Sans cet export, Next répond 405 de lui-même — correct, mais qui tient à une
 * ABSENCE, et une protection qui tient à une absence n'est pas une protection
 * (L-029). Le jour où quelqu'un ajoute un `GET` « pour vérifier que la veille
 * répond », il ajoute un déclencheur sans secret ; et un `GET` est suivi par les
 * préchargements, les aspirateurs et les scanners.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ erreur: "introuvable" }, { status: 404 });
}
