import { getFormatter, getTranslations } from "next-intl/server";
import { Eye, Link as LinkIcon, Package, Truck } from "lucide-react";
import { TuileMetrique } from "@/components/app/tuile-metrique";
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
      Icone: Package,
      teinte: "marque" as const,
      valeur: format.number(activite.commandesCreees),
      court: ecart === null ? t("aucuneComparaison") : signe,
      long: ecart === null ? t("aucuneComparaison") : t("ecartPrecedent", { n: signe }),
      // Le sens de la variation est une COULEUR, parce que c'est la seule
      // information de l'écran qui dise une direction. Une baisse rendue du
      // même vert qu'une hausse serait une métrique faussée du côté rassurant.
      encre:
        ecart === null
          ? "text-ds-texte-sourdine"
          : ecart > 0
            ? "font-semibold text-ds-succes"
            : ecart < 0
              ? "font-semibold text-ds-alerte"
              : "text-ds-texte-sourdine",
      alerte: false,
    },
    {
      cle: "vuesMoyennes",
      Icone: Eye,
      teinte: "info" as const,
      valeur: nombreOuTiret(vuesParCommandeOuverte(activite)),
      court: t("leClientRevientCourt"),
      long: t("leClientRevient"),
      encre: "text-ds-texte-sourdine",
      alerte: false,
    },
    {
      cle: "avecSuivi",
      Icone: Truck,
      teinte: "succes" as const,
      valeur: nombreOuTiret(partAvecSuivi(activite), " %"),
      court: t("partSur", { n: activite.avecSuivi, total: activite.commandesCreees }),
      long: t("partSur", { n: activite.avecSuivi, total: activite.commandesCreees }),
      encre: "text-ds-texte-sourdine",
      alerte: false,
    },
    {
      cle: "jamaisOuvertes",
      Icone: LinkIcon,
      teinte: (enAlerte ? "alerte" : "marque") as "alerte" | "marque",
      valeur: nombreOuTiret(jamais),
      court: enAlerte ? t("aRelancer") : t("toutesOuvertes"),
      long: enAlerte ? t("aRelancer") : t("toutesOuvertes"),
      encre: enAlerte ? "font-semibold text-ds-alerte" : "text-ds-texte-sourdine",
      alerte: enAlerte,
    },
  ];

  return (
    <section
      aria-label={t("compteurs")}
      className="grid grid-cols-1 gap-3 min-[560px]:grid-cols-2 min-[1180px]:grid-cols-4 lg:gap-4"
    >
      {cartes.map((c) => (
        <TuileMetrique
          key={c.cle}
          Icone={c.Icone}
          teinte={c.teinte}
          valeurEnAlerte={c.alerte}
          valeur={c.valeur}
          /*
            ⚠️ DEUX LIBELLÉS, PAS UN LIBELLÉ COUPÉ, et la raison n'a pas changé
            avec le design : à 390 px la phrase longue passe sur deux lignes et
            fait grandir la tuile. Couper au milieu d'un mot est ce qu'on
            obtiendrait en laissant la version longue déborder.
          */
          libelle={t(`carte.${c.cle}`)}
          dessous={{ texte: c.long, classe: c.encre }}
        />
      ))}
    </section>
  );
}
