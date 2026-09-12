import { getFormatter, getTranslations } from "next-intl/server";
import { Panneau } from "@/components/app/panneau";
import type { CommandeConsultee } from "@/lib/analyses/activite";

/**
 * LES COMMANDES LES PLUS CONSULTÉES.
 *
 * POURQUOI CE BLOC EXISTE. Le brief fixe « vues de lien par commande > 3 »
 * comme signal que le destinataire REVIENT. La moyenne le dit pour le compte
 * entier ; ce classement dit QUELLES commandes le portent, et c'est ce qui
 * permet au vendeur de reconnaître ce qui marche.
 *
 * ⚠️ LES LIGNES NE SONT PAS CLIQUABLES, alors que ce serait commode. La
 * planche ne dessine aucun lien ici, et un lien change la couleur du libellé,
 * le curseur et le survol : trois écarts visibles pour un raccourci que la
 * liste des commandes offre déjà. La conformité tranche, pas le confort.
 *
 * ⚠️ LA VIGNETTE PEUT MANQUER, ET CE N'EST PAS UNE ERREUR. Une commande sans
 * média, une vignette non produite, un stockage injoignable : la ligne reste
 * lisible, l'aplat prend la place. C'est la même règle que la liste des
 * commandes — une tuile qui manque n'est pas une page qui casse.
 */
export async function PlusConsultees({
  commandes,
}: {
  readonly commandes: readonly CommandeConsultee[];
}) {
  const t = await getTranslations("analyses");
  const format = await getFormatter();

  const maximum = commandes.reduce((m, c) => Math.max(m, c.vues), 0);

  return (
    <Panneau titre={t("consultees.titre")} sousTitre={t("consultees.aide")}>

      {commandes.length === 0 ? (
        <p className="text-[14px] text-ds-texte-corps">{t("consultees.vide")}</p>
      ) : (
        <ul className="flex flex-col gap-[13px] lg:gap-3">
          {commandes.map((c) => (
            <li key={c.id} className="flex items-center gap-3 lg:gap-3.5">
              {c.vignette === null ? (
                <span
                  aria-hidden="true"
                  className="h-10 w-10 shrink-0 rounded-ds-sm bg-ds-surface-creux"
                />
              ) : (
                // `next/image` optimiserait une URL signée à expiration : le
                // cache de l'optimiseur survivrait à la signature et servirait
                // une image dont le lien est mort. Une balise nue rend la
                // vignette telle qu'elle est stockée, déjà à sa taille.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.vignette}
                  alt=""
                  width={40}
                  height={40}
                  loading="lazy"
                  decoding="async"
                  className="h-10 w-10 shrink-0 rounded-ds-sm object-cover"
                />
              )}

              <div className="min-w-0 grow">
                {/* ⚠️ ICI ON NOMME L'ABSENCE, alors que la page publique
                    l'OMET. La décision 26 vaut pour le client : lui montrer un
                    texte de remplacement serait inventer. Le vendeur, lui,
                    DÉCIDE — une ligne sans libellé lui ferait chercher laquelle
                    de ses commandes il regarde. Le champ est un texte libre et
                    facultatif : ne rien écrire laisserait la ligne muette. */}
                <p className="truncate text-[14px] leading-[18px] font-semibold text-ds-texte-fort">
                  {c.client === null || c.client.trim() === ""
                    ? t("consultees.sansNom")
                    : c.client}
                </p>
                {c.reference === null || c.reference.trim() === "" ? null : (
                  <p className="mt-px truncate text-[12.5px] leading-[16px] text-ds-texte-sourdine">
                    {c.reference}
                  </p>
                )}
              </div>

              <div
                aria-hidden="true"
                className="hidden h-2 w-[200px] shrink-0 overflow-hidden rounded-ds-pill bg-ds-surface-creux lg:block"
              >
                <span
                  className="block h-full rounded-ds-pill bg-ds-accent"
                  style={{ width: (maximum === 0 ? 0 : (c.vues / maximum) * 100) + "%" }}
                />
              </div>

              <span className="shrink-0 text-right text-[15px] leading-5 font-extrabold text-ds-texte-fort lg:w-11 lg:text-[14px] lg:font-bold">
                {format.number(c.vues)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panneau>
  );
}
