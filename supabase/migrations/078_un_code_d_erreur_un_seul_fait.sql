-- 078 — UN CODE D'ERREUR DÉSIGNE UN SEUL FAIT.
--
-- Le code d'erreur fait partie du CONTRAT : c'est par lui, et non par le
-- message, qu'un appelant distingue un refus métier d'une panne. Or quatre
-- codes en désignaient deux chacun :
--
--   DL020  « plafond de médias atteint »        ET  « lot trop grand »
--   DL021  « plafond de vidéos atteint »        ET  « commandes hors de portée »
--   DL026  « aucune boutique pour cet appelant » ET  « clé de média non conforme »
--   DL027  « commande introuvable »             ET  « clé de vignette non conforme »
--
-- AUCUN N'EST ATTEIGNABLE AUJOURD'HUI PAR LE MÊME CHEMIN, et c'est exactement ce
-- qui rend la chose dangereuse : rien ne se casse, rien ne se signale, et
-- `actions.ts` traduit déjà DL021 en « archivage partiel » sans savoir qu'un
-- plafond de vidéos porte le même code. Le jour où un chemin appelle les deux —
-- un dépôt de média pendant une opération de lot, par exemple — l'écran
-- annoncera un archivage partiel pour une vidéo refusée.
--
-- C'est une protection qui tient à une ABSENCE : « ce serait faux si quelqu'un
-- appelait les deux depuis le même endroit ».
--
-- LES CODES DE L'ARCHIVAGE PAR LOT CHANGENT, pas ceux des médias. Les plafonds
-- de la 013 sont les plus anciens et les plus cités ; déplacer les leurs
-- déplacerait le contrat de plus d'appelants.
--
-- ET UN SECOND DÉFAUT, TROUVÉ EN RELISANT CETTE FONCTION : un DOUBLON dans la
-- sélection produisait un message FAUX. `id = any(p_ids)` ne modifie une ligne
-- qu'une fois, donc deux occurrences du même identifiant faisaient sortir
-- `v_modifiees < v_demandes`, et le vendeur lisait « 1 commande sur 2 est hors
-- de portée » pour deux commandes qui étaient les siennes. Un doublon arrive
-- tout seul : une case cochée deux fois, une sélection étendue au clavier.
-- La sélection est désormais DÉDOUBLONNÉE avant d'être comptée — c'est la
-- demande qu'on normalise, pas le verdict qu'on assouplit.

create or replace function public.archiver_lot(p_ids uuid[], p_archiver boolean)
  returns integer
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_ids uuid[];
  v_demandes integer;
  v_modifiees integer;
begin
  -- Dédoublonnée ET débarrassée des nuls : un tableau venu d'une sélection
  -- d'interface peut porter les deux, et aucun des deux ne décrit une commande.
  select array_agg(distinct x) into v_ids
  from unnest(coalesce(p_ids, '{}'::uuid[])) as x
  where x is not null;

  v_demandes := coalesce(array_length(v_ids, 1), 0);

  if v_demandes = 0 then
    return 0;
  end if;

  if v_demandes > 200 then
    raise exception 'lot trop grand : % commandes', v_demandes using errcode = 'DL037';
  end if;

  update public.orders
     set archived_at = case when p_archiver then now() else null end
   where id = any(v_ids);

  get diagnostics v_modifiees = row_count;

  if v_modifiees <> v_demandes then
    -- Le message ne dit PAS lesquelles ont échoué : ce serait révéler
    -- l'existence des commandes d'un autre vendeur à qui en devine les
    -- identifiants. Il dit combien, ce qui suffit à l'écran pour être honnête.
    raise exception 'lot refusé : % commandes sur % sont hors de portée',
      v_demandes - v_modifiees, v_demandes
      using errcode = 'DL038';
  end if;

  return v_modifiees;
end;
$$;

comment on function public.archiver_lot(uuid[], boolean) is
  'Archivage par lot, tout-ou-rien. Sélection dédoublonnée : un doublon est une demande mal formée, pas une commande hors de portée.';

revoke execute on function public.archiver_lot(uuid[], boolean) from public, anon;
grant execute on function public.archiver_lot(uuid[], boolean) to authenticated;

/*
 * LES CLÉS DE MÉDIA REPRENNENT DES CODES À ELLES.
 *
 * DL026 et DL027 étaient déjà employés par `reclamer_evenement_creation` et ses
 * voisines pour « aucune boutique » et « commande introuvable » — c'est-à-dire
 * pour des refus d'IDENTITÉ, quand ceux-ci sont des refus de FORME. Les
 * confondre reviendrait à traiter « ce média ne t'appartient pas » comme « ton
 * compte n'existe pas », qui n'appellent pas la même réponse à l'écran.
 */
create or replace function public.verifier_cles_media()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_prefixe text;
begin
  v_prefixe := public.prefixe_media_attendu(new.order_id);

  -- La commande a disparu entre-temps : la clé étrangère refusera de toute
  -- façon. On ne devine pas un préfixe, on laisse la contrainte parler.
  if v_prefixe is null then
    return new;
  end if;

  if position(v_prefixe in new.cle) <> 1 then
    raise exception 'cle hors du perimetre de la commande'
      using errcode = 'DL039';
  end if;

  -- LA VIGNETTE EST DÉRIVÉE, PAS LIBRE. Elle porte la même racine que le média
  -- plus un suffixe fixe : la laisser libre rouvrirait exactement le même
  -- chemin, avec le même effet, par l'UPDATE au lieu de l'INSERT.
  if new.cle_vignette is not null and new.cle_vignette <> new.cle || '.vignette.webp' then
    raise exception 'vignette non derivee de la cle du media'
      using errcode = 'DL040';
  end if;

  return new;
end;
$$;

-- LE CORPS EST CELUI DE LA 055, MOT POUR MOT, aux deux codes près. Le réécrire
-- « en mieux » au passage aurait mêlé un changement de contrat à un changement
-- de comportement, et rendu impossible de dire lequel des deux a cassé quoi.
revoke all on function public.verifier_cles_media() from public;

comment on function public.verifier_cles_media() is
  'Contrôle PAR VALEUR que les clés d''un média vivent sous le préfixe de sa commande. Codes distincts de ceux des refus d''identité.';
