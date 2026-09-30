-- Migration 175: Editable pre-event survey questions
--
-- The questions on influnet.io/join/survey (migration 174) move out of the
-- landing code and into this table, so admins can add, reword, reorder and
-- remove questions and options from /dashboard/admin/event-survey without a
-- redeploy. One row per event and role; questions is the ordered array the
-- page renders:
--
--   { id, kind: 'single'|'multi'|'text', title, hint?, placeholder?,
--     options?: [{ id, label }], other?: boolean, max?: number }
--
-- Answers are stored keyed by question id and option id, so ids never change
-- once created: rewording a label is safe, and a deleted question's old
-- answers still show in admin under its id.
--
-- Read and written only by the web app's service role (public route and
-- admin route after withAdmin). No anon/authenticated access.

CREATE TABLE IF NOT EXISTS public.event_survey_forms (
  event_slug  TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('creator', 'business')),
  questions   JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(questions) = 'array'),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (event_slug, role)
);

ALTER TABLE public.event_survey_forms ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_survey_forms FROM anon, authenticated;

-- Seed with the questions the page shipped with (174).
INSERT INTO public.event_survey_forms (event_slug, role, questions) VALUES
  ('silicon-nexus-s2', 'creator', $q$[
  {
    "id": "creator_type",
    "kind": "single",
    "title": "What best describes you?",
    "options": [
      {
        "id": "influencer",
        "label": "Influencer"
      },
      {
        "id": "content_creator",
        "label": "Content creator"
      },
      {
        "id": "artist",
        "label": "Artist / performer"
      },
      {
        "id": "ugc",
        "label": "UGC creator"
      },
      {
        "id": "starting",
        "label": "Just getting started"
      }
    ]
  },
  {
    "id": "followers",
    "kind": "single",
    "title": "Roughly how many followers on your main platform?",
    "options": [
      {
        "id": "lt_10k",
        "label": "Under 10K"
      },
      {
        "id": "10k_50k",
        "label": "10K – 50K"
      },
      {
        "id": "50k_200k",
        "label": "50K – 200K"
      },
      {
        "id": "200k_1m",
        "label": "200K – 1M"
      },
      {
        "id": "gt_1m",
        "label": "1M+"
      }
    ]
  },
  {
    "id": "collabs_per_month",
    "kind": "single",
    "title": "How many brand collaborations do you do in a month?",
    "options": [
      {
        "id": "none",
        "label": "None yet"
      },
      {
        "id": "1_2",
        "label": "1 – 2"
      },
      {
        "id": "3_5",
        "label": "3 – 5"
      },
      {
        "id": "gt_5",
        "label": "More than 5"
      }
    ]
  },
  {
    "id": "find_brands",
    "kind": "multi",
    "title": "How do brands usually find you today?",
    "hint": "Pick all that apply",
    "options": [
      {
        "id": "dm",
        "label": "Instagram DMs"
      },
      {
        "id": "agency",
        "label": "Agency / manager"
      },
      {
        "id": "referral",
        "label": "Referrals / friends"
      },
      {
        "id": "i_pitch",
        "label": "I pitch them myself"
      },
      {
        "id": "platform",
        "label": "Another platform or app"
      }
    ],
    "other": true
  },
  {
    "id": "payment_problems",
    "kind": "multi",
    "title": "What goes wrong with payments?",
    "hint": "Pick all that apply",
    "options": [
      {
        "id": "late",
        "label": "Paid late"
      },
      {
        "id": "never",
        "label": "Sometimes never paid"
      },
      {
        "id": "barter",
        "label": "Offered products instead of money"
      },
      {
        "id": "lowball",
        "label": "Rates pushed down"
      },
      {
        "id": "no_advance",
        "label": "No advance before work"
      },
      {
        "id": "invoice",
        "label": "Invoices / GST / TDS confusion"
      },
      {
        "id": "none",
        "label": "No problems so far"
      }
    ],
    "other": true
  },
  {
    "id": "collab_problems",
    "kind": "multi",
    "title": "What goes wrong in collaborations?",
    "hint": "Pick all that apply",
    "options": [
      {
        "id": "unclear_brief",
        "label": "Unclear brief"
      },
      {
        "id": "endless_revisions",
        "label": "Endless revisions"
      },
      {
        "id": "ghosting",
        "label": "Brand goes silent"
      },
      {
        "id": "no_contract",
        "label": "Nothing in writing"
      },
      {
        "id": "usage_rights",
        "label": "Content reused without asking"
      },
      {
        "id": "tracking",
        "label": "Hard to track deadlines and deliverables"
      }
    ],
    "other": true
  },
  {
    "id": "missing",
    "kind": "multi",
    "title": "What are you missing out on?",
    "hint": "Pick all that apply",
    "options": [
      {
        "id": "reach_brands",
        "label": "Reaching the right brands"
      },
      {
        "id": "pricing",
        "label": "Knowing what to charge"
      },
      {
        "id": "portfolio",
        "label": "A good media kit / portfolio"
      },
      {
        "id": "insights",
        "label": "Proof of my reach and views"
      },
      {
        "id": "steady",
        "label": "Steady, repeat work"
      }
    ],
    "other": true
  },
  {
    "id": "would_help",
    "kind": "multi",
    "title": "What would help you most?",
    "hint": "Pick up to three",
    "max": 3,
    "options": [
      {
        "id": "secure_pay",
        "label": "Payment held safely until work is done"
      },
      {
        "id": "discover",
        "label": "Brands that come to me"
      },
      {
        "id": "tracker",
        "label": "One place to track every deal"
      },
      {
        "id": "chat",
        "label": "Chat with brands inside the app"
      },
      {
        "id": "rate_card",
        "label": "Rate card and media kit"
      },
      {
        "id": "verified",
        "label": "Verified badge brands can trust"
      }
    ]
  },
  {
    "id": "thoughts",
    "kind": "text",
    "title": "Anything else on your mind?",
    "hint": "Your biggest headache, a story, or a wish — in your own words",
    "placeholder": "Type here… (optional)"
  }
]$q$::jsonb),
  ('silicon-nexus-s2', 'business', $q$[
  {
    "id": "business_type",
    "kind": "single",
    "title": "What kind of business are you?",
    "options": [
      {
        "id": "d2c",
        "label": "D2C / e-commerce brand"
      },
      {
        "id": "local",
        "label": "Local shop, café or service"
      },
      {
        "id": "agency",
        "label": "Marketing agency"
      },
      {
        "id": "startup",
        "label": "Startup / app"
      },
      {
        "id": "enterprise",
        "label": "Large company"
      }
    ],
    "other": true
  },
  {
    "id": "worked_before",
    "kind": "single",
    "title": "Have you worked with creators before?",
    "options": [
      {
        "id": "often",
        "label": "Yes, regularly"
      },
      {
        "id": "few",
        "label": "A few times"
      },
      {
        "id": "never",
        "label": "Not yet, but planning to"
      }
    ]
  },
  {
    "id": "monthly_budget",
    "kind": "single",
    "title": "Monthly budget for creator marketing?",
    "options": [
      {
        "id": "lt_25k",
        "label": "Under ₹25K"
      },
      {
        "id": "25k_1l",
        "label": "₹25K – ₹1L"
      },
      {
        "id": "1l_5l",
        "label": "₹1L – ₹5L"
      },
      {
        "id": "gt_5l",
        "label": "Over ₹5L"
      },
      {
        "id": "unsure",
        "label": "Not decided"
      }
    ]
  },
  {
    "id": "find_creators",
    "kind": "multi",
    "title": "How do you find creators today?",
    "hint": "Pick all that apply",
    "options": [
      {
        "id": "instagram_search",
        "label": "Searching Instagram"
      },
      {
        "id": "agency",
        "label": "Through an agency"
      },
      {
        "id": "referral",
        "label": "Referrals"
      },
      {
        "id": "platform",
        "label": "Another platform or app"
      },
      {
        "id": "inbound",
        "label": "Creators reach out to us"
      }
    ],
    "other": true
  },
  {
    "id": "hiring_problems",
    "kind": "multi",
    "title": "What makes finding the right creator hard?",
    "hint": "Pick all that apply",
    "options": [
      {
        "id": "fake_followers",
        "label": "Fake followers / inflated numbers"
      },
      {
        "id": "fit",
        "label": "Hard to judge audience fit"
      },
      {
        "id": "pricing",
        "label": "No idea what fair pricing is"
      },
      {
        "id": "response",
        "label": "Creators don’t reply"
      },
      {
        "id": "local",
        "label": "Finding creators in my city"
      }
    ],
    "other": true
  },
  {
    "id": "collab_problems",
    "kind": "multi",
    "title": "What goes wrong once you’ve hired someone?",
    "hint": "Pick all that apply",
    "options": [
      {
        "id": "missed_deadlines",
        "label": "Missed deadlines"
      },
      {
        "id": "quality",
        "label": "Content not as briefed"
      },
      {
        "id": "no_results",
        "label": "Can’t measure results"
      },
      {
        "id": "paid_no_post",
        "label": "Paid, but post never went up"
      },
      {
        "id": "coordination",
        "label": "Too much back-and-forth"
      }
    ],
    "other": true
  },
  {
    "id": "payment_problems",
    "kind": "multi",
    "title": "What’s hard about paying creators?",
    "hint": "Pick all that apply",
    "options": [
      {
        "id": "advance_risk",
        "label": "Risk of paying in advance"
      },
      {
        "id": "invoices",
        "label": "Getting proper invoices"
      },
      {
        "id": "gst_tds",
        "label": "GST / TDS handling"
      },
      {
        "id": "many_payees",
        "label": "Paying many creators at once"
      },
      {
        "id": "none",
        "label": "No problems so far"
      }
    ],
    "other": true
  },
  {
    "id": "would_help",
    "kind": "multi",
    "title": "What would help you most?",
    "hint": "Pick up to three",
    "max": 3,
    "options": [
      {
        "id": "verified",
        "label": "Verified creators with real stats"
      },
      {
        "id": "escrow",
        "label": "Pay only when the work is delivered"
      },
      {
        "id": "campaigns",
        "label": "Post a campaign, let creators apply"
      },
      {
        "id": "tracker",
        "label": "Track every collaboration in one place"
      },
      {
        "id": "reports",
        "label": "Results and reach reports"
      },
      {
        "id": "local",
        "label": "Local creator discovery"
      }
    ]
  },
  {
    "id": "thoughts",
    "kind": "text",
    "title": "Anything else on your mind?",
    "hint": "Your biggest headache with creator marketing, in your own words",
    "placeholder": "Type here… (optional)"
  }
]$q$::jsonb)
ON CONFLICT (event_slug, role) DO NOTHING;
