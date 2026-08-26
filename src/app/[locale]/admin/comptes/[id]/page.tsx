import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { DialogueSuspension } from "@/components/admin/dialogue-suspension";
import { TraductionsClient } from "@/components/traductions-client";
import { exigerAdmin } from "@/lib/audit/garde";
import { empreinteAdmin } from "@/lib/audit/empreinte-admin";
import { lireCompte } from "@/lib/audit/comptes";
import { MOTIF_MIN } from "@/lib/audit/suspension";
import { creerClientServeur } from "@/lib/supabase/server";
import { estLangueSupportee } from "@/i18n/config";

export const metadata: Metadata = { robots: { index: false, follow: false } };

const CARTE = "rounded-lg border border-outline-variant bg-surface-container-lowest p-4";

/**
 * LA FICHE D'UN COMPTE.
 *
 * SA SEULE CONSULTATION EST TRACÉE, avec le compte visé. C'est l'entrée qui
 * compte vraiment dans le journal : la consultation de liste porte des critères,
 * celle-ci porte un nom. Et elle est tracée MÊME quand le compte n'existe pas —
 * chercher des identifiants au hasard est la forme que prend une énumération, et
 * ne consigner que les succès la rendrait invisible.
 *
 * CE QUI N'EST PAS AFFICHÉ : aucune commande, aucun nom de client, aucun média,
 * aucun lien public. On montre des VOLUMES — combien de commandes, combien de
 * colis, combien de vues — parce que c'est ce qui permet de décider d'une
 * suspension. Le contenu appartient au vendeur et à ses clients ; le consulter
 * n'aiderait pas à trancher et ferait de cet écran une fenêtre sur les données
 * de tout le monde.
 *
 * AUCUNE USURPATION D'IDENTITÉ, aucune suppression de compte, aucun rôle
 * intermédiaire : chaque pouvoir est une surface de plus, et la lecture tracée
 * suffit au diagnostic.
 */
export default async function FicheCompte({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const langue = estLangueSupportee(locale) ? locale : "fr";
  setRequestLocale(langue);

  await exigerAdmin();

  const supabase = await creerClientServeur();
  const fiche = await lireCompte(supabase, id, await empreinteAdmin());

  // Un identifiant absent rend 404, comme une adresse inexistante. La
  // consultation a néanmoins été tracée : c'est le geste qu'on voudrait
  // retrouver, pas son résultat.
  if (fiche === null) notFound();

  const t = await getTranslations("admin");
  const format = await getFormatter();

  const volumes = [
    { cle: "commandes", valeur: fiche.commandes },
    { cle: "colis", valeur: fiche.colis },
    { cle: "vues", valeur: fiche.vues },
  ] as const;

  return (
    <main id="contenu" className="px-margin-mobile py-6 md:px-[30px] md:py-[26px]">
      <h1 className="font-headline-xl text-[24px] font-extrabold tracking-[-0.03em] text-on-surface md:text-[28px]">
        {fiche.email}
      </h1>
      <p className="mt-3 font-body-md text-body-md text-on-surface-variant">
        {t("comptes.sousTitre")}
      </p>

      <div className="mt-6 grid grid-cols-1 gap-gutter md:grid-cols-3">
        <div className={CARTE + " md:col-span-1"}>
          <h2 className="font-headline-md text-headline-md-mobile text-on-surface">
            {t("fiche.identite")}
          </h2>
          <dl className="mt-3 flex flex-col gap-2">
            {(
              [
                {
                  cle: "type",
                  valeur:
                    fiche.typeDeCompte === null
                      ? t("comptes.typeNonDeclare")
                      : t(`comptes.type.${fiche.typeDeCompte}`),
                },
                { cle: "role", valeur: t(`comptes.roles.${fiche.role}`) },
                { cle: "statut", valeur: t(`comptes.statuts.${fiche.statut}`) },
                {
                  cle: "boutique",
                  // UNE INFORMATION ABSENTE EST NOMMÉE. `shops.name` est
                  // nullable sans défaut : un vendeur peut envoyer un lien sans
                  // avoir rien configuré, et c'est le cas le plus fréquent en
                  // début de vie d'un compte — pas un état anormal.
                  valeur: fiche.boutique ?? t("fiche.boutiqueNonConfiguree"),
                },
                {
                  cle: "inscrit",
                  valeur: format.dateTime(new Date(fiche.creeLe), { dateStyle: "long" }),
                },
              ] as const
            ).map((l) => (
              <div key={l.cle} className="flex flex-wrap justify-between gap-2">
                <dt className="font-body-sm text-body-sm text-on-surface-variant">
                  {t(`fiche.${l.cle}`)}
                </dt>
                <dd className="font-label-md text-label-md text-on-surface">{l.valeur}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className={CARTE + " md:col-span-2"}>
          <h2 className="font-headline-md text-headline-md-mobile text-on-surface">
            {t("fiche.volumes")}
          </h2>
          {/* DES VOLUMES, PAS DU CONTENU. Ils suffisent à décider d'une
              suspension ; le contenu appartient au vendeur et à ses clients. */}
          <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
            {t("fiche.volumesAide")}
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {volumes.map((v) => (
              <div key={v.cle}>
                <p className="font-label-sm text-label-sm text-on-surface-variant">
                  {t(`fiche.${v.cle}`)}
                </p>
                <p className="mt-1 font-headline-md text-headline-md text-on-surface">
                  {format.number(v.valeur)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <section className={CARTE + " mt-gutter"}>
        <TraductionsClient espaces={["admin.suspension"]}>
          <DialogueSuspension
            profilId={fiche.id}
            email={fiche.email}
            suspendu={fiche.statut === "suspended"}
            motifMin={MOTIF_MIN}
          />
        </TraductionsClient>
      </section>
    </main>
  );
}
