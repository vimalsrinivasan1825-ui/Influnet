export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://dev.influnet.io";

export const links = {
  login: `${APP_URL}/login`,
  signup: `${APP_URL}/signup`,
  signupBusiness: `${APP_URL}/signup/business`,
  signupInfluencer: `${APP_URL}/signup/influencer`,
  earlyAccess: `${APP_URL}/early-access`,
};
