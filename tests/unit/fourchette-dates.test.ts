import { describe, expect, test } from "vitest";
import { createFormatter, createTranslator } from "next-intl";
import fr from "../../messages/fr.json";
import en from "../../messages/en.json";
import zh from "../../messages/zh-CN.json";
import { fourchetteDates } from "@/lib/page-publique/fourchette";

/**
 * LA FOURCHETTE D'ARRIVÉE DE /p (contre-audit du 03/10/2026, C1) : « 1 au 2 octobre », le
 * mois non répété quand il est le même — par règle de traduction, dans les trois langues.
 */
function fourchette(langue: "fr" | "en" | "zh-CN", messages: Record<string, unknown>, du: string, au: string): string {
  // Les messages arrivent sans type de catalogue : le traducteur se lit donc comme le
  // rappel que `fourchetteDates` attend, une clé et ses valeurs.
  const t = createTranslator({ locale: langue, messages, namespace: "page-publique" }) as unknown as (
    cle: string,
    valeurs: Record<string, string>,
  ) => string;
  const format = createFormatter({ locale: langue });
  return fourchetteDates(
    new Date(du),
    new Date(au),
    { memeMois: (v) => t("fourchette.memeMois", v), autreMois: (v) => t("fourchette.autreMois", v) },
    (x, o) => format.dateTime(x, o),
  );
}

describe("fourchetteDates", () => {
  test("même mois : le mois n'est écrit qu'une fois", () => {
    expect(fourchette("fr", fr, "2026-10-01T00:00:00Z", "2026-10-02T00:00:00Z")).toBe("1 au 2 octobre");
    expect(fourchette("en", en, "2026-10-01T00:00:00Z", "2026-10-02T00:00:00Z")).toBe("October 1–2");
    expect(fourchette("zh-CN", zh, "2026-10-01T00:00:00Z", "2026-10-02T00:00:00Z")).toBe("10月1日至2日");
  });

  test("deux mois : chaque borne garde le sien", () => {
    expect(fourchette("fr", fr, "2026-09-30T00:00:00Z", "2026-10-02T00:00:00Z")).toBe("30 septembre au 2 octobre");
    expect(fourchette("en", en, "2026-09-30T00:00:00Z", "2026-10-02T00:00:00Z")).toBe("September 30 – October 2");
    expect(fourchette("zh-CN", zh, "2026-09-30T00:00:00Z", "2026-10-02T00:00:00Z")).toBe("9月30日至10月2日");
  });

  test("le jour est celui d'UTC, pas celui du serveur", () => {
    expect(fourchette("fr", fr, "2026-10-01T23:30:00Z", "2026-10-02T23:30:00Z")).toBe("1 au 2 octobre");
  });

  test("deux bornes inversées sont remises dans l'ordre", () => {
    expect(fourchette("fr", fr, "2026-10-02T00:00:00Z", "2026-10-01T00:00:00Z")).toBe("1 au 2 octobre");
  });
});
