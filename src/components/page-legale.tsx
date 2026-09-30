import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowRight, Building2, CalendarDays, FileText, Scale, Shield } from "lucide-react";
import { z } from "zod";
import { LogoMarque } from "@/components/acces/coque-acces";
import { Encart, Liste, Paragraphe, SousTitre, Tableau } from "@/components/docs/briques";
import { SommaireRepliable } from "@/components/sommaire-repliable";
import { signalementDisponible } from "@/lib/contact";
import { PRIX_PRO_EUR } from "@/lib/paiement/plan";

export type SorteLegale = "conditions" | "confidentialite" | "mentions";

/*
 * LE TEXTE DES TROIS PAGES VIT DANS `legal.pages`, RECOPIÉ DU KIT.
 *
 * Il est écrit d'abord dans `ui_kits/legal/contenu-legal-<langue>.js` (29/09/2026)
 * puis recopié tel quel : la planche et le site rendent la même structure — les
 * mêmes sections, les mêmes blocs — et c'est ce qui permet de les SOUSTRAIRE.
 * Le texte se lit par `t.raw` (aucune interpolation ICU : un paragraphe qui
 * contient une accolade ou une apostrophe ne doit rien déclencher), et il est
 * VALIDÉ ici : un bloc mal formé dans un catalogue lève au rendu, au lieu de
 * disparaître en silence d'un document qui engage.
 */
const Bloc = z.union([
  z.object({ p: z.string(), si: z.literal("signalement").optional() }).strict(),
  z.object({ h3: z.string() }).strict(),
  z.object({ ul: z.array(z.string()).min(1) }).strict(),
  z
    .object({
      table: z
        .object({ entetes: z.array(z.string()).min(1), lignes: z.array(z.array(z.string())).min(1) })
        // Une cellule de trop ou de moins décalerait toutes les colonnes d'un
        // tableau de durées ou de prestataires : on LÈVE plutôt que de mal rendre.
        .refine((t) => t.lignes.every((l) => l.length === t.entetes.length), {
          message: "une ligne de tableau n'a pas autant de cellules que l'en-tête",
        }),
    })
    .strict(),
  z.object({ encart: z.object({ ton: z.enum(["info", "alerte"]), titre: z.string(), texte: z.string() }) }).strict(),
]);
type Bloc = z.infer<typeof Bloc>;

const DocumentLegal = z.object({
  titre: z.string(),
  pastille: z.string(),
  chapeau: z.string(),
  sections: z.array(z.object({ id: z.string(), titre: z.string(), blocs: z.array(Bloc).min(1) })).min(1),
});

/**
 * Le document d'une sorte, lu et validé, blocs conditionnels résolus.
 *
 * `si: "signalement"` : le bloc cite la page de signalement, qui rend 404 tant
 * qu'aucune adresse n'est configurée (`signalementDisponible`). Le citer alors
 * serait promettre un canal qui ne mène nulle part — le défaut du 31/08/2026,
 * quand les conditions parlaient d'un formulaire injoignable.
 */
export function documentLegal(
  brut: unknown,
  signalable: boolean,
  valeurs: Readonly<Record<string, string>>,
): z.infer<typeof DocumentLegal> {
  const doc = DocumentLegal.parse(remplir(brut, valeurs));
  return {
    ...doc,
    sections: doc.sections.map((s) => ({
      ...s,
      blocs: s.blocs.filter((b) => !("si" in b) || b.si === undefined || signalable),
    })),
  };
}

/**
 * Remplit les gabarits `{nom}` du texte — le prix du Pro, qui n'existe qu'à UN
 * endroit (`PRIX_PRO_EUR`) et ne s'écrit jamais en dur dans un catalogue.
 * Un gabarit sans valeur LÈVE : « {prixPro} » affiché dans des conditions
 * d'utilisation vaudrait une clause sans prix.
 */
function remplir(noeud: unknown, valeurs: Readonly<Record<string, string>>): unknown {
  if (typeof noeud === "string") {
    return noeud.replace(/\{(\w+)\}/g, (_, nom: string) => {
      const valeur = valeurs[nom];
      if (valeur === undefined) throw new Error(`gabarit sans valeur dans un texte légal : {${nom}}`);
      return valeur;
    });
  }
  if (Array.isArray(noeud)) return noeud.map((n) => remplir(n, valeurs));
  if (noeud !== null && typeof noeud === "object") {
    return Object.fromEntries(Object.entries(noeud).map(([k, v]) => [k, remplir(v, valeurs)]));
  }
  return noeud;
}

function BlocLegal({ bloc }: { readonly bloc: Bloc }) {
  if ("p" in bloc) return <Paragraphe>{bloc.p}</Paragraphe>;
  if ("h3" in bloc) return <SousTitre>{bloc.h3}</SousTitre>;
  if ("ul" in bloc) return <Liste items={bloc.ul} />;
  if ("table" in bloc) return <Tableau entetes={bloc.table.entetes} lignes={bloc.table.lignes} />;
  return (
    <Encart ton={bloc.encart.ton} titre={bloc.encart.titre}>
      {bloc.encart.texte}
    </Encart>
  );
}

/**
 * Date de dernière rédaction de ces textes.
 *
 * Elle est écrite ici et non dans les catalogues : c'est un FAIT, pas une chaîne
 * à traduire, et le même fait doit valoir dans toutes les langues. La mettre à
 * jour est le geste qui accompagne toute modification du contenu légal — une
 * date figée sur un texte modifié affirme un état qui n'existe plus.
 */
const DERNIERE_MAJ = new Date("2026-09-30T00:00:00Z");

/**
 * LES PAGES LÉGALES, portées sur le kit `legal`.
 *
 * ⚠️ LE KIT ET LE PRODUIT PORTENT DÉSORMAIS LE MÊME TEXTE (29/09/2026). Jusque-là
 * on portait la coque du kit et pas son texte : le kit rédigeait un gabarit
 * (Pro à 19,90 €, « 10 commandes par mois », pastilles « à compléter ») que le
 * produit ne pouvait pas afficher. Le texte a été réécrit DANS LE KIT depuis le
 * fonctionnement réel du service — audit RGPD du 29/09/2026 — avec l'identité
 * réelle de l'éditeur (Mahfoud SEDDIKI, EI), puis recopié ici.
 *
 * CE QUE LE TEXTE AFFIRME, LA BASE LE TIENT, et chaque durée a sa source : un
 * an après suppression (157), quatre-vingt-dix jours pour les réponses brutes
 * des transporteurs (075), vingt-quatre heures pour une demande d'e-mail non
 * confirmée, treize mois pour les vues, trois ans pour les archives de paiement
 * (206), la suppression refusée tant qu'un prélèvement peut avoir lieu (206-207).
 *
 * ⚠️ CE QUI RESTE VRAI : le brief exige une relecture par un juriste avant toute
 * ouverture publique, et aucun médiateur de la consommation n'est encore
 * désigné — les conditions n'en citent donc aucun plutôt que d'en inventer un.
 *
 * LE SOMMAIRE EST UN VRAI SOMMAIRE, SANS ENTRÉE « ACTIVE ». Le kit suit le
 * défilement en JavaScript pour surligner la section courante ; un marquage
 * figé sur la première ment dès qu'on défile, et le suivi coûterait un îlot
 * client sur une page de texte. Au téléphone il est REPLIÉ en tête du document
 * (15/09/2026) : dépliées, ses dix entrées de 44 px passaient avant le texte.
 *
 * Ces pages restent indexables — contrairement aux pages de commande. Un
 * hébergeur dont les conditions ne sont pas consultables se prive du statut
 * qu'elles servent à établir.
 */
export async function PageLegale({
  locale,
  sorte,
}: {
  readonly locale: string;
  readonly sorte: SorteLegale;
}) {
  const t = await getTranslations("legal");
  const nav = await getTranslations("navigation");
  const landing = await getTranslations("landing");
  const format = await getFormatter();
  const dateMaj = format.dateTime(DERNIERE_MAJ, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  const signalable = signalementDisponible();
  const prixPro = format.number(PRIX_PRO_EUR, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const { titre, pastille, chapeau, sections } = documentLegal(t.raw(`pages.${sorte}`), signalable, { prixPro });
  const IconePastille = sorte === "conditions" ? FileText : sorte === "confidentialite" ? Shield : Scale;

  /* LES LIENS D'EN-TÊTE ET DE PIED SONT DES CIBLES TACTILES : 44 px au
     téléphone, compensés par la marge négative, et la hauteur de leur texte au
     bureau, comme au kit. */
  const lienEntete =
    "-my-3.5 hidden min-h-11 items-center text-[14.5px] font-medium text-ds-texte-corps hover:text-ds-accent-encre sm:inline-flex md:my-0 md:min-h-0";

  const encartSignalement = signalable ? (
    <div className="rounded-ds-card-lg border border-ds-filet bg-ds-surface-carte p-4">
      <p className="text-[14px] font-bold text-ds-texte-fort">{t("encartSignalerTitre")}</p>
      <p className="mt-1.5 mb-3 text-[13px] leading-[1.5] text-ds-texte-corps">
        {t("encartSignalerTexte")}
      </p>
      <Link
        href={`/${locale}/signalement`}
        className="-my-3.5 inline-flex min-h-11 items-center text-[13.5px] font-semibold text-ds-texte-lien hover:text-ds-accent-encre"
      >
        {t("encartSignalerLien")}
      </Link>
    </div>
  ) : null;

  const sommaire = (
    <nav aria-label={t("sommaireTitre")} className="flex flex-col gap-[3px]">
      <span className="px-3 pb-1.5 text-[11.5px] font-bold tracking-[0.08em] text-ds-texte-tenu uppercase">
        {t("sommaireTitre")}
      </span>
      {sections.map((s, i) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          className="flex min-h-11 items-center rounded-ds-sm px-3 py-2 text-[14px] font-medium text-ds-texte-corps transition-colors hover:bg-ds-surface-teinte hover:text-ds-accent-encre md:block md:min-h-0"
        >
          {`${i + 1}. ${s.titre}`}
        </a>
      ))}
      <div className="mt-[18px] flex flex-col gap-2 border-t border-ds-filet px-3 pt-4">
        <Link
          href={`/${locale}/conditions`}
          className="-my-3.5 inline-flex min-h-11 items-center text-[13.5px] text-ds-texte-corps hover:text-ds-accent-encre md:my-0 md:min-h-0"
        >
          {t("conditionsTitre")}
        </Link>
        <Link
          href={`/${locale}/confidentialite`}
          className="-my-3.5 inline-flex min-h-11 items-center text-[13.5px] text-ds-texte-corps hover:text-ds-accent-encre md:my-0 md:min-h-0"
        >
          {t("confidentialiteTitre")}
        </Link>
        <Link
          href={`/${locale}/mentions-legales`}
          className="-my-3.5 inline-flex min-h-11 items-center text-[13.5px] text-ds-texte-corps hover:text-ds-accent-encre md:my-0 md:min-h-0"
        >
          {t("mentionsTitre")}
        </Link>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen flex-col bg-[linear-gradient(180deg,#FAF9FE_0%,#FBFAFE_60%,#F8F3FD_100%)] bg-fixed leading-[normal]">
      {/*
        L'EN-TÊTE DU KIT, COLLANT ET TRANSLUCIDE. Le flou est autorisé ici : la
        règle 2 ne l'interdit que sur `/p/[token]`, et cette surface est la
        nôtre.
      */}
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-2.5 border-b border-ds-filet bg-[rgba(255,255,255,0.82)] px-3.5 py-2.5 backdrop-blur-[12px] md:gap-5 md:px-[34px] md:py-4">
        {/* Le saut au contenu doit rester le premier élément focusable. */}
        <a
          href="#contenu"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-ds-sm focus:bg-ds-surface-carte focus:px-4 focus:py-2 focus:text-ds-texte-fort focus:shadow-ds-md"
        >
          {nav("allerAuContenu")}
        </a>
        <Link href={`/${locale}`} className="inline-flex min-h-11 items-center md:min-h-0">
          <LogoMarque hauteur={30} />
        </Link>
        <span className="rounded-ds-pill border border-ds-violet-200 bg-ds-surface-teinte px-[11px] py-[5px] text-[12px] font-bold text-ds-accent-encre">
          {t("pastille")}
        </span>
        <span className="flex-1" />
        <Link href={`/${locale}/docs`} className={lienEntete}>
          {landing("menu.docs")}
        </Link>
        <Link href={`/${locale}`} className={lienEntete}>
          {t("accueil")}
        </Link>
        {/* LE SEUL DÉGRADÉ DE L'ÉCRAN — règle 3. */}
        <Link
          href={`/${locale}/inscription`}
          className="degrade-ds-marque inline-flex h-11 items-center gap-2 rounded-ds-pill border border-transparent px-[22px] text-[14px] font-semibold tracking-[-0.02em] text-ds-texte-sur-marque shadow-ds-brand transition-shadow hover:shadow-ds-brand-hover"
        >
          {nav("creerCompte")}
          <ArrowRight aria-hidden="true" size={16} strokeWidth={1.9} />
        </Link>
      </header>

      <main className="mx-auto grid w-full max-w-[1240px] flex-1 grid-cols-[minmax(0,1fr)] items-start gap-7 px-4 pt-6 pb-12 min-[980px]:grid-cols-[268px_minmax(0,1fr)] min-[980px]:gap-12 min-[980px]:px-[34px] min-[980px]:pt-10 min-[980px]:pb-20">
        <aside className="min-[980px]:sticky min-[980px]:top-24">
          {/* Au téléphone replié — dix entrées de 44 px passaient avant le texte —,
              dans la colonne au bureau. Voir `SommaireRepliable`. */}
          <SommaireRepliable titre={t("sommaireTitre")} masque="min-[980px]:hidden">
            {sommaire}
          </SommaireRepliable>
          <div className="hidden min-[980px]:block">{sommaire}</div>

          {/* L'ENCART DE SIGNALEMENT — écrit au kit le 29/09/2026 : la procédure
              de notification et retrait fonde notre statut d'hébergeur (brief
              §12), et c'est ici, à côté des conditions, qu'on la cherche. */}
          {encartSignalement === null ? null : (
            <div className="mt-[22px] hidden min-[980px]:block">{encartSignalement}</div>
          )}
        </aside>

        <article id="contenu" className="max-w-[780px] min-w-0">
          <span className="inline-flex items-center gap-2 rounded-ds-pill border border-ds-violet-200 bg-ds-surface-teinte px-3.5 py-[7px] text-[12.5px] font-bold text-ds-accent-encre">
            <IconePastille aria-hidden="true" size={14} strokeWidth={2} />
            {pastille}
          </span>
          <h1 className="mt-5 text-[27px] leading-[1.06] font-extrabold tracking-[-0.045em] text-balance text-ds-texte-fort sm:text-[32px] md:text-[44px]">
            {titre}
          </h1>

          <div className="mt-[18px] mb-[22px] flex flex-wrap items-center gap-4 border-y border-ds-filet pt-3.5 pb-1 text-[12.5px] text-ds-texte-sourdine">
            <span className="flex items-center gap-[7px]">
              <CalendarDays aria-hidden="true" size={14} strokeWidth={1.9} />
              {/* Une seule chaîne par ligne, ponctuation comprise : « : » prend
                  une espace avant en français et aucune en anglais ni en
                  chinois — la coller dans le code l'imposait aux trois. */}
              {t("misAJourDate", { date: dateMaj })}
            </span>
            <span className="flex items-center gap-[7px]">
              <Building2 aria-hidden="true" size={14} strokeWidth={1.9} />
              {t("editeurLigne", { nom: t("editeurNom") })}
            </span>
          </div>

          <Paragraphe>{chapeau}</Paragraphe>

          {sections.map((s, i) => (
            <section key={s.id}>
              <h2
                id={s.id}
                className="mt-12 mb-3.5 scroll-mt-24 text-[21px] leading-[1.1] font-extrabold tracking-[-0.035em] text-balance text-ds-texte-fort sm:text-[23px] md:text-[28px]"
              >
                {`${i + 1}. ${s.titre}`}
              </h2>
              {s.blocs.map((b, j) => (
                <BlocLegal key={j} bloc={b} />
              ))}
            </section>
          ))}

          {/* AU TÉLÉPHONE L'ENCART DE SIGNALEMENT VIENT EN FIN DE DOCUMENT : il
              n'y a pas de colonne pour le porter, et le mettre en tête
              retarderait le texte qu'on vient lire. */}
          {encartSignalement === null ? null : (
            <div className="mt-[34px] min-[980px]:hidden">{encartSignalement}</div>
          )}
        </article>
      </main>

      <footer className="flex flex-wrap items-center gap-[18px] border-t border-ds-filet px-4 py-[26px] md:px-[34px]">
        <LogoMarque hauteur={22} />
        <span className="min-w-20 flex-1" />
        <nav aria-label={t("piedTitre")} className="flex flex-wrap gap-x-[18px]">
          <Link
            href={`/${locale}/conditions`}
            className="-my-3.5 inline-flex min-h-11 items-center text-[13px] text-ds-texte-corps hover:text-ds-accent-encre md:my-0 md:min-h-0"
          >
            {t("piedConditions")}
          </Link>
          <Link
            href={`/${locale}/confidentialite`}
            className="-my-3.5 inline-flex min-h-11 items-center text-[13px] text-ds-texte-corps hover:text-ds-accent-encre md:my-0 md:min-h-0"
          >
            {t("piedConfidentialite")}
          </Link>
          <Link
            href={`/${locale}/mentions-legales`}
            className="-my-3.5 inline-flex min-h-11 items-center text-[13px] text-ds-texte-corps hover:text-ds-accent-encre md:my-0 md:min-h-0"
          >
            {t("piedMentions")}
          </Link>
          {signalable ? (
            <Link
              href={`/${locale}/signalement`}
              className="-my-3.5 inline-flex min-h-11 items-center text-[13px] text-ds-texte-corps hover:text-ds-accent-encre md:my-0 md:min-h-0"
            >
              {t("piedSignaler")}
            </Link>
          ) : null}
        </nav>
        <span className="text-[13px] text-ds-texte-sourdine">
          {nav("piedDePage", { annee: new Date().getFullYear() })}
        </span>
      </footer>
    </div>
  );
}
