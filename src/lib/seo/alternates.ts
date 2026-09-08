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
