"use client";

import { ACCEPT_LOGO } from "@/lib/boutique/types-logo";

import { normaliserLien } from "@/lib/boutique/normaliser-lien";
import { useActionState, useEffect, useMemo, useState } from "react";
import { BoutonAction } from "@/components/bouton-action";
import { ArrowRight, Check, CircleAlert, CircleCheck, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { LienEcran } from "@/components/lien-ecran";
import { ApercuMarque } from "./apercu-marque";
import { LANGUES, estLangueSupportee, type Langue } from "@/i18n/config";
import type { LibellesApercu } from "@/lib/boutique/phrases-apercu";
import {
  confirmerLogo,
  enregistrerMarque,
  preparerLogo,
  supprimerLogo,
  type ResultatMarque,
} from "@/app/[locale]/(app)/marque/actions";
import { resoudreAccent } from "@/lib/design/contraste";
import { DESCRIPTION_MAX } from "@/lib/boutique/bornes";
import { logoReduit } from "@/lib/medias/vignette";
import { limites } from "@/lib/storage/limites";

/**
 * RÉGLAGES DE MARQUE — maquette de la refonte, `marque.html` : six réglages
 * numérotés à gauche, l'aperçu de la page client à droite.
 *
 * PAS DE SAUVEGARDE AUTOMATIQUE, contrairement à l'éditeur de commande : un seul
 * geste rhabille toutes les pages du vendeur, et enregistrer à chaque frappe
 * ferait défiler des couleurs intermédiaires chez ses clients.
 *
 * L'APERÇU MONTRE LE CONTRASTE RÉSOLU, jamais la couleur brute : la conformité
 * est obtenue automatiquement, sans que le vendeur cherche « une couleur qui
 * marche ». Le bouton d'enregistrement est une action DropLink, à l'accent
 * DropLink : la couleur du vendeur se démontre dans l'aperçu, pas sur nos
 * commandes.
 */

const INITIAL: ResultatMarque = { statut: "inactif" };


/**
 * LE LOGO CONFIRMÉ (celui que la base porte) et le GESTE en cours sont deux
 * états distincts : un remplacement qui échoue ne fait pas disparaître le logo
 * encore en base, et l'URL locale d'un logo posé n'est libérée que lorsqu'il
 * est réellement remplacé ou retiré (relecture du 02/10/2026).
 */
type LogoConfirme = { readonly url: string; readonly local: boolean } | null;
type GesteLogo = { readonly phase: "repos" } | { readonly phase: "envoi" } | { readonly phase: "erreur"; readonly motif: string };

export function FormulaireMarque({
  initial,
  libelles,
}: {
  /*
   * ⚠️ LES DEUX LANGUES ARRIVENT, PAS UNE. Cet écran porte le sélecteur qui
   * DÉCIDE de la langue des pages client : son aperçu doit basculer sous les
   * yeux du vendeur au moment où il choisit, sinon le réglage reste abstrait —
   * et c'est précisément ce qui a produit le malentendu du 06/09/2026. Un
   * aller-retour serveur par changement de `<select>` serait absurde pour six
   * chaînes ; les deux jeux pèsent quelques centaines d'octets.
   */
  readonly libelles: Record<Langue, LibellesApercu>;
  readonly initial: {
    readonly nom: string;
    readonly description: string;
    /** L'origine publique du site, pour le champ verrouillé de la section 5. */
    readonly origine: string;
    /**
     * Le plafond du logo, en kilo-octets, tel que la configuration le pose.
     *
     * ⚠️ IL DESCEND DU SERVEUR PLUTOT QUE D ETRE ECRIT ICI : il vient de
     * `DEPOT_LOGO_MAX_KO`, donc il change sans que ce fichier bouge. Un
     * nombre recopie dans une phrase promettrait au vendeur une limite que
     * le depot refuserait — et il ne le decouvrirait qu au refus.
     */
    readonly plafondLogoKo: number;
    readonly couleur: string;
    readonly languePublique: Langue;
    readonly filigrane: boolean;
    /** Le compte est Pro : seul cas où l'interrupteur de la section 6 s'ouvre. */
    readonly planPro: boolean;
    readonly marqueMasquee: boolean;
    /**
     * Le nom de lien deja pose, chaine vide s'il n'y en a pas.
     *
     * ⚠️ IL EST RENDU MEME EN GRATUIT. Un compte retrograde garde son nom,
     * qui continue de servir ses liens deja envoyes : le lui cacher lui
     * ferait croire qu'il l'a perdu.
     */
    readonly nomDeLien: string;
    /**
     * L'adresse de l'ecran « Passer au Pro », resolue COTE SERVEUR.
     *
     * ⚠️ ELLE N'EST PAS FABRIQUEE ICI. Ce composant connait la langue des
     * PAGES CLIENT (celle que le vendeur choisit pour ses clients), qui
     * n'est pas celle de son interface : construire le lien avec elle
     * enverrait un vendeur francais sur l'ecran en chinois parce qu'il a
     * regle ses pages client en chinois.
     */
    readonly lienPasserPro: string;
    readonly logoUrl: string | null;
    readonly reseaux: {
      readonly instagram: string | null;
      readonly tiktok: string | null;
      readonly whatsapp: string | null;
      readonly site: string | null;
    };
  };
}) {
  const t = useTranslations("marque");
  const [resultat, action] = useActionState(enregistrerMarque, INITIAL);

  const [nom, setNom] = useState(initial.nom);
  /*
   * L'ORIGINE MONTRÉE DANS LE CHAMP VERROUILLÉ DE LA SECTION 5.
   *
   * ⚠️ ELLE VIENT DU SERVEUR, jamais de `window.location` : cet écran est un
   * îlot client, et lire l'origine du navigateur ferait afficher
   * `localhost:3000` sur une capture de développement et le domaine réel
   * ailleurs — deux vérités pour un seul texte. Vide, on n'affiche que la
   * barre oblique plutôt qu'un domaine inventé.
   */
  const origineLisible =
    initial.origine === "" ? "/" : initial.origine.replace(/^https?:\/\//, "") + "/";
  const [description, setDescription] = useState(initial.description);
  const [couleur, setCouleur] = useState(initial.couleur);
  const [langue, setLangue] = useState<Langue>(initial.languePublique);
  /*
   * CE QUE VERRONT LES CLIENTS, dans la langue que le vendeur est en train de
   * choisir — jamais dans celle de son interface. `t(...)` reste employé partout
   * ailleurs sur cet écran : il parle au VENDEUR.
   */
  const phrasesClient = libelles[langue];
  const [filigrane, setFiligrane] = useState(initial.filigrane);
  const [masquerMarque, setMasquerMarque] = useState(initial.marqueMasquee);
  const [nomDeLien, setNomDeLien] = useState(initial.nomDeLien);
  const [logoConfirme, setLogoConfirme] = useState<LogoConfirme>(
    initial.logoUrl === null ? null : { url: initial.logoUrl, local: false },
  );
  const [gesteLogo, setGesteLogo] = useState<GesteLogo>({ phase: "repos" });
  // Une URL `blob:` vit tant que le logo qu'elle montre est le logo confirmé.
  useEffect(() => {
    if (logoConfirme === null || !logoConfirme.local) return;
    const url = logoConfirme.url;
    return () => URL.revokeObjectURL(url);
  }, [logoConfirme]);
  /*
   * LES RÉSEAUX SONT CONTRÔLÉS, et ils ne l'étaient pas.
   *
   * L'aperçu montre le pied de page du client : il doit refléter ce qui est
   * SAISI à l'instant, pas ce que la base portait au chargement. Un champ non
   * contrôlé rendrait un aperçu qui ne bouge jamais — donc un aperçu qui ment
   * sur la seule chose qu'il promet de montrer.
   */
  const [reseaux, setReseaux] = useState<Record<"instagram" | "tiktok" | "whatsapp" | "site", string>>({
    instagram: initial.reseaux.instagram ?? "",
    tiktok: initial.reseaux.tiktok ?? "",
    whatsapp: initial.reseaux.whatsapp ?? "",
    site: initial.reseaux.site ?? "",
  });
  const [survol, setSurvol] = useState(false);
  const [format, setFormat] = useState<"mobile" | "desktop">("mobile");

  const accent = useMemo(() => resoudreAccent(couleur), [couleur]);
  // La roue native n'accepte qu'un code complet à six chiffres : pendant la frappe
  // d'un code incomplet, elle garde la dernière couleur valide.
  const couleurRoue = /^#[0-9a-f]{6}$/i.test(couleur) ? couleur.toLowerCase() : accent.brut.toLowerCase();

  // UN FILIGRANE A BESOIN D'UN NOM À ÉCRIRE. La base éteint le drapeau quand il
  // n'y en a pas ; l'interface le dit AVANT plutôt que de laisser cocher une
  // case qui ne s'appliquera jamais. Un réglage qui s'active sans effet est pire
  // qu'un réglage absent.
  const filigranePossible = nom.trim() !== "";

  async function deposerLogo(fichier: File): Promise<void> {
    // Un second dépôt pendant un envoi lancerait deux PUT : le dernier gagnerait,
    // et l'écran pourrait montrer A pendant que la base porte B.
    if (gesteLogo.phase === "envoi") return;
    setGesteLogo({ phase: "envoi" });
    try {
    /*
     * LE LOGO EST RÉDUIT AVANT D'ÊTRE ENVOYÉ, et c'est le geste qui manquait.
     *
     * Mesuré le 27/08/2026 : un logo déposé partait tel quel — 1254 × 1254,
     * 1 682,9 Ko — pour être affiché en 40 px, et il était rechargé par chaque
     * client de chaque commande. Les photos, elles, reçoivent une vignette
     * depuis le premier jour ; le logo était le seul média du produit à ne
     * traverser AUCUNE réduction.
     *
     * ON ENVOIE LE RÉDUIT, PAS L'ORIGINAL, et la préparation est signée sur ses
     * caractéristiques à LUI. Signer sur l'original puis envoyer le réduit
     * ferait mentir la signature sur le type comme sur la taille.
     *
     * ÉCHEC DE RÉDUCTION = REFUS, contrairement à la vignette d'une photo. Là,
     * l'échec est sans conséquence : la photo pleine reste servie. Ici, le
     * fichier réduit EST le logo — se rabattre sur l'original ramènerait
     * exactement le défaut qu'on corrige, en silence.
     */
    const reduit = await logoReduit(fichier, limites().logoOctets);
    if (reduit === null) {
      setGesteLogo({ phase: "erreur", motif: t("logoErreur.illisible") });
      return;
    }

    const prepare = await preparerLogo(reduit.type, reduit.size);
    if (prepare.statut !== "pret") {
      setGesteLogo({ phase: "erreur", motif: t(`logoErreur.${prepare.motif}`) });
      return;
    }

    // LE FICHIER VA DIRECTEMENT À R2. Les Server Actions plafonnent leur corps à
    // un mégaoctet, et le piège est vicieux parce qu'il PASSE en développement
    // sur de petites images de test.
    const envoi = await fetch(prepare.url, {
      method: "PUT",
      headers: prepare.enTetes,
      body: reduit,
    }).catch(() => null);

    if (envoi === null || !envoi.ok) {
      setGesteLogo({ phase: "erreur", motif: t("logoErreur.reseau") });
      return;
    }

    // La taille est RELUE côté serveur ici : on ne croit jamais le client sur la
    // taille d'un fichier, c'est la base du modèle de coût. Tant que cette
    // confirmation n'a pas abouti, l'interface n'affirme rien.
    const confirme = await confirmerLogo(prepare.cle);
    if (confirme.statut !== "ok") {
      setGesteLogo({ phase: "erreur", motif: t("logoErreur.confirmation") });
      return;
    }

    setLogoConfirme({ url: URL.createObjectURL(reduit), local: true });
    setGesteLogo({ phase: "repos" });
    } catch (erreur) {
      // Une action qui lève (panne réseau) laissait l'écran bloqué sur « envoi ».
      console.error("[marque] dépôt du logo interrompu", erreur);
      setGesteLogo({ phase: "erreur", motif: t("logoErreur.reseau") });
    }
  }

  async function retirer(): Promise<void> {
    if (gesteLogo.phase === "envoi") return;
    setGesteLogo({ phase: "envoi" });
    // RETOUR À L'ÉTAT CONFIRMÉ, ET ON LE DIT : le logo reste affiché tant que la
    // base ne l'a pas retiré, et un échec s'écrit sous la zone.
    const r = await supprimerLogo().catch((erreur: unknown) => {
      console.error("[marque] retrait du logo interrompu", erreur);
      return null;
    });
    if (r !== null && r.statut === "ok") {
      setLogoConfirme(null);
      setGesteLogo({ phase: "repos" });
    } else {
      setGesteLogo({ phase: "erreur", motif: t("logoErreur.retrait") });
    }
  }

  const champsEnEchec =
    resultat.statut === "erreur" && resultat.motif === "saisie" ? (resultat.champs ?? []) : [];

  const apercuLogo = logoConfirme?.url ?? null;

  /*
   * LES TROIS RÉSEAUX, ET CES TROIS-LÀ SEULEMENT. La teinte de la pastille est
   * celle de LEUR marque, jamais l'accent du vendeur : un Instagram vert parce
   * que la boutique est verte ne se reconnaît plus, et c'est la reconnaissance
   * qui fait cliquer.
   */
  const RESEAUX = [
    {
      clef: "instagram",
      trace:
        "M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.2 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.4 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .4-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.4-1-.4-2.2-.1-1.3-.1-1.7-.1-4.9s0-3.6.1-4.9c.1-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.4 2.2-.4 1.3-.1 1.7-.1 4.9-.1zm0 3.2a6.6 6.6 0 1 0 0 13.2 6.6 6.6 0 0 0 0-13.2zm0 10.9a4.3 4.3 0 1 1 0-8.6 4.3 4.3 0 0 1 0 8.6zm6.9-11.2a1.5 1.5 0 1 1-3.1 0 1.5 1.5 0 0 1 3.1 0z",
    },
    {
      clef: "tiktok",
      trace:
        "M14.7 3h2.5a5.3 5.3 0 0 0 4.3 4.3v2.5a7.7 7.7 0 0 1-4.3-1.4v5.9a5.9 5.9 0 1 1-5.9-5.9c.3 0 .6 0 .9.1v2.6a3.3 3.3 0 1 0 2.5 3.2z",
    },
    {
      clef: "whatsapp",
      trace:
        "M12 3.5a8.4 8.4 0 0 0-7.2 12.7L3.6 20.4l4.3-1.1A8.4 8.4 0 1 0 12 3.5zm4.8 11.9c-.2.6-1.2 1.1-1.7 1.1-.4 0-1 .1-3-.8-2.5-1.1-4.1-3.7-4.2-3.9-.1-.2-1-1.3-1-2.5 0-1.2.6-1.8.9-2 .2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 1.9c.1.2 0 .4-.1.5l-.3.4c-.1.2-.3.3-.1.6.2.3.7 1.1 1.4 1.8.9.8 1.7 1.1 2 1.2.2.1.4.1.5-.1l.7-.8c.2-.2.3-.2.6-.1l1.7.8c.2.1.4.2.4.3.1.2.1.7-.1 1.4z",
    },
    /*
     * LE SITE DU VENDEUR, quatrième ligne de la même carte — c'est ce que
     * dessine la planche depuis le 02/09/2026, sous le titre « Vos réseaux et
     * votre site ». Il n'a pas de marque à lui, donc pas de teinte à emprunter :
     * il porte le violet DropLink, la seule couleur du système qui ne prétende
     * appartenir à personne d'autre.
     *
     * ⚠️ C'ÉTAIT L'ANCIEN VIOLET, `#7c5cf5` sur `#f1eefe` — celui du canevas mort
     * le 11/09. Aucune sonde ne l'a vu : ce sont des propriétés d'un tracé SVG,
     * et la pastille n'apparaît que si le vendeur a renseigné son site. Relevé le
     * 14/09/2026 en cherchant les anciennes valeurs dans le code.
     */
    {
      clef: "site",
      trace:
        "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 6h-2.9a15.6 15.6 0 0 0-1.4-3.6A8 8 0 0 1 18.9 8zM12 4c.8 1.1 1.4 2.5 1.8 4h-3.6c.4-1.5 1-2.9 1.8-4zM4.3 14a8 8 0 0 1 0-4h3.3a17 17 0 0 0 0 4H4.3zm.8 2h2.9c.3 1.3.8 2.5 1.4 3.6A8 8 0 0 1 5.1 16zm2.9-8H5.1a8 8 0 0 1 4.3-3.6A15.6 15.6 0 0 0 8 8zM12 20c-.8-1.1-1.4-2.5-1.8-4h3.6c-.4 1.5-1 2.9-1.8 4zm2.2-6H9.8a15 15 0 0 1 0-4h4.4a15 15 0 0 1 0 4zm.4 5.6c.6-1.1 1.1-2.3 1.4-3.6h2.9a8 8 0 0 1-4.3 3.6zm1.8-5.6a17 17 0 0 0 0-4h3.3a8 8 0 0 1 0 4h-3.3z",
    },
  ] as const;

  /*
   * ⚠️ PLUS DE `champ-app`, ET C'EST LE QUATRIÈME PIÈGE DE LA MÉTHODE PAYÉ ICI.
   * Cette classe est déclarée HORS de toute `@layer` dans `globals.css` ;
   * Tailwind range ses utilitaires dans `@layer utilities`, et une règle sans
   * couche l'emporte sur une règle en couche quelle que soit la spécificité.
   * Elle écrasait donc en silence le fond, le filet et la taille du design
   * system sur chacun des sept champs de cet écran — et les deux gardes qui la
   * surveillent restaient vertes, parce qu'elles vérifient qu'une classe existe
   * et pointe sur une variable définie, jamais qui GAGNE la cascade.
   *
   * ⚠️ LA HAUTEUR RESTE SORTIE DE LA BASE. Écrire `champ + " h-11 lg:h-[42px]"`
   * laissait DEUX `lg:h-[…]` sur le même élément, et c'est l'ordre dans la
   * FEUILLE qui tranche, pas l'ordre dans l'attribut : mesuré, les champs de
   * réseaux rendaient 46 px là où le kit en dessine 42.
   */
  const reseauxConfigures = RESEAUX.filter((r) => reseaux[r.clef].trim() !== "");
  // L'aperçu ne montre que les réseaux qui seront réellement rendus : configurés.
  const reseauxApercu = reseauxConfigures.map((r) => ({
    clef: r.clef,
    libelle: r.clef === "site" ? phrasesClient.page.site : t(`reseau.${r.clef}`),
    trace: r.trace,
  }));
  const erreur = (champ: string, message: string) =>
    champsEnEchec.includes(champ) ? (
      <p role="alert" className="champ-reglage__erreur">
        {message}
      </p>
    ) : null;

  return (
    <form action={action} className="marque" data-apercu={format} noValidate>
      <input type="hidden" name="couleurAccent" value={couleur} />
      <input type="hidden" name="languePublique" value={langue} />

      <div className="marque__champs">
        {/* --- 1. Identité --------------------------------------------- */}
        <section className="bloc reglage v4-carte" aria-labelledby="m-identite">
          <header className="reglage__tete">
            <span className="reglage__n" aria-hidden="true">1</span>
            <div>
              <h2 id="m-identite">{t("identiteTitre")}</h2>
              <p>{t("identiteAide")}</p>
            </div>
          </header>
          <div className="reglage__corps reglage__corps--identite">
            <div className="champ-reglage">
              <span className="champ-reglage__etiquette">{t("logoTitre")}</span>
              <div className="depot">
                {/* La zone EST le contrôle (un `<label>` autour du champ fichier) :
                    elle prend le clic, le clavier et le dépôt du fichier. */}
                <label className={"depot__zone" + (survol ? " est-survolee" : "")}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setSurvol(true);
                  }}
                  onDragLeave={(e) => {
                    // Survoler un enfant de la zone n'est pas la quitter.
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSurvol(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setSurvol(false);
                    const fichier = e.dataTransfer.files[0];
                    if (fichier !== undefined) void deposerLogo(fichier);
                  }}
                >
                  <input
                    type="file"
                    accept={ACCEPT_LOGO}
                    className="visuellement-cache"
                    disabled={gesteLogo.phase === "envoi"}
                    onChange={(e) => {
                      const fichier = e.target.files?.[0];
                      if (fichier !== undefined) void deposerLogo(fichier);
                      e.target.value = "";
                    }}
                  />
                  <span className="depot__visuel">
                    {apercuLogo !== null ? (
                      /* eslint-disable-next-line @next/next/no-img-element -- URL
                         signée à expiration, ou aperçu local `blob:`. */
                      <img src={apercuLogo} alt="" />
                    ) : (
                      <Upload aria-hidden="true" className="ic" />
                    )}
                  </span>
                  <span className="depot__texte">
                    <b>{gesteLogo.phase === "envoi" ? t("logoEnvoi") : apercuLogo === null ? t("depotTitre") : t("logoRemplacer")}</b>
                    {/* LES FORMATS SONT ÉNUMÉRÉS, ET LE SVG N'Y EST PAS : refusé côté
                        serveur, un SVG peut porter du script. */}
                    <small>{t("depotFormats", { n: initial.plafondLogoKo })}</small>
                  </span>
                </label>
                {/* « Retirer » n'existe que s'il y a quelque chose à retirer. */}
                {apercuLogo !== null ? (
                  <button type="button" className="bouton-texte" onClick={() => void retirer()}>
                    {t("logoRetirer")}
                  </button>
                ) : null}
              </div>
              {gesteLogo.phase === "erreur" ? (
                <p role="alert" className="champ-reglage__erreur">
                  {gesteLogo.motif}
                </p>
              ) : null}
            </div>
            <div className="champ-reglage__pile">
              <label className="champ-reglage">
                <span className="champ-reglage__etiquette">{t("nomTitre")}</span>
                <input
                  id="nom"
                  name="nom"
                  type="text"
                  maxLength={60}
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  placeholder={t("nomPlaceholder")}
                  autoComplete="organization"
                  aria-invalid={champsEnEchec.includes("nom") || undefined}
                />
                <small className="champ-reglage__aide">{t("nomAide")}</small>
                {erreur("nom", t("erreurNom"))}
              </label>
              <label className="champ-reglage">
                {/* LE COMPTEUR N'EST PAS DÉCORATIF : sans lui, `maxLength` arrête la
                    saisie SANS RIEN DIRE, et le vendeur croit à un clavier qui saute. */}
                <span className="champ-reglage__etiquette">
                  {t("descriptionTitre")}
                  <small className="champ-reglage__compteur" aria-hidden="true">
                    {t("descriptionCompteur", { n: description.length, max: DESCRIPTION_MAX })}
                  </small>
                </span>
                <input
                  id="description"
                  name="description"
                  type="text"
                  maxLength={DESCRIPTION_MAX}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t("descriptionPlaceholder")}
                  aria-invalid={champsEnEchec.includes("description") || undefined}
                />
                <small className="champ-reglage__aide">{t("descriptionAide")}</small>
                {erreur("description", t("erreurDescription", { max: DESCRIPTION_MAX }))}
              </label>
            </div>
          </div>
        </section>

        {/* --- 2. Couleur ---------------------------------------------- */}
        <section className="bloc reglage v4-carte" aria-labelledby="m-couleur">
          <header className="reglage__tete">
            <span className="reglage__n" aria-hidden="true">2</span>
            <div>
              <h2 id="m-couleur">{t("couleurTitre")}</h2>
              <p>{t("couleurAide")}</p>
            </div>
          </header>
          <div className="reglage__corps">
            <div className="champ-reglage">
              <label className="champ-reglage__etiquette" htmlFor="couleurTexte">
                {t("couleurPrincipale")}
              </label>
              <div className="couleur">
                <label className="couleur__pastille" style={{ background: accent.brut }}>
                  <span className="visuellement-cache">{t("couleurHex")}</span>
                  <input type="color" value={couleurRoue} onChange={(e) => setCouleur(e.target.value.toUpperCase())} />
                </label>
                <input
                  id="couleurTexte"
                  type="text"
                  value={couleur}
                  onChange={(e) => setCouleur(e.target.value.trim())}
                  placeholder="#000000"
                  aria-label={t("couleurHex")}
                  spellCheck={false}
                  autoComplete="off"
                  maxLength={7}
                  aria-invalid={champsEnEchec.includes("couleurAccent") || undefined}
                />
                {/* LE BADGE DIT CE QUE LA MACHINE A ÉTABLI : `resoudreAccent()` garantit
                    4,5:1 sur le texte et 3:1 sur l'interface pour n'importe quelle
                    valeur. Le vendeur n'a pas à chercher « une couleur qui marche ». */}
                <span className="conforme">
                  <CircleCheck aria-hidden="true" className="ic" />
                  {t("contrasteConforme")}
                </span>
              </div>
              {erreur("couleurAccent", t("erreurCouleur"))}
            </div>
            {/* LES TROIS EMPLOIS DE LA COULEUR sur la page du client, avec le seuil
                que chacun tient : c'est ce qui rend visible que le produit ajuste
                tout seul. */}
            <div className="demos" aria-hidden="true">
              <div className="demo">
                <small>{t("demoTexte")}</small>
                <b style={{ color: accent.texte }}>{phrasesClient.statut}</b>
                <span className="demo__seuil">{t("demoTexteSeuil")}</span>
              </div>
              <div className="demo">
                <small>{t("demoBouton")}</small>
                <span className="demo__bouton" style={{ background: accent.remplissage, color: accent.surRemplissage }}>
                  {phrasesClient.approuver}
                </span>
                <span className="demo__seuil">{t("demoBoutonSeuil")}</span>
              </div>
              <div className="demo">
                <small>{t("demoBandeau")}</small>
                <span className="demo__bandeau" style={{ background: accent.teinte, color: accent.surTeinte }}>
                  {phrasesClient.page.enCours}
                </span>
                <span className="demo__seuil">{t("demoBandeauSeuil")}</span>
              </div>
            </div>
            {/* On le DIT plutôt que de corriger en silence : la couleur stockée reste
                celle du vendeur, c'est le rendu qui dérive des variantes lisibles. */}
            {accent.ajuste ? (
              <p className="note-reglage">
                <CircleAlert aria-hidden="true" className="ic" />
                {t("couleurAjustee")}
              </p>
            ) : null}
          </div>
        </section>

        {/* --- 3. Réseaux ---------------------------------------------- */}
        <section className="bloc reglage v4-carte" aria-labelledby="m-reseaux">
          <header className="reglage__tete">
            <span className="reglage__n" aria-hidden="true">3</span>
            <div>
              <h2 id="m-reseaux">
                {t("reseauxTitre")} <small>{t("reseauxFacultatif")}</small>
              </h2>
              <p>{t("reseauxAide")}</p>
            </div>
          </header>
          <div className="reglage__corps reglage__corps--reseaux">
            {RESEAUX.map((reseau) => (
              <label key={reseau.clef} className="champ-reglage">
                <span className="champ-reglage__etiquette">{t(`reseau.${reseau.clef}`)}</span>
                <span className="champ-icone">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d={reseau.trace} />
                  </svg>
                  <input
                    id={reseau.clef}
                    name={reseau.clef}
                    /* `type="text"`, PAS `type="url"` : le contrôle natif refusait
                       `www.tiktok.com/@…` collé depuis la barre d'adresse (défaut réel,
                       02/09/2026). `inputMode` choisit le clavier, il ne refuse rien. */
                    type="text"
                    inputMode="url"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    autoComplete="off"
                    maxLength={200}
                    value={reseaux[reseau.clef]}
                    onChange={(e) => setReseaux((actuels) => ({ ...actuels, [reseau.clef]: e.target.value }))}
                    /* La normalisation SE VOIT, au moment où l'on quitte le champ :
                       l'écran ne garde pas un pseudo pendant que la base reçoit une
                       adresse. À chaque frappe, le curseur sauterait. */
                    onBlur={(e) =>
                      setReseaux((actuels) => ({ ...actuels, [reseau.clef]: normaliserLien(reseau.clef, e.target.value) }))
                    }
                    placeholder={t(`reseauExemple.${reseau.clef}`)}
                    aria-invalid={champsEnEchec.includes(reseau.clef) || undefined}
                  />
                </span>
                {erreur(reseau.clef, t(`reseauInvalide.${reseau.clef}`))}
              </label>
            ))}
          </div>
          {/* CE QUE LE LIEN FAIT ET CE QU'IL NE FAIT PAS : la promesse centrale du
              produit, écrite là où le vendeur colle ses adresses. */}
          <p className="note-reglage note-reglage--basse">{t("reseauxNouvelOnglet")}</p>
        </section>

        {/* --- 4. Options ---------------------------------------------- */}
        <section className="bloc reglage v4-carte" aria-labelledby="m-options">
          <header className="reglage__tete">
            <span className="reglage__n" aria-hidden="true">4</span>
            <div>
              <h2 id="m-options">{t("optionsTitre")}</h2>
              <p>{t("optionsAide")}</p>
            </div>
          </header>
          <div className="reglage__corps reglage__corps--lignes">
            <div className="option">
              <div>
                <p className="option__titre">{t("filigraneTitre")}</p>
                <p className="option__aide" id="aide-filigrane">{filigranePossible ? t("filigraneAide") : t("filigraneSansNom")}</p>
              </div>
              <label className="interrupteur">
                <input
                  type="checkbox"
                  role="switch"
                  name="filigrane"
                  aria-describedby="aide-filigrane"
                  checked={filigrane && filigranePossible}
                  disabled={!filigranePossible}
                  onChange={(e) => setFiligrane(e.target.checked)}
                />
                <i />
                <span className="visuellement-cache">{t("filigraneLabel")}</span>
              </label>
            </div>
            <div className="option">
              <div>
                <p className="option__titre">{t("langueTitre")}</p>
                <p className="option__aide">{t("langueAide")}</p>
              </div>
              {/* LES OPTIONS SONT ENGENDRÉES PAR `LANGUES` : une valeur inconnue ne
                  retombe pas sur le français en silence, et un vendeur réglé en
                  chinois ne lit jamais « Français ». */}
              <select
                aria-label={t("langueTitre")}
                value={langue}
                onChange={(e) => {
                  const choisie = e.target.value;
                  if (estLangueSupportee(choisie)) setLangue(choisie);
                }}
              >
                {LANGUES.map((code) => (
                  <option key={code} value={code}>
                    {t(`langue.${code}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* --- 5. Lien personnalisé (Pro) ------------------------------
            EN GRATUIT, LE CHAMP EST RÉELLEMENT INERTE : `disabled`, sans `name`,
            rien ne part — et `definir_slug_boutique` refuserait (DL059). Aucun
            prix ni plafond ne s'affiche ici (contrainte n° 1). */}
        <section className="bloc reglage v4-carte" aria-labelledby="m-lien">
          <header className="reglage__tete">
            <span className="reglage__n" aria-hidden="true">5</span>
            <div>
              <h2 id="m-lien">
                {t("lienTitre")} <span className="badge-pro">{t("lienProBadge")}</span>
              </h2>
              <p>{t("lienAide")}</p>
            </div>
          </header>
          <div className="reglage__corps">
            <div className="lien-perso">
              <span className="lien-perso__origine">{origineLisible}</span>
              <input
                type="text"
                {...(initial.planPro
                  ? {
                      name: "nomDeLien",
                      value: nomDeLien,
                      onChange: (e: React.ChangeEvent<HTMLInputElement>) => setNomDeLien(e.target.value),
                      maxLength: 40,
                      // Guidée, jamais corrigée en silence : la base tranche (`slug_valide`).
                      autoComplete: "off",
                      spellCheck: false,
                    }
                  : { disabled: true, defaultValue: "" })}
                placeholder={t("lienPlaceholder")}
                aria-label={t("lienTitre")}
              />
            </div>
            {initial.planPro
              ? erreur(
                  "nomDeLien",
                  t(
                    resultat.statut === "erreur" && resultat.detail === "nom-pris"
                      ? "erreurLienPris"
                      : resultat.statut === "erreur" && resultat.detail === "nom-pro"
                        ? "erreurLienPro"
                        : "erreurLien",
                  ),
                )
              : (
                <LienEcran className="carte-pro-reglage" href={initial.lienPasserPro}>
                  <span className="badge-pro">{t("lienProBadge")}</span>
                  <span>
                    <b>{t("lienProTitre")}</b>
                    <small>{t("lienProAide")}</small>
                  </span>
                  <ArrowRight aria-hidden="true" className="ic" />
                </LienEcran>
              )}
          </div>
        </section>

        {/* --- 6. Marque DropLink (Pro) --------------------------------
            L'INTERRUPTEUR N'EST QU'UNE COMMODITÉ, LA RÈGLE EST EN BASE : désactivé
            en gratuit il n'envoie rien, et une requête forgée serait refusée par
            le déclencheur de la migration 167 (DL059). */}
        <section className="bloc reglage v4-carte" aria-labelledby="m-marque">
          <header className="reglage__tete">
            <span className="reglage__n" aria-hidden="true">6</span>
            <div>
              <h2 id="m-marque">
                {t("marqueTitre")} <span className="badge-pro">{t("lienProBadge")}</span>
              </h2>
              <p>{t("marqueAide")}</p>
            </div>
          </header>
          <div className="reglage__corps reglage__corps--lignes">
            <div className="option" data-verrou={initial.planPro ? undefined : ""}>
              <div>
                <p className="option__titre">{t("marqueOption")}</p>
                <p className="option__aide" id="aide-masquer">{t("marqueOptionAide")}</p>
              </div>
              <label className="interrupteur">
                <input
                  type="checkbox"
                  role="switch"
                  name="masquerMarque"
                  aria-describedby="aide-masquer"
                  checked={masquerMarque && initial.planPro}
                  disabled={!initial.planPro}
                  onChange={(e) => setMasquerMarque(e.target.checked)}
                />
                <i />
                <span className="visuellement-cache">{t("marqueOption")}</span>
              </label>
            </div>
            {initial.planPro ? null : (
              <LienEcran className="carte-pro-reglage" href={initial.lienPasserPro}>
                <span className="badge-pro">{t("lienProBadge")}</span>
                <span>
                  <b>{t("lienProTitre")}</b>
                  <small>{t("marqueProAide")}</small>
                </span>
                <ArrowRight aria-hidden="true" className="ic" />
              </LienEcran>
            )}
          </div>
        </section>

        {/* LA BARRE D'ENREGISTREMENT. Un seul geste rhabille TOUTES les pages du
            vendeur, liens déjà envoyés compris : enregistrer à chaque frappe ferait
            défiler des couleurs intermédiaires chez ses clients. La réussite est
            dite en vert (demande de Wassim du 09/09/2026), `role="status"`. */}
        <div className="marque__enregistrer">
          {resultat.statut === "enregistre" ? (
            <p className="marque__statut" data-ton="ok" role="status">
              <Check aria-hidden="true" className="ic" />
              {t("enregistre")}
            </p>
          ) : resultat.statut === "erreur" && resultat.motif !== "saisie" ? (
            <p className="marque__statut" data-ton="erreur" role="alert">
              {t(`erreur.${resultat.motif}`)}
            </p>
          ) : (
            <p className="marque__statut" role="status" />
          )}
          <BoutonAction
            libelles={{
              repos: t("enregistrer"),
              enCours: t("enregistrement"),
              // Le même libellé qu'au repos : la ligne verte porte la confirmation.
              reussi: t("enregistrer"),
              echoue: t("reessayer"),
            }}
            resultat={resultat.statut === "enregistre" ? "reussi" : resultat.statut === "erreur" ? "echoue" : null}
            className="bouton-app bouton-app--plein"
          />
        </div>
      </div>

      {/* L'APERÇU EST LA RAISON D'ÊTRE DE CET ÉCRAN : régler une couleur sans la
          voir, c'est choisir à l'aveugle. Il montre la couleur RÉSOLUE, dans la
          langue des pages client, et suit la frappe. */}
      <ApercuMarque
        format={format}
        surFormat={setFormat}
        libelles={{
          titre: t("apercuTitre"),
          aide: t("apercuAide"),
          direct: t("apercuDirect"),
          formats: t("apercuFormats"),
          bureau: t("apercuBureau"),
          mobile: t("apercuMobile"),
          imageMobile: t("apercuImageMobile"),
          imageBureau: t("apercuImageBureau"),
        }}
        page={{
          textes: phrasesClient.page,
          pour: phrasesClient.pourGenerique,
          nom: nom.trim(),
          description: description.trim(),
          logo: apercuLogo,
          accent,
          reseaux: reseauxApercu,
          marqueMasquee: masquerMarque && initial.planPro,
          langue,
        }}
      />
    </form>
  );
}
