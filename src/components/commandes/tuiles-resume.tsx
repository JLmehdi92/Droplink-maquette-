import { useTranslations } from "next-intl";

/**
 * LE RÉSUMÉ DE LA FICHE (maquette, `commande.html` : `.compteurs.fiche__resume`).
 *
 * Quatre faits d'un coup d'œil, dans l'ordre de la maquette : client, référence,
 * suivi (avec son transporteur dessous), vues du lien (avec la dernière dessous).
 * Le client, la référence et le numéro viennent du FORMULAIRE : ils suivent la
 * frappe, et une tuile qui les lirait ailleurs dirait autre chose que le champ.
 *
 * UNE VALEUR VIDE SE DIT, en gris (« Non renseigné ») : pour le VENDEUR, c'est une
 * information utile — « tu n'as pas encore collé le numéro ». La page publique, elle,
 * omet (décision 26) : deux lecteurs différents.
 *
 * LA VALEUR SE TRONQUE À L'ELLIPSE, elle ne se replie pas : repliée, une tuile
 * prendrait deux hauteurs et désalignerait la rangée. La valeur complète est dans
 * le champ, juste en dessous.
 */
export function TuilesResume({
  client,
  reference,
  numeroSuivi,
  transporteur,
  vues,
  derniereVueLe,
}: {
  readonly client: string;
  readonly reference: string;
  readonly numeroSuivi: string;
  /**
   * Le NOM du transporteur, résolu côté serveur. `null` sans colis rattaché ou
   * quand le catalogue ne connaît pas le code : la ligne est alors OMISE plutôt
   * que remplie d'un « Transporteur inconnu ».
   */
  readonly transporteur: string | null;
  readonly vues: number;
  /** La dernière ouverture, déjà formatée par le serveur ; `null` si jamais ouvert. */
  readonly derniereVueLe: string | null;
}) {
  const t = useTranslations("editeur");
  const valeur = (v: string) =>
    v.trim() === "" ? (
      <p className="compteur-app__valeur" data-vide="">
        {t("tuileVide")}
      </p>
    ) : (
      <p className="compteur-app__valeur" title={v}>
        {v}
      </p>
    );

  return (
    <section className="compteurs compteurs--4 fiche__resume" aria-label={t("resume")}>
      <div className="compteur-app">
        <p className="compteur-app__titre">{t("tuileClient")}</p>
        {valeur(client)}
      </div>
      <div className="compteur-app">
        <p className="compteur-app__titre">{t("tuileReference")}</p>
        {valeur(reference)}
      </div>
      <div className="compteur-app">
        <p className="compteur-app__titre">{t("tuileSuivi")}</p>
        {valeur(numeroSuivi)}
        {transporteur === null || numeroSuivi.trim() === "" ? null : (
          <p className="compteur-app__dessous">{transporteur}</p>
        )}
      </div>
      <div className="compteur-app" data-alerte={vues === 0 ? "" : undefined}>
        <p className="compteur-app__titre">{t("tuileVues")}</p>
        <p className="compteur-app__valeur">
          {vues === 0 ? t("tuileVuesAucune") : t("tuileVuesNombre", { n: vues })}
        </p>
        {derniereVueLe === null ? null : (
          <p className="compteur-app__dessous">{t("tuileDerniereVue", { quand: derniereVueLe })}</p>
        )}
      </div>
    </section>
  );
}
