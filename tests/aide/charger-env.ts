import { config } from "dotenv";
import { installerTransportResilient } from "./transport";

/*
 * ⚠️ LA BASE DES TESTS D ABORD, LA PRODUCTION JAMAIS.
 *
 * `.env.test.local` est charge EN PREMIER et `dotenv` ne remplace pas une
 * variable deja posee : ses valeurs gagnent donc sur celles de `.env.local`,
 * qui ne sert plus qu au complement (cle de hachage, bord de confiance, etc.).
 *
 * Jusqu au 06/09/2026 il n y avait qu un projet Supabase, et les suites
 * ecrivaient dans la PRODUCTION. Une d elles a efface de vrais colis le 05/09,
 * chacun valant 1 des 200 prises en charge A VIE du fournisseur de suivi.
 *
 * ⚠️ CE FICHIER NE SUFFIT PAS, ET IL NE PRETEND PAS SUFFIRE. S il disparait,
 * les suites repartiraient sur la production en silence. Ce qui l interdit
 * vraiment est `exigerBaseDeTests()`, appelee par l amorcage global : elle
 * refuse la production NOMMEMENT et exige que la base se declare elle-meme.
 * Le present chargement est une commodite ; la garde est ailleurs, et elle
 * echoue ferme.
 */
config({ path: ".env.test.local", quiet: true });

// Les sondes lisent la base reelle : sans .env.local elles echoueraient sur une
// absence de configuration plutot que sur une propriete de securite, ce qui est
// exactement le genre d'echec qu'on apprend a ignorer.
config({ path: ".env.local", quiet: true });

/*
 * LE TRANSPORT RESILIENT, POSE POUR TOUT LE PROCESSUS.
 *
 * Il couvre les clients du harnais ET ceux que le PRODUIT fabrique lui-meme —
 * `creerClientSysteme` en tete —, qu'aucune injection n'atteint. Il porte aussi
 * le REFUS des appels sortants vers les tiers qui coutent ou qui polluent : voir
 * `transport.ts`, c'est lui la vraie garde.
 */
installerTransportResilient();

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * LES TIERS PAYANTS SONT DEBRANCHES POUR LA DUREE DE LA SUITE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ CONSTATE LE 01/09/2026, A LA MINUTE OU LES CLES ONT ETE POSEES. Tant que
 * `.env.local` etait vide, la suite ne pouvait joindre personne, et trois tests
 * decrivaient cet etat comme s'il etait une propriete. Les cles renseignees, la
 * MEME suite s'est mise a appeler `/register` chez le fournisseur de suivi — dont
 * le quota est de 200 prises en charge A VIE — et a emettre de VRAIS evenements
 * d'usage dans le projet d'analytics de production.
 *
 * Le second est le plus grave. `order_created` est le denominateur du taux
 * d'activation, et 648 tests l'emettent : la metrique de verdict de la phase
 * aurait ete faussee par sa propre suite de tests, en restant credible.
 *
 * ON DEBRANCHE DONC ICI, ET ON LE DIT. Le retrait des cles rend la suite
 * DETERMINISTE et silencieuse ; il n'est PAS la protection — une protection qui
 * tient a une absence n'en est pas une (L-029). La protection est le refus au
 * niveau du TRANSPORT, qui tient meme si quelqu'un relit une cle autrement.
 *
 * ⚠️ CE QU'ON NE DEBRANCHE PAS : Supabase, qui EST le systeme sous test, et le
 * depot d'objets, que `pnpm check:r2` eprouve de bout en bout avec de vrais
 * identifiants. On ne coupe que ce dont un appel COUTE ou POLLUE.
 */
const TIERS_DEBRANCHES = ["TRACKING_API_KEY", "NEXT_PUBLIC_POSTHOG_KEY", "RESEND_API_KEY"];

const debranches = TIERS_DEBRANCHES.filter((nom) => {
  const valeur = process.env[nom];
  if (valeur === undefined || valeur.trim() === "") return false;
  delete process.env[nom];
  return true;
});

if (debranches.length > 0) {
  // DIT A CHAQUE EXECUTION, jamais en silence : une suite qui debranche un tiers
  // sans le dire ferait croire qu'elle eprouve un chemin qu'elle n'emprunte pas.
  console.warn(
    `[harnais] Tiers payants debranches pour cette execution : ${debranches.join(", ")}. ` +
      "Les chemins qui en dependent sont eprouves avec un `fetch` substitue, " +
      "jamais contre le vrai service.",
  );
}
