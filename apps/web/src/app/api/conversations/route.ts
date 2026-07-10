import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';
import { z } from 'zod';

const PostConversationSchema = z.object({
  other_user_id: z.string().uuid(),
});

export async function GET(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    // A user can be part of many conversations. We query conversation_participants
    const { data: participants, error } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', user.id);

    if (error) return jsonError(500, 'Failed to fetch conversation participants', error);
    const conversationIds = participants.map((p: any) => p.conversation_id);

    let conversations: any[] = [];
    if (conversationIds.length > 0) {
      const { data: convData, error: convError } = await supabase
        .from('conversations')
        .select(`
          *,
          participants:conversation_participants(
            user_id,
            profile:profiles!conversation_participants_user_id_fkey(name, role)
          ),
          messages(id, body, created_at, sender_user_id)
        `)
        .in('id', conversationIds)
        .order('updated_at', { ascending: false })
        // Only the latest message is needed (list preview) — without this the
        // embed returns every message of every conversation.
        .order('created_at', { referencedTable: 'messages', ascending: false })
        .limit(1, { referencedTable: 'messages' });

      if (convError) return jsonError(500, 'Failed to fetch conversations', convError);
      conversations = convData || [];
    }

    // Also fetch active projects that may not have a conversation
    // This lets users start conversations from project partners
    const { data: projects, error: projectsError } = await supabase
      .from('campaign_projects')
      .select(`
        id, title, description, budget, status, current_stage, conversation_id,
        owner_user_id, counterparty_user_id, created_at
      `)
      .or(`owner_user_id.eq.${user.id},counterparty_user_id.eq.${user.id}`)
      .order('created_at', { ascending: false });

    if (projectsError) return jsonError(500, 'Failed to fetch projects', projectsError);

    // Enrich projects with partner profile info.
    // Batched: one profiles query + one per role-specific table, stitched in
    // memory, so query count stays flat as project counts grow.
    const partnerIds = [...new Set((projects || []).map((p: any) =>
      p.owner_user_id === user.id ? p.counterparty_user_id : p.owner_user_id
    ).filter(Boolean))];

    const profilesById = new Map<string, any>();
    const bizByUserId = new Map<string, any>();
    const infByUserId = new Map<string, any>();

    if (partnerIds.length > 0) {
      const { data: partnerProfiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, name, role')
        .in('id', partnerIds);
      if (profilesError) return jsonError(500, 'Failed to fetch partner profiles', profilesError);
      for (const prof of partnerProfiles || []) profilesById.set(prof.id, prof);

      const bizIds = (partnerProfiles || []).filter((p: any) => p.role === 'business_owner').map((p: any) => p.id);
      const infIds = (partnerProfiles || []).filter((p: any) => p.role === 'influencer').map((p: any) => p.id);

      const [bizResult, infResult] = await Promise.all([
        bizIds.length > 0
          ? supabase.from('business_profiles').select('user_id, company_name').in('user_id', bizIds)
          : Promise.resolve({ data: [], error: null }),
        infIds.length > 0
          ? supabase.from('influencer_profiles').select('user_id, username, niche').in('user_id', infIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (bizResult.error) return jsonError(500, 'Failed to fetch business profiles', bizResult.error);
      if (infResult.error) return jsonError(500, 'Failed to fetch influencer profiles', infResult.error);
      for (const biz of bizResult.data || []) bizByUserId.set(biz.user_id, biz);
      for (const inf of infResult.data || []) infByUserId.set(inf.user_id, inf);
    }

    const enrichedProjects = (projects || []).map((p: any) => {
      const partnerId = p.owner_user_id === user.id ? p.counterparty_user_id : p.owner_user_id;
      const partnerProfile = profilesById.get(partnerId);

      // Build partner info with business/influencer specific fields
      const partnerDisplay: Record<string, any> = { ...partnerProfile };
      if (partnerProfile?.role === 'business_owner') {
        const biz = bizByUserId.get(partnerId);
        if (biz) partnerDisplay.company_name = biz.company_name;
      } else if (partnerProfile?.role === 'influencer') {
        const inf = infByUserId.get(partnerId);
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
    });

    return NextResponse.json({ conversations, projects: enrichedProjects });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    let body;
    try {
      body = await req.json();
    } catch (e) {
      return jsonError(400, 'Invalid JSON body');
    }

    const result = PostConversationSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: 'Validation failed', details: result.error.format() }, { status: 400 });
    }

    const { other_user_id } = result.data;

    // Call the RPC function to atomically get or create the conversation
    const { data: convId, error: rpcError } = await supabase.rpc('get_or_create_conversation', {
      user1_id: user.id,
      user2_id: other_user_id
    });

    if (rpcError || !convId) {
      return jsonError(500, 'Failed to create conversation', rpcError);
    }

    return NextResponse.json({ conversation: { id: convId } });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}
