import { config } from "dotenv";

// Les sondes lisent la base reelle : sans .env.local elles echoueraient sur une
// absence de configuration plutot que sur une propriete de securite, ce qui est
// exactement le genre d'echec qu'on apprend a ignorer.
config({ path: ".env.local", quiet: true });
