import Script from 'next/script';

// Meta (Facebook/Instagram) ads pixel, owned by the marketing team's ad account.
// Measures which ads bring people to /join and how many of them register, so the
// ads can be optimised for registrations. It is mounted only on the ad landing
// page, never site-wide.
//
// No personal data is sent: we fire PageView and a bare CompleteRegistration,
// and deliberately do not use Meta's "advanced matching" (hashed email/phone).
// The privacy policy in lib/legal-data.ts says so — keep the two in step.
export const META_PIXEL_ID = '5504404509784924';

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

const BOOT = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;
n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;
s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${META_PIXEL_ID}');fbq('track','PageView');`;

export default function MetaPixel() {
  return (
    <>
      <Script id="meta-pixel" strategy="afterInteractive">
        {BOOT}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: 'none' }}
          alt=""
          src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
        />
      </noscript>
    </>
  );
}

// Safe to call anywhere: a no-op if the pixel isn't on this page or was blocked
// by an ad blocker. Never pass personal details in `params`.
export function trackMeta(event: string, params?: Record<string, string | number>) {
  try {
    window.fbq?.('track', event, params);
  } catch {
    /* tracking must never break the page */
  }
}
