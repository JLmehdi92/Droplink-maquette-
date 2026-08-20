import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl:{rejectUnauthorized:false} });
await c.connect();
const { rows } = await c.query(`select p.id as profil, s.id as shop, p.user_id
  from public.profiles p join public.shops s on s.owner_id = p.id
  order by p.created_at limit 1`);
if (!rows[0]) { console.log("aucun compte de mesure en base — le jeu a ete nettoye"); process.exit(0); }
const { user_id, shop } = rows[0];
const { rows: n } = await c.query(`select count(*)::text n from public.orders where shop_id=$1`,[shop]);
console.log("commandes du compte :", n[0].n);

await c.query("begin");
await c.query("set local role authenticated");
await c.query(`set local request.jwt.claims = '{"sub":"${user_id}"}'`);
const r = await c.query(`explain (analyze, buffers) select id, customer_label, created_at
  from public.orders where archived_at is null order by created_at desc, id desc limit 50`);
console.log(r.rows.map(x=>x["QUERY PLAN"]).join("\n"));
await c.query("rollback");
await c.end();
