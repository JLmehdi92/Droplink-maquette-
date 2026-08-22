import "server-only";

/**
 * LES OPTIONS DES COOKIES DE SESSION.
 *
 * DÉFAUT CONSTATÉ DANS LA VERSION INSTALLÉE, pas supposé. `@supabase/ssr@0.12.4`
 * applique `DEFAULT_COOKIE_OPTIONS = { path:"/", sameSite:"lax",
 * httpOnly:false, maxAge:400 jours }`, et le paquet ne pose `secure` nulle part
 * — vérifié dans `node_modules`. Sans surcharge de notre part, le jeton d'accès
 * ET le jeton de rafraîchissement étaient donc lisibles en JavaScript, en clair
 * sur une connexion non chiffrée, pendant plus d'un an.
 *
 * CE QUE ÇA COÛTAIT : n'importe quel XSS — une page future, un nom mal échappé,
 * une dépendance compromise — exfiltrait le couple en une ligne et obtenait une
 * session persistante que NI la suspension du compte NI la révocation d'un lien
 * ne coupent avant l'expiration du jeton de rafraîchissement.
 *
 * CE QUE ÇA NE COÛTE RIEN DE FERMER : `creerClientNavigateur` n'est appelé nulle
 * part dans le produit. Aucun accès Supabase ne part du navigateur, donc rien
 * n'a jamais eu besoin de lire ces cookies en JavaScript. La protection était
 * disponible gratuitement et n'avait simplement pas été demandée.
 *
 * `secure` EST CONDITIONNÉ AU PROTOCOLE. Posé inconditionnellement, il rendrait
 * la connexion impossible en développement sur `http://localhost` — le
 * navigateur refuserait d'envoyer le cookie, et l'on chercherait longtemps une
 * panne d'authentification qui n'en est pas une.
 *
 * `sameSite: "lax"` est CONSERVÉ, pas durci en `strict`. Le retour du lien
 * magique et le retour de Google sont des navigations entrantes depuis un autre
 * site : en `strict`, le cookie ne serait pas envoyé et la session serait perdue
 * à l'instant précis où elle vient d'être établie.
 */
export const OPTIONS_COOKIES = {
  httpOnly: true,
  secure: process.env["NODE_ENV"] === "production",
  sameSite: "lax",
  path: "/",
} as const;
