import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { DialogueSuspension } from "@/components/admin/dialogue-suspension";
import { EncartTrace } from "@/components/admin/encart-trace";
import { Icone } from "@/components/icone";
import { TraductionsClient } from "@/components/traductions-client";
import { exigerAdmin } from "@/lib/audit/garde";
import { empreinteAdmin } from "@/lib/audit/empreinte-admin";
import { lireCompte } from "@/lib/audit/comptes";
import { lireSeuils } from "@/lib/audit/panneau";
import { MOTIF_MIN } from "@/lib/audit/suspension";
import { mettreOctetsALEchelle } from "@/lib/format/octets";
import { creerClientServeur } from "@/lib/supabase/server";
import { estLangueSupportee } from "@/i18n/config";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // LA GARDE COURT AUSSI ICI, comme sur les cinq autres écrans : Next évalue les
  // métadonnées EN PARALLÈLE du rendu, et un titre posé sans elle partirait dans
  // le corps du 404 servi à qui n'a pas les droits. L'appel est mémoïsé par
  // requête, donc il ne coûte rien de plus.
  await exigerAdmin();
  const t = await getTranslations({ locale, namespace: "admin" });
  // TITRE NEUTRE, JAMAIS L'ADRESSE DU COMPTE. Un titre d'onglet se retrouve dans
  // l'historique du navigateur de l'administrateur, puis dans sa barre
  // d'adresse à la frappe suivante — une donnée d'un tiers n'a rien à y faire.
  return { title: t("fiche.titre"), robots: { index: false, follow: false } };
}

const CARTE = "rounded-[18px] border border-outline-variant bg-surface-container-lowest p-4 md:p-[22px]";
const SUR_TITRE =
  "font-headline-md text-[11px] leading-[13px] font-bold tracking-[0.09em] text-gris-entete uppercase";
const LIGNE = "flex items-baseline justify-between gap-4 border-t border-filet-ligne py-[11px]";
const ETIQUETTE = "font-body-md text-[14px] leading-[18px] text-sourdine";
const VALEUR = "text-right font-headline-md text-[14px] leading-[18px] font-semibold text-on-surface";

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
 * colis, combien de médias, combien d'octets — parce que c'est ce qui permet de
 * décider d'une suspension. Le contenu appartient au vendeur et à ses clients.
 *
 * MÊME LA FRISE D'ACTIVITÉ EST AGRÉGÉE : type, jour, nombre. Un événement
 * individuel porterait le pseudo du client et la référence du produit.
 *
 * LA CARTE « CE QUE CETTE PAGE NE PERMET PAS » EST DE LA PLANCHE, et c'est une
 * bonne idée : sans elle, le prochain administrateur chercherait le bouton
 * « se connecter en tant que » et conclurait à un oubli. Une absence décidée qui
 * ne se dit pas se lit comme un manque.
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
  const [fiche, seuils] = await Promise.all([
    lireCompte(supabase, id, await empreinteAdmin()),
    lireSeuils(supabase),
  ]);

  // Un identifiant absent rend 404, comme une adresse inexistante. La
  // consultation a néanmoins été tracée : c'est le geste qu'on voudrait
  // retrouver, pas son résultat.
  if (fiche === null) notFound();

  const t = await getTranslations("admin");
  const tMarque = await getTranslations("marque");
  const format = await getFormatter();

  const suspendu = fiche.statut === "suspended";
  const taille = mettreOctetsALEchelle(fiche.stockageOctets);
  const colisAuDessus = fiche.colisCeMois > seuils.colis;

  const typeLisible =
    fiche.typeDeCompte === null
      ? t("comptes.typeNonDeclare")
      : t(`comptes.type.${fiche.typeDeCompte}`);

  /**
   * Une barre de plafond. `part` est bornée à 1 : une barre qui déborde de son
   * conteneur ne dit pas « beaucoup », elle dit « le gabarit est cassé ».
   */
  const barre = (part: number, alerte: boolean) => (
    <div className="h-2 overflow-hidden rounded-full bg-filet-ligne">
      <div
        className={"h-full rounded-full " + (alerte ? "bg-alerte-puce" : "bg-violet")}
        style={{ width: `${Math.round(Math.min(Math.max(part, 0), 1) * 100)}%` }}
      />
    </div>
  );

  return (
    <main id="contenu" className="md:px-[30px] md:py-[26px]">
      {/* --- L'IDENTITÉ, EN TÊTE ---

          Le retour vers la liste est un LIEN, pas un bouton d'historique : un
          administrateur arrive souvent ici depuis une recherche, et
          `history.back()` lui rendrait une page qu'il n'a pas demandée. */}
      <div className="flex items-start gap-3 bg-admin px-4 pb-5 md:items-center md:gap-4 md:bg-transparent md:px-0 md:pb-0">
        <Link
          href={`/${langue}/admin/comptes`}
          aria-label={t("fiche.retour")}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] border border-white/20 bg-white/10 text-white md:border-filet-controle md:bg-surface-container-lowest md:text-on-surface"
        >
          <Icone nom="arrow_back" className="text-[18px]" />
        </Link>

        {/* La pastille prend la couleur d'accent DU VENDEUR : c'est la seule
            chose de cet écran qui lui appartienne visuellement, et elle aide à
            reconnaître un compte qu'on a déjà ouvert. */}
        <span
          aria-hidden="true"
          className="hidden h-12 w-12 shrink-0 rounded-[13px] md:block"
          style={{ backgroundColor: fiche.accent ?? "#7c5cf5" }}
        />

        <div className="min-w-0 flex-grow">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-headline-xl text-[22px] leading-7 font-extrabold tracking-[-0.03em] text-white md:text-[26px] md:leading-[33px] md:text-on-surface">
              {fiche.boutique ?? t("comptes.sansNom")}
            </h1>
            <span
              className={
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-headline-md text-[12px] leading-[15px] font-semibold " +
                (suspendu ? "bg-alerte-fond-vif text-alerte" : "bg-succes-fond text-succes")
              }
            >
              <span
                aria-hidden="true"
                className={"h-1.5 w-1.5 rounded-full " + (suspendu ? "bg-alerte-puce" : "bg-succes")}
              />
              {t(`comptes.statuts.${fiche.statut}`)}
            </span>
          </div>
          <p className="mt-[3px] font-headline-md text-[13px] leading-[18px] font-normal text-white/50 md:font-body-sm md:text-[14px] md:leading-[17px] md:text-sourdine">
            {t("fiche.resume", {
              email: fiche.email,
              type: typeLisible,
              date: format.dateTime(new Date(fiche.creeLe), { dateStyle: "long" }),
            })}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-4 md:mt-[18px] md:gap-[18px] md:p-0">
        <EncartTrace texte={t("fiche.trace")} />

        <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start">
          {/* ================= COLONNE DE GAUCHE ================= */}
          <div className="flex flex-col gap-4">
            {/* --- LES VOLUMES --- */}
            <section className={CARTE} aria-label={t("fiche.volumes")}>
              <p className={SUR_TITRE + " mb-4"}>{t("fiche.volumes")}</p>
              <div className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">
                {/* LE COMPTEUR FACTURÉ EN TÊTE ET ENCADRÉ : c'est le seul poste
                    du produit qui corresponde à une facture. */}
                <div className="rounded-[14px] border border-violet-filet bg-violet-carte p-[15px]">
                  <div className="mb-[7px] flex items-center gap-1.5">
                    <p className="font-headline-md text-[11px] leading-[14px] font-bold text-violet-encre">
                      {t("fiche.colis")}
                    </p>
                    <span className="rounded-full bg-violet px-1.5 py-0.5 font-headline-md text-[9px] leading-[11px] font-bold text-white">
                      {t("panneau.facture")}
                    </span>
                  </div>
                  <p className="font-headline-xl text-[24px] leading-[30px] font-extrabold tracking-[-0.03em] text-violet-sombre">
                    {format.number(fiche.colisCeMois)}
                  </p>
                </div>

                {(
                  [
                    { cle: "commandes", valeur: fiche.commandes },
                    { cle: "medias", valeur: fiche.medias },
                  ] as const
                ).map((v) => (
                  <div
                    key={v.cle}
                    className="rounded-[14px] border border-outline-variant p-[15px]"
                  >
                    <p className="mb-[7px] font-body-sm text-[11px] leading-[14px] text-sourdine">
                      {t(`fiche.${v.cle}`)}
                    </p>
                    <p className="font-headline-xl text-[24px] leading-[30px] font-extrabold tracking-[-0.03em] text-on-surface">
                      {format.number(v.valeur)}
                    </p>
                  </div>
                ))}

                {/* LE STOCKAGE PORTE UN CHIFFRE DEPUIS LA MIGRATION 049. La
                    planche écrit encore « Indisponible » : elle a été dessinée
                    quand rien ne le mesurait, et le garder aujourd'hui
                    affirmerait qu'on ne sait pas ce qu'on sait. */}
                <div className="rounded-[14px] border border-outline-variant p-[15px]">
                  <p className="mb-[7px] font-body-sm text-[11px] leading-[14px] text-sourdine">
                    {t("fiche.stockage")}
                  </p>
                  <p className="font-headline-md text-[15px] leading-5 font-bold tracking-[-0.01em] text-on-surface">
                    {t("panneau.stockageValeur", {
                      valeur: format.number(taille.valeur, {
                        minimumFractionDigits: taille.decimales,
                        maximumFractionDigits: taille.decimales,
                      }),
                      unite: t(`unites.${taille.unite}`),
                    })}
                  </p>
                </div>
              </div>
            </section>

            {/* --- LES PLAFONDS --- */}
            <section className={CARTE} aria-label={t("fiche.plafonds")}>
              <p className={SUR_TITRE + " mb-4"}>{t("fiche.plafonds")}</p>
              <div className="flex flex-col gap-4">
                <div>
                  <div className="mb-[7px] flex flex-wrap justify-between gap-2">
                    <span
                      className={
                        "font-headline-md text-[14px] leading-[18px] font-semibold " +
                        (colisAuDessus ? "text-alerte" : "text-on-surface")
                      }
                    >
                      {t("fiche.plafondColis")}
                    </span>
                    <span
                      className={
                        "font-headline-md text-[14px] leading-[18px] " +
                        (colisAuDessus ? "font-bold text-alerte" : "font-normal text-sourdine")
                      }
                    >
                      {t("fiche.surPlafond", {
                        valeur: format.number(fiche.colisCeMois),
                        plafond: format.number(seuils.colis),
                      })}
                    </span>
                  </div>
                  {barre(fiche.colisCeMois / Math.max(seuils.colis, 1), colisAuDessus)}
                  {/* LE DÉPASSEMENT PORTE SON CHIFFRE : « dépassé de 640 » se
                      vérifie, « au-dessus du seuil » se discute. */}
                  {colisAuDessus ? (
                    <p className="mt-[7px] font-headline-md text-[12px] leading-[18px] font-normal text-alerte-texte">
                      {t("fiche.depassementColis", {
                        ecart: format.number(fiche.colisCeMois - seuils.colis),
                      })}
                    </p>
                  ) : null}
                </div>

                <div>
                  <div className="mb-[7px] flex flex-wrap justify-between gap-2">
                    <span className="font-headline-md text-[14px] leading-[18px] font-semibold text-on-surface">
                      {t("fiche.plafondCommandes")}
                    </span>
                    <span className="font-body-md text-[14px] leading-[18px] text-sourdine">
                      {t("fiche.surPlafond", {
                        valeur: format.number(fiche.commandesCeMois),
                        plafond: format.number(seuils.plafondCommandes),
                      })}
                    </span>
                  </div>
                  {barre(fiche.commandesCeMois / seuils.plafondCommandes, false)}
                </div>
              </div>
            </section>

            {/* --- CE QUE CE COMPTE A FAIT --- */}
            <section className={CARTE} aria-label={t("fiche.activite")}>
              <p className={SUR_TITRE + " mb-2"}>{t("fiche.activite")}</p>
              <p className="mb-4 font-body-sm text-[13px] leading-5 text-sourdine">
                {t("fiche.activiteAide")}
              </p>

              {fiche.activite.length === 0 ? (
                <p className="font-body-md text-body-md text-on-surface-variant">
                  {t("fiche.activiteVide")}
                </p>
              ) : (
                <ul className="flex flex-col gap-[13px]">
                  {fiche.activite.map((a) => (
                    <li key={a.type + a.jour} className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="h-[7px] w-[7px] shrink-0 rounded-full bg-violet"
                      />
                      <span className="min-w-0 flex-grow font-headline-md text-[14px] leading-[18px] font-normal text-on-surface">
                        {t("fiche.activiteLigne", {
                          n: a.n,
                          quoi: t.has(`fiche.evenement.${a.type}`)
                            ? t(`fiche.evenement.${a.type}`)
                            : a.type,
                        })}
                      </span>
                      <span className="shrink-0 font-body-sm text-[13px] leading-4 text-sourdine">
                        {format.dateTime(new Date(a.jour), { dateStyle: "medium" })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* ================= COLONNE DE DROITE ================= */}
          <div className="flex flex-col gap-4">
            {/* LE GESTE DE L'ÉCRAN VIENT EN PREMIER. La planche le pose dans
                l'en-tête, à droite du nom ; le nôtre ouvre un panneau EN LIGNE —
                comme la révocation de lien de l'éditeur, et pour la même raison :
                une modale demande un piège de focus et une sortie, un panneau
                non. Le poser dans une rangée de titre y ferait pousser un
                formulaire. */}
            <section className={CARTE} aria-label={t("suspension.ouvrir")}>
              <TraductionsClient espaces={["admin.suspension"]}>
                <DialogueSuspension
                  profilId={fiche.id}
                  email={fiche.email}
                  suspendu={suspendu}
                  motifMin={MOTIF_MIN}
                />
              </TraductionsClient>
            </section>

            <section className={CARTE} aria-label={t("fiche.identite")}>
              <p className={SUR_TITRE + " mb-4"}>{t("fiche.identite")}</p>
              <dl className="flex flex-col">
                {(
                  [
                    { cle: "email", valeur: fiche.email },
                    { cle: "type", valeur: typeLisible },
                    { cle: "role", valeur: t(`comptes.roles.${fiche.role}`) },
                    {
                      cle: "langue",
                      valeur: t.has(`langues.${fiche.langue}`)
                        ? t(`langues.${fiche.langue}`)
                        : fiche.langue,
                    },
                  ] as const
                ).map((l, i) => (
                  <div key={l.cle} className={LIGNE + (i === 0 ? " border-t-0 pt-0" : "")}>
                    <dt className={ETIQUETTE}>{t(`fiche.${l.cle}`)}</dt>
                    <dd className={VALEUR + " break-all"}>{l.valeur}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className={CARTE} aria-label={t("fiche.boutique")}>
              <p className={SUR_TITRE + " mb-4"}>{t("fiche.boutique")}</p>

              <div className="mb-4 flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="h-11 w-11 shrink-0 rounded-[12px]"
                  style={{ backgroundColor: fiche.accent ?? "#7c5cf5" }}
                />
                <div className="min-w-0">
                  <p className="truncate font-headline-md text-[15px] leading-[19px] font-bold text-on-surface">
                    {fiche.boutique ?? t("fiche.boutiqueNonConfiguree")}
                  </p>
                  {/* LA VALEUR EXACTE, EN CHASSE FIXE. Un aplat de couleur ne se
                      recopie pas dans un message ; un code hexadécimal, si. */}
                  <p className="mt-px font-mono text-[13px] leading-4 text-sourdine">
                    {fiche.accent ?? t("fiche.boutiqueNonConfiguree")}
                  </p>
                </div>
              </div>

              <div className={LIGNE}>
                <span className={ETIQUETTE}>{t("fiche.filigrane")}</span>
                <span className={VALEUR}>
                  {fiche.filigrane ? t("fiche.active") : t("fiche.inactive")}
                </span>
              </div>
              <div className={LIGNE}>
                <span className={ETIQUETTE}>{t("fiche.reseaux")}</span>
                {/* UNE ABSENCE EST NOMMÉE, pas remplacée par un tiret : « aucun »
                    se lit, « — » se devine. */}
                <span className={VALEUR}>
                  {fiche.reseaux.length === 0
                    ? t("fiche.reseauxAucun")
                    : fiche.reseaux
                        .map((r) => (tMarque.has(`reseau.${r}`) ? tMarque(`reseau.${r}`) : r))
                        .join(", ")}
                </span>
              </div>
            </section>

            {/* --- CE QUE CETTE PAGE NE PERMET PAS --- */}
            <section
              className={CARTE + " bg-surface-container-low"}
              aria-label={t("fiche.interdits")}
            >
              <p className={SUR_TITRE + " mb-4"}>{t("fiche.interdits")}</p>
              <ul className="flex flex-col gap-3">
                {(["suppression", "usurpation", "commandes"] as const).map((cle) => (
                  <li key={cle} className="font-body-sm text-[13px] leading-5 text-sourdine">
                    <strong className="font-headline-md font-bold text-on-surface">
                      {t(`fiche.interdit.${cle}.quoi`)}
                    </strong>{" "}
                    {t(`fiche.interdit.${cle}.pourquoi`)}
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

