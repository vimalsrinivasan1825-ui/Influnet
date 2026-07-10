import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // A user can be part of many conversations. We query conversation_participants
    const { data: participants, error } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', user.id);

    if (error) throw error;
    const conversationIds = participants.map((p: any) => p.conversation_id);

    let conversations: any[] = [];
    if (conversationIds.length > 0) {
      const { data: convData, error: convError } = await supabase
        .from('conversations')
        .select(`
          *,
          participants:conversation_participants(
            user_id,
            profile:profiles!conversation_participants_user_id_fkey(name, email, role)
          ),
          messages(id, body, created_at, sender_user_id)
        `)
        .in('id', conversationIds)
        .order('updated_at', { ascending: false });

      if (convError) throw convError;
      conversations = convData || [];
    }

    // Also fetch active projects that may not have a conversation
    // This lets users start conversations from project partners
    const { data: projects } = await supabase
      .from('campaign_projects')
      .select(`
        id, title, description, budget, status, current_stage, conversation_id,
        owner_user_id, counterparty_user_id, created_at
      `)
      .or(`owner_user_id.eq.${user.id},counterparty_user_id.eq.${user.id}`)
      .order('created_at', { ascending: false });

    // Enrich projects with partner profile info
    const enrichedProjects = await Promise.all((projects || []).map(async (p: any) => {
      const partnerId = p.owner_user_id === user.id ? p.counterparty_user_id : p.owner_user_id;
      const { data: partnerProfile } = await supabase
        .from('profiles')
        .select('id, name, email, role')
        .eq('id', partnerId)
        .maybeSingle();
      
      // Build partner info with business/influencer specific fields
      const partnerDisplay: Record<string, any> = { ...partnerProfile };
      if (partnerProfile?.role === 'business_owner') {
        const { data: biz } = await supabase
          .from('business_profiles')
          .select('company_name')
          .eq('user_id', partnerId)
          .maybeSingle();
        if (biz) partnerDisplay.company_name = biz.company_name;
      } else if (partnerProfile?.role === 'influencer') {
        const { data: inf } = await supabase
          .from('influencer_profiles')
          .select('username, niche')
          .eq('user_id', partnerId)
          .maybeSingle();
        if (inf) { partnerDisplay.username = inf.username; partnerDisplay.niche = inf.niche; }
      }

      return {
        type: 'project',
        project_id: p.id,
        title: p.title,
        conversation_id: p.conversation_id,
        partner: partnerDisplay,
        created_at: p.created_at,
      };
    }));

    return NextResponse.json({ conversations, projects: enrichedProjects });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
    }

    // Verify the user using the auth header
    const { createClient } = await import('@supabase/supabase-js');
    const authClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await authClient.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { other_user_id } = body;
    if (!other_user_id) {
      return NextResponse.json({ error: 'other_user_id is required' }, { status: 400 });
    }

    // Call the RPC function to atomically get or create the conversation
    const { data: convId, error: rpcError } = await authClient.rpc('get_or_create_conversation', {
      user1_id: user.id,
      user2_id: other_user_id
    });

    if (rpcError || !convId) {
      console.error('[POST /api/conversations] RPC Error:', rpcError);
      throw new Error(rpcError?.message || 'Failed to create conversation');
    }

    return NextResponse.json({ conversation: { id: convId } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
