/**
 * Copy into influnet.io React app (e.g. client/src/lib/supabase.ts).
 * Matches existing UI payloads for business_owner + influencer signup.
 */
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (publishable key)"
  );
}

export const supabase = createClient(url, publishableKey);

export type UserRole = "business_owner" | "influencer";

export type BusinessRegisterPayload = {
  email: string;
  password: string;
  name?: string;
  phone?: string;
  role: "business_owner";
  companyName?: string;
  industry?: string;
  gstNumber?: string;
  website?: string;
  location?: string;
  collabPreferences?: unknown;
};

export type InfluencerRegisterPayload = {
  email: string;
  password: string;
  name?: string;
  phone?: string;
  role: "influencer";
  bio?: string;
  location?: string;
  niche?: string[];
  instagramHandle?: string;
  youtubeHandle?: string;
  twitterHandle?: string;
};

/** Drop-in replacement shape for existing UI: { user, token } */
export async function login(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const token = data.session?.access_token;
  const profile = await getMe(data.user!.id);
  return { user: profile, token };
}

export async function registerBusiness(payload: BusinessRegisterPayload) {
  return register(payload);
}

export async function registerInfluencer(payload: InfluencerRegisterPayload) {
  return register(payload);
}

async function register(
  payload: BusinessRegisterPayload | InfluencerRegisterPayload
) {
  const { email, password, ...profilePayload } = payload;
  const { data: authData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
  });
  if (signUpError) throw signUpError;
  const userId = authData.user?.id;
  if (!userId) throw new Error("Sign up failed");

  const { error: rpcError } = await supabase.rpc("register_profile", {
    payload: { email, ...profilePayload },
  });
  if (rpcError) throw rpcError;

  const session = authData.session;
  const token = session?.access_token ?? "";
  const user = await getMe(userId);
  return { user, token };
}

export async function logout() {
  await supabase.auth.signOut();
}

export async function getMe(userId?: string) {
  const id =
    userId ?? (await supabase.auth.getUser()).data.user?.id;
  if (!id) return null;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*, business_profiles(*), influencer_profiles(*)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return profile;
}

/** Optional: keep compatibility with influnet_token in localStorage */
export function persistSession(token: string, user: unknown) {
  localStorage.setItem("influnet_token", token);
  localStorage.setItem("influnet_user", JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem("influnet_token");
  localStorage.removeItem("influnet_user");
}
