import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import Link from "next/link";
import { FormulaireConnexion } from "@/components/formulaire-connexion";
import { BoutonGoogle } from "@/components/bouton-google";
import { TraductionsClient } from "@/components/traductions-client";
import { ArrowRight } from "lucide-react";
import {
  ArgumentAcces,
  FondAcces,
  LogoMarque,
  NoteSecurite,
} from "@/components/acces/coque-acces";
import { routing } from "@/i18n/routing";
import { redirect } from "next/navigation";
import { estLangueSupportee } from "@/i18n/config";
import { entreeDejaOuverte } from "@/lib/comptes/apres-session";

/**
 * CONNEXION — deux volets dans la carte-page du canevas.
 *
 * ⚠️ CE COMMENTAIRE DISAIT « PAS DE CHAMP MOT DE PASSE » — décision renversée
 * par Wassim le 01/09/2026. Le lien magique est supprimé du produit : email et
 * mot de passe, et le bouton Google vient après.
 *
 * Ce que l'ancienne rédaction protégeait reste vrai et se déplace : le
 * fournisseur en Chine n'a pas accès à Google, donc le formulaire est en
 * premier et en grand. Mais il n'a plus besoin qu'un email ARRIVE pour entrer —
 * seulement pour réparer un oubli. Voir §2 du brief, amendé le même jour.
 *
 * LA CARTE DE VERRE A DISPARU avec le reste du flou. Le formulaire n'est plus
 * dans une carte du tout : à cette largeur, un cadre autour d'un seul champ
 * n'encadre rien.
 */

export function generateStaticParams(): Array<{ locale: string }> {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "connexion" });
  // Une page de connexion n'a rien à faire dans un index de moteur de recherche.
  return { title: t("titre"), robots: { index: false, follow: false } };
}

/**
 * Les motifs d'échec que la page sait expliquer.
 *
 * INVENTAIRE CLOS, ET LU AVEC. Un motif inconnu — forgé dans l'URL, ou émis par
 * un chemin qui aurait oublié d'ajouter sa traduction — n'affiche RIEN plutôt
 * qu'une clé brute. Mais ce silence a un prix : c'est ainsi que les quatre
 * motifs de la route de retour sont restés muets. Le test de non-régression
 * compare donc cette liste aux motifs réellement émis par le produit.
 */
const MOTIFS = [
  "lien",
  "expire",
  "profil",
  "session",
  "suspendu",
  "indisponible",
  /*
   * `service` : le serveur d'authentification n'a pas répondu. DISTINCT de
   * `session`, qui affirme une expiration, et distinct d'`indisponible`, qui
   * parle de Google. Mesuré le 02/09/2026 : deux éjections sur 200 requêtes,
   * à 11,1 s et 11,4 s — un délai de connexion dépassé — et l'écran disait
   * « Votre session a expiré ». Une affirmation que la base n'avait jamais
   * enregistrée.
   */
  "service",
  "trop",
  "fermees",
  /*
   * `confirmez` : `signUp` a rendu un utilisateur SANS session, ce qui est la
   * façon documentée d'apprendre que la confirmation d'email est active sur le
   * projet. Wassim l'a tranchée à « désactivée », donc ce motif ne devrait
   * jamais s'afficher — mais le réglage vit dans le tableau de bord, hors du
   * dépôt, et personne ici ne peut le garantir. Sans ce motif, l'inscription
   * ramènerait à un écran de connexion muet après avoir bel et bien créé le
   * compte et envoyé l'email.
   */
  "confirmez",
] as const;

function motifConnu(brut: string | undefined): (typeof MOTIFS)[number] | null {
  return MOTIFS.find((m) => m === brut) ?? null;
}

/**
 * Ce que la page sait ANNONCER, par opposition à ce qu'elle sait expliquer.
 *
 * Inventaire clos comme celui des motifs d'échec, et pour la même raison : une
 * valeur forgée dans l'URL n'affiche rien plutôt qu'une clé brute. Mais il est
 * SÉPARÉ, parce qu'un encart rouge sur une déconnexion réussie annoncerait un
 * échec à quelqu'un dont le geste vient de fonctionner.
 */
const INFOS = ["deconnecte", "deconnexion-partielle", "compte-supprime"] as const;

function infoConnue(brut: string | undefined): (typeof INFOS)[number] | null {
  return INFOS.find((i) => i === brut) ?? null;
}

export default async function Connexion({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Une session déjà ouverte ne repasse pas par le formulaire : voir `entreeDejaOuverte`.
  const dejaOuverte = await entreeDejaOuverte(estLangueSupportee(locale) ? locale : "fr");
  if (dejaOuverte !== null) redirect(dejaOuverte);

  const t = await getTranslations("connexion");
  const tl = await getTranslations("landing");

  const parametres = await searchParams;
  const brut = parametres["erreur"];
  const motif = motifConnu(typeof brut === "string" ? brut : undefined);
  const brutInfo = parametres["info"];
  const info = infoConnue(typeof brutInfo === "string" ? brutInfo : undefined);

  return (
    <>
      <FondAcces />
      {/*
       * LA PAGE, SUR LA GÉOMÉTRIE DE LA RÉFÉRENCE : padding 40/56/32 au bureau,
       * resserré au téléphone où encadrer coûterait un dixième de la largeur.
       */}
      {/* `leading-[normal]` : le kit ne pose aucun interligne sur ses libellés,
          et la page héritait de 1,5 — 3 à 6 px de trop par libellé. */}
      <div className="relative flex min-h-dvh flex-col px-4 pt-[22px] pb-6 leading-[normal] md:px-14 md:pt-10 md:pb-8">
        <header className="flex flex-wrap items-center gap-3">
          {/*
            ⚠️ `min-h-11` MALGRÉ UNE IMAGE DÉJÀ HAUTE DE 44 PX, et ce n'est pas
            une redondance : si le logo ne se charge pas — 404, réseau coupé,
            format refusé — le lien s'effondre à la hauteur de son texte
            alternatif, et la cible disparaît avec lui. Le plancher tient
            indépendamment de ce que le réseau rend.
          */}
          <Link href={`/${locale}`} className="inline-flex min-h-11 items-center">
            <LogoMarque hauteur={44} className="md:h-13 md:w-auto" />
          </Link>
          <span className="flex-1" />
          <span className="hidden text-[14px] text-ds-texte-corps sm:inline md:mr-[18px]">
            {t("pasDeCompteTitre")}
          </span>
          {/* L'action secondaire de l'en-tête : pilule, 52 px, dégradé de marque.
              C'est la SEULE action au dégradé de cet écran avec le bouton du
              formulaire — or la règle en autorise UNE. Celle-ci est donc en
              contour, et le dégradé reste au formulaire, qui est ce qu'on vient
              faire ici. */}
          <Link
            href={`/${locale}/inscription`}
            className="inline-flex h-11 items-center gap-2 rounded-ds-pill border border-ds-filet-appuye bg-ds-surface-carte px-4 text-[14px] font-semibold md:h-13 md:px-5 md:text-[15px] text-ds-texte-fort transition-shadow hover:shadow-ds-sm"
          >
            {t("lienCreerCompte")}
            <ArrowRight aria-hidden="true" size={18} strokeWidth={1.8} />
          </Link>
        </header>

        <main
          id="contenu"
          /* ⚠️ UNE COLONNE DÉCLARÉE SOUS `lg`, ET NON LA PISTE IMPLICITE. Sans
             modèle, la grille crée une piste `auto` qui prend la largeur
             MINIMALE de son contenu : le champ mot de passe en réclamait 330,
             et la carte débordait l'écran de 8 px à 390 — mesuré le
             13/09/2026, dans les trois langues. `minmax(0,1fr)` borne la piste
             à la largeur disponible. */
          className="grid flex-1 grid-cols-[minmax(0,1fr)] items-start gap-20 py-5 lg:grid-cols-[minmax(0,1fr)_520px] lg:items-center lg:py-12"
        >
          {/* MASQUÉ SOUS `lg`, ET C'EST LE POINT. Cette colonne ne porte aucune
              information dont la connexion dépende : sur un écran étroit elle
              disparaît entièrement, sans que rien ne manque. */}
          {/* CALÉE EN HAUT, PAS CENTRÉE. Au kit, cette colonne est la plus haute
              de la grille et commence donc à son bord ; la nôtre, sans preuve
              sociale ni rangée de places de marché, est plus courte, et le
              centrage la faisait descendre de 140 px. */}
          <div className="hidden self-start lg:block">
            <ArgumentAcces />
          </div>

          <div className="mx-auto flex w-full max-w-[520px] flex-col gap-[22px] rounded-ds-3xl bg-ds-surface-carte px-5 pt-6 pb-[30px] shadow-ds-lg md:px-12 md:py-11">
            <div className="flex flex-col items-center gap-[14px]">
              <LogoMarque hauteur={46} className="h-10 w-auto md:h-[46px]" />
              <h1 className="text-[24px] leading-[1.1] font-extrabold tracking-[-0.04em] text-ds-texte-titre md:text-[34px]">
                {t("titre")}
              </h1>
              {/* 1,55 : l'interligne que le kit donne à tout paragraphe. */}
              <p className="text-center text-[15px] leading-[1.55] text-ds-texte-corps">
                {t("sousTitre")}
              </p>
            </div>

            {/* CE QUI A ÉCHOUÉ EST DIT. La route de retour redirige ici avec son
                motif depuis le premier jour, et rien ne l'affichait : un lien
                expiré ramenait l'utilisateur sur un écran identique à celui
                qu'il venait de quitter, sans un mot. Il recommence, échoue
                pareil, et conclut que le produit ne marche pas.

                `role="alert"` et non un simple paragraphe : le message apparaît
                après une navigation, donc hors du champ de quelqu'un qui
                emploie un lecteur d'écran. */}
            {motif === null ? null : (
              <p
                role="alert"
                className="rounded-ds-card border border-ds-erreur bg-ds-erreur-fond p-4 text-[14px] text-ds-erreur-encre"
              >
                {t(`motif.${motif}`)}
              </p>
            )}

            {/* NEUTRE, PAS ROUGE. Une déconnexion réussie est une confirmation :
                `role="status"` et non `alert`, filet ordinaire et non filet
                d'erreur. Elle est annoncée parce que l'écran de connexion
                ressemble beaucoup à celui qu'on quitte — sans un mot, on peut
                croire que le bouton n'a rien fait. */}
            {info === null ? null : (
              <p
                role="status"
                className="rounded-ds-card border border-ds-filet bg-ds-surface-creux p-4 text-[14px] text-ds-texte-corps"
              >
                {t(`info.${info}`)}
              </p>
            )}

            <TraductionsClient espaces={["connexion"]}>
              <FormulaireConnexion locale={locale} />
            </TraductionsClient>

            {/* APRÈS le formulaire, et non avant : Google est inaccessible au
                fournisseur en Chine. Le placer en tête ferait passer pour
                secondaire le chemin qui, pour toute une part des utilisateurs,
                est le seul qui existe. */}
            <BoutonGoogle locale={locale} separateur={{ position: "avant", cle: "ouAvec" }} />

            <p className="text-center text-[14px] text-ds-texte-corps">
              {t("pasDeCompteTitre")}{" "}
              <Link
                href={`/${locale}/inscription`}
                className="font-bold text-ds-texte-lien hover:underline"
              >
                {t("lienCreerCompte")}
              </Link>
            </p>

            <NoteSecurite />
          </div>
        </main>

        {/*
          LE PIED DU KIT : la documentation et le droit d'auteur, en 12 px.

          ⚠️ LA PHRASE DE CONSENTEMENT N'EST PLUS ICI, et ce n'est pas un oubli.
          Elle datait de la planche du canevas ; le kit `auth` ne la pose que là
          où l'on ACCEPTE quelque chose, c'est-à-dire à l'inscription, qui la
          garde. Se reconnecter à un compte n'accepte rien de nouveau.
        */}
        <footer className="flex items-end">
          <span className="text-[12px] text-ds-texte-tenu">
            <Link
              href={`/${locale}/docs`}
              className="-my-3.5 inline-flex min-h-11 items-center font-semibold text-ds-texte-corps hover:underline lg:my-0 lg:min-h-0"
            >
              {tl("menu.docs")}
            </Link>
            {"  ·  "}
            {tl("piedDroits", { annee: new Date().getFullYear() })}
          </span>
        </footer>
      </div>
    </>
  );
}
