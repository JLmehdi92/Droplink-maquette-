import { getFormatter, getTranslations } from "next-intl/server";
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
    <section
      aria-label={t("colis.titre")}
      className="rounded-lg border border-outline-variant bg-surface-container-lowest p-[18px] lg:rounded-[18px] lg:p-[22px]"
    >
      <h2 className="mb-[18px] font-headline-md text-[15px] leading-[19px] font-bold tracking-normal text-on-surface lg:mb-5 lg:text-[16px] lg:leading-[21px] lg:tracking-[-0.015em]">
        {t("colis.titre")}
      </h2>

      {compteurs.total === 0 ? (
        <p className="font-body-md text-[14px] text-on-surface-variant">{t("colis.vide")}</p>
      ) : (
        <ul className="flex flex-col gap-[15px] lg:gap-4">
          {lignes.map((l) => (
            <li key={l.cle}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3 lg:mb-[7px]">
                <span
                  className={
                    "font-headline-md text-[13px] leading-4 font-semibold " +
                    (l.alerte ? "text-alerte" : "text-on-surface")
                  }
                >
                  {t(`colis.${l.cle}`)}
                </span>
                <span className="font-body-sm text-[13px] leading-4 text-sourdine">
                  {format.number(l.valeur)}
                </span>
              </div>
              {/* La piste est décorative : le chiffre au-dessus porte
                  l'information, elle n'a rien à annoncer de plus. */}
              <div
                aria-hidden="true"
                className="h-2 overflow-hidden rounded-full bg-filet-ligne"
              >
                <span
                  className={"block h-full rounded-full " + (l.alerte ? "bg-alerte-puce" : "bg-violet")}
                  style={{ width: (maximum === 0 ? 0 : (l.valeur / maximum) * 100) + "%" }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
