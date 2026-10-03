import Image from "next/image";
import { getTranslations } from "next-intl/server";
import symbole from "@/../public/marque/logo-symbole.png";

/**
 * LE BANDEAU DE PIED DES ANALYSES (maquette, `.bandeau-analyses`) : une phrase
 * sur ce que l'écran mesure, et la signature DropLink. C'est NOTRE écran : le
 * symbole y est le nôtre, jamais la couleur d'un vendeur.
 */
export async function BandeauAnalyses() {
  const t = await getTranslations("analyses.bandeau");
  return (
    <aside className="bandeau-analyses" aria-label={t("aria")}>
      <div>
        <p className="bandeau-analyses__titre">{t("titre")}</p>
        <p>{t("aide")}</p>
      </div>
      <div className="bandeau-analyses__marque">
        <p>
          {t("propulse")}{" "}
          <b>
            <Image src={symbole} alt="" height={14} width={Math.round((14 * 520) / 724)} />
            DropLink
          </b>
        </p>
        <p className="bandeau-analyses__slogan">{t("slogan")}</p>
      </div>
    </aside>
  );
}
