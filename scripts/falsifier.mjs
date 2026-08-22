#!/usr/bin/env node
/**
 * Casse le PRODUIT en base, pas les tests. Puis remet en état.
 *
 * Falsifier en cassant les tests ne prouve que la capacité des tests à échouer.
 * Ce qu'on veut savoir, c'est si une protection RETIRÉE est DÉTECTÉE — et
 * surtout hors du cas qui a motivé son écriture, parce qu'un garde écrit après
 * coup hérite du champ de vision de la correction, pas du problème.
 *
 * Usage : node scripts/falsifier.mjs <casser|reparer> <cible>
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });

const POLICY_LECTURE_SHOPS = `create policy shops_lecture_du_sien on public.shops
  for select to authenticated
  using (owner_id in (select p.id from public.profiles p where p.user_id = (select auth.uid())));`;

const POLICY_MAJ_PROFILS = `create policy profiles_maj_de_soi on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));`;

const SQL = {
  /** LE cas motivant : l'auto-promotion en admin. */
  role: {
    casser: "grant update (role) on public.profiles to authenticated;",
    reparer: "revoke update (role) on public.profiles from authenticated;",
  },

  /** HORS du cas motivant : une table future créée sans RLS. */
  table: {
    casser:
      "create table public.table_piege (id uuid primary key default gen_random_uuid(), secret text);",
    reparer: "drop table if exists public.table_piege;",
  },

  /** La policy de lecture retirée : chacun voit alors tout. */
  "policy-lecture": {
    casser: "drop policy if exists shops_lecture_du_sien on public.shops;",
    reparer: POLICY_LECTURE_SHOPS,
  },

  /** RLS désactivée sur une table qui en a une : le cas le plus grossier. */
  "rls-off": {
    casser: "alter table public.shops disable row level security;",
    reparer: "alter table public.shops enable row level security;",
  },

  /** RLS non FORCÉE : subtil, car la table reste « protégée » en apparence. */
  "rls-non-forcee": {
    casser: "alter table public.shops no force row level security;",
    reparer: "alter table public.shops force row level security;",
  },

  /**
   * Le compteur de quota rendu NON ATOMIQUE.
   *
   * Lire puis écrire au lieu d'incrémenter en un seul ordre. Le defaut est
   * invisible en séquentiel — tous les tests à la file continuent de passer —
   * et ne se manifeste que sous concurrence, c'est-à-dire exactement sous la
   * charge que la limitation doit borner. Une course qui DÉGRADE au lieu de
   * casser est la plus difficile à attribuer.
   */
  "quota-non-atomique": {
    casser: `create or replace function public.consommer_quota(
        p_cle text, p_plafond integer, p_fenetre_secondes integer
      ) returns boolean language plpgsql security definer set search_path = '' as $$
      declare v_debut timestamptz; v_compte integer;
      begin
        v_debut := to_timestamp(floor(extract(epoch from clock_timestamp())
                   / p_fenetre_secondes) * p_fenetre_secondes);
        select coalesce(compte, 0) into v_compte from public.rate_limit
          where cle = p_cle and fenetre_debut = v_debut;
        v_compte := coalesce(v_compte, 0) + 1;
        insert into public.rate_limit (cle, fenetre_debut, compte)
          values (p_cle, v_debut, v_compte)
          on conflict (cle, fenetre_debut) do update set compte = v_compte;
        return v_compte <= p_plafond;
      end; $$;`,
    // La réparation est RELUE DEPUIS LA MIGRATION, pas réécrite ici. Une
    // réparation recopiée à la main dérive du dépôt sans que rien ne le dise,
    // et l'on croirait alors avoir restauré l'état de référence en ayant
    // restauré une copie périmée.
    reparerDepuisMigration: {
      fichier: "005_limitation_de_debit.sql",
      depuis: "create function public.consommer_quota",
    },
  },

  /**
   * Le declencheur d immuabilite du jeton, retire.
   *
   * L invariant le plus lourd du produit : le jeton ne transfere pas une donnee
   * mais une CAPACITE, definitivement. Sans ce declencheur, il ne reste que le
   * privilege de colonne — c est-a-dire une protection qui tient a une ABSENCE.
   */
  "jeton-mutable": {
    casser: "drop trigger orders_jeton_public_immuable on public.orders;",
    reparer:
      "create trigger orders_jeton_public_immuable before update on public.orders " +
      "for each row execute function public.jeton_public_immuable();",
  },

  /**
   * La rotation SANS verification de propriete.
   *
   * `regenerer_jeton_public` est en `security definer`, donc la RLS ne la
   * protege pas. Sans le controle dans son corps, n importe quel compte peut
   * faire tourner le jeton d un autre vendeur — c est-a-dire couper le lien
   * deja envoye aux clients de quelqu un d autre.
   */
  "rotation-sans-controle": {
    casser: `create or replace function public.regenerer_jeton_public(p_order_id uuid)
      returns text language plpgsql security definer set search_path = '' as $$
      declare v_nouveau text;
      begin
        perform set_config('droplink.rotation_jeton', 'oui', true);
        update public.orders
          set public_token = public.generer_jeton_public(),
              unsubscribe_token = public.generer_jeton_public()
          where id = p_order_id
          returning public_token into v_nouveau;
        perform set_config('droplink.rotation_jeton', '', true);
        return v_nouveau;
      end; $$;`,
    reparerDepuisMigration: {
      fichier: "007_jeton_public_immuable.sql",
      depuis: "create function public.regenerer_jeton_public",
    },
  },

  /**
   * L index partiel du tri par defaut, retire.
   *
   * Defaut REEL trouve par la mesure du plan : sans lui, la premiere page lit
   * 9 120 lignes pour en rendre 50, en 5,4 ms. Le chronometre ne sonne jamais —
   * seul le plan le dit. Le cout croit ensuite lineairement avec le succes du
   * vendeur, et le premier a en souffrir est celui qui a le plus de donnees.
   */
  "index-tri-absent": {
    casser: "drop index public.orders_actives_recentes_idx;",
    reparer:
      "create index orders_actives_recentes_idx on public.orders " +
      "(shop_id, created_at desc, id desc) where archived_at is null;",
  },

  /** Le repli d accents desactive : « creme » cesse de trouver « Creme ». */
  "accents-non-replies": {
    casser: `create or replace function public.sans_accents(p_texte text)
      returns text language sql immutable strict parallel safe set search_path = ''
      as $$ select p_texte $$;`,
    reparerDepuisMigration: {
      fichier: "008_recherche_sans_accents.sql",
      depuis: "create function public.sans_accents",
      jusqua: "-- La fonction n'est PAS accordée",
    },
  },

  /** Une policy sur le compteur : il redevient atteignable hors de sa fonction. */
  "quota-policy": {
    casser:
      "create policy quota_falsification on public.rate_limit for select to authenticated using (true);",
    reparer: "drop policy if exists quota_falsification on public.rate_limit;",
  },

  /** `shops.slug` réouvert en écriture : un espace de noms unique offert au premier arrivé. */
  "slug-ouvert": {
    casser: "grant update (slug) on public.shops to authenticated;",
    reparer: "revoke update (slug) on public.shops from authenticated;",
  },

  /** La policy de mise à jour trop large : chacun modifie le profil de chacun. */
  "policy-maj-large": {
    casser:
      "drop policy if exists profiles_maj_de_soi on public.profiles;\n" +
      "create policy profiles_maj_de_soi on public.profiles for update to authenticated using (true) with check (true);",
    reparer: "drop policy if exists profiles_maj_de_soi on public.profiles;\n" + POLICY_MAJ_PROFILS,
  },

  /** Droit d'écriture direct accordé à anon : ce que Supabase fait par défaut. */
  "anon-lecture": {
    casser: "grant select on public.shops to anon;",
    reparer: "revoke select on public.shops from anon;",
  },

  /** Une fonction de public ouverte à tous. */
  "execute-ouvert": {
    casser: "grant execute on function public.toucher_updated_at() to anon, authenticated;",
    reparer: "revoke execute on function public.toucher_updated_at() from anon, authenticated;",
  },

  /**
   * La CONSULTATION du compteur rendue aveugle.
   *
   * Elle regarde une fenetre figee, donc toujours vide : le seuil des jetons
   * inconnus cesse de mordre et le balayage redevient gratuit. Aucune erreur,
   * aucun journal — le produit continue simplement de repondre a tout le monde.
   *
   * Cette cible a remplace une premiere version qui DOUBLAIT la fenetre. Elle
   * n etait detectee qu une minute sur deux, celles ou les deux fenetres
   * coincident : la falsification passait au vert sans rien prouver. La reponse
   * n a pas ete de borner le test mais de retirer la classe de defaut — les deux
   * fonctions partagent desormais une seule definition de fenetre (021).
   */
  "peek-aveugle": {
    casser: `create or replace function public.quota_depasse(
        p_cle text, p_plafond integer, p_fenetre_secondes integer
      ) returns boolean language plpgsql stable security definer set search_path = '' as $$
      declare v_compte integer;
      begin
        select r.compte into v_compte from public.rate_limit r
          where r.cle = p_cle and r.fenetre_debut = to_timestamp(0);
        return coalesce(v_compte, 0) >= p_plafond;
      end; $$;`,
    reparerDepuisMigration: {
      fichier: "021_fenetre_partagee.sql",
      depuis: "create or replace function public.quota_depasse",
    },
  },

  /**
   * LE CAS MOTIVANT du comptage des vues : l exclusion du vendeur, retiree.
   *
   * Le vendeur qui relit sa propre page verifie son travail, il ne consulte
   * pas. Sans l exclusion, chaque relecture gonfle une METRIQUE DE VERDICT — et
   * du cote rassurant, celui qu on ne remet jamais en question.
   */
  "vue-vendeur-compte": {
    casser: `create or replace function public.enregistrer_vue(
        p_jeton text, p_ip_hash text, p_ua_hash text, p_pays text, p_profil text
      ) returns boolean language plpgsql security definer set search_path = '' as $$
      declare v_order uuid; v_insere uuid;
      begin
        select o.id into v_order
        from public.orders o
        join public.shops s on s.id = o.shop_id
        join public.profiles p on p.id = s.owner_id
        where o.public_token = p_jeton and p.status = 'active';
        if v_order is null then return false; end if;
        insert into public.link_views (order_id, ip_hash, user_agent_hash, country)
        values (v_order, p_ip_hash, p_ua_hash, nullif(p_pays, ''))
        on conflict (order_id, ip_hash, user_agent_hash, viewed_on) do nothing
        returning id into v_insere;
        return v_insere is not null;
      end; $$;`,
    reparerDepuisMigration: {
      fichier: "020_vue_profil_omissible.sql",
      depuis: "create function public.enregistrer_vue",
      jusqua: "comment on function",
    },
  },

  /**
   * HORS du cas motivant : la contrainte d unicite qui PORTE la deduplication.
   *
   * « Une ligne = un visiteur, un JOUR » n est pas une regle ecrite dans du
   * code, c est une contrainte. Sans elle, la fonction continue de repondre, le
   * `on conflict` ne trouve simplement plus rien a resoudre, et chaque
   * rafraichissement devient une vue. Rien ne casse : le chiffre grossit.
   */
  "vue-sans-dedup": {
    // Les DEUX en un seul geste, et c est ce qui rend la falsification
    // interessante. Retirer la seule contrainte fait LEVER la fonction, parce
    // qu un `on conflict` sans index a resoudre est une erreur : le defaut
    // serait bruyant, donc facile. Retirer aussi le `on conflict` rend le
    // defaut SILENCIEUX — la fonction repond, rend `true` a chaque fois, et le
    // chiffre grossit sans que rien ne casse.
    casser:
      "alter table public.link_views drop constraint " +
      "link_views_order_id_ip_hash_user_agent_hash_viewed_on_key; " +
      `create or replace function public.enregistrer_vue(
        p_jeton text, p_ip_hash text, p_ua_hash text, p_pays text, p_profil text
      ) returns boolean language plpgsql security definer set search_path = '' as $$
      declare v_order uuid; v_proprietaire uuid; v_insere uuid;
      begin
        select o.id, p.id into v_order, v_proprietaire
        from public.orders o
        join public.shops s on s.id = o.shop_id
        join public.profiles p on p.id = s.owner_id
        where o.public_token = p_jeton and p.status = 'active';
        if v_order is null then return false; end if;
        if nullif(p_profil, '') is not null
           and nullif(p_profil, '')::uuid = v_proprietaire then return false; end if;
        insert into public.link_views (order_id, ip_hash, user_agent_hash, country)
        values (v_order, p_ip_hash, p_ua_hash, nullif(p_pays, ''))
        returning id into v_insere;
        return v_insere is not null;
      end; $$;`,
    reparerDepuisMigration: {
      // Les doublons crees pendant la falsification empechent de reposer la
      // contrainte : ils sont retires d abord. Ne garder que la premiere ligne
      // de chaque groupe restaure exactement ce que la contrainte aurait tenu.
      avant:
        "delete from public.link_views a using public.link_views b " +
        "where a.ctid > b.ctid and a.order_id = b.order_id and a.ip_hash = b.ip_hash " +
        "and a.user_agent_hash = b.user_agent_hash and a.viewed_on = b.viewed_on; " +
        "alter table public.link_views add constraint " +
        "link_views_order_id_ip_hash_user_agent_hash_viewed_on_key " +
        "unique (order_id, ip_hash, user_agent_hash, viewed_on);",
      fichier: "020_vue_profil_omissible.sql",
      depuis: "create function public.enregistrer_vue",
      jusqua: "comment on function",
    },
  },

  /**
   * LE CAS MOTIVANT du journal : un vendeur autorise a ecrire l arbitrage de
   * son client. Le defaut se presente comme une simplification — une porte au
   * lieu de deux — et l arbitrage QC est la seule ligne contestable du journal,
   * donc la seule qu un vendeur aurait interet a fabriquer.
   */
  "journal-vendeur-tout-puissant": {
    casser: `create or replace function public.journaliser_vendeur(
        p_order_id uuid, p_type text, p_payload jsonb default '{}'::jsonb
      ) returns uuid language plpgsql security definer set search_path = '' as $$
      declare v_shop uuid; v_id uuid;
      begin
        select public.mon_shop_id() into v_shop;
        if v_shop is null then
          raise exception 'Aucune boutique pour cet appelant.' using errcode = 'DL011';
        end if;
        perform 1 from public.orders o where o.id = p_order_id and o.shop_id = v_shop;
        if not found then
          raise exception 'Commande introuvable.' using errcode = 'DL012';
        end if;
        insert into public.order_events (order_id, type, actor, payload)
        values (p_order_id, p_type, 'vendeur', coalesce(p_payload, '{}'::jsonb))
        returning id into v_id;
        return v_id;
      end; $$;`,
    reparerDepuisMigration: {
      fichier: "026_journal_du_vendeur.sql",
      depuis: "create function public.journaliser_vendeur",
      jusqua: "comment on function",
    },
  },

  /**
   * HORS du cas motivant : le filtre de suspension retire du chemin d ECRITURE.
   *
   * La lecture s arrete, l ecriture continue. Tout dit que le compte est coupe —
   * ses pages ne repondent plus, l ecran d admin affiche « suspendu » — et ses
   * commandes restent arbitrables par quiconque detient un lien.
   */
  "qc-sans-suspension": {
    casser: `create or replace function public.arbitrer_qc(
        p_jeton text, p_decision text, p_commentaire text
      ) returns public.qc_status language plpgsql security definer set search_path = '' as $$
      declare v_order uuid; v_statut public.qc_status; v_commentaire text;
      begin
        if p_decision not in ('approuve', 'refuse') then
          raise exception 'decision inconnue' using errcode = '22023';
        end if;
        select o.id into v_order from public.orders o where o.public_token = p_jeton;
        if v_order is null then return null; end if;
        v_commentaire := left(coalesce(nullif(btrim(p_commentaire), ''), ''), 1000);
        v_statut := p_decision::public.qc_status;
        update public.orders set qc_status = v_statut where id = v_order;
        perform public.journaliser(v_order,
          case when v_statut = 'approuve' then 'qc_approuve' else 'qc_refuse' end,
          'client',
          case when v_commentaire = '' then '{}'::jsonb
               else jsonb_build_object('commentaire', v_commentaire) end);
        return v_statut;
      end; $$;`,
    reparerDepuisMigration: {
      fichier: "024_arbitrage_qc.sql",
      depuis: "create function public.arbitrer_qc",
      jusqua: "comment on function",
    },
  },

  /**
   * HORS du cas motivant : la revocation cesse d ecrire sa trace.
   *
   * Le principe V exige que l action explicite ecrive un evenement. Sans lui, la
   * rotation fonctionne parfaitement — le lien est bien coupe — et il ne reste
   * simplement aucune piece a produire sur la date a laquelle il l a ete.
   */
  "revocation-sans-trace": {
    casser: `create or replace function public.regenerer_jeton_public(p_order_id uuid)
      returns text language plpgsql security definer set search_path = '' as $$
      declare v_shop uuid; v_nouveau text;
      begin
        select public.mon_shop_id() into v_shop;
        if v_shop is null then
          raise exception 'Aucune boutique pour cet appelant.' using errcode = 'DL011';
        end if;
        perform 1 from public.orders o where o.id = p_order_id and o.shop_id = v_shop;
        if not found then
          raise exception 'Commande introuvable.' using errcode = 'DL012';
        end if;
        perform set_config('droplink.rotation_jeton', 'oui', true);
        update public.orders
          set public_token = public.generer_jeton_public(),
              unsubscribe_token = public.generer_jeton_public()
          where id = p_order_id returning public_token into v_nouveau;
        perform set_config('droplink.rotation_jeton', '', true);
        return v_nouveau;
      end; $$;`,
    reparerDepuisMigration: {
      fichier: "025_revocation_journalisee.sql",
      depuis: "create or replace function public.regenerer_jeton_public",
    },
  },

  /**
   * Le vocabulaire du journal, desaccorde entre la base et le code.
   *
   * Un type retire de la contrainte fait ECHOUER l ecriture — et la transaction
   * etant partagee, annule la mutation entiere. Le defaut ne se manifeste donc
   * pas sur le journal mais sur la sauvegarde du vendeur, plusieurs ecrans plus
   * loin que sa cause.
   */
  "journal-vocabulaire-desaccorde": {
    casser:
      "alter table public.order_events drop constraint order_events_type_connu; " +
      "alter table public.order_events add constraint order_events_type_connu " +
      "check (type in ('commande_creee', 'commande_modifiee', 'commande_archivee', " +
      "'commande_dupliquee', 'media_ajoute', 'media_supprime', 'lien_revoque', " +
      "'qc_approuve', 'qc_refuse'));",
    reparer:
      "alter table public.order_events drop constraint order_events_type_connu; " +
      "alter table public.order_events add constraint order_events_type_connu " +
      "check (type in ('commande_creee', 'commande_modifiee', 'commande_archivee', " +
      "'commande_dupliquee', 'media_ajoute', 'media_supprime', 'medias_reordonnes', " +
      "'lien_revoque', 'qc_approuve', 'qc_refuse'));",
  },


  /**
   * Le compteur denormalise, DECROCHE de sa source.
   *
   * Le declencheur retire, `link_views` continue de se remplir normalement et le
   * compteur reste fige. Rien ne casse : le tableau de bord annonce simplement
   * « jamais ouvert » a des commandes que le client a vues, et le vendeur relance
   * quelqu un qui a deja regarde ses photos.
   *
   * Une seconde source de verite ne se contente pas d exister : elle doit dire la
   * meme chose que la premiere.
   */
  "compteur-vues-decroche": {
    casser: "drop trigger link_views_compter on public.link_views;",
    reparer:
      "create trigger link_views_compter after insert on public.link_views " +
      "for each row execute function public.compter_vue();",
  },


  /**
   * Le lot rendu PARTIEL : l ecriture directe, sans comparer ce qu on a modifie
   * a ce qu on a demande.
   *
   * C est exactement la version « evidente » de la fonction, et elle est fausse.
   * Sous RLS l `update` ne touche que les commandes de l appelant — ce qui est
   * correct — et ignore les autres SANS RIEN DIRE. L ecran affiche « lot
   * archive » pour une selection dont une partie n a pas bouge. Rien ne casse,
   * rien n est journalise, et le vendeur le decouvre des semaines plus tard sur
   * la commande qu il croyait rangee.
   */
  "lot-partiel-silencieux": {
    casser: `create or replace function public.archiver_lot(p_ids uuid[], p_archiver boolean)
      returns integer language plpgsql set search_path = '' as $$
      declare v_modifiees integer;
      begin
        if coalesce(array_length(p_ids, 1), 0) = 0 then return 0; end if;
        update public.orders
           set archived_at = case when p_archiver then now() else null end
         where id = any(p_ids);
        get diagnostics v_modifiees = row_count;
        return v_modifiees;
      end; $$;`,
    reparerDepuisMigration: {
      fichier: "028_archivage_par_lot.sql",
      depuis: "create function public.archiver_lot",
      jusqua: "comment on function",
    },
  },


  /**
   * HORS du cas motivant : le lot passe en `SECURITY DEFINER`.
   *
   * C est la modification qu on fait « pour que ca marche » quand un appel
   * echoue, et elle retire la SEULE chose qui protegeait la fonction. Le corps
   * ne contient aucun controle de propriete — il n en avait pas besoin tant que
   * la RLS de l appelant s appliquait. Un vendeur peut alors archiver le lot de
   * n importe qui, et le compte des lignes modifiees continue de correspondre :
   * la fonction ne leve rien, elle obeit.
   */
  "lot-definer": {
    casser: `create or replace function public.archiver_lot(p_ids uuid[], p_archiver boolean)
      returns integer language plpgsql security definer set search_path = '' as $$
      declare v_demandes integer; v_modifiees integer;
      begin
        v_demandes := coalesce(array_length(p_ids, 1), 0);
        if v_demandes = 0 then return 0; end if;
        if v_demandes > 200 then
          raise exception 'lot trop grand' using errcode = 'DL020';
        end if;
        update public.orders
           set archived_at = case when p_archiver then now() else null end
         where id = any(p_ids);
        get diagnostics v_modifiees = row_count;
        if v_modifiees <> v_demandes then
          raise exception 'lot refuse' using errcode = 'DL021';
        end if;
        return v_modifiees;
      end; $$;`,
    reparerDepuisMigration: {
      fichier: "028_archivage_par_lot.sql",
      depuis: "create function public.archiver_lot",
      jusqua: "comment on function",
    },
  },


  /**
   * L index PARTIEL du tri « jamais ouvert », retire.
   *
   * Le defaut le plus tranquille de tous : la requete reste rapide a la
   * volumetrie de test, et ne s effondre qu en production. C est pour cela que
   * la mesure porte sur les LIGNES LUES et pas seulement sur le chronometre — un
   * chronometre certifie une performance qui n existe qu au volume ou on l a
   * mesuree.
   */
  "index-jamais-ouvert-absent": {
    casser: "drop index public.orders_jamais_ouvert_idx;",
    reparer:
      "create index orders_jamais_ouvert_idx on public.orders " +
      "(shop_id, created_at desc, id desc) where views_count = 0 and archived_at is null;",
  },


  /**
   * LE CAS MOTIVANT DU SUIVI : le statut peut reculer.
   *
   * `greatest()` retire, la fonction ecrit ce que le fournisseur vient de dire.
   * Rien ne casse, rien n est journalise — et un client qui a lu « en transit »
   * lit « en preparation » le lendemain, donc conclut que son colis s est perdu.
   */
  "statut-colis-recule": {
    casser: `create or replace function public.appliquer_etat_colis(
        p_numero text, p_etape public.parcel_status, p_statut_brut text,
        p_transporteur text, p_points jsonb, p_estimation_du text,
        p_estimation_au text, p_brut jsonb
      ) returns integer language plpgsql security definer set search_path = '' as $$
      declare v_colis record; v_touches integer := 0; v_dernier timestamptz; v_premier timestamptz;
      begin
        for v_colis in
          select id from public.tracked_parcels where tracking_number = p_numero
        loop
          insert into public.parcel_checkpoints (parcel_id, occurred_at, location, description, stage)
          select v_colis.id, (p->>'instant')::timestamptz, nullif(p->>'lieu', ''),
                 p->>'description', nullif(p->>'etape', '')
          from jsonb_array_elements(coalesce(p_points, '[]'::jsonb)) as p
          where p->>'instant' is not null and nullif(p->>'description', '') is not null
          on conflict (parcel_id, occurred_at, description) do nothing;

          select min(occurred_at), max(occurred_at) into v_premier, v_dernier
            from public.parcel_checkpoints where parcel_id = v_colis.id;

          update public.tracked_parcels
             set normalized_status = p_etape,
                 first_movement_at = coalesce(v_premier, first_movement_at),
                 last_movement_at = coalesce(v_dernier, last_movement_at),
                 query_count = query_count + 1, empty_count = 0
           where id = v_colis.id;

          insert into public.tracking_snapshots (parcel_id, raw_payload, normalized_status)
          values (v_colis.id, coalesce(p_brut, '{}'::jsonb), p_etape);
          v_touches := v_touches + 1;
        end loop;
        return v_touches;
      end; $$;`,
    reparerDepuisMigration: {
      fichier: "031_etat_colis_arguments_omissibles.sql",
      depuis: "create function public.appliquer_etat_colis",
      jusqua: "comment on function",
    },
  },

  /**
   * HORS du cas motivant : la deduplication des points de passage, retiree.
   *
   * Le fournisseur renvoie l historique COMPLET a chaque interrogation. Sans la
   * contrainte, chaque notification duplique tout ce qui precede — et la page du
   * client se remplit du meme scan repete quinze fois, sans qu aucune erreur ne
   * soit levee.
   */
  "points-sans-dedup": {
    casser:
      "alter table public.parcel_checkpoints drop constraint " +
      "parcel_checkpoints_parcel_id_occurred_at_description_key;",
    reparer:
      "delete from public.parcel_checkpoints a using public.parcel_checkpoints b " +
      "where a.ctid > b.ctid and a.parcel_id = b.parcel_id " +
      "and a.occurred_at = b.occurred_at and a.description = b.description; " +
      "alter table public.parcel_checkpoints add constraint " +
      "parcel_checkpoints_parcel_id_occurred_at_description_key " +
      "unique (parcel_id, occurred_at, description);",
  },


  /**
   * LE CAS MOTIVANT DE L ATTACHE : `cree` toujours vrai.
   *
   * Le defaut le plus cher du produit, et le plus silencieux : tout continue de
   * fonctionner, les colis sont suivis, les clients voient leur statut. Seule la
   * facture du fournisseur grossit — une prise en charge payee a chaque
   * sauvegarde automatique de l editeur, soit toutes les 800 ms de frappe.
   */
  "attache-paie-toujours": {
    casser: `create or replace function public.attacher_colis(
        p_order_id uuid, p_numero text, p_transporteur text
      ) returns table (parcel_id uuid, cree boolean)
      language plpgsql security definer set search_path = '' as $$
      declare v_shop uuid; v_numero text := btrim(coalesce(p_numero, ''));
              v_transporteur integer := nullif(btrim(coalesce(p_transporteur, '')), '')::integer;
              v_parcel uuid;
      begin
        select public.mon_shop_id() into v_shop;
        if v_shop is null then
          raise exception 'Aucune boutique pour cet appelant.' using errcode = 'DL011';
        end if;
        perform 1 from public.orders o where o.id = p_order_id and o.shop_id = v_shop;
        if not found then
          raise exception 'Commande introuvable.' using errcode = 'DL012';
        end if;
        delete from public.order_parcels op using public.tracked_parcels tp
         where op.order_id = p_order_id and op.parcel_id = tp.id
           and (v_numero = '' or tp.tracking_number <> v_numero);
        if v_numero = '' then
          return query select null::uuid, false;
          return;
        end if;
        insert into public.tracked_parcels as tp (shop_id, tracking_number, carrier_code)
        values (v_shop, v_numero, v_transporteur)
        on conflict (shop_id, tracking_number)
          do update set carrier_code = coalesce(excluded.carrier_code, tp.carrier_code)
        returning tp.id into v_parcel;
        insert into public.order_parcels (order_id, parcel_id)
        values (p_order_id, v_parcel) on conflict do nothing;
        return query select v_parcel, true;
      end; $$;`,
    reparerDepuisMigration: {
      fichier: "032_attacher_colis.sql",
      depuis: "create function public.attacher_colis",
      jusqua: "comment on function",
    },
  },

  /**
   * HORS du cas motivant : l ancien lien n est plus detache.
   *
   * Corriger une faute de frappe laisse la commande liee aux DEUX numeros. La
   * page publique affiche alors le suivi d un colis qui n est plus le sien —
   * donc, pour le client, la position d un envoi qui ne lui est pas destine.
   */
  "attache-sans-detacher": {
    casser: `create or replace function public.attacher_colis(
        p_order_id uuid, p_numero text, p_transporteur text
      ) returns table (parcel_id uuid, cree boolean)
      language plpgsql security definer set search_path = '' as $$
      declare v_shop uuid; v_numero text := btrim(coalesce(p_numero, ''));
              v_transporteur integer := nullif(btrim(coalesce(p_transporteur, '')), '')::integer;
              v_parcel uuid; v_cree boolean := false;
      begin
        select public.mon_shop_id() into v_shop;
        if v_shop is null then
          raise exception 'Aucune boutique pour cet appelant.' using errcode = 'DL011';
        end if;
        perform 1 from public.orders o where o.id = p_order_id and o.shop_id = v_shop;
        if not found then
          raise exception 'Commande introuvable.' using errcode = 'DL012';
        end if;
        if v_numero = '' then
          return query select null::uuid, false;
          return;
        end if;
        insert into public.tracked_parcels as tp (shop_id, tracking_number, carrier_code)
        values (v_shop, v_numero, v_transporteur)
        on conflict (shop_id, tracking_number)
          do update set carrier_code = coalesce(excluded.carrier_code, tp.carrier_code)
        returning tp.id, (tp.xmax = 0) into v_parcel, v_cree;
        insert into public.order_parcels (order_id, parcel_id)
        values (p_order_id, v_parcel) on conflict do nothing;
        return query select v_parcel, v_cree;
      end; $$;`,
    reparerDepuisMigration: {
      fichier: "032_attacher_colis.sql",
      depuis: "create function public.attacher_colis",
      jusqua: "comment on function",
    },
  },


  /**
   * Le suivi public rendu SANS le filtre de suspension.
   *
   * La page ne repond plus, les medias non plus, l ecran d admin affiche
   * « suspendu » — et le suivi continue de dire ou est le colis a qui detient le
   * lien qu on a precisement voulu couper. C est la troisieme surface : celle
   * qu on oublie parce que les deux premieres ont ete traitees.
   */
  /**
   * LE FILIGRANE S ALLUME SANS RIEN A ECRIRE.
   *
   * `watermark_enabled` seul, sans la condition sur le nom. Le vendeur voit son
   * reglage actif, la base le confirme — et ses clients recoivent des photos
   * portant une bande noire VIDE. Le defaut ne casse rien, ne leve rien, et ne
   * se voit que sur la page de quelqu un d autre.
   */
  "filigrane-sans-nom": {
    casser: `drop function if exists public.lire_commande_publique(text);
      create function public.lire_commande_publique(p_jeton text)
      returns table (jeton text, client text, reference text, statut public.order_status,
                     statut_qc public.qc_status, numero_suivi text, transporteur text,
                     couverture uuid, creee_le timestamptz, modifiee_le timestamptz,
                     boutique_nom text, boutique_logo text, boutique_couleur text,
                     boutique_langue text, boutique_filigrane boolean)
      language sql stable security definer set search_path = '' as $$
      select o.public_token, o.customer_label, o.product_ref, o.status, o.qc_status,
             o.tracking_number, o.carrier_code, o.cover_media_id, o.created_at,
             o.updated_at, s.name, s.logo_url, s.accent_color, s.default_language, s.watermark_enabled
      from public.orders o
      join public.shops s on s.id = o.shop_id
      join public.profiles p on p.id = s.owner_id
      where o.public_token = p_jeton and p.status = 'active'
      $$;
      revoke all on function public.lire_commande_publique(text) from public;
      grant execute on function public.lire_commande_publique(text) to anon;`,
    reparerDepuisMigration: {
      fichier: "035_filigrane_public.sql",
      depuis: "drop function if exists public.lire_commande_publique",
      jusqua: "comment on function",
    },
  },

  /**
   * LA LANGUE PUBLIQUE EST FIGEE EN FRANCAIS.
   *
   * Hors du cas motivant : ce n est pas le filigrane, c est la colonne voisine.
   * C etait l etat REEL du produit avant le lot 8 — la colonne existait, la page
   * la lisait, et personne ne l ecrivait jamais. Un vendeur qui a tout choisi en
   * anglais livre des pages en francais. Rien cote vendeur ne le montre : le
   * defaut ne se voit que chez son client, et seulement si celui-ci le dit.
   */
  "langue-publique-figee": {
    casser: `drop function if exists public.lire_commande_publique(text);
      create function public.lire_commande_publique(p_jeton text)
      returns table (jeton text, client text, reference text, statut public.order_status,
                     statut_qc public.qc_status, numero_suivi text, transporteur text,
                     couverture uuid, creee_le timestamptz, modifiee_le timestamptz,
                     boutique_nom text, boutique_logo text, boutique_couleur text,
                     boutique_langue text, boutique_filigrane boolean)
      language sql stable security definer set search_path = '' as $$
      select o.public_token, o.customer_label, o.product_ref, o.status, o.qc_status,
             o.tracking_number, o.carrier_code, o.cover_media_id, o.created_at,
             o.updated_at, s.name, s.logo_url, s.accent_color, 'fr'::text, (s.watermark_enabled and s.name is not null and btrim(s.name) <> '')
      from public.orders o
      join public.shops s on s.id = o.shop_id
      join public.profiles p on p.id = s.owner_id
      where o.public_token = p_jeton and p.status = 'active'
      $$;
      revoke all on function public.lire_commande_publique(text) from public;
      grant execute on function public.lire_commande_publique(text) to anon;`,
    reparerDepuisMigration: {
      fichier: "035_filigrane_public.sql",
      depuis: "drop function if exists public.lire_commande_publique",
      jusqua: "comment on function",
    },
  },

  /**
   * LES COMPTEURS D ENVOIS COMPTENT LA BASE ENTIERE.
   *
   * `security definer` au lieu de `security invoker` : la fonction s execute
   * alors avec les droits de son PROPRIETAIRE, donc hors de la RLS de
   * l appelant. Le changement d un seul mot, celui qu on ecrit par habitude
   * parce que la plupart des fonctions du produit en ont besoin.
   *
   * Le defaut ne leve rien et n affiche aucune erreur : le vendeur voit
   * simplement des chiffres trop grands, et il n a aucun moyen de savoir qu ils
   * comptent les colis de quelqu un d autre.
   */
  /**
   * LE TRI PAR DEFAUT DE L ECRAN DES ENVOIS N A PLUS SON INDEX.
   *
   * Hors du cas motivant : ce n est pas l isolation, c est le COUT. Un tri par
   * defaut sans index lit toutes les lignes pour en rendre cinquante, et ca
   * reste parfaitement invisible tant qu un compte de test en porte trente.
   * Seul le nombre de LIGNES LUES le montre — le chronometre, lui, reste
   * rassurant jusqu a ce que la table ait dix fois cette taille.
   */
  "index-immobilite-absent": {
    casser: "drop index public.tracked_parcels_immobilite_idx;",
    reparer:
      "create index tracked_parcels_immobilite_idx on public.tracked_parcels " +
      "(shop_id, immobile_depuis asc, id asc);",
  },

  /**
   * LES ANALYSES COMPTENT LES COMMANDES DE TOUT LE MONDE.
   *
   * `security definer` au lieu de `security invoker` : un seul mot, celui qu on
   * ecrit par habitude parce que la plupart des fonctions du produit en ont
   * besoin. Le vendeur voit alors des chiffres trop grands — et parfaitement
   * credibles. Une metrique legerement faussee est pire qu une metrique cassee.
   */
  "analyses-hors-rls": {
    casser: `create or replace function public.analyser_activite(p_depuis timestamptz)
      returns table (commandes_creees bigint, commandes_ouvertes bigint, vues_totales bigint,
                     qc_approuve bigint, qc_refuse bigint, qc_en_attente bigint,
                     avec_suivi bigint, archivees bigint)
      language sql stable security definer set search_path = '' as $$
        select count(*),
               count(*) filter (where o.views_count > 0),
               coalesce(sum(o.views_count), 0),
               count(*) filter (where o.qc_status = 'approuve'),
               count(*) filter (where o.qc_status = 'refuse'),
               count(*) filter (where o.qc_status = 'en_attente'),
               count(*) filter (where o.tracking_number is not null and o.tracking_number <> ''),
               count(*) filter (where o.archived_at is not null)
        from public.orders o
        where o.created_at >= p_depuis
      $$;`,
    reparerDepuisMigration: {
      fichier: "037_analyses_activite.sql",
      depuis: "create function public.analyser_activite",
      jusqua: "comment on function",
    },
  },

  /**
   * LA BORNE DE PERIODE EST IGNOREE.
   *
   * Hors du cas motivant : ce n est pas l isolation, c est la JUSTESSE. Le
   * `where` disparait, et « 7 jours » affiche le total de toute l histoire du
   * compte. Rien ne leve, rien n est journalise, et le chiffre reste plausible :
   * le vendeur conclut simplement qu il travaille beaucoup plus qu il ne croit.
   * C est exactement la forme de defaut qu on ne remet jamais en question,
   * puisqu elle va dans le sens rassurant.
   */
  "analyses-periode-ignoree": {
    casser: `create or replace function public.analyser_activite(p_depuis timestamptz)
      returns table (commandes_creees bigint, commandes_ouvertes bigint, vues_totales bigint,
                     qc_approuve bigint, qc_refuse bigint, qc_en_attente bigint,
                     avec_suivi bigint, archivees bigint)
      language sql stable security invoker set search_path = '' as $$
        select count(*),
               count(*) filter (where o.views_count > 0),
               coalesce(sum(o.views_count), 0),
               count(*) filter (where o.qc_status = 'approuve'),
               count(*) filter (where o.qc_status = 'refuse'),
               count(*) filter (where o.qc_status = 'en_attente'),
               count(*) filter (where o.tracking_number is not null and o.tracking_number <> ''),
               count(*) filter (where o.archived_at is not null)
        from public.orders o
        
      $$;`,
    reparerDepuisMigration: {
      fichier: "037_analyses_activite.sql",
      depuis: "create function public.analyser_activite",
      jusqua: "comment on function",
    },
  },

  /**
   * UN ADMINISTRATEUR SUSPENDU RESTE ADMINISTRATEUR.
   *
   * `and p.status = 'active'` retire de `est_admin()`. Suspendre un compte lui
   * retire alors l acces vendeur tout en lui laissant l acces a TOUTES les
   * donnees de tous les autres — l inverse exact de l intention. Rien ne leve,
   * l ecran de suspension affiche bien « suspendu », et la personne continue de
   * lire les comptes des autres.
   */
  "admin-suspendu-reste-admin": {
    casser: `create or replace function public.est_admin()
      returns boolean language sql stable security definer set search_path = '' as $$
        select exists (
          select 1 from public.profiles p
          where p.user_id = (select auth.uid()) and p.role = 'admin'
        )
      $$;`,
    reparerDepuisMigration: {
      fichier: "038_socle_admin.sql",
      depuis: "create function public.est_admin",
      jusqua: "comment on function public.est_admin",
    },
  },

  /**
   * LA LECTURE ADMIN NE LAISSE PLUS DE TRACE.
   *
   * Le `perform journaliser_admin` retire de la liste des comptes. L ecran
   * FONCTIONNE, rend les memes donnees, et n ecrit rien. C est le mode de
   * defaillance le plus silencieux de cette surface : il n y a aucune erreur a
   * chercher, seulement une absence — et une absence ne se remarque que le jour
   * ou l on va chercher une trace qui n existe pas.
   */
  "audit-sans-trace": {
    casser: `create or replace function public.lister_comptes_admin(
        p_recherche text, p_curseur_date text, p_curseur_id text, p_limite int, p_ip_hash text)
      returns table (id uuid, email text, account_type public.account_type,
                     role public.user_role, status public.account_status,
                     created_at timestamptz, boutique_nom text, commandes bigint)
      language plpgsql volatile security definer set search_path = '' as $$
      declare
        v_limite int := least(greatest(coalesce(p_limite, 50), 1), 100);
        v_recherche text := nullif(btrim(coalesce(p_recherche, '')), '');
        v_date timestamptz := nullif(btrim(coalesce(p_curseur_date, '')), '')::timestamptz;
        v_id uuid := nullif(btrim(coalesce(p_curseur_id, '')), '')::uuid;
      begin
        if not public.est_admin() then
          raise exception 'introuvable' using errcode = 'DL031';
        end if;
        return query
        select p.id, p.email, p.account_type, p.role, p.status, p.created_at, s.name,
               (select count(*) from public.orders o where o.shop_id = s.id)
        from public.profiles p
        left join public.shops s on s.owner_id = p.id
        where (v_recherche is null or p.email ilike '%' || v_recherche || '%')
          and (v_date is null or (p.created_at, p.id) < (v_date, v_id))
        order by p.created_at desc, p.id desc
        limit v_limite;
      end;
      $$;`,
    reparerDepuisMigration: {
      fichier: "041_volatilite_des_lectures_auditees.sql",
      depuis: "create or replace function public.lister_comptes_admin",
      jusqua: "create or replace function public.lire_compte_admin",
    },
  },

  /**
   * LE JOURNAL D AUDIT REDEVIENT MODIFIABLE.
   *
   * Hors du cas motivant : ce n est ni l isolation ni la trace, c est
   * l IMMUABILITE. Le declencheur retire, une entrée peut etre reecrite ou
   * effacee apres coup — et un journal modifiable n est pas un journal, c est
   * une note dont la valeur en cas de litige est nulle. Le retrait des droits ne
   * suffit pas a le proteger : les fonctions `security definer` s executent avec
   * les droits du proprietaire de la table, donc AVEC celui de modifier.
   */
  "journal-modifiable": {
    casser: "drop trigger if exists admin_audit_log_append_only on public.admin_audit_log;",
    reparer:
      "create trigger admin_audit_log_append_only before update or delete " +
      "on public.admin_audit_log for each row execute function public.refuser_modification_audit();",
  },

  /**
   * LA SUSPENSION NE COUPE PLUS RIEN.
   *
   * Le filtre `p.status = 'active'` retire de la lecture publique. Le statut est
   * ecrit, l audit consigne, l ecran d administration affiche « suspendu » — et
   * la page publique continue d etre servie. TOUT dit que le compte est coupe.
   * Il ne l est pas. C est le mode de defaillance le plus grave du produit,
   * parce que c est celui qui nous expose directement.
   */
  "suspension-ne-coupe-pas": {
    casser: `drop function if exists public.lire_commande_publique(text);
      create function public.lire_commande_publique(p_jeton text)
      returns table (jeton text, client text, reference text, statut public.order_status,
                     statut_qc public.qc_status, numero_suivi text, transporteur text,
                     couverture uuid, creee_le timestamptz, modifiee_le timestamptz,
                     boutique_nom text, boutique_logo text, boutique_couleur text,
                     boutique_langue text, boutique_filigrane boolean)
      language sql stable security definer set search_path = '' as $$
        select o.public_token, o.customer_label, o.product_ref, o.status, o.qc_status,
               o.tracking_number, o.carrier_code, o.cover_media_id, o.created_at,
               o.updated_at, s.name, s.logo_url, s.accent_color, s.default_language,
               (s.watermark_enabled and s.name is not null and btrim(s.name) <> '')
        from public.orders o
        join public.shops s on s.id = o.shop_id
        join public.profiles p on p.id = s.owner_id
        where o.public_token = p_jeton
      $$;
      revoke all on function public.lire_commande_publique(text) from public;
      grant execute on function public.lire_commande_publique(text) to anon;`,
    reparerDepuisMigration: {
      fichier: "035_filigrane_public.sql",
      depuis: "drop function if exists public.lire_commande_publique",
      jusqua: "comment on function",
    },
  },

  /**
   * LA SUSPENSION SE FAIT SANS MOTIF.
   *
   * Hors du cas motivant : ce n est ni la coupure ni l isolation, c est la
   * JUSTIFICATION. Le refus du motif vide retire, une suspension peut etre
   * prononcee sans qu on sache pourquoi — et six mois plus tard, quand celui qui
   * l a prise ne s en souvient plus, il ne reste rien a produire. La coupure
   * fonctionnerait parfaitement ; c est notre capacite a l expliquer qui
   * disparait.
   */
  "suspension-sans-motif": {
    casser: `create or replace function public.suspendre_compte(
        p_profil uuid, p_motif text, p_ip_hash text)
      returns boolean language plpgsql volatile security definer set search_path = '' as $$
      declare
        v_admin_id uuid;
        v_cible_role public.user_role;
      begin
        select p.id into v_admin_id from public.profiles p
        where p.user_id = (select auth.uid()) and p.role = 'admin' and p.status = 'active';
        if v_admin_id is null then
          raise exception 'introuvable' using errcode = 'DL031';
        end if;
        if p_profil = v_admin_id then
          raise exception 'auto-suspension refusee' using errcode = 'DL033';
        end if;
        select p.role into v_cible_role from public.profiles p where p.id = p_profil;
        if v_cible_role is null then
          raise exception 'introuvable' using errcode = 'DL031';
        end if;
        if v_cible_role = 'admin' then
          raise exception 'suspension d''un administrateur refusee' using errcode = 'DL034';
        end if;
        perform public.journaliser_admin(
          'compte.suspension', 'profiles', p_profil::text, p_profil, p_ip_hash,
          jsonb_build_object('motif', p_motif));
        update public.profiles set status = 'suspended' where id = p_profil;
        return true;
      end;
      $$;`,
    reparerDepuisMigration: {
      fichier: "043_suspension_de_compte.sql",
      depuis: "create function public.suspendre_compte",
      jusqua: "comment on function public.suspendre_compte",
    },
  },

  /**
   * « JAMAIS DEPLOYE » DEVIENT UNE ALERTE.
   *
   * La condition sur `beat_at` retiree : toute ligne de battement alerte, et
   * surtout l absence de ligne serait traitee comme un retard des qu on
   * ajouterait la ligne correspondante. Une tache posee ce matin se signale
   * alors comme en panne, on cherche un defaut dans un mecanisme qui n a
   * simplement pas encore tourne — et l on apprend a ignorer cette alerte-la,
   * donc a rater la vraie.
   */
  "veilleur-alerte-a-tort": {
    casser: `create or replace function public.alertes_admin(p_seuil_colis int, p_retard_minutes int)
      returns table (genre text, gravite text, sujet text, valeur bigint, seuil bigint)
      language plpgsql stable security definer set search_path = '' as $$
      begin
        if not public.est_admin() then
          raise exception 'introuvable' using errcode = 'DL031';
        end if;
        return query
        select 'colis_au_dessus_du_seuil'::text, 'attention'::text, p.email,
               u.parcels_registered::bigint, p_seuil_colis::bigint
        from public.usage_counters u
        join public.profiles p on p.id = u.profile_id
        where u.period_month = date_trunc('month', now())::date
          and u.parcels_registered > p_seuil_colis
        union all
        select 'veilleur_en_retard'::text, 'critique'::text, h.source,
               extract(epoch from (now() - h.beat_at))::bigint / 60,
               p_retard_minutes::bigint
        from public.scheduler_heartbeat h;
      end;
      $$;`,
    reparerDepuisMigration: {
      fichier: "047_panneau_sur_compteurs.sql",
      depuis: "create or replace function public.alertes_admin",
      jusqua: "create or replace function public.compteurs_admin",
    },
  },

  /**
   * LE COMPTEUR D USAGE CESSE DE COMPTER.
   *
   * Hors du cas motivant : ce n est ni l alerte ni l isolation, c est la
   * FACTURATION. Le declencheur retire, le compteur reste a sa valeur du moment
   * et le panneau affiche un mois plus calme qu il ne l est. Rien ne leve, aucun
   * ecran ne casse — le chiffre est simplement FAUX, et il l est du cote
   * rassurant. C est le seul compteur du produit qui corresponde a une facture :
   * on ne s en apercevrait qu en la recevant.
   */
  "compteur-usage-decroche": {
    casser:
      "drop trigger if exists tracked_parcels_compter_prise_en_charge on public.tracked_parcels;",
    reparer:
      "create trigger tracked_parcels_compter_prise_en_charge " +
      "after insert or update of registered_at on public.tracked_parcels " +
      "for each row execute function public.compter_prise_en_charge();",
  },

  "compteurs-hors-rls": {
    casser: `create or replace function public.compter_envois(p_silence_jours int)
      returns table (total bigint, preparation bigint, expedie bigint, en_transit bigint,
                     livre bigint, silencieux bigint, abandonnes bigint)
      language sql stable security definer set search_path = '' as $$
        select count(*),
               count(*) filter (where tp.normalized_status = 'preparation'),
               count(*) filter (where tp.normalized_status = 'expedie'),
               count(*) filter (where tp.normalized_status = 'en_transit'),
               count(*) filter (where tp.normalized_status = 'livre'),
               count(*) filter (
                 where tp.normalized_status <> 'livre'
                   and tp.abandoned_at is null
                   and tp.immobile_depuis < now() - make_interval(days => p_silence_jours)
               ),
               count(*) filter (where tp.abandoned_at is not null)
        from public.tracked_parcels tp
      $$;`,
    reparerDepuisMigration: {
      fichier: "036_envois_immobilite.sql",
      depuis: "create function public.compter_envois",
      jusqua: "comment on function",
    },
  },

  "suivi-public-sans-suspension": {
    casser: `create or replace function public.lire_suivi_public(p_jeton text)
      returns table (etape public.parcel_status, numero text,
                     premier_mouvement timestamptz, dernier_mouvement timestamptz,
                     estimation_du timestamptz, estimation_au timestamptz,
                     abandonne boolean)
      language sql stable security definer set search_path = '' as $$
        select tp.normalized_status, tp.tracking_number, tp.first_movement_at,
               tp.last_movement_at, tp.estimated_from, tp.estimated_to,
               tp.abandoned_at is not null
        from public.orders o
        join public.order_parcels op on op.order_id = o.id
        join public.tracked_parcels tp on tp.id = op.parcel_id
        where o.public_token = p_jeton
        limit 1
      $$;`,
    reparerDepuisMigration: {
      fichier: "034_suivi_public.sql",
      depuis: "create function public.lire_suivi_public",
      jusqua: "comment on function",
    },
  },

  /**
   * Les chiffres de COUT rendus a la page publique.
   *
   * Ils vivent dans la MEME ligne que ce qu on rend legitimement : il suffit de
   * les ajouter a la liste des colonnes. Rien ne casse, la page s affiche — et
   * le client d un vendeur apprend combien nous avons paye pour son colis.
   */
  "suivi-public-fuite-couts": {
    casser: `create or replace function public.lire_suivi_public(p_jeton text)
      returns table (etape public.parcel_status, numero text,
                     premier_mouvement timestamptz, dernier_mouvement timestamptz,
                     estimation_du timestamptz, estimation_au timestamptz,
                     abandonne boolean)
      language sql stable security definer set search_path = '' as $$
        select tp.normalized_status,
               tp.tracking_number || ' (' || tp.query_count || '/' || tp.empty_count || ')',
               tp.first_movement_at, tp.last_movement_at, tp.estimated_from,
               tp.estimated_to, tp.abandoned_at is not null
        from public.orders o
        join public.shops s on s.id = o.shop_id
        join public.profiles pr on pr.id = s.owner_id
        join public.order_parcels op on op.order_id = o.id
        join public.tracked_parcels tp on tp.id = op.parcel_id
        where o.public_token = p_jeton and pr.status = 'active'
        limit 1
      $$;`,
    reparerDepuisMigration: {
      fichier: "034_suivi_public.sql",
      depuis: "create function public.lire_suivi_public",
      jusqua: "comment on function",
    },
  },

  /**
   * HORS du cas motivant : la lecture des paramètres qui REND UN ENSEMBLE VIDE
   * au lieu de refuser.
   *
   * Rien n'échoue, rien ne journalise, et l'appelant sans droits reçoit
   * exactement ce que reçoit un administrateur d'une installation neuve — car
   * « aucun paramètre écrit » est l'état NORMAL du produit. Le refus devient
   * indiscernable du cas nominal : c'est un ensemble vide qui passe tout.
   */
  "parametres-lecture-vide": {
    casser: `create or replace function public.lister_parametres()
      returns table (cle text, valeur jsonb, modifie_le timestamptz, modifie_par text)
      language plpgsql stable security definer set search_path = '' as $$
      begin
        if not public.est_admin() then
          return;
        end if;
        return query
        select s.key, s.value, s.updated_at, p.email
        from public.system_settings s
        left join public.profiles p on p.id = s.updated_by
        order by s.key;
      end;
      $$;`,
    reparerDepuisMigration: {
      fichier: "048_lister_parametres.sql",
      depuis: "create function public.lister_parametres",
      jusqua: "comment on function",
    },
  },

  /**
   * HORS du cas motivant, et d'une autre nature : les TROIS ÉTATS RAMENÉS À DEUX.
   *
   * Aucune protection n'est retirée, aucune valeur ne change, et l'écran affiche
   * les mêmes chiffres. Ce qui disparaît est un ÉTAT : la fonction rend une
   * ligne pour chaque clé de l'inventaire, écrite ou non. « Personne n'a jamais
   * décidé ce seuil » devient « quelqu'un l'a décidé à cette valeur » — le même
   * chiffre, deux situations opposées, et plus rien pour les distinguer.
   *
   * C'est le mode de défaillance le plus discret de cet écran : rien n'échoue,
   * et l'information perdue ne manque qu'au moment où l'on cherche qui a décidé
   * quoi.
   */
  "parametres-etats-confondus": {
    casser: `create or replace function public.lister_parametres()
      returns table (cle text, valeur jsonb, modifie_le timestamptz, modifie_par text)
      language plpgsql stable security definer set search_path = '' as $$
      begin
        if not public.est_admin() then
          raise exception 'introuvable' using errcode = 'DL031';
        end if;
        return query
        select d.cle,
               coalesce(s.value, d.defaut),
               coalesce(s.updated_at, now()),
               coalesce(p.email, 'systeme')
        from (values ('seuil_colis_par_compte', '1200'::jsonb),
                     ('retard_veilleur_minutes', '90'::jsonb)) as d(cle, defaut)
        left join public.system_settings s on s.key = d.cle
        left join public.profiles p on p.id = s.updated_by
        order by d.cle;
      end;
      $$;`,
    reparerDepuisMigration: {
      fichier: "048_lister_parametres.sql",
      depuis: "create function public.lister_parametres",
      jusqua: "comment on function",
    },
  },

  /**
   * LE CAS MOTIVANT : le compteur d'octets qui ne redescend jamais.
   *
   * La suppression d'un média cesse de décrémenter. Rien n'échoue, et le chiffre
   * reste parfaitement crédible — il mesure simplement les octets JAMAIS DÉPOSÉS
   * au lieu des octets OCCUPÉS. L'écart ne se voit qu'en comparant à une facture
   * d'hébergement, c'est-à-dire des mois plus tard.
   */
  "octets-sans-retour": {
    casser: `create or replace function public.compter_media()
      returns trigger language plpgsql security definer set search_path = '' as $$
      declare v_shop uuid; v_ligne record;
      begin
        v_ligne := case when tg_op = 'DELETE' then old else new end;
        select o.shop_id into v_shop from public.orders o where o.id = v_ligne.order_id;
        if v_shop is null then return v_ligne; end if;
        if tg_op = 'DELETE' then return old; end if;
        update public.shops
        set medias_count = medias_count + 1,
            stockage_octets = stockage_octets + new.taille_octets
        where id = v_shop;
        return new;
      end;
      $$;`,
    reparerDepuisMigration: {
      fichier: "049_compteurs_par_boutique.sql",
      depuis: "create function public.compter_media",
      jusqua: "revoke all on function public.compter_media",
    },
  },

  /**
   * HORS du cas motivant : le compteur de commandes qui compte les MODIFICATIONS.
   *
   * La condition de transition saute. Chaque enregistrement de l'éditeur
   * incrémente alors le compteur, qui mesure les modifications et non les
   * commandes. Les deux chiffres se ressemblent assez pour qu'on ne remarque
   * rien — et celui-ci monte du côté rassurant, ce qui est le pire des deux.
   */
  "commandes-comptees-a-chaque-ecriture": {
    casser: `create or replace function public.compter_commande_reelle()
      returns trigger language plpgsql security definer set search_path = '' as $$
      begin
        if tg_op = 'DELETE' then
          if old.first_content_at is not null then
            update public.shops set commandes_reelles = greatest(commandes_reelles - 1, 0)
            where id = old.shop_id;
          end if;
          return old;
        end if;
        if new.first_content_at is null then return new; end if;
        update public.shops set commandes_reelles = commandes_reelles + 1
        where id = new.shop_id;
        return new;
      end;
      $$;
      drop trigger if exists orders_compter_commande_reelle on public.orders;
      create trigger orders_compter_commande_reelle
        after insert or delete or update on public.orders
        for each row execute function public.compter_commande_reelle();`,
    reparerDepuisMigration: {
      fichier: "049_compteurs_par_boutique.sql",
      depuis: "create function public.compter_commande_reelle",
      jusqua: "revoke all on function public.compter_commande_reelle",
      avant: `drop trigger if exists orders_compter_commande_reelle on public.orders;
        create trigger orders_compter_commande_reelle
          after insert or delete or update of first_content_at on public.orders
          for each row execute function public.compter_commande_reelle();`,
    },
  },

  /**
   * HORS du cas motivant, et d'une autre nature : le JETON REPUBLIÉ SOUS UN NOM
   * ANODIN.
   *
   * La liste des boutiques rend le `public_token` d'une commande dans la colonne
   * `nom`. Aucun nom de colonne suspect n'apparaît, aucune erreur ne se produit,
   * et l'écran affiche quelque chose de plausible. Un contrôle qui chercherait le
   * MOT « token » ne verrait rien — seule la recherche de la VALEUR le trouve. Et
   * ce champ-là ne fuite pas une donnée, il transfère une CAPACITÉ, définitivement.
   */
  "jeton-sous-nom-anodin": {
    casser: `create or replace function public.lister_boutiques_admin(
        p_recherche text, p_curseur_octets text, p_curseur_id text,
        p_limite int, p_ip_hash text
      ) returns table (
        id uuid, nom text, proprietaire_id uuid, email text,
        account_type public.account_type, status public.account_status,
        commandes_reelles integer, medias_count integer, stockage_octets bigint,
        colis_ce_mois integer, created_at timestamptz
      ) language plpgsql volatile security definer set search_path = '' as $$
      declare v_limite int := least(greatest(coalesce(p_limite, 50), 1), 100);
      begin
        if not public.est_admin() then
          raise exception 'introuvable' using errcode = 'DL031';
        end if;
        return query
        select s.id,
               coalesce((select o.public_token from public.orders o
                         where o.shop_id = s.id limit 1), s.name),
               p.id, p.email, p.account_type, p.status,
               s.commandes_reelles, s.medias_count, s.stockage_octets,
               coalesce(u.parcels_registered, 0), s.created_at
        from public.shops s
        join public.profiles p on p.id = s.owner_id
        left join public.usage_counters u
          on u.profile_id = p.id and u.period_month = date_trunc('month', now())::date
        order by s.stockage_octets desc, s.id desc
        limit v_limite;
      end;
      $$;`,
    reparerDepuisMigration: {
      fichier: "050_boutiques_admin.sql",
      depuis: "create function public.lister_boutiques_admin",
      jusqua: "comment on function public.lister_boutiques_admin",
    },
  },

  /**
   * LE CAS MOTIVANT : le compteur d'interrogations qui ignore les appels VIDES.
   *
   * L'optimisation paraît raisonnable — « une interrogation sans mouvement n'a
   * rien rapporté » — et elle est fausse : le fournisseur facture l'appel, pas
   * le résultat. Le compteur descend alors SOUS la facture, du côté rassurant,
   * et l'écart ne se voit qu'en recevant la facture. Un numéro fraîchement collé
   * n'est souvent pas encore scanné : ce sont précisément les plus nombreuses.
   */
  "interrogations-vides-non-comptees": {
    casser: `create or replace function public.compter_interrogation()
      returns trigger language plpgsql security definer set search_path = '' as $$
      declare v_profil uuid;
      begin
        if new.normalized_status is null then return new; end if;
        select s.owner_id into v_profil
        from public.tracked_parcels tp
        join public.shops s on s.id = tp.shop_id
        where tp.id = new.parcel_id;
        if v_profil is null then return new; end if;
        insert into public.usage_counters (profile_id, period_month, tracking_api_calls)
        values (v_profil, date_trunc('month', new.fetched_at)::date, 1)
        on conflict (profile_id, period_month) do update
          set tracking_api_calls = public.usage_counters.tracking_api_calls + 1,
              updated_at = now();
        return new;
      end;
      $$;`,
    reparerDepuisMigration: {
      fichier: "051_compteur_interrogations.sql",
      depuis: "create function public.compter_interrogation()",
      jusqua: "revoke all on function public.compter_interrogation",
    },
  },

  /**
   * HORS du cas motivant : les SURFACES DE LIMITATION CONFONDUES.
   *
   * L'écran rend un pic unique au lieu d'un par surface. Le chiffre reste juste
   * — c'est bien le plus haut compteur — mais il perd la seule distinction qui
   * compte : une saturation de la page publique peut être un vendeur qui perce,
   * une saturation de l'authentification est une attaque. Confondues, l'attaque
   * se lit comme un succès commercial.
   */
  "surfaces-de-limitation-confondues": {
    casser: `create or replace function public.sante_infrastructure()
      returns table (genre text, indicateur text, valeur bigint)
      language plpgsql stable security definer set search_path = '' as $$
      begin
        if not public.est_admin() then
          raise exception 'introuvable' using errcode = 'DL031';
        end if;
        return query
        select 'suivi'::text, 'interrogations_ce_mois'::text,
               coalesce(sum(u.tracking_api_calls), 0)::bigint
        from public.usage_counters u
        where u.period_month = date_trunc('month', now())::date
        union all
        select 'suivi'::text, 'colis_pris_en_charge_ce_mois'::text,
               coalesce(sum(u.parcels_registered), 0)::bigint
        from public.usage_counters u
        where u.period_month = date_trunc('month', now())::date
        union all
        select 'suivi'::text, 'abandons_ce_mois'::text, count(*)::bigint
        from public.tracked_parcels tp
        where tp.abandoned_at >= date_trunc('month', now())
        union all
        select 'limitation'::text, 'pic_total'::text, max(r.compte)::bigint
        from public.rate_limit r
        where r.fenetre_debut > now() - interval '1 hour';
      end;
      $$;`,
    reparerDepuisMigration: {
      fichier: "052_sante_infrastructure.sql",
      depuis: "create function public.sante_infrastructure",
      jusqua: "comment on function public.sante_infrastructure",
    },
  },

  /**
   * LE CAS MOTIVANT : le contrôle par VALEUR des clés de médias, retiré.
   *
   * Le droit d'insertion reste restreint aux bonnes colonnes — donc un contrôle
   * qui n'inspecterait que les PRIVILÈGES resterait vert. Ce qui disparaît est
   * la seule chose qui empêche une clé légitime en forme de désigner l'objet
   * d'un autre vendeur.
   */
  "cles-media-sans-controle": {
    casser: "drop trigger if exists order_media_cles_par_valeur on public.order_media;",
    reparer: `create trigger order_media_cles_par_valeur
      before insert or update of cle, cle_vignette on public.order_media
      for each row execute function public.verifier_cles_media();`,
  },

  /**
   * HORS du cas motivant : le droit d'INSERTION rendu à la table entière.
   *
   * Aucun déclencheur n'est touché, les clés restent contrôlées par valeur, et
   * l'isolation entre vendeurs tient toujours — la policy contrôle le `shop_id`.
   * Ce qui redevient possible est autre chose : fabriquer soi-même les colonnes
   * de MESURE. Un vendeur pose `first_content_at` et `views_count`, le
   * déclencheur de comptage suit, et le « signal roi » de la phase de validation
   * devient fabricable sans jamais créer le moindre contenu.
   *
   * Une métrique de verdict légèrement faussée est pire qu'une métrique cassée,
   * parce qu'elle reste crédible.
   */
  "insertion-orders-sur-la-table": {
    casser: "grant insert on public.orders to authenticated;",
    reparer: `revoke insert on public.orders from authenticated;
      grant insert (shop_id, product_ref, internal_notes) on public.orders to authenticated;`,
  },

  /**
   * LE CAS MOTIVANT DU LOT SUIVI : le coût imputé à chaque vendeur.
   *
   * On rétablit exactement l'ancien comportement — une imputation par colis
   * portant le numéro. Mesuré avant correction : deux boutiques, un appel, deux
   * imputations ; cinq rejeux, dix imputations pour un appel payé.
   *
   * Le numéro de suivi figurant sur l'étiquette, ce défaut permettait à un tiers
   * de faire porter à un vendeur le coût de son propre suivi. Le seul compteur
   * du produit qui corresponde à une facture était falsifiable À LA HAUSSE.
   */
  "cout-du-suivi-par-vendeur": {
    casser: `create or replace function public.imputer_appel_suivi(p_numero text)
      returns void language plpgsql security definer set search_path = '' as $fals$
      begin
        insert into public.usage_counters (profile_id, period_month, tracking_api_calls)
        select s.owner_id, date_trunc('month', now())::date, 1
        from public.tracked_parcels tp join public.shops s on s.id = tp.shop_id
        where tp.tracking_number = p_numero
        on conflict (profile_id, period_month) do update
          set tracking_api_calls = public.usage_counters.tracking_api_calls + 1;
      end; $fals$;`,
    reparerDepuisMigration: {
      fichier: "070_cout_du_suivi_impute_une_fois.sql",
      depuis: "create function public.imputer_appel_suivi",
    },
  },

  /**
   * HORS du cas motivant : la déduplication des notifications qui accepte tout.
   *
   * Rien n'est retiré, aucun droit ne change, la table reste fermée et le
   * compteur de coût reste imputé une seule fois par appel. Ce qui redevient
   * possible est le REJEU : la fonction répond toujours « jamais vue », donc
   * chaque réémission du fournisseur est traitée comme un fait neuf.
   *
   * C'est la forme la plus trompeuse du défaut — la garde est là, elle répond,
   * elle ne lève rien. « Il répond » est la propriété que tous les résidus
   * possèdent.
   */
  "notifications-toujours-neuves": {
    casser: `create or replace function public.notification_deja_vue(p_cle text)
      returns boolean language sql security definer set search_path = '' as $fals$
        select false;
      $fals$;`,
    reparerDepuisMigration: {
      fichier: "071_une_notification_ne_compte_qu_une_fois.sql",
      depuis: "create function public.notification_deja_vue",
    },
  },

  /**
   * HORS du cas motivant : les dates du colis redeviennent écrasables.
   *
   * Ni le coût, ni la déduplication, ni les droits ne sont touchés. Seul le
   * `least`/`greatest` redevient un `coalesce`, c'est-à-dire l'écriture
   * inconditionnelle d'origine. Le colis reste suivi, la page publique reste
   * servie, aucune requête n'échoue — la seule chose qui change est que la date
   * de départ et l'estimation de livraison peuvent revenir en arrière.
   *
   * Mesuré avant correction : dix jours d'écart sur le départ dès trente points
   * de passage, et une estimation de livraison DÉJÀ PASSÉE affichée au client.
   * Aucun de ces deux effets ne produit d'erreur : ils se lisent chez le
   * destinataire, des semaines plus tard.
   */
  "dates-du-colis-ecrasables": {
    casser: `create or replace function public.appliquer_etat_colis(
      p_numero text, p_etape public.parcel_status, p_statut_brut text, p_transporteur text,
      p_points jsonb, p_estimation_du text, p_estimation_au text, p_brut jsonb,
      p_premier_mouvement text
    ) returns integer language plpgsql security definer set search_path = '' as $fals$
    declare
      v_colis record; v_touches integer := 0; v_dernier timestamptz; v_premier timestamptz;
      v_pionnier uuid;
      v_du timestamptz := nullif(btrim(coalesce(p_estimation_du, '')), '')::timestamptz;
      v_au timestamptz := nullif(btrim(coalesce(p_estimation_au, '')), '')::timestamptz;
    begin
      select tp.id into v_pionnier from public.tracked_parcels tp
      where tp.tracking_number = p_numero order by tp.created_at asc, tp.id asc limit 1;

      for v_colis in
        select id from public.tracked_parcels where tracking_number = p_numero
      loop
        insert into public.parcel_checkpoints (parcel_id, occurred_at, location, description, stage)
        select v_colis.id, (p->>'instant')::timestamptz, nullif(p->>'lieu', ''),
               p->>'description', nullif(p->>'etape', '')
        from jsonb_array_elements(coalesce(p_points, '[]'::jsonb)) as p
        where p->>'instant' is not null and nullif(p->>'description', '') is not null
        on conflict (parcel_id, occurred_at, description) do nothing;

        select min(occurred_at), max(occurred_at) into v_premier, v_dernier
          from public.parcel_checkpoints where parcel_id = v_colis.id;

        update public.tracked_parcels
           set normalized_status = greatest(normalized_status, p_etape),
               raw_status = coalesce(nullif(p_statut_brut, ''), raw_status),
               first_movement_at = coalesce(v_premier, first_movement_at),
               last_movement_at = coalesce(v_dernier, last_movement_at),
               estimated_from = coalesce(v_du, estimated_from),
               estimated_to = coalesce(v_au, estimated_to),
               query_count = query_count + 1, empty_count = 0
         where id = v_colis.id;

        -- L'instantané reste écrit, et une seule fois : cette falsification ne
        -- doit toucher QUE les dates. Une falsification qui casse plus que la
        -- garde visée ne prouve pas que c'est la garde visée qui tenait.
        if v_colis.id = v_pionnier then
          insert into public.tracking_snapshots (parcel_id, raw_payload, normalized_status)
          values (v_colis.id, coalesce(p_brut, '{}'::jsonb), p_etape);
        end if;

        v_touches := v_touches + 1;
      end loop;
      if v_touches > 0 then perform public.imputer_appel_suivi(p_numero); end if;
      return v_touches;
    end; $fals$;`,
    reparerDepuisMigration: {
      fichier: "072_les_dates_du_colis_ne_reculent_pas.sql",
      depuis: "create function public.appliquer_etat_colis",
    },
  },

  /**
   * HORS du cas motivant : l empreinte de vue redevient n importe quoi.
   *
   * Rien ne change sur le suivi, sur les droits, ni sur l isolation. Seule la
   * verification de FORME disparait de `enregistrer_vue`. La fonction accepte
   * alors `''` et `'x'` — mesure avant correction — et la cle de deduplication
   * d une METRIQUE DE VERDICT repose dessus : soit tous les visiteurs d un jour
   * fusionnent en une ligne, soit ils se multiplient sans borne.
   *
   * Le refus existe toujours dans l appelant, `vue.ts`. C est precisement ce qui
   * rendait le defaut invisible : la protection tenait a ce qu un seul chemin de
   * code pense a la poser.
   */
  "vue-empreinte-non-verifiee": {
    casser: `create or replace function public.enregistrer_vue(
      p_jeton text, p_ip_hash text, p_ua_hash text, p_pays text, p_profil text
    ) returns boolean language plpgsql security definer set search_path = '' as $fals$
    declare v_order uuid; v_proprietaire uuid; v_insere uuid;
    begin
      select o.id, p.id into v_order, v_proprietaire
      from public.orders o
      join public.shops s on s.id = o.shop_id
      join public.profiles p on p.id = s.owner_id
      where o.public_token = p_jeton and p.status = 'active';
      if v_order is null then return false; end if;
      if nullif(p_profil, '') is not null and nullif(p_profil, '')::uuid = v_proprietaire then
        return false;
      end if;
      insert into public.link_views (order_id, ip_hash, user_agent_hash, country)
      values (v_order, p_ip_hash, p_ua_hash, nullif(p_pays, ''))
      on conflict (order_id, ip_hash, user_agent_hash, viewed_on) do nothing
      returning id into v_insere;
      return v_insere is not null;
    end; $fals$;`,
    reparerDepuisMigration: {
      fichier: "076_une_vue_exige_une_empreinte_reelle.sql",
      depuis: "create or replace function public.enregistrer_vue",
    },
  },

  /**
   * LE CAS MOTIVANT : le plafond de commandes par compte, retire.
   *
   * Mesure avant correction : cinq mille commandes inserees en 533 ms, et rien
   * ne s y opposait. Les plafonds existants — vingt medias, trois videos — sont
   * poses PAR COMMANDE : un compte pouvait donc remplir le stockage sans jamais
   * franchir aucune limite, chaque commande prise separement restant dans les
   * clous.
   */
  "plafond-commandes-absent": {
    casser: "drop trigger if exists orders_plafond_par_compte on public.orders;",
    reparer: `create trigger orders_plafond_par_compte
      before insert on public.orders
      for each row execute function public.verifier_plafond_commandes();`,
  },

  /**
   * HORS du cas motivant : le plafond de STOCKAGE, retire.
   *
   * Le cas motivant etait le NOMBRE de commandes. Ici rien ne change de ce
   * cote-la : un compte reste borne a trois mille commandes par mois. Ce qui
   * redevient possible est de les remplir sans limite d octets — c est-a-dire de
   * faire deraper le seul poste de cout du produit qui puisse reellement
   * deraper, sans jamais franchir aucun compteur.
   *
   * NOTE SUR UNE FALSIFICATION ECARTEE. On a d abord ecrit une variante qui
   * remplacait le compteur tenu a l ecriture par une SOMME sur `order_media`.
   * Elle laissait toutes les suites VERTES — le refus tombe au bon moment, seul
   * le cout de la lecture change — donc elle ne prouvait rien et donnait
   * l illusion inverse. Elle dit surtout ce qui manque : AUCUNE SONDE
   * N EXAMINE LE PLAN d execution de ce declencheur, alors qu il s execute a
   * chaque depot de media. C est un trou connu, pas un trou couvert.
   */
  "plafond-stockage-absent": {
    casser: "drop trigger if exists order_media_plafond_stockage on public.order_media;",
    reparer: `create trigger order_media_plafond_stockage
      before insert on public.order_media
      for each row execute function public.verifier_plafond_stockage();`,
  },

  /**
   * HORS du cas motivant : l archivage par lot cesse de tracer.
   *
   * Le lot fonctionne toujours — il archive, il refuse au-dela de deux cents, il
   * dedoublonne, il reste tout-ou-rien. Seule la trace disparait. C est
   * exactement l etat d avant : deux cents commandes archivees, zero ligne dans
   * leur historique, et l ecran qui repond « qui a modifie quoi » muet sur le
   * seul geste qui les a touchees.
   *
   * Rien n echoue, rien n alerte. Le defaut ne se decouvre qu au moment ou l on
   * cherche la trace — c est-a-dire trop tard.
   */
  "lot-sans-trace": {
    casser: `create or replace function public.archiver_lot(p_ids uuid[], p_archiver boolean)
      returns integer language plpgsql security invoker set search_path = '' as $fals$
      declare v_ids uuid[]; v_demandes integer; v_modifiees integer;
      begin
        select array_agg(distinct x) into v_ids
        from unnest(coalesce(p_ids, '{}'::uuid[])) as x where x is not null;
        v_demandes := coalesce(array_length(v_ids, 1), 0);
        if v_demandes = 0 then return 0; end if;
        if v_demandes > 200 then
          raise exception 'lot trop grand : % commandes', v_demandes using errcode = 'DL037';
        end if;
        update public.orders
           set archived_at = case when p_archiver then now() else null end
         where id = any(v_ids);
        get diagnostics v_modifiees = row_count;
        if v_modifiees <> v_demandes then
          raise exception 'lot refusé : % commandes sur % sont hors de portée',
            v_demandes - v_modifiees, v_demandes using errcode = 'DL038';
        end if;
        return v_modifiees;
      end; $fals$;`,
    reparerDepuisMigration: {
      fichier: "081_le_lot_laisse_une_trace_par_commande.sql",
      depuis: "create or replace function public.archiver_lot",
    },
  },

};

const [, , action, cible] = process.argv;

if (!SQL[cible] || !["casser", "reparer"].includes(action)) {
  console.error(`Usage : node scripts/falsifier.mjs <casser|reparer> <${Object.keys(SQL).join("|")}>`);
  process.exit(1);
}

const client = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});

await client.connect();

let sql = SQL[cible][action];

if (sql === undefined && action === "reparer" && SQL[cible].reparerDepuisMigration) {
  // `jusqua` borne la decoupe. Sans borne, on rejoue tout ce qui suit la
  // fonction dans le fichier — y compris des `create table` ou `alter table`
  // deja appliques, qui echouent. Defaut constate en reparant `sans_accents` :
  // la decoupe entrainait l ajout de colonne et l index de la migration 008.
  const { fichier, depuis, jusqua, avant } = SQL[cible].reparerDepuisMigration;
  // Certaines falsifications touchent AUSSI le schema. Ce qui est rejoue depuis
  // le fichier ne remet en etat que la fonction : le reste se repare ici, avant.
  if (avant) await client.query(avant);
  const chemin = join(process.cwd(), "supabase", "migrations", fichier);
  const contenu = readFileSync(chemin, "utf8");
  const index = contenu.indexOf(depuis);
  const fin = jusqua ? contenu.indexOf(jusqua, index) : -1;
  if (index === -1) {
    console.error(
      `Réparation impossible : « ${depuis} » est introuvable dans ${fichier}. ` +
        "La migration a changé sans que cette cible de falsification suive.",
    );
    await client.end();
    process.exit(1);
  }
  // `create or replace` sur la MÊME liste d arguments remplace bien la
  // fonction. Attention : si la signature changeait, Postgres en creerait une
  // SECONDE et un appel resoudrait l ANCIENNE, sans erreur.
  sql = contenu
    .slice(index, fin === -1 ? undefined : fin)
    .replace("create function", "create or replace function");
}

if (typeof sql !== "string") {
  console.error(`Aucun SQL pour « ${action} ${cible} ».`);
  await client.end();
  process.exit(1);
}

await client.query(sql);
console.log(`${action} ${cible} : fait`);
await client.end();
