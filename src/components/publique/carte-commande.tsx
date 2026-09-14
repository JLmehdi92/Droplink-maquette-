import { CalendarDays, Check, Clock, Truck } from "lucide-react";
import { CARTE } from "@/components/publique/carte-client";
import type { CommandePublique } from "@/lib/page-publique/lecture";
import type { AccentResolu } from "@/lib/design/contraste";

/**
 * « VOTRE COMMANDE » — la carte d'état du kit `client_link`.
 *
 * Elle répond, dans l'ordre, aux trois questions qu'on se pose en ouvrant le
 * lien : de quelle commande il s'agit (la référence), quand elle arrive (la
 * date estimée), où elle en est (la frise, puis le bandeau qui le dit en une
 * phrase).
 *
 * ⚠️ LA FRISE GARDE SES QUATRE ÉTAPES À NOUS, PAS CELLES DU KIT. Le kit écrit
 * « Commandée · En transit · En livraison · Livrée » ; la décision 4 fixe
 * préparation, expédié, en transit, livré — et « En livraison » est une
 * granularité que le brief range dans le DÉTAIL du suivi, pas dans la frise.
 *
 * ⚠️ UNE DATE N'EST POSÉE SOUS UNE ÉTAPE QUE SI LA BASE LA CONNAÎT. Création de
 * la commande sous « Préparation », premier mouvement du transporteur sous
 * « Expédié », dernier mouvement sous « Livré ». « En transit » n'a pas de date
 * propre en base : elle n'en reçoit pas, plutôt qu'une date devinée.
 *
 * ⚠️ AUCUNE COULEUR DU KIT N'EST RECOPIÉE. Le kit est dessiné pour l'accent par
 * défaut ; chaque couleur vient ici de `resoudreAccent()`, qui garantit 4,5:1
 * au texte et 3:1 à l'interface quel que soit l'accent — un jaune vif compris.
 */

const ETAPES = ["preparation", "expedie", "en_transit", "livre"] as const;
type Etape = (typeof ETAPES)[number];

export interface LibellesCommande {
  readonly titre: string;
  readonly sousTitre: string;
  readonly dateEstimee: string;
  readonly etapes: Readonly<Record<Etape, string>>;
  readonly enCours: string;
  readonly enAttente: string;
}

export function CarteCommande({
  reference,
  statut,
  estimation,
  dates,
  bandeau,
  libelles,
  accent,
}: {
  /** « #A1B2C3 », ou `null` tant que la migration 153 n'est pas appliquée. */
  readonly reference: string | null;
  readonly statut: CommandePublique["statut"];
  /** La date d'arrivée déjà formatée, ou `null` — le bloc est alors omis. */
  readonly estimation: string | null;
  /** Pour chaque étape, sa date et son heure formatées, quand la base les connaît. */
  readonly dates: Readonly<Record<Etape, { readonly jour: string; readonly heure: string } | null>>;
  readonly bandeau: {
    readonly titre: string;
    readonly texte: string;
    /** Au-delà de dix jours sans mouvement, le bandeau prend la famille ambrée. */
    readonly silencieux: boolean;
  };
  readonly libelles: LibellesCommande;
  readonly accent: AccentResolu;
}) {
  const courante = ETAPES.indexOf(statut);

  return (
    <section className={CARTE}>
      <div className="flex flex-wrap items-start gap-5 lg:flex-nowrap">
        {/* 16 PX SUR LE BLOC, ET LES DEUX LIBELLÉS RESTENT EN LIGNE : c'est le
            montage du kit. Un libellé en ligne prend la hauteur de ligne de son
            PARENT — 16 px en interligne normal —, pas la sienne ; posés en bloc,
            ils rendaient chacun 2 px de moins et la frise remontait de 5. */}
        <div className="min-w-0 text-[16px]">
          {/* LA PAGE GARDE TOUJOURS UN TITRE DE NIVEAU 1. C'est la référence
              quand la base la rend ; tant que la migration 153 n'est pas
              appliquée, c'est « Votre commande » qui le devient. */}
          {reference !== null ? (
            <>
              <span className="text-[15px] text-ds-texte-corps">{libelles.titre}</span>
              <h1 className="mt-1 mb-1.5 text-[30px] leading-[33px] font-extrabold tracking-[-0.045em] text-ds-texte-titre">
                {reference}
              </h1>
            </>
          ) : (
            <h1 className="mb-1.5 text-[15px] font-normal text-ds-texte-corps">{libelles.titre}</h1>
          )}
          <span className="text-[13px] text-ds-texte-sourdine">{libelles.sousTitre}</span>
        </div>
        <div className="hidden flex-1 lg:block" />
        {estimation !== null ? (
          <div className="flex shrink-0 items-center gap-3">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-ds-icon-tile"
              style={{ backgroundColor: accent.teinte, color: accent.interface }}
              aria-hidden="true"
            >
              <CalendarDays size={20} strokeWidth={1.9} />
            </span>
            <span className="flex flex-col gap-[3px]">
              <span className="text-[12px] text-ds-texte-sourdine">{libelles.dateEstimee}</span>
              <span className="text-[17px] font-bold whitespace-nowrap text-ds-texte-fort">
                {estimation}
              </span>
            </span>
          </div>
        ) : null}
      </div>

      <ol className="mt-7 mb-[22px] flex px-1 pt-2" aria-label={libelles.etapes[statut]}>
        {ETAPES.map((etape, rang) => {
          /* « Livré » est la dernière étape : atteinte, elle est FAITE, pas
             « en cours ». */
          const faite = rang < courante || (etape === "livre" && rang === courante);
          const actuelle = rang === courante && !faite;
          const date = faite ? dates[etape] : null;

          return (
            <li
              key={etape}
              aria-current={rang === courante ? "step" : undefined}
              className="relative flex min-w-0 flex-1 flex-col items-center"
            >
              {rang > 0 ? (
                <span
                  aria-hidden="true"
                  className="absolute top-3.5 right-1/2 h-0.5 w-full"
                  style={{
                    backgroundColor:
                      faite || actuelle ? accent.interface : "var(--color-ds-filet-appuye)",
                  }}
                />
              ) : null}
              <span
                aria-hidden="true"
                className="relative z-[1] flex h-[30px] w-[30px] items-center justify-center rounded-full"
                style={
                  faite
                    ? { backgroundColor: accent.remplissage, color: accent.surRemplissage }
                    : {
                        backgroundColor: "var(--color-ds-surface-carte)",
                        border:
                          "2px solid " +
                          (actuelle ? accent.interface : "var(--color-ds-filet-appuye)"),
                      }
                }
              >
                {faite ? (
                  <Check size={14} strokeWidth={3.2} />
                ) : actuelle ? (
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: accent.interface }}
                  />
                ) : null}
              </span>
              <span
                className="mt-3 text-center text-[14px] font-bold break-words"
                style={{
                  color: actuelle
                    ? accent.texte
                    : faite
                      ? "var(--color-ds-texte-fort)"
                      : "var(--color-ds-texte-sourdine)",
                }}
              >
                {libelles.etapes[etape]}
              </span>
              {date !== null ? (
                <span className="mt-[5px] text-center text-[12px] leading-[1.45] text-ds-texte-sourdine">
                  {date.jour}
                  <br />
                  {date.heure}
                </span>
              ) : null}
              {actuelle ? (
                <span
                  className="mt-1.5 inline-flex items-center gap-1.5 rounded-ds-pill px-[11px] py-[5px] text-[11.5px] font-bold tracking-[-0.02em] lg:text-[11px]"
                  style={{ backgroundColor: accent.doux, color: accent.surDoux }}
                >
                  {libelles.enCours}
                </span>
              ) : null}
              {!faite && !actuelle ? (
                <span className="mt-[7px] text-center text-[12px] text-ds-texte-tenu">
                  {libelles.enAttente}
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>

      {/*
        LE BANDEAU DIT L'ÉTAT EN UNE PHRASE, ET LE SILENCE LE CHANGE DE NATURE.
        Au-delà de dix jours sans mouvement, il est NOMMÉ et passe en ambre —
        et la date estimée a déjà disparu au-dessus : une estimation qu'on sait
        dépassée est pire qu'une absence d'estimation.
      */}
      {bandeau.silencieux ? (
        <div className="flex gap-3.5 rounded-ds-card border border-ds-alerte bg-ds-alerte-fond p-[18px]">
          <Clock size={22} strokeWidth={1.9} className="shrink-0 text-ds-alerte" aria-hidden="true" />
          <span className="flex flex-col gap-1">
            <span className="text-[15px] font-bold text-ds-alerte">{bandeau.titre}</span>
            <span className="text-[13px] text-ds-alerte">{bandeau.texte}</span>
          </span>
        </div>
      ) : (
        <div
          className="flex gap-3.5 rounded-ds-card p-[18px]"
          style={{ backgroundColor: accent.teinte }}
        >
          <Truck
            size={22}
            strokeWidth={1.9}
            className="shrink-0"
            style={{ color: accent.interface }}
            aria-hidden="true"
          />
          <span className="flex flex-col gap-1">
            <span className="text-[15px] font-bold" style={{ color: accent.surTeinte }}>
              {bandeau.titre}
            </span>
            {/* ⚠️ PAS LE GRIS DE CORPS DU KIT : `#6B6F8C` rend 5,0:1 sur blanc mais
                4,3:1 sur une teinte à 10 % — sous le seuil pour un texte de
                13 px, et d'autant plus bas que l'accent du vendeur est sombre.
                Un cran plus foncé de la même rampe tient 6,7:1 au pire cas. */}
            <span className="text-[13px] text-ds-ink-600">{bandeau.texte}</span>
          </span>
        </div>
      )}
    </section>
  );
}
