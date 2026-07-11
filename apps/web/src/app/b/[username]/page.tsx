import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createRSCClient } from '@/lib/supabase/server-rsc';
import { MapPin, Globe, Briefcase, Star, Users, CheckCircle } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { ButtonLink } from '@/components/ui/button';

const supabaseAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function getProfile(username: string) {
  const { data, error } = await supabaseAnon.rpc('get_public_business', {
    p_slug: username,
  });
  if (error || !data) return null;
  return data;
}

export default async function PublicBusinessProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const resolvedParams = await params;
  const username = resolvedParams.username;
  const profile = await getProfile(username);

  if (!profile) {
    notFound();
  }

  const rsc = await createRSCClient();
  const { data: { user } } = await rsc.auth.getUser();

  let ctaHref = `/signup/influencer?next=/b/${username}`;
  let ctaText = "Work with us";
  if (user) {
    if (user.id === profile.userId) {
      ctaHref = `/dashboard/settings`;
      ctaText = "Edit Profile";
    } else {
      ctaHref = `/dashboard/messages?new=${profile.userId}`;
      ctaText = "Message";
    }
  }

  return (
    <div className="min-h-screen bg-surface font-sans">
      {/* Sticky header */}
      <header className="bg-surface-card border-b border-hairline sticky top-0 z-50">
        <div className="max-w-[1000px] mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <Link href="/">
            <Image src="/influet_logo.png" alt="Influnet" width={80} height={28} className="h-7 w-auto" />
          </Link>
          <div className="flex items-center gap-4">
            {!user ? (
              <>
                <Link href="/login" className="text-sm font-bold text-content-soft hover:text-content transition-colors">
                  Log in
                </Link>
                <ButtonLink href={ctaHref} variant="brand" size="sm">
                  {ctaText}
                </ButtonLink>
              </>
            ) : (
              <Link href="/dashboard" className="text-sm font-bold text-content-soft hover:text-content transition-colors">
                Dashboard
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-[1000px] mx-auto px-4 md:px-8 py-10 md:py-16">
        <div className="flex flex-col md:flex-row gap-8 items-start">
          {/* Main content */}
          <div className="flex-1 w-full">
            {/* Hero row */}
            <div className="flex items-start gap-6 mb-8">
              {/* Logo / Avatar */}
              <div className="w-24 h-24 md:w-32 md:h-32 rounded-3xl overflow-hidden bg-gradient-to-tr from-brand to-brand-2 flex-shrink-0 shadow-lg p-1">
                <div className="w-full h-full rounded-[22px] bg-surface-card flex items-center justify-center overflow-hidden">
                  {profile.avatarUrl ? (
                    <Image src={profile.avatarUrl} alt={profile.name} width={128} height={128} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-3xl font-black text-brand">
                      {profile.name.charAt(0)}
                    </span>
                  )}
                </div>
              </div>

              {/* Name + meta */}
              <div className="flex-1 pt-2">
                <div className="flex items-center gap-3 flex-wrap mb-2">
                  <h1 className="text-3xl md:text-4xl font-black text-content tracking-tight">
                    {profile.companyName || profile.name}
                  </h1>
                  {profile.trustedPartner && (
                    <div className="flex items-center gap-1 bg-ok-soft text-ok px-2.5 py-1 rounded-full text-xs font-bold border border-ok/20">
                      <CheckCircle size={14} />
                      Verified Brand
                    </div>
                  )}
                </div>
                <p className="text-content-soft text-lg font-medium mb-4 max-w-2xl">
                  {profile.headline || profile.mission || 'We partner with amazing creators.'}
                </p>
                <div className="flex flex-wrap items-center gap-4 text-sm font-semibold text-content-muted">
                  {profile.location && (
                    <div className="flex items-center gap-1.5 bg-surface-muted px-3 py-1.5 rounded-xl border border-hairline">
                      <MapPin size={16} className="text-brand" />
                      {profile.location}
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

            {/* About */}
            <div className="bg-surface-card rounded-3xl p-6 md:p-8 border border-hairline shadow-[var(--shadow-card)] mb-8">
              <h2 className="text-xl font-black text-content mb-4 flex items-center gap-2">
                <Globe className="text-brand" size={20} />
                About Us
              </h2>
              <p className="text-content-soft leading-relaxed text-[15px] font-medium whitespace-pre-wrap">
                {profile.brandStory || profile.bio || 'No brand story provided yet.'}
              </p>
            </div>

            {/* Products / Services */}
            {(profile.products || profile.services) && (
              <div className="bg-surface-card rounded-3xl p-6 md:p-8 border border-hairline shadow-[var(--shadow-card)] mb-8">
                <h2 className="text-xl font-black text-content mb-4 flex items-center gap-2">
                  <Star className="text-brand" size={20} />
                  What We Offer
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

          {/* Sticky sidebar CTA */}
          <div className="w-full md:w-[320px] flex-shrink-0">
            <div className="bg-surface-card rounded-3xl p-6 border border-hairline shadow-[var(--shadow-card)] sticky top-24">
              <h3 className="font-black text-content text-lg mb-2">Interested?</h3>
              <p className="text-content-soft text-sm font-medium mb-6">
                Connect with this brand to discuss collaborations.
              </p>
              <ButtonLink href={ctaHref} variant="brand" className="w-full justify-center">
                {ctaText}
              </ButtonLink>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
