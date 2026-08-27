import Link from "next/link";
import { EnTeteEcran } from "@/components/app/en-tete-ecran";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { lireProfilVendeur, onboardingAFaire } from "@/lib/comptes/profil";
import {
  analyserParametres,
  lireActivite,
  PERIODES,
  tauxOuverture,
  vuesParCommandeOuverte,
} from "@/lib/analyses/activite";
import { resoudreAccent } from "@/lib/design/contraste";
import { creerClientServeur } from "@/lib/supabase/server";
import { estLangueSupportee } from "@/i18n/config";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "analyses" });
  return { title: t("titre"), robots: { index: false, follow: false } };
}

const CARTE = "rounded-xl border border-outline-variant bg-surface-container-lowest p-4";

/**
 * LES ANALYSES, porté sur le canevas Claude Design.
 *
 * SON TITRE EST ABANDONNÉ. La maquette annonce un « taux de conformité global »
 * calculé sur des articles inspectés : personne n'inspecte de contrôle qualité
 * chez nous. Ce que nous savons, c'est ce que le CLIENT a répondu quand on lui a
 * montré les photos — approuvé, refusé, ou rien encore. C'est une donnée sur sa
 * réaction, pas un verdict sur la marchandise.
 *
 * AUCUNE BIBLIOTHÈQUE DE GRAPHIQUES. La plus légère pèse quarante kilo-octets
 * pour dessiner quatre barres qu'une `div` de largeur proportionnelle rend
 * aussi bien — et l'écran reste lisible sans JavaScript.
 *
 * LE VENDEUR VOIT LES MÊMES CHIFFRES QUE NOUS. Le livrable réel de la phase de
 * validation est la donnée d'usage ; un écran qui lui montrerait autre chose
 * que ce qu'on regarde soi-même serait une vitrine.
 */
export default async function Analyses({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const langue = estLangueSupportee(locale) ? locale : "fr";
  setRequestLocale(langue);

  const profil = await lireProfilVendeur();
  if (profil === null) redirect(`/${langue}/connexion?erreur=session`);
  if (onboardingAFaire(profil)) redirect(`/${langue}/bienvenue`);

  const { periode } = analyserParametres(await searchParams);
  const supabase = await creerClientServeur();
  const activite = await lireActivite(supabase, periode, new Date());

  const t = await getTranslations("analyses");
  const format = await getFormatter();
  const accent = resoudreAccent(profil.couleurAccent);

  const taux = tauxOuverture(activite);
  const moyenne = vuesParCommandeOuverte(activite);
  const base = `/${langue}/analyses`;

  /**
   * UNE VALEUR ABSENTE S'ÉCRIT COMME TELLE. « — » plutôt que « 0 » : zéro
   * affirme qu'on a mesuré et trouvé rien, l'absence de commande n'affirme rien.
   * Les deux se ressemblent trop pour être rendus pareil sur un écran qui sert à
   * décider.
   */
  const ouSansValeur = (v: number | null, suffixe = ""): string =>
    v === null ? "—" : format.number(v) + suffixe;

  const qcTotal = activite.qcApprouve + activite.qcRefuse + activite.qcEnAttente;

  return (
    <>
      <EnTeteEcran titre={t("titre")} sousTitre={t("sousTitre")} />

      <main id="contenu" className="px-margin-mobile py-5 md:px-[30px] md:py-[22px]">
        <nav aria-label={t("periode.titre")} className="mt-6 flex flex-wrap gap-2">
        {PERIODES.map((p) => (
          <Link
            key={p}
            href={p === "30j" ? base : `${base}?periode=${p}`}
            aria-current={periode === p ? "true" : undefined}
            className={
              "min-h-[44px] rounded-full px-4 py-2 font-label-md text-label-md transition-colors " +
              (periode === p
                ? "bg-violet-fond text-on-surface"
                : "text-on-surface-variant hover:bg-surface-container-low")
            }
          >
            {t(`periode.${p}`)}
          </Link>
        ))}
      </nav>

      <section aria-label={t("titre")} className="mt-6 grid grid-cols-1 gap-gutter md:grid-cols-3">
        <div className={CARTE}>
          <p className="font-label-sm text-label-sm text-on-surface-variant">
            {t("commandesCreees")}
          </p>
          <p className="mt-1 font-headline-lg-mobile text-headline-lg-mobile text-on-surface">
            {format.number(activite.commandesCreees)}
          </p>
          <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
            {t("avecSuivi", { n: activite.avecSuivi })}
          </p>
        </div>

        <div className={CARTE}>
          <p className="font-label-sm text-label-sm text-on-surface-variant">{t("tauxOuverture")}</p>
          <p className="mt-1 font-headline-lg-mobile text-headline-lg-mobile text-on-surface">
            {ouSansValeur(taux, " %")}
          </p>
          {/* LE CHIFFRE PORTE SA BASE DE CALCUL. « 67 % » seul ne se vérifie pas ;
              « 2 liens ouverts sur 3 » se recompte. */}
          <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
            {t("ouvertsSur", {
              ouverts: activite.commandesOuvertes,
              total: activite.commandesCreees,
            })}
          </p>
        </div>

        <div className={CARTE}>
          <p className="font-label-sm text-label-sm text-on-surface-variant">{t("vuesMoyennes")}</p>
          <p className="mt-1 font-headline-lg-mobile text-headline-lg-mobile text-on-surface">
            {ouSansValeur(moyenne)}
          </p>
          <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
            {t("vuesTotales", { n: activite.vuesTotales })}
          </p>
        </div>
      </section>

      <section aria-label={t("qc.titre")} className={CARTE + " mt-gutter"}>
        <h2 className="font-headline-md text-headline-md-mobile text-on-surface">{t("qc.titre")}</h2>
        <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">{t("qc.aide")}</p>

        {qcTotal === 0 ? (
          <p className="mt-4 font-body-md text-body-md text-on-surface-variant">{t("qc.vide")}</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {(
              [
                { cle: "approuve", valeur: activite.qcApprouve, couleur: accent.remplissage },
                { cle: "refuse", valeur: activite.qcRefuse, couleur: "var(--color-error)" },
                {
                  cle: "enAttente",
                  valeur: activite.qcEnAttente,
                  couleur: "var(--color-outline-variant)",
                },
              ] as const
            ).map((part) => (
              <li key={part.cle} className="flex items-center gap-3">
                <span className="w-32 shrink-0 font-body-sm text-body-sm text-on-surface-variant">
                  {t(`qc.${part.cle}`)}
                </span>
                {/* La barre est décorative : le chiffre à côté porte
                    l'information, donc elle n'a rien à annoncer à un lecteur
                    d'écran. */}
                <span
                  aria-hidden="true"
                  className="h-2 rounded-full"
                  style={{
                    width: `${Math.round((part.valeur / qcTotal) * 100)}%`,
                    minWidth: part.valeur > 0 ? "0.5rem" : "0",
                    backgroundColor: part.couleur,
                  }}
                />
                <span className="font-label-md text-label-md text-on-surface">
                  {format.number(part.valeur)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      </main>
    </>
  );
}
