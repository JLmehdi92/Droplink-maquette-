import type { Metadata } from "next";
import Link from "next/link";
import { BoutonNotification, TitreNotification } from "@/components/notification/envoi-notification";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowRight, BellOff, CircleAlert, CircleCheck, Clock, House, Mail, MailCheck, type LucideIcon } from "lucide-react";
import { estLangueSupportee } from "@/i18n/config";
import { CIBLES_NOTIFICATION } from "@/lib/page-publique/notifications";
import { LogoDropLink } from "@/components/logo-droplink";

/**
 * LA PAGE OUVERTE DEPUIS UN E-MAIL DE SUIVI — confirmer, se désinscrire.
 *
 * Refonte du 02/10/2026 : maquette `notification.html` (`.notifp`) — une icône
 * par état dans trois ondes, le titre, le texte, le bouton. L'ancienne planche
 * (`ui_kits/client_link/notification.html`) et ses illustrations sont parties.
 *
 * ⚠️ ELLE NE MONTRE JAMAIS LA COMMANDE. Quelqu'un qui aurait inscrit l'adresse
 * d'un tiers ferait sinon voir la commande à ce tiers, au moment où il clique.
 *
 * ⚠️ OUVRIR LA PAGE NE FAIT RIEN. Les antivirus de messagerie ouvrent les liens
 * des e-mails reçus : c'est le BOUTON, un POST natif vers une route serveur, qui
 * confirme ou désinscrit. Il marche sans JavaScript.
 */

const ACTIONS = ["confirmer", "desinscrire"] as const;
const RESULTATS = ["confirmee", "desinscrite", "invalide", "indisponible"] as const;
type Action = (typeof ACTIONS)[number];
type Etat = Action | (typeof RESULTATS)[number];

// Une icône par état (maquette, `compte.js`). L'onde reste décorative : rien ne
// s'y lit, et elle s'arrête sous `prefers-reduced-motion`.
const ICONES: Record<Etat, LucideIcon> = {
  confirmer: Mail,
  confirmee: MailCheck,
  desinscrire: BellOff,
  desinscrite: CircleCheck,
  invalide: CircleAlert,
  indisponible: Clock,
};

function lire(valeur: string | string[] | undefined): string {
  return typeof valeur === "string" ? valeur : "";
}

/** L'état affiché, lu dans l'adresse (`?action=…&j=…` ou `?etat=…`). */
function etatDe(requete: Record<string, string | string[] | undefined>): Etat {
  const action = lire(requete["action"]);
  const resultat = lire(requete["etat"]);
  const jetonPlausible = /^[A-Za-z0-9_-]{16,64}$/.test(lire(requete["j"]));
  return (RESULTATS as readonly string[]).includes(resultat)
    ? (resultat as Etat)
    : (ACTIONS as readonly string[]).includes(action) && jetonPlausible
      ? (action as Action)
      : "invalide";
}

/** Le titre de l'onglet dit l'état, comme la maquette (`compte.js` : `document.title`). */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!estLangueSupportee(locale)) return { robots: { index: false, follow: false } };
  const t = await getTranslations({ locale, namespace: "notifications.page" });
  return { title: t(`${etatDe(await searchParams)}.titre`), robots: { index: false, follow: false } };
}

export default async function PageNotification({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  if (!estLangueSupportee(locale)) notFound();
  const requete = await searchParams;

  const etat = etatDe(requete);
  const jeton = lire(requete["j"]);
  // Un RÉSULTAT (on revient de « Confirmer » ou « Me désinscrire ») entre en fondu,
  // comme le changement d'état de la maquette (380 ms) ; une page ouverte depuis
  // l'e-mail s'affiche posée.
  const change = (RESULTATS as readonly string[]).includes(lire(requete["etat"]));

  const t = await getTranslations({ locale, namespace: "notifications.page" });
  const tp = await getTranslations({ locale, namespace: "page-publique" });
  const ta = await getTranslations({ locale, namespace: "accueil" });
  const nav = await getTranslations({ locale, namespace: "navigation" });
  const actionEnCours = etat === "confirmer" || etat === "desinscrire" ? etat : null;
  const Icone = ICONES[etat];

  return (
    <div className="page-notif">
      <a className="evitement" href="#contenu">
        {nav("allerAuContenu")}
      </a>
      <div className="notif-page">
        <header className="notif-haut">
          <Link className="logo min-h-11" href={`/${locale}`} aria-label={ta("accueil")}>
            <LogoDropLink />
          </Link>
          <Link className="notif-accueil" href={`/${locale}`}>
            <House aria-hidden="true" className="ic" />
            {tp("lienInvalideAccueil")}
          </Link>
        </header>
        <main id="contenu" className="notifp">
          <section className="notifp__carte" data-etat={etat} data-change={change ? "" : undefined}>
            <div className="notifp__visuel" aria-hidden="true">
              <span className="notifp__icone">
                <Icone className="ic" />
              </span>
              <i />
              <i />
              <i />
            </div>
            <TitreNotification focaliser={change}>{t(`${etat}.titre`)}</TitreNotification>
            <p className="notifp__texte">{t(`${etat}.texte`)}</p>
            {actionEnCours === null ? null : (
              <form method="post" action={CIBLES_NOTIFICATION[actionEnCours]}>
                <input type="hidden" name="j" value={jeton} />
                <input type="hidden" name="langue" value={locale} />
                {actionEnCours === "desinscrire" ? <input type="hidden" name="retour" value="page" /> : null}
                <BoutonNotification>
                  <span>{t(`${actionEnCours}.bouton`)}</span>
                  <ArrowRight aria-hidden="true" className="ic" />
                </BoutonNotification>
              </form>
            )}
          </section>
        </main>
        <footer className="notif-pied">
          <span className="logo logo--petit">
            <LogoDropLink hauteur={20} />
          </span>
          <a className="notif-pied__lien" href={`/${locale}/docs`} target="_blank" rel="noopener noreferrer">
            {tp("lienInvalideCommentCaMarche")}
          </a>
        </footer>
      </div>
    </div>
  );
}
