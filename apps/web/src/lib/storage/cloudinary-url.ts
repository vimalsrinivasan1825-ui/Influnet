/**
 * Delivery-URL helpers for images already stored in Cloudinary.
 *
 * Separate from ./cloudinary.ts on purpose: that module signs uploads and
 * imports node:crypto, so it can't be pulled into a client component. This one
 * is pure string work and is safe on both sides.
 *
 * Why transform at all rather than render the stored `secure_url`: a phone
 * screenshot is around 1080x2340 and a few hundred KB, and an 80px thumbnail
 * of it should not cost the admin the full download — a list of a dozen issues
 * would otherwise pull several megabytes to draw postage stamps. `f_auto` also
 * hands the browser a format it can actually display, which matters for
 * anything an iPhone produces in HEIC.
 */

const IMAGE_UPLOAD_MARKER = '/image/upload/';

/**
 * Inserts a transformation segment into a Cloudinary delivery URL. Any URL
 * that isn't one is returned untouched, so this is always safe to call.
 */
function withTransform(url: string, transform: string): string {
  const at = url.indexOf(IMAGE_UPLOAD_MARKER);
  if (at === -1) return url;
  const cut = at + IMAGE_UPLOAD_MARKER.length;
  return `${url.slice(0, cut)}${transform}/${url.slice(cut)}`;
}

/** Small, cheap version for a grid tile. `c_limit` never upscales. */
export function cloudinaryThumb(url: string, width = 400): string {
  return withTransform(url, `c_limit,w_${width},f_auto,q_auto`);
}

/** Full-size for the lightbox — capped so a 12MP screenshot isn't sent raw. */
export function cloudinaryFull(url: string, width = 1600): string {
  return withTransform(url, `c_limit,w_${width},f_auto,q_auto`);
}
