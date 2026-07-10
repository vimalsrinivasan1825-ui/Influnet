import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createRSCClient } from '@/lib/supabase/server-rsc';
import {
  MapPin,
  CheckCircle,
  MessageSquare,
  Globe,
  Briefcase,
  Star,
  Users
} from 'lucide-react';

const InstagramIcon = ({ size = 16, className = "" }: { size?: number, className?: string }) => (
  <svg xmlns="http://www.svg.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>
);

const YoutubeIcon = ({ size = 16, className = "" }: { size?: number, className?: string }) => (
  <svg xmlns="http://www.svg.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M2.5 7.1C2.5 7.1 2.3 5.4 3 4.6 3.8 3.7 4.8 3.7 5.2 3.6 8.5 3.4 12 3.4 12 3.4s3.5 0 6.8.2c.4.1 1.4.1 2.2 1 .7.8 1 2.5 1 2.5s.2 2 .2 4.1v1.5c0 2.1-.2 4.1-.2 4.1s-.2 1.7-1 2.5c-.8.9-1.9.8-2.4.9-3.6.3-7.2.2-7.2.2s-3.5 0-6.8-.2c-.4-.1-1.4-.1-2.2-1-.7-.8-1-2.5-1-2.5s-.2-2-.2-4.1V11.2c0-2.1.2-4.1.2-4.1z"/><polygon points="9.5 15.5 16 12 9.5 8.5 9.5 15.5"/></svg>
);

const TwitterIcon = ({ size = 16, className = "" }: { size?: number, className?: string }) => (
  <svg xmlns="http://www.svg.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"/></svg>
);
import Link from 'next/link';
import { Metadata } from 'next';

// Use anon client for fetching public profile
const supabaseAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function getProfile(username: string) {
  const { data, error } = await supabaseAnon.rpc('get_public_influencer', {
    p_slug: username,
  });
  if (error || !data) return null;
  return data;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const resolvedParams = await params;
  const profile = await getProfile(resolvedParams.username);

  if (!profile) {
    return {
      title: 'Profile Not Found | Influnet',
    };
  }

  return {
    title: `${profile.name} (@${profile.username}) | Influnet`,
    description: profile.headline || profile.bio || `Check out ${profile.name}'s creator profile on Influnet.`,
    openGraph: {
      title: `${profile.name} (@${profile.username}) | Influnet`,
      description: profile.headline || profile.bio || `Check out ${profile.name}'s creator profile on Influnet.`,
      images: profile.avatarUrl ? [profile.avatarUrl] : [],
    },
  };
}

export default async function PublicProfilePage({
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

  // Get viewer user if any
  const rsc = createRSCClient();
  const { data: { user } } = await rsc.auth.getUser();
  const { data: viewerProfile } = user 
    ? await rsc.from('profiles').select('role').eq('id', user.id).single()
    : { data: null };

  // Record view (fire and forget)
  supabaseAnon.rpc('record_profile_view', {
    p_influencer_user_id: profile.userId,
    p_viewer_user_id: user?.id || null,
  }).then(() => {}, () => {});

  // Determine CTA
  let ctaHref = `/signup/business?next=/c/${username}`;
  let ctaText = "Request Collaboration";
  if (user) {
    if (user.id === profile.userId) {
      ctaHref = `/dashboard/settings`;
      ctaText = "Edit Profile";
    } else if (viewerProfile?.role === 'business_owner') {
      ctaHref = `/dashboard/discover?request=${profile.userId}`;
    } else {
      // Logged in as influencer, but viewing another influencer
      ctaHref = `/dashboard`;
      ctaText = "Back to Dashboard";
    }
  }

  const formatFollowers = (num: number) => {
    if (!num) return '0';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  return (
    <div className="min-h-screen bg-[#fafafb] font-sans pb-20">
      {/* Cover Image */}
      <div 
        className="w-full h-48 md:h-64 lg:h-80 bg-slate-200 relative"
        style={{
          backgroundImage: profile.coverImageUrl ? `url(${profile.coverImageUrl})` : 'linear-gradient(to right, #fdf2f8, #f8fafc)',
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      ></div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 -mt-16 sm:-mt-24 relative z-10">
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 sm:p-8 flex flex-col md:flex-row gap-6 md:gap-8">
          
          {/* Avatar */}
          <div className="flex-shrink-0">
            <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-full border-4 border-white shadow-md bg-slate-100 overflow-hidden flex items-center justify-center text-4xl font-black text-slate-400">
              {profile.avatarUrl ? (
                <img src={profile.avatarUrl} alt={profile.name} className="w-full h-full object-cover" />
              ) : (
                profile.name?.charAt(0).toUpperCase()
              )}
            </div>
          </div>

          {/* Core Info */}
          <div className="flex-grow pt-2">
            <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-black text-slate-900 flex items-center gap-2">
                  {profile.name}
                  {profile.isVerified && <CheckCircle size={20} className="text-[#ee3e96]" />}
                </h1>
                <p className="text-slate-500 font-semibold mb-2">@{profile.username}</p>
                {profile.headline && <p className="text-slate-700 text-sm sm:text-base font-medium max-w-xl">{profile.headline}</p>}
                
                <div className="flex flex-wrap items-center gap-3 mt-3 text-xs font-semibold text-slate-500">
                  {(profile.location || profile.city) && (
                    <span className="flex items-center gap-1">
                      <MapPin size={14} /> {profile.city ? `${profile.city}, ${profile.state || ''}` : profile.location}
                    </span>
                  )}
                  {profile.languages?.length > 0 && (
                    <span className="flex items-center gap-1">
                      <Globe size={14} /> {profile.languages.slice(0,2).join(', ')}
                    </span>
                  )}
                </div>
              </div>

              {/* CTA */}
              <div className="flex-shrink-0">
                <Link 
                  href={ctaHref}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#ee3e96] hover:bg-[#db2777] text-white font-bold rounded-xl transition-all shadow-sm shadow-pink-200"
                >
                  {ctaText}
                </Link>
              </div>
            </div>

            {/* Stats row */}
            <div className="flex flex-wrap gap-4 sm:gap-8 mt-6 pt-6 border-t border-slate-100">
              {profile.instagramFollowers > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-pink-50 text-pink-600 flex items-center justify-center">
                    <InstagramIcon size={16} />
                  </div>
                  <div>
                    <div className="text-sm font-black text-slate-900">{formatFollowers(profile.instagramFollowers)}</div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Instagram</div>
                  </div>
                </div>
              )}
              {profile.youtubeSubscribers > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-red-50 text-red-600 flex items-center justify-center">
                    <YoutubeIcon size={16} />
                  </div>
                  <div>
                    <div className="text-sm font-black text-slate-900">{formatFollowers(profile.youtubeSubscribers)}</div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">YouTube</div>
                  </div>
                </div>
              )}
              {profile.tiktokFollowers > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-900 flex items-center justify-center">
                    {/* SVG fallback for TikTok */}
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5"/></svg>
                  </div>
                  <div>
                    <div className="text-sm font-black text-slate-900">{formatFollowers(profile.tiktokFollowers)}</div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">TikTok</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Content Layout */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
          {/* Main Column */}
          <div className="md:col-span-2 space-y-6">
            
            {/* About */}
            {profile.bio && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                <h2 className="text-sm font-black uppercase tracking-wider text-slate-400 mb-4">About</h2>
                <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap font-medium">
                  {profile.bio}
                </div>
              </div>
            )}

            {/* Niches / Categories */}
            {profile.niche && profile.niche.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                <h2 className="text-sm font-black uppercase tracking-wider text-slate-400 mb-4">Content Categories</h2>
                <div className="flex flex-wrap gap-2">
                  {profile.niche.map((n: string, i: number) => (
                    <span key={i} className="px-3 py-1.5 bg-slate-50 border border-slate-100 text-slate-700 text-xs font-bold rounded-lg">
                      {n}
                    </span>
                  ))}
                </div>
              </div>
            )}

          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            
            {/* Quick Info */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
              <h2 className="text-sm font-black uppercase tracking-wider text-slate-400 mb-4">Quick Info</h2>
              
              <div className="space-y-4">
                {profile.availabilityStatus && (
                  <div>
                    <div className="text-xs font-semibold text-slate-400 mb-1">Availability</div>
                    <div className="flex items-center gap-2 text-sm font-bold text-emerald-600">
                      <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                      {profile.availabilityStatus.replace('_', ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
                    </div>
                  </div>
                )}
                
                {profile.priceRange && (
                  <div>
                    <div className="text-xs font-semibold text-slate-400 mb-1">Starting Price</div>
                    <div className="text-sm font-bold text-slate-900">{profile.priceRange}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Social Links */}
            {(profile.instagramHandle || profile.youtubeHandle || profile.twitterHandle || profile.facebookHandle || profile.linkedinHandle || profile.tiktokHandle) && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                <h2 className="text-sm font-black uppercase tracking-wider text-slate-400 mb-4">Social Links</h2>
                <div className="space-y-3">
                  {profile.instagramHandle && (
                    <a href={`https://instagram.com/${profile.instagramHandle.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-sm font-semibold text-slate-700 hover:text-[#ee3e96]">
                      <InstagramIcon size={16} className="text-pink-600" /> @{profile.instagramHandle.replace('@', '')}
                    </a>
                  )}
                  {profile.youtubeHandle && (
                    <a href={`https://youtube.com/${profile.youtubeHandle.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-sm font-semibold text-slate-700 hover:text-red-600">
                      <YoutubeIcon size={16} className="text-red-600" /> @{profile.youtubeHandle.replace('@', '')}
                    </a>
                  )}
                  {profile.twitterHandle && (
                    <a href={`https://twitter.com/${profile.twitterHandle.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-sm font-semibold text-slate-700 hover:text-blue-500">
                      <TwitterIcon size={16} className="text-blue-500" /> @{profile.twitterHandle.replace('@', '')}
                    </a>
                  )}
                  {profile.tiktokHandle && (
                    <a href={`https://tiktok.com/@${profile.tiktokHandle.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-sm font-semibold text-slate-700 hover:text-slate-900">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5"/></svg> @{profile.tiktokHandle.replace('@', '')}
                    </a>
                  )}
                </div>
              </div>
            )}
            
          </div>
        </div>
      </div>
    </div>
  );
}
