/**
 * UN LIEN QUI RECHARGE VRAIMENT LA PAGE — filtres, tris, archives, pagination.
 *
 * ⚠️ CONTOURNEMENT D'UN DÉFAUT MESURÉ DANS LE ROUTEUR DE NEXT 15.5.23, PAS UNE
 * PRÉFÉRENCE DE STYLE. Le 29/08/2026, en pilotant un build de PRODUCTION avec
 * une session vendeur réelle : toute navigation cliente qui garde le MÊME
 * chemin et change les paramètres de recherche est ABANDONNÉE. Pas d'erreur,
 * pas de message de console, l'URL ne bouge même pas — la base change, l'écran
 * reste. Mesuré 0 succès sur 5 poussées d'affilée sur `/fr/commandes`, et le
 * même geste vers un AUTRE chemin passe à chaque fois.
 *
 * CE QUI A ÉTÉ ÉCARTÉ PAR MESURE, pour qu'on ne le refasse pas :
 *   `loading.tsx` retiré · `NextIntlClientProvider` sorti du layout ·
 *   `experimental.clientSegmentCache` · `experimental.staleTimes: 0` ·
 *   Next 15.5.24 · le préchargement du chemin nu · le groupe `(app)` ·
 *   `generateMetadata`, `EnTeteEcran`, `Icone`, les lectures Supabase.
 * Une page minimale placée sous EXACTEMENT les mêmes layouts navigue, elle,
 * parfaitement — le défaut n'est donc pas dans notre enveloppe.
 *
 * CE QUI MARCHE, ÉTABLI PAR EXÉCUTION : la navigation NATIVE du navigateur. Le
 * formulaire `GET` du panneau de filtres n'a jamais été touché par le défaut,
 * parce que React n'intercepte que les formulaires dont l'action est une
 * FONCTION. Un `<a>` nu n'est pas davantage intercepté.
 *
 * CE QUE ÇA COÛTE, MESURÉ : un document complet par clic —
 * `/fr/commandes` 121,6 Ko bruts / **34,8 Ko compressés**, `/fr/envois` 14,8 Ko,
 * `/fr/analyses` 15,5 Ko. Les feuilles de style et les scripts sont déjà en
 * cache : c'est le document seul qui repart.
 *
 * ⚠️ CE COMPOSANT NE SERT QU'AUX LIENS VERS L'ÉCRAN COURANT. Un lien vers un
 * AUTRE écran doit rester un `<Link>` : la navigation cliente y fonctionne, et
 * la dégrader coûterait un rechargement pour rien.
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
