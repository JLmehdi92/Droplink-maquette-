import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { passerLaCadence } from "@/lib/tracking/cadence";

/**
 * LE DÉCLENCHEUR DE LA TÂCHE DE FOND.
 *
 * ⚠️ `/api` est exclu du matcher du middleware : cette route n'est protégée par
 * RIEN d'autre que ce qui est écrit ici. Et ce qu'elle déclenche COÛTE DE
 * L'ARGENT — chaque passage interroge le fournisseur. Une route de tâche de fond
 * laissée ouverte est un robinet que n'importe qui peut ouvrir à nos frais.
 *
 * LE SECRET EST COMPARÉ À TEMPS CONSTANT, pour la même raison que la signature
 * des notifications : une comparaison de chaînes s'arrête au premier octet
 * différent, et cet écart se mesure.
 *
 * SANS SECRET CONFIGURÉ, LA ROUTE REFUSE. Elle ne « passe pas en mode ouvert
 * pour le développement » : un défaut de configuration qui ouvre une porte est
 * exactement celui qu'on ne remarque pas, parce que tout continue de marcher.
 */

export const dynamic = "force-dynamic";
/** Un passage traite au plus cinquante colis ; il doit tenir largement. */
export const maxDuration = 60;

function autorise(requete: Request): boolean {
  const attendu = process.env["CRON_SECRET"] ?? "";
  if (attendu.trim().length < 16) return false;

  const entete = requete.headers.get("authorization") ?? "";
  const fourni = entete.startsWith("Bearer ") ? entete.slice(7) : entete;

  const a = Buffer.from(attendu.trim(), "utf8");
  const b = Buffer.from(fourni.trim(), "utf8");

  // `timingSafeEqual` LÈVE sur des longueurs différentes, et l'exception
  // révélerait par sa seule existence que la longueur ne correspondait pas.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(requete: Request): Promise<NextResponse> {
  if (!autorise(requete)) {
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
