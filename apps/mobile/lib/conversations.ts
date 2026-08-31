/**
 * Normalises /api/conversations into the shape the screens actually render.
 *
 * The route returns Supabase rows as-is: an embedded `participants` array and
 * an embedded `messages` array capped at the newest one. It does NOT return
 * `other_user` / `last_message`, even though @influnet/types describes them —
 * that interface is what the client derives, not what the wire carries. The web
 * messages page does this same `find(p => p.user_id !== me)` inline; doing it
 * here keeps mobile's two consumers from drifting apart.
 */

/** A conversation row exactly as /api/conversations sends it. */
export interface RawConversation {
  id: string;
  created_at: string;
  updated_at: string;
  participants?: {
    user_id: string;
    profile?: { name?: string | null; role?: string | null } | null;
  }[];
  messages?: {
    id: string;
    body: string;
    created_at: string;
    sender_user_id: string;
  }[];
  /** The caller's own pin state — /api/conversations sets this per row. */
  pinned?: boolean;
}

/** A project that has a conversation attached, from the same response. */
export interface RawConversationProject {
  type: 'project';
  project_id: number;
  title: string;
  conversation_id: string | null;
  partner?: {
    id?: string;
    name?: string | null;
    company_name?: string | null;
    username?: string | null;
    role?: string | null;
  } | null;
  created_at: string;
}

export interface ConversationRow {
  id: string;
  updated_at: string;
  otherUserId: string | null;
  /** Best available display name; null when the row carries no participant. */
  name: string | null;
  /** Preview text, or null when nobody has spoken yet. */
  preview: string | null;
  lastMessageAt: string | null;
  /** True when the newest message came from the other person. */
  lastFromThem: boolean;
  /** Title of the project this conversation belongs to, when there is one. */
  projectTitle: string | null;
  /** The caller has pinned this conversation to the top of the inbox. */
  pinned: boolean;
}

/**
 * Fold the raw response into rows, newest activity first.
 *
 * `projects` is used only to enrich — a partner's company name beats a bare
 * profile name, and knowing the project title gives the row a subtitle worth
 * reading. Projects whose conversation hasn't been created yet are skipped;
 * there is nothing to open.
 */
export function toConversationRows(
  conversations: RawConversation[] | undefined,
  projects: RawConversationProject[] | undefined,
  myUserId: string | null | undefined
): ConversationRow[] {
  const byConversationId = new Map<string, RawConversationProject>();
  for (const project of projects ?? []) {
    if (project.conversation_id) byConversationId.set(project.conversation_id, project);
  }

  const rows = (conversations ?? []).map((conversation) => {
    // With only two people in a conversation, "not me" is the other one. When
    // myUserId isn't known yet, fall back to the first participant rather than
    // rendering a nameless row.
    const other =
      conversation.participants?.find((p) => p.user_id !== myUserId) ??
      conversation.participants?.[0];

    const project = byConversationId.get(conversation.id);
    const latest = conversation.messages?.[0];

    return {
      id: conversation.id,
      updated_at: conversation.updated_at,
      otherUserId: other?.user_id ?? project?.partner?.id ?? null,
      name:
        project?.partner?.company_name ||
        other?.profile?.name ||
        project?.partner?.name ||
        null,
      preview: latest?.body ?? null,
      lastMessageAt: latest?.created_at ?? null,
      lastFromThem: !!latest && !!myUserId && latest.sender_user_id !== myUserId,
      projectTitle: project?.title ?? null,
      pinned: !!conversation.pinned,
    };
  });

  // Pinned first, then newest activity within each group.
  return rows.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return (
      new Date(b.lastMessageAt ?? b.updated_at).getTime() -
      new Date(a.lastMessageAt ?? a.updated_at).getTime()
    );
  });
}
