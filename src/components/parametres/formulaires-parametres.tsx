"use client";

import { useActionState, useId, useState, type ReactNode } from "react";
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

/** Le pied d'un bloc : l'aide au repos, le résultat de l'action quand il arrive. */
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
  return (
    <footer className="bloc-r__pied">
      {/* L'aide RESTE quand un message arrive : elle décrit un champ (`aria-describedby`)
          ou porte une note légale. Le message vit dans une région annoncée qui existe
          AVANT son texte — posée en même temps que lui, l'annonce se perd. */}
      <div className="bloc-r__textes">
        {aide === "" ? null : <p id={idAide}>{aide}</p>}
        <p
          className="bloc-r__message"
          role="status"
          data-ton={message === null ? undefined : message.erreur ? "erreur" : "ok"}
        >
          {message?.texte ?? ""}
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

function ChampMotDePasse({
  libelle,
  nom,
  nouveau = false,
  decritPar,
}: {
  readonly libelle: string;
  readonly nom: string;
  readonly nouveau?: boolean;
  readonly decritPar?: string;
}) {
  const id = useId();
  return (
    <div className="champ-r">
      <label htmlFor={id}>{libelle}</label>
      <input
        id={id}
        name={nom}
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

export function BlocNom({ nomActuel, initiales }: { readonly nomActuel: string | null; readonly initiales: string }) {
  const t = useTranslations("parametres.compte");
  const [etat, action, pendant] = useActionState(enregistrerNom, INITIAL);
  const id = useId();
  return (
    <form action={action} className="bloc-r" noValidate>
      <div className="bloc-r__corps">
        <Tete titre={t("nom")} aide={t("nomAide")} />
        <div className="nom-r">
          <span className="nom-r__avatar" aria-hidden="true">
            {initiales}
          </span>
          <div className="champ-r champ-r--large">
            <label htmlFor={id} className="visuellement-cache">
              {t("nom")}
            </label>
            <input id={id} name="nom" defaultValue={nomActuel ?? ""} maxLength={80} autoComplete="name" />
          </div>
        </div>
      </div>
      <Pied aide={t("nomMax")} message={useMessage(etat, t("enregistre"))}>
        <button type="submit" className="bouton-app bouton-app--plein" disabled={pendant}>
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
          {modifiee ? <ChampMotDePasse libelle={t("actuel")} nom="actuel" /> : null}
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
  return (
    <form action={action} className="bloc-r" noValidate>
      <div className="bloc-r__corps">
        <Tete titre={t("motDePasse")} aide={t("motDePasseAide")} />
        <div className="grille-r">
          <ChampMotDePasse libelle={t("actuel")} nom="actuel" />
          <ChampMotDePasse libelle={t("nouveau")} nom="nouveau" nouveau decritPar={idAide} />
        </div>
        <p className="aide-r aide-r--note">{t("sansMotDePasse")}</p>
      </div>
      <Pied aide={t("nouveauAide")} idAide={idAide} message={useMessage(etat, t("motDePasseChange"))}>
        <button type="submit" className="bouton-app bouton-app--plein" disabled={pendant}>
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
  return (
    <form action={action} className="bloc-r bloc-r--danger" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <div className="bloc-r__corps">
        <Tete titre={t(`suppression.${variante}.titre`)} aide={t(`suppression.${variante}.avertissement`)} />
        {ouvert ? (
          <div className="grille-r confirmation-r">
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
          </div>
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
          <button type="button" className="bouton-app bouton-app--danger" onClick={() => setOuvert(true)}>
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
              className="bouton-app bouton-app--second"
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
        <div id={idPanneau}>{mode === "desactiver" ? <DesactivationDeuxEtapes /> : <ActivationDeuxEtapes />}</div>
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
      <div className="bloc-r__corps etape-r etape-r--bloc">
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
      </div>
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
  return (
    <form action={action} className="bloc-r" noValidate>
      <div className="bloc-r__corps">
        <Tete titre={t("securite.sessions")} aide={t("securite.sessionsAide")} />
        {sessions === null ? (
          <p role="alert" className="aide-r" data-ton="erreur">
            {t("securite.lectureImpossible")}
          </p>
        ) : (
          <ul className="appareils-r">
            {sessions.map((s) => {
              const Icone = s.mobile ? Smartphone : Monitor;
              return (
                <li key={s.id}>
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
          <div className="grille-r confirmation-r">
            <ChampMotDePasse libelle={t("compte.actuel")} nom="actuel" />
          </div>
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
          <button type="button" className="bouton-app bouton-app--second" onClick={() => setOuvert(true)}>
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
