import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { Icone } from "@/components/icone";
import { TraductionsClient } from "@/components/traductions-client";
import { Editeur } from "@/components/commandes/editeur";
import { STATUTS_EXPEDITION, STATUTS_QC } from "@/lib/commandes/liste";
import { creerClientServeur } from "@/lib/supabase/server";
import { emettre } from "@/lib/instrumentation/emettre";
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
 * L'éditeur d'une commande, porté sur `droplink_cr_er_un_post_client`.
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
 * LA CARTE DES MÉDIAS N'EST PAS ENCORE LÀ. Elle arrive avec le dépôt R2 : une
 * zone de dépôt qui accepterait des fichiers pour les perdre serait pire que son
 * absence.
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
      "id, public_token, customer_label, product_ref, tracking_number, carrier_code, internal_notes, status, qc_status",
    )
    .eq("id", id)
    .maybeSingle();

  if (error !== null || data === null) notFound();

  const t = await getTranslations("editeur");
  const [origine, profil] = await Promise.all([origineDuSite(), lireProfilVendeur()]);

  if (profil !== null) {
    // `order_editor_opened` mesure l'OUVERTURE, `order_created` mesure le
    // premier contenu réel. L'écart entre les deux est l'information : un
    // brouillon ouvert puis abandonné est exactement le cas « teste une ou deux
    // fois puis disparaît ».
    await emettre(EVENEMENTS.EDITEUR_OUVERT, { sujet: profil.profilId }, { origine: "edition" });
  }

  const lienPublic = origine === null ? null : origine + "/p/" + data.public_token;

  return (
    <main id="contenu" className="flex min-h-dvh flex-col">
      <header className="z-10 flex h-20 shrink-0 items-center justify-between border-b border-surface-container bg-surface-container-lowest/80 px-gutter backdrop-blur-md">
        <div className="flex items-center gap-4">
          <Link
            href={"/" + langue + "/commandes"}
            className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container"
            title={t("retour")}
          >
            <Icone nom="arrow_back" className="text-[24px]" titre={t("retour")} />
          </Link>
          <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface md:font-headline-md md:text-headline-md">
            {data.customer_label ?? t("titre")}
          </h1>
        </div>

        {lienPublic !== null ? (
          <a
            href={lienPublic}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg border border-outline-variant px-4 py-2 font-label-md text-label-md text-on-surface-variant transition-colors hover:bg-surface-container-low"
          >
            {t("voirPage")}
            <Icone nom="open_in_new" className="text-[16px]" />
          </a>
        ) : null}
      </header>

      <div className="flex-1 overflow-y-auto p-margin-mobile md:p-gutter lg:p-margin-desktop">
        <TraductionsClient espaces={["editeur"]}>
          <Editeur
            id={data.id}
            statuts={STATUTS_EXPEDITION}
            qcs={STATUTS_QC}
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
