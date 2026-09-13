import { getTranslations } from "next-intl/server";
import { partirVersGoogle } from "@/app/[locale]/connexion/actions";
import { fournisseurActif } from "@/lib/auth/fournisseurs";

/**
 * LE BOUTON « CONTINUER AVEC GOOGLE ».
 *
 * COMPOSANT SERVEUR, aucun JavaScript client. Un formulaire dont l'action est
 * une Server Action navigue sans le moindre octet de bundle — et cette page est
 * la première que voit un utilisateur, souvent en 4G.
 *
 * IL NE REND RIEN S'IL N'EST PAS CONFIGURÉ. Un bouton qui mène à une erreur de
 * configuration est pire que pas de bouton : l'utilisateur conclut que le
 * produit est cassé, et il a raison. Le drapeau est lu côté serveur et ne
 * traverse jamais le réseau.
 *
 * ⚠️ IL PORTE SON SÉPARATEUR « ou », ET C'EST STRUCTUREL. La page en rendait
 * un ET ce composant un second : les deux s'empilaient sur la planche qui n'en
 * dessine qu'un. Le réflexe — retirer celui du composant et garder celui de la
 * page sous la même condition — aurait laissé la règle tenir à une ABSENCE :
 * deux endroits d'accord tant que personne n'oublie la condition. En le
 * ramenant ici, le séparateur ne peut plus exister sans son bouton, puisque
 * c'est la même fonction qui rend les deux ou rien du tout.
 *
 * ⚠️ ET LE DÉFAUT EST REVENU QUAND MÊME, le 11/09/2026, par la porte que ce
 * paragraphe laissait ouverte. La migration au design system a exporté un
 * `SeparateurAcces` depuis la coque d'accès, et les DEUX pages l'ont posé à
 * côté de ce bouton : deux « ou » empilés en production, où Google est actif,
 * et un « ou continuer avec » suivi de RIEN dans tout environnement où il ne
 * l'est pas. Mesuré le 13/09/2026 contre le kit `auth`. Le séparateur vit donc
 * désormais ICI, non exporté : aucune page ne peut plus en poser un.
 *
 * L'ACTION REVÉRIFIE CE MÊME DRAPEAU. Ne pas afficher un bouton n'empêche
 * personne d'appeler l'action : dans un module `"use server"`, chaque export est
 * un point d'entrée. L'absence d'affichage est une commodité, pas une garde.
 *
 * PAS DE LOGO GOOGLE EN IMAGE DISTANTE. Le charger depuis leurs serveurs ferait
 * dépendre notre page de connexion d'un domaine tiers, sur un chemin dont
 * l'échec est silencieux : derrière un pare-feu, le bouton s'afficherait sans
 * marque et paraîtrait cassé. Le glyphe est en SVG local.
 */
/** Le séparateur du kit : deux filets et un libellé 13 / 600 en sourdine. */
function Separateur({ libelle }: { readonly libelle: string }) {
  return (
    <div aria-hidden="true" className="flex items-center gap-4">
      <span className="h-px flex-1 bg-ds-filet" />
      <span className="text-[13px] font-semibold text-ds-texte-sourdine">{libelle}</span>
      <span className="h-px flex-1 bg-ds-filet" />
    </div>
  );
}

export async function BoutonGoogle({
  locale,
  separateur,
}: {
  locale: string;
  /**
   * OÙ EST LE « OU », ET CE QU'IL DIT — les deux pages du kit ne le posent pas
   * au même endroit. La connexion met le formulaire d'abord, puis « ou
   * continuer avec », puis Google ; l'inscription met Google d'abord, puis
   * « ou », puis le formulaire.
   */
  separateur: { readonly position: "avant" | "apres"; readonly cle: "ou" | "ouAvec" };
}) {
  if (!fournisseurActif("google")) return null;

  const t = await getTranslations({ locale, namespace: "connexion" });
  const trait = <Separateur libelle={t(separateur.cle)} />;

  return (
    <>
      {separateur.position === "avant" ? trait : null}

      <form action={partirVersGoogle}>
        <input type="hidden" name="locale" value={locale} />
        {/* LE BOUTON DU KIT : 52 px, rayon de carte, filet par défaut, 15 / 600,
            glyphe de 18 à 10 px du libellé. */}
        <button
          type="submit"
          className="flex h-13 w-full items-center justify-center gap-2.5 rounded-ds-card border border-ds-filet-appuye bg-ds-surface-carte text-[15px] font-semibold text-ds-texte-fort transition-shadow hover:shadow-ds-sm"
        >
          <svg viewBox="0 0 18 18" className="h-[18px] w-[18px]" aria-hidden="true" focusable="false">
            <path
              fill="#4285F4"
              d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z"
            />
            <path
              fill="#34A853"
              d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.35 0-4.34-1.58-5.05-3.71H.96v2.33A9 9 0 0 0 9 18Z"
            />
            <path
              fill="#FBBC05"
              d="M3.95 10.71a5.41 5.41 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l2.99-2.33Z"
            />
            <path
              fill="#EA4335"
              d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l2.99 2.33C4.66 5.16 6.65 3.58 9 3.58Z"
            />
          </svg>
          {t("avecGoogle")}
        </button>
      </form>

      {separateur.position === "apres" ? trait : null}
    </>
  );
}
