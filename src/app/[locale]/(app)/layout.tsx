import { redirect } from "next/navigation";
import { FondApplication } from "@/components/app/fond-application";
import { LogoMarque } from "@/components/acces/coque-acces";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { lireProfilVendeur, onboardingAFaire } from "@/lib/comptes/profil";
import { estLangueSupportee } from "@/i18n/config";
import { NavigationVendeur, type EntreeNavigation } from "@/components/app/navigation-vendeur";
import { BoutonDeconnexion } from "@/components/bouton-deconnexion";
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

  const profil = await lireProfilVendeur();

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

  const entrees: readonly EntreeNavigation[] = [
    { href: `/${langue}/commandes`, libelle: t("mesCommandes"), icone: "inventory_2" },
    { href: `/${langue}/envois`, libelle: t("mesEnvois"), icone: "local_shipping" },
    { href: `/${langue}/analyses`, libelle: t("mesAnalyses"), icone: "monitoring" },
    { href: `/${langue}/marque`, libelle: t("maMarque"), icone: "palette" },
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
          <div className="mb-3.5 rounded-ds-card bg-ds-surface-teinte p-4">
            {/* LE TITRE EST À L'ENCRE, PAS AU VIOLET. La planche n'écrit aucune
                couleur dessus : il hérite de `#0e0e13`. En violet sur fond
                violet clair, il se lisait comme un lien — dans un encart qui
                n'en contient aucun. */}
            <p className="font-label-md text-[13px] font-bold text-on-surface">
              {t("lancement.titre")}
            </p>
            <p className="mt-[5px] font-body-sm text-[12px] leading-[18px] text-sourdine">
              {t("lancement.texte")}
            </p>
          </div>

          {/*
            LE BLOC DE COMPTE PORTE LA DÉCONNEXION, et c'est le seul endroit
            possible au bureau : c'est le seul de l'écran qui dise QUI est
            connecté. Un bouton posé ailleurs obligerait à se demander quel
            compte il ferme.

            Au téléphone cette barre latérale n'existe pas — la déconnexion y
            vit dans l'en-tête de Commandes, l'écran d'accueil du vendeur.
          */}
          <div className="flex items-center gap-2.5 rounded-ds-card p-2">
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
                width={32}
                height={32}
                className="h-8 w-8 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span className="h-8 w-8 shrink-0 rounded-full bg-surface-container-highest" />
            )}
            <div className="min-w-0 flex-grow">
              {profil.nomBoutique !== null ? (
                <p className="truncate font-label-md text-[13px] font-semibold text-on-surface">
                  {profil.nomBoutique}
                </p>
              ) : null}
              <p className="truncate font-body-sm text-[11px] text-on-surface-variant">
                {profil.email}
              </p>
            </div>
            <BoutonDeconnexion langue={langue} variante="cote" />
          </div>
        </aside>

        {/* La marge basse laisse la place à la barre d'onglets, qui est fixe :
            sans elle, la dernière ligne de chaque écran est inatteignable. */}
        <div className="flex min-w-0 flex-1 flex-col pb-[86px] md:pb-0">
          {children}
        </div>
      </div>

      <NavigationVendeur entrees={entrees} variante="bas" etiquette={t("espaceVendeur")} />
    </div>
  );
}
