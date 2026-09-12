import { getTranslations } from "next-intl/server";

/**
 * L'ÉCRAN D'UN LIEN QUI NE MÈNE NULLE PART.
 *
 * ⚠️ IL N'EXISTAIT PAS. `notFound()` est appelé à deux endroits de la page
 * publique — jeton inconnu, et commande absente de la vue restreinte — et le
 * produit servait le 404 générique de Next : une page en Times New Roman, en
 * anglais, sans rapport avec ce que le client vient de recevoir en message
 * privé. Le défaut ne cassait rien et ne levait rien ; il ne se voyait que chez
 * le destinataire, c'est-à-dire chez quelqu'un qui ne peut pas le signaler.
 *
 * UNE SEULE RÉPONSE POUR TROIS SITUATIONS : jeton inconnu, jeton révoqué,
 * compte suspendu. Un seul chemin de sortie, et le même délai. Trois pages
 * distinctes diraient à qui teste des jetons au hasard lesquels ont existé — et
 * une page « ce compte a été suspendu » divulguerait une sanction au client
 * d'un vendeur, qui n'y est pour rien.
 *
 * AUCUNE COULEUR D'ACCENT ICI, et c'est une propriété de sécurité, pas un choix
 * graphique : on ne sait pas de quelle boutique il s'agit, et si on le savait,
 * l'afficher serait déjà une fuite. Gris neutre, volontairement.
 *
 * LA LANGUE EST LE FRANÇAIS, pour la même raison que le `lang` du layout : il
 * n'y a pas de vendeur, donc pas de langue de vendeur, et la langue par défaut
 * du produit n'est une information sur personne.
 */
export default async function LienInvalide() {
  const t = await getTranslations({ locale: "fr", namespace: "page-publique" });

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-ds-surface-carte px-6 py-8">
      <div className="mb-[26px] flex h-[68px] w-[68px] items-center justify-center rounded-[20px] bg-ds-surface-creux">
        {/* Un maillon rompu. Il ne dit pas POURQUOI le lien ne marche plus —
            c'est exactement ce qu'on ne doit pas dire. */}
        <svg
          width="30"
          height="30"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-ds-texte-tenu"
          aria-hidden="true"
        >
          <path d="M9 17H7A5 5 0 0 1 7 7h2" />
          <path d="M15 7h2a5 5 0 0 1 0 10h-2" />
          <path d="m4 4 16 16" />
        </svg>
      </div>

      <h1 className="mb-3 text-center text-[26px] leading-[32px] font-extrabold tracking-[-0.03em] text-ds-texte-fort">
        {t("lienInvalideTitre")}
      </h1>

      <p className="max-w-[300px] text-center text-[15px] leading-[24px] text-ds-texte-sourdine">
        {t("lienInvalideTexte")}
      </p>

      <div className="min-h-10 grow" />

      {/*
        « Propulsé par DropLink », avec les mêmes garde-fous qu'ailleurs :
        secondaire, jamais confondable avec l'expéditeur, et ouverture HORS de
        la page.
      */}
      <a
        href="/"
        target="_blank"
        rel="noopener noreferrer"
        className="text-[12px] text-ds-texte-sourdine transition-colors hover:text-ds-texte-fort"
      >
        {t("propulsePar")}
      </a>
    </div>
  );
}
