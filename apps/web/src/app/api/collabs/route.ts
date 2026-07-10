import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

// GET all collaboration requests for the authenticated user
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error("[GET /api/collabs] Missing Authorization header");
      return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error("[GET /api/collabs] Auth error or user not found:", userError);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log(`[GET /api/collabs] Fetching requests for user ID: ${user.id}`);

    // Get as sender or receiver
    const { data: collabs, error } = await supabase
      .from('collab_requests')
      .select(`
        *,
        sender:profiles!collab_requests_from_user_id_fkey(name, email, role),
        receiver:profiles!collab_requests_to_user_id_fkey(name, email, role)
      `)
      .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
      .order('created_at', { ascending: false });

    if (error) {
      console.error("[GET /api/collabs] Database query error:", error);
      throw error;
    }

    console.log(`[GET /api/collabs] Found ${collabs?.length || 0} requests.`);
    return NextResponse.json({ collabs });
  } catch (error: any) {
    console.error("[GET /api/collabs] Exception caught:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST a new collab request
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error("[POST /api/collabs] Missing Authorization header");
      return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error("[POST /api/collabs] Auth error or user not found:", userError);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user role is business_owner (unidirectional requests rule)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile || (profile as any).role !== 'business_owner') {
      console.error("[POST /api/collabs] Non-brand user attempted to send request");
      return NextResponse.json({ error: 'Only business owners can initiate collaboration requests' }, { status: 403 });
    }

    const body = await req.json();
    const { to_user_id, project_title, project_description, budget } = body;
    console.log(`[POST /api/collabs] Incoming collab request from ${user.id} to ${to_user_id}. Title: ${project_title}, Budget: ${budget}`);

    // collab_requests table only has: message, budget (no project_title/project_description columns)
    // We combine project_title + message into the `message` field for storage
    const messageText = [project_title, project_description].filter(Boolean).join('\n\n');

    const { data, error } = await supabase
      .from('collab_requests')
      .insert({
        from_user_id: user.id,
        to_user_id,
        message: messageText || project_title || 'Collaboration Request',
        budget: budget || null,
        status: 'pending'
      })
      .select()
      .single();

    if (error) {
      console.error("[POST /api/collabs] Insert error:", error);
      throw error;
    }

    console.log("[POST /api/collabs] Request inserted successfully:", data);
    return NextResponse.json({ collab: data });
  } catch (error: any) {
    console.error("[POST /api/collabs] Exception caught:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH to update status — and auto-create project + conversation on accept
export async function PATCH(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { id, status } = body;

    // Fetch the collab request before updating so we have both user IDs
    const { data: collab, error: fetchError } = await supabase
      .from('collab_requests')
      .select('id, from_user_id, to_user_id, message, budget')
      .eq('id', id)
      .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
      .single();

    if (fetchError || !collab) {
      return NextResponse.json({ error: 'Request not found or access denied' }, { status: 404 });
    }

    // Update the status
    const { data: updated, error: updateError } = await supabase
      .from('collab_requests')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (updateError) throw updateError;

    // If accepted: auto-create a campaign_projects row + conversation
    if (status === 'accepted') {
      // Business is the "from" user (sender of request), influencer is "to" user
      const businessUserId = collab.from_user_id;
      const influencerUserId = collab.to_user_id;

      // 1. Ensure a conversation thread exists (upsert pattern)
      // Do this FIRST so we can link it to the project

      const participants = [businessUserId, influencerUserId].sort();
      
      // Check for existing conversation between these two users
      const { data: existingConvs } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', participants[0]);

      let conversationId: string | null = null;

      if (existingConvs && existingConvs.length > 0) {
        const convIds = existingConvs.map(c => c.conversation_id);
        const { data: match } = await supabase
          .from('conversation_participants')
          .select('conversation_id')
          .eq('user_id', participants[1])
          .in('conversation_id', convIds)
          .limit(1)
          .single();
        
        if (match) conversationId = match.conversation_id;
      }

      // Create new conversation if one doesn't exist
      if (!conversationId) {
        const { data: newConv } = await supabase
          .from('conversations')
          .insert({})
          .select('id')
          .single();

        if (newConv) {
          conversationId = newConv.id;
          await supabase.from('conversation_participants').insert([
            { conversation_id: conversationId, user_id: participants[0] },
            { conversation_id: conversationId, user_id: participants[1] },
          ]);
        }
      }

      // 2. Create campaign project — link to conversation
      const { error: projectError } = await supabase
        .from('campaign_projects')
        .insert({
          owner_user_id: businessUserId,
          counterparty_user_id: influencerUserId,
          title: collab.message?.split('\n')[0] || 'New Collaboration',
          description: collab.message || '',
          budget: collab.budget || null,
          status: 'active',
          current_stage: 'collaboration_started',
          conversation_id: conversationId,
        });

      if (projectError) {
        console.error('Failed to auto-create project:', projectError.message);
      }
    }

    return NextResponse.json({ collab: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

