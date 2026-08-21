import "server-only";
import { z } from "zod";
import { creerClientAnonyme } from "@/lib/supabase/anon";
import { emettre } from "@/lib/instrumentation/emettre";
import { EVENEMENTS } from "@/lib/instrumentation/evenements";
import { adresseAppelant, empreinte } from "@/lib/limitation/empreinte";
import { JetonPublic } from "./lecture";

/**
 * L'ARBITRAGE QC — la seule écriture que la page publique autorise.
 *
 * Elle est faite par quelqu'un qui n'a pas de compte et n'en aura jamais. Le
 * jeton est donc le seul laissez-passer, et il ne désigne qu'une commande :
 * aucun identifiant de commande n'entre ici. En accepter un permettrait
 * d'arbitrer la commande d'un autre vendeur en présentant un jeton valide
 * quelconque.
 *
 * PAR `anon.ts`, SANS SESSION, comme le reste de cette surface. Employer le
 * client à session ferait dépendre l'écriture de la présence d'un cookie : un
 * vendeur connecté qui teste sa propre page n'emprunterait pas le même chemin
 * que son client, et le défaut ne se verrait qu'une fois le lien envoyé.
 *
 * LA DÉCISION EST RÉVERSIBLE. Un client qui regarde mieux ses photos et change
 * d'avis est un cas normal ; ce qui ne doit pas se perdre, c'est l'historique de
 * ses décisions — chaque arbitrage écrit sa ligne de journal, en base, dans la
 * même transaction.
 */

export const Decision = z.enum(["approuve", "refuse"]);
export type Decision = z.infer<typeof Decision>;

/**
 * Le commentaire, borné À LA SAISIE ET EN BASE.
 *
 * Les deux, parce qu'ils ne protègent pas la même chose : ici on refuse une
 * saisie déraisonnable avec un message que le visiteur comprend, en base on
 * tronque pour qu'un appel direct ne puisse pas faire échouer l'arbitrage entier
 * en dépassant la charge utile autorisée du journal.
 */
export const Commentaire = z.string().max(1000);

export const ArbitrageDemande = z.object({
  decision: Decision,
  commentaire: Commentaire.optional(),
});

export type Arbitrage =
  | { readonly statut: "ok"; readonly qc: Decision }
  | { readonly statut: "refuse" };

/**
 * Arbitre le QC d'une commande désignée par son jeton.
 *
 * Jeton inconnu, jeton révoqué et compte suspendu rendent tous `refuse`, par le
 * même chemin : distinguer les trois dirait au visiteur laquelle des trois
 * situations il vient de rencontrer, et c'est précisément ce qu'un balayage
 * cherche à apprendre.
 */
export async function arbitrerQc(
  jetonBrut: string,
  demande: unknown,
): Promise<Arbitrage> {
  const jeton = JetonPublic.safeParse(jetonBrut);
  const corps = ArbitrageDemande.safeParse(demande);
  if (!jeton.success || !corps.success) return { statut: "refuse" };

  const supabase = creerClientAnonyme();
  const { data, error } = await supabase.rpc("arbitrer_qc", {
    p_jeton: jeton.data,
    p_decision: corps.data.decision,
    p_commentaire: corps.data.commentaire ?? "",
  });

  // `data === null` couvre le jeton inconnu, révoqué et le compte suspendu : la
  // base rend la même chose pour les trois, et ce module n'a pas à savoir
  // laquelle.
  if (error !== null || data === null) return { statut: "refuse" };

  // ÉMIS APRÈS l'écriture, jamais avant : un compteur incrémenté avant une
  // opération qui peut échouer perd son événement définitivement.
  //
  // NI LE JETON NI L'IDENTIFIANT DE LA COMMANDE ne partent vers l'analytics. Le
  // jeton ne transporte pas une donnée mais une capacité, définitivement.
  const visiteur = await adresseAppelant();
  await emettre(
    corps.data.decision === "approuve" ? EVENEMENTS.QC_APPROUVE : EVENEMENTS.QC_REFUSE,
    { sujet: visiteur === null ? "visiteur:sans-adresse" : `visiteur:${empreinte(visiteur)}` },
    // Le commentaire lui-même ne sort pas : il peut contenir n'importe quoi, y
    // compris ce que le client a écrit sur son vendeur. Seule sa présence est
    // une information exploitable.
    { avec_commentaire: (corps.data.commentaire ?? "").trim() !== "" },
  );

  return { statut: "ok", qc: data === "approuve" ? "approuve" : "refuse" };
}
