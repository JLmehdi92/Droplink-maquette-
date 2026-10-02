/**
 * PETITES BRIQUES DES LISTES D'ADMINISTRATION (maquette, `outils/admin.mjs`).
 */

/**
 * L'AVATAR D'UN COMPTE : ses initiales sur une teinte DÉRIVÉE de son adresse.
 * Décoratif (`aria-hidden`) : l'adresse est écrite juste à côté. La teinte ne
 * dit rien du compte, elle aide seulement l'œil à retrouver une ligne.
 */
export function AvatarCompte({ email, nom }: { readonly email: string; readonly nom: string | null }) {
  const teinte = [...email].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  const source = (nom ?? email.split("@")[0] ?? "")
    .replace(/[^\p{L} ]/gu, " ")
    .trim()
    .split(/\s+/)
    .map((m) => m.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span className="adm-av" style={{ "--h": String(teinte) } as React.CSSProperties} aria-hidden="true">
      {source === "" ? "?" : source}
    </span>
  );
}

/**
 * LES COLIS DU MOIS CONTRE LE SEUIL D'ALERTE : le nombre, le seuil, et une barre
 * bornée à 100 %. Au-dessus du seuil, le nombre et la barre passent au rouge —
 * et le nombre reste écrit : « 342 / 300 » se vérifie, « au-dessus » se discute.
 */
export function ColisSeuil({
  valeur,
  seuil,
  info,
  k,
  depasse,
}: {
  readonly valeur: string;
  readonly seuil: string;
  readonly info: string;
  readonly k: number;
  readonly depasse: boolean;
}) {
  return (
    <span className={"adm-colis" + (depasse ? " est-depasse" : "")} data-info={info} title={info}>
      <b>{valeur}</b>
      <small>/ {seuil}</small>
      <i aria-hidden="true" style={{ "--k": Math.min(1, Math.max(0, k)).toFixed(3) } as React.CSSProperties} />
    </span>
  );
}
