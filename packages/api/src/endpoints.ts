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
    checkUsername: <T = unknown>(username: string) =>
      api.get<T>(`/api/auth/check-username?username=${encodeURIComponent(username)}`),
    register: <T = unknown>(body: unknown) => api.post<T>('/api/auth/register', body),

    // ── Discovery ──────────────────────────────────────────────────
    discover: <T = unknown>(query: string) => api.get<T>(`/api/discover${query ? `?${query}` : ''}`),

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
    updateDeal: <T = unknown>(id: string, body: unknown) =>
      api.post<T>(`/api/conversations/${id}/deal`, body),

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
    notificationSummary: <T = unknown>() => api.get<T>('/api/notifications/summary'),

    // ── Trust & safety ─────────────────────────────────────────────
    listBlocks: <T = unknown>() => api.get<T>('/api/blocks'),
    createBlock: <T = unknown>(body: unknown) => api.post<T>('/api/blocks', body),
    removeBlock: <T = unknown>(id: string) => api.del<T>(`/api/blocks?id=${encodeURIComponent(id)}`),
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
