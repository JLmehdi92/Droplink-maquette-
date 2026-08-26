# Pourquoi cette route n'a PAS de `loading.tsx`

Un `loading.tsx` a été posé ici le 26/08/2026, puis retiré le lendemain. La
sonde de fumée l'a attrapé — trois contrôles rouges d'un coup :

```
ECHEC la suspension coupe la page (statut 200)
ECHEC le plafond public mord (statut 200 au-dela de 7)
ECHEC un jeton inconnu rend 404
```

## Ce qui se passe

Un `loading.tsx` fait **streamer** la réponse : Next envoie immédiatement une
coquille — donc un **200** — puis rend le contenu au fil de l'eau. Quand
`notFound()` s'exécute ensuite, le code de statut est déjà parti.

Or sur cette page, le statut n'est pas cosmétique. Trois propriétés du produit
reposent dessus :

- **la coupure de suspension** doit rendre 404, c'est ce qui fonde notre statut
  d'hébergeur ;
- **le plafond de débit** doit rendre 404, et pas se distinguer d'autre chose ;
- **jeton inconnu, jeton révoqué et compte suspendu doivent produire LA MÊME
  réponse** — un seul chemin de sortie, sans oracle.

Avec un streaming, les trois deviennent 200. La page finit par afficher
« introuvable », mais un client HTTP — un aspirateur, un moteur, un script —
lit 200 et conclut que la page existe.

## Ce qu'on perd, et pourquoi ce n'est pas grave

Un `loading.tsx` sert à rendre une navigation CLIENT instantanée. Cette page
n'est jamais atteinte par une navigation client : on y arrive par un lien collé
dans un message privé, c'est-à-dire par un chargement complet. Il n'y a pas
d'écran précédent à ne pas laisser figé.

Les `loading.tsx` de l'espace vendeur et de l'admin restent, eux : on y navigue
au clic, et aucun de leurs statuts ne porte d'information de sécurité.
