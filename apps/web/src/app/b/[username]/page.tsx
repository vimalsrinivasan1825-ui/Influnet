import { notFound, redirect } from 'next/navigation';
import { createRSCClient } from '@/lib/supabase/server-rsc';
import {
  MapPin,
  Globe,
  Briefcase,
  Star,
  Users,
  CheckCircle,
  ShieldCheck,
  Handshake,
  CalendarDays,
  Lock,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { ButtonLink } from '@/components/ui/button';

// Business profiles are PRIVATE. Unlike creator profiles they are never public:
// a business is only visible to itself and to a creator who has an established
// relationship with it (a collab request or a campaign project). Access is
// enforced in the DB by get_business_eligibility — an anonymous visitor, or a
// creator with no relationship, gets NULL and this page 404s, even if the
// business shared their link.

interface Eligibility {
  userId: string;
  name: string | null;
  location: string | null;
  memberSince: string | null;
  verificationStatus: string | null;
  companyName: string | null;
  industry: string | null;
  businessType: string | null;
  teamSize: string | null;
  website: string | null;
  city: string | null;
  state: string | null;
  mission: string | null;
  brandStory: string | null;
  products: string | null;
  services: string | null;
  trustedPartner: boolean;
  approvalStatus: string | null;
  avatarUrl: string | null;
  completedCollaborations: number;
  totalPartners: number;
}

function formatMonthYear(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export default async function PrivateBusinessProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;

  const rsc = await createRSCClient();
  const {
    data: { user },
  } = await rsc.auth.getUser();

  // Anonymous visitors can never see a business profile — send them to sign in.
  if (!user) {
    redirect(`/login?next=/b/${username}`);
  }

  // Cast: this RPC is newer than the generated Supabase types.
  const { data, error } = await (rsc.rpc as any)('get_business_eligibility', {
    p_slug: username,
    p_viewer_user_id: user.id,
  });

  // No relationship (or no such business) → 404. A shared link is worthless.
  if (error || !data) {
    notFound();
  }

  const profile = data as Eligibility;
  const isOwner = user.id === profile.userId;
  const displayName = profile.companyName || profile.name || 'Business';
  const location =
    profile.location || [profile.city, profile.state].filter(Boolean).join(', ') || null;
  const isVerified =
    profile.trustedPartner || profile.verificationStatus === 'verified';
  const memberSince = formatMonthYear(profile.memberSince);

  const stats = [
    { icon: Handshake, label: 'Completed collabs', value: String(profile.completedCollaborations) },
    { icon: Users, label: 'Creators partnered', value: String(profile.totalPartners) },
    memberSince ? { icon: CalendarDays, label: 'On Influnet since', value: memberSince } : null,
    {
      icon: ShieldCheck,
      label: 'Verification',
      value: isVerified ? 'Verified' : profile.approvalStatus === 'approved' ? 'Approved' : 'Unverified',
    },
  ].filter(Boolean) as { icon: typeof Handshake; label: string; value: string }[];

  return (
    <div className="min-h-screen bg-surface font-sans">
      <header className="bg-surface-card border-b border-hairline sticky top-0 z-50">
        <div className="max-w-[1000px] mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <Link href="/dashboard">
            <Image src="/influet_logo.png" alt="Influnet" width={80} height={28} className="h-7 w-auto" />
          </Link>
          <Link href="/dashboard" className="text-sm font-bold text-content-soft hover:text-content transition-colors">
            Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-[1000px] mx-auto px-4 md:px-8 py-8 md:py-12">
        {/* Private-view notice */}
        {!isOwner && (
          <div className="mb-6 flex items-start gap-2.5 rounded-2xl border border-brand/20 bg-brand-soft px-4 py-3 text-sm font-medium text-content-soft">
            <Lock size={16} className="mt-0.5 shrink-0 text-brand" />
            <span>
              This brand profile is private. You can see it because you have an active request or
              project with them — it is not visible to anyone else.
            </span>
          </div>
        )}

        <div className="flex flex-col md:flex-row gap-8 items-start">
          <div className="flex-1 w-full">
            {/* Hero */}
            <div className="flex items-start gap-6 mb-8">
              <div className="w-24 h-24 md:w-32 md:h-32 rounded-3xl overflow-hidden bg-gradient-to-tr from-brand to-brand-2 flex-shrink-0 shadow-lg p-1">
                <div className="w-full h-full rounded-[22px] bg-surface-card flex items-center justify-center overflow-hidden">
                  {profile.avatarUrl ? (
                    <Image src={profile.avatarUrl} alt={displayName} width={128} height={128} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-3xl font-black text-brand">{displayName.charAt(0)}</span>
                  )}
                </div>
              </div>

              <div className="flex-1 pt-2">
                <div className="flex items-center gap-3 flex-wrap mb-2">
                  <h1 className="text-3xl md:text-4xl font-black text-content tracking-tight">{displayName}</h1>
                  {isVerified && (
                    <div className="flex items-center gap-1 bg-ok-soft text-ok px-2.5 py-1 rounded-full text-xs font-bold border border-ok/20">
                      <CheckCircle size={14} />
                      Verified Brand
                    </div>
                  )}
                </div>
                <p className="text-content-soft text-lg font-medium mb-4 max-w-2xl">
                  {profile.mission || 'This brand partners with creators on Influnet.'}
                </p>
                <div className="flex flex-wrap items-center gap-4 text-sm font-semibold text-content-muted">
                  {location && (
                    <div className="flex items-center gap-1.5 bg-surface-muted px-3 py-1.5 rounded-xl border border-hairline">
                      <MapPin size={16} className="text-brand" />
                      {location}
                    </div>
                  )}
                  {profile.industry && (
                    <div className="flex items-center gap-1.5 bg-surface-muted px-3 py-1.5 rounded-xl border border-hairline">
                      <Briefcase size={16} className="text-brand" />
                      {profile.industry}
                    </div>
                  )}
                  {profile.teamSize && (
                    <div className="flex items-center gap-1.5 bg-surface-muted px-3 py-1.5 rounded-xl border border-hairline">
                      <Users size={16} className="text-brand" />
                      {profile.teamSize} Team Size
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Eligibility stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              {stats.map((s) => (
                <div key={s.label} className="bg-surface-card rounded-2xl p-4 border border-hairline shadow-[var(--shadow-card)]">
                  <s.icon size={18} className="text-brand mb-2" />
                  <div className="text-xl font-black text-content leading-tight">{s.value}</div>
                  <div className="text-xs font-semibold text-content-muted mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>

            {/* About */}
            <div className="bg-surface-card rounded-3xl p-6 md:p-8 border border-hairline shadow-[var(--shadow-card)] mb-8">
              <h2 className="text-xl font-black text-content mb-4 flex items-center gap-2">
                <Globe className="text-brand" size={20} />
                About the brand
              </h2>
              <p className="text-content-soft leading-relaxed text-[15px] font-medium whitespace-pre-wrap">
                {profile.brandStory || 'No brand story provided yet.'}
              </p>
              {profile.website && (
                <a
                  href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-brand hover:underline"
                >
                  <Globe size={15} /> {profile.website.replace(/^https?:\/\//, '')}
                </a>
              )}
            </div>

            {/* Products / Services */}
            {(profile.products || profile.services) && (
              <div className="bg-surface-card rounded-3xl p-6 md:p-8 border border-hairline shadow-[var(--shadow-card)] mb-8">
                <h2 className="text-xl font-black text-content mb-4 flex items-center gap-2">
                  <Star className="text-brand" size={20} />
                  What they offer
                </h2>
                {profile.products && (
                  <div className="mb-4">
                    <strong className="text-content block mb-1">Products</strong>
                    <p className="text-content-soft leading-relaxed text-[15px] font-medium whitespace-pre-wrap">
                      {profile.products}
                    </p>
                  </div>
                )}
                {profile.services && (
                  <div>
                    <strong className="text-content block mb-1">Services</strong>
                    <p className="text-content-soft leading-relaxed text-[15px] font-medium whitespace-pre-wrap">
                      {profile.services}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="w-full md:w-[320px] flex-shrink-0">
            <div className="bg-surface-card rounded-3xl p-6 border border-hairline shadow-[var(--shadow-card)] sticky top-24">
              {isOwner ? (
                <>
                  <h3 className="font-black text-content text-lg mb-2">Your brand profile</h3>
                  <p className="text-content-soft text-sm font-medium mb-6">
                    This is how creators you work with see your brand.
                  </p>
                  <ButtonLink href="/dashboard/settings" variant="brand" className="w-full justify-center">
                    Edit profile
                  </ButtonLink>
                </>
              ) : (
                <>
                  <h3 className="font-black text-content text-lg mb-2">Working together?</h3>
                  <p className="text-content-soft text-sm font-medium mb-6">
                    Message this brand to discuss the collaboration.
                  </p>
                  <ButtonLink href={`/dashboard/messages?new=${profile.userId}`} variant="brand" className="w-full justify-center">
                    Message
                  </ButtonLink>
                </>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
