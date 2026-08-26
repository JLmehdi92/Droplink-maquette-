import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { exigerAdmin } from "@/lib/audit/garde";
import { lireParametres } from "@/lib/audit/parametres";
import { creerClientServeur } from "@/lib/supabase/server";
import { estLangueSupportee } from "@/i18n/config";
import { FormulaireParametre } from "@/components/admin/formulaire-parametres";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // La garde court aussi ici : Next évalue les métadonnées EN PARALLÈLE du
  // rendu, et le titre partirait sinon dans le corps du 404 servi à qui n'a pas
  // les droits.
  await exigerAdmin();
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("parametres.titre"), robots: { index: false, follow: false } };
}

/**
 * LES PARAMÈTRES SYSTÈME.
 *
 * LE TITRE DE LA MAQUETTE EST ABANDONNÉ : elle annonce « Paramètres système &
 * sécurité » et propose des bascules de conformité, des clés d'API et des règles
 * de rétention. Rien de tout cela n'existe ici, et l'afficher ferait croire que
 * des réglages agissent alors qu'ils ne piloteraient rien.
 *
 * L'INVENTAIRE EST CLOS : seuls les réglages que le produit LIT réellement
 * apparaissent. Un écran qui laisserait saisir une clé libre créerait des lignes
 * que rien ne consulte — avec leur trace et leur affichage, donc parfaitement
 * crédibles.
 *
 * AUCUN SECRET NE PASSE PAR CET ÉCRAN. Clés d'API, secret du planificateur, clé
 * service-role : ils restent dans l'environnement. Une valeur en base est
 * lisible par quiconque accède à la base — acceptable pour un seuil, jamais pour
 * une clé.
 *
 * CHAQUE MODIFICATION EST TRACÉE PAR UN DÉCLENCHEUR, avec l'ancienne ET la
 * nouvelle valeur. Un paramètre modifiable sans trace est pire qu'un paramètre
 * figé : figé, on sait ce qu'il vaut ; modifiable en silence, on croit savoir.
 */
export default async function ParametresAdmin({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const langue = estLangueSupportee(locale) ? locale : "fr";
  setRequestLocale(langue);

  await exigerAdmin();

  const supabase = await creerClientServeur();
  const parametres = await lireParametres(supabase);

  const t = await getTranslations("admin.parametres");
  const format = await getFormatter();

  return (
    <main id="contenu" className="px-margin-mobile py-6 md:px-[30px] md:py-[26px]">
      <h1 className="font-headline-xl text-[24px] font-extrabold tracking-[-0.03em] text-on-surface md:text-[28px]">
        {t("titre")}
      </h1>
      <p className="mt-2 max-w-[640px] font-body-md text-body-md text-on-surface-variant">
        {t("sousTitre")}
      </p>

      <div className="mt-gutter flex flex-col gap-gutter">
        {parametres.map((p) => (
          <FormulaireParametre
            key={p.cle}
            parametre={{
              cle: p.cle,
              valeur: p.valeur,
              defaut: p.defaut,
              min: p.min,
              max: p.max,
              ecrit: p.ecrit,
              // L'ORIGINE EST COMPOSÉE ICI, côté serveur : la date y est mise en
              // forme avec la même locale que le reste de l'écran, et le
              // catalogue de traduction ne part pas dans le navigateur pour
              // trois phrases.
              origine: !p.ecrit
                ? t("origine.jamaisDecide")
                : p.modifiePar === null
                  ? t("origine.auteurParti", {
                      date: format.dateTime(new Date(p.modifieLe ?? 0), "long"),
                    })
                  : t("origine.decide", {
                      date: format.dateTime(new Date(p.modifieLe ?? 0), "long"),
                      email: p.modifiePar,
                    }),
            }}
          />
        ))}
      </div>

      {/* CE QUI N'EST PAS ICI EST DIT, plutôt que laissé à deviner. Un écran de
          paramètres muet sur les secrets laisse chercher où les régler. */}
      <p className="mt-gutter max-w-[640px] font-body-sm text-body-sm text-on-surface-variant">
        {t("secretsAide")}
      </p>
    </main>
  );
}
