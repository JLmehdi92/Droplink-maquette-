import { NextResponse, type NextRequest } from "next/server";
import { estLangueSupportee } from "@/i18n/config";
import { executerGesteDeListe } from "@/lib/commandes/geste-liste";

/**
 * LES GESTES DE LA LISTE DES COMMANDES, reçus par un POST NATIF.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI UN ROUTE HANDLER, ALORS QUE LA RÈGLE DIT « SERVER ACTIONS »
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Parce que ces trois gestes reviennent SUR LA MÊME ROUTE, et qu'en build de
 * production le routeur client de Next JETTE une navigation qui garde le même
 * chemin. Mesuré : la base était modifiée, l'écran gardait ses lignes,
 * indéfiniment, et l'URL ne bougeait même pas. Le détail et les treize pistes
 * fermées par mesure vivent dans `@/lib/commandes/geste-liste`.
 *
 * Déviation du même ordre que celle déjà accordée à l'export CSV, et pour une
 * raison de même nature : ce que le produit doit faire ici — rendre une vraie
 * redirection HTTP que le NAVIGATEUR suit — une Server Action ne sait pas le
 * faire.
 *
 * ⚠️ CETTE ROUTE VIT SOUS `[locale]`, PAS SOUS `/api`, ET C'EST DÉLIBÉRÉ. Le
 * matcher du middleware exclut `/api` : une route `/api/commandes/geste` ne
 * serait couverte par RIEN, et son préfixe donnerait l'impression contraire à
 * qui la relit. Ici, le middleware s'applique comme pour n'importe quel écran —
 * la session est rafraîchie avant nous. C'est de la défense en profondeur : les
 * deux gardes ci-dessous restent obligatoires et ne dépendent pas de lui.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DEUX GARDES, ET AUCUNE N'EST FACULTATIVE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. L'ORIGINE. Une Server Action est protégée du CSRF par Next lui-même, qui
 *    compare `Origin` à l'hôte. En quittant les Server Actions, ON PERD CETTE
 *    PROTECTION — et un formulaire posté depuis un site tiers archiverait les
 *    commandes d'un vendeur connecté sans qu'il clique sur quoi que ce soit.
 *    La même comparaison est donc refaite ici, explicitement.
 *
 *    ⚠️ ELLE ÉCHOUE FERMÉE : une requête SANS `Origin` est refusée. Tout
 *    navigateur envoie cet en-tête sur un POST ; ne pas l'exiger reviendrait à
 *    laisser une porte ouverte à qui sait simplement l'omettre — et « ce serait
 *    ouvert si quelqu'un omettait X » n'est pas une protection.
 *
 * 2. LA SESSION, vérifiée par `executerGesteDeListe`, qui la revérifie pour
 *    chaque geste. Elle n'est pas déléguée au middleware : le middleware ne
 *    protège aucune donnée à lui seul.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * LA RÉPONSE EST UN `303`, jamais un `307`. Un `307` conserve la méthode : le
 * navigateur reposterait le formulaire sur la liste, et chaque rafraîchissement
 * rejouerait l'archivage. `303 See Other` impose un `GET` — c'est le motif
 * POST-redirect-GET, et c'est précisément ce qu'il existe pour empêcher.
 */

/**
 * L'origine de la requête est-elle la nôtre ?
 *
 * On compare `Origin` à l'hôte de la requête, comme le fait Next pour ses
 * propres Server Actions.
 *
 * ⚠️ `x-forwarded-host` N'EST PLUS LU DU TOUT, et c'est une correction.
 *
 * Il passait avant `host`, inconditionnellement, avec pour raison « derrière un
 * proxy, `host` porte le nom interne ». Mais rien ne distingue un
 * `x-forwarded-host` posé par notre bord d'un `x-forwarded-host` posé par
 * l'appelant : envoyer cet en-tête ET un `Origin` assorti faisait comparer la
 * garde à elle-même, et elle passait.
 *
 * C'est le défaut déjà résolu pour l'adresse IP dans `lib/limitation/empreinte`,
 * mot pour mot : « la protection tenait à ce que l'attaquant se donne la peine
 * de poser un en-tête qu'il n'a aucune raison de poser ».
 *
 * ⚠️ LA PREMIÈRE CORRECTION NE SUFFISAIT PAS, et c'est la sonde qui l'a dit.
 * Elle ne lisait `x-forwarded-host` qu'en mode `BORD_DE_CONFIANCE=xff` — or ce
 * réglage existe pour `x-forwarded-for`, un AUTRE en-tête, et `xff` est
 * justement le mode des sondes locales : la requête forgée passait encore.
 * Faire dépendre une garde CSRF d'un réglage qui parle d'adresses IP, c'était
 * relier deux choses qui n'ont en commun que le préfixe de leur nom.
 *
 * On ne le lit donc plus. Cloudflare — notre cible — préserve `Host` et ne pose
 * pas cet en-tête ; aucun déploiement prévu n'en a besoin. Le jour où un bord
 * réécrirait `Host`, ce serait à lui de se déclarer, explicitement, ici.
 *
 * ⚠️ CE N'ÉTAIT PAS EXPLOITABLE DEPUIS UN NAVIGATEUR — `x-forwarded-host` n'est
 * pas un en-tête sûr au sens CORS, donc un formulaire ne peut pas le poser et
 * un `fetch` déclencherait un prévol qu'aucun `OPTIONS` ne sert. On le corrige
 * quand même : c'est la SEULE barrière qui restait devant la construction de
 * redirection, et deux protections qui ne tiennent qu'ensemble finissent par
 * tomber ensemble.
 */
function memeOrigine(requete: NextRequest): boolean {
  const origine = requete.headers.get("origin");
  if (origine === null) return false;

  const hote = requete.headers.get("host");
  if (hote === null || hote === "") return false;

  try {
    return new URL(origine).host === hote;
  } catch {
    // `Origin` illisible : on refuse. Un en-tête malformé n'est pas une origine
    // valide, et le laisser passer reviendrait à ne pas vérifier du tout.
    return false;
  }
}

export async function POST(
  requete: NextRequest,
  { params }: { params: Promise<{ locale: string }> },
): Promise<NextResponse> {
  const { locale } = await params;
  const langue = estLangueSupportee(locale) ? locale : "fr";

  if (!memeOrigine(requete)) {
    // Pas de détail dans le corps : le refus n'a rien à apprendre à qui l'a
    // provoqué. 403 et non 404 — cette surface n'est pas secrète, tout vendeur
    // connecté l'emploie ; c'est l'origine de l'appel qui est refusée.
    return new NextResponse(null, { status: 403 });
  }

  /*
   * ⚠️ `formData()` LÈVE SUR UN CORPS ABSENT OU MAL FORMÉ, et l'exception
   * remontait en 500. Constaté par la sonde de fumée, sur une requête portant la
   * bonne origine et aucun corps : un point d'entrée qui rend 500 sur une
   * requête forgée apprend qu'il a planté, et il le fait en écrivant une trace
   * d'erreur à chaque tentative — de quoi noyer un journal à volonté.
   *
   * Un navigateur qui soumet un formulaire envoie toujours un corps valide :
   * l'échec ici ne désigne donc pas un vendeur, mais une requête fabriquée. On
   * refuse en 400, sans corps.
   */
  let donnees: FormData;
  try {
    donnees = await requete.formData();
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const resultat = await executerGesteDeListe(donnees);

  if (resultat.statut === "session") {
    return NextResponse.redirect(
      new URL("/" + langue + "/connexion?erreur=session", requete.url),
      303,
    );
  }

  if (resultat.statut === "geste-inconnu") {
    // On revient à la liste plutôt que d'afficher une erreur technique : le
    // vendeur n'a rien fait de mal, et il n'a qu'une action utile.
    return NextResponse.redirect(new URL("/" + langue + "/commandes", requete.url), 303);
  }

  return NextResponse.redirect(new URL(resultat.destination, requete.url), 303);
}
