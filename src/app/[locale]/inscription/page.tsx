import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import Link from "next/link";
import { FormulaireInscription } from "@/components/formulaire-inscription";
import { BoutonGoogle } from "@/components/bouton-google";
import { TraductionsClient } from "@/components/traductions-client";
import { Check } from "lucide-react";
import { PageAcces } from "@/components/acces/page-acces";
import { LONGUEUR_MINIMALE } from "@/lib/auth/mot-de-passe";
import { lirePlafondsPublics } from "@/lib/page-publique/plafonds";
import { routing } from "@/i18n/routing";
import { redirect } from "next/navigation";
import { estLangueSupportee } from "@/i18n/config";
import { entreeDejaOuverte } from "@/lib/comptes/apres-session";

/**
 * L'INSCRIPTION, portée sur `Inscription` et `InscriptionMobile`.
 *
 * ⚠️ SA CHARPENTE N'ÉTAIT PAS LA BONNE. Le code servait celle de la connexion —
 * deux volets, le formulaire à gauche, l'aperçu du téléphone à droite. Les deux
 * planches d'inscription dessinent tout autre chose : une carte pleine largeur,
 * la marque en haut, puis DEUX COLONNES ÉGALES — à gauche l'argumentaire, à
 * droite le formulaire dans sa propre carte encadrée. Ce n'était pas un écart de
 * valeurs, c'était un écran différent.
 *
 * POURQUOI CE DESSIN TIENT. La connexion s'adresse à quelqu'un qui sait déjà ce
 * qu'il vient faire : elle n'a rien à argumenter, d'où l'aperçu du produit. Une
 * inscription, elle, se décide — et ce qui la décide tient en trois phrases que
 * la planche met à la même hauteur que le champ email.
 *
 * MÊME COMPOSANT DE FORMULAIRE QUE LA CONNEXION, et c'est délibéré : le serveur
 * se comporte strictement pareil dans les deux cas. Deux formulaires distincts
 * dériveraient l'un de l'autre, et la première différence de comportement
 * deviendrait un moyen de savoir si une adresse a déjà un compte.
 *
 * ⚠️ LA MENTION LÉGALE EST RENDUE SUR LES DEUX LARGEURS, alors que seule la
 * planche mobile la dessine. C'est l'écran où l'on accepte les conditions ; la
 * procédure de notification et retrait fonde notre statut d'hébergeur (brief
 * §12), et la faire dépendre de la largeur de l'écran n'a aucun sens juridique.
 * L'omission au bureau est très probablement un oubli du canevas — la planche
 * de connexion, elle, la porte des deux côtés.
 */

export function generateStaticParams(): Array<{ locale: string }> {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * ⚠️ RENDU À LA REQUÊTE, ET C'EST UN CORRECTIF, PAS UN RÉGLAGE.
 *
 * DÉFAUT CONSTATÉ EN PILOTANT LE PRODUIT : avec `AUTH_GOOGLE_ACTIF=1` posé au
 * DÉMARRAGE et absent au build, la page de connexion affichait le bouton Google
 * et celle-ci NON. Les deux lisent pourtant le même drapeau, par la même
 * fonction. La connexion attend `searchParams`, donc Next la rend à chaque
 * requête et lit l'environnement du SERVEUR ; l'inscription, elle, était
 * entièrement pré-rendue, et `process.env` y était figé à la COMPILATION.
 *
 * Deux écrans que l'utilisateur enchaîne, sur la même décision, avec deux
 * réponses différentes — et rien ne le signale : chacun a l'air correct
 * isolément. Un drapeau de configuration doit décider au moment où la page est
 * servie, sinon ce n'est pas un drapeau, c'est une constante de build.
 *
 * LE COÛT EST NUL À NOTRE ÉCHELLE : cette page ne lit aucune base, ne pèse rien,
 * et n'est ouverte qu'une fois par compte créé.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "inscription" });
  return { title: t("titre"), robots: { index: false, follow: false } };
}

export default async function Inscription({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Une session déjà ouverte ne repasse pas par le formulaire : voir `entreeDejaOuverte`.
  const dejaOuverte = await entreeDejaOuverte(estLangueSupportee(locale) ? locale : "fr");
  if (dejaOuverte !== null) redirect(dejaOuverte);

  const t = await getTranslations("inscription");
  const { gratuitAVie } = await lirePlafondsPublics();
  const ta = await getTranslations("accueil");
  const garanties = [
    gratuitAVie === null ? ta("garanties.offertesSansNombre") : ta("garanties.offertes", { n: gratuitAVie }),
    ta("garanties.carte"),
    ta("garanties.compte"),
  ];

  /*
   * L'INSCRIPTION DE LA REFONTE (maquette, `inscription.html`) : Google EN
   * PREMIER (s'inscrire par Google évite de choisir un mot de passe ; le
   * fournisseur en Chine trouve le formulaire juste en dessous), les garanties
   * — dont le nombre de commandes offertes, LU EN BASE —, et la phrase de
   * consentement, puisqu'ici on accepte quelque chose. Le consentement reste
   * PAR LA CONTINUATION, sans case bloquante : en ajouter une serait un
   * changement de produit, pas de design.
   */
  return (
    <PageAcces locale={locale} film="minute" legal>
      <header className="acces__tete">
        <h1 tabIndex={-1}>{t("titreCarte")}</h1>
        <p>{t("sousTitreCarte")}</p>
      </header>

      <BoutonGoogle locale={locale} separateur={{ position: "apres", cle: "ou" }} />

      <TraductionsClient espaces={["inscription", "connexion"]}>
        <FormulaireInscription locale={locale} longueurMinimale={LONGUEUR_MINIMALE} />
      </TraductionsClient>

      <ul className="l4-garanties v4-garanties">
        {garanties.map((g) => (
          <li key={g}>
            <Check aria-hidden="true" className="ic" />
            {g}
          </li>
        ))}
      </ul>
      <p className="acces__bascule">
        {t("dejaCompteTexte")}{" "}
        <Link className="lien-texte" href={`/${locale}/connexion`}>
          {t("lienSeConnecter")}
        </Link>
      </p>
    </PageAcces>
  );
}
