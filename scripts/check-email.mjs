#!/usr/bin/env node
/**
 * ÉPROUVE QUE LE VEILLEUR PEUT RÉELLEMENT ALERTER — un envoi VRAI, de bout en bout.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI CET OUTIL VIT ICI, ET SURTOUT PAS DANS LA SUITE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `charger-env.ts` débranche les tiers payants et le transport REFUSE tout appel
 * vers `api.resend.com` : une suite qui enverrait de vrais emails en enverrait à
 * chaque exécution, et consommerait un quota. C'est délibéré, et ça laisse un
 * trou qu'il faut boucher ailleurs — sinon « le veilleur peut alerter » resterait
 * une affirmation que personne n'a exécutée (L-014).
 *
 * Il est donc le jumeau de `pnpm check:r2` : hors des portes, lancé à la main,
 * et il joint le VRAI service.
 *
 * ⚠️ CE QU'IL PROUVE, ET CE QU'IL NE PROUVE PAS. Il prouve que la configuration
 * et le domaine d'envoi permettent à un message de PARTIR — Resend rend un
 * identifiant, et un identifiant ne s'invente pas. Il ne prouve pas la
 * réception : seule une boîte réelle peut le dire, et c'est pour ça que le
 * message porte l'instruction de vérifier.
 *
 * ⚠️ ET IL NE RÉÉCRIT PAS LA RÈGLE DE VALIDATION. Les gabarits non substitués,
 * les chevrons, la liste de ce qui manque : tout cela vit dans
 * `lib/email/config.ts` et est éprouvé par `email-config.test.ts`. Ici on ne
 * vérifie que la PRÉSENCE, puis on laisse le service trancher — c'est lui
 * l'autorité sur « ce domaine peut-il envoyer ».
 *
 * Usage : pnpm check:email
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const REQUISES = ["RESEND_API_KEY", "EMAIL_ALERTES_DE", "EMAIL_ALERTES_A"];
const manquantes = REQUISES.filter((n) => (process.env[n] ?? "").trim() === "");

if (manquantes.length > 0) {
  console.error(
    `ECHEC configuration incomplete : ${manquantes.join(", ")}. ` +
      "Tant qu'elles manquent, le veilleur constate les pannes et se TAIT.",
  );
  process.exit(1);
}

const expediteur = process.env.EMAIL_ALERTES_DE.trim();
const destinataire = process.env.EMAIL_ALERTES_A.trim();
const horodatage = new Date().toISOString();

console.log(`Envoi de « ${expediteur} » vers « ${destinataire} »…`);

const reponse = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: {
    authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    from: expediteur,
    to: [destinataire],
    subject: "[DropLink] verification de la voie d'alerte",
    text:
      "Ceci est le controle de la voie d'alerte du veilleur.\n\n" +
      `Emis le ${horodatage}.\n\n` +
      "Si tu lis ce message, la chaine complete fonctionne : cle Resend valide,\n" +
      "domaine d'envoi verifie, expediteur et destinataire corrects. Le jour ou\n" +
      "un planificateur tombera, l'alerte partira par ce meme chemin.\n\n" +
      "Si tu ne le lis PAS alors que ce script a affiche OK, le probleme est en\n" +
      "aval : filtre anti-spam, ou routage de la boite. Chercher la, pas dans le code.",
  }),
});

const corps = await reponse.text();

if (!reponse.ok) {
  console.error(`ECHEC envoi refuse — HTTP ${reponse.status} ${corps}`);
  process.exit(1);
}

/*
 * L'IDENTIFIANT EST LA PREUVE, PAS LE 200. « Il repond » est la propriete que
 * tous les residus possedent : un 200 sans identifiant voudrait dire que la
 * requete a ete acceptee sans qu'aucun message n'existe.
 */
let identifiant = null;
try {
  identifiant = JSON.parse(corps).id ?? null;
} catch {
  identifiant = null;
}

if (identifiant === null) {
  console.error(`ECHEC 200 sans identifiant de message — reponse : ${corps.slice(0, 300)}`);
  process.exit(1);
}

console.log(`OK    message accepte par Resend, identifiant ${identifiant}`);
console.log("      Verifier maintenant la boite de reception : c'est la seule");
console.log("      chose que ce script ne peut pas prouver a ta place.");
