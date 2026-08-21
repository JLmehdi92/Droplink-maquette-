"use client";

import { useEffect } from "react";

/**
 * LE SECOND — ET DERNIER — ÎLOT CLIENT DE LA PAGE PUBLIQUE.
 *
 * Il ne rend RIEN. Son seul travail est de dire au serveur que la page a été
 * VUE, et non simplement chargée : ce composant est monté après le premier
 * rendu, ce qu'un aperçu de messagerie ne fait jamais — WhatsApp, Snap et
 * Discord chargent le HTML des liens qu'on leur colle, ils n'exécutent pas React.
 *
 * `keepalive` parce qu'un client qui regarde ses photos referme souvent l'onglet
 * dans la foulée : sans lui, le navigateur annule la requête en cours au
 * déchargement et la vue est perdue.
 *
 * AUCUN ÉCHEC N'EST REMONTÉ À L'ÉCRAN. Le comptage est notre mesure, pas le
 * produit du client : lui montrer qu'elle a échoué serait lui parler de nous.
 */
export function BaliseVue({ jeton }: { readonly jeton: string }) {
  useEffect(() => {
    // AUCUN `AbortController` ICI, et c'est délibéré : annuler au démontage
    // contredirait `keepalive`, dont tout l'intérêt est de survivre à la
    // fermeture de l'onglet. Un double envoi n'a aucune conséquence — la
    // déduplication est une contrainte d'unicité en base, pas un compte tenu
    // ici.
    void fetch("/p/" + encodeURIComponent(jeton) + "/vue", {
      method: "POST",
      keepalive: true,
      // Aucun corps : le jeton est déjà dans l'URL, et un corps vide évite le
      // prévol CORS qu'un `content-type` non simple déclencherait.
    }).catch(() => {
      // Jamais de `catch` vide : il n'y a rien à faire d'un échec ici, et c'est
      // précisément ce que dit ce commentaire. La perte est bornée par
      // l'événement serveur émis au rendu.
    });
  }, [jeton]);

  return null;
}
