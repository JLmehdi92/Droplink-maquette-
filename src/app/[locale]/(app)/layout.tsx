import { redirect } from "next/navigation";
import { FondApplication } from "@/components/app/fond-application";
import { LogoMarque } from "@/components/acces/coque-acces";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { lireEtatDuCompte, onboardingAFaire } from "@/lib/comptes/profil";
import { estLangueSupportee } from "@/i18n/config";
import { NavigationVendeur, type EntreeNavigation } from "@/components/app/navigation-vendeur";
import { ArrowRight, ChevronDown, Zap } from "lucide-react";
import { LienEcran } from "@/components/lien-ecran";
import { BarreSuperieure } from "@/components/app/barre-superieure";
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

  const etat = await lireEtatDuCompte();
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
    profil.logoUrl === null ? null : await signerLecture(profil.logoUrl).catch(() => null);

  /*
   * LE VOLUME DE COMMANDES, EN PASTILLE SUR L ENTRÉE « Commandes ».
   *
   * ⚠️ UNE LECTURE QUI ÉCHOUE N AFFICHE PAS ZÉRO. Un « 0 » affirme qu on a
   * compté et trouvé rien ; l absence de pastille n affirme rien. C est la
   * même règle que le sous-titre de l écran des commandes, et pour la même
   * raison — un nombre crédible et faux fait décider de travers.
   */
  /*
   * ⚠️ LES DEUX LECTURES SONT MENÉES ENSEMBLE, PAS L UNE APRÈS L AUTRE. En série,
   * la coque de CHAQUE écran vendeur payerait deux allers-retours au lieu d un ;
   * elles ne dépendent pas l une de l autre. Et toutes deux passent par `cache`
   * de React : l écran qui les redemande ne paie rien.
   */
  const [compteurs, envois] = await Promise.all([
    compterParEtat(),
    compterEnvois(await creerClientServeur()).catch(() => null),
  ]);

  const entrees: readonly EntreeNavigation[] = [
    /* LE TABLEAU DE BORD EN TÊTE, comme au kit — mais la connexion mène
       toujours aux commandes : voir `tableau-de-bord/page.tsx`. */
    {
      href: `/${langue}/tableau-de-bord`,
      libelle: t("tableauDeBord"),
      libelleCourt: t("tableauDeBordCourt"),
      icone: "tableau",
    },
    {
      href: `/${langue}/commandes`,
      libelle: t("mesCommandes"),
      icone: "commandes",
      ...(compteurs === null ? {} : { compte: compteurs.total }),
    },
    { href: `/${langue}/envois`, libelle: t("mesEnvois"), icone: "envois" },
    { href: `/${langue}/analyses`, libelle: t("mesAnalyses"), icone: "analyses" },
    { href: `/${langue}/marque`, libelle: t("maMarque"), icone: "marque" },
    {
      href: `/${langue}/parametres`,
      libelle: t("parametres"),
      icone: "parametres",
      auTelephone: false,
    },
  ];

  /*
   * LA COQUILLE DU CANEVAS : une carte-page posée sur le fond lavande.
   *
   * Ce n'est pas une bordure décorative. Le fond extérieur borne la largeur du
   * contenu sans le centrer dans du vide : à 2560 px, une application qui
   * s'étale de bord à bord force à balayer l'écran des yeux pour relier une
   * ligne à son action.
   *
   * LE FOND LAVANDE N'EXISTE QU'À PARTIR DE `md`. Au téléphone, encadrer coûte
   * seize pixels de chaque côté sur une largeur de 390 — c'est-à-dire un
   * dixième de la ligne, pris à ce qu'il y a dedans.
   */
  return (
    <div className="min-h-dvh bg-ds-surface-carte md:bg-transparent">
      <FondApplication />
      {/*
        ⚠️ CE LIEN MANQUAIT ICI, ALORS QU'IL EXISTE DANS L'ADMIN.
        Trouvé à l'audit du 31/08/2026. Les deux racines sont structurellement
        identiques — barre latérale au bureau, barre d'onglets au téléphone — et
        les cinq écrans du vendeur déclarent tous `id="contenu"` : la CIBLE
        existait partout, le lien nulle part. Au clavier, un fournisseur à
        200 commandes/semaine retraversait donc quatre destinations de navigation
        à CHAQUE changement de page, sur l'écran le plus utilisé du produit.
      */}
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:flex focus:min-h-11 focus:items-center focus:rounded-lg focus:bg-surface-container-lowest focus:px-4 focus:py-2 focus:font-label-md focus:text-label-md focus:text-on-surface focus:shadow-md"
      >
        {t("allerAuContenu")}
      </a>
      {/*
        ⚠️ PLUS DE CARTE-PAGE NI DE CADRE LAVANDE. Le design system les supprime
        — c'est l'un des six changements declares. La colonne laterale touche
        desormais le bord de l'ecran, et le fond teinte vient de `FondApplication`
        plutot que d'une marge de 20 px autour d'une carte blanche.
      */}
      <div className="relative mx-auto flex w-full flex-col md:min-h-dvh md:flex-row">
        <aside className="hidden border-r border-ds-filet bg-ds-surface-carte px-[18px] pt-[26px] pb-5 md:flex md:w-[264px] md:shrink-0 md:flex-col md:gap-1.5">
          {/* Logo de 38 px avec un retrait de 8 et 24 px sous lui — mesure sur
              la reference, ou il remplace le mot « DropLink » ecrit en dur. */}
          <span className="px-2 pb-6">
            <LogoMarque hauteur={38} />
          </span>

          <NavigationVendeur entrees={entrees} variante="cote" etiquette={t("espaceVendeur")} />

          <div className="flex-grow" />

          {/*
            LA PHASE DE LANCEMENT EST DITE, ET C'EST UNE DÉCISION PRODUIT.
            Le produit est gratuit et sans limite pendant la validation ; ne
            rien dire laisserait un vendeur découvrir un jour une facture qu'il
            n'attendait pas, ou craindre une limite qui n'existe pas.
          */}
          {/*
            L ENCART DU BAS DE COLONNE, AU DESSIN DU KIT : fond teinté, filet
            `violet-200`, rayon carte-lg, `padding: 18`, écart 6, titre de 15 px
            en 700 à l encre d accent précédé d un éclair de 17, texte de 13 px
            en interligne 1,45, bouton de 42 au dégradé de marque.

            ⚠️ CE BLOC A LONGTEMPS DIT « Phase de lancement », ET C ÉTAIT LA
            BONNE DÉCISION JUSQU AU 12/09/2026. Il portait : « le kit y met
            Passez au Pro et un bouton Upgrade, la contrainte n°1 l interdit ».
            Wassim a tranché ce jour-là — « jcompte mettre un pricing genre un
            gratuit et un pro » — et l encart reprend donc le dessin du kit.

            ⚠️ CE QUI N A PAS CHANGÉ : AUCUN CODE DE PAIEMENT. Le bouton mène à
            la section « Gratuit et Pro » de la documentation, exactement comme
            la navigation de la landing du design system envoie « Tarifs » sur
            `/docs#plans`. Il n y a ni Stripe, ni table d abonnement, ni plafond
            appliqué : les limites affichées là-bas ne sont vérifiées nulle part,
            et la page le dit en toutes lettres. *Un bouton qui ne mène nulle
            part serait pire qu une case vide* — celui-ci mène à une page qui
            existe.
          */}
          <div className="flex flex-col gap-1.5 rounded-ds-card-lg border border-ds-violet-200 bg-ds-surface-teinte p-[18px]">
            <span className="flex items-center gap-[9px] text-[15px] leading-[normal] font-bold text-ds-accent-encre">
              <Zap aria-hidden="true" size={17} strokeWidth={2.2} />
              {t("pro.titre")}
            </span>
            <span className="text-[13px] leading-[1.45] text-ds-texte-corps">{t("pro.texte")}</span>
            <LienEcran
              href={`/${langue}/docs#plans`}
              className="degrade-ds-marque mt-2 flex h-[42px] items-center justify-center gap-2 rounded-ds-pill border border-transparent px-[22px] text-[14px] font-semibold tracking-[-0.02em] text-ds-texte-sur-marque shadow-ds-brand transition-shadow hover:shadow-ds-brand-hover"
            >
              {t("pro.bouton")}
              <ArrowRight aria-hidden="true" size={16} strokeWidth={2.2} />
            </LienEcran>
          </div>

          {/*
            LE BLOC DE COMPTE PORTE LA DÉCONNEXION, et c'est le seul endroit
            possible au bureau : c'est le seul de l'écran qui dise QUI est
            connecté. Un bouton posé ailleurs obligerait à se demander quel
            compte il ferme.

            Au téléphone cette barre latérale n'existe pas — la déconnexion y
            vit dans l'en-tête de Commandes, l'écran d'accueil du vendeur.
          */}
          <details className="group relative mt-3">
            {/*
              LE BLOC DE COMPTE DU KIT : bouton pleine largeur, `padding: 12`,
              rayon de carte, filet, fond carte, écart 12, pastille de 38 et
              chevron de 16.

              ⚠️ LE CHEVRON N EST PAS DÉCORATIF — IL OUVRE. Le kit dessine un
              menu ; le produit n en avait aucun et posait la déconnexion à
              nu, c est-à-dire un geste destructif à portée de clic accidentel
              dans le coin le plus survolé de l écran. Un `<details>` le range
              derrière un geste, sans une ligne de JavaScript.
            */}
            <summary className="flex w-full cursor-pointer list-none items-center gap-3 rounded-ds-card border border-ds-filet bg-ds-surface-carte p-3 text-left transition-colors hover:bg-ds-surface-teinte">
            {/*
              LE LOGO DU VENDEUR, LÀ OÙ IL Y AVAIT UN DISQUE GRIS.

              ⚠️ MONTRÉ EN CAPTURE PAR WASSIM LE 03/09/2026 : « j'ai configuré
              ma marque avec mon logo, ici je suis censé avoir mon logo sauf
              que je ne l'ai pas ». Il avait raison, et la cause n'était pas où
              on l'aurait cherchée.

              LA PLANCHE N'EST PAS EN CAUSE, ET IL NE FALLAIT DONC PAS LA
              MODIFIER. Les six planches qui portent ce bloc — `Commandes`,
              `CommandesVide`, `CommandesFiltreVide`, `Envois`, `Analyses`,
              `Marque` — dessinent un disque plein de 32 px en `#e4e2ee`,
              sans image. Mais c'est AUSSI ce que dessinent les quatre planches
              de la page client, où le code rend le vrai logo depuis toujours :
              dans le vocabulaire du canevas, ce disque est l'EMPLACEMENT du
              logo, pas un ornement. Le code était donc incohérent avec
              lui-même, pas avec le dessin.

              `profil.logoUrl` était déjà lu et rendu par `lireProfilVendeur`
              — la donnée arrivait ici depuis le début, personne ne s'en
              servait.

              ⚠️ C'EST UNE CLÉ D'OBJET, PAS UNE URL. La rendre brute dans
              `src` produirait une image cassée ET ferait sortir le `shop_id`
              dans le HTML — c'est le défaut exact déjà corrigé sur la page
              publique, dont `lib/page-publique/lecture.ts` garde la trace.
              Même remède, même repli : une signature qui échoue rend `null`
              et l'écran retombe sur le disque, plutôt que d'emporter la page.
            */}
            {logoSigne !== null ? (
              /* eslint-disable-next-line @next/next/no-img-element --
                 URL signée à expiration : l'optimiseur de Next la mettrait en
                 cache sous une clé stable et servirait une image dont la
                 signature a expiré. Même raison que partout ailleurs. */
              <img
                src={logoSigne}
                alt=""
                width={38}
                height={38}
                className="h-[38px] w-[38px] shrink-0 rounded-ds-pill object-cover"
              />
            ) : (
              /* Sans logo, les initiales sur l accent — l `Avatar` du kit. Un
                 disque gris vide ne dit pas à qui appartient le compte. */
              <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-ds-pill bg-ds-accent text-[14px] font-bold text-ds-texte-sur-marque">
                {initiales(profil.nomBoutique ?? profil.email)}
              </span>
            )}
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[14px] font-bold text-ds-texte-fort">
                {profil.nomBoutique ?? t("monCompte")}
              </span>
              <span className="truncate text-[12px] text-ds-texte-sourdine">{profil.email}</span>
            </span>
            <ChevronDown
              aria-hidden="true"
              size={16}
              strokeWidth={1.8}
              className="shrink-0 text-ds-texte-tenu transition-transform group-open:rotate-180"
            />
            </summary>
            <div className="absolute right-0 bottom-full left-0 z-20 mb-1.5 rounded-ds-card border border-ds-filet bg-ds-surface-carte p-1.5 shadow-ds-lg">
              <LienParametres langue={langue} variante="menu" />
              <BoutonDeconnexion langue={langue} variante="menu" />
            </div>
          </details>
        </aside>

        {/* La marge basse laisse la place à la barre d'onglets, qui est fixe :
            sans elle, la dernière ligne de chaque écran est inatteignable. */}
        <div className="flex min-w-0 flex-1 flex-col pb-[86px] md:pb-0">
          <BarreSuperieure
            langue={langue}
            email={profil.email}
            nomBoutique={profil.nomBoutique}
            logoSigne={logoSigne}
            jamaisOuvertes={compteurs?.jamaisOuvertes ?? null}
            colisSilencieux={envois?.silencieux ?? null}
          />
          {children}
          {/* Le pied du kit : 64 de haut, 12 px, couleur tenue, centré. Il ne
              se rend qu au bureau — au téléphone la barre d onglets occupe déjà
              le bas de l écran, et une mention légale sous elle serait hors de
              portée du pouce comme du regard. */}
          {/* ⚠️ `26px 32px 22px`, MESURÉ SUR LE KIT. Nous posions une hauteur fixe de
              64 sans remplissage : le pied tombait 128 px trop haut sur un écran
              rempli, et sa ligne ne s'alignait sur rien. */}
          <footer className="mt-auto hidden shrink-0 items-center justify-center px-8 pt-[26px] pb-[22px] text-[12px] leading-[normal] text-ds-texte-tenu md:flex">
            {t("piedDePage", { annee: new Date().getFullYear() })}
          </footer>
        </div>
      </div>

      <NavigationVendeur entrees={entrees} variante="bas" etiquette={t("espaceVendeur")} />
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
