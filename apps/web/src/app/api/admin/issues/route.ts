import { NextResponse } from 'next/server';
import { jsonError, withAdmin } from '@/lib/api';

/**
 * The admin issue/fix tracker (see migration 101_admin_issue_tracker.sql).
 * A running log of known product issues, tracked from the dashboard instead
 * of an external doc — status, what's wrong, and once fixed, what was done
 * and exactly when (server-stamped, not client-supplied).
 */

const STATUSES = ['pending', 'in_progress', 'fixed'] as const;

const ISSUE_FIELDS =
  'id, title, description, fix_notes, status, issue_date, fixed_at, images, created_at, updated_at';

const MAX_IMAGES = 6;

/**
 * Screenshots are stored as URLs, so the URL is the thing that has to be
 * trusted. Only Cloudinary's own delivery host is accepted: the upload path
 * (/api/uploads/sign → direct browser upload) can't produce anything else, so
 * a URL from anywhere else did not come from our uploader. Without this the
 * column is a free text field that renders as an <img> in an admin's browser
 * — an easy way to have the dashboard fetch an arbitrary third-party asset.
 *
 * Returns null when the field was absent (leave it alone), an array when it
 * was valid, and throws a string reason when it was present but wrong.
 */
function parseImages(value: unknown): string[] | null {
  if (value === undefined) return null;
  if (!Array.isArray(value)) throw 'images must be an array of URLs';
  if (value.length > MAX_IMAGES) throw `images is limited to ${MAX_IMAGES} files`;

  const urls: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') throw 'images must be an array of URLs';
    const trimmed = item.trim();
    if (!trimmed) continue;
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw 'images must contain valid URLs';
    }
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'res.cloudinary.com') {
      throw 'images must be uploaded through Influnet';
    }
    urls.push(parsed.toString());
  }
  return urls;
}

export async function GET(req: Request) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const { supabase } = auth;

    const url = new URL(req.url);
    const status = url.searchParams.get('status');

    let query = supabase
      .from('admin_issues')
      .select(ISSUE_FIELDS)
      .order('status', { ascending: true })
      .order('issue_date', { ascending: false });

    if (status && (STATUSES as readonly string[]).includes(status)) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) return jsonError(500, 'Could not load issues', error);

    return NextResponse.json({ issues: data ?? [] });
  } catch (error) {
    return jsonError(500, 'Could not load issues', error);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    const body = (await req.json().catch(() => ({}))) as {
      title?: unknown;
      description?: unknown;
      issue_date?: unknown;
      images?: unknown;
    };

    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : '';
    const description = typeof body.description === 'string' ? body.description.trim().slice(0, 4000) : '';
    if (!title) return jsonError(400, 'title is required');
    if (!description) return jsonError(400, 'description is required');

    // Caught here rather than by the outer handler, which would turn a bad
    // client payload into a 500.
    let images: string[] | null;
    try {
      images = parseImages(body.images);
    } catch (reason) {
      return jsonError(400, String(reason));
    }

    const issueDate =
      typeof body.issue_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.issue_date)
        ? body.issue_date
        : new Date().toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from('admin_issues')
      .insert({
        title,
        description,
        issue_date: issueDate,
        images: images ?? [],
        created_by: user.id,
        updated_by: user.id,
      })
      .select(ISSUE_FIELDS)
      .single();

    if (error) {
      if ((error as { code?: string }).code === '23505') {
        return jsonError(409, 'An issue with this title already exists');
      }
      return jsonError(500, 'Could not create issue', error);
    }

    return NextResponse.json({ issue: data }, { status: 201 });
  } catch (error) {
    return jsonError(500, 'Could not create issue', error);
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    const body = (await req.json().catch(() => ({}))) as {
      id?: unknown;
      title?: unknown;
      description?: unknown;
      fix_notes?: unknown;
      status?: unknown;
      issue_date?: unknown;
    };

    const id = typeof body.id === 'string' ? body.id : '';
    if (!id) return jsonError(400, 'id is required');

    const update: Record<string, unknown> = { updated_by: user.id };

    if (typeof body.title === 'string') {
      const title = body.title.trim().slice(0, 200);
      if (!title) return jsonError(400, 'title cannot be empty');
      update.title = title;
    }
    if (typeof body.description === 'string') {
      const description = body.description.trim().slice(0, 4000);
      if (!description) return jsonError(400, 'description cannot be empty');
      update.description = description;
    }
    if (typeof body.fix_notes === 'string') {
      update.fix_notes = body.fix_notes.trim().slice(0, 4000) || null;
    }
    if (typeof body.issue_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.issue_date)) {
      update.issue_date = body.issue_date;
    }
    if (typeof body.status === 'string') {
      if (!(STATUSES as readonly string[]).includes(body.status)) {
        return jsonError(400, `status must be one of ${STATUSES.join(', ')}`);
      }
      update.status = body.status;
      // Server-stamped the moment status flips to fixed — never trust a
      // client-supplied timestamp here, this is meant to be a real record.
      // Reverting away from 'fixed' clears it, so re-fixing later stamps fresh.
      update.fixed_at = body.status === 'fixed' ? new Date().toISOString() : null;
    }

    if (Object.keys(update).length === 1) return jsonError(400, 'Nothing to update');

    const { data, error } = await supabase
      .from('admin_issues')
      .update(update)
      .eq('id', id)
      .select(ISSUE_FIELDS)
      .maybeSingle();

    if (error) return jsonError(500, 'Could not update this issue', error);
    if (!data) return jsonError(404, 'Issue not found');

    return NextResponse.json({ issue: data });
  } catch (error) {
    return jsonError(500, 'Could not update this issue', error);
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const { supabase } = auth;

    const url = new URL(req.url);
    const id = url.searchParams.get('id') ?? '';
    if (!id) return jsonError(400, 'id is required');

    const { error } = await supabase.from('admin_issues').delete().eq('id', id);
    if (error) return jsonError(500, 'Could not delete this issue', error);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(500, 'Could not delete this issue', error);
  }
}
