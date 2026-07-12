// The dashboard app is hosted separately; all product links point there.
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const links = {
  login: `${APP_URL}/login`,
  signup: `${APP_URL}/signup`,
  signupBusiness: `${APP_URL}/signup/business`,
  signupInfluencer: `${APP_URL}/signup/influencer`,
};
