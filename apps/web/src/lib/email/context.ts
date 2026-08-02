import { createServerClient } from '@/lib/supabase/server';
import { emailsEnabled } from './client';

/**
 * Display names for email copy.
 *
 * Templates are written in the second person about a third party — "Ananya
 * accepted your request", "Nomad Coffee Co. paid you" — so almost every send
 * needs the name of someone who is NOT the recipient. Call sites hold
 * RLS-scoped clients that frequently cannot read that person's profile row,
 * and none of them should have to care: a missing name is a cosmetic problem,
 * never a reason to skip the mail.
 *
 * So this reads with the shared service client, batches every id into one
 * query, and always returns something usable.
 */

const FALLBACK = 'there';

export type Names = Record<string, string>;

/**
 * Batched id → display name. Unknown ids, a missing service key and a failed
 * query all resolve to `FALLBACK` rather than throwing, because every caller
 * is on a best-effort notification path.
 *
 * Read it with {@link nameOf} so a null id can't index the map by accident.
 */
export async function profileNames(ids: (string | null | undefined)[]): Promise<Names> {
  // Callers build their email payload before deliverEmail() gets to decide
  // anything, so without this every notify site would pay for a profiles query
  // even in an environment that sends no mail at all.
  if (!emailsEnabled()) return {};

  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (unique.length === 0) return {};

  // Guarded rather than trusted: createServerClient() asserts the service key
  // is present, and this path must degrade instead of throwing.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return {};

  try {
    const { data, error } = await createServerClient()
      .from('profiles')
      .select('id, name')
      .in('id', unique);
    if (error || !data) return {};
    return Object.fromEntries(
      (data as { id: string; name: string | null }[]).map((p) => [p.id, p.name?.trim() || FALLBACK]),
    );
  } catch {
    return {};
  }
}

/** Safe lookup — covers the null id and the id that wasn't found. */
export function nameOf(names: Names, id: string | null | undefined): string {
  return (id && names[id]) || FALLBACK;
}
