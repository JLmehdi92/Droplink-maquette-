import "server-only";
import { headers } from "next/headers";
import { creerClientSysteme } from "@/lib/supabase/system";
import { lireProfilVendeur } from "@/lib/comptes/profil";
import { adresseAppelant, classeAgent, empreinte, paysAppelant } from "@/lib/limitation/empreinte";
import { emettre } from "@/lib/instrumentation/emettre";
import { EVENEMENTS } from "@/lib/instrumentation/evenements";
import { JetonPublic } from "./lecture";

/**
 * L'ENREGISTREMENT D'UNE VUE DE LIEN.
 *
 * APRÈS LE RENDU, JAMAIS PENDANT. WhatsApp, Snap et Discord chargent les liens
 * qu'on leur colle pour en composer un aperçu. Compter au rendu gonflerait PAR
 * CONSTRUCTION « vues par commande », qui est une métrique de VERDICT — et un
 * biais optimiste est plus dangereux qu'un biais pessimiste à ampleur égale,
 * parce qu'une métrique qui confirme ce qu'on espère ne se remet jamais en
 * question.
 *
 * Ce module est appelé par une route, depuis un îlot client monté après le
 * premier rendu. La perte reste donc bornée et connue :
 *
 *     rendus (serveur) ≥ vues réelles ≥ vues enregistrées
 *
 * Un bloqueur, un onglet fermé trop vite ou un réseau coupé font manquer la
 * troisième, jamais la première : c'est pour cela que `PAGE_PUBLIQUE_RENDUE`
 * existe à côté, émis côté serveur.
 *
 * LE CLIENT SYSTÈME, pas le client admin : `enregistrer_vue` n'est exécutable
 * par personne d'autre que le rôle système. Et un visiteur n'est personne —
 * l'auditer noierait les vraies consultations humaines de données tierces.
 */

/** Ce que l'appel a produit. Distinguer les trois sert à l'instrumentation. */
export type ResultatVue = "enregistree" | "deja-vue-aujourdhui" | "ignoree";

/**
 * Enregistre une vue pour le jeton donné.
 *
 * NE LÈVE JAMAIS. Une panne du comptage ne doit pas transformer la page d'un
 * client en erreur : la vue est une mesure, pas le produit.
 */
export async function enregistrerVue(jetonBrut: string): Promise<ResultatVue> {
  const analyse = JetonPublic.safeParse(jetonBrut);
  if (!analyse.success) return "ignoree";

  const ip = await adresseAppelant();
  const agent = (await headers()).get("user-agent");

  // SANS ADRESSE NI AGENT, ON N'ÉCRIT PAS. La clé de déduplication est
  // exactement le couple des deux : les remplacer par une constante ferait
  // fusionner tous les visiteurs d'un jour en une seule ligne, et la métrique
  // dirait « une vue » là où il y en a eu deux cents. Une mesure impossible se
  // dit impossible, elle ne s'arrondit pas.
  if (ip === null || agent === null || agent.trim() === "") return "ignoree";

  // LE VENDEUR QUI OUVRE SA PROPRE PAGE EST EXCLU. Il vérifie son travail, il ne
  // consulte pas. L'exclusion est décidée EN BASE, à partir du profil qu'on lui
  // transmet : ici on ne fait que le lire.
  const profil = await lireProfilVendeur().catch(() => null);

  const systeme = creerClientSysteme();
  const { data, error } = await systeme.rpc("enregistrer_vue", {
    p_jeton: analyse.data,
    p_ip_hash: empreinte(ip),
    // LA CLASSE, JAMAIS LA CHAÎNE ENTIÈRE. Prise entière, elle est presque
    // unique par machine — donc offrait un espace illimité de lignes distinctes
    // pour un seul visiteur. Mesuré : cinq cents vues depuis une seule adresse.
    p_ua_hash: empreinte(classeAgent(agent)),
    p_pays: (await paysAppelant()) ?? "",
    p_profil: profil?.profilId ?? "",
  });

  if (error !== null) return "ignoree";
  if (data !== true) return "deja-vue-aujourdhui";

  // ÉMIS APRÈS l'écriture, jamais avant. Un compteur incrémenté avant une
  // opération qui peut échouer perd son événement définitivement.
  await emettre(EVENEMENTS.VUE_ENREGISTREE, { sujet: `visiteur:${empreinte(ip)}` });
  return "enregistree";
}
