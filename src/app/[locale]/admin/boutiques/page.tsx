import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { EnTeteAdmin } from "@/components/admin/en-tete-admin";
import { EncartTrace } from "@/components/admin/encart-trace";
import { RechercheAdmin } from "@/components/admin/recherche-admin";
import { exigerAdmin } from "@/lib/audit/garde";
import { empreinteAdmin } from "@/lib/audit/empreinte-admin";
import {
  listerBoutiques,
  ParametresBoutiques,
  TYPES_FILTRABLES,
  type LigneBoutique,
} from "@/lib/audit/boutiques";
import { lireCompteurs, lireSeuils } from "@/lib/audit/panneau";
import { mettreOctetsALEchelle } from "@/lib/format/octets";
import { creerClientServeur } from "@/lib/supabase/server";
import { estLangueSupportee } from "@/i18n/config";
import { LienEcran } from "@/components/lien-ecran";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // LA GARDE COURT AUSSI ICI : Next évalue les métadonnées EN PARALLÈLE du
  // rendu, et le titre partirait sinon dans le corps du 404 servi à qui n'a pas
  // les droits. Mémoïsée par requête, elle ne coûte rien de plus.
  await exigerAdmin();
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("boutiques.titre"), robots: { index: false, follow: false } };
}

const PILULE =
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-headline-md text-[12px] leading-[15px] font-semibold";
const PILULE_NEUTRE = PILULE + " bg-fond-neutre text-ardoise";

/**
 * LES BOUTIQUES — ce que chaque compte OCCUPE.
 *
 * CET ÉCRAN NE MONTRE AUCUN CONTENU : ni nom de client, ni référence, ni note,
 * ni média. Des volumes, un nom de boutique et une adresse — ce qui permet de
 * décider, et rien de plus. Le contenu appartient au vendeur et à ses clients.
 *
 * IL EST TRIÉ PAR STOCKAGE, DÉCROISSANT, et c'est le seul tri qui ait un sens
 * ici : le stockage est le poste de coût qui peut réellement déraper, et une
 * liste alphabétique obligerait à parcourir 218 comptes pour trouver les trois
 * qui comptent.
 *
 * ⚠️ LE STOCKAGE EST DONC AFFICHÉ, alors que la planche ne dessine que trois
 * chiffres par carte — commandes, colis, médias. Une liste triée sur un nombre
 * qu'on ne voit pas est une liste dont on ne peut pas vérifier l'ordre.
 *
 * PAGINATION PAR CURSEUR, jamais par décalage : à la page 40 d'un jeu de 9 600,
 * un `offset` lit 2 000 lignes pour en rendre 50 — le coût croît avec le numéro
 * de page, donc l'inconfort arrive chez celui qui a le plus de données.
 */
export default async function AdminBoutiques({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const langue = estLangueSupportee(locale) ? locale : "fr";
  setRequestLocale(langue);

  await exigerAdmin();

  const brut = await searchParams;
  const seul = (cle: string): string | undefined =>
    Array.isArray(brut[cle]) ? brut[cle][0] : brut[cle];

  // UN TYPE INCONNU RETOMBE SUR « AUCUN FILTRE », et l'écran le DIT : la pilule
  // « Toutes » s'allume, donc ce qui est affiché correspond à ce qui est
  // annoncé. La base, elle, REFUSE la valeur inconnue — cette garde-là ne sert
  // pas cette page, qui n'en envoie jamais, mais tout appel direct à la RPC.
  const parametres = ParametresBoutiques.parse({
    q: seul("q"),
    type: seul("type"),
    curseur: seul("curseur") ?? null,
  });

  const supabase = await creerClientServeur();
  const [page, seuils, compteurs] = await Promise.all([
    listerBoutiques(supabase, parametres, await empreinteAdmin()),
    lireSeuils(supabase),
    lireCompteurs(supabase),
  ]);

  const t = await getTranslations("admin");
  const format = await getFormatter();
  const base = `/${langue}/admin/boutiques`;

  /** L'URL d'un filtre, en conservant la recherche et en JETANT le curseur. */
  const lienFiltre = (type: string): string => {
    const params = new URLSearchParams();
    if (parametres.q !== "") params.set("q", parametres.q);
    if (type !== "") params.set("type", type);
    // ⚠️ LE CURSEUR NE SUIT PAS LE FILTRE. Il encode une position dans un
    // classement ; changer de filtre change le classement, et le reprendre
    // ouvrirait la nouvelle liste au milieu, parfois après sa fin.
    const suffixe = params.toString();
    return suffixe === "" ? base : `${base}?${suffixe}`;
  };

  const lienSuivant =
    page.curseurSuivant === null
      ? null
      : `${base}?${new URLSearchParams({
          ...(parametres.q === "" ? {} : { q: parametres.q }),
          ...(parametres.type === "" ? {} : { type: parametres.type }),
          curseur: page.curseurSuivant,
        }).toString()}`;

  const suspendue = (b: LigneBoutique): boolean => b.statut === "suspended";
  const auDessus = (b: LigneBoutique): boolean => b.colisCeMois > seuils.colis;

  return (
    <main id="contenu" className="md:px-[30px] md:py-[26px]">
      <EnTeteAdmin
        titre={t("boutiques.titre")}
        sousTitre={t("boutiques.decompte", { total: compteurs.comptes })}
        sousTitreAuBureauSeulement
      >
        <RechercheAdmin
          action={base}
          valeur={parametres.q}
          etiquette={t("boutiques.recherche")}
          exemple={t("boutiques.recherchePlaceholder")}
          chercher={t("boutiques.chercher")}
        />
      </EnTeteAdmin>

      <div className="flex flex-col gap-2.5 px-4 py-3.5 md:mt-5 md:gap-[18px] md:px-0 md:py-0">
        <EncartTrace texte={t("boutiques.trace")} />

        {/* --- LES QUATRE FILTRES ---

            DES LIENS, PAS DES BOUTONS. Le filtre courant est dans l'URL : il se
            partage, se recharge et revient avec le bouton retour. Un état client
            aurait obligé à réécrire la pagination par curseur, qui y vit déjà.

            ⚠️ ILS DÉFILENT AU TÉLÉPHONE plutôt que de passer à la ligne : quatre
            pilules sur deux rangées repoussent la première carte hors de l'écran
            d'ouverture, et le filtre est ce qu'on regarde APRÈS avoir vu qu'il y
            a quelque chose à filtrer. */}
        <nav aria-label={t("boutiques.filtres")} className="-mx-4 px-4 md:mx-0 md:px-0">
          <ul className="flex gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible md:pb-0">
            {(["", ...TYPES_FILTRABLES] as const).map((type) => {
              const actif = parametres.type === type;
              return (
                <li key={type === "" ? "toutes" : type}>
                  <LienEcran
                    href={lienFiltre(type)}
                    aria-current={actif ? "true" : undefined}
                    className={
                      "inline-flex h-[38px] items-center rounded-full border px-3.5 font-headline-md text-[13px] leading-4 font-semibold whitespace-nowrap transition-colors " +
                      (actif
                        ? "border-primary bg-primary text-on-primary"
                        : "border-filet-controle bg-surface-container-lowest text-ardoise hover:bg-fond-neutre")
                    }
                  >
                    {t(`boutiques.filtre.${type === "" ? "toutes" : type}`)}
                  </LienEcran>
                </li>
              );
            })}
          </ul>
        </nav>

        {page.lignes.length === 0 ? (
          /* DEUX ÉTATS VIDES DISTINCTS. Annoncer « aucune boutique » à qui vient
             de filtrer une base pleine est une perte de confiance immédiate. */
          <p className="rounded-[16px] border border-outline-variant bg-surface-container-lowest p-6 text-center font-body-md text-body-md text-on-surface-variant">
            {parametres.q === "" && parametres.type === ""
              ? t("boutiques.videTout")
              : t("boutiques.videRecherche")}
          </p>
        ) : (
          <ul className="grid gap-3.5 lg:grid-cols-2 xl:grid-cols-3">
            {page.lignes.map((b) => {
              const taille = mettreOctetsALEchelle(b.octets);
              return (
                <li
                  key={b.id}
                  className="min-w-0 rounded-[16px] border border-outline-variant bg-surface-container-lowest p-[18px]"
                >
                  <div className="mb-4 flex items-center gap-3">
                    {/* LA PASTILLE PORTE LA COULEUR DU VENDEUR quand il en a
                        choisi une. Sans nom de boutique, elle reste neutre : une
                        couleur inventée ferait croire à une configuration. */}
                    <span
                      aria-hidden="true"
                      className={
                        "h-11 w-11 shrink-0 rounded-[12px] " +
                        (b.nom === null ? "bg-fond-neutre" : "")
                      }
                      {...(b.nom === null ? {} : { style: { backgroundColor: b.accent } })}
                    />
                    <div className="min-w-0 flex-grow">
                      {b.nom === null ? (
                        <p className="truncate font-body-md text-[15px] leading-[19px] font-semibold italic text-sourdine">
                          {t("boutiques.nonConfiguree")}
                        </p>
                      ) : (
                        <p className="truncate font-headline-md text-[15px] leading-[19px] font-bold text-on-surface">
                          {b.nom}
                        </p>
                      )}
                      <p className="mt-px truncate font-body-sm text-[12px] leading-[15px] text-sourdine">
                        {b.email}
                      </p>
                    </div>
                  </div>

                  <div className="mb-3.5 flex flex-wrap gap-1.5">
                    <span className={PILULE_NEUTRE}>
                      {b.typeDeCompte === null
                        ? t("comptes.typeNonDeclare")
                        : t(`comptes.type.${b.typeDeCompte}`)}
                    </span>
                    {/* UNE SEULE PILULE D'ÉTAT, ET C'EST LA PLUS GRAVE QUI GAGNE.
                        Une boutique suspendue qui dépasse aussi son plafond n'a
                        pas besoin qu'on le lui dise : elle ne prend plus rien en
                        charge. */}
                    {suspendue(b) ? (
                      <span className={PILULE + " bg-alerte-fond-vif text-alerte"}>
                        {t("boutiques.suspendue")}
                      </span>
                    ) : auDessus(b) ? (
                      <span className={PILULE + " bg-alerte-fond-vif text-alerte"}>
                        {t("boutiques.plafondDepasse")}
                      </span>
                    ) : (
                      <span className={PILULE + " bg-succes-fond text-succes"}>
                        {t("boutiques.activeEtat")}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-4 gap-2 border-t border-filet-ligne pt-3.5">
                    {(
                      [
                        { cle: "commandes", valeur: format.number(b.commandes), alerte: false },
                        {
                          cle: "colis",
                          valeur: format.number(b.colisCeMois),
                          alerte: auDessus(b),
                        },
                        { cle: "medias", valeur: format.number(b.medias), alerte: false },
                        {
                          cle: "stockage",
                          valeur: t("boutiques.taille", {
                            valeur: format.number(taille.valeur, {
                              minimumFractionDigits: taille.decimales,
                              maximumFractionDigits: taille.decimales,
                            }),
                            unite: t(`unites.${taille.unite}`),
                          }),
                          alerte: false,
                        },
                      ] as const
                    ).map((s) => (
                      <div key={s.cle} className="min-w-0">
                        <p className="mb-0.5 font-body-sm text-[11px] leading-[14px] text-sourdine">
                          {t(`boutiques.colonnes.${s.cle}`)}
                        </p>
                        <p
                          className={
                            "truncate font-headline-md text-[15px] leading-[19px] font-bold " +
                            (s.alerte ? "text-alerte" : "text-on-surface")
                          }
                        >
                          {s.valeur}
                        </p>
                      </div>
                    ))}
                  </div>
                </li>
              );
            })}

            {/* LA SUITE EST UNE CARTE DE LA GRILLE, comme la planche : un bouton
                seul sous une grille de cartes se lit comme la fin de la page. */}
            {lienSuivant === null ? null : (
              <li className="flex min-h-[190px] items-center justify-center rounded-[16px] border border-dashed border-outline bg-surface-container-lowest p-[18px]">
                <LienEcran
                  href={lienSuivant}
                  className="inline-flex h-[38px] items-center rounded-[11px] border border-filet-controle bg-surface-container-lowest px-4 font-headline-md text-[13px] leading-4 font-semibold text-on-surface transition-colors hover:bg-fond-neutre"
                >
                  {t("boutiques.pageSuivante")}
                </LienEcran>
              </li>
            )}
          </ul>
        )}
      </div>
    </main>
  );
}
