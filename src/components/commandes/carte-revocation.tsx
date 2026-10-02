"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, Link as LienIcone, RefreshCw } from "lucide-react";
import { revoquerLienPublic } from "@/lib/commandes/actions";
import { BoutonAction } from "@/components/bouton-action";
import { BoutonCopierFiche } from "./copier-fiche";

/**
 * LA CARTE « LIEN CLIENT » (maquette, `commande.html` : `.ed-carte--lien`).
 *
 * LE LIEN EN CLAIR, copiable : un vendeur qui veut VÉRIFIER quel lien il s'apprête à
 * envoyer n'a pas à le coller ailleurs pour le voir — après une révocation, c'est la
 * question qu'on se pose.
 *
 * LA RÉVOCATION VIT DANS UN `<details>` FERMÉ : une action irréversible ne se rencontre
 * pas en passant. Elle exige la case « je comprends », appelle le serveur, et
 * l'interface n'affirme rien avant sa réponse : en cas d'échec, l'ancien lien reste
 * affiché, la case reste cochée, et l'échec est dit (« l'ancien lien reste actif »).
 * Réussie, elle referme le volet et le NOUVEAU lien apparaît, copiable aussitôt.
 *
 * ⚠️ LE BOUTON N'EST PAS DANS UN `<form action={…}>` : il attend une promesse lancée à
 * la main, donc `useFormStatus` y rendrait toujours `false` ; il passe son propre
 * `enAttente`. Ni « réussi » ni « échoué » ne s'y annoncent : la carte entière change,
 * ou le paragraphe `role="alert"` dit ce qui reste vrai.
 */
export function CarteRevocation({
  orderId,
  jeton,
  lienPublic,
  onNouveauJeton,
}: {
  readonly orderId: string;
  readonly jeton: string;
  readonly lienPublic: string;
  readonly onNouveauJeton: (jeton: string) => void;
}) {
  const t = useTranslations("actions");
  const te = useTranslations("editeur");
  const volet = useRef<HTMLDetailsElement>(null);
  const titreVolet = useRef<HTMLElement>(null);
  const [reussi, setReussi] = useState(false);

  const [compris, setCompris] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [echec, setEchec] = useState<string | null>(null);

  const revoquer = useCallback(async (): Promise<void> => {
    setEnCours(true);
    setEchec(null);
    setReussi(false);
    const resultat = await revoquerLienPublic(orderId, jeton).catch(() => null);
    setEnCours(false);

    if (resultat === null || resultat.statut !== "ok") {
      setEchec(t("revocation.echec"));
      return;
    }

    onNouveauJeton(resultat.nouveauJeton);
    setCompris(false);
    setReussi(true);
    // Le volet se replie sur le bouton qui avait le focus : sans ce renvoi, le focus
    // tomberait sur `body`, et le clavier repartirait du haut de la page.
    if (volet.current !== null) volet.current.open = false;
    titreVolet.current?.focus();
  }, [orderId, jeton, onNouveauJeton, t]);

  // L'adresse se lit sans son protocole, et sa DERNIÈRE partie — le jeton — en gras :
  // c'est elle qui change à la révocation.
  const lisible = lienPublic.replace(/^https?:\/\//, "");
  const coupure = lisible.lastIndexOf("/") + 1;

  return (
    <section className="bloc ed-carte ed-carte--lien" aria-labelledby="ed-lien">
      <header className="ed-carte__tete">
        <h2 id="ed-lien">{te("lienClient")}</h2>
      </header>
      <div className="ed-lien-zone">
        <div className="ed-url">
          <LienIcone aria-hidden="true" className="ic" />
          <span>
            {lisible.slice(0, coupure)}
            <b>{lisible.slice(coupure)}</b>
          </span>
          <BoutonCopierFiche lien={lienPublic} className="ed-url__copier" />
        </div>
        <p className="ed-aide">{te("lienClientAide")}</p>
        {/* Le nouveau lien se DIT : la carte change sous les yeux, pas sous l'oreille. */}
        <p className="sr" role="status">
          {reussi ? t("revocation.reussi") : ""}
        </p>
        <details ref={volet} className="ed-revoquer">
          <summary ref={titreVolet}>
            <RefreshCw aria-hidden="true" className="ic" />
            {t("revocation.titre")}
            <ChevronDown aria-hidden="true" className="ic ed-revoquer__chevron" />
          </summary>
          <div className="ed-revoquer__corps">
            <p>{t("revocation.explication")}</p>
            <label className="ed-coche">
              <input type="checkbox" checked={compris} onChange={(e) => setCompris(e.target.checked)} />
              <span>{t("revocation.jeComprends")}</span>
            </label>
            {echec === null ? null : (
              <p role="alert" className="ed-revoquer__echec">
                {echec}
              </p>
            )}
            <BoutonAction
              type="button"
              enAttente={enCours}
              disabled={!compris}
              onClick={() => void revoquer()}
              libelles={{
                repos: t("revocation.confirmer"),
                enCours: t("revocation.enCours"),
                reussi: t("revocation.confirmer"),
                echoue: t("revocation.confirmer"),
              }}
              className="ed-danger"
            />
          </div>
        </details>
      </div>
    </section>
  );
}
