import type { CSSProperties, ReactNode } from "react";
import { fourchetteDates } from "@/lib/page-publique/fourchette";
import { lieuxDuTrajet, textesDuTrajet } from "@/lib/tracking/lieux-trajet";
import { Image as ImageIcon } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { ArbitrageQc } from "@/components/publique/arbitrage-qc";
import { CarteContact } from "@/components/publique/carte-contact";
import { CarteLivraison, type LigneLivraison } from "@/components/publique/carte-livraison";
import { CartePropulsee } from "@/components/publique/carte-propulsee";
import { CarteNotifications } from "@/components/publique/carte-notifications";
import { envoiClientConfigure } from "@/lib/email/config";
import { HerosClient } from "@/components/publique/heros-client";
import { ApercuHistorique, FeuilleSuivi, SuiviClient, type LignePassage } from "@/components/publique/historique-suivi";
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
 * ⚠️ REFONTE DU 02/10/2026 : LA VERSION 3 DE LA MAQUETTE (`client.html`), décision n° 2
 * de Mehdi. Un haut de page plein à la couleur du VENDEUR, l'état du colis en titre et
 * son trajet dessiné ; puis le dernier mouvement (qui ouvre l'historique en feuille), les
 * photos en carrousel, la validation ; à droite la livraison, le contact, le suivi par
 * e-mail. Ses risques notés au § 5 sont tenus : aucun `mix-blend-mode` sur une vraie
 * photo, aucun texte à opacité réduite sur l'aplat du vendeur (`surRemplissage` y est à
 * 4,5:1 tout juste, toute transparence passait sous le seuil), le trajet nomme ses lieux tels
 * que 17TRACK les donne, sans les interpréter (décision de Mehdi du 03/10/2026), et la feuille
 * est un `<dialog>` natif plutôt qu'un script.
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
  const fourchette = (d: Date, a: Date): string =>
    fourchetteDates(
      d,
      a,
      { memeMois: (v) => t("fourchette.memeMois", v), autreMois: (v) => t("fourchette.autreMois", v) },
      (x, o) => format.dateTime(x, o),
    );
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
      : fourchette(du, au);

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
  // Le plus ancien passage LU contredit aussi la création : sans `premierMouvement` posé, la
  // frise disait « Préparation 2 oct. » avant « Expédié · 29 sept. » (audit final du 03/10/2026).
  const plusAncienLu = (suivi?.passages ?? []).reduce<number | null>((min, p) => {
    const instant = new Date(p.instant).getTime();
    return Number.isNaN(instant) ? min : min === null ? instant : Math.min(min, instant);
  }, null);
  const premierConnu =
    premierMouvement === null ? plusAncienLu : Math.min(new Date(premierMouvement).getTime(), plusAncienLu ?? Infinity);
  const preparationContredite = premierConnu !== null && new Date(commande.creeeLe).getTime() > premierConnu;
  const dates = {
    preparation: preparationContredite ? null : dateEtHeure(commande.creeeLe),
    expedie: dateEtHeure(premierMouvement),
    en_transit: null,
    livre: statutAffiche === "livre" ? dateEtHeure(suivi?.dernierMouvement ?? null) : null,
  } as const;
  // En UTC, comme la fourchette d'arrivée : le jour d'un arrêt ne dépend pas du fuseau du serveur.
  const jourCourt = (instant: string): string => format.dateTime(new Date(instant), { day: "numeric", month: "short", timeZone: "UTC" });
  const joursTrajet = {
    preparation: dates.preparation === null ? null : jourCourt(commande.creeeLe),
    expedie: premierMouvement === null ? null : jourCourt(premierMouvement),
    en_transit: null,
    livre: dates.livre === null || suivi?.dernierMouvement == null ? null : jourCourt(suivi.dernierMouvement),
  } as const;
  /*
   * LE LIEU DE CHAQUE ARRÊT (décision de Mehdi du 03/10/2026) : tel que 17TRACK le donne,
   * jamais interprété — le plus ancien passage d'une étape terminée, le plus récent de
   * l'étape en cours, avec SA date (« Wissous · 30 sept. » ; « aujourd'hui » reste un écart
   * gardé, faute du fuseau du lecteur). Rien quand le passage n'est pas parmi les 30 lus.
   */
  const datesTrajet = textesDuTrajet(lieuxDuTrajet(suivi?.passages ?? [], statutAffiche), joursTrajet, statutAffiche, jourCourt);

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

  // Les passages du transporteur, formatés ICI : la page n'expédie aucun formateur.
  const lignesSuivi: LignePassage[] = (suivi?.passages ?? []).map((p, rang) => ({
    cle: String(rang) + p.instant,
    // L'intertitre du jour en date COURTE, comme la maquette (« 29 sept. ») ; « Aujourd'hui »
    // reste un écart gardé : rendue au serveur, la page ne connaît pas le fuseau du lecteur.
    jour: format.dateTime(new Date(p.instant), { day: "numeric", month: "short" }),
    heure: format.dateTime(new Date(p.instant), { hour: "2-digit", minute: "2-digit" }),
    quand: format.dateTime(new Date(p.instant), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
    description: p.description,
    lieu: p.lieu,
  }));
  const libellesSuivi = {
    titre: t("historique.titre"),
    voirTout: t("historique.voirTout", { n: lignesSuivi.length }),
    fermer: t("galerie.fermer"),
    arrete: t("suivi.arrete"),
    attenteTitre: t("suivi.attenteTitre"),
    attenteTexte: t("suivi.attenteTexte"),
    sousTitreFeuille: numero === null ? null : (transporteur === null ? "" : transporteur.nom + " · ") + numero,
  };

  // LA COULEUR DU VENDEUR, résolue par `resoudreAccent()`, posée en variables que la
  // feuille lit partout (`--cl-*`) : aucune couleur d'accent n'est écrite en dur.
  const couleurs = {
    "--cl-texte": accent.texte,
    "--cl-interface": accent.interface,
    "--cl-remplissage": accent.remplissage,
    "--cl-sur-remplissage": accent.surRemplissage,
    "--cl-teinte": accent.teinte,
    "--cl-sur-teinte": accent.surTeinte,
  } as CSSProperties;

  return (
    // Les variables sont posées sur l'ENVELOPPE, pas sur `.cv` : la feuille d'historique
    // (`<dialog>`) vit hors de `.cv`, et sans elles son point « récent » perdait la
    // couleur du vendeur.
    <div lang={langue} className="page-client page-client--v3" style={couleurs}>
      <a className="evitement" href="#contenu">
        {t("allerAuContenu")}
      </a>
      <div className="cv">
        <HerosClient
          boutique={commande.boutique}
          libelleSite={t("reseaux.site")}
          reference={commande.referenceCourte}
          statut={statutAffiche}
          titre={bandeau.titre}
          sousTitre={bandeau.texte}
          silencieux={bandeau.silencieux}
          estimation={estimation}
          dates={datesTrajet}
          libelles={{
            commandeDe: t("commandeDe"),
            votreCommande: t("titre"),
            pourClient: commande.client === null ? null : t("pourClient", { nom: commande.client }),
            dateEstimee: t("commande.dateEstimee"),
            etapes: {
              preparation: t("frise.preparation"),
              expedie: t("frise.expedie"),
              en_transit: t("frise.en_transit"),
              livre: t("frise.livre"),
            },
            enCours: t("frise.enCours"),
            enAttente: t("frise.enAttente"),
            lire: {
              etape: (etape, etat) => t("trajetLu.etape", { etape, etat }),
              enCoursAvec: (detail) => t("trajetLu.enCoursAvec", { enCours: t("frise.enCours"), detail }),
              estimation: (dates) => t("trajetLu.estimation", { dates }),
            },
          }}
        />

        {/*
          L'ORDRE DE LA SOURCE EST CELUI DU TÉLÉPHONE : où en est le colis, à quoi
          ressemble la commande (les photos AVANT la livraison — CLAUDE.md, performance),
          est-ce bien ça (la validation, juste après ce qu'elle juge), puis le détail.
        */}
        <main id="contenu" className="cv-cadre cv-corps">
          <div className="cv-principal">
            {suivi === null ? null : <SuiviClient lignes={lignesSuivi} abandonne={suivi.abandonne} libelles={libellesSuivi} />}

            <section className="cv-section cv-entree" aria-labelledby="cv-photos">
              <div className="cv-section__tete">
                <h2 id="cv-photos">{t("galerie.titre")}</h2>
                {/* « 1 / 4 » : la photo en vue sur le carrousel du téléphone (le visionneur
                    met le premier nombre à jour au défilement) ; masqué au bureau, où tout
                    est visible. Décoratif : la galerie se lit par ses boutons. */}
                {commande.medias.length > 0 ? (
                  <span className="cv-compte" aria-hidden="true">
                    <b data-carrousel-position="">1</b> / {format.number(commande.medias.length)}
                  </span>
                ) : null}
              </div>
              {commande.medias.length === 0 ? (
                /* LA GALERIE VIDE SE DIT : on nomme ce qui est, et ce qui va se passer. */
                <div className="cv-vide">
                  <ImageIcon aria-hidden="true" className="ic" />
                  <b>{t("galerie.videTitre")}</b>
                  <p>{t("galerie.videTexte")}</p>
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
                    // `raw` : les marques {n}, {total}, {action} sont remplies par le visionneur.
                    dialogue: t.raw("galerie.dialogue") as string,
                    tuile: t.raw("galerie.tuile") as string,
                    vignette: t.raw("galerie.vignette") as string,
                  }}
                />
              )}
            </section>

            {/* L'ARBITRAGE, OMIS SANS PHOTO : « ces photos correspondent-elles ? » devant
                une galerie vide n'appelle aucune réponse sensée. */}
            {commande.medias.length > 0 ? (
              <Inerte si={apercu}>
                <ArbitrageQc
                  jeton={commande.jeton}
                  etatInitial={commande.qc}
                  libelles={{
                    titre: t("qc.titre"),
                    texte: t("qc.texte"),
                    approuver: t("qc.approuver"),
                    refuser: t("qc.refuser"),
                    commentaire: t("qc.commentaire"),
                    envoi: t("qc.envoi"),
                    annuler: t("qc.annuler"),
                    /* LES LIBELLÉS NE DISENT PAS « VOUS » : le vendeur peut reporter une
                       réponse reçue en message privé. */
                    approuve: t("qc.approuve"),
                    refuse: t("qc.refuse"),
                    modifier: t("qc.modifier"),
                    echec: t("qc.echec"),
                  }}
                />
              </Inerte>
            ) : null}

            <ApercuHistorique lignes={lignesSuivi} libelles={libellesSuivi} />
          </div>

          <aside className="cv-cote">
            <CarteLivraison titre={t("livraison.titre")} lignes={lignesLivraison} />
            <CarteContact
              boutique={commande.boutique}
              libelleSite={t("reseaux.site")}
              libelles={{ titre: t("contact.titre"), texte: t("contact.texte"), bouton: t("contact.bouton") }}
            />
            {/* LE SUIVI PAR E-MAIL, ABSENT quand aucun e-mail ne peut partir : une promesse
                qu'aucun envoi ne tiendrait est pire qu'une carte absente (contrainte n° 8). */}
            {envoiClientConfigure() ? (
              <Inerte si={apercu}>
                <CarteNotifications
                  jeton={token}
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
            {/* EN GRATUIT SEULEMENT : un compte Pro qui l'a demandé la retire. */}
            {commande.boutique.marqueMasquee ? null : (
              <CartePropulsee
                langue={langue}
                libelles={{
                  surtitre: t("carteDropLink.surtitre"),
                  titre: t("carteDropLink.titre"),
                  aria: t("carteDropLink.aria"),
                }}
              />
            )}
          </aside>
        </main>

        {/*
          LE PIED NE PORTE NI « © DropLink » (sur la page d'un vendeur, il se lirait comme le
          propriétaire de la page) ni « Propulsé par » (la carte le dit, en gratuit). Chaque
          lien est une cible de 44 px au téléphone (`.cv-pied a`).
        */}
        <footer className="cv-cadre cv-pied">
          <a href={`/${langue}/conditions`} target="_blank" rel="noopener noreferrer" className="cv-pied__lien">
            {t("pied.conditions")}
          </a>
          <a href={`/${langue}/confidentialite`} target="_blank" rel="noopener noreferrer" className="cv-pied__lien">
            {t("pied.confidentialite")}
          </a>
          <a href={`/${langue}/mentions-legales`} target="_blank" rel="noopener noreferrer" className="cv-pied__lien">
            {t("pied.mentions")}
          </a>
        </footer>
      </div>

      <FeuilleSuivi lignes={lignesSuivi} libelles={libellesSuivi} />
      {children}
      {/*
        L'ARRIVÉE (maquette, `client.js`), jouée pendant la lecture du HTML, avant la
        première image : chaque bloc reçoit son rang (le CSS décale ses entrées de 45 ms,
        au plus huit), et le camion rejoint sa place le long du rail (1 100 ms après
        300 ms, en transformation : rien ne se recalcule). Un script en ligne de quelques
        octets, sans îlot : la page a 300 Ko pour tout faire, et un îlot hydraté
        arriverait après les entrées qu'il doit ordonner.
      */}
      <script dangerouslySetInnerHTML={{ __html: SCRIPT_ARRIVEE }} />
    </div>
  );
}

/* ⚠️ UNE ENTRÉE DÉJÀ COMMENCÉE GARDE SON RANG 0 (relecture du 02/10/2026) : en 4G, le haut
   du document peut être peint avant que ce script, en bas, soit lu. Lui donner un délai en
   cours d'animation le renverrait à l'opacité 0 (`both`) — le texte déjà vu clignoterait.
   Il entre alors avec les premiers, et la cascade ne se dégrade que dans ce cas-là. */
const SCRIPT_ARRIVEE =
  '(function(){var l=document.querySelectorAll(".cv-entree");for(var i=0;i<l.length;i++){var a=l[i].getAnimations?l[i].getAnimations()[0]:null;if(a&&a.currentTime>0)continue;l[i].style.setProperty("--i",String(Math.min(i,8)))}if(matchMedia("(prefers-reduced-motion: reduce)").matches)return;var c=document.querySelector(".cv-camion");if(!c||!c.animate||!c.parentElement)return;var x=parseFloat(getComputedStyle(c).getPropertyValue("--x"))/100;if(!(x>0))return;c.animate([{transform:"translateX("+(-c.parentElement.getBoundingClientRect().width*x)+"px)"},{transform:"none"}],{duration:1100,delay:300,easing:"cubic-bezier(.23,1,.32,1)",fill:"backwards"})})()';

/**
 * L'APERÇU NE PEUT RIEN ÉCRIRE AU NOM DU CLIENT : dans `/p/<jeton>/apercu`, les îlots qui
 * écrivent sont rendus sous `inert`. `display: contents` : l'enveloppe ne pèse rien sur la
 * mise en page.
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
