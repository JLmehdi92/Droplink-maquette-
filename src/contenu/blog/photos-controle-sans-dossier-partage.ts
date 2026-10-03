import type { Article } from "@/lib/blog/types";

/**
 * Cible : « partager des photos client sans Google Drive », « alternative
 * dossier partagé pour envoyer des photos ». L'angle est la SÉCURITÉ du
 * partage, pas le stockage — c'est ce que les comparatifs d'outils de
 * transfert ne traitent jamais.
 */
export const article: Article = {
  slug: "photos-controle-sans-dossier-partage",
  titre: "Photos de contrôle : les partager sans passer par un dossier partagé",
  titreMeta: "Partager ses photos sans dossier partagé",
  description:
    "Un dossier partagé donne accès à tout, pour toujours, à qui possède le lien. Pourquoi ce n'est pas ce qu'on veut envoyer à un client, et par quoi le remplacer.",
  resume:
    "Un dossier partagé donne accès à tout, pour toujours, à qui a le lien. Ce n'est pas ce qu'on veut envoyer à un client.",
  date: "2026-09-08",
  minutes: 6,
  etiquette: "PARTAGE",
  blocs: [
    {
      type: "chapeau",
      texte:
        "Le dossier partagé est la solution la plus naturelle : c'est gratuit, c'est déjà installé, et ça marche du premier coup. C'est aussi celle qui donne le plus de choses à votre client sans que vous l'ayez décidé.",
    },
    { type: "titre", texte: "Ce qu'un lien de dossier partage réellement" },
    {
      type: "paragraphe",
      texte:
        "Un lien de dossier ne partage pas des photos : il partage un dossier. La différence apparaît le jour où vous y déposez autre chose. Tout ce que vous ajouterez ensuite devient visible par les mêmes personnes, sans nouvelle décision de votre part, sans notification, sans que vous vous en souveniez.",
    },
    {
      type: "paragraphe",
      texte:
        "Le second point est plus discret : le lien ne s'arrête jamais. Il est transférable, il survit à la conversation, et il fonctionne encore dans deux ans chez quelqu'un que vous ne connaissez pas. Retirer l'accès suppose de se rappeler qu'il existe.",
    },
    {
      type: "citation",
      texte:
        "Vous ne décidez pas d'une fuite. Vous décidez d'un partage, et les deux sont parfois séparés de plusieurs mois.",
    },
    { type: "titre", texte: "Le problème du mélange" },
    {
      type: "paragraphe",
      texte:
        "À dix commandes par mois, un dossier par client reste tenable. À cent, l'arborescence devient le vrai travail : nommer, ranger, retrouver. Et une erreur de rangement ne se voit pas, elle se découvre quand un client vous dit qu'il voit des photos qui ne sont pas les siennes.",
    },
    {
      type: "paragraphe",
      texte:
        "C'est le défaut le plus coûteux de tous, parce qu'il n'abîme pas un fichier : il abîme la confiance. Un client qui a vu la commande d'un autre se demande qui a vu la sienne.",
    },
    { type: "titre", texte: "Ce qu'il faut à la place" },
    {
      type: "liste",
      items: [
        "Un lien qui ne montre qu'une commande, pas un dossier, pas une bibliothèque, pas un compte.",
        "Une adresse impossible à deviner, et qui ne se déduit pas de la précédente.",
        "La possibilité de couper un lien précis sans toucher aux autres, le jour où c'est nécessaire.",
        "Aucun compte à créer côté client : quelqu'un qui doit s'inscrire pour voir ses photos ne les regardera pas.",
      ],
    },
    { type: "titre", texte: "Le détail qui décide" },
    {
      type: "paragraphe",
      texte:
        "Demandez-vous ce qui se passe si votre client transfère le lien à quelqu'un d'autre, parce qu'il le fera, pour montrer son achat. Avec un dossier partagé, il transfère l'accès à tout ce que ce dossier contiendra un jour. Avec un lien par commande, il transfère exactement ce qu'il voulait montrer : sa commande.",
    },
    {
      type: "paragraphe",
      texte:
        "C'est la seule différence qui compte, et elle ne se voit pas au moment du choix. Elle se voit six mois plus tard.",
    },
  ],
};
