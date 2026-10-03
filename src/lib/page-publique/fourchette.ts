/**
 * « 1 AU 2 OCTOBRE » (maquette `client.html`) : la fourchette d'arrivée, le mois non répété
 * quand il est le même, par une RÈGLE de traduction (`page-publique.fourchette.memeMois` /
 * `autreMois`) — « October 1–2 », « 10月1日至2日 » —, jamais une chaîne fixe. En UTC, comme
 * `estimationVisible` : le jour ne dépend pas du fuseau du serveur.
 */
/**
 * Les deux règles, traduites PAR L'APPELANT : les clés s'écrivent en clair là où l'espace
 * `page-publique` est déclaré, et la garde des chaînes mortes les y trouve.
 */
interface Regles {
  readonly memeMois: (valeurs: { du: string; au: string; jourDu: string; jourAu: string; moisAu: string }) => string;
  readonly autreMois: (valeurs: {
    du: string;
    au: string;
    jourDu: string;
    jourAu: string;
    moisDu: string;
    moisAu: string;
  }) => string;
}
/** Les seules options employées ici : assez précises pour le formateur de next-intl. */
type OptionsJour = { readonly day?: "numeric"; readonly month?: "long"; readonly timeZone: "UTC" };
type FormaterDate = (date: Date, options: OptionsJour) => string;

export function fourchetteDates(du: Date, au: Date, regles: Regles, formater: FormaterDate): string {
  // Deux bornes inversées par le transporteur ne donnent pas « 2 au 1 octobre » (relecture du 03/10/2026).
  if (du.getTime() > au.getTime()) return fourchetteDates(au, du, regles, formater);
  const jour = (x: Date): string => formater(x, { day: "numeric", month: "long", timeZone: "UTC" });
  // Le seul numéro du jour (« 1 », et non « 1日 ») : la règle de traduction pose le reste.
  const jourSeul = (x: Date): string => formater(x, { day: "numeric", timeZone: "UTC" }).replace(/\D+$/, "");
  /*
   * LE MOIS SEUL, EN PLUS DE LA DATE ENTIÈRE (relecture du français, 03/10/2026).
   * `Intl` écrit « 1 octobre » ; le français veut « 1er octobre ». Aucune option
   * de `Intl.DateTimeFormat` ne pose l'ordinal : c'est donc le CATALOGUE qui le
   * dit, par un `select` sur le jour, et il lui faut le jour et le mois séparés.
   * Les autres langues gardent `{du}` et `{au}`.
   */
  const mois = (x: Date): string => formater(x, { month: "long", timeZone: "UTC" });
  const memeMois = du.getUTCFullYear() === au.getUTCFullYear() && du.getUTCMonth() === au.getUTCMonth();
  return memeMois
    ? regles.memeMois({ du: jour(du), au: jour(au), jourDu: jourSeul(du), jourAu: jourSeul(au), moisAu: mois(au) })
    : regles.autreMois({
        du: jour(du),
        au: jour(au),
        jourDu: jourSeul(du),
        jourAu: jourSeul(au),
        moisDu: mois(du),
        moisAu: mois(au),
      });
}
