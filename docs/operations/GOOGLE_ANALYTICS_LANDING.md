# Google Analytics on the landing site (influnet.io)

**Status (2026-11-05): the code is merged and does nothing until you set one
value.** `apps/landing/src/components/analytics/google-analytics.tsx` is
mounted in the root layout. With no measurement ID it renders nothing and
loads nothing. This was checked by building the site both ways: without an ID,
0 of 11 pages reference Google; with an ID, every page loads `gtag.js`.

**Update 2026-11-10: set up and switched on.** Property "Influnet website"
(property 563543596), stream "Influnet landing (influnet.io)", Measurement ID
`G-H06D0SZ14G`, set as the repo variable `LANDING_GA_MEASUREMENT_ID`. Steps 1–3
below are done, with these differences from the text:

- Google now wraps the tag in a Tag Manager container (`GTM-…`). Ignore it; the
  site uses the `G-…` ID directly. "Define internal traffic" lives in the
  stream → Configure tag settings → Settings → Show more.
- Internal-traffic rule "Team (Influnet office/home)" covers one IPv4 /32 and
  one IPv6 /64. **Home and office IPs change**; if your own visits start
  showing in reports, add the new IP there.
- The "Internal Traffic" data filter (Admin → Data filters) must be **Active**
  to exclude anything. Testing state only labels it. Once active it can't be
  undone for data already processed.
- `sign_up_click` can only be starred as a Key event after GA has received it
  once (Admin → Events → Recent events).
- "Run workflow" (manual) did nothing until the build job's `if:` was changed to
  allow `workflow_dispatch`. Fixed 2026-11-10.

## Reading the traffic

- **Is it working right now:** Reports → **Realtime**. Visitors in the last 30
  minutes, by page and event.
- **How many visited:** Reports → Reports snapshot, or Reports → Acquisition →
  *Traffic acquisition* (where they came from: Direct, Instagram, WhatsApp,
  Google). Tag links with `?utm_source=…&utm_medium=…&utm_campaign=…` or
  Instagram traffic shows up as plain "Direct".
- **Which pages:** Reports → Engagement → *Pages and screens*.
- **Did they click to sign up:** Reports → Engagement → *Events* → `sign_up_click`
  (and `login_click`). Once starred as a Key event it also appears under Key
  events on Home.
- **Funnel:** Explore → Funnel exploration → `page_view` (`/`) → `page_view`
  (`/creators` or `/business`) → `sign_up_click`.
- **Where from:** Reports → Demographics → *Demographic details* → Country/City.
- **Truth check:** real signups are in `/dashboard/admin/analytics` (database).
  GA undercounts by 20–40% (ad blockers).
- Data lands in Realtime within seconds, in standard reports after roughly a day.

GA here is for the **marketing site only**. The product app (`apps/web`,
mobile) uses PostHog plus the database funnel, for the reasons in
[ANALYTICS.md §3](ANALYTICS.md). Don't add GA to the app: its DOM holds creator
PII and message drafts.

---

## Steps, in order

### 1. Create the GA4 property (you, ~10 min)

1. <https://analytics.google.com> → Admin → **Create property** → name it
   "Influnet website", time zone **India (GMT+5:30)**, currency **INR**.
2. Add a **Web** data stream for `https://influnet.io`.
3. Copy the **Measurement ID**. It looks like `G-XXXXXXXXXX`.
4. In the stream's **Enhanced measurement** settings, keep *Page views* on and
   check **"Page changes based on browser history events"** is ticked. That
   tick is what counts client-side navigations between `/`, `/creators` and
   `/business`.
5. Admin → **Data collection** → leave **Google signals off**. The code also
   sends `allow_google_signals: false`; the dashboard setting is the backstop.
6. Admin → **Data retention** → 14 months (the default 2 months is too short to
   compare launches).
7. Admin → **Data filters** → add an *Internal traffic* filter for the team's
   office IPs, so your own testing doesn't skew the numbers.

### 2. Update the privacy policy BEFORE turning it on (you + lawyer)

The policy currently names **only** the Meta Pixel, and says it runs only on
`/join`. Turning GA on without changing it makes the published policy
inaccurate. That is a DPDP Act problem, and Razorpay and the app stores both
read this page.

Edit `apps/landing/src/lib/legal-data.ts`. Suggested wording, for a lawyer to
approve:

- **Section 3, add after the "Advertising Measurement" paragraph:**
  > *Website Analytics: Our website (influnet.io) uses Google Analytics,
  > provided by Google LLC, to understand how visitors use the site, such as
  > which pages are viewed and which links are followed into the Influnet app.
  > Google Analytics sets its own cookies and receives standard browser and
  > device information and an approximate location derived from your IP
  > address (Google Analytics 4 does not store IP addresses). We have turned off
  > Google's advertising features: this data is not used for ad personalisation
  > or shared with Google Ads. We do not send Google your name, email, phone
  > number or anything you type into a form.*
- **Section 6, add:**
  > *Across influnet.io, Google Analytics sets analytics cookies (`_ga`,
  > `_ga_*`). You can opt out with Google's browser add-on
  > (tools.google.com/dlpage/gaoptout), your browser's privacy settings, or an
  > ad blocker. The site works the same without them.*

Ship this change first, or in the same deploy as step 3.

### 3. Set the ID (you, 2 min)

GitHub → repository **Settings → Secrets and variables → Actions →
Variables** → **New repository variable**:

| Name | Value |
|---|---|
| `LANDING_GA_MEASUREMENT_ID` | `G-XXXXXXXXXX` |

It's a *variable*, not a secret: the ID appears in the page source anyway.

The landing workflow
(`.github/workflows/azure-static-web-apps-proud-smoke-00f74a310.yml`) passes it
to the build as `NEXT_PUBLIC_GA_MEASUREMENT_ID`. Because `NEXT_PUBLIC_*` is
**inlined at build time**, setting the variable does nothing until the next
build. Run the workflow by hand: Actions → *Azure Static Web Apps CI/CD* → **Run
workflow** on `dev`.

### 4. Verify (you, 5 min)

1. Open `https://influnet.io` in a normal (not private) window, with no ad blocker.
2. GA → **Reports → Realtime**: you should appear within ~30 s.
3. Click **Get started** → Realtime → *Event count by event name* shows
   `sign_up_click`. **Log in** shows `login_click`.
4. Browser devtools → Network → filter `collect`: requests go to
   `google-analytics.com/g/collect?...&tid=G-XXXX`. Check there's no `&uid=`
   parameter, and no email or phone anywhere in the URL.

To turn it off: delete the variable and re-run the workflow.

---

## What it sends

| Event | When | Parameters |
|---|---|---|
| `page_view` | every page and client-side navigation (GA enhanced measurement) | GA defaults |
| `sign_up_click` | a click on any link into the app other than `/login` | `link_path`, `page_path` |
| `login_click` | a click on a link to `{APP_URL}/login` | `link_path`, `page_path` |
| scroll / outbound click | GA enhanced measurement defaults | GA defaults |

Consent defaults are set before the tag loads: `ad_storage`, `ad_user_data` and
`ad_personalization` are **denied**, and `analytics_storage` is granted. Paths
only, never query strings, so a link carrying `?ref=` or a token never reaches
Google.

To add a custom event, use `trackGA('event_name', { … })` from the same file.
Never pass a name, email, phone or handle.

## Recommended GA setup once data flows

- **Key events (conversions):** mark `sign_up_click` as a key event. That's
  the landing page's whole job.
- **Funnel exploration:** `page_view (/)` → `page_view (/creators | /business)`
  → `sign_up_click`. Cross-check against the real signups in
  `/dashboard/admin/analytics`, which counts from the database and isn't
  affected by ad blockers. Expect GA to undercount by 20–40%.
- **UTMs:** tag every Instagram, ads or WhatsApp link with
  `?utm_source=…&utm_medium=…&utm_campaign=…`. GA attributes them
  automatically. The Meta Pixel on `/join` stays separate.

## Decisions you may want to revisit

- **Consent banner.** Not built. For an India-only audience, disclosure plus an
  opt-out is the common reading of the DPDP Act today. If you ever target EU/UK
  visitors, you need a banner that sets `analytics_storage` to `denied` until
  the visitor agrees. The consent defaults in the boot script are where it
  plugs in.
- **Google Tag Manager instead of gtag.js.** Only worth it if marketing will
  add several tags without a developer. One more vendor with publish rights to
  the site is a real security cost.
- **`@next/third-parties`.** The Next.js docs suggest its `<GoogleAnalytics>`
  component. It does the same thing (`next/script` + gtag), but it doesn't set
  consent defaults itself (that would need a second script ordered before it)
  and it adds a dependency. The component here is hand-rolled the same way as
  `meta-pixel.tsx`, with the consent defaults in the same boot script as the
  config call.
