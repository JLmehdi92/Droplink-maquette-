import type { Article } from "@/lib/blog/types";

/**
 * Cible : « suivre un colis sans boutique en ligne ».
 *
 * Les acteurs du suivi brandé (AfterShip, WelcomeTrack, QualiShip) supposent
 * TOUS une boutique Shopify, PrestaShop ou WooCommerce — vérifié. Personne ne
 * répond au vendeur qui n'en a pas, et c'est exactement le lecteur visé ici.
 */
export const article: Article = {
  slug: "suivre-un-colis-sans-boutique-en-ligne",
  titre: "Suivre un colis sans boutique en ligne",
  description:
    "Les outils de suivi brandé supposent tous une boutique Shopify ou WooCommerce. Comment suivre un colis et tenir son client informé quand on vend en direct, sans site marchand.",
  resume:
    "Les outils de suivi supposent tous une boutique en ligne. Ce qu'on peut faire quand on vend en message privé.",
  date: "2026-09-08",
  minutes: 7,
  etiquette: "SUIVI & PARTAGE",
  blocs: [
    {
      type: "chapeau",
      texte:
        "Cherchez « page de suivi personnalisée » : tous les résultats vous demandent l'adresse de votre boutique Shopify. Si vous vendez en message privé, aucun de ces outils ne vous concerne — et pourtant le besoin est le même.",
    },
    { type: "titre", texte: "Pourquoi les outils existants ne servent à rien ici" },
    {
      type: "paragraphe",
      texte:
        "Les services de suivi post-achat se branchent sur une boutique. Ils lisent les commandes, récupèrent les numéros de suivi, et affichent une page aux couleurs du marchand. Toute leur mécanique part de là : sans plateforme à connecter, il n'y a rien à lire, et l'outil n'a pas d'entrée.",
    },
    {
      type: "paragraphe",
      texte:
        "Ce n'est pas un oubli de leur part. C'est un choix : une boutique connectée, ce sont des centaines de commandes automatiques, un abonnement mensuel et un client qui reste. Un vendeur qui fait quarante commandes par mois en message privé n'entre dans aucun de ces calculs.",
    },
    { type: "titre", texte: "Le vrai problème est le dernier kilomètre" },
    {
      type: "paragraphe",
      texte:
        "Sur un trajet longue distance, un colis change souvent de transporteur avant d'arriver. Le numéro que vous avez donné à votre client suit le premier trajet ; à la remise au réseau local, un second numéro prend le relais. Le premier cesse de bouger.",
    },
    {
      type: "citation",
      texte:
        "Le numéro s'arrête exactement au moment où le client regarde le plus souvent : les derniers jours.",
    },
    {
      type: "paragraphe",
      texte:
        "Pour votre client, un suivi qui n'avance plus veut dire un colis perdu. Il ne fait pas la différence entre « le transporteur n'a rien scanné » et « personne ne sait où il est ». C'est là que les messages arrivent, et c'est là qu'il faut une réponse — pas un tableau vide.",
    },
    { type: "titre", texte: "Ce qu'il faut, au minimum" },
    {
      type: "liste",
      items: [
        "Un suivi qui interroge le transporteur tout seul, sans que vous ayez à copier-coller un numéro dans un site trois fois par semaine.",
        "Un statut qui ne recule jamais. Si votre client a vu « expédié », il ne doit jamais revoir « en préparation » parce qu'une source a changé d'avis.",
        "Une phrase quand rien ne bouge. « Aucun mouvement depuis onze jours » est une information ; un écran figé se lit comme une panne.",
        "La même adresse du début à la fin. Un second lien pour le second numéro, c'est un second lien à retrouver.",
      ],
    },
    { type: "titre", texte: "Ce que ça change côté client" },
    {
      type: "paragraphe",
      texte:
        "Un client qui peut regarder lui-même arrête de demander. Ce n'est pas qu'il vous faisait moins confiance avant : c'est qu'il n'avait aucun autre moyen de savoir. Le message « c'est où ? » n'est pas une marque d'impatience, c'est la seule action disponible quand l'information n'est nulle part.",
    },
    {
      type: "paragraphe",
      texte:
        "DropLink met le suivi sur la même page que les photos, à la même adresse, et le met à jour tout seul. Sans boutique, sans site à construire, sans abonnement pendant la phase de lancement.",
    },
  ],
};
