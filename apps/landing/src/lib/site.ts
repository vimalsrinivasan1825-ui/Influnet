// One source of truth for the app's address — see components/site/links.ts
// for why it is staging and why the /join form has its own setting.
export { APP_URL } from "@/components/site/links";
import { APP_URL } from "@/components/site/links";

export const links = {
  login: `${APP_URL}/login`,
  signup: `${APP_URL}/signup`,
  signupBusiness: `${APP_URL}/signup/business`,
  signupInfluencer: `${APP_URL}/signup/influencer`,
  earlyAccess: `${APP_URL}/early-access`,
};
