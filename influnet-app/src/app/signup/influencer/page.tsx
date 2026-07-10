'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { motion } from 'framer-motion';

const NICHES = [
  'Fashion & Beauty',
  'Tech & Gadgets',
  'Food & Cooking',
  'Travel',
  'Fitness & Health',
  'Gaming',
  'Finance',
  'Lifestyle',
  'Education',
  'Entertainment',
  'Sports',
  'Parenting',
  'Home Decor',
  'Art & Design',
  'Music',
  'Comedy',
  'Business',
  'Environment',
];

const LANGUAGES = [
  'English',
  'Hindi',
  'Tamil',
  'Telugu',
  'Kannada',
  'Malayalam',
  'Marathi',
  'Bengali',
  'Gujarati',
  'Punjabi',
];

const COLLAB_TYPES = ['Reel', 'Story', 'Post', 'YouTube Video', 'Event Appearance'];

const PRICE_TIERS = [
  { value: 'entry', label: 'Entry', range: '₹1K – ₹5K' },
  { value: 'standard', label: 'Standard', range: '₹5K – ₹10K' },
  { value: 'premium', label: 'Premium', range: '₹10K – ₹25K' },
  { value: 'pro', label: 'Pro', range: '₹25K+' },
];

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Chandigarh', 'Puducherry',
];

type Step = 1 | 2 | 3 | 4;

export default function InfluencerSignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [gender, setGender] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [languages, setLanguages] = useState<string[]>([]);
  const [primaryNiche, setPrimaryNiche] = useState('');
  const [secondaryNiches, setSecondaryNiches] = useState<string[]>([]);
  const [bio, setBio] = useState('');
  const [instagramHandle, setInstagramHandle] = useState('');
  const [youtubeHandle, setYoutubeHandle] = useState('');
  const [twitterHandle, setTwitterHandle] = useState('');
  const [collabTypes, setCollabTypes] = useState<string[]>([]);
  const [priceRange, setPriceRange] = useState('');

  const toggleArrayItem = <T,>(arr: T[], item: T): T[] =>
    arr.includes(item) ? arr.filter((i) => i !== item) : [...arr, item];

  const canProceed = (): boolean => {
    if (step === 1) return !!firstName && !!lastName && !!username && !!email && !!password;
    if (step === 2) return !!gender && !!city && !!state && languages.length > 0;
    if (step === 3) return !!primaryNiche && !!bio && (!!instagramHandle || !!youtubeHandle || !!twitterHandle);
    if (step === 4) return collabTypes.length > 0 && !!priceRange;
    return false;
  };

  const handleSubmit = async () => {
    setError('');
    setIsLoading(true);

    try {
      const sb = createClient();
      
      const payload = {
        name: `${firstName} ${lastName}`,
        role: 'influencer',
        username,
        email,
        phone,
        gender,
        city,
        state,
        languages,
        niche: [primaryNiche, ...secondaryNiches],
        bio,
        instagramHandle,
        youtubeHandle,
        twitterHandle,
        collabTypes,
        priceRange,
      };

      const { data, error: authError } = await sb.auth.signUp({
        email,
        password,
        options: {
          data: payload,
        },
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      if (data.session) {
        // Register the profile in the database
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${data.session.access_token}`,
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const resData = await res.json();
          setError(resData.error || 'Failed to create profile record');
          return;
        }

        localStorage.setItem('influnet_token', data.session.access_token);
        localStorage.setItem('influnet_refresh_token', data.session.refresh_token);
        router.push('/dashboard/influencer');
      } else {
        router.push('/login?message=Check your email to confirm your account');
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fafafb] flex items-center justify-center px-4 py-16 relative overflow-hidden font-sans">
      {/* Ambient Glows */}
      <div className="absolute inset-0 pointer-events-none select-none">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-pink-100/30 blur-[130px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-purple-100/30 blur-[130px]" />
      </div>

      <div className="relative z-10 w-full max-w-[500px]">
        {/* Header Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2.5 mb-6 group">
            <img
              src="/influet_logo.png"
              alt="influnet"
              className="h-10 w-auto flex-shrink-0 transition-transform group-hover:scale-105"
            />
            <span className="text-2xl font-black text-gray-900 tracking-tight">influnet</span>
          </Link>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight mb-2">Create your account</h1>
          <p className="text-gray-400 font-semibold">Join as a Creator</p>
        </div>

        {/* Step Progression Bar */}
        <div className="mb-8 px-4">
          <div className="flex items-center justify-between mb-3">
            {[1, 2, 3, 4].map((s) => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-black transition-all ${
                    s <= step
                      ? 'bg-pink-500 text-white shadow-lg shadow-pink-500/15'
                      : 'bg-gray-100 text-gray-400 border border-gray-200'
                  }`}
                >
                  {s}
                </div>
                {s < 4 && (
                  <div
                    className={`w-10 sm:w-16 h-0.5 rounded-full transition-all ${
                      s < step ? 'bg-pink-500' : 'bg-gray-200'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[11px] font-black uppercase tracking-wider text-gray-400">
            <span>Account</span>
            <span>Profile</span>
            <span>Creator</span>
            <span>Collab</span>
          </div>
        </div>

        {/* Premium Form Card */}
        <div className="p-10 rounded-[2.5rem] bg-white border border-gray-150 shadow-[0_20px_50px_rgba(0,0,0,0.018)]">
          {error && (
            <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-100 text-sm font-semibold text-red-600">
              {error}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <h2 className="text-xl font-black text-gray-900 mb-4 border-b border-gray-100 pb-2">Account Details</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-gray-400 mb-1.5">First Name</label>
                  <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" className="w-full bg-gray-50/50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:bg-white focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 rounded-2xl px-4 py-3 h-13 transition-all outline-none font-semibold text-base" />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-gray-400 mb-1.5">Last Name</label>
                  <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" className="w-full bg-gray-50/50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:bg-white focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 rounded-2xl px-4 py-3 h-13 transition-all outline-none font-semibold text-base" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-gray-400 mb-1.5">Username</label>
                <input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} placeholder="Choose username" className="w-full bg-gray-50/50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:bg-white focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 rounded-2xl px-4 py-3 h-13 transition-all outline-none font-semibold text-base" />
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-gray-400 mb-1.5">Email Address</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="w-full bg-gray-50/50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:bg-white focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 rounded-2xl px-4 py-3 h-13 transition-all outline-none font-semibold text-base" />
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-gray-400 mb-1.5">Phone (optional)</label>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" className="w-full bg-gray-50/50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:bg-white focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 rounded-2xl px-4 py-3 h-13 transition-all outline-none font-semibold text-base" />
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-gray-400 mb-1.5">Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 6 characters" className="w-full bg-gray-50/50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:bg-white focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 rounded-2xl px-4 py-3 h-13 transition-all outline-none font-semibold text-base" />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <h2 className="text-xl font-black text-gray-900 mb-4 border-b border-gray-100 pb-2">Profile Details</h2>
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-gray-400 mb-1.5">Gender</label>
                <select value={gender} onChange={(e) => setGender(e.target.value)} className="w-full bg-gray-50/50 border border-gray-200 text-gray-900 focus:bg-white focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 rounded-2xl px-4 py-3 h-13 transition-all outline-none font-semibold text-base">
                  <option value="">Select gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="non-binary">Non-binary</option>
                  <option value="prefer-not-to-say">Prefer not to say</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-gray-400 mb-1.5">City</label>
                  <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Your city" className="w-full bg-gray-50/50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:bg-white focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 rounded-2xl px-4 py-3 h-13 transition-all outline-none font-semibold text-base" />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-gray-400 mb-1.5">State</label>
                  <select value={state} onChange={(e) => setState(e.target.value)} className="w-full bg-gray-50/50 border border-gray-200 text-gray-900 focus:bg-white focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 rounded-2xl px-4 py-3 h-13 transition-all outline-none font-semibold text-base">
                    <option value="">Select state</option>
                    {INDIAN_STATES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-gray-400 mb-2">Languages</label>
                <div className="flex flex-wrap gap-2">
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => setLanguages(toggleArrayItem(languages, lang))}
                      className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        languages.includes(lang)
                          ? 'bg-pink-50 border-pink-200 text-pink-600'
                          : 'bg-gray-50/50 border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-100/50'
                      }`}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <h2 className="text-xl font-black text-gray-900 mb-4 border-b border-gray-100 pb-2">Creator Positioning</h2>
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-gray-400 mb-2">Primary Niche</label>
                <select value={primaryNiche} onChange={(e) => setPrimaryNiche(e.target.value)} className="w-full bg-gray-50/50 border border-gray-200 text-gray-900 focus:bg-white focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 rounded-2xl px-4 py-3 h-13 transition-all outline-none font-semibold text-base">
                  <option value="">Select primary niche</option>
                  {NICHES.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-gray-400 mb-2">Secondary Niches (optional)</label>
                <div className="flex flex-wrap gap-2 max-h-[140px] overflow-y-auto p-1 border border-gray-100 rounded-xl bg-gray-50/30">
                  {NICHES.filter((n) => n !== primaryNiche).map((niche) => (
                    <button
                      key={niche}
                      type="button"
                      onClick={() => setSecondaryNiches(toggleArrayItem(secondaryNiches, niche))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                        secondaryNiches.includes(niche)
                          ? 'bg-pink-50 border-pink-200 text-pink-600'
                          : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-100/50'
                      }`}
                    >
                      {niche}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-gray-400 mb-1.5">Bio</label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell brands about yourself..."
                  rows={3}
                  className="w-full bg-gray-50/50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:bg-white focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 rounded-2xl px-4 py-3 transition-all outline-none resize-none font-semibold text-base"
                />
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-gray-400 mb-1.5">Instagram Handle</label>
                <input value={instagramHandle} onChange={(e) => setInstagramHandle(e.target.value)} placeholder="@username" className="w-full bg-gray-50/50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:bg-white focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 rounded-2xl px-4 py-3 h-13 transition-all outline-none font-semibold text-base" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-gray-400 mb-1.5">YouTube (optional)</label>
                  <input value={youtubeHandle} onChange={(e) => setYoutubeHandle(e.target.value)} placeholder="@channel" className="w-full bg-gray-50/50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:bg-white focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 rounded-2xl px-4 py-3 h-13 transition-all outline-none font-semibold text-base" />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-gray-400 mb-1.5">Twitter (optional)</label>
                  <input value={twitterHandle} onChange={(e) => setTwitterHandle(e.target.value)} placeholder="@handle" className="w-full bg-gray-50/50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:bg-white focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 rounded-2xl px-4 py-3 h-13 transition-all outline-none font-semibold text-base" />
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5">
              <h2 className="text-xl font-black text-gray-900 mb-4 border-b border-gray-100 pb-2">Collaboration Preferences</h2>
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-gray-400 mb-2">Content Types</label>
                <div className="flex flex-wrap gap-2">
                  {COLLAB_TYPES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setCollabTypes(toggleArrayItem(collabTypes, type))}
                      className={`px-4 py-2.5 rounded-xl text-sm font-bold border transition-all cursor-pointer ${
                        collabTypes.includes(type)
                          ? 'bg-pink-50 border-pink-200 text-pink-600'
                          : 'bg-gray-50/50 border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-100/50'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-gray-400 mb-2">Price Range</label>
                <div className="grid grid-cols-2 gap-3">
                  {PRICE_TIERS.map((tier) => (
                    <button
                      key={tier.value}
                      type="button"
                      onClick={() => setPriceRange(tier.value)}
                      className={`p-4 rounded-2xl text-left border transition-all cursor-pointer ${
                        priceRange === tier.value
                          ? 'bg-pink-50/40 border-pink-200/80'
                          : 'bg-gray-50/50 border-gray-200 hover:border-gray-300 hover:bg-gray-100/20'
                      }`}
                    >
                      <div className={`text-sm font-black ${priceRange === tier.value ? 'text-pink-600' : 'text-gray-900'}`}>
                        {tier.label}
                      </div>
                      <div className="text-xs text-gray-400 font-bold mt-0.5">{tier.range}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Navigation Controls */}
          <div className="flex gap-3 mt-8">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((step - 1) as Step)}
                className="flex-1 h-13 rounded-2xl text-base font-black text-gray-500 border border-gray-200 hover:bg-gray-50 transition-all cursor-pointer"
              >
                Back
              </button>
            )}
            {step < 4 ? (
              <button
                type="button"
                onClick={() => setStep((step + 1) as Step)}
                disabled={!canProceed()}
                className="flex-1 h-13 rounded-2xl text-base font-black text-white bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 shadow-lg shadow-pink-500/15 hover:shadow-pink-500/25 hover:-translate-y-0.5 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 flex items-center justify-center cursor-pointer"
              >
                Continue
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isLoading || !canProceed()}
                className="flex-1 h-13 rounded-2xl text-base font-black text-white bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 shadow-lg shadow-pink-500/15 hover:shadow-pink-500/25 hover:-translate-y-0.5 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 flex items-center justify-center cursor-pointer"
              >
                {isLoading ? 'Creating account...' : 'Create Account'}
              </button>
            )}
          </div>
        </div>

        {/* Footnotes */}
        <p className="mt-8 text-center text-sm font-semibold text-gray-400">
          Already have an account?{' '}
          <Link href="/login" className="text-pink-600 hover:text-pink-700 font-extrabold transition-colors">
            Sign in
          </Link>
        </p>
        <p className="mt-2 text-center text-sm font-semibold text-gray-400">
          Want to join as a business?{' '}
          <Link href="/signup/business" className="text-pink-600 hover:text-pink-700 font-extrabold transition-colors">
            Sign up here
          </Link>
        </p>
      </div>
    </div>
  );
}
