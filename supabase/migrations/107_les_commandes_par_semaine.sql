-- 107 — LA FRISE HEBDOMADAIRE : douze barres, dont les semaines vides.
--
-- POURQUOI. La planche `Analyses` pose un graphique « Commandes créées par
-- semaine » de douze barres, `AnalysesMobile` en garde huit. C'est le seul
-- endroit du produit où le vendeur voit une TENDANCE plutôt qu'un total, et la
-- tendance est précisément ce que la phase de validation cherche à lire.
--
-- POURQUOI EN BASE ET NON PAR REGROUPEMENT CÔTÉ APPLICATION. Regrouper en
-- JavaScript imposerait de RAPATRIER les commandes de douze semaines pour n'en
-- rendre que douze nombres — jusqu'à deux mille quatre cents lignes chez un
-- fournisseur à deux cents commandes par semaine, pour dessiner douze barres.
--
-- ⚠️ LES SEMAINES VIDES SONT LE SUJET, PAS UN DÉTAIL. Un simple `group by
-- date_trunc('week', …)` ne rend QUE les semaines qui ont des commandes : une
-- semaine sans activité disparaîtrait, les onze autres se resserreraient, et le
-- graphique montrerait une activité continue là où il y a eu un trou. Le
-- `generate_series` porte l'axe du temps ; les commandes ne font que s'y poser.
--
-- ⚠️ `count(o.id)` ET NON `count(*)`. Sur une jointure externe, la semaine sans
-- commande produit tout de même une ligne, dont toutes les colonnes de `orders`
-- sont nulles : `count(*)` la compterait pour UN. Toutes les semaines vides
-- afficheraient alors exactement une commande — un défaut qui ne casse rien, ne
-- lève rien, et se lit comme une activité régulière.
--
-- ⚠️ LES SEMAINES COMMENCENT LE LUNDI, DANS LE FUSEAU DE LA BASE. `date_trunc`
-- suit le `TimeZone` de la session, soit UTC. Un vendeur en France verra donc
-- une commande créée un lundi avant 2 h du matin tomber dans la semaine
-- précédente. Le produit ne stocke aucun fuseau par compte ; inventer celui du
-- navigateur ferait varier la frise selon l'appareil qui la regarde, ce qui est
-- pire qu'un décalage constant de deux heures.

create function public.compter_commandes_par_semaine(
  p_fin timestamptz,
  p_semaines int
)
  returns table (
    debut timestamptz,
    total bigint
  )
  language sql
  stable
  security invoker
  set search_path = ''
as $$
  select s.debut, count(o.id)
  from generate_series(
         date_trunc('week', p_fin) - make_interval(weeks => greatest(p_semaines, 1) - 1),
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

comment on function public.compter_commandes_par_semaine(timestamptz, int) is
  'Commandes créées par semaine, semaines vides comprises, sous la RLS de l''appelant.';

revoke all on function public.compter_commandes_par_semaine(timestamptz, int) from public;
grant execute on function public.compter_commandes_par_semaine(timestamptz, int) to authenticated;
