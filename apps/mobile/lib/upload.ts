/**
 * Image upload — the mobile counterpart to
 * apps/web/src/lib/storage/upload-client.ts.
 *
 * Same two-step flow: get a short-lived signature from our server
 * (POST /api/uploads/sign, which also picks the destination folder so it
 * can't be spoofed), then upload directly to Cloudinary with it. The
 * server-side route and folders are shared with web — nothing here is
 * mobile-specific except how the file gets into a FormData part.
 *
 * Deliberately skips the content-hash de-dup web does (SHA-256 via
 * crypto.subtle, a browser-only API) — that's a nice-to-have that avoids
 * storing byte-identical re-uploads twice, not a requirement. Cloudinary
 * assigns a random public_id instead. Add expo-crypto if the dedup ever
 * turns out to matter.
 */
import { endpoints } from './api';

export interface PickedImage {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
}

export interface UploadResult {
  url: string;
  publicId: string;
}

export async function uploadImage(
  image: PickedImage,
  purpose: 'avatar' | 'profile' | 'stage'
): Promise<UploadResult> {
  const sign = await endpoints.signUpload<{
    cloud_name: string;
    api_key: string;
    timestamp: number;
    signature: string;
    folder: string;
  }>({ purpose });
  if (!sign.ok || !sign.data) {
    throw new Error(sign.error || 'Could not start the upload.');
  }
  const { cloud_name, api_key, timestamp, signature, folder } = sign.data;

  const form = new FormData();
  // React Native's fetch/FormData accepts this { uri, name, type } shape in
  // place of a File/Blob — there's no Blob-from-local-file constructor here.
  form.append('file', {
    uri: image.uri,
    name: image.fileName || `upload-${Date.now()}.jpg`,
    type: image.mimeType || 'image/jpeg',
  } as unknown as Blob);
  form.append('api_key', api_key);
  form.append('timestamp', String(timestamp));
  form.append('signature', signature);
  form.append('folder', folder);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud_name}/auto/upload`, {
    method: 'POST',
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.secure_url) {
    throw new Error(data?.error?.message || 'Upload failed. Please try again.');
  }
  return { url: data.secure_url as string, publicId: data.public_id as string };
}
