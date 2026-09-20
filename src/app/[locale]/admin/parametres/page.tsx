import {
  getFormatter,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";
import type { Metadata } from "next";
import { CarteReglages } from "@/components/admin/carte-reglages";
import type { LucideIcon } from "lucide-react";
import { Gauge, Lock, Timer, ToggleRight, Truck } from "lucide-react";
import { EnTeteAdmin } from "@/components/admin/en-tete-admin";
import { RangeeConstatee, type FormeConstatee } from "@/components/admin/rangee-constatee";
import { ReglageInterrupteur } from "@/components/admin/reglage-interrupteur";
import { ReglageNombre } from "@/components/admin/reglage-nombre";
import { TraductionsClient } from "@/components/traductions-client";
import { exigerAdmin } from "@/lib/audit/garde";
import { lireParametres, type ParametreAffiche } from "@/lib/audit/parametres";
import { detailsConstates, reglagesConstates } from "@/lib/audit/reglages-constates";
import { creerClientServeur } from "@/lib/supabase/server";
import { estLangueSupportee } from "@/i18n/config";

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
  return {
    title: t("parametres.titre"),
    robots: { index: false, follow: false },
  };
}

/**
 * LES PARAMÈTRES SYSTÈME, portés sur leur planche.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LA DÉCISION QUI STRUCTURE TOUT L'ÉCRAN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * La planche dessine QUATORZE réglages ; le produit n'en lisait que trois
 * depuis `system_settings`. La conformité au dessin aurait donc pu s'obtenir en
 * ouvrant les onze autres à l'écriture — et c'est exactement le défaut que
 * `lib/audit/parametres.ts` existe pour empêcher : une clé qu'aucun chemin de
 * code ne lit produit une ligne, une trace et un affichage parfaitement
 * crédibles, et ne substitue rien. Une valeur qui a la FORME d'une
 * configuration franchit toutes les validations de présence.
 *
 * L'écran rend donc les quatorze rangées, dans TROIS états qui ne se
 * confondent pas :
 *
 *   MODIFIABLE — cinq réglages de l'inventaire clos, écrits en base, tracés par
 *                un déclencheur avec l'ancienne ET la nouvelle valeur.
 *   CONSTATÉ   — huit valeurs que le produit applique vraiment, lues À LEUR
 *                SOURCE et non recopiées, mais qui se changent ailleurs :
 *                variable d'environnement, ou module pur du suivi qu'on ne peut
 *                pas faire dépendre de la base sans détruire ce qui le rend
 *                éprouvable hors réseau.
 *   ABSENT     — un plafond que RIEN n'applique. Nommé plutôt qu'omis :
 *                l'omettre ferait croire qu'il n'y a rien à surveiller,
 *                l'inventer ferait croire à un garde. C'est la règle du brief
 *                pour l'administration, l'inverse exact de la page publique.
 *
 * DEUX INTERRUPTEURS SONT NÉS AVEC CET ÉCRAN (migration 117) parce que la
 * planche les dessine et qu'ils coupent deux choses réelles : la facturation à
 * la prise en charge, et la porte d'entrée. Le troisième que la planche dessine
 * — les notifications par email — reste ÉTEINT ET NON CLIQUABLE : rien ne les
 * envoie encore, et rendre cliquable ce qui ne pilote rien est la façon la plus
 * courante de faire croire qu'un réglage existe.
 *
 * AUCUN SECRET NE PASSE PAR CET ÉCRAN. Clés d'API, secret du planificateur, clé
 * service-role restent dans l'environnement. Une valeur en base est lisible par
 * quiconque accède à la base — acceptable pour un seuil, jamais pour une clé.
 */

/** L'ordre des rangées EST celui de la planche. */
type Rangee =
  | { readonly genre: "reglage"; readonly cle: string }
  // `sansAide` reproduit la planche : les trois rangées de débit n'y portent
  // qu'un titre. Une glose sous « Jeton inconnu » n'apprendrait rien et ferait
  // de la carte un mur de texte.
  | { readonly genre: "constate"; readonly id: string; readonly sansAide?: true }
  | { readonly genre: "absent"; readonly id: string }
  | { readonly genre: "eteint"; readonly id: string };

/*
 * L ICÔNE DE CHAQUE CARTE, comme le kit en pose une. Elle ne porte AUCUNE
 * information — le titre juste à côté dit tout — et elle est `aria-hidden` :
 * c est un repère de balayage entre quatre cartes qui se ressemblent, rien de
 * plus.
 */
const CARTES: readonly {
  readonly id: string;
  readonly colonne: "gauche" | "droite";
  readonly icone: LucideIcon;
  readonly rangees: readonly Rangee[];
}[] = [
  {
    id: "plafonds",
    colonne: "gauche",
    icone: Gauge,
    rangees: [
      /*
       * LES DEUX QUOTAS, ET ILS NE MESURENT PAS LA MÊME CHOSE. Le premier
       * s'applique aux comptes GRATUITS et compte toute leur vie ; le second
       * aux comptes PRO et compte le mois. Les montrer côte à côte est
       * délibéré : c'est la seule façon de voir qu'un vendeur n'est jamais
       * soumis aux deux, et lequel des deux on est en train de changer.
       */
      { genre: "reglage", cle: "plafond_commandes_gratuit_a_vie" },
      { genre: "reglage", cle: "plafond_commandes_mensuel" },
      { genre: "absent", id: "stockage_par_compte" },
      { genre: "constate", id: "medias_par_commande" },
      { genre: "constate", id: "poids_video" },
    ],
  },
  {
    id: "suivi",
    colonne: "gauche",
    icone: Truck,
    rangees: [
      { genre: "reglage", cle: "seuil_colis_par_compte" },
      /*
       * LE BUDGET DE SUIVI — ÉCART ASSUMÉ, comme le retard du veilleur juste
       * plus bas : la planche ne le dessine pas.
       *
       * Il est ici parce que c'est le SEUL budget du produit qui ne se recharge
       * pas — 200 prises en charge à vie, pour tous les comptes réunis — et
       * qu'aucun plafond par compte ne peut le voir. Le laisser sans écran
       * ferait d'un nombre décisif une valeur qu'il faut une migration pour
       * corriger le jour où le palier change.
       */
      { genre: "reglage", cle: "budget_suivi_total" },
      /*
       * LE DECALAGE, juste sous le budget, et jamais ailleurs : les deux ne se
       * lisent QUE l'un a cote de l'autre. Seul, « deja consomme » n'a aucun
       * sens ; a cote du total, il dit pourquoi notre compte et celui du
       * fournisseur ne coincident pas.
       */
      { genre: "reglage", cle: "budget_suivi_deja_consomme" },
      { genre: "constate", id: "silence_jours" },
      { genre: "constate", id: "abandon_jours" },
      { genre: "constate", id: "purge_jours" },
      // ÉCART ASSUMÉ : la planche ne dessine pas ce réglage. Le retirer le
      // rendrait inatteignable alors qu'il est modifiable et qu'il pilote une
      // alerte — un réglage réel sans écran est pire qu'un écran sans réglage.
      { genre: "reglage", cle: "retard_veilleur_minutes" },
    ],
  },
  {
    id: "debit",
    colonne: "droite",
    icone: Timer,
    rangees: [
      { genre: "constate", id: "debit_inconnu", sansAide: true },
      { genre: "constate", id: "debit_valide", sansAide: true },
      { genre: "constate", id: "debit_depot", sansAide: true },
    ],
  },
  {
    id: "interrupteurs",
    colonne: "droite",
    icone: ToggleRight,
    rangees: [
      { genre: "reglage", cle: "inscriptions_ouvertes" },
      { genre: "reglage", cle: "suivi_actif" },
      { genre: "eteint", id: "notifications_email" },
    ],
  },
];

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

  const parCle = new Map<string, ParametreAffiche>(parametres.map((p) => [p.cle, p]));
  const constates = new Map(reglagesConstates().map((r) => [r.id, r]));
  const details = detailsConstates();

  /*
   * L'ORIGINE EST COMPOSÉE CÔTÉ SERVEUR : la date y prend la même locale que le
   * reste de l'écran, et le catalogue de traduction ne part pas dans le
   * navigateur pour trois phrases.
   */
  const origineDe = (p: ParametreAffiche): string =>
    !p.ecrit
      ? t("origine.jamaisDecide")
      : p.modifiePar === null
        ? t("origine.auteurParti", { date: format.dateTime(new Date(p.modifieLe ?? 0), "long") })
        : t("origine.decide", {
            date: format.dateTime(new Date(p.modifieLe ?? 0), "long"),
            email: p.modifiePar,
          });

  const rendreRangee = (r: Rangee) => {
    if (r.genre === "reglage") {
      const p = parCle.get(r.cle);
      // UNE CLÉ ABSENTE DE L'INVENTAIRE NE REND RIEN, elle n'invente pas une
      // rangée vide : la seule façon d'arriver ici est d'avoir retiré le réglage
      // de `PARAMETRES` sans toucher à cet écran, et une rangée fantôme le
      // masquerait exactement au moment où il faudrait le voir.
      if (p === undefined) return null;
      return p.nature === "interrupteur" ? (
        <ReglageInterrupteur
          key={p.cle}
          reglage={{
            cle: p.cle,
            actif: p.valeur !== 0,
            ecrit: p.ecrit,
            origine: origineDe(p),
          }}
        />
      ) : (
        <ReglageNombre
          key={p.cle}
          reglage={{
            cle: p.cle,
            valeur: p.valeur,
            defaut: p.defaut,
            min: p.min,
            max: p.max,
            ecrit: p.ecrit,
            origine: origineDe(p),
          }}
        />
      );
    }

    if (r.genre === "constate") {
      const c = constates.get(r.id);
      if (c === undefined) return null;
      return (
        <RangeeConstatee
          key={r.id}
          titre={t("constate." + r.id + ".titre")}
          {...(r.sansAide === true
            ? {}
            : {
                aide: t("constate." + r.id + ".aide", {
                  videos: details.videosParCommande ?? 0,
                  interrogations: details.interrogationsVides ?? 0,
                }),
              })}
          etat={{ forme: "valeur", valeur: format.number(c.valeur) }}
        />
      );
    }

    const etat: FormeConstatee =
      r.genre === "absent" ? { forme: "absent", mention: t("aucunPlafond") } : { forme: "eteint" };
    return (
      <RangeeConstatee
        key={r.id}
        titre={t("constate." + r.id + ".titre")}
        aide={t("constate." + r.id + ".aide", { videos: 0, interrogations: 0 })}
        etat={etat}
      />
    );
  };

  const cartesDe = (cote: "gauche" | "droite") =>
    CARTES.filter((c) => c.colonne === cote).map((c) => (
      <CarteReglages
        key={c.id}
        titre={t("carte." + c.id + ".titre")}
        sousTitre={t("carte." + c.id + ".sousTitre")}
        icone={c.icone}
      >
        {c.rangees.map(rendreRangee)}
      </CarteReglages>
    ));

  return (
    <main id="contenu" className="md:px-8 md:pt-0 md:pb-8">
      <EnTeteAdmin titre={t("titre")} sousTitre={t("sousTitre")} />

      {/* ⚠️ SANS CE PROVIDER, L'ÉCRAN LÈVE AU RENDU. Les deux composants de
          réglage sont CLIENTS et appellent `useTranslations` ; la racine
          `[locale]` n'a délibérément aucun provider — le catalogue entier ne
          part pas dans chaque page. Il manquait ici, l'écran des paramètres
          était cassé, et aucune sonde ne pouvait le voir puisque `pnpm fumee`
          n'interroge que les pages atteignables SANS session. */}
      <TraductionsClient espaces={["admin.parametres"]}>
        {/* LES CARTES SONT RÉPARTIES EXPLICITEMENT, deux à gauche et trois à
            droite, parce que c'est ce qui aligne leurs bas sur la planche. Une
            grille qui répartirait par ordre d'apparition laisserait une colonne
            dépasser de la hauteur d'une carte entière. */}
        <div className="grid grid-cols-1 gap-4 px-4 py-3.5 md:mt-5 md:px-0 md:py-0 xl:grid-cols-2 xl:items-start">
          <div className="flex flex-col gap-4">{cartesDe("gauche")}</div>
          <div className="flex flex-col gap-4">
            {cartesDe("droite")}

            {/* CE QUI N'EST PAS ICI EST DIT, plutôt que laissé à deviner. Un
                écran de paramètres muet sur les secrets laisse chercher où les
                régler — et la recherche finit par une clé collée quelque part. */}
            <section className="flex gap-3 rounded-ds-card border border-ds-filet bg-ds-surface-teinte p-4 md:rounded-ds-card-lg md:p-[22px]">
              <Lock size={18} strokeWidth={1.9} aria-hidden="true" className="mt-px shrink-0 text-ds-accent-encre" />
              <div>
                <p className="text-[14px] font-bold leading-[18px] text-ds-accent-encre">
                  {t("secretsTitre")}
                </p>
                <p className="mt-1 text-[13px] leading-[20px] text-ds-accent-encre">
                  {t("secretsAide")}
                </p>
              </div>
            </section>
          </div>
        </div>
      </TraductionsClient>
    </main>
  );
}
