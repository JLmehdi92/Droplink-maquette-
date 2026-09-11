/**
 * LE FOND DE L'ESPACE VENDEUR.
 *
 * ⚠️ IL REMPLACE LE CADRE EXTÉRIEUR, IL NE S'Y AJOUTE PAS. L'ancien canevas
 * posait une carte blanche arrondie sur un aplat lavande `#c5cbfb` ; le design
 * system supprime ce cadre — c'est l'un des six changements déclarés dans
 * `CLAUDE.md`. Le dégradé prend sa place : la page occupe toute la largeur, et
 * la teinte vient du fond plutôt que d'une marge colorée.
 *
 * Composant SERVEUR, `fixed` et `aria-hidden` : un décor qui ne défile pas,
 * n'annonce rien, et n'expédie pas une ligne de JavaScript. AUCUNE animation —
 * c'est l'écran qu'un fournisseur à 200 commandes par semaine laisse ouvert
 * toute la journée.
 *
 * Valeurs relevées sur `AppShell.jsx` du kit `seller_app`, pas estimées.
 */
export function FondApplication() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 -z-10 hidden overflow-hidden md:block"
      style={{ background: "linear-gradient(135deg,#F7F5FE 0%,#FBFAFE 45%,#F8F4FD 100%)" }}
    >
      <div
        className="absolute -top-[120px] -right-[160px] h-[640px] w-[640px] rotate-[28deg] rounded-[140px]"
        style={{ background: "linear-gradient(140deg,rgba(160,148,250,.10),rgba(255,255,255,0))" }}
      />
      <div
        className="absolute -bottom-[180px] -left-[140px] h-[560px] w-[560px] -rotate-[16deg] rounded-[130px]"
        style={{ background: "linear-gradient(140deg,rgba(190,150,240,.09),rgba(255,255,255,0))" }}
      />
    </div>
  );
}
