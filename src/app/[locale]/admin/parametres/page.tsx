import { getTranslations, setRequestLocale } from "next-intl/server";
import { getFormateur } from "@/lib/format/formateur";
import type { Metadata } from "next";
import { CarteReglages } from "@/components/admin/carte-reglages";
import { KeyRound } from "lucide-react";
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
 * L'ancienne planche dessinait QUATORZE réglages ; le produit n'en lisait que trois
 * depuis `system_settings`. La conformité au dessin aurait donc pu s'obtenir en
 * ouvrant les onze autres à l'écriture — et c'est exactement le défaut que
 * `lib/audit/parametres.ts` existe pour empêcher : une clé qu'aucun chemin de
 * code ne lit produit une ligne, une trace et un affichage parfaitement
 * crédibles, et ne substitue rien. Une valeur qui a la FORME d'une
 * configuration franchit toutes les validations de présence.
 *
 * L'écran rend donc ses rangées (dix-sept le 03/10/2026), dans TROIS états qui ne
 * se confondent pas :
 *
 *   MODIFIABLE — huit réglages de l'inventaire clos, écrits en base, tracés par
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
 * la prise en charge, et la porte d'entrée. La rangée « Notifications par email —
 * rien n'est envoyé » est RETIRÉE (audit final du 03/10/2026) : la maquette ne la
 * dessine plus, et elle était fausse depuis les e-mails de suivi (188-189).
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
  | { readonly genre: "absent"; readonly id: string };

/*
 * L ICÔNE DE CHAQUE CARTE, comme le kit en pose une. Elle ne porte AUCUNE
 * information — le titre juste à côté dit tout — et elle est `aria-hidden` :
 * c est un repère de balayage entre quatre cartes qui se ressemblent, rien de
 * plus.
 */
const CARTES: readonly {
  readonly id: string;
  /**
   * LA RANGÉE DE LA MAQUETTE (`admin-parametres.html`, contre-audit du 03/10/2026) :
   * Plafonds | Suivi, puis Interrupteurs | Débit, puis « Constaté, changé au
   * déploiement » sur toute la largeur — les valeurs qu'aucun écran ne change.
   */
  readonly rangee: 1 | 2 | 3;
  readonly rangees: readonly Rangee[];
}[] = [
  {
    id: "plafonds",
    rangee: 1,
    rangees: [
      /*
       * LES DEUX QUOTAS, ET ILS NE MESURENT PAS LA MÊME CHOSE. Le premier
       * s'applique aux comptes PRO et compte le mois ; le second aux comptes
       * GRATUITS et compte toute leur vie. Les montrer côte à côte est
       * délibéré : c'est la seule façon de voir qu'un vendeur n'est jamais
       * soumis aux deux, et lequel des deux on est en train de changer.
       */
      { genre: "reglage", cle: "plafond_commandes_mensuel" },
      { genre: "reglage", cle: "plafond_commandes_gratuit_a_vie" },
    ],
  },
  {
    id: "suivi",
    rangee: 1,
    rangees: [
      /*
       * LE BUDGET DE SUIVI — c'est le SEUL budget du produit qui ne se recharge
       * pas, pour tous les comptes réunis, et aucun plafond par compte ne peut
       * le voir. Le laisser sans écran ferait d'un nombre décisif une valeur
       * qu'il faut une migration pour corriger le jour où le palier change.
       */
      { genre: "reglage", cle: "budget_suivi_total" },
      /*
       * LE DECALAGE, juste sous le budget, et jamais ailleurs : les deux ne se
       * lisent QUE l'un a cote de l'autre. Seul, « deja consomme » n'a aucun
       * sens ; a cote du total, il dit pourquoi notre compte et celui du
       * fournisseur ne coincident pas.
       */
      { genre: "reglage", cle: "budget_suivi_deja_consomme" },
      { genre: "reglage", cle: "seuil_colis_par_compte" },
      { genre: "reglage", cle: "retard_veilleur_minutes" },
    ],
  },
  {
    id: "interrupteurs",
    rangee: 2,
    rangees: [
      { genre: "reglage", cle: "inscriptions_ouvertes" },
      { genre: "reglage", cle: "suivi_actif" },
    ],
  },
  {
    id: "debit",
    rangee: 2,
    rangees: [
      { genre: "constate", id: "debit_inconnu", sansAide: true },
      { genre: "constate", id: "debit_valide", sansAide: true },
      { genre: "constate", id: "debit_depot", sansAide: true },
    ],
  },
  {
    // L'abandon du suivi (`abandon_jours`) n'est pas dessiné par la maquette : c'est une
    // valeur réelle du produit, constatée comme les autres, et elle reste dite.
    id: "constate",
    rangee: 3,
    rangees: [
      { genre: "absent", id: "stockage_par_compte" },
      { genre: "constate", id: "medias_par_commande" },
      { genre: "constate", id: "poids_video" },
      { genre: "constate", id: "silence_jours" },
      { genre: "constate", id: "abandon_jours" },
      { genre: "constate", id: "purge_jours" },
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
  const format = await getFormateur();

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
        ? t("origine.auteurParti", { date: format.dateTime(new Date(p.modifieLe ?? 0), "origine") })
        : t("origine.decide", {
            date: format.dateTime(new Date(p.modifieLe ?? 0), "origine"),
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
          // L'UNITÉ FAIT PARTIE DE LA VALEUR (« 20 / min », « 20 Mo », « 10 jours »), comme la
          // maquette — un nombre nu ne dit pas ce qu'il borne (audit final du 03/10/2026).
          etat={{ forme: "valeur", valeur: c.unite === "nombre" ? format.number(c.valeur) : t("unite." + c.unite, { n: c.valeur }) }}
        />
      );
    }

    const etat: FormeConstatee = { forme: "absent", mention: t("aucunPlafond") };
    return (
      <RangeeConstatee
        key={r.id}
        titre={t("constate." + r.id + ".titre")}
        aide={t("constate." + r.id + ".aide", { videos: 0, interrogations: 0 })}
        etat={etat}
      />
    );
  };

  const cartesDe = (rangee: 1 | 2 | 3) =>
    CARTES.filter((c) => c.rangee === rangee).map((c) => (
      <CarteReglages
        key={c.id}
        id={c.id}
        titre={t("carte." + c.id + ".titre")}
        sousTitre={t("carte." + c.id + ".sousTitre")}
      >
        {/* La carte pleine largeur range ses valeurs sur deux colonnes, comme la maquette. */}
        {rangee === 3 ? <div className="adm-constates">{c.rangees.map(rendreRangee)}</div> : c.rangees.map(rendreRangee)}
      </CarteReglages>
    ));

  return (
    <main id="contenu" className="tableau adm">
      <EnTeteAdmin titre={t("titre")} sousTitre={t("sousTitre")} />
      {/* ⚠️ SANS CE PROVIDER, L'ÉCRAN LÈVE AU RENDU : les deux composants de
          réglage sont CLIENTS et appellent `useTranslations`. */}
      <TraductionsClient espaces={["admin.parametres"]}>
        <div className="adm-rangee adm-rangee--2">{cartesDe(1)}</div>
        <div className="adm-rangee adm-rangee--2">{cartesDe(2)}</div>
        {cartesDe(3)}
      </TraductionsClient>
      {/* CE QUI N'EST PAS ICI EST DIT, plutôt que laissé à deviner : un écran de
          paramètres muet sur les secrets laisse chercher où les régler. */}
      <p className="adm-garantie">
        <KeyRound aria-hidden="true" className="ic" />
        <span>
          <b>{t("secretsTitre")}</b> {t("secretsAide")}
        </span>
      </p>
    </main>
  );
}
