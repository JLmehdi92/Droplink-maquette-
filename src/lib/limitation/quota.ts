import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { creerClientSysteme } from "@/lib/supabase/system";

/**
 * Limitation de débit — côté application.
 *
 * Le compteur vit EN BASE (migration 005). Ce module ne fait que composer les
 * clés et décider quoi faire d'un refus. Il appelle la fonction par le client
 * SYSTÈME, seul rôle à qui l'exécution est accordée : ni `anon` ni
 * `authenticated` ne peuvent l'appeler, sans quoi n'importe qui pourrait épuiser
 * le quota d'un tiers dont il connaît la clé.
 *
 * C'est aussi le bon client au sens du brief : `system.ts` sert les chemins sans
 * humain. Compter une requête n'est pas lire les données de quelqu'un, ça n'a
 * donc rien à faire dans un audit — l'y mettre noierait les vraies consultations
 * humaines.
 */

/** Ce que le compteur protège. Les surfaces ne partagent JAMAIS leurs compteurs. */
export type Surface = "auth-ip" | "auth-email";

export type Verdict = { autorise: true } | { autorise: false; motif: "quota" | "indisponible" };

function entierEnv(nom: string, defaut: number): number {
  const brut = process.env[nom];
  if (brut === undefined || !/^\d+$/.test(brut.trim())) return defaut;
  const v = Number.parseInt(brut.trim(), 10);
  return v > 0 ? v : defaut;
}

/**
 * Seuils, par surface.
 *
 * DEUX DIMENSIONS PLUTÔT QU'UNE, et leurs valeurs ne se ressemblent pas parce
 * qu'elles ne défendent pas contre la même chose :
 *
 *   - `auth-ip` borne le BALAYAGE d'adresses. Le seuil est volontairement
 *     généreux : le fournisseur en Chine passe souvent par un réseau partagé,
 *     et un seuil serré bloquerait plusieurs personnes légitimes derrière une
 *     seule adresse IP — c'est-à-dire exactement le persona qui n'a aucune
 *     autre porte d'entrée que l'email.
 *   - `auth-email` borne le HARCÈLEMENT d'une boîte précise, et peut donc être
 *     strict sans gêner personne : nul n'a besoin de six liens par heure.
 *
 * Un seuil unique obligerait à choisir entre les deux, et le compromis serait
 * mauvais des deux côtés.
 */
function seuil(surface: Surface): { plafond: number; fenetreSecondes: number } {
  switch (surface) {
    case "auth-ip":
      return {
        plafond: entierEnv("QUOTA_AUTH_IP_PAR_HEURE", 30),
        fenetreSecondes: 3600,
      };
    case "auth-email":
      return {
        plafond: entierEnv("QUOTA_AUTH_EMAIL_PAR_HEURE", 6),
        fenetreSecondes: 3600,
      };
  }
}

/**
 * Empreinte salée d'une valeur identifiante.
 *
 * Salée, parce qu'une IPv4 non salée se retrouve par force brute en quelques
 * secondes : l'espace fait quatre milliards de valeurs, et un sha256 se calcule
 * par milliards par seconde. Une empreinte non salée n'est pas une
 * pseudonymisation, c'est un encodage.
 */
function empreinte(valeur: string): string {
  const sel = process.env["HASH_SALT"] ?? "";
  if (sel.length < 16) {
    throw new Error(
      "HASH_SALT absent ou trop court. Sans sel, l'empreinte d'une adresse IP " +
        "se retrouve par force brute en quelques secondes : ce ne serait pas " +
        "une pseudonymisation mais un encodage.",
    );
  }
  return createHash("sha256").update(`${sel}:${valeur}`).digest("hex").slice(0, 32);
}

/**
 * Adresse de l'appelant, telle que le bord la rapporte.
 *
 * `x-forwarded-for` est une LISTE que n'importe quel intermédiaire peut
 * rallonger, et que le client peut préremplir. On prend donc l'en-tête posé par
 * notre propre bord quand il existe, et seulement à défaut la PREMIÈRE entrée de
 * `x-forwarded-for`.
 *
 * Rend `null` si rien n'est exploitable : mieux vaut l'absence assumée qu'une
 * valeur qu'un client aurait choisie, laquelle transformerait le compteur en
 * outil pour épuiser le quota des autres.
 */
async function adresseAppelant(): Promise<string | null> {
  const enTetes = await headers();
  const cloudflare = enTetes.get("cf-connecting-ip");
  if (cloudflare !== null && cloudflare.trim() !== "") return cloudflare.trim();

  const transmis = enTetes.get("x-forwarded-for");
  if (transmis !== null) {
    const premiere = transmis.split(",")[0]?.trim();
    if (premiere !== undefined && premiere !== "") return premiere;
  }
  return null;
}

async function consommer(cle: string, surface: Surface): Promise<Verdict> {
  const { plafond, fenetreSecondes } = seuil(surface);
  const systeme = creerClientSysteme();

  const { data, error } = await systeme.rpc("consommer_quota", {
    p_cle: `${surface}:${cle}`,
    p_plafond: plafond,
    p_fenetre_secondes: fenetreSecondes,
  });

  if (error !== null) {
    // FERMÉ EN CAS DE PANNE DU COMPTEUR, sur cette surface précisément.
    //
    // Le brief tranche l'inverse pour la page publique — y refuser pénaliserait
    // les clients d'un vendeur pour un incident qui ne les concerne pas. Ici le
    // raisonnement s'inverse pour une raison concrète : le compteur vit dans le
    // MÊME Postgres que `profiles` et `shops`, dont la création du compte
    // dépend. S'il est indisponible, l'inscription échouerait de toute façon.
    // Refuser ne coûte donc aucune inscription qui aurait réussi, et borne
    // l'abus pendant l'incident.
    return { autorise: false, motif: "indisponible" };
  }

  return data === true ? { autorise: true } : { autorise: false, motif: "quota" };
}

/**
 * Vérifie les deux seuils d'une demande de lien de connexion.
 *
 * Les compteurs sont consommés dans l'ordre IP puis email, et l'on s'arrête au
 * premier refus : consommer le second après avoir déjà refusé ferait payer à une
 * adresse email le quota d'une IP qui n'est pas la sienne.
 */
export async function verifierQuotaAuth(email: string): Promise<Verdict> {
  const ip = await adresseAppelant();
  if (ip !== null) {
    const parIp = await consommer(empreinte(ip), "auth-ip");
    if (!parIp.autorise) return parIp;
  }

  // L'adresse est normalisée avant empreinte, sinon « A@B.com » et « a@b.com »
  // recevraient deux quotas distincts pour une seule boîte.
  return consommer(empreinte(email.trim().toLowerCase()), "auth-email");
}
