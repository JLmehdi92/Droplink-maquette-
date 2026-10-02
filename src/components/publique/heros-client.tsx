import { Truck } from "lucide-react";
import { liensDuVendeur } from "@/components/publique/reseaux-vendeur";
import type { Boutique, CommandePublique } from "@/lib/page-publique/lecture";

const ETAPES = ["preparation", "expedie", "en_transit", "livre"] as const;
type Etape = (typeof ETAPES)[number];

/**
 * LE HAUT DE LA PAGE CLIENT (maquette v3, `.cv-heros`) : un aplat à la couleur du
 * VENDEUR — jamais le dégradé DropLink, jamais de flou (règles 2 et 3) —, l'état du
 * colis en titre, la date estimée, et le trajet en quatre arrêts.
 *
 * ⚠️ LE TRAJET NE NOMME AUCUN LIEU, contrairement à la maquette (« Lyon · 29 sept. ») :
 * ce serait interpréter les passages du transporteur, ce que l'arbitrage du § 5 refuse.
 * Chaque arrêt porte sa DATE quand on la connaît, rien sinon ; le dernier, tant qu'il
 * n'est pas atteint, porte le destinataire — c'est la seule « destination » que la page
 * connaisse, et elle n'est pas une adresse.
 *
 * Le trajet est une IMAGE pour un lecteur d'écran (`role="img"`), avec une étiquette qui
 * dit les quatre étapes : ses arrêts dessinés ne seraient qu'une liste de points.
 */
export function HerosClient({
  boutique,
  libelleSite,
  reference,
  client,
  statut,
  titre,
  sousTitre,
  estimation,
  dates,
  libelles,
}: {
  readonly boutique: Boutique;
  readonly libelleSite: string;
  readonly reference: string | null;
  readonly client: string | null;
  readonly statut: CommandePublique["statut"];
  /** L'état du colis, en phrase (« Votre colis est en transit »), ou le silence anormal. */
  readonly titre: string;
  /** Sous le titre quand aucune date n'est estimée : le dernier mouvement, ou la préparation. */
  readonly sousTitre: string;
  readonly estimation: string | null;
  readonly dates: Readonly<Record<Etape, string | null>>;
  readonly libelles: {
    readonly commandeDe: string;
    readonly votreCommande: string;
    readonly pourClient: string | null;
    readonly dateEstimee: string;
    readonly etapes: Readonly<Record<Etape, string>>;
    readonly enCours: string;
    readonly enAttente: string;
  };
}) {
  const courante = ETAPES.indexOf(statut);
  const liens = liensDuVendeur(boutique, libelleSite);
  const position = (rang: number): string => (rang * 100) / (ETAPES.length - 1) + "%";
  const etiquette =
    titre +
    ". " +
    ETAPES.map((etape, rang) => {
      const etat = rang < courante || (rang === courante && etape === "livre") ? dates[etape] : rang === courante ? libelles.enCours : libelles.enAttente;
      return libelles.etapes[etape] + (etat === null ? "" : " : " + etat);
    }).join(" · ");

  return (
    <header className="cv-heros">
      <div className="cv-cadre">
        <div className="cv-heros__barre">
          <div className="cv-heros__marque">
            {boutique.logo === null ? null : (
              /* eslint-disable-next-line @next/next/no-img-element -- URL signée à
                 expiration : l'optimiseur la garderait en cache au-delà de sa validité. */
              <img className="cv-heros__logo" src={boutique.logo} alt="" width={40} height={40} />
            )}
            {boutique.nom === null ? null : (
              <p className="cv-boutique">
                <small>{libelles.commandeDe}</small>
                <b>{boutique.nom}</b>
              </p>
            )}
          </div>
          {liens.length === 0 ? null : (
            <ul className="cv-heros__reseaux">
              {liens.map((lien) => (
                <li key={lien.clef}>
                  <a href={lien.href} target="_blank" rel="noopener noreferrer" className="cv-rond-verre" aria-label={lien.libelle}>
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="cl-marque-reseau">
                      <path d={lien.trace} />
                    </svg>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="cv-heros__corps">
          <div className="cv-heros__texte">
            <p className="cv-ref cv-entree">
              {libelles.votreCommande}
              {reference === null ? null : (
                <>
                  {" "}
                  <b>{reference.replace(/^#/, "")}</b>
                </>
              )}
              {libelles.pourClient === null ? null : " · " + libelles.pourClient}
            </p>
            {/* LA PAGE GARDE UN TITRE DE NIVEAU 1 : l'état du colis, la question que le
                client vient poser. */}
            <h1 className="cv-entree">{titre}</h1>
            {estimation === null ? (
              <p className="cv-sous cv-entree">{sousTitre}</p>
            ) : (
              <p className="cv-date cv-entree">
                <small>{libelles.dateEstimee}</small>
                <b>{estimation}</b>
              </p>
            )}
          </div>

          <div className="cv-trajet cv-entree" role="img" aria-label={etiquette}>
            <div className="cv-trajet__ligne" aria-hidden="true">
              <i className="cv-trajet__fait" style={{ width: position(courante) }} />
              {ETAPES.map((etape, rang) =>
                rang === courante ? (
                  <span key={etape} className="cv-camion" style={{ "--x": position(rang) } as React.CSSProperties}>
                    <Truck className="ic" />
                  </span>
                ) : (
                  <span
                    key={etape}
                    className={"cv-arret" + (rang < courante ? " cv-arret--fait" : "")}
                    style={{ "--x": position(rang) } as React.CSSProperties}
                  />
                ),
              )}
            </div>
            <ol className="cv-trajet__etapes" aria-hidden="true">
              {ETAPES.map((etape, rang) => {
                const date = rang <= courante ? dates[etape] : etape === "livre" ? client : null;
                return (
                  <li key={etape} className={rang === courante ? "est-actuel" : undefined}>
                    <b>{libelles.etapes[etape]}</b>
                    {date === null ? null : <small>{date}</small>}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>
    </header>
  );
}
