/**
 * A `next` redirect target, or null if it isn't safe to follow.
 *
 * Only same-site paths: must start with a single "/". "//evil.test" and
 * "/\evil.test" are both read by browsers as another host, which would turn a
 * login link into an open redirect.
 */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || next.length > 500) return null;
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return null;
  return next;
}
