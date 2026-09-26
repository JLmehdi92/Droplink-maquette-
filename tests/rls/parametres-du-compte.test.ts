import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import {
  clientAnonyme,
  clientService,
  creerUtilisateur,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";
import { verifierMotDePasseActuel } from "@/lib/auth/reauthentification";
import { verifierQuotaMotDePasse } from "@/lib/limitation/quota";

/**
 * L'ÉCRAN « PARAMÈTRES » — ce qui protège le compte quand on le modifie.
 *
 * QUATRE PROPRIÉTÉS, et chacune se prouve sur la base de tests, avec de vrais
 * comptes authentifiés :
 *
 *  1. LA VÉRIFICATION DU MOT DE PASSE DIT NON à un mot de passe faux — et OUI au
 *     bon, sans quoi une suite où tout est refusé passerait sans rien prouver.
 *  2. ELLE NE LAISSE AUCUNE SESSION DERRIÈRE ELLE. Chaque vérification ouvre une
 *     session réelle chez le serveur d'authentification ; laissée ouverte, elle
 *     ajouterait un « appareil » de quatre cents jours au compte — l'exact
 *     contraire du bouton « déconnecter les autres appareils ».
 *  3. LE QUOTA EST CONSOMMÉ AVANT LA VÉRIFICATION : un compte dont le budget est
 *     épuisé est refusé MÊME avec le bon mot de passe. Sinon l'écran de
 *     paramètres serait une seconde porte de bourrage, hors de la limite de
 *     l'écran de connexion.
 *  4. L'ADRESSE DU PROFIL SUIT CELLE DU COMPTE, et seulement une fois
 *     confirmée : une adresse en attente de confirmation ne remplace rien.
 *
 * Et « Voir les sessions » rend les sessions DU COMPTE APPELANT, jamais celles
 * d'un autre, sans adresse IP ni rien qui permette de rejouer une session.
 */

let vendeur: UtilisateurDeTest;
let voisin: UtilisateurDeTest;
let catalogue: Client;
let bordAvant: string | undefined;

async function sessionsDe(userId: string): Promise<number> {
  const [ligne] = await interroger<{ n: string }>(
    catalogue,
    "select count(*)::text as n from auth.sessions where user_id = $1",
    [userId],
  );
  return Number(ligne?.n ?? "NaN");
}

/**
 * Le verdict de `verifierMotDePasseActuel`, BORNÉ — pas relancé jusqu'au vert.
 *
 * ⚠️ INTERMITTENCE MESURÉE (27/09/2026, trois passages de portes sur six). Sous une
 * suite saturée, Supabase refuse en quelques millisecondes la connexion de
 * vérification (429, par adresse IP : toute la suite partage la machine), et le
 * produit le dit — à juste titre — `trop_de_tentatives`. Ce n'est pas le
 * comportement éprouvé ici (`ok` / `refuse`), et la reprise du harnais ne le
 * couvre pas : c'est la fonction du PRODUIT qui appelle Supabase.
 *
 * On patiente sur CE SEUL verdict, au rythme du harnais (15 s puis 45 s) ; tout
 * autre verdict est rendu tel quel, et un quota qui ne se libère pas laisse le
 * test ROUGE. Le budget par adresse (60/h) couvre largement les reprises. Le test
 * qui éprouve NOTRE quota n'emploie pas cette aide : il attend `trop_de_tentatives`.
 */
async function verdict(email: string, motDePasse: string): Promise<string> {
  let v = await verifierMotDePasseActuel(email, motDePasse);
  for (const attente of [15_000, 45_000]) {
    if (v !== "trop_de_tentatives") return v;
    console.warn(
      `[harnais] vérification de mot de passe refusée pour quota (${email}) : ` +
        `nouvelle tentative dans ${attente / 1000} s. Ce n'est PAS le comportement éprouvé.`,
    );
    await new Promise((fin) => setTimeout(fin, attente));
    v = await verifierMotDePasseActuel(email, motDePasse);
  }
  return v;
}

beforeAll(async () => {
  // HORS REQUÊTE, AUCUNE ADRESSE IP N'EST LISIBLE. Le mode `aucun` le dit
  // explicitement plutôt que de laisser `headers()` lever : il reste le compteur
  // par adresse e-mail, qui est celui que ces tests éprouvent.
  bordAvant = process.env["BORD_DE_CONFIANCE"];
  process.env["BORD_DE_CONFIANCE"] = "aucun";

  catalogue = await ouvrirConnexionCatalogue();
  vendeur = await creerUtilisateur("parametres-vendeur");
  voisin = await creerUtilisateur("parametres-voisin");
}, 120_000);

afterAll(async () => {
  if (bordAvant === undefined) delete process.env["BORD_DE_CONFIANCE"];
  else process.env["BORD_DE_CONFIANCE"] = bordAvant;
  await supprimerUtilisateur(vendeur);
  await supprimerUtilisateur(voisin);
  await catalogue.end();
});

describe("Vérifier le mot de passe actuel", () => {
  test("le bon mot de passe est accepté, un faux est refusé", async () => {
    // Contre-test positif D'ABORD : un refus systématique passerait la suite.
    expect(await verdict(vendeur.email, vendeur.motDePasse)).toBe("ok");
    expect(await verdict(vendeur.email, vendeur.motDePasse + "x")).toBe("refuse");
    expect(await verdict(vendeur.email, "")).toBe("refuse");
  }, 240_000);

  test("le mot de passe d'un AUTRE compte ne vaut rien pour celui-ci", async () => {
    // L'adresse vient de la base côté action ; ce test borne la fonction
    // elle-même : un mot de passe valide ailleurs n'ouvre pas ce compte.
    expect(await verdict(vendeur.email, voisin.motDePasse)).toBe("refuse");
  }, 120_000);

  test("aucune session ne survit à la vérification, et celle du vendeur reste vivante", async () => {
    const avant = await sessionsDe(vendeur.userId);
    expect(avant, "Le vendeur de test doit avoir sa propre session.").toBeGreaterThan(0);

    expect(await verdict(vendeur.email, vendeur.motDePasse)).toBe("ok");
    expect(await verdict(vendeur.email, vendeur.motDePasse)).toBe("ok");

    expect(
      await sessionsDe(vendeur.userId),
      "Une vérification a laissé sa session ouverte : chaque geste sensible " +
        "ajoute un appareil vivant au compte.",
    ).toBe(avant);

    // La session du vendeur, elle, n'a pas été touchée par le `signOut` local.
    const { data, error } = await vendeur.client.auth.getUser();
    expect(error).toBeNull();
    expect(data.user?.id).toBe(vendeur.userId);
  }, 180_000);

  test("un budget épuisé refuse MÊME le bon mot de passe", async () => {
    const cible = await creerUtilisateur("parametres-quota");
    try {
      // On épuise le compteur par adresse sans toucher au serveur
      // d'authentification : c'est le compteur, pas Supabase, qu'on éprouve.
      let consommes = 0;
      for (;;) {
        const verdict = await verifierQuotaMotDePasse(cible.email);
        if (!verdict.autorise) break;
        consommes += 1;
        if (consommes > 500) throw new Error("Le quota par adresse ne mord jamais.");
      }
      expect(consommes, "Le budget doit permettre des essais légitimes.").toBeGreaterThan(0);

      expect(await verifierMotDePasseActuel(cible.email, cible.motDePasse)).toBe(
        "trop_de_tentatives",
      );
    } finally {
      await supprimerUtilisateur(cible);
    }
  }, 120_000);
});

describe("Le nom affiché", () => {
  test("le vendeur écrit le sien, borné en base", async () => {
    const { error } = await vendeur.client
      .from("profiles")
      .update({ nom_affiche: "Yanis Test" })
      .eq("id", vendeur.profilId);
    expect(error).toBeNull();

    const [ligne] = await interroger<{ nom_affiche: string | null }>(
      catalogue,
      "select nom_affiche from public.profiles where id = $1",
      [vendeur.profilId],
    );
    expect(ligne?.nom_affiche).toBe("Yanis Test");

    for (const refuse of ["   ", "x".repeat(81)]) {
      const essai = await vendeur.client
        .from("profiles")
        .update({ nom_affiche: refuse })
        .eq("id", vendeur.profilId);
      expect(essai.error?.code, `« ${refuse.slice(0, 10)}… » devait être refusé en base`).toBe("23514");
    }
  }, 60_000);

  test("il n'écrit pas celui d'un autre", async () => {
    const { data, error } = await vendeur.client
      .from("profiles")
      .update({ nom_affiche: "Intrus" })
      .eq("id", voisin.profilId)
      .select("id");
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);

    const [ligne] = await interroger<{ nom_affiche: string | null }>(
      catalogue,
      "select nom_affiche from public.profiles where id = $1",
      [voisin.profilId],
    );
    expect(ligne?.nom_affiche).toBeNull();
  }, 60_000);

  test("l'adresse du profil n'est PAS écrivable par le vendeur", async () => {
    const { error } = await vendeur.client
      .from("profiles")
      .update({ email: "detournee@droplink-test.invalid" })
      .eq("id", vendeur.profilId);
    // 42501 : privilège de colonne refusé. Seul le déclencheur la réécrit.
    expect(error?.code).toBe("42501");
  }, 60_000);
});

describe("L'adresse du profil suit celle du compte", () => {
  test("une adresse EN ATTENTE de confirmation ne remplace rien", async () => {
    await interroger(
      catalogue,
      "update auth.users set email_change = $2, email_change_sent_at = now() where id = $1",
      [voisin.userId, `attente-${Date.now()}@droplink-test.invalid`],
    );
    const [ligne] = await interroger<{ email: string }>(
      catalogue,
      "select email from public.profiles where id = $1",
      [voisin.profilId],
    );
    expect(ligne?.email).toBe(voisin.email);
  }, 60_000);

  test("une adresse CONFIRMÉE est reportée sur le profil", async () => {
    const nouvelle = `confirmee-${Date.now()}@droplink-test.invalid`;
    const { error } = await clientService().auth.admin.updateUserById(voisin.userId, {
      email: nouvelle,
      email_confirm: true,
    });
    expect(error).toBeNull();

    const [ligne] = await interroger<{ email: string }>(
      catalogue,
      "select email from public.profiles where id = $1",
      [voisin.profilId],
    );
    expect(
      ligne?.email,
      "Le profil garde l'ancienne adresse : tout ce qui lit `profiles.email` " +
        "travaille sur une adresse que le compte n'a plus.",
    ).toBe(nouvelle);
  }, 60_000);

  test("le déclencheur n'est appelable par personne", async () => {
    const lignes = await interroger<{ role: string }>(
      catalogue,
      `select r.rolname as role
         from pg_roles r
        where r.rolname in ('anon', 'authenticated', 'public')
          and has_function_privilege(r.oid, 'public.suivre_adresse_du_compte()', 'execute')`,
    );
    expect(lignes).toEqual([]);
  });
});

describe("Voir ses sessions", () => {
  test("le vendeur voit SES sessions, la sienne marquée, et aucune adresse IP", async () => {
    // Une seconde session réelle du même compte : un autre « appareil ».
    const autre = clientAnonyme();
    const { error: erreurConnexion } = await autre.auth.signInWithPassword({
      email: vendeur.email,
      password: vendeur.motDePasse,
    });
    expect(erreurConnexion).toBeNull();

    try {
      const { data, error } = await vendeur.client.rpc("lister_mes_sessions");
      expect(error).toBeNull();
      const lignes = (data ?? []) as Array<Record<string, unknown>>;
      expect(lignes.length, "Deux sessions ouvertes, deux lignes attendues au moins.").toBeGreaterThanOrEqual(2);

      const miennes = lignes.filter((l) => l["cet_appareil"] === true);
      expect(miennes, "Exactement une session doit être « cet appareil ».").toHaveLength(1);

      // Par la BASE : la session marquée est bien celle du jeton de l'appelant.
      const { data: jeton } = await vendeur.client.auth.getSession();
      const idSession = JSON.parse(
        Buffer.from((jeton.session?.access_token ?? "..").split(".")[1] ?? "", "base64url").toString(),
      ).session_id as string;
      expect(miennes[0]?.["id"]).toBe(idSession);

      for (const l of lignes) {
        expect(Object.keys(l).sort()).toEqual(["active_le", "agent", "cet_appareil", "creee_le", "id"]);
      }
    } finally {
      await autre.auth.signOut({ scope: "local" });
    }
  }, 60_000);

  test("il ne voit AUCUNE session d'un autre compte", async () => {
    const sessionsVoisin = await interroger<{ id: string }>(
      catalogue,
      "select id::text as id from auth.sessions where user_id = $1",
      [voisin.userId],
    );
    // Un ensemble vide passe tout : le voisin doit avoir des sessions à cacher.
    expect(sessionsVoisin.length, "Le voisin doit avoir une session pour que le test discrimine.").toBeGreaterThan(0);

    const { data, error } = await vendeur.client.rpc("lister_mes_sessions");
    expect(error).toBeNull();
    const vues = ((data ?? []) as Array<{ id: string }>).map((l) => l.id);
    expect(vues.length, "Le vendeur doit voir au moins la sienne.").toBeGreaterThan(0);
    for (const { id } of sessionsVoisin) expect(vues).not.toContain(id);
  }, 60_000);

  test("un anonyme ne peut pas l'appeler", async () => {
    const { data, error } = await clientAnonyme().rpc("lister_mes_sessions");
    expect(data).toBeNull();
    expect(error?.code).toBe("42501");
  }, 60_000);
});
