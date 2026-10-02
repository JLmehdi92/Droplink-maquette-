"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { CircleAlert } from "lucide-react";

/**
 * LA FRONTIÈRE D'ERREUR DE LA PAGE CLIENT.
 *
 * ⚠️ ELLE N'EXISTAIT PAS, et c'est la surface où son absence coûtait le plus.
 * `not-found.tsx` traite le lien mort avec soin — icône, texte, aucune
 * divulgation — mais une erreur de RENDU tombait sur la page générique de
 * Next : Times New Roman, anglais, aucun rapport avec ce que le destinataire
 * vient de recevoir en message privé. Le lecteur n'est pas le vendeur, c'est
 * son client : il ne peut ni comprendre ce qu'il voit, ni le signaler à
 * quiconque. L'asymétrie avec le 404 était un oubli, pas une décision.
 *
 * ON DIT CE QUI EST VRAI ET RIEN D'AUTRE. Cette frontière n'attrape que des
 * échecs de rendu : le jeton n'est pas en cause, et le lien reste valable.
 * L'affirmer n'est pas un pari — c'est la seule chose que le visiteur se
 * demande à cet instant, et c'est aussi la seule qu'on puisse tenir.
 *
 * AUCUNE RÉFÉRENCE D'INCIDENT ICI, contrairement à l'espace vendeur. Le `digest`
 * y sert parce que le vendeur a un interlocuteur ; le client d'un vendeur n'en
 * a aucun, et lui montrer un identifiant interne serait de la surface offerte
 * sans contrepartie.
 *
 * AUCUNE COULEUR D'ACCENT, pour la même raison que `not-found.tsx` : à cet
 * instant on ne sait pas de quelle boutique il s'agit, et si on le savait,
 * l'afficher serait déjà une fuite.
 */
export default function ErreurPagePublique({ reset }: { readonly reset: () => void }) {
  const t = useTranslations("page-publique.erreur");
  const [enCours, demarrer] = useTransition();
  // Refonte du 02/10/2026 (`erreur-client.html`). UN POINT D'ATTENTION, PAS UN
  // MAILLON ROMPU : le lien n'est pas en cause, et le visiteur ne doit pas croire
  // qu'il faut en redemander un. Aucune marque DropLink.
  return (
    <div className="etat-p page-erreur-client">
      <main id="contenu" className="errc">
        <span className="errc__icone" aria-hidden="true">
          <CircleAlert className="ic" />
        </span>
        <h1>{t("titre")}</h1>
        <p>{t("texte")}</p>
        <button type="button" className="errc__bouton" aria-busy={enCours} disabled={enCours} onClick={() => demarrer(reset)}>
          <span>{t("reessayer")}</span>
        </button>
      </main>
    </div>
  );
}
