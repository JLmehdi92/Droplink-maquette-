import { getFormatter, getTranslations } from "next-intl/server";
import {
  ecartPeriodePrecedente,
  jamaisOuvertes,
  partAvecSuivi,
  vuesParCommandeOuverte,
  type Activite,
} from "@/lib/analyses/activite";

/**
 * LES QUATRE COMPTEURS DE TÊTE, portés sur `Analyses` et `AnalysesMobile`.
 *
 * QUATRE, ET LE QUATRIÈME EST EN ALERTE. « Jamais ouvertes » est le seul qui
 * appelle un geste du vendeur : une commande créée dont le client n'a jamais
 * ouvert le lien est un lien qui n'a pas été envoyé, ou qui n'a pas été cliqué.
 * Peindre les quatre reviendrait à n'en peindre aucun.
 *
 * ⚠️ L'ALERTE S'ÉTEINT QUAND IL N'Y A RIEN À SIGNALER. La planche montre « 7 »
 * en corail parce qu'elle montre un compte actif ; à zéro, le même corail
 * signalerait le succès. Le brief tranche déjà ce cas pour le veilleur : « une
 * alerte qui se trompe est une alerte qu'on apprend à ignorer ».
 *
 * ⚠️ UNE VALEUR ABSENTE S'ÉCRIT « — », JAMAIS « 0 ». Zéro affirme qu'on a
 * mesuré et trouvé rien ; l'absence de commande n'affirme rien. Les deux se
 * ressemblent trop à l'écran pour être rendus pareil là où on décide.
 */
export async function CompteursAnalyses({ activite }: { readonly activite: Activite }) {
  const t = await getTranslations("analyses");
  const format = await getFormatter();

  const nombreOuTiret = (v: number | null, suffixe = ""): string =>
    v === null ? "—" : format.number(v) + suffixe;

  const ecart = ecartPeriodePrecedente(activite);
  const jamais = jamaisOuvertes(activite);
  const enAlerte = jamais !== null && jamais > 0;

  /*
   * ⚠️ LE TÉLÉPHONE N'A PAS LES MÊMES LIBELLÉS, et ce n'est pas une troncature :
   * `AnalysesMobile` les RÉÉCRIT. « +12 vs période précédente » devient « +12 »,
   * « le client revient plusieurs fois » devient « le client revient »,
   * « Commandes avec suivi » devient « Avec suivi ». Dans 174 px de carte, la
   * phrase longue passe sur deux lignes et fait grandir la carte de 15 px —
   * mesuré. Deux textes, pas un texte coupé : couper au milieu d'un mot est ce
   * qu'on obtiendrait en laissant la version longue déborder.
   *
   * ⚠️ CE SONT LES COLONNES QUI BASCULENT À `xl`, PAS LES LIBELLÉS. Mesuré à
   * 1 024 px : quatre colonnes ne laissent que 159 px par carte, et les libellés
   * longs y passent sur deux lignes — les cartes montaient à 157 px au lieu de
   * 127. La grille reste donc à DEUX colonnes jusqu'à 1 280, comme au téléphone,
   * et les cartes y sont alors assez larges pour les textes du bureau. Les
   * planches ne dessinent que 390 et 1 440 ; entre les deux, c'est la place qui
   * tranche, et elle se mesure.
   */
  const signe = ecart === null ? "" : ecart > 0 ? "+" + format.number(ecart) : format.number(ecart);

  const cartes = [
    {
      cle: "commandesCreees",
      valeur: format.number(activite.commandesCreees),
      court: ecart === null ? t("aucuneComparaison") : signe,
      long: ecart === null ? t("aucuneComparaison") : t("ecartPrecedent", { n: signe }),
      // Le sens de la variation est une COULEUR, parce que c'est la seule
      // information de l'écran qui dise une direction. Une baisse rendue du
      // même vert qu'une hausse serait une métrique faussée du côté rassurant.
      teinte: ecart === null ? "sourdine" : ecart > 0 ? "succes" : ecart < 0 ? "alerte" : "sourdine",
      alerte: false,
    },
    {
      cle: "vuesMoyennes",
      valeur: nombreOuTiret(vuesParCommandeOuverte(activite)),
      court: t("leClientRevientCourt"),
      long: t("leClientRevient"),
      teinte: "sourdine",
      alerte: false,
    },
    {
      cle: "avecSuivi",
      valeur: nombreOuTiret(partAvecSuivi(activite), " %"),
      court: t("partSur", { n: activite.avecSuivi, total: activite.commandesCreees }),
      long: t("partSur", { n: activite.avecSuivi, total: activite.commandesCreees }),
      teinte: "sourdine",
      alerte: false,
    },
    {
      cle: "jamaisOuvertes",
      valeur: nombreOuTiret(jamais),
      court: enAlerte ? t("aRelancer") : t("toutesOuvertes"),
      long: enAlerte ? t("aRelancer") : t("toutesOuvertes"),
      teinte: enAlerte ? "alerte" : "sourdine",
      alerte: enAlerte,
    },
  ] as const;

  const TEINTE: Record<string, string> = {
    succes: "font-headline-md font-semibold text-succes",
    alerte: "font-headline-md text-alerte",
    sourdine: "font-body-sm text-sourdine",
  };

  return (
    <section
      aria-label={t("compteurs")}
      className="grid grid-cols-2 gap-2.5 lg:gap-3 xl:grid-cols-4"
    >
      {cartes.map((c) => (
        <div
          key={c.cle}
          className={
            "rounded-lg border p-[18px] lg:rounded-[18px] lg:p-5 " +
            (c.alerte
              ? "border-alerte-filet bg-alerte-fond"
              : "border-outline-variant bg-surface-container-lowest")
          }
        >
          <p
            className={
              "mb-[7px] font-body-sm text-[12px] leading-[15px] lg:mb-2 " +
              (c.alerte ? "text-alerte" : "text-sourdine")
            }
          >
            <span className="lg:hidden">{t(`carteCourt.${c.cle}`)}</span>
            <span className="hidden lg:inline">{t(`carte.${c.cle}`)}</span>
          </p>
          <p
            className={
              "font-headline-lg text-[27px] leading-[34px] font-extrabold tracking-[-0.035em] lg:text-[32px] lg:leading-10 " +
              (c.alerte ? "text-alerte" : "text-on-surface")
            }
          >
            {c.valeur}
          </p>
          <p
            className={
              "mt-1.5 text-[12px] leading-[15px] lg:mt-[7px] " +
              (c.alerte ? "font-headline-md text-alerte" : (TEINTE[c.teinte] ?? "font-body-sm text-sourdine"))
            }
          >
            <span className="lg:hidden">{c.court}</span>
            <span className="hidden lg:inline">{c.long}</span>
          </p>
        </div>
      ))}
    </section>
  );
}
