import { config } from "dotenv";
import { installerTransportResilient } from "./transport";

// Les sondes lisent la base reelle : sans .env.local elles echoueraient sur une
// absence de configuration plutot que sur une propriete de securite, ce qui est
// exactement le genre d'echec qu'on apprend a ignorer.
config({ path: ".env.local", quiet: true });

/*
 * LE TRANSPORT RESILIENT, POSE POUR TOUT LE PROCESSUS.
 *
 * Il couvre les clients du harnais ET ceux que le PRODUIT fabrique lui-meme —
 * `creerClientSysteme` en tete —, qu'aucune injection n'atteint. Voir
 * `transport.ts` pour ce qu'il refuse de reessayer, et pourquoi ce n'est pas
 * plier le produit au test.
 */
installerTransportResilient();
