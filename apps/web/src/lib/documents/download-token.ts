/**
 * Short-lived signed tokens for downloading one document's PDF.
 *
 * Why this exists: the PDF route is normally read via `withAuth`, which needs
 * an `Authorization: Bearer <token>` header — fine for the web app's own
 * `fetch`, impossible for a mobile `Linking.openURL()` (the system browser
 * cannot attach a header, and putting the real Supabase access token in a URL
 * would leak a full-session bearer credential into browser history and
 * server logs).
 *
 * So mobile asks for a scoped, 10-minute, single-purpose token instead — good
 * for exactly one document, signed with HMAC-SHA256 over
 * `${projectId}.${docId}.${expiresAt}`. The PDF route accepts EITHER a normal
 * session (web) OR a valid token of this shape (mobile) — see
 * `route.tsx`'s `resolveCaller()`.
 *
 * The signing key is derived from SUPABASE_SERVICE_ROLE_KEY via HMAC rather
 * than a new secret: introducing a new required env var means every deployed
 * container needs it added by hand (see AGENTS.md on NEXT_PUBLIC_* and runtime
 * env vars) before this works, and the service-role key is already present in
 * every environment that can query the database these tokens gate access to.
 */
import crypto from 'node:crypto';

const TOKEN_TTL_MS = 10 * 60 * 1000;

function signingKey(): string {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set — cannot sign document tokens');
  return crypto.createHmac('sha256', serviceKey).update('project-document-download').digest('hex');
}

export function signDocumentToken(projectId: number, docId: string): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const payload = `${projectId}.${docId}.${expiresAt}`;
  const sig = crypto.createHmac('sha256', signingKey()).update(payload).digest('hex');
  // base64url so it drops cleanly into a query string with no re-encoding.
  const token = Buffer.from(`${payload}.${sig}`).toString('base64url');
  return { token, expiresAt };
}

export function verifyDocumentToken(token: string, projectId: number, docId: string): boolean {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const parts = decoded.split('.');
    if (parts.length !== 4) return false;
    const [tProjectId, tDocId, tExpiresAt, sig] = parts;
    if (tProjectId !== String(projectId) || tDocId !== docId) return false;
    if (Date.now() > Number(tExpiresAt)) return false;

    const payload = `${tProjectId}.${tDocId}.${tExpiresAt}`;
    const expected = crypto.createHmac('sha256', signingKey()).update(payload).digest('hex');
    // Constant-time compare — this gates a real download, not just a UI toggle.
    return (
      expected.length === sig.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
    );
  } catch {
    return false;
  }
}
