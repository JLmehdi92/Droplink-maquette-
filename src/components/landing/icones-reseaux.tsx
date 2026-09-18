/**
 * LES TROIS ICÔNES DE RÉSEAU DU PIED DE LA LANDING — `twitter`, `instagram`,
 * `youtube`, telles que la planche `marketing_site` les rend.
 *
 * ⚠️ POURQUOI ELLES NE VIENNENT PAS DE `lucide-react`. La planche charge Lucide
 * 0.462 ; le dépôt est en 1.45, et Lucide a RETIRÉ ses logos de marque entre les
 * deux — `Twitter`, `Instagram` et `Youtube` n'y existent plus. Les redessiner de
 * mémoire est ce que la règle d'iconographie interdit ; ces tracés sont ceux de
 * la 0.462, recopiés tels quels depuis le paquet publié.
 *
 * ⚠️ ELLES SONT DÉCORATIVES, COMME DANS LA PLANCHE. Elle les pose en icônes nues,
 * sans lien : DropLink n'a pas de compte sur ces réseaux, et une icône cliquable
 * qui ne mènerait nulle part serait pire qu'une icône muette.
 */
const TRAIT = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

export function IconeTwitter() {
  return (
    <svg {...TRAIT}>
      <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z" />
    </svg>
  );
}

export function IconeInstagram() {
  return (
    <svg {...TRAIT}>
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

export function IconeYoutube() {
  return (
    <svg {...TRAIT}>
      <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
      <path d="m10 15 5-3-5-3z" />
    </svg>
  );
}
