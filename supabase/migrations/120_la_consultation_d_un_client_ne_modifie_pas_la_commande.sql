-- ═══════════════════════════════════════════════════════════════════════════
-- LA CONSULTATION D'UN CLIENT NE « MODIFIE » PAS LA COMMANDE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ DÉFAUT RÉEL, PROUVÉ PAR EXÉCUTION LE 31/08/2026, en transaction annulée :
--
--     updated_at avant une vue client : 2026-08-30T16:14:08.795Z
--     updated_at après                : 2026-08-31T13:28:17.008Z
--
-- La migration 090 a créé `toucher_updated_at_commande()` PRÉCISÉMENT pour que
-- `updated_at` réponde à « quand le VENDEUR a-t-il touché cette commande », et
-- son en-tête décrit le symptôme mot pour mot : « le vendeur verrait ses
-- commandes se réordonner toutes seules plusieurs fois par jour et lirait
-- "modifiée il y a deux minutes" partout ».
--
-- Elle a fermé le chemin du TRANSPORTEUR, et laissé ouvert celui du CLIENT.
-- `compter_vue()` (migration 027) émet un `update public.orders` pour
-- incrémenter `views_count` ; ce déclencheur-ci le voit comme n'importe quelle
-- écriture et pose `now()`. Chaque ouverture de lien — dédupliquée par visiteur
-- et par jour, donc parfaitement normale — remonte la commande en tête du tri
-- « modifiées » du vendeur et lui affiche une date de modification qu'il n'a
-- pas produite. C'est L-025 : la garde a été écrite en regardant le
-- transporteur, et le second chemin d'écriture non-vendeur est né hors de son
-- champ de vision.
--
-- ── POURQUOI UN SECOND MARQUEUR PLUTÔT QUE DE RÉEMPLOYER LE PREMIER ─────────
--
-- `droplink.maj_transporteur` dit ce qu'il est : une écriture venue de
-- l'ingestion de suivi. Le réemployer pour une vue de page ferait mentir son
-- nom, et le prochain qui lirait `compter_vue` chercherait un transporteur qui
-- n'existe pas. On ajoute donc `droplink.ecriture_hors_vendeur`, plus général,
-- et le déclencheur honore les DEUX — l'ancien reste en vigueur, aucune
-- migration antérieure n'est rouverte.
--
-- ── CE QUI N'EST PAS TRAITÉ ICI, ET POURQUOI ────────────────────────────────
--
-- `arbitrer_qc` fait AUSSI bouger `updated_at`. Ce n'est pas le même cas : une
-- consultation ne change rien à la commande, une décision de contrôle qualité
-- change `qc_status`. Faut-il que la décision d'un client remonte la commande
-- dans le tri « modifiées » du vendeur ? C'est un arbitrage produit, pas un
-- défaut : il est laissé à Wassim, et signalé plutôt que tranché en silence.

create or replace function public.toucher_updated_at_commande()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  -- `current_setting(..., true)` rend NULL au lieu de lever quand le paramètre
  -- n'a jamais été posé — c'est le cas de TOUTES les écritures du vendeur, donc
  -- le cas normal, et il ne doit surtout pas produire d'erreur.
  if coalesce(current_setting('droplink.maj_transporteur', true), '') = 'oui'
     or coalesce(current_setting('droplink.ecriture_hors_vendeur', true), '') = 'oui' then
    -- Ni le transporteur ni le client n'ont « modifié » la commande au sens du
    -- vendeur.
    new.updated_at = old.updated_at;
    return new;
  end if;

  new.updated_at = now();
  return new;
end;
$$;

comment on function public.toucher_updated_at_commande() is
  'updated_at répond à « quand le VENDEUR a-t-il touché cette commande ». Une écriture venue de l''ingestion de suivi OU du comptage d''une vue publique porte un marqueur local à la transaction et laisse la date intacte, sans quoi le tri « modifiées » se réordonnerait à chaque passage de cadence et à chaque ouverture de lien par un client.';

-- ── Le comptage de vue pose le marqueur ─────────────────────────────────────
--
-- Le corps est repris à l'identique de la migration 027, à l'encadrement près.
-- `set_config(..., true)` est LOCAL à la transaction : il ne fuit pas sur
-- l'écriture suivante, et il est remis à vide immédiatement après pour que la
-- même transaction puisse encore porter une écriture du vendeur.
create or replace function public.compter_vue()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  perform set_config('droplink.ecriture_hors_vendeur', 'oui', true);

  update public.orders
     set views_count = views_count + 1,
         last_viewed_at = greatest(coalesce(last_viewed_at, new.viewed_at), new.viewed_at)
   where id = new.order_id;

  perform set_config('droplink.ecriture_hors_vendeur', '', true);

  -- `null` et non `new` : c'est un déclencheur AFTER, dont la valeur de retour
  -- est ignorée. Le corps est repris À LA LETTRE de la définition en vigueur,
  -- relue dans le catalogue — pas reconstruite de mémoire.
  return null;
end;
$$;

comment on function public.compter_vue() is
  'Dénormalise le compteur de vues sur la commande. Pose droplink.ecriture_hors_vendeur pour que la consultation d''un CLIENT ne déplace pas updated_at, qui répond à « quand le vendeur a-t-il touché cette commande ».';

revoke all on function public.compter_vue() from public, anon, authenticated;
