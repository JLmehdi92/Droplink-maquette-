import Link from "next/link";
import { LienEcran } from "@/components/lien-ecran";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { EnTeteAdmin } from "@/components/admin/en-tete-admin";
import { EncartTrace } from "@/components/admin/encart-trace";
import { RechercheAdmin } from "@/components/admin/recherche-admin";
import { exigerAdmin } from "@/lib/audit/garde";
import { empreinteAdmin } from "@/lib/audit/empreinte-admin";
import { listerComptes, ParametresComptes, type LigneCompte } from "@/lib/audit/comptes";
import { lireCompteurs, lireInscriptionsRecentes, lireSeuils } from "@/lib/audit/panneau";
import { Anneau } from "@/components/admin/anneau";
import { FiltresAdmin } from "@/components/admin/filtres-admin";
import { TuileVolume, Tuiles } from "@/components/admin/tuile-volume";
import { AvatarCompte, ColisSeuil } from "@/components/admin/briques-admin";
import { ArrowRight, Users } from "lucide-react";
import { compterDoublons } from "@/lib/audit/doublons";
import { creerClientServeur } from "@/lib/supabase/server";
import { estLangueSupportee } from "@/i18n/config";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // LA GARDE COURT AUSSI ICI. Next évalue les métadonnées EN PARALLÈLE du
  // rendu : sans elle, le titre de l'écran partait dans le corps du 404 servi à
  // un visiteur sans droits, et révélait la surface que le code de réponse
  // cachait. L'appel est mémoïsé par requête, donc il ne coûte rien de plus.
  await exigerAdmin();
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("comptes.titre"), robots: { index: false, follow: false } };
}

const JOURS_INSCRIPTIONS = 30;

/**
 * GESTION DES COMPTES — surface d'administration.
 *
 * `/[locale]/admin/*` EST UN SEGMENT RÉEL, jamais un groupe entre parenthèses :
 * un groupe n'ajoute rien à l'URL, et les écrans tomberaient hors du filtre du
 * middleware tout en paraissant rangés au bon endroit.
 *
 * LA GARDE EST ICI, EN TÊTE, ET ELLE LIT LE RÔLE EN BASE. Le middleware n'a
 * écarté que les visiteurs sans session — il ne vérifie pas le rôle, parce qu'y
 * lire `profiles` ajouterait un aller-retour à chaque navigation du produit. Et
 * il ne couvre de toute façon pas les Server Actions.
 *
 * LA LECTURE EST INSÉPARABLE DE SON AUDIT : elle passe par une fonction en base
 * qui écrit la trace dans la MÊME transaction. Une requête directe rendrait les
 * mêmes données sans rien laisser, et rien n'échouerait.
 *
 * LA COLONNE « COMMANDES » COMPTE LE CONTENU RÉEL, pas les lignes de `orders`.
 * ⚠️ Elle comptait les lignes jusqu'à la migration 111, pendant que l'écran des
 * boutiques lisait le compteur tenu par déclencheur : deux écrans de la même
 * surface donnaient deux nombres pour le même compte, et le seul écart était
 * les brouillons abandonnés. Aucun des deux ne mentait sur son calcul — il y
 * avait deux définitions du mot « commande » et rien pour le signaler.
 *
 * LA COLONNE DE RÔLE DE L'ANCIEN TABLEAU A DISPARU, mais pas l'information : la
 * planche n'en dessine pas, et un rôle identique sur 99 % des lignes est une
 * colonne qui ne sert qu'à la centième. Une pilule apparaît donc À CÔTÉ DU NOM
 * quand — et seulement quand — le compte est administrateur. C'est l'exception
 * qu'on cherche, jamais la règle.
 */
export default async function AdminComptes({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const langue = estLangueSupportee(locale) ? locale : "fr";
  setRequestLocale(langue);

  // Rend un 404 sans jamais revenir si l'appelant n'est pas administrateur
  // ACTIF. Jamais 403 : un 403 confirmerait que la surface existe.
  await exigerAdmin();

  const brut = await searchParams;
  const parametres = ParametresComptes.parse({
    q: Array.isArray(brut["q"]) ? brut["q"][0] : brut["q"],
    curseur: (Array.isArray(brut["curseur"]) ? brut["curseur"][0] : brut["curseur"]) ?? null,
    statut: Array.isArray(brut["statut"]) ? brut["statut"][0] : brut["statut"],
  });

  const supabase = await creerClientServeur();
  const maintenant = new Date();
  const [page, seuils, compteurs, nouveaux, doublons] = await Promise.all([
    listerComptes(supabase, parametres, await empreinteAdmin()),
    lireSeuils(supabase),
    lireCompteurs(supabase),
    lireInscriptionsRecentes(supabase, maintenant, JOURS_INSCRIPTIONS),
    compterDoublons(supabase),
  ]);

  const t = await getTranslations("admin");
  const format = await getFormatter();
  const base = `/${langue}/admin/comptes`;

  /** La part d'une population dans le total, arrondie — jamais un total nul divisé. */
  const part = (n: number): number =>
    compteurs.comptes === 0 ? 0 : Math.round((n / compteurs.comptes) * 100);

  /*
   * LE LIEN D'UN FILTRE REPART DE LA PREMIÈRE PAGE, ET C'EST OBLIGATOIRE.
   * Garder le curseur en changeant de filtre le ferait désigner une position
   * dans une liste qui n'existe plus : on ouvrirait la page 3 d'un ensemble
   * qu'on vient de réduire à deux lignes, et l'écran paraîtrait vide.
   */
  const lienFiltre = (statut: string): string => {
    const p = new URLSearchParams();
    if (parametres.q !== "") p.set("q", parametres.q);
    if (statut !== "tous") p.set("statut", statut);
    const q = p.toString();
    return q === "" ? base : `${base}?${q}`;
  };

  const suspendu = (l: LigneCompte): boolean => l.statut === "suspended";
  const auDessus = (l: LigneCompte): boolean => l.colisCeMois > seuils.colis;

  const lienSuivant =
    page.curseurSuivant === null
      ? null
      : `${base}?${new URLSearchParams({
          ...(parametres.q === "" ? {} : { q: parametres.q }),
          // LE FILTRE VOYAGE AVEC LE CURSEUR. Sans lui, la page 2 rendrait un
          // autre ensemble que la page 1 et le curseur désignerait une position
          // dans une liste qui n'est plus la même.
          ...(parametres.statut === "tous" ? {} : { statut: parametres.statut }),
          curseur: page.curseurSuivant,
        }).toString()}`;

  /** Le nom de boutique, ou le fait qu'il n'y en ait pas — jamais une invention. */
  const typeLisible = (l: LigneCompte): string =>
    l.typeDeCompte === null ? t("comptes.typeNonDeclare") : t(`comptes.type.${l.typeDeCompte}`);

  return (
    <main id="contenu" className="tableau adm">
      <EnTeteAdmin titre={t("comptes.titre")} sousTitre={t("comptes.sousTitreListe")} sousTitreAuBureauSeulement />
      <EncartTrace texte={t("comptes.trace")} />

      {/* QUATRE TUILES, PAS SIX : le kit compte aussi les plans, que la liste ne
          lit pas (le plan ne se lit que sur la fiche). « Nouveaux inscrits »
          dit sa FENÊTRE plutôt qu'un écart calculé sur rien. */}
      <Tuiles etiquette={t("comptes.titre")} colonnes={4}>
        <TuileVolume
          libelle={t("comptes.tuileTotal")}
          valeur={format.number(compteurs.comptes)}
          complement={t("comptes.tuileTotalAide", { sansType: format.number(compteurs.comptesSansType) })}
        />
        <TuileVolume
          libelle={t("comptes.tuileNouveaux")}
          valeurEnSourdine={nouveaux === null}
          valeur={nouveaux === null ? t("panneau.stockageIndisponible") : format.number(nouveaux)}
          complement={t("comptes.surJours", { jours: JOURS_INSCRIPTIONS })}
        />
        <TuileVolume
          libelle={t("comptes.tuileActifs")}
          valeur={format.number(compteurs.comptesActifs)}
          complement={t("comptes.partDuTotal", { part: part(compteurs.comptesActifs) })}
        />
        <TuileVolume
          ton={compteurs.comptesSuspendus > 0 ? "erreur" : undefined}
          libelle={t("comptes.tuileSuspendus")}
          valeur={format.number(compteurs.comptesSuspendus)}
          complement={t("comptes.partDuTotal", { part: part(compteurs.comptesSuspendus) })}
        />
      </Tuiles>

      <div className="adm-rangee adm-rangee--liste">
        <section className="bloc adm-bloc" aria-labelledby="adm-liste">
          <header className="bloc__tete">
            <div>
              <h2 id="adm-liste">{t("comptes.liste")}</h2>
              <p className="adm-aide">{t("comptes.listeTotal", { total: compteurs.comptes })}</p>
            </div>
          </header>
          {/* LE STATUT EST LE SEUL FILTRE QUE LA BASE SAIT APPLIQUER, et le critère
              entre dans la trace : la fonction l'écrit dans l'entrée d'audit. */}
          <div className="adm-outils">
            <FiltresAdmin
              etiquette={t("comptes.filtreStatut")}
              courant={parametres.statut}
              options={[
                { valeur: "tous", libelle: t("comptes.statutTous"), href: lienFiltre("tous") },
                { valeur: "active", libelle: t("comptes.statuts.active"), href: lienFiltre("active") },
                { valeur: "suspended", libelle: t("comptes.statuts.suspended"), href: lienFiltre("suspended") },
              ]}
            />
            <RechercheAdmin
              action={base}
              valeur={parametres.q}
              etiquette={t("comptes.recherche")}
              exemple={t("comptes.recherchePlaceholder")}
              chercher={t("comptes.chercher")}
              garder={parametres.statut === "tous" ? {} : { statut: parametres.statut }}
            />
          </div>

          {page.lignes.length === 0 ? (
            <p className="adm-vide">
              {parametres.q === "" && parametres.statut === "tous"
                ? t("comptes.videCompte")
                : parametres.q === ""
                  ? t("comptes.videFiltre")
                  : t("comptes.videRecherche")}
            </p>
          ) : (
            <div className="adm-defil">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th scope="col">{t("comptes.colonnes.email")}</th>
                    <th scope="col">{t("comptes.colonnes.type")}</th>
                    <th scope="col">{t("comptes.colonnes.statut")}</th>
                    <th scope="col">{t("comptes.colonnes.commandes")}</th>
                    <th scope="col">{t("comptes.colonnes.colis")}</th>
                    <th scope="col">{t("comptes.colonnes.cree")}</th>
                    <th scope="col">
                      <span className="sr">{t("comptes.colonnes.action")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {page.lignes.map((ligne) => (
                    <tr key={ligne.id}>
                      <td>
                        <Link prefetch={false} className="adm-qui" href={`${base}/${ligne.id}`}>
                          <AvatarCompte email={ligne.email} nom={ligne.boutique} />
                          <span>
                            <b>{ligne.email}</b>
                            <small>
                              {ligne.boutique === null ? <span className="adm-sourdine">{t("comptes.sansNom")}</span> : ligne.boutique}
                              {ligne.role === "admin" ? <span className="adm-pro">{t("comptes.roles.admin")}</span> : null}
                            </small>
                          </span>
                        </Link>
                      </td>
                      <td>{ligne.typeDeCompte === null ? <span className="adm-sourdine">{typeLisible(ligne)}</span> : typeLisible(ligne)}</td>
                      <td>
                        <span className="adm-badge" data-statut={ligne.statut}>
                          <i aria-hidden="true" />
                          {t(`comptes.statuts.${ligne.statut}`)}
                        </span>
                      </td>
                      <td className="adm-nb">{format.number(ligne.commandes)}</td>
                      <td>
                        <ColisSeuil
                          valeur={format.number(ligne.colisCeMois)}
                          seuil={format.number(seuils.colis)}
                          k={seuils.colis > 0 ? ligne.colisCeMois / seuils.colis : 0}
                          depasse={auDessus(ligne)}
                          info={t("comptes.colisInfo", { valeur: format.number(ligne.colisCeMois), seuil: format.number(seuils.colis) })}
                        />
                      </td>
                      <td className="adm-date">{format.dateTime(new Date(ligne.creeLe), { dateStyle: "medium" })}</td>
                      <td>
                        <Link prefetch={false} className="bouton-outil adm-ouvrir" href={`${base}/${ligne.id}`} aria-label={t("comptes.ouvrirLong", { email: ligne.email })}>
                          {t("comptes.ouvrir")}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {lienSuivant === null ? null : (
            <footer className="adm-pied">
              <LienEcran prefetch={false} href={lienSuivant} className="bouton-outil">
                {t("comptes.pageSuivante")}
              </LienEcran>
            </footer>
          )}
        </section>

        {/* LA COLONNE DE DROITE NE REND QUE DES NOMBRES : compter n'est pas
            consulter, elle n'écrit rien au journal. Le lien des doublons n'existe
            que s'il y a quelque chose à voir. */}
        <div className="adm-colonne">
          <section className="bloc adm-bloc adm-bloc--anneau" aria-labelledby="adm-repartition">
            <header className="bloc__tete">
              <div>
                <h2 id="adm-repartition">{t("comptes.repartition")}</h2>
              </div>
            </header>
            <Anneau
              etiquette={t("comptes.repartition")}
              total={compteurs.comptes}
              unite={t("comptes.unite")}
              part={(pourcent) => t("comptes.part", { part: pourcent })}
              parts={[
                { cle: "actifs", libelle: t("comptes.statuts.active"), valeur: compteurs.comptesActifs, trait: "var(--color-ds-succes)" },
                { cle: "suspendus", libelle: t("comptes.statuts.suspended"), valeur: compteurs.comptesSuspendus, trait: "var(--color-ds-erreur)" },
              ]}
            />
          </section>
          {doublons.identifiants === 0 ? (
            <section className="bloc adm-bloc" aria-labelledby="adm-doublons">
              <header className="bloc__tete">
                <div>
                  <h2 id="adm-doublons">{t("doublons.titre")}</h2>
                  <p className="adm-aide">{t("doublons.vide")}</p>
                </div>
              </header>
            </section>
          ) : (
            <Link prefetch={false} className="bloc adm-doublons-lien v4-carte" href={`${base}/doublons`}>
              <span className="adm-doublons-lien__icone" aria-hidden="true">
                <Users className="ic" />
              </span>
              <span>
                <b>{t("doublons.titre")}</b>
                <small>{t("panneau.alerteDoublons", { comptes: doublons.comptes, identifiants: doublons.identifiants })}</small>
              </span>
              <ArrowRight aria-hidden="true" className="ic" />
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
