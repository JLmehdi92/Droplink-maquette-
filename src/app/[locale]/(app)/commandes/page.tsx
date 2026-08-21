import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { PanneauFiltres } from "@/components/commandes/panneau-filtres";
import { TableauCommandes } from "@/components/commandes/tableau-commandes";
import { analyserParametres, lireCommandes } from "@/lib/commandes/liste";
import { origineDuSite } from "@/lib/site";
import { estLangueSupportee } from "@/i18n/config";
import { EtatLot, NombreLot } from "@/lib/commandes/lot";

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
 *   - AUCUN COMPTAGE EXACT, qu'aucun index ne rattrape ;
 *   - RECHERCHE INSENSIBLE AUX ACCENTS, servie par une colonne générée.
 *
 * L'écran est ENTIÈREMENT rendu côté serveur, sauf les deux boutons d'action de
 * chaque ligne. Filtres, tri, recherche et pagination passent par des liens et
 * des formulaires `GET` : rien à télécharger, rien à réhydrater, et l'URL décrit
 * exactement ce qui est affiché.
 *
 * LA PROTECTION EST LA RLS, pas ce fichier. Aucune requête d'ici n'écrit de
 * `shop_id` : c'est la policy qui le pose. Le layout de `(app)` a déjà écarté
 * les visiteurs sans session et les comptes suspendus, mais il n'est que la
 * première couche — la lecture, elle, est bornée en base.
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

  const [page, origine] = await Promise.all([lireCommandes(parametres), origineDuSite()]);

  const base = "/" + langue + "/commandes";

  return (
    <main
      id="contenu"
      className="mx-auto flex w-full max-w-container-max flex-col gap-gutter px-margin-mobile py-8 md:px-margin-desktop"
    >
      <header className="mb-4">
        <h1 className="mb-2 font-headline-lg-mobile text-headline-lg-mobile text-on-surface md:font-headline-xl md:text-headline-xl">
          {t("titre")}
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant">{t("sousTitre")}</p>
      </header>

      <div className="grid grid-cols-1 items-start gap-gutter md:grid-cols-12">
        <PanneauFiltres base={base} parametres={parametres} />
        <TableauCommandes
          base={base}
          langue={langue}
          // Sans origine connue, le lien public serait construit sur une valeur
          // devinée. On rend alors un chemin relatif : il ne se copie pas dans
          // une conversation, mais il n'envoie personne sur un domaine inventé.
          origine={origine ?? ""}
          parametres={parametres}
          page={page}
          lot={lot}
        />
      </div>
    </main>
  );
}
