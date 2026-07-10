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

    // Validate UUID format to prevent SQL injection
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(other_user_id)) {
      return NextResponse.json({ error: 'Invalid other_user_id format' }, { status: 400 });
    }

    // Use the management API to execute SQL directly (bypasses RLS)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const mgmtKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const projectRef = supabaseUrl.replace('https://', '').replace('.supabase.co', '');

    const runSql = async (sql: string) => {
      const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mgmtKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: sql }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`SQL error: ${res.status} ${errText}`);
      }
      return res.json();
    };

    // First check if a conversation already exists between these two users
    const checkSql = `
      SELECT cp1.conversation_id
      FROM public.conversation_participants cp1
      JOIN public.conversation_participants cp2 ON cp1.conversation_id = cp2.conversation_id
      WHERE cp1.user_id = '${user.id}'::uuid AND cp2.user_id = '${other_user_id}'::uuid
      LIMIT 1;
    `;

    const existing = await runSql(checkSql);
    if (existing && existing.length > 0 && existing[0].conversation_id) {
      return NextResponse.json({ conversation: { id: existing[0].conversation_id } });
    }

    // Create conversation and add both participants in a single transaction
    const sql = `
      WITH new_conv AS (
        INSERT INTO public.conversations DEFAULT VALUES RETURNING id
      )
      INSERT INTO public.conversation_participants (conversation_id, user_id)
      SELECT id, unnest(ARRAY['${user.id}'::uuid, '${other_user_id}'::uuid])
      FROM new_conv
      RETURNING conversation_id;
    `;

    const result = await runSql(sql);
    const conversationId = result?.[0]?.conversation_id;
    if (!conversationId) throw new Error('Failed to create conversation');

    return NextResponse.json({ conversation: { id: conversationId } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
