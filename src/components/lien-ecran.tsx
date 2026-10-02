import Link from "next/link";

/**
 * UN LIEN VERS L'ÉCRAN COURANT — filtres, tris, vues, archives, pagination.
 *
 * ⚠️ CE COMPOSANT A ÉTÉ UN `<a>` NU PENDANT ONZE JOURS, ET IL NE L'EST PLUS.
 *
 * LE DÉFAUT QU'IL CONTOURNAIT : dans Next 15.5.23, toute navigation cliente qui
 * gardait le MÊME chemin en changeant les paramètres de recherche était
 * ABANDONNÉE. Le clic était intercepté — `defaultPrevented` passait de `false` à
 * `true` — puis rien : l'URL ne bougeait pas, la liste restait à ses cinq lignes
 * non filtrées, aucune puce n'apparaissait. Le serveur, lui, était irréprochable.
 * Le défaut vivait entièrement dans le routeur client.
 *
 * DIX PISTES ONT ÉTÉ ESSAYÉES ET MESURÉES avant d'y renoncer : `loading.tsx`
 * retiré, `NextIntlClientProvider` sorti du layout, `experimental
 * .clientSegmentCache`, `experimental.staleTimes: 0`, le préchargement du chemin
 * nu, le groupe `(app)`, `generateMetadata`, `EnTeteEcran`, `Icone`, les
 * lectures Supabase, `export const dynamic = "force-dynamic"`,
 * `history.pushState` + `router.refresh()` dans les deux ordres, et les versions
 * 15.5.24 puis 15.5.25. Aucune n'a rien changé.
 *
 * ✅ NEXT 16 LE CORRIGE, ET C'EST MESURÉ, PAS ESPÉRÉ. Test du 09/09/2026 sur un
 * build de production, avec une session réelle et une liste de 11 commandes, en
 * cliquant la pilule « En transit » par un vrai clic souris :
 *
 *   Next 15.5.23 + <Link> → 🔴 URL figée sur `/fr/commandes`, 11 lignes sur 11.
 *   Next 16.3.4  + <Link> → ✅ `/fr/commandes?statut=en_transit`, 11 → 5 lignes,
 *                            ET le marqueur posé dans `window` SURVIT au clic.
 *
 * Le contre-test est ce qui rend la conclusion solide : même composant, même
 * code, même base, même clic — SEULE la version de Next changeait.
 *
 * CE QUE LE CONTOURNEMENT COÛTAIT, ET QUI EST RENDU : un document complet à
 * chaque clic de filtre — `/fr/commandes` 121,6 Ko bruts, 34,8 Ko compressés —
 * la page qui blanchit, et le défilement qui remonte en haut. C'est ce que
 * Wassim décrivait par « c'est trop chiant, ça actualise tout le temps ».
 *
 * ⚠️ CE COMPOSANT RESTE, ALORS QU'IL NE FAIT PLUS QUE DÉLÉGUER. Il pourrait être
 * remplacé par `<Link>` dans les onze fichiers qui l'emploient ; il est conservé
 * parce qu'il est le point unique où cette histoire est écrite, et parce que le
 * jour où un défaut de navigation reviendra, il n'y aura de nouveau qu'un seul
 * endroit à changer. Un composant qui ne fait rien mais qui documente pourquoi
 * il ne fait rien vaut mieux qu'une leçon dispersée dans onze fichiers.
 */
/**
 * ⚠️ LES PROPRIÉTÉS SONT ÉNUMÉRÉES, PAS HÉRITÉES DE `AnchorHTMLAttributes`.
 *
 * Le composant acceptait auparavant les 280 attributs d'une ancre, par un
 * `Omit<React.AnchorHTMLAttributes<…>>`. Sur un `<a>` nu, TypeScript s'en
 * accommodait ; sur un `<Link>`, avec l'`exactOptionalPropertyTypes: true` de ce
 * projet, il ne le peut plus : une propriété déclarée `T | undefined` n'est pas
 * assignable à une propriété simplement optionnelle, et `onMouseEnter` a suffi à
 * faire tomber le build.
 *
 * On aurait pu élargir le type, ou le taire par une assertion. Énumérer est
 * meilleur : relevé sur les onze fichiers qui l'emploient, ils ne passent QUE
 * `href`, `className`, `key` et `aria-current`. Un type qui décrit ce que le
 * produit fait vraiment se lit ; un type qui décrit tout ce qui serait possible
 * ne dit rien. Un attribut de plus se déclarera ici, en une ligne.
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
  readonly "aria-current"?: React.AriaAttributes["aria-current"];
  readonly "aria-label"?: string;
  readonly title?: string;
  /**
   * Marque la pilule de vue active, pour que la pastille des filtres sache où
   * se poser. Déclaré ici parce que ce composant énumère ses propriétés : un
   * `data-*` passe le typage sans être déclaré, et il deviendrait invisible à
   * qui lit ce fichier pour savoir ce qu'on peut lui donner.
   */
  readonly "data-vue-active"?: "true" | undefined;
  /** Une tuile de compteur qui appelle un geste (maquette, `[data-alerte]`). */
  readonly "data-alerte"?: string | undefined;
  /** Le jeton de la page client, lu par l'aperçu au survol (`ApercuSurvol`). */
  readonly "data-jeton"?: string;
  /**
   * `false` sur la surface d'administration : son plafond de requêtes compte
   * les préchargements (voir `tests/unit/admin-sans-prechargement.test.ts`).
   */
  readonly prefetch?: boolean;
  /** Le rang d'une entrée de la coque (`--rang`), pour la cascade du tiroir. */
  readonly style?: React.CSSProperties;
  /** Le sens de l'entrée de l'écran suivant, posé au clic (`NavigationVendeur`). */
  readonly onClick?: () => void;
}) {
  return (
    <Link href={href} className={className} {...reste}>
      {children}
    </Link>
  );
}
