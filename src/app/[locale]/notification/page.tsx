import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowRight, House } from "lucide-react";
import { estLangueSupportee } from "@/i18n/config";
import { CIBLES_NOTIFICATION } from "@/lib/page-publique/notifications";
import logoDropLink from "@/../public/marque/logo-droplink.png";
import illustrationColis from "@/../public/marque/illus-colis.png";
import illustrationIntrouvable from "@/../public/marque/illus-colis-introuvable.png";

/**
 * LA PAGE OUVERTE DEPUIS UN E-MAIL DE SUIVI — confirmer, se désinscrire.
 *
 * Planche : `ui_kits/client_link/notification.html` (23/09/2026), même gabarit
 * que la page du lien introuvable, dont elle reprend le code.
 *
 * ⚠️ ELLE NE MONTRE JAMAIS LA COMMANDE. Quelqu'un qui aurait inscrit l'adresse
 * d'un tiers ferait sinon voir la commande à ce tiers, au moment où il clique.
 *
 * ⚠️ OUVRIR LA PAGE NE FAIT RIEN. Les antivirus de messagerie ouvrent les liens
 * des e-mails reçus : c'est le BOUTON, un POST natif vers une route serveur, qui
 * confirme ou désinscrit. Il marche sans JavaScript.
 */

export const metadata: Metadata = { robots: { index: false, follow: false } };

const ACTIONS = ["confirmer", "desinscrire"] as const;
const RESULTATS = ["confirmee", "desinscrite", "invalide", "indisponible"] as const;
type Action = (typeof ACTIONS)[number];
type Etat = Action | (typeof RESULTATS)[number];

function lire(valeur: string | string[] | undefined): string {
  return typeof valeur === "string" ? valeur : "";
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

  const action = lire(requete["action"]);
  const jeton = lire(requete["j"]);
  const resultat = lire(requete["etat"]);
  // Le jeton n'est ici que RECOPIÉ dans le formulaire : sa forme est vérifiée par
  // la route qui le reçoit. Une valeur hors forme rend l'état « invalide ».
  const jetonPlausible = /^[A-Za-z0-9_-]{16,64}$/.test(jeton);
  const etat: Etat = (RESULTATS as readonly string[]).includes(resultat)
    ? (resultat as Etat)
    : (ACTIONS as readonly string[]).includes(action) && jetonPlausible
      ? (action as Action)
      : "invalide";

  const t = await getTranslations({ locale, namespace: "notifications.page" });
  const tp = await getTranslations({ locale, namespace: "page-publique" });
  const actionEnCours = etat === "confirmer" || etat === "desinscrire" ? etat : null;

  return (
    <div className="flex min-h-dvh flex-col bg-[linear-gradient(135deg,#F2F0FD_0%,#FAF9FE_42%,#F6F2FC_100%)] bg-fixed leading-[normal]">
      <header className="flex items-center px-4 py-[18px] sm:px-[34px] sm:py-[26px]">
        <Image src={logoDropLink} alt="DropLink" height={34} width={Math.round((34 * 2172) / 724)} />
        <span className="flex-1" />
        <Link
          href={`/${locale}`}
          className="inline-flex h-12 items-center gap-2.5 rounded-ds-card border border-ds-filet bg-ds-surface-carte px-[18px] text-[14px] font-semibold text-ds-texte-fort shadow-ds-xs transition-shadow hover:shadow-ds-sm sm:h-[46px]"
        >
          <House aria-hidden="true" size={18} strokeWidth={1.9} className="text-ds-accent" />
          {/* LE TEXTE DANS UN <span>, COMME LA PLANCHE : la sonde apparie par le
              texte, et comparerait sinon un span nu à un lien stylé. */}
          <span>{tp("lienInvalideAccueil")}</span>
        </Link>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 pt-5 pb-10 text-center">
        <Image
          src={etat === "invalide" ? illustrationIntrouvable : illustrationColis}
          alt=""
          sizes="(max-width: 500px) 72vw, 360px"
          className="mb-[34px] h-auto w-[min(360px,72vw)]"
          priority
        />
        <h1 className="text-[32px] leading-[1.1] font-extrabold tracking-[-0.045em] text-ds-texte-fort sm:text-[44px]">
          {t(`${etat}.titre`)}
        </h1>
        <p className="mt-4 max-w-[520px] text-[16px] leading-[1.5] text-ds-texte-corps sm:text-[18px]">
          {t(`${etat}.texte`)}
        </p>
        {actionEnCours === null ? null : (
          <form method="post" action={CIBLES_NOTIFICATION[actionEnCours]}>
            <input type="hidden" name="j" value={jeton} />
            <input type="hidden" name="langue" value={locale} />
            {actionEnCours === "desinscrire" ? <input type="hidden" name="retour" value="page" /> : null}
            <button
              type="submit"
              className="mt-8 inline-flex h-14 cursor-pointer items-center gap-2.5 rounded-ds-card bg-ds-accent px-8 text-[16px] font-bold text-ds-texte-sur-marque shadow-ds-brand transition-shadow hover:shadow-ds-brand-hover"
            >
              <span>{t(`${actionEnCours}.bouton`)}</span>
              <ArrowRight aria-hidden="true" size={18} strokeWidth={1.9} />
            </button>
          </form>
        )}
      </main>

      <footer className="flex flex-col items-center gap-2 px-6 pb-[34px]">
        <Image src={logoDropLink} alt="DropLink" height={22} width={Math.round((22 * 2172) / 724)} />
        <span className="text-[12.5px] text-ds-texte-sourdine">
          <a
            href={`/${locale}/docs`}
            target="_blank"
            rel="noopener noreferrer"
            className="-my-3.5 inline-flex min-h-11 items-center px-1.5 font-semibold text-ds-texte-corps hover:underline sm:my-0 sm:min-h-0 sm:px-0"
          >
            {tp("lienInvalideCommentCaMarche")}
          </a>
        </span>
      </footer>
    </div>
  );
}
