'use client';

import Script from 'next/script';
import { useEffect } from 'react';
import { APP_URL } from '@/components/site/links';

// Google Analytics 4 for the marketing site (influnet.io). Site-wide, mounted in
// the root layout. Setup and the privacy-policy wording that must go live with
// it: docs/operations/GOOGLE_ANALYTICS_LANDING.md.
//
// INERT UNTIL CONFIGURED. With NEXT_PUBLIC_GA_MEASUREMENT_ID unset (or not a
// G-XXXX id) this renders nothing and loads nothing. The value is inlined at
// BUILD time, so turning it on or off is a redeploy of the landing workflow.
//
// What is deliberately sent and not sent:
//   - page views (GA4 enhanced measurement picks up App Router navigations)
//   - `sign_up_click` / `login_click` when someone follows a link into the app
//   - NO advertising signals: ad_storage, ad_user_data and ad_personalization
//     are denied, and Google signals is off, so nothing here feeds Google Ads
//     audiences. The Meta pixel on /join is a separate decision.
//   - NO personal data. Never pass names, emails, phones or handles in params.
export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? '';

export const gaEnabled = /^G-[A-Z0-9]{4,}$/.test(GA_MEASUREMENT_ID);

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

const BOOT = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'granted'});
gtag('js',new Date());
gtag('config','${GA_MEASUREMENT_ID}',{allow_google_signals:false,allow_ad_personalization_signals:false});`;

/** Safe to call anywhere: a no-op when GA is off or blocked. */
export function trackGA(event: string, params?: Record<string, string | number | boolean>) {
  if (!gaEnabled) return;
  try {
    window.gtag?.('event', event, params);
  } catch {
    /* tracking must never break the page */
  }
}

/**
 * One delegated listener instead of an onClick on every CTA: any link into the
 * app (APP_URL) is reported with the page it was clicked on and where it goes.
 * Only paths are sent, never query strings.
 */
function useAppLinkClicks() {
  useEffect(() => {
    if (!gaEnabled) return;
    let appOrigin: string;
    try {
      appOrigin = new URL(APP_URL).origin;
    } catch {
      return;
    }
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a) return;
      let url: URL;
      try {
        url = new URL(a.href);
      } catch {
        return;
      }
      if (url.origin !== appOrigin) return;
      const event = url.pathname.startsWith('/login') ? 'login_click' : 'sign_up_click';
      trackGA(event, { link_path: url.pathname, page_path: location.pathname });
    };
    document.addEventListener('click', onClick, { capture: true });
    return () => document.removeEventListener('click', onClick, { capture: true });
  }, []);
}

export default function GoogleAnalytics() {
  useAppLinkClicks();
  if (!gaEnabled) return null;
  return (
    <>
      <Script
        id="ga-loader"
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga-boot" strategy="afterInteractive">
        {BOOT}
      </Script>
    </>
  );
}
