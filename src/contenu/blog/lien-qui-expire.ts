import type { Article } from "@/lib/blog/types";

/**
 * Cible : « envoyer des photos à un client sans que le lien expire ».
 *
 * Requête mesurée comme occupée par des acteurs qui visent tous les
 * PHOTOGRAPHES (Viallo, 12img, VolleyDrive, Picflow, BulkShare) — aucun ne
 * parle au vendeur qui livre une commande et suit un colis. C'est la brèche.
 */
export const article: Article = {
  slug: "envoyer-photos-client-sans-lien-qui-expire",
  titre: "Envoyer des photos à un client sans que le lien expire",
  titreMeta: "Envoyer des photos sans lien qui expire",
  description:
    "Sept jours en gratuit, vingt-huit en payant : ensuite, le lien de votre client ne mène plus nulle part. Pourquoi, et comment livrer des photos qui restent.",
  resume:
    "Sept jours en gratuit, vingt-huit en payant : après quoi votre client clique sur un lien mort. Voilà pourquoi, et quoi faire.",
  date: "2026-09-08",
  minutes: 6,
  etiquette: "SUIVI & PARTAGE",
  blocs: [
    {
      type: "chapeau",
      texte:
        "Sept jours en gratuit, vingt-huit en payant. Passé ce délai, le lien que vous avez envoyé à votre client ne mène plus nulle part, et c'est souvent le moment où il y revient.",
    },
    { type: "titre", texte: "Pourquoi le lien meurt" },
    {
      type: "paragraphe",
      texte:
        "Les services de transfert de fichiers ont été conçus pour envoyer un document, pas pour livrer une commande. Le fichier part, il est téléchargé, l'affaire est close. C'est un modèle qui tient parfaitement tant que personne ne revient regarder.",
    },
    {
      type: "paragraphe",
      texte:
        "Un client qui attend un colis, lui, revient. Il revient le lendemain pour montrer les photos à quelqu'un, la semaine suivante pour vérifier un détail dont il n'est plus sûr, et un mois plus tard parce que le colis est arrivé abîmé et qu'il veut comparer avec ce qu'il avait vu.",
    },
    {
      type: "paragraphe",
      texte:
        "L'expiration n'est pas un défaut de ces outils : c'est leur fonctionnement normal. Stocker des fichiers coûte de l'argent, et un service de transfert n'a aucune raison de les garder une fois qu'ils sont arrivés. Le problème n'est pas l'outil, c'est qu'on lui demande un travail pour lequel il n'a pas été fait.",
    },
    { type: "titre", texte: "Ce que ça coûte vraiment" },
    {
      type: "paragraphe",
      texte:
        "Le coût n'est pas le lien mort. Le coût, c'est le message qui suit, celui où votre client vous demande de tout renvoyer, et où vous devez retrouver les bonnes photos parmi celles de trente autres commandes, sur un téléphone qui a effacé les plus anciennes.",
    },
    {
      type: "citation",
      texte:
        "Un lien qui expire ne vous fait pas perdre un fichier. Il vous fait perdre la conversation.",
    },
    {
      type: "paragraphe",
      texte:
        "Il y a un second coût, moins visible : ce que le client en déduit. Un lien mort ressemble à un vendeur qui a disparu. Vous savez que vous êtes toujours là ; lui voit une page d'erreur, et c'est exactement au moment où il attend quelque chose de vous.",
    },
    { type: "titre", texte: "Les trois façons de s'en sortir" },
    {
      type: "paragraphe",
      texte:
        "Il y en a trois, et chacune a un défaut qu'on découvre à l'usage plutôt qu'au moment de choisir.",
    },
    {
      type: "liste",
      items: [
        "Un dossier partagé. Le lien ne meurt pas, mais il donne accès à tout ce qu'il y a dans le dossier, pour toujours, à qui le possède. Un client qui transfère le lien transfère aussi ce que vous y ajouterez demain.",
        "Envoyer les photos une par une dans la conversation. Rien n'expire, mais tout se perd : au bout de trois mois de messages, retrouver les photos d'une commande précise est plus long que de les reprendre.",
        "Une page par commande. Le lien est unique, il ne change jamais, et il ne montre que cette commande-là. C'est plus de travail à mettre en place une fois, et plus rien ensuite.",
      ],
    },
    { type: "titre", texte: "Ce qui compte vraiment dans le choix" },
    {
      type: "paragraphe",
      texte:
        "Une question tranche entre les trois : que se passe-t-il quand vous devez ajouter quelque chose après avoir envoyé le lien ? Une photo oubliée, un numéro de suivi qui arrive deux jours plus tard, une réponse à une question. Avec un transfert de fichiers, il faut tout renvoyer. Avec un dossier partagé, le client doit deviner que quelque chose a changé.",
    },
    {
      type: "paragraphe",
      texte:
        "C'est ce point-là qui a décidé la forme de DropLink : une page par commande, modifiable après l'envoi, sur un lien qui ne bouge jamais. Le client garde la même adresse et y trouve ce qu'il y a de plus récent, sans qu'on ait à le prévenir.",
    },
  ],
};
