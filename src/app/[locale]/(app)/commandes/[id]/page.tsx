import { BandeauBlocage } from "@/components/commandes/bandeau-blocage";
import { EXPLICATION_MIN, lireEtatBlocage } from "@/lib/commandes/contestation";
import { limites } from "@/lib/storage/limites";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { TraductionsClient } from "@/components/traductions-client";
import { Editeur } from "@/components/commandes/editeur";
import type { MediaAffiche } from "@/components/commandes/carte-medias";
import { plafondsAffichables } from "@/lib/commandes/medias";
import { signerLecture } from "@/lib/storage/r2";
import { cleDApercu } from "@/lib/medias/apercu";
import { STATUTS_EXPEDITION, STATUTS_QC } from "@/lib/commandes/liste";
import { creerClientServeur } from "@/lib/supabase/server";
import { emettreApres } from "@/lib/instrumentation/emettre";
import { EVENEMENTS } from "@/lib/instrumentation/evenements";
import { exigerVendeur } from "@/lib/comptes/apres-session";
import { libellesApercu } from "@/lib/boutique/libelles-apercu";
import { resoudreAccent } from "@/lib/design/contraste";
import { origineDuSite } from "@/lib/site";
import { estLangueSupportee } from "@/i18n/config";
import { lireHistorique } from "@/lib/commandes/historique";
import { lireSuiviDeCommande, datesDesEtapes } from "@/lib/commandes/suivi-commande";
import { lireTransporteur, transporteursProposes } from "@/lib/tracking/transporteurs";
import type { Etape } from "@/lib/tracking/normalize";
import { titreDeCommande } from "@/lib/commandes/titre";
import { MenuGestesFiche } from "@/components/commandes/menu-gestes-fiche";
import { HistoriqueCommande } from "@/components/commandes/historique-commande";

/**
 * LA COMMANDE, LUE UNE SEULE FOIS PAR REQUETE.
 *
 * `generateMetadata` et le rendu tournent dans la MEME requete, et `cache()` de
 * React memoise sur l argument : la deuxieme lecture ne repart pas en base.
 * Sans cette memoisation, donner un titre juste a l onglet couterait une
 * requete de plus sur l ecran le plus ouvert du produit.
 *
 * Elle reste SOUS RLS, comme le rendu : le titre d une commande d un autre
 * vendeur ne doit pas etre atteignable par un detour de metadonnees.
 */
const lireCommandeEditee = cache(async (id: string) => {
  const supabase = await creerClientServeur();
  return await supabase
    .from("orders")
    .select(
      // `first_content_at` n'est pas rendu à l'écran : il sert à dire si cette
      // ouverture porte sur un brouillon encore vide ou sur une commande déjà
      // remplie — la distinction que portait le second point d'émission qu'on
      // vient de retirer.
      "id, public_token, customer_label, product_ref, tracking_number, carrier_code, internal_notes, status, qc_status, cover_media_id, archived_at, first_content_at, views_count, last_viewed_at, created_at, updated_at",
    )
    .eq("id", id)
    .maybeSingle();
});

/**
 * ⚠️ CE TITRE DISAIT « Nouvelle commande » SUR TOUTES LES COMMANDES.
 *
 * Il n'existe aucune route « créer une commande » : la Server Action crée la
 * ligne puis redirige vers `/commandes/<id>`. Le libellé écrit pour l'instant
 * qui suit la création s'appliquait donc à vie, y compris à une commande
 * remplie, expédiée et déjà consultée. Le titre À L'ÉCRAN, lui, était juste —
 * la règle vivait à deux endroits et un seul l'appliquait. Elle vit désormais
 * dans `titreDeCommande`, appelée par les deux.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "editeur" });
  const { data } = await lireCommandeEditee(id);

  /*
   * ⚠️ UNE COMMANDE INTROUVABLE NE S'INTITULE PAS « NOUVELLE COMMANDE ».
   *
   * DÉFAUT MESURÉ LE 02/09/2026 : `/fr/commandes/00000000-…` rendait l'onglet
   * « Nouvelle commande », c'est-à-dire le libellé écrit pour l'instant qui SUIT
   * une création. La page, elle, appelle bien `notFound()` — mais
   * `generateMetadata` s'exécute avant, et `titreDeCommande` retombe sur son
   * défaut dès que le nom du client est absent, sans distinguer « pas encore de
   * client » de « pas de commande du tout ».
   *
   * C'est le même défaut que celui corrigé le 30/08 sur les commandes remplies,
   * une case plus loin : la règle vivait à deux endroits et un seul l'appliquait.
   */
  if (data === null) {
    const c = await getTranslations({ locale, namespace: "commandes" });
    return { title: c("introuvable.titre"), robots: { index: false, follow: false } };
  }

  return {
    title: titreDeCommande(data.customer_label, t("titre")),
    robots: { index: false, follow: false },
  };
}

/**
 * L'éditeur d'une commande, porté sur les planches `Editeur`, `EditeurMobile` et
 * `EditeurEtats`.
 *
 * TROIS CORRECTIONS SUR LA MAQUETTE D'ORIGINE, toutes portées par une décision :
 *
 *  1. Le bloc « Client Account » — recherche de compte, avatar, adresse email —
 *     devient un simple champ texte libre. Le destinataire n'a JAMAIS de compte.
 *  2. Les boutons « Save Draft » et « Publish to Client » disparaissent : la
 *     sauvegarde est automatique, et il n'y a rien à publier — le lien existe
 *     dès la création et ne change plus jamais.
 *  3. Le vocabulaire d'inspection qualité laisse place à celui d'une commande.
 *
 * LES VIGNETTES SONT SIGNÉES AU RENDU, jamais stockées. Le bucket est privé sans
 * exception, et une URL enregistrée en base périmerait dans sa colonne : l'écran
 * afficherait des images mortes sans qu'aucune erreur ne remonte.
 *
 * LA LECTURE EST SOUS RLS. Une commande d'un autre vendeur ne rend pas 403 mais
 * 404 : distinguer « ça n'existe pas » de « ce n'est pas à vous » confirmerait
 * l'existence d'une commande qu'on n'a pas le droit de connaître.
 */
export default async function EditeurCommande({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const langue = estLangueSupportee(locale) ? locale : "fr";
  setRequestLocale(langue);

  /*
   * ⚠️ LA GARDE PASSE AVANT LA LECTURE. Cet écran porte les NOTES INTERNES —
   * qui contiennent le prix d'achat — et le `public_token`. La redirection du
   * layout arrive trop tard : Next a déjà engagé la réponse quand elle tombe, et
   * la charge de la page part avec le 307. Mesuré avec un cookie révoqué : les
   * deux sentinelles sortaient.
   */
  const profil = await exigerVendeur(langue);

  const supabase = await creerClientServeur();
  const { data, error } = await lireCommandeEditee(id);

  if (error !== null || data === null) notFound();

  /*
   * LES LECTURES INDÉPENDANTES PARTENT ENSEMBLE (audit du 20/09/2026). Elles ne dépendent que
   * de la commande déjà lue, et elles s'enchaînaient une à une : chaque aller-retour vers la
   * base attendait le précédent, sur l'écran où un vendeur passe sa journée. La garde et la
   * lecture de la commande restent AVANT : elles décident si la page existe.
   */
  const [origine, resultatMedias, historique, suivi, blocage] = await Promise.all([
    origineDuSite(),
    supabase
      .from("order_media")
      .select("id, type, cle, cle_vignette, duree_s")
      .eq("order_id", id)
      .order("position", { ascending: true }),
    // Lu SOUS LA SESSION du vendeur : la policy de `order_events` remonte à
    // `orders → shops → profiles`, et c'est elle qui garantit qu'on ne lit que
    // ses propres commandes. Contourner la RLS ici en ferait la seule surface du
    // produit où l'historique d'un tiers serait atteignable.
    lireHistorique(supabase, id),
    lireSuiviDeCommande(supabase, id),
    // LE LIEN BLOQUÉ (168) : lu sous RLS avec la session du vendeur. Une lecture en échec rend
    // `null`, et l'écran ne dit rien plutôt que d'affirmer un état qu'il n'a pas lu.
    lireEtatBlocage(supabase, data.id),
  ]);

  /*
   * Les médias, avec des URL de lecture SIGNÉES ET À EXPIRATION.
   *
   * Le bucket est privé sans exception : il n'existe aucune adresse permanente à
   * stocker. Signer au rendu plutôt que garder une URL en base a un second
   * effet — une URL enregistrée périme dans la colonne, et l'écran se met à
   * afficher des images mortes sans qu'aucune erreur ne remonte.
   *
   * On signe la VIGNETTE quand elle existe : la grille de l'éditeur n'a besoin
   * que de 200 × 200, et signer les originaux ferait télécharger vingt photos
   * pleines pour dessiner des carrés de deux cents pixels.
   *
   * ⚠️ « QUAND ELLE EXISTE » MANQUAIT, et cette phrase a coûté une page de
   * client entièrement vide. La clé pleine est donc lue AUSSI — elle ne sert
   * qu'au repli, et elle ne coûte rien tant qu'aucune dérivée ne manque.
   */
  const lignesMedias = resultatMedias.data;

  /*
   * ⚠️ MÊME REPLI QUE LA PAGE CLIENT, ET POUR LA MÊME RAISON. Une photo sans
   * vignette était une case grise ici aussi — le vendeur voyait donc EXACTEMENT
   * ce que voyait son client, sans qu'aucun des deux écrans ne dise pourquoi.
   * `cle_vignette` est nullable par conception ; c'est le rendu qui l'ignorait.
   *
   * Le repli est borné aux PHOTOS : la clé d'une vidéo désigne le fichier
   * vidéo, et une balise image le rendrait cassé.
   */
  const medias: MediaAffiche[] = await Promise.all(
    (lignesMedias ?? []).map(async (m) => {
      // MÊME RÈGLE QUE PARTOUT AILLEURS, et elle n a qu un seul domicile.
      const apercu = cleDApercu(m);
      return {
        id: m.id,
        type: m.type,
        urlVignette: apercu === null ? null : await signerLecture(apercu).catch(() => null),
        estCouverture: m.id === data.cover_media_id,
        dureeS: m.duree_s,
      };
    }),
  );

  /*
   * LE SUIVI DU COLIS, SOUS RLS COMME TOUT LE RESTE DE CET ÉCRAN.
   *
   * ⚠️ IL N'ÉTAIT NULLE PART, ET C'EST LE VRAI MANQUE QUE LA COMPARAISON AU KIT
   * A TROUVÉ. L'écran portait le numéro de suivi en champ de saisie et rien
   * d'autre : ni les dates, ni les points de passage, ni la position du colis.
   * Le vendeur devait donc ouvrir l'écran des envois — ou la page de son client
   * — pour voir ce que son client voit. La donnée existait depuis la
   * migration 029.
   *
   * Une commande sur deux n'a pas de colis attaché, et la lecture rend alors
   * `null` : la frise se rend quand même, sur le seul `orders.status`.
   */
  const quandEtapes = suivi === null ? {} : datesDesEtapes(suivi.passages);

  const format = await getFormatter();
  const instant = (iso: string): string =>
    format.dateTime(new Date(iso), {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  /*
   * LA NOTE D'UNE ÉTAPE EST CELLE DU POINT DE PASSAGE QUI L'A DATÉE, jamais une
   * phrase écrite d'avance. Le kit met de la prose sous chaque étape, y compris
   * sous celles qu'aucun colis n'a franchies ; reprise telle quelle, elle
   * affirmerait à chaque commande un fait que la base n'a pas enregistré.
   */
  const notesEtapes: Partial<Record<Etape, string>> = {};
  for (const passage of suivi?.passages ?? []) {
    if (passage.etape === null) continue;
    if (quandEtapes[passage.etape] !== passage.instant) continue;
    notesEtapes[passage.etape] =
      passage.lieu === null ? passage.description : passage.description + " — " + passage.lieu;
  }

  const quandFormatees: Partial<Record<Etape, string>> = {};
  for (const [etape, iso] of Object.entries(quandEtapes)) {
    quandFormatees[etape as Etape] = instant(iso);
  }

  /*
   * LA PREMIÈRE ÉTAPE EST DATÉE PAR LA CRÉATION DE LA COMMANDE, pas par un
   * transporteur. « En préparation » commence quand le vendeur crée la page :
   * c'est la seule étape des quatre dont nous sommes la source, et la seule que
   * la frise laissait sans date. Un point de passage qui porterait cette étape
   * — rare, mais possible — la remplace : il vient du transporteur, et le
   * transporteur prime dès qu'il parle (décision 2).
   */
  quandFormatees.preparation ??= instant(data.created_at);

  const plafonds = plafondsAffichables();

  /*
   * LA PALETTE DE L'APERÇU EST RÉSOLUE ICI, côté serveur, par la MÊME fonction
   * que la page publique. Un aperçu qui calculerait ses couleurs autrement
   * finirait par montrer autre chose que ce que le client verra — et c'est
   * exactement l'unique chose que cet aperçu promet de ne pas faire.
   *
   * `accent_color` est NON NULLE avec un défaut en base : il n'existe aucun état
   * « couleur non configurée » à détecter.
   */
  // `profil` NE PEUT PLUS ÊTRE NUL ici : `exigerVendeur` a déjà redirigé. Les
  // trois branches de repli qui vivaient là étaient précisément ce qui laissait
  // la page se rendre quand il l'était.
  const accent = resoudreAccent(profil.couleurAccent);
  const logoUrl =
    profil.logoUrl === null ? null : await signerLecture(profil.logoUrl).catch(() => null);

  {
    // `order_editor_opened` mesure l'OUVERTURE, `order_created` mesure le
    // premier contenu réel. L'écart entre les deux est l'information : un
    // brouillon ouvert puis abandonné est exactement le cas « teste une ou deux
    // fois puis disparaît ».
    //
    // POINT D'ÉMISSION UNIQUE. `creerBrouillon` en portait un second et
    // redirigeait ici : une création comptait donc deux ouvertures, sur un
    // événement qui sert de DÉNOMINATEUR.
    emettreApres(
      EVENEMENTS.EDITEUR_OUVERT,
      { sujet: profil.profilId },
      { origine: data.first_content_at === null ? "brouillon" : "edition" },
    );
  }

  /*
   * LE LIEN DE L'EN-TÊTE NE PORTE PLUS LE JETON, il porte la commande.
   *
   * Il embarquait `origine + "/p/" + data.public_token`, calculé ici. Après une
   * révocation, il continuait de pointer vers le lien qu'on venait de tuer — le
   * moment précis où l'on veut vérifier que la NOUVELLE page répond. Une copie
   * du jeton peut vieillir ; une page qui le relit au moment du clic, non.
   */
  const versPageClient = "/" + langue + "/commandes/" + data.id + "/page-client";

  const jourLong = (iso: string): string => format.dateTime(new Date(iso), { dateStyle: "long" });

  return (
    /*
      LA MARGE NÉGATIVE ANNULE LA PLACE RÉSERVÉE AUX ONGLETS. Le layout de
      l'espace vendeur réserve 86 px en bas pour la barre d'onglets fixe ;
      l'éditeur n'en a pas — la planche `EditeurMobile` met une bande d'action à
      la place. Sans cette annulation, 86 px de gris flottaient sous la bande.
    */
    <main id="contenu" className="-mb-[86px] flex min-h-dvh flex-col md:mb-0">
      <TraductionsClient espaces={["editeur", "medias", "actions", "blocageVendeur"]}>
        <Editeur
          id={data.id}
          langue={langue}
          jeton={data.public_token}
          // Le menu « ••• » de la fiche (dupliquer, archiver, sortir des
          // archives), rendu ici côté serveur : voir `menu-gestes-fiche.tsx`.
          bandeau={
            blocage === null || !blocage.bloque ? null : (
              <BandeauBlocage
                commandeId={data.id}
                depuis={jourLong(blocage.depuis)}
                motif={blocage.motif}
                contestations={blocage.contestations.map((c) => ({
                  id: c.id,
                  statut: c.statut,
                  message: c.message,
                  creeeLe: jourLong(c.creeeLe),
                  decideeLe: c.decideeLe === null ? null : jourLong(c.decideeLe),
                  reponse: c.reponse,
                }))}
                peutContester={blocage.peutContester}
                restantes={blocage.restantes}
                explicationMin={EXPLICATION_MIN}
                imageMaxMo={Math.round(limites().contestationOctets / (1024 * 1024))}
              />
            )
          }
          menusGestes={{
            bureau: (
              <MenuGestesFiche
                langue={langue}
                id={data.id}
                jeton={data.public_token}
                archivee={data.archived_at !== null}
                taille="bureau"
              />
            ),
            telephone: (
              <MenuGestesFiche
                langue={langue}
                id={data.id}
                jeton={data.public_token}
                archivee={data.archived_at !== null}
                taille="telephone"
              />
            ),
          }}
          // Sans origine connue, le lien public serait construit sur une valeur
          // devinée. On rend alors un chemin relatif : il ne se copie pas dans
          // une conversation, mais il n'envoie personne sur un domaine inventé.
          origine={origine ?? ""}
          nomDeLien={profil.nomDeLien}
          versPageClient={versPageClient}
          statuts={STATUTS_EXPEDITION}
          qcs={STATUTS_QC}
          /* La liste est résolue ICI, pour la même raison que le nom du
             transporteur plus bas : le catalogue est `server-only`, l'îlot ne
             reçoit que les vingt-neuf lignes qu'il affiche. */
          transporteurs={transporteursProposes(data.carrier_code)}
          suivi={{
            numero: suivi?.numero ?? null,
            abandonne: suivi?.abandonne ?? false,
            nonReconnu: suivi?.nonReconnu ?? false,
            quand: quandFormatees,
            notes: notesEtapes,
          }}
          dates={{
            creeLe: instant(data.created_at),
            misAJourLe: instant(data.updated_at),
          }}
          /*
           * LE NOM DU TRANSPORTEUR EST RÉSOLU ICI, côté serveur : le catalogue
           * pèse 157 Ko et il est `server-only`. L'îlot d'édition ne reçoit
           * qu'une chaîne, ou `null` quand aucun colis n'est rattaché — ou
           * quand le code est absent du catalogue, ce qui arrive : 17TRACK en
           * ajoute. La ligne est alors OMISE, jamais remplacée.
           */
          resume={{
            transporteur:
              suivi === null ? null : (lireTransporteur(suivi.codeTransporteur)?.nom ?? null),
            vues: data.views_count,
            derniereVueLe: data.last_viewed_at === null ? null : instant(data.last_viewed_at),
          }}
          medias={{
            initiaux: medias,
            plafondMedias: plafonds.medias,
            plafondVideos: plafonds.videos,
            typesAcceptes: plafonds.typesAcceptes,
          }}
          boutique={{
            nom: profil?.nomBoutique ?? null,
            logoUrl,
            /*
             * ⚠️ `profil.languePublique`, PAS `langue`. La première est le
             * réglage de la boutique, celle que verront ses clients ; la
             * seconde est le segment de l'URL vendeur. Les confondre est
             * exactement le défaut mesuré le 06/09/2026 — un aperçu titré
             * « ce que voit le client » qui montrait autre chose que ce que le
             * client verra.
             */
            libellesApercu: await libellesApercu(profil.languePublique),
            palette: {
              remplissage: accent.remplissage,
              surRemplissage: accent.surRemplissage,
              surRemplissageDoux: accent.surRemplissageDoux,
              surRemplissageFaible: accent.surRemplissageFaible,
            },
          }}
          /*
            L'HISTORIQUE EST UN COMPOSANT SERVEUR passé en propriété. Le rendre
            dans l'îlot ferait voyager ses libellés et sa liste d'événements dans
            la charge d'hydratation, pour un bloc que personne n'interroge.
          */
          historique={
            <HistoriqueCommande lignes={historique} />
          }
          initiales={{
            customer_label: data.customer_label ?? "",
            product_ref: data.product_ref ?? "",
            tracking_number: data.tracking_number ?? "",
            // Un ancien texte libre (« DHL ») vaut détection automatique en base
            // (migration 164) : la liste le montre donc comme tel.
            carrier_code: /^[1-9][0-9]{0,8}$/.test(data.carrier_code ?? "") ? (data.carrier_code ?? "") : "",
            internal_notes: data.internal_notes ?? "",
            status: data.status,
            qc_status: data.qc_status,
          }}
        />
      </TraductionsClient>
    </main>
  );
}
