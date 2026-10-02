import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, MessageCircle, PackageOpen } from "lucide-react";
import symbole from "@/../public/marque/logo-symbole.png";

/**
 * L'ÉCRAN D'UN LIEN QUI NE MÈNE NULLE PART — refonte du 02/10/2026, maquette
 * `lien-invalide.html` (la grammaire de la page de notification, sans bouton d'état).
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

  // Le logo est rendu ici et non par `LogoDropLink` : sous /p, rien ne doit tirer
  // les feuilles de l'espace vendeur. Le mot est une marque, il ne se traduit pas.
  const logo = (hauteur: number) => (
    <>
      <Image src={symbole} alt="" height={hauteur} width={Math.round((hauteur * 520) / 724)} />
      <span>DropLink</span>
    </>
  );
  return (
    <div className="etat-p page-notif">
      <div className="notif-page">
        <header className="notif-haut">
          {/* `_top` ET NON LE CADRE COURANT : dans l'aperçu de l'éditeur, qui encadre
              la page d'un lien bloqué, l'accueil s'ouvrirait dans le cadre — et
              l'accueil refuse d'être encadré. */}
          <Link className="logo" href="/fr" target="_top" aria-label="DropLink">
            {logo(28)}
          </Link>
        </header>
        <main id="contenu" className="notifp">
          <section className="notifp__carte" data-etat="invalide">
            <div className="notifp__visuel" aria-hidden="true">
              <span className="notifp__icone">
                <PackageOpen className="ic" />
              </span>
              <i />
              <i />
              <i />
            </div>
            <h1>{t("lienInvalideTitre")}</h1>
            <p className="notifp__texte">{t("lienInvalideSousTitre")}</p>
            {/* Un aplat, jamais le dégradé de marque (règle 3, /p). */}
            <Link className="notifp__bouton" href="/fr" target="_top">
              {t("lienInvalideAccueil")}
              <ArrowRight aria-hidden="true" className="ic" />
            </Link>
            <div className="notifp__aide">
              <MessageCircle aria-hidden="true" className="ic" />
              <p>
                <b>{t("lienInvalideAideTitre")}</b>
                <span>{t("lienInvalideAideTexte")}</span>
              </p>
            </div>
          </section>
        </main>
        {/* LA MENTION DROPLINK, secondaire et ouverte HORS de la page : c'est la
            seule page du parcours client qui soit entièrement la nôtre. */}
        <footer className="notif-pied">
          <span className="logo logo--petit">{logo(20)}</span>
          <a className="notif-pied__lien" href="/fr" target="_blank" rel="noopener noreferrer">
            {t("lienInvalideCommentCaMarche")}
          </a>
        </footer>
      </div>
    </div>
  );
}
