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
