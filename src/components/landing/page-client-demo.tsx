import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { CalendarDays, Check, Images, Package, Truck } from "lucide-react";
import { IMAGES_DEMO } from "./images-demo";

/**
 * LA PAGE CLIENT DE DÉMONSTRATION des téléphones de la landing (maquette,
 * `page-client.html`). Ses libellés sont ceux de la VRAIE page client
 * (`page-publique.*`) : la landing montre le produit, elle ne le réécrit pas.
 * Les données (Atelier Nord, Léa M., 6A4D21) sont une démonstration, jamais
 * lues en base. Ses couleurs passent par `--pc-*`, que la démonstration du
 * nuancier repeint avec l'algorithme du produit (`resoudreAccent`).
 *
 * Décorative : chaque téléphone qui la porte est `aria-hidden`.
 */
export async function PageClientDemo({
  datesEtapes,
}: {
  /** Les dates des quatre étapes, déjà formatées dans la langue de la page. */
  readonly datesEtapes: readonly [string, string, string, string];
}) {
  const p = await getTranslations("page-publique");
  const a = await getTranslations("accueil");
  const ETAPES = [
    ["preparation", "fait"],
    ["expedie", "fait"],
    ["en_transit", "actuel"],
    ["livre", ""],
  ] as const;
  return (
    <div className="pc" data-page-client>
      <header className="pc__boutique">
        <small>{p("commandeDe")}</small>
        <b data-pc-nom>{a("scene.boutique")}</b>
        <span>{a("scene.description2")}</span>
      </header>
      <section className="pc__commande">
        <small>
          <span>{p("titre")}</span> <em className="pc__pour" data-pc-pour>{a("scene.pourCourt")}</em>
        </small>
        <b>6A4D21</b>
        <span>{p("commande.sousTitre")}</span>
        <div className="pc__bandeau pc__prep" data-pc-prep>
          <Package aria-hidden="true" className="ic" />
          <p>
            <strong>{p("bandeau.preparation")}</strong>
            <small>{p("bandeau.preparationTexte")}</small>
          </p>
        </div>
        <div className="pc__suivi" data-pc-suivi>
          <div className="pc__date">
            <i className="pc__tuile">
              <CalendarDays aria-hidden="true" className="ic" />
            </i>
            <p>
              <small>{p("commande.dateEstimee")}</small>
              <strong>{a("scene.dates")}</strong>
            </p>
          </div>
          <ol className="pc__frise" data-pc-frise style={{ "--avance": 2 } as React.CSSProperties}>
            {ETAPES.map(([cle, etat], i) => (
              <li key={cle} className={etat}>
                <i>
                  <Check aria-hidden="true" className="ic" />
                </i>
                <b>{p(`frise.${cle}`)}</b>
                <small className="pc__quand">{datesEtapes[i]}</small>
                <small className="pc__pastille">{p("frise.enCours")}</small>
                <small className="pc__attente">{p("frise.enAttente")}</small>
              </li>
            ))}
          </ol>
          <div className="pc__bandeau">
            <Truck aria-hidden="true" className="ic" />
            <p>
              <strong>{p("bandeau.en_transit")}</strong>
              <small>{a("scene.mouvementAujourdhui")}</small>
            </p>
          </div>
        </div>
      </section>
      <section className="pc__photos">
        <h4>
          <span>{p("galerie.titre")}</span> <span data-pc-compte>(4)</span>
        </h4>
        <div className="pc__vide" data-pc-vide>
          <Images aria-hidden="true" className="ic" />
          <strong>{p("galerie.videTitre")}</strong>
          <small>{p("galerie.videTexte")}</small>
        </div>
        <div className="pc__grille" data-pc-grille>
          {IMAGES_DEMO.map((img, i) => (
            <figure key={i}>
              <Image src={img} alt="" width={90} height={90} sizes="90px" />
            </figure>
          ))}
        </div>
      </section>
      <section className="pc__qc">
        <h4>{p("qc.titre")}</h4>
        <p>{p("qc.texte")}</p>
        <div className="pc__qc-actions">
          <span>{p("qc.refuser")}</span>
          <span className="pc__plein">{p("qc.approuver")}</span>
        </div>
        <p className="pc__qc-ok">
          <i>
            <Check aria-hidden="true" className="ic" />
          </i>
          {p("qc.approuve")}
        </p>
      </section>
    </div>
  );
}
