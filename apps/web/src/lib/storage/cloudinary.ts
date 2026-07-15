// Cloudinary — signed direct uploads. The browser uploads the file straight to
// Cloudinary using a short-lived signature we generate server-side, so the API
// secret never leaves the server and large files don't proxy through us.
//
// Env (server): CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
// Env (client): NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME (only the cloud name is public)
//
// The app degrades gracefully when unconfigured: uploads are simply disabled.

import crypto from 'crypto';

export function isCloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET,
  );
}

export function cloudinaryCloudName(): string {
  return process.env.CLOUDINARY_CLOUD_NAME || '';
}

export function cloudinaryApiKey(): string {
  return process.env.CLOUDINARY_API_KEY || '';
}

// Sign the given upload params (Cloudinary's scheme: sorted `k=v` joined by `&`,
// then the API secret appended, hashed with SHA-1).
export function signCloudinaryParams(params: Record<string, string | number>): string {
  const secret = process.env.CLOUDINARY_API_SECRET || '';
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return crypto.createHash('sha1').update(toSign + secret).digest('hex');
}

// Folders we allow uploads into, keyed by purpose (client picks a purpose, the
// server decides the actual folder so it can't be spoofed).
export const UPLOAD_FOLDERS: Record<string, string> = {
  stage: 'influnet/project-updates',
  avatar: 'influnet/avatars',
  profile: 'influnet/profile-photos',
};
