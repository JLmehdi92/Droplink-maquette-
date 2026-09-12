import { getFormatter, getTranslations } from "next-intl/server";
import { Panneau } from "@/components/app/panneau";
import type { CompteursEnvois } from "@/lib/envois/liste";

/**
 * OÙ EN SONT LES COLIS — quatre barres de progression.
 *
 * ⚠️ CE BLOC NE SUIT PAS LA PÉRIODE CHOISIE, et son titre le dit : « où EN
 * SONT vos colis », au présent. Un colis est dans un état, il n'est pas dans un
 * mois. Le borner à sept jours ferait fondre « livrés » à chaque fois que le
 * vendeur resserre la fenêtre, alors qu'aucun colis n'aurait bougé.
 *
 * ⚠️ LES QUATRE CHIFFRES NE S'ADDITIONNENT PAS AU TOTAL, et c'est normal :
 * « sans mouvement » est une propriété de colis qui sont AUSSI en transit ou en
 * préparation. D'où l'échelle : chaque barre est une part du plus grand des
 * quatre, jamais d'une somme — une somme de catégories qui se recouvrent
 * donnerait des pourcentages qui dépassent cent, et personne ne le verrait
 * puisque la barre est bornée par sa piste.
 *
 * Les compteurs viennent de `compter_envois`, la même fonction que l'écran des
 * envois. Deux comptages du même fait finiraient par diverger, et c'est
 * toujours celui qu'on ne regarde pas qui a raison.
 */
export async function RepartitionColis({
  compteurs,
}: {
  readonly compteurs: CompteursEnvois;
}) {
  const t = await getTranslations("analyses");
  const format = await getFormatter();

  const lignes = [
    { cle: "enTransit", valeur: compteurs.enTransit, alerte: false },
    { cle: "livre", valeur: compteurs.livre, alerte: false },
    { cle: "preparation", valeur: compteurs.preparation, alerte: false },
    { cle: "silencieux", valeur: compteurs.silencieux, alerte: true },
  ] as const;

  const maximum = lignes.reduce((m, l) => Math.max(m, l.valeur), 0);

  return (
    <Panneau titre={t("colis.titre")} sousTitre={t("colis.aide")}>

      {compteurs.total === 0 ? (
        <p className="text-[14px] text-ds-texte-corps">{t("colis.vide")}</p>
      ) : (
        <ul className="flex flex-col gap-[15px] lg:gap-4">
          {lignes.map((l) => (
            <li key={l.cle}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3 lg:mb-[7px]">
                <span
                  className={
                    "text-[13px] leading-4 font-semibold " +
                    (l.alerte ? "text-ds-alerte" : "text-ds-texte-fort")
                  }
                >
                  {t(`colis.${l.cle}`)}
                </span>
                <span className="text-[13px] leading-4 font-semibold text-ds-texte-sourdine">
                  {format.number(l.valeur)}
                </span>
              </div>
              {/* La piste est décorative : le chiffre au-dessus porte
                  l'information, elle n'a rien à annoncer de plus. */}
              <div
                aria-hidden="true"
                className="h-2 overflow-hidden rounded-ds-pill bg-ds-surface-creux"
              >
                <span
                  className={"block h-full rounded-ds-pill " + (l.alerte ? "bg-ds-alerte" : "bg-ds-accent")}
                  style={{ width: (maximum === 0 ? 0 : (l.valeur / maximum) * 100) + "%" }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panneau>
  );
}
