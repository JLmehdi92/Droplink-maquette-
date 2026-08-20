-- 005 — Limitation de débit, EN BASE.
--
-- POURQUOI EN BASE ET PAS EN MÉMOIRE. Un compteur en mémoire vit dans une
-- instance. Or les environnements sans mémoire partagée multiplient les
-- instances PRÉCISÉMENT sous la charge qu'on cherche à limiter : au moment où le
-- compteur compte, il compte dans dix exemplaires, chacun à un dixième du seuil.
-- La limite paraît posée et ne tient rien.
--
-- POURQUOI MAINTENANT. Mesuré sur ce projet : une simple demande de lien de
-- connexion crée immédiatement `auth.users`, `profiles` ET `shops`, avant que
-- quiconque ait cliqué. Rien ne borne donc la création de comptes fantômes par
-- balayage d'adresses, et chacun laisse trois lignes derrière lui.
--
-- LA FENÊTRE SE LIT EN BASE, jamais sur l'horloge de l'appelant. Un décalage de
-- quelques secondes entre deux instances ferait chevaucher une fenêtre client
-- sur deux fenêtres serveur, et le plafond réel vaudrait le double.
--
-- LA TABLE N'A AUCUNE POLICY, DÉLIBÉRÉMENT. RLS activée et forcée sans policy
-- rend la table inatteignable autrement que par la fonction ci-dessous. Un
-- compteur qu'un client peut lire lui dit combien il lui reste ; un compteur
-- qu'il peut écrire lui permet d'épuiser le quota de quelqu'un d'autre.

create table public.rate_limit (
  cle text not null,
  fenetre_debut timestamptz not null,
  compte integer not null default 0,
  primary key (cle, fenetre_debut)
);

comment on table public.rate_limit is
  'Compteurs de limitation de débit. Aucune policy : atteignable uniquement par public.consommer_quota().';

-- Sert la purge opportuniste, qui balaie par ancienneté.
create index rate_limit_fenetre_idx on public.rate_limit (fenetre_debut);

alter table public.rate_limit enable row level security;
alter table public.rate_limit force row level security;

-- Supabase accorde SELECT/INSERT/UPDATE/DELETE à `anon` par défaut. Sans ce
-- retrait, la RLS serait la seule chose entre un anonyme et la table — et une
-- table sans policy laisserait quand même passer le propriétaire.
revoke all on public.rate_limit from anon, authenticated;

/*
 * Consomme une unité de quota. Rend `true` si l'appel est AUTORISÉ.
 *
 * Atomique par construction : l'incrément et la lecture ont lieu dans le même
 * ordre SQL. Deux requêtes simultanées ne peuvent pas lire la même valeur avant
 * de l'écrire — c'est le seul point qui compte, parce qu'une limitation de débit
 * qui se trompe sous concurrence se trompe exactement quand elle sert.
 */
create function public.consommer_quota(
  p_cle text,
  p_plafond integer,
  p_fenetre_secondes integer
)
  returns boolean
  language plpgsql
  security definer
  -- `search_path` vide : une fonction SECURITY DEFINER qui résout ses noms dans
  -- le chemin de l'APPELANT exécute ce que l'appelant a placé devant.
  set search_path = ''
as $$
declare
  v_debut timestamptz;
  v_compte integer;
begin
  if p_plafond <= 0 or p_fenetre_secondes <= 0 then
    raise exception 'plafond et fenêtre doivent être strictement positifs'
      using errcode = '22023';
  end if;

  -- Fenêtre alignée, calculée depuis l'horloge du SERVEUR.
  v_debut := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_fenetre_secondes) * p_fenetre_secondes
  );

  insert into public.rate_limit as r (cle, fenetre_debut, compte)
  values (p_cle, v_debut, 1)
  on conflict (cle, fenetre_debut)
    do update set compte = r.compte + 1
  returning r.compte into v_compte;

  -- Purge opportuniste et BORNÉE. Sans elle la table croît indéfiniment, ce qui
  -- est un défaut de montée en charge et non d'hygiène : le coût augmenterait
  -- avec le trafic passé. Bornée à 200 lignes pour qu'aucun appel ne paie un
  -- balayage arbitrairement long — la limitation de débit est sur le chemin
  -- critique de chaque requête qu'elle protège.
  if v_compte = 1 then
    delete from public.rate_limit
    where ctid in (
      select ctid from public.rate_limit
      where fenetre_debut < v_debut - make_interval(secs => p_fenetre_secondes * 2)
      limit 200
    );
  end if;

  return v_compte <= p_plafond;
end;
$$;

-- Postgres accorde EXECUTE à PUBLIC par défaut, et ce droit ne s'écrit pas dans
-- le corps de la fonction : aucune relecture de code ne peut le voir. Une
-- fonction de quota exécutable anonymement permettrait d'épuiser le quota d'un
-- tiers en connaissant sa clé, ce qui la rendrait pire qu'absente.
revoke execute on function public.consommer_quota(text, integer, integer)
  from public, anon, authenticated;
