/**
 * Messages API Test Script
 * 
 * Tests:
 * 1. GET /api/conversations - returns conversations and projects
 * 2. POST /api/conversations - creates a new conversation
 * 3. POST /api/conversations/[id]/messages - sends a message
 * 4. GET /api/conversations/[id]/messages - fetches messages
 * 
 * Usage: node tests/messages-api.js <email> <password>
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jaajosocopoicmqcffuu.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImphYWpvc29jb3BvaWNtcWNmZnV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzI5NTAyNDcsImV4cCI6MjA0ODUyNjI0N30.YfJ9_72bNEsj3v_5ENF9jBmL2jNL2n2ov7Wv4rRUKT4';

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];

  if (!email || !password) {
    console.log('Usage: node tests/messages-api.js <email> <password>');
    process.exit(1);
  }

  console.log('🔐 Signing in as:', email);
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const { data: { session }, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) {
    console.error('❌ Sign in failed:', signInError.message);
    process.exit(1);
  }
  console.log('✅ Signed in successfully');

  const token = session.access_token;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const baseUrl = 'http://localhost:3000';

  // Test 1: GET /api/conversations
  console.log('\n📋 Test 1: GET /api/conversations');
  try {
    const res = await fetch(`${baseUrl}/api/conversations`, { headers });
    const data = await res.json();
    console.log(`   Status: ${res.status}`);
    console.log(`   Conversations: ${data.conversations?.length || 0}`);
    console.log(`   Projects: ${data.projects?.length || 0}`);
    
    if (data.projects?.length > 0) {
      console.log(`   First project: ${data.projects[0].title} (has chat: ${!!data.projects[0].conversation_id})`);
    }
    if (res.ok) console.log('   ✅ PASS');
    else { console.log('   ❌ FAIL:', data.error); process.exit(1); }
  } catch (e) {
    console.log('   ❌ FAIL: Network error — is the server running on port 3000?');
    process.exit(1);
  }

  // Test 2: POST /api/conversations (try to create one)
  console.log('\n📋 Test 2: POST /api/conversations');
  // Find a project partner to create a conversation with
  const convRes = await fetch(`${baseUrl}/api/conversations`, { headers });
  const convData = await convRes.json();
  const project = convData.projects?.[0];
  
  if (project && !project.conversation_id) {
    const partnerId = project.partner?.id;
    if (partnerId) {
      const res = await fetch(`${baseUrl}/api/conversations`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ other_user_id: partnerId })
      });
      const data = await res.json();
      console.log(`   Status: ${res.status}`);
      if (res.ok) {
        console.log(`   Created conversation: ${data.conversation?.id}`);
        console.log('   ✅ PASS');
      } else {
        console.log(`   ❌ FAIL: ${data.error}`);
        process.exit(1);
      }
    } else {
      console.log('   ⚠️  SKIP: No project partner available');
    }
  } else {
    console.log('   ⚠️  SKIP: No projects without conversations');
  }

  // Test 3: Try sending a message to the first conversation
  console.log('\n📋 Test 3: POST /api/conversations/[id]/messages');
  const convs = await fetch(`${baseUrl}/api/conversations`, { headers });
  const convsData = await convs.json();
  const firstConv = convsData.conversations?.[0];
  
  if (firstConv) {
    const res = await fetch(`${baseUrl}/api/conversations/${firstConv.id}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ content: 'Hello! This is a test message from the API test script.' })
    });
    const data = await res.json();
    console.log(`   Status: ${res.status}`);
    if (res.ok) {
      console.log(`   Sent message: ${data.message?.id}`);
      console.log('   ✅ PASS');
    } else {
      console.log(`   ❌ FAIL: ${data.error}`);
      process.exit(1);
    }
  } else {
    console.log('   ⚠️  SKIP: No conversations available');
  }

  // Test 4: GET /api/conversations/[id]/messages
  console.log('\n📋 Test 4: GET /api/conversations/[id]/messages');
  const convs2 = await fetch(`${baseUrl}/api/conversations`, { headers });
  const convsData2 = await convs2.json();
  const convWithMsgs = convsData2.conversations?.[0];
  
  if (convWithMsgs) {
    const res = await fetch(`${baseUrl}/api/conversations/${convWithMsgs.id}/messages`, { headers });
    const data = await res.json();
    console.log(`   Status: ${res.status}`);
    console.log(`   Messages count: ${data.messages?.length || 0}`);
    if (data.messages?.length > 0) {
      console.log(`   First message body: ${data.messages[0].body?.substring(0, 50)}`);
    }
    if (res.ok) console.log('   ✅ PASS');
    else { console.log('   ❌ FAIL:', data.error); process.exit(1); }
  } else {
    console.log('   ⚠️  SKIP: No conversations available');
  }

  console.log('\n🎉 All tests completed!');
  process.exit(0);
}

main().catch(e => {
  console.error('Unhandled error:', e);
  process.exit(1);
});
