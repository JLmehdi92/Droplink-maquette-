import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { onboardingAFaire } from "@/lib/comptes/profil";
import { lireEtatOuDireLaPanne } from "@/lib/comptes/apres-session";
import { estLangueSupportee } from "@/i18n/config";
import { NavigationVendeur, type EntreeNavigation } from "@/components/app/navigation-vendeur";
import { ArrowRight, ChevronsUpDown, Zap } from "lucide-react";
import { LienEcran } from "@/components/lien-ecran";
import { BarreSuperieure } from "@/components/app/barre-superieure";
import { CoqueTiroir } from "@/components/app/coque-tiroir";
import { CoucheV4, ScriptEntreeV4 } from "@/components/app/couche-v4";
import { Annonce } from "@/components/app/annonce";
import { TransitionsEcran } from "@/components/app/transitions-ecran";
import { DetailsFermable } from "@/components/app/details-fermable";
import { LogoDropLink } from "@/components/logo-droplink";
import { BoutonDeconnexion } from "@/components/bouton-deconnexion";
import { LienParametres } from "@/components/app/lien-parametres";
import { compterParEtat } from "@/lib/commandes/liste";
import { compterEnvois } from "@/lib/envois/liste";
import { creerClientServeur } from "@/lib/supabase/server";
import { signerLecture } from "@/lib/storage/r2";

/**
 * Enveloppe de l'espace authentifié.
 *
 * CE LAYOUT N'EST PAS LA PROTECTION, il en est la première couche. Un layout
 * s'exécute avant les pages qu'il contient, mais une Server Action appelée
 * depuis l'une d'elles ne passe PAS par lui : les Server Actions sont des points
 * d'entrée à part entière, atteignables directement par une requête forgée.
 * Chacune porte donc sa propre garde.
 *
 * Ce que ce layout apporte vraiment : un utilisateur non connecté ne voit jamais
 * la coquille d'un écran qu'il n'a pas le droit de voir, et la redirection est
 * faite une fois plutôt que répétée dans chaque page.
 *
 * LE STATUT DU COMPTE EST VÉRIFIÉ EN BASE, à chaque requête, et non lu dans le
 * jeton. Un jeton reste valide jusqu'à son expiration même après une suspension
 * — s'y fier laisserait un compte suspendu travailler jusqu'à une heure de plus,
 * et c'est cette coupure qui fonde notre statut d'hébergeur.
 */
export default async function LayoutApplication({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const langue = estLangueSupportee(locale) ? locale : "fr";
  setRequestLocale(langue);

  const etat = await lireEtatOuDireLaPanne(langue);
  // LA VÉRIFICATION EN DEUX ÉTAPES AVANT « SESSION EXPIRÉE ». Le layout rend en
  // parallèle de la page et sa redirection gagne : sans cette ligne, une session
  // `aal1` était envoyée vers la connexion — mesuré en pilotant, une impasse où
  // le mot de passe juste ramène au même écran.
  if (etat.etat === "verification") redirect(`/${langue}/verification`);
  const profil = etat.etat === "profil" ? etat.profil : null;

  if (profil === null) {
    redirect(`/${langue}/connexion?erreur=session`);
  }

  if (profil.statut === "suspended") {
    // On ne détaille pas le motif ici : l'écran de connexion porte un message
    // neutre. Expliquer une suspension dans l'interface du suspendu revient à
    // lui donner la liste de ce qu'il doit contourner.
    redirect(`/${langue}/connexion?erreur=suspendu`);
  }

  /*
   * L'ONBOARDING N'ÉTAIT POUSSÉ QUE PAR LE RETOUR DU LIEN MAGIQUE.
   *
   * DÉFAUT TROUVÉ PAR AUDIT : ce layout vérifiait la session et le statut, pas
   * le type de compte. Un vendeur qui tapait `/fr/commandes` directement, ou
   * qui revenait en arrière, ou qui avait un signet, employait le produit
   * entier avec `account_type = null` — À VIE.
   *
   * `account_type` est nullable SANS DÉFAUT exprès : un défaut aurait classé
   * tous les fournisseurs comme revendeurs et faussé irrémédiablement la
   * segmentation d'usage, qui est le livrable réel de cette phase. La nullité
   * rend le manque VISIBLE — mais encore faut-il que quelque chose le comble.
   * Sans cette redirection, la nullité voulue devenait un trou permanent que
   * rien ne refermait.
   *
   * LA PAGE D'ONBOARDING A ÉTÉ SORTIE DE CE GROUPE pour que cette redirection
   * ne se retourne pas contre elle. `(app)` est un groupe : il n'apparaît pas
   * dans l'URL, donc le déplacement est invisible du dehors — `/fr/bienvenue`
   * reste `/fr/bienvenue`. Elle porte ses propres gardes de session et de
   * statut, et n'a de toute façon rien à faire de la navigation vendeur : on
   * n'invite pas quelqu'un à parcourir un produit qu'il n'a pas fini
   * d'installer.
   */
  if (onboardingAFaire(profil)) {
    redirect(`/${langue}/bienvenue`);
  }

  const t = await getTranslations("navigation");

  // Signée ici et pas dans chaque écran : ce bloc vit dans le layout, donc une
  // signature par page serait une signature par navigation, pour la même image.
  const logoSigne =
    profil.logoUrl === null
      ? null
      : await signerLecture(profil.logoUrl).catch((erreur: unknown) => {
          // Repli sur les initiales, mais une panne R2 ne passe pas inaperçue.
          console.error("[coque] logo non signé —", erreur instanceof Error ? erreur.message : erreur);
          return null;
        });

  /*
   * LE VOLUME DE COMMANDES, EN COMPTE SUR L'ENTRÉE « Commandes ».
   *
   * ⚠️ UNE LECTURE QUI ÉCHOUE N'AFFICHE PAS ZÉRO. Un « 0 » affirme qu'on a
   * compté et trouvé rien ; l'absence de compte n'affirme rien.
   *
   * ⚠️ LES DEUX LECTURES SONT MENÉES ENSEMBLE : en série, la coque de CHAQUE
   * écran vendeur payerait deux allers-retours au lieu d'un. Et toutes deux
   * passent par `cache` de React : l'écran qui les redemande ne paie rien.
   */
  const [compteurs, envois] = await Promise.all([
    compterParEtat(),
    compterEnvois(await creerClientServeur()).catch((erreur: unknown) => {
      console.error("[coque] envois illisibles —", erreur instanceof Error ? erreur.message : erreur);
      return null;
    }),
  ]);

  const entrees: readonly EntreeNavigation[] = [
    { href: `/${langue}/tableau-de-bord`, libelle: t("tableauDeBord"), icone: "tableau" },
    {
      href: `/${langue}/commandes`,
      libelle: t("mesCommandes"),
      icone: "commandes",
      ...(compteurs === null ? {} : { compte: compteurs.total }),
    },
    { href: `/${langue}/envois`, libelle: t("mesEnvois"), icone: "envois" },
    { href: `/${langue}/analyses`, libelle: t("mesAnalyses"), icone: "analyses" },
    { href: `/${langue}/marque`, libelle: t("maMarque"), icone: "marque" },
    // Les paramètres sont dans le menu à TOUTES les largeurs : la barre d'onglets
    // du bas les excluait faute de place, le tiroir n'a pas cette limite.
    { href: `/${langue}/parametres`, libelle: t("parametres"), icone: "parametres" },
  ];

  /*
   * LA COQUE DE LA REFONTE (maquette, `coque.html`) : une colonne de 236 px posée
   * sur un sol gris, et le contenu sur une FEUILLE blanche arrondie. Sous
   * 1 020 px la colonne devient un tiroir (`CoqueTiroir`), et la feuille touche
   * les bords : l'encadrer coûterait seize pixels de chaque côté sur 390.
   */
  return (
    <div className="page-app v4">
      <ScriptEntreeV4 />
      <CoucheV4 />
      <Annonce />
      {/* Sortie d'un écran, estompe d'une liste qu'on filtre (maquette, `coque.js`). */}
      <Suspense fallback={null}>
        <TransitionsEcran />
      </Suspense>
      {/*
        Le lien d'évitement : sans lui, un vendeur au clavier retraverse les six
        destinations du menu à CHAQUE changement d'écran. Chaque écran déclare
        `id="contenu"`.
      */}
      <a href="#contenu" className="evitement">
        {t("allerAuContenu")}
      </a>
      <CoqueTiroir
        libelles={{ ouvrir: t("ouvrirMenu"), fermer: t("fermerMenu") }}
        barre={
          <>
            {/* Le logo MÈNE AU TABLEAU DE BORD, jamais à la landing : dans son
                espace, le vendeur veut revenir chez lui (Wassim, 26/09/2026). */}
            <Link
              href={`/${langue}/tableau-de-bord`}
              className="logo app__logo"
              aria-label={t("accueilDropLink")}
            >
              <LogoDropLink hauteur={24} />
            </Link>

            <NavigationVendeur entrees={entrees} etiquette={t("espaceVendeur")} />

            {/*
              L'ENCART « Passez au Pro ». La maquette ne le dessine pas, mais le
              produit l'a (« rien ne se perd au portage ») : il mène à l'écran
              « Passer au Pro », et il est MASQUÉ pour un compte Pro — proposer
              l'offre à qui la paie déjà, c'est l'interface qui affirme un état
              que la base contredit.
            */}
            {profil.planPro ? null : (
              <div className="app__pro">
                <span className="app__pro-titre">
                  <Zap aria-hidden="true" className="ic" />
                  {t("pro.titre")}
                </span>
                <span className="app__pro-texte">{t("pro.texte")}</span>
                <LienEcran href={`/${langue}/passer-pro`} className="app__pro-lien">
                  {t("pro.bouton")}
                  <ArrowRight aria-hidden="true" className="ic" />
                </LienEcran>
              </div>
            )}

            {/*
              LE BLOC DE COMPTE PORTE LA DÉCONNEXION : c'est le seul endroit de
              l'écran qui dise QUI est connecté. Un bouton posé ailleurs obligerait
              à se demander quel compte il ferme. Il est rangé derrière un
              `<details>` : un geste destructif à nu, dans le coin le plus survolé
              de l'écran, partirait au premier clic accidentel.
            */}
            <DetailsFermable className="compte">
              <summary>
                {logoSigne !== null ? (
                  /* eslint-disable-next-line @next/next/no-img-element --
                     URL signée à expiration : l'optimiseur de Next la mettrait en
                     cache sous une clé stable et servirait une image dont la
                     signature a expiré. */
                  <img src={logoSigne} alt="" width={30} height={30} className="compte__avatar" />
                ) : (
                  <span className="compte__avatar" aria-hidden="true">
                    {initiales(profil.nomBoutique ?? profil.email)}
                  </span>
                )}
                <span className="compte__qui">
                  <b>{profil.nomBoutique ?? t("monCompte")}</b>
                  <small>{profil.email}</small>
                </span>
                <ChevronsUpDown aria-hidden="true" className="ic" />
              </summary>
              <div className="compte__menu">
                <LienParametres langue={langue} variante="menu" />
                <BoutonDeconnexion langue={langue} variante="menu" />
              </div>
            </DetailsFermable>
          </>
        }
      >
        <BarreSuperieure
          langue={langue}
          jamaisOuvertes={compteurs?.jamaisOuvertes ?? null}
          colisSilencieux={envois?.silencieux ?? null}
        />
        {children}
        {/* Aucun pied dans l'espace vendeur : aucune page de la maquette n'en porte
            (audit final du 03/10/2026). */}
      </CoqueTiroir>
    </div>
  );
}

/**
 * Les initiales d un nom de boutique, ou de l adresse à défaut.
 *
 * Deux lettres au plus : `Avatar` du kit en dessine deux, et trois déborderaient
 * d un disque de 38 px en 14 px de corps.
 */
function initiales(source: string): string {
  const mots = source
    .replace(/@.*$/, "")
    .split(/[\s._-]+/)
    .filter((m) => m !== "");
  const lettres = mots.slice(0, 2).map((m) => m.charAt(0));
  return lettres.join("").toUpperCase() || "?";
}
