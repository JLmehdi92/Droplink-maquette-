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
