import "server-only";
import { cache } from "react";
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
    readonly site: string | null;
  };
};

/**
 * Rend le profil du vendeur connecté, ou `null`.
 *
 * `null` couvre deux cas volontairement indistincts pour l'appelant : aucune
 * session, ou une session dont le profil a disparu. Les deux se traitent de la
 * même façon — renvoyer vers la connexion — et les distinguer n'apporterait
 * qu'une occasion de se tromper.
 *
 * ⚠️ MÉMOÏSÉE PAR REQUÊTE — `cache()` de React, pas un cache de données.
 *
 * DÉFAUT RÉEL, TROUVÉ À L'AUDIT DU 26/08/2026. Le commentaire de la requête
 * ci-dessous dit « une seule requête, jointure comprise : deux allers-retours
 * par page authentifiée doubleraient la latence de l'écran le plus utilisé du
 * produit ». C'est exactement ce qui se passait — non pas dans la requête, mais
 * autour d'elle : le layout de l'espace authentifié appelle cette fonction, et
 * CHAQUE page l'appelle à son tour. Deux fois la même lecture `profiles ⨝
 * shops`, en série, à chaque navigation.
 *
 * C'était la seule chose qui ralentissait TOUS les boutons de la même façon,
 * indépendamment de la volumétrie — donc la première à corriger sur un « c'est
 * lent quand je clique ».
 *
 * CE QUE `cache()` FAIT, ET SURTOUT CE QU'IL NE FAIT PAS : il déduplique les
 * appels À L'INTÉRIEUR D'UNE MÊME REQUÊTE. Rien n'est conservé d'une requête à
 * l'autre, rien n'est partagé entre utilisateurs, et la RLS reste évaluée
 * puisque la requête part réellement — simplement une fois au lieu de deux. Un
 * cache de données ici serait un défaut de sécurité : le profil porte le statut
 * du compte, et un compte suspendu doit cesser d'être servi immédiatement.
 *
 * Le motif est déjà employé pour `lireCommandePublique` et `exigerAdmin` ; il
 * manquait ici, où il paie le plus.
 */
export const lireProfilVendeur = cache(async (): Promise<ProfilVendeur | null> => {
  return lireProfilAvec(await creerClientServeur());
});

/**
 * La même lecture, mais AVEC UN CLIENT DÉJÀ EN MAIN.
 *
 * ⚠️ ELLE EXISTE POUR L'INSTANT QUI SUIT L'OUVERTURE D'UNE SESSION, et pour lui
 * seul. `creerClientServeur()` construit son client à partir des COOKIES ; or
 * dans la Server Action qui vient d'appeler `signInWithPassword`, la session
 * n'existe encore que dans l'instance qui l'a obtenue et dans des cookies posés
 * à la même milliseconde. Refaire un client à ce moment-là, c'est parier sur le
 * fait qu'un cookie écrit pendant la requête se relit dans la même requête —
 * un pari qui, perdu, rendrait `null` et enverrait un utilisateur parfaitement
 * authentifié sur « votre compte n'a pas pu être ouvert ».
 *
 * On ne parie pas : on passe le client qui SAIT.
 *
 * ⚠️ ET ELLE N'EST PAS MÉMOÏSÉE, contrairement à `lireProfilVendeur`. Deux
 * clients différents peuvent porter deux sessions différentes dans la même
 * requête — c'est exactement le cas ici, avant et après la connexion. Une
 * mémoïsation partagée servirait la réponse de l'un à l'autre.
 */
export async function lireProfilAvec(
  supabase: Awaited<ReturnType<typeof creerClientServeur>>,
): Promise<ProfilVendeur | null> {
  /*
   * ⚠️ LA SESSION EST VALIDÉE PAR LE SERVEUR D'AUTHENTIFICATION, PAS SEULEMENT
   * PAR LA RLS. DÉFAUT RÉEL, MESURÉ LE 01/09/2026 EN ÉPROUVANT LA DÉCONNEXION.
   *
   * Ce qui a été relevé, en interrogeant les deux services avec le MÊME jeton,
   * avant et après un `signOut()` :
   *
   *     avant   /rest/v1/profiles → 200      /auth/v1/user → 200
   *     après   /rest/v1/profiles → 200      /auth/v1/user → 403 session_not_found
   *
   * PostgREST ne valide qu'une SIGNATURE et une DATE D'EXPIRATION. Il ne sait
   * rien des sessions : un jeton d'accès révoqué reste parfaitement valide à ses
   * yeux jusqu'à son expiration, soit une heure par défaut.
   *
   * CONSÉQUENCE, SI CETTE FONCTION S'ÉTAIT CONTENTÉE DE LA RLS : la déconnexion
   * aurait effacé le cookie du navigateur et RIEN D'AUTRE. Quelqu'un qui aurait
   * copié le cookie — le cas même qui justifie ce bouton, le téléphone prêté —
   * aurait gardé l'éditeur, l'export CSV et les notes internes pendant une heure
   * de plus. L'écran aurait dit « déconnecté », la base n'aurait rien dit, et
   * aucun test n'aurait rougi. C'est la sonde de fumée qui l'a attrapé, en
   * REJOUANT LE MÊME COOKIE.
   *
   * LES DEUX APPELS PARTENT EN PARALLÈLE : la latence ajoutée est celle du plus
   * lent des deux, pas leur somme. Le commentaire ci-dessous — « deux
   * allers-retours doubleraient la latence de l'écran le plus utilisé » — reste
   * donc vrai, et c'est précisément pourquoi on ne les enchaîne pas.
   */
  const [session, profil] = await Promise.all([
    supabase.auth.getUser(),
    // Une seule requête, jointure comprise : deux allers-retours EN SÉRIE par
    // page authentifiée doubleraient la latence de l'écran le plus utilisé.
    supabase
      .from("profiles")
      .select(
        "id, email, account_type, status, locale, shops(id, name, logo_url, accent_color, watermark_enabled, default_language, instagram_url, tiktok_url, whatsapp_url, site_url)",
      )
      .maybeSingle(),
  ]);

  // ÉCHOUE FERMÉE. Une session que le serveur d'authentification refuse est une
  // session révoquée, expirée, ou dont le compte a disparu — les trois se
  // traitent de la même façon, et l'appelant les traite déjà comme « pas de
  // session ».
  if (session.error !== null || session.data.user === null) return null;

  const { data, error } = profil;

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
    site_url: string | null;
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
      site: s.site_url,
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
