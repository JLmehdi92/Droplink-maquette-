import { createServerClient } from "@supabase/ssr";
import { viseAdmin } from "@/lib/routes/vise-admin";
import { OPTIONS_COOKIES } from "@/lib/auth/cookies";
import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { clePubliable, urlSupabase } from "@/lib/supabase/config";

/**
 * CHAQUE EXCLUSION DE CE MATCHER EST UNE PORTE.
 *
 * Le middleware négocie la langue ET rafraîchit la session. Il portera plus tard
 * la protection de `/admin`. Ses exclusions se justifient donc une par une :
 * une exclusion posée sans raison devient une faille dès qu'on ajoute une
 * responsabilité au middleware.
 *
 * Les deux premieres portent `(?:/|$)` et non le nom nu. Sans cette precision,
 * `api|p` excluait TOUT chemin commencant par ces lettres : `/pricing`,
 * `/partenaires`, `/apidocs` et `/pages` tombaient hors du middleware. Une
 * exclusion prevue pour UNE route en couvrait une famille entiere, et rien ne
 * l aurait signale tant que le middleware ne fait que choisir une langue.
 *
 * - `api`      : surface machine. Elle est HORS du middleware par nécessité,
 *                donc CHAQUE route y porte sa propre garde. Le préfixe
 *                `/api/admin/...` donnerait l'impression contraire à qui relit.
 * - `p`        : la page publique par jeton. Hors langue par conception.
 * - `_next`,
 *   `_vercel`  : artefacts du framework.
 * - `[^/]+\\.[^/]+$`
 *              : les fichiers statiques servis à la RACINE — `favicon.ico`,
 *                `robots.txt`. Elle ne s'applique qu'à un chemin d'UN SEUL
 *                segment, et c'est tout l'objet de la correction ci-dessous.
 *
 * ⚠️ CETTE EXCLUSION ÉTAIT `.*\\..*`, ET ELLE OUVRAIT UNE PORTE SUR `/admin`.
 *
 * DÉFAUT TROUVÉ À L'AUDIT DU 26/08/2026, vérifié par exécution sur le motif
 * extrait de ce fichier :
 *
 *     /fr/admin/comptes/exemple  → passe par le middleware
 *     /fr/admin/comptes/a.b      → EXCLU
 *
 * `.*\\..*` signifie « n'importe quel point, n'importe où », sans ancrage de
 * fin. Le trou n'était pas dans les noms de dossiers — aucun n'en contient —
 * mais dans les VALEURS des segments dynamiques, que le visiteur choisit
 * lui-même. `/[locale]/admin/comptes/[id]` est exactement cela : il suffisait
 * d'un point dans l'identifiant pour que la requête sorte du middleware, donc
 * pour que le 404 pré-emptif n'ait jamais lieu et que la session ne soit pas
 * rafraîchie.
 *
 * Aucune donnée ne fuitait — `exigerAdmin()` tient et rend 404 — mais la
 * défense en profondeur, que le brief exige nommément sur cette surface,
 * tombait à UNE SEULE couche, précisément sur la seule route admin dont l'URL
 * est contrôlée par le visiteur. Et chaque requête anonyme y coûtait deux
 * allers-retours en base.
 *
 * LA SONDE REGARDAIT LÀ OÙ LE DÉFAUT N'ÉTAIT PAS (L-025) : elle remplaçait les
 * segments dynamiques par la chaîne littérale « exemple », qui ne contient pas
 * de point. Elle prouvait donc qu'aucun DOSSIER ne s'appelle `rapport.png`, et
 * laissait passer tout le reste.
 *
 * POURQUOI UN SEUL SEGMENT SUFFIT : `public/` est vide, et les fichiers servis
 * à la racine par Next — `favicon.ico`, `robots.txt`, `manifest.webmanifest` —
 * n'ont jamais de segment parent. Tout ce qui vit plus profond est une route.
 */
export const config = {
  matcher: "/((?!api(?:/|$)|p(?:/|$)|_next|_vercel|[^/]+\\.[^/]+$).*)",
};

const gestionLangue = createMiddleware(routing);

/**
 * LE MIDDLEWARE NE PROTÈGE AUCUNE DONNÉE À LUI SEUL.
 *
 * Il fait UNE chose de sécurité : garder les cookies de session à jour, pour
 * qu'une session valide ne s'éteigne pas en cours de route. La garde qui fait
 * autorité vit dans le code qui LIT les données :
 *
 *   - `lireProfilVendeur()` suivi d'une redirection, en tête du layout de
 *     l'espace vendeur ET de chaque Server Action — une Server Action ne passe
 *     jamais par un layout ;
 *   - `exigerAdmin()` pour la surface d'administration, qui relit le rôle EN
 *     BASE à chaque requête.
 *
 * ⚠️ CE COMMENTAIRE DÉSIGNAIT `exigerSession()`, QUI N'ÉTAIT APPELÉE NULLE
 * PART. Trouvé à l'audit du 26/08/2026 : la fonction existait, ce fichier et
 * CLAUDE.md la présentaient tous deux comme la garde du produit, et elle avait
 * ZÉRO site d'appel — le module entier n'était importé par personne.
 *
 * Le piège n'était pas seulement documentaire : `exigerSession()` ne vérifiait
 * QUE la présence d'une session, jamais `status`. Quelqu'un qui aurait suivi la
 * consigne à la lettre sur une nouvelle page aurait écrit une garde LAISSANT
 * PASSER UN COMPTE SUSPENDU, en croyant appliquer la règle du projet. Une
 * documentation fausse est plus dangereuse qu'une documentation absente : on la
 * suit.
 *
 * Un middleware qui semblerait suffire ferait qu'on n'écrirait plus la vraie
 * garde, et la première route ajoutée hors du matcher serait ouverte.
 *
 * L'ORDRE COMPTE. La réponse de next-intl est construite d'abord, puis les
 * cookies rafraîchis y sont posés. Créer une réponse APRÈS le rafraîchissement
 * perdrait les cookies mis à jour : ils auraient été écrits sur un objet qu'on
 * jette, et la session expirerait silencieusement au bout d'une heure sans que
 * rien ne l'explique.
 */
/**
 * Vrai quand le chemin vise la surface d'administration.
 *
 * Le segment est RÉEL — `/fr/admin/...` — et jamais un groupe entre parenthèses.
 * Un groupe n'ajoute rien à l'URL : les écrans tomberaient hors de ce filtre
 * tout en paraissant rangés au bon endroit, ce qui est la pire combinaison.
 *
 * La langue est acceptée sous n'importe quelle casse et le préfixe peut manquer :
 * ne reconnaître que `/fr/admin` laisserait `/FR/admin` et `/admin` franchir le
 * filtre. Ils ne mèneraient nulle part aujourd'hui — mais une protection qui
 * tient à ce qu'une redirection ait lieu D'ABORD n'est pas une protection.
 */

export default async function middleware(requete: NextRequest): Promise<NextResponse> {
  const reponse = gestionLangue(requete);

  /*
   * `NEXT_LOCALE` PARTAIT SANS `HttpOnly` — relevé le 03/09/2026 par le scan
   * HawkScan, sur 18 chemins.
   *
   * ⚠️ POURQUOI ICI ET PAS DANS `routing.ts`, QUI SERAIT L'ENDROIT ÉVIDENT :
   * le type `CookieAttributes` de next-intl 4.13.7 est un `Pick` qui liste
   * `maxAge, domain, partitioned, path, priority, sameSite, secure, name` —
   * et EXCLUT `httpOnly`. Ce n'est pas un oubli de typage : la librairie
   * réécrit ce cookie DEPUIS LE NAVIGATEUR quand on change de langue par son
   * `<Link locale=…>` (`navigation/shared/syncLocaleCookie.js`), et un cookie
   * `HttpOnly` ne peut pas être écrit par du JavaScript. Le passer quand même
   * exigerait de forcer le type d'une librairie qui a de bonnes raisons de
   * l'interdire.
   *
   * ⚠️ CE QUI REND LE GESTE SÛR EST MESURÉ, PAS SUPPOSÉ — le justifier par
   * « ce cookie ne contient qu'une langue » serait L-029, une protection qui
   * tient à ce que la valeur soit anodine AUJOURD'HUI. Ce qu'il fallait
   * établir, c'est que RIEN ne l'écrit ni ne le lit côté navigateur :
   *   - zéro import de `next-intl/navigation` dans `src/` ;
   *   - `syncLocaleCookie` absent des 63 bundles servis — contre-test :
   *     `useState` en trouve 16, donc la sonde inspectait bien quelque chose ;
   *   - zéro occurrence de `NEXT_LOCALE` dans ces mêmes bundles.
   *
   * → LE JOUR OÙ UN SÉLECTEUR DE LANGUE EST AJOUTÉ AVEC LE `<Link>` DE
   * NEXT-INTL, cette ligne le casse EN SILENCE : le clic ne persistera plus le
   * choix, et rien ne lèvera d'erreur. Retirer cette ligne est alors le
   * correctif, pas contourner le cookie.
   *
   * `secure` n'est pas posé : il casserait le cookie en développement, servi
   * en clair. C'est une décision du premier déploiement, pas d'ici.
   */
  const langue = reponse.cookies.get("NEXT_LOCALE");
  if (langue !== undefined) {
    reponse.cookies.set("NEXT_LOCALE", langue.value, {
      path: "/",
      sameSite: "lax",
      httpOnly: true,
    });
  }

  const supabase = createServerClient(urlSupabase(), clePubliable(), {
    // Le middleware REPOSE les cookies rafraîchis : sans les mêmes options ici,
    // chaque renouvellement de session réécrirait des cookies lisibles en
    // JavaScript par-dessus ceux que le serveur avait bien fermés.
    cookieOptions: OPTIONS_COOKIES,
    cookies: {
      getAll() {
        return requete.cookies.getAll();
      },
      setAll(aPoser) {
        for (const { name, value, options } of aPoser) {
          reponse.cookies.set(name, value, options);
        }
      },
    },
  });

  // `getSession()` déclenche le renouvellement quand le jeton d'accès a expiré,
  // et ne fait AUCUN appel réseau quand il est encore valide — donc rien du tout
  // pour un visiteur anonyme, qui n'a pas de cookie de session. C'est ce qui
  // rend ce middleware indolore sur la landing, la page qui doit être la plus
  // rapide du produit.
  //
  // On ne vérifie pas l'identité ici : ce n'est pas le rôle du middleware, et le
  // faire donnerait l'illusion d'une protection. Voir `lib/comptes/profil.ts`
  // et `lib/audit/garde.ts`, qui portent les vraies gardes.
  const { data } = await supabase.auth.getSession();

  const viseLAdmin = viseAdmin(requete.nextUrl.pathname);

  /*
   * ⚠️ SUR `/admin` SEULEMENT, ON VALIDE LA SESSION AUPRÈS DU SERVEUR D'AUTH.
   *
   * DÉFAUT MESURÉ LE 02/09/2026, par la TAILLE des corps de refus : le 404 du
   * middleware est vide, celui d'`exigerAdmin()` ne l'est pas.
   *
   *     sans cookie        404, 0 o       ← arrêté par le middleware
   *     cookie illisible   404, 0 o       ← arrêté par le middleware
   *     cookie RÉVOQUÉ     404, 7 982 o   ← a FRANCHI le middleware
   *
   * `getSession()` ne fait aucun appel réseau tant que le jeton n'a pas expiré :
   * un jeton révoqué le franchit pendant une heure. Aucune donnée n'est sortie —
   * `exigerAdmin()` tient, et c'est lui qui fait autorité — mais la défense en
   * profondeur que le brief exige tombait alors à UNE couche, et chaque requête
   * coûtait un quota, une lecture de profil et une vérification de rôle en base.
   *
   * ⚠️ ET SEULEMENT SUR `/admin`. Poser cette validation partout ajouterait un
   * aller-retour vers le serveur d'authentification à CHAQUE requête du produit,
   * landing comprise — c'est-à-dire la page qui doit être la plus rapide. Le
   * trafic d'administration, lui, se compte en dizaines de requêtes par jour.
   */
  if (viseLAdmin && data.session !== null) {
    const { data: utilisateur, error } = await supabase.auth.getUser();
    if (error !== null || utilisateur.user === null) {
      return new NextResponse(null, { status: 404 });
    }

    /*
     * ⚠️ ET LE RÔLE AUSSI, DEPUIS LE 02/09/2026 — parce que le corps du 404
     * D'APRÈS énumérait la surface.
     *
     * DÉFAUT MESURÉ avec le cookie d'un vendeur ORDINAIRE (`role = user`,
     * jamais admin). Le refus venait alors d'`exigerAdmin()`, c'est-à-dire
     * APRÈS que Next a composé la page — et sa charge d'hydratation nomme le
     * fichier de code de l'écran demandé :
     *
     *   /fr/admin               404  7 956 o  …/admin/page-bd9a7fb78….js
     *   /fr/admin/comptes       404  8 429 o  …/admin/comptes/page-….js
     *   /fr/admin/comptes/{id}  404  9 020 o  …/admin/comptes/%5Bid%5D/….js
     *   /fr/admin/facturation   404  5 547 o  aucun
     *   /fr/nexistepas-du-tout  404  5 547 o  aucun
     *
     * La règle « 404, jamais 403 » était donc tenue sur le STATUT et rompue
     * sur le CORPS : un vendeur ordinaire distinguait une route admin réelle
     * d'une route inventée, et reconstituait les six écrans plus le segment
     * `[id]`. Le préalable est une session quelconque — l'inscription est
     * ouverte et sans confirmation d'email, donc trente secondes.
     *
     * ⚠️ LE COMMENTAIRE CI-DESSOUS DISAIT QUE LIRE LE RÔLE ICI « ajouterait un
     * aller-retour vers la base à TOUTES les pages du produit ». Ce n'est plus
     * vrai depuis que la validation est bornée à `/admin` : le coût est payé
     * par les seules requêtes d'administration, qui se comptent en dizaines par
     * jour, et jamais par la landing ni par la page client.
     *
     * CELA NE FAIT PAS DU MIDDLEWARE LA GARDE QUI FAIT AUTORITÉ. `exigerAdmin()`
     * reste indispensable et reste la seule qui compte : les Server Actions ne
     * passent jamais par ici. C'est une couche de plus, et elle sert à ce que le
     * refus arrive AVANT que la page existe.
     *
     * FAIL-CLOSED. Une lecture de rôle qui échoue rend 404 : côté
     * administration, un refus injustifié ne coûte qu'une nouvelle tentative,
     * et ne pénalise que nous.
     */
    const { data: profil, error: erreurProfil } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", utilisateur.user.id)
      .maybeSingle();

    if (erreurProfil !== null || profil === null || profil.role !== "admin") {
      return new NextResponse(null, { status: 404 });
    }
  }

  /*
   * PREMIÈRE COUCHE SUR `/admin`, ET RIEN DE PLUS.
   *
   * Elle écarte les visiteurs SANS SESSION. Elle ne vérifie PAS le rôle : le
   * middleware s'exécute au bord, sur chaque navigation, et y lire `profiles`
   * ajouterait un aller-retour vers la base à toutes les pages du produit. La
   * garde qui fait autorité est `exigerAdmin()`, qui lit le rôle EN BASE dans
   * chaque page et chaque Server Action — et qui reste indispensable, puisque
   * les Server Actions ne passent jamais par ici.
   *
   * 404 ET JAMAIS 403. Un 403 confirme que la surface existe ; un 404 ne dit
   * rien. C'est ce qui sépare « il y a un back-office ici, cherchons une
   * faille » de « il n'y a rien ». Le corps de la réponse est vide pour la même
   * raison : une page d'erreur reconnaissable serait un aveu.
   */
  if (data.session === null && viseLAdmin) {
    return new NextResponse(null, { status: 404 });
  }

  return reponse;
}
