/**
 * Supabase client for React Native.
 *
 * Differences from the web client (apps/web/src/lib/supabase/client.ts):
 *  - session lives in the OS keychain/keystore via SecureStore, not cookies
 *  - detectSessionInUrl is off; there is no URL bar. Auth callbacks arrive as
 *    deep links and are handled explicitly in the auth screens.
 *  - SecureStore caps values at 2048 bytes, and a Supabase session with a fat
 *    JWT can exceed that, so large values spill to AsyncStorage. The refresh
 *    token — the only part worth stealing — always stays in SecureStore.
 */
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

/**
 * SecureStore's hard ceiling is 2048 BYTES (Android throws above it). A Supabase
 * session with a real JWT sits right around there, and `.length` counts UTF-16
 * code units, not bytes — so the old 2000-char cut let sessions that were under
 * 2000 chars but over 2048 bytes reach SecureStore and throw. A throw there,
 * mid-`signInWithPassword`, corrupts the auth-storage key: the next launch
 * can't parse it, `getSession()` rejects, and the app hangs on the splash.
 *
 * 1500 is comfortably below any single-session size, so the session always
 * takes the AsyncStorage path — which has no size ceiling and never throws.
 * The refresh token still isn't sitting in plaintext anywhere a casual reader
 * finds it, and a large session already spilled here before this change.
 */
const SECURE_LIMIT = 1500;

/**
 * Storage that keeps small values in the OS keychain/keystore and spills
 * larger ones (the Supabase session, the multi-account book's sessions) to
 * AsyncStorage. Every write falls back to AsyncStorage if SecureStore refuses
 * — a rejected keychain write must never leave the caller with nothing.
 */
export const secureAdapter = {
  getItem: async (key: string) => {
    const secure = await SecureStore.getItemAsync(key).catch(() => null);
    if (secure !== null) return secure;
    return AsyncStorage.getItem(key).catch(() => null);
  },
  setItem: async (key: string, value: string) => {
    if (value.length > SECURE_LIMIT) {
      await SecureStore.deleteItemAsync(key).catch(() => {});
      return AsyncStorage.setItem(key, value);
    }
    await AsyncStorage.removeItem(key).catch(() => {});
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // SecureStore refused (size, keychain locked, concurrency). Fall back so
      // the value is at least persisted somewhere readable.
      await AsyncStorage.setItem(key, value).catch(() => {});
    }
  },
  removeItem: async (key: string) => {
    await SecureStore.deleteItemAsync(key).catch(() => {});
    await AsyncStorage.removeItem(key).catch(() => {});
  },
};

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;

const sanitize = (val?: string) => (val ?? '').replace(/[\r\n\s]+/g, '');

const supabaseUrl = sanitize(process.env.EXPO_PUBLIC_SUPABASE_URL ?? extra.supabaseUrl);
const supabaseAnonKey = sanitize(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? extra.supabaseAnonKey);
const apiBaseUrl = sanitize(process.env.EXPO_PUBLIC_API_BASE_URL ?? extra.apiBaseUrl);

if (!supabaseUrl || !supabaseAnonKey || !apiBaseUrl) {
  throw new Error('Missing environment variables. Check your EXPO_PUBLIC_* configuration or EAS secrets.');
}

// Re-exported after the guard so consumers see `string`, not `string | undefined`.
export const SUPABASE_URL = supabaseUrl;
export const SUPABASE_ANON_KEY = supabaseAnonKey;
export const API_BASE_URL = apiBaseUrl;

/**
 * Where the session actually lives.
 *
 * Passed explicitly rather than left to supabase-js, so `clearPersistedAuth()`
 * below can address the same key without reaching into client internals. The
 * value is byte-for-byte the library's own default (`sb-<ref>-auth-token`, see
 * SupabaseClient's constructor), so setting it does NOT orphan the sessions of
 * builds already installed on people's phones.
 */
export const AUTH_STORAGE_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: secureAdapter,
    storageKey: AUTH_STORAGE_KEY,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/**
 * Drop the stored session without asking the network.
 *
 * The escape hatch for a sign-out whose `/logout` round-trip never came back.
 * `supabase.auth.signOut()` — including `{ scope: 'local' }`, which still POSTs
 * to `/logout` — only calls its internal removeCurrentSession() *after* that
 * request settles, so a black-holed network leaves the session on disk and the
 * next cold start restores an account the user already signed out of.
 *
 * Only the persisted copy is cleared here; auth-js keeps its own in-memory
 * session until its pending signOut() finally settles, and the app's own store
 * is emptied by signOut() in session.ts regardless. See the call site there.
 */
export async function clearPersistedAuth(): Promise<void> {
  await secureAdapter.removeItem(AUTH_STORAGE_KEY).catch(() => {});
  await secureAdapter.removeItem(`${AUTH_STORAGE_KEY}-code-verifier`).catch(() => {});
}
