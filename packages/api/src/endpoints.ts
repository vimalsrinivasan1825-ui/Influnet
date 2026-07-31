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
    checkEmail: <T = unknown>(email: string) =>
      api.get<T>(`/api/auth/check-email?email=${encodeURIComponent(email)}`),
    checkPhone: <T = unknown>(phone: string) =>
      api.get<T>(`/api/auth/check-phone?phone=${encodeURIComponent(phone)}`),
    checkInstagram: <T = unknown>(handle: string) =>
      api.get<T>(`/api/auth/check-instagram?handle=${encodeURIComponent(handle)}`),
    suggestUsername: <T = unknown>(name: string) =>
      api.get<T>(`/api/auth/suggest-username?name=${encodeURIComponent(name)}`),

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
    /** Show/hide one manual entry on the public profile without deleting it. */
    setPortfolioItemVisible: <T = unknown>(id: string, isVisible: boolean) =>
      api.patch<T>('/api/portfolio', { id, is_visible: isVisible }),
    register: <T = unknown>(body: unknown) => api.post<T>('/api/auth/register', body),

    /** Public signup flags (currently just `phoneOtpEnabled`). Read at runtime
     *  so a shipped mobile build follows the server, not its own build config. */
    getAuthConfig: <T = unknown>() => api.get<T>('/api/auth/config'),

    // ── Mobile-number OTP (2Factor) ────────────────────────────────
    // Both are called during signup, before a session exists, so they run
    // tokenless by design. The provider key never leaves the Edge Function.
    /** Sends a 6-digit code. Returns `providerSessionId`, needed to verify. */
    sendPhoneOtp: <T = unknown>(phone: string) =>
      api.post<T>('/api/phone-otp/send', { phone }),
    /** On success returns `verificationToken` — pass it to `register`. */
    verifyPhoneOtp: <T = unknown>(body: {
      phone: string;
      otp: string;
      providerSessionId: string;
    }) => api.post<T>('/api/phone-otp/verify', body),

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
    /**
     * The stage checklist. Items are SEEDED from DEFAULT_STAGE_ITEMS on first
     * read — there is no way to add one, on either client, by design: the
     * checklist is the platform's definition of what a stage requires, and the
     * gate that blocks advancement reads it. A user-authored required item
     * would be a user-authored gate.
     *
     * (There was a `createStageItem` helper here pointing at a POST that has
     * never existed on the route — GET and PATCH only. Nothing called it; it
     * would have returned 405.)
     */
    listStageItems: <T = unknown>(id: string) => api.get<T>(`/api/projects/${id}/stage-items`),
    /** Toggle a single checklist item done/undone. */
    updateStageItem: <T = unknown>(id: string, body: { item_id: string; done: boolean }) =>
      api.patch<T>(`/api/projects/${id}/stage-items`, body),
    listChangeRequests: <T = unknown>(id: string) => api.get<T>(`/api/projects/${id}/change-requests`),
    createChangeRequest: <T = unknown>(id: string, body: unknown) =>
      api.post<T>(`/api/projects/${id}/change-requests`, body),
    /** Accept, reject or withdraw a pending change request. */
    respondToChangeRequest: <T = unknown>(id: string, body: {
      request_id: string;
      action: 'accept' | 'reject' | 'withdraw';
      note?: string;
    }) => api.patch<T>(`/api/projects/${id}/change-requests`, body),
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
    /**
     * GET returns the current claim; POST drives it with
     * { action: 'initiate' | 'confirm' }.
     *
     * Both REQUIRE a handle. The server keys claims on (user, platform, handle)
     * — a user may hold several — so it cannot infer which one you mean:
     * POST without a handle is a hard 400 ('A handle is required') and GET
     * without one silently returns { status: 'none' }, which reads as "not
     * started" rather than "you didn't ask properly". Mobile shipped calling
     * both with no handle, which is why ownership verification was dead there.
     * Making the parameter required in the signature is what stops that
     * recurring.
     */
    checkOwnershipStatus: <T = unknown>(handle: string, platform = 'instagram') =>
      api.get<T>(
        `/api/verification/ownership?platform=${encodeURIComponent(platform)}&handle=${encodeURIComponent(handle)}`,
      ),
    checkOwnership: <T = unknown>(body: {
      action: 'initiate' | 'confirm';
      handle: string;
      platform?: string;
    }) => api.post<T>('/api/verification/ownership', { platform: 'instagram', ...body }),
    /**
     * Signup-time Instagram prefill. GET with the handle in the query string —
     * the route exports GET only, so the POST this helper used to send would
     * have 405'd. Unauthenticated by design (it runs before the account exists)
     * and rate-limited to 5/min per IP, since every call spends provider credit.
     */
    scrapeInstagram: <T = unknown>(handle: string) =>
      api.get<T>(`/api/auth/scrape-instagram?handle=${encodeURIComponent(handle)}`),

    // ── Chat & uploads ─────────────────────────────────────────────
    streamToken: <T = unknown>() => api.post<T>('/api/stream/token'),
    streamChannel: <T = unknown>(body: unknown) => api.post<T>('/api/stream/channel', body),
    signUpload: <T = unknown>(body: unknown) => api.post<T>('/api/uploads/sign', body),

    health: <T = unknown>() => api.get<T>('/api/health'),
  };
}

export type Endpoints = ReturnType<typeof createEndpoints>;
