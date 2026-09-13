"use client";

import { useActionState, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Lock, Monitor, MonitorSmartphone, Smartphone, UserRound } from "lucide-react";
import {
  changerAdresseCompte,
  changerMotDePasseCompte,
  enregistrerNom,
  fermerAutresSessions,
  type EtatParametres,
} from "@/app/[locale]/(app)/parametres/actions";
import { CarteReglage, LigneAction } from "./carte-reglage";
import {
  CLASSE_AIDE,
  CLASSE_BOUTON,
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
  if (etat.statut === "inactif") return null;
  if (etat.statut === "enregistre") return { texte: succes, erreur: false };
  const cle = {
    session: "session",
    invalide: "invalide",
    mot_de_passe_actuel: "motDePasseActuel",
    trop_de_tentatives: "trop",
    mdp_trop_court: "mdpTropCourt",
    mdp_trop_long: "mdpTropLong",
    mdp_contient_email: "mdpContientEmail",
    mdp_identique: "mdpIdentique",
    adresse_identique: "adresseIdentique",
    indisponible: "indisponible",
  }[etat.motif];
  return { texte: t(cle), erreur: true };
}

function Annonce({ message }: { readonly message: Message | null }) {
  if (message === null) return null;
  return (
    <p
      role={message.erreur ? "alert" : "status"}
      className={"text-[13px] leading-[1.5] " + (message.erreur ? "text-ds-erreur" : "text-ds-succes")}
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
}: {
  readonly libelle: string;
  readonly nom: string;
  readonly nouveau?: boolean;
  readonly aide?: string;
}) {
  const id = useId();
  return (
    <div className={CLASSE_CHAMP_ETIQUETE}>
      <label htmlFor={id} className={CLASSE_LIBELLE}>
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
        <Soumettre libelle={t("enregistrer")} enCours={t("enregistrement")} pendant={pendant} form={idFormulaire} />
      }
    >
      {/* LE FORMULAIRE DU NOM EST VIDE ET SES CHAMPS L'ATTEIGNENT PAR `form`. Le
          bouton du kit vit dans l'en-tête de la carte, hors du formulaire, et les
          deux autres formulaires de la carte ne peuvent pas y être imbriqués. */}
      <form id={idFormulaire} action={action} />

      <div className="grid grid-cols-1 items-start gap-[22px] sm:grid-cols-[auto_minmax(0,1fr)]">
        <span
          aria-hidden="true"
          className="flex h-24 w-24 shrink-0 items-center justify-center rounded-ds-pill bg-ds-accent text-[30px] font-bold text-ds-texte-sur-marque"
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

export function CarteSecurite({ sessions }: { readonly sessions: readonly SessionAffichee[] | null }) {
  const t = useTranslations("parametres.securite");
  const [ouvert, setOuvert] = useState(false);
  const idPanneau = useId();

  return (
    <CarteReglage icone={Lock} titre={t("titre")} sousTitre={t("aide")}>
      <LigneAction premiere icone={MonitorSmartphone} titre={t("sessions")} sousTitre={t("sessionsAide")}>
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
              <p role="alert" className="text-[13px] leading-[1.5] text-ds-erreur">
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
    </CarteReglage>
  );
}
