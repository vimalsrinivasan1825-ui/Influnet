// Fallback questions for /join/survey. The live form is edited in admin
// (/dashboard/admin/event-survey) and stored in event_survey_forms (migration
// 175, seeded from this file); the page only uses these if it can't load that.
// Answers are keyed by question id and option id, so ids never change.

export type Role = 'creator' | 'business';

export type Question =
  | { id: string; kind: 'single' | 'multi'; title: string; hint?: string; options: { id: string; label: string }[]; other?: boolean; max?: number }
  | { id: string; kind: 'text'; title: string; hint?: string; placeholder?: string };

const opt = (id: string, label: string) => ({ id, label });

export const QUESTIONS: Record<Role, Question[]> = {
  creator: [
    {
      id: 'creator_type',
      kind: 'single',
      title: 'What best describes you?',
      options: [
        opt('influencer', 'Influencer'),
        opt('content_creator', 'Content creator'),
        opt('artist', 'Artist / performer'),
        opt('ugc', 'UGC creator'),
        opt('starting', 'Just getting started'),
      ],
    },
    {
      id: 'followers',
      kind: 'single',
      title: 'Roughly how many followers on your main platform?',
      options: [
        opt('lt_10k', 'Under 10K'),
        opt('10k_50k', '10K – 50K'),
        opt('50k_200k', '50K – 200K'),
        opt('200k_1m', '200K – 1M'),
        opt('gt_1m', '1M+'),
      ],
    },
    {
      id: 'collabs_per_month',
      kind: 'single',
      title: 'How many brand collaborations do you do in a month?',
      options: [opt('none', 'None yet'), opt('1_2', '1 – 2'), opt('3_5', '3 – 5'), opt('gt_5', 'More than 5')],
    },
    {
      id: 'find_brands',
      kind: 'multi',
      title: 'How do brands usually find you today?',
      hint: 'Pick all that apply',
      options: [
        opt('dm', 'Instagram DMs'),
        opt('agency', 'Agency / manager'),
        opt('referral', 'Referrals / friends'),
        opt('i_pitch', 'I pitch them myself'),
        opt('platform', 'Another platform or app'),
      ],
      other: true,
    },
    {
      id: 'payment_problems',
      kind: 'multi',
      title: 'What goes wrong with payments?',
      hint: 'Pick all that apply',
      options: [
        opt('late', 'Paid late'),
        opt('never', 'Sometimes never paid'),
        opt('barter', 'Offered products instead of money'),
        opt('lowball', 'Rates pushed down'),
        opt('no_advance', 'No advance before work'),
        opt('invoice', 'Invoices / GST / TDS confusion'),
        opt('none', 'No problems so far'),
      ],
      other: true,
    },
    {
      id: 'collab_problems',
      kind: 'multi',
      title: 'What goes wrong in collaborations?',
      hint: 'Pick all that apply',
      options: [
        opt('unclear_brief', 'Unclear brief'),
        opt('endless_revisions', 'Endless revisions'),
        opt('ghosting', 'Brand goes silent'),
        opt('no_contract', 'Nothing in writing'),
        opt('usage_rights', 'Content reused without asking'),
        opt('tracking', 'Hard to track deadlines and deliverables'),
      ],
      other: true,
    },
    {
      id: 'missing',
      kind: 'multi',
      title: 'What are you missing out on?',
      hint: 'Pick all that apply',
      options: [
        opt('reach_brands', 'Reaching the right brands'),
        opt('pricing', 'Knowing what to charge'),
        opt('portfolio', 'A good media kit / portfolio'),
        opt('insights', 'Proof of my reach and views'),
        opt('steady', 'Steady, repeat work'),
      ],
      other: true,
    },
    {
      id: 'would_help',
      kind: 'multi',
      title: 'What would help you most?',
      hint: 'Pick up to three',
      max: 3,
      options: [
        opt('secure_pay', 'Payment held safely until work is done'),
        opt('discover', 'Brands that come to me'),
        opt('tracker', 'One place to track every deal'),
        opt('chat', 'Chat with brands inside the app'),
        opt('rate_card', 'Rate card and media kit'),
        opt('verified', 'Verified badge brands can trust'),
      ],
    },
    {
      id: 'thoughts',
      kind: 'text',
      title: 'Anything else on your mind?',
      hint: 'Your biggest headache, a story, or a wish — in your own words',
      placeholder: 'Type here… (optional)',
    },
  ],
  business: [
    {
      id: 'business_type',
      kind: 'single',
      title: 'What kind of business are you?',
      options: [
        opt('d2c', 'D2C / e-commerce brand'),
        opt('local', 'Local shop, café or service'),
        opt('agency', 'Marketing agency'),
        opt('startup', 'Startup / app'),
        opt('enterprise', 'Large company'),
      ],
      other: true,
    },
    {
      id: 'worked_before',
      kind: 'single',
      title: 'Have you worked with creators before?',
      options: [
        opt('often', 'Yes, regularly'),
        opt('few', 'A few times'),
        opt('never', 'Not yet, but planning to'),
      ],
    },
    {
      id: 'monthly_budget',
      kind: 'single',
      title: 'Monthly budget for creator marketing?',
      options: [
        opt('lt_25k', 'Under ₹25K'),
        opt('25k_1l', '₹25K – ₹1L'),
        opt('1l_5l', '₹1L – ₹5L'),
        opt('gt_5l', 'Over ₹5L'),
        opt('unsure', 'Not decided'),
      ],
    },
    {
      id: 'find_creators',
      kind: 'multi',
      title: 'How do you find creators today?',
      hint: 'Pick all that apply',
      options: [
        opt('instagram_search', 'Searching Instagram'),
        opt('agency', 'Through an agency'),
        opt('referral', 'Referrals'),
        opt('platform', 'Another platform or app'),
        opt('inbound', 'Creators reach out to us'),
      ],
      other: true,
    },
    {
      id: 'hiring_problems',
      kind: 'multi',
      title: 'What makes finding the right creator hard?',
      hint: 'Pick all that apply',
      options: [
        opt('fake_followers', 'Fake followers / inflated numbers'),
        opt('fit', 'Hard to judge audience fit'),
        opt('pricing', 'No idea what fair pricing is'),
        opt('response', 'Creators don’t reply'),
        opt('local', 'Finding creators in my city'),
      ],
      other: true,
    },
    {
      id: 'collab_problems',
      kind: 'multi',
      title: 'What goes wrong once you’ve hired someone?',
      hint: 'Pick all that apply',
      options: [
        opt('missed_deadlines', 'Missed deadlines'),
        opt('quality', 'Content not as briefed'),
        opt('no_results', 'Can’t measure results'),
        opt('paid_no_post', 'Paid, but post never went up'),
        opt('coordination', 'Too much back-and-forth'),
      ],
      other: true,
    },
    {
      id: 'payment_problems',
      kind: 'multi',
      title: 'What’s hard about paying creators?',
      hint: 'Pick all that apply',
      options: [
        opt('advance_risk', 'Risk of paying in advance'),
        opt('invoices', 'Getting proper invoices'),
        opt('gst_tds', 'GST / TDS handling'),
        opt('many_payees', 'Paying many creators at once'),
        opt('none', 'No problems so far'),
      ],
      other: true,
    },
    {
      id: 'would_help',
      kind: 'multi',
      title: 'What would help you most?',
      hint: 'Pick up to three',
      max: 3,
      options: [
        opt('verified', 'Verified creators with real stats'),
        opt('escrow', 'Pay only when the work is delivered'),
        opt('campaigns', 'Post a campaign, let creators apply'),
        opt('tracker', 'Track every collaboration in one place'),
        opt('reports', 'Results and reach reports'),
        opt('local', 'Local creator discovery'),
      ],
    },
    {
      id: 'thoughts',
      kind: 'text',
      title: 'Anything else on your mind?',
      hint: 'Your biggest headache with creator marketing, in your own words',
      placeholder: 'Type here… (optional)',
    },
  ],
};

export const OTHER_SUFFIX = '_other';
