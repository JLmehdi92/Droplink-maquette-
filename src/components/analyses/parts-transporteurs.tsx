import { getFormatter, getTranslations } from "next-intl/server";
import { MoreHorizontal } from "lucide-react";
import { Panneau } from "@/components/app/panneau";
import { lireTransporteur, monogramme } from "@/lib/tracking/transporteurs";
import type { PartTransporteur } from "@/lib/analyses/activite";

/**
 * TRANSPORTEURS LES PLUS UTILISÉS — le panneau du kit que l'écran n'avait pas.
 *
 * Valeurs relevées sur la page servie : lignes à l'écart 14, monogramme 32 au
 * rayon `sm`, nom sur 92 px à 14/500 tronqué à l'ellipse, piste de 9 px au rayon
 * pilule, et la valeur « N (P %) » à 13/600 sur 66 px alignée à droite.
 *
 * ⚠️ LA BARRE EST UNE PART DU PLUS GRAND, PAS DU TOTAL, et c'est ce que fait le
 * kit — il divise par 27, la part de son premier transporteur. Diviser par le
 * total donnerait six barres minuscules dès qu'un vendeur emploie six
 * transporteurs, alors que le panneau existe pour comparer les uns aux autres.
 * Le POURCENTAGE, lui, reste bien une part du total : c'est le chiffre, pas le
 * dessin, qui doit répondre à « quelle proportion de mes envois ».
 *
 * ⚠️ CINQ LIGNES PUIS « AUTRES », comme le kit. Sans ce repli, un vendeur qui
 * emploie vingt transporteurs obtiendrait vingt lignes de deux pixels de haut —
 * et la somme des parts affichées cesserait de valoir cent dès qu'on tronquerait
 * sans le dire.
 */
const LIGNES = 5;

export async function PartsTransporteurs({ parts }: { readonly parts: readonly PartTransporteur[] }) {
  const t = await getTranslations("analyses");
  const format = await getFormatter();

  const total = parts.reduce((s, p) => s + p.nombre, 0);

  /*
   * LE NOM SE RÉSOUT DANS LE DÉPÔT, jamais en base : `carrier_code` est
   * l'identifiant numérique du fournisseur de suivi, et le catalogue officiel
   * de 17TRACK est figé dans `lib/tracking/transporteurs.json`.
   *
   * Un code que le catalogue ne connaît pas — il en ajoute — porte un libellé
   * NOMMÉ et non un vide : sur un panneau de répartition, une ligne sans nom
   * ferait douter du total, alors qu'ici l'information « on ne sait pas lequel »
   * est exacte et utile.
   */
  const nommees = parts.map((p) => ({
    nom: (p.code === null ? null : lireTransporteur(p.code)?.nom) ?? t("transporteurs.inconnu"),
    nombre: p.nombre,
  }));

  const tete = nommees.slice(0, LIGNES);
  const reste = nommees.slice(LIGNES).reduce((s, p) => s + p.nombre, 0);
  const lignes = reste === 0 ? tete : [...tete, { nom: t("transporteurs.autres"), nombre: reste }];

  const maximum = lignes.reduce((m, l) => Math.max(m, l.nombre), 0);

  return (
    <Panneau titre={t("transporteurs.titre")} sousTitre={t("transporteurs.aide")}>
      {total === 0 ? (
        <p className="text-[14px] text-ds-texte-corps">{t("transporteurs.aucun")}</p>
      ) : (
        <ul className="flex flex-col gap-3.5">
          {lignes.map((l) => {
            const m = monogramme(l.nom);
            const estAutres = l.nom === t("transporteurs.autres");
            return (
              <li key={l.nom} className="flex items-center gap-3">
                {estAutres ? (
                  <span className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-ds-sm bg-ds-surface-creux text-ds-texte-sourdine">
                    <MoreHorizontal aria-hidden="true" size={16} strokeWidth={1.9} />
                  </span>
                ) : (
                  <span
                    className={
                      /* 11 px AU BUREAU, comme le kit ; 11,5 en dessous, plancher de la
                         regle 5. Un monogramme de deux lettres a 11 px se lit a la
                         loupe sur un telephone, et c est la seule des cinq regles qui
                         protege quelqu un qui n a pas le choix de son ecran. */
                      "inline-flex h-8 w-8 flex-none items-center justify-center rounded-ds-sm text-[11.5px] leading-[normal] font-extrabold tracking-[-0.02em] lg:text-[11px] " +
                      (m.fond === null ? "bg-ds-surface-creux text-ds-texte-corps" : "")
                    }
                    style={
                      m.fond === null
                        ? undefined
                        : { background: m.fond, color: m.encre ?? undefined }
                    }
                  >
                    {m.court}
                  </span>
                )}
                <span className="w-[92px] flex-none truncate text-[14px] leading-[normal] font-medium text-ds-texte-fort">
                  {l.nom}
                </span>
                {/* La piste est DÉCORATIVE : le chiffre à droite porte
                    l'information, elle n'a rien à annoncer de plus. */}
                <span
                  aria-hidden="true"
                  className="h-[9px] min-w-[30px] flex-1 overflow-hidden rounded-ds-pill bg-ds-surface-creux"
                >
                  <span
                    className="block h-full rounded-ds-pill bg-ds-accent"
                    style={{ width: `${(l.nombre / maximum) * 100}%` }}
                  />
                </span>
                <span className="w-[66px] text-right text-[13px] leading-[normal] font-semibold whitespace-nowrap text-ds-texte-corps">
                  {format.number(l.nombre)} ({Math.round((l.nombre / total) * 100)} %)
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Panneau>
  );
}
