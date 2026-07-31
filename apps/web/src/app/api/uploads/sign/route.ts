import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth, jsonError } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import {
  isCloudinaryConfigured, signCloudinaryParams,
  cloudinaryCloudName, cloudinaryApiKey, UPLOAD_FOLDERS,
} from '@/lib/storage/cloudinary';

const BodySchema = z.object({
  purpose: z.enum(['stage', 'avatar', 'profile']),
  // Must be exactly the SHA-256 hex digest computeFileHash() produces — no
  // slashes, no arbitrary length. Anything else isn't a content hash, and
  // this value becomes half of the Cloudinary public_id below.
  hash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});

// POST: hand the browser a short-lived Cloudinary upload signature. Auth-gated
// and rate-limited; the server picks the destination folder so it can't be
// spoofed. The client uploads directly to Cloudinary with what we return.
export async function POST(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { user } = auth;

    if (!isCloudinaryConfigured()) {
      return jsonError(503, 'Image uploads are not enabled. Set the Cloudinary environment variables.');
    }

    const limited = await enforceRateLimit(req, { bucket: 'uploads:sign', limit: 30, windowMs: 60_000, key: user.id });
    if (limited) return limited;

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }

    const folder = UPLOAD_FOLDERS[parsed.data.purpose];
    const timestamp = Math.floor(Date.now() / 1000);
    const paramsToSign: Record<string, string | number> = { folder, timestamp };

    // CAS deduplication: use the hash as public_id so re-uploading identical
    // bytes overwrites in place. Namespaced under the caller's own user id so
    // one account can never address — and overwrite — another account's
    // asset, even though both compute the same content hash.
    let publicId: string | undefined;
    if (parsed.data.hash) {
      publicId = `${user.id}/${parsed.data.hash}`;
      paramsToSign.public_id = publicId;
      paramsToSign.overwrite = 'true';
    }

    const signature = signCloudinaryParams(paramsToSign);

    return NextResponse.json({
      cloud_name: cloudinaryCloudName(),
      api_key: cloudinaryApiKey(),
      timestamp,
      signature,
      folder,
      public_id: publicId,
    });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}
