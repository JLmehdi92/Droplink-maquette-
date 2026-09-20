-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ UN NOM DE LIEN FAIT TROIS CARACTÈRES — correctif de la 182               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ DÉFAUT DE LA 182, TROUVÉ EN L'INTERROGEANT PLUTÔT QU'EN LA RELISANT.
--
-- Le motif était `^[a-z0-9]([a-z0-9-]{1,38})?[a-z0-9]$`. Le groupe du milieu
-- étant OPTIONNEL, `ab` le satisfait : une lettre, rien, une lettre. Mesuré
-- juste après l'application — `slug_valide('ab')` rendait `true`, là où la
-- borne annoncée était « trois à quarante caractères ».
--
-- ⚠️ CE QUE DEUX CARACTÈRES AURAIENT COÛTÉ. L'espace des noms courts est
-- minuscule et se rafle en quelques minutes : `ab`, `xy`, `01`… Or un nom de
-- lien est réservé À VIE par construction (migration 182), donc un balayage
-- d'une heure stérilisait définitivement tout le haut du domaine — et les
-- noms les plus courts sont exactement ceux qui se dictent au téléphone.
--
-- Le correctif rend le groupe OBLIGATOIRE : une lettre, un à trente-huit
-- caractères, une lettre. Trois au minimum, quarante au maximum, et la borne
-- annoncée redevient la borne appliquée.
--
-- La 182 n'est pas rouverte : elle est appliquée. ⚠️ Et la contrainte
-- `shops_slug_forme` n'a pas besoin d'être refaite — elle APPELLE cette
-- fonction, donc elle suivra la nouvelle définition à la prochaine écriture.
-- Aucune ligne existante n'est concernée : `shops.slug` est nulle partout.

create or replace function public.slug_valide(p_slug text)
  returns boolean
  language sql
  immutable
as $$
  select p_slug is not null
     -- Le groupe du milieu n'est PLUS optionnel : c'est tout le correctif.
     and p_slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'
     and p_slug !~ '--'
     and not public.slug_est_reserve(p_slug);
$$;

comment on function public.slug_valide(text) is
  'Vrai si ce nom de lien est acceptable : 3 à 40 caractères, minuscules, chiffres et tirets internes, aucun tiret double, et non réservé. Une URL se recopie à la main et se dicte au téléphone — d''où l''absence de majuscules et d''accents. Le plancher de trois caractères protège l''espace des noms courts, qui est minuscule et réservé à vie.';
