export interface LegalSection {
  heading: string;
  body: string[];
}

export interface LegalDoc {
  slug: 'terms' | 'privacy' | 'refunds';
  title: string;
  summary: string;
  updated: string;
  sections: LegalSection[];
}

export const LEGAL_DOCS: Record<string, LegalDoc> = {
  terms: {
    slug: 'terms',
    title: 'Terms of Service',
    summary: 'The legal agreement governing your use of the Influnet platform, collaboration workflows, and payment milestones.',
    updated: 'September 2026',
    sections: [
      {
        heading: '1. Introduction & Overview',
        body: [
          'Welcome to Influnet ("Platform", "we", "our", or "us"). By creating an account, connecting social profiles, or interacting with collaboration requests on Influnet, you agree to comply with and be bound by these Terms of Service.',
          'Influnet is a specialized collaboration and deal-management platform matching verified social media creators with businesses and brands. We provide the infrastructure for discovery, brief negotiations, stage-gated collaboration workflows, and verified milestone payments.',
        ],
      },
      {
        heading: '2. Nature of Platform & Scope of Agency',
        body: [
          'Influnet acts as a technology platform connecting independent creators and brands. We are not an employer, talent agency, or advertising broker. The specific deliverables, creative briefs, revision limits, usage rights, and fee structures are negotiated directly between the creator and the brand.',
          'While we enforce bilateral consent and milestone payment gates through our platform tools, Influnet is not a direct signatory to the collaboration contract between parties, and we do not guarantee specific marketing metrics, sales conversions, or organic algorithmic reach from any campaign.',
        ],
      },
      {
        heading: '3. Eligibility, Accounts & Verification',
        body: [
          'Users must be at least 18 years of age or possess legal parental/guardian consent where permitted by applicable local laws to enter into binding agreements.',
          'You agree to provide authentic, accurate, and current information during registration. Creator account ownership is verified through an automated bio-token verification handshake. Falsifying account metrics, purchasing bot engagement, or impersonating individuals or brands is strictly prohibited and constitutes grounds for immediate account termination.',
          'You are solely responsible for maintaining the confidentiality of your credentials and all activities occurring under your account.',
        ],
      },
      {
        heading: '4. Collaboration Workflow & Stage Gating',
        body: [
          'Influnet enforces structured project milestones through our stage machine. Key stages require bilateral sign-off (both brand and creator mutual approval) before a project advances.',
          'Advance and final payment gates open exclusively upon cryptographic confirmation from our authorized payment gateway (Razorpay). Project progress cannot be manually bypassed by either counterparty without verified payment clearance.',
        ],
      },
      {
        heading: '5. Fees, Invoices & Milestone Payments',
        body: [
          'Payments for campaigns and deliverables are processed securely through certified payment partner APIs. The agreed split, advance percentages, and final balances are locked upon mutual acceptance of the collaboration terms.',
          'GST-compliant invoices and tax receipts are generated for completed commercial milestones where applicable based on the business entity information provided.',
        ],
      },
      {
        heading: '6. Content Licensing & Intellectual Property Rights',
        body: [
          'Unless expressly amended in writing within the project brief terms, creators retain underlying copyright in the original content they produce. Upon confirmation of final payment, creators grant the commissioning brand a non-exclusive, worldwide license to display and distribute the approved deliverables for the duration and media channels stipulated in the project agreement.',
          'Creators warrant that their content is original, does not infringe third-party intellectual property or privacy rights, and complies with applicable advertising standards and mandatory sponsored-content disclosure regulations (e.g. ASCI guidelines).',
        ],
      },
      {
        heading: '7. Prohibited Conduct',
        body: [
          'Users agree not to: (a) engage in fraudulent activities, harassment, hate speech, or defamatory conduct; (b) reverse engineer, scrape, or probe vulnerabilities in the Influnet infrastructure; (c) attempt to circumvent platform escrow gates or take conversations off-platform to evade agreed terms; or (d) violate any applicable local, state, national, or international laws.',
        ],
      },
      {
        heading: '8. Termination & Suspension',
        body: [
          'We reserve the right to suspend or terminate accounts that breach these Terms, misrepresent social credentials, or fail stage-machine payment commitments. You may delete your account at any time through account settings, provided all active, funded collaboration commitments have reached formal completion or mutual cancellation.',
        ],
      },
      {
        heading: '9. Limitation of Liability & Governing Law',
        body: [
          'Influnet is provided on an "as-is" and "as-available" basis without warranties of any kind. To the maximum extent permitted by applicable law, our aggregate liability for claims arising out of your use of the Platform is strictly limited to the platform service fees collected in relation to the relevant project.',
          'These Terms are governed by and construed in accordance with the laws of India. Any disputes arising hereunder shall be subject to the exclusive jurisdiction of the competent courts in India.',
        ],
      },
    ],
  },

  privacy: {
    slug: 'privacy',
    title: 'Privacy Policy',
    summary: 'How Influnet collects, stores, protects, and handles your personal and professional profile information.',
    updated: 'September 2026',
    sections: [
      {
        heading: '1. Information We Collect',
        body: [
          'Account & Identity Data: When you register, we collect your name, email address, contact telephone number (for SMS/WhatsApp OTP verification), and account role (creator or brand representative). Passwords are encrypted using irreversible salted cryptographic hashes.',
          'Public Social Media Data: When creators connect their channels (such as Instagram, YouTube, X, Facebook), we ingest only public metrics: handle names, follower tallies, public post counts, engagement averages, and public media thumbnails.',
          'Commercial & Transactional Data: We record collaboration contracts, stage sign-offs, deliverables feedback, and transaction references. Financial details (credit/debit cards, UPI VPA, net banking credentials) are processed directly by our RBI-licensed payment aggregator (Razorpay) and never stored on Influnet servers.',
          'Device & Telemetry Data: IP addresses, browser types, session timestamps, and diagnostic logs collected to ensure security, enforce rate-limits, and prevent unauthorized scraping.',
        ],
      },
      {
        heading: '2. Purpose & Legal Basis for Processing',
        body: [
          'We process your data to: (a) operate and maintain the platform marketplace; (b) facilitate instant notifications when brands send deal requests; (c) verify creator identity and prevent fraudulent accounts; (d) manage stage milestones, payment clearances, and GST invoice generation; and (e) safeguard platform infrastructure from malicious attacks.',
        ],
      },
      {
        heading: '3. Data Sharing & Third-Party Processors',
        body: [
          'Public Visibility: Creator profile metrics (handle, follower tier, niche, portfolio links, city) are displayed on your custom public influnet.io link and discovery search for prospective brand collaborations.',
          'Trusted Infrastructure Partners: We share minimal necessary data with vetted infrastructure partners: Microsoft Azure (cloud hosting & compute), Supabase (relational database & authentication), Razorpay (milestone payments & payouts), Stream (in-app messaging), and Resend (transactional notification emails).',
          'No Data Brokering: We never sell, rent, or trade your personal or contact information to third-party data brokers or advertisers.',
        ],
      },
      {
        heading: '4. Security & Data Retention',
        body: [
          'We employ enterprise-grade security controls including Row-Level Security (RLS) policies, TLS 1.3 encryption in transit, AES-256 encryption at rest, and automated audit trails.',
          'Personal account information is retained for the active lifecycle of your account. Transaction and invoice records are preserved following account deactivation in compliance with applicable statutory taxation and auditing guidelines.',
        ],
      },
      {
        heading: '5. Your Rights & Account Control',
        body: [
          'You maintain full authority over your data. Through your dashboard, you can edit profile details, revoke linked social accounts, and adjust public visibility.',
          'You may request a complete export of your personal information or request permanent account deletion via your settings or by writing to support@influnet.io.',
        ],
      },
      {
        heading: '6. Grievance Redressal Officer',
        body: [
          'In accordance with India’s Information Technology Act, 2000 and the Consumer Protection (E-Commerce) Rules, 2020, our appointed Grievance Officer can be contacted for data inquiries, regulatory notices, or privacy complaints at grievance@influnet.io. Inquiries are acknowledged within 48 hours and resolved within statutory timeframes.',
        ],
      },
    ],
  },

  refunds: {
    slug: 'refunds',
    title: 'Cancellation & Refund Policy',
    summary: 'Rules and procedures governing collaboration cancellations, escrow returns, and payment resolutions.',
    updated: 'September 2026',
    sections: [
      {
        heading: '1. Stage-Gated Milestone Framework',
        body: [
          'Influnet utilizes a milestone-gated project workflow to safeguard funds for both brands and creators. Payments for campaigns are held in stage escrow and released only upon bilateral confirmation of completed milestones.',
        ],
      },
      {
        heading: '2. Cancellation Prior to Work Commencement',
        body: [
          'Either party may mutually cancel a collaboration before formal agreement sign-off without financial penalty.',
          'If an advance payment has been funded into escrow and both parties agree to cancel prior to the creator initiating production or content drafting, the advance amount is returned to the brand’s original payment method, less any non-refundable banking/gateway processing fees.',
        ],
      },
      {
        heading: '3. Cancellation During Active Production',
        body: [
          'Once a project has moved into active production (e.g. script approval, shooting, initial drafts delivered), the advance payment compensates the creator for time and resources expended.',
          'If a dispute arises regarding deliverable quality or revised scopes, parties can submit a review request. Influnet evaluates the project history, agreed brief clauses, and draft revisions to mediate an equitable resolution or prorated adjustment.',
        ],
      },
      {
        heading: '4. Final Payment & Completion',
        body: [
          'Final milestone payments are authorized only when both the brand and creator explicitly sign off on completed deliverables. Once mutual sign-off is recorded, final milestone disbursements are non-reversible.',
        ],
      },
      {
        heading: '5. Processing & Timelines',
        body: [
          'Approved refunds are initiated within 48 hours of dispute resolution and processed back to the original source payment instrument (Card, UPI, or Net Banking) within 5 to 7 business days, depending on issuing banking institution protocols.',
        ],
      },
    ],
  },
};
