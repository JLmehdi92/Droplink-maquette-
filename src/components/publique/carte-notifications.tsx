"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Bell } from "lucide-react";

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
  libelles,
}: {
  readonly jeton: string;
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

  /* L'ADRESSE EST JUGÉE ICI D'ABORD, comme la maquette (`novalidate` + la même expression) :
     la bulle native du navigateur parlait SA langue, pas celle de la page. Le serveur
     reste le juge (400 → le même message). */
  const envoyer = async (): Promise<void> => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(adresse.trim())) {
      setEtat("invalide");
      return;
    }
    setEtat("envoi");
    try {
      const reponse = await fetch("/p/" + encodeURIComponent(jeton) + "/notification", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: adresse.trim() }),
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

  // LA REFONTE (02/10/2026) : la carte `cv-carte` de la maquette v3, aux couleurs du
  // vendeur par les variables `--cl-*` de la page.
  // « Presque fini » ENTRE (maquette : `apparaitre`, 200 ms, 4 px) — après le 202 seulement.
  const succes = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (etat !== "envoye" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    succes.current?.animate(
      [
        { opacity: 0, transform: "translateY(4px)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 200, easing: "cubic-bezier(.23,1,.32,1)" },
    );
  }, [etat]);

  return (
    <section className="cv-carte cv-entree" aria-labelledby={idChamp + "-titre"}>
      <h2 className="cv-titre" id={idChamp + "-titre"}>
        <Bell aria-hidden="true" className="ic" />
        {libelles.titre}
      </h2>
      <p className="cv-texte">{libelles.texte}</p>

      {etat === "envoye" ? (
        <p role="status" className="cv-succes" ref={succes}>
          {libelles.envoye}
        </p>
      ) : (
        <form
          className="cv-notif"
          noValidate
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
            autoComplete="email"
            inputMode="email"
            maxLength={254}
            value={adresse}
            onChange={(e) => setAdresse(e.target.value)}
            placeholder={libelles.champ}
            aria-invalid={etat === "invalide"}
            aria-describedby={message === null ? undefined : idMessage}
          />
          <button type="submit" disabled={etat === "envoi"} className="cv-bouton cv-bouton--plein">
            {libelles.bouton}
          </button>
          {message === null ? null : (
            <p id={idMessage} role="alert" className="cv-erreur">
              {message}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
