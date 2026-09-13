import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, House, MessageCircle } from "lucide-react";
import logoDropLink from "@/../public/marque/logo-droplink.png";
import illustration from "@/../public/marque/illus-colis-introuvable.png";

/**
 * L'ÉCRAN D'UN LIEN QUI NE MÈNE NULLE PART — porté sur `client_link/not-found`.
 *
 * ⚠️ IL N'EXISTAIT PAS, PUIS IL ÉTAIT NU. `notFound()` servait le 404 générique
 * de Next — Times New Roman, en anglais — puis un écran gris minimal. Le kit en
 * dessine une vraie page : illustration, titre, aide, et le chemin du retour.
 *
 * UNE SEULE RÉPONSE POUR TROIS SITUATIONS : jeton inconnu, jeton révoqué,
 * compte suspendu. Un seul chemin de sortie, et le même délai. Trois pages
 * distinctes diraient à qui teste des jetons au hasard lesquels ont existé — et
 * une page « ce compte a été suspendu » divulguerait une sanction au client
 * d'un vendeur, qui n'y est pour rien.
 *
 * ⚠️ C'EST POURQUOI LA PLANCHE « LIEN EXPIRÉ » N'EST PAS PORTÉE, ET LE TEXTE DU
 * KIT NON PLUS. Le kit dessine un lien « expiré 90 jours après la livraison » :
 * le jeton est immuable et n'expire JAMAIS, donc la règle serait fausse. Et son
 * « Cette commande est introuvable — ce lien a été supprimé, ou la commande
 * n'existe plus » affirmerait une cause précise quand trois sont possibles, dont
 * une qu'on n'a pas le droit de dire. Le titre dit ce qui est vrai des trois.
 *
 * AUCUNE COULEUR DE VENDEUR ICI, et c'est une propriété de sécurité : on ne sait
 * pas de quelle boutique il s'agit, et si on le savait, l'afficher serait déjà
 * une fuite. La page est donc à DropLink — mais sous `/p/[token]`, et la règle 3
 * y interdit le dégradé de marque : l'appel au retour est un aplat.
 *
 * LA LANGUE EST LE FRANÇAIS, pour la même raison que le `lang` du layout : il
 * n'y a pas de vendeur, donc pas de langue de vendeur, et la langue par défaut
 * du produit n'est une information sur personne.
 */
export default async function LienInvalide() {
  const t = await getTranslations({ locale: "fr", namespace: "page-publique" });

  return (
    <div className="flex min-h-dvh flex-col bg-[linear-gradient(135deg,#F2F0FD_0%,#FAF9FE_42%,#F6F2FC_100%)] bg-fixed leading-[normal]">
      <header className="flex items-center px-4 py-[18px] sm:px-[34px] sm:py-[26px]">
        <Image src={logoDropLink} alt="DropLink" height={34} width={Math.round((34 * 2172) / 724)} />
        <span className="flex-1" />
        <Link
          href="/fr"
          className="inline-flex h-12 items-center gap-2.5 rounded-ds-card border border-ds-filet bg-ds-surface-carte px-[18px] text-[14px] font-semibold text-ds-texte-fort shadow-ds-xs transition-shadow hover:shadow-ds-sm sm:h-[46px]"
        >
          <House aria-hidden="true" size={18} strokeWidth={1.9} className="text-ds-accent" />
          {t("lienInvalideAccueil")}
        </Link>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 pt-5 pb-10 text-center">
        {/* DÉCORATIVE, et servie par `next/image` : le fichier du kit pèse
            823 Ko, la variante demandée pour 360 px en pèse une fraction. */}
        <Image
          src={illustration}
          alt=""
          sizes="(max-width: 500px) 72vw, 360px"
          className="mb-[34px] h-auto w-[min(360px,72vw)]"
          priority
        />
        <h1 className="text-[32px] leading-[1.1] font-extrabold tracking-[-0.045em] text-ds-texte-fort sm:text-[44px]">
          {t("lienInvalideTitre")}
        </h1>
        <p className="mt-4 max-w-[520px] text-[16px] leading-[1.5] text-ds-texte-corps sm:text-[18px]">
          {t("lienInvalideSousTitre")}
        </p>
        <Link
          href="/fr"
          className="mt-8 inline-flex h-14 items-center gap-2.5 rounded-ds-card bg-ds-accent px-8 text-[16px] font-bold text-ds-texte-sur-marque shadow-ds-brand transition-shadow hover:shadow-ds-brand-hover"
        >
          {t("lienInvalideAccueil")}
          <ArrowRight aria-hidden="true" size={18} strokeWidth={1.9} />
        </Link>
        <div className="mt-11 flex w-[min(660px,100%)] items-center gap-4 rounded-ds-card-lg border border-ds-filet bg-[rgba(255,255,255,0.6)] px-6 py-[22px] text-left">
          <MessageCircle aria-hidden="true" size={26} strokeWidth={1.9} className="shrink-0 text-ds-accent" />
          <div>
            <b className="block text-[15px] font-bold text-ds-texte-fort">{t("lienInvalideAideTitre")}</b>
            <span className="text-[14px] text-ds-texte-corps">{t("lienInvalideAideTexte")}</span>
          </div>
        </div>
      </main>

      {/*
        LE PIED DU KIT, et la mention DropLink avec ses garde-fous : secondaire,
        et ouverte HORS de la page. Ici il n'y a pas d'expéditeur avec qui la
        confondre — c'est la seule page du parcours client qui soit entièrement
        la nôtre.
      */}
      <footer className="flex flex-col items-center gap-2 px-6 pb-[34px]">
        <Image src={logoDropLink} alt="DropLink" height={22} width={Math.round((22 * 2172) / 724)} />
        <span className="text-[12.5px] text-ds-texte-sourdine">
          <a
            href="/fr"
            target="_blank"
            rel="noopener noreferrer"
            className="-my-3.5 inline-flex min-h-11 items-center px-1.5 font-semibold text-ds-texte-corps hover:underline sm:my-0 sm:min-h-0 sm:px-0"
          >
            {t("lienInvalideCommentCaMarche")}
          </a>
        </span>
      </footer>
    </div>
  );
}
