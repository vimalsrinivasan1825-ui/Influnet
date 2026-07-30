import { redirect } from "next/navigation";

/**
 * Retired route. The creator's analytics Dashboard used to live here while the
 * business one lived at /dashboard — the same view on two different URLs, one
 * of them named after the legacy "influencer" role term. /dashboard now renders
 * both roles in place.
 *
 * Kept as a permanent redirect because this URL is in users' history and
 * bookmarks, and was the post-signup/post-login landing page for creators.
 */
export default function LegacyInfluencerDashboardPage() {
  redirect("/dashboard");
}
