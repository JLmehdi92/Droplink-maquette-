import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { ArbitrageQc } from "@/components/publique/arbitrage-qc";
import { BaliseVue } from "@/components/publique/balise-vue";
import { Frise } from "@/components/publique/frise";
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
 * MOBILE D'ABORD, ET LA GALERIE AVANT LES DÉTAILS D'EXPÉDITION : c'est ce que
 * le client vient voir. La maquette compose pour desktop et met les deux côte à
 * côte, ce qui n'a pas d'équivalent en une colonne — il faut choisir un ordre,
 * et l'ordre est celui-là.
 *
 * AUCUN GLASSMORPHISM, AUCUN `backdrop-blur`. Sur un aplat uni, un blanc à 70 %
 * flouté rend exactement la même couleur qu'un blanc opaque : le flou n'a rien à
 * flouter, et c'est ce qui coûte le plus cher sur un appareil d'entrée de gamme.
 * La géométrie de la maquette est conservée, les fonds deviennent opaques.
 *
 * LA LANGUE EST CELLE DU VENDEUR, lue en base. Aucun provider de traduction
 * n'est expédié au navigateur : les Server Components résolvent, et le
 * visionneur reçoit ses libellés en propriétés.
 *
 * UNE INFORMATION ABSENTE EST OMISE. Pas de texte de remplacement, pas de valeur
 * inventée, pas de bloc vide : sur cette page, « nous n'avons pas encore cette
 * information » se dit en n'affichant rien.
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

  const libellesFrise = {
    preparation: { titre: t("frise.preparation.titre"), texte: t("frise.preparation.texte") },
    expedie: { titre: t("frise.expedie.titre"), texte: t("frise.expedie.texte") },
    en_transit: { titre: t("frise.en_transit.titre"), texte: t("frise.en_transit.texte") },
    livre: { titre: t("frise.livre.titre"), texte: t("frise.livre.texte") },
  } as const;

  // EN-TÊTE OMIS quand il n'y a NI nom NI logo. Pas de barre vide, pas de
  // libellé de remplacement : un vendeur qui n'a rien configuré obtient une page
  // qui commence par le contenu, et c'est le cas le plus fréquent en début de
  // vie d'un compte — pas un repli dégradé.
  const aUnEnTete = commande.boutique.nom !== null || commande.boutique.logo !== null;

  const carte = "rounded-xl bg-surface-container-lowest p-6 shadow-sm";

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

  return (
    <div lang={langue} className="flex min-h-dvh flex-col">
      {aUnEnTete ? (
        <header className="border-b border-outline-variant/30 bg-surface-container-lowest">
          <div className="mx-auto flex h-16 max-w-container-max items-center gap-3 px-margin-mobile md:px-margin-desktop">
            {commande.boutique.logo !== null ? (
              /* eslint-disable-next-line @next/next/no-img-element -- le logo
                 est servi par une URL signée à expiration ; l'optimiseur la
                 mettrait en cache au-delà de sa validité. */
              <img
                src={commande.boutique.logo}
                alt=""
                width={32}
                height={32}
                className="h-8 w-8 rounded-full object-contain"
              />
            ) : null}
            {commande.boutique.nom !== null ? (
              <span className="font-headline-md text-headline-md-mobile text-on-surface">
                {commande.boutique.nom}
              </span>
            ) : null}
          </div>
        </header>
      ) : null}

      <main
        id="contenu"
        className="mx-auto w-full max-w-container-max flex-grow px-margin-mobile py-8 md:px-margin-desktop"
      >
        <div className="mb-8">
          <h1 className="mb-2 font-headline-lg-mobile text-headline-lg-mobile text-on-surface md:font-headline-xl md:text-headline-xl">
            {t("titre")}
          </h1>
          {commande.client !== null ? (
            <p className="font-body-lg text-body-lg text-on-surface-variant">{commande.client}</p>
          ) : null}
        </div>

        {/*
          L'ORDRE DU DOCUMENT EST L'ORDRE MOBILE : galerie d'abord. Sur grand
          écran, `md:order-*` remet les détails à gauche comme la maquette — la
          présentation change, la source reste dans l'ordre qui compte pour le
          plus grand nombre de visiteurs.
        */}
        <div className="grid grid-cols-1 gap-gutter md:grid-cols-12">
          <section className={carte + " md:order-2 md:col-span-8"}>
            <h2 className="mb-6 font-headline-md text-headline-md-mobile text-on-surface">
              {t("galerie.titre")}
            </h2>

            {commande.medias.length === 0 ? (
              <p className="font-body-md text-body-md text-on-surface-variant">
                {t("galerie.aucune")}
              </p>
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
            )}
          </section>

          <div className="flex flex-col gap-gutter md:order-1 md:col-span-4">
            <section className={carte}>
              <h2 className="mb-6 font-headline-md text-headline-md-mobile text-on-surface">
                {t("expedition.titre")}
              </h2>
              <Frise statut={statutAffiche} libelles={libellesFrise} accent={accent.interface} />
            </section>

            {/* LE DÉTAIL DU SUIVI, omis tant qu'aucun colis n'est enregistré :
                une carte vide affirmerait qu'il y a quelque chose à y lire. */}
            {suivi !== null ? (
              <section className={carte}>
                <h2 className="mb-4 font-headline-md text-headline-md-mobile text-on-surface">
                  {t("suivi.titre")}
                </h2>
                <Suivi
                  suivi={suivi}
                  maintenant={maintenant}
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
                    aucunMouvement: t("suivi.aucunMouvement"),
                    dernierMouvement: t("suivi.dernierMouvement"),
                    aujourdHui: t("suivi.aujourdHui"),
                    hier: t("suivi.hier"),
                    silence: t("suivi.silence"),
                    estimation: t("suivi.estimation"),
                    arrete: t("suivi.arrete"),
                    passages: t("suivi.passages"),
                  }}
                />
              </section>
            ) : null}

            {/* Bloc OMIS quand ni référence ni numéro de suivi : une carte vide
                affirmerait qu'il y a quelque chose à y lire. */}
            {/*
              L'ARBITRAGE QC, sous le suivi sur grand écran et après la galerie
              sur mobile : on ne demande pas à quelqu'un de juger des photos
              avant de les lui avoir montrées.

              OMIS QUAND IL N'Y A AUCUNE PHOTO. Demander « ces photos
              correspondent-elles ? » devant une galerie vide n'appelle aucune
              réponse sensée, et une décision prise là-dessus serait écrite au
              journal comme les autres.
            */}
            {commande.medias.length > 0 ? (
              <section className={carte}>
                <h2 className="mb-4 font-headline-md text-headline-md-mobile text-on-surface">
                  {t("qc.titre")}
                </h2>
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
                    approuve: t("qc.approuve"),
                    refuse: t("qc.refuse"),
                    modifier: t("qc.modifier"),
                    echec: t("qc.echec"),
                  }}
                />
              </section>
            ) : null}

            {commande.reference !== null || commande.numeroSuivi !== null ? (
              <section className={carte}>
                <h2 className="mb-4 font-headline-md text-headline-md-mobile text-on-surface">
                  {t("details.titre")}
                </h2>
                <dl className="flex flex-col gap-4">
                  {commande.reference !== null ? (
                    <div className="flex items-center justify-between gap-4 border-b border-outline-variant/40 pb-2">
                      <dt className="font-body-sm text-body-sm text-on-surface-variant">
                        {t("details.reference")}
                      </dt>
                      <dd className="text-right font-label-md text-label-md text-on-surface">
                        {commande.reference}
                      </dd>
                    </div>
                  ) : null}
                  {commande.numeroSuivi !== null ? (
                    <div className="flex items-center justify-between gap-4">
                      <dt className="font-body-sm text-body-sm text-on-surface-variant">
                        {t("details.suivi")}
                      </dt>
                      <dd className="text-right font-label-md text-label-md break-all text-on-surface">
                        {commande.numeroSuivi}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </section>
            ) : null}
          </div>
        </div>
      </main>

      <footer className="border-t border-outline-variant/30 px-margin-mobile py-6 text-center md:px-margin-desktop">
        {/*
          « Powered by DropLink », avec ses trois garde-fous : secondaire
          visuellement, jamais confondable avec l'expéditeur, et ouverture HORS
          de la page — le client est venu voir sa commande, pas nous.
        */}
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="font-label-sm text-label-sm text-on-surface-variant hover:underline"
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
