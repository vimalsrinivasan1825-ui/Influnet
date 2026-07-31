/**
 * Derives "connections" (Connections page) from the same /api/conversations
 * response the Messages page already fetches — mirroring
 * apps/mobile/lib/conversations.ts, which solved this the same way. A
 * connection is someone you have a conversation and/or an active project
 * with; there is no separate connections table.
 *
 * The route returns Supabase rows as-is (embedded `participants`, capped
 * `messages`, and a parallel `projects` list) — deriving "the other person"
 * and the display name is the client's job, done once here so the Connections
 * and Messages pages can't drift on the logic.
 */

export interface RawParticipant {
  user_id: string;
  profile?: { name?: string | null; role?: string | null } | null;
}

export interface RawConversation {
  id: string;
  updated_at: string;
  participants?: RawParticipant[];
  messages?: { id: string; body?: string; created_at: string; sender_user_id: string }[];
}

export interface RawConversationProject {
  project_id: string | number;
  title: string;
  conversation_id?: string | null;
  status?: string;
  partner?: {
    id?: string;
    name?: string | null;
    company_name?: string | null;
    username?: string | null;
    role?: string | null;
  } | null;
  created_at: string;
}

export interface ConnectionRow {
  id: string;
  conversationId: string | null;
  otherUserId: string | null;
  name: string | null;
  role: string | null;
  preview: string | null;
  lastActivityAt: string;
  projectTitle: string | null;
}

export function toConnectionRows(
  conversations: RawConversation[] | undefined,
  projects: RawConversationProject[] | undefined,
  myUserId: string | null | undefined
): ConnectionRow[] {
  const byConversationId = new Map<string, RawConversationProject>();
  for (const project of projects ?? []) {
    if (project.conversation_id) byConversationId.set(project.conversation_id, project);
  }

  const rows: ConnectionRow[] = [];
  const seenOtherIds = new Set<string>();

  for (const conversation of conversations ?? []) {
    const other =
      conversation.participants?.find((p) => p.user_id !== myUserId) ??
      conversation.participants?.[0];
    const project = byConversationId.get(conversation.id);
    const latest = conversation.messages?.[0];
    const otherId = other?.user_id ?? project?.partner?.id ?? null;
    if (otherId) seenOtherIds.add(otherId);

    rows.push({
      id: conversation.id,
      conversationId: conversation.id,
      otherUserId: otherId,
      name: project?.partner?.company_name || other?.profile?.name || project?.partner?.name || null,
      role: other?.profile?.role ?? project?.partner?.role ?? null,
      preview: latest?.body ?? null,
      lastActivityAt: conversation.updated_at,
      projectTitle: project?.title ?? null,
    });
  }

  // Projects without a conversation yet are still a real connection (an
  // accepted collab that hasn't been messaged in) — surface them too, just
  // without a preview, so accepting a request doesn't leave you invisible on
  // this page until the first message is sent.
  for (const project of projects ?? []) {
    const otherId = project.partner?.id;
    if (!otherId || seenOtherIds.has(otherId) || project.conversation_id) continue;
    seenOtherIds.add(otherId);
    rows.push({
      id: `project-${project.project_id}`,
      conversationId: null,
      otherUserId: otherId,
      name: project.partner?.company_name || project.partner?.name || null,
      role: project.partner?.role ?? null,
      preview: null,
      lastActivityAt: project.created_at,
      projectTitle: project.title,
    });
  }

  return rows
    .filter((row) => row.name)
    .sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime());
}
