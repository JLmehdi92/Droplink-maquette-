import type { Article } from "@/lib/blog/types";

/**
 * Cible : « répondre à c'est où mon colis », « client qui demande où en est sa
 * commande ». Requête de frustration, très proche de l'intention d'achat : on
 * la tape quand on vient de recevoir le message pour la dixième fois.
 */
export const article: Article = {
  slug: "cest-ou-mon-colis-arreter-de-repondre",
  titre: "« C'est où mon colis ? » : arrêter de répondre dix fois par jour",
  titreMeta: "« C'est où mon colis ? » : arrêter d'y répondre",
  description:
    "La question revient parce que la réponse n'est nulle part. Comment mettre l'information là où le client la cherche, pour qu'il cesse d'avoir à la demander.",
  resume:
    "La question revient parce que la réponse n'est nulle part. Mettre l'information là où le client la cherche.",
  date: "2026-09-08",
  minutes: 5,
  etiquette: "RELATION CLIENT",
  blocs: [
    {
      type: "chapeau",
      texte:
        "Vous répondez la même chose depuis trois jours, à quatre personnes différentes. Ce n'est pas un problème de patience : c'est que vous êtes le seul endroit où l'information existe.",
    },
    { type: "titre", texte: "La question n'est pas de l'impatience" },
    {
      type: "paragraphe",
      texte:
        "Un client qui demande où en est son colis ne doute pas de vous. Il essaie d'obtenir une information, et vous êtes la seule source disponible. Tant que c'est le cas, il reviendra, et il reviendra d'autant plus souvent que l'attente est longue.",
    },
    {
      type: "paragraphe",
      texte:
        "C'est pour ça que répondre plus vite ne règle rien. Vous traitez le message, pas sa cause. Le lendemain, la même personne se posera la même question, et elle n'aura toujours qu'un seul moyen d'y répondre : vous écrire.",
    },
    { type: "titre", texte: "Le numéro de suivi ne suffit pas" },
    {
      type: "paragraphe",
      texte:
        "Envoyer le numéro paraît régler le problème : le client peut vérifier lui-même. En pratique, il doit trouver le bon site de suivi, coller le numéro, et interpréter des libellés écrits pour des professionnels de la logistique. Beaucoup abandonnent et reviennent vous le demander.",
    },
    {
      type: "citation",
      texte:
        "Donner un numéro, c'est déléguer le travail au client. Donner une page, c'est le faire à sa place.",
    },
    {
      type: "paragraphe",
      texte:
        "Et il y a le cas où le numéro ne dit rien : celui qui vient d'être créé et que le transporteur n'a pas encore scanné. Un client qui lit « aucune information » à ce moment-là comprend « colis introuvable ». Ce n'est pas ce que ça veut dire, mais c'est ce qu'il lit.",
    },
    { type: "titre", texte: "Ce qui fait vraiment cesser la question" },
    {
      type: "liste",
      items: [
        "Une adresse unique, envoyée une fois, où tout se trouve : les photos, le suivi, l'état de la commande.",
        "Une mise à jour automatique, pour que la page dise aujourd'hui autre chose qu'hier sans que vous y touchiez.",
        "Un vocabulaire de client, pas de transporteur : « expédié », « en transit », « livré », pas de codes ni de sigles.",
        "Une phrase quand rien ne bouge, plutôt qu'un écran figé. « Aucun mouvement depuis douze jours » se comprend ; le silence, non.",
      ],
    },
    { type: "titre", texte: "Le gain réel n'est pas le temps gagné" },
    {
      type: "paragraphe",
      texte:
        "On croit gagner les minutes passées à répondre. En réalité, ce qui change est ailleurs : un client qui peut regarder lui-même cesse de se demander si quelque chose ne va pas. La question n'était pas seulement une demande d'information, c'était aussi une demande de réassurance.",
    },
    {
      type: "paragraphe",
      texte:
        "Une page qui se met à jour toute seule répond aux deux, en même temps, sans que vous soyez là.",
    },
  ],
};
