import type { ReactNode } from "react";
import { Image as ImageIcon } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { ArbitrageQc } from "@/components/publique/arbitrage-qc";
import { CARTE, TitreCarte } from "@/components/publique/carte-client";
import { CarteCommande } from "@/components/publique/carte-commande";
import { CarteContact } from "@/components/publique/carte-contact";
import { CarteLivraison, type LigneLivraison } from "@/components/publique/carte-livraison";
import { CartePropulsee } from "@/components/publique/carte-propulsee";
import { CarteNotifications } from "@/components/publique/carte-notifications";
import { envoiClientConfigure } from "@/lib/email/config";
import { EnTeteBoutique } from "@/components/publique/en-tete-boutique";
import { HistoriqueSuivi } from "@/components/publique/historique-suivi";
import { estimationVisible } from "@/lib/page-publique/estimation";
import { Visionneur } from "@/components/publique/visionneur";
import type { CommandePublique, SuiviPublic } from "@/lib/page-publique/lecture";
import { resoudreAccent } from "@/lib/design/contraste";
import { estLangueSupportee } from "@/i18n/config";
import { decrireSilence } from "@/lib/tracking/silence";
import { lireTransporteur } from "@/lib/tracking/transporteurs";

/**
 * LA PAGE QUE VOIT LE CLIENT.
 *
 * Elle est ouverte UNE FOIS, au téléphone, en 4G, depuis un message privé. Tout
 * ce qui suit découle de cette phrase.
 *
 * ⚠️ PORTÉE SUR LE KIT `client_link` LE 13/09/2026, ET CE N'ÉTAIT PAS UNE PASSE DE
 * DÉTAIL. Le canevas peignait un BANDEAU à la couleur du vendeur et rangeait
 * tout en deux colonnes de sections titrées en majuscules ; le kit compose une
 * page de CARTES : l'identité de la boutique, « Votre commande » avec sa
 * référence et une frise datée, la galerie, l'historique du suivi, puis à
 * droite les informations de livraison et le contact.
 *
 * L'ORDRE DE LA SOURCE EST CELUI DU TÉLÉPHONE, et c'est lui qui compte pour la
 * grande majorité des visiteurs : où en est la commande, à quoi elle ressemble
 * (la galerie), est-ce que c'est bien ça (la validation, juste après ce qu'elle
 * juge), et seulement ensuite le détail du transport. Sur grand écran, la
 * colonne de droite reçoit la livraison et le contact.
 *
 * LA COULEUR DU VENDEUR VIT DANS CE QUI PORTE UNE INFORMATION — la frise, le
 * bandeau d'état, le bouton de contact —, jamais en dur : `resoudreAccent()`
 * décide de chaque couleur, sinon un accent jaune rendrait un titre illisible.
 * Et le dégradé de marque DropLink n'apparaît nulle part ici : c'est sa page,
 * pas la nôtre.
 *
 * AUCUN GLASSMORPHISM, AUCUN `backdrop-blur`. Le flou n'a rien à flouter sur un
 * fond uni, et c'est ce qui coûte le plus cher sur un appareil d'entrée de
 * gamme.
 *
 * LA LANGUE EST CELLE DU VENDEUR, lue en base. Aucun provider de traduction
 * n'est expédié au navigateur : les Server Components résolvent, et les îlots
 * reçoivent leurs libellés en propriétés.
 *
 * UNE INFORMATION ABSENTE EST OMISE. Pas de texte de remplacement, pas de
 * valeur inventée, pas de carte vide : sur cette page, « nous n'avons pas
 * encore cette information » se dit en n'affichant rien.
 *
 * CE QUE LE KIT DESSINE ET QUE LA PAGE NE PORTE PAS, et pourquoi :
 *  - le logo DropLink en tête et le sélecteur de langue : la page appartient
 *    au vendeur, et sa langue est celle qu'il a choisie ;
 *  - (JUSQU'AU 23/09/2026) la carte « Notifications automatiques » : elle
 *    affirmait au client qu'il serait prévenu, et rien ne l'y abonnait. Wassim
 *    a LEVÉ la décision 3 ce jour-là : la carte porte désormais le champ et le
 *    bouton (`CarteNotifications`), et n'apparaît que si l'envoi est configuré ;
 *  - la carte promotionnelle « Découvrir DropLink » : la décision 25 exige une
 *    mention SECONDAIRE, jamais confondable avec l'expéditeur. Elle reste au
 *    pied, discrète ;
 *  - le lien « Aide », qui ne mène à rien que le client puisse utiliser.
 */

/**
 * LE CONTENEUR DU KIT : 1 180 px, gouttière 24.
 *
 * Mesuré sur la référence servie : `max-width: 1180px`, padding `0 24px 40px`,
 * et la grille rend 704 + 18 + 410 = 1 132, soit exactement 1 180 moins ses
 * deux gouttières. Les trois nombres se vérifient l'un l'autre.
 *
 * ⚠️ AUCUNE GOUTTIÈRE SOUS `lg` : les cartes y deviennent des sections pleine
 * largeur qui portent leur propre remplissage (`carte-client.tsx`).
 *
 * ⚠️ ET 600 px JUSQU'À `lg`, PAS PLEINE LARGEUR. Entre 768 et 1 023 px la page
 * reste en une colonne ; sans plafond, elle s'étirait jusqu'au bord et la
 * frise étalait ses quatre étapes sur 900 px.
 */
const CONTENEUR = "mx-auto w-full max-w-[600px] lg:max-w-[1180px] lg:px-6";

export async function PageClient({
  token,
  commande,
  suivi,
  apercu,
  children,
}: {
  /** Le jeton tel que l URL l a porté — celui que la carte de suivi par e-mail renvoie. */
  readonly token: string;
  readonly commande: CommandePublique;
  readonly suivi: SuiviPublic | null;
  /**
   * LA MÊME PAGE, RENDUE DANS L APERÇU DE L ÉDITEUR. Deux différences, et deux
   * seulement : les deux gestes qui ÉCRIVENT au nom du client — l arbitrage des
   * photos et l inscription aux e-mails — sont inertes, et rien n est compté
   * (c est la page, pas ce composant, qui pose la balise de vue).
   */
  readonly apercu: boolean;
  /** Ce que la page publique ajoute en fin de document : la balise de vue. */
  readonly children?: ReactNode;
}) {
  const langue = estLangueSupportee(commande.boutique.langue) ? commande.boutique.langue : "fr";
  const t = await getTranslations({ locale: langue, namespace: "page-publique" });
  const tn = await getTranslations({ locale: langue, namespace: "notifications.carte" });
  const format = await getFormatter({ locale: langue });

  // L'INSTANT EST PRIS UNE SEULE FOIS, ici, et descendu en propriété. Un
  // composant qui lit l'horloge lui-même rend une chose au serveur et une autre
  // à l'hydratation.
  const maintenant = new Date();

  /*
   * LE STATUT AFFICHÉ VIENT DU COLIS DÈS QU'IL EN EXISTE UN.
   *
   * « Le vendeur prime avant la remise au transporteur, le transporteur après » :
   * chacun est seul à savoir ce qu'il affirme. Prendre le maximum des deux
   * plutôt que l'un ou l'autre garantit en plus que l'étape ne recule jamais à
   * l'écran, même si le vendeur remet sa commande « en préparation » par
   * mégarde.
   */
  const ETAPES = ["preparation", "expedie", "en_transit", "livre"] as const;
  const statutAffiche =
    suivi === null || ETAPES.indexOf(commande.statut) > ETAPES.indexOf(suivi.etape)
      ? commande.statut
      : suivi.etape;

  // La conformité de contraste est obtenue AUTOMATIQUEMENT : le vendeur n'a pas
  // à chercher « une couleur qui marche ». Un rouge saturé reste lisible.
  const accent = resoudreAccent(commande.boutique.couleur);

  const dernier =
    suivi === null || suivi.dernierMouvement === null ? null : new Date(suivi.dernierMouvement);
  // L ETAPE AFFICHEE, pas le statut brut de la commande : c est celle que le
  // client voit sur la frise, et le silence doit s accorder avec elle.
  const silence = decrireSilence(dernier, maintenant, statutAffiche);

  // En UTC, comme `estimationVisible` : le jour affiché et le jour qui décide
  // de la péremption ne peuvent pas dépendre du fuseau du serveur.
  const jour = (instant: Date): string =>
    format.dateTime(instant, { day: "numeric", month: "long", timeZone: "UTC" });

  /*
   * LA FOURCHETTE D'ARRIVÉE. Quand ses deux bornes tombent le même jour, on
   * n'écrit pas « 2 — 2 septembre ». Quand le transporteur n'a rien annoncé,
   * elle disparaît : une fourchette inventée serait indiscernable d'une vraie.
   *
   * ⚠️ ELLE DISPARAÎT AUSSI QUAND ELLE EST DÉPASSÉE, QUAND LE COLIS EST LIVRÉ ET
   * QUAND IL SE TAIT depuis plus de dix jours. Mesuré le 02/09/2026 : la page
   * annonçait « 24 août — 27 août » six jours après, et « 6 — 9 septembre » à
   * côté d'une frise « Livré ». Une date qu'on sait fausse est pire qu'une
   * absence de date — la règle vit dans `estimationVisible`, qui la compare AU
   * JOUR : le transporteur annonce une date, pas un horaire.
   */
  const du = suivi?.estimationDu == null ? null : new Date(suivi.estimationDu);
  const au = suivi?.estimationAu == null ? null : new Date(suivi.estimationAu);
  const estimation = !estimationVisible({
    du,
    au,
    etape: statutAffiche,
    silencieux: silence.etat === "silencieux",
    maintenant,
  })
    ? null
    : du === null || au === null || jour(au) === jour(du)
      ? jour(du as Date)
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

  const titresBandeau = {
    preparation: t("bandeau.preparation"),
    expedie: t("bandeau.expedie"),
    en_transit: t("bandeau.en_transit"),
    livre: t("bandeau.livre"),
  } as const;

  /*
   * LE BANDEAU DIT L'ÉTAT EN UNE PHRASE. Sa seconde ligne est l'ANCIENNETÉ du
   * dernier mouvement — le seul élément de la page qui change tous les jours
   * quand le colis ne bouge pas (décision 8). En préparation sans colis, il n'y
   * a pas de mouvement à dater : la ligne dit ce que le vendeur a déclaré, rien
   * de plus.
   */
  const bandeau =
    silence.etat === "silencieux"
      ? {
          titre: t.raw("suivi.silenceTitre").replace("{n}", String(silence.jours)),
          texte: t("suivi.silence"),
          silencieux: true,
        }
      : {
          titre: titresBandeau[statutAffiche],
          texte:
            statutAffiche === "preparation" && suivi === null
              ? t("bandeau.preparationTexte")
              : anciennete,
          silencieux: false,
        };

  const dateEtHeure = (instant: string | null) =>
    instant === null
      ? null
      : {
          jour: format.dateTime(new Date(instant), { day: "numeric", month: "short", year: "numeric" }),
          heure: format.dateTime(new Date(instant), { hour: "2-digit", minute: "2-digit" }),
        };

  /*
   * ⚠️ UNE DATE PAR ÉTAPE, SEULEMENT QUAND LA BASE LA CONNAÎT. La création de la
   * commande date la préparation ; le premier mouvement du transporteur date
   * l'expédition ; le dernier date la livraison. « En transit » n'a pas de date
   * propre, et n'en reçoit pas.
   *
   * ⚠️ LA DATE DE PRÉPARATION DISPARAÎT QUAND ELLE SUIT L'EXPÉDITION. Un vendeur
   * peut créer la page d'une commande déjà partie — c'est même le cas de tout
   * import — et la frise affichait alors « Préparation 13 sept. » avant
   * « Expédié 10 sept. ». La création de la page n'est pas la préparation de
   * la commande ; elle n'en tient lieu que tant qu'elle ne la contredit pas.
   */
  const premierMouvement = suivi?.premierMouvement ?? null;
  const preparationContredite =
    premierMouvement !== null &&
    new Date(commande.creeeLe).getTime() > new Date(premierMouvement).getTime();
  const dates = {
    preparation: preparationContredite ? null : dateEtHeure(commande.creeeLe),
    expedie: dateEtHeure(premierMouvement),
    en_transit: null,
    livre: statutAffiche === "livre" ? dateEtHeure(suivi?.dernierMouvement ?? null) : null,
  } as const;

  // EN-TÊTE OMIS quand il n'y a NI nom NI logo — décision 24. Pas de carte vide,
  // pas de libellé de remplacement : un vendeur qui n'a rien configuré obtient
  // une page qui commence par sa commande.
  const aUnEnTete = commande.boutique.nom !== null || commande.boutique.logo !== null;

  /*
   * LES LIGNES DE LIVRAISON, dans l'ordre du kit, puis les deux que le produit
   * portait déjà. Le transporteur n'est nommé que si le catalogue officiel le
   * connaît : un code brut n'apprend rien au client.
   */
  const transporteur = lireTransporteur(commande.codeTransporteur);
  const numeroCommande = commande.numeroSuivi?.trim() ?? "";
  const numero = suivi?.numero ?? (numeroCommande === "" ? null : numeroCommande);
  const lignesLivraison: LigneLivraison[] = [];
  if (transporteur !== null)
    lignesLivraison.push({
      cle: "transporteur",
      libelle: t("livraison.transporteur"),
      valeur: transporteur.nom,
    });
  if (numero !== null)
    lignesLivraison.push({ cle: "numero", libelle: t("livraison.numero"), valeur: numero });
  if (estimation !== null)
    lignesLivraison.push({
      cle: "estimation",
      libelle: t("livraison.dateEstimee"),
      valeur: estimation,
    });
  if (commande.client !== null)
    lignesLivraison.push({
      cle: "destinataire",
      libelle: t("details.destinataire"),
      valeur: commande.client,
    });
  if (commande.reference !== null)
    lignesLivraison.push({
      cle: "reference",
      libelle: t("details.reference"),
      valeur: commande.reference,
    });

  /*
   * LA COUVERTURE CHOISIE PAR LE VENDEUR PASSE EN TÊTE.
   *
   * ⚠️ DÉFAUT TROUVÉ EN PILOTANT LE PRODUIT LE 27/08/2026. « Définir comme
   * couverture » écrivait bien `cover_media_id` en base — et la page du client
   * montrait la PREMIÈRE photo par position, quoi qu'il arrive. Le réglage était
   * enregistré, affiché, et sans effet.
   *
   * ON RÉORDONNE ICI plutôt que dans le visionneur : celui-ci se sert de la
   * POSITION dans le tableau pour son index de plein écran, pour ses tuiles et
   * pour son compteur « 3 / 12 ».
   */
  const mediasAvecCouvertureEnTete =
    commande.couverture === null
      ? commande.medias
      : [
          ...commande.medias.filter((m) => m.id === commande.couverture),
          ...commande.medias.filter((m) => m.id !== commande.couverture),
        ];

  return (
    <div
      lang={langue}
      /*
       * ⚠️ LE FOND TEINTÉ N'APPARAÎT QU'À PARTIR DE `md`, et c'est un motif à
       * conserver : au téléphone la page est pleine largeur, un fond teinté n'y
       * encadrerait rien et ferait payer un dégradé à l'appareil le plus lent.
       */
      /*
       * ⚠️ `leading-[normal]` ET NON L'INTERLIGNE DU PRODUIT. Le kit ne pose
       * aucun interligne sur ses libellés : ils rendent l'interligne NORMAL de
       * la police, et la page héritait de 1,5 — chaque libellé de 12 à 15 px
       * mesurait 3 à 6 px de trop. Ce qui porte un interligne à soi le déclare.
       */
      className="flex min-h-dvh flex-col bg-ds-surface-carte leading-[normal] md:bg-[image:var(--degrade-ds-page-client)]"
    >
      {/* 82 PX AU-DESSUS DE LA PREMIÈRE CARTE : la hauteur de la barre du kit
          — logo DropLink et sélecteur de langue —, que la page ne porte pas.
          L'espace reste, pour que la carte de boutique tombe là où le kit la
          pose. */}
      <main id="contenu" className={CONTENEUR + " flex-grow lg:pt-[82px]"}>
        {aUnEnTete ? (
          <EnTeteBoutique
            boutique={commande.boutique}
            commandeDe={t("commandeDe")}
            libelleSite={t("reseaux.site")}
          />
        ) : null}

        {/*
          DEUX COLONNES, CHACUNE UNE PILE — et non une grille à rangées. Une
          grille distribue la hauteur d'un élément entre les rangées qu'il
          enjambe : mesuré sur le canevas, un trou de 279 px s'ouvrait ainsi
          entre deux cartes. Deux piles indépendantes n'ont rien à distribuer.
        */}
        <div className="lg:mt-[18px] lg:grid lg:grid-cols-[minmax(0,1.72fr)_minmax(0,1fr)] lg:items-start lg:gap-[18px]">
          <div className="flex flex-col lg:gap-[18px]">
            <CarteCommande
              reference={commande.referenceCourte}
              statut={statutAffiche}
              estimation={estimation}
              dates={dates}
              bandeau={bandeau}
              accent={accent}
              libelles={{
                titre: t("titre"),
                sousTitre: t("commande.sousTitre"),
                dateEstimee: t("commande.dateEstimee"),
                etapes: {
                  preparation: t("frise.preparation"),
                  expedie: t("frise.expedie"),
                  en_transit: t("frise.en_transit"),
                  livre: t("frise.livre"),
                },
                enCours: t("frise.enCours"),
                enAttente: t("frise.enAttente"),
              }}
            />

            <section className={CARTE}>
              <TitreCarte>
                {t("galerie.titre")}
                {commande.medias.length > 0 ? (
                  <span className="font-medium text-ds-texte-sourdine">
                    {" (" + format.number(commande.medias.length) + ")"}
                  </span>
                ) : null}
              </TitreCarte>

              {commande.medias.length === 0 ? (
                /* LA GALERIE VIDE SE DIT. Ni cadres gris ni « bientôt
                   disponible » : on nomme ce qui est, et on dit ce qui va se
                   passer. */
                <div className="rounded-ds-card border border-dashed border-ds-filet-appuye px-5 py-8 text-center">
                  {/* LUCIDE, pas un tracé recopié à la main (règle d'iconographie) ;
                      rendu côté serveur, donc sans un octet de JavaScript. */}
                  <ImageIcon aria-hidden="true" size={26} strokeWidth={1.8} className="mx-auto mb-3 text-ds-texte-tenu" />
                  <p className="text-[15px] font-semibold text-ds-texte-fort">
                    {t("galerie.videTitre")}
                  </p>
                  <p className="mt-1 text-[14px] leading-[21px] text-ds-texte-corps">
                    {t("galerie.videTexte")}
                  </p>
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
                  // inatteignable — il est là parce que le typage l'exige.
                  filigrane={commande.boutique.filigrane ? (commande.boutique.nom ?? null) : null}
                  libelles={{
                    ouvrir: t("galerie.ouvrir"),
                    ouvrirVideo: t("galerie.ouvrirVideo"),
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
            </section>

            {/*
              L'ARBITRAGE QC vient JUSTE APRÈS CE QU'IL JUGE : on ne demande pas
              à quelqu'un de se prononcer sur des photos avant de les lui avoir
              montrées. Le design system le déclare hors de son périmètre ; il
              prend donc la carte du kit, sans rien inventer d'autre.

              OMIS QUAND IL N'Y A AUCUNE PHOTO : « ces photos correspondent-elles
              ? » devant une galerie vide n'appelle aucune réponse sensée.
            */}
            {commande.medias.length > 0 ? (
              <section className={CARTE}>
                <TitreCarte>{t("qc.titre")}</TitreCarte>
                <Inerte si={apercu}>
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
                      /* LES LIBELLÉS NE DISENT PAS « VOUS ». Le vendeur peut
                         reporter dans son éditeur une réponse reçue par message
                         privé, et la page affichait alors « Vous avez validé
                         cette commande » à un client qui n'avait rien validé. */
                      approuve: t("qc.approuve"),
                      refuse: t("qc.refuse"),
                      modifier: t("qc.modifier"),
                      echec: t("qc.echec"),
                    }}
                  />
                </Inerte>
              </section>
            ) : null}

            {/* OMIS tant qu'aucun colis n'est enregistré : une carte vide
                affirmerait qu'il y a quelque chose à y lire. */}
            {suivi !== null ? (
              <HistoriqueSuivi
                suivi={suivi}
                accent={accent}
                formaterDate={(instant) =>
                  format.dateTime(instant, {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                }
                libelles={{
                  titre: t("historique.titre"),
                  arrete: t("suivi.arrete"),
                  attenteTitre: t("suivi.attenteTitre"),
                  attenteTexte: t("suivi.attenteTexte"),
                  voirTout: t("historique.voirTout", { n: suivi.passages.length }),
                  reduire: t("historique.reduire"),
                }}
              />
            ) : null}
          </div>

          <div className="flex flex-col lg:gap-[18px]">
            <CarteLivraison titre={t("livraison.titre")} lignes={lignesLivraison} accent={accent} />
            <CarteContact
              boutique={commande.boutique}
              libelleSite={t("reseaux.site")}
              accent={accent}
              libelles={{
                titre: t("contact.titre"),
                texte: t("contact.texte"),
                bouton: t("contact.bouton"),
              }}
            />
            {/* LE SUIVI PAR E-MAIL (planche `NotificationsCard`). ABSENT quand aucun
                e-mail ne peut partir : une promesse qu'aucun envoi ne tiendrait est
                pire qu'une carte absente (contrainte n° 8). */}
            {envoiClientConfigure() ? (
              <Inerte si={apercu}>
                <CarteNotifications
                  jeton={token}
                  accent={accent}
                  libelles={{
                    titre: tn("titre"),
                    texte: tn("texte"),
                    champ: tn("champ"),
                    bouton: tn("bouton"),
                    envoye: tn("envoye"),
                    invalide: tn("invalide"),
                    trop: tn("trop"),
                    erreur: tn("erreur"),
                  }}
                />
              </Inerte>
            ) : null}
            {/* LA CARTE « PROPULSÉ PAR DROPLINK » (planche `PoweredCard`), en gratuit seulement —
                un compte Pro qui l'a demandé la retire (décision de Wassim, 19/09/2026). */}
            {commande.boutique.marqueMasquee ? null : (
              <CartePropulsee
                langue={langue}
                accent={accent}
                libelles={{
                  surtitre: t("carteDropLink.surtitre"),
                  titre: t("carteDropLink.titre"),
                  texte: t("carteDropLink.texte"),
                  bouton: t("carteDropLink.bouton"),
                }}
              />
            )}
          </div>
        </div>
      </main>

      <footer className={CONTENEUR}>
        <div className="flex flex-col items-start gap-2.5 border-t border-ds-filet px-[18px] pt-[26px] pb-8 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between lg:gap-5 lg:border-t-0 lg:px-0 lg:pb-10">
          {/*
            ⚠️ CHAQUE LIEN DU PIED EST UNE CIBLE TACTILE, ET LA MARGE NÉGATIVE EN
            EST LA MOITIÉ INDISSOCIABLE. `min-h-11` porte la cible à 44 px
            (règle 5) ; `-my-3.5` vaut (44 − 16) / 2 et rend au flux sa hauteur
            exacte, sans quoi le pied grandirait de 28 px. Au bureau, où il n'y a
            pas de pouce, le lien reprend la hauteur de son texte, comme au kit.
            La classe est écrite
            sur chaque lien et non dans une constante : c'est là que
            `cibles-tactiles.test.ts` la lit.

            ⚠️ LE PIED NE DIT PLUS « Propulsé par DropLink » (19/09/2026). Il le disait
            en sourdine, pour tous les comptes, quand la décision 25 interdisait la
            carte promotionnelle du kit. Wassim a tranché autrement : la CARTE le dit,
            en gratuit, et un compte Pro la retire. Garder aussi le lien du pied
            faisait écrire la même mention deux fois sur la page d'un vendeur gratuit,
            et la laissait sur celle d'un vendeur Pro qui a payé pour la retirer.

            ⚠️ LE KIT ÉCRIT « © DropLink. Tous droits réservés. » À CETTE PLACE,
            et la page ne le fait pas : sur la page d'un vendeur, un droit
            d'auteur au nom de DropLink se lit comme le propriétaire de la page.
            Les deux liens gardent donc la droite du pied, comme au kit.
          */}
          <span className="flex flex-wrap gap-x-[18px] lg:ml-auto lg:gap-x-6">
            <a
              href={`/${langue}/conditions`}
              target="_blank"
              rel="noopener noreferrer"
              className="-my-3.5 inline-flex min-h-11 items-center whitespace-nowrap text-[13px] text-ds-texte-sourdine hover:underline lg:my-0 lg:min-h-0"
            >
              {t("pied.conditions")}
            </a>
            <a
              href={`/${langue}/confidentialite`}
              target="_blank"
              rel="noopener noreferrer"
              className="-my-3.5 inline-flex min-h-11 items-center whitespace-nowrap text-[13px] text-ds-texte-sourdine hover:underline lg:my-0 lg:min-h-0"
            >
              {t("pied.confidentialite")}
            </a>
          </span>
        </div>
      </footer>

      {children}
    </div>
  );
}

/**
 * CE QUE L'APERÇU NE DOIT PAS POUVOIR FAIRE : ÉCRIRE AU NOM DU CLIENT.
 *
 * « Approuver » depuis l'aperçu validerait la commande à la place de celui qui
 * doit la juger, et le vendeur le ferait en croyant seulement regarder. Les deux
 * cartes restent DESSINÉES à l'identique — c'est ce que le client verra —, mais
 * `inert` les retire du clic, du clavier et des lecteurs d'écran.
 *
 * ⚠️ `inert`, ET NON `disabled` : un bouton désactivé se grise, et l'aperçu
 * cesserait de montrer la page telle qu'elle est. ⚠️ ET `contents` : l'enveloppe
 * ne crée aucune boîte, la mise en page de la carte ne voit pas qu'elle existe.
 *
 * Sur la vraie page, rien n'est enveloppé : pas un nœud de plus dans le document
 * que le client télécharge en 4G.
 */
function Inerte({ si, children }: { readonly si: boolean; readonly children: ReactNode }) {
  return si ? (
    <div inert className="contents">
      {children}
    </div>
  ) : (
    children
  );
}
