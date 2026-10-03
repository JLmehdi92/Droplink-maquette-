import type { Metadata } from "next";
import { LANGUES, LANGUE_DEFAUT, type Langue } from "@/i18n/config";
import { origineConfiguree } from "@/lib/site";

/**
 * CANONIQUE ET HREFLANG — un fait, un point d'émission.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * MESURÉ SUR LA PRODUCTION LE 08/09/2026 : IL N'Y EN AVAIT AUCUN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `grep -c 'rel="canonical"'` et `rel="alternate"` sur le HTML servi de
 * `https://droplink.fr/fr` : **0 et 0**. Et `alternates` n'apparaissait nulle
 * part dans `src/` — le produit sert trois langues depuis le 06/09 sans jamais
 * dire à un moteur qu'elles sont les traductions les unes des autres.
 *
 * CE QUE ÇA COÛTE, PRÉCISÉMENT. Sans hreflang, Google ne voit pas un site en
 * trois langues : il voit trois pages qui se ressemblent, en choisit UNE, et
 * sert celle-là à tout le monde. Le fournisseur de Guangzhou reçoit la version
 * française, ou l'inverse. Le travail de traduction existe et n'atteint
 * personne.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LES DEUX RÈGLES QUI CASSENT TOUT SI ON LES RATE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. **L'AUTO-RÉFÉRENCE EST OBLIGATOIRE.** Chaque page doit se citer elle-même
 *    dans son propre jeu. Si elle manque, Google n'ignore pas cette ligne : il
 *    **ignore le jeu ENTIER**. C'est la panne la plus silencieuse du sujet —
 *    tout paraît en place et rien ne s'applique.
 *
 * 2. **LE MAILLAGE EST BIDIRECTIONNEL.** Si `/fr` cite `/en`, alors `/en` doit
 *    citer `/fr`. Un lien qui ne revient pas invalide le signal des DEUX côtés.
 *    On engendre donc les trois lignes depuis `LANGUES` plutôt que de les
 *    écrire page par page : une langue ajoutée au type se propage partout, et
 *    aucune main ne peut en oublier une.
 *
 * ⚠️ `x-default` DÉSIGNE LE FRANÇAIS, ET CE N'EST PAS UN DÉFAUT PARESSEUX.
 * Il répond à « quelle version servir à quelqu'un dont je ne reconnais pas la
 * langue ». `LANGUE_DEFAUT` porte déjà cette décision pour le produit ; en
 * inventer une seconde ici créerait deux réponses à la même question.
 *
 * ⚠️ POURQUOI `zh-CN` ET NON `zh-Hans`, alors que le sous-tag de script serait
 * linguistiquement plus juste : `i18n/config.ts` l'a tranché sur une MESURE,
 * et hreflang ne peut pas s'en écarter sans mentir sur l'URL qu'il décrit. Le
 * filtre pré-emptif du middleware n'accepte qu'un sous-tag de DEUX lettres
 * (`[a-z]{2}(?:-[a-z]{2})?`, `lib/routes/vise-admin.ts`) : sous `zh-Hans`, la
 * couche qui rend 404 sur l'admin cesserait d'exister. Le code de langue du
 * produit, celui de l'URL, celui de `<html lang>` et celui de hreflang restent
 * donc le même — et `zh-CN` est un tag parfaitement valide, langue + région.
 */

/**
 * Les alternates d'une page, pour toutes les langues.
 *
 * @param chemin Chemin SANS préfixe de langue, commençant par `/` — ou `""`
 *   pour la racine d'une langue. Jamais une URL complète.
 */
export function alternatesDe(langue: Langue, chemin: string): Metadata["alternates"] {
  const origine = origineConfiguree();

  /*
   * ⚠️ PAS D'ORIGINE, PAS DE CANONIQUE — ET SURTOUT PAS UNE CANONIQUE DEVINÉE.
   *
   * Une canonique fausse est bien pire que pas de canonique : elle DÉSIGNE
   * l'adresse que le moteur doit indexer à la place de celle-ci. Construite
   * depuis un en-tête, elle enverrait l'index vers l'hôte que l'appelant a
   * choisi — c'est la même famille de défaut que les redirections qui
   * pointaient vers `localhost:8080`, mais durable, parce qu'un index se
   * corrige en semaines.
   *
   * En développement, où la variable est souvent absente, on rend simplement
   * rien : aucune balise, donc aucune affirmation.
   */
  if (origine === null) return undefined;

  const url = (l: Langue): string => `${origine}/${l}${chemin}`;

  // Engendré depuis `LANGUES`, jamais écrit à la main : c'est ce qui garantit
  // l'auto-référence et le maillage complet, y compris pour la langue ajoutée
  // demain par quelqu'un qui n'aura pas lu ce fichier.
  const languages: Record<string, string> = {};
  for (const l of LANGUES) languages[l] = url(l);
  languages["x-default"] = url(LANGUE_DEFAUT);

  return { canonical: url(langue), languages };
}

/**
 * Le format de langue attendu par Open Graph : `langue_RÉGION`, souligné.
 *
 * ⚠️ CE N'EST PAS LE MÊME FORMAT QUE HREFLANG, ET LA CONFUSION EST LE DÉFAUT
 * ORDINAIRE DU SUJET. Hreflang veut `zh-CN` (tiret, ISO 639-1 + ISO 3166-1) ;
 * Open Graph veut `zh_CN` (souligné). Écrire `fr` seul, ou `fr-FR`, fait
 * ignorer la balise en silence — elle reste dans la page, et rien ne la lit.
 *
 * La table est EXHAUSTIVE PAR LE TYPE : `Record<Langue, string>` ne compile
 * plus si une langue est ajoutée à `LANGUES` sans réponse ici. Un `??` de repli
 * aurait laissé la langue suivante partir avec une valeur muette.
 */
const LOCALE_OPEN_GRAPH: Record<Langue, string> = {
  fr: "fr_FR",
  en: "en_US",
  "zh-CN": "zh_CN",
};

/**
 * L'aperçu de partage d'une surface DropLink.
 *
 * ⚠️ À N'APPELER QUE SUR NOS PROPRES SURFACES. La page `/p/[token]` n'en a
 * JAMAIS (décision 23) : un aperçu enrichi montrerait la photo ou le pseudo du
 * client DANS la conversation, donc à qui n'ouvre pas le lien — et les
 * messageries le mettent en cache sur leurs serveurs. Fuite silencieuse et
 * définitive. Deux gardes l'exigent, une sur le code et une sur le HTML servi.
 *
 * ⚠️ CE BLOC DISAIT « AUCUNE IMAGE, `public/` NE CONTIENT QUE LES POLICES », ET
 * C'ÉTAIT DEVENU FAUX : `public/marque/` porte le logo et les illustrations du
 * kit depuis la mi-septembre. L-014 — un document affirme un état que personne
 * n'a vérifié. L'image de partage de la planche (`og-droplink.png`, 1200 × 630)
 * est désormais servie.
 *
 * ⚠️ ELLE EST À LA RACINE DE `public/`, ET PAS DANS `marque/` — c'est la seule
 * place qui marche. Le filtre du middleware n'exclut que les fichiers d'un seul
 * segment (`/robots.txt`) : un chemin comme `/marque/og.jpg` reçoit la
 * redirection de langue, 307 vers `/fr/marque/og.jpg`, et un robot de
 * messagerie qui ne suit pas les redirections montrerait un aperçu CASSÉ.
 * Mesuré sur le serveur de mesure le 18/09/2026.
 */
export function openGraphDe(
  langue: Langue,
  chemin: string,
  textes: { readonly titre: string; readonly description: string },
  /*
   * Une page qui n'existe que dans SA langue (le blog) n'annonce pas d'autres
   * locales : `og:locale:alternate` en_US et zh_CN y promettaient des versions
   * qui rendent 404 (contre-inventaire de l'audit SEO, 03/10/2026) — l'écho Open
   * Graph de `alternatesUneSeuleLangue`.
   */
  options: { readonly uneSeuleLangue?: boolean } = {},
): Metadata["openGraph"] {
  const origine = origineConfiguree();
  if (origine === null) return undefined;

  return {
    type: "website",
    siteName: "DropLink",
    title: textes.titre,
    description: textes.description,
    url: `${origine}/${langue}${chemin}`,
    images: [{ url: `${origine}/og-droplink.jpg`, width: 1200, height: 630, alt: textes.titre }],
    locale: LOCALE_OPEN_GRAPH[langue],
    // Les autres langues, pour qu'un aperçu partagé sache qu'elles existent.
    ...(options.uneSeuleLangue === true
      ? {}
      : { alternateLocale: LANGUES.filter((l) => l !== langue).map((l) => LOCALE_OPEN_GRAPH[l]) }),
  };
}

/**
 * Les alternates d'une page qui n'existe QUE dans une langue.
 *
 * ⚠️ POURQUOI UNE SECONDE FONCTION PLUTÔT QU'UN DRAPEAU SUR LA PREMIÈRE.
 * `alternatesDe()` engendre les trois langues depuis `LANGUES`, et c'est
 * exactement ce qu'on veut partout ailleurs : la langue ajoutée demain se
 * propage sans que personne y pense. Ici il faut l'inverse — et un drapeau
 * booléen sur la même fonction se serait oublié au premier appel copié.
 *
 * ⚠️ CE QU'ON ÉVITE, PRÉCISÉMENT. Déclarer `hreflang="en"` vers une page qui
 * n'existe pas ne dégrade pas un peu le signal : Google ignore le JEU ENTIER
 * dès qu'une URL du jeu ne répond pas. On perdrait le hreflang de la page **et**
 * on enverrait des lecteurs sur des 404. Une seule langue déclarée, plus le
 * `x-default` qui pointe vers elle, est la forme juste — elle dit « cette page
 * existe dans cette langue, et c'est aussi le repli ».
 */
export function alternatesUneSeuleLangue(
  langue: Langue,
  chemin: string,
): Metadata["alternates"] {
  const origine = origineConfiguree();
  if (origine === null) return undefined;

  const url = `${origine}/${langue}${chemin}`;
  return { canonical: url, languages: { [langue]: url, "x-default": url } };
}
