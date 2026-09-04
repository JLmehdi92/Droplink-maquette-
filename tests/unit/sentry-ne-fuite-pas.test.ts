import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { masquerLesJetons, optionsSentry } from "@/lib/observabilite/sentry";

/**
 * CE QUI PART CHEZ SENTRY NE DOIT JAMAIS PORTER UNE CAPACITÉ.
 *
 * ⚠️ C'EST LA RAISON POUR LAQUELLE CE RAPPORTEUR A ATTENDU. Une URL `/p/<jeton>`
 * n'est pas une adresse, c'est un DROIT D'ACCÈS immuable à vie. Brancher un
 * rapporteur d'erreurs sans y penser publie chez un tiers les liens privés des
 * clients de nos vendeurs — et rien ne rougit : le produit marche, les écrans
 * répondent, et la fuite est dans un service que personne n'ouvre.
 *
 * LE CONTRÔLE EST FAIT PAR VALEUR, avec des SENTINELLES UNIQUES, jamais par nom
 * de champ. C'est la règle de sécurité du projet, et elle vaut ici plus
 * qu'ailleurs : la forme d'un événement Sentry n'est pas un contrat, elle change
 * avec le SDK. Une garde qui viserait `event.request.url` laisserait passer le
 * même jeton republié sous `breadcrumbs[].data.to` ou sous n'importe quel champ
 * qu'une version future ajoutera.
 */

/** Des valeurs qu'on ne peut pas confondre avec autre chose. */
const JETON = "SNTNL7jQx4Kb2mZpVw9eR";
const JETON_DESABO = "SNTNL0aB1cD2eF3gH4iJ5";
const HACHE = "SNTNLpkce9f8e7d6c5b4a3";
const PORTEUR = "SNTNLbearer1234567890";
const COOKIE = "SNTNLsession9876543210";

const SENTINELLES = [JETON, JETON_DESABO, HACHE, PORTEUR, COOKIE] as const;

/**
 * Un événement dont les sentinelles sont posées PARTOUT, y compris à des
 * endroits que le SDK n'utilise pas aujourd'hui.
 *
 * ⚠️ LES CHAMPS INVENTÉS SONT LE POINT. `diagnostic`, `meta` et un tableau
 * imbriqué ne sont pas des champs Sentry : ils représentent l'endroit où la
 * valeur se retrouvera le jour où le SDK, ou nous, l'y mettrons. *Une valeur
 * voyage sous n'importe quel nom.*
 */
function evenementFarci(): Record<string, unknown> {
  return {
    message: `échec du rendu de https://droplink.fr/p/${JETON}`,
    request: {
      url: `https://droplink.fr/p/${JETON}?x=1`,
      headers: {
        referer: `https://droplink.fr/desabonnement/${JETON_DESABO}`,
        authorization: `Bearer ${PORTEUR}`,
        cookie: `theme=sombre; sb-abcdef-auth-token=${COOKIE}; autre=1`,
      },
    },
    breadcrumbs: [
      { category: "navigation", data: { to: `/p/${JETON}`, from: "/fr/commandes" } },
      { message: `redirection vers /auth/retour?token_hash=${HACHE}&suite=mot-de-passe` },
    ],
    exception: {
      values: [{ value: `TypeError sur /p/${JETON}`, type: "TypeError" }],
    },
    // Des noms qui n'existent pas chez Sentry — et c'est exactement le cas que
    // ce test défend.
    contexts: { diagnostic: { meta: [{ note: `vu sur /p/${JETON}` }] } },
    extra: { commentaire: `Bearer ${PORTEUR}` },
  };
}

/**
 * Toutes les chaînes d'une structure, à plat.
 *
 * ⚠️ ELLE SE PROTÈGE DES CYCLES, et ce n'est pas une précaution théorique :
 * écrite sans, elle a débordé la pile sur le cas cyclique ci-dessous — donc la
 * sonde échouait là où le produit, lui, tenait. Un test qui rougit sur un
 * produit correct fait chercher un défaut à l'endroit où il n'est pas.
 */
function chaines(valeur: unknown, sortie: string[] = [], vus = new WeakSet<object>()): string[] {
  if (typeof valeur === "string") sortie.push(valeur);
  else if (valeur !== null && typeof valeur === "object") {
    if (vus.has(valeur)) return sortie;
    vus.add(valeur);
    for (const v of Object.values(valeur as Record<string, unknown>)) chaines(v, sortie, vus);
  }
  return sortie;
}

const DSN = "https://cle@o0.ingest.sentry.io/1";

describe("Le rapporteur d'erreurs ne transporte aucune capacité", () => {
  test("CONTRE-TEST : les sentinelles SONT présentes avant le masquage", () => {
    /*
     * ⚠️ EN PREMIER, ET IL N'EST PAS DÉCORATIF. Sans lui, « aucune sentinelle
     * dans la sortie » serait aussi vrai d'un événement vide, d'une sentinelle
     * mal recopiée, ou d'un masquage qui jette tout. Une falsification a déjà
     * menti dans le sens rassurant sur ce projet, pour cette raison exacte.
     */
    const avant = chaines(evenementFarci()).join(" | ");
    for (const s of SENTINELLES) {
      expect(avant, `la sentinelle « ${s} » n'est pas dans le jeu d'essai`).toContain(s);
    }
  });

  test("AUCUNE sentinelle ne survit à `beforeSend`, où qu'elle soit posée", () => {
    const options = optionsSentry(DSN);
    expect(options, "aucune option : rien n'est éprouvé").not.toBeNull();

    // On appelle le VRAI filtre, celui que le SDK appellera — pas une copie.
    const filtre = options?.beforeSend;
    expect(typeof filtre).toBe("function");

    const sorti = (filtre as (e: unknown, h: unknown) => unknown)(evenementFarci(), {});
    const apres = chaines(sorti).join(" | ");

    for (const s of SENTINELLES) {
      expect(apres, `« ${s} » est partie chez le tiers`).not.toContain(s);
    }
  });

  test("le masquage laisse de quoi diagnostiquer — sinon autant ne rien rapporter", () => {
    // Masquer large rendrait les traces inutiles, ce qui reviendrait à ne pas
    // avoir de rapporteur du tout. On exige donc que le CHEMIN survive.
    const masque = masquerLesJetons(`échec sur https://droplink.fr/p/${JETON}?x=1`);
    expect(masque).toContain("droplink.fr");
    expect(masque).toContain("/p/[jeton]");
    expect(masque).not.toContain(JETON);
  });

  test("le masquage s'arrête au séparateur, il n'avale pas la suite du message", () => {
    // Un motif glouton emporterait la fin de la phrase et rendrait la trace
    // muette sur ce qui s'est réellement passé.
    const masque = masquerLesJetons(`ouverture de /p/${JETON} puis 500 sur /fr/commandes`);
    expect(masque).toContain("puis 500 sur /fr/commandes");
  });

  test("les fils d'Ariane passent par le même filtre que les événements", () => {
    const options = optionsSentry(DSN);
    const filtre = options?.beforeBreadcrumb;
    expect(typeof filtre, "aucun filtre sur les fils d'Ariane").toBe("function");
    const sorti = (filtre as (f: unknown, h: unknown) => unknown)(
      { category: "navigation", data: { to: `/p/${JETON}` } },
      {},
    );
    expect(chaines(sorti).join(" | ")).not.toContain(JETON);
  });

  test("une structure CYCLIQUE ne bloque pas le processus qui rapporte une panne", () => {
    const cyclique: Record<string, unknown> = { url: `/p/${JETON}` };
    cyclique["soi"] = cyclique;
    const filtre = optionsSentry(DSN)?.beforeSend as (e: unknown, h: unknown) => unknown;
    const sorti = filtre({ contexts: cyclique }, {});
    expect(chaines(sorti).join(" | ")).not.toContain(JETON);
  });

  test("SANS DSN, il n'y a pas d'options du tout — et donc pas de SDK", () => {
    /*
     * `enabled: false` ne suffirait pas : la documentation de Sentry écrit que
     * *setting this to false does not eliminate all instrumentation overhead*.
     * Un produit sans DSN ne doit rien payer, et un déploiement sans la variable
     * doit être silencieux et correct plutôt que bruyant et cassé.
     */
    for (const vide of [undefined, "", "   "]) {
      expect(optionsSentry(vide), `« ${String(vide)} » a produit des options`).toBeNull();
    }
  });

  test("aucune donnée personnelle par défaut, et aucune mesure de performance", () => {
    const o = optionsSentry(DSN);
    // Le produit hache les IP avec un sel ; laisser le rapporteur expédier l'IP
    // brute défairait ce travail par une porte que personne ne regarde.
    expect(o?.sendDefaultPii, "les données personnelles partent par défaut").toBe(false);
    /*
     * ⚠️ EXIGÉ EXPLICITEMENT, PAS HÉRITÉ D'UN DÉFAUT. La documentation de Sentry
     * dit les DEUX choses — « enabled by default for Node.js runtimes » sur une
     * page, « set it to true to activate » sur l'autre. La mesure sur le fil dit
     * que c'est inactif ; mais *une protection qui tient à une ABSENCE n'est pas
     * une protection*, et un jeton nu posé dans une variable locale n'a aucune
     * des formes que le masquage reconnaît.
     */
    expect(
      o?.includeLocalVariables,
      "les variables locales pourraient partir : c'est le seul endroit où un jeton NU voyagerait",
    ).toBe(false);
    expect(o?.tracesSampleRate, "des transactions partent sans qu'on les ait voulues").toBe(0);
  });
});

describe("Le SDK navigateur n'est pas expédié", () => {
  /*
   * ⚠️ CE BLOC INTERROGE LE DÉPÔT, PAS UNE INTENTION. Le budget de `/p/[token]`
   * est de 300 Ko dont 102 de socle : le SDK navigateur en coûterait 30 à 40 à
   * lui seul, sur la page vue une fois, en 4G, depuis un DM. Deux gestes
   * suffiraient à l'y faire entrer sans que personne le remarque — créer
   * `instrumentation-client.ts`, ou envelopper `next.config.ts`.
   */
  const racine = process.cwd();

  test("il n'existe aucun `instrumentation-client`", () => {
    for (const chemin of [
      join(racine, "instrumentation-client.ts"),
      join(racine, "src", "instrumentation-client.ts"),
    ]) {
      let existe = true;
      try {
        readFileSync(chemin);
      } catch {
        existe = false;
      }
      expect(existe, `${chemin} expédierait le SDK navigateur`).toBe(false);
    }
  });

  test("`next.config.ts` n'est pas enveloppé par `withSentryConfig`", () => {
    // Commentaires retirés : la déviation est EXPLIQUÉE en toutes lettres dans
    // le dépôt, et une garde qui chercherait le mot se satisferait de son
    // explication (L-031).
    const source = readFileSync(join(racine, "next.config.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(source, "l'enveloppe injecte les greffons navigateur").not.toContain("withSentryConfig");
  });

  test("`register` n'initialise que les exécutions serveur", () => {
    const source = readFileSync(join(racine, "src", "instrumentation.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(source).toContain('execution === "nodejs"');
    expect(source).toContain('execution === "edge"');
    // Et la sortie sèche quand il n'y a pas de DSN, avant toute accroche.
    expect(source).toMatch(/if \(options === null\) return;/);
  });
});

/**
 * LA PREUVE SUR LE FIL — les OCTETS reçus, pas la valeur rendue par le filtre.
 *
 * ⚠️ LES CONTRÔLES CI-DESSUS APPELLENT `beforeSend` ET REGARDENT SA SORTIE. Ils
 * ne prouvent ni que le SDK l'applique, ni qu'un événement quitte le processus,
 * ni ce qu'il y a VRAIMENT dans la charge. *Un point d'ingestion qui répond 200
 * ne prouve pas qu'il a accepté* (L-024) — et sa réciproque vaut ici : un filtre
 * qui rend un objet propre ne prouve pas que le fil est propre.
 *
 * On monte donc une vraie ingestion locale et on lit ce qui arrive. C'est ce
 * bloc qui a montré, le 04/09/2026, que Sentry attache les LIGNES DE SOURCE
 * autour de la pile (`pre_context`) : une première version de cette sonde
 * écrivait sa sentinelle en littéral et la retrouvait dans les octets. Le
 * défaut était dans la sonde — en production un jeton est une donnée, jamais un
 * littéral — mais rien d'autre n'aurait montré ce champ.
 *
 * ⚠️ LA SENTINELLE EST DONC ASSEMBLÉE À L'EXÉCUTION, jamais écrite en clair.
 */
describe("Ce qui part réellement chez le tiers", () => {
  test("l'enveloppe transmise porte l'erreur, la pile, et AUCUN jeton", async () => {
    const { createServer } = await import("node:http");
    const Module = await import("@sentry/nextjs");
    const Sentry = (
      typeof (Module as { captureException?: unknown }).captureException === "function"
        ? Module
        : (Module as unknown as { default: unknown }).default
    ) as typeof import("@sentry/nextjs");

    const recus: string[] = [];
    const serveur = createServer((req, res) => {
      const morceaux: Buffer[] = [];
      req.on("data", (c: Buffer) => morceaux.push(c));
      req.on("end", () => {
        recus.push(Buffer.concat(morceaux).toString("utf8"));
        res.writeHead(200, { "content-type": "application/json" });
        res.end('{"id":"0"}');
      });
    });
    await new Promise<void>((r) => serveur.listen(0, "127.0.0.1", () => r()));
    const adresse = serveur.address();
    const port = typeof adresse === "object" && adresse !== null ? adresse.port : 0;

    // Assemblé : absent de la source de ce fichier, donc absent de `pre_context`.
    const jeton = ["SNTNL", "fil7jQx4Kb", "2mZpVw9eR"].join("");

    try {
      Sentry.init(optionsSentry(`http://cle0123456789abcdef@127.0.0.1:${port}/1`) ?? {});

      // Une VARIABLE LOCALE porte le jeton nu : c'est le cas que la
      // documentation de Sentry décrit de deux façons contradictoires.
      const rendreLaPage = (): never => {
        const jetonDeLaCommande = jeton;
        throw new Error(`échec du rendu de https://droplink.fr/p/${jetonDeLaCommande}?x=1`);
      };

      try {
        rendreLaPage();
      } catch (e) {
        Sentry.captureException(e);
      }
      await Sentry.flush(8000);
      await new Promise((r) => setTimeout(r, 300));
    } finally {
      serveur.close();
    }

    const corps = recus.join("\n");

    // CONTRE-TESTS D'ABORD. Sans eux, « le jeton n'y est pas » serait aussi vrai
    // d'une enveloppe vide ou d'un SDK qui n'a rien envoyé du tout.
    expect(recus.length, "aucune enveloppe : rien n'est éprouvé").toBeGreaterThan(0);
    expect(corps, "l'enveloppe ne porte pas notre erreur").toContain("échec du rendu de");
    expect(corps, "aucune pile : la trace serait inexploitable").toContain("rendreLaPage");
    expect(corps, "le filtre n'a pas tourné sur le fil").toContain("/p/[jeton]");

    // LE CONTRÔLE QUI COMPTE.
    expect(corps, "le jeton est parti chez le tiers, dans les octets").not.toContain(jeton);
    // Et les variables locales ne voyagent pas : un jeton nu n'a aucune des
    // formes que le masquage reconnaît, c'est donc ici qu'il est arrêté.
    expect(corps, "des variables locales sont parties").not.toContain('"vars"');
  }, 20_000);
});
