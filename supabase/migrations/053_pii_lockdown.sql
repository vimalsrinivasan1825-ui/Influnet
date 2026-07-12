-- Migration 053: PII Lockdown
-- Remove the overly broad SELECT policy on public.profiles that exposes email and phone.
-- The existing get_public_influencer RPC is already SECURITY DEFINER and handles safe public profile fields.

-- Drop the overly permissive SELECT policy for the anon role on influencer profiles
DROP POLICY IF EXISTS "influencer_profiles_select_public" ON public.profiles;

-- The other policies like `*_select_authenticated` already exist but let's review them if needed.
-- But wait, the audit explicitly asked to lock down the anon key read on public.profiles where role='influencer'.
-- Dropping this policy ensures that `select email, phone from profiles where role='influencer'` returns empty for anon.
