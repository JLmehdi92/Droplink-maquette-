/*
 * 145 — RÉSERVER UN COLIS N'EST PAS L'AVOIR INTERROGÉ.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * MESURÉ EN PRODUCTION LE 07/09/2026, SUR LE PREMIER COLIS RÉEL D'UN CLIENT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * La cadence a tourné pour la première fois de la vie du produit dans la nuit
 * du 06 au 07/09. Ses journaux, sur douze heures, disent ceci :
 *
 *   23:46  examines:1  interroges:0     silence de 1,13 jour → intervalle 6 h
 *   03:00  examines:1  interroges:0     silence de 1,26 jour → intervalle 6 h
 *   -- 03:46 : une notification 17TRACK remet `last_movement_at` à jour --
 *   06:01  examines:1  interroges:1     silence de 0,60 jour → intervalle 3 h
 *   09:16  examines:1  interroges:1
 *   12:16  examines:1  interroges:1
 *
 * LES DEUX PREMIERS PASSAGES N'ONT RIEN INTERROGÉ, ET CE N'ÉTAIT PAS UN CHOIX.
 *
 * `colis_a_interroger` réserve en écrivant `last_query_at = now()`, avec un
 * filtre à trois heures — l'intervalle le plus COURT de la cadence. La décision
 * fine, elle, vit dans `schedule.ts` et rend un intervalle qui S'ALLONGE avec
 * le silence : 3 h sous un jour, 6 h sous trois, 12 h sous sept, 24 h au-delà.
 *
 * Quand les deux divergent — c'est-à-dire dès qu'un colis passe 24 h sans
 * bouger — la réservation repousse la date toutes les trois heures, et
 * l'ancienneté vue par `decider` reste bloquée à trois heures. Elle n'atteint
 * JAMAIS les six heures qu'exige la décision. Le colis est examiné à chaque
 * tour et interrogé plus jamais.
 *
 * ⚠️ C'EST EXACTEMENT LE CAS QUI COMPTE LE PLUS. Le brief l'écrit noir sur
 * blanc à propos de la purge : « un colis bloqué en douane est celui pour
 * lequel on en a le plus besoin ». C'est aussi celui, et lui seul, que ce
 * défaut faisait sortir du suivi. Un colis qui avance tous les jours ne le
 * déclenche pas ; celui qui dort trois semaines dans un entrepôt, si.
 *
 * Ce soir-là, ce n'est pas la cadence qui a débloqué le colis, c'est une
 * notification du transporteur. Le filet a tenu par un mécanisme qui n'existe
 * pas pour tous les transporteurs et que rien ne garantit.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI LA 134 NE L'AVAIT PAS FERMÉ, ALORS QU'ELLE VISAIT CE DÉFAUT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * La 134 s'appelle `la_cadence_n_interrogeait_jamais_rien` et corrige la même
 * confusion — mais seulement sa MOITIÉ LISIBLE : elle fait rendre la valeur
 * d'AVANT au lieu de celle d'après. Elle n'a pas touché à l'ÉCRITURE, qui a
 * lieu de toute façon, y compris pour un colis qu'on ne va pas interroger.
 *
 * C'est L-025 dans sa forme la plus nette : un garde écrit après coup hérite du
 * champ de vision de la CORRECTION, pas du problème. La 134 regardait la valeur
 * rendue — là où le défaut n'était plus — et l'écriture, restée en place,
 * reproduisait le même blocage un cran plus loin.
 *
 * ET LES PORTES NE POUVAIENT PAS LE VOIR, pour la raison que la 134 énonçait
 * elle-même sans en tirer toutes les conséquences : les deux moitiés sont
 * éprouvées séparément. La suite SQL vérifie que la réservation tient sur UN
 * appel ; la suite TypeScript vérifie que `decider` décide bien, sur des dates
 * fabriquées. **Aucune ne rejoue DEUX passages consécutifs**, et c'est
 * exactement ce qu'il fallait pour voir la date se faire repousser.
 * `tests/rls/suivi-colis.test.ts` le fait désormais.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LA CORRECTION : DEUX FAITS, DEUX COLONNES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * « Ce colis est pris par un passage en cours » et « ce colis a été interrogé »
 * sont deux faits différents, portés jusqu'ici par la même colonne. Les
 * séparer suffit :
 *
 *   `reserve_at`     — posée par la sélection. Elle ne sert QU'À empêcher deux
 *                      passages concurrents de rendre le même colis, et elle
 *                      expire vite : un passage complet dure trois secondes
 *                      (mesuré), dix minutes couvrent largement un incident.
 *   `last_query_at`  — posée UNIQUEMENT par `marquer_interroge`, c'est-à-dire
 *                      seulement quand on va réellement appeler le
 *                      fournisseur. Elle redevient ce que son nom dit.
 *
 * L'anti-concurrence de la 074 est intégralement conservée : `for update skip
 * locked` plus une réservation datée. Ce qui change, c'est qu'un colis
 * seulement EXAMINÉ ne voit plus sa date d'interrogation avancer.
 *
 * ⚠️ CONSÉQUENCE ASSUMÉE : un colis dont l'intervalle réel dépasse trois heures
 * sera désormais rendu à CHAQUE passage jusqu'à maturité, au lieu d'un passage
 * sur douze. Il sera donc examiné plus souvent — mais un examen ne coûte rien
 * chez le fournisseur, seule l'interrogation se paie, et c'est elle que
 * `decider` continue de borner. On échange des lectures de base gratuites
 * contre des colis qui ne disparaissent plus.
 *
 * Le `returning` garde la forme de la 134 — la valeur capturée dans la
 * sous-requête — bien qu'elle soit désormais redondante, puisque l'`update` ne
 * touche plus cette colonne. Elle reste parce qu'elle est GRATUITE et qu'elle
 * rend la fonction juste même si quelqu'un remettait un jour l'écriture ici :
 * une protection qui ne tient qu'à l'absence d'une ligne n'est pas une
 * protection (L-029).
 */

alter table public.tracked_parcels
  add column reserve_at timestamptz;

comment on column public.tracked_parcels.reserve_at is
  'Instant où un passage de cadence a PRIS ce colis. Sert uniquement à ce que '
  'deux passages concurrents ne le rendent pas tous les deux, et expire en dix '
  'minutes. NE PAS confondre avec last_query_at, qui date la dernière '
  'interrogation RÉELLE du fournisseur : les avoir confondues faisait sortir du '
  'suivi tout colis silencieux depuis plus de 24 h (migration 145).';

-- DROP EXPLICITE, même si la signature ne change pas : un `create or replace`
-- qui rencontrerait une liste de retour différente créerait une SECONDE
-- fonction au lieu de remplacer celle-ci, et un appel résoudrait l'ancienne.
drop function if exists public.colis_a_interroger(integer);

create function public.colis_a_interroger(p_limite integer)
  returns table (
    id uuid,
    tracking_number text,
    carrier_code integer,
    normalized_status public.parcel_status,
    registered_at timestamptz,
    last_movement_at timestamptz,
    last_query_at timestamptz,
    empty_count integer
  )
  language sql
  volatile
  security definer
  set search_path = ''
as $$
  update public.tracked_parcels p
     -- LA RÉSERVATION EST L'ÉCRITURE, mais elle n'écrit plus la date
     -- d'interrogation : réserver un colis n'est pas l'avoir interrogé.
     set reserve_at = now()
    from (
     select c.id, c.last_query_at
     from public.tracked_parcels c
     where c.abandoned_at is null
       and c.normalized_status <> 'livre'
       -- Trois heures : l'intervalle le plus COURT de la cadence. Filtrer plus
       -- finement ici dupliquerait la décision, et deux copies d'une même
       -- décision divergent au premier ajustement de l'une des deux.
       and (c.last_query_at is null or c.last_query_at < now() - interval '3 hours')
       -- LA RÉSERVATION, ET RIEN D'AUTRE. Dix minutes : un passage complet dure
       -- trois secondes (mesuré le 07/09), et le planificateur repasse toutes
       -- les quinze minutes — une réservation abandonnée par un passage mort
       -- est donc reprise au tour suivant, jamais perdue.
       and (c.reserve_at is null or c.reserve_at < now() - interval '10 minutes')
     -- `nulls first` n'est pas un détail d'ordre : un colis JAMAIS interrogé est
     -- celui dont le vendeur vient de coller le numéro, et il attend devant son
     -- écran. Le servir en dernier serait servir en dernier le seul qui regarde.
     order by c.last_query_at asc nulls first
     limit greatest(1, least(coalesce(p_limite, 50), 200))
     for update skip locked
   ) as avant
   where p.id = avant.id
  returning p.id, p.tracking_number, p.carrier_code, p.normalized_status,
            p.registered_at, p.last_movement_at,
            -- LA VALEUR D'AVANT, héritée de la 134. Redondante depuis que
            -- l'`update` ne touche plus cette colonne — et gardée pour ça :
            -- elle rend la fonction juste même si l'écriture revenait ici.
            avant.last_query_at,
            p.empty_count;
$$;

comment on function public.colis_a_interroger(integer) is
  'Réserve et rend les colis à interroger. La sélection EST la réservation : '
  'deux passages concurrents ne peuvent pas rendre le même colis. La '
  'réservation écrit `reserve_at`, JAMAIS `last_query_at` — les confondre '
  'repoussait la date d''interrogation de trois heures en trois heures et '
  'faisait sortir du suivi tout colis silencieux depuis plus de 24 h.';

revoke all on function public.colis_a_interroger(integer) from public;
grant execute on function public.colis_a_interroger(integer) to service_role;
