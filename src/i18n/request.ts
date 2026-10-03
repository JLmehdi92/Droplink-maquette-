import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

/**
 * LES FORMATS NOMMÉS, déclarés une fois pour toutes les langues.
 *
 * ⚠️ CE BLOC N'EXISTAIT PAS, ET SON ABSENCE ÉTAIT SILENCIEUSE. Trouvé en
 * pilotant le produit le 27/08/2026 : l'écran des paramètres d'administration,
 * en `lang="fr"`, affichait « Modifié le Thu Aug 27 2026 17:26:26 GMT+0200 ».
 *
 * La cause n'est pas une faute de frappe mais un MODE DE DÉFAILLANCE : appeler
 * `format.dateTime(date, "long")` avec un nom qui n'est déclaré nulle part ne
 * lève pas, ne prévient pas, et retombe sur `String(date)` — c'est-à-dire sur
 * la représentation brute de JavaScript, en anglais, avec un décalage horaire.
 * Partout ailleurs le code passe un OBJET d'options, qui ne peut pas manquer :
 * les deux écritures se ressemblent trop pour qu'une relecture les distingue.
 *
 * `origine` PORTE L'HEURE. Ces dates répondent à « qui a changé ce réglage, et
 * quand » : à la journée près, deux modifications du même jour deviennent
 * indiscernables, et c'est précisément le cas où l'on regarde. Le mois est COURT
 * (« 20 sept. 2026, 14:05 »), comme l'origine de la maquette (audit final du
 * 03/10/2026) ; la page ET l'action qui la recompose après un enregistrement
 * l'emploient, pour qu'elle ne change pas de forme.
 *
 * TOUT NOM AJOUTÉ ICI DOIT ÊTRE EMPLOYÉ, et tout nom employé doit être ici —
 * `tests/unit/formats-nommes.test.ts` échoue dans les deux sens.
 */
export const FORMATS = {
  dateTime: {
    origine: {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    },
  },
} as const;

export default getRequestConfig(async ({ requestLocale }) => {
  const demande = await requestLocale;

  // `hasLocale` plutôt qu'une comparaison maison : une langue non supportée
  // arrivant par l'URL ne doit pas faire chercher un catalogue inexistant, ce
  // qui lèverait à l'import et rendrait une erreur 500 là où un repli suffit.
  const locale = hasLocale(routing.locales, demande) ? demande : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    formats: FORMATS,
  };
});
