/**
 * Typed endpoint helpers over the existing /api/* routes.
 *
 * One named function per route the mobile app uses, so screens never hand-write
 * a path string and a rename here is a compile error rather than a 404 at
 * runtime. Paths mirror apps/web/src/app/api/**.
 *
 * Each helper takes a type parameter for its response body — the route handlers
 * build their JSON inline rather than returning a declared type, so the shape
 * is asserted at the call site by the screen that consumes it.
 */
import type { ApiClient } from './client';

export function createEndpoints(api: ApiClient) {
  return {
    // ── Home & dashboards ──────────────────────────────────────────
    home: <T = unknown>() => api.get<T>('/api/home'),
    influencerDashboard: <T = unknown>() => api.get<T>('/api/influencer/dashboard'),
    businessDashboard: <T = unknown>() => api.get<T>('/api/business/dashboard'),
    activity: <T = unknown>() => api.get<T>('/api/activity'),

    // ── Profile ────────────────────────────────────────────────────
    getProfile: <T = unknown>() => api.get<T>('/api/profile'),
    updateProfile: <T = unknown>(body: unknown) => api.patch<T>('/api/profile', body),
    refreshProfile: <T = unknown>() => api.post<T>('/api/profile/refresh'),
    dismissWelcome: <T = unknown>() => api.post<T>('/api/profile/welcome'),
    /** Registers (token) or clears (null) this device's Expo push token. */
    registerPushToken: <T = unknown>(token: string | null) =>
      api.post<T>('/api/profile/push-token', { token }),
    checkUsername: <T = unknown>(username: string) =>
      api.get<T>(`/api/auth/check-username?username=${encodeURIComponent(username)}`),

    // ── Portfolio ──────────────────────────────────────────────────
    /** Manual entries merged with completed platform projects (migration 087). */
    listPortfolio: <T = unknown>() => api.get<T>('/api/portfolio'),
    /** `url` is the only required field — platform, thumbnail and (for YouTube) title are derived from it. */
    addPortfolioItem: <T = unknown>(body: {
      url: string;
      title?: string;
      brand_name?: string;
      description?: string;
      published_at?: string;
    }) => api.post<T>('/api/portfolio', body),
    deletePortfolioItem: <T = unknown>(id: string) =>
      api.del<T>(`/api/portfolio?id=${encodeURIComponent(id)}`),
    register: <T = unknown>(body: unknown) => api.post<T>('/api/auth/register', body),

    // ── Discovery ──────────────────────────────────────────────────
    discover: <T = unknown>(query: string) => api.get<T>(`/api/discover${query ? `?${query}` : ''}`),
    /** Full public-profile view model for one creator, by username — same shape the web overlay renders. */
    getCreatorProfile: <T = unknown>(username: string) =>
      api.get<T>(`/api/creators/${encodeURIComponent(username)}`),

    // ── Collaboration requests ─────────────────────────────────────
    listCollabs: <T = unknown>() => api.get<T>('/api/collabs'),
    createCollab: <T = unknown>(body: unknown) => api.post<T>('/api/collabs', body),
    getCollab: <T = unknown>(id: string) => api.get<T>(`/api/collabs/${id}`),
    /** Status changes PATCH the collection with { id, status } — not /collabs/:id. */
    updateCollabStatus: <T = unknown>(id: string, status: string) =>
      api.patch<T>('/api/collabs', { id, status }),

    // ── Conversations & deals ──────────────────────────────────────
    listConversations: <T = unknown>() => api.get<T>('/api/conversations'),
    /** Opens (or returns) the conversation with another user. */
    createConversation: <T = unknown>(body: { other_user_id: string }) =>
      api.post<T>('/api/conversations', body),
    getConversation: <T = unknown>(id: string) => api.get<T>(`/api/conversations/${id}`),
    listMessages: <T = unknown>(id: string) => api.get<T>(`/api/conversations/${id}/messages`),
    sendMessage: <T = unknown>(id: string, body: unknown) =>
      api.post<T>(`/api/conversations/${id}/messages`, body),
    getDeal: <T = unknown>(id: string) => api.get<T>(`/api/conversations/${id}/deal`),
    /** Proposes new terms — POST creates a project_proposals row. */
    updateDeal: <T = unknown>(id: string, body: unknown) =>
      api.post<T>(`/api/conversations/${id}/deal`, body),
    /** Accept / decline / withdraw the terms currently on the table. */
    respondToDeal: <T = unknown>(id: string, body: { proposal_id: string; action: 'accept' | 'decline' | 'withdraw'; note?: string }) =>
      api.patch<T>(`/api/conversations/${id}/deal`, body),

    // ── Projects ───────────────────────────────────────────────────
    listProjects: <T = unknown>() => api.get<T>('/api/projects'),
    createProject: <T = unknown>(body: unknown) => api.post<T>('/api/projects', body),
    getProject: <T = unknown>(id: string) => api.get<T>(`/api/projects/${id}`),
    updateProject: <T = unknown>(id: string, body: unknown) => api.patch<T>(`/api/projects/${id}`, body),
    projectActivity: <T = unknown>(id: string) => api.get<T>(`/api/projects/${id}/activity`),
    listStageEntries: <T = unknown>(id: string) => api.get<T>(`/api/projects/${id}/stage-entries`),
    createStageEntry: <T = unknown>(id: string, body: unknown) =>
      api.post<T>(`/api/projects/${id}/stage-entries`, body),
    listStageItems: <T = unknown>(id: string) => api.get<T>(`/api/projects/${id}/stage-items`),
    createStageItem: <T = unknown>(id: string, body: unknown) =>
      api.post<T>(`/api/projects/${id}/stage-items`, body),
    /** Toggle a single checklist item done/undone. */
    updateStageItem: <T = unknown>(id: string, body: { item_id: string; done: boolean }) =>
      api.patch<T>(`/api/projects/${id}/stage-items`, body),
    listChangeRequests: <T = unknown>(id: string) => api.get<T>(`/api/projects/${id}/change-requests`),
    createChangeRequest: <T = unknown>(id: string, body: unknown) =>
      api.post<T>(`/api/projects/${id}/change-requests`, body),
    listProjectPayments: <T = unknown>(id: string) => api.get<T>(`/api/projects/${id}/payments`),
    createProjectPayment: <T = unknown>(id: string, body: unknown) =>
      api.post<T>(`/api/projects/${id}/payments`, body),
    listReviews: <T = unknown>(id: string) => api.get<T>(`/api/projects/${id}/reviews`),
    createReview: <T = unknown>(id: string, body: unknown) =>
      api.post<T>(`/api/projects/${id}/reviews`, body),

    // ── Notifications ──────────────────────────────────────────────
    listNotifications: <T = unknown>() => api.get<T>('/api/notifications'),
    markNotificationsRead: <T = unknown>(body: unknown) => api.patch<T>('/api/notifications', body),
    /** Clears the message notifications for one conversation — see the chat screen. */
    markConversationNotificationsRead: <T = unknown>(conversationId: string) =>
      api.patch<T>('/api/notifications', { action: 'mark_read', conversationId }),
    notificationSummary: <T = unknown>() => api.get<T>('/api/notifications/summary'),

    // ── Trust & safety ─────────────────────────────────────────────
    listBlocks: <T = unknown>() => api.get<T>('/api/blocks'),
    createBlock: <T = unknown>(body: unknown) => api.post<T>('/api/blocks', body),
    // DELETE /api/blocks reads { blocked_id } from the JSON body (see
    // apps/web/src/app/api/blocks/route.ts) — a query string is never read
    // there, so this has to send a body rather than use api.del().
    removeBlock: <T = unknown>(blockedId: string) =>
      api.request<T>('/api/blocks', { method: 'DELETE', body: JSON.stringify({ blocked_id: blockedId }) }),
    createReport: <T = unknown>(body: unknown) => api.post<T>('/api/reports', body),

    // ── Verification ───────────────────────────────────────────────
    getVerification: <T = unknown>() => api.get<T>('/api/verification'),
    startVerification: <T = unknown>(body: unknown) => api.post<T>('/api/verification', body),
    /** GET returns the current claim; POST drives it with { action: 'initiate' | 'confirm' }. */
    checkOwnershipStatus: <T = unknown>() => api.get<T>('/api/verification/ownership'),
    checkOwnership: <T = unknown>(body: unknown) => api.post<T>('/api/verification/ownership', body),
    scrapeInstagram: <T = unknown>(body: unknown) => api.post<T>('/api/auth/scrape-instagram', body),

    // ── Chat & uploads ─────────────────────────────────────────────
    streamToken: <T = unknown>() => api.post<T>('/api/stream/token'),
    streamChannel: <T = unknown>(body: unknown) => api.post<T>('/api/stream/channel', body),
    signUpload: <T = unknown>(body: unknown) => api.post<T>('/api/uploads/sign', body),

    health: <T = unknown>() => api.get<T>('/api/health'),
  };
}

export type Endpoints = ReturnType<typeof createEndpoints>;
