-- 059 — Aligner l'INSERT de `orders` sur ce que le vendeur peut déjà MODIFIER.
--
-- CORRECTIF DE LA 056, constaté par exécution : la liste que j'y avais accordée
-- — `shop_id, product_ref, internal_notes` — décrivait ce que les deux chemins
-- de création du produit écrivent AUJOURD'HUI, pas ce qu'un vendeur a
-- légitimement le droit d'écrire. Douze suites d'isolation sont passées au
-- rouge : elles créent des commandes portant `customer_label` dès l'insertion,
-- ce qui est parfaitement licite.
--
-- LA LEÇON EST PLUS GÉNÉRALE QUE LE CORRECTIF. Une liste blanche déduite des
-- APPELS observés se périme au premier appel nouveau ; une liste blanche déduite
-- du DROIT reste juste. La bonne référence existait déjà : la liste des colonnes
-- que le vendeur peut MODIFIER. Ce qu'il a le droit de changer plus tard, il a
-- le droit de le poser tout de suite — et l'inverse serait une règle que
-- personne ne pourrait deviner.
--
-- CE QUI RESTE EXCLU, ET C'EST TOUT L'OBJET DE LA 056 : `public_token`,
-- `unsubscribe_token`, `first_content_at`, `created_event_at`, `views_count`,
-- `last_viewed_at`, `created_at`, `updated_at`. Aucune n'est modifiable non
-- plus — la symétrie est maintenant complète dans les deux sens.
--
-- `qc_status` figure dans la liste d'UPDATE et donc ici : c'est le destinataire
-- qui l'écrit, via `arbitrer_qc`, mais le vendeur peut le porter à sa valeur
-- initiale. La valeur par défaut de la colonne fait foi s'il ne la fournit pas.

revoke insert on public.orders from authenticated;

grant insert (shop_id, customer_label, product_ref, internal_notes,
              tracking_number, carrier_code, status, qc_status,
              cover_media_id, notify_email, archived_at)
  on public.orders to authenticated;
