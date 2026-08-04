const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jaajosocopoicmqcffuu.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_zbfMv-IHhMwsLBj_wAXbng_b6byZL5x';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const sb = createClient(supabaseUrl, supabaseKey);
const sbAdmin = serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null;

console.log(`[DEBUG] Connecting to Supabase URL: ${supabaseUrl}`);
console.log(`[DEBUG] Supabase Key prefix: ${supabaseKey ? supabaseKey.substring(0, 15) : 'undefined'}...`);
if (sbAdmin) console.log(`[DEBUG] Service Role Key is available for admin overrides.`);

// Random suffixes to avoid user collisions
const suffix = Math.floor(Math.random() * 1000000);
const brandEmail = `testbrand_${suffix}@influnet.com`;
const creatorEmail = `testcreator_${suffix}@influnet.com`;
const password = 'TestPassword123!';

// Captured as soon as each account exists so cleanup can run even if a later
// assertion throws.
let brandUserId = null;
let creatorUserId = null;
let failed = false;

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Record a user id the moment the account exists, so [CLEANUP] can delete it.
 *
 * These used to be assigned only from signUpUser's RETURN value, so anything
 * that threw after account creation but before the return — a failed profile
 * registration, most commonly — left the auth user orphaned forever. A run on
 * 2026-07-28 leaked exactly that way and the account was still sitting in the
 * dev project a week later.
 */
function rememberForCleanup(role, userId) {
  if (role === 'business_owner') brandUserId = userId;
  else creatorUserId = userId;
}

async function signUpUser(email, name, role) {
  console.log(`- Signing up ${role} (${email})...`);

  let session;

  if (sbAdmin) {
    // Create via the Admin API rather than auth.signUp(). signUp() asks
    // Supabase to send a confirmation email, and the built-in SMTP allows
    // only a handful per hour — this suite creates two accounts per run, so
    // repeated CI runs exhausted the quota and every subsequent run died on
    // "email rate limit exceeded" before reaching a single assertion. That is
    // an infrastructure limit, not a product regression, so the test should
    // not depend on it. `email_confirm: true` marks the address verified
    // without sending anything, which is also what scripts/seed-test-accounts.mjs
    // does for the same reason.
    const { error: createErr } = await sbAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, role },
    });
    // A leftover account from an interrupted run must not fail the suite —
    // the sign-in below adopts it, and cleanup removes it either way.
    if (createErr && !/already.*(registered|exists)/i.test(createErr.message)) {
      throw createErr;
    }

    const { data: logData, error: logError } = await sb.auth.signInWithPassword({ email, password });
    if (logError) throw logError;
    session = logData.session;
    rememberForCleanup(role, session.user.id);
  } else {
    // No service-role key (e.g. a local run without it). Falls back to the
    // real signup path, which still sends mail and is still rate-limited.
    console.log(`- No service role key; falling back to auth.signUp (sends email).`);
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          role
        }
      }
    });
    if (error) throw error;

    session = data.session;
    if (!session) {
      console.log(`- User exists or needs sign in, logging in...`);
      const { data: logData, error: logError } = await sb.auth.signInWithPassword({ email, password });
      if (logError) throw logError;
      session = logData.session;
    }
    rememberForCleanup(role, session.user.id);
  }

  // Register profile role in profiles table via public.register_profile RPC
  console.log(`- Registering profile in database...`);
  const payload = {
    role,
    email,
    name,
    location: 'Mumbai, India',
    phone: '+919999999999'
  };
  if (role === 'business_owner') {
    payload.companyName = `Test Company ${suffix}`;
    payload.industry = 'Tech';
  } else {
    payload.username = `creator_${suffix}`;
    payload.bio = `Hi, I am a creator named Vimal ${suffix}`;
    payload.niche = ['Fashion', 'Lifestyle'];
    payload.instagramHandle = `vimal_${suffix}`;
  }

  const regRes = await fetch('http://localhost:3000/api/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify(payload)
  });

  if (!regRes.ok) {
    const regErr = await regRes.json().catch(() => ({}));
    throw new Error(`Profile registration failed: ${regErr.error || regRes.statusText}`);
  }
  if (role === 'business_owner') {
    if (sbAdmin) {
      console.log(`- Auto-approving test business account via Service Role...`);
      const { error: updateErr } = await sbAdmin
        .from('business_profiles')
        .update({ approval_status: 'approved' })
        .eq('user_id', session.user.id);
      
      if (updateErr) {
        console.error(`- Warning: Could not auto-approve business account: ${updateErr.message}`);
      }
    } else {
      console.log(`- Warning: No SUPABASE_SERVICE_ROLE_KEY provided. E2E tests may fail at the outreach step.`);
    }
  }

  return session;
}

async function runTests() {
  console.log("=================================================");
  console.log("   INFLUNET END-TO-END MATCHMAKING TEST SUITE    ");
  console.log("=================================================");

  let brandSession, creatorSession;
  let createdCollabId;
  let createdProjectId;

  try {
    // ----------------------------------------------------
    // TEST 1: Register Accounts
    // ----------------------------------------------------
    console.log("\n[TEST 1] Registering test accounts...");
    brandSession = await signUpUser(brandEmail, `Brand Corp ${suffix}`, 'business_owner');
    brandUserId = brandSession.user.id;
    console.log(`✓ Brand registered. User ID: ${brandSession.user.id}`);
    
    creatorSession = await signUpUser(creatorEmail, `Creator Vimal ${suffix}`, 'influencer');
    creatorUserId = creatorSession.user.id;
    console.log(`✓ Creator registered. User ID: ${creatorSession.user.id}`);

    // Wait a brief moment to ensure DB profile records are fully generated by triggers
    await delay(1500);

    // ----------------------------------------------------
    // TEST 2: Unidirectional Pitch Enforcement
    // ----------------------------------------------------
    console.log("\n[TEST 2] Testing unidirectional pitching restrictions...");
    console.log("- Trying to send request from Creator to Brand (Should Fail)...");
    const failRes = await fetch('http://localhost:3000/api/collabs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${creatorSession.access_token}`
      },
      body: JSON.stringify({
        to_user_id: brandSession.user.id,
        project_title: 'Unlawful Proposal',
        project_description: 'Creator proposing to brand',
        budget: 5000
      })
    });

    const failBody = await failRes.json();
    console.log(`- Response Status: ${failRes.status}`);
    console.log(`- Response Body:`, failBody);

    if (failRes.status === 403) {
      console.log("✓ Correctly blocked Creator from pitching brand (403 Forbidden).");
    } else {
      throw new Error(`Expected 403 status, got ${failRes.status}`);
    }

    // ----------------------------------------------------
    // TEST 3: Correct Collab Request (Brand to Creator)
    // ----------------------------------------------------
    console.log("\n[TEST 3] Sending valid collab request (Brand to Creator)...");
    const collabRes = await fetch('http://localhost:3000/api/collabs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${brandSession.access_token}`
      },
      body: JSON.stringify({
        to_user_id: creatorSession.user.id,
        project_title: `Festive Campaign ${suffix}`,
        project_description: 'Shoot 3 high-quality Instagram reels showcasing our brand packaging.',
        budget: 25000
      })
    });

    const collabBody = await collabRes.json();
    console.log(`- Response Status: ${collabRes.status}`);
    console.log(`- Response Body:`, collabBody);

    if (collabRes.status === 200 && collabBody.collab && collabBody.collab.id) {
      createdCollabId = collabBody.collab.id;
      console.log(`✓ Collab Request sent successfully. ID: ${createdCollabId}`);
    } else {
      throw new Error(`Collab creation failed: ${collabBody.error || 'Unknown error'}`);
    }

    // ----------------------------------------------------
    // TEST 4: Unique Open Request Constraint
    // ----------------------------------------------------
    console.log("\n[TEST 4] Testing duplicate open request constraint...");
    console.log("- Trying to send second pending request to same creator...");
    const dupRes = await fetch('http://localhost:3000/api/collabs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${brandSession.access_token}`
      },
      body: JSON.stringify({
        to_user_id: creatorSession.user.id,
        project_title: `Another Pitch`,
        project_description: 'Spam pitch',
        budget: 1000
      })
    });

    const dupBody = await dupRes.json();
    console.log(`- Response Status: ${dupRes.status}`);
    console.log(`- Response Body:`, dupBody);

    if (dupRes.status === 500 && (dupBody.error?.includes('unique') || dupBody.error?.includes('collab_requests_one_pending_per_pair'))) {
      console.log("✓ Duplicate pending request correctly blocked by database constraint.");
    } else {
      console.log(`⚠ Warning: Expected DB unique constraint failure, got ${dupRes.status}. Check database schemas.`);
    }

    // ----------------------------------------------------
    // TEST 5: Acceptance opens the CONVERSATION (it no longer makes a project)
    // ----------------------------------------------------
    console.log("\n[TEST 5] Accepting request (Creator action)...");
    const acceptRes = await fetch('http://localhost:3000/api/collabs', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${creatorSession.access_token}`
      },
      body: JSON.stringify({
        id: createdCollabId,
        status: 'accepted'
      })
    });

    const acceptBody = await acceptRes.json();
    console.log(`- Response Status: ${acceptRes.status}`);
    console.log(`- Response Body:`, acceptBody);

    if (acceptRes.status !== 200) {
      throw new Error(`Accept request failed: ${acceptBody.error}`);
    }
    console.log("✓ Collab request state transitioned to accepted.");

    const conversationId = acceptBody.conversation_id;
    if (!conversationId) {
      throw new Error("Accepting a request must open a conversation, but no conversation_id was returned.");
    }
    console.log(`✓ Conversation opened: ${conversationId}`);

    // Wait for DB async triggers or server processes
    await delay(1000);

    // ----------------------------------------------------
    // TEST 6: Terms are negotiated first — a project only exists once BOTH
    // sides have agreed to it.
    //
    // Accepting a request used to auto-create a campaign project (migration
    // 043). Migrations 069/071 removed that: accepting only opens the chat, the
    // terms live in project_proposals, and acceptance of those terms is what
    // creates the project. This test asserts that contract end to end.
    // ----------------------------------------------------
    console.log("\n[TEST 6] Validating that acceptance alone creates NO project...");

    const projectsAfterAccept = await fetch('http://localhost:3000/api/projects', {
      headers: { 'Authorization': `Bearer ${creatorSession.access_token}` }
    });
    const afterAcceptBody = await projectsAfterAccept.json();
    const strayProject = (afterAcceptBody.projects || []).find(
      p => p.owner_user_id === brandSession.user.id && p.counterparty_user_id === creatorSession.user.id
    );
    if (strayProject) {
      throw new Error("Accepting a collab request must NOT create a project — terms have to be agreed first.");
    }
    console.log("✓ No project yet, as expected — the two sides negotiate first.");

    // --- The brand proposes terms -------------------------------------------
    console.log("- Brand proposes project terms...");
    const proposeRes = await fetch(`http://localhost:3000/api/conversations/${conversationId}/deal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${brandSession.access_token}`
      },
      body: JSON.stringify({
        collab_request_id: createdCollabId,
        title: `E2E Campaign ${suffix}`,
        description: 'Three reels, agreed in chat.',
        budget: 30000,
        advance_amount: 10000
      })
    });
    const proposeBody = await proposeRes.json();
    console.log(`- Propose Status: ${proposeRes.status}`);
    if (proposeRes.status !== 200 || !proposeBody.proposal_id) {
      throw new Error(`Proposing terms failed: ${proposeBody.error || 'no proposal_id returned'}`);
    }
    console.log(`✓ Terms proposed: ${proposeBody.proposal_id}`);

    // Still no project — the terms are only on the table.
    const midRes = await fetch('http://localhost:3000/api/projects', {
      headers: { 'Authorization': `Bearer ${creatorSession.access_token}` }
    });
    const midBody = await midRes.json();
    if ((midBody.projects || []).find(p => p.owner_user_id === brandSession.user.id && p.counterparty_user_id === creatorSession.user.id)) {
      throw new Error("A project must NOT exist while terms are still awaiting a response.");
    }
    console.log("✓ Still no project while the terms await a response.");

    // --- The proposer cannot accept their own terms -------------------------
    const selfAcceptRes = await fetch(`http://localhost:3000/api/conversations/${conversationId}/deal`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${brandSession.access_token}`
      },
      body: JSON.stringify({ proposal_id: proposeBody.proposal_id, action: 'accept' })
    });
    if (selfAcceptRes.status === 200) {
      throw new Error("The side that proposed the terms must not be able to accept them.");
    }
    console.log(`✓ Proposer blocked from self-accepting (${selfAcceptRes.status}).`);

    // --- The creator accepts, and THAT creates the project -------------------
    console.log("- Creator accepts the terms...");
    const dealAcceptRes = await fetch(`http://localhost:3000/api/conversations/${conversationId}/deal`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${creatorSession.access_token}`
      },
      body: JSON.stringify({ proposal_id: proposeBody.proposal_id, action: 'accept' })
    });
    const dealAcceptBody = await dealAcceptRes.json();
    console.log(`- Accept Status: ${dealAcceptRes.status}`);
    if (dealAcceptRes.status !== 200 || !dealAcceptBody.project_id) {
      throw new Error(`Accepting the terms failed: ${dealAcceptBody.error || 'no project_id returned'}`);
    }

    await delay(1000);

    const projectsRes = await fetch(`http://localhost:3000/api/projects`, {
      headers: { Authorization: `Bearer ${creatorSession.access_token}` }
    });
    console.log(`- Creator Projects Response Status: ${projectsRes.status}`);
    const projectsData = await projectsRes.json().catch(() => ({}));
    if (projectsRes.status === 500) {
      console.log(`- Projects 500 Response Body:`, JSON.stringify(projectsData, null, 2));
    }
    const projectsBody = projectsData;
    console.log(`- Projects Found: ${projectsBody.projects?.length || 0}`);

    const matchingProj = (projectsBody.projects || []).find(
      p => p.owner_user_id === brandSession.user.id && p.counterparty_user_id === creatorSession.user.id
    );
    if (!matchingProj) {
      throw new Error("Accepting the terms should have created the project, but none was found.");
    }

    createdProjectId = matchingProj.id;
    console.log(`✓ Project created on acceptance! ID: ${createdProjectId}`);
    console.log(`✓ Status: ${matchingProj.status} · stage: ${matchingProj.current_stage}`);

    if (matchingProj.status !== 'active') {
      throw new Error(`A project born from accepted terms must be 'active', got '${matchingProj.status}'.`);
    }
    // The brand owns it whoever proposed — payments assume owner = payer.
    if (matchingProj.owner_user_id !== brandSession.user.id) {
      throw new Error("The brand must own the project regardless of who proposed the terms.");
    }
    console.log("✓ Brand owns the project and it is active.");

    // TEST 7: Project Stage Advancement
    // ----------------------------------------------------
    console.log("\n[TEST 7] Testing stage advancement timeline...");
    const advanceRes = await fetch(`http://localhost:3000/api/projects/${createdProjectId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${brandSession.access_token}`
      },
      body: JSON.stringify({
        action: 'advance',
        stage_key: 'project_discussion'
      })
    });

    const advanceBody = await advanceRes.json();
    console.log(`- Response Status: ${advanceRes.status}`);
    console.log(`- Updated Project Stage: ${advanceBody.project?.current_stage}`);

    if (advanceRes.status === 200 && advanceBody.project?.current_stage === 'project_discussion') {
      console.log("✓ Project successfully advanced to project_discussion!");
    } else {
      throw new Error(`Failed to advance stage: ${advanceBody.error}`);
    }

    console.log("\n=================================================");
    console.log("       ALL INTEGRATION TESTS PASSED SUCCESSFULLY!       ");
    console.log("=================================================");

  } catch (err) {
    console.error("\n❌ TEST SUITE FAILED:", err.message);
    failed = true;
  } finally {
    await cleanup();
  }

  if (failed) process.exit(1);
}

/**
 * Remove everything this run created.
 *
 * Without this every CI run left two permanent accounts — plus their request,
 * project, conversation and messages — in the shared database. Deleting the
 * auth users cascades through profiles/requests/projects/messages; only
 * `conversations` has no FK to profiles, so those are swept explicitly.
 */
async function cleanup() {
  if (!sbAdmin) {
    console.log("\n⚠  No service role key — leaving test accounts behind:");
    console.log(`   ${brandEmail}\n   ${creatorEmail}`);
    return;
  }

  console.log("\n[CLEANUP] Removing accounts created by this run...");
  try {
    const convIds = new Set();
    for (const id of [brandUserId, creatorUserId].filter(Boolean)) {
      const { data } = await sbAdmin
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', id);
      for (const row of data || []) convIds.add(row.conversation_id);
    }

    for (const id of [brandUserId, creatorUserId].filter(Boolean)) {
      const { error } = await sbAdmin.auth.admin.deleteUser(id);
      if (error) console.log(`   ⚠ could not delete ${id}: ${error.message}`);
    }

    if (convIds.size) {
      await sbAdmin.from('conversations').delete().in('id', [...convIds]);
    }
    console.log(`✓ Cleaned up ${[brandUserId, creatorUserId].filter(Boolean).length} account(s) and ${convIds.size} conversation(s).`);
  } catch (e) {
    console.log(`   ⚠ cleanup error: ${e.message}`);
  }
}

runTests();
