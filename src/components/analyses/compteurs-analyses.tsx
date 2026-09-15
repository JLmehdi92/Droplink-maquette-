import { getFormatter, getTranslations } from "next-intl/server";
import { CircleCheck, Clock, Image as ImageIcon, Link as LinkIcon, Package } from "lucide-react";
import { TuileMetrique } from "@/components/app/tuile-metrique";
import {
  ecartPeriodePrecedente,
  vuesParCommandeOuverte,
  type Activite,
  type DelaiLivraison,
} from "@/lib/analyses/activite";

/**
 * LES CINQ COMPTEURS DE TÊTE — `AnalyticsView` du kit vendeur, mesuré à 1690 px.
 *
 * ⚠️ ILS ÉTAIENT QUATRE, ET AUCUN N'ÉTAIT CELUI DU KIT SAUF LE PREMIER. L'écran
 * portait « Vues par commande », « Commandes avec suivi » et « Jamais
 * ouvertes » — trois métriques de verdict du brief §11, choisies quand la base
 * ne savait pas compter le reste. Le kit en demande cinq :
 *
 *   Commandes créées · Commandes livrées · Liens clients ouverts ·
 *   Taux de validation des photos · Temps moyen de livraison
 *
 * Les quatre dernières ont toutes été RENDUES CALCULABLES par la migration 146,
 * plutôt que déclarées impossibles : les agrégats groupés de PostgREST sont
 * désactivés sur ce projet, donc chacune a demandé une fonction SQL.
 *
 * ⚠️ ET LES MÉTRIQUES DE VERDICT NE SONT PAS PERDUES, elles ont changé de
 * ligne. Le kit met sous chaque nombre une phrase courte ; c'est là qu'elles
 * vivent désormais — « N,N vues par commande ouverte » sous les liens ouverts,
 * « N sur M créées » sous les livrées. « Jamais ouvertes » n'est plus une tuile
 * parce qu'elle est déjà une ALERTE de la barre supérieure, à l'endroit où le
 * produit met ce qui appelle un geste.
 *
 * ⚠️ UNE VALEUR ABSENTE S'ÉCRIT « — », JAMAIS « 0 ». Zéro affirme qu'on a
 * mesuré et trouvé rien ; l'absence de commande n'affirme rien. Les deux se
 * ressemblent trop à l'écran pour être rendus pareil là où on décide.
 */
export async function CompteursAnalyses({
  activite,
  delai,
}: {
  readonly activite: Activite;
  /** `null` quand la lecture du délai a échoué — la tuile rend alors « — ». */
  readonly delai: DelaiLivraison | null;
}) {
  const t = await getTranslations("analyses");
  const format = await getFormatter();

  const nombreOuTiret = (v: number | null, suffixe = ""): string =>
    v === null ? "—" : format.number(v) + suffixe;

  const ecart = ecartPeriodePrecedente(activite);
  const signe = ecart === null ? "" : ecart > 0 ? "+" + format.number(ecart) : format.number(ecart);

  /*
   * LE TAUX DE VALIDATION PORTE SUR CE QUI A ÉTÉ RÉPONDU, pas sur tout.
   *
   * Le dénominateur est approuvé + refusé, jamais le total des commandes : une
   * commande dont le client n'a pas encore tranché n'est pas un refus. La
   * compter en bas ferait chuter le taux à chaque nouvelle commande — une
   * métrique qui empire quand l'activité augmente, et qui reste crédible.
   */
  const reponses = activite.qcApprouve + activite.qcRefuse;
  const validation = reponses === 0 ? null : Math.round((activite.qcApprouve / reponses) * 100);

  const cartes = [
    {
      cle: "commandesCreees",
      Icone: Package,
      teinte: "marque" as const,
      valeur: format.number(activite.commandesCreees),
      dessous: ecart === null ? t("aucuneComparaison") : t("ecartPrecedent", { n: signe }),
      // Le sens de la variation est une COULEUR, parce que c'est la seule
      // information de l'écran qui dise une direction. Une baisse rendue du
      // même vert qu'une hausse serait une métrique faussée du côté rassurant.
      encre:
        ecart === null
          ? "text-ds-texte-sourdine"
          : ecart > 0
            ? "font-semibold text-ds-succes-encre"
            : ecart < 0
              ? "font-semibold text-ds-alerte-encre"
              : "text-ds-texte-sourdine",
      alerte: false,
    },
    {
      cle: "commandesLivrees",
      Icone: CircleCheck,
      teinte: "succes" as const,
      valeur: format.number(activite.commandesLivrees),
      dessous: t("livreesSur", {
        n: activite.commandesLivrees,
        total: activite.commandesCreees,
      }),
      encre: "text-ds-texte-sourdine",
      alerte: false,
    },
    {
      cle: "liensOuverts",
      Icone: LinkIcon,
      teinte: "info" as const,
      valeur: format.number(activite.vuesTotales),
      /* LA MÉTRIQUE DE VERDICT DU BRIEF, sous le nombre du kit : « vues de lien
         par commande > 3 » dit que le destinataire REVIENT, ce qu'un total
         d'ouvertures ne distingue pas d'un grand nombre de commandes. */
      dessous:
        vuesParCommandeOuverte(activite) === null
          ? t("leClientRevient")
          : t("vuesParCommande", { n: format.number(vuesParCommandeOuverte(activite) ?? 0) }),
      encre: "text-ds-texte-sourdine",
      alerte: false,
    },
    {
      cle: "tauxValidation",
      Icone: ImageIcon,
      teinte: "marque" as const,
      valeur: nombreOuTiret(validation, " %"),
      dessous: t("reponsesSur", {
        n: reponses,
        s: reponses > 1 ? "s" : "",
        total: activite.commandesCreees,
      }),
      encre: "text-ds-texte-sourdine",
      alerte: false,
    },
    {
      cle: "delaiLivraison",
      Icone: Clock,
      teinte: "neutre" as const,
      /* ⚠️ `null` N'EST PAS ZÉRO. « 0 jour » affirmerait une livraison
         instantanée ; aucun colis livré n'est pas une performance. */
      valeur: delai?.jours == null ? "—" : t("jours", { n: format.number(delai.jours) }),
      dessous: t("surColisLivres", {
        n: delai?.colis ?? 0,
        s: (delai?.colis ?? 0) > 1 ? "s" : "",
      }),
      encre: "text-ds-texte-sourdine",
      alerte: false,
    },
  ];

  return (
    /*
      CINQ COLONNES AU BUREAU, comme le kit. Le palier est à 1180 px : mesuré
      plus bas, cinq cartes n'ont plus la place de leurs libellés et montent à
      deux lignes — c'est la place qui tranche, et elle se mesure.
    */
    <section
      aria-label={t("compteurs")}
      className="grid grid-cols-1 gap-3 min-[560px]:grid-cols-2 min-[1180px]:grid-cols-5 lg:gap-4"
    >
      {cartes.map((c) => (
        <TuileMetrique
          key={c.cle}
          Icone={c.Icone}
          teinte={c.teinte}
          valeurEnAlerte={c.alerte}
          valeur={c.valeur}
          libelle={t(`carte.${c.cle}`)}
          dessous={{ texte: c.dessous, classe: c.encre }}
        />
      ))}
    </section>
  );
}
