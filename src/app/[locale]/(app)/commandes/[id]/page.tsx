import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { Icone } from "@/components/icone";
import { TraductionsClient } from "@/components/traductions-client";
import { Editeur } from "@/components/commandes/editeur";
import { CarteMedias, type MediaAffiche } from "@/components/commandes/carte-medias";
import { ActionsCommande } from "@/components/commandes/actions-commande";
import { plafondsAffichables } from "@/lib/commandes/medias";
import { signerLecture } from "@/lib/storage/r2";
import { STATUTS_EXPEDITION, STATUTS_QC } from "@/lib/commandes/liste";
import { creerClientServeur } from "@/lib/supabase/server";
import { emettreApres } from "@/lib/instrumentation/emettre";
import { EVENEMENTS } from "@/lib/instrumentation/evenements";
import { lireProfilVendeur } from "@/lib/comptes/profil";
import { origineDuSite } from "@/lib/site";
import { estLangueSupportee } from "@/i18n/config";

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
 * L'éditeur d'une commande, porté sur le canevas Claude Design.
 *
 * TROIS CORRECTIONS SUR LA MAQUETTE, toutes portées par une décision :
 *
 *  1. Le bloc « Client Account » — recherche de compte, avatar, adresse email —
 *     devient un simple champ texte libre. Le destinataire n'a JAMAIS de compte.
 *  2. Les boutons « Save Draft » et « Publish to Client » disparaissent : la
 *     sauvegarde est automatique, et il n'y a rien à publier — le lien existe
 *     dès la création et ne change plus jamais. Leur emplacement porte le témoin
 *     de sauvegarde et le lien vers la page publique.
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
      "id, public_token, customer_label, product_ref, tracking_number, carrier_code, internal_notes, status, qc_status, cover_media_id, archived_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error !== null || data === null) notFound();

  const t = await getTranslations("editeur");
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
    .select("id, type, cle_vignette")
    .eq("order_id", id)
    .order("position", { ascending: true });

  const medias: MediaAffiche[] = await Promise.all(
    (lignesMedias ?? []).map(async (m) => ({
      id: m.id,
      type: m.type,
      urlVignette:
        m.cle_vignette === null ? null : await signerLecture(m.cle_vignette).catch(() => null),
      estCouverture: m.id === data.cover_media_id,
    })),
  );

  const plafonds = plafondsAffichables();

  if (profil !== null) {
    // `order_editor_opened` mesure l'OUVERTURE, `order_created` mesure le
    // premier contenu réel. L'écart entre les deux est l'information : un
    // brouillon ouvert puis abandonné est exactement le cas « teste une ou deux
    // fois puis disparaît ».
    emettreApres(EVENEMENTS.EDITEUR_OUVERT, { sujet: profil.profilId }, { origine: "edition" });
  }

  const lienPublic = origine === null ? null : origine + "/p/" + data.public_token;

  return (
    <main id="contenu" className="flex min-h-dvh flex-col">
      {/*
        LA BARRE HAUTE DE L'ÉDITEUR : d'où l'on vient, ce qu'on édite, et les
        deux gestes qui suivent l'édition — copier le lien, l'ouvrir.

        LE DÉGRADÉ EST SUR « VOIR LA PAGE PUBLIQUE » et sur rien d'autre. Une
        seule action principale par écran : c'est celle qui termine le travail,
        celle qu'on fait avant d'envoyer le lien à son client.
      */}
      <header className="z-10 flex shrink-0 flex-wrap items-center gap-3 border-b border-outline-variant bg-surface-container-lowest px-margin-mobile py-3.5 md:gap-[18px] md:px-[26px]">
        <Link
          href={"/" + langue + "/commandes"}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-outline text-on-surface transition-colors hover:bg-surface-container md:h-[38px] md:w-[38px]"
          title={t("retour")}
        >
          <Icone nom="arrow_back" className="text-[17px]" titre={t("retour")} />
        </Link>

        <div className="min-w-0">
          <h1 className="truncate font-headline-md text-[17px] font-extrabold tracking-[-0.02em] text-on-surface">
            {data.customer_label ?? t("titre")}
          </h1>
          {data.product_ref !== null ? (
            <p className="truncate font-body-sm text-[12px] text-on-surface-variant">
              {data.product_ref}
            </p>
          ) : null}
        </div>

        <span className="flex-grow" />

        {lienPublic !== null ? (
          <a
            href={lienPublic}
            target="_blank"
            rel="noopener noreferrer"
            className="degrade-marque flex h-11 items-center gap-2 rounded-md px-[18px] font-label-md text-[14px] font-bold shadow-[0_8px_20px_-8px_rgba(124,92,245,0.66)] transition-opacity hover:opacity-90 md:h-10"
          >
            {t("voirPage")}
            <Icone nom="open_in_new" className="text-[14px]" />
          </a>
        ) : null}
      </header>

      <div className="flex-1 p-margin-mobile md:px-[26px] md:py-5">
        <TraductionsClient espaces={["editeur", "medias", "actions"]}>
          <Editeur
            id={data.id}
            statuts={STATUTS_EXPEDITION}
            qcs={STATUTS_QC}
            actions={
              <ActionsCommande
                orderId={data.id}
                langue={langue}
                jeton={data.public_token}
                origine={origine ?? ""}
                estArchivee={data.archived_at !== null}
              />
            }
            medias={
              <CarteMedias
                orderId={data.id}
                initiaux={medias}
                plafondMedias={plafonds.medias}
                plafondVideos={plafonds.videos}
                typesAcceptes={plafonds.typesAcceptes}
              />
            }
            initiales={{
              customer_label: data.customer_label ?? "",
              product_ref: data.product_ref ?? "",
              tracking_number: data.tracking_number ?? "",
              carrier_code: data.carrier_code ?? "",
              internal_notes: data.internal_notes ?? "",
              status: data.status,
              qc_status: data.qc_status,
            }}
          />
        </TraductionsClient>
      </div>
    </main>
  );
}
