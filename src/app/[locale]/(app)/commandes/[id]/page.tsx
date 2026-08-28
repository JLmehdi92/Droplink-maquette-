import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { TraductionsClient } from "@/components/traductions-client";
import { Editeur } from "@/components/commandes/editeur";
import type { MediaAffiche } from "@/components/commandes/carte-medias";
import { plafondsAffichables } from "@/lib/commandes/medias";
import { signerLecture } from "@/lib/storage/r2";
import { STATUTS_EXPEDITION, STATUTS_QC } from "@/lib/commandes/liste";
import { creerClientServeur } from "@/lib/supabase/server";
import { emettreApres } from "@/lib/instrumentation/emettre";
import { EVENEMENTS } from "@/lib/instrumentation/evenements";
import { lireProfilVendeur } from "@/lib/comptes/profil";
import { resoudreAccent } from "@/lib/design/contraste";
import { origineDuSite } from "@/lib/site";
import { estLangueSupportee } from "@/i18n/config";
import { lireHistorique } from "@/lib/commandes/historique";
import { HistoriqueCommande } from "@/components/commandes/historique-commande";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "editeur" });
  return { title: t("titre"), robots: { index: false, follow: false } };
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

  const supabase = await creerClientServeur();
  const { data, error } = await supabase
    .from("orders")
    .select(
      // `first_content_at` n'est pas rendu à l'écran : il sert à dire si cette
      // ouverture porte sur un brouillon encore vide ou sur une commande déjà
      // remplie — la distinction que portait le second point d'émission qu'on
      // vient de retirer.
      "id, public_token, customer_label, product_ref, tracking_number, internal_notes, status, qc_status, cover_media_id, archived_at, first_content_at, views_count, last_viewed_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error !== null || data === null) notFound();

  const [origine, profil] = await Promise.all([origineDuSite(), lireProfilVendeur()]);

  /*
   * Les médias, avec des URL de lecture SIGNÉES ET À EXPIRATION.
   *
   * Le bucket est privé sans exception : il n'existe aucune adresse permanente à
   * stocker. Signer au rendu plutôt que garder une URL en base a un second
   * effet — une URL enregistrée périme dans la colonne, et l'écran se met à
   * afficher des images mortes sans qu'aucune erreur ne remonte.
   *
   * On signe la VIGNETTE, pas le média : la grille de l'éditeur n'a besoin que
   * de 200 × 200. Signer les originaux ferait télécharger vingt photos pleines
   * pour dessiner des carrés de deux cents pixels.
   */
  const { data: lignesMedias } = await supabase
    .from("order_media")
    .select("id, type, cle_vignette, duree_s")
    .eq("order_id", id)
    .order("position", { ascending: true });

  // Lu SOUS LA SESSION du vendeur : la policy de `order_events` remonte à
  // `orders → shops → profiles`, et c'est elle qui garantit qu'on ne lit que
  // ses propres commandes. Contourner la RLS ici en ferait la seule surface du
  // produit où l'historique d'un tiers serait atteignable.
  const historique = await lireHistorique(supabase, id);

  const medias: MediaAffiche[] = await Promise.all(
    (lignesMedias ?? []).map(async (m) => ({
      id: m.id,
      type: m.type,
      urlVignette:
        m.cle_vignette === null ? null : await signerLecture(m.cle_vignette).catch(() => null),
      estCouverture: m.id === data.cover_media_id,
      dureeS: m.duree_s,
    })),
  );

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
  const accent = resoudreAccent(profil?.couleurAccent ?? "");
  const logoUrl =
    profil?.logoUrl == null ? null : await signerLecture(profil.logoUrl).catch(() => null);

  if (profil !== null) {
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

  return (
    /*
      LA MARGE NÉGATIVE ANNULE LA PLACE RÉSERVÉE AUX ONGLETS. Le layout de
      l'espace vendeur réserve 86 px en bas pour la barre d'onglets fixe ;
      l'éditeur n'en a pas — la planche `EditeurMobile` met une bande d'action à
      la place. Sans cette annulation, 86 px de gris flottaient sous la bande.
    */
    <main id="contenu" className="-mb-[86px] flex min-h-dvh flex-col md:mb-0">
      <TraductionsClient espaces={["editeur", "medias", "actions"]}>
        <Editeur
          id={data.id}
          langue={langue}
          jeton={data.public_token}
          // Sans origine connue, le lien public serait construit sur une valeur
          // devinée. On rend alors un chemin relatif : il ne se copie pas dans
          // une conversation, mais il n'envoie personne sur un domaine inventé.
          origine={origine ?? ""}
          versPageClient={versPageClient}
          statuts={STATUTS_EXPEDITION}
          qcs={STATUTS_QC}
          medias={{
            initiaux: medias,
            plafondMedias: plafonds.medias,
            plafondVideos: plafonds.videos,
            typesAcceptes: plafonds.typesAcceptes,
          }}
          boutique={{
            nom: profil?.nomBoutique ?? null,
            logoUrl,
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
            <HistoriqueCommande
              lignes={historique}
              vues={data.views_count}
              derniereVueLe={data.last_viewed_at}
            />
          }
          initiales={{
            customer_label: data.customer_label ?? "",
            product_ref: data.product_ref ?? "",
            tracking_number: data.tracking_number ?? "",
            internal_notes: data.internal_notes ?? "",
            status: data.status,
            qc_status: data.qc_status,
          }}
        />
      </TraductionsClient>
    </main>
  );
}
