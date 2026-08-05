'use client';

// Browser-side image/file upload to Cloudinary via a server-signed request.
// Usage: const { url, publicId } = await uploadToCloudinary(file, 'stage');

import { apiFetch } from '@/lib/api-client';

export interface UploadResult {
  url: string;
  publicId: string;
}

async function computeFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function uploadToCloudinary(
  file: File,
  purpose: 'stage' | 'avatar' | 'profile' | 'issue',
): Promise<UploadResult> {
  const hash = await computeFileHash(file);

  const sign = await apiFetch<{ cloud_name: string; api_key: string; timestamp: number; signature: string; folder: string; public_id?: string }>(
    '/api/uploads/sign',
    { method: 'POST', body: JSON.stringify({ purpose, hash }) },
  );
  if (!sign.ok || !sign.data) {
    throw new Error(sign.error || 'Could not start the upload.');
  }
  const { cloud_name, api_key, timestamp, signature, folder, public_id } = sign.data;

  const form = new FormData();
  form.append('file', file);
  form.append('api_key', api_key);
  form.append('timestamp', String(timestamp));
  form.append('signature', signature);
  form.append('folder', folder);
  if (public_id) {
    form.append('public_id', public_id);
    form.append('overwrite', 'true');
  }

  // Direct upload to Cloudinary (does not go through our server). `auto` handles
  // images and raw files (PDFs, etc.) alike.
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
