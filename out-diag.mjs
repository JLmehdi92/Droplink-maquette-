import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.test.local", quiet: true });
config({ path: ".env.local", quiet: true });
const s = createClient(process.env["NEXT_PUBLIC_SUPABASE_URL"], process.env["SUPABASE_SERVICE_ROLE_KEY"], { auth: { persistSession: false } });
const { data: shops } = await s.from("shops").select("id").limit(1);
console.log("boutiques:", shops?.length ?? 0);
if (shops?.length) {
  const r = await s.from("tracked_parcels").insert({
    shop_id: shops[0].id,
    tracking_number: "DIAG" + Date.now(),
    carrier_code: "la-poste",
    normalized_status: "en_transit",
    last_movement_at: new Date().toISOString(),
    query_count: 1,
  }).select("id");
  console.log("insertion:", JSON.stringify(r.error ?? r.data));
}
