import { NextResponse, type NextRequest } from "next/server";
import { estLangueSupportee } from "@/i18n/config";
import { memeOrigine } from "@/lib/auth/meme-origine";
import { executerGesteDeListe } from "@/lib/commandes/geste-liste";
import { redirigerVers } from "@/lib/http/rediriger";

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

/*
 * LA GARDE CSRF VIT DANS `lib/auth/meme-origine`, PAS ICI.
 *
 * Elle y est partie le 01/09/2026, quand la déconnexion a eu besoin de la même :
 * deux copies d'une garde qu'il a déjà fallu corriger DEUX FOIS auraient
 * divergé à la troisième. L'historique complet de ces corrections y est écrit.
 */

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
    return redirigerVers("/" + langue + "/connexion?erreur=session", 303);
  }

  if (resultat.statut === "geste-inconnu") {
    // On revient à la liste plutôt que d'afficher une erreur technique : le
    // vendeur n'a rien fait de mal, et il n'a qu'une action utile.
    return redirigerVers("/" + langue + "/commandes", 303);
  }

  return redirigerVers(resultat.destination, 303);
}
