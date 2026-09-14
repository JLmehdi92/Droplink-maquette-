import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { Inter } from "next/font/google";
import { ArrowRight, Unlink } from "lucide-react";
import { CLASSE_ACTION_ERREUR, EcranErreurPublic } from "@/components/ecran-erreur-public";
import { routing } from "@/i18n/routing";
import "./globals.css";

/**
 * CE QUE VOIT QUELQU'UN QUI SUIT UNE ADRESSE QUI N'EXISTE PAS.
 *
 * ⚠️ DÉFAUT MESURÉ LE 03/09/2026, sur un build de production servi :
 *
 *   /fr/pas-une-route  → 404 · « 404: This page could not be found. »
 *   /en/pas-une-route  → 404 · la même
 *   /pas-une-route     → 307 vers /fr/…, puis la même
 *
 * C'est la page générique de Next : anglais EN DUR, Times New Roman, hors du
 * canevas, servie sur une locale `fr`. Le produit interdit pourtant toute
 * chaîne visible en dur, et deux frontières avaient déjà été écrites pour cette
 * raison exacte — `[locale]/error.tsx` et `(app)/not-found.tsx`. Ce chemin-ci
 * restait ouvert. Planches `Introuvable`, `IntrouvableMobile`, `IntrouvableEn`,
 * `IntrouvableEnMobile`.
 *
 * ⚠️ POURQUOI `global-not-found` ET NON `app/not-found.tsx`, QUI SERAIT LA
 * RÉPONSE DE LA DOC — quatre montages essayés, chacun mesuré :
 *
 *   `[locale]/not-found.tsx`                     → jamais pris
 *   `[locale]/[...attrapetout]` + son not-found  → jamais pris
 *   … + un `layout.tsx` dans ce segment          → jamais pris
 *   un groupe de routes avec layout + not-found  → jamais pris
 *
 * La charge de rendu dit pourquoi : au niveau `[locale]`, `notFound` vaut
 * `$undefined`, et le composant de repli est attaché au segment RACINE `""`.
 * Or ce dépôt N'A PAS de layout racine, et c'est délibéré : `[locale]/layout.tsx`
 * et `p/[token]/layout.tsx` sont DEUX racines distinctes pour que la page
 * publique ne monte pas le socle d'un tableau de bord — c'est le budget de
 * performance, pas de l'organisation. En introduire une troisième les ferait
 * nicher dedans, donc rendrait deux `<html>` imbriqués, et ferait payer à
 * `/p/{jeton}` exactement ce que la séparation lui épargne.
 *
 * `global-not-found` est le seul montage qui rende son PROPRE `<html>` : il
 * remplace la racine au lieu de s'y ajouter. C'est aussi ce que recommande la
 * documentation de next-intl pour les requêtes hors segment de langue.
 *
 * ⚠️ IL COÛTE UN DRAPEAU EXPÉRIMENTAL — `experimental.globalNotFound`, posé
 * dans `next.config.ts`, où la mesure est écrite. Relevé AVANT de l'accepter,
 * sur huit URL, avec et sans : les deux 404 de langue passent de la page
 * anglaise à celle-ci, et **rien d'autre ne bouge** — l'écran de lien mort du
 * client, la vraie page client, la landing, les conditions et la redirection de
 * l'espace vendeur rendent à l'identique. Le retirer est une ligne.
 *
 * LA LANGUE VIENT DE `x-next-intl-locale`, que le middleware de next-intl pose
 * déjà — mesuré, il vaut bien `en` sur `/en/pas-une-route`. C'est une ENTRÉE
 * EXTERNE : elle est validée contre la liste des langues du produit, et une
 * valeur inconnue retombe sur la langue par défaut au lieu de chercher un
 * catalogue qui n'existe pas.
 *
 * ⚠️ IL PORTE SES POLICES ET SA FEUILLE LUI-MÊME, parce qu'il remplace la
 * racine : sans ces trois imports, l'écran serait rendu dans la police du
 * système et sans aucun des jetons de couleur — c'est-à-dire pas cet écran.
 *
 * ELLE NE DIT PAS POURQUOI. « Mal recopiée, ou retirée » couvre les deux cas
 * sans affirmer lequel : on ne le sait pas, et le prétendre serait affirmer ce
 * que la base n'a pas enregistré.
 */

/* INTER SEULE, AVEC SON AXE OPTIQUE — les mêmes réglages que `[locale]/layout`.
   Plus Jakarta Sans est retirée du design system ; ce fichier la chargeait
   encore le 14/09/2026. */
const corps = Inter({
  variable: "--font-corps",
  subsets: ["latin"],
  axes: ["opsz"],
  display: "swap",
});

export default async function PageIntrouvable() {
  const enTetes = await headers();
  const annoncee = enTetes.get("x-next-intl-locale");
  const langue = hasLocale(routing.locales, annoncee) ? annoncee : routing.defaultLocale;
  const t = await getTranslations({ locale: langue, namespace: "erreurs" });

  return (
    <html lang={langue}>
      <body className={`${corps.variable} antialiased`}>
        {/* React hisse ce titre dans le `<head>`. Il est ici et non dans un
            `metadata` exporté parce que ce fichier ne reçoit aucune propriété :
            un `metadata` statique ne pourrait pas être dans la bonne langue. */}
        <title>{t("introuvableTitre")}</title>
        <meta name="robots" content="noindex, nofollow" />

        {/* `ui_kits/erreurs/introuvable.html`. UN MAILLON ROMPU, PAS UNE LOUPE :
            la loupe dit « votre recherche n'a rien donné » ; ici il n'y a pas eu
            de recherche, il y a une adresse qui ne mène à rien. */}
        <EcranErreurPublic icone={Unlink} titre={t("introuvableTitre")} texte={t("introuvableTexte")}>
          {/*
            UN `<a>` NATIF, PAS UN `<Link>`. Ce fichier remplace la racine :
            il n'y a aucun routeur monté au-dessus de lui, et une navigation
            cliente depuis un écran hors de l'arbre de routes est exactement
            le genre de chemin qui échoue en silence. La destination porte la
            langue résolue — « / » enverrait un visiteur anglophone se faire
            rediriger, donc payer un aller-retour pour rien.
          */}
          <a href={`/${langue}`} className={CLASSE_ACTION_ERREUR}>
            {t("introuvableRetour")}
            <ArrowRight aria-hidden="true" size={18} strokeWidth={1.9} />
          </a>
        </EcranErreurPublic>
      </body>
    </html>
  );
}
