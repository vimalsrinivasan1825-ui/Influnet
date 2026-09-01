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
 *
 * ── WHY THIS USES XMLHttpRequest AND NOT fetch ────────────────────────
 *
 * React Native has always had a non-standard FormData extension: append an
 * object shaped `{ uri, name, type }` and the native layer streams that file
 * off disk into the multipart body. There is no Blob-from-local-file
 * constructor in RN, so that shape is the only way to send a picked photo
 * without first reading the whole thing into JS memory.
 *
 * Expo SDK 57 replaces the global `fetch` with `expo/fetch` (see
 * expo/src/winter/runtime.native.ts — it is installed unless
 * EXPO_PUBLIC_USE_RN_FETCH is set). That implementation is WinterCG-compliant,
 * and its multipart encoder handles only strings and Blobs:
 *
 *     // expo/src/winter/fetch/convertFormData.ts
 *     // `uri` is not supported for React Native's FormData.
 *     throw new Error('Unsupported FormDataPart implementation');
 *
 * So every avatar upload from the app died with "Unsupported FormDataPart
 * implementation", surfaced to the user as "Upload failed: Unsupported…".
 * Nothing had changed in this file; the SDK upgrade swapped the fetch out from
 * under it. Cloudinary's own logs show the last successful mobile upload was
 * 2026-07-15.
 *
 * XMLHttpRequest is the fix because RN's XHR still consumes `FormData` through
 * `getParts()`, which handles the `{ uri }` part natively and streams it. The
 * two alternatives were both worse: forcing RN's fetch back on via
 * EXPO_PUBLIC_USE_RN_FETCH changes networking for the entire app to fix one
 * request, and expo-file-system's Blob-compatible `File` is a native module
 * this app does not depend on — adding one breaks every already-installed
 * build until a new binary ships, so it cannot go out over OTA.
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

/** Cloudinary's JSON response, as much of it as we care about. */
interface CloudinaryResponse {
  secure_url?: string;
  public_id?: string;
  error?: { message?: string };
}

/**
 * POST a multipart body and resolve Cloudinary's parsed JSON.
 *
 * Rejects on transport failure only — an HTTP error still resolves, because
 * Cloudinary puts a useful reason in the body (`error.message`) and the caller
 * wants to show that rather than a status code.
 */
function postForm(url: string, form: FormData): Promise<CloudinaryResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    // Content-Type is deliberately not set: RN's XHR generates the multipart
    // boundary itself when the body is a FormData, and setting the header by
    // hand overwrites it with one that has no boundary.
    xhr.onload = () => {
      try {
        resolve(JSON.parse(xhr.responseText) as CloudinaryResponse);
      } catch {
        resolve({});
      }
    };
    xhr.onerror = () => reject(new Error('Network error during upload. Check your connection.'));
    xhr.ontimeout = () => reject(new Error('The upload timed out. Please try again.'));
    xhr.send(form);
  });
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
  // RN's proprietary local-file part — see the note at the top for why this
  // shape survives here but not through `fetch`.
  form.append('file', {
    uri: image.uri,
    name: image.fileName || `upload-${Date.now()}.jpg`,
    type: image.mimeType || 'image/jpeg',
  } as unknown as Blob);
  form.append('api_key', api_key);
  form.append('timestamp', String(timestamp));
  form.append('signature', signature);
  form.append('folder', folder);

  const data = await postForm(
    `https://api.cloudinary.com/v1_1/${cloud_name}/auto/upload`,
    form,
  );
  if (!data.secure_url) {
    throw new Error(data.error?.message || 'Upload failed. Please try again.');
  }
  return { url: data.secure_url, publicId: data.public_id as string };
}
