import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { DialogueSuspension } from "@/components/admin/dialogue-suspension";
import { EncartTrace } from "@/components/admin/encart-trace";
import { ArrowLeft } from "lucide-react";
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

/*
 * ⚠️ LES VALEURS SONT CELLES DE LA PLANCHE `#compte` DU KIT ADMIN, écrite le
 * 14/09/2026 : le kit n'en dessinait qu'un tiroir, dont le texte promettait « la
 * fiche complète quand elle sera maquettée ». Les cartes prennent le titre des
 * `AdminPanel` (18/700) au lieu d'un sur-titre en capitales, et les rangées
 * celles du tiroir.
 */
const PANNEAU =
  "flex min-w-0 flex-col rounded-ds-card-lg border border-ds-filet bg-ds-surface-carte p-4 shadow-ds-card md:p-[22px]";
const PANNEAU_TITRE = "text-[18px] leading-[19.8px] font-bold tracking-[-0.025em] text-ds-texte-titre";
const LIGNE = "flex items-center gap-3.5 border-t border-ds-filet py-[11px]";
const ETIQUETTE = "shrink-0 text-[13.5px] text-ds-texte-corps";
const VALEUR = "ml-auto text-right text-[14px] font-semibold text-ds-texte-fort";
const TUILE = "rounded-ds-card border p-[15px]";
const CHIFFRE = "block text-[24px] font-extrabold tracking-[-0.03em]";

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
    <div className="h-2 overflow-hidden rounded-ds-pill bg-ds-ink-100">
      <div
        className={"h-full rounded-ds-pill " + (alerte ? "bg-ds-erreur" : "bg-ds-accent")}
        style={{ width: `${Math.round(Math.min(Math.max(part, 0), 1) * 100)}%` }}
      />
    </div>
  );

  return (
    <main id="contenu" className="leading-[normal] md:px-8 md:pt-0 md:pb-8">
      {/* --- L'IDENTITÉ, EN TÊTE ---

          Le retour vers la liste est un LIEN, pas un bouton d'historique : un
          administrateur arrive souvent ici depuis une recherche, et
          `history.back()` lui rendrait une page qu'il n'a pas demandée. */}
      <div className="flex items-start gap-3 px-margin-mobile pt-4 pb-3.5 md:items-center md:gap-4 md:px-0 md:pt-[30px] md:pb-[22px]">
        <Link
          href={`/${langue}/admin/comptes`}
          aria-label={t("fiche.retour")}
          className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-ds-card border border-ds-filet bg-ds-surface-carte text-ds-texte-fort shadow-ds-xs transition-colors before:absolute before:-inset-[3px] before:content-[''] hover:bg-ds-surface-teinte"
        >
          <ArrowLeft aria-hidden="true" size={18} strokeWidth={1.9} />
        </Link>

        {/* La pastille prend la couleur d'accent DU VENDEUR : c'est la seule
            chose de cet écran qui lui appartienne visuellement, et elle aide à
            reconnaître un compte qu'on a déjà ouvert. */}
        <span
          aria-hidden="true"
          className="hidden h-12 w-12 shrink-0 rounded-ds-control md:block"
          style={{ backgroundColor: fiche.accent ?? "var(--color-ds-accent)" }}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[24px] leading-7 font-extrabold tracking-[-0.045em] text-ds-texte-titre md:text-[36px] md:leading-[1.05]">
              {fiche.boutique ?? t("comptes.sansNom")}
            </h1>
            <span
              className={
                "inline-flex items-center gap-1.5 rounded-ds-pill px-[11px] py-[5px] text-[11.5px] font-bold tracking-[-0.02em] whitespace-nowrap md:text-[11px] " +
                (suspendu ? "bg-ds-erreur-fond text-ds-erreur" : "bg-ds-succes-fond text-ds-succes")
              }
            >
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-ds-pill bg-current" />
              {t(`comptes.statuts.${fiche.statut}`)}
            </span>
          </div>
          <p className="mt-2 text-[14px] leading-[1.55] text-ds-texte-corps md:text-[15px]">
            {t("fiche.resume", {
              email: fiche.email,
              type: typeLisible,
              date: format.dateTime(new Date(fiche.creeLe), { dateStyle: "long" }),
            })}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-4 md:gap-[18px] md:p-0">
        <EncartTrace texte={t("fiche.trace")} />

        <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start">
          {/* ================= COLONNE DE GAUCHE ================= */}
          <div className="flex min-w-0 flex-col gap-4">
            {/* --- LES VOLUMES --- */}
            <section className={PANNEAU} aria-label={t("fiche.volumes")}>
              <h2 className={PANNEAU_TITRE + " mb-[18px]"}>{t("fiche.volumes")}</h2>
              <div className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">
                {/* LE COMPTEUR FACTURÉ EN TÊTE ET ENCADRÉ : c'est le seul poste
                    du produit qui corresponde à une facture. */}
                <div className={TUILE + " border-ds-violet-200 bg-ds-surface-teinte"}>
                  <div className="mb-[7px] flex flex-wrap items-center gap-1.5">
                    <span className="text-[12px] font-bold text-ds-accent-encre">{t("fiche.colis")}</span>
                    <span className="inline-flex items-center gap-1.5 rounded-ds-pill bg-ds-accent-doux px-2 py-0.5 text-[11.5px] font-bold tracking-[-0.02em] text-ds-accent-encre md:text-[11px]">
                      {t("panneau.facture")}
                    </span>
                  </div>
                  <span className={CHIFFRE + " text-ds-accent-encre"}>{format.number(fiche.colisCeMois)}</span>
                </div>

                {(
                  [
                    { cle: "commandes", valeur: format.number(fiche.commandes) },
                    { cle: "medias", valeur: format.number(fiche.medias) },
                    /* LE STOCKAGE PORTE UN CHIFFRE DEPUIS LA MIGRATION 049, dans
                       la même taille que les autres volumes : l'afficher plus
                       petit en faisait un volume de seconde zone. */
                    {
                      cle: "stockage",
                      valeur: t("panneau.stockageValeur", {
                        valeur: format.number(taille.valeur, {
                          minimumFractionDigits: taille.decimales,
                          maximumFractionDigits: taille.decimales,
                        }),
                        unite: t(`unites.${taille.unite}`),
                      }),
                    },
                  ] as const
                ).map((v) => (
                  <div key={v.cle} className={TUILE + " border-ds-filet"}>
                    <span className="mb-[7px] block text-[12px] text-ds-texte-sourdine">{t(`fiche.${v.cle}`)}</span>
                    <span className={CHIFFRE + " text-ds-texte-fort"}>{v.valeur}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* --- LES PLAFONDS --- */}
            <section className={PANNEAU} aria-label={t("fiche.plafonds")}>
              <h2 className={PANNEAU_TITRE + " mb-[18px]"}>{t("fiche.plafonds")}</h2>
              <div className="flex flex-col gap-4">
                <div>
                  <div className="mb-[7px] flex flex-wrap justify-between gap-2">
                    <span
                      className={
                        "text-[14px] font-semibold " + (colisAuDessus ? "text-ds-erreur" : "text-ds-texte-fort")
                      }
                    >
                      {t("fiche.plafondColis")}
                    </span>
                    <span
                      className={
                        "text-[14px] " + (colisAuDessus ? "font-bold text-ds-erreur" : "text-ds-texte-sourdine")
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
                    <p className="mt-[7px] text-[12px] leading-[1.5] text-ds-erreur">
                      {t("fiche.depassementColis", {
                        ecart: format.number(fiche.colisCeMois - seuils.colis),
                      })}
                    </p>
                  ) : null}
                </div>

                <div>
                  <div className="mb-[7px] flex flex-wrap justify-between gap-2">
                    <span className="text-[14px] font-semibold text-ds-texte-fort">
                      {t("fiche.plafondCommandes")}
                    </span>
                    <span className="text-[14px] text-ds-texte-sourdine">
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
            <section className={PANNEAU} aria-label={t("fiche.activite")}>
              <div className="mb-[18px]">
                <h2 className={PANNEAU_TITRE}>{t("fiche.activite")}</h2>
                <p className="mt-[3px] text-[13px] leading-[1.55] text-ds-texte-corps">{t("fiche.activiteAide")}</p>
              </div>

              {fiche.activite.length === 0 ? (
                <p className="text-[14px] text-ds-texte-corps">{t("fiche.activiteVide")}</p>
              ) : (
                <ul className="flex flex-col gap-[13px]">
                  {fiche.activite.map((a) => (
                    <li key={a.type + a.jour} className="flex items-center gap-3">
                      <span aria-hidden="true" className="h-[7px] w-[7px] shrink-0 rounded-ds-pill bg-ds-accent" />
                      <span className="min-w-0 flex-1 text-[14px] text-ds-texte-fort">
                        {/* ⚠️ L'ACCORD EST DANS LE LIBELLÉ, PAS AUTOUR. La phrase
                            était « {n} {quoi} » avec un libellé toujours au
                            pluriel : la fiche écrivait « 1 modifications de
                            commande ». Chaque événement porte désormais son
                            singulier et son pluriel. */}
                        {t.has(`fiche.evenement.${a.type}`)
                          ? t(`fiche.evenement.${a.type}`, { n: a.n })
                          : `${format.number(a.n)} ${a.type}`}
                      </span>
                      <span className="shrink-0 text-[13px] text-ds-texte-sourdine">
                        {format.dateTime(new Date(a.jour), { dateStyle: "medium" })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* ================= COLONNE DE DROITE ================= */}
          <div className="flex min-w-0 flex-col gap-4">
            {/* LE GESTE DE L'ÉCRAN VIENT EN PREMIER, dans un panneau qui porte son
                titre et ce que le geste fait AVANT qu'on l'ouvre. Il s'ouvre EN
                LIGNE — comme la révocation de lien de l'éditeur, et pour la même
                raison : une modale demande un piège de focus et une sortie, un
                panneau non. */}
            <section className={PANNEAU} aria-label={suspendu ? t("suspension.rouvrir") : t("suspension.ouvrir")}>
              <TraductionsClient espaces={["admin.suspension"]}>
                <DialogueSuspension
                  profilId={fiche.id}
                  email={fiche.email}
                  suspendu={suspendu}
                  motifMin={MOTIF_MIN}
                />
              </TraductionsClient>
            </section>

            <section className={PANNEAU} aria-label={t("fiche.identite")}>
              <h2 className={PANNEAU_TITRE + " mb-[18px]"}>{t("fiche.identite")}</h2>
              <dl className="flex flex-col">
                {(
                  [
                    { cle: "email", valeur: fiche.email },
                    { cle: "type", valeur: typeLisible },
                    { cle: "role", valeur: t(`comptes.roles.${fiche.role}`) },
                    {
                      cle: "langue",
                      valeur: t.has(`langues.${fiche.langue}`) ? t(`langues.${fiche.langue}`) : fiche.langue,
                    },
                  ] as const
                ).map((l, i) => (
                  <div key={l.cle} className={LIGNE + (i === 0 ? " border-t-0 pt-0" : "")}>
                    <dt className={ETIQUETTE}>{t(`fiche.${l.cle}`)}</dt>
                    <dd className={VALEUR + " min-w-0 break-all"}>{l.valeur}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className={PANNEAU} aria-label={t("fiche.boutique")}>
              <h2 className={PANNEAU_TITRE + " mb-[18px]"}>{t("fiche.boutique")}</h2>

              <div className="mb-3.5 flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="h-11 w-11 shrink-0 rounded-ds-control"
                  style={{ backgroundColor: fiche.accent ?? "var(--color-ds-accent)" }}
                />
                <div className="min-w-0">
                  <span className="block truncate text-[15px] font-bold text-ds-texte-fort">
                    {fiche.boutique ?? t("fiche.boutiqueNonConfiguree")}
                  </span>
                  {/* LA VALEUR EXACTE, EN CHASSE FIXE. Un aplat de couleur ne se
                      recopie pas dans un message ; un code hexadécimal, si. */}
                  <span className="mt-px block font-mono text-[13px] text-ds-texte-sourdine">
                    {fiche.accent ?? t("fiche.boutiqueNonConfiguree")}
                  </span>
                </div>
              </div>

              <div className={LIGNE}>
                <span className={ETIQUETTE}>{t("fiche.filigrane")}</span>
                <span className={VALEUR}>{fiche.filigrane ? t("fiche.active") : t("fiche.inactive")}</span>
              </div>
              <div className={LIGNE}>
                <span className={ETIQUETTE}>{t("fiche.reseaux")}</span>
                {/* UNE ABSENCE EST NOMMÉE, pas remplacée par un tiret : « aucun »
                    se lit, « — » se devine. */}
                <span className={VALEUR}>
                  {fiche.reseaux.length === 0
                    ? t("fiche.reseauxAucun")
                    : fiche.reseaux.map((r) => (tMarque.has(`reseau.${r}`) ? tMarque(`reseau.${r}`) : r)).join(", ")}
                </span>
              </div>
            </section>

            {/* --- CE QUE CETTE PAGE NE PERMET PAS --- */}
            <section
              className="rounded-ds-card-lg border border-ds-filet bg-ds-surface-creux p-4 md:p-[22px]"
              aria-label={t("fiche.interdits")}
            >
              <h2 className={PANNEAU_TITRE + " mb-3.5"}>{t("fiche.interdits")}</h2>
              <ul className="flex flex-col gap-3">
                {(["suppression", "usurpation", "commandes"] as const).map((cle) => (
                  <li key={cle} className="text-[13px] leading-[1.55] text-ds-texte-corps">
                    <strong className="font-bold text-ds-texte-fort">{t(`fiche.interdit.${cle}.quoi`)}</strong>{" "}
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
