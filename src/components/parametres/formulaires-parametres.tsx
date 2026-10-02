"use client";

import { useActionState, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Monitor, Smartphone } from "lucide-react";
import {
  changerAdresseCompte,
  changerMotDePasseCompte,
  commencerActivation,
  confirmerActivation,
  desactiverDeuxEtapes,
  enregistrerNom,
  fermerAutresSessions,
  revoquerAppareilFiable,
  supprimerMesDonnees,
  supprimerMonCompte,
  type EtatParametres,
} from "@/app/[locale]/(app)/parametres/actions";

/**
 * LES RÉGLAGES INTERACTIFS DE « PARAMÈTRES » — maquette `parametres.html`, blocs
 * `.bloc-r` : un titre, des champs, et un pied qui porte l'aide puis l'action.
 *
 * CLIENTS PARCE QU'ILS DOIVENT DIRE CE QUI S'EST PASSÉ, et rien d'autre : l'état
 * vient de la Server Action, jamais d'une supposition locale — le pied ne dit
 * « Enregistré » qu'avec la réponse du serveur (contrainte n° 8).
 *
 * ⚠️ LES CHAMPS DE MOT DE PASSE NE SONT JAMAIS PRÉREMPLIS NI RENVOYÉS : l'état
 * rendu par l'action ne porte qu'un statut et un motif.
 *
 * ⚠️ TOUT CE QUI PROTÈGE LE COMPTE EXIGE LE MOT DE PASSE ACTUEL — adresse, mot de
 * passe, double authentification, sessions, suppressions. Une session ne suffit
 * pas, un cookie volé en est une. La maquette le montre ; le produit le tient.
 */

const INITIAL: EtatParametres = { statut: "inactif" };

type Message = { readonly texte: string; readonly erreur: boolean };

function useMessage(etat: EtatParametres, succes: string): Message | null {
  const t = useTranslations("parametres.erreurs");
  if (etat.statut === "inactif" || etat.statut === "enrole") return null;
  if (etat.statut === "enregistre") return { texte: succes, erreur: false };
  const cle = {
    session: "session",
    invalide: "invalide",
    mot_de_passe_actuel: "motDePasseActuel",
    trop_de_tentatives: "trop",
    mdp_trop_court: "mdpTropCourt",
    mdp_trop_long: "mdpTropLong",
    mdp_contient_email: "mdpContientEmail",
    mdp_fuite: "mdpFuite",
    mdp_identique: "mdpIdentique",
    adresse_identique: "adresseIdentique",
    code: "code",
    confirmation: "confirmation",
    deja_active: "dejaActive",
    indisponible: "indisponible",
    abonnement_en_cours: "abonnementEnCours",
  }[etat.motif];
  return { texte: t(cle), erreur: true };
}

/**
 * Le pied d'un bloc : l'aide au repos, le résultat de l'action quand il arrive.
 *
 * COMME LA MAQUETTE (`parametres.js`, `annoncer`) : la réponse REMPLACE l'aide, entre en
 * fondu (160 ms), et l'aide revient à la saisie suivante dans le formulaire. L'aide reste
 * dans le document, masquée (`hidden`) : un champ qui s'en sert (`aria-describedby`) la lit
 * toujours. La région du message existe AVANT son texte — posée en même temps que lui,
 * l'annonce se perd.
 */
function Pied({
  aide,
  message,
  idAide,
  children,
}: {
  readonly aide: ReactNode;
  readonly message: Message | null;
  readonly idAide?: string;
  readonly children: ReactNode;
}) {
  const pied = useRef<HTMLElement>(null);
  const zone = useRef<HTMLParagraphElement>(null);
  const zoneErreur = useRef<HTMLParagraphElement>(null);
  // Le texte du message que la saisie suivante a « calmé » : il reste masqué tant qu'aucun
  // nouvel envoi n'a eu lieu (un même refus redit après un nouvel envoi se réaffiche).
  const [calme, setCalme] = useState<string | null>(null);
  const texte = message?.texte ?? null;
  const affiche = texte !== null && texte !== calme;

  useEffect(() => {
    const formulaire = pied.current?.closest("form");
    if (formulaire === null || formulaire === undefined) return;
    const surSaisie = (): void => setCalme(texte);
    const surEnvoi = (): void => setCalme(null);
    formulaire.addEventListener("input", surSaisie);
    formulaire.addEventListener("submit", surEnvoi);
    return () => {
      formulaire.removeEventListener("input", surSaisie);
      formulaire.removeEventListener("submit", surEnvoi);
    };
  }, [texte]);

  const enErreur = message?.erreur === true;
  useEffect(() => {
    const cible = enErreur ? zoneErreur.current : zone.current;
    if (!affiche || cible === null || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    cible.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: "cubic-bezier(.23,1,.32,1)" });
  }, [affiche, texte, enErreur]);

  return (
    <footer className="bloc-r__pied" ref={pied}>
      <div className="bloc-r__textes">
        {aide === "" ? null : (
          <p id={idAide} hidden={affiche}>
            {aide}
          </p>
        )}
        {/* DEUX RÉGIONS PERMANENTES, une par nature : un succès se dit (`status`), une
            erreur s'impose (`alert`). Une région qui changerait de rôle en recevant son
            texte ne serait pas annoncée de façon fiable (relecture du 02/10/2026). */}
        <p ref={zone} className="bloc-r__message" role="status" data-ton={affiche && message?.erreur === false ? "ok" : undefined}>
          {affiche && message?.erreur === false ? texte : ""}
        </p>
        <p ref={zoneErreur} className="bloc-r__message" role="alert" data-ton={affiche && message?.erreur === true ? "erreur" : undefined}>
          {affiche && message?.erreur === true ? texte : ""}
        </p>
      </div>
      <span className="bloc-r__actions">{children}</span>
    </footer>
  );
}

function Tete({ titre, aide, id }: { readonly titre: string; readonly aide: string; readonly id?: string }) {
  return (
    <div className="bloc-r__tete">
      <h2 id={id}>{titre}</h2>
      <p>{aide}</p>
    </div>
  );
}

/**
 * CE QUI APPARAÎT SUR DEMANDE ENTRE (maquette, `parametres.js` : `devoiler`, 200 ms, 4 px
 * vers le bas) : le mot de passe demandé quand l'adresse change, la confirmation d'une
 * suppression, les étapes de la double authentification. Sous mouvement réduit, posé.
 */
function useDevoilement<T extends HTMLElement>(focaliser: boolean) {
  const ref = useRef<T>(null);
  useEffect(() => {
    // Le focus va au premier champ révélé (maquette : `focus({ preventScroll: true })`) :
    // celui qui vient de demander la confirmation n'a pas à aller la chercher. PAS pour le
    // mot de passe qui apparaît pendant qu'on tape une adresse : il volerait la frappe
    // (relecture du 02/10/2026 ; la maquette ne le focalise pas non plus).
    if (focaliser) ref.current?.querySelector<HTMLElement>("input:not([type=hidden]), textarea, select")?.focus({ preventScroll: true });
    if (ref.current === null || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    ref.current.animate(
      [
        { opacity: 0, transform: "translateY(-4px)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 200, easing: "cubic-bezier(.23,1,.32,1)" },
    );
  }, [focaliser]);
  return ref;
}

function Devoile({ className, id, children }: { readonly className?: string; readonly id?: string; readonly children: ReactNode }) {
  const ref = useDevoilement<HTMLDivElement>(true);
  return (
    <div ref={ref} className={className} id={id}>
      {children}
    </div>
  );
}

/**
 * LE PANNEAU D'UN ONGLET ENTRE quand on change d'onglet (maquette : 180 ms, 4 px), et
 * seulement alors — pas à l'arrivée sur l'écran, qui a déjà son entrée. Les onglets
 * sont des liens (`?section=`) : `TransitionsEcran` marque un changement sur place.
 */
export function PanneauReglages({ etiquette, children }: { readonly etiquette: string; readonly children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const surPlace = window.__changementSurPlace === true;
    window.__changementSurPlace = false;
    if (!surPlace || ref.current === null || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    ref.current.animate(
      [
        { opacity: 0, transform: "translateY(4px)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 180, easing: "cubic-bezier(.23,1,.32,1)" },
    );
  }, []);
  return (
    <section ref={ref} className="reglages__panneau" aria-label={etiquette}>
      {children}
    </section>
  );
}

function ChampMotDePasse({
  libelle,
  nom,
  nouveau = false,
  decritPar,
  devoile = false,
  surSaisie,
}: {
  readonly libelle: string;
  readonly nom: string;
  readonly nouveau?: boolean;
  readonly decritPar?: string;
  /** Apparu sur demande : il entre (maquette, `devoiler`). */
  readonly devoile?: boolean;
  readonly surSaisie?: (valeur: string) => void;
}) {
  const id = useId();
  const ref = useDevoilement<HTMLDivElement>(false);
  return (
    <div className="champ-r" ref={devoile ? ref : undefined}>
      <label htmlFor={id}>{libelle}</label>
      <input
        id={id}
        name={nom}
        onChange={surSaisie === undefined ? undefined : (e) => surSaisie(e.target.value)}
        type="password"
        required
        minLength={nouveau ? 12 : undefined}
        maxLength={1024}
        autoComplete={nouveau ? "new-password" : "current-password"}
        aria-describedby={decritPar}
      />
    </div>
  );
}

/* ---------- Compte ---------- */

/** Les initiales d'un nom, comme le serveur les calcule (`parametres/page.tsx`). */
function initialesDe(texte: string): string {
  return texte
    .split(/\s+/)
    .filter((m) => m !== "")
    .slice(0, 2)
    .map((m) => m[0]?.toUpperCase() ?? "")
    .join("");
}

export function BlocNom({
  nomActuel,
  initiales,
  repli,
}: {
  readonly nomActuel: string | null;
  readonly initiales: string;
  /** Ce qui nomme le compte quand le nom est vide (la boutique, sinon l'adresse). */
  readonly repli: string;
}) {
  const t = useTranslations("parametres.compte");
  const [etat, action, pendant] = useActionState(enregistrerNom, INITIAL);
  const id = useId();
  // Le bouton n'agit qu'une fois le nom changé, et l'avatar suit la frappe (maquette).
  const [saisie, setSaisie] = useState(nomActuel ?? "");
  const [enregistre, setEnregistre] = useState(nomActuel ?? "");
  // La valeur ENVOYÉE, pas celle du champ à la réponse : on peut taper pendant
  // l'aller-retour, et ce qui est enregistré est ce qui est parti (contrainte n° 8).
  const [envoye, setEnvoye] = useState(nomActuel ?? "");
  const [vu, setVu] = useState(etat);
  if (vu !== etat) {
    setVu(etat);
    if (etat.statut === "enregistre") setEnregistre(envoye);
  }
  const avatar = saisie.trim() === "" ? initialesDe(repli) : initialesDe(saisie.trim());
  return (
    <form action={action} className="bloc-r" noValidate onSubmit={() => setEnvoye(saisie)}>
      <div className="bloc-r__corps">
        <Tete titre={t("nom")} aide={t("nomAide")} />
        <div className="nom-r">
          <span className="nom-r__avatar" aria-hidden="true">
            {avatar || initiales}
          </span>
          <div className="champ-r champ-r--large">
            <label htmlFor={id} className="visuellement-cache">
              {t("nom")}
            </label>
            <input
              id={id}
              name="nom"
              value={saisie}
              onChange={(e) => setSaisie(e.target.value)}
              maxLength={80}
              autoComplete="name"
            />
          </div>
        </div>
      </div>
      <Pied aide={t("nomMax")} message={useMessage(etat, t("enregistre"))}>
        <button
          type="submit"
          className="bouton-app bouton-app--plein"
          disabled={pendant || saisie.trim() === enregistre.trim()}
        >
          {pendant ? t("enregistrement") : t("enregistrer")}
        </button>
      </Pied>
    </form>
  );
}

export function BlocAdresse({
  adresse,
  locale,
  adresseSuivie,
}: {
  readonly adresse: string;
  readonly locale: string;
  readonly adresseSuivie: boolean;
}) {
  const t = useTranslations("parametres.compte");
  const [etat, action, pendant] = useActionState(changerAdresseCompte, INITIAL);
  const [saisie, setSaisie] = useState(adresse);
  const id = useId();
  // Le mot de passe n'est demandé qu'une fois l'adresse changée (maquette) : un
  // champ inutile au repos, mais l'action l'exige, quoi qu'affiche cet écran.
  const modifiee = saisie.trim() !== "" && saisie.trim().toLowerCase() !== adresse.toLowerCase();
  return (
    <form action={action} className="bloc-r" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <div className="bloc-r__corps">
        <Tete titre={t("adresse")} aide={t("adresseAide")} />
        <div className="grille-r">
          <div className="champ-r">
            <label htmlFor={id}>{t("nouvelleAdresse")}</label>
            <input
              id={id}
              name="adresse"
              type="email"
              required
              maxLength={254}
              autoComplete="email"
              spellCheck={false}
              value={saisie}
              onChange={(e) => setSaisie(e.target.value)}
            />
          </div>
          {modifiee ? <ChampMotDePasse libelle={t("actuel")} nom="actuel" devoile /> : null}
        </div>
        {adresseSuivie ? (
          <p role="status" className="aide-r">
            {t("adresseSuivie")}
          </p>
        ) : null}
      </div>
      <Pied aide={t("adresseNote")} message={useMessage(etat, t("adresseEnvoyee"))}>
        <button type="submit" className="bouton-app bouton-app--plein" disabled={pendant || !modifiee}>
          {pendant ? t("envoi") : t("envoyerLien")}
        </button>
      </Pied>
    </form>
  );
}

export function BlocMotDePasse() {
  const t = useTranslations("parametres.compte");
  const [etat, action, pendant] = useActionState(changerMotDePasseCompte, INITIAL);
  const idAide = useId();
  // Désactivé tant que les deux champs ne sont pas remplis (maquette).
  const [actuel, setActuel] = useState("");
  const [nouveau, setNouveau] = useState("");
  // React vide les champs après une action réussie : l'état qui garde le bouton aussi.
  const [vu, setVu] = useState(etat);
  if (vu !== etat) {
    setVu(etat);
    if (etat.statut === "enregistre") {
      setActuel("");
      setNouveau("");
    }
  }
  return (
    <form action={action} className="bloc-r" noValidate>
      <div className="bloc-r__corps">
        <Tete titre={t("motDePasse")} aide={t("motDePasseAide")} />
        <div className="grille-r">
          <ChampMotDePasse libelle={t("actuel")} nom="actuel" surSaisie={setActuel} />
          <ChampMotDePasse libelle={t("nouveau")} nom="nouveau" nouveau decritPar={idAide} surSaisie={setNouveau} />
        </div>
        <p className="aide-r aide-r--note">{t("sansMotDePasse")}</p>
      </div>
      <Pied aide={t("nouveauAide")} idAide={idAide} message={useMessage(etat, t("motDePasseChange"))}>
        <button type="submit" className="bouton-app bouton-app--plein" disabled={pendant || actuel === "" || nouveau === ""}>
          {pendant ? t("changement") : t("changerMotDePasse")}
        </button>
      </Pied>
    </form>
  );
}

/**
 * UNE SUPPRESSION — en deux gestes. Le premier « Supprimer » ouvre la
 * confirmation, le second supprime.
 *
 * ⚠️ LE COLLAGE EST BLOQUÉ DANS LE CHAMP DE RECOPIE (décision 12) : la recopie
 * existe pour forcer à LIRE quel compte on efface. Le mot de passe, lui, reste
 * collable : le bloquer gênerait les gestionnaires sans rien apprendre.
 */
export function BlocSuppression({
  variante,
  adresse,
  locale,
}: {
  readonly variante: "compte" | "donnees";
  readonly adresse: string;
  readonly locale: string;
}) {
  const t = useTranslations("parametres");
  const [etat, action, pendant] = useActionState(
    variante === "compte" ? supprimerMonCompte : supprimerMesDonnees,
    INITIAL,
  );
  const [ouvert, setOuvert] = useState(false);
  const id = useId();
  const message = useMessage(etat, t("suppression.donnees.ok"));
  // UN SUCCÈS REPLIE LA CONFIRMATION (maquette `parametres.js`, `replier()`), puis le pied
  // le dit : mot de passe, « Annuler » et bouton final n'ont plus rien à faire à l'écran.
  const [etatVu, setEtatVu] = useState(etat);
  const [replie, setReplie] = useState(false);
  if (etatVu !== etat) {
    setEtatVu(etat);
    if (etat.statut === "enregistre") {
      setOuvert(false);
      setReplie(true);
    }
  }
  // Le bouton qui avait le focus vient de disparaître avec la confirmation : le focus va à
  // celui qui rouvre le bloc, à sa place, plutôt que de retomber sur `<body>`.
  const focusApresRepli = useCallback(
    (bouton: HTMLButtonElement | null) => {
      if (replie) bouton?.focus({ preventScroll: true });
    },
    [replie],
  );
  return (
    <form action={action} className="bloc-r bloc-r--danger" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <div className="bloc-r__corps">
        <Tete titre={t(`suppression.${variante}.titre`)} aide={t(`suppression.${variante}.avertissement`)} />
        {ouvert ? (
          <Devoile className="grille-r confirmation-r">
            <div className="champ-r">
              <label htmlFor={id}>{t("suppression.recopier", { adresse })}</label>
              <input
                id={id}
                name="confirmation"
                type="email"
                required
                maxLength={254}
                autoComplete="off"
                spellCheck={false}
                onPaste={(e) => e.preventDefault()}
                onDrop={(e) => e.preventDefault()}
              />
            </div>
            <ChampMotDePasse libelle={t("compte.actuel")} nom="actuel" />
          </Devoile>
        ) : null}
        {/* LE SEUL ENDROIT OÙ RÉSILIER : le produit n'a pas de clé d'API chez le
            fournisseur, il ne peut qu'indiquer son portail (206). */}
        {etat.statut === "erreur" && etat.motif === "abonnement_en_cours" ? (
          etat.portail !== null ? (
            <a href={etat.portail} target="_blank" rel="noopener noreferrer" className="lien-r">
              {t("suppression.compte.portail")}
            </a>
          ) : (
            <p className="aide-r">{t("suppression.compte.portailAbsent")}</p>
          )
        ) : null}
      </div>
      <Pied
        aide={variante === "compte" ? t("suppression.compte.conservation") : t("suppression.donnees.aide")}
        message={message}
      >
        {ouvert ? (
          <>
            <button type="button" className="bouton-app bouton-app--second" onClick={() => setOuvert(false)}>
              {t("suppression.annuler")}
            </button>
            <button type="submit" className="bouton-app bouton-app--danger" disabled={pendant}>
              {pendant ? t(`suppression.${variante}.enCours`) : t(`suppression.${variante}.soumettre`)}
            </button>
          </>
        ) : (
          <button type="button" className="bouton-app bouton-app--danger" ref={focusApresRepli}
            onClick={() => {
              setReplie(false);
              setOuvert(true);
            }}>
            {t(`suppression.${variante}.bouton`)}
          </button>
        )}
      </Pied>
    </form>
  );
}

/* ---------- Sécurité ---------- */

/** La clé en groupes de quatre : on la recopie à la main. */
function cleLisible(cle: string): string {
  return (cle.match(/.{1,4}/g) ?? [cle]).join(" ");
}

/**
 * LA DOUBLE AUTHENTIFICATION. PAS D'INTERRUPTEUR : activer exige le mot de passe,
 * un QR code et un premier code juste ; une bascule qui se remettrait seule à
 * « éteint » mentirait sur l'état du compte.
 *
 * LE PANNEAU GARDE LE MODE DANS LEQUEL IL A ÉTÉ OUVERT : après un code juste, la
 * page est relue et `active` passe à vrai — piloté par cette propriété, le panneau
 * basculait sur la désactivation et démontait le message de succès (13/09/2026).
 */
export function BlocDeuxEtapes({ active }: { readonly active: boolean | null }) {
  const t = useTranslations("parametres");
  const [mode, setMode] = useState<"activer" | "desactiver" | null>(null);
  const idPanneau = useId();
  const termine = (mode === "activer" && active === true) || (mode === "desactiver" && active === false);
  return (
    <section className="bloc-r" aria-labelledby="r-deux">
      <div className="bloc-r__corps">
        <div className="bloc-r__tete bloc-r__tete--ligne">
          <div>
            <h2 id="r-deux">{t("securite.deuxEtapes.titre")}</h2>
            <p>{t("securite.deuxEtapes.aide")}</p>
          </div>
          <span className="bloc-r__actions">
            {/* Illisible, l'état ne se devine pas (contrainte n° 8) : l'écran le dit. */}
            {active === null ? (
              <span className="aide-r" role="status">{t("securite.deuxEtapes.lectureImpossible")}</span>
            ) : (
              <span className="etat-r" data-actif={String(active)}>
                <i aria-hidden="true" />
                <span>{active ? t("securite.deuxEtapes.activee") : t("securite.deuxEtapes.desactivee")}</span>
              </span>
            )}
            <button
              type="button"
              // Plein quand la double authentification est à ACTIVER (maquette : `bouton-app--plein`) :
              // c'est l'action recommandée de l'écran ; « Désactiver » et « Annuler » restent seconds.
              className={"bouton-app " + (mode === null && active === false ? "bouton-app--plein" : "bouton-app--second")}
              aria-expanded={mode !== null}
              aria-controls={mode !== null ? idPanneau : undefined}
              onClick={() => setMode((m) => (m !== null ? null : active === true ? "desactiver" : "activer"))}
            >
              {mode !== null
                ? termine
                  ? t("securite.deuxEtapes.fermer")
                  : t("securite.deuxEtapes.annuler")
                : active === true
                  ? t("securite.deuxEtapes.desactiver")
                  : t("securite.deuxEtapes.activer")}
            </button>
          </span>
        </div>
      </div>
      {mode === null ? null : (
        <Devoile id={idPanneau}>{mode === "desactiver" ? <DesactivationDeuxEtapes /> : <ActivationDeuxEtapes />}</Devoile>
      )}
    </section>
  );
}

function ActivationDeuxEtapes() {
  const t = useTranslations("parametres");
  const [etatDebut, commencer, enPreparation] = useActionState(commencerActivation, INITIAL);
  const [etatFin, confirmer, enConfirmation] = useActionState(confirmerActivation, INITIAL);
  const idCode = useId();
  const messageDebut = useMessage(etatDebut, "");
  const messageFin = useMessage(etatFin, t("securite.deuxEtapes.activeeOk"));

  if (etatDebut.statut !== "enrole") {
    return (
      <form action={commencer} noValidate>
        <div className="bloc-r__corps etape-r etape-r--bloc">
          <p className="aide-r">{t("securite.deuxEtapes.motDePasseAide")}</p>
          <div className="grille-r">
            <ChampMotDePasse libelle={t("compte.actuel")} nom="actuel" />
          </div>
        </div>
        <Pied aide="" message={messageDebut}>
          <button type="submit" className="bouton-app bouton-app--plein" disabled={enPreparation}>
            {enPreparation ? t("securite.deuxEtapes.continuation") : t("securite.deuxEtapes.continuer")}
          </button>
        </Pied>
      </form>
    );
  }
  return (
    <form action={confirmer} noValidate>
      <input type="hidden" name="facteur" value={etatDebut.facteur} />
      <Devoile className="bloc-r__corps etape-r etape-r--bloc">
        <p className="aide-r">{t("securite.deuxEtapes.scanner")}</p>
        <div className="qr-r">
          {/* LE QR CODE EST UN SVG RENDU PAR SUPABASE, en `data:` : dans un `<img>`,
              un SVG n'exécute rien. */}
          <span className="qr-r__code">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={etatDebut.qr} alt={t("securite.deuxEtapes.qrAlt")} width={164} height={164} />
          </span>
          <div className="qr-r__cle">
            <span className="qr-r__libelle">{t("securite.deuxEtapes.cle")}</span>
            <span className="cle-r">{cleLisible(etatDebut.cle)}</span>
            <span className="aide-r">{t("securite.deuxEtapes.cleAide")}</span>
          </div>
        </div>
        <div className="champ-r champ-r--code">
          <label htmlFor={idCode}>{t("securite.deuxEtapes.code")}</label>
          <input id={idCode} name="code" required inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="123456" />
        </div>
      </Devoile>
      <Pied aide="" message={messageFin}>
        <button type="submit" className="bouton-app bouton-app--plein" disabled={enConfirmation}>
          {enConfirmation ? t("securite.deuxEtapes.confirmation") : t("securite.deuxEtapes.confirmer")}
        </button>
      </Pied>
    </form>
  );
}

function DesactivationDeuxEtapes() {
  const t = useTranslations("parametres");
  const [etat, action, pendant] = useActionState(desactiverDeuxEtapes, INITIAL);
  return (
    <form action={action} noValidate>
      <div className="bloc-r__corps etape-r etape-r--bloc">
        <p className="aide-r">{t("securite.deuxEtapes.desactiverAide")}</p>
        <div className="grille-r">
          <ChampMotDePasse libelle={t("compte.actuel")} nom="actuel" />
        </div>
      </div>
      <Pied aide="" message={useMessage(etat, t("securite.deuxEtapes.desactiveeOk"))}>
        <button type="submit" className="bouton-app bouton-app--plein" disabled={pendant}>
          {pendant ? t("securite.deuxEtapes.desactivation") : t("securite.deuxEtapes.desactiverBouton")}
        </button>
      </Pied>
    </form>
  );
}

export type SessionAffichee = {
  readonly id: string;
  readonly libelle: string | null;
  readonly mobile: boolean;
  readonly activeLe: string;
  readonly cetAppareil: boolean;
};

export type AppareilFiableAffiche = {
  readonly id: string;
  readonly libelle: string | null;
  readonly mobile: boolean;
  readonly actifJusqu: string;
};

/** Les sessions : la liste, puis « déconnecter les autres », confirmé par le mot de passe. */
export function BlocSessions({ sessions }: { readonly sessions: readonly SessionAffichee[] | null }) {
  const t = useTranslations("parametres");
  const [etat, action, pendant] = useActionState(fermerAutresSessions, INITIAL);
  const [ouvert, setOuvert] = useState(false);
  // UN SUCCÈS REPLIE LA CONFIRMATION (maquette `parametres.js`, `replier()`), puis le pied
  // le dit : mot de passe, « Annuler » et bouton final n'ont plus rien à faire à l'écran.
  const [etatVu, setEtatVu] = useState(etat);
  const [replie, setReplie] = useState(false);
  if (etatVu !== etat) {
    setEtatVu(etat);
    if (etat.statut === "enregistre") {
      setOuvert(false);
      setReplie(true);
    }
  }
  // Le bouton qui avait le focus vient de disparaître avec la confirmation : le focus va à
  // celui qui rouvre le bloc, à sa place, plutôt que de retomber sur `<body>`.
  const focusApresRepli = useCallback(
    (bouton: HTMLButtonElement | null) => {
      if (replie) bouton?.focus({ preventScroll: true });
    },
    [replie],
  );
  /*
   * LES AUTRES APPAREILS S'EN VONT (maquette, `parametres.js` : 180 ms, 6 px vers la
   * droite) — APRÈS la confirmation du serveur, jamais avant (contrainte n° 8). La
   * liste n'est pas relue : seules les sessions fermées par CE geste disparaissent.
   */
  const liste = useRef<HTMLUListElement>(null);
  const [fermees, setFermees] = useState(false);
  useEffect(() => {
    if (etat.statut !== "enregistre") return;
    const partants = [...(liste.current?.querySelectorAll<HTMLElement>("li[data-autre]") ?? [])];
    const fin = () => setFermees(true);
    if (partants.length === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      queueMicrotask(fin);
      return;
    }
    let annule = false;
    void Promise.all(
      partants.map(
        (li) =>
          li.animate(
            [
              { opacity: 1, transform: "none" },
              { opacity: 0, transform: "translateX(6px)" },
            ],
            { duration: 180, easing: "cubic-bezier(.23,1,.32,1)", fill: "forwards" },
          ).finished,
      ),
    ).then(
      () => {
        if (!annule) fin();
      },
      () => {
        // Animation interrompue (écran quitté) : rien à faire disparaître.
      },
    );
    return () => {
      annule = true;
    };
  }, [etat]);
  return (
    <form action={action} className="bloc-r" noValidate>
      <div className="bloc-r__corps">
        <Tete titre={t("securite.sessions")} aide={t("securite.sessionsAide")} />
        {sessions === null ? (
          <p role="alert" className="aide-r" data-ton="erreur">
            {t("securite.lectureImpossible")}
          </p>
        ) : (
          <ul className="appareils-r" ref={liste}>
            {sessions.filter((s) => !fermees || s.cetAppareil).map((s) => {
              const Icone = s.mobile ? Smartphone : Monitor;
              return (
                <li key={s.id} data-autre={s.cetAppareil ? undefined : ""}>
                  <span className="appareils-r__ic">
                    <Icone aria-hidden="true" className="ic" />
                  </span>
                  <span>
                    <b>{s.libelle ?? t("securite.appareilInconnu")}</b>
                    <small>{t("securite.activeLe", { date: s.activeLe })}</small>
                  </span>
                  {s.cetAppareil ? <span className="etiquette-r">{t("securite.cetAppareil")}</span> : null}
                </li>
              );
            })}
          </ul>
        )}
        {ouvert ? (
          <Devoile className="grille-r confirmation-r">
            <ChampMotDePasse libelle={t("compte.actuel")} nom="actuel" />
          </Devoile>
        ) : null}
      </div>
      <Pied aide={t("securite.fermerAide")} message={useMessage(etat, t("securite.ferme"))}>
        {ouvert ? (
          <>
            <button type="button" className="bouton-app bouton-app--second" onClick={() => setOuvert(false)}>
              {t("compte.annuler")}
            </button>
            <button type="submit" className="bouton-app bouton-app--second" disabled={pendant}>
              {pendant ? t("securite.fermeture") : t("securite.fermer")}
            </button>
          </>
        ) : (
          <button type="button" className="bouton-app bouton-app--second" ref={focusApresRepli}
            onClick={() => {
              setReplie(false);
              setOuvert(true);
            }}>
            {t("securite.fermer")}
          </button>
        )}
      </Pied>
    </form>
  );
}

/**
 * LES APPAREILS FIABLES (203) N'EXISTENT QU'AVEC LA 2FA : un appareil ne devient
 * fiable qu'après un vrai second facteur. Révoquer ne fait que retirer une
 * confiance : un bouton, sans mot de passe.
 */
export function BlocAppareilsFiables({ appareils }: { readonly appareils: readonly AppareilFiableAffiche[] | null }) {
  const t = useTranslations("parametres.securite");
  return (
    <section className="bloc-r" aria-labelledby="r-fiables">
      <div className="bloc-r__corps">
        <Tete id="r-fiables" titre={t("appareilsFiables.titre")} aide={t("appareilsFiables.aide")} />
        {appareils === null ? (
          <p role="alert" className="aide-r" data-ton="erreur">
            {t("lectureImpossible")}
          </p>
        ) : appareils.length === 0 ? (
          <p className="vide-r">{t("appareilsFiables.aucun")}</p>
        ) : (
          <ul className="appareils-r">
            {appareils.map((a) => {
              const Icone = a.mobile ? Smartphone : Monitor;
              return (
                <li key={a.id}>
                  <span className="appareils-r__ic">
                    <Icone aria-hidden="true" className="ic" />
                  </span>
                  <span>
                    <b>{a.libelle ?? t("appareilInconnu")}</b>
                    <small>{t("appareilsFiables.actifJusqu", { date: a.actifJusqu })}</small>
                  </span>
                  <RevocationAppareil id={a.id} libelle={a.libelle} />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function RevocationAppareil({ id, libelle }: { readonly id: string; readonly libelle: string | null }) {
  const t = useTranslations("parametres.securite");
  const [etat, action, pendant] = useActionState(revoquerAppareilFiable, INITIAL);
  // Un échec DOIT se voir : sans message, l'appareil resterait sans que rien ne le dise.
  const message = useMessage(etat, "");
  const nom = libelle ?? t("appareilInconnu");
  return (
    <form action={action} className="revocation-r">
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="bouton-texte-r" disabled={pendant} aria-label={`${t("appareilsFiables.revoquer")} — ${nom}`}>
        {pendant ? t("appareilsFiables.revocation") : t("appareilsFiables.revoquer")}
      </button>
      {message !== null && message.erreur ? (
        <small role="alert" data-ton="erreur">
          {message.texte}
        </small>
      ) : null}
    </form>
  );
}
