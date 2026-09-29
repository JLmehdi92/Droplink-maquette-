"use client";

import { useActionState, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Laptop, Lock, Monitor, MonitorSmartphone, Shield, Smartphone, Trash2, UserRound } from "lucide-react";
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
import { CarteReglage, LigneAction } from "./carte-reglage";
import {
  CLASSE_AIDE,
  CLASSE_BOUTON,
  CLASSE_BOUTON_DANGER,
  CLASSE_CHAMP,
  CLASSE_CHAMP_ETIQUETE,
  CLASSE_ENTREE,
  CLASSE_LIBELLE,
  CLASSE_SAISIE,
} from "./classes";

/**
 * LES CARTES INTERACTIVES DE L'ÉCRAN « PARAMÈTRES » — `SettingsView` du kit.
 *
 * CLIENTES PARCE QU'ELLES DOIVENT DIRE CE QUI S'EST PASSÉ, et rien d'autre :
 * l'état vient de la Server Action, jamais d'une supposition locale. Le kit
 * affiche « Informations enregistrées » au clic ; ici le message n'arrive
 * qu'avec la réponse du serveur (principe XII).
 *
 * ⚠️ LES CHAMPS DE MOT DE PASSE NE SONT JAMAIS PRÉREMPLIS NI RENVOYÉS. L'état
 * rendu par l'action ne porte qu'un statut et un motif : un mot de passe qui
 * repasserait par l'état React finirait dans la charge d'hydratation suivante.
 *
 * ⚠️ « MODIFIER » N'ÉCRIT RIEN. Le kit rend l'adresse éditable en place et le
 * mot de passe modifiable d'un clic. Ici chacun ouvre un formulaire qui exige le
 * mot de passe actuel : une session ne suffit pas à changer ce qui protège le
 * compte, un cookie volé en est une.
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

function Annonce({ message }: { readonly message: Message | null }) {
  if (message === null) return null;
  return (
    <p
      role={message.erreur ? "alert" : "status"}
      className={"text-[13px] leading-[1.5] " + (message.erreur ? "text-ds-erreur-encre" : "text-ds-succes-encre")}
    >
      {message.texte}
    </p>
  );
}

function Soumettre({
  libelle,
  enCours,
  pendant,
  form,
}: {
  readonly libelle: string;
  readonly enCours: string;
  readonly pendant: boolean;
  readonly form?: string;
}) {
  return (
    <button type="submit" form={form} disabled={pendant} className={CLASSE_BOUTON}>
      {pendant ? enCours : libelle}
    </button>
  );
}

function ChampMotDePasse({
  libelle,
  nom,
  nouveau = false,
  aide,
  classeLibelle = CLASSE_LIBELLE,
}: {
  readonly libelle: string;
  readonly nom: string;
  readonly nouveau?: boolean;
  readonly aide?: string;
  /** Sur le fond rouge teinté d'une suppression, le gris de corps tombe à 4,30:1. */
  readonly classeLibelle?: string;
}) {
  const id = useId();
  return (
    <div className={CLASSE_CHAMP_ETIQUETE}>
      <label htmlFor={id} className={classeLibelle}>
        {libelle}
      </label>
      <span className={CLASSE_CHAMP}>
        <input
          id={id}
          name={nom}
          type="password"
          required
          minLength={nouveau ? 12 : undefined}
          maxLength={1024}
          autoComplete={nouveau ? "new-password" : "current-password"}
          aria-describedby={aide === undefined ? undefined : id + "-aide"}
          className={CLASSE_ENTREE}
        />
      </span>
      {aide === undefined ? null : (
        <p id={id + "-aide"} className={CLASSE_AIDE}>
          {aide}
        </p>
      )}
    </div>
  );
}

function FormulaireAdresse({ locale }: { readonly locale: string }) {
  const t = useTranslations("parametres.compte");
  const [etat, action, pendant] = useActionState(changerAdresseCompte, INITIAL);
  const idAdresse = useId();
  const message = useMessage(etat, t("adresseEnvoyee"));

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="locale" value={locale} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className={CLASSE_CHAMP_ETIQUETE}>
          <label htmlFor={idAdresse} className={CLASSE_LIBELLE}>
            {t("nouvelleAdresse")}
          </label>
          <span className={CLASSE_CHAMP}>
            <input
              id={idAdresse}
              name="adresse"
              type="email"
              required
              maxLength={254}
              autoComplete="email"
              className={CLASSE_ENTREE}
            />
          </span>
        </div>
        <ChampMotDePasse libelle={t("actuel")} nom="actuel" />
      </div>
      <div>
        <Soumettre libelle={t("envoyerLien")} enCours={t("envoi")} pendant={pendant} />
      </div>
      <Annonce message={message} />
    </form>
  );
}

function FormulaireMotDePasse() {
  const t = useTranslations("parametres.compte");
  const [etat, action, pendant] = useActionState(changerMotDePasseCompte, INITIAL);
  const message = useMessage(etat, t("motDePasseChange"));

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <ChampMotDePasse libelle={t("actuel")} nom="actuel" />
        <ChampMotDePasse libelle={t("nouveau")} nom="nouveau" nouveau aide={t("nouveauAide")} />
      </div>
      <div>
        <Soumettre libelle={t("changerMotDePasse")} enCours={t("changement")} pendant={pendant} />
      </div>
      <Annonce message={message} />
      <p className={CLASSE_AIDE}>{t("sansMotDePasse")}</p>
    </form>
  );
}

/** Le bouton « Modifier » posé DANS le champ, comme le `trailing` du kit. */
function ChampProtege({
  libelle,
  valeur,
  masque = false,
  ouvert,
  controle,
  basculer,
}: {
  readonly libelle: string;
  readonly valeur: string;
  readonly masque?: boolean;
  readonly ouvert: boolean;
  readonly controle: string;
  readonly basculer: () => void;
}) {
  const t = useTranslations("parametres.compte");
  return (
    <div className={CLASSE_CHAMP_ETIQUETE}>
      <span className={CLASSE_LIBELLE}>{libelle}</span>
      <span className={CLASSE_CHAMP + " pr-1.5"}>
        <span
          className={CLASSE_SAISIE + " truncate" + (masque ? " tracking-[0.12em]" : "")}
          aria-hidden={masque ? true : undefined}
        >
          {valeur}
        </span>
        <button
          type="button"
          onClick={basculer}
          aria-expanded={ouvert}
          aria-controls={controle}
          aria-label={`${ouvert ? t("annuler") : t("modifier")} — ${libelle}`}
          className={CLASSE_BOUTON}
        >
          {ouvert ? t("annuler") : t("modifier")}
        </button>
      </span>
    </div>
  );
}

export function CarteCompte({
  nomActuel,
  adresse,
  initiales,
  locale,
  adresseSuivie,
}: {
  readonly nomActuel: string | null;
  readonly adresse: string;
  readonly initiales: string;
  readonly locale: string;
  readonly adresseSuivie: boolean;
}) {
  const t = useTranslations("parametres.compte");
  const [etat, action, pendant] = useActionState(enregistrerNom, INITIAL);
  const [ouvert, setOuvert] = useState<"adresse" | "motDePasse" | null>(null);
  const idFormulaire = useId();
  const idNom = useId();
  const idPanneau = useId();
  const message = useMessage(etat, t("enregistre"));

  const basculer = (quoi: "adresse" | "motDePasse") => () =>
    setOuvert((actuel) => (actuel === quoi ? null : quoi));

  return (
    <CarteReglage
      icone={UserRound}
      titre={t("titre")}
      sousTitre={t("aide")}
      action={
        /* Au téléphone le bouton descend sous les champs (voir plus bas) : l'en-tête
           passait à la ligne et « Enregistrer » tombait seul avant les champs qu'il
           enregistre. Planche `SettingsView`, `.set-save-bottom`. */
        <div className="hidden md:block">
          <Soumettre libelle={t("enregistrer")} enCours={t("enregistrement")} pendant={pendant} form={idFormulaire} />
        </div>
      }
    >
      {/* LE FORMULAIRE DU NOM EST VIDE ET SES CHAMPS L'ATTEIGNENT PAR `form`. Le
          bouton du kit vit dans l'en-tête de la carte, hors du formulaire, et les
          deux autres formulaires de la carte ne peuvent pas y être imbriqués. */}
      <form id={idFormulaire} action={action} />

      <div className="grid grid-cols-1 items-start gap-[22px] sm:grid-cols-[auto_minmax(0,1fr)]">
        <span
          aria-hidden="true"
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-ds-pill bg-ds-accent text-[22px] font-bold text-ds-texte-sur-marque md:h-24 md:w-24 md:text-[30px]"
        >
          {initiales}
        </span>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className={CLASSE_CHAMP_ETIQUETE}>
              <label htmlFor={idNom} className={CLASSE_LIBELLE}>
                {t("nom")}
              </label>
              <span className={CLASSE_CHAMP}>
                <input
                  id={idNom}
                  form={idFormulaire}
                  name="nom"
                  defaultValue={nomActuel ?? ""}
                  maxLength={80}
                  autoComplete="name"
                  className={CLASSE_ENTREE}
                />
              </span>
            </div>
            <ChampProtege
              libelle={t("adresse")}
              valeur={adresse}
              ouvert={ouvert === "adresse"}
              controle={idPanneau}
              basculer={basculer("adresse")}
            />
            <ChampProtege
              libelle={t("motDePasse")}
              valeur="••••••••••"
              masque
              ouvert={ouvert === "motDePasse"}
              controle={idPanneau}
              basculer={basculer("motDePasse")}
            />
          </div>
          <Annonce message={message} />
          <div className="md:hidden [&>button]:w-full">
            <Soumettre libelle={t("enregistrer")} enCours={t("enregistrement")} pendant={pendant} form={idFormulaire} />
          </div>
          {adresseSuivie ? (
            <p role="status" className="text-[13px] leading-[1.5] text-ds-texte-corps">
              {t("adresseSuivie")}
            </p>
          ) : null}
        </div>
      </div>

      <div id={idPanneau} hidden={ouvert === null}>
        {ouvert === null ? null : (
          <div className="mt-5 rounded-ds-card border border-ds-filet bg-ds-surface-creux p-4">
            {ouvert === "adresse" ? <FormulaireAdresse locale={locale} /> : <FormulaireMotDePasse />}
          </div>
        )}
      </div>
    </CarteReglage>
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

/**
 * RÉVOQUER UN APPAREIL FIABLE (203) — un bouton, pas de mot de passe : révoquer
 * ne fait que retirer une confiance (voir l'action). La liste est relue par le
 * serveur, donc l'appareil disparaît de lui-même au succès.
 */
function BoutonRevocationAppareil({ id, libelle }: { readonly id: string; readonly libelle: string | null }) {
  const t = useTranslations("parametres.securite");
  const [etat, action, pendant] = useActionState(revoquerAppareilFiable, INITIAL);
  // Un échec de révocation DOIT se voir : sans message, le bouton redevient
  // cliquable et l'appareil reste, sans que rien ne le dise (contrainte n° 8).
  const message = useMessage(etat, "");
  const nom = libelle ?? t("appareilInconnu");
  return (
    <form action={action} className="flex flex-col items-end gap-1.5">
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pendant} aria-label={`${t("appareilsFiables.revoquer")} — ${nom}`} className={CLASSE_BOUTON_DANGER}>
        {pendant ? t("appareilsFiables.revocation") : t("appareilsFiables.revoquer")}
      </button>
      <Annonce message={message} />
    </form>
  );
}

function FormulaireSessions() {
  const t = useTranslations("parametres");
  const [etat, action, pendant] = useActionState(fermerAutresSessions, INITIAL);
  const message = useMessage(etat, t("securite.ferme"));

  return (
    <form action={action} className="flex flex-col gap-4">
      <p className={CLASSE_AIDE}>{t("securite.fermerAide")}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <ChampMotDePasse libelle={t("compte.actuel")} nom="actuel" />
      </div>
      <div>
        <Soumettre libelle={t("securite.fermer")} enCours={t("securite.fermeture")} pendant={pendant} />
      </div>
      <Annonce message={message} />
    </form>
  );
}


/** La clé en groupes de quatre : on la recopie à la main, et 32 caractères d'un bloc se lisent mal. */
function cleLisible(cle: string): string {
  return (cle.match(/.{1,4}/g) ?? [cle]).join(" ");
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
      <form action={commencer} className="flex flex-col gap-4">
        <p className={CLASSE_AIDE}>{t("securite.deuxEtapes.motDePasseAide")}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <ChampMotDePasse libelle={t("compte.actuel")} nom="actuel" />
        </div>
        <div>
          <Soumettre
            libelle={t("securite.deuxEtapes.continuer")}
            enCours={t("securite.deuxEtapes.continuation")}
            pendant={enPreparation}
          />
        </div>
        <Annonce message={messageDebut} />
      </form>
    );
  }

  return (
    <form action={confirmer} className="flex flex-col gap-4">
      <input type="hidden" name="facteur" value={etatDebut.facteur} />
      <p className={CLASSE_AIDE}>{t("securite.deuxEtapes.scanner")}</p>
      <div className="flex flex-wrap items-center gap-[18px]">
        {/* LE QR CODE EST UN SVG RENDU PAR SUPABASE, en `data:`. Dans un `<img>`,
            un SVG n'exécute rien ; et `next/image` n'a rien à optimiser dans une
            image vectorielle servie depuis la page elle-même. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={etatDebut.qr}
          alt={t("securite.deuxEtapes.qrAlt")}
          width={164}
          height={164}
          className="h-[164px] w-[164px] shrink-0 rounded-ds-control border border-ds-filet bg-ds-surface-carte p-2"
        />
        <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-2">
          <span className={CLASSE_LIBELLE}>{t("securite.deuxEtapes.cle")}</span>
          <span className="flex min-h-12 items-center rounded-ds-control border border-ds-filet-appuye bg-ds-surface-carte px-3.5 py-2 font-mono text-[13.5px] tracking-[0.06em] break-all text-ds-texte-fort select-all">
            {cleLisible(etatDebut.cle)}
          </span>
          <span className={CLASSE_AIDE}>{t("securite.deuxEtapes.cleAide")}</span>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className={CLASSE_CHAMP_ETIQUETE}>
          <label htmlFor={idCode} className={CLASSE_LIBELLE}>
            {t("securite.deuxEtapes.code")}
          </label>
          <span className={CLASSE_CHAMP}>
            <input
              id={idCode}
              name="code"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
              placeholder="123456"
              className={CLASSE_ENTREE}
            />
          </span>
        </div>
      </div>
      <div>
        <Soumettre
          libelle={t("securite.deuxEtapes.confirmer")}
          enCours={t("securite.deuxEtapes.confirmation")}
          pendant={enConfirmation}
        />
      </div>
      <Annonce message={messageFin} />
    </form>
  );
}

function DesactivationDeuxEtapes() {
  const t = useTranslations("parametres");
  const [etat, action, pendant] = useActionState(desactiverDeuxEtapes, INITIAL);
  const message = useMessage(etat, t("securite.deuxEtapes.desactiveeOk"));

  return (
    <form action={action} className="flex flex-col gap-4">
      <p className={CLASSE_AIDE}>{t("securite.deuxEtapes.desactiverAide")}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <ChampMotDePasse libelle={t("compte.actuel")} nom="actuel" />
      </div>
      <div>
        <Soumettre
          libelle={t("securite.deuxEtapes.desactiverBouton")}
          enCours={t("securite.deuxEtapes.desactivation")}
          pendant={pendant}
        />
      </div>
      <Annonce message={message} />
    </form>
  );
}

/**
 * LA CONFIRMATION D'UNE SUPPRESSION — `ConfirmDialog` du kit, sur place.
 *
 * ⚠️ LE COLLAGE EST BLOQUÉ DANS LE CHAMP DE RECOPIE, et c'est la règle de la
 * décision 12 : la recopie n'existe pas pour refuser une faute de frappe, mais
 * pour forcer à LIRE quel compte on efface. Coller l'adresse depuis la ligne
 * au-dessus ferait passer le geste sans l'avoir lu. Le mot de passe, lui, reste
 * collable : le bloquer n'apprendrait rien et gênerait les gestionnaires.
 */
function FormulaireSuppression({
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
  const idConfirmation = useId();
  const message = useMessage(etat, t("suppression.donnees.ok"));
  /* ⚠️ SUR LE FOND ROUGE TEINTÉ, LE GRIS DE CORPS NE SE LIT PAS : mesuré le
     15/09/2026, 4,30:1 pour l'avertissement et les libellés, 2,76:1 pour la note
     de conservation en sourdine. L'encre ink-600 tient 7,12:1 — le remède des
     alertes du panneau d'administration. Planche `SettingsView`, `DangerPanel`. */
  const libelle = "text-[13px] leading-[normal] font-medium text-ds-ink-600";

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="locale" value={locale} />
      <div className="flex flex-col gap-1.5">
        <p className="text-[14.5px] leading-[normal] font-bold text-ds-erreur-encre">
          {t(`suppression.${variante}.question`)}
        </p>
        <p className="text-[13.5px] leading-[1.55] text-ds-ink-600">{t(`suppression.${variante}.avertissement`)}</p>
        {variante === "compte" ? (
          <p className="text-[12.5px] leading-[1.5] text-ds-ink-600">{t("suppression.compte.conservation")}</p>
        ) : null}
      </div>
      {/* Alignés sur le bas : le libellé de recopie porte l'adresse et passe sur
          deux lignes, et les deux champs se décalaient de 16 px. */}
      <div className="grid items-end gap-4 sm:grid-cols-2">
        <div className={CLASSE_CHAMP_ETIQUETE}>
          <label htmlFor={idConfirmation} className={libelle}>
            {t("suppression.recopier", { adresse })}
          </label>
          <span className={CLASSE_CHAMP}>
            <input
              id={idConfirmation}
              name="confirmation"
              type="email"
              required
              maxLength={254}
              autoComplete="off"
              spellCheck={false}
              onPaste={(e) => e.preventDefault()}
              onDrop={(e) => e.preventDefault()}
              className={CLASSE_ENTREE}
            />
          </span>
        </div>
        <ChampMotDePasse libelle={t("compte.actuel")} nom="actuel" classeLibelle={libelle} />
      </div>
      <div>
        <button type="submit" disabled={pendant} className={CLASSE_BOUTON_DANGER}>
          {pendant ? t(`suppression.${variante}.enCours`) : t(`suppression.${variante}.soumettre`)}
        </button>
      </div>
      <Annonce message={message} />
      {/* LE SEUL ENDROIT OÙ RÉSILIER. Le produit n'a pas de clé d'API chez le
          fournisseur : il ne peut qu'indiquer son portail, où le vendeur se
          connecte avec son e-mail (206). */}
      {etat.statut === "erreur" && etat.motif === "abonnement_en_cours" && etat.portail !== null ? (
        <a
          href={etat.portail}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center self-start text-[13.5px] font-semibold text-ds-erreur-encre underline underline-offset-2"
        >
          {t("suppression.compte.portail")}
        </a>
      ) : null}
    </form>
  );
}

/** Une ligne « danger » et son panneau de confirmation. */
export function LigneSuppression({
  variante,
  adresse,
  locale,
  premiere = false,
}: {
  readonly variante: "compte" | "donnees";
  readonly adresse: string;
  readonly locale: string;
  readonly premiere?: boolean;
}) {
  const t = useTranslations("parametres.suppression");
  const [ouvert, setOuvert] = useState(false);
  const idPanneau = useId();

  return (
    <>
      <LigneAction premiere={premiere} danger icone={Trash2} titre={t(`${variante}.titre`)} sousTitre={t(`${variante}.aide`)}>
        <button
          type="button"
          onClick={() => setOuvert((v) => !v)}
          aria-expanded={ouvert}
          aria-controls={idPanneau}
          className={ouvert ? CLASSE_BOUTON : CLASSE_BOUTON_DANGER}
        >
          {ouvert ? t("annuler") : t(`${variante}.bouton`)}
        </button>
      </LigneAction>
      <div id={idPanneau} hidden={!ouvert}>
        {ouvert ? (
          <div className="mb-1.5 rounded-ds-card border border-ds-erreur bg-ds-erreur-fond p-4">
            <FormulaireSuppression variante={variante} adresse={adresse} locale={locale} />
          </div>
        ) : null}
      </div>
    </>
  );
}

export function CarteSecurite({
  sessions,
  appareilsFiables,
  deuxEtapesActive,
  adresse,
  locale,
}: {
  readonly sessions: readonly SessionAffichee[] | null;
  readonly appareilsFiables: readonly AppareilFiableAffiche[] | null;
  readonly deuxEtapesActive: boolean;
  readonly adresse: string;
  readonly locale: string;
}) {
  const t = useTranslations("parametres.securite");
  const [ouvert, setOuvert] = useState(false);
  const [fiablesOuvert, setFiablesOuvert] = useState(false);
  const idFiables = useId();
  /*
   * LE PANNEAU GARDE LE MODE DANS LEQUEL IL A ÉTÉ OUVERT. Après un code juste,
   * l'action relit la page : `deuxEtapesActive` passe à vrai, et un panneau
   * piloté par cette propriété basculait aussitôt sur le formulaire de
   * DÉSACTIVATION — démontant le message de succès avant qu'il soit lu. Mesuré
   * le 13/09/2026 en pilotant l'activation : badge « Activée », aucun message.
   */
  const [mode, setMode] = useState<"activer" | "desactiver" | null>(null);
  const termine = (mode === "activer" && deuxEtapesActive) || (mode === "desactiver" && !deuxEtapesActive);
  const idPanneau = useId();
  const idDeuxEtapes = useId();

  return (
    <CarteReglage icone={Lock} titre={t("titre")} sousTitre={t("aide")}>
      {/* PAS D'INTERRUPTEUR, À LA DIFFÉRENCE DU KIT. Une bascule promet un effet
          immédiat ; activer exige ici le mot de passe, un QR code et un premier
          code juste. Un interrupteur qui se remettrait tout seul à « éteint »
          mentirait sur l'état du compte (principe XII). */}
      <LigneAction premiere icone={Shield} titre={t("deuxEtapes.titre")} sousTitre={t("deuxEtapes.aide")}>
        {deuxEtapesActive ? (
          <span className="inline-flex rounded-ds-pill bg-ds-succes-fond px-[11px] py-[5px] text-[11.5px] leading-[normal] font-bold text-ds-succes-encre lg:text-[11px]">
            {t("deuxEtapes.activee")}
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => setMode((m) => (m !== null ? null : deuxEtapesActive ? "desactiver" : "activer"))}
          aria-expanded={mode !== null}
          aria-controls={idDeuxEtapes}
          className={CLASSE_BOUTON}
        >
          {mode !== null
            ? termine
              ? t("deuxEtapes.fermer")
              : t("deuxEtapes.annuler")
            : deuxEtapesActive
              ? t("deuxEtapes.desactiver")
              : t("deuxEtapes.activer")}
        </button>
      </LigneAction>

      <div id={idDeuxEtapes} hidden={mode === null}>
        {mode !== null ? (
          <div className="mb-1.5 rounded-ds-card border border-ds-filet bg-ds-surface-creux p-4">
            {mode === "desactiver" ? <DesactivationDeuxEtapes /> : <ActivationDeuxEtapes />}
          </div>
        ) : null}
      </div>

      <LigneAction icone={MonitorSmartphone} titre={t("sessions")} sousTitre={t("sessionsAide")}>
        <button
          type="button"
          onClick={() => setOuvert((v) => !v)}
          aria-expanded={ouvert}
          aria-controls={idPanneau}
          className={CLASSE_BOUTON}
        >
          {ouvert ? t("masquer") : t("voir")}
        </button>
      </LigneAction>

      <div id={idPanneau} hidden={!ouvert}>
        {ouvert ? (
          <div className="mt-1 flex flex-col gap-5 rounded-ds-card border border-ds-filet bg-ds-surface-creux p-4">
            {sessions === null ? (
              <p role="alert" className="text-[13px] leading-[1.5] text-ds-erreur-encre">
                {t("lectureImpossible")}
              </p>
            ) : (
              <ul className="flex flex-col">
                {sessions.map((s, i) => {
                  const Icone = s.mobile ? Smartphone : Monitor;
                  return (
                    <li
                      key={s.id}
                      className={"flex flex-wrap items-center gap-3 py-3" + (i === 0 ? "" : " border-t border-ds-filet")}
                    >
                      <Icone aria-hidden="true" size={17} strokeWidth={1.9} className="shrink-0 text-ds-texte-sourdine" />
                      <span className="flex min-w-0 flex-[1_1_180px] flex-col gap-0.5">
                        <span className="text-[14px] leading-[normal] font-semibold text-ds-texte-fort">
                          {s.libelle ?? t("appareilInconnu")}
                        </span>
                        <span className="text-[12.5px] leading-[normal] text-ds-texte-sourdine">
                          {t("activeLe", { date: s.activeLe })}
                        </span>
                      </span>
                      {s.cetAppareil ? (
                        <span className="inline-flex rounded-ds-pill bg-ds-violet-100 px-[11px] py-[5px] text-[11.5px] leading-[normal] font-bold text-ds-accent-encre lg:text-[11px]">
                          {t("cetAppareil")}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
            <FormulaireSessions />
          </div>
        ) : null}
      </div>

      {/* LES APPAREILS FIABLES (203) N'EXISTENT QU'AVEC LA 2FA : un appareil ne
          devient fiable qu'après un vrai second facteur. Sans 2FA, la ligne
          n'aurait rien à montrer et laisserait croire à une option absente. */}
      {deuxEtapesActive ? (
        <>
          <LigneAction icone={Laptop} titre={t("appareilsFiables.titre")} sousTitre={t("appareilsFiables.aide")}>
            <button
              type="button"
              onClick={() => setFiablesOuvert((v) => !v)}
              aria-expanded={fiablesOuvert}
              aria-controls={idFiables}
              className={CLASSE_BOUTON}
            >
              {fiablesOuvert ? t("appareilsFiables.masquer") : t("appareilsFiables.voir")}
            </button>
          </LigneAction>

          <div id={idFiables} hidden={!fiablesOuvert}>
            {fiablesOuvert ? (
              <div className="mt-1 flex flex-col gap-1 rounded-ds-card border border-ds-filet bg-ds-surface-creux p-4">
                {appareilsFiables === null ? (
                  <p role="alert" className="text-[13px] leading-[1.5] text-ds-erreur-encre">
                    {t("lectureImpossible")}
                  </p>
                ) : appareilsFiables.length === 0 ? (
                  <p className="text-[13px] leading-[1.5] text-ds-texte-sourdine">{t("appareilsFiables.aucun")}</p>
                ) : (
                  <ul className="flex flex-col">
                    {appareilsFiables.map((a, i) => {
                      const Icone = a.mobile ? Smartphone : Monitor;
                      return (
                        <li
                          key={a.id}
                          className={
                            "flex flex-wrap items-center gap-3 py-3" + (i === 0 ? "" : " border-t border-ds-filet")
                          }
                        >
                          <Icone
                            aria-hidden="true"
                            size={17}
                            strokeWidth={1.9}
                            className="shrink-0 text-ds-texte-sourdine"
                          />
                          <span className="flex min-w-0 flex-[1_1_180px] flex-col gap-0.5">
                            <span className="text-[14px] leading-[normal] font-semibold text-ds-texte-fort">
                              {a.libelle ?? t("appareilInconnu")}
                            </span>
                            <span className="text-[12.5px] leading-[normal] text-ds-texte-sourdine">
                              {t("appareilsFiables.actifJusqu", { date: a.actifJusqu })}
                            </span>
                          </span>
                          <BoutonRevocationAppareil id={a.id} libelle={a.libelle} />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      <LigneSuppression variante="compte" adresse={adresse} locale={locale} />
    </CarteReglage>
  );
}
