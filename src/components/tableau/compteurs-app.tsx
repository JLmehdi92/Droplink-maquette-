import { ValeurRoulee } from "@/components/app/couche-v4";
import { getFormatter, getTranslations } from "next-intl/server";
import {
  ecartPeriodePrecedente,
  vuesParCommandeOuverte,
  type Activite,
  type DelaiLivraison,
} from "@/lib/analyses/activite";

/**
 * LA VUE D'ENSEMBLE : cinq compteurs dans une seule bande à filets (maquette,
 * `.compteurs`), partagée par le tableau de bord et les Analyses — le vendeur ne
 * voit jamais deux nombres différents pour la même chose.
 *
 * Une valeur absente s'écrit « — », jamais « 0 » : zéro affirmerait qu'on a
 * compté et trouvé rien. Le sens de l'écart à la période précédente est la seule
 * direction de l'écran : il porte une couleur ET un signe.
 */
export async function CompteursApp({
  activite,
  delai,
}: {
  readonly activite: Activite;
  readonly delai: DelaiLivraison | null;
}) {
  const t = await getTranslations("analyses");
  const format = await getFormatter();
  const ecart = ecartPeriodePrecedente(activite);
  const reponses = activite.qcApprouve + activite.qcRefuse;
  const validation = reponses === 0 ? null : Math.round((activite.qcApprouve / reponses) * 100);
  const vues = vuesParCommandeOuverte(activite);
  const ton = ecart === null || ecart === 0 ? undefined : ecart > 0 ? "hausse" : "baisse";
  const signe = ecart === null ? "" : ecart > 0 ? "+" + format.number(ecart) : format.number(ecart);

  const cartes: ReadonlyArray<{ cle: string; valeur: string; dessous: React.ReactNode }> = [
    {
      cle: "commandesCreees",
      valeur: format.number(activite.commandesCreees),
      dessous:
        ecart === null ? (
          t("aucuneComparaison")
        ) : (
          <span className="delta" data-ton={ton}>
            {t("ecartPrecedent", { n: signe })}
          </span>
        ),
    },
    {
      cle: "commandesLivrees",
      valeur: format.number(activite.commandesLivrees),
      dessous: t("livreesSur", { n: activite.commandesLivrees, total: activite.commandesCreees }),
    },
    {
      cle: "liensOuverts",
      valeur: format.number(activite.vuesTotales),
      dessous: vues === null ? t("leClientRevient") : t("vuesParCommande", { n: format.number(vues) }),
    },
    {
      cle: "tauxValidation",
      valeur: validation === null ? "—" : format.number(validation / 100, { style: "percent" }),
      dessous: t("reponsesSur", { n: reponses, s: reponses > 1 ? "s" : "", total: activite.commandesCreees }),
    },
    {
      cle: "delaiLivraison",
      valeur: delai?.jours == null ? "—" : t("jours", { n: format.number(delai.jours) }),
      // Une lecture en panne se dit illisible : « sur 0 colis livré » serait un zéro inventé.
      dessous: delai === null ? t("indisponibleCourt") : t("surColisLivres", { n: delai.colis, s: delai.colis > 1 ? "s" : "" }),
    },
  ];

  return (
    <section className="compteurs v4-carte" aria-label={t("compteurs")}>
      {cartes.map((c) => (
        <div key={c.cle} className="compteur-app">
          <p className="compteur-app__titre">{t(`carte.${c.cle}`)}</p>
          <p className="compteur-app__valeur">
            <ValeurRoulee texte={c.valeur} />
          </p>
          <p className="compteur-app__dessous">{c.dessous}</p>
        </div>
      ))}
    </section>
  );
}
