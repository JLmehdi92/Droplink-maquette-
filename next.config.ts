import path from "path";
import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

/**
 * EN-TÊTES DE SÉCURITÉ.
 *
 * Il n'en existait AUCUN avant l'audit — ni `Referrer-Policy`, ni
 * `X-Frame-Options`, ni `Content-Security-Policy`. Les deux premiers manquaient
 * là où ils comptent le plus.
 *
 * LE JETON EST UNE CAPACITÉ, PAS UNE DONNÉE. Il est dans l'URL de `/p/{jeton}`,
 * il est immuable à vie, et la page charge des vignettes depuis des URL
 * présignées R2 — donc vers une AUTRE origine. Le défaut des navigateurs
 * actuels (`strict-origin-when-cross-origin`) n'envoie que l'origine, donc rien
 * ne fuit aujourd'hui. Mais la phrase juste était « ce serait ouvert si le
 * défaut du navigateur changeait, ou si quelqu'un posait une politique plus
 * permissive ». Une protection qui tient à un défaut tiers n'en est pas une.
 *
 * `no-referrer` SUR LA PAGE PUBLIQUE, et pas ailleurs : c'est la seule surface
 * dont l'URL porte un secret.
 */
/**
 * HSTS — ET POURQUOI IL N'EST POSÉ QU'EN PRODUCTION.
 *
 * ⚠️ CE QU'IL PROTÈGE ICI EST PARTICULIER. Sur la plupart des produits, une
 * première visite en clair coûte une session. Ici, l'URL de `/p/{jeton}` PORTE
 * LA CAPACITÉ : le jeton est immuable à vie, et un lien collé dans un DM Snap
 * ou WhatsApp est régulièrement ouvert sans schéma. Une seule interception sur
 * un réseau partagé transfère un accès définitif aux photos et au pseudo du
 * client — et ne laisse aucune trace, donc personne ne pensera à révoquer.
 *
 * `Referrer-Policy: no-referrer` posé plus bas protège le canal SORTANT ; il ne
 * sert à rien si le canal ENTRANT est en clair.
 *
 * ⚠️ JAMAIS EN DÉVELOPPEMENT. Un navigateur qui reçoit cet en-tête sur
 * `http://localhost` épingle l'hôte et refuse ensuite toute connexion en clair —
 * y compris pour d'autres projets servis sur le même hôte, et l'épinglage
 * survit au redémarrage. Le remède se trouve alors dans les réglages internes
 * du navigateur, ce qui est exactement le genre de dette qu'on ne relie jamais
 * à sa cause.
 *
 * Cloudflare peut le poser au bord, et le domaine y est délégué. On ne s'en
 * remet pas à une case cochée ailleurs : rien dans ce dépôt ne pourrait dire si
 * elle est décochée, et une protection dont on ne peut pas constater l'absence
 * n'en est pas une.
 */
const HSTS = { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" };

/**
 * CONTENT-SECURITY-POLICY — DÉFENSE EN PROFONDEUR CONTRE L'XSS.
 *
 * ⚠️ POURQUOI `'unsafe-inline'` SUR LES SCRIPTS ET NON UN NONCE. Le motif à
 * nonce recommandé par Next EXIGE le rendu dynamique de chaque page — la doc le
 * dit noir sur blanc : « une page statique est générée au build, sans requête,
 * donc le nonce ne peut pas y être injecté ». Or la landing, la connexion et
 * SURTOUT `/p/{jeton}` sont rendues STATIQUEMENT, précisément pour tenir le
 * budget LCP < 2 s sur mobile 4G qui est un avantage produit. Forcer le
 * dynamique pour un nonce dégraderait ce que la CSP est censée protéger sans
 * rien apporter : le vrai risque XSS ici est déjà quasi nul — zéro
 * `dangerouslySetInnerHTML`, aucun script tiers, React échappe tout.
 *
 * CE QUE CETTE CSP APPORTE MALGRÉ TOUT, et ce n'est pas rien :
 *   - `script-src 'self' 'unsafe-inline'` bloque le chargement d'un script
 *     EXTERNE injecté (`<script src="//evil">`) — le vecteur d'escalade le plus
 *     courant d'une faille d'injection ;
 *   - `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` ferment
 *     l'injection de greffon, de balise `<base>` et le détournement de
 *     formulaire — trois vecteurs réels, à coût de rupture nul ;
 *   - `img-src`/`connect-src` bornent d'où viennent médias et connexions.
 *
 * ⚠️ LES DEUX SEULES ORIGINES TIERCES LÉGITIMES SONT DÉCLARÉES : R2 (médias
 * signés, uploads directs navigateur) et Supabase (auth, réinitialisation). Les
 * omettre casserait la galerie et la connexion — c'est le mode de rupture qu'on
 * vérifie au navigateur avant de livrer, pas à la relecture.
 *
 * ⚠️ PRODUCTION SEULEMENT, comme HSTS. En développement, `upgrade`/`connect`
 * stricts gêneraient le rechargement à chaud et les assets servis en clair.
 */
function politiqueCSP(): string {
  const r2 = "https://*.r2.cloudflarestorage.com";
  let supabase = "";
  try {
    supabase = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    // URL absente ou illisible au build : on n'ajoute pas d'origine plutôt que
    // d'en inventer une. `connect-src 'self'` reste, et un build sans Supabase
    // n'a de toute façon pas d'auth à joindre.
    supabase = "";
  }
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${r2}`,
    "font-src 'self'",
    `connect-src 'self' ${supabase} ${r2}`.replace(/\s+/g, " ").trim(),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

const CSP_ACTIVE = process.env.NODE_ENV === "production";

const enTetesCommuns = [
  // Le type déclaré fait foi : sans cela, un navigateur peut « deviner » qu'un
  // fichier servi en `image/jpeg` est en réalité du HTML et l'exécuter.
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Le produit ne demande ni caméra, ni micro, ni position. Le dire ferme ces
  // capacités pour tout ce que la page charge, y compris un cadre tiers.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ...(process.env.NODE_ENV === "production" ? [HSTS] : []),
  // La CSP par défaut, sur toutes les surfaces sauf la page publique qui la
  // redéclare pour garder `no-referrer`.
  ...(CSP_ACTIVE ? [{ key: "Content-Security-Policy", value: politiqueCSP() }] : []),
];

const nextConfig: NextConfig = {
  /*
   * LE SEUL DRAPEAU EXPÉRIMENTAL DU PROJET, ET IL EST MESURÉ.
   *
   * Il active `app/global-not-found.tsx`, qui est le SEUL montage capable de
   * rendre notre écran « page introuvable » ici : sans layout racine — décision
   * délibérée, deux racines distinctes pour que `/p/{jeton}` ne monte pas le
   * socle du tableau de bord — aucun `not-found.tsx` de segment n'est pris.
   * Quatre montages ont été essayés et mesurés ; le pourquoi complet est dans
   * `src/app/global-not-found.tsx`.
   *
   * ⚠️ RELEVÉ SUR HUIT URL, AVEC ET SANS, AVANT DE L'ACCEPTER :
   *
   *   /fr/pas-une-route       page anglaise de Next  →  notre écran, lang="fr"
   *   /en/pas-une-route       page anglaise de Next  →  notre écran, lang="en"
   *   /p/{jeton inconnu}      écran de lien mort     →  IDENTIQUE
   *   /p/{vrai jeton}         page client            →  IDENTIQUE
   *   /fr, /fr/conditions     200                    →  IDENTIQUE
   *   /fr/commandes           307 vers connexion     →  IDENTIQUE
   *   /pas-une-route          307 vers /fr/…         →  IDENTIQUE
   *
   * Rien d'autre que les deux 404 de langue ne bouge. C'est ce qui rend ce
   * drapeau acceptable — et c'est aussi ce qu'il faudra REMESURER à chaque
   * montée de version de Next, parce qu'un drapeau expérimental peut changer
   * de nom, de comportement, ou disparaître. Le retirer coûte cette ligne et le
   * fichier qu'elle active ; le produit revient alors à la page anglaise.
   */
  experimental: { globalNotFound: true },
  // Racine epinglee : un `package-lock.json` traine dans le dossier
  // utilisateur, et Next.js l'elisait comme racine d'espace de travail. La
  // resolution des modules serait alors partie d'un dossier sans rapport.
  turbopack: { root: path.join(__dirname) },
  outputFileTracingRoot: path.join(__dirname),

  async headers() {
    return [
      {
        source: "/:path*",
        headers: enTetesCommuns,
      },
      {
        /*
         * LA PAGE PUBLIQUE EST TRAITÉE À PART, pour deux raisons distinctes.
         *
         * 1. `no-referrer` : son URL CONTIENT le jeton. Toute requête sortante
         *    — une vignette signée sur R2 — emporterait l'en-tête `Referer`, et
         *    avec lui la capacité d'ouvrir la commande, définitivement.
         *
         * 2. `frame-ancestors 'none'` : l'arbitrage QC y est exposé à un
         *    visiteur NON authentifié, sans étape de confirmation. Cadrée en
         *    transparence par quiconque détient le lien, la page ferait
         *    approuver la commande par le client à son insu — et l'approbation
         *    est précisément l'acte qui engage.
         *
         * `X-Frame-Options: DENY` est conservé en plus : les deux disent la
         * même chose, mais aux navigateurs de générations différentes.
         */
        source: "/p/:path*",
        headers: [
          // On retire Referrer-Policy ET la CSP de base pour les redéclarer :
          // `no-referrer` (l'URL porte le jeton), et la même CSP complète —
          // qui inclut déjà `frame-ancestors 'none'`, sans doublon d'en-tête.
          ...enTetesCommuns.filter(
            (h) => h.key !== "Referrer-Policy" && h.key !== "Content-Security-Policy",
          ),
          { key: "Referrer-Policy", value: "no-referrer" },
          ...(CSP_ACTIVE ? [{ key: "Content-Security-Policy", value: politiqueCSP() }] : []),
        ],
      },
    ];
  },
};

// Le plugin indique a Next ou trouver `getRequestConfig`. Sans lui, les
// Server Components rendent les cles brutes au lieu des traductions — un
// echec qui ne leve pas et se voit seulement a l ecran.
const avecIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default avecIntl(nextConfig);
