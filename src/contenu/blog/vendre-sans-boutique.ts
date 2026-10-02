import type { Article } from "@/lib/blog/types";

/**
 * Cible : « vendre sans site », « vendre en DM outils », « vendre sur Instagram
 * sans boutique ». Requête large et amont — elle attire des lecteurs qui ne
 * cherchent pas encore un produit, ce qui en fait la porte d'entrée du blog
 * plutôt qu'une page de conversion.
 */
export const article: Article = {
  slug: "vendre-sans-boutique-ce-quil-faut-vraiment",
  titre: "Vendre sans boutique : ce dont on a vraiment besoin",
  titreMeta: "Vendre sans boutique : ce qu'il faut vraiment",
  description:
    "Pas de site à construire, pas d'abonnement mensuel. La liste courte de ce qui manque réellement quand on vend en message privé, et ce qui n'est qu'un décor.",
  resume:
    "Pas d'abonnement à 300 € par mois ni de site à construire. La liste courte de ce qui manque réellement.",
  date: "2026-09-08",
  minutes: 8,
  etiquette: "VENDRE EN DIRECT",
  blocs: [
    {
      type: "chapeau",
      texte:
        "Vendre en message privé fonctionne. C'est même souvent plus efficace qu'une boutique : la conversation vend mieux qu'une fiche produit. Ce qui manque n'est pas un site, c'est ce qui se passe après « c'est commandé ».",
    },
    { type: "titre", texte: "Ce qu'on croit qu'il faut, et qui ne sert à rien" },
    {
      type: "paragraphe",
      texte:
        "Le premier réflexe est d'ouvrir une boutique en ligne. Elle apporte un catalogue, un panier et un paiement, trois choses que vous avez déjà résolues autrement, souvent mieux. Elle apporte aussi un abonnement mensuel, une mise en page à faire, des photos à recadrer et un stock à tenir à jour.",
    },
    {
      type: "paragraphe",
      texte:
        "Pour beaucoup de vendeurs, la boutique reste vide six mois puis se ferme. Ce n'est pas un échec de discipline : c'est que l'outil résolvait un problème qu'ils n'avaient pas.",
    },
    { type: "titre", texte: "Ce qui manque réellement" },
    {
      type: "paragraphe",
      texte:
        "Le problème arrive après la vente. La conversation a servi à convaincre ; elle est très mauvaise pour tenir le suivi. Les photos se perdent dans le fil, les numéros de suivi aussi, et chaque question oblige à remonter des semaines de messages.",
    },
    {
      type: "citation",
      texte:
        "La conversation est excellente pour vendre et catastrophique pour livrer.",
    },
    {
      type: "liste",
      items: [
        "Un endroit stable où le client retrouve sa commande, sans faire défiler la conversation.",
        "Des photos qui ne disparaissent pas au bout d'une semaine, et qu'on n'a pas à renvoyer.",
        "Un suivi de colis qui se met à jour seul, pour que la question ne revienne pas.",
        "Quelque chose qui ait votre nom dessus, pas le logo d'un service de transfert de fichiers.",
      ],
    },
    { type: "titre", texte: "Pourquoi le nom compte plus qu'on ne croit" },
    {
      type: "paragraphe",
      texte:
        "Un client qui reçoit un lien vers un service de transfert voit le logo de ce service. Le vôtre n'apparaît nulle part. Ce n'est pas grave sur une commande ; ça l'est sur la vingtième, quand ce client compare mentalement ce que vous lui donnez à ce que lui donne une boutique.",
    },
    {
      type: "paragraphe",
      texte:
        "Vendre sans boutique n'oblige pas à paraître amateur. La différence tient souvent à une page qui porte votre nom et vos couleurs, au moment précis où le client attend quelque chose.",
    },
    { type: "titre", texte: "La liste courte" },
    {
      type: "paragraphe",
      texte:
        "Si vous ne deviez régler qu'une chose : ce qui se passe entre « c'est commandé » et « je l'ai reçu ». C'est le seul moment où vous n'avez rien à dire de neuf, où le client attend, et où il finit par écrire pour combler le silence.",
    },
    {
      type: "paragraphe",
      texte:
        "C'est exactement ce que DropLink fait : une page par commande, à votre nom, avec les photos et le suivi, sur un lien qui ne change jamais. Gratuit pendant la phase de lancement, sans carte demandée.",
    },
  ],
};
