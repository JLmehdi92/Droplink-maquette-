import { getTranslations } from "next-intl/server";

/**
 * LE VOLET DE DROITE DES ÉCRANS D'ACCÈS — connexion et inscription.
 *
 * MASQUÉ SOUS `lg`, ET C'EST LE POINT. Il ne porte aucune information dont la
 * connexion dépend : sur un écran étroit il disparaît entièrement, sans que
 * rien ne manque. Un volet de contexte qui deviendrait nécessaire serait un
 * volet mal conçu.
 *
 * IL MONTRE LA PAGE CLIENT, en petit. C'est ce que le produit fabrique, et
 * c'est la seule chose honnête à montrer sur un écran de connexion : une photo
 * d'entrepôt illustrerait un autre produit que le nôtre.
 *
 * LE TÉMOIGNAGE DE LA PLANCHE N'EST PAS REPRIS. Elle porte une citation entre
 * guillemets suivie de « [TÉMOIGNAGE À RECUEILLIR] ». Une citation inventée sur
 * un écran de connexion est un faux avis ; l'emplacement reste vide jusqu'à ce
 * qu'un vrai vendeur nous en donne un. Ce qui le remplace est un fait
 * vérifiable : le client n'a aucun compte à créer.
 */
export async function PanneauAcces() {
  const t = await getTranslations("connexion");

  return (
    <div className="relative hidden items-center justify-center overflow-hidden bg-surface-container-low lg:flex">
      {/* DÉCOR. Deux halos, purement décoratifs, sans animation : cet écran est
          celui où l'on attend un email, pas celui où l'on regarde bouger. */}
      <div aria-hidden="true">
        <div className="absolute -top-36 -right-36 h-[480px] w-[480px] rounded-full bg-[radial-gradient(circle,rgba(124,92,245,0.20)_0%,rgba(244,244,250,0)_68%)]" />
        <div className="absolute -bottom-40 -left-30 h-[440px] w-[440px] rounded-full bg-[radial-gradient(circle,rgba(242,118,94,0.16)_0%,rgba(244,244,250,0)_68%)]" />
      </div>

      <div className="relative px-[60px] text-center">
        <div className="inline-block h-[516px] w-[284px] rounded-[38px] bg-primary p-2 text-left shadow-[0_40px_70px_-28px_rgba(14,14,19,0.4)]">
          <div className="h-full w-full overflow-hidden rounded-[31px] bg-surface-container-lowest">
            <div className="degrade-marque px-4 pt-[26px] pb-4">
              <div className="flex items-center gap-2">
                <span className="h-[22px] w-[22px] rounded-full bg-white/30" />
                <span className="font-headline-md text-[12px] leading-[15px] font-bold">Atelier Nord</span>
              </div>
              <p className="mt-2 font-headline-md text-[17px] leading-[22px] font-extrabold tracking-[-0.02em]">
                {t("apercuTitre")}
              </p>
            </div>
            <div className="p-3">
              <div className="grid grid-cols-2 gap-[5px]">
                {["#e4e2ee", "#eee4e0", "#e0e4ee", "#eaeaef"].map((teinte) => (
                  <span
                    key={teinte}
                    className="block aspect-square rounded-[9px]"
                    style={{ backgroundColor: teinte }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <p className="mt-9 font-headline-md text-[22px] leading-8 font-bold tracking-[-0.02em] text-on-surface">
          {t("panneauTitre")}
        </p>
        <p className="mt-2.5 font-body-md text-[14px] text-on-surface-variant">
          {t("panneauTexte")}
        </p>
      </div>
    </div>
  );
}
