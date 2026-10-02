/**
 * How a profile viewer is described when they are not named — the LinkedIn
 * way: "A brand in Food & Beverage from Bengaluru", "A Fashion creator from
 * Chennai". Built from the viewer's own public profile, never their IP.
 *
 * Migration 194's profile_viewer_descriptor() writes the same wording into the
 * notification; keep the two in step.
 */
export interface ViewerFacts {
  role: 'business_owner' | 'influencer' | null;
  /** Brand: industry. Creator: first niche. */
  category: string | null;
  city: string | null;
}

export function describeViewer(facts: ViewerFacts | undefined): string {
  const category = facts?.category?.trim() || null;
  const city = facts?.city?.trim() || null;
  const from = city ? ` from ${city}` : '';
  if (facts?.role === 'business_owner') return `A brand${category ? ` in ${category}` : ''}${from}`;
  if (facts?.role === 'influencer') return `A ${category ? `${category} ` : ''}creator${from}`;
  return `Someone${from}`;
}
