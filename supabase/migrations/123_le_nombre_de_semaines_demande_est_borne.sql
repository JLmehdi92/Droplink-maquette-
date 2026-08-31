-- ═══════════════════════════════════════════════════════════════════════════
-- LE NOMBRE DE SEMAINES DEMANDÉ EST BORNÉ EN HAUT, PAS SEULEMENT EN BAS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ DÉFAUT RÉEL, RELEVÉ DANS LE CATALOGUE LE 31/08/2026 : le corps en vigueur
-- de `compter_commandes_par_semaine` porte `greatest(p_semaines, 1)` et AUCUN
-- `least(…)`. Le plancher est borné, le plafond ne l'est pas.
--
-- La fonction est accordée à `authenticated` (migration 107). Un appelant muni
-- de la clé publiable et d'une session — donc n'importe quel compte, les
-- inscriptions étant ouvertes — peut l'appeler DIRECTEMENT en PostgREST, hors
-- de l'application, avec `p_semaines = 10000000`. `generate_series` produit
-- alors dix millions de lignes, chacune jointe en externe à `public.orders` sur
-- une condition de plage. La limitation de débit du produit vit dans la table
-- `rate_limit` et n'est appliquée que par nos chemins applicatifs : un appel
-- RPC direct ne la traverse pas.
--
-- ── LE MOTIF JUSTE EXISTE DÉJÀ DEUX FOIS DANS CE MÊME DÉPÔT ────────────────
--
--   033_cadence_et_veilleur.sql:64      least(coalesce(p_limite, 50), 200)
--   116_les_colis_pris_en_charge…:39    « sans plafond, un appelant pourrait
--                                         demander dix ans de jours à la ligne »
--
-- La 107 est la seule des trois à ne pas l'avoir posé. Ce n'est donc pas une
-- règle à inventer, c'est une règle à propager (L-007).
--
-- ── LE PLAFOND RETENU : 260 SEMAINES ────────────────────────────────────────
--
-- Cinq ans. L'écran des Analyses demande 12 ou 26 semaines ; 260 laisse dix
-- fois la marge de tout usage légitime, et borne le travail à un ordre de
-- grandeur que la base absorbe sans y penser. Il est écrit ici plutôt que dans
-- `parametres_admis` parce que ce n'est pas un réglage produit : personne n'a de
-- raison de le changer, et un paramètre de plus est une surface de plus.
--
-- LE CORPS EST REPRIS DE `pg_get_functiondef`, au `least` près.
--
-- ⚠️ `create or replace` SUFFIT ICI : ni les arguments, ni le type de retour, ni
-- le langage, ni les attributs ne changent. Il n'y a donc pas de seconde
-- surcharge possible, et l'ACL est conservée — elle est tout de même reposée
-- en fin de fichier, pour que la ligne ne manque pas le jour d'un `drop`.

create or replace function public.compter_commandes_par_semaine(
  p_fin timestamptz,
  p_semaines integer
)
  returns table(debut timestamptz, total bigint)
  language sql
  stable
  set search_path = ''
as $$
  select s.debut, count(o.id)
  from generate_series(
         -- BORNÉ DES DEUX CÔTÉS. `greatest` empêchait un intervalle vide ou
         -- négatif ; `least` empêche qu'un appelant fasse produire dix millions
         -- de lignes à la base depuis une seule requête.
         date_trunc('week', p_fin)
           - make_interval(weeks => least(greatest(p_semaines, 1), 260) - 1),
         date_trunc('week', p_fin),
         interval '1 week'
       ) as s(debut)
  left join public.orders o
         on o.created_at >= s.debut
        and o.created_at < s.debut + interval '1 week'
        -- LE MÊME « COMMANDE CRÉÉE » QUE LES COMPTEURS DU HAUT DE L'ÉCRAN. Deux
        -- définitions du même mot sur le même écran, l'une dans un compteur et
        -- l'autre dans un graphique, se contrediraient sans que rien ne le dise.
        and o.first_content_at is not null
  group by s.debut
  order by s.debut
$$;

comment on function public.compter_commandes_par_semaine(timestamptz, integer) is
  'Commandes créées par semaine, pour la frise des Analyses. Le nombre de semaines est borné à [1, 260] : la fonction est accordée à authenticated, donc appelable directement en PostgREST, hors de toute limitation de débit applicative.';

revoke all on function public.compter_commandes_par_semaine(timestamptz, integer) from public, anon;
grant execute on function public.compter_commandes_par_semaine(timestamptz, integer) to authenticated;
