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
 * L'ACTION REVÉRIFIE CE MÊME DRAPEAU. Ne pas afficher un bouton n'empêche
 * personne d'appeler l'action : dans un module `"use server"`, chaque export est
 * un point d'entrée. L'absence d'affichage est une commodité, pas une garde.
 *
 * PAS DE LOGO GOOGLE EN IMAGE DISTANTE. Le charger depuis leurs serveurs ferait
 * dépendre notre page de connexion d'un domaine tiers, sur un chemin dont
 * l'échec est silencieux : derrière un pare-feu, le bouton s'afficherait sans
 * marque et paraîtrait cassé. Le glyphe est en SVG local.
 */
export async function BoutonGoogle({ locale }: { locale: string }) {
  if (!fournisseurActif("google")) return null;

  const t = await getTranslations({ locale, namespace: "connexion" });

  return (
    <>
      {/* LE SÉPARATEUR EST ICI, ET PAS DANS LA PAGE. Il l'a été : la page en
          rendait un et ce composant un second, les deux s'empilaient. Le
          ramener ici ne corrige pas seulement le doublon — il rend le défaut
          IMPOSSIBLE. Ce composant rend `null` quand Google n'est pas
          configuré ; un séparateur écrit dans la page tiendrait alors à une
          condition recopiée que le prochain chemin oubliera, et laisserait un
          « ou » suivi de rien sur la première page que voit un utilisateur. */}
      <div
        aria-hidden="true"
        className="my-[22px] flex items-center gap-3.5 md:my-[26px]"
      >
        <span className="h-px flex-grow bg-outline-variant" />
        <span className="font-body-sm text-[12px] leading-[15px] text-sourdine">
          {t("ou")}
        </span>
        <span className="h-px flex-grow bg-outline-variant" />
      </div>

      <form action={partirVersGoogle}>
        <input type="hidden" name="locale" value={locale} />
        <button
          type="submit"
          className="flex h-13 w-full items-center justify-center gap-2.5 rounded-[13px] border border-filet-controle bg-surface-container-lowest font-headline-md text-[15px] leading-5 font-semibold text-on-surface transition-colors hover:bg-fond-neutre"
        >
          <svg
            viewBox="0 0 18 18"
            className="h-[19px] w-[19px]"
            aria-hidden="true"
            focusable="false"
          >
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
    </>
  );
}
