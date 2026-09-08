import type { MetadataRoute } from "next";
import { LANGUES, LANGUE_DEFAUT } from "@/i18n/config";
import { origineConfiguree } from "@/lib/site";

/**
 * Le plan de site — IL RÉPONDAIT 404 JUSQU'AU 08/09/2026.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QUI EST DEDANS, ET SURTOUT CE QUI N'Y EST PAS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Quatre chemins, trois langues, **douze URL**. Rien d'autre, et la liste est
 * fermée par construction : elle est déclarée ici, pas déduite d'un parcours de
 * l'arborescence. Une découverte automatique attraperait un jour une route
 * ajoutée sans y penser — et sur ce produit, la route ajoutée sans y penser
 * pourrait être `/p/[token]`.
 *
 * ⚠️ CE QUI N'Y EST PAS, ET NE DOIT JAMAIS Y ÊTRE :
 *
 *   - `/p/[token]`  — chaque lien est PRIVÉ et son jeton donne accès à vie aux
 *                     photos d'un client. Le publier dans un plan de site
 *                     reviendrait à publier la liste des jetons. C'est le pire
 *                     défaut que cette passe pourrait produire, et c'est
 *                     pourquoi la liste est DÉCLARÉE et gardée par un test.
 *   - l'espace vendeur, l'admin, la connexion, l'inscription, le mot de passe,
 *     l'onboarding — tous en `noindex` : les annoncer serait se contredire.
 *
 * ⚠️ CHAQUE ENTRÉE PORTE LE JEU COMPLET DES TROIS LANGUES, ELLE-MÊME INCLUSE.
 * C'est la règle qui casse tout si on la rate : sans auto-référence, Google
 * n'ignore pas la ligne — **il ignore le jeu entier**. Et sans réciprocité,
 * le signal est invalidé des deux côtés. Les deux sont garanties ici parce que
 * le jeu est engendré depuis `LANGUES` pour chaque chemin, jamais écrit à la
 * main.
 *
 * ⚠️ AUCUNE `lastModified`, ET C'EST DÉLIBÉRÉ. Une date engendrée à la volée
 * vaudrait « maintenant » à chaque requête, sur des pages qui n'ont pas changé
 * depuis des semaines. Ce serait affirmer une fraîcheur que la base ne connaît
 * pas — le principe XII, appliqué aux moteurs. Mieux vaut ne rien dire que dire
 * faux : Google traite une `lastModified` non fiable comme du bruit et cesse de
 * la lire.
 */

/** Les chemins indexables, SANS préfixe de langue. Liste FERMÉE. */
const CHEMINS_INDEXABLES = ["", "/conditions", "/confidentialite", "/signalement"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const origine = origineConfiguree();

  /*
   * ⚠️ UNE ABSENCE D ORIGINE DOIT SE VOIR, PAS SE TAIRE.
   *
   * `NEXT_PUBLIC_SITE_URL` est bien posee en production — prouve
   * indirectement le 08/09/2026 : `partirVersGoogle` redirige vers
   * `?erreur=indisponible` quand elle manque, et une vraie connexion Google a
   * abouti sur `/bienvenue`. Supabase, de son cote, n accepte que
   * `https://droplink.fr/**` : un `localhost` aurait ete refuse.
   *
   * Mais le jour ou quelqu un la retire, ce fichier rendrait une liste VIDE
   * avec un statut 200 — un plan de site parfaitement valide qui n annonce
   * rien. Les moteurs cesseraient de decouvrir les pages, et aucune porte ne
   * pourrait le voir : elles tournent toutes en local, ou la variable est
   * presente. C est le meme angle mort que les redirections vers
   * `localhost:8080` et que la region Railway.
   *
   * On ne peut pas echouer ici — un 500 sur `/sitemap.xml` serait pire — donc
   * on JOURNALISE, comme `lib/site.ts` le fait deja pour la meme cause.
   */
  if (origine === null) {
    console.error(
      "[seo] NEXT_PUBLIC_SITE_URL absente : le plan de site est VIDE. " +
        "Les moteurs ne decouvriront plus aucune page.",
    );
    return [];
  }

  const url = (langue: string, chemin: string): string => `${origine}/${langue}${chemin}`;

  return CHEMINS_INDEXABLES.flatMap((chemin) => {
    const languages: Record<string, string> = {};
    for (const l of LANGUES) languages[l] = url(l, chemin);
    languages["x-default"] = url(LANGUE_DEFAUT, chemin);

    return LANGUES.map((langue) => ({
      url: url(langue, chemin),
      alternates: { languages },
      // La landing est la porte d'entrée ; les pages légales existent pour être
      // trouvées quand on les cherche, pas pour concourir avec elle.
      priority: chemin === "" ? 1 : 0.5,
    }));
  });
}
