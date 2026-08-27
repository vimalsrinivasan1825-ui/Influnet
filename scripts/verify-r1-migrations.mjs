#!/usr/bin/env node
import { sql } from '../tests/e2e/lib/sql.mjs';

try {
  const r = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'campaign_projects' AND column_name = 'flow_key'`;
  console.log('✅ flow_key on campaign_projects:', r.length > 0);

  const r2 = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'project_proposals' AND column_name = 'flow_key'`;
  console.log('✅ flow_key on project_proposals:', r2.length > 0);

  const r3 = await sql`SELECT tgname FROM pg_trigger WHERE tgname = 'trg_prevent_flow_immutable'`;
  console.log('✅ immutability trigger:', r3.length > 0);

  const r4 = await sql`SELECT tgname FROM pg_trigger WHERE tgname = 'trg_short_payment_guard'`;
  console.log('✅ payment guard trigger:', r4.length > 0);

  const r5 = await sql`SELECT pronargs FROM pg_proc WHERE proname = 'propose_project' ORDER BY pronargs DESC LIMIT 1`;
  console.log('✅ propose_project args:', r5[0]?.pronargs, '(expected 11)');
} catch(e) {
  console.error('❌', e.message);
}
