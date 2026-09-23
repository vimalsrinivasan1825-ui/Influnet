import { redirect } from 'next/navigation';
import { createRSCClient } from '@/lib/supabase/server-rsc';

/**
 * /dashboard/profile/design — "customize your public profile".
 *
 * A stable link for notifications and broadcasts: the app maps it to its own
 * editor screen (apps/mobile/lib/notification-link.ts), and on the web it lands
 * the creator on their real page with the Customize panel already open.
 */
export default async function ProfileDesignPage() {
  const rsc = await createRSCClient();
  const {
    data: { user },
  } = await rsc.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/profile/design');

  const { data } = await rsc.from('influencer_profiles').select('username').eq('user_id', user.id).maybeSingle();
  const username = (data as { username?: string } | null)?.username;
  if (!username) redirect('/dashboard/profile');

  redirect(`/${encodeURIComponent(username)}?customize=1`);
}
