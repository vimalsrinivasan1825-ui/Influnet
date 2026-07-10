import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createRSCClient } from '@/lib/supabase/server-rsc';
import { MapPin, Globe, Briefcase, Star, Users, CheckCircle } from 'lucide-react';
import Link from 'next/link';

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
    <div className="min-h-screen bg-[#fafafb] font-sans">
      <header className="bg-white border-b border-[#e2e8f0] sticky top-0 z-50">
        <div className="max-w-[1000px] mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <Link href="/">
            <img src="/influet_logo.png" alt="Influnet" className="h-7 w-auto" />
          </Link>
          <div className="flex items-center gap-4">
            {!user ? (
              <>
                <Link href="/login" className="text-sm font-bold text-[#475569] hover:text-[#0f172a] transition-colors">
                  Log in
                </Link>
                <Link href={ctaHref} className="text-sm font-bold bg-[#ee3e96] text-white px-5 py-2.5 rounded-full hover:bg-[#d12d81] transition-colors shadow-sm">
                  {ctaText}
                </Link>
              </>
            ) : (
              <Link href="/dashboard" className="text-sm font-bold text-[#475569] hover:text-[#0f172a] transition-colors">
                Dashboard
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-[1000px] mx-auto px-4 md:px-8 py-10 md:py-16">
        <div className="flex flex-col md:flex-row gap-8 items-start">
          <div className="flex-1 w-full">
            <div className="flex items-start gap-6 mb-8">
              <div className="w-24 h-24 md:w-32 md:h-32 rounded-3xl overflow-hidden bg-gradient-to-tr from-[#ee3e96] to-[#a855f7] flex-shrink-0 shadow-lg p-1">
                <div className="w-full h-full rounded-[22px] bg-white flex items-center justify-center overflow-hidden">
                  {profile.avatarUrl ? (
                    <img src={profile.avatarUrl} alt={profile.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-br from-[#ee3e96] to-[#a855f7]">
                      {profile.name.charAt(0)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex-1 pt-2">
                <div className="flex items-center gap-3 flex-wrap mb-2">
                  <h1 className="text-3xl md:text-4xl font-black text-[#0f172a] tracking-tight">
                    {profile.companyName || profile.name}
                  </h1>
                  {profile.trustedPartner && (
                    <div className="flex items-center gap-1 bg-[#f0fdf4] text-[#15803d] px-2.5 py-1 rounded-full text-xs font-bold border border-[#bbf7d0]">
                      <CheckCircle size={14} />
                      Verified Brand
                    </div>
                  )}
                </div>
                <p className="text-[#475569] text-lg font-medium mb-4 max-w-2xl">
                  {profile.headline || profile.mission || 'We partner with amazing creators.'}
                </p>
                <div className="flex flex-wrap items-center gap-4 text-sm font-semibold text-[#64748b]">
                  {profile.location && (
                    <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-xl border border-[#e2e8f0] shadow-sm">
                      <MapPin size={16} className="text-[#ee3e96]" />
                      {profile.location}
                    </div>
                  )}
                  {profile.industry && (
                    <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-xl border border-[#e2e8f0] shadow-sm">
                      <Briefcase size={16} className="text-[#ee3e96]" />
                      {profile.industry}
                    </div>
                  )}
                  {profile.teamSize && (
                    <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-xl border border-[#e2e8f0] shadow-sm">
                      <Users size={16} className="text-[#ee3e96]" />
                      {profile.teamSize} Team Size
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-3xl p-6 md:p-8 border border-[#e2e8f0] shadow-sm mb-8">
              <h2 className="text-xl font-black text-[#0f172a] mb-4 flex items-center gap-2">
                <Globe className="text-[#ee3e96]" size={20} />
                About Us
              </h2>
              <div className="prose prose-slate max-w-none">
                <p className="text-[#475569] leading-relaxed text-[15px] font-medium whitespace-pre-wrap">
                  {profile.brandStory || profile.bio || 'No brand story provided yet.'}
                </p>
              </div>
            </div>
            
            {(profile.products || profile.services) && (
              <div className="bg-white rounded-3xl p-6 md:p-8 border border-[#e2e8f0] shadow-sm mb-8">
                <h2 className="text-xl font-black text-[#0f172a] mb-4 flex items-center gap-2">
                  <Star className="text-[#ee3e96]" size={20} />
                  What We Offer
                </h2>
                <div className="prose prose-slate max-w-none">
                  {profile.products && (
                    <div className="mb-4">
                      <strong className="text-[#0f172a] block mb-1">Products</strong>
                      <p className="text-[#475569] leading-relaxed text-[15px] font-medium whitespace-pre-wrap">
                        {profile.products}
                      </p>
                    </div>
                  )}
                  {profile.services && (
                    <div>
                      <strong className="text-[#0f172a] block mb-1">Services</strong>
                      <p className="text-[#475569] leading-relaxed text-[15px] font-medium whitespace-pre-wrap">
                        {profile.services}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          
          <div className="w-full md:w-[320px] flex-shrink-0">
            <div className="bg-white rounded-3xl p-6 border border-[#e2e8f0] shadow-sm sticky top-24">
              <h3 className="font-black text-[#0f172a] text-lg mb-2">Interested?</h3>
              <p className="text-[#64748b] text-sm font-medium mb-6">
                Connect with this brand to discuss collaborations.
              </p>
              <Link href={ctaHref} className="w-full block text-center bg-gradient-to-r from-[#ee3e96] to-[#a855f7] text-white font-bold py-3.5 rounded-2xl hover:opacity-90 transition-opacity shadow-md">
                {ctaText}
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
