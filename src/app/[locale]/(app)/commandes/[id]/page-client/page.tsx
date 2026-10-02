import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { creerClientServeur } from "@/lib/supabase/server";
import { exigerVendeur } from "@/lib/comptes/apres-session";
import { estLangueSupportee } from "@/i18n/config";
import { cheminPageClient } from "@/lib/liens/page-client";
import { lireProfilVendeur } from "@/lib/comptes/profil";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * LE SAUT VERS LA PAGE DU CLIENT, résolu AU MOMENT DU CLIC.
 *
 * ⚠️ DÉFAUT TROUVÉ EN PILOTANT LE PRODUIT LE 27/08/2026. L'en-tête de l'éditeur
 * portait `href={origine + "/p/" + data.public_token}`, calculé au rendu
 * serveur. Après une révocation, la carte d'actions affichait bien le nouveau
 * lien — elle tient son propre jeton, l'exigence du brief était tenue — mais ce
 * bouton-là continuait de pointer vers le lien qu'on venait de tuer. Vérifié :
 * ancien jeton 404, nouveau 200.
 *
 * C'est le moment le plus anxiogène du produit. On vient de couper
 * définitivement un lien parce qu'il a fuité ; le geste suivant est d'aller
 * vérifier que la nouvelle page répond — et ce bouton menait à une page morte.
 * Le vendeur en conclut qu'il a cassé la commande de son client.
 *
 * DEUX CORRECTIONS PAR RAFRAÎCHISSEMENT ONT ÉTÉ TENTÉES ET ONT ÉCHOUÉ, il faut
 * le dire plutôt que de laisser croire que cette page est un choix d'esthète :
 * `router.refresh()` après la révocation, puis avant la fermeture de la boîte.
 * Dans les deux cas la requête RSC partait, le serveur répondait 200 — et le
 * client l'ANNULAIT (`net::ERR_ABORTED`). Le mode de défaillance était donc
 * invisible côté serveur : la bonne réponse partait, personne ne la lisait.
 *
 * D'OÙ LE CHANGEMENT DE NATURE. Un lien qui embarque le jeton est une COPIE de
 * l'état, et toute copie peut vieillir : par un rafraîchissement manqué, par un
 * cache, par une révocation faite dans un autre onglet. Celui-ci n'embarque
 * rien — il relit le jeton en base au moment où on le suit. Il ne peut pas être
 * périmé, non parce qu'on le rafraîchit bien, mais parce qu'il n'y a rien à
 * rafraîchir.
 *
 * LA LECTURE EST SOUS RLS, et une commande qui n'est pas à l'appelant rend 404
 * et non 403 : distinguer « ça n'existe pas » de « ce n'est pas à vous »
 * confirmerait l'existence d'une commande qu'on n'a pas le droit de connaître.
 * C'est la même règle que l'éditeur, et cette page ne l'assouplit pas — elle ne
 * révèle donc rien de plus que le bouton qui y mène.
 *
 * REDIRECTION RELATIVE, sans `origineDuSite()`. L'ancien bouton disparaissait
 * quand l'origine était inconnue : on ne construit plus d'adresse absolue, donc
 * il n'y a plus rien à deviner et le bouton existe toujours.
 */
export default async function VersLaPageClient({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, id } = await params;
  // `?apercu=1` (« Voir la page client » de Ma marque) : l'APERÇU de la page, qui ne
  // compte aucune vue — y envoyer le vendeur sur sa vraie page ferait passer « vue »
  // une commande que son client n'a jamais ouverte (contrainte n° 8).
  const apercu = (await searchParams)["apercu"] === "1";
  const langue = estLangueSupportee(locale) ? locale : "fr";

  /*
   * ⚠️ LA GARDE PASSE AVANT LA LECTURE, ET C'EST TOUT LE POINT.
   *
   * Cette page ne rend rien : elle lit le `public_token` et redirige. Le jeton
   * partait donc dans l'en-tête `location:` — et la RLS ne suffisait pas à
   * l'empêcher, puisqu'un jeton d'accès révoqué reste valable une heure aux yeux
   * de PostgREST. Mesuré avec un cookie révoqué : le jeton sortait.
   *
   * Et ce n'est pas une donnée de plus : le `public_token` transfère une
   * CAPACITÉ, définitivement, puisqu'il est immuable à vie.
   */
  await exigerVendeur(langue);

  const supabase = await creerClientServeur();
  const { data, error } = await supabase
    .from("orders")
    .select("public_token")
    .eq("id", id)
    .maybeSingle();

  if (error !== null || data === null) notFound();

  /*
   * ⚠️ ON ENVOIE LE VENDEUR SUR SON LIEN BRANDÉ, PAS SUR `/p/`. Ce bouton
   * existe pour qu'il voie CE QUE VOIT SON CLIENT : l'envoyer sur une autre
   * adresse que celle qu'il a partagée lui ferait vérifier une page qui n'est
   * pas tout à fait celle qui circule — et c'est précisément sur cette page-là
   * que le nom du vendeur est la seule chose visible dans la barre d'adresse.
   *
   * ⚠️ `lireProfilVendeur()` NE COÛTE RIEN ICI : `exigerVendeur()` vient de
   * l'appeler, et elle est mémoïsée par requête.
   *
   * LE CHEMIN RESTE RELATIF. Une redirection construite sur l'adresse d'arrivée
   * porterait celle du conteneur derrière un proxy — mesuré en production le
   * 08/09/2026, `localhost:8080`.
   */
  if (apercu) redirect(`/p/${encodeURIComponent(data.public_token)}/apercu`);
  const profil = await lireProfilVendeur();
  redirect(cheminPageClient(data.public_token, profil?.nomDeLien ?? null));
}
