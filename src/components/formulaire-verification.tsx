"use client";

import { useActionState, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { verifierCode, type ResultatVerification } from "@/app/[locale]/verification/actions";
import { BoutonPrincipalDs } from "@/components/acces-champs";
import { secouer } from "@/components/acces/validation-locale";

const INITIAL: ResultatVerification = { statut: "inactif" };
const sansAbonnement = () => () => {};

/**
 * LE CODE À 6 CHIFFRES, EN SIX CASES (maquette `verification.html`, arbitrage du § 5).
 *
 * LES SIX CASES PORTENT `name="code"`, et l'action recolle leurs valeurs : le
 * formulaire marche ainsi sans JavaScript et avant l'hydratation (relecture du
 * 02/10/2026 — un champ caché rempli par React n'envoyait rien dans ces cas). La
 * première porte `one-time-code` : les téléphones y proposent le code au-dessus du
 * clavier, et le code collé ou proposé se répartit dans les six cases. Un chiffre
 * tapé avance d'une case, l'effacement d'une case vide efface et rejoint la précédente.
 *
 * AUCUN ENVOI AUTOMATIQUE AU SIXIÈME CHIFFRE : chaque envoi consomme le quota partagé
 * avec la connexion, et une faute de frappe le dépenserait sans qu'on l'ait voulu.
 * Les cases ne sont jamais préremplies par le serveur.
 */
export function FormulaireVerification({
  locale,
  suite,
}: {
  readonly locale: string;
  readonly suite: "mot-de-passe" | "admin" | null;
}) {
  const t = useTranslations("verification");
  const [resultat, action] = useActionState(verifierCode, INITIAL);
  const [chiffres, setChiffres] = useState<readonly string[]>(["", "", "", "", "", ""]);
  const cases = useRef<Array<HTMLInputElement | null>>([]);
  const zone = useRef<HTMLDivElement>(null);
  const router = useRouter();
  // Le refus de la saisie (moins de six chiffres) : il ne part pas au serveur, qui
  // consommerait un essai du quota partagé avec la connexion pour rien.
  const [incomplet, setIncomplet] = useState(false);
  // Le refus du serveur s'efface dès qu'on retape (maquette, `compte.js`).
  const [ecarte, setEcarte] = useState<ResultatVerification | null>(null);
  // Hydraté : le formulaire saura naviguer lui-même après les cases vertes.
  const hydrate = useSyncExternalStore(sansAbonnement, () => true, () => false);

  // Un nouveau refus du serveur vide les cases (ajustement au rendu, pas dans un effet).
  const [dernier, setDernier] = useState(resultat);
  if (dernier !== resultat) {
    setDernier(resultat);
    if (resultat.statut === "erreur") setChiffres(["", "", "", "", "", ""]);
  }

  useEffect(() => {
    if (resultat.statut === "erreur") {
      // Refusé (maquette, `compte.js`) : les cases tremblent, se sont vidées, et
      // le focus revient à la première.
      secouer(zone.current);
      cases.current[0]?.focus();
    }
    if (resultat.statut === "valide") {
      // Accepté PAR LE SERVEUR : les cases passent au vert, puis la suite (380 ms).
      const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const minuteur = window.setTimeout(() => router.replace(resultat.chemin), reduit ? 0 : 380);
      return () => window.clearTimeout(minuteur);
    }
  }, [resultat, router]);

  // Au premier affichage, le focus est dans la première case — à la souris seulement :
  // au téléphone, ouvrir le clavier d'office cacherait la moitié de l'écran.
  useEffect(() => {
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) cases.current[0]?.focus();
  }, []);

  /** Pose des chiffres à partir d'une case (frappe, collage ou proposition du téléphone). */
  const poser = (depuis: number, saisie: string): void => {
    const nouveaux = saisie.replace(/\D/g, "").slice(0, 6 - depuis).split("");
    if (nouveaux.length === 0) {
      setChiffres((c) => c.map((x, i) => (i === depuis ? "" : x)));
      return;
    }
    setIncomplet(false);
    setEcarte(resultat);
    setChiffres((c) => c.map((x, i) => (i >= depuis && i < depuis + nouveaux.length ? (nouveaux[i - depuis] ?? x) : x)));
    cases.current[Math.min(depuis + nouveaux.length, 5)]?.focus();
  };
  // Une table EXPLICITE et non `erreurs.${motif}` : la garde des chaînes mortes
  // doit pouvoir voir chaque clé appelée.
  const message = incomplet
    ? t("erreurs.invalide")
    : resultat.statut !== "erreur" || ecarte === resultat
      ? null
      : {
          code: t("erreurs.code"),
          invalide: t("erreurs.invalide"),
          trop: t("erreurs.trop"),
          indisponible: t("erreurs.indisponible"),
        }[resultat.motif];

  return (
    <form
      action={action}
      className="formulaire v4-carte"
      noValidate
      onSubmit={(e) => {
        if (chiffres.every((c) => c !== "")) {
          setIncomplet(false);
          return;
        }
        e.preventDefault();
        setIncomplet(true);
        secouer(zone.current);
        cases.current[chiffres.findIndex((c) => c === "")]?.focus();
      }}
    >
      <input type="hidden" name="locale" value={locale} />
      {hydrate ? <input type="hidden" name="js" value="1" /> : null}
      {suite === null ? null : <input type="hidden" name="suite" value={suite} />}
      <fieldset
        className={
          "code-2fa" + (message !== null ? " est-invalide" : "") + (resultat.statut === "valide" ? " est-valide" : "")
        }
      >
        <legend>{t("libelle")}</legend>
        <div className="code-2fa__cases" ref={zone}>
          {chiffres.map((chiffre, i) => (
            <input
              key={i}
              ref={(el) => {
                cases.current[i] = el;
              }}
              type="text"
              name="code"
              inputMode="numeric"
              autoComplete={i === 0 ? "one-time-code" : "off"}
              pattern="[0-9]*"
              aria-label={t("chiffre", { n: i + 1 })}
              aria-describedby={message !== null ? "erreur-verification" : undefined}
              aria-invalid={message !== null ? true : undefined}
              value={chiffre}
              onChange={(e) => {
                // Une case déjà remplie qui reçoit un chiffre le REMPLACE (la
                // sélection posée au focus a pu être annulée par le clic).
                const v = e.target.value;
                poser(i, chiffre !== "" && v.length === 2 && v.startsWith(chiffre) ? v.slice(1) : v);
              }}
              onPaste={(e) => {
                e.preventDefault();
                const colle = e.clipboardData.getData("text").replace(/\D/g, "");
                // Un code entier collé repart de la première case, où qu'on soit.
                poser(colle.length >= 6 ? 0 : i, colle);
              }}
              onKeyDown={(e) => {
                if (e.key === "Backspace" && chiffre === "" && i > 0) {
                  e.preventDefault();
                  setChiffres((c) => c.map((x, k) => (k === i - 1 ? "" : x)));
                  cases.current[i - 1]?.focus();
                }
                if (e.key === "ArrowLeft" && i > 0) cases.current[i - 1]?.focus();
                if (e.key === "ArrowRight" && i < 5) cases.current[i + 1]?.focus();
              }}
              onFocus={(e) => e.target.select()}
            />
          ))}
        </div>
        {/* LA LIGNE D'ERREUR DE LA MAQUETTE (`verification.html`), DANS le groupe des six
            cases : elle entre par `.code-2fa.est-invalide .champ-acces__erreur` (240 ms). */}
        {message !== null ? (
          <p id="erreur-verification" className="champ-acces__erreur" role="alert">
            {message}
          </p>
        ) : null}
      </fieldset>
      {/* « Se souvenir de cet appareil » (203) : jamais dans le flux de
          réinitialisation (`suite`), où la session ne devient pas durable. */}
      {suite === null ? (
        <label className="coche-acces">
          <input type="checkbox" name="souvenir" value="on" defaultChecked />
          <span>{t("souvenirAppareil")}</span>
        </label>
      ) : null}
      <BoutonPrincipalDs libelle={t("bouton")} libelleEnCours={t("enCours")} occupe={resultat.statut === "valide"} />
    </form>
  );
}
