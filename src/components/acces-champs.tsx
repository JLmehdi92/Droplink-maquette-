"use client";

import { useFormStatus } from "react-dom";
import { ArrowRight, Eye, EyeOff, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Anneau } from "@/components/bouton-action";
import { Icone as IconeMaterielle } from "@/components/icone";

/**
 * LES BRIQUES COMMUNES AUX QUATRE ÉCRANS D'ACCÈS.
 *
 * Connexion, inscription, mot de passe oublié, nouveau mot de passe.
 *
 * ⚠️ CE N'EST PAS UNE FACTORISATION DE CONFORT. Le formulaire de connexion et
 * celui d'inscription ÉTAIENT le même composant, distingués par une propriété
 * `intention` qui ne changeait que le libellé du bouton — parce qu'avec un lien
 * magique le serveur faisait strictement la même chose des deux côtés. Ce n'est
 * plus vrai : l'un vérifie, l'autre crée. Les deux formulaires sont donc
 * séparés, et ce qui reste commun est ici, à l'endroit où le partager ne peut
 * plus faire diverger un comportement.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * MIGRÉ SUR LE DESIGN SYSTEM LE 11/09/2026 — valeurs MESURÉES, pas lues.
 *
 * Le champ d'accès CASSE la pilule du reste du produit : 56 px de haut et un
 * rayon de 16, là où les contrôles ordinaires sont entièrement arrondis. Ce
 * n'est pas une approximation — c'est écrit dans le README du kit et confirmé
 * par la boîte rendue, mesurée dans Chrome sur la référence servie en HTTP :
 * `h=56, radius=16px, filet 1px #DEDEEA, padding 0 18px, saisie 15px`.
 *
 * ⚠️ ET LA MESURE A CORRIGÉ UNE LECTURE. Le `<label>` rend 16px/400 : c'est
 * l'héritage du corps, pas le libellé. Le libellé lui-même est un `<span>` à
 * **14px/600 sur l'encre forte**. Lire la boîte extérieure aurait donné un
 * libellé trop clair et trop léger, sans que rien ne le signale.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ DEUX JEUX DE BRIQUES COHABITENT, ET C'EST DÉLIBÉRÉ.
 *
 * Ces briques servent QUATRE écrans : connexion, inscription, mot de passe
 * oublié, nouveau mot de passe. Le design system n'en dessine que DEUX — son
 * périmètre range explicitement `/mot-de-passe-oublie` et
 * `/nouveau-mot-de-passe` parmi « les écrans que le design system ne dessine
 * pas, qui gardent leur habillage actuel jusqu'à ce qu'ils soient dessinés ».
 *
 * Migrer les briques partagées aurait donc migré QUATRE écrans d'un coup, dont
 * deux pour lesquels il aurait fallu INVENTER une référence — l'inverse exact
 * de la règle « écran par écran, un écran migré est un écran vérifié ».
 *
 * Les anciennes briques restent donc intactes sous leurs noms, et les nouvelles
 * portent l'infixe `Ds`. La duplication est le prix de la migration ; elle meurt
 * quand les deux derniers écrans sont dessinés.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Le champ des écrans NON migrés : 52 px, rayon 13, filet de contrôle. */
export const CLASSE_CHAMP =
  "h-13 w-full rounded-[13px] border border-filet-controle bg-surface-container-low px-4 " +
  "font-body-md text-[15px] text-on-surface transition-colors focus:border-violet " +
  "focus:outline-none focus:ring-2 focus:ring-violet/30";

/** Le libellé des écrans NON migrés. */
export const CLASSE_LIBELLE =
  "block font-headline-md text-[13px] leading-4 font-semibold text-on-surface";

/** Le libellé d'un champ migré : 14 px, semi-gras, sur l'encre forte. */
export const CLASSE_LIBELLE_DS = "text-[14px] leading-5 font-semibold text-ds-texte-fort";

/**
 * Un champ d'accès complet : libellé, boîte, icône, et l'action de droite.
 *
 * L'icône vit DANS la boîte, à gauche, en 18 px et trait 1,8 — la graisse de
 * Lucide retenue par le design system. Elle est décorative : le libellé dit
 * déjà ce que le champ attend, et la doubler ferait entendre deux fois la même
 * chose à un lecteur d'écran.
 */
export function ChampAcces({
  id,
  nom,
  type = "text",
  libelle,
  icone: Icone,
  placeholder,
  autoComplete,
  requis = true,
  action,
  decritPar,
  valeur,
  surChangement,
  modeSaisie,
  invalide = false,
}: {
  readonly id: string;
  readonly nom: string;
  readonly type?: "text" | "email" | "password";
  readonly libelle: string;
  readonly icone: LucideIcon;
  readonly placeholder?: string;
  readonly autoComplete?: string;
  readonly requis?: boolean;
  readonly action?: React.ReactNode;
  readonly decritPar?: string;
  /**
   * Contrôlé UNIQUEMENT quand l'appelant en a besoin — la connexion, pour
   * pouvoir proposer la correction d'une adresse mal tapée. Partout ailleurs le
   * champ reste non contrôlé : un état React par champ ne sert à rien quand le
   * formulaire est envoyé au serveur, et il coûte un rendu à chaque frappe.
   */
  readonly valeur?: string;
  readonly surChangement?: (valeur: string) => void;
  readonly modeSaisie?: "email" | "text";
  readonly invalide?: boolean;
}) {
  const [devoile, setDevoile] = useState(false);
  const estMotDePasse = type === "password";

  return (
    /*
     * ⚠️ LE `<label>` ENVELOPPE TOUTE LA BOÎTE, PAS SEULEMENT SON TEXTE — ET
     * C'EST UNE PROPRIÉTÉ DE ZONE TACTILE, PAS DE SÉMANTIQUE.
     *
     * Mesuré le 11/09/2026 à 390 px, TACTILE ÉMULÉ, par
     * `scripts/mesurer-cibles-tactiles.mjs` : avec un label séparé, la zone
     * réellement touchable du champ est celle de l'`<input>` — **80 × 23** —
     * et non celle de la boîte de 56. Les 33 px manquants sont le filet, le
     * padding et l'icône : visuellement le champ, mais inertes au doigt.
     *
     * En enveloppant, la boîte entière active la saisie. C'est ce que fait la
     * référence, et c'est pour cela qu'elle mesure 56.
     */
    <label htmlFor={id} className="block">
      <span className="mb-2 flex items-baseline gap-3">
        <span className={CLASSE_LIBELLE_DS}>{libelle}</span>
        <span className="flex-1" />
        {action}
      </span>
      {/*
       * LE FILET ET L'ANNEAU SONT SUR LA BOÎTE, PAS SUR LA SAISIE. Le champ
       * porte une icône et parfois un bouton : si le focus n'habillait que
       * l'`<input>`, l'anneau couperait la boîte en son milieu.
       *
       * `focus-within` plutôt qu'un état React : la boîte n'a aucune autre
       * raison d'être un îlot client, et le CSS le fait sans JavaScript.
       */}
      <span
        className={
          "flex h-14 items-center gap-3 rounded-ds-card border border-ds-filet-appuye " +
          "bg-ds-surface-carte px-[18px] transition-colors " +
          "focus-within:border-ds-filet-focus focus-within:shadow-[var(--anneau-ds-focus)]"
        }
      >
        <Icone aria-hidden="true" size={18} strokeWidth={1.8} className="shrink-0 text-ds-texte-sourdine" />
        <input
          id={id}
          name={nom}
          type={estMotDePasse && !devoile ? "password" : type === "password" ? "text" : type}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={requis}
          aria-describedby={decritPar}
          aria-invalid={invalide || undefined}
          inputMode={modeSaisie}
          {...(valeur === undefined
            ? {}
            : { value: valeur, onChange: (e) => surChangement?.(e.target.value) })}
          className="min-w-0 flex-1 border-none bg-transparent text-[15px] text-ds-texte-fort outline-none placeholder:text-ds-texte-tenu"
        />
        {estMotDePasse ? (
          <button
            type="button"
            onClick={() => setDevoile((d) => !d)}
            /*
             * ⚠️ 44 px DE ZONE TOUCHABLE SANS ÉLARGIR LE DESSIN. Le bouton
             * mesure 18 px pour ne pas déformer la boîte de 56 ; le
             * pseudo-élément lui donne la cible du brief §8. Mesuré par
             * `scripts/mesurer-cibles-tactiles.mjs`, pas par `getBoundingClientRect`
             * qui ne compte pas la boîte d'un `::before`.
             */
            className="relative shrink-0 text-ds-texte-sourdine transition-colors hover:text-ds-texte-fort before:absolute before:top-1/2 before:left-1/2 before:h-11 before:w-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']"
            aria-label={devoile ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          >
            {devoile ? <EyeOff size={18} strokeWidth={1.8} /> : <Eye size={18} strokeWidth={1.8} />}
          </button>
        ) : null}
      </span>
    </label>
  );
}

/**
 * L'action principale des écrans NON migrés — mot de passe oublié, nouveau mot
 * de passe. Elle garde le dessin de l'ancien canevas : 52 px, rayon 13, flèche
 * Material. Elle disparaît le jour où ces deux écrans sont dessinés.
 */
export function BoutonPrincipal({
  libelle,
  libelleEnCours,
}: {
  readonly libelle: string;
  readonly libelleEnCours: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="degrade-marque flex h-13 w-full items-center justify-center gap-[9px] rounded-[13px] font-headline-md text-[15px] leading-5 font-bold shadow-[0_10px_24px_-10px_rgba(124,92,245,0.6)] transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {pending ? <Anneau /> : null}
      <span>{pending ? libelleEnCours : libelle}</span>
      {pending ? null : <IconeMaterielle nom="arrow_forward" className="text-[15px]" />}
    </button>
  );
}

/** Le message d'échec des écrans NON migrés. */
export function MessageErreur({ id, texte }: { readonly id: string; readonly texte: string }) {
  return (
    <p id={id} role="alert" className="font-body-sm text-body-sm text-error">
      {texte}
    </p>
  );
}

/**
 * L'action principale de l'écran, au dégradé de marque.
 *
 * Le dégradé est réservé à UNE action principale par écran, et uniquement sur
 * les surfaces DropLink — ce qui est le cas des quatre écrans d'accès.
 *
 * `useFormStatus` doit être lu depuis un composant ENFANT du formulaire : lu
 * dans le formulaire lui-même, il rendrait toujours `false`.
 *
 * ⚠️ IL CHANGEAIT DÉJÀ DE LIBELLÉ, ET CE N'ÉTAIT PAS SUFFISANT. Sur les quatre
 * écrans d'accès, l'attente ne se lisait qu'en relisant le mot — or on ne relit
 * pas un bouton qu'on vient de cliquer, on le REGARDE. L'anneau est celui de
 * `BoutonAction`, validé par Wassim le 09/09 : `animate-spin` en CSS pur, aucune
 * couleur qui change, et il ne porte aucune information que le libellé ne porte
 * pas — d'où son `aria-hidden`.
 *
 * ⚠️ LA FLÈCHE CÈDE SA PLACE À L'ANNEAU, elle ne s'y ajoute pas : les deux
 * ensemble élargiraient le bouton au moment précis du clic.
 *
 * Géométrie mesurée sur la référence : 58 px de haut, rayon 16, libellé 16/600.
 */
export function BoutonPrincipalDs({
  libelle,
  libelleEnCours,
}: {
  readonly libelle: string;
  readonly libelleEnCours: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="degrade-ds-marque flex h-[58px] w-full items-center justify-center gap-[10px] rounded-ds-card text-[16px] font-semibold text-ds-texte-sur-marque shadow-ds-brand transition-shadow hover:shadow-ds-brand-hover disabled:opacity-60"
    >
      {pending ? <Anneau /> : null}
      <span>{pending ? libelleEnCours : libelle}</span>
      {pending ? null : <ArrowRight aria-hidden="true" size={18} strokeWidth={1.8} />}
    </button>
  );
}

/**
 * Le message d'échec, sous les champs et avant le bouton.
 *
 * `role="alert"` : il apparaît après une soumission, donc hors du champ de
 * quelqu'un qui emploie un lecteur d'écran.
 */
export function MessageErreurDs({ id, texte }: { readonly id: string; readonly texte: string }) {
  return (
    <p id={id} role="alert" className="text-ds-body-sm text-ds-erreur">
      {texte}
    </p>
  );
}
