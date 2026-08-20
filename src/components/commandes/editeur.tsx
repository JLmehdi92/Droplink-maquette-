"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Icone } from "@/components/icone";
import { enregistrerChamp, type ResultatEnregistrement } from "@/lib/commandes/actions";

/**
 * L'éditeur d'une commande — sauvegarde automatique, sans bouton « enregistrer ».
 *
 * Un bouton d'enregistrement transforme chaque champ en promesse à tenir plus
 * tard : le vendeur qui ferme son onglet perd son travail, et c'est toujours à
 * la commande la plus longue à saisir que ça arrive.
 *
 * DEUX CADENCES. ~800 ms de temporisation sur le texte — écrire ne doit pas
 * produire une écriture par frappe — et immédiat sur les actions structurelles
 * (statut, contrôle qualité), qui sont des décisions et non de la saisie.
 *
 * L'INTERFACE N'AFFIRME JAMAIS CE QUE LA BASE N'A PAS ENREGISTRÉ. Le témoin ne
 * passe à « enregistré » qu'APRÈS confirmation du serveur. En cas d'échec, le
 * champ REVIENT à la valeur confirmée, et l'échec est NOMMÉ avec le champ
 * concerné : un retour optimiste est un pari sur le serveur, et un pari perdu
 * laisse à l'écran une valeur que personne n'a gardée — le vendeur envoie alors
 * un lien dont il croit connaître le contenu.
 */

type Etat = "repos" | "encours" | "echec";

export interface ValeursCommande {
  readonly customer_label: string;
  readonly product_ref: string;
  readonly tracking_number: string;
  readonly carrier_code: string;
  readonly internal_notes: string;
  readonly status: string;
  readonly qc_status: string;
}

const DELAI_TEXTE_MS = 800;

export function Editeur({
  id,
  initiales,
  statuts,
  qcs,
}: {
  readonly id: string;
  readonly initiales: ValeursCommande;
  readonly statuts: readonly string[];
  readonly qcs: readonly string[];
}) {
  const t = useTranslations("editeur");

  // Deux états distincts, et c'est tout le mécanisme : `valeurs` est ce qui
  // s'affiche, `confirmees` est ce que la base a réellement gardé. Sans le
  // second, il n'y a rien vers quoi revenir quand une écriture échoue.
  const [valeurs, setValeurs] = useState<ValeursCommande>(initiales);
  const confirmees = useRef<ValeursCommande>(initiales);

  const [etat, setEtat] = useState<Etat>("repos");
  const [champsEnEchec, setChampsEnEchec] = useState<readonly string[]>([]);
  const minuteries = useRef<Map<string, number>>(new Map());
  // Une écriture plus ancienne qui reviendrait après une plus récente
  // écraserait la seconde : chaque champ retient le numéro de sa dernière
  // demande, et une réponse périmée est ignorée.
  const derniereDemande = useRef<Map<string, number>>(new Map());
  const compteur = useRef(0);

  const appliquer = useCallback(
    (champ: keyof ValeursCommande, valeur: string, resultat: ResultatEnregistrement): void => {
      if (resultat.statut === "ok") {
        confirmees.current = { ...confirmees.current, [champ]: valeur };
        setChampsEnEchec((precedents) => {
          const restants = precedents.filter((c) => c !== champ);
          if (restants.length === 0) setEtat("repos");
          return restants;
        });
        return;
      }

      // Retour à l'état confirmé, ET on le dit.
      setValeurs((v) => ({ ...v, [champ]: confirmees.current[champ] }));
      setEtat("echec");
      setChampsEnEchec((precedents) =>
        precedents.includes(champ) ? precedents : [...precedents, champ],
      );
    },
    [],
  );

  const envoyer = useCallback(
    (champ: keyof ValeursCommande, valeur: string): void => {
      compteur.current += 1;
      const demande = compteur.current;
      derniereDemande.current.set(champ, demande);
      setEtat("encours");

      void enregistrerChamp(id, champ, valeur)
        .then((resultat) => {
          if (derniereDemande.current.get(champ) !== demande) return;
          appliquer(champ, valeur, resultat);
        })
        .catch(() => {
          if (derniereDemande.current.get(champ) !== demande) return;
          appliquer(champ, valeur, { statut: "echec", motif: "ecriture", champ });
        });
    },
    [id, appliquer],
  );

  const changer = useCallback(
    (champ: keyof ValeursCommande, valeur: string, immediat: boolean): void => {
      setValeurs((v) => ({ ...v, [champ]: valeur }));

      const enCours = minuteries.current.get(champ);
      if (enCours !== undefined) window.clearTimeout(enCours);

      if (immediat) {
        envoyer(champ, valeur);
        return;
      }

      minuteries.current.set(
        champ,
        window.setTimeout(() => envoyer(champ, valeur), DELAI_TEXTE_MS),
      );
    },
    [envoyer],
  );

  const champ =
    "champ-editeur w-full rounded-lg px-4 py-3 font-body-md text-body-md text-on-surface";
  const etiquette = "mb-2 block font-label-sm text-label-sm text-on-surface-variant";

  return (
    <>
      <TemoinSauvegarde etat={etat} champs={champsEnEchec} />

      <div className="mx-auto grid max-w-[1000px] grid-cols-1 gap-8 lg:grid-cols-12">
        <div className="flex flex-col gap-6 lg:col-span-8">
          <section className="glass-card rounded-xl p-6 shadow-sm">
            <h2 className="mb-6 font-label-md text-label-md tracking-wider text-on-surface uppercase">
              {t("sectionCommande")}
            </h2>

            <div className="flex flex-col gap-5">
              <div>
                <label className={etiquette} htmlFor="product_ref">
                  {t("reference")}
                </label>
                <input
                  id="product_ref"
                  type="text"
                  className={champ}
                  placeholder={t("referenceExemple")}
                  value={valeurs.product_ref}
                  onChange={(e) => changer("product_ref", e.target.value, false)}
                />
              </div>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div>
                  <label className={etiquette} htmlFor="tracking_number">
                    {t("suivi")}
                  </label>
                  <div className="relative">
                    <Icone
                      nom="local_shipping"
                      className="pointer-events-none absolute top-3.5 left-3 text-[20px] text-on-surface-variant"
                    />
                    <input
                      id="tracking_number"
                      type="text"
                      className={champ + " pl-10"}
                      placeholder={t("suiviExemple")}
                      value={valeurs.tracking_number}
                      onChange={(e) => changer("tracking_number", e.target.value, false)}
                    />
                  </div>
                </div>

                <div>
                  <label className={etiquette} htmlFor="carrier_code">
                    {t("transporteur")}
                  </label>
                  <input
                    id="carrier_code"
                    type="text"
                    className={champ}
                    placeholder={t("transporteurExemple")}
                    value={valeurs.carrier_code}
                    onChange={(e) => changer("carrier_code", e.target.value, false)}
                  />
                </div>
              </div>

              <div>
                <label className={etiquette} htmlFor="internal_notes">
                  {t("notes")}
                </label>
                <textarea
                  id="internal_notes"
                  rows={4}
                  className={champ + " resize-none"}
                  placeholder={t("notesExemple")}
                  value={valeurs.internal_notes}
                  onChange={(e) => changer("internal_notes", e.target.value, false)}
                />
                <p className="mt-2 flex items-center gap-1.5 font-body-sm text-body-sm text-on-surface-variant">
                  <Icone nom="lock" className="text-[16px]" />
                  {t("notesPrivees")}
                </p>
              </div>
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-6 lg:col-span-4">
          <section className="glass-card rounded-xl p-6 shadow-sm">
            <h2 className="mb-6 font-label-md text-label-md tracking-wider text-on-surface uppercase">
              {t("sectionDestinataire")}
            </h2>

            {/* CORRECTION OBLIGATOIRE SUR LA MAQUETTE : elle montre une
                recherche de compte client avec avatar et adresse email. Le
                destinataire n'a JAMAIS de compte — c'est un texte libre, un
                pseudo. Une recherche laisserait croire qu'il existe un annuaire
                d'utilisateurs, et le premier réflexe serait d'y chercher
                quelqu'un. */}
            <label className={etiquette} htmlFor="customer_label">
              {t("client")}
            </label>
            <input
              id="customer_label"
              type="text"
              className={champ}
              placeholder={t("clientExemple")}
              value={valeurs.customer_label}
              onChange={(e) => changer("customer_label", e.target.value, false)}
            />
            <p className="mt-2 font-body-sm text-body-sm text-on-surface-variant">
              {t("clientAide")}
            </p>
          </section>

          <ChoixRadio
            titre={t("sectionExpedition")}
            nom="status"
            options={statuts}
            valeur={valeurs.status}
            libelle={(v) => t("statut." + v)}
            onChoix={(v) => changer("status", v, true)}
          />

          <ChoixRadio
            titre={t("sectionQc")}
            nom="qc_status"
            options={qcs}
            valeur={valeurs.qc_status}
            libelle={(v) => t("qc." + v)}
            onChoix={(v) => changer("qc_status", v, true)}
          />
        </div>
      </div>
    </>
  );
}

/**
 * Le témoin de sauvegarde, à TROIS états.
 *
 * Le troisième n'est pas décoratif : « échec » sans nommer le champ oblige à
 * relire tout le formulaire pour trouver ce qui n'est pas passé, et la plupart
 * des gens ne le font pas — ils supposent que c'était secondaire.
 */
function TemoinSauvegarde({
  etat,
  champs,
}: {
  readonly etat: Etat;
  readonly champs: readonly string[];
}) {
  const t = useTranslations("editeur");

  const contenu =
    etat === "encours"
      ? { icone: "schedule" as const, texte: t("enregistrement"), classe: "text-on-surface-variant" }
      : etat === "echec"
        ? {
            icone: "warning" as const,
            texte: t("echec", {
              champs: champs.map((c) => t("nomChamp." + c)).join(", "),
            }),
            classe: "text-error",
          }
        : { icone: "done" as const, texte: t("enregistre"), classe: "text-on-surface-variant" };

  return (
    <p
      // `polite` et non `assertive` : le témoin change à chaque frappe
      // temporisée, une annonce impérative couperait la parole en continu.
      aria-live="polite"
      className={"mb-6 flex items-center justify-end gap-1.5 font-label-sm text-label-sm " + contenu.classe}
    >
      <Icone nom={contenu.icone} className="text-[16px]" />
      {contenu.texte}
    </p>
  );
}

function ChoixRadio({
  titre,
  nom,
  options,
  valeur,
  libelle,
  onChoix,
}: {
  readonly titre: string;
  readonly nom: string;
  readonly options: readonly string[];
  readonly valeur: string;
  readonly libelle: (v: string) => string;
  readonly onChoix: (v: string) => void;
}) {
  return (
    <section className="glass-card rounded-xl p-6 shadow-sm">
      <h2 className="mb-6 font-label-md text-label-md tracking-wider text-on-surface uppercase">
        {titre}
      </h2>
      <div className="flex flex-col gap-3">
        {options.map((option) => (
          <label
            key={option}
            className={
              "flex cursor-pointer items-center rounded-lg border border-outline-variant/50 p-3 transition-colors hover:bg-surface-container-lowest " +
              (valeur === option ? "bg-surface-container-lowest" : "bg-transparent")
            }
          >
            <input
              type="radio"
              name={nom}
              value={option}
              checked={valeur === option}
              onChange={() => onChoix(option)}
              className="h-4 w-4 accent-[var(--accent-interface)]"
            />
            <span className="ml-3 font-body-md text-body-md font-medium text-on-surface">
              {libelle(option)}
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}
