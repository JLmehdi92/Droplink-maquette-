-- 037 — Les analyses : ce que le vendeur apprend sur son propre usage.
--
-- CE QUI EST MESURÉ EST CE QUI DÉCIDE. Le livrable réel de la phase de
-- validation est la donnée d'usage, et le vendeur a besoin des mêmes chiffres
-- que nous : combien de commandes il crée, combien de ses liens sont réellement
-- ouverts, combien de clients arbitrent le contrôle qualité. Un écran qui lui
-- montrerait autre chose que ce qu'on regarde nous-mêmes serait une vitrine.
--
-- LE TITRE DE LA MAQUETTE EST ABANDONNÉ. Elle annonce un « taux de conformité
-- global » sur des articles inspectés : personne n'inspecte de contrôle qualité
-- chez nous. Ce que nous savons, c'est ce que le CLIENT a répondu quand on lui a
-- montré les photos — approuvé, refusé, ou rien. C'est une donnée sur sa
-- réaction, pas un verdict sur la marchandise.
--
-- TOUT SE CALCULE SUR `orders` SEULE, sans jointure.
--
-- `views_count` est dénormalisé sur la commande depuis la migration 027, et
-- c'est ce qui rend cet écran possible : compter les liens ouverts par une
-- jointure vers `link_views` obligerait à parcourir la table qui grossit le plus
-- vite du produit — une ligne par visiteur ET PAR JOUR. Un agrégat complet ne se
-- rattrape par aucun index, donc la seule façon de tenir est de ne pas avoir à
-- le faire.
--
-- `security invoker` : la fonction s'exécute sous la RLS de l'appelant. Elle ne
-- peut structurellement compter que ses propres commandes, et il n'y a aucun
-- filtre de propriété à écrire dans son corps — donc aucun à oublier dans un
-- futur chemin de code.

create function public.analyser_activite(p_depuis timestamptz)
  returns table (
    commandes_creees bigint,
    commandes_ouvertes bigint,
    vues_totales bigint,
    qc_approuve bigint,
    qc_refuse bigint,
    qc_en_attente bigint,
    avec_suivi bigint,
    archivees bigint
  )
  language sql
  stable
  security invoker
  set search_path = ''
as $$
  select
    count(*),
    -- LE CHIFFRE QUI DIT SI LE PRODUIT SERT À QUELQUE CHOSE. Un lien créé mais
    -- jamais ouvert est un lien que le vendeur n'a pas envoyé, ou que son client
    -- n'a pas cliqué : les deux sont des signaux, et les confondre avec un
    -- succès rendrait toute la mesure inutilisable.
    count(*) filter (where o.views_count > 0),
    coalesce(sum(o.views_count), 0),
    count(*) filter (where o.qc_status = 'approuve'),
    count(*) filter (where o.qc_status = 'refuse'),
    -- « En attente » N'EST PAS l'absence de réponse : c'est l'état d'une
    -- commande dont le client n'a pas encore tranché. Le déduire par
    -- soustraction produirait un total faux le jour où une valeur d'énumération
    -- s'ajoute, et personne ne le verrait — les trois chiffres continueraient de
    -- s'afficher.
    count(*) filter (where o.qc_status = 'en_attente'),
    count(*) filter (where o.tracking_number is not null and o.tracking_number <> ''),
    count(*) filter (where o.archived_at is not null)
  from public.orders o
  where o.created_at >= p_depuis
$$;

comment on function public.analyser_activite(timestamptz) is
  'Compteurs d''activité du vendeur sur une période, sous la RLS de l''appelant.';

-- Postgres accorde EXECUTE à PUBLIC par défaut, et un droit ne s'écrit pas dans
-- le corps d'une fonction : aucune relecture de code ne peut le voir.
revoke all on function public.analyser_activite(timestamptz) from public;
grant execute on function public.analyser_activite(timestamptz) to authenticated;
