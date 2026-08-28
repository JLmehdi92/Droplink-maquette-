-- 104 — LE DERNIER POINT DE PASSAGE EST PORTÉ PAR LE COLIS.
--
-- POURQUOI. Les deux planches `Envois` et `EnvoisMobile` montrent, pour chaque
-- colis, la DERNIÈRE CHOSE QUE LE TRANSPORTEUR A DITE : « Départ du centre de
-- tri », « Arrivé à la douane », « Remis au destinataire ». C'est l'information
-- qui répond à la question que le vendeur se pose en ouvrant l'écran — non pas
-- « où en est-il » au sens de l'étape, qu'une puce donne déjà, mais « qu'est-ce
-- qui s'est passé en dernier ».
--
-- POURQUOI EN COLONNE ET PAS EN JOINTURE. L'écran rend cinquante colis par
-- page. Aller chercher le point le plus récent de chacun au moment de la
-- lecture, c'est cinquante sous-requêtes ordonnées, à chaque affichage, pour
-- toujours. La valeur, elle, ne change qu'à l'arrivée d'un point de passage —
-- quelques fois par colis, sur toute sa vie. On paie donc à l'écriture.
--
-- C'est le même arbitrage que `orders.media_count` (migration 101), et la même
-- forme : une colonne dénormalisée qu'AUCUN chemin applicatif n'écrit, tenue
-- par un déclencheur. Une règle applicative peut être oubliée dans un nouveau
-- chemin de code ; une règle en base ne peut pas l'être.
--
-- ⚠️ LE DÉCLENCHEUR RECALCULE, IL NE COMPARE PAS. Une première version se
-- proposait de tester `new.occurred_at >= tracked_parcels.last_movement_at` :
-- c'était supposer que `appliquer_etat_colis` met la date à jour AVANT
-- d'insérer les points. Selon l'ordre réel, le test laisse passer plusieurs
-- points d'une même rafale, et c'est alors le DERNIER INSÉRÉ qui gagne — pas le
-- plus récent. Le fournisseur ne garantit aucun ordre dans son tableau. Relire
-- la table coûte une lecture d'index (`parcel_checkpoints (parcel_id,
-- occurred_at desc)`, posé en 029) et ne peut pas se tromper.
--
-- LA SUPPRESSION EST COUVERTE AUSSI. La purge des points de passage existe ;
-- sans le déclencheur sur `delete`, la colonne garderait le nom d'un passage
-- effacé — un écran qui affirme ce que la base n'a plus.

alter table public.tracked_parcels
  add column dernier_point text;

comment on column public.tracked_parcels.dernier_point is
  'Description du point de passage le plus récent, tenue par un déclencheur. Aucun chemin applicatif ne l''écrit.';

create function public.noter_dernier_point()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_colis uuid := coalesce(new.parcel_id, old.parcel_id);
begin
  update public.tracked_parcels tp
     set dernier_point = (
           select pc.description
             from public.parcel_checkpoints pc
            where pc.parcel_id = v_colis
            order by pc.occurred_at desc, pc.id desc
            limit 1
         )
   where tp.id = v_colis;

  return null;
end;
$$;

comment on function public.noter_dernier_point() is
  'Tient `tracked_parcels.dernier_point` à jour depuis les points de passage.';

-- APRÈS, ET NON AVANT : la ligne insérée doit être visible de la sous-requête,
-- sinon le point qui vient d'arriver ne se compte pas lui-même.
create trigger parcel_checkpoints_dernier_point
  after insert or delete on public.parcel_checkpoints
  for each row execute function public.noter_dernier_point();

-- Postgres accorde `EXECUTE` à `PUBLIC` par défaut, et un droit d'exécution ne
-- s'écrit pas dans le corps d'une fonction : aucune relecture ne peut le voir.
-- Une fonction `security definer` qui écrit dans les colis de tous les vendeurs
-- ne doit être appelable que par le déclencheur.
revoke execute on function public.noter_dernier_point() from public, anon, authenticated;

-- REPRISE DE L'EXISTANT. Sans elle, la colonne resterait vide pour tout colis
-- déjà suivi, et l'écran afficherait « — » sur des colis qui ont bougé — donc
-- il affirmerait qu'on ne sait rien de colis dont on sait tout.
update public.tracked_parcels tp
   set dernier_point = (
         select pc.description
           from public.parcel_checkpoints pc
          where pc.parcel_id = tp.id
          order by pc.occurred_at desc, pc.id desc
          limit 1
       )
 where exists (select 1 from public.parcel_checkpoints pc where pc.parcel_id = tp.id);
