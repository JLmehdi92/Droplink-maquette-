"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigerAdmin } from "@/lib/audit/garde";
import { empreinteAdmin } from "@/lib/audit/empreinte-admin";
import { lireCompte } from "@/lib/audit/comptes";
import {
  reactiverCompte,
  suspendreCompte,
  type ResultatSuspension,
} from "@/lib/audit/suspension";
import { creerClientServeur } from "@/lib/supabase/server";

/**
 * SUSPENSION ET RÉACTIVATION — les actions.
 *
 * CHAQUE ACTION PORTE SA PROPRE GARDE. Le layout d'administration en pose une,
 * mais une Server Action NE PASSE PAS par le layout : c'est un point d'entrée à
 * part entière, atteignable par une requête forgée qui n'a jamais affiché
 * l'écran. Le middleware ne la couvre pas davantage.
 *
 * DANS UN MODULE `"use server"`, CHAQUE EXPORT EST ATTEIGNABLE DEPUIS LE
 * NAVIGATEUR. Le travail réel vit dans `lib/audit/suspension.ts`, en
 * `server-only`, et c'est lui que les tests exercent.
 *
 * L'EMAIL ATTENDU EST RELU EN BASE, jamais transporté depuis le formulaire.
 * Comparé à une valeur que le client fournit lui-même, le contrôle de
 * confirmation se réduirait à « recopier ce qu'on vient de m'envoyer » — et ne
 * forcerait plus personne à lire quoi que ce soit.
 */

const Formulaire = z.object({
  profilId: z.string().uuid(),
  motif: z.string().max(1_000),
  confirmation: z.string().max(320),
});

export type EtatSuspension = { statut: "inactif" } | ResultatSuspension;

export async function suspendre(
  _precedent: EtatSuspension,
  donnees: FormData,
): Promise<EtatSuspension> {
  await exigerAdmin();

  const analyse = Formulaire.safeParse({
    profilId: donnees.get("profilId"),
    motif: donnees.get("motif") ?? "",
    confirmation: donnees.get("confirmation") ?? "",
  });
  if (!analyse.success) return { statut: "erreur", motif: "saisie" };

  const supabase = await creerClientServeur();
  const empreinte = await empreinteAdmin();

  // La fiche est relue AVANT le geste : c'est elle qui fournit l'email de
  // référence. Cette lecture est elle-même tracée, ce qui est correct — un
  // administrateur qui suspend a bien consulté le compte.
  const fiche = await lireCompte(supabase, analyse.data.profilId, empreinte);
  if (fiche === null) return { statut: "erreur", motif: "introuvable" };

  const resultat = await suspendreCompte(
    supabase,
    {
      profilId: analyse.data.profilId,
      motif: analyse.data.motif,
      confirmation: analyse.data.confirmation,
    },
    fiche.email,
    empreinte,
  );

  if (resultat.statut === "ok") {
    // L'écran doit refléter ce que la base porte désormais. La page publique du
    // vendeur, elle, n'a rien à invalider : elle est dynamique, et la coupure y
    // arrive en un dixième de seconde — établi par la sonde de fumée.
    revalidatePath(`/[locale]/admin/comptes/${analyse.data.profilId}`, "page");
  }

  return resultat;
}

export async function reactiver(
  _precedent: EtatSuspension,
  donnees: FormData,
): Promise<EtatSuspension> {
  await exigerAdmin();

  const analyse = Formulaire.omit({ confirmation: true }).safeParse({
    profilId: donnees.get("profilId"),
    motif: donnees.get("motif") ?? "",
  });
  if (!analyse.success) return { statut: "erreur", motif: "saisie" };

  const supabase = await creerClientServeur();
  const resultat = await reactiverCompte(
    supabase,
    analyse.data.profilId,
    analyse.data.motif,
    await empreinteAdmin(),
  );

  if (resultat.statut === "ok") {
    revalidatePath(`/[locale]/admin/comptes/${analyse.data.profilId}`, "page");
  }

  return resultat;
}
