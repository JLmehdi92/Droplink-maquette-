import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, BarChart3, Check, Image as ImageIcon, Link2, Lock, Menu, Package, Truck } from "lucide-react";
import { routing } from "@/i18n/routing";
import { signalementDisponible } from "@/lib/contact";
import { MaquetteApplication } from "@/components/landing/maquette-application";
import { ChampDeLien, FriseDeSuivi, ZoneDeDepot } from "@/components/landing/illustrations-etapes";
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

/**
 * LE DERNIER MOT DU TITRE EN DÉGRADÉ — le `GradientText` du kit, porté le
 * 17/09/2026 (décision de Wassim : « les titres du kit »).
 *
 * ⚠️ `text-transparent` seul rend le mot INVISIBLE quand le dégradé ne peint pas
 * (impression, `forced-colors`, image de fond bloquée) : la couleur de repli est
 * l'encre du titre, et c'est `-webkit-text-fill-color` qui la rend transparente
 * là où le dégradé s'affiche — le même geste que la coque d'accès.
 *
 * Le mot est cherché à la FIN : dans « Un seul lien de suivi pour toute la
 * commande », c'est le dernier mot qui est peint, pas la première occurrence.
 */
function motEnDegrade(titre: string, mot: string): ReactNode {
  const i = mot === "" ? -1 : titre.lastIndexOf(mot);
  if (i < 0) return titre;
  return (
    <>
      {titre.slice(0, i)}
      <span className="degrade-ds-marque bg-clip-text text-ds-texte-titre [-webkit-text-fill-color:transparent]">
        {mot}
      </span>
      {titre.slice(i + mot.length)}
    </>
  );
}

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
  /*
   * L EYEBROW DE SECTION — valeurs relevees sur le kit marketing servi : 11/700
   * a l interlettrage 0,12em, encre d accent sur la teinte, remplissage 6/14,
   * rayon pilule, hauteur 26.
   *
   * ⚠️ 11,5 AU TELEPHONE, ET C EST LA REGLE 5 QUI GAGNE. Le kit ecrit 11 ;
   * cet eyebrow est rendu au telephone, et 11 passe sous le plancher.
   *
   * ⚠️ ET LE TEXTE EST EN CASSE NORMALE DANS LE CATALOGUE, les majuscules
   * venant du CSS. `textContent` ne suit pas `text-transform` : un libelle ecrit
   * en capitales dans le catalogue ne se compare plus a celui du kit, et il se
   * traduit mal — le chinois n a pas de casse.
   */
  /* Ses deux points décoratifs sont posés à chaque emploi : voir « Eyebrow » dans le design system. */
  const pilule =
    "inline-flex items-center gap-2 rounded-ds-pill bg-ds-surface-teinte px-3.5 py-1.5 text-[11.5px] leading-[normal] font-bold tracking-[0.12em] text-ds-accent-encre uppercase lg:text-[11px]";

  /*
   * L'ACTION PRINCIPALE EST PLEINE LARGEUR AU TÉLÉPHONE. `LandingMobile` pose
   * `width: 100%` sur le dégradé : dans 350 px de carte, un bouton qui n'occupe
   * que son texte laisse deux zones mortes de part et d'autre, à l'endroit
   * exact où le pouce arrive.
   */
  /*
   * ⚠️ LE DÉGRADÉ NE FIXAIT PAS SA COULEUR DE TEXTE, ET L APPEL PRINCIPAL
   * HÉRITAIT DONC DE L ENCRE. Mesuré le 13/09/2026 contre le kit : la référence
   * rend `rgb(255,255,255)`, le produit rendait `rgb(14,14,19)` — du noir sur un
   * violet→corail, sur le bouton le plus important de la seule page que tout le
   * monde voit. `.degrade-ds-marque` ne pose qu une image de fond ; les onze
   * autres emplois du dégradé portent tous `text-ds-texte-sur-marque`, celui-ci
   * était le seul à ne pas l avoir. `tests/unit/pilules-lisibles.test.ts` l exige
   * désormais.
   *
   * LES AUTRES VALEURS SONT CELLES DU KIT : 600 de graisse, -0,02em, remplissage
   * 0/28, écart 8, et l ombre de marque du design system plutôt qu une ombre
   * écrite en dur sur l ancien violet.
   *
   * IL RESTE PLEINE LARGEUR AU TÉLÉPHONE : dans 350 px de carte, un bouton qui
   * n occupe que son texte laisse deux zones mortes là où le pouce arrive.
   */
  const actionPrincipale =
    "degrade-ds-marque flex min-h-13 w-full items-center justify-center gap-2 rounded-ds-pill border border-transparent px-7 text-[15px] font-semibold tracking-[-0.02em] text-ds-texte-sur-marque shadow-ds-brand transition-shadow hover:shadow-ds-brand-hover md:inline-flex md:h-13 md:w-auto md:min-h-0";

  /* 14/600 en corps : la graisse du kit. Le produit rendait 500. */
  const lienMenu =
    "text-[14px] leading-[normal] font-semibold text-ds-texte-corps transition-colors hover:text-ds-accent";

  /*
   * CINQ ENTREES DE NAVIGATION, COMME LE KIT — quatre ancres et un lien.
   *
   * ⚠️ « DOCUMENTATION » MENE A UNE ROUTE QUI EXISTE, et c est la seule raison
   * pour laquelle elle est la : `/docs` repond 200. La cinquieme entree du kit,
   * « FAQ », ne menerait nulle part — une entree de navigation vers un 404, sur
   * la seule page que tout le monde voit, est pire qu une entree absente.
   */
  const sections = ["fonctionnement", "etapes", "clientVoit", "tarif"] as const;

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
        <header className="flex items-center justify-between gap-6 px-4 py-[18px] md:px-10 md:py-[22px]">
          <span className="text-[17px] leading-[22px] font-extrabold tracking-[-0.02em] text-ds-texte-titre md:text-[18px] md:leading-[23px]">
            DropLink
          </span>

          <nav aria-label={nav("espaceVendeur")} className="hidden gap-[30px] md:flex">
            {sections.map((clef) => (
              <a key={clef} href={"#" + clef} className={lienMenu}>
                {t("menu." + clef)}
              </a>
            ))}
            <Link href={`/${locale}/docs`} className={lienMenu}>
              {t("menu.docs")}
            </Link>
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
              /* ⚠️ 36 AU BUREAU, 44 TANT QU ON PEUT Y TOUCHER. Le kit dessine
                 36 ; `md:` commence à 768, où l on est encore au doigt. Le
                 plancher tactile tient donc jusqu à `lg`, et la valeur du kit
                 reprend au-delà. */
              className="inline-flex h-11 items-center gap-2 rounded-ds-pill border border-ds-filet bg-ds-surface-carte px-4 text-[13px] font-semibold tracking-[-0.02em] text-ds-texte-fort shadow-ds-sm transition-colors hover:bg-ds-surface-teinte lg:h-9"
            >
              {nav("seConnecter")}
            </Link>
            <Link
              href={`/${locale}/inscription`}
              className="degrade-ds-marque inline-flex h-11 items-center gap-2 rounded-ds-pill border border-transparent px-4 text-[13px] font-semibold tracking-[-0.02em] text-ds-texte-sur-marque shadow-ds-brand transition-shadow hover:shadow-ds-brand-hover lg:h-9"
            >
              {nav("creerCompte")}
              <ArrowRight aria-hidden="true" size={14} strokeWidth={1.9} />
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
            {/* LE BOUTON DU KIT (`ms-burger`) : carte, filet, rayon de carte — il
                était un disque gris de l'ancien canevas. 44 px et non 40 : la
                règle 5 l'emporte sur le dessin. */}
            <summary className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-ds-card border border-ds-filet bg-ds-surface-carte text-ds-texte-fort [&::-webkit-details-marker]:hidden">
              <Menu aria-hidden="true" size={19} strokeWidth={1.9} />
              <span className="sr-only">{nav("espaceVendeur")}</span>
            </summary>
            <nav
              aria-label={nav("espaceVendeur")}
              className="absolute right-0 z-20 mt-2 flex w-60 flex-col gap-1 rounded-ds-card-lg border border-ds-filet bg-ds-surface-carte p-3 shadow-ds-card"
            >
              {sections.map((clef) => (
                <a
                  key={clef}
                  href={"#" + clef}
                  className="flex min-h-11 items-center rounded-ds-sm px-3 text-[15px] font-semibold text-ds-texte-corps hover:bg-ds-surface-creux"
                >
                  {t("menu." + clef)}
                </a>
              ))}
              <Link
                href={`/${locale}/docs`}
                className="flex min-h-11 items-center rounded-ds-sm px-3 text-[15px] font-semibold text-ds-texte-corps hover:bg-ds-surface-creux"
              >
                {t("menu.docs")}
              </Link>
              <Link
                href={`/${locale}/connexion`}
                /* ⚠️ `bg-primary text-on-primary` : la pilule NOIRE de l'ancien
                   canevas, dans le seul menu que la mesure à 1280 ne déplie
                   jamais. Le kit y pose une entrée comme les autres. */
                className="flex min-h-11 items-center rounded-ds-sm px-3 text-[15px] font-semibold text-ds-texte-corps hover:bg-ds-surface-creux"
              >
                {nav("seConnecter")}
              </Link>
            </nav>
          </details>
        </header>

        <main id="contenu">
          {/* ---- HÉROS --------------------------------------------------- */}
          <section className="relative overflow-hidden px-4 pt-[22px] text-center md:px-10 md:pt-[46px]">
            {/* ⚠️ LE FILIGRANE « DROPLINK » DERRIÈRE LE TITRE A ÉTÉ RETIRÉ le
                17/09/2026 : la planche ne le porte pas, et depuis que la maquette
                du héros est là, il transparaissait à travers elle. */}

            <div className="relative">
              <h1 className="mx-auto text-[38px] leading-[1.02] font-extrabold tracking-[-0.045em] text-ds-texte-titre md:text-[64px] md:leading-[0.98]">
                {motEnDegrade(t("heroTitre"), t("motDegradeHero"))}
              </h1>
              {/* Deux textes, pas un texte coupé : la planche mobile RÉÉCRIT
                  la phrase plus court, elle ne la tronque pas. */}
              <p className="mx-auto mt-4 mb-6 max-w-[500px] text-[15px] leading-[1.55] text-ds-texte-corps md:mt-5 md:mb-[30px] md:text-[17px] md:leading-[1.55]">
                <span className="md:hidden">{t("heroSousTitreCourt")}</span>
                <span className="hidden md:inline">{t("heroSousTitre")}</span>
              </p>
              <Link href={`/${locale}/inscription`} className={actionPrincipale}>
                {t("ctaPrincipal")}
                <ArrowRight aria-hidden="true" size={17} strokeWidth={1.9} />
              </Link>

              {/* LES TROIS PROMESSES DU KIT, ET ELLES SONT TOUTES VRAIES :
                  le produit est gratuit en phase de validation, il n a AUCUN
                  code de paiement — donc aucune carte a demander — et
                  l inscription n exige pas de confirmation d email, donc rien
                  n attend entre le formulaire et la premiere commande.

                  ⚠️ ELLES SONT DANS UNE LISTE, pas dans trois `span` alignes :
                  ce sont trois affirmations distinctes, et un lecteur d ecran
                  doit pouvoir les compter. */}
              <ul className="mx-auto mt-5 flex max-w-[560px] flex-col items-start gap-2.5 md:mt-6 md:flex-row md:items-center md:justify-center md:gap-7">
                {(["perk1", "perk2", "perk3"] as const).map((clef) => (
                  <li key={clef} className="flex items-center gap-[9px]">
                    {/* LA CASE COCHÉE DU KIT (`Checkbox checked`) : 18 px, rayon 6,
                        aplat d'accent et coche blanche — pas un cercle Material. */}
                    <span
                      aria-hidden="true"
                      className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-ds-xs bg-ds-accent text-ds-texte-sur-marque"
                    >
                      <Check size={12} strokeWidth={3} />
                    </span>
                    <span className="text-[14px] leading-[normal] font-medium text-ds-texte-corps">
                      {t(clef)}
                    </span>
                  </li>
                ))}
              </ul>

              {/* ---- LA MAQUETTE DU HÉROS ------------------------------------
               *
               * Le kit la pose sous les promesses, débordant du bas de la
               * section : c'est la première chose qu'un visiteur voit du
               * produit. Elle a 1180 px de large et se réduit par `scale` —
               * jamais par une largeur fluide, sinon ses colonnes se replient
               * et la maquette ne montre plus l'écran qu'elle décrit.
               *
               * ⚠️ `lg` ET AU-DESSUS SEULEMENT. Sous ce palier, c'est le
               * téléphone de la section suivante qui montre le produit — le
               * kit y réduit la fenêtre à 30 %, où elle n'est plus lisible.
               */}
              <div className="relative mt-10 hidden h-[600px] overflow-hidden lg:block">
                {/* Les valeurs du kit : fenêtre de 1180 réduite à 0,68, posée à
                    gauche du centre (-64 %), dans un bloc de 600. */}
                <div className="absolute left-1/2 origin-top -translate-x-[64%] scale-[0.68]">
                  <MaquetteApplication />
                </div>
              </div>
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
            className="mx-auto mt-[34px] max-w-[760px] px-4 text-center text-[26px] leading-[1.05] font-extrabold tracking-[-0.045em] text-ds-texte-titre md:mt-10 md:px-0 md:text-[44px]"
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
            <div className="absolute top-0 left-1/2 h-[434px] w-[228px] -translate-x-1/2 rounded-[34px] bg-ds-ink-900 p-[7px] shadow-ds-window md:h-[578px] md:w-[330px] md:rounded-[42px] md:p-[9px] ">
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
            <div className="anim-flot absolute top-24 left-2.5 flex items-center gap-[9px] rounded-[13px] bg-ds-surface-carte px-3 py-2.5 shadow-ds-md md:hidden">
              <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-ds-surface-teinte">
                <ImageIcon aria-hidden="true" size={16} strokeWidth={1.9} className="text-ds-accent" />
              </span>
              <span className="text-[12px] leading-[15px] font-bold text-ds-texte-titre">
                {t("flottant.photosCourt")}
              </span>
            </div>

            <div
              className="anim-flot absolute top-[210px] right-2 flex items-center gap-[9px] rounded-[13px] bg-ds-surface-carte px-3 py-2.5 shadow-ds-md md:hidden"
              style={{ animationDelay: "1.6s" }}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-ds-erreur-fond">
                <Truck aria-hidden="true" size={16} strokeWidth={1.9} className="text-ds-erreur-encre" />
              </span>
              <span className="text-[12px] leading-[15px] font-bold text-ds-texte-titre">
                {t("flottant.transitCourt")}
              </span>
            </div>

            {(
              [
                {
                  clef: "photos",
                  icone: ImageIcon,
                  peau: "bg-ds-surface-teinte text-ds-accent",
                  place: "top-[150px] left-[calc(50%-460px)] w-[264px]",
                  delai: "0s",
                },
                {
                  clef: "transit",
                  icone: Truck,
                  peau: "bg-ds-erreur-fond text-ds-erreur-encre",
                  place: "top-[262px] right-[calc(50%-484px)] w-[274px]",
                  delai: "1.6s",
                },
                {
                  clef: "valide",
                  icone: Check,
                  peau: "bg-ds-succes-fond text-ds-succes-encre",
                  place: "bottom-[34px] left-[calc(50%-424px)] w-[242px]",
                  delai: "3.2s",
                },
              ] as const
            ).map((carte) => (
              <div
                key={carte.clef}
                className={
                  "anim-flot absolute hidden items-center gap-[11px] rounded-[14px] bg-ds-surface-carte px-3.5 py-3 shadow-ds-md xl:flex " +
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
                  <carte.icone aria-hidden="true" size={19} strokeWidth={1.9} />
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
            className="bg-ds-surface-creux px-4 pt-11 pb-12 md:px-10 md:pt-[66px] md:pb-[74px]"
          >
            <div className="text-center">
              <span className={pilule}>
                <span aria-hidden="true" className="h-1 w-1 rounded-full bg-current opacity-60" />
                {t("beneficesPilule")}
                <span aria-hidden="true" className="h-1 w-1 rounded-full bg-current opacity-60" />
              </span>
              <h2 className="mt-4 text-[30px] leading-[35px] font-extrabold tracking-[-0.03em] text-ds-texte-titre md:mt-5 md:text-[46px] md:leading-[52px]">
                {motEnDegrade(t("beneficesTitre"), t("motDegradeBenefices"))}
              </h2>
              {/* Le kit le montre aussi au téléphone. L'ancien canevas le retirait ;
                  c'est une décision d'une planche morte, pas du design system. */}
              <p className="mx-auto mt-4 mb-7 max-w-[560px] text-[16px] leading-[1.55] text-ds-texte-corps md:mb-11 md:leading-[26px]">
                {t("beneficesTexte")}
              </p>
            </div>

            {/*
              SIX CARTES, COMME LE KIT — mais la sixieme n est pas la sienne.

              ⚠️ « MULTI-PLATEFORMES : FONCTIONNE AVEC VINTED, EBAY, SHOPIFY,
              TIKTOK SHOP, LEBONCOIN » EST FAUX. Le produit n a AUCUNE
              integration avec l une de ces plateformes, et c est meme sa
              raison d etre : il sert le vendeur qui n a PAS de boutique.
              L annoncer serait la seule phrase de cette page qu on ne
              pourrait pas tenir. Elle est remplacee par ce qui distingue
              reellement le produit, et qui est verifiable : le destinataire
              n a jamais de compte (decision 4).
            */}
            <ul className="grid gap-3.5 text-left md:grid-cols-3 md:gap-5">
              {(
                [
                  ["commandes", Package, "bg-ds-surface-teinte text-ds-accent"],
                  ["medias", ImageIcon, "bg-ds-surface-teinte text-ds-accent"],
                  ["suivi", Truck, "bg-ds-erreur-fond text-ds-erreur-encre"],
                  // ⚠️ LE TROISIÈME EST VERT sur les deux planches. Le code le
                  // rendait GRIS, faute de famille verte dans l'ancien thème —
                  // elle existe désormais (`succes-pastel` / `succes`).
                  ["marque", Link2, "bg-ds-succes-fond text-ds-succes-encre"],
                  ["analyses", BarChart3, "bg-ds-info-fond text-ds-info"],
                  ["sansCompte", Lock, "bg-ds-alerte-fond text-ds-alerte-encre"],
                ] as const
              ).map(([clef, IconeCarte, teinte]) => (
                <li
                  key={clef}
                  className="flex gap-4 rounded-ds-card border border-ds-filet bg-ds-surface-carte p-[22px] md:block md:p-[26px]"
                >
                  {/* AU TÉLÉPHONE, L'ICÔNE À GAUCHE DU TEXTE — la composition du kit.
                      Empilées, les six cartes perdaient chacune la hauteur de leur
                      tuile ; côte à côte, le texte garde 252 px et la liste se lit. */}
                  <span
                    className={
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] md:h-[42px] md:w-[42px] " +
                      teinte
                    }
                  >
                    <IconeCarte aria-hidden="true" size={20} strokeWidth={1.9} />
                  </span>
                  <div className="min-w-0">
                    {/* 18/700 à l'interligne 19,8 et à -0,02em : les valeurs du kit, aux deux
                        largeurs. Le produit rendait 23 d'interligne et -0,015em. */}
                    <h3 className="mb-1.5 text-[18px] leading-[19.8px] font-bold tracking-[-0.02em] text-ds-texte-titre md:mt-[18px] md:mb-2">
                      {t("fonctionnalites." + clef + "Titre")}
                    </h3>
                    <p className="text-[14px] leading-[1.55] font-medium text-ds-texte-corps">
                      {t("fonctionnalites." + clef + "Texte")}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* ---- COMMENT ÇA MARCHE, EN TROIS ÉTAPES ----------------------
           *
           * LA SECTION QUE LE KIT POSE ET QUE LA LANDING N AVAIT PAS. Ses trois
           * étapes sont vraies mot pour mot : il n y a rien à installer, aucune
           * intégration transporteur à configurer, et le lien ne change plus
           * jamais — c est l immuabilité du jeton, garantie par un déclencheur en
           * base, pas par une promesse.
           */}
          <section id="etapes" className="px-4 py-12 md:px-10 md:py-[74px]">
            <div className="text-center">
              <span className={pilule}>
                <span aria-hidden="true" className="h-1 w-1 rounded-full bg-current opacity-60" />
                {t("etapesPilule")}
                <span aria-hidden="true" className="h-1 w-1 rounded-full bg-current opacity-60" />
              </span>
              <h2 className="mx-auto mt-4 max-w-[720px] text-[30px] leading-[1.05] font-extrabold tracking-[-0.045em] text-ds-texte-titre md:mt-5 md:text-[44px]">
                {t("etapesTitre")}
              </h2>
              <p className="mx-auto mt-[18px] mb-9 max-w-[620px] text-[16px] leading-[1.55] text-ds-texte-corps md:mb-11">
                {t("etapesTexte")}
              </p>
            </div>

            {/* ⚠️ UNE LISTE ORDONNÉE, ET PAS UNE GRILLE DE CARTES. Trois étapes
                numérotées ont un ORDRE ; le rendre par des chiffres dessinés dans
                des `div` le dirait à l œil et à personne d autre. */}
            <ol className="grid gap-3.5 text-left md:grid-cols-3 md:gap-[18px]">
              {([1, 2, 3] as const).map((n) => (
                <li
                  key={n}
                  className="flex gap-3.5 rounded-ds-card-lg border border-ds-filet bg-ds-surface-carte p-6 shadow-ds-card"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-9 w-9 flex-none items-center justify-center rounded-ds-pill bg-ds-surface-teinte text-[14px] leading-[normal] font-extrabold text-ds-accent-encre"
                  >
                    {"0" + n}
                  </span>
                  <span className="flex min-w-0 flex-col gap-1.5">
                    <h3 className="text-[18px] leading-[19.8px] font-bold tracking-[-0.045em] text-ds-texte-titre">
                      {t(`etape${n}Titre`)}
                    </h3>
                    <p className="text-[14px] leading-[1.55] font-medium text-ds-texte-corps">
                      {t(`etape${n}Texte`)}
                    </p>
                    {/* L'ILLUSTRATION DE L'ÉTAPE — le kit en dessine une par carte, et
                        elle dit en une image ce que la phrase annonce (17/09/2026). */}
                    {n === 1 ? <ZoneDeDepot /> : n === 2 ? <ChampDeLien /> : <FriseDeSuivi />}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          {/* ---- APPEL FINAL : LA BANNIÈRE DU KIT -------------------------
           *
           * VALEURS RELEVÉES SUR LE KIT SERVI : bande au rayon `3xl`, dégradé
           * DIAGONAL, remplissage 52/56, ombre `lg` ; titre 40/800 à -0,04em en
           * blanc sur deux lignes, sous-titre 15/400 à 88 % de blanc, 14 px
           * dessous, puis les actions à 26.
           *
           * ⚠️ L ACTION PRINCIPALE Y EST BLANCHE, PAS DÉGRADÉE, et c est la règle
           * 3 : le dégradé est réservé à UNE seule action par écran. Il est déjà
           * sur le bouton du héros ; le poser aussi ici en ferait deux, et sur un
           * fond qui EST le dégradé il ne se verrait pas.
           *
           * ⚠️ ET LE SECOND BOUTON DU KIT N EST PAS PORTÉ. Il mène à un exemple de
           * page client ; il n existe aucune page de démonstration, et en
           * fabriquer une demanderait une commande réelle, donc un jeton réel
           * dans une URL publique. La section qui montre ce que voit le client
           * est plus haut, sur cette page.
           */}
          <section id="tarif" className="px-4 pb-12 md:px-10 md:pb-14">
            <div className="degrade-ds-marque-diagonal relative overflow-hidden rounded-ds-3xl px-7 py-[34px] text-ds-texte-sur-marque shadow-ds-lg md:px-14 md:py-[52px]">
              <div className="max-w-[520px]">
                <h2 className="text-[27px] leading-[1.05] font-extrabold tracking-[-0.04em] md:text-[40px]">
                  <span className="md:hidden">{t("finalTitreCourt")}</span>
                  <span className="hidden md:inline">{t("finalTitre")}</span>
                </h2>
                {/* 88 % DE BLANC, ET NON UN GRIS : sur un dégradé, un gris de
                    palette vire au sale d un bout à l autre de la bande. */}
                <p className="mt-3.5 text-[15px] leading-[1.55] text-white/[.88]">
                  <span className="md:hidden">{t("gratuitPourLInstantCourt")}</span>
                  <span className="hidden md:inline">{t("gratuitPourLInstant")}</span>
                </p>
                <Link
                  href={`/${locale}/inscription`}
                  className="mt-[26px] flex min-h-13 w-full items-center justify-center gap-2 rounded-ds-pill border border-ds-filet bg-ds-surface-carte px-7 text-[15px] font-semibold tracking-[-0.02em] text-ds-texte-fort shadow-ds-sm transition-shadow hover:shadow-ds-md md:inline-flex md:h-13 md:w-auto md:min-h-0"
                >
                  {t("ctaPrincipal")}
                  <ArrowRight aria-hidden="true" size={17} strokeWidth={1.9} />
                </Link>
              </div>
            </div>
          </section>
        </main>

        {/* ---- PIED ------------------------------------------------------
         *
         * TROIS COLONNES, COMME LE KIT — la marque, le produit, la société.
         *
         * ⚠️ SA QUATRIÈME, « RESTEZ INFORMÉ », N'EST PAS PORTÉE : elle pose un
         * champ d'email qui n'irait nulle part. Il n'existe aucune liste de
         * diffusion, et un formulaire qui avale une adresse sans rien en faire
         * est pire qu'un formulaire absent.
         *
         * LE LIEN DE SIGNALEMENT DISPARAÎT QUAND LE CANAL N'EXISTE PAS, et ce
         * n'est pas un détail d'affichage : c'est la procédure de notification
         * et retrait qui fonde notre statut d'hébergeur (brief §12).
         *
         * ⚠️ DÉFAUT TROUVÉ EN PILOTANT LE PRODUIT LE 27/08/2026 : cette landing
         * porte SON PROPRE pied, et la garde n'y avait pas été recopiée. Elle
         * écrivait le lien SANS CONDITION, vers une page qui rend 404 tant
         * qu'aucune adresse n'est configurée — sur la seule page que tout le
         * monde voit. Ce qui se partage ici, c'est la RÈGLE, pas la mise en page.
         */}
        <footer className="border-t border-ds-filet px-4 py-9 md:px-10 md:py-11">
          <div className="flex flex-col gap-8 md:flex-row md:justify-between md:gap-10">
            <div className="max-w-[280px]">
              <span className="text-[17px] leading-[22px] font-extrabold tracking-[-0.02em] text-ds-texte-titre md:text-[18px]">
                DropLink
              </span>
              <p className="mt-2 text-[13px] leading-[1.55] text-ds-texte-corps">
                {t("piedTagline")}
              </p>
            </div>

            <div className="flex flex-col gap-8 sm:flex-row sm:gap-16">
              {(
                [
                  [
                    "piedProduit",
                    [
                      ["fonctionnement", "#fonctionnement"],
                      ["etapes", "#etapes"],
                      ["tarif", "#tarif"],
                      ["docs", `/${locale}/docs`],
                    ],
                  ],
                  [
                    "piedSociete",
                    [
                      ["blog", `/${locale}/blog`],
                      ["conditions", `/${locale}/conditions`],
                      ["confidentialite", `/${locale}/confidentialite`],
                      ...(signalementDisponible()
                        ? [["signalement", `/${locale}/signalement`]]
                        : []),
                    ],
                  ],
                ] as const
              ).map(([titre, liens]) => (
                <nav key={titre} aria-label={t(titre)}>
                  <p className="mb-3.5 text-[13px] leading-[normal] font-extrabold text-ds-texte-titre">
                    {t(titre)}
                  </p>
                  {/* ⚠️ `min-h-11` EST LE PLANCHER TACTILE (règle 5), et l'écart
                      négatif en est la moitié indissociable : sans lui, chaque
                      lien grandirait de 29 px et la colonne cesserait de
                      décrire le rendu du kit. */}
                  <ul className="flex flex-col gap-2.5">
                    {liens.map(([clef, href]) => (
                      <li key={clef}>
                        {href.startsWith("#") ? (
                          <a
                            href={href}
                            className="-my-[14.5px] inline-flex min-h-11 items-center text-[13px] leading-[15px] font-medium text-ds-texte-sourdine transition-colors hover:text-ds-accent"
                          >
                            {t("menu." + clef)}
                          </a>
                        ) : (
                          <Link
                            href={href}
                            className="-my-[14.5px] inline-flex min-h-11 items-center text-[13px] leading-[15px] font-medium text-ds-texte-sourdine transition-colors hover:text-ds-accent"
                          >
                            {t.has("pied." + clef) ? t("pied." + clef) : t("menu." + clef)}
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                </nav>
              ))}
            </div>
          </div>

          <p className="mt-8 border-t border-ds-filet pt-[18px] text-[12px] leading-[normal] font-medium text-ds-texte-tenu md:mt-10">
            {t("piedDroits", { annee: new Date().getUTCFullYear() })}
          </p>
        </footer>
      </div>
    </div>
  );
}
