import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { promouvoirAdmin } from "../aide/admin";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import {
  clientAnonyme,
  creerUtilisateur,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";
import { compterDoublons, listerDoublons, type GroupeDoublon } from "@/lib/audit/doublons";

/**
 * LES COMPTES EN DOUBLON — décision de Wassim, 20/09/2026 : « faut que la feature soit
 * vraiment parfaite quand elle va détecter les doublons, aucune erreur ».
 *
 * « Aucune erreur » a DEUX sens, et la suite éprouve les deux :
 *   - aucune écriture équivalente d'un même identifiant ne doit échapper (faux négatif) ;
 *   - aucun lien qui ne désigne pas un compte, aucun indicatif deviné, ne doit rapprocher
 *     deux vendeurs (faux positif).
 * Puis le comportement réel sur de vrais comptes authentifiés : regroupement, trace, refus.
 */

let catalogue: Client;
let admin: UtilisateurDeTest;
const vendeurs: Record<string, UtilisateurDeTest> = {};

/** Un suffixe propre à ce passage : la base de tests porte d'autres boutiques. */
const S = Date.now().toString(36);
const NUMERO = `3361${String(Date.now()).slice(-7)}`;
const IP = "empreinte-doublons-0123456789abcdef";

async function identifiant(lien: string | null): Promise<string | null> {
  const r = await interroger<{ i: string | null }>(catalogue, "select public.identifiant_public($1) as i", [lien]);
  return r[0]?.i ?? null;
}

beforeAll(async () => {
  catalogue = await ouvrirConnexionCatalogue();
  admin = await creerUtilisateur("doub-admin");
  await promouvoirAdmin(catalogue, admin);
  for (const cle of ["a", "b", "c", "d", "e", "f"]) {
    vendeurs[cle] = await creerUtilisateur(`doub-${cle}`);
  }
  const poser = async (cle: string, colonnes: Record<string, string>): Promise<void> => {
    const v = vendeurs[cle];
    if (v === undefined) throw new Error(`vendeur ${cle} absent`);
    const noms = Object.keys(colonnes);
    await interroger(
      catalogue,
      `update public.shops set ${noms.map((n, i) => `${n} = $${i + 2}`).join(", ")} where id = $1`,
      [v.shopId, ...noms.map((n) => colonnes[n])],
    );
  };
  // A et B : le même Instagram, écrit de deux façons.
  await poser("a", { instagram_url: `https://instagram.com/Doublon.${S}` });
  await poser("b", { instagram_url: `https://www.instagram.com/doublon.${S}/?igsh=zz9` });
  // C et D : le même numéro WhatsApp, par deux services.
  await poser("c", { whatsapp_url: `https://wa.me/${NUMERO}` });
  await poser("d", { whatsapp_url: `https://api.whatsapp.com/send?phone=${NUMERO}&text=Bonjour` });
  // E : son propre Instagram, RECOPIÉ dans le champ « site » — pas un doublon de lui-même.
  await poser("e", {
    instagram_url: `https://instagram.com/seul.${S}`,
    site_url: `https://instagram.com/seul.${S}`,
  });
  // F : le numéro de C SANS indicatif — aucun indicatif n'est deviné, donc aucun rapprochement.
  await poser("f", { whatsapp_url: `https://wa.me/0${NUMERO.slice(2)}` });
}, 180_000);

afterAll(async () => {
  await supprimerUtilisateur(admin);
  for (const v of Object.values(vendeurs)) await supprimerUtilisateur(v);
  await catalogue.end();
});

describe("L'identifiant d'un lien — aucune écriture équivalente n'échappe", () => {
  const EQUIVALENTS: ReadonlyArray<readonly [string, readonly string[]]> = [
    [
      "instagram:maison.nova",
      [
        "https://instagram.com/maison.nova",
        "https://instagram.com/Maison.Nova",
        "https://www.instagram.com/maison.nova/",
        "https://instagram.com/maison.nova?igsh=abc123",
        "http://m.instagram.com/maison.nova",
        "https://instagram.com/@maison.nova",
        "https://instagram.com/_u/maison.nova",
        "https://instagram.com/stories/maison.nova/3141592",
        "  HTTPS://WWW.INSTAGRAM.COM/MAISON.NOVA  ",
        "https://instagr.am/maison.nova",
        "https://instagram.com/maison.nova#grille",
        "https://instagram.com/%40maison.nova",
      ],
    ],
    [
      "tiktok:maison.nova",
      [
        "https://tiktok.com/@maison.nova",
        "https://www.tiktok.com/@Maison.Nova?lang=fr",
        "https://m.tiktok.com/@maison.nova/",
        "https://www.tiktok.com/%40maison.nova",
        // Revue du 20/09/2026 : deux préfixes empilés ne retiraient que le premier.
        "https://www.m.tiktok.com/@maison.nova",
      ],
    ],
    [
      "whatsapp:33612345678",
      [
        "https://wa.me/33612345678",
        "https://wa.me/+33612345678",
        "https://wa.me/0033612345678",
        "https://wa.me/33612345678?text=salut",
        "https://wa.me/c/33612345678",
        "https://api.whatsapp.com/send?phone=33612345678&text=Bonjour",
        "https://api.whatsapp.com/send?text=x&phone=%2B33612345678",
        "https://web.whatsapp.com/send?phone=33612345678",
      ],
    ],
    [
      "site:laplanque-shop.com",
      [
        "https://laplanque-shop.com",
        "https://www.laplanque-shop.com/",
        "https://LaPlanque-Shop.com/?utm_source=ig&fbclid=x",
        "https://laplanque-shop.com.:443/#haut",
        // Un « ? » littéral DANS la requête : la requête commence au PREMIER, pas au dernier.
        "https://laplanque-shop.com/?utm_source=ig?suite",
      ],
    ],
    ["site:linktr.ee/maisonnova", ["https://linktr.ee/MaisonNova", "https://linktr.ee/maisonnova/"]],
    ["site:facebook.com/profile.php?id=42", ["https://facebook.com/profile.php?id=42&ref=bookmarks"]],
  ];

  for (const [attendu, liens] of EQUIVALENTS) {
    test(`${attendu} : ${liens.length} écritures, un seul identifiant`, async () => {
      for (const lien of liens) {
        expect(await identifiant(lien), lien).toBe(attendu);
      }
    });
  }
});

describe("Un lien qui ne désigne pas un compte ne rapproche personne", () => {
  const MUETS: readonly (string | null)[] = [
    null,
    "",
    "   ",
    "pas une adresse",
    "https://instagram.com/",
    "https://instagram.com/p/Cxyz123/",
    "https://instagram.com/reel/Cabc/",
    "https://instagram.com/explore/tags/mode",
    // Revue du 20/09/2026 : un « temps fort » ne porte AUCUN nom de compte, et il rendait
    // « instagram:highlights » — le même identifiant pour tous les vendeurs qui en partagent un.
    "https://instagram.com/stories/highlights/17868975551234567/",
    "https://www.instagram.com/stories/highlights/",
    "https://instagram.com/direct/inbox/",
    "https://instagram.com/directory/profiles/",
    "https://instagram.com/privacy/checks/",
    "https://tiktok.com/",
    "https://tiktok.com/discover/mode",
    "https://vm.tiktok.com/ZMabc123/",
    "https://wa.me/",
    "https://wa.me/message/ABCDEF123",
    "https://wa.me/1234",
    "https://api.whatsapp.com/send?text=bonjour",
    "https://chat.whatsapp.com/Invitation123",
    "https://linktr.ee",
    "https://www.vinted.fr/",
    "https://facebook.com",
    "https://l.instagram.com/?u=https://x.com",
  ];
  for (const lien of MUETS) {
    test(`« ${String(lien)} » → aucun identifiant`, async () => {
      expect(await identifiant(lien)).toBeNull();
    });
  }
});

describe("Deux identifiants proches restent distincts — rien n'est deviné", () => {
  const PAIRES: ReadonlyArray<readonly [string, string, string]> = [
    ["deux réseaux", "https://instagram.com/maison.nova", "https://tiktok.com/@maison.nova"],
    ["un caractère de plus", "https://instagram.com/maison.nova", "https://instagram.com/maison.nova2"],
    ["aucun indicatif deviné", "https://wa.me/33612345678", "https://wa.me/0612345678"],
    ["un chemin de plus", "https://laplanque-shop.com", "https://laplanque-shop.com/fr"],
    ["une requête qui désigne un autre profil", "https://facebook.com/profile.php?id=1", "https://facebook.com/profile.php?id=2"],
    ["deux pages d'une même plateforme", "https://linktr.ee/a.boutique", "https://linktr.ee/b.boutique"],
    ["un sous-domaine", "https://shop.laplanque.com", "https://laplanque.com"],
  ];
  for (const [nom, gauche, droite] of PAIRES) {
    test(nom, async () => {
      const g = await identifiant(gauche);
      const d = await identifiant(droite);
      // UN ENSEMBLE VIDE PASSE TOUT : deux NULL seraient « différents » sans rien prouver.
      expect(g, gauche).not.toBeNull();
      expect(d, droite).not.toBeNull();
      expect(g).not.toBe(d);
    });
  }
});

describe("Sur de vrais comptes", () => {
  const miens = (groupes: readonly GroupeDoublon[]): GroupeDoublon[] => {
    const ids = new Set(Object.values(vendeurs).map((v) => v.profilId));
    return groupes.filter((g) => g.comptes.some((c) => ids.has(c.id)));
  };

  test("CONTRE-TEST POSITIF : les deux doublons posés sont trouvés, avec exactement leurs comptes", async () => {
    const groupes = miens(await listerDoublons(admin.client, IP));
    const insta = groupes.find((g) => g.genre === "instagram" && g.valeur === `doublon.${S}`);
    const wa = groupes.find((g) => g.genre === "whatsapp" && g.valeur === NUMERO);
    expect(insta, "le doublon Instagram n'a pas été trouvé").toBeDefined();
    expect(wa, "le doublon WhatsApp n'a pas été trouvé").toBeDefined();
    expect(insta?.comptes.map((c) => c.id).sort()).toEqual(
      [vendeurs["a"]?.profilId, vendeurs["b"]?.profilId].sort(),
    );
    expect(wa?.comptes.map((c) => c.id).sort()).toEqual(
      [vendeurs["c"]?.profilId, vendeurs["d"]?.profilId].sort(),
    );
    expect(insta?.comptes.every((c) => c.email.endsWith("@droplink-test.invalid"))).toBe(true);
  });

  test("un compte n'est pas le doublon de lui-même, et un numéro sans indicatif n'est rapproché de rien", async () => {
    const groupes = miens(await listerDoublons(admin.client, IP));
    const ids = groupes.flatMap((g) => g.comptes.map((c) => c.id));
    expect(ids).not.toContain(vendeurs["e"]?.profilId);
    expect(ids).not.toContain(vendeurs["f"]?.profilId);
    // Aucun groupe n'a moins de deux comptes, et aucun compte n'y figure deux fois.
    for (const g of groupes) {
      const uniques = new Set(g.comptes.map((c) => c.id));
      expect(uniques.size).toBe(g.comptes.length);
      expect(g.comptes.length).toBeGreaterThanOrEqual(2);
    }
  });

  test("un compte suspendu reste dans la liste, avec son statut", async () => {
    await interroger(catalogue, "update public.profiles set status = 'suspended' where id = $1", [
      vendeurs["b"]?.profilId,
    ]);
    try {
      const groupes = miens(await listerDoublons(admin.client, IP));
      const b = groupes
        .flatMap((g) => g.comptes)
        .find((c) => c.id === vendeurs["b"]?.profilId);
      expect(b?.statut).toBe("suspended");
    } finally {
      await interroger(catalogue, "update public.profiles set status = 'active' where id = $1", [
        vendeurs["b"]?.profilId,
      ]);
    }
  });

  test("le compte et la liste disent la même chose", async () => {
    const groupes = await listerDoublons(admin.client, IP);
    const nombres = await compterDoublons(admin.client);
    // La liste s'arrête à 100 identifiants ; la base de tests en porte beaucoup moins.
    expect(groupes.length).toBeLessThan(100);
    expect(nombres.identifiants).toBe(groupes.length);
    expect(nombres.comptes).toBe(new Set(groupes.flatMap((g) => g.comptes.map((c) => c.id))).size);
    expect(nombres.identifiants).toBeGreaterThanOrEqual(2);
  });

  test("lister écrit UNE trace, AVEC l'empreinte ; compter n'en écrit aucune", async () => {
    const compter = async (): Promise<number> => {
      const r = await interroger<{ n: string }>(
        catalogue,
        "select count(*) as n from public.admin_audit_log where admin_id = $1 and action = 'comptes.doublons'",
        [admin.profilId],
      );
      return Number(r[0]?.n ?? 0);
    };
    const avant = await compter();
    await compterDoublons(admin.client);
    expect(await compter(), "compter a écrit une trace").toBe(avant);
    await listerDoublons(admin.client, IP);
    expect(await compter()).toBe(avant + 1);
    const derniere = await interroger<{ ip_hash: string; resource_type: string }>(
      catalogue,
      `select ip_hash, resource_type from public.admin_audit_log
        where admin_id = $1 and action = 'comptes.doublons' order by occurred_at desc limit 1`,
      [admin.profilId],
    );
    expect(derniere[0]?.ip_hash).toBe(IP);
    expect(derniere[0]?.resource_type).toBe("profiles");
  });

  test("un vendeur reçoit le même refus qu'une surface inexistante, et rien n'est tracé", async () => {
    const v = vendeurs["a"];
    if (v === undefined) throw new Error("vendeur a absent");
    const avant = await interroger<{ n: string }>(
      catalogue,
      "select count(*) as n from public.admin_audit_log where action = 'comptes.doublons'",
    );
    const liste = await v.client.rpc("lister_doublons_admin", { p_ip_hash: IP });
    const nombres = await v.client.rpc("compter_doublons_admin");
    expect(liste.error?.code).toBe("DL031");
    expect(nombres.error?.code).toBe("DL031");
    const apres = await interroger<{ n: string }>(
      catalogue,
      "select count(*) as n from public.admin_audit_log where action = 'comptes.doublons'",
    );
    expect(apres[0]?.n).toBe(avant[0]?.n);
  });

  test("un anonyme ne peut rien appeler, et les deux fonctions internes ne sont accordées à personne", async () => {
    const anon = clientAnonyme();
    for (const [nom, args] of [
      ["lister_doublons_admin", { p_ip_hash: IP }],
      ["compter_doublons_admin", {}],
      ["identifiant_public", { p_lien: "https://instagram.com/x" }],
      ["identifiants_des_comptes", {}],
    ] as const) {
      const { error } = await anon.rpc(nom, args);
      expect(error, `${nom} répond à un anonyme`).not.toBeNull();
    }
    for (const [nom, args] of [
      ["identifiant_public", { p_lien: "https://instagram.com/x" }],
      ["identifiants_des_comptes", {}],
    ] as const) {
      const { error } = await admin.client.rpc(nom, args);
      expect(error, `${nom} répond à un compte authentifié`).not.toBeNull();
    }
  });
});
