import type { MetadataRoute } from "next";
import { origineConfiguree } from "@/lib/site";

/**
 * `robots.txt` — il RÉPONDAIT 404 JUSQU'AU 08/09/2026.
 *
 * Mesuré sur la production : `GET https://droplink.fr/robots.txt` → **404**,
 * `text/html`. Le produit était en ligne depuis le 04/09 sans jamais dire à un
 * moteur où trouver son plan de site.
 *
 * ⚠️ ET UNE SONDE REGARDAIT DÉJÀ CETTE URL SANS LE VOIR. `scripts/fumee.mjs`
 * l'interrogeait pour lire ses en-têtes de sécurité, jamais son STATUT : elle
 * restait verte sur un 404. Un contrôle qui ne peut pas rougir pour la chose
 * qu'il touche.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ CE FICHIER N'INTERDIT PRESQUE RIEN, ET C'EST LA DÉCISION QUI COMPTE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le réflexe serait d'interdire `/p/`, l'espace vendeur et l'admin. **Ce serait
 * exactement le contraire de ce qu'il faut faire**, et c'est le piège classique
 * du sujet :
 *
 *   `Disallow` empêche de CRAWLER, pas d'INDEXER.
 *
 * Une URL interdite au crawl mais découverte ailleurs — un lien collé sur un
 * forum, une messagerie qui le republie — peut être indexée **sur sa seule
 * adresse**, sans contenu. Et comme le robot n'a pas le droit de la charger,
 * **il ne voit jamais le `noindex` qu'elle porte**. L'interdiction supprime
 * donc la seule protection qui fonctionne.
 *
 * Toutes ces surfaces portent déjà `noindex` — vérifié page par page :
 * `/p/[token]`, l'espace vendeur, les six écrans admin, la connexion,
 * l'inscription, le mot de passe, l'onboarding. **On laisse le robot les
 * charger précisément pour qu'il lise ce `noindex` et reparte.**
 *
 * Seul `/api/` est fermé : il ne rend que du JSON destiné aux machines, il ne
 * porte aucune balise `meta` où écrire un `noindex`, et rien n'y est censé
 * apparaître dans un index.
 *
 * ⚠️ AUCUN CRAWLER D'IA N'EST BLOQUÉ, ET C'EST VOULU. GPTBot, ClaudeBot,
 * PerplexityBot et les autres alimentent les moteurs de réponse — l'endroit
 * précis où un site de douze pages bien structuré peut être cité alors qu'il ne
 * prendra jamais la première place sur une requête générique. Les bloquer
 * reviendrait à fermer la seule porte réellement atteignable.
 */
export default function robots(): MetadataRoute.Robots {
  const origine = origineConfiguree();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // `/api/` ne rend que du JSON : aucune balise où poser un `noindex`,
        // et aucune raison d'apparaître dans un index.
        disallow: "/api/",
      },
    ],
    // Sans origine configurée, on n'annonce PAS de plan de site plutôt que d'en
    // annoncer un à une adresse devinée : un `Sitemap:` qui pointe ailleurs est
    // pire que pas de ligne du tout.
    ...(origine === null ? {} : { sitemap: `${origine}/sitemap.xml`, host: origine }),
  };
}
