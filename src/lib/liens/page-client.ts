/**
 * L'ADRESSE DE LA PAGE CLIENT — UN SEUL POINT D'ÉMISSION.
 *
 * ⚠️ IL Y EN AVAIT CINQ, ET C'EST EXACTEMENT LE PROBLÈME QUE CE MODULE FERME.
 * `origine + "/p/" + jeton` était écrit à la main dans l'éditeur de commande, le
 * tableau des commandes, l'export CSV, l'export RGPD et la redirection « voir la
 * page client ». Tant qu'il n'existait qu'une seule forme d'adresse, cinq copies
 * identiques ne coûtaient rien. Depuis les migrations 182-184 il y en a DEUX —
 * `/p/<jeton>` et `/<nom>/<jeton>` — et cinq copies deviennent cinq occasions
 * d'en oublier une : le vendeur paie pour un lien à son nom, et l'export CSV
 * continue de donner l'autre à ses clients.
 *
 * ⚠️ LE NOM S'APPLIQUE DÈS QUE LA BOUTIQUE EN PORTE UN, SANS REGARDER LE PLAN.
 * Ce n'est pas un oubli de garde, c'est la décision : le plan commande la
 * CRÉATION du nom (`definir_slug_boutique` refuse un compte gratuit, DL059),
 * jamais son SERVICE. Un vendeur qui repasse en gratuit garde donc un nom qui
 * résout, et lui afficher soudain `/p/<jeton>` lui ferait envoyer une seconde
 * adresse pour la même commande — alors que ses clients ont déjà la première.
 *
 * ⚠️ ET LES DEUX FORMES RESTENT VALIDES EN MÊME TEMPS. Ce module choisit ce
 * qu'on MONTRE ; il ne ferme rien. `/p/<jeton>` répond toujours, y compris pour
 * une commande dont la boutique a un nom — c'est ce qui fait qu'un lien envoyé
 * avant la bascule continue de fonctionner.
 */

/**
 * Le chemin, sans origine. C'est la forme qu'attend une redirection interne :
 * une `Location` relative se résout contre l'adresse que le navigateur a
 * demandée, donc jamais contre celle du conteneur (défaut du 08/09/2026).
 */
export function cheminPageClient(jeton: string, nomDeLien: string | null): string {
  /*
   * Le nom vide est traité comme une absence. La base ne peut pas en produire —
   * `slug_valide` exige trois caractères — mais un formulaire peut en envoyer
   * une avant l'écriture, et `/<vide>/<jeton>` s'écrirait `//<jeton>` : une URL
   * relative au PROTOCOLE, que le navigateur résout vers un AUTRE domaine.
   * C'est la même famille que la redirection ouverte du 01/09/2026, et elle se
   * referme ici plutôt qu'à cinq endroits.
   */
  const nom = nomDeLien === null ? "" : nomDeLien.trim();
  return nom === "" ? `/p/${jeton}` : `/${nom}/${jeton}`;
}

/**
 * L'adresse complète, celle qu'un vendeur copie et colle dans un message.
 *
 * `origine` peut être vide : `origineDuSite()` rend `null` quand
 * `NEXT_PUBLIC_SITE_URL` n'est pas configurée, et les appelants la replient
 * déjà en chaîne vide. On rend alors un chemin — inutilisable tel quel hors du
 * site, mais honnête. Fabriquer une origine de secours donnerait une adresse
 * qui a la FORME d'un lien sans en être un (L-026).
 */
export function lienPageClient(origine: string, jeton: string, nomDeLien: string | null): string {
  return origine + cheminPageClient(jeton, nomDeLien);
}

/**
 * L'ADRESSE DE L'APERÇU QUE L'ÉDITEUR ENCADRE (26/09/2026) — la même page, sans vue
 * comptée ni geste d'écriture (`app/p/[token]/apercu/page.tsx`).
 *
 * ⚠️ TOUJOURS SOUS `/p/`, JAMAIS AU NOM DU VENDEUR. Ce n'est pas une adresse qu'on envoie :
 * personne ne la voit, et c'est sous `/p/<jeton>/apercu` seulement que `next.config.ts`
 * autorise le cadrage par DropLink. Le nom ne changerait rien à la page — il n'y est vérifié
 * que pour refuser un nom étranger.
 *
 * Le jeton est ENCODÉ : un jeton ne contient que des alphanumériques, mais une valeur qui
 * porterait un `/` ne doit pas pouvoir sortir de son segment.
 */
export function cheminApercuPageClient(jeton: string): string {
  return `/p/${encodeURIComponent(jeton)}/apercu`;
}
