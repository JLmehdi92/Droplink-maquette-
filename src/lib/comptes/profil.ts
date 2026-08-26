import "server-only";
import { creerClientServeur } from "@/lib/supabase/server";

/**
 * Lecture du profil et de la boutique du vendeur connecté.
 *
 * TOUJOURS avec la session, donc sous RLS. Jamais le client service-role : ici
 * un humain lit ses propres données, et c'est précisément le cas où la RLS doit
 * faire son travail plutôt qu'être contournée « parce qu'on sait déjà que c'est
 * lui ». Une requête qui contourne l'isolation « juste pour aller plus vite »
 * est celle qui ramènera les données de quelqu'un d'autre le jour où le filtre
 * applicatif sera écrit de travers.
 */

export type ProfilVendeur = {
  readonly profilId: string;
  readonly email: string;
  readonly typeDeCompte: "supplier" | "reseller" | null;
  readonly statut: "active" | "suspended";
  readonly langue: string;
  readonly shopId: string;
  readonly nomBoutique: string | null;
  readonly logoUrl: string | null;
  readonly couleurAccent: string;
  readonly filigrane: boolean;
  /**
   * Langue des pages que voient les CLIENTS, distincte de `langue` qui habille
   * l'interface du vendeur. Un fournisseur peut travailler en anglais et livrer
   * en France ; confondre les deux ne se voit jamais côté vendeur.
   */
  readonly languePublique: "fr" | "en";
  /** Les trois réseaux, `null` chacun quand il n'est pas configuré. */
  readonly reseaux: {
    readonly instagram: string | null;
    readonly tiktok: string | null;
    readonly whatsapp: string | null;
  };
};

/**
 * Rend le profil du vendeur connecté, ou `null`.
 *
 * `null` couvre deux cas volontairement indistincts pour l'appelant : aucune
 * session, ou une session dont le profil a disparu. Les deux se traitent de la
 * même façon — renvoyer vers la connexion — et les distinguer n'apporterait
 * qu'une occasion de se tromper.
 */
export async function lireProfilVendeur(): Promise<ProfilVendeur | null> {
  const supabase = await creerClientServeur();

  // Une seule requête, jointure comprise : deux allers-retours par page
  // authentifiée doubleraient la latence de l'écran le plus utilisé du produit.
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, email, account_type, status, locale, shops(id, name, logo_url, accent_color, watermark_enabled, default_language, instagram_url, tiktok_url, whatsapp_url)",
    )
    .maybeSingle();

  if (error !== null || data === null) return null;

  // `shops` arrive sous forme d'objet ou de tableau selon la façon dont
  // PostgREST résout la relation. On traite les deux plutôt que de parier.
  const brutShop = data.shops as unknown;
  const shop = Array.isArray(brutShop) ? brutShop[0] : brutShop;
  if (shop === undefined || shop === null) return null;

  const s = shop as {
    id: string;
    name: string | null;
    logo_url: string | null;
    accent_color: string;
    watermark_enabled: boolean;
    default_language: string;
    instagram_url: string | null;
    tiktok_url: string | null;
    whatsapp_url: string | null;
  };

  return {
    profilId: data.id,
    email: data.email,
    typeDeCompte: data.account_type,
    statut: data.status,
    langue: data.locale,
    shopId: s.id,
    nomBoutique: s.name,
    logoUrl: s.logo_url,
    couleurAccent: s.accent_color,
    filigrane: s.watermark_enabled,
    // La contrainte `shops_langue_supportee` borne la colonne aux deux valeurs.
    // Le repli n'est donc pas un choix produit mais ce que le TYPAGE exige : la
    // base rend du `text`, et parier dessus sans contrôle serait un `as` déguisé.
    languePublique: s.default_language === "en" ? "en" : "fr",
    reseaux: {
      instagram: s.instagram_url,
      tiktok: s.tiktok_url,
      whatsapp: s.whatsapp_url,
    },
  };
}

/**
 * Vrai quand l'onboarding reste à faire.
 *
 * LE CRITÈRE EST `account_type`, et lui seul. C'est la seule colonne qui n'a NI
 * défaut NI valeur plausible : `shops.name` peut légitimement rester vide — le
 * brief dit qu'un vendeur peut envoyer un lien sans avoir rien configuré, et que
 * la page publique omet alors l'en-tête. Prendre le nom comme critère
 * renverrait donc indéfiniment vers l'onboarding quelqu'un qui a délibérément
 * choisi de ne pas nommer sa boutique.
 *
 * `account_type` est aussi ce qui rend la segmentation d'usage exploitable, et
 * la segmentation est le livrable réel de la phase de validation.
 */
export function onboardingAFaire(profil: ProfilVendeur): boolean {
  return profil.typeDeCompte === null;
}
