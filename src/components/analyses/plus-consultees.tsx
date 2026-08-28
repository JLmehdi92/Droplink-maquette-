import { getFormatter, getTranslations } from "next-intl/server";
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
    <section
      aria-label={t("consultees.titre")}
      className="rounded-lg border border-outline-variant bg-surface-container-lowest p-[18px] lg:rounded-[18px] lg:p-[22px]"
    >
      <h2 className="mb-1 font-headline-md text-[15px] leading-[19px] font-bold tracking-normal text-on-surface lg:mb-1.5 lg:text-[16px] lg:leading-[21px] lg:tracking-[-0.015em]">
        {t("consultees.titre")}
      </h2>
      <p className="mb-4 font-body-sm text-[13px] leading-[19px] text-sourdine lg:mb-[18px] lg:leading-4">
        {t("consultees.aide")}
      </p>

      {commandes.length === 0 ? (
        <p className="font-body-md text-[14px] text-on-surface-variant">{t("consultees.vide")}</p>
      ) : (
        <ul className="flex flex-col gap-[13px] lg:gap-3">
          {commandes.map((c) => (
            <li key={c.id} className="flex items-center gap-3 lg:gap-3.5">
              {c.vignette === null ? (
                <span
                  aria-hidden="true"
                  className="h-10 w-10 shrink-0 rounded-[10px] bg-fond-avatar"
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
                  className="h-10 w-10 shrink-0 rounded-[10px] object-cover"
                />
              )}

              <div className="min-w-0 grow">
                {/* ⚠️ ICI ON NOMME L'ABSENCE, alors que la page publique
                    l'OMET. La décision 26 vaut pour le client : lui montrer un
                    texte de remplacement serait inventer. Le vendeur, lui,
                    DÉCIDE — une ligne sans libellé lui ferait chercher laquelle
                    de ses commandes il regarde. Le champ est un texte libre et
                    facultatif : ne rien écrire laisserait la ligne muette. */}
                <p className="truncate font-headline-md text-[14px] leading-[18px] font-semibold text-on-surface">
                  {c.client === null || c.client.trim() === ""
                    ? t("consultees.sansNom")
                    : c.client}
                </p>
                {c.reference === null || c.reference.trim() === "" ? null : (
                  <p className="mt-px truncate font-body-sm text-[12px] leading-[15px] text-sourdine">
                    {c.reference}
                  </p>
                )}
              </div>

              <div
                aria-hidden="true"
                className="hidden h-2 w-[200px] shrink-0 overflow-hidden rounded-full bg-filet-ligne lg:block"
              >
                <span
                  className="block h-full rounded-full bg-violet"
                  style={{ width: (maximum === 0 ? 0 : (c.vues / maximum) * 100) + "%" }}
                />
              </div>

              <span className="shrink-0 text-right font-headline-md text-[15px] leading-5 font-extrabold text-on-surface lg:w-11 lg:text-[14px] lg:font-bold">
                {format.number(c.vues)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
