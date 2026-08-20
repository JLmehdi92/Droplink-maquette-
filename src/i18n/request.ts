import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const demande = await requestLocale;

  // `hasLocale` plutôt qu'une comparaison maison : une langue non supportée
  // arrivant par l'URL ne doit pas faire chercher un catalogue inexistant, ce
  // qui lèverait à l'import et rendrait une erreur 500 là où un repli suffit.
  const locale = hasLocale(routing.locales, demande) ? demande : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
