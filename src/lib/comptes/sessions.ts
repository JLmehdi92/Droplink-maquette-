import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types-base";

/**
 * LES SESSIONS DU COMPTE, telles que « Voir les sessions » les montre.
 *
 * Lues par `lister_mes_sessions` (migration 155), SOUS LA SESSION du vendeur :
 * la fonction ne rend que les siennes et ne sait rendre rien d'autre.
 */

export type Navigateur = "edge" | "opera" | "samsung" | "chrome" | "firefox" | "safari";
export type Systeme = "windows" | "macos" | "ios" | "android" | "linux";

export type AppareilDecrit = {
  readonly navigateur: Navigateur | null;
  readonly systeme: Systeme | null;
};

export type SessionDuCompte = {
  readonly id: string;
  readonly activeLe: string;
  readonly appareil: AppareilDecrit;
  readonly cetAppareil: boolean;
};

/**
 * CE QU'UN AGENT UTILISATEUR DIT DE L'APPAREIL, et seulement ce qu'il dit sûrement.
 *
 * ⚠️ L'ORDRE DES TESTS EST LA RÈGLE. Edge, Opera et Samsung Internet se
 * déclarent AUSSI « Chrome », et Chrome se déclare aussi « Safari » : tester
 * Chrome d'abord ferait lire « Chrome » pour tous les dérivés, et tester Safari
 * d'abord ferait lire « Safari » pour tout le monde. Un iPad récent se présente
 * en Macintosh : on le lit macOS, et c'est ce que l'appareil affirme.
 *
 * Rien de reconnu → `null`, jamais une supposition : un « Chrome sous Windows »
 * inventé pour une session de script ferait croire au vendeur qu'il reconnaît
 * un appareil qu'il n'a jamais eu.
 */
export function decrireAppareil(agent: string | null): AppareilDecrit {
  const a = agent ?? "";
  const navigateur: Navigateur | null = /Edg(?:e|A|iOS)?\//.test(a)
    ? "edge"
    : /OPR\/|Opera/.test(a)
      ? "opera"
      : /SamsungBrowser\//.test(a)
        ? "samsung"
        : /(?:Chrome|CriOS)\//.test(a)
          ? "chrome"
          : /(?:Firefox|FxiOS)\//.test(a)
            ? "firefox"
            : /Version\/[\d.]+.*Safari\//.test(a)
              ? "safari"
              : null;

  const systeme: Systeme | null = /iPhone|iPad|iPod/.test(a)
    ? "ios"
    : /Android/.test(a)
      ? "android"
      : /Windows/.test(a)
        ? "windows"
        : /Mac OS X|Macintosh/.test(a)
          ? "macos"
          : /Linux|X11/.test(a)
            ? "linux"
            : null;

  return { navigateur, systeme };
}

/** `null` si la lecture a échoué : « aucune session » serait un mensonge ici. */
export async function lireMesSessions(
  supabase: SupabaseClient<Database>,
): Promise<readonly SessionDuCompte[] | null> {
  const { data, error } = await supabase.rpc("lister_mes_sessions");
  if (error !== null) {
    console.error("[sessions] lecture impossible — " + error.message);
    return null;
  }
  return data.map((s) => ({
    id: s.id,
    activeLe: s.active_le,
    appareil: decrireAppareil(s.agent),
    cetAppareil: s.cet_appareil,
  }));
}
