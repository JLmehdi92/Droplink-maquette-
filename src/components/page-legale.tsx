import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowRight, Building2, CalendarDays, ChevronDown, FileText, ListFilter, Scale, Shield } from "lucide-react";
import { z } from "zod";
import { Encart, Liste, Paragraphe, SousTitre, Tableau } from "@/components/docs/briques";
import { CoqueSite } from "@/components/public/coque-site";
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
 * LE SOMMAIRE SUIT LA LECTURE, comme dans la maquette (`public.js`) : la section
 * active est la dernière dont le titre a passé le tiers haut de l'écran. C'est
 * l'îlot des pages publiques (`AnimationsPubliques`) qui la marque — rendu par le
 * serveur, le sommaire n'a AUCUNE entrée active (un marquage figé sur la première
 * mentirait dès qu'on défile) ; sans JavaScript, il reste un sommaire. Au téléphone
 * il est REPLIÉ en tête du document (15/09/2026) : dépliées, ses dix entrées de
 * 44 px passaient avant le texte ; le volet dit la section en cours et se referme
 * au choix d'une section.
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

  const liensSommaire = (
    <>
      {sections.map((s, i) => (
        <a key={s.id} href={`#${s.id}`} data-ancre={s.id}>
          {`${i + 1}. ${s.titre}`}
        </a>
      ))}
      <p className="doc-nav__groupe">{t("piedTitre")}</p>
      <Link href={`/${locale}/conditions`} aria-current={sorte === "conditions" ? "page" : undefined}>
        {t("conditionsTitre")}
      </Link>
      <Link href={`/${locale}/confidentialite`} aria-current={sorte === "confidentialite" ? "page" : undefined}>
        {t("confidentialiteTitre")}
      </Link>
      <Link href={`/${locale}/mentions-legales`} aria-current={sorte === "mentions" ? "page" : undefined}>
        {t("mentionsTitre")}
      </Link>
    </>
  );

  /* LA REFONTE (02/10/2026) suit `conditions.html` : en-tête de page, puis le sommaire et
     l'encart de signalement à gauche, le texte à droite, sections numérotées. Le texte
     reste celui du kit légal recopié dans les catalogues (`legal.pages`), validé par Zod.

     LE SOMMAIRE : une colonne au bureau, un `<details>` replié au téléphone — deux
     rendus du même contenu, chacun masqué à l'autre largeur, plutôt qu'un script qui
     ouvrirait l'un ou l'autre. Le suivi de lecture (`data-sommaire`) les marque tous
     les deux. */
  return (
    <CoqueSite locale={locale} page="legal">
      <main id="contenu" className="pub">
        <section className="pub-tete conteneur">
          <p className="l4-etiquette">
            <span>
              <IconePastille aria-hidden="true" className="ic" />
            </span>
            {pastille}
          </p>
          <h1 className="pub-titre l4-titre">
            <span className="l4-ligne" style={{ "--l": 0 } as React.CSSProperties}>
              {titre}
            </span>
          </h1>
          <p className="leg-meta">
            <CalendarDays aria-hidden="true" className="ic" />
            {/* Une seule chaîne par ligne, ponctuation comprise : « : » prend une espace
                avant en français, aucune en anglais ni en chinois. */}
            {t("misAJourDate", { date: dateMaj })}
            <span aria-hidden="true">·</span>
            <Building2 aria-hidden="true" className="ic" />
            {t("editeurLigne", { nom: t("editeurNom") })}
          </p>
        </section>
        <div className="conteneur doc leg">
          <aside className="doc-cote" data-sommaire>
            <details className="doc-sommaire sommaire--telephone">
              <summary>
                <ListFilter aria-hidden="true" className="ic" />
                <span>{t("sommaireTitre")}</span>
                <b data-sommaire-courant>{sections[0] === undefined ? null : `1. ${sections[0].titre}`}</b>
                <ChevronDown aria-hidden="true" className="ic" />
              </summary>
              <nav className="doc-nav" aria-label={t("sommaireTitre")} data-sommaire-nav>
                {liensSommaire}
              </nav>
            </details>
            <nav className="doc-nav sommaire--bureau" aria-label={t("sommaireTitre")} data-sommaire-nav>
              {liensSommaire}
            </nav>
            {/* L'ENCART DE SIGNALEMENT : la procédure de notification et retrait fonde
                notre statut d'hébergeur (brief §12), et c'est à côté des conditions qu'on
                la cherche. Seulement si la page de signalement existe. */}
            {signalable ? (
              <div className="leg-encart v4-carte">
                <b>{t("encartSignalerTitre")}</b>
                <p>{t("encartSignalerTexte")}</p>
                <Link className="lien-texte min-h-11" href={`/${locale}/signalement`}>
                  {t("encartSignalerLien")}
                  <ArrowRight aria-hidden="true" className="ic" />
                </Link>
              </div>
            ) : null}
          </aside>
          <article className="doc-article leg-article">
            <p className="leg-chapeau">{chapeau}</p>
            {sections.map((s, i) => (
              <section key={s.id} className="doc-section" id={s.id} aria-labelledby={"h-" + s.id}>
                <h2 id={"h-" + s.id}>
                  <span className="leg-n">{String(i + 1).padStart(2, "0")}</span>
                  {s.titre}
                </h2>
                {s.blocs.map((b, j) => (
                  <BlocLegal key={j} bloc={b} />
                ))}
              </section>
            ))}
            {/* AU TÉLÉPHONE, L'ENCART VIENT EN FIN DE DOCUMENT : la colonne qui le porte
                au bureau n'existe plus, et le mettre en tête retarderait le texte. */}
            {signalable ? (
              <div className="leg-encart leg-encart--telephone v4-carte">
                <b>{t("encartSignalerTitre")}</b>
                <p>{t("encartSignalerTexte")}</p>
                <Link className="lien-texte min-h-11" href={`/${locale}/signalement`}>
                  {t("encartSignalerLien")}
                  <ArrowRight aria-hidden="true" className="ic" />
                </Link>
              </div>
            ) : null}
          </article>
        </div>
      </main>
    </CoqueSite>
  );
}
