'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

/**
 * "Open in the Influnet app, or continue here?" — shown once per browser on a
 * mobile-web visit.
 *
 * ── When it does NOT show ────────────────────────────────────────────────
 *  - desktop / non-touch user agents
 *  - inside the app's own WebView (react-native-webview injects
 *    `window.ReactNativeWebView`) — otherwise the app would keep offering to
 *    open the app
 *  - once the visitor has answered (localStorage), on any page
 *
 * ── "Open app" ──────────────────────────────────────────────────────────
 * Tries the `influnet://` custom scheme. If the app is installed the OS
 * switches to it and this tab is backgrounded; if it isn't, nothing visible
 * happens and — when a store URL is configured — we send them there after a
 * short beat. No store URL configured (the app isn't publicly listed yet) just
 * means "Open app" is best-effort and the visitor stays on web, which is fine.
 */

const DISMISS_KEY = 'influnet:open-in-app';
const IOS_STORE = process.env.NEXT_PUBLIC_IOS_APP_URL || '';
const ANDROID_STORE = process.env.NEXT_PUBLIC_ANDROID_APP_URL || '';

function isMobileWeb(): boolean {
  if (typeof navigator === 'undefined') return false;
  // In the app's WebView — never nudge.
  if ((window as any).ReactNativeWebView) return false;
  const ua = navigator.userAgent || '';
  return /android|iphone|ipad|ipod/i.test(ua);
}

function storeUrl(): string {
  const ua = navigator.userAgent || '';
  if (/android/i.test(ua)) return ANDROID_STORE;
  if (/iphone|ipad|ipod/i.test(ua)) return IOS_STORE;
  return '';
}

export function OpenInAppBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(DISMISS_KEY) !== null;
    } catch {
      /* private mode — treat as not dismissed, it just won't persist */
    }
    if (!dismissed && isMobileWeb()) setShow(true);
  }, []);

  function remember() {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setShow(false);
  }

  function openApp() {
    const target = storeUrl();
    const start = Date.now();
    // If we're still here ~1.2s later, the app didn't take over — fall back to
    // the store when we know it, otherwise just close the sheet.
    const t = window.setTimeout(() => {
      if (document.visibilityState === 'visible' && Date.now() - start < 2500) {
        if (target) window.location.href = target;
      }
      remember();
    }, 1200);
    // Cancel the fallback if the page gets hidden (the app opened).
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.visibilityState === 'hidden') window.clearTimeout(t);
      },
      { once: true },
    );
    window.location.href = 'influnet://';
  }

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-label="Open in the Influnet app"
      className="fixed inset-x-0 bottom-0 z-[100] border-t border-hairline bg-surface-card px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.25)]"
    >
      <div className="mx-auto flex max-w-md items-center gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-lg font-black text-brand">
          I
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-content">Influnet works better in the app</p>
          <p className="text-xs text-content-muted">Faster, with notifications.</p>
        </div>
        <button
          onClick={openApp}
          className="shrink-0 rounded-lg bg-brand px-3 py-2 text-xs font-bold text-white"
        >
          Open app
        </button>
        <button
          onClick={remember}
          aria-label="Continue in browser"
          className="shrink-0 rounded-lg p-1.5 text-content-muted hover:bg-surface-muted"
        >
          <X className="size-4" />
        </button>
      </div>
      <button
        onClick={remember}
        className="mx-auto mt-1.5 block text-[0.6875rem] font-semibold text-content-muted underline"
      >
        Continue on the web
      </button>
    </div>
  );
}
