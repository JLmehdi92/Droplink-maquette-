/**
 * L'ESPACE VENDEUR RÉPOND-IL EN PRODUCTION, AVEC UNE VRAIE SESSION ?
 *
 * C'est la surface où Wassim va créer sa commande réelle, et la seule qui n'ait
 * jamais été exercée en ligne AUTREMENT QUE PAR SON REFUS : on savait que
 * `/fr/commandes` rend 307 sans session, jamais ce qu'elle SERT à qui a le
 * droit. Une suite où tout est refusé passe à 100 % sans rien prouver.
 *
 * L'enjeu est précis : la session voyage dans un cookie que `@supabase/ssr`
 * pose, que le MIDDLEWARE rafraîchit — donc en exécution *edge* — et que les
 * Server Components relisent en Node. C'est exactement la frontière où le
 * défaut du 04/09 s'était logé, invisible en local parce qu'un fichier `.env`
 * y masque la différence.
 *
 * Le jeu de mesure est créé puis supprimé. Le mot de passe n'a AUCUN rapport
 * avec l'adresse : la politique refuse un mot de passe qui contient la partie
 * locale, et une sonde refusée pour cette raison ferait chercher un défaut
 * inexistant.
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { fetchResilient } from "./transport.mjs";

config({ path: ".env.local", quiet: true });

const base = (process.argv[2] ?? "").replace(/\/$/, "");
if (!base.startsWith("http")) {
  console.error(
    "Usage : node scripts/verifier-vendeur.mjs <base-url>\n" +
      "Exemple : node scripts/verifier-vendeur.mjs https://droplink.fr",
  );
  process.exit(2);
}

const urlSupabase = process.env["NEXT_PUBLIC_SUPABASE_URL"];
const service = createClient(urlSupabase, process.env["SUPABASE_SERVICE_ROLE_KEY"], {
  auth: { persistSession: false },
});
const publiable = createClient(urlSupabase, process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"], {
  auth: { persistSession: false },
});

const MOT_DE_PASSE = "Chariot-Lilas-Tempete-91";
const controles = [];
const constate = (ok, libelle) => controles.push([ok, libelle]);

const visiteur = { "user-agent": "sonde-vendeur/1", accept: "text/html" };

/*
 * ⚠️ `fetchResilient` ET NON `fetch` — un contrôle qui échoue par intermittence
 * doit être BORNÉ, pas relancé jusqu'au vert. Constaté sur cette sonde même :
 * un passage a rendu 13/13, le suivant s'est interrompu sur « fetch failed »
 * au onzième contrôle. Le module ne réessaie qu'une COUPURE — quand `fetch`
 * rejette, donc quand il n'y a eu aucune réponse HTTP. Un 307, un 404, un 500
 * sont des RÉPONSES : ce sont exactement celles que cette sonde cherche, et les
 * réessayer masquerait les défauts au lieu des aléas.
 */
const lire = async (chemin, cookie) => {
  const r = await fetchResilient(`${base}${chemin}`, {
    headers: cookie ? { ...visiteur, cookie } : visiteur,
    redirect: "manual",
  });
  const corps = r.status === 200 ? await r.text() : "";
  return { statut: r.status, corps, vers: r.headers.get("location") ?? "" };
};

let compte = null;

try {
  const courriel = `fumee-${Date.now()}@exemple.test`;
  const { data: u, error: e } = await service.auth.admin.createUser({
    email: courriel,
    email_confirm: true,
    password: MOT_DE_PASSE,
  });
  if (e !== null || !u?.user) throw new Error(`compte non créé : ${e?.message}`);
  compte = u.user.id;

  const { data: p } = await service
    .from("profiles")
    .select("id")
    .eq("user_id", compte)
    .maybeSingle();
  if (!p?.id) throw new Error("profil introuvable");

  // L'onboarding est obligatoire tant que `account_type` est nul : sans lui,
  // TOUTE page de l'espace vendeur redirige vers /fr/bienvenue, et la sonde
  // mesurerait l'onboarding en croyant mesurer les commandes.
  await service
    .from("profiles")
    .update({ account_type: "reseller", locale: "fr" })
    .eq("id", p.id);

  const { data: shop } = await service
    .from("shops")
    .select("id")
    .eq("owner_id", p.id)
    .maybeSingle();
  await service.from("shops").update({ name: "Boutique de mesure" }).eq("id", shop.id);

  const { data: cmd } = await service
    .from("orders")
    .insert({
      shop_id: shop.id,
      customer_label: "Client de mesure",
      product_ref: "REF-VENDEUR",
      internal_notes: "NOTE-INTERNE-SENTINELLE-PROD",
    })
    .select("id, public_token")
    .single();

  // ── CONTRE-TEST : SANS SESSION, C'EST REFUSÉ ──
  const sans = await lire("/fr/commandes");
  constate(
    sans.statut === 307 && /connexion/.test(sans.vers),
    `CONTRE-TEST : sans session, /fr/commandes redirige (${sans.statut} -> ${sans.vers})`,
  );

  // ── LA VRAIE CONNEXION, PAR LE CHEMIN DU PRODUIT ──
  const { data: v, error: eMdp } = await publiable.auth.signInWithPassword({
    email: courriel,
    password: MOT_DE_PASSE,
  });
  constate(eMdp === null && v?.session != null, `connexion par mot de passe acceptée`);
  if (!v?.session) throw new Error("aucune session : la suite ne prouverait rien");

  const ref = new URL(urlSupabase).hostname.split(".")[0];
  const s = v.session;
  const mince = {
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    token_type: s.token_type,
    expires_in: s.expires_in,
    expires_at: s.expires_at,
    user: {
      id: s.user.id,
      aud: s.user.aud,
      role: s.user.role,
      email: s.user.email,
      app_metadata: {},
      user_metadata: {},
      created_at: s.user.created_at,
    },
  };
  const valeur = "base64-" + Buffer.from(JSON.stringify(mince)).toString("base64");
  const cookie =
    valeur.length <= 3180
      ? `sb-${ref}-auth-token=${valeur}`
      : (valeur.match(/.{1,3180}/g) ?? [])
          .map((m, i) => `sb-${ref}-auth-token.${i}=${m}`)
          .join("; ");

  // ── CE QUE L'ESPACE VENDEUR SERT À QUI A LE DROIT ──
  const liste = await lire("/fr/commandes", cookie);
  constate(liste.statut === 200, `/fr/commandes répond avec session (${liste.statut})`);
  constate(
    liste.corps.includes("Client de mesure"),
    "la liste porte bien la commande du compte",
  );

  const editeur = await lire(`/fr/commandes/${cmd.id}`, cookie);
  constate(editeur.statut === 200, `l'éditeur répond (${editeur.statut})`);
  constate(
    editeur.corps.includes("REF-VENDEUR"),
    "l'éditeur porte la référence produit de la commande",
  );

  for (const chemin of ["/fr/envois", "/fr/analyses", "/fr/marque"]) {
    const r = await lire(chemin, cookie);
    constate(r.statut === 200, `${chemin} répond (${r.statut})`);
  }

  // ── L'ADMIN RESTE FERMÉ À UN VENDEUR, ET EN 404 ──
  //
  // Un 403 confirmerait l'existence de la surface à qui n'y a pas droit.
  const admin = await lire("/fr/admin", cookie);
  constate(admin.statut === 404, `l'admin reste 404 pour un vendeur (${admin.statut})`);

  // ── LA NOTE INTERNE NE SORT PAS SUR LA PAGE CLIENT ──
  //
  // Contrôle par VALEUR : la sentinelle est cherchée dans le HTML servi,
  // charges d'hydratation comprises. Un contrôle par nom de champ laisserait
  // passer la même valeur republiée sous n'importe quel autre nom.
  const publique = await lire(`/p/${cmd.public_token}`);
  constate(publique.statut === 200, `la page client répond (${publique.statut})`);
  constate(
    !publique.corps.includes("NOTE-INTERNE-SENTINELLE-PROD"),
    "la note interne ne fuit PAS sur la page client",
  );
  // CONTRE-TEST DE LA SENTINELLE : si elle n'apparaissait nulle part, même
  // chez le vendeur, le contrôle ci-dessus serait vrai sans rien prouver.
  constate(
    editeur.corps.includes("NOTE-INTERNE-SENTINELLE-PROD"),
    "CONTRE-TEST : la sentinelle EST bien servie au vendeur, dans son éditeur",
  );
} catch (erreur) {
  constate(false, `la sonde s'est interrompue : ${erreur.message}`);
} finally {
  if (compte !== null) {
    const { error } = await service.auth.admin.deleteUser(compte);
    if (error !== null) console.error(`⚠️ compte ${compte} NON supprimé : ${error.message}`);
  }
}

const PLANCHER = 12;
console.log("");
for (const [ok, l] of controles) console.log(`  ${ok ? "OK  " : "ÉCART"} ${l}`);
const ecarts = controles.filter(([ok]) => !ok).length;
console.log(
  `\n${controles.length} contrôle(s), ${ecarts} écart(s)` +
    (controles.length < PLANCHER ? ` — INSUFFISANT, il en faut ${PLANCHER}` : ""),
);
process.exit(ecarts > 0 || controles.length < PLANCHER ? 1 : 0);
