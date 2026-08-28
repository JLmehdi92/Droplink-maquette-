"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import {
  confirmerDepotLogo,
  preparerDepotLogo,
  terminerOnboarding,
  type ResultatOnboarding,
} from "@/app/[locale]/bienvenue/actions";
import { ACCENT_DEFAUT, resoudreAccent } from "@/lib/design/contraste";
import { Icone } from "@/components/icone";

/**
 * L'ONBOARDING, porté sur `Onboarding` et `OnboardingMobile`.
 *
 * ⚠️ CE COMMENTAIRE DÉCRIVAIT UN AUTRE ÉCRAN. Il annonçait une grille bento,
 * des cartes de verre, des pastilles de teintes suggérées et un aperçu en
 * pleine largeur — la maquette Stitch des réglages de marque, faute d'écran
 * d'onboarding dans le zip. Le canevas en dessine un : deux colonnes, les
 * réglages à gauche et l'aperçu du téléphone à droite, en direct.
 *
 * LE COMPOSANT REND LES DEUX COLONNES, et pas seulement le formulaire. L'aperçu
 * dépend de ce qu'on est en train de saisir : il ne peut pas vivre dans un
 * composant serveur qui ne verra jamais ces frappes.
 *
 * DEUX CHAMPS QUE LA PLANCHE PARTAGE AVEC LE PRODUIT, et une raison pour
 * chacun :
 *
 * 1. LE TYPE DE COMPTE est la seule colonne sans valeur par défaut en base. Un
 *    défaut aurait classé tous les fournisseurs comme revendeurs et faussé
 *    irrémédiablement la segmentation d'usage, qui est le livrable réel de la
 *    phase de validation.
 * 2. LE NOM DE BOUTIQUE reste FACULTATIF : la page publique omet son en-tête
 *    quand il n'y a ni nom ni logo, et un vendeur peut envoyer un lien sans
 *    avoir rien configuré.
 *
 * L'APERÇU MONTRE LE CONTRASTE RÉSOLU, pas la couleur brute — sur un aplat
 * d'accent le texte prend `surRemplissage`, jamais `#ffffff` en dur. Le brief
 * exige que la conformité soit obtenue automatiquement, « sans que le vendeur
 * ait à chercher une couleur qui marche ».
 *
 * Le dépôt du logo va DIRECTEMENT du navigateur à R2 : les Server Actions ont
 * une limite de corps d'un mégaoctet, et le piège est vicieux parce qu'il PASSE
 * en développement sur de petites images de test.
 */

const INITIAL: ResultatOnboarding = { statut: "inactif" };

/** Le libellé d'un champ, tel que les planches le posent : 13/600, 8 px de marge. */
const LIBELLE = "mb-2 block font-headline-md text-[13px] leading-4 font-semibold text-on-surface";

/** Le champ des planches : rayon 13, bordure et fond nommés, 15 px en Inter. */
const CHAMP =
  "w-full rounded-[13px] border border-filet-controle bg-surface-container-low px-[15px] font-body-md text-[15px] text-on-surface transition-colors focus:border-violet focus:outline-none focus:ring-2 focus:ring-violet/30";



function BoutonValider({ libelle, enCours }: { libelle: string; enCours: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      // ⚠️ LE BOUTON EST NOIR, PAS À LA COULEUR DU VENDEUR. Il portait
      // `--apercu-remplissage` : l'accent qu'on est en train de choisir se
      // serait donc appliqué au bouton de NOTRE écran d'accueil, et il aurait
      // changé de couleur pendant qu'on règle la sienne. La planche y pose la
      // pilule noire du canevas — l'action neutre.
      className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 self-start rounded-[13px] bg-primary px-[26px] font-headline-md text-[15px] leading-5 font-bold text-on-primary transition-opacity hover:opacity-90 disabled:opacity-60 md:h-[50px] md:min-h-0 md:w-auto"
    >
      {pending ? enCours : libelle}
      {pending ? null : <Icone nom="arrow_forward" className="text-[15px]" />}
    </button>
  );
}

type EtatLogo =
  | { phase: "vide" }
  | { phase: "envoi"; pourcent: number }
  | { phase: "pose"; apercu: string; nom: string; octets: number }
  | { phase: "erreur"; motif: string };

export function FormulaireOnboarding({ locale }: { locale: string }) {
  const t = useTranslations("onboarding");
  const [resultat, action] = useActionState(terminerOnboarding, INITIAL);

  const [typeDeCompte, setTypeDeCompte] = useState<"supplier" | "reseller" | "">("");
  const [nom, setNom] = useState("");
  const [couleur, setCouleur] = useState(ACCENT_DEFAUT);
  const [logo, setLogo] = useState<EtatLogo>({ phase: "vide" });
  const champFichier = useRef<HTMLInputElement>(null);

  const accent = useMemo(() => resoudreAccent(couleur), [couleur]);

  async function deposerLogo(fichier: File): Promise<void> {
    setLogo({ phase: "envoi", pourcent: 0 });

    const prepare = await preparerDepotLogo(fichier.type, fichier.size);
    if (prepare.statut === "erreur") {
      setLogo({ phase: "erreur", motif: t(`logoErreur.${prepare.motif}`) });
      return;
    }

    // `XMLHttpRequest` et non `fetch` : c'est la seule API qui rapporte la
    // progression d'un envoi. Sur une connexion lente — le cas du fournisseur en
    // Chine — une barre qui n'avance pas se lit comme une panne.
    const envoi = await new Promise<boolean>((resoudre) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", prepare.url, true);
      for (const [nomEnTete, valeur] of Object.entries(prepare.enTetes)) {
        // `content-length` est un en-tête interdit au script : le navigateur le
        // calcule lui-même depuis le corps. On ne pose donc que ce qu'on a le
        // droit de poser, et la valeur calculée doit coïncider avec celle qui a
        // été signée.
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

    // On n'affirme le succès qu'APRÈS confirmation du serveur, qui relit la
    // taille réelle. Annoncer avant serait un pari sur le serveur, et un pari
    // perdu laisserait le vendeur croire son logo posé.
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

  return (
    <form
      action={action}
      className="flex min-h-[calc(100dvh-24px)] flex-col md:min-h-[calc(100dvh-56px)] md:grid md:grid-cols-[1.05fr_0.95fr]"
      style={
        {
          "--apercu-remplissage": accent.remplissage,
          "--apercu-sur-remplissage": accent.surRemplissage,
        } as React.CSSProperties
      }
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="couleurAccent" value={couleur} />

      {/* ================= LES RÉGLAGES ================================== */}
      <div className="flex flex-col px-5 pt-[22px] pb-5 md:px-16 md:py-10">
        <div className="mb-[18px] flex items-center justify-between gap-4 md:mb-10">
          <span className="font-headline-md text-[17px] leading-[22px] font-extrabold tracking-[-0.02em] text-on-surface md:text-[18px] md:leading-[23px]">
            DropLink
          </span>
          {/* ⚠️ « ÉTAPE 1 SUR 2 » EST VRAI, ET C'EST À VÉRIFIER AVANT DE
              L'ÉCRIRE. La seconde étape est la première commande : c'est là que
              mène « Continuer », et l'écran d'arrivée n'affiche rien d'autre
              qu'une invitation à la créer. Un compteur d'étapes qui promet une
              suite inexistante serait exactement ce que le principe XII
              interdit — affirmer ce qui n'est pas. */}
          <span className="font-body-sm text-[13px] leading-4 text-sourdine">{t("etape")}</span>
        </div>

        <div aria-hidden="true" className="mb-[26px] grid grid-cols-2 gap-1.5 md:mb-[34px]">
          <span
            className="h-1 rounded-full"
            style={{ backgroundColor: "var(--apercu-remplissage)" }}
          />
          <span className="h-1 rounded-full bg-outline-variant" />
        </div>

        <h1 className="mb-2 font-headline-xl text-[28px] leading-[33px] font-extrabold tracking-[-0.03em] text-on-surface md:text-[34px] md:leading-10">
          {t("titre")}
        </h1>
        <p className="mb-6 font-body-md text-[15px] leading-[23px] text-sourdine md:mb-8 md:leading-6">
          {t("sousTitre")}
        </p>

        {/* --- Le nom de la boutique ------------------------------------ */}
        <label htmlFor="nom" className={LIBELLE}>
          {t("nomTitre")}
        </label>
        <input
          id="nom"
          name="nom"
          type="text"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          placeholder={t("nomPlaceholder")}
          aria-invalid={champsEnEchec.includes("nom") ? true : undefined}
          className={CHAMP + " h-[50px]"}
        />

        {/* --- Le logo -------------------------------------------------- */}
        <span className={LIBELLE + " mt-5 md:mt-[22px]"}>{t("logoTitre")}</span>
        <div className="flex items-center gap-[13px] md:gap-3.5">
          {logo.phase === "pose" ? (
            // eslint-disable-next-line @next/next/no-img-element -- aperçu local (blob:)
            <img
              src={logo.apercu}
              alt=""
              className="h-14 w-14 shrink-0 rounded-[15px] border border-outline-variant bg-surface-container-lowest object-contain p-1.5"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[15px] border border-dashed border-filet-pastille bg-fond-neutre"
            >
              <Icone nom="add" className="text-[20px] text-gris-inactif" />
            </span>
          )}
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => champFichier.current?.click()}
              className="min-h-11 rounded-[12px] border border-filet-controle bg-surface-container-lowest px-4 font-headline-md text-[14px] leading-[18px] font-semibold text-on-surface transition-colors hover:bg-fond-neutre md:min-h-0 md:h-10 md:rounded-[11px]"
            >
              {logo.phase === "envoi"
                ? t("logoEnvoi", { pourcent: logo.pourcent })
                : logo.phase === "pose"
                  ? t("logoRemplacer")
                  : t("logoChoisir")}
            </button>
            <p className="mt-[7px] hidden truncate font-body-sm text-[12px] leading-[15px] text-sourdine md:block">
              {logo.phase === "pose" ? logo.nom : t("logoFormats")}
            </p>
          </div>
          {logo.phase === "pose" ? (
            <button
              type="button"
              onClick={() => setLogo({ phase: "vide" })}
              className="shrink-0 text-sourdine transition-colors hover:text-alerte"
            >
              <Icone nom="close" titre={t("logoRetirer")} className="text-[20px]" />
            </button>
          ) : null}
        </div>
        {logo.phase === "erreur" ? (
          <p role="alert" className="mt-2 font-body-sm text-[13px] text-error">
            {logo.motif}
          </p>
        ) : null}

        {/* --- La couleur ----------------------------------------------- */}
        <span className={LIBELLE + " mt-5 md:mt-[22px]"}>{t("couleurTitre")}</span>
        <div className="mb-2 flex items-center gap-2.5 md:mb-0 md:flex-wrap">
          <label
            className="h-[46px] w-[46px] shrink-0 cursor-pointer rounded-[13px] border border-black/[0.06] md:h-11 md:w-11 md:rounded-[12px]"
            style={{ backgroundColor: couleur }}
          >
            <span className="sr-only">{t("couleurTitre")}</span>
            <input
              type="color"
              value={couleur}
              onChange={(e) => setCouleur(e.target.value)}
              className="sr-only"
            />
          </label>
          <input
            id="couleurTexte"
            type="text"
            value={couleur}
            onChange={(e) => setCouleur(e.target.value.trim())}
            placeholder="#000000"
            aria-label={t("couleurTitre")}
            className={CHAMP + " h-[50px] font-mono text-[14px] md:h-11 md:w-[150px]"}
          />
          </div>
        <p className="font-body-sm text-[12px] leading-[18px] text-sourdine md:mt-0 md:min-w-[180px] md:flex-grow">
          {t("couleurAide")}
        </p>
        {/* ⚠️ « CETTE COULEUR A ÉTÉ AJUSTÉE » N'EST PAS RENDUE ICI, alors que
            l'écran de marque la rend. Deux raisons : la phrase d'aide
            ci-dessus, qui est celle de la planche, dit DÉJÀ que l'ajustement
            est automatique et permanent ; et elle se déclenchait sur la couleur
            PAR DÉFAUT — le violet de marque est à 4,46:1 sur blanc, donc
            ajusté — donc dès l'ouverture de l'écran, avant que le vendeur ait
            choisi quoi que ce soit. Un avertissement qui s'affiche sans qu'on
            ait rien fait est un avertissement qu'on apprend à ignorer. Sur
            l'écran de marque, où la couleur est DÉJÀ la sienne, la phrase garde
            tout son sens. */}

        {/* --- Le type de compte ---------------------------------------- */}
        <fieldset className="mt-[22px] md:mt-[26px]">
          {/* LA SEULE COLONNE SANS VALEUR PAR DÉFAUT EN BASE. Un défaut aurait
              classé tous les fournisseurs comme revendeurs et faussé
              irrémédiablement la segmentation d'usage, qui est le livrable réel
              de la phase de validation. */}
          <legend className={LIBELLE}>{t("typeTitre")}</legend>
          <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
            {(["supplier", "reseller"] as const).map((valeur) => (
              <label
                key={valeur}
                className={
                  "cursor-pointer rounded-[15px] border bg-surface-container-lowest p-4 transition-colors " +
                  (typeDeCompte === valeur
                    ? "border-[var(--apercu-remplissage)] ring-[3px] ring-[color-mix(in_srgb,var(--apercu-remplissage)_14%,transparent)]"
                    : "border-filet-controle hover:bg-fond-neutre")
                }
              >
                <input
                  type="radio"
                  name="typeDeCompte"
                  value={valeur}
                  checked={typeDeCompte === valeur}
                  onChange={() => setTypeDeCompte(valeur)}
                  className="sr-only"
                />
                <span className="mb-[3px] block font-headline-md text-[15px] leading-[19px] font-bold text-on-surface md:mb-1">
                  {t(`type.${valeur}.titre`)}
                </span>
                <span className="block font-body-sm text-[13px] leading-[19px] text-sourdine">
                  {t(`type.${valeur}.detail`)}
                </span>
              </label>
            ))}
          </div>
          {champsEnEchec.includes("typeDeCompte") ? (
            <p role="alert" className="mt-2 font-body-sm text-[13px] text-error">
              {t("erreurType")}
            </p>
          ) : null}
        </fieldset>

        <input
          ref={champFichier}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="sr-only"
          onChange={(e) => {
            const fichier = e.target.files?.[0];
            if (fichier !== undefined) void deposerLogo(fichier);
          }}
        />

        {resultat.statut === "erreur" && resultat.motif !== "saisie" ? (
          <p role="alert" className="mt-4 font-body-sm text-[13px] text-error">
            {resultat.motif === "session" ? t("erreurSession") : t("erreurEcriture")}
          </p>
        ) : null}

        <div className="min-h-6 flex-grow md:min-h-[30px]" />

        {/* ⚠️ « PASSER POUR L'INSTANT » N'EST PAS PORTÉ. La planche dessine le
            lien ; le produit ne peut pas l'honorer. `onboardingAFaire()` répond
            « oui » tant que `account_type` est nul — et cette colonne est
            NULLABLE SANS DÉFAUT exprès, pour que le manque soit visible plutôt
            que silencieux. Passer laisserait donc la garde renvoyer ici à la
            requête suivante : un lien qui reboucle sur sa propre page. Le seul
            moyen de l'honorer serait un état « a refusé de répondre », qui
            fausserait la segmentation que cette colonne existe pour mesurer.
            ⚠️ À POSER À WASSIM. */}
        <BoutonValider libelle={t("valider")} enCours={t("validationEnCours")} />
      </div>

      {/* ================= L'APERÇU EN DIRECT ============================= */}
      {/* MASQUÉ AU TÉLÉPHONE : `OnboardingMobile` ne le dessine pas, et il ne
          porte aucune information dont le formulaire dépende. */}
      <div className="hidden bg-fond-neutre p-10 md:flex md:flex-col md:items-center md:justify-center md:rounded-r-page-publique">
        <p className="mb-6 font-body-sm text-[12px] leading-[15px] font-semibold tracking-[0.06em] text-sourdine">
          {t("apercuTitre")}
        </p>

        <div className="h-[528px] w-[292px] rounded-[38px] bg-primary p-2 shadow-[0_40px_70px_-28px_rgba(14,14,19,0.42)]">
          <div className="h-full w-full overflow-hidden rounded-[31px] bg-surface-container-lowest">
            {/* L'EN-TÊTE PORTE LA COULEUR DU VENDEUR, jamais la nôtre : c'est
                exactement ce que son client verra. Le texte prend
                `surRemplissage` et non `#ffffff` en dur — un accent clair
                rendrait le blanc illisible. */}
            <div
              className="px-4 pt-[26px] pb-5"
              style={{ backgroundColor: "var(--apercu-remplissage)" }}
            >
              <div className="flex items-center gap-2">
                {logo.phase === "pose" ? (
                  // eslint-disable-next-line @next/next/no-img-element -- aperçu local (blob:)
                  <img src={logo.apercu} alt="" className="h-6 w-6 rounded-full object-cover" />
                ) : (
                  <span
                    className="h-6 w-6 rounded-full"
                    style={{
                      backgroundColor:
                        "color-mix(in srgb, var(--apercu-sur-remplissage) 30%, transparent)",
                    }}
                  />
                )}
                <span
                  className="font-headline-md text-[12px] leading-[15px] font-bold"
                  style={{ color: "var(--apercu-sur-remplissage)" }}
                >
                  {nom.trim() === "" ? t("sansNom") : nom}
                </span>
              </div>
              <p
                className="mt-2.5 mb-0.5 font-headline-md text-[19px] leading-6 font-extrabold tracking-[-0.02em]"
                style={{ color: "var(--apercu-sur-remplissage)" }}
              >
                {t("apercuCommande")}
              </p>
              <p
                className="font-body-sm text-[12px] leading-[15px]"
                style={{
                  color: "color-mix(in srgb, var(--apercu-sur-remplissage) 78%, transparent)",
                }}
              >
                {t("apercuPour")}
              </p>
            </div>

            <div className="p-3.5">
              <div aria-hidden="true" className="mb-3.5 grid grid-cols-4 gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-[5px] rounded-full"
                    style={{ backgroundColor: "var(--apercu-remplissage)" }}
                  />
                ))}
                <span className="h-[5px] rounded-full bg-fond-barre" />
              </div>
              <div aria-hidden="true" className="mb-3.5 grid grid-cols-2 gap-1.5">
                {["#e4e2ee", "#eee4e0", "#e0e4ee", "#eaeaef"].map((teinte) => (
                  <span
                    key={teinte}
                    className="block aspect-square rounded-[10px]"
                    style={{ backgroundColor: teinte }}
                  />
                ))}
              </div>
              <div
                className="flex h-[42px] items-center justify-center rounded-[11px]"
                style={{ backgroundColor: "var(--apercu-remplissage)" }}
              >
                <span
                  className="font-headline-md text-[13px] leading-4 font-bold"
                  style={{ color: "var(--apercu-sur-remplissage)" }}
                >
                  {t("apercuApprouver")}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
