/**
 * UN LIEN VERS L'ÉCRAN COURANT — filtres, tris, vues, archives, pagination.
 *
 * ⚠️ CONTOURNEMENT D'UN DÉFAUT MESURÉ DANS LE ROUTEUR DE NEXT 15.5.23, PAS UNE
 * PRÉFÉRENCE DE STYLE. Toute navigation cliente qui garde le MÊME chemin et
 * change les paramètres de recherche est ABANDONNÉE. Remesuré le 03/09/2026 sur
 * un build de production avec une session réelle, en remettant un `<Link>` :
 * l'URL ne bouge même pas, la liste reste à ses cinq lignes non filtrées,
 * aucune puce n'apparaît. Et le clic n'est pas perdu en route — écoute en
 * capture puis en bulle : `defaultPrevented` passe de `false` à `true`. Le
 * routeur INTERCEPTE, empêche la navigation native, puis ne fait rien.
 *
 * LE SERVEUR, LUI, EST IRRÉPROCHABLE : la charge RSC demandée à la main répond
 * 200 et pèse 66 945 octets pour `?statut=en_transit` contre 81 243 pour l'URL
 * nue — trois lignes au lieu de cinq. Le défaut est entièrement dans le
 * routeur client.
 *
 * CE QUI A ÉTÉ ÉCARTÉ PAR MESURE, pour qu'on ne le refasse pas :
 *   `loading.tsx` retiré · `NextIntlClientProvider` sorti du layout ·
 *   `experimental.clientSegmentCache` · `experimental.staleTimes: 0` ·
 *   Next 15.5.24 · le préchargement du chemin nu · le groupe `(app)` ·
 *   `generateMetadata`, `EnTeteEcran`, `Icone`, les lectures Supabase ·
 *   **`export const dynamic = "force-dynamic"`** (03/09 : sans effet, le clic
 *   reste avalé). Une page minimale sous EXACTEMENT les mêmes layouts navigue,
 *   elle, parfaitement.
 *
 * ⚠️ CE COMPOSANT A LONGTEMPS ÉTÉ UN `<a>` NU, donc un RECHARGEMENT COMPLET du
 * document à chaque clic de filtre — 34,8 Ko compressés, la page qui blanchit,
 * et le défilement qui remonte en haut. Ça marchait, et ça se voyait.
 *
 * ⚠️ ET `history.pushState` + `router.refresh()` NE MARCHE PAS NON PLUS —
 * essayé et mesuré le 03/09/2026, dans les deux ordres. `pushState` seul fait
 * bien ce qu'on lui demande : l'URL passe à `?statut=en_transit` SANS
 * rechargement. Mais `refresh()`, appelé juste après puis décalé d'un tour de
 * boucle, rafraîchit l'ANCIENNE adresse : cinq lignes non filtrées, aucune
 * puce, la pilule « Toutes » toujours active. Le routeur garde donc sa propre
 * idée de l'URL, et c'est la même que celle qui avale les clics.
 *
 * CE QUI RESTE, ET QUI MARCHE : la navigation NATIVE du navigateur. Le
 * formulaire `GET` du panneau de filtres n'a jamais été touché par le défaut,
 * parce que React n'intercepte que les formulaires dont l'action est une
 * FONCTION. Un `<a>` nu n'est pas davantage intercepté.
 *
 * CE QUE ÇA COÛTE, MESURÉ : un document complet par clic —
 * `/fr/commandes` 121,6 Ko bruts / **34,8 Ko compressés**, `/fr/envois` 14,8 Ko,
 * `/fr/analyses` 15,5 Ko. Les feuilles de style et les scripts sont déjà en
 * cache : c'est le document seul qui repart.
 *
 * ⚠️ ET CE QUI SE VOIT — la page qui blanchit entre deux clics de filtre —
 * N'EST PAS TRAITÉ, PAR DÉCISION DE WASSIM LE 03/09/2026. Une transition de vue
 * entre documents (`@view-transition { navigation: auto }`) avait été posée et
 * mesurée : elle fonctionnait, `pageswap` rapportait bien une transition
 * activée. Il n'en voulait pas. Elle a été retirée avec ses deux contrôles de
 * fumée et son exception d'inventaire. Le clignotement est donc ASSUMÉ, pas
 * oublié — le rouvrir tient en trois lignes de CSS.
 *
 * À RETIRER LE JOUR OÙ LE DÉFAUT EST CORRIGÉ EN AMONT : c'est le seul endroit à
 * défaire.
 */
export function LienEcran({
  href,
  className,
  children,
  ...reste
}: {
  readonly href: string;
  readonly className?: string;
  readonly children: React.ReactNode;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "className" | "children">) {
  return (
    <a href={href} className={className} {...reste}>
      {children}
    </a>
  );
}
