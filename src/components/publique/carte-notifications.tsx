"use client";

import { useId, useState } from "react";
import { Bell } from "lucide-react";
import { CARTE } from "@/components/publique/carte-client";
import type { AccentResolu } from "@/lib/design/contraste";

/**
 * LE CLIENT DEMANDE À ÊTRE PRÉVENU PAR E-MAIL — planche `NotificationsCard`.
 *
 * Décision de Wassim du 23/09/2026, qui LÈVE la décision 3 du brief (« la page
 * publique reste sans formulaire ») : le client tape son adresse ici, sans créer
 * de compte, puis la confirme depuis sa boîte. Rien ne part avant sa confirmation.
 *
 * Le bouton est à la couleur DU VENDEUR (`remplissage`), jamais au dégradé
 * DropLink : cette page porte la marque du vendeur (règle n° 3).
 *
 * L'écran n'affirme QUE ce que le serveur a répondu (contrainte n° 8) : « un
 * e-mail vous attend » n'apparaît que sur un 202, jamais en optimiste.
 */

type Etat = "repos" | "envoi" | "envoye" | "invalide" | "trop" | "erreur";

export function CarteNotifications({
  jeton,
  accent,
  libelles,
}: {
  readonly jeton: string;
  readonly accent: AccentResolu;
  readonly libelles: {
    readonly titre: string;
    readonly texte: string;
    readonly champ: string;
    readonly bouton: string;
    readonly envoye: string;
    readonly invalide: string;
    readonly trop: string;
    readonly erreur: string;
  };
}) {
  const [etat, setEtat] = useState<Etat>("repos");
  const [adresse, setAdresse] = useState("");
  const idChamp = useId();
  const idMessage = useId();

  const envoyer = async (): Promise<void> => {
    setEtat("envoi");
    try {
      const reponse = await fetch("/p/" + encodeURIComponent(jeton) + "/notification", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: adresse }),
      });
      setEtat(
        reponse.status === 202
          ? "envoye"
          : reponse.status === 400
            ? "invalide"
            : reponse.status === 429
              ? "trop"
              : "erreur",
      );
    } catch {
      setEtat("erreur");
    }
  };

  const message =
    etat === "invalide" ? libelles.invalide : etat === "trop" ? libelles.trop : etat === "erreur" ? libelles.erreur : null;

  return (
    <section className={CARTE}>
      <div className="flex gap-3.5">
        <span
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: accent.teinte, color: accent.interface }}
        >
          <Bell size={20} strokeWidth={1.9} />
        </span>
        <span className="flex flex-col gap-[5px]">
          <span className="text-[15px] font-bold text-ds-texte-fort">{libelles.titre}</span>
          <span className="text-[13px] leading-[1.55] text-ds-texte-corps">{libelles.texte}</span>
        </span>
      </div>

      {etat === "envoye" ? (
        <p role="status" className="mt-4 text-[13px] leading-[1.55] font-semibold text-ds-succes-encre">
          {libelles.envoye}
        </p>
      ) : (
        <form
          className="mt-4 flex flex-wrap gap-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            void envoyer();
          }}
        >
          <label htmlFor={idChamp} className="sr-only">
            {libelles.champ}
          </label>
          <input
            id={idChamp}
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            maxLength={254}
            value={adresse}
            onChange={(e) => setAdresse(e.target.value)}
            placeholder={libelles.champ}
            aria-invalid={etat === "invalide"}
            aria-describedby={message === null ? undefined : idMessage}
            className="h-11 min-w-0 flex-[1_1_200px] rounded-full border border-ds-filet bg-ds-surface-carte px-4 text-[14px] text-ds-texte-fort shadow-ds-xs outline-none placeholder:text-ds-texte-corps focus:border-ds-accent"
          />
          <button
            type="submit"
            disabled={etat === "envoi"}
            className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-ds-card border border-transparent px-[22px] text-[14px] font-semibold tracking-[-0.02em] shadow-ds-sm transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-70"
            style={{ backgroundColor: accent.remplissage, color: accent.surRemplissage }}
          >
            {libelles.bouton}
          </button>
          {message === null ? null : (
            <p id={idMessage} role="alert" className="w-full text-[13px] text-ds-erreur-encre">
              {message}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
