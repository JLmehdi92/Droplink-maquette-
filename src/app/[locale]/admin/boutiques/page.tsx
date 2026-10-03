import { getTranslations, setRequestLocale } from "next-intl/server";
import { getFormateur } from "@/lib/format/formateur";
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
import { lireCompteurs, lirePanneau, lireSeuils } from "@/lib/audit/panneau";
import { Anneau } from "@/components/admin/anneau";
import { FiltresAdmin } from "@/components/admin/filtres-admin";
import { TuileVolume, Tuiles } from "@/components/admin/tuile-volume";
import { AvatarCompte, ColisSeuil } from "@/components/admin/briques-admin";
import Link from "next/link";
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
  // LES SEUILS D'ABORD : le panneau les prend en argument, donc les lire deux
  // fois en parallèle coûterait un aller-retour pour la même réponse.
  const seuils = await lireSeuils(supabase);
  const [page, compteurs, panneau] = await Promise.all([
    listerBoutiques(supabase, parametres, await empreinteAdmin()),
    lireCompteurs(supabase),
    // LE STOCKAGE TOTAL VIT DANS LE PANNEAU, et c'est la MÊME source que la
    // tuile de la vue d'ensemble : deux lectures distinctes du même volume
    // finiraient par se contredire sans que rien ne le dise.
    lirePanneau(supabase, seuils),
  ]);

  const t = await getTranslations("admin");
  const format = await getFormateur();
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

  /** La part d'une population dans le total des boutiques. */
  const part = (n: number): number =>
    compteurs.boutiques === 0 ? 0 : Math.round((n / compteurs.boutiques) * 100);

  const nonConfigurees = compteurs.boutiques - compteurs.boutiquesNommees;

  const stockage =
    panneau.stockageMesurable && panneau.stockageOctets !== null
      ? mettreOctetsALEchelle(panneau.stockageOctets)
      : null;

  /** Le libellé d'une taille, dans l'unité que l'échelle a choisie. */
  const taille = (octets: number): string => {
    const e = mettreOctetsALEchelle(octets);
    return t("boutiques.taille", {
      valeur: format.number(e.valeur, {
        minimumFractionDigits: e.decimales,
        maximumFractionDigits: e.decimales,
      }),
      unite: t(`unites.${e.unite}`),
    });
  };

  // LA BARRE DE STOCKAGE EST RELATIVE À LA PLUS GROSSE BOUTIQUE DE LA PAGE :
  // elle sert à comparer les lignes entre elles, le chiffre dit la valeur.
  const plusGrosse = Math.max(1, ...page.lignes.map((b) => b.octets));
  // UNE SEULE PASTILLE D'ÉTAT, LA PLUS GRAVE : suspendue, puis plafond dépassé.
  const etat = (b: LigneBoutique) =>
    suspendue(b) ? (
      <span className="adm-badge" data-statut="suspended">
        <i aria-hidden="true" />
        {t("boutiques.suspendue")}
      </span>
    ) : auDessus(b) ? (
      <span className="adm-badge" data-ton="alerte">
        <i aria-hidden="true" />
        {t("boutiques.plafondDepasse")}
      </span>
    ) : (
      <span className="adm-badge" data-statut="active">
        <i aria-hidden="true" />
        {t("boutiques.activeEtat")}
      </span>
    );

  return (
    <main id="contenu" className="tableau adm">
      <EnTeteAdmin titre={t("boutiques.titre")} sousTitre={t("boutiques.sousTitreListe")} />
      <EncartTrace texte={t("boutiques.trace")} />

      {/* « CONFIGURÉES » ET NON « ACTIVES » : une boutique naît à l'inscription
          et n'a pas d'état propre. Ce qui distingue deux boutiques, c'est qu'un
          vendeur soit allé jusqu'à se donner un nom. */}
      <Tuiles etiquette={t("chiffresCles")} colonnes={4}>
        <TuileVolume libelle={t("boutiques.tuileTotal")} valeur={format.number(compteurs.boutiques)} complement={t("boutiques.tuileTotalAide")} />
        <TuileVolume
          libelle={t("boutiques.tuileConfigurees")}
          valeur={format.number(compteurs.boutiquesNommees)}
          complement={t("boutiques.partDuTotal", { part: part(compteurs.boutiquesNommees) })}
        />
        <TuileVolume libelle={t("boutiques.tuileCommandes")} valeur={format.number(compteurs.commandesCreeesCeMois)} complement={t("boutiques.ceMoisCi")} />
        <TuileVolume
          libelle={t("boutiques.tuileStockage")}
          valeurEnSourdine={stockage === null}
          valeur={
            stockage === null
              ? t("panneau.stockageIndisponible")
              : t("boutiques.taille", {
                  valeur: format.number(stockage.valeur, {
                    minimumFractionDigits: stockage.decimales,
                    maximumFractionDigits: stockage.decimales,
                  }),
                  unite: t(`unites.${stockage.unite}`),
                })
          }
          complement={t("boutiques.stockageAide")}
        />
      </Tuiles>

      <div className="adm-rangee adm-rangee--pleine">
        <section className="bloc adm-bloc" aria-labelledby="adm-liste">
          <header className="bloc__tete">
            <div>
              <h2 id="adm-liste">{t("boutiques.liste")}</h2>
              <p className="adm-aide">{t("boutiques.listeTotal", { total: compteurs.boutiques })}</p>
            </div>
          </header>
          {/* LE FILTRE VIT DANS L'URL et son critère entre dans la trace. */}
          <div className="adm-outils">
            <FiltresAdmin
              etiquette={t("boutiques.filtreType")}
              courant={parametres.type}
              options={(["", ...TYPES_FILTRABLES] as const).map((type) => ({
                valeur: type,
                libelle: t(`boutiques.filtre.${type === "" ? "toutes" : type}`),
                href: lienFiltre(type),
              }))}
            />
            <RechercheAdmin
              action={base}
              valeur={parametres.q}
              etiquette={t("boutiques.recherche")}
              exemple={t("boutiques.recherchePlaceholder")}
              chercher={t("boutiques.chercher")}
              garder={parametres.type === "" ? {} : { type: parametres.type }}
            />
          </div>

          {page.lignes.length === 0 ? (
            <p className="adm-vide">
              {parametres.q === "" && parametres.type === ""
                ? t("boutiques.videTout")
                : parametres.q === ""
                  ? t("boutiques.videFiltre")
                  : t("boutiques.videRecherche")}
            </p>
          ) : (
            <div className="adm-defil">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th scope="col">{t("boutiques.colonnes.nom")}</th>
                    <th scope="col">{t("boutiques.colonnes.type")}</th>
                    <th scope="col">{t("boutiques.colonnes.statut")}</th>
                    <th scope="col">{t("boutiques.colonnes.commandes")}</th>
                    <th scope="col">{t("boutiques.colonnes.medias")}</th>
                    <th scope="col">{t("boutiques.colonnes.stockage")}</th>
                    <th scope="col">{t("boutiques.colonnes.colis")}</th>
                  </tr>
                </thead>
                <tbody>
                  {page.lignes.map((b) => (
                    <tr key={b.id}>
                      <td>
                        {/* LES SEPT COLONNES DE LA MAQUETTE (contre-audit du 03/10/2026) : ni
                            date de création, ni colonne « Voir ». Le chemin d'une boutique vers
                            son compte — perdu une fois au portage, 29/08 — passe désormais par
                            la boutique elle-même, qui devient le lien. */}
                        <Link
                          prefetch={false}
                          className="adm-qui adm-qui--lien"
                          href={`/${langue}/admin/comptes/${b.proprietaireId}`}
                        >
                          <AvatarCompte email={b.email} nom={b.nom} />
                          <span>
                            <b>{b.nom ?? <span className="adm-sourdine">{t("boutiques.nonConfiguree")}</span>}</b>
                            <small>{b.email}</small>
                          </span>
                        </Link>
                      </td>
                      <td>{b.typeDeCompte === null ? <span className="adm-sourdine">{t("comptes.typeNonDeclare")}</span> : t(`comptes.type.${b.typeDeCompte}`)}</td>
                      <td>{etat(b)}</td>
                      <td className="adm-nb">{format.number(b.commandes)}</td>
                      <td className="adm-nb">{format.number(b.medias)}</td>
                      <td>
                        <span className="adm-stock" data-info={t("boutiques.stockageInfo", { taille: taille(b.octets) })}>
                          <b>{taille(b.octets)}</b>
                          <i aria-hidden="true" style={{ "--k": (b.octets / plusGrosse).toFixed(3) } as React.CSSProperties} />
                        </span>
                      </td>
                      <td>
                        <ColisSeuil
                          valeur={format.number(b.colisCeMois)}
                          seuil={format.number(seuils.colis)}
                          k={seuils.colis > 0 ? b.colisCeMois / seuils.colis : 0}
                          depasse={auDessus(b)}
                          info={t("comptes.colisInfo", { valeur: format.number(b.colisCeMois), seuil: format.number(seuils.colis) })}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <footer className="adm-pied">
            <span>{t("boutiques.decompte", { total: compteurs.boutiques })}</span>
            {lienSuivant === null ? null : (
              <LienEcran prefetch={false} href={lienSuivant} className="bouton-outil">
                {t("boutiques.pageSuivante")}
              </LienEcran>
            )}
          </footer>
        </section>

        {/* QUE DES NOMBRES : configurées contre sans nom. */}
        <section className="bloc adm-bloc adm-bloc--anneau" aria-labelledby="adm-repartition">
          <header className="bloc__tete">
            <div>
              <h2 id="adm-repartition">{t("boutiques.repartition")}</h2>
            </div>
          </header>
          <Anneau
            etiquette={t("boutiques.repartition")}
            total={compteurs.boutiques}
            unite={t("boutiques.unite")}
            part={(pourcent) => t("boutiques.part", { part: pourcent })}
            parts={[
              { cle: "configurees", libelle: t("boutiques.legendeConfigurees"), valeur: compteurs.boutiquesNommees, trait: "var(--color-ds-accent)" },
              { cle: "sansNom", libelle: t("boutiques.legendeSansNom"), valeur: nonConfigurees, trait: "var(--st-attente)" },
            ]}
          />
        </section>
      </div>
    </main>
  );
}
