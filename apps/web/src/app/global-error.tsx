'use client';

/**
 * Last-resort boundary.
 *
 * `app/error.tsx` sits INSIDE the root layout, so it cannot catch an error
 * thrown by the root layout itself — a bad font load, a provider that throws
 * on mount, a hydration failure at the top of the tree. Without this file
 * those render Next.js's unstyled default error page in production and are
 * reported nowhere.
 *
 * This component replaces the entire document, which is why it renders its own
 * <html> and <body> and why the styling is inline: at this point the app's CSS
 * may itself be what failed.
 */

import { useEffect } from 'react';
import { captureBrowserError } from '@/lib/observability-client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureBrowserError(error, {
      kind: 'global-error-boundary',
      ...(error.digest ? { digest: error.digest } : {}),
    });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#fafafb',
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          color: '#111827',
          padding: '1rem',
        }}
      >
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0 0 0.5rem' }}>
            Influnet couldn&apos;t load
          </h1>
          <p
            style={{
              fontSize: '0.9375rem',
              lineHeight: 1.6,
              color: '#6b7280',
              margin: '0 0 1.5rem',
            }}
          >
            Something failed before the page could start. Reloading usually
            fixes it. If it keeps happening, the team has already been notified.
          </p>
          <button
            onClick={() => reset()}
            style={{
              appearance: 'none',
              border: 'none',
              borderRadius: '0.875rem',
              background: '#ee3e96',
              color: '#fff',
              fontSize: '1rem',
              fontWeight: 700,
              padding: '0.875rem 1.75rem',
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
          {error.digest ? (
            <p style={{ marginTop: '1.5rem', fontSize: '0.75rem', color: '#9ca3af' }}>
              Reference: {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
