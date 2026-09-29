/*
 * 206 — CE QUE LE RGPD EXIGE D'EFFACER, ET CE QU'UNE SUPPRESSION NE DOIT PAS
 * LAISSER COURIR. Audit RGPD du 29/09/2026 (deux agents ECC, vérifié à la main).
 *
 * QUATRE DÉFAUTS CONFIRMÉS :
 *
 *  1. LA POLITIQUE DE CONFIDENTIALITÉ MENTAIT. Elle promet qu'« une demande non
 *     confirmée est effacée après vingt-quatre heures ». `notification_requests`
 *     (188) ne perdait ses lignes qu'à la CONFIRMATION : une adresse jamais
 *     confirmée — donc d'une personne qui n'a jamais consenti, puisque n'importe
 *     quel porteur du lien peut en déposer (194) — restait en base aussi
 *     longtemps que la commande. L-014 dans sa forme exacte.
 *
 *  2. LES VUES N'AVAIENT AUCUNE DURÉE. `link_views` (018) garde, par vue, une
 *     empreinte d'IP et de navigateur (pseudonymisation, pas anonymisation : le
 *     sel est fixe) et le pays. Treize mois, la durée que la CNIL retient pour la
 *     mesure d'audience. Le compteur `orders.views_count` et `last_viewed_at`
 *     (027) sont des MESURES dénormalisées : ils ne reculent pas, donc aucune
 *     commande ne redevient « jamais ouverte ». Aucun écran d'analyse ne regarde
 *     au-delà de quelques mois.
 *
 *  3. LES ARCHIVES DE PAIEMENT GARDAIENT TOUT, POUR TOUJOURS. `payment_events`
 *     (177) stockait le webhook Lemon Squeezy BRUT — nom, e-mail, marque et
 *     quatre derniers chiffres de la carte, liens signés du portail, et notre
 *     `custom_data` (identifiant de profil ET sa signature) — sans durée, et le
 *     tout survivait à la suppression du compte (`on delete set null`). Cela
 *     contredisait CLAUDE.md (« aucune carte… en base ») et les CGU (« seules
 *     l'adresse et les dates sont conservées un an »).
 *
 *     ⚠️ POURQUOI UN DÉCLENCHEUR, ET NON UN TRI DANS LA ROUTE : une seule règle,
 *     appliquée à TOUT ce qui écrit dans la table — webhook, fumée, rejeu, ou le
 *     prochain chemin que quelqu'un ajoutera. Une liste tenue dans le code de la
 *     route ne protégerait que la route.
 *
 *     CE QU'ON GARDE, ET POURQUOI C'EST ASSEZ : l'identifiant de l'abonnement et
 *     ceux de commande et de client CHEZ LE FOURNISSEUR, le statut et les dates.
 *     Un paiement qu'on ne sait pas rattacher se retrouve dans le tableau de bord
 *     de Lemon Squeezy par son identifiant, qui y affiche le client : on n'a pas
 *     besoin de recopier son e-mail pour qu'un humain le rattache. Trois ans,
 *     puis effacement.
 *
 *  4. SUPPRIMER UN COMPTE PRO NE RÉSILIAIT PAS L'ABONNEMENT. Aucun appel à
 *     l'API du fournisseur n'existe (le produit n'a pas de clé d'API, par
 *     construction) : la suppression effaçait le compte, la cascade emportait
 *     `subscriptions`, et Lemon Squeezy continuait de prélever chaque mois pour
 *     un compte qui n'existait plus. La base REFUSE désormais la suppression
 *     (DL077) tant qu'un abonnement peut encore prélever ; l'écran dit comment
 *     résilier (portail client du fournisseur), puis supprimer.
 *
 *     « Peut encore prélever » : `active` et `on_trial` (le prochain prélèvement
 *     est programmé), `past_due` et `unpaid` (le fournisseur RÉESSAIE). PAS
 *     `cancelled` (résilié : plus rien ne part, même si la période payée court
 *     encore), ni `expired`, ni `paused`.
 *
 * ⚠️ CE QUI N'EST PAS PURGÉ, ET C'EST UNE DÉCISION : le journal d'administration
 * (`admin_audit_log`). Il est rendu INDESTRUCTIBLE par déclencheur (038, 062,
 * 131) — c'est la preuve de qui a consulté quoi, contrainte n° 6. Le purger
 * défairait cette garantie ; la politique de confidentialité en dit la règle de
 * conservation (défense des droits), au lieu d'une durée que rien n'appliquerait.
 */

-- ── 3. L'archive de paiement réduite à ce qui sert ─────────────────────────────

create function public.resume_evenement_paiement(p_charge jsonb)
  returns jsonb
  language sql
  immutable
  set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'meta', jsonb_build_object(
      'event_name', p_charge -> 'meta' -> 'event_name',
      'test_mode', p_charge -> 'meta' -> 'test_mode'
    ),
    'data', jsonb_build_object(
      'id', p_charge -> 'data' -> 'id',
      'type', p_charge -> 'data' -> 'type',
      'attributes', (
        select coalesce(jsonb_object_agg(cle, valeur), '{}'::jsonb)
          from jsonb_each(
                 case when jsonb_typeof(p_charge -> 'data' -> 'attributes') = 'object'
                      then p_charge -> 'data' -> 'attributes'
                      else '{}'::jsonb end
               ) as attribut(cle, valeur)
         -- LISTE BLANCHE, jamais une liste noire : un champ que le fournisseur
         -- ajoutera demain n'entrera pas sans qu'on l'ait décidé.
         where cle = any (array[
           'store_id', 'customer_id', 'order_id', 'order_item_id',
           'product_id', 'variant_id', 'status', 'cancelled', 'test_mode',
           'renews_at', 'ends_at', 'trial_ends_at', 'created_at', 'updated_at'
         ])
      )
    )
  ));
$$;

comment on function public.resume_evenement_paiement(jsonb) is
  'Réduit un webhook Lemon Squeezy aux identifiants, statut et dates : ni nom, ni e-mail, ni carte, ni lien signé, ni custom_data (206).';

create function public.expurger_evenement_paiement()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.payload := public.resume_evenement_paiement(new.payload);
  return new;
end;
$$;

create trigger payment_events_expurge
  before insert or update of payload on public.payment_events
  for each row execute function public.expurger_evenement_paiement();

-- Les archives déjà écrites : le déclencheur les réduit à la même règle.
update public.payment_events set payload = payload;

-- ── 1, 2, 3. La purge de ce qui a dépassé sa durée ─────────────────────────────

create function public.purger_donnees_expirees()
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_demandes integer;
  v_vues integer;
  v_paiements integer;
begin
  delete from public.notification_requests where expires_at < now();
  get diagnostics v_demandes = row_count;

  delete from public.link_views where viewed_at < now() - interval '13 months';
  get diagnostics v_vues = row_count;

  delete from public.payment_events where received_at < now() - interval '3 years';
  get diagnostics v_paiements = row_count;

  return jsonb_build_object('demandes', v_demandes, 'vues', v_vues, 'paiements', v_paiements);
end;
$$;

comment on function public.purger_donnees_expirees() is
  'Efface ce qui a dépassé sa durée de conservation : demandes d''e-mail non confirmées (24 h), vues (13 mois), archives de paiement (3 ans). Appelée par la veille (206).';

-- ── 4. La suppression refusée tant qu'un abonnement peut prélever ──────────────

create or replace function public.supprimer_mon_compte(p_confirmation text)
  returns setof text
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profil public.profiles%rowtype;
  v_shop uuid;
begin
  if v_uid is null then
    raise exception 'aucune session' using errcode = '42501';
  end if;

  select * into v_profil from public.profiles where user_id = v_uid for update;
  if not found or v_profil.status <> 'active' then
    raise exception 'suppression refusée : compte absent ou inactif' using errcode = 'DL053';
  end if;
  if lower(btrim(coalesce(p_confirmation, ''))) <> lower(v_profil.email) then
    raise exception 'la confirmation ne reprend pas l''adresse du compte' using errcode = 'DL054';
  end if;

  -- 206 : un abonnement qui peut encore prélever doit être résilié AVANT. La
  -- cascade l'effacerait chez nous, jamais chez le fournisseur.
  if exists (
    select 1 from public.subscriptions
     where profile_id = v_profil.id
       and status in ('active', 'on_trial', 'past_due', 'unpaid')
  ) then
    raise exception 'un abonnement en cours doit être résilié avant la suppression du compte'
      using errcode = 'DL077';
  end if;

  select id into v_shop from public.shops where owner_id = v_profil.id;

  insert into public.comptes_supprimes (user_id, email, inscrit_le)
  values (v_uid, v_profil.email, v_profil.created_at);

  if v_shop is not null then
    return query select public.mettre_en_file_la_boutique(v_shop, true);
  end if;

  -- La cascade emporte profil, boutique, commandes, médias, vues, événements,
  -- colis et points de passage ; le journal d'audit garde ses lignes, clés mises
  -- à NULL (migration 042).
  delete from auth.users where id = v_uid;
end;
$$;

-- ── Droits : une fonction nouvelle naît OUVERTE (CLAUDE.md, § Règles de sécurité) ──

revoke all on function public.resume_evenement_paiement(jsonb) from public, anon, authenticated;
revoke all on function public.expurger_evenement_paiement() from public, anon, authenticated;
revoke all on function public.purger_donnees_expirees() from public, anon, authenticated;
grant execute on function public.resume_evenement_paiement(jsonb) to service_role;
grant execute on function public.purger_donnees_expirees() to service_role;

revoke all on function public.supprimer_mon_compte(text) from public;
revoke all on function public.supprimer_mon_compte(text) from anon;
grant execute on function public.supprimer_mon_compte(text) to authenticated;
