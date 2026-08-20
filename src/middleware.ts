import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

export default createMiddleware(routing);

/**
 * CHAQUE EXCLUSION DE CE MATCHER EST UNE PORTE.
 *
 * Ce middleware ne fait aujourd'hui que la négociation de langue. Il portera
 * plus tard le rafraîchissement de session et la protection de `/admin`, et
 * c'est pour cela que ses exclusions se justifient une par une dès maintenant :
 * une exclusion posée sans raison devient une faille dès qu'on ajoute une
 * responsabilité au middleware.
 *
 * Les deux premieres portent `(?:/|$)` et non le nom nu. Sans cette precision,
 * `api|p` excluait TOUT chemin commencant par ces lettres : `/pricing`,
 * `/partenaires`, `/apidocs` et `/pages` tombaient hors du middleware. Une
 * exclusion prevue pour UNE route en couvrait une famille entiere, et rien ne
 * l aurait signale tant que le middleware ne fait que choisir une langue.
 *
 * - `api`      : surface machine. Elle est HORS du middleware par nécessité,
 *                donc CHAQUE route y porte sa propre garde. Le préfixe
 *                `/api/admin/...` donnerait l'impression contraire à qui relit.
 * - `p`        : la page publique par jeton. Hors langue par conception.
 * - `_next`,
 *   `_vercel`  : artefacts du framework.
 * - `.*\\..*`   : LA PLUS LARGE, et la plus dangereuse. Elle vise les fichiers
 *                statiques, mais elle exclut aussi n'importe quel segment de
 *                route contenant un point — un `rapport.png` en sortirait sans
 *                que rien ne le signale. Une sonde inventorie les routes réelles
 *                et vérifie qu'aucune ne tombe dedans par accident.
 */
export const config = {
  matcher: "/((?!api(?:/|$)|p(?:/|$)|_next|_vercel|.*\\..*).*)",
};
