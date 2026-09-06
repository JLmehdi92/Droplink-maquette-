/*
 * 144 — LES LANGUES SUPPORTÉES NE SONT PLUS DEUX.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI LA BASE D'ABORD, ET SEULE DANS SA MIGRATION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le produit s'adresse en priorité aux fournisseurs de Guangzhou — c'est le
 * persona qui porte le volume, et Google lui est inaccessible. Le chinois n'est
 * donc pas une langue de plus : c'est la langue de la moitié de la cible.
 *
 * DEUX CONTRAINTES, POSÉES DANS LA 001 ET JAMAIS ROUVERTES DEPUIS, bornent les
 * langues à `('fr','en')` :
 *
 *     profiles_locale_supporte    check (locale in ('fr','en'))
 *     shops_langue_supportee      check (default_language in ('fr','en'))
 *
 * ⚠️ ET RIEN NE LES COMPARE AU CODE. Mesuré le 06/09/2026 : les types générés
 * déclarent `locale` et `default_language` en `text`, donc le compilateur ne
 * voit rien ; `reglages-marque.test.ts` compare bien la base à Zod, mais
 * seulement sur les quatre colonnes de réseaux sociaux ;
 * `bornes-de-saisie-concordantes` n'inspecte que les `CHECK` de LONGUEUR, et
 * les `CHECK … in (…)` lui sont invisibles.
 *
 * L'ÉCHEC AURAIT DONC ÉTÉ SILENCIEUX DANS LES DEUX SENS :
 *
 *   - code élargi, base non migrée → `appliquerReglagesMarque` rend
 *     `error === null` sans distinguer le SQLSTATE : le vendeur reçoit un
 *     « erreur d'écriture » générique, et la cause n'apparaît nulle part ;
 *   - base élargie, code non élargi → le chinois est stockable mais
 *     inatteignable depuis le produit, et rien ne le dit.
 *
 * C'est pour cela que cette migration vient EN PREMIER et SEULE : le code qui
 * la suivra échouerait sans elle, bruyamment plutôt qu'en silence.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI `zh-CN` ET NON `zh-Hans`, QUI SERAIT PLUS CORRECT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `zh-Hans` désigne le SCRIPT simplifié indépendamment du pays, et c'est la
 * forme que recommanderait un linguiste. Elle est écartée pour une raison
 * mesurée, pas théorique : le filtre pré-emptif du middleware accepte un code
 * de deux lettres suivi d'un sous-tag de DEUX lettres. Vérifié par exécution :
 *
 *     /zh/admin        reconnu        /zh-Hans/admin      NON reconnu
 *     /zh-CN/admin     reconnu        /zh-Hant-TW/admin   NON reconnu
 *
 * Avec `zh-Hans`, la couche qui rend 404 sur l'admin — celle qui empêche la
 * surface d'EXISTER pour qui n'y a pas droit — disparaîtrait sans un seul
 * signal. Aucune donnée ne fuirait, `requireAdmin()` fait autorité ; mais on
 * perdrait en silence une défense qu'on croit avoir, et c'est exactement ce
 * que ce dépôt refuse.
 *
 * `tests/unit/filtre-admin-du-middleware.test.ts` fige ce constat et éprouve la
 * CAPACITÉ du motif, pas seulement les langues du moment — il s'est fait
 * falsifier une première fois pour cette raison précise.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QUE CETTE MIGRATION NE FAIT PAS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Elle n'ajoute AUCUNE valeur par défaut nouvelle et ne touche à aucune ligne.
 * `locale` et `default_language` gardent leur défaut `'fr'` : un compte
 * existant ne change pas de langue parce qu'une troisième devient possible.
 * Élargir une contrainte n'a jamais reclassé personne.
 */

alter table public.profiles
  drop constraint profiles_locale_supporte;

alter table public.profiles
  add constraint profiles_locale_supporte
  check (locale in ('fr', 'en', 'zh-CN'));

alter table public.shops
  drop constraint shops_langue_supportee;

alter table public.shops
  add constraint shops_langue_supportee
  check (default_language in ('fr', 'en', 'zh-CN'));

comment on constraint profiles_locale_supporte on public.profiles is
  'Langues de l''interface vendeur. Élargie à zh-CN le 06/09/2026 (migration '
  '144). `zh-Hans` est écarté : le filtre pré-emptif du middleware n''accepte '
  'qu''un sous-tag de deux lettres, et la couche 404 de l''admin '
  'disparaîtrait en silence.';

comment on constraint shops_langue_supportee on public.shops is
  'Langue des pages CLIENT de cette boutique — celle que verront ses '
  'destinataires, jamais celle de l''URL du vendeur. Élargie à zh-CN le '
  '06/09/2026 (migration 144).';
