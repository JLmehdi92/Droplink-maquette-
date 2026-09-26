import Link from "next/link";
import { ArrowRight, CalendarClock, Lock } from "lucide-react";
import type { QuotaAtteint } from "@/lib/commandes/quota-atteint";

/**
 * LE QUOTA ATTEINT, DIT EN CLAIR — planche `OrdersView`, `#quota-atteint` et `#quota-mensuel`.
 *
 * Il apparaît quand la base a refusé une création ou une duplication (`?quota=…`,
 * `lib/commandes/quota-atteint.ts`). Avant lui, le premier cas rendait une page
 * d'erreur et le second ne rendait rien du tout (26/09/2026).
 *
 * AMBRE, comme les autres refus de la liste : c'est une information, pas une alarme.
 * Le compte gratuit reçoit la seule issue qui existe — le passage au Pro ; le compte
 * Pro, qui n'a rien à acheter, apprend quand son plafond se recharge.
 */
export function BandeauQuota({
  quota,
  titre,
  texte,
  passerPro,
  versPasserPro,
}: {
  readonly quota: QuotaAtteint;
  readonly titre: string;
  readonly texte: string;
  readonly passerPro: string;
  readonly versPasserPro: string;
}) {
  const Icone = quota === "gratuit" ? Lock : CalendarClock;
  return (
    <div
      role="status"
      className="mx-margin-mobile flex flex-wrap items-center gap-3.5 rounded-ds-card bg-ds-alerte-fond px-5 py-4 md:mx-0"
    >
      <Icone aria-hidden="true" size={20} strokeWidth={1.9} className="shrink-0 text-ds-alerte-encre" />
      <span className="flex min-w-0 flex-[1_1_320px] flex-col gap-[3px]">
        <span className="text-[14px] leading-[normal] font-bold text-ds-alerte-encre">{titre}</span>
        <span className="text-[13px] leading-[1.5] text-ds-texte-corps">{texte}</span>
      </span>
      {quota === "gratuit" ? (
        <Link
          href={versPasserPro}
          className="inline-flex h-11 items-center gap-2 rounded-ds-card border border-ds-filet bg-ds-surface-carte px-[18px] text-[14px] leading-[normal] font-semibold text-ds-accent transition-colors hover:text-ds-accent-survol focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
        >
          {passerPro}
          <ArrowRight aria-hidden="true" size={16} strokeWidth={2} />
        </Link>
      ) : null}
    </div>
  );
}
