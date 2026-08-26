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
import { emettre } from "@/lib/instrumentation/emettre";
import { EVENEMENTS } from "@/lib/instrumentation/evenements";

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
 * d'expédition sur téléphone ; sur grand écran, les deux tiennent côte à côte,
 * et c'est la seule chose que la largeur change.
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

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

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

  const libellesEtat = {
    arriveeEstimee: t("etat.arriveeEstimee"),
    aucunMouvement: t("suivi.aucunMouvement"),
    /*
     * `t.raw` ET NON `t` POUR LES CHAÎNES À PARAMÈTRE.
     *
     * La substitution de `{n}` est faite plus bas, avec un nombre de jours que
     * seul le composant connaît. Or `t()` FORMATE : présenté à une chaîne ICU
     * dont le paramètre manque, il ne rend pas le gabarit — il lève
     * `FORMATTING_ERROR`, et la page rendait alors le nom de la clé au client.
     * `t.raw()` rend le gabarit tel quel, ce qui est exactement ce qu'on
     * transporte ici.
     */
    dernierMouvement: t.raw("suivi.dernierMouvement"),
    aujourdHui: t("suivi.aujourdHui"),
    hier: t("suivi.hier"),
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
    "font-body-sm text-[11px] leading-[15px] font-bold tracking-[0.09em] uppercase text-sourdine";

  /*
   * SECTION AU TÉLÉPHONE, CARTE SUR GRAND ÉCRAN — et c'est la largeur qui
   * décide, pas le contenu. À 390 px, une carte n'encadre rien : elle ajoute
   * deux traits et retire seize pixels à ce qu'il y a dedans. Un filet en tête
   * de section sépare aussi bien pour rien.
   */
  const section =
    "border-t border-outline-variant px-margin-mobile py-6 " +
    "md:rounded-lg md:border md:border-outline-variant md:bg-surface-container-lowest md:px-5 md:py-5";

  const jour = (instant: Date): string => format.dateTime(instant, { day: "numeric", month: "long" });

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
  await emettre(EVENEMENTS.PAGE_PUBLIQUE_RENDUE, {
    sujet: visiteur === null ? "visiteur:sans-adresse" : `visiteur:${empreinte(visiteur)}`,
  });

  const galerie =
    commande.medias.length === 0 ? (
      /* LA GALERIE VIDE SE DIT. Ni cadres gris ni « bientôt disponible » : on
         nomme ce qui est, et on dit ce qui va se passer. */
      <div className="rounded-lg border border-dashed border-outline p-8 text-center">
        <p className="font-body-md text-[15px] font-semibold text-on-surface">
          {t("galerie.videTitre")}
        </p>
        <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
          {t("galerie.videTexte")}
        </p>
      </div>
    ) : (
      <Visionneur
        jeton={commande.jeton}
        medias={commande.medias.map((m) => ({
          id: m.id,
          type: m.type,
          urlVignette: m.urlVignette,
          largeur: m.largeur,
          hauteur: m.hauteur,
        }))}
        // Le texte du filigrane est le NOM DE LA BOUTIQUE. La base a déjà
        // décidé si un filigrane est possible : elle éteint le drapeau
        // quand il n'y a pas de nom, ce qui rend ce `??` inatteignable —
        // il est là parce que le typage l'exige, pas comme un repli.
        filigrane={commande.boutique.filigrane ? (commande.boutique.nom ?? null) : null}
        libelles={{
          ouvrir: t("galerie.ouvrir"),
          fermer: t("galerie.fermer"),
          precedent: t("galerie.precedent"),
          suivant: t("galerie.suivant"),
          chargement: t("galerie.chargement"),
          indisponible: t("galerie.indisponible"),
          position: t("galerie.position"),
        }}
      />
    );

  const validation =
    commande.medias.length === 0 ? null : (
      /*
        L'ARBITRAGE QC vient JUSTE APRÈS CE QU'IL JUGE : on ne demande pas à
        quelqu'un de se prononcer sur des photos avant de les lui avoir
        montrées.

        OMIS QUAND IL N'Y A AUCUNE PHOTO. Demander « ces photos
        correspondent-elles ? » devant une galerie vide n'appelle aucune
        réponse sensée, et une décision prise là-dessus serait écrite au
        journal comme les autres.
      */
      <div>
        <p className={surTitre + " mb-3"}>{t("qc.titre")}</p>
        <ArbitrageQc
          jeton={commande.jeton}
          etatInitial={commande.qc}
          remplissage={accent.remplissage}
          surRemplissage={accent.surRemplissage}
          libelles={{
            titre: t("qc.titre"),
            texte: t("qc.texte"),
            approuver: t("qc.approuver"),
            refuser: t("qc.refuser"),
            commentaire: t("qc.commentaire"),
            envoi: t("qc.envoi"),
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
          className="px-margin-mobile pt-5 pb-6 md:px-margin-desktop md:pt-6 md:pb-8"
        >
          <div className="mx-auto max-w-container-max">
            <div className="mb-5 flex items-center gap-2.5 md:mb-6">
              {commande.boutique.logo !== null ? (
                /* eslint-disable-next-line @next/next/no-img-element -- le logo
                   est servi par une URL signée à expiration ; l'optimiseur la
                   mettrait en cache au-delà de sa validité. */
                <img
                  src={commande.boutique.logo}
                  alt=""
                  width={34}
                  height={34}
                  className="h-[34px] w-[34px] rounded-full object-contain"
                />
              ) : null}
              {commande.boutique.nom !== null ? (
                <span className="font-headline-md text-[16px] font-bold tracking-[-0.01em] md:text-[18px]">
                  {commande.boutique.nom}
                </span>
              ) : null}
            </div>
            <EnTeteTitre
              titre={t("titre")}
              client={commande.client}
              pourClient={t.raw("pourClient")}
              doux={accent.surRemplissageDoux}
            />
          </div>
        </header>
      ) : (
        <div className="px-margin-mobile pt-8 md:px-margin-desktop">
          <div className="mx-auto max-w-container-max">
            <EnTeteTitre
              titre={t("titre")}
              client={commande.client}
              pourClient={t.raw("pourClient")}
              doux="var(--color-on-surface-variant)"
            />
          </div>
        </div>
      )}

      {/*
        UNE SEULE GRILLE, TROIS BLOCS, PLACEMENT EXPLICITE.

        L'ordre de la SOURCE est celui du téléphone — état, galerie, détail —
        parce que c'est lui qui compte pour la grande majorité des visiteurs et
        pour qui lit la page sans feuille de style. Sur grand écran, la galerie
        occupe les deux rangées de la colonne large pendant que l'état et le
        détail s'empilent à droite. Sans `row-start` explicite, le détail
        tomberait SOUS la galerie et laisserait un trou sous l'état.
      */}
      <main
        id="contenu"
        className="mx-auto w-full max-w-container-max flex-grow md:grid md:grid-cols-12 md:items-start md:gap-x-gutter md:px-margin-desktop md:pt-8"
      >
        <div className="px-margin-mobile pt-4 md:col-span-4 md:col-start-9 md:row-start-1 md:px-0 md:pt-0">
          <EtatExpedition
            statut={statutAffiche}
            suivi={suivi}
            maintenant={maintenant}
            libelles={libellesEtat}
            accent={accent}
            formaterJour={jour}
          />
        </div>

        <div className="md:col-span-8 md:col-start-1 md:row-span-2 md:row-start-1">
          {/* PLEINE LARGEUR AU TÉLÉPHONE. Les vignettes sortent des marges :
              c'est ce que le client vient voir, et une marge de chaque côté lui
              coûte un dixième de la surface de chaque photo. */}
          <div className="mt-6 md:mt-0">
            <p className={surTitre + " mb-3 px-margin-mobile md:px-0"}>{t("galerie.titre")}</p>
            {commande.medias.length === 0 ? (
              <div className="px-margin-mobile md:px-0">{galerie}</div>
            ) : (
              galerie
            )}
          </div>

          {validation !== null ? (
            <div className="mt-7 px-margin-mobile md:mt-8 md:px-0">{validation}</div>
          ) : null}
        </div>

        <div className="mt-8 md:col-span-4 md:col-start-9 md:row-start-2 md:mt-4 md:flex md:flex-col md:gap-4">
          {/* OMIS tant qu'aucun colis n'est enregistré : une carte vide
              affirmerait qu'il y a quelque chose à y lire. */}
          {suivi !== null ? (
            <section className={section}>
              <p className={surTitre + " mb-3"}>{t("suivi.titre")}</p>
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
                  titre: t("suivi.titre"),
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
              <p className={surTitre + " mb-3"}>{t("details.titre")}</p>
              <dl className="flex flex-col gap-3">
                {commande.reference !== null ? (
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="font-body-md text-body-md text-on-surface-variant">
                      {t("details.reference")}
                    </dt>
                    <dd className="text-right font-label-md text-[14px] font-bold text-on-surface">
                      {commande.reference}
                    </dd>
                  </div>
                ) : null}
                {commande.client !== null ? (
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="font-body-md text-body-md text-on-surface-variant">
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

      {/* LES RÉSEAUX DU VENDEUR, s'il en a configuré. Le titre porte son nom :
          sans nom de boutique, « Retrouvez-nous » ne dit pas qui. */}
      <ReseauxVendeur
        boutique={commande.boutique}
        titre={
          commande.boutique.nom === null
            ? t("reseaux.sansNom")
            : t.raw("reseaux.titre").replace("{nom}", commande.boutique.nom)
        }
      />

      <footer className="border-t border-outline-variant px-margin-mobile py-6 text-center md:px-margin-desktop">
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
 * Le titre et le destinataire, rendus à l'identique dans les deux en-têtes.
 *
 * Ils sont extraits parce qu'ils existent en DEUX exemplaires — sur l'aplat
 * d'accent quand la boutique est configurée, sur fond blanc sinon — et que
 * deux copies d'un même bloc divergent toujours par le libellé qu'on oublie de
 * corriger dans la seconde.
 */
function EnTeteTitre({
  titre,
  client,
  pourClient,
  doux,
}: {
  readonly titre: string;
  readonly client: string | null;
  readonly pourClient: string;
  readonly doux: string;
}) {
  return (
    <>
      <h1 className="font-headline-lg text-[32px] leading-[37px] font-extrabold tracking-[-0.03em] md:text-[44px] md:leading-[50px]">
        {titre}
      </h1>
      {client !== null ? (
        <p
          className="mt-1.5 font-body-md text-[15px] leading-[22px] md:mt-2 md:text-[17px] md:leading-[26px]"
          style={{ color: doux }}
        >
          {pourClient.replace("{nom}", client)}
        </p>
      ) : null}
    </>
  );
}
