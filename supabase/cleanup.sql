-- Supabase SQL Cleanup Helper
-- Run these queries in your Supabase SQL Editor (https://supabase.com/dashboard/project/hrpaqufvjcihnjrjnpej/sql)
-- to view and delete duplicate test records.

-- ============================================================================
-- 1. VIEW RECORDS
-- ============================================================================

-- View all collaboration requests and check for duplicate rows
SELECT 
  cr.id, 
  p_from.name AS sender_name, 
  p_to.name AS receiver_name, 
  cr.message, 
  cr.budget, 
  cr.status, 
  cr.created_at 
FROM public.collab_requests cr
LEFT JOIN public.profiles p_from ON cr.from_user_id = p_from.id
LEFT JOIN public.profiles p_to ON cr.to_user_id = p_to.id
ORDER BY cr.created_at DESC;

-- View all active campaign projects
SELECT 
  cp.id, 
  p_owner.name AS owner_name, 
  p_counter.name AS counterparty_name, 
  cp.title, 
  cp.budget, 
  cp.status, 
  cp.current_stage, 
  cp.created_at
FROM public.campaign_projects cp
LEFT JOIN public.profiles p_owner ON cp.owner_user_id = p_owner.id
LEFT JOIN public.profiles p_counter ON cp.counterparty_user_id = p_counter.id
ORDER BY cp.created_at DESC;


-- ============================================================================
-- 2. DELETE SPECIFIC DUPLICATES (UNCOMMENT & EXECUTE WITH ACTUAL IDs)
-- ============================================================================

-- To delete specific collaboration requests by their UUID:
-- DELETE FROM public.collab_requests WHERE id = 'YOUR_COLLAB_UUID_HERE';

-- To delete duplicate campaign projects by their ID:
-- DELETE FROM public.campaign_projects WHERE id = YOUR_PROJECT_ID_HERE;
