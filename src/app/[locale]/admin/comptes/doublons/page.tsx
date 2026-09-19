import Link from "next/link";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { ArrowLeft, Globe } from "lucide-react";
import { EnTeteAdmin } from "@/components/admin/en-tete-admin";
import { EncartTrace } from "@/components/admin/encart-trace";
import { RESEAUX } from "@/components/publique/reseaux-vendeur";
import { exigerAdmin } from "@/lib/audit/garde";
import { empreinteAdmin } from "@/lib/audit/empreinte-admin";
import {
  compterDoublons,
  listerDoublons,
  valeurLisible,
  type GenreIdentifiant,
  type GroupeDoublon,
} from "@/lib/audit/doublons";
import { creerClientServeur } from "@/lib/supabase/server";
import { estLangueSupportee } from "@/i18n/config";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // LA GARDE COURT AUSSI ICI : Next évalue les métadonnées en parallèle du rendu, et un titre
  // posé sans elle partirait dans le corps du 404 servi à qui n'a pas les droits.
  await exigerAdmin();
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("doublons.titre"), robots: { index: false, follow: false } };
}

/*
 * ⚠️ LES VALEURS SONT CELLES DE LA PLANCHE `#comptes-doublons` DU KIT ADMIN (20/09/2026) :
 * cartes par identifiant partagé, colonne de droite de la fiche de compte (380 px).
 */
const PANNEAU =
  "flex min-w-0 flex-col rounded-ds-card-lg border border-ds-filet bg-ds-surface-carte p-4 shadow-ds-card md:p-[22px]";
const PANNEAU_TITRE = "text-[18px] leading-[19.8px] font-bold tracking-[-0.025em] text-ds-texte-titre";
const LIGNE = "flex items-center gap-3.5 border-t border-ds-filet py-[11px] first:border-t-0 first:pt-0";
const ETIQUETTE = "shrink-0 text-[13.5px] text-ds-texte-corps";
const VALEUR = "ml-auto text-right text-[14px] font-semibold text-ds-texte-fort";
const PILULE =
  "inline-flex items-center gap-1.5 rounded-ds-pill px-[11px] py-1.5 text-[11.5px] leading-[normal] font-bold tracking-[-0.02em] whitespace-nowrap";
const COLONNES = "lg:grid-cols-[minmax(0,1.6fr)_110px_150px_110px_132px]";
/**
 * L'étiquette d'une cellule — visible au téléphone (11,5 px, le plancher de lecture, règle 5),
 * LUE au bureau : l'en-tête de colonnes visuel y est `aria-hidden`, et sans elle un lecteur d'écran
 * entendrait « 2 août 2025 · Actif · 84 » sans savoir ce que dit chaque valeur (revue du 20/09/2026).
 */
const LIBELLE_TEL = "mb-[3px] block text-[11.5px] leading-[normal] font-semibold text-ds-texte-sourdine lg:sr-only";

/** Le logo officiel du réseau (les tracés de la page client), ou un globe pour le site. */
function Symbole({ genre }: { readonly genre: GenreIdentifiant }) {
  const reseau = RESEAUX.find((r) => r.clef === genre);
  if (genre === "site" || reseau === undefined) {
    return <Globe aria-hidden="true" size={19} strokeWidth={1.9} />;
  }
  return (
    <svg aria-hidden="true" width={19} height={19} viewBox="0 0 24 24" fill="currentColor">
      <path d={reseau.trace} />
    </svg>
  );
}

/**
 * LES COMPTES EN DOUBLON (migration 170).
 *
 * Décision de Wassim, 20/09/2026. L'écran dit un FAIT — ces comptes affichent le même
 * identifiant — jamais qu'il s'agit de la même personne ; il n'agit sur rien. Son ouverture
 * écrit UNE entrée au journal (`comptes.doublons`), dans la même transaction que la lecture.
 */
export default async function PageDoublons({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const langue = estLangueSupportee(locale) ? locale : "fr";
  setRequestLocale(langue);

  // 404 sans jamais revenir si l'appelant n'est pas administrateur ACTIF — jamais 403.
  await exigerAdmin();

  const supabase = await creerClientServeur();
  const [groupes, nombres] = await Promise.all([
    listerDoublons(supabase, await empreinteAdmin()),
    compterDoublons(supabase),
  ]);

  const t = await getTranslations("admin");
  const format = await getFormatter();
  const base = `/${langue}/admin/comptes`;

  /* « EN BREF » DÉCRIT CE QUI EST AFFICHÉ. Au-delà de 100 identifiants, la phrase du plafond
     dit le total ; les trois nombres restent ceux des cartes qu'on a sous les yeux. */
  const comptes = new Set(groupes.flatMap((g) => g.comptes.map((c) => c.id)));
  const suspendus = new Set(
    groupes.flatMap((g) => g.comptes.filter((c) => c.statut === "suspended").map((c) => c.id)),
  );

  const carte = (g: GroupeDoublon) => (
    <section
      key={g.genre + ":" + g.valeur}
      aria-label={t(`doublons.genres.${g.genre}`) + " " + valeurLisible(g)}
      className="overflow-hidden rounded-ds-card-lg border border-ds-filet bg-ds-surface-carte shadow-ds-card"
    >
      <header className="flex items-center gap-3.5 px-5 py-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-ds-card bg-ds-surface-creux text-ds-texte-fort">
          <Symbole genre={g.genre} />
        </span>
        <div className="min-w-0 flex-1">
          <span className="block text-[12.5px] leading-[normal] font-semibold text-ds-texte-sourdine">
            {t(`doublons.genres.${g.genre}`)}
          </span>
          {/* LA VALEUR N'EST JAMAIS COUPÉE : c'est elle qu'on juge. */}
          <span className="mt-0.5 block text-[16px] leading-[normal] font-bold tracking-[-0.02em] [overflow-wrap:anywhere] text-ds-texte-fort">
            {valeurLisible(g)}
          </span>
        </div>
        <span className={PILULE + " shrink-0 bg-ds-alerte-fond text-ds-alerte-encre"}>
          {t("doublons.nombreComptes", { n: g.comptes.length })}
        </span>
      </header>

      <div
        aria-hidden="true"
        className={
          "hidden gap-3 border-t border-ds-filet bg-ds-ink-50 px-5 py-2.5 text-[12.5px] leading-[normal] font-semibold text-ds-texte-sourdine lg:grid " +
          COLONNES
        }
      >
        <span>{t("doublons.colCompte")}</span>
        <span>{t("doublons.colStatut")}</span>
        <span>{t("doublons.colInscription")}</span>
        <span>{t("doublons.colCommandes")}</span>
        <span />
      </div>

      <ul>
        {g.comptes.map((c) => (
          <li
            key={c.id}
            className={
              "grid grid-cols-2 items-start gap-x-4 gap-y-2.5 border-t border-ds-filet px-[18px] py-4 lg:items-center lg:gap-3 lg:px-5 lg:py-3 " +
              COLONNES
            }
          >
            <span className="col-span-2 flex min-w-0 flex-col gap-px lg:col-span-1">
              <span className={LIBELLE_TEL}>{t("doublons.colCompte")}</span>
              {/* L'ADRESSE N'EST JAMAIS COUPÉE : « lea.m@… » et « lea.modeaddict@… » ne diffèrent
                  que par ce qu'une ellipse cacherait. */}
              <span className="text-[14px] leading-[normal] font-semibold [overflow-wrap:anywhere] text-ds-texte-fort">
                {c.email}
              </span>
              {c.boutique === null ? (
                <span className="text-[12.5px] leading-[normal] text-ds-texte-sourdine italic">
                  {t("comptes.sansNom")}
                </span>
              ) : (
                <span className="truncate text-[12.5px] leading-[normal] text-ds-texte-sourdine">{c.boutique}</span>
              )}
            </span>
            <span>
              <span className={LIBELLE_TEL}>{t("doublons.colStatut")}</span>
              <span
                className={
                  PILULE +
                  " " +
                  (c.statut === "suspended"
                    ? "bg-ds-erreur-fond text-ds-erreur-encre"
                    : "bg-ds-succes-fond text-ds-succes-encre")
                }
              >
                {t(`comptes.statuts.${c.statut}`)}
              </span>
            </span>
            <span className="text-[13.5px] leading-[normal] whitespace-nowrap text-ds-texte-sourdine">
              <span className={LIBELLE_TEL}>{t("doublons.colInscription")}</span>
              {format.dateTime(new Date(c.inscritLe), { dateStyle: "medium" })}
            </span>
            <span className="text-[14px] leading-[normal] font-semibold text-ds-texte-fort">
              <span className={LIBELLE_TEL}>{t("doublons.colCommandes")}</span>
              {format.number(c.commandes)}
            </span>
            <span className="col-span-2 flex lg:col-span-1 lg:justify-end">
              <Link
                prefetch={false}
                href={`${base}/${c.id}`}
                aria-label={t("doublons.voirLong", { email: c.email })}
                className="inline-flex h-11 w-full items-center justify-center rounded-ds-sm border border-ds-filet bg-ds-surface-carte px-4 text-[13px] leading-4 font-semibold whitespace-nowrap text-ds-texte-fort transition-colors hover:bg-ds-surface-creux lg:h-[34px] lg:w-auto"
              >
                {t("doublons.voir")}
              </Link>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <main id="contenu" className="leading-[normal] md:px-8 md:pt-0 md:pb-8">
      <EnTeteAdmin titre={t("doublons.titre")} sousTitre={t("doublons.sousTitre")} actionEnHaut>
        {/* Un LIEN vers la liste, pas un retour d'historique : on arrive ici depuis le panneau
            de la liste, mais aussi par l'adresse directe. */}
        <Link
          prefetch={false}
          href={base}
          className="inline-flex h-11 items-center gap-[9px] rounded-ds-pill border border-ds-filet bg-ds-surface-carte px-[18px] text-[14px] leading-[normal] font-semibold whitespace-nowrap text-ds-texte-fort shadow-ds-sm transition-colors hover:bg-ds-surface-teinte"
        >
          <ArrowLeft aria-hidden="true" size={16} strokeWidth={2} />
          {t("doublons.retour")}
        </Link>
      </EnTeteAdmin>

      {/* L'EN-TÊTE LAISSE 26 PX SOUS LUI (14 au téléphone) ; la planche en met 22 avant l'encart,
          24 au téléphone. D'où le retrait d'un pixel de marge ici, et 10 px de haut au téléphone. */}
      <div className="flex flex-col gap-4 px-4 pt-2.5 pb-4 md:-mt-1 md:gap-[18px] md:p-0">
        <EncartTrace texte={t("doublons.trace")} />

        <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start">
          <div className="flex min-w-0 flex-col gap-4">
            {nombres.identifiants > groupes.length ? (
              <p className="text-[13px] leading-[1.55] text-ds-texte-corps">
                {t("doublons.plafond", { total: nombres.identifiants })}
              </p>
            ) : null}
            {groupes.length === 0 ? (
              <section className={PANNEAU}>
                <p className="text-[14px] leading-[1.55] text-ds-texte-sourdine">{t("doublons.vide")}</p>
              </section>
            ) : (
              groupes.map(carte)
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <section className={PANNEAU} aria-label={t("doublons.enBref")}>
              <h2 className={PANNEAU_TITRE + " mb-[18px]"}>{t("doublons.enBref")}</h2>
              <div>
                <div className={LIGNE}>
                  <span className={ETIQUETTE}>{t("doublons.identifiants")}</span>
                  <span className={VALEUR}>{format.number(groupes.length)}</span>
                </div>
                <div className={LIGNE}>
                  <span className={ETIQUETTE}>{t("doublons.concernes")}</span>
                  <span className={VALEUR}>{format.number(comptes.size)}</span>
                </div>
                <div className={LIGNE}>
                  <span className={ETIQUETTE}>{t("doublons.suspendus")}</span>
                  <span className={VALEUR}>{format.number(suspendus.size)}</span>
                </div>
              </div>
            </section>

            <section
              className="rounded-ds-card-lg border border-ds-filet bg-ds-surface-creux p-[22px]"
              aria-label={t("doublons.reglesTitre")}
            >
              <h2 className={PANNEAU_TITRE + " mb-3.5"}>{t("doublons.reglesTitre")}</h2>
              <ul className="flex flex-col gap-3">
                {(["reseaux", "whatsapp", "site", "decision"] as const).map((cle) => (
                  <li key={cle} className="text-[13px] leading-[1.55] text-ds-texte-corps">
                    <strong className="font-bold text-ds-texte-fort">{t(`doublons.regles.${cle}Q`)}</strong>{" "}
                    {t(`doublons.regles.${cle}R`)}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
