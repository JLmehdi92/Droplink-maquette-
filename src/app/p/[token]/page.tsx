import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { ArbitrageQc } from "@/components/publique/arbitrage-qc";
import { BaliseVue } from "@/components/publique/balise-vue";
import { EtatExpedition } from "@/components/publique/etat-expedition";
import { ReseauxVendeur } from "@/components/publique/reseaux-vendeur";
import { Suivi } from "@/components/publique/suivi";
import { Visionneur } from "@/components/publique/visionneur";
import { lireCommandePublique, lireSuiviPublic } from "@/lib/page-publique/lecture";
import { resoudreAccent } from "@/lib/design/contraste";
import { estLangueSupportee } from "@/i18n/config";
import { signalerJetonInconnu, verifierQuotaPublique } from "@/lib/limitation/quota";
import { adresseAppelant, empreinte } from "@/lib/limitation/empreinte";
import { emettreApres } from "@/lib/instrumentation/emettre";
import { EVENEMENTS } from "@/lib/instrumentation/evenements";
import { decrireSilence } from "@/lib/tracking/silence";
import { substituer } from "@/lib/format/gabarit";

/**
 * LA PAGE QUE VOIT LE CLIENT.
 *
 * Elle est ouverte UNE FOIS, au téléphone, en 4G, depuis un message privé. Tout
 * ce qui suit découle de cette phrase.
 *
 * L'ORDRE EST CELUI DES QUESTIONS QU'ON SE POSE, dans l'ordre où on se les
 * pose : quand est-ce que ça arrive (la carte d'état), à quoi ça ressemble (la
 * galerie), est-ce que c'est bien ça (la validation), et seulement ensuite le
 * détail du transport. Le canevas met la galerie AVANT les détails
 * d'expédition sur téléphone ; sur grand écran, les deux tiennent côte à côte.
 *
 * DEUX PLANCHES, DEUX RÉPARTITIONS DE LA MÊME INFORMATION. `PageClient` met la
 * date d'arrivée dans une carte à la couleur du vendeur, en tête ;
 * `PageClientDesktop` la monte dans l'en-tête, à droite du titre, et rend à sa
 * place une carte « Expédition » qui porte le nom de l'étape. Ce n'est pas la
 * même mise en page avec des tailles différentes — c'est la même information
 * distribuée autrement, et le composant d'état porte les deux variantes.
 *
 * LA BASCULE EST À `lg`, PAS À `md`. Mesurée : à 768 px, la colonne de droite
 * de la planche ne fait plus que 246 px, et les quatre libellés de la frise —
 * « Préparation » en tête — n'y tiennent plus sur une ligne. La leçon des deux
 * écrans précédents est que les défauts graves vivent ENTRE les deux largeurs
 * dessinées, pas sur elles.
 *
 * L'EN-TÊTE PORTE LA COULEUR DU VENDEUR EN APLAT PLEIN. C'est sa page, pas la
 * nôtre : le dégradé de marque DropLink n'apparaît nulle part ici. Et aucune
 * couleur d'écriture n'est posée en dur sur cet aplat — `resoudreAccent()`
 * décide, sinon un accent jaune rendrait un titre blanc illisible.
 *
 * AUCUN GLASSMORPHISM, AUCUN `backdrop-blur`. Sur un aplat uni, un blanc à 70 %
 * flouté rend exactement la même couleur qu'un blanc opaque : le flou n'a rien
 * à flouter, et c'est ce qui coûte le plus cher sur un appareil d'entrée de
 * gamme.
 *
 * LA LANGUE EST CELLE DU VENDEUR, lue en base. Aucun provider de traduction
 * n'est expédié au navigateur : les Server Components résolvent, et le
 * visionneur reçoit ses libellés en propriétés.
 *
 * UNE INFORMATION ABSENTE EST OMISE. Pas de texte de remplacement, pas de
 * valeur inventée, pas de bloc vide : sur cette page, « nous n'avons pas encore
 * cette information » se dit en n'affichant rien.
 */

/**
 * ⚠️ CETTE PAGE NE PORTAIT AUCUN `<title>` — mesuré sur le HTML servi : ZÉRO
 * balise, là où la landing en sert une.
 *
 * Ce n'est pas qu'un défaut d'accessibilité, même si c'en est un — « Page
 * Titled » est un critère de NIVEAU A, et c'est la seule page du produit que
 * tous les clients de tous les vendeurs ouvrent.
 *
 * CE QUI COMPTE DAVANTAGE : sans titre, l'onglet et l'entrée d'historique du
 * navigateur affichent L'URL. Or l'URL de cette page PORTE la capacité, et elle
 * est immuable à vie. Un titre ne fuite donc pas — il RETIRE le jeton de ce que
 * le navigateur montre par-dessus l'épaule, dans la liste des onglets, et dans
 * une capture d'écran d'historique.
 *
 * LE TITRE EST NEUTRE, ET C'EST DÉLIBÉRÉ. Il ne porte ni le pseudo du client ni
 * la référence du produit — c'est la même raison qui interdit l'image de
 * partage : ce qui apparaît hors de la page apparaît à qui n'a pas ouvert le
 * lien. Il vient du catalogue, dans la langue DU VENDEUR, comme le reste.
 *
 * ⚠️ IL NE COÛTE AUCUNE REQUÊTE. `lireCommandePublique` est enveloppée dans
 * `cache()` : `generateMetadata` et le rendu partagent la même lecture. C'est
 * exactement le montage déjà éprouvé sur le titre de l'éditeur, où trois
 * chargements ont produit trois lectures, compteur posé puis retiré.
 *
 * ⚠️ ET IL NE DIT RIEN DU JETON. Un lien inconnu, révoqué ou suspendu rend le
 * MÊME titre que l'écran de lien mort que le produit affiche déjà pour les
 * trois : le titre ne distingue pas ce que le corps ne distingue pas.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const commande = await lireCommandePublique(token);
  const langue =
    commande !== null && estLangueSupportee(commande.boutique.langue)
      ? commande.boutique.langue
      : "fr";
  const t = await getTranslations({ locale: langue, namespace: "page-publique" });

  return {
    title: commande === null ? t("lienInvalideTitre") : t("titre"),
    robots: { index: false, follow: false, nocache: true },
  };
}

/**
 * Le conteneur du canevas : 1 240 px de large, 18 px de marge au téléphone,
 * 56 px sur grand écran.
 *
 * ⚠️ LES DEUX PLANCHES SE CONTREDISENT SUR CE POINT, et il fallait trancher.
 * `PageClientDesktop` pose les 56 px À L'EXTÉRIEUR du conteneur pour l'en-tête
 * et À L'INTÉRIEUR pour le corps : mesuré dans Chrome à 1 440 px, le titre
 * commence à x = 100 et la galerie à x = 156. Cinquante-six pixels de décalage
 * entre le titre et ce qu'il titre, sur la planche elle-même. Une seule des
 * deux lectures peut survivre ; c'est celle du CORPS qui est retenue — c'est
 * elle qui donne le « conteneur 1240 » annoncé, et c'est le corps qui porte le
 * contenu.
 */
/**
 * LE CONTENEUR DE LA PAGE CLIENT.
 *
 * ⚠️ 600 px JUSQU'À `lg`, PAS PLEINE LARGEUR. Entre 768 et 1 023 px la page ne
 * peut pas passer à deux colonnes — mesuré, la colonne de droite y ferait
 * 246 px et « Préparation » n'y tiendrait pas. Elle restait donc en une colonne
 * qui s'étirait jusqu'au bord : mesuré à 900 px, la photo de couverture rendait
 * **885 x 885**, soit un écran et demi de photo avant la moindre autre
 * information. La planche `PageClient` porte désormais ce plafond.
 *
 * La bande de couleur du vendeur reste PLEINE LARGEUR : elle est posée sur le
 * `<header>`, pas ici. C'est sa marque, pas un bloc de contenu.
 */
const CONTENEUR = "mx-auto w-full max-w-[600px] px-[18px] lg:max-w-[1240px] lg:px-14";

export default async function PagePublique({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // LA LIMITATION DE DÉBIT VIENT AVANT LA LECTURE : c'est la lecture qu'elle
  // protège. Un refus emprunte le MÊME chemin de sortie que tout le reste —
  // répondre 429 ici distinguerait « tu vas trop vite sur un jeton qui existe »
  // de « ce jeton n'existe pas », donc rendrait le balayage informatif.
  const quota = await verifierQuotaPublique();
  if (!quota.autorise) notFound();

  const commande = await lireCommandePublique(token);
  // Jeton inconnu, jeton révoqué, compte suspendu : UN SEUL chemin de sortie.
  if (commande === null) {
    // Compté APRÈS la lecture : c'est la requête SUIVANTE que ce compteur
    // refusera. Un balayage se coupe ainsi lui-même au bout de vingt essais,
    // alors qu'un client qui clique un lien ne touche jamais ce seuil.
    await signalerJetonInconnu();
    notFound();
  }

  // Lu APRÈS la commande : une commande sur deux n'a pas encore de numéro, et
  // `null` est alors la réponse normale — pas une erreur.
  const suivi = await lireSuiviPublic(token);

  const langue = estLangueSupportee(commande.boutique.langue) ? commande.boutique.langue : "fr";
  const t = await getTranslations({ locale: langue, namespace: "page-publique" });
  const format = await getFormatter({ locale: langue });

  // L'INSTANT EST PRIS UNE SEULE FOIS, ici, et descendu en propriété. Un
  // composant qui lit l'horloge lui-même rend une chose au serveur et une autre
  // à l'hydratation.
  const maintenant = new Date();

  /*
   * LE STATUT AFFICHÉ VIENT DU COLIS DÈS QU'IL EN EXISTE UN.
   *
   * « Le vendeur prime avant la remise au transporteur, le transporteur après » :
   * chacun est seul à savoir ce qu'il affirme. Tant qu'aucun colis n'est
   * enregistré, c'est le vendeur qui décrit la réalité ; une fois le numéro
   * suivi, c'est le transporteur. Prendre le maximum des deux plutôt que l'un ou
   * l'autre garantit en plus que l'étape ne recule jamais à l'écran, même si le
   * vendeur remet sa commande « en préparation » par mégarde.
   */
  const ETAPES = ["preparation", "expedie", "en_transit", "livre"] as const;
  const statutAffiche =
    suivi === null || ETAPES.indexOf(commande.statut) > ETAPES.indexOf(suivi.etape)
      ? commande.statut
      : suivi.etape;

  // La conformité de contraste est obtenue AUTOMATIQUEMENT : le vendeur n'a pas
  // à chercher « une couleur qui marche ». Un rouge saturé reste lisible.
  const accent = resoudreAccent(commande.boutique.couleur);

  /*
   * L'ÉTAT DU COLIS EST RÉSOLU ICI, ET NON DANS LE COMPOSANT D'ÉTAT.
   *
   * Il est rendu DEUX FOIS — une variante par largeur — et la date d'arrivée
   * remonte en plus dans l'en-tête du bureau. Trois endroits pour une seule
   * vérité : la calculer là où elle s'affiche la ferait diverger le jour où
   * l'une des trois oublierait la règle du silence.
   */
  const dernier =
    suivi === null || suivi.dernierMouvement === null ? null : new Date(suivi.dernierMouvement);
  const silence = decrireSilence(dernier, maintenant);

  const jour = (instant: Date): string => format.dateTime(instant, { day: "numeric", month: "long" });

  /*
   * LA FOURCHETTE D'ARRIVÉE. Les deux bornes existent en base ; quand elles
   * tombent le même jour, on n'écrit pas « 2 — 2 septembre ». Et quand le
   * transporteur n'a rien annoncé, tout le bloc disparaît : une fourchette
   * inventée serait indiscernable d'une vraie, et c'est celle qu'on croirait.
   *
   * ELLE DISPARAÎT AUSSI QUAND LE COLIS SE TAIT depuis plus de dix jours. Une
   * date d'arrivée qu'on sait dépassée est pire qu'une absence de date.
   */
  const du = suivi?.estimationDu == null ? null : new Date(suivi.estimationDu);
  const au = suivi?.estimationAu == null ? null : new Date(suivi.estimationAu);
  const estimation =
    du === null || silence.etat === "silencieux"
      ? null
      : au === null || jour(au) === jour(du)
        ? jour(du)
        : jour(du) + " — " + jour(au);

  /*
   * `t.raw` ET NON `t` POUR LES CHAÎNES À PARAMÈTRE.
   *
   * La substitution de `{n}` se fait ici, avec un nombre de jours calculé.
   * Or `t()` FORMATE : présenté à une chaîne ICU dont le paramètre manque, il
   * ne rend pas le gabarit — il lève `FORMATTING_ERROR`, et la page rendait
   * alors le nom de la clé au client.
   */
  const anciennete =
    silence.etat === "aucun-mouvement"
      ? t("suivi.aucunMouvement")
      : silence.jours === 0
        ? t("suivi.aujourdHui")
        : silence.jours === 1
          ? t("suivi.hier")
          : t.raw("suivi.dernierMouvement").replace("{n}", String(silence.jours));

  /** La forme courte, à droite du nom de l'étape sur grand écran. */
  const ancienneteCourte =
    silence.etat === "aucun-mouvement"
      ? t("suivi.aucunMouvement")
      : silence.jours === 0
        ? t("suivi.aujourdHui")
        : silence.jours === 1
          ? t("suivi.hier")
          : t.raw("suivi.anciennete").replace("{n}", String(silence.jours));

  const libellesEtat = {
    titre: t("etat.titre"),
    arriveeEstimee: t("etat.arriveeEstimee"),
    silenceTitre: t.raw("suivi.silenceTitre"),
    silenceTexte: t("suivi.silence"),
    etapes: {
      preparation: t("frise.preparation"),
      expedie: t("frise.expedie"),
      en_transit: t("frise.en_transit"),
      livre: t("frise.livre"),
    },
  } as const;

  // EN-TÊTE OMIS quand il n'y a NI nom NI logo. Pas de barre vide, pas de
  // libellé de remplacement : un vendeur qui n'a rien configuré obtient une page
  // qui commence par le contenu, et c'est le cas le plus fréquent en début de
  // vie d'un compte — pas un repli dégradé.
  const aUnEnTete = commande.boutique.nom !== null || commande.boutique.logo !== null;

  const surTitre =
    "font-body-sm text-[11px] leading-[15px] font-bold tracking-[0.09em] uppercase text-gris-entete";

  /*
   * SECTION AU TÉLÉPHONE, CARTE SUR GRAND ÉCRAN — et c'est la largeur qui
   * décide, pas le contenu. À 390 px, une carte n'encadre rien : elle ajoute
   * deux traits et retire seize pixels à ce qu'il y a dedans. Un filet en tête
   * de section sépare aussi bien pour rien.
   */
  const section =
    "border-t border-filet-section px-[18px] py-[26px] " +
    "lg:rounded-[18px] lg:border lg:border-outline-variant lg:px-6 lg:py-6";

  // LE RENDU EST COMPTÉ CÔTÉ SERVEUR, la VUE côté client, et les deux ne se
  // confondent pas : `rendus ≥ vues réelles ≥ vues enregistrées`. Sans la borne
  // haute, une perte de balises ressemblerait à une absence d'audience.
  //
  // NI LE JETON NI L'IDENTIFIANT DE LA COMMANDE NE PARTENT VERS L'ANALYTICS. Le
  // jeton ne transporte pas une donnée mais une CAPACITÉ, définitivement,
  // puisqu'il est immuable à vie : l'expédier chez un tiers reviendrait à lui
  // donner la page. Le décompte par commande vit dans notre base, où il est
  // déjà.
  const visiteur = await adresseAppelant();
  emettreApres(EVENEMENTS.PAGE_PUBLIQUE_RENDUE, {
    sujet: visiteur === null ? "visiteur:sans-adresse" : `visiteur:${empreinte(visiteur)}`,
  });

  /*
   * LA COUVERTURE CHOISIE PAR LE VENDEUR PASSE EN TÊTE.
   *
   * ⚠️ DÉFAUT TROUVÉ EN PILOTANT LE PRODUIT LE 27/08/2026, en vérifiant tout
   * autre chose. « Définir comme couverture » écrivait bien `cover_media_id` en
   * base, l'éditeur affichait le badge « Couverture » sur la bonne photo — et la
   * page du client montrait la PREMIÈRE photo par position, quoi qu'il arrive.
   * Le réglage était enregistré, affiché, et sans effet.
   *
   * C'est le pire genre de défaut de ce produit : le vendeur croit avoir choisi
   * ce que son client verra en grand, personne ne le contredit, et l'écart ne se
   * découvre que chez le destinataire — s'il se découvre.
   *
   * ON RÉORDONNE ICI plutôt que dans le visionneur : celui-ci se sert de la
   * POSITION dans le tableau pour son index de plein écran, pour ses tuiles et
   * pour son compteur « 3 / 12 ». Lui faire choisir une tête différente du reste
   * l'obligerait à distinguer deux ordres, et c'est exactement le genre de
   * question qu'on finit par trancher de travers.
   */
  const mediasAvecCouvertureEnTete =
    commande.couverture === null
      ? commande.medias
      : [
          ...commande.medias.filter((m) => m.id === commande.couverture),
          ...commande.medias.filter((m) => m.id !== commande.couverture),
        ];

  const etatExpedition = (variante: "accent" | "carte") => (
    <EtatExpedition
      variante={variante}
      statut={statutAffiche}
      silence={silence}
      estimation={estimation}
      anciennete={anciennete}
      ancienneteCourte={ancienneteCourte}
      libelles={libellesEtat}
      accent={accent}
    />
  );

  return (
    <div lang={langue} className="flex min-h-dvh flex-col bg-surface-container-lowest">
      {/*
        L'EN-TÊTE À LA COULEUR DU VENDEUR. Il porte aussi le titre et le nom du
        destinataire : sans lui, le bandeau serait une bande de couleur qui
        n'apprend rien, et la page commencerait deux fois.
      */}
      {aUnEnTete ? (
        <header
          style={{ backgroundColor: accent.remplissage, color: accent.surRemplissage }}
          className="pt-5 pb-[26px] lg:pt-[26px] lg:pb-[34px]"
        >
          <div className={CONTENEUR}>
            <div className="mb-5 flex items-center gap-2.5 lg:mb-[26px] lg:gap-3">
              {commande.boutique.logo !== null ? (
                /* eslint-disable-next-line @next/next/no-img-element -- le logo
                   est servi par une URL signée à expiration ; l'optimiseur la
                   mettrait en cache au-delà de sa validité. */
                <img
                  src={commande.boutique.logo}
                  alt=""
                  width={34}
                  height={34}
                  className="h-[34px] w-[34px] rounded-full object-contain lg:h-[38px] lg:w-[38px]"
                />
              ) : null}
              {commande.boutique.nom !== null ? (
                <span className="font-headline-md text-[16px] leading-5 font-bold tracking-[-0.01em] lg:text-[18px] lg:leading-[23px]">
                  {commande.boutique.nom}
                </span>
              ) : null}
            </div>
            <EnTeteTitre
              titre={t("titre")}
              client={commande.client}
              reference={commande.reference}
              pourClient={t.raw("pourClient")}
              doux={accent.surRemplissageDoux}
              arriveeEstimee={t("etat.arriveeEstimee")}
              estimation={estimation}
            />
          </div>
        </header>
      ) : (
        <div className="pt-[30px] lg:pt-8">
          <div className={CONTENEUR}>
            <EnTeteTitre
              titre={t("titre")}
              client={commande.client}
              reference={commande.reference}
              pourClient={t.raw("pourClient")}
              doux="var(--color-on-surface-variant)"
              arriveeEstimee={t("etat.arriveeEstimee")}
              estimation={estimation}
            />
          </div>
        </div>
      )}

      {/*
        UNE SEULE GRILLE, TROIS BLOCS, PLACEMENT EXPLICITE.

        L'ordre de la SOURCE est celui du téléphone — état, galerie, détail —
        parce que c'est lui qui compte pour la grande majorité des visiteurs et
        pour qui lit la page sans feuille de style.

        ⚠️ LA CARTE D'ÉTAT EXISTE EN DEUX EXEMPLAIRES, ET C'EST CE QUI PERMET
        D'AVOIR UNE GRILLE À UNE SEULE RANGÉE. Le premier jet en faisait trois
        blocs sur deux rangées, la galerie couvrant les deux : mesuré à
        1 440 px, un trou de 279 px s'ouvrait entre la carte « Expédition » et
        la carte « Suivi ». Une grille distribue la hauteur d'un élément qui
        enjambe plusieurs rangées ENTRE ces rangées ; la première n'était donc
        plus à la hauteur de son contenu, et la seconde commençait au milieu de
        la galerie. Deux colonnes, une rangée, aucun calcul de hauteur.
      */}
      <main
        id="contenu"
        className="mx-auto w-full max-w-[600px] flex-grow lg:grid lg:max-w-[1240px] lg:grid-cols-[1.55fr_1fr] lg:items-start lg:gap-[30px] lg:px-14 lg:pt-[34px]"
      >
        {/* LA CARTE À LA COULEUR DU VENDEUR — téléphone uniquement. */}
        <div className={"px-[18px] lg:hidden " + (aUnEnTete ? "pt-4" : "pt-5")}>
          {etatExpedition("accent")}
        </div>

        <div>
          {/* PLEINE LARGEUR AU TÉLÉPHONE. Les vignettes sortent des marges :
              c'est ce que le client vient voir, et une marge de chaque côté lui
              coûte un dixième de la surface de chaque photo. */}
          <div className="pt-6 lg:pt-0">
            <div className="mb-[13px] flex items-baseline justify-between gap-4 px-[18px] lg:mb-3.5 lg:px-0">
              <p className={surTitre}>{t("galerie.titre")}</p>
              {commande.medias.length > 0 ? (
                <>
                  {/* Le nombre nu au téléphone, nommé sur grand écran : la
                      place n'est pas la même, et « 7 éléments » sur 390 px
                      pousse le titre de la section. */}
                  <span className="font-body-md text-[12px] text-on-surface-variant lg:hidden">
                    {format.number(commande.medias.length)}
                  </span>
                  <span className="hidden font-body-md text-[13px] text-on-surface-variant lg:inline">
                    {t("galerie.compte", { n: commande.medias.length })}
                  </span>
                </>
              ) : null}
            </div>

            {commande.medias.length === 0 ? (
              /* LA GALERIE VIDE SE DIT. Ni cadres gris ni « bientôt
                 disponible » : on nomme ce qui est, et on dit ce qui va se
                 passer. L'icône n'ajoute pas d'information — elle donne au bloc
                 la forme d'un état voulu plutôt que celle d'un chargement qui
                 n'a pas abouti. */
              <div className="px-[18px] lg:px-0">
                <div className="rounded-lg border border-dashed border-filet-vide px-5 py-8 text-center">
                  <svg
                    width="26"
                    height="26"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="mx-auto mb-3 text-gris-illustration"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="3" />
                    <circle cx="8.5" cy="8.5" r="1.6" />
                    <path d="m21 15-5-5L5 21" />
                  </svg>
                  <p className="font-body-md text-[15px] font-semibold text-on-surface">
                    {t("galerie.videTitre")}
                  </p>
                  <p className="mt-1 font-body-md text-[14px] leading-[21px] text-on-surface-variant">
                    {t("galerie.videTexte")}
                  </p>
                </div>
              </div>
            ) : (
              <Visionneur
                jeton={commande.jeton}
                medias={mediasAvecCouvertureEnTete.map((m) => ({
                  id: m.id,
                  type: m.type,
                  urlVignette: m.urlVignette,
                  urlCouverture: m.urlCouverture,
                  largeur: m.largeur,
                  hauteur: m.hauteur,
                }))}
                // Le texte du filigrane est le NOM DE LA BOUTIQUE. La base a
                // déjà décidé si un filigrane est possible : elle éteint le
                // drapeau quand il n'y a pas de nom, ce qui rend ce `??`
                // inatteignable — il est là parce que le typage l'exige, pas
                // comme un repli.
                filigrane={commande.boutique.filigrane ? (commande.boutique.nom ?? null) : null}
                libelles={{
                  ouvrir: t("galerie.ouvrir"),
                  fermer: t("galerie.fermer"),
                  precedent: t("galerie.precedent"),
                  suivant: t("galerie.suivant"),
                  chargement: t("galerie.chargement"),
                  indisponible: t("galerie.indisponible"),
                  position: t("galerie.position"),
                  balayez: t("galerie.balayez"),
                }}
              />
            )}
          </div>

          {/*
            L'ARBITRAGE QC vient JUSTE APRÈS CE QU'IL JUGE : on ne demande pas à
            quelqu'un de se prononcer sur des photos avant de les lui avoir
            montrées.

            OMIS QUAND IL N'Y A AUCUNE PHOTO. Demander « ces photos
            correspondent-elles ? » devant une galerie vide n'appelle aucune
            réponse sensée, et une décision prise là-dessus serait écrite au
            journal comme les autres.
          */}
          {commande.medias.length > 0 ? (
            <div className="px-[18px] py-[26px] lg:mt-[26px] lg:rounded-[18px] lg:border lg:border-outline-variant lg:px-6 lg:py-6">
              <p className={surTitre + " mb-[13px] lg:mb-3.5"}>{t("qc.titre")}</p>
              <ArbitrageQc
                jeton={commande.jeton}
                etatInitial={commande.qc}
                remplissage={accent.remplissage}
                surRemplissage={accent.surRemplissage}
                libelles={{
                  texte: t("qc.texte"),
                  approuver: t("qc.approuver"),
                  refuser: t("qc.refuser"),
                  commentaire: t("qc.commentaire"),
                  envoi: t("qc.envoi"),
                  annuler: t("qc.annuler"),
                  /* LES LIBELLÉS NE DISENT PLUS « VOUS ». Le vendeur peut
                     reporter dans son éditeur une réponse reçue par message
                     privé — c'est une fonction voulue — et la page affichait
                     alors « Vous avez validé cette commande » à un client qui
                     n'avait rien validé. Une phrase qui parle du lecteur et
                     qui est fausse est pire qu'une phrase neutre, et c'est
                     celle-là qu'on invoquerait en cas de litige. */
                  approuve: t("qc.approuve"),
                  refuse: t("qc.refuse"),
                  modifier: t("qc.modifier"),
                  echec: t("qc.echec"),
                }}
              />
            </div>
          ) : null}
        </div>

        <div className="lg:flex lg:flex-col lg:gap-4">
          {/* LA CARTE « EXPÉDITION » — grand écran uniquement. Elle est ici, en
              tête de la colonne de droite, et non dans un bloc à part : c'est
              ce qui garde la grille à une seule rangée. */}
          <div className="hidden lg:block">{etatExpedition("carte")}</div>

          {/* OMIS tant qu'aucun colis n'est enregistré : une carte vide
              affirmerait qu'il y a quelque chose à y lire. */}
          {suivi !== null ? (
            <section className={section}>
              <p className={surTitre + " mb-[13px] lg:mb-3.5"}>{t("suivi.titre")}</p>
              <Suivi
                suivi={suivi}
                accent={accent.interface}
                formaterDate={(instant) =>
                  format.dateTime(instant, {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                }
                libelles={{
                  numero: t("suivi.numero"),
                  arrete: t("suivi.arrete"),
                }}
              />
            </section>
          ) : null}

          {/* Bloc OMIS quand ni référence ni destinataire : une carte vide
              affirmerait qu'il y a quelque chose à y lire. */}
          {commande.reference !== null || commande.client !== null ? (
            <section className={section}>
              <p className={surTitre + " mb-[13px] lg:mb-3.5"}>{t("details.titre")}</p>
              <dl className="flex flex-col gap-[13px]">
                {commande.reference !== null ? (
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="font-body-md text-[14px] text-on-surface-variant">
                      {t("details.reference")}
                    </dt>
                    <dd className="text-right font-label-md text-[14px] font-bold text-on-surface">
                      {commande.reference}
                    </dd>
                  </div>
                ) : null}
                {commande.client !== null ? (
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="font-body-md text-[14px] text-on-surface-variant">
                      {t("details.destinataire")}
                    </dt>
                    <dd className="text-right font-label-md text-[14px] font-bold text-on-surface">
                      {commande.client}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </section>
          ) : null}
        </div>
      </main>

      {/* LES RÉSEAUX DU VENDEUR, s'il en a configuré. Le titre porte son nom —
          et SANS nom, il n'y a pas de titre du tout. Un texte de remplacement
          est ce que la décision 26 interdit, et ce que la planche
          `PageClientSansEntete` refuse explicitement. */}
      <ReseauxVendeur
        boutique={commande.boutique}
        note={t("reseaux.note")}
        titre={
          commande.boutique.nom === null
            ? null
            : substituer(t.raw("reseaux.titre"), "{nom}", commande.boutique.nom)
        }
      />

      <footer className="border-t border-filet-section px-[18px] pt-[22px] pb-[26px] text-center lg:px-14 lg:py-[26px]">
        {/*
          « Powered by DropLink », avec ses trois garde-fous : secondaire
          visuellement, jamais confondable avec l'expéditeur, et ouverture HORS
          de la page — le client est venu voir sa commande, pas nous.
        */}
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="font-body-sm text-[12px] text-on-surface-variant hover:underline"
        >
          {t("propulsePar")}
        </a>
      </footer>

      {/* Monté APRÈS le premier rendu — c'est toute la différence entre une page
          chargée et une page vue. Il ne rend rien. */}
      <BaliseVue jeton={commande.jeton} />
    </div>
  );
}

/**
 * Le titre, le destinataire et — sur grand écran seulement — la date d'arrivée.
 *
 * Ils sont extraits parce qu'ils existent en DEUX exemplaires — sur l'aplat
 * d'accent quand la boutique est configurée, sur fond blanc sinon — et que
 * deux copies d'un même bloc divergent toujours par le libellé qu'on oublie de
 * corriger dans la seconde.
 *
 * LA RÉFÉRENCE PRODUIT NE PARAÎT QUE SUR GRAND ÉCRAN, à la suite du
 * destinataire : c'est ce que dessine `PageClientDesktop`, et sur 390 px cette
 * ligne passerait sur deux lignes pour une information qui est déjà dans la
 * carte « Détails ».
 */
function EnTeteTitre({
  titre,
  client,
  reference,
  pourClient,
  doux,
  arriveeEstimee,
  estimation,
}: {
  readonly titre: string;
  readonly client: string | null;
  readonly reference: string | null;
  readonly pourClient: string;
  readonly doux: string;
  readonly arriveeEstimee: string;
  readonly estimation: string | null;
}) {
  const pour = client === null ? null : substituer(pourClient, "{nom}", client);

  return (
    <div className="lg:flex lg:items-end lg:justify-between lg:gap-10">
      <div className="min-w-0">
        <h1 className="font-headline-lg text-[32px] leading-[37px] font-extrabold tracking-[-0.03em] lg:text-[44px] lg:leading-[50px] lg:tracking-[-0.035em]">
          {titre}
        </h1>
        {pour !== null || reference !== null ? (
          <p
            className="mt-1.5 font-body-md text-[15px] leading-[22px] lg:mt-2 lg:text-[17px] lg:leading-[26px]"
            style={{ color: doux }}
          >
            {pour}
            {reference !== null ? (
              <span className="hidden lg:inline">{pour === null ? reference : " · " + reference}</span>
            ) : null}
          </p>
        ) : null}
      </div>

      {/* La date d'arrivée MONTE ICI sur grand écran, parce que la carte
          d'expédition de droite porte l'étape à sa place. Au téléphone elle
          reste dans la carte à la couleur du vendeur, en tête de page. */}
      {estimation !== null ? (
        <div className="hidden shrink-0 text-right lg:block">
          <p className="mb-1 font-body-sm text-[13px]" style={{ color: doux }}>
            {arriveeEstimee}
          </p>
          <p className="font-headline-md text-[24px] leading-[30px] font-extrabold tracking-[-0.025em]">
            {estimation}
          </p>
        </div>
      ) : null}
    </div>
  );
}
