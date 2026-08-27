import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import Link from "next/link";
import { Icone } from "@/components/icone";
import { routing } from "@/i18n/routing";
import { signalementDisponible } from "@/lib/contact";

/**
 * LA LANDING, portée sur le canevas Claude Design.
 *
 * UNE CARTE-PAGE BLANCHE POSÉE SUR LE FOND LAVANDE, et tout le reste dedans :
 * navigation, héros, scène du téléphone, bénéfices, appel final, pied.
 *
 * LE MOUVEMENT EST CONFINÉ À LA SCÈNE DU TÉLÉPHONE, à la demande explicite de
 * Wassim, et il est PUREMENT DÉCORATIF : halos, anneaux, points. Rien n'y porte
 * d'information, donc rien ne se perd quand `prefers-reduced-motion` le coupe —
 * c'est la condition pour avoir le droit de le couper.
 *
 * LE TÉLÉPHONE MONTRE LA PAGE CLIENT, pas une image de synthèse. C'est le
 * produit qu'on vend : une capture inventée serait la seule chose de cette page
 * qu'on ne pourrait pas tenir.
 *
 * DEUX EMPLACEMENTS PORTENT UN CONTENU QUE NOUS N'AVONS PAS ENCORE, et ils le
 * DISENT plutôt que de l'inventer : le nombre de vendeurs et les logos clients.
 * La planche les marque `[NOMBRE]` et `[LOGOS À FOURNIR]`. Un chiffre inventé
 * sur une landing est un mensonge qui se mesure ; ils sont donc simplement
 * OMIS jusqu'à ce qu'ils existent, et l'espace se referme.
 *
 * LE DÉGRADÉ EST SUR L'ACTION PRINCIPALE, et sur elle seule — elle apparaît
 * deux fois, en haut et en bas, parce que la page est longue et que c'est la
 * même action.
 */

export function generateStaticParams(): Array<{ locale: string }> {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "landing" });
  return { title: t("metaTitre"), description: t("metaDescription") };
}

export default async function Accueil({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("landing");
  const nav = await getTranslations("navigation");

  const pilule =
    "inline-flex items-center gap-2 rounded-full border border-outline bg-surface-container-lowest px-3.5 py-[7px] font-label-sm text-[11px] font-semibold tracking-[0.04em] text-on-surface-variant";

  const actionPrincipale =
    "degrade-marque inline-flex h-13 items-center gap-2.5 rounded-full px-[30px] font-label-md text-[15px] font-bold shadow-[0_10px_26px_-10px_rgba(124,92,245,0.65)] transition-opacity hover:opacity-90";

  return (
    <div className="bg-canvas md:p-7">
      <div className="mx-auto w-full max-w-[1384px] overflow-hidden bg-surface-container-lowest md:rounded-page-publique">
        {/* ---- NAVIGATION ------------------------------------------------ */}
        <header className="flex items-center justify-between gap-6 px-margin-mobile py-4 md:px-10 md:py-[22px]">
          <span className="font-headline-md text-[18px] font-extrabold tracking-[-0.02em] text-on-surface">
            DropLink
          </span>

          <nav aria-label={nav("espaceVendeur")} className="hidden gap-[30px] md:flex">
            {(["fonctionnement", "clientVoit", "tarif"] as const).map((clef) => (
              <a
                key={clef}
                href={"#" + clef}
                className="font-body-md text-[14px] font-medium text-on-surface-variant transition-colors hover:text-on-surface"
              >
                {t("menu." + clef)}
              </a>
            ))}
          </nav>

          <Link
            href={`/${locale}/connexion`}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-[18px] font-label-md text-[13px] font-semibold text-on-primary transition-opacity hover:opacity-90 md:h-10"
          >
            {nav("seConnecter")}
            <Icone nom="open_in_new" className="text-[13px]" />
          </Link>
        </header>

        <main id="contenu">
          {/* ---- HÉROS --------------------------------------------------- */}
          <section className="relative overflow-hidden px-margin-mobile pt-8 text-center md:px-10 md:pt-[46px]">
            {/* Le mot en très grand derrière le titre. `aria-hidden` : il est
                déjà lu dans la navigation, et un lecteur d'écran n'a rien à
                faire d'un décor typographique. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-12 hidden text-center font-headline-xl text-[216px] leading-none font-extrabold tracking-[-0.05em] text-surface-container select-none md:block"
            >
              DROPLINK
            </span>

            <div className="relative">
              <h1 className="mx-auto max-w-[830px] font-headline-xl text-[38px] leading-[42px] font-extrabold tracking-[-0.035em] text-on-surface md:text-[66px] md:leading-[70px]">
                {t("heroTitre")}
              </h1>
              <p className="mx-auto mt-5 max-w-[520px] font-body-lg text-[16px] leading-[26px] text-on-surface-variant md:text-[17px] md:leading-[27px]">
                {t("heroSousTitre")}
              </p>
              <div className="mt-7 flex flex-col items-center gap-3">
                <Link href={`/${locale}/inscription`} className={actionPrincipale}>
                  {t("ctaPrincipal")}
                  <Icone nom="arrow_forward" className="text-[15px]" />
                </Link>
                <Link
                  href={`/${locale}/connexion`}
                  className="font-label-md text-[13px] font-semibold text-on-surface-variant hover:underline"
                >
                  {t("ctaSecondaire")}
                </Link>
              </div>
            </div>
          </section>

          {/* ---- LA SCÈNE DU TÉLÉPHONE ----------------------------------- */}
          <section
            id="clientVoit"
            aria-label={t("destinataireTitre")}
            className="relative mt-8 h-[420px] overflow-hidden md:mt-9 md:h-[500px]"
          >
            {/* DÉCOR. Purement décoratif, entièrement `aria-hidden`. */}
            <div aria-hidden="true">
              <div className="anim-halo absolute top-10 left-1/2 -ml-[310px] h-[480px] w-[620px] rounded-full bg-[radial-gradient(circle,rgba(124,92,245,0.16)_0%,rgba(255,255,255,0)_66%)]" />
              <div className="anim-anneau absolute top-[84px] left-[168px] hidden h-[132px] w-[132px] rounded-full border-[1.5px] border-[#ddd5fb] md:block" />
              <div
                className="anim-anneau absolute top-[288px] right-[152px] hidden h-24 w-24 rounded-full border-[1.5px] border-[#fbd9d0] md:block"
                style={{ animationDelay: "2.4s" }}
              />
              <div className="anim-derive absolute top-[336px] left-[330px] hidden h-7 w-7 rounded-[9px] bg-[rgba(124,92,245,0.18)] md:block" />
              <div
                className="anim-derive absolute top-[74px] right-[336px] hidden h-5 w-5 rounded-[7px] bg-[rgba(242,118,94,0.24)] md:block"
                style={{ animationDelay: "4s" }}
              />
              <div
                className="anim-derive absolute top-[402px] left-[232px] hidden h-3 w-3 rounded-full bg-[rgba(242,118,94,0.4)] md:block"
                style={{ animationDelay: "7s" }}
              />
              <div
                className="anim-derive absolute top-[154px] right-[218px] hidden h-3.5 w-3.5 rounded-full bg-[rgba(124,92,245,0.3)] md:block"
                style={{ animationDelay: "9.5s" }}
              />
            </div>

            {/* LE TÉLÉPHONE. Aperçu de la page client — l'en-tête à la couleur
                du vendeur, la grille de photos, la frise. */}
            <div className="absolute top-0 left-1/2 h-[420px] w-[236px] -translate-x-1/2 rounded-[36px] bg-primary p-2 shadow-[0_40px_80px_-30px_rgba(14,14,19,0.45)] md:h-[560px] md:w-[312px] md:rounded-[42px] md:p-[9px]">
              <div className="h-full w-full overflow-hidden rounded-[28px] bg-surface-container-lowest md:rounded-[34px]">
                <div className="degrade-marque px-[18px] pt-6 pb-4 md:pt-[30px]">
                  <div className="flex items-center gap-2">
                    <span className="h-6 w-6 rounded-full bg-white/30" />
                    <span className="font-label-md text-[13px] font-bold">Atelier Nord</span>
                  </div>
                  <p className="mt-2 font-headline-md text-[19px] font-extrabold tracking-[-0.02em]">
                    {t("apercuTitre")}
                  </p>
                </div>

                <div className="p-3.5">
                  <div className="mb-3 grid grid-cols-4 gap-1">
                    {["#e4e2ee", "#eee4e0", "#e0e4ee", "#eaeaef"].map((teinte) => (
                      <span
                        key={teinte}
                        className="block aspect-square rounded-[3px]"
                        style={{ backgroundColor: teinte }}
                      />
                    ))}
                  </div>
                  <div className="mb-1.5 grid grid-cols-4 gap-1">
                    <span className="h-1.5 rounded-full bg-violet" />
                    <span className="h-1.5 rounded-full bg-violet" />
                    <span className="h-1.5 rounded-full bg-violet" />
                    <span className="h-1.5 rounded-full bg-outline-variant" />
                  </div>
                  <p className="font-body-sm text-[10px] text-on-surface-variant">
                    {t("apercuEtape")}
                  </p>
                </div>
              </div>
            </div>

            {/* CARTES FLOTTANTES. Elles disent ce que le produit fait, à côté
                de l'écran qui le montre. Masquées au téléphone : à 390 px, elles
                recouvriraient l'appareil qu'elles commentent. */}
            <div
              className="anim-flot absolute top-[120px] left-[64px] hidden items-center gap-3 rounded-[14px] bg-surface-container-lowest px-3.5 py-3 shadow-[0_18px_40px_-14px_rgba(14,14,19,0.22)] lg:flex"
              style={{ animationDelay: "1.2s" }}
            >
              <span className="flex h-[38px] w-[38px] items-center justify-center rounded-[11px] bg-violet-fond">
                <Icone nom="local_shipping" className="text-[19px] text-violet" />
              </span>
              <span>
                <span className="block font-label-md text-[13px] font-bold text-on-surface">
                  {t("flottant.suiviTitre")}
                </span>
                <span className="mt-0.5 block font-body-sm text-[11px] text-on-surface-variant">
                  {t("flottant.suiviTexte")}
                </span>
              </span>
            </div>

            <div className="anim-flot absolute top-[300px] right-[64px] hidden items-center gap-3 rounded-[14px] bg-surface-container-lowest px-3.5 py-3 shadow-[0_18px_40px_-14px_rgba(14,14,19,0.22)] lg:flex">
              <span className="flex h-[38px] w-[38px] items-center justify-center rounded-[11px] bg-violet-fond">
                <Icone nom="check_circle" className="text-[19px] text-violet" />
              </span>
              <span>
                <span className="block font-label-md text-[13px] font-bold text-on-surface">
                  {t("flottant.valideTitre")}
                </span>
                <span className="mt-0.5 block font-body-sm text-[11px] text-on-surface-variant">
                  {t("flottant.valideTexte")}
                </span>
              </span>
            </div>
          </section>

          {/* ---- BÉNÉFICES ----------------------------------------------- */}
          <section
            id="fonctionnement"
            className="bg-surface-container-low px-margin-mobile py-14 text-center md:px-10 md:pt-[66px] md:pb-[74px]"
          >
            <span className={pilule}>{t("beneficesPilule")}</span>
            <h2 className="mt-5 font-headline-xl text-[30px] leading-[34px] font-extrabold tracking-[-0.03em] text-on-surface md:text-[46px] md:leading-[52px]">
              {t("beneficesTitre")}
            </h2>
            <p className="mx-auto mt-4 mb-11 max-w-[560px] font-body-lg text-[16px] leading-[26px] text-on-surface-variant">
              {t("beneficesTexte")}
            </p>

            <ul className="grid gap-5 text-left md:grid-cols-3">
              {(
                [
                  ["medias", "upload", "bg-violet-fond text-violet"],
                  ["suivi", "schedule", "bg-corail-fond text-corail"],
                  ["marque", "link", "bg-surface-container-high text-on-surface-variant"],
                ] as const
              ).map(([clef, icone, teinte]) => (
                <li key={clef} className="rounded-lg border border-outline-variant p-[26px]">
                  <span
                    className={
                      "flex h-[42px] w-[42px] items-center justify-center rounded-md " + teinte
                    }
                  >
                    <Icone nom={icone} className="text-[21px]" />
                  </span>
                  <h3 className="mt-[18px] mb-2 font-headline-md text-[18px] font-bold tracking-[-0.015em] text-on-surface">
                    {t("fonctionnalites." + clef + "Titre")}
                  </h3>
                  <p className="font-body-md text-[14px] leading-[22px] text-on-surface-variant">
                    {t("fonctionnalites." + clef + "Texte")}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          {/* ---- APPEL FINAL --------------------------------------------- */}
          <section id="tarif" className="px-margin-mobile py-16 text-center md:px-10 md:py-[76px]">
            <h2 className="font-headline-xl text-[28px] leading-[32px] font-extrabold tracking-[-0.03em] text-on-surface md:text-[42px] md:leading-[48px]">
              {t("finalTitre")}
            </h2>
            <p className="mt-3.5 mb-7 font-body-lg text-[16px] leading-[26px] text-on-surface-variant">
              {t("gratuitPourLInstant")}
            </p>
            <Link href={`/${locale}/inscription`} className={actionPrincipale}>
              {t("ctaPrincipal")}
              <Icone nom="arrow_forward" className="text-[15px]" />
            </Link>
          </section>
        </main>

        {/* ---- PIED ------------------------------------------------------ */}
        <footer className="flex flex-col items-center justify-between gap-4 border-t border-outline-variant px-margin-mobile py-7 md:flex-row md:px-10">
          <span className="font-headline-md text-[15px] font-extrabold tracking-[-0.02em] text-on-surface">
            DropLink
          </span>
          {/*
            LE LIEN DE SIGNALEMENT DISPARAÎT QUAND LE CANAL N'EXISTE PAS, et ce
            n'est pas un détail d'affichage : c'est la procédure de notification
            et retrait qui fonde notre statut d'hébergeur (brief §12).

            ⚠️ DÉFAUT TROUVÉ EN PILOTANT LE PRODUIT LE 27/08/2026. Cette landing
            porte SON PROPRE pied de page — celui du canevas, horizontal, qui
            n'est pas celui de `PiedDePage` — et la garde n'y avait pas été
            recopiée. Elle écrivait donc le lien SANS CONDITION, vers une page
            qui rend 404 tant qu'aucune adresse n'est configurée. Le premier
            clic d'un visiteur qui cherche à signaler un contenu tombait dans le
            vide, sur la seule page que tout le monde voit.

            La garde est recopiée plutôt que le composant partagé importé : les
            deux pieds n'ont pas le même dessin, et la planche fait foi. Ce qui
            se partage ici, c'est la RÈGLE, pas la mise en page.
          */}
          <nav aria-label={t("piedNavigation")} className="flex flex-wrap justify-center gap-6">
            {(
              [
                ["conditions", `/${locale}/conditions`],
                ["confidentialite", `/${locale}/confidentialite`],
                ...(signalementDisponible()
                  ? ([["signalement", `/${locale}/signalement`]] as const)
                  : []),
              ] as const
            ).map(([clef, href]) => (
              <Link
                key={clef}
                href={href}
                className="font-body-md text-[13px] font-medium text-on-surface-variant transition-colors hover:text-on-surface"
              >
                {t("pied." + clef)}
              </Link>
            ))}
          </nav>
        </footer>
      </div>
    </div>
  );
}
