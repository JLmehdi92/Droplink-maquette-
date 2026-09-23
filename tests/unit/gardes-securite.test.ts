import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { NextRequest } from "next/server";
import { secretDeTacheValide } from "@/lib/taches/secret";
import { memeOrigine } from "@/lib/auth/meme-origine";
import {
  LONGUEUR_MINIMALE,
  MotDePasse,
  OCTETS_MAXIMUM,
  longueurEnOctets,
  refusDuMotDePasse,
} from "@/lib/auth/mot-de-passe";

/**
 * LES TROIS GARDES QU'AUCUN TEST N'EXERÇAIT — mesuré le 23/09/2026.
 *
 * La couverture `unit` + `rls` (`vitest --coverage`, 1 931 tests) rendait 0 %
 * sur ces trois fichiers. Les seules mentions dans `tests/` étaient TEXTUELLES :
 * `deploiement.test.ts` cherche le MOT `secretDeTacheValide` dans les routes —
 * ce qui prouve qu'elle est appelée, jamais qu'elle refuse quoi que ce soit
 * (L-018 : constater qu'une déclaration existe ne prouve pas que son absence
 * bloque). Ils ne sont pas anecdotiques :
 *
 *   - `secretDeTacheValide` est la SEULE garde des deux routes planifiées. L'une
 *     interroge le fournisseur de suivi, et chaque interrogation se paie ;
 *   - `memeOrigine` est la garde anti-CSRF de la déconnexion et des gestes
 *     groupés sur les commandes (archiver, désarchiver par lot) ;
 *   - `refusDuMotDePasse` décide de ce qu'on accepte comme mot de passe, aux
 *     TROIS endroits où l'on en pose un.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. LE SECRET DES TÂCHES PLANIFIÉES
// ─────────────────────────────────────────────────────────────────────────────

const SECRET = "s3cr3t-de-cadence-bien-long";

function requeteAvec(autorisation: string | null): Request {
  const entetes = new Headers();
  if (autorisation !== null) entetes.set("authorization", autorisation);
  return new Request("https://droplink.test/api/suivi/cadence", { headers: entetes });
}

describe("Le secret des tâches planifiées", () => {
  const avant = process.env["CRON_SECRET"];

  beforeEach(() => {
    process.env["CRON_SECRET"] = SECRET;
  });
  afterEach(() => {
    if (avant === undefined) delete process.env["CRON_SECRET"];
    else process.env["CRON_SECRET"] = avant;
  });

  test("CONTRE-TEST : le bon secret passe, avec ou sans « Bearer »", () => {
    // Sans lui, une garde qui refuserait tout passerait les contrôles suivants à
    // 100 % — et la cadence ne tournerait plus jamais, sans une seule erreur.
    expect(secretDeTacheValide(requeteAvec(`Bearer ${SECRET}`))).toBe(true);
    expect(secretDeTacheValide(requeteAvec(SECRET))).toBe(true);
  });

  test("⚠️ SECRET ABSENT + EN-TÊTE ABSENT : la porte reste FERMÉE", () => {
    /*
     * LE CONTRÔLE DISCRIMINANT DE CE BLOC.
     *
     * Sans le plancher de longueur, un secret non configuré vaut la chaîne vide ;
     * une requête SANS en-tête fournit, elle aussi, la chaîne vide. Deux tampons
     * vides de même longueur : `timingSafeEqual` rend VRAI. La route qui coûte de
     * l'argent serait alors ouverte à quiconque ne s'identifie PAS — c'est-à-dire
     * à tout le monde, et précisément le jour où la configuration a été oubliée.
     */
    delete process.env["CRON_SECRET"];
    expect(secretDeTacheValide(requeteAvec(null))).toBe(false);
    expect(secretDeTacheValide(requeteAvec(""))).toBe(false);
    expect(secretDeTacheValide(requeteAvec("Bearer "))).toBe(false);
  });

  test("un secret trop court est refusé, même fourni correctement", () => {
    // Un secret de huit caractères se devine ; mieux vaut une cadence arrêtée et
    // une alerte qu'une porte qu'on croit fermée.
    process.env["CRON_SECRET"] = "court123";
    expect(secretDeTacheValide(requeteAvec("Bearer court123"))).toBe(false);
  });

  test("un secret faux, un secret tronqué, un secret prolongé : refusés", () => {
    expect(secretDeTacheValide(requeteAvec("Bearer mauvais-secret-de-meme-lo"))).toBe(false);
    expect(secretDeTacheValide(requeteAvec(`Bearer ${SECRET.slice(0, -1)}`))).toBe(false);
    expect(secretDeTacheValide(requeteAvec(`Bearer ${SECRET}x`))).toBe(false);
  });

  test("des longueurs d'octets différentes ne font pas lever la comparaison", () => {
    // `timingSafeEqual` LÈVE sur deux tampons de tailles différentes. Une levée
    // non rattrapée rendrait 500 — et un 500 distingue « mauvais secret » de
    // « route absente », ce que le 404 de la route est censé cacher.
    const memeNombreDeCaracteres = "é".repeat(SECRET.length); // 2 octets par caractère
    expect(() =>
      secretDeTacheValide(requeteAvec(`Bearer ${memeNombreDeCaracteres}`)),
    ).not.toThrow();
    expect(secretDeTacheValide(requeteAvec(`Bearer ${memeNombreDeCaracteres}`))).toBe(false);
  });

  test("les blancs autour du secret configuré sont retirés", () => {
    // Un secret collé dans un tableau de bord emporte souvent un saut de ligne.
    process.env["CRON_SECRET"] = `  ${SECRET}\n`;
    expect(secretDeTacheValide(requeteAvec(`Bearer ${SECRET}`))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. LA MÊME ORIGINE — LA GARDE ANTI-CSRF
// ─────────────────────────────────────────────────────────────────────────────

/** La fonction ne lit que des en-têtes : c'est tout ce qu'on lui donne. */
function requeteOrigine(entetes: Record<string, string>): NextRequest {
  return { headers: new Headers(entetes) } as unknown as NextRequest;
}

describe("La vérification de même origine", () => {
  test("CONTRE-TEST : une requête de notre propre page passe", () => {
    expect(
      memeOrigine(requeteOrigine({ origin: "https://droplink.fr", host: "droplink.fr" })),
    ).toBe(true);
    expect(
      memeOrigine(requeteOrigine({ origin: "http://localhost:3000", host: "localhost:3000" })),
    ).toBe(true);
  });

  test("⚠️ UN HÔTE QUI CONTIENT LE NÔTRE N'EST PAS LE NÔTRE", () => {
    /*
     * LE CONTRÔLE DISCRIMINANT DE CE BLOC. Une comparaison par `includes` ou
     * `endsWith` — le réflexe — accepterait ces origines. Chacune est un domaine
     * qu'un attaquant peut acheter, et d'où il pourrait déclencher la
     * déconnexion ou l'archivage par lot des commandes d'un vendeur connecté.
     */
    for (const origine of [
      "https://droplink.fr.pirate.net",
      "https://pirate-droplink.fr",
      "https://droplink.fr@pirate.net",
    ]) {
      expect(memeOrigine(requeteOrigine({ origin: origine, host: "droplink.fr" })), origine).toBe(
        false,
      );
    }
  });

  test("le PORT compte : une autre application sur la même machine est une autre origine", () => {
    expect(
      memeOrigine(requeteOrigine({ origin: "http://localhost:3001", host: "localhost:3000" })),
    ).toBe(false);
  });

  test("sans en-tête Origin, on refuse — on ne devine pas", () => {
    // Un formulaire soumis par un navigateur moderne envoie toujours Origin sur
    // un POST. Son absence n'est pas « probablement nous ».
    expect(memeOrigine(requeteOrigine({ host: "droplink.fr" }))).toBe(false);
  });

  test("« Origin: null » (iframe isolée, fichier local) est refusé sans lever", () => {
    const requete = requeteOrigine({ origin: "null", host: "droplink.fr" });
    expect(() => memeOrigine(requete)).not.toThrow();
    expect(memeOrigine(requete)).toBe(false);
  });

  test("sans en-tête Host, on refuse", () => {
    expect(memeOrigine(requeteOrigine({ origin: "https://droplink.fr" }))).toBe(false);
    expect(memeOrigine(requeteOrigine({ origin: "https://droplink.fr", host: "" }))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. LES RÈGLES DU MOT DE PASSE
// ─────────────────────────────────────────────────────────────────────────────

describe("Les règles du mot de passe", () => {
  const EMAIL = "wassim.vendeur@exemple.fr";

  test("CONTRE-TEST : un bon mot de passe n'a aucun refus", () => {
    expect(refusDuMotDePasse("cheval-agrafe-batterie", EMAIL)).toEqual([]);
    expect(MotDePasse.safeParse("cheval-agrafe-batterie").success).toBe(true);
  });

  test("la borne basse est EXACTE : 11 refusé, 12 accepté", () => {
    expect(LONGUEUR_MINIMALE).toBe(12);
    expect(refusDuMotDePasse("a".repeat(11), EMAIL)).toContain("trop_court");
    expect(refusDuMotDePasse("a".repeat(12), EMAIL)).not.toContain("trop_court");
  });

  test("⚠️ LA BORNE HAUTE SE COMPTE EN OCTETS, PAS EN CARACTÈRES", () => {
    /*
     * LE CONTRÔLE DISCRIMINANT DE CE BLOC. Le hachage côté fournisseur TRONQUE
     * au-delà de 72 octets, en silence : tout ce qui dépasse n'est pas vérifié à
     * la connexion. Trente-sept « é » font 37 caractères mais 74 octets — une
     * borne écrite en `.length` les laisserait passer, et deux mots de passe qui
     * ne diffèrent qu'après le 72e octet ouvriraient le même compte.
     */
    expect(OCTETS_MAXIMUM).toBe(72);
    const accentue = "é".repeat(37);
    expect(accentue.length).toBeLessThan(OCTETS_MAXIMUM);
    expect(longueurEnOctets(accentue)).toBe(74);
    expect(refusDuMotDePasse(accentue, EMAIL)).toContain("trop_long");
    expect(MotDePasse.safeParse(accentue).success).toBe(false);

    // Bornes exactes en octets : 72 passe, 73 non.
    expect(refusDuMotDePasse("a".repeat(72), EMAIL)).not.toContain("trop_long");
    expect(refusDuMotDePasse("a".repeat(73), EMAIL)).toContain("trop_long");
  });

  test("un mot de passe qui contient l'adresse est refusé, casse comprise", () => {
    expect(refusDuMotDePasse("Wassim.Vendeur-2026!", EMAIL)).toContain("contient_email");
  });

  test("une partie locale de moins de quatre caractères n'est pas cherchée", () => {
    // « ab » se trouverait dans la moitié des mots de passe du dictionnaire :
    // refuser sur si peu serait une règle qui refuse au hasard.
    expect(refusDuMotDePasse("abracadabra-solide", "ab@exemple.fr")).not.toContain(
      "contient_email",
    );
  });

  test("une adresse sans arobase ne fait pas lever", () => {
    expect(() => refusDuMotDePasse("cheval-agrafe-batterie", "pas-une-adresse")).not.toThrow();
  });

  test("les refus se CUMULENT — un seul message à la fois cacherait les autres", () => {
    expect(refusDuMotDePasse("wassim", "wassim@exemple.fr")).toEqual(
      expect.arrayContaining(["trop_court", "contient_email"]),
    );
  });

  test("⚠️ LES DEUX VALIDATEURS S'ACCORDENT sur la longueur", () => {
    /*
     * Il y a DEUX validateurs : `MotDePasse` (Zod) et `refusDuMotDePasse`. Les
     * trois chemins qui posent un mot de passe — inscription, réinitialisation,
     * changement — appellent les deux, vérifié le 23/09/2026. S'ils divergeaient
     * sur la longueur, l'écran afficherait « trop court » pour un mot de passe
     * que l'autre accepte, ou l'inverse. On éprouve chaque longueur autour des
     * deux bornes.
     */
    /*
     * ⚠️ ET EN CARACTÈRES MULTI-OCTETS, SINON CE CONTRÔLE NE PROUVE RIEN DE LA
     * BORNE HAUTE. Sa première version n'éprouvait que des « a » — un octet par
     * caractère, donc octets et caractères confondus. Falsifié le 23/09/2026 :
     * la borne de `refusDuMotDePasse` repassée en `.length`, ce contrôle restait
     * VERT alors que les deux validateurs divergeaient désormais sur tout texte
     * accentué. « é » (2 octets) et « 你 » (3 octets) séparent les deux mondes.
     */
    for (const motif of ["a", "é", "你"]) {
      for (const n of [0, 1, 11, 12, 13, 23, 24, 25, 36, 37, 71, 72, 73, 100]) {
        const valeur = motif.repeat(n);
        const refusLongueur = refusDuMotDePasse(valeur, EMAIL).some(
          (r) => r === "trop_court" || r === "trop_long",
        );
        expect(
          MotDePasse.safeParse(valeur).success,
          `${n} × « ${motif} » (${longueurEnOctets(valeur)} octets)`,
        ).toBe(!refusLongueur);
      }
    }
  });
});
