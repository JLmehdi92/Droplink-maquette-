import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import Link from "next/link";
import { Icone } from "@/components/icone";
import { routing } from "@/i18n/routing";
import { signalementDisponible } from "@/lib/contact";
import { alternatesDe, openGraphDe } from "@/lib/seo/alternates";
import { donneesStructurees } from "@/lib/seo/donnees-structurees";
import { estLangueSupportee, LANGUE_DEFAUT } from "@/i18n/config";

/**
 * LA LANDING, portée sur `Main` (bureau) et `LandingMobile` (téléphone).
 *
 * UNE CARTE-PAGE BLANCHE POSÉE SUR LE FOND LAVANDE, et tout le reste dedans :
 * navigation, héros, scène du téléphone, bénéfices, appel final, pied.
 *
 * ⚠️ LA CARTE-PAGE N'A PAS LE MÊME RAYON SUR LES DEUX PLANCHES : 28 au bureau,
 * **24 au téléphone**, avec 12 px de lavande autour au lieu de 28. Le code
 * rendait la carte À BORD PERDU sur téléphone — aucune marge, aucun rayon —
 * donc la seule page publique qui ne ressemblait pas à une carte.
 *
 * LE MOUVEMENT EST CONFINÉ À LA SCÈNE DU TÉLÉPHONE, à la demande explicite de
 * Wassim, et il est PUREMENT DÉCORATIF : halos, anneaux, points. Rien n'y porte
 * d'information, donc rien ne se perd quand `prefers-reduced-motion` le coupe —
 * c'est la condition pour avoir le droit de le couper.
 *
 * LE TÉLÉPHONE MONTRE LA PAGE CLIENT, pas une image de synthèse. C'est le
 * produit qu'on vend : une capture inventée serait la seule chose de cette page
 * qu'on ne pourrait pas tenir.
 *
 * DEUX EMPLACEMENTS PORTENT UN CONTENU QUE NOUS N'AVONS PAS ENCORE, et ils le
 * DISENT plutôt que de l'inventer : le nombre de vendeurs et les logos clients.
 * Les planches les marquent `[NOMBRE]` et `[LOGOS À FOURNIR]`. Wassim a tranché
 * le 27/08/2026 : ON NE LES FAIT PAS. Un chiffre inventé sur une landing est un
 * mensonge qui se mesure, et « 0 vendeur l'utilise déjà » serait pire que rien.
 * Ils sont donc OMIS, et l'espace se referme.
 *
 * ⚠️ LE QUATRIÈME LIEN DE NAVIGATION, « AIDE », N'EST PAS PORTÉ. Les deux
 * planches le dessinent ; le produit n'a AUCUNE page d'aide, et les trois
 * autres liens sont des ancres vers des sections de cette page. Un lien de
 * navigation vers un 404, sur la seule page que tout le monde voit, est pire
 * qu'un lien manquant — c'est la même règle que le lien de signalement, qui
 * disparaît quand son canal n'existe pas. ⚠️ À POSER À WASSIM : veut-il une
 * page d'aide, et sur quel contenu ?
 *
 * ⚠️ DEUX VIOLETS PÂLES COHABITENT DANS LE CANEVAS, et c'est mesuré : les deux
 * planches de la landing posent `#efeaff` sur le fond des icônes, les seize
 * autres posent `#f1eefe` — 2 occurrences contre 25. L'écart entre les deux est
 * d'une unité perceptible ; le produit garde `violet-fond`, la valeur
 * systématique, plutôt que d'ajouter un quinzième ton de palette pour deux
 * emplois. ⚠️ À SIGNALER À WASSIM : c'est la planche qui fait foi, mais ici
 * elle se contredit elle-même.
 *
 * LE DÉGRADÉ EST SUR L'ACTION PRINCIPALE, et sur elle seule — elle apparaît
 * deux fois, en haut et en bas, parce que la page est longue et que c'est la
 * même action.
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
  const t = await getTranslations({ locale, namespace: "landing" });
  const langue = estLangueSupportee(locale) ? locale : LANGUE_DEFAUT;
  return {
    title: t("metaTitre"),
    description: t("metaDescription"),
    alternates: alternatesDe(langue, ""),
    openGraph: openGraphDe(langue, "", {
      titre: t("metaTitre"),
      description: t("metaDescription"),
    }),
  };
}

export default async function Accueil({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const langue = estLangueSupportee(locale) ? locale : LANGUE_DEFAUT;
  const t = await getTranslations("landing");
  const nav = await getTranslations("navigation");

  /*
   * L EYEBROW DU KIT, MESURE SUR SA PAGE SERVIE : 11/700 a l interlettrage de
   * 0,12em, en accent-encre sur la teinte lavande, rayon pilule, padding
   * 6px 14px. Il etait ici en 10/600 sur une carte bordee, a 0,04em.
   *
   * ⚠️ 11,5 px ET NON 11. Le kit ecrit 11 ; le plancher de la regle 5 est 11,5
   * au telephone, et cette pilule y est rendue.
   */
  const pilule =
    "inline-flex items-center gap-[7px] rounded-ds-pill bg-ds-surface-teinte px-3.5 py-1.5 text-[11.5px] leading-[15px] font-bold tracking-[0.12em] text-ds-accent-encre uppercase";

  /*
   * L'ACTION PRINCIPALE EST PLEINE LARGEUR AU TÉLÉPHONE. `LandingMobile` pose
   * `width: 100%` sur le dégradé : dans 350 px de carte, un bouton qui n'occupe
   * que son texte laisse deux zones mortes de part et d'autre, à l'endroit
   * exact où le pouce arrive.
   */
  const actionPrincipale =
    "degrade-ds-marque flex min-h-13 w-full items-center justify-center gap-[9px] rounded-full px-[30px] text-[15px] font-bold shadow-[0_10px_26px_-10px_rgba(124,92,245,0.6)] transition-opacity hover:opacity-90 md:inline-flex md:h-13 md:w-auto md:min-h-0 md:shadow-[0_10px_26px_-10px_rgba(124,92,245,0.65)]";

  const lienMenu =
    "text-[14px] leading-[18px] font-medium text-ds-texte-corps transition-colors hover:text-ds-accent";

  const sections = ["fonctionnement", "clientVoit", "tarif"] as const;

  /*
   * LE GRAPHE JSON-LD, RENDU CÔTÉ SERVEUR.
   *
   * ⚠️ CÔTÉ SERVEUR N'EST PAS UN DÉTAIL D'IMPLÉMENTATION. Google traite les
   * données structurées injectées par JavaScript avec un retard qui se compte
   * en jours, et ne rend pas du tout le JS sur une page en statut non-200. Un
   * graphe posé par un effet client existerait pour un navigateur et pour
   * personne d'autre.
   *
   * ⚠️ ET `dangerouslySetInnerHTML` EST ICI LE SEUL CHEMIN CORRECT, alors que
   * le reste du produit n'en contient aucun. React échapperait `<`, `>` et `&`
   * en entités dans un nœud texte — le JSON-LD deviendrait illisible pour un
   * analyseur. La valeur ne vient d'aucune entrée utilisateur : elle est
   * construite ici à partir du catalogue et de la configuration. Le seul
   * caractère à neutraliser est `<`, qui pourrait fermer la balise.
   */
  const graphe = donneesStructurees(langue, {
    nom: "DropLink",
    description: t("metaDescription"),
  });

  return (
    <div className="bg-ds-surface-page">
      {graphe === null ? null : (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(graphe).replace(/</g, "\u003c"),
          }}
        />
      )}
      {/* ⚠️ PLUS DE CARTE-PAGE. Le design system supprime le cadre exterieur —
          « carte blanche sur `#c5cbfb` → aucun cadre ». La largeur bornee reste :
          le kit compose sa landing sur 1347 px de contenu a 1690 de fenetre, et
          une ligne de prose qui traverse un ecran large ne se lit pas. */}
      <div className="mx-auto w-full max-w-[1384px] overflow-hidden bg-ds-surface-page">
        {/* ---- NAVIGATION ------------------------------------------------ */}
        <header className="flex items-center justify-between gap-6 px-5 py-[18px] md:px-10 md:py-[22px]">
          <span className="text-[17px] leading-[22px] font-extrabold tracking-[-0.02em] text-ds-texte-titre md:text-[18px] md:leading-[23px]">
            DropLink
          </span>

          <nav aria-label={nav("espaceVendeur")} className="hidden gap-[30px] md:flex">
            {sections.map((clef) => (
              <a key={clef} href={"#" + clef} className={lienMenu}>
                {t("menu." + clef)}
              </a>
            ))}
          </nav>

          {/*
            DEUX BOUTONS, ET C EST LE KIT QUI LES COMPTE. Il pose « Se
            connecter » en pilule BLANCHE bordee et « Créer un compte » en
            pilule DEGRADEE, toutes deux a 36 px de haut, `padding 0 16px`,
            13/600 en -0,02em. Il n y en avait qu un, en pilule NOIRE — le
            chrome de l ancien canevas, dont `CLAUDE.md` dit qu il est mort.

            ⚠️ ILS PASSENT A 44 px AU TELEPHONE. Le kit dessine 36 ; ces deux
            liens y sont rendus, et 36 se rate au pouce. C est la regle 5, et
            elle prime sur la valeur du kit partout ou les deux se contredisent.

            « CRÉER UN COMPTE » MENE A UNE ROUTE QUI EXISTE — `/inscription`.
            C est la difference avec « Tarifs » et « Documentation », que le kit
            dessine aussi et qui ne menent nulle part chez nous : une entree de
            navigation vers un 404 est pire qu une entree absente.
          */}
          <div className="hidden items-center gap-2.5 md:flex">
            <Link
              href={`/${locale}/connexion`}
              className="inline-flex h-11 items-center rounded-ds-pill border border-ds-filet bg-ds-surface-carte px-4 text-[13px] font-semibold tracking-[-0.02em] text-ds-texte-fort shadow-ds-xs transition-colors hover:bg-ds-surface-teinte"
            >
              {nav("seConnecter")}
            </Link>
            <Link
              href={`/${locale}/inscription`}
              className="degrade-ds-marque inline-flex h-11 items-center gap-2 rounded-ds-pill px-4 text-[13px] font-semibold tracking-[-0.02em] text-ds-texte-sur-marque shadow-ds-brand transition-shadow hover:shadow-ds-brand-hover"
            >
              {nav("creerCompte")}
              <Icone nom="arrow_forward" className="text-[13px]" />
            </Link>
          </div>

          {/*
            LE MENU DU TÉLÉPHONE, en `<details>` et sans une ligne de
            JavaScript. `LandingMobile` dessine un bouton de 44 px ; un bouton
            qui n'ouvre rien serait un dessin, pas une navigation. Échap le
            referme, le clavier l'atteint, et il fonctionne avant l'hydratation
            — ce qui compte sur la page qu'on ouvre depuis un message privé.
          */}
          <details name="menu-landing" className="relative md:hidden">
            <summary className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full bg-ds-surface-creux text-ds-texte-titre [&::-webkit-details-marker]:hidden">
              <Icone nom="menu" titre={nav("espaceVendeur")} className="text-[18px]" />
            </summary>
            <nav
              aria-label={nav("espaceVendeur")}
              className="absolute right-0 z-20 mt-2 flex w-60 flex-col gap-1 rounded-lg border border-ds-filet bg-ds-surface-carte p-2 shadow-[0_18px_40px_-14px_rgba(14,14,19,0.22)]"
            >
              {sections.map((clef) => (
                <a
                  key={clef}
                  href={"#" + clef}
                  className="flex min-h-11 items-center rounded-md px-3 text-[14px] font-medium text-ds-texte-corps"
                >
                  {t("menu." + clef)}
                </a>
              ))}
              <Link
                href={`/${locale}/connexion`}
                className="flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-[18px] text-[13px] font-semibold text-on-primary"
              >
                {nav("seConnecter")}
                <Icone nom="open_in_new" className="text-[13px]" />
              </Link>
            </nav>
          </details>
        </header>

        <main id="contenu">
          {/* ---- HÉROS --------------------------------------------------- */}
          <section className="relative overflow-hidden px-5 pt-[22px] text-center md:px-10 md:pt-[46px]">
            {/* Le mot en très grand derrière le titre. `aria-hidden` : il est
                déjà lu dans la navigation, et un lecteur d'écran n'a rien à
                faire d'un décor typographique. Absent de la planche mobile. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-[78px] hidden text-center text-[216px] leading-none font-extrabold tracking-[-0.05em] text-ds-surface-creux select-none md:block"
            >
              DROPLINK
            </span>

            <div className="relative">
              <h1 className="mx-auto max-w-[830px] text-[38px] leading-[1.02] font-extrabold tracking-[-0.045em] text-ds-texte-titre md:text-[64px] md:leading-[0.98]">
                {t("heroTitre")}
              </h1>
              {/* Deux textes, pas un texte coupé : la planche mobile RÉÉCRIT
                  la phrase plus court, elle ne la tronque pas. */}
              <p className="mx-auto mt-4 mb-6 max-w-[540px] text-[15px] leading-[1.55] text-ds-texte-corps md:mt-5 md:mb-[30px] md:text-[17px] md:leading-[1.55]">
                <span className="md:hidden">{t("heroSousTitreCourt")}</span>
                <span className="hidden md:inline">{t("heroSousTitre")}</span>
              </p>
              <Link href={`/${locale}/inscription`} className={actionPrincipale}>
                {t("ctaPrincipal")}
                <Icone nom="arrow_forward" className="text-[15px]" />
              </Link>
            </div>
          </section>

          {/* ---- CE QUE VOIT LE CLIENT : LE TITRE, PUIS LA SCÈNE ---------
           *
           * ⚠️ CE TITRE N'EXISTAIT QUE COMME `aria-label`, ET C'ÉTAIT UN TROU.
           * La section occupe 500 px, elle est citée dans le menu de
           * navigation — et elle n'annonçait son sujet à personne d'autre
           * qu'un lecteur d'écran. Ni un visiteur pressé ni un moteur ne
           * pouvaient savoir ce qu'ils regardaient.
           *
           * Les deux planches le portent depuis le 08/09/2026 : le canevas
           * d'abord, l'implémentation ensuite — jamais l'inverse.
           *
           * ⚠️ `aria-labelledby` REMPLACE `aria-label`, IL NE S'Y AJOUTE PAS.
           * Garder les deux ferait exister deux sources pour le même nom, qui
           * divergeraient au premier ajustement de l'une — et c'est celle
           * qu'on ne voit pas qui gagnerait.
           */}
          <h2
            id="titre-client-voit"
            className="mx-auto mt-[34px] max-w-[760px] px-5 text-center text-[26px] leading-[1.05] font-extrabold tracking-[-0.045em] text-ds-texte-titre md:mt-10 md:px-0 md:text-[44px]"
          >
            {t("destinataireTitre")}
          </h2>
          <section
            id="clientVoit"
            aria-labelledby="titre-client-voit"
            className="relative mt-[18px] h-[386px] overflow-hidden md:mt-[22px] md:h-[500px]"
          >
            {/* DÉCOR. Purement décoratif, entièrement `aria-hidden`. */}
            <div aria-hidden="true">
              <div className="anim-halo absolute top-10 left-1/2 -ml-[310px] hidden h-[480px] w-[620px] rounded-full bg-[radial-gradient(circle,rgba(124,92,245,0.16)_0%,rgba(255,255,255,0)_66%)] md:block" />
              <div className="anim-anneau absolute top-[84px] left-[168px] hidden h-[132px] w-[132px] rounded-full border-[1.5px] border-[#ddd5fb] xl:block" />
              <div
                className="anim-anneau absolute top-[288px] right-[152px] hidden h-24 w-24 rounded-full border-[1.5px] border-[#fbd9d0] xl:block"
                style={{ animationDelay: "2.4s" }}
              />
              <div className="anim-derive absolute top-[336px] left-[330px] hidden h-7 w-7 rounded-[9px] bg-[rgba(124,92,245,0.18)] xl:block" />
              <div
                className="anim-derive absolute top-[74px] right-[336px] hidden h-5 w-5 rounded-[7px] bg-[rgba(242,118,94,0.24)] xl:block"
                style={{ animationDelay: "4s" }}
              />
              <div
                className="anim-derive absolute top-[402px] left-[232px] hidden h-3 w-3 rounded-full bg-[rgba(242,118,94,0.4)] xl:block"
                style={{ animationDelay: "7s" }}
              />
              <div
                className="anim-derive absolute top-[154px] right-[218px] hidden h-3.5 w-3.5 rounded-full bg-[rgba(124,92,245,0.3)] xl:block"
                style={{ animationDelay: "9.5s" }}
              />
            </div>

            {/*
              LE TÉLÉPHONE. Aperçu de la page client : en-tête au dégradé, la
              FRISE d'expédition, puis la grille de photos.

              ⚠️ L'ORDRE ÉTAIT INVERSÉ. Le code posait quatre carrés de couleur
              PUIS la frise ; les deux planches posent la FRISE en premier et les
              photos en 2×2 en dessous. Ce n'est pas un détail de dessin : c'est
              l'ordre de la vraie page client, et cette vignette est censée la
              montrer. Une capture qui ne correspond pas au produit est la seule
              chose de cette page qu'on ne pourrait pas tenir.
            */}
            <div className="absolute top-0 left-1/2 h-[434px] w-[228px] -translate-x-1/2 rounded-[34px] bg-primary p-[7px] shadow-[0_30px_60px_-24px_rgba(14,14,19,0.5)] md:h-[578px] md:w-[330px] md:rounded-[42px] md:p-[9px] md:shadow-[0_40px_80px_-30px_rgba(14,14,19,0.45)]">
              <div className="h-full w-full overflow-hidden rounded-[28px] bg-ds-surface-carte md:rounded-[34px]">
                <div className="degrade-ds-marque h-[74px] px-3.5 pt-[22px] md:h-[92px] md:px-[18px] md:pt-[30px]">
                  <div className="flex items-center gap-[7px] md:gap-2">
                    <span className="h-[19px] w-[19px] rounded-full bg-white/30 md:h-6 md:w-6" />
                    <span className="text-[11.5px] leading-[15px] font-bold text-white md:text-[13px] md:leading-4">
                      {t("apercuBoutique")}
                    </span>
                  </div>
                  <p className="mt-[7px] text-[16px] leading-[21px] font-extrabold tracking-[-0.02em] text-white md:mt-[9px] md:text-[19px] md:leading-6">
                    {t("apercuTitre")}
                  </p>
                </div>

                <div className="p-[11px] md:px-3.5 md:pt-3.5">
                  <div className="mb-2.5 grid grid-cols-4 gap-[3px] md:mb-3 md:gap-1">
                    <span className="h-1 rounded-full bg-ds-accent" />
                    <span className="h-1 rounded-full bg-ds-accent" />
                    <span className="h-1 rounded-full bg-ds-accent" />
                    <span className="h-1 rounded-full bg-ds-surface-creux" />
                  </div>
                  <div className="grid grid-cols-2 gap-[5px] md:gap-1.5">
                    {["#e4e2ee", "#eee4e0", "#e0e4ee", "#eaeaef"].map((teinte) => (
                      <span
                        key={teinte}
                        className="block aspect-square rounded-[9px] md:rounded-[10px]"
                        style={{ backgroundColor: teinte }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/*
              LES CARTES FLOTTANTES.

              ⚠️ ELLES SONT ANCRÉES AU CENTRE, PAS AUX BORDS. Les planches les
              posent en `left: 232px` d'un conteneur de 1 384 : recopier cette
              valeur les fait dériver vers le téléphone dès que la fenêtre
              rétrécit, et à 1 024 la seconde le RECOUVRE. Ancrées au centre,
              leur distance à l'appareil qu'elles commentent ne dépend plus de la
              largeur — et à 1 384 elles retombent exactement sur la planche.

              TROIS AU BUREAU LARGE, DEUX AU TÉLÉPHONE, aucune entre les deux :
              la planche mobile n'en garde que deux, plus courtes, et entre 768
              et 1 279 le téléphone est déjà à sa taille de bureau sans que la
              carte-page soit assez large pour les loger.
            */}
            <div className="anim-flot absolute top-24 left-2.5 flex items-center gap-[9px] rounded-[13px] bg-ds-surface-carte px-3 py-2.5 shadow-[0_16px_34px_-12px_rgba(14,14,19,0.26)] md:hidden">
              <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-ds-surface-teinte">
                <Icone nom="image" className="text-[16px] text-ds-accent" />
              </span>
              <span className="text-[12px] leading-[15px] font-bold text-ds-texte-titre">
                {t("flottant.photosCourt")}
              </span>
            </div>

            <div
              className="anim-flot absolute top-[210px] right-2 flex items-center gap-[9px] rounded-[13px] bg-ds-surface-carte px-3 py-2.5 shadow-[0_16px_34px_-12px_rgba(14,14,19,0.26)] md:hidden"
              style={{ animationDelay: "1.6s" }}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-ds-erreur-fond">
                <Icone nom="local_shipping" className="text-[16px] text-ds-erreur" />
              </span>
              <span className="text-[12px] leading-[15px] font-bold text-ds-texte-titre">
                {t("flottant.transitCourt")}
              </span>
            </div>

            {(
              [
                {
                  clef: "photos",
                  icone: "image",
                  peau: "bg-ds-surface-teinte text-ds-accent",
                  place: "top-[150px] left-[calc(50%-460px)] w-[264px]",
                  delai: "0s",
                },
                {
                  clef: "transit",
                  icone: "local_shipping",
                  peau: "bg-ds-erreur-fond text-ds-erreur",
                  place: "top-[262px] right-[calc(50%-484px)] w-[274px]",
                  delai: "1.6s",
                },
                {
                  clef: "valide",
                  icone: "done",
                  peau: "bg-ds-succes-fond text-ds-succes",
                  place: "bottom-[34px] left-[calc(50%-424px)] w-[242px]",
                  delai: "3.2s",
                },
              ] as const
            ).map((carte) => (
              <div
                key={carte.clef}
                className={
                  "anim-flot absolute hidden items-center gap-[11px] rounded-[14px] bg-ds-surface-carte px-3.5 py-3 shadow-[0_18px_40px_-14px_rgba(14,14,19,0.22)] xl:flex " +
                  carte.place
                }
                style={{ animationDelay: carte.delai }}
              >
                <span
                  className={
                    "flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] " +
                    carte.peau
                  }
                >
                  <Icone nom={carte.icone} className="text-[19px]" />
                </span>
                <span>
                  <span className="block text-[13px] leading-4 font-bold text-ds-texte-titre">
                    {t("flottant." + carte.clef + "Titre")}
                  </span>
                  <span className="mt-px block text-[11.5px] leading-[15px] text-ds-texte-corps">
                    {t("flottant." + carte.clef + "Texte")}
                  </span>
                </span>
              </div>
            ))}
          </section>

          {/* ---- BÉNÉFICES ----------------------------------------------- */}
          <section
            id="fonctionnement"
            className="bg-ds-surface-creux px-5 pt-11 pb-12 md:px-10 md:pt-[66px] md:pb-[74px]"
          >
            <div className="text-center">
              <span className={pilule}>{t("beneficesPilule")}</span>
              <h2 className="mt-4 mb-7 text-[30px] leading-[35px] font-extrabold tracking-[-0.03em] text-ds-texte-titre md:mt-5 md:mb-0 md:text-[46px] md:leading-[52px]">
                {t("beneficesTitre")}
              </h2>
              {/* La planche mobile SUPPRIME ce paragraphe : trois cartes qui se
                  suivent en colonne disent déjà ce qu'il annonçait. */}
              <p className="mx-auto mt-4 mb-11 hidden max-w-[560px] text-[16px] leading-[26px] text-ds-texte-corps md:block">
                {t("beneficesTexte")}
              </p>
            </div>

            <ul className="grid gap-3.5 text-left md:grid-cols-3 md:gap-5">
              {(
                [
                  ["medias", "download", "bg-ds-surface-teinte text-ds-accent"],
                  ["suivi", "schedule", "bg-ds-erreur-fond text-ds-erreur"],
                  // ⚠️ LE TROISIÈME EST VERT sur les deux planches. Le code le
                  // rendait GRIS, faute de famille verte dans l'ancien thème —
                  // elle existe désormais (`succes-pastel` / `succes`).
                  ["marque", "link", "bg-ds-succes-fond text-ds-succes"],
                ] as const
              ).map(([clef, icone, teinte]) => (
                <li
                  key={clef}
                  className="rounded-lg border border-ds-filet bg-ds-surface-carte p-[22px] md:p-[26px]"
                >
                  <span
                    className={
                      "flex h-10 w-10 items-center justify-center rounded-[12px] md:h-[42px] md:w-[42px] " +
                      teinte
                    }
                  >
                    <Icone nom={icone} className="text-[20px] md:text-[21px]" />
                  </span>
                  <h3 className="mt-4 mb-[7px] text-[17px] leading-[22px] font-bold tracking-[-0.015em] text-ds-texte-titre md:mt-[18px] md:mb-2 md:text-[18px] md:leading-[23px]">
                    {t("fonctionnalites." + clef + "Titre")}
                  </h3>
                  <p className="text-[14px] leading-[22px] text-ds-texte-corps">
                    <span className="md:hidden">{t("fonctionnalites." + clef + "TexteCourt")}</span>
                    <span className="hidden md:inline">{t("fonctionnalites." + clef + "Texte")}</span>
                  </p>
                </li>
              ))}
            </ul>
          </section>

          {/* ---- APPEL FINAL --------------------------------------------- */}
          <section id="tarif" className="px-5 py-12 text-center md:px-10 md:py-[76px]">
            <h2 className="mb-3 text-[28px] leading-[34px] font-extrabold tracking-[-0.03em] text-ds-texte-titre md:mb-3.5 md:text-[42px] md:leading-[48px]">
              <span className="md:hidden">{t("finalTitreCourt")}</span>
              <span className="hidden md:inline">{t("finalTitre")}</span>
            </h2>
            <p className="mb-6 text-[15px] leading-6 text-ds-texte-corps md:mb-[30px] md:text-[16px] md:leading-[26px]">
              <span className="md:hidden">{t("gratuitPourLInstantCourt")}</span>
              <span className="hidden md:inline">{t("gratuitPourLInstant")}</span>
            </p>
            <Link href={`/${locale}/inscription`} className={actionPrincipale}>
              {t("ctaPrincipal")}
              <Icone nom="arrow_forward" className="text-[15px]" />
            </Link>
          </section>
        </main>

        {/* ---- PIED ------------------------------------------------------ */}
        <footer className="flex flex-col items-center gap-3.5 border-t border-ds-filet px-5 py-[22px] md:flex-row md:justify-between md:px-10 md:py-7">
          <span className="text-[15px] leading-[19px] font-extrabold tracking-[-0.02em] text-ds-texte-titre">
            DropLink
          </span>
          {/*
            LE LIEN DE SIGNALEMENT DISPARAÎT QUAND LE CANAL N'EXISTE PAS, et ce
            n'est pas un détail d'affichage : c'est la procédure de notification
            et retrait qui fonde notre statut d'hébergeur (brief §12).

            ⚠️ DÉFAUT TROUVÉ EN PILOTANT LE PRODUIT LE 27/08/2026. Cette landing
            porte SON PROPRE pied de page — celui du canevas, horizontal, qui
            n'est pas celui de `PiedDePage` — et la garde n'y avait pas été
            recopiée. Elle écrivait donc le lien SANS CONDITION, vers une page
            qui rend 404 tant qu'aucune adresse n'est configurée. Le premier
            clic d'un visiteur qui cherche à signaler un contenu tombait dans le
            vide, sur la seule page que tout le monde voit.

            La garde est recopiée plutôt que le composant partagé importé : les
            deux pieds n'ont pas le même dessin, et la planche fait foi. Ce qui
            se partage ici, c'est la RÈGLE, pas la mise en page.
          */}
          <nav
            aria-label={t("piedNavigation")}
            className="flex flex-wrap justify-center gap-[18px] md:gap-[26px]"
          >
            {(
              [
                ["conditions", `/${locale}/conditions`],
                ["confidentialite", `/${locale}/confidentialite`],
                ...(signalementDisponible()
                  ? ([["signalement", `/${locale}/signalement`]] as const)
                  : []),
              ] as const
            ).map(([clef, href]) => (
              /*
                ⚠️ `min-h-11` EST LE PLANCHER TACTILE DU BRIEF §8 (44 points), ET
                LA MARGE NÉGATIVE EN EST LA MOITIÉ INDISSOCIABLE. Mesuré au
                navigateur le 09/09/2026 à 390 px : ces trois liens rendaient
                15 px de haut. Leur largeur dépassait déjà 44 — seule la hauteur
                manquait, d'où une correction purement verticale.

                ⚠️ ET LES DEUX VALEURS DIFFÈRENT PARCE QUE LES INTERLIGNES
                DIFFÈRENT : (44 − 15) / 2 = 14,5 au téléphone, où l'interligne
                est de 15 px, mais (44 − 16) / 2 = 14 au bureau, où `md:leading-4`
                le porte à 16. Recopier la même valeur des deux côtés ferait
                bouger le pied d'un pixel sur l'une des deux tailles.

                La marge rend au flux la hauteur exacte qu'il avait : sans elle
                le pied grandirait de 29 px et la planche cesserait de décrire le
                rendu. Vérifié : hauteur inchangée, texte déplacé de 0,0 px.
              */
              <Link
                key={clef}
                href={href}
                className="-my-[14.5px] inline-flex min-h-11 items-center text-[12px] leading-[15px] font-medium text-ds-texte-corps transition-colors hover:text-ds-accent md:-my-3.5 md:md:text-[13px] md:leading-4 md:text-ds-texte-corps"
              >
                <span className="md:hidden">{t("piedCourt." + clef)}</span>
                <span className="hidden md:inline">{t("pied." + clef)}</span>
              </Link>
            ))}
          </nav>
        </footer>
      </div>
    </div>
  );
}
