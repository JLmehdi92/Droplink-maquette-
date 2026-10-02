import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";
import { ValeurRoulee } from "@/components/app/couche-v4";
import {
  BarreListe,
  ListeCommandes,
  OutilExport,
  OutilPeriode,
  PucesFiltres,
} from "@/components/commandes/liste-commandes";
import { analyserParametres, compterParEtat, lireCommandes } from "@/lib/commandes/liste";
import { origineDuSite } from "@/lib/site";
import { estLangueSupportee } from "@/i18n/config";
import { exigerVendeur } from "@/lib/comptes/apres-session";
import { lireProfilVendeur } from "@/lib/comptes/profil";
import { EtatLot, NombreLot } from "@/lib/commandes/lot";
import { EtatQuota, type QuotaAtteint } from "@/lib/commandes/quota-atteint";
import { BandeauQuota } from "@/components/commandes/bandeau-quota";
import { creerClientServeur } from "@/lib/supabase/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "commandes" });
  // L'espace vendeur n'a rien à faire dans un index de moteur de recherche.
  return { title: t("titre"), robots: { index: false, follow: false } };
}

/**
 * La liste des commandes — l'écran le plus utilisé du produit.
 *
 * Un fournisseur à 200 commandes par semaine y passe sa journée. Trois choix en
 * découlent, tous mesurés plutôt que supposés :
 *
 *   - PAGINATION PAR CURSEUR, jamais par décalage ;
 *   - AUCUN COMPTAGE EXACT DU JEU FILTRÉ, qu'aucun index ne rattrape ;
 *   - RECHERCHE INSENSIBLE AUX ACCENTS, servie par une colonne générée.
 *
 * L'écran est ENTIÈREMENT rendu côté serveur, sauf les deux boutons d'action de
 * chaque ligne. Filtres, tri, recherche et pagination passent par des liens et
 * des formulaires `GET` : rien à télécharger, rien à réhydrater, et l'URL décrit
 * exactement ce qui est affiché.
 *
 * ⚠️ CE COMMENTAIRE DISAIT « la protection est la RLS, pas ce fichier ; le
 * layout a déjà écarté les visiteurs sans session et les comptes suspendus ».
 * LES DEUX MOITIÉS ÉTAIENT FAUSSES, et c'est ce qui a fait fuir cette page :
 *
 *   - la RLS ne protège pas d'un jeton RÉVOQUÉ. PostgREST ne valide qu'une
 *     signature et une date : un jeton révoqué lui reste bon UNE HEURE ;
 *   - le layout n'écarte personne à temps. Sa redirection tombe après que Next
 *     a engagé la réponse, et la charge part avec le 307.
 *
 * L'isolation ENTRE VENDEURS, elle, vient bien de la base — aucune requête
 * d'ici n'écrit de `shop_id`, c'est la policy qui le pose. Mais l'isolation
 * entre un vendeur et QUELQU'UN QUI N'EN EST PLUS UN se joue ici, dans
 * `exigerVendeur`, avant la première lecture.
 */
export default async function Commandes({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const langue = estLangueSupportee(locale) ? locale : "fr";
  setRequestLocale(langue);

  /*
   * ⚠️ LA GARDE PASSE AVANT TOUTE LECTURE, et cette page n'en avait AUCUNE.
   *
   * Elle s'en remettait à la RLS et à la redirection du layout. Mais la RLS
   * accepte un jeton d'accès RÉVOQUÉ pendant une heure — PostgREST ne valide
   * qu'une signature et une date —, et la redirection du layout arrive après
   * que Next a engagé la réponse : la charge part avec le 307.
   *
   * Mesuré avec un cookie révoqué : le nom du client et le `public_token`
   * sortaient. Contre-test : sans cookie, aucune occurrence.
   */
  await exigerVendeur(langue);

  const requete = await searchParams;
  const parametres = analyserParametres(requete);

  // Le résultat du dernier lot revient par l'URL, donc il est VALIDÉ comme tout
  // ce qui vient de la barre d'adresse : il finit dans une clef de traduction, et
  // une clef inexistante ferait lever le rendu de l'écran le plus utilisé du
  // produit.
  const lot = {
    etat: EtatLot.parse(requete["lot"]),
    nombre: NombreLot.parse(requete["n"]),
  };
  const t = await getTranslations("commandes");

  // LE QUOTA ATTEINT (26/09/2026), validé comme le lot. Le plafond n'est lu que s'il
  // y a un refus à expliquer : l'écran le plus ouvert du produit ne paie pas cette
  // lecture le reste du temps.
  const quota = EtatQuota.parse(requete["quota"]);
  const plafondQuota = quota === null ? null : await lirePlafondDuQuota(quota);

  /*
   * ⚠️ `lireProfilVendeur()` NE COÛTE AUCUN ALLER-RETOUR DE PLUS ICI. Elle est
   * mémoïsée par requête (`cache()` de React) et la mise en page de l'espace
   * vendeur l'a déjà appelée pour décider si la page existe : ce second appel
   * lit le même résultat. Sans cette mémoïsation, l'écran le plus utilisé du
   * produit paierait une lecture de profil pour afficher un nom de lien.
   */
  const [page, origine, compteurs, profil] = await Promise.all([
    lireCommandes(parametres),
    origineDuSite(),
    compterParEtat(),
    lireProfilVendeur(),
  ]);

  const base = "/" + langue + "/commandes";

  // LE COMPTE VIDE A SA PROPRE PLANCHE, et ce n'est pas une nuance de mise en
  // page : `CommandesVide` n'a NI recherche, NI compteurs, NI filtres. Il n'y a
  // rien à chercher dans rien, et quatre zéros en tête d'écran seraient la
  // première chose qu'un nouveau vendeur verrait du produit.
  const compteVide = page.diagnostic === "aucune-commande";

  /*
   * LES COMPTEURS DÉCRIVENT LES COMMANDES ACTIVES. Dans la vue des archives, ils
   * décriraient donc exactement ce qui n'est PAS affiché — quatre nombres justes
   * posés au-dessus d'une liste qu'ils ne comptent pas. C'est le genre d'écart
   * qu'on lit sans le voir, et qui fait conclure à une perte de données.
   *
   * Les deux planches d'écran vide n'en portent pas non plus : il n'y a rien à
   * compter au-dessus de rien.
   */
  /*
   * ⚠️ `listeVide` A ÉTÉ RETIRÉ DE CETTE CONDITION, ET C'EST LE DÉFAUT QUE
   * WASSIM A MONTRÉ EN CAPTURE le 02/09/2026.
   *
   * Quand un filtre ne renvoyait RIEN, l'écran retirait la rangée de vues ET
   * les quatre compteurs, et basculait sur un état vide pleine page : « c'est
   * comme si ça ouvrait une deuxième page ». On perdait le contexte, et surtout
   * la possibilité de cliquer une AUTRE vue sans repasser par « tout effacer ».
   * Mesuré avant correction sur `?q=zzzzintrouvable` : zéro pilule, zéro
   * compteur.
   *
   * Et les compteurs restent JUSTES dans ce cas : ils décrivent les commandes
   * ACTIVES du compte, pas le résultat du filtre — c'est même l'information la
   * plus utile ici, puisqu'elle dit que les commandes sont toujours là.
   *
   * LES DEUX AUTRES CONDITIONS RESTENT, et pour des raisons différentes :
   * `compteVide` est le compte qui n'a RIEN, où quatre zéros seraient la
   * première chose qu'un nouveau vendeur verrait ; `archivees` est la vue où
   * les compteurs décriraient exactement ce qui n'est PAS affiché.
   */
  const compteursVisibles = compteurs !== null && !compteVide && !parametres.archivees;

  /*
   * LE SOUS-TITRE EST UN CHIFFRE, PAS UNE PHRASE.
   *
   * La planche écrit « 184 commandes, 12 créées cette semaine ». Le produit y
   * mettait une phrase fixe qui n'apprenait rien, à l'endroit exact où la
   * planche répond à la seule question qu'on se pose en arrivant.
   *
   * ⚠️ QUAND LE COMPTE A ÉCHOUÉ, ON N'ÉCRIT PAS ZÉRO. Un « 0 commande » affirme
   * qu'on a compté et trouvé rien — c'est-à-dire exactement le genre de nombre
   * crédible et faux que ce projet s'interdit. Le sous-titre est alors OMIS.
   */
  const sousTitre = compteVide
    ? t("sousTitreVide")
    : parametres.archivees
      ? // ⚠️ LE CHIFFRE COMPTE LES COMMANDES ACTIVES, et cette vue montre celles
        // qu'il exclut. « 0 commande » au-dessus de sept lignes archivées est une
        // contradiction que le vendeur lit sans la voir : elle passe pour une
        // perte de données. La vue se NOMME plutôt que de se compter.
        t("sousTitreArchives")
      : compteurs === null
        ? null
        : t("sousTitreChiffre", {
            total: compteurs.total,
            semaine: compteurs.creeesCetteSemaine,
          });

  /* LA REFONTE (02/10/2026) suit `commandes.html` : fil d'Ariane, titre,
     période et export dans l'en-tête, quatre compteurs en une bande, vues
     soulignées avec filtres et tri, puces des critères, puis la liste. La
     recherche est celle de la barre supérieure, à toutes les largeurs : elle
     mène ici avec `?q=`. « Créer une commande » est dans la barre du haut
     (décision n° 5) : aucun second bouton ici. */
  const nom = profil?.nomAffiche ?? profil?.nomBoutique ?? null;
  const outils = !compteVide && page.lignes.length > 0;

  return (
    <main id="contenu" className="tableau commandes-ecran">
      <div className="tableau__tete">
        <div>
          <p className="v4-fil">
            {nom === null ? null : (
              <>
                <span>{nom}</span>
                <ChevronRight aria-hidden="true" className="ic" />
              </>
            )}
            <b>{t("titre")}</b>
          </p>
          <h1>{t("titre")}</h1>
          {sousTitre === null ? null : <p>{sousTitre}</p>}
        </div>
        {compteVide ? null : (
          <div className="outils-tete">
            <OutilPeriode base={base} parametres={parametres} />
            {outils ? <OutilExport parametres={parametres} /> : null}
          </div>
        )}
      </div>

      {/* LE QUOTA ATTEINT, avant tout le reste : c'est ce qui vient d'arriver. */}
      {quota !== null ? (
        <BandeauQuota
          quota={quota}
          titre={t(quota === "gratuit" ? "quota.gratuitTitre" : "quota.mensuelTitre")}
          texte={
            plafondQuota === null
              ? t(quota === "gratuit" ? "quota.gratuitTexteSansNombre" : "quota.mensuelTexteSansNombre")
              : t(quota === "gratuit" ? "quota.gratuitTexte" : "quota.mensuelTexte", { n: plafondQuota })
          }
          passerPro={t("quota.passerPro")}
          versPasserPro={`/${langue}/passer-pro`}
        />
      ) : null}

      {/* LES QUATRE COMPTEURS, omis en bloc si la lecture échoue : des zéros
          affirmeraient qu'on a compté et trouvé rien. « Jamais ouvertes » est mis
          en avant : c'est le seul qui appelle une action. */}
      {compteursVisibles && compteurs !== null ? (
        <section className="compteurs compteurs--4 v4-carte" aria-label={t("resume")}>
          {(
            [
              ["preparation", compteurs.preparation],
              ["enTransit", compteurs.enTransit],
              ["jamaisOuvertes", compteurs.jamaisOuvertes],
              ["livrees", compteurs.livrees],
            ] as const
          ).map(([clef, valeur]) => (
            <div key={clef} className="compteur-app" data-alerte={(clef === "jamaisOuvertes" && valeur > 0) || undefined}>
              <p className="compteur-app__titre">{t(`compteurs.${clef}`)}</p>
              <p className="compteur-app__valeur">
                <ValeurRoulee texte={String(valeur)} />
              </p>
            </div>
          ))}
        </section>
      ) : null}

      {compteVide ? null : (
        <>
          <BarreListe base={base} parametres={parametres} outils={outils} />
          <PucesFiltres base={base} parametres={parametres} />
        </>
      )}

      <ListeCommandes
        base={base}
        langue={langue}
        origine={origine ?? ""}
        nomDeLien={profil?.nomDeLien ?? null}
        parametres={parametres}
        page={page}
        lot={lot}
        total={compteurs?.total ?? null}
      />
    </main>
  );
}

async function lirePlafondDuQuota(quota: QuotaAtteint): Promise<number | null> {
  const supabase = await creerClientServeur();
  const { data, error } = await supabase.rpc(
    quota === "gratuit" ? "lire_plafond_gratuit_a_vie" : "lire_plafond_commandes",
  );
  if (error !== null || typeof data !== "number") {
    console.error("[commandes] plafond du quota illisible : " + (error?.message ?? "réponse vide"));
    return null;
  }
  return data;
}
