-- 019 — Lire un compteur de quota sans le consommer.
--
-- POURQUOI CETTE FONCTION EXISTE. La page publique a DEUX seuils : 20 requêtes
-- par minute sur un jeton INCONNU, 120 sur un jeton VALIDE. Or la validité d'un
-- jeton ne se connaît qu'APRÈS l'avoir cherché en base — c'est-à-dire après
-- avoir payé la requête que le seuil est censé éviter.
--
-- La séquence qui résout cela tient en trois temps : consulter le compteur des
-- jetons inconnus SANS le consommer (celui qui a déjà brûlé son budget est
-- refusé avant toute lecture), consommer le compteur des requêtes, puis, une
-- fois seulement que le jeton s'est révélé inconnu, consommer le compteur des
-- inconnus. Un balayage se coupe donc lui-même au bout de vingt essais, et le
-- client d'un vendeur, qui ne tape jamais un jeton faux mais clique un lien, ne
-- touche jamais ce seuil-là.
--
-- DEUX SEUILS ET PAS UN. Un seuil unique obligerait à choisir entre gêner les
-- clients et laisser passer l'aspiration ; le compromis serait mauvais des deux
-- côtés.
--
-- ELLE NE CRÉE AUCUNE LIGNE, délibérément : une consultation qui écrit serait
-- une consommation déguisée, et le plafond réel vaudrait la moitié du plafond
-- annoncé.

create function public.quota_depasse(
  p_cle text,
  p_plafond integer,
  p_fenetre_secondes integer
)
  returns boolean
  language plpgsql
  stable
  security definer
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

  -- La fenêtre est calculée EXACTEMENT comme dans `consommer_quota`, depuis
  -- l'horloge du serveur. Deux calculs de fenêtre divergents feraient consulter
  -- une fenêtre et consommer l'autre, et le plafond ne tiendrait rien.
  v_debut := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_fenetre_secondes) * p_fenetre_secondes
  );

  select r.compte into v_compte
  from public.rate_limit r
  where r.cle = p_cle and r.fenetre_debut = v_debut;

  return coalesce(v_compte, 0) >= p_plafond;
end;
$$;

comment on function public.quota_depasse(text, integer, integer) is
  'Consulte un compteur de quota sans le consommer. Sert le seuil dont la condition n''est connue qu''après coup.';

-- Un compteur qu'un client peut lire lui dit combien il lui reste, donc à quelle
-- cadence balayer sans être vu.
revoke execute on function public.quota_depasse(text, integer, integer)
  from public, anon, authenticated;
