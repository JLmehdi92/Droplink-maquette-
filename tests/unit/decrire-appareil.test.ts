import { describe, expect, test } from "vitest";
import { decrireAppareil } from "@/lib/comptes/sessions";

/**
 * L'APPAREIL D'UNE SESSION — lu dans des agents utilisateurs RÉELS.
 *
 * Les dérivés de Chromium se déclarent tous « Chrome », et Chrome se déclare
 * « Safari » : c'est l'ordre des tests qui fait la justesse, donc ce sont les
 * dérivés qu'il faut éprouver, pas le cas facile.
 */
const CAS: ReadonlyArray<readonly [string, string | null, string | null, string]> = [
  [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "chrome", "windows", "Chrome sous Windows",
  ],
  [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.2739.42",
    "edge", "windows", "Edge se déclare aussi Chrome",
  ],
  [
    "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36",
    "samsung", "android", "Samsung Internet se déclare Chrome ET Safari",
  ],
  [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 OPR/113.0.0.0",
    "opera", "windows", "Opera se déclare Chrome",
  ],
  [
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    "safari", "ios", "l'iPhone se déclare « like Mac OS X »",
  ],
  [
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/128.0.6613.98 Mobile/15E148 Safari/604.1",
    "chrome", "ios", "Chrome sur iPhone se déclare CriOS, sans Version/",
  ],
  [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:130.0) Gecko/20100101 Firefox/130.0",
    "firefox", "macos", "Firefox sous macOS",
  ],
  [
    "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0",
    "firefox", "linux", "Firefox sous Linux",
  ],
  ["node", null, null, "un script : rien n'est inventé"],
];

describe("decrireAppareil", () => {
  test.each(CAS)("%s", (agent, navigateur, systeme) => {
    expect(decrireAppareil(agent)).toEqual({ navigateur, systeme });
  });

  test("sans agent, rien n'est affirmé", () => {
    expect(decrireAppareil(null)).toEqual({ navigateur: null, systeme: null });
    expect(decrireAppareil("")).toEqual({ navigateur: null, systeme: null });
  });
});
