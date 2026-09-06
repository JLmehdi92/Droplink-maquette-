/**
 * « CE CHEMIN VISE-T-IL LA SURFACE ADMIN ? »
 *
 * ⚠️ EXTRAITE DU MIDDLEWARE LE 06/09/2026 POUR POUVOIR ÊTRE ÉPROUVÉE. Elle y
 * vivait, et RIEN ne l'exerçait — mesuré : zéro occurrence de `viseAdmin` dans
 * `tests/`. L'importer depuis le middleware pour la tester entraînait tout
 * `next-intl/middleware`, qui ne se résout pas hors d'un contexte Next.
 *
 * Une fonction de correspondance de chemin n'a besoin d'aucun de ces modules :
 * elle vit donc ici, pure, et le middleware l'appelle.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QU'ELLE DÉCIDE, ET CE QU'ELLE NE DÉCIDE PAS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Elle commande la couche PRÉ-EMPTIVE : rendre 404 sur `/…/admin` avant toute
 * génération de réponse, pour que la surface n'existe pas aux yeux de qui n'y a
 * pas droit — jamais 403, qui confirmerait son existence.
 *
 * ELLE NE FAIT PAS AUTORITÉ. `requireAdmin()` et la vérification du rôle EN
 * BASE à chaque requête la font. Le middleware ne protège aucune donnée à lui
 * seul — c'est écrit dans le brief, et ça reste vrai.
 *
 * ⚠️ SON MOTIF DÉPEND DU CODE DE LANGUE RETENU, ET C'EST UN PIÈGE SILENCIEUX.
 * `[a-z]{2}(-[a-z]{2})?` couvre `fr`, `en`, `zh`, `zh-CN` — mais PAS `zh-Hans`,
 * dont le sous-tag fait quatre lettres. Adopter cette forme ferait disparaître
 * la couche sans un seul signal. C'est une des raisons pour lesquelles le
 * produit retient `zh-CN` plutôt que `zh-Hans`, et
 * `tests/unit/filtre-admin-du-middleware.test.ts` le vérifie sur l'inventaire
 * réel des langues au lieu de le supposer.
 *
 * La langue est acceptée sous n'importe quelle casse et le préfixe peut
 * manquer : ne reconnaître que `/fr/admin` laisserait `/FR/admin` et `/admin`
 * franchir le filtre. Ils ne mènent nulle part aujourd'hui — mais une
 * protection qui tient à ce qu'une redirection ait lieu D'ABORD n'est pas une
 * protection.
 */
export function viseAdmin(chemin: string): boolean {
  return /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?admin(?:\/|$)/i.test(chemin);
}
