import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { LogoDropLink } from "@/components/logo-droplink";
import { PageClientDemo } from "@/components/landing/page-client-demo";
import { FilmAcces, type TextesFilm } from "@/components/acces/film-acces";
import { lirePlafondsPublics } from "@/lib/page-publique/plafonds";
import { CoucheV4, ScriptEntreeV4 } from "@/components/app/couche-v4";
import { BasculeAcces } from "@/components/acces/bascule-acces";
import symbole from "@/../public/marque/logo-symbole.png";

/**
 * LA PAGE D'ACCÈS DE LA REFONTE (maquette, `connexion.html` / `inscription.html`) :
 * le formulaire dans une colonne, et le FILM posé sur la page à côté.
 *
 * Le film est décoratif (`aria-hidden`) et n'existe qu'au-dessus de 1 020 px ;
 * au téléphone, la colonne seule. Ses textes sont traduits ici, et ses dates
 * formatées dans la langue de la page. Le nombre de commandes offertes est LU EN
 * BASE (jamais écrit dans la page) : illisible, la phrase se dit sans nombre.
 */
export async function PageAcces({
  locale,
  film,
  legal,
  children,
}: {
  readonly locale: string;
  readonly film: "absence" | "minute";
  /** La phrase de consentement : à l'inscription seulement (se reconnecter n'accepte rien). */
  readonly legal: boolean;
  readonly children: React.ReactNode;
}) {
  const t = await getTranslations("acces.film");
  const tc = await getTranslations("connexion");
  const ta = await getTranslations("accueil");
  const nav = await getTranslations("navigation");
  const pp = await getTranslations("page-publique");
  const format = await getFormatter();

  const jour = (iso: string) => format.dateTime(new Date(iso), { day: "numeric", month: "short", timeZone: "UTC" });
  const heure = (iso: string) => format.dateTime(new Date(iso), { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  const datesEtapes = [
    jour("2026-09-28T12:00:00Z"),
    jour("2026-09-29T12:00:00Z"),
    jour("2026-09-30T12:00:00Z"),
    jour("2026-10-01T12:00:00Z"),
  ] as const;

  let textes: TextesFilm;
  if (film === "absence") {
    textes = {
      surtitre: t("absence.surtitre"),
      jour1: jour("2026-09-29T12:00:00Z"),
      jour2: jour("2026-09-30T12:00:00Z"),
      titre1: t("absence.titre1"),
      titre2: t("absence.titre2"),
      n1: t("absence.n1"),
      n1detail: `${t("absence.n1lieu")} · ${jour("2026-09-29T18:19:00Z")} · ${heure("2026-09-29T18:19:00Z")}`,
      n2: t("absence.n2"),
      n2detail: `${t("absence.n2lieu")} · ${jour("2026-09-30T07:19:00Z")} · ${heure("2026-09-30T07:19:00Z")}`,
      consulte: t("absence.consulte"),
      consultations: t("absence.consultations"),
      derniere: t("absence.derniere", { quand: `${jour("2026-09-30T08:12:00Z")} · ${heure("2026-09-30T08:12:00Z")}` }),
      valide1: t("absence.valide1"),
      valide2: t("absence.valide2"),
      quandValide: `${jour("2026-09-30T08:40:00Z")} · ${heure("2026-09-30T08:40:00Z")}`,
      bandeauExpedie: pp("bandeau.expedie"),
      bandeauTransit: pp("bandeau.en_transit"),
      mouvementHier: t("absence.mouvementHier"),
      mouvementAujourdhui: t("absence.mouvementAujourdhui"),
    };
  } else {
    const { gratuitAVie } = await lirePlafondsPublics();
    textes = {
      titre1: t("minute.titre1"),
      titre2: t("minute.titre2"),
      b1: t("minute.b1"),
      b2: t("minute.b2"),
      laCommande: ta("studio.laCommande"),
      enregistre: ta("studio.enregistre"),
      champClient: ta("studio.champClient"),
      champMedias: ta("studio.medias"),
      champSuivi: ta("studio.champSuivi"),
      partager: ta("studio.partager"),
      copie: ta("studio.copie"),
      c1: t("minute.c1"),
      c2: t("minute.c2"),
      pourLea: t("minute.pourLea"),
      photos: t("minute.photos"),
      transit: t("minute.transit"),
      fin: t("minute.fin"),
      offre: gratuitAVie === null ? t("minute.offreSansNombre") : t("minute.offre", { n: gratuitAVie }),
    };
  }

  return (
    <div className="page-acces v4">
      {/* La couche « v4 » (maquette, `v4.js`) : entrée du titre et du formulaire au
          premier chargement réel, bordure lumineuse au pointeur ; et la bascule
          connexion ⇄ inscription sans recharger (`acces.js`). */}
      <ScriptEntreeV4 />
      <CoucheV4 />
      <BasculeAcces />
      <a className="evitement" href="#contenu">
        {nav("allerAuContenu")}
      </a>
      <div className="acces">
        <main className="acces__colonne" id="contenu">
          <Link className="logo acces__logo min-h-11" href={`/${locale}`} aria-label={ta("accueil")}>
            <LogoDropLink />
          </Link>
          <div className="acces__corps">
            <section className="panneau">{children}</section>
          </div>
          {legal ? (
            <p className="acces__legal">
              {tc("cgvAvant")} <Link href={`/${locale}/conditions`}>{tc("cgvConditions")}</Link> {tc("cgvEt")}{" "}
              <Link href={`/${locale}/confidentialite`}>{tc("cgvConfidentialite")}</Link>.
            </p>
          ) : (
            <span aria-hidden="true" />
          )}
        </main>
        <FilmAcces film={film} textes={textes} logo={symbole.src}>
          <PageClientDemo datesEtapes={datesEtapes} />
        </FilmAcces>
      </div>
    </div>
  );
}
