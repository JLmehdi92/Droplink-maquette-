import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getFormateur } from "@/lib/format/formateur";
import type { Metadata } from "next";
import { DialogueSuspension } from "@/components/admin/dialogue-suspension";
import { EncartTrace } from "@/components/admin/encart-trace";
import { PlanCompte } from "@/components/admin/plan-compte";
import { ArrowLeft, Ban, Crown } from "lucide-react";
import { EnTeteAdmin } from "@/components/admin/en-tete-admin";
import { AvatarCompte } from "@/components/admin/briques-admin";
import { TraductionsClient } from "@/components/traductions-client";
import { exigerAdmin } from "@/lib/audit/garde";
import { empreinteAdmin } from "@/lib/audit/empreinte-admin";
import { lireCompte } from "@/lib/audit/comptes";
import { lireSeuils } from "@/lib/audit/panneau";
import { lirePlanCompte } from "@/lib/audit/plan";
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
  const [fiche, seuils, plan] = await Promise.all([
    lireCompte(supabase, id, await empreinteAdmin()),
    lireSeuils(supabase),
    lirePlanCompte(supabase, id),
  ]);

  // Un identifiant absent rend 404, comme une adresse inexistante. La
  // consultation a néanmoins été tracée : c'est le geste qu'on voudrait
  // retrouver, pas son résultat.
  if (fiche === null) notFound();

  const t = await getTranslations("admin");
  const tMarque = await getTranslations("marque");
  const format = await getFormateur();

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
  const quota = fiche.quotaCommandes;

  return (
    <main id="contenu" className="tableau adm">
      {/* LE TITRE EST NEUTRE, jamais l'adresse du compte : l'onglet du navigateur
          et l'historique ne doivent pas nommer un vendeur. Le retour est un LIEN,
          pas `history.back()` : on arrive souvent ici depuis une recherche. */}
      <EnTeteAdmin
        titre={t("fiche.titre")}
        sousTitre=""
        fil={[{ href: `/${langue}/admin/comptes`, libelle: t("comptes.titre") }, { libelle: t("fiche.titre") }]}
      >
        <Link prefetch={false} className="bouton-outil" href={`/${langue}/admin/comptes`}>
          <ArrowLeft aria-hidden="true" className="ic" />
          {t("fiche.retour")}
        </Link>
      </EnTeteAdmin>
      <EncartTrace texte={t("fiche.trace")} />

      <article className="adm-fiche">
        <header className="adm-fiche__tete">
          <AvatarCompte email={fiche.email} nom={fiche.boutique} />
          <div>
            <h2>{fiche.email}</h2>
            <p>
              {/* Comme la maquette (`admin-compte.html`) : le type et l'inscription, ici,
                  au téléphone comme au bureau — la date ne vivait que dans le sous-titre,
                  masqué sous 768 px (audit final du 03/10/2026). */}
              {t("fiche.typeInscrit", {
                type: typeLisible,
                // « 14 juin 2026 » comme toutes les dates de la fiche dans la maquette : mois court.
                date: format.dateTime(new Date(fiche.creeLe), { day: "numeric", month: "short", year: "numeric" }),
              })}
            </p>
          </div>
          <div className="adm-fiche__etats">
            <span className="adm-badge" data-statut={fiche.statut}>
              <i aria-hidden="true" />
              {t(`comptes.statuts.${fiche.statut}`)}
            </span>
            {plan.statut === "ok" ? (
              <span className="adm-plan" data-plan={plan.plan}>
                {plan.plan === "pro" ? <Crown aria-hidden="true" className="ic" /> : null}
                {t(`plan.plans.${plan.plan}`)}
              </span>
            ) : null}
          </div>
        </header>

        <div className="adm-rangee adm-rangee--3">
          <section className="bloc adm-bloc" aria-labelledby="fiche-identite">
            <header className="bloc__tete">
              <div>
                <h2 id="fiche-identite">{t("fiche.identite")}</h2>
              </div>
            </header>
            <dl className="adm-dl">
              <div>
                <dt>{t("fiche.email")}</dt>
                <dd>{fiche.email}</dd>
              </div>
              <div>
                <dt>{t("fiche.type")}</dt>
                <dd>{typeLisible}</dd>
              </div>
              <div>
                <dt>{t("fiche.role")}</dt>
                <dd>{t(`comptes.roles.${fiche.role}`)}</dd>
              </div>
              <div>
                <dt>{t("fiche.boutique")}</dt>
                <dd>{fiche.boutique ?? t("fiche.boutiqueNonConfiguree")}</dd>
              </div>
              {/* LA COULEUR DU VENDEUR, en aplat ET en valeur exacte : un aplat ne
                  se recopie pas dans un message, un code hexadécimal si. */}
              <div>
                <dt>{t("fiche.couleur")}</dt>
                <dd className="inline-flex items-center justify-end gap-2 font-mono">
                  {fiche.accent === null ? (
                    t("fiche.boutiqueNonConfiguree")
                  ) : (
                    <>
                      <span aria-hidden="true" className="inline-block h-4 w-4 rounded-[5px]" style={{ backgroundColor: fiche.accent }} />
                      {fiche.accent}
                    </>
                  )}
                </dd>
              </div>
              <div>
                <dt>{t("fiche.langue")}</dt>
                <dd>{t.has(`langues.${fiche.langue}`) ? t(`langues.${fiche.langue}`) : fiche.langue}</dd>
              </div>
              <div>
                <dt>{t("fiche.filigrane")}</dt>
                <dd>{fiche.filigrane ? t("fiche.active") : t("fiche.inactive")}</dd>
              </div>
              {/* UNE ABSENCE EST NOMMÉE : « aucun » se lit, « — » se devine. */}
              <div>
                <dt>{t("fiche.reseaux")}</dt>
                <dd>
                  {fiche.reseaux.length === 0
                    ? t("fiche.reseauxAucun")
                    : fiche.reseaux.map((r) => (tMarque.has(`reseau.${r}`) ? tMarque(`reseau.${r}`) : r)).join(", ")}
                </dd>
              </div>
            </dl>
          </section>

          <section className="bloc adm-bloc" aria-labelledby="fiche-volumes">
            <header className="bloc__tete">
              <div>
                <h2 id="fiche-volumes">{t("fiche.volumes")}</h2>
              </div>
            </header>
            <dl className="adm-dl">
              <div>
                <dt>{t("fiche.commandes")}</dt>
                <dd>{format.number(fiche.commandes)}</dd>
              </div>
              {/* LE SEUL POSTE FACTURÉ EST DIT COMME TEL. */}
              <div>
                <dt>
                  {t("fiche.colis")} <span className="adm-facture">{t("panneau.facture")}</span>
                </dt>
                <dd>{format.number(fiche.colisCeMois)}</dd>
              </div>
              <div>
                <dt>{t("fiche.medias")}</dt>
                <dd>{format.number(fiche.medias)}</dd>
              </div>
              <div>
                <dt>{t("fiche.stockage")}</dt>
                <dd>
                  {t("panneau.stockageValeur", {
                    valeur: format.number(taille.valeur, {
                      minimumFractionDigits: taille.decimales,
                      maximumFractionDigits: taille.decimales,
                    }),
                    unite: t(`unites.${taille.unite}`),
                  })}
                </dd>
              </div>
            </dl>
          </section>

          <section className="bloc adm-bloc" aria-labelledby="fiche-plafonds">
            <header className="bloc__tete">
              <div>
                <h2 id="fiche-plafonds">{t("fiche.plafonds")}</h2>
              </div>
            </header>
            <div className="adm-plafonds">
              <div className={"adm-plafond" + (colisAuDessus ? " est-depasse" : "")}>
                <p>
                  <span>{t("fiche.plafondColis")}</span>
                  <b>{t("fiche.surPlafond", { valeur: format.number(fiche.colisCeMois), plafond: format.number(seuils.colis) })}</b>
                </p>
                <i aria-hidden="true" style={{ "--k": Math.min(1, fiche.colisCeMois / Math.max(seuils.colis, 1)).toFixed(3) } as React.CSSProperties} />
                {/* LE DÉPASSEMENT PORTE SON CHIFFRE : « dépassé de 640 » se vérifie. */}
                {colisAuDessus ? <small>{t("fiche.depassementColis", { ecart: format.number(fiche.colisCeMois - seuils.colis) })}</small> : null}
              </div>
              {/* LE QUOTA À LA RÈGLE DU PLAN (200), lu là où il BLOQUE : à vie en
                  gratuit, ce mois-ci en Pro. */}
              {quota === null ? null : (
                <div className={"adm-plafond" + (quota.utilise >= quota.plafond ? " est-plein" : "")}>
                  <p>
                    <span>{t(fiche.plan === "gratuit" ? "fiche.quotaAVie" : "fiche.quotaMoisPro")}</span>
                    <b>{t("fiche.surPlafond", { valeur: format.number(quota.utilise), plafond: format.number(quota.plafond) })}</b>
                  </p>
                  <i aria-hidden="true" style={{ "--k": Math.min(1, quota.utilise / Math.max(quota.plafond, 1)).toFixed(3) } as React.CSSProperties} />
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="adm-rangee adm-rangee--2">
          {/* CE QUE CE COMPTE A FAIT : agrégé par type et par jour, jamais un
              contenu. L'accord est dans le libellé (« 1 commande créée »). */}
          <section className="bloc adm-bloc" aria-labelledby="fiche-activite">
            <header className="bloc__tete">
              <div>
                <h2 id="fiche-activite">{t("fiche.activite")}</h2>
                <p className="adm-aide">{t("fiche.activiteAide")}</p>
              </div>
            </header>
            {fiche.activite.length === 0 ? (
              <p className="adm-texte pb-4">{t("fiche.activiteVide")}</p>
            ) : (
              <dl className="adm-dl">
                {fiche.activite.map((a) => (
                  <div key={a.type + a.jour}>
                    <dt>{t.has(`fiche.evenement.${a.type}`) ? t(`fiche.evenement.${a.type}`, { n: a.n }) : `${format.number(a.n)} ${a.type}`}</dt>
                    <dd className="font-normal text-[var(--corps)]">{format.dateTime(new Date(a.jour), { dateStyle: "medium" })}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>

          <div className="adm-colonne">
            {/* LES DEUX GESTES DE LA FICHE, tous deux avec motif, dans des
                dialogues modaux. `key` : un motif tapé pour un compte ne survit
                pas à une navigation vers un autre. */}
            <TraductionsClient espaces={["admin.plan", "admin.dialogue"]}>
              <PlanCompte key={fiche.id} profilId={fiche.id} plan={plan.statut === "ok" ? plan.plan : null} motifMin={MOTIF_MIN} />
            </TraductionsClient>
            <TraductionsClient espaces={["admin.suspension", "admin.dialogue"]}>
              <DialogueSuspension key={fiche.id} profilId={fiche.id} email={fiche.email} suspendu={suspendu} motifMin={MOTIF_MIN} />
            </TraductionsClient>
            <section className="bloc adm-bloc" aria-labelledby="fiche-interdits">
              <header className="bloc__tete">
                <div>
                  <h2 id="fiche-interdits">{t("fiche.interdits")}</h2>
                </div>
              </header>
              <ul className="adm-interdits">
                {(["suppression", "usurpation", "commandes"] as const).map((cle) => (
                  <li key={cle}>
                    <Ban aria-hidden="true" className="ic" />
                    <p>
                      <b>{t(`fiche.interdit.${cle}.quoi`)}</b>
                      <span>{t(`fiche.interdit.${cle}.pourquoi`)}</span>
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </article>
    </main>
  );
}
