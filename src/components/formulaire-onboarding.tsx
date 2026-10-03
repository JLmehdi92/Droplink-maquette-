"use client";

import { ACCEPT_LOGO } from "@/lib/boutique/types-logo";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { secouer } from "@/components/acces/validation-locale";
import { useTranslations } from "next-intl";
import { CircleCheck, Images, MessageCircle, Upload, Users } from "lucide-react";
import { ApercuPageClient } from "@/components/marque/apercu-page-client";
import { supprimerLogo } from "@/app/[locale]/(app)/marque/actions";
import type { LibellesApercu } from "@/lib/boutique/phrases-apercu";
import {
  confirmerDepotLogo,
  preparerDepotLogo,
  terminerOnboarding,
  type ResultatOnboarding,
} from "@/app/[locale]/bienvenue/actions";
import { ACCENT_DEFAUT, resoudreAccent } from "@/lib/design/contraste";
import { BoutonPrincipalDs, MessageErreurDs } from "@/components/acces-champs";

/**
 * L'ONBOARDING — `OnboardingScreen` du kit `auth`, écrit le 14/09/2026 avant ce
 * formulaire. Il portait encore l'ancien canevas : cadre lavande, carte-page à
 * rayon 28, bouton noir, bandeau d'aperçu à la couleur du vendeur — une page
 * client qui n'existe plus.
 *
 * LE FORMULAIRE REND LES DEUX COLONNES : l'aperçu dépend de ce qu'on est en
 * train de saisir, donc il ne peut pas vivre dans un composant serveur qui ne
 * verra jamais ces frappes.
 *
 * ⚠️ « PASSER POUR L'INSTANT » N'EXISTE PAS, ni dans le kit ni ici.
 * `onboardingAFaire()` répond « oui » tant que `account_type` est nul — et cette
 * colonne est NULLABLE SANS DÉFAUT exprès, pour que le manque soit visible. Passer
 * reboucherait sur cette page ; l'honorer demanderait un état « a refusé de
 * répondre », qui fausserait la segmentation que la colonne existe pour mesurer.
 */

const INITIAL: ResultatOnboarding = { statut: "inactif" };

/** Les couleurs rapides de la maquette (`.onb-couleur__vite`) : des départs, pas une palette imposée. */
const COULEURS_RAPIDES = [
  ["#5B4BF5", "couleurs.violet"],
  ["#0F766E", "couleurs.sapin"],
  ["#E5484D", "couleurs.corail"],
  ["#0B0B18", "couleurs.encre"],
  ["#D97706", "couleurs.ambre"],
] as const;

type EtatLogo =
  | { phase: "vide" }
  | { phase: "envoi"; pourcent: number }
  | { phase: "pose"; apercu: string; nom: string; octets: number }
  | { phase: "erreur"; motif: string };

/*
 * LES CLÉS SONT ÉCRITES EN TOUTES LETTRES : l'inventaire des chaînes mortes lit
 * les appels du code, et une clé composée à l'exécution lui échappe.
 */
const TYPES = [
  { valeur: "supplier", icone: Users, titre: "type.supplier.titre", detail: "type.supplier.detail" },
  { valeur: "reseller", icone: MessageCircle, titre: "type.reseller.titre", detail: "type.reseller.detail" },
] as const;

export function FormulaireOnboarding({
  locale,
  languePage,
  libelles,
}: {
  readonly locale: string;
  /** La langue de la page client (l'anglais par défaut), celle de l'aperçu. */
  readonly languePage: string;
  readonly libelles: LibellesApercu;
}) {
  const t = useTranslations("onboarding");
  const [resultat, action] = useActionState(terminerOnboarding, INITIAL);

  const [typeDeCompte, setTypeDeCompte] = useState<"supplier" | "reseller" | "">("");
  // « Choisissez à qui vous vendez » dit avant l'envoi (maquette, `compte.js`) ; le
  // serveur le refuse aussi, et son refus secoue le même groupe.
  const [typeManquant, setTypeManquant] = useState(false);
  const choixType = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (resultat.statut === "erreur" && resultat.motif === "saisie") secouer(choixType.current);
  }, [resultat]);
  const [nom, setNom] = useState("");
  const [couleur, setCouleur] = useState(ACCENT_DEFAUT);
  const [logo, setLogo] = useState<EtatLogo>({ phase: "vide" });
  // L'aperçu local est une URL `blob:` : elle retient le fichier en mémoire tant
  // qu'on ne la libère pas. Libérée quand l'aperçu change ou que l'écran se
  // démonte (audit ECC du 24/09/2026 — elle ne l'était jamais).
  const apercuLocal = logo.phase === "pose" ? logo.apercu : null;
  useEffect(() => {
    if (apercuLocal === null) return;
    return () => URL.revokeObjectURL(apercuLocal);
  }, [apercuLocal]);

  const accent = useMemo(() => resoudreAccent(couleur), [couleur]);

  // ⚠️ `session` EST AUSSI UN MOTIF DE REFUS DU DÉPÔT, et la clé composée
  // `logoErreur.${motif}` ne l'avait pas : une session expirée affichait
  // l'identifiant de traduction brut à la place d'une phrase.
  const erreurLogo = {
    type: t("logoErreur.type"),
    taille: t("logoErreur.taille"),
    session: t("erreurSession"),
  } as const;

  async function deposerLogo(fichier: File): Promise<void> {
    setLogo({ phase: "envoi", pourcent: 0 });

    const prepare = await preparerDepotLogo(fichier.type, fichier.size);
    if (prepare.statut === "erreur") {
      setLogo({ phase: "erreur", motif: erreurLogo[prepare.motif] });
      return;
    }

    // Dépôt DIRECT navigateur → stockage, par URL présignée : une Server Action
    // plafonne son corps à 1 Mo, et un logo le dépasse vite.
    const envoi = await new Promise<boolean>((resoudre) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", prepare.url, true);
      for (const [nomEnTete, valeur] of Object.entries(prepare.enTetes)) {
        // Le navigateur pose lui-même la longueur ; la forcer lève une erreur.
        if (nomEnTete.toLowerCase() === "content-length") continue;
        xhr.setRequestHeader(nomEnTete, valeur);
      }
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setLogo({ phase: "envoi", pourcent: Math.round((e.loaded / e.total) * 100) });
        }
      };
      xhr.onload = () => resoudre(xhr.status >= 200 && xhr.status < 300);
      xhr.onerror = () => resoudre(false);
      xhr.send(fichier);
    });

    if (!envoi) {
      setLogo({ phase: "erreur", motif: t("logoErreur.envoi") });
      return;
    }

    // La taille est RELUE côté serveur : le navigateur n'est jamais cru sur ce
    // qu'il affirme avoir envoyé.
    const confirme = await confirmerDepotLogo(prepare.cle);
    if (confirme.statut === "erreur") {
      setLogo({ phase: "erreur", motif: t("logoErreur.confirmation") });
      return;
    }

    setLogo({
      phase: "pose",
      apercu: URL.createObjectURL(fichier),
      nom: fichier.name,
      octets: fichier.size,
    });
  }

  const champsEnEchec =
    resultat.statut === "erreur" && resultat.motif === "saisie" ? (resultat.champs ?? []) : [];

  /* LA REFONTE (02/10/2026) suit `bienvenue.html` : le formulaire à gauche, la VRAIE
     grammaire de la page client à droite (`ApercuPageClient`, celle de « Ma marque »), aux
     couleurs que `resoudreAccent()` donnera réellement au client. */
  return (
    <form
      action={action}
      className="onb__grille"
      noValidate
      onSubmit={(e) => {
        if (typeDeCompte !== "") return;
        e.preventDefault();
        setTypeManquant(true);
        secouer(choixType.current);
        choixType.current?.querySelector("input")?.focus();
      }}
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="couleurAccent" value={couleur} />

      <div className="onb__form">
        <header className="acces__tete">
          <h1 tabIndex={-1}>{t("titre")}</h1>
          <p>{t("sousTitre")}</p>
        </header>

        <div className="onb-champ">
          <label htmlFor="nom">{t("nomTitre")}</label>
          <input
            id="nom"
            name="nom"
            type="text"
            maxLength={60}
            autoComplete="organization"
            placeholder={t("nomPlaceholder")}
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            aria-invalid={champsEnEchec.includes("nomBoutique") ? true : undefined}
          />
        </div>

        <div className="onb-champ">
          <span className="onb-champ__titre" id="onb-logo-titre">
            {t("logoTitre")}
          </span>
          <div className="onb-logo">
            <span className="onb-logo__visuel" aria-hidden="true">
              {logo.phase === "pose" ? (
                // eslint-disable-next-line @next/next/no-img-element -- aperçu local (blob:), hors optimiseur d'images
                <img src={logo.apercu} alt="" />
              ) : (
                <Images className="ic" />
              )}
            </span>
            <div className="onb-logo__actions">
              {/* Le dépôt est un `<label>` autour du champ fichier : un clic ou Entrée l'ouvre. */}
              <label className="bouton-outil onb-logo__choisir">
                <input
                  type="file"
                  accept={ACCEPT_LOGO}
                  className="sr"
                  aria-labelledby="onb-logo-titre"
                  onChange={(e) => {
                    const fichier = e.target.files?.[0];
                    e.target.value = "";
                    if (fichier !== undefined) void deposerLogo(fichier);
                  }}
                />
                <Upload aria-hidden="true" className="ic" />
                <span>
                  {logo.phase === "envoi"
                    ? t("logoEnvoi", { pourcent: logo.pourcent })
                    : logo.phase === "pose"
                      ? t("logoRemplacer")
                      : t("logoChoisir")}
                </span>
              </label>
              {logo.phase === "pose" ? (
                <button
                  type="button"
                  className="onb-lien"
                  onClick={() => {
                    // Le logo est DÉJÀ enregistré sur la boutique (`confirmerDepotLogo`) :
                    // le retirer de l'écran seulement laisserait la page client le
                    // montrer (contrainte 8). On ne l'efface qu'une fois la base d'accord.
                    void supprimerLogo().then((retrait) =>
                      setLogo(retrait.statut === "ok" ? { phase: "vide" } : { phase: "erreur", motif: t("logoErreur.retrait") }),
                    );
                  }}
                >
                  {t("logoRetirer")}
                </button>
              ) : null}
              <small>{logo.phase === "pose" ? logo.nom : t("logoFormats")}</small>
            </div>
          </div>
          {logo.phase === "erreur" ? (
            <p role="alert" className="champ-acces__erreur">
              {logo.motif}
            </p>
          ) : null}
        </div>

        <div className="onb-champ">
          <label htmlFor="couleurTexte">{t("couleurTitre")}</label>
          <div className="onb-couleur">
            <label className="couleur__pastille" style={{ background: couleur }}>
              <span className="sr">{t("couleurChoisir")}</span>
              <input type="color" value={couleur} onChange={(e) => setCouleur(e.target.value)} />
            </label>
            <input
              id="couleurTexte"
              type="text"
              value={couleur}
              maxLength={7}
              spellCheck={false}
              autoComplete="off"
              aria-invalid={champsEnEchec.includes("couleurAccent") ? true : undefined}
              aria-describedby={champsEnEchec.includes("couleurAccent") ? "erreur-couleur" : undefined}
              onChange={(e) => {
                // « 0F766E » sans dièse est une couleur : on le pose, comme la maquette,
                // plutôt que de laisser la base la refuser sans un mot.
                const v = e.target.value.trim();
                setCouleur(/^[0-9a-fA-F]{6}$/.test(v) ? "#" + v : v);
              }}
            />
            <div className="onb-couleur__vite" role="group" aria-label={t("couleursRapides")}>
              {COULEURS_RAPIDES.map(([valeur, cle]) => (
                <button
                  key={valeur}
                  type="button"
                  style={{ "--c": valeur } as React.CSSProperties}
                  aria-label={t(cle)}
                  aria-pressed={couleur.toLowerCase() === valeur.toLowerCase()}
                  onClick={() => setCouleur(valeur)}
                />
              ))}
            </div>
          </div>
          {/* L'AJUSTEMENT EST DIT D'AVANCE : un avertissement « couleur ajustée » s'afficherait
              avant que le vendeur ait rien choisi, sur la couleur par défaut. */}
          <p className="onb-aide">{t("couleurAide")}</p>
          {champsEnEchec.includes("couleurAccent") ? (
            <p role="alert" id="erreur-couleur" className="champ-acces__erreur">
              {t("erreurCouleur")}
            </p>
          ) : null}
        </div>

        {/* LA SEULE COLONNE SANS VALEUR PAR DÉFAUT EN BASE : un défaut aurait classé tous
            les fournisseurs comme revendeurs, et faussé la segmentation d'usage. */}
        <fieldset className="onb-champ onb-type">
          <legend className="onb-champ__titre">{t("typeTitre")}</legend>
          <div className="onb-type__choix" ref={choixType}>
            {TYPES.map((type) => {
              const Icone = type.icone;
              return (
                <label key={type.valeur} className="onb-carte">
                  <input
                    type="radio"
                    name="typeDeCompte"
                    value={type.valeur}
                    checked={typeDeCompte === type.valeur}
                    onChange={() => {
                      setTypeDeCompte(type.valeur);
                      setTypeManquant(false);
                    }}
                  />
                  <span className="onb-carte__icone" aria-hidden="true">
                    <Icone className="ic" />
                  </span>
                  <b>{t(type.titre)}</b>
                  <small>{t(type.detail)}</small>
                  <CircleCheck aria-hidden="true" className="ic onb-carte__coche" />
                </label>
              );
            })}
          </div>
          {typeManquant || (champsEnEchec.includes("typeDeCompte") && typeDeCompte === "") ? (
            <p role="alert" className="champ-acces__erreur">
              {t("erreurType")}
            </p>
          ) : null}
        </fieldset>

        {resultat.statut === "erreur" && resultat.motif !== "saisie" ? (
          <MessageErreurDs
            id="erreur-onboarding"
            texte={resultat.motif === "session" ? t("erreurSession") : t("erreurEcriture")}
          />
        ) : null}

        <BoutonPrincipalDs libelle={t("valider")} libelleEnCours={t("validationEnCours")} />
      </div>

      {/* L'APERÇU, MASQUÉ SOUS 1 020 px : il ne porte aucune information dont le formulaire
          dépende, et au téléphone il repousserait le bouton sous trois écrans. */}
      <section className="onb__apercu" aria-label={t("apercuTitre")}>
        <p className="onb__apercu-titre">
          <span className="direct">
            <i aria-hidden="true" />
          </span>
          {t("apercuTitre")}
        </p>
        <div className="telephone telephone--onb" aria-hidden="true">
          <div className="telephone__ecran">
            <ApercuPageClient
              textes={libelles.page}
              pour={libelles.pourGenerique}
              nom={nom.trim()}
              description=""
              logo={logo.phase === "pose" ? logo.apercu : null}
              accent={accent}
              reseaux={[]}
              marqueMasquee={false}
              langue={languePage}
              nomProvisoire={t("nomProvisoire")}
              accueil
            />
          </div>
        </div>
      </section>
    </form>
  );
}
