'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

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
      const { data, error: authError } = await sb.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: `${firstName} ${lastName}`,
            role: 'influencer',
            username,
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
          },
        },
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      if (data.session) {
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
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center px-4 py-12">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#ee3e96]/8 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-[#f26e59]/6 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-lg">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <img
              src="/influet_logo.png"
              alt="influnet"
              className="h-9 w-auto flex-shrink-0"
            />
            <span className="text-2xl font-bold text-white tracking-tight">influnet</span>
          </Link>
          <h1 className="text-2xl font-bold text-white mb-2">Create your account</h1>
          <p className="text-sm text-gray-400">Join as a Creator</p>
        </div>

        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            {[1, 2, 3, 4].map((s) => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                    s <= step
                      ? 'bg-[#ee3e96] text-white shadow-lg shadow-[#ee3e96]/20'
                      : 'bg-white/5 text-gray-500 border border-white/10'
                  }`}
                >
                  {s}
                </div>
                {s < 4 && (
                  <div
                    className={`w-12 sm:w-20 h-0.5 rounded-full transition-all ${
                      s < step ? 'bg-[#ee3e96]' : 'bg-white/10'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>Account</span>
            <span>Profile</span>
            <span>Creator</span>
            <span>Collab</span>
          </div>
        </div>

        <div className="p-8 rounded-2xl bg-white/[0.03] border border-white/[0.08] shadow-2xl">
          {error && (
            <div className="mb-6 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
              {error}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-white mb-4">Account Details</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">First Name</label>
                  <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" className="w-full !bg-white/[0.03] !border-white/[0.08] !text-white focus:border-[#ee3e96] focus:ring-4 focus:ring-[#ee3e96]/15 placeholder-gray-500 rounded-xl px-4 py-3 h-12 transition-all outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Last Name</label>
                  <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" className="w-full !bg-white/[0.03] !border-white/[0.08] !text-white focus:border-[#ee3e96] focus:ring-4 focus:ring-[#ee3e96]/15 placeholder-gray-500 rounded-xl px-4 py-3 h-12 transition-all outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Username</label>
                <input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} placeholder="Choose a username" className="w-full !bg-white/[0.03] !border-white/[0.08] !text-white focus:border-[#ee3e96] focus:ring-4 focus:ring-[#ee3e96]/15 placeholder-gray-500 rounded-xl px-4 py-3 h-12 transition-all outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="w-full !bg-white/[0.03] !border-white/[0.08] !text-white focus:border-[#ee3e96] focus:ring-4 focus:ring-[#ee3e96]/15 placeholder-gray-500 rounded-xl px-4 py-3 h-12 transition-all outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Phone (optional)</label>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" className="w-full !bg-white/[0.03] !border-white/[0.08] !text-white focus:border-[#ee3e96] focus:ring-4 focus:ring-[#ee3e96]/15 placeholder-gray-500 rounded-xl px-4 py-3 h-12 transition-all outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 6 characters" className="w-full !bg-white/[0.03] !border-white/[0.08] !text-white focus:border-[#ee3e96] focus:ring-4 focus:ring-[#ee3e96]/15 placeholder-gray-500 rounded-xl px-4 py-3 h-12 transition-all outline-none" />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-white mb-4">Profile Details</h2>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Gender</label>
                <select value={gender} onChange={(e) => setGender(e.target.value)} className="w-full !bg-[#09090b] !border border-white/[0.08] !text-white focus:border-[#ee3e96] focus:ring-4 focus:ring-[#ee3e96]/15 rounded-xl px-4 py-3 h-12 transition-all outline-none">
                  <option value="">Select gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="non-binary">Non-binary</option>
                  <option value="prefer-not-to-say">Prefer not to say</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">City</label>
                  <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Your city" className="w-full !bg-white/[0.03] !border-white/[0.08] !text-white focus:border-[#ee3e96] focus:ring-4 focus:ring-[#ee3e96]/15 placeholder-gray-500 rounded-xl px-4 py-3 h-12 transition-all outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">State</label>
                  <select value={state} onChange={(e) => setState(e.target.value)} className="w-full !bg-[#09090b] !border border-white/[0.08] !text-white focus:border-[#ee3e96] focus:ring-4 focus:ring-[#ee3e96]/15 rounded-xl px-4 py-3 h-12 transition-all outline-none">
                    <option value="">Select state</option>
                    {INDIAN_STATES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Languages</label>
                <div className="flex flex-wrap gap-2">
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => setLanguages(toggleArrayItem(languages, lang))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        languages.includes(lang)
                          ? 'bg-[#ee3e96]/15 border-[#ee3e96]/30 text-[#ee3e96]'
                          : 'bg-white/[0.03] border-white/10 text-gray-400 hover:border-white/20'
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
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-white mb-4">Creator Positioning</h2>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Primary Niche</label>
                <select value={primaryNiche} onChange={(e) => setPrimaryNiche(e.target.value)} className="w-full !bg-[#09090b] !border border-white/[0.08] !text-white focus:border-[#ee3e96] focus:ring-4 focus:ring-[#ee3e96]/15 rounded-xl px-4 py-3 h-12 transition-all outline-none">
                  <option value="">Select your primary niche</option>
                  {NICHES.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Secondary Niches (optional)</label>
                <div className="flex flex-wrap gap-2">
                  {NICHES.filter((n) => n !== primaryNiche).map((niche) => (
                    <button
                      key={niche}
                      type="button"
                      onClick={() => setSecondaryNiches(toggleArrayItem(secondaryNiches, niche))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        secondaryNiches.includes(niche)
                          ? 'bg-[#ee3e96]/15 border-[#ee3e96]/30 text-[#ee3e96]'
                          : 'bg-white/[0.03] border-white/10 text-gray-400 hover:border-white/20'
                      }`}
                    >
                      {niche}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Bio</label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell brands about yourself..."
                  rows={3}
                  className="w-full !bg-white/[0.03] !border-white/[0.08] !text-white focus:border-[#ee3e96] focus:ring-4 focus:ring-[#ee3e96]/15 placeholder-gray-500 rounded-xl px-4 py-3 transition-all outline-none resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Instagram Handle</label>
                <input value={instagramHandle} onChange={(e) => setInstagramHandle(e.target.value)} placeholder="@username" className="w-full !bg-white/[0.03] !border-white/[0.08] !text-white focus:border-[#ee3e96] focus:ring-4 focus:ring-[#ee3e96]/15 placeholder-gray-500 rounded-xl px-4 py-3 h-12 transition-all outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">YouTube (optional)</label>
                  <input value={youtubeHandle} onChange={(e) => setYoutubeHandle(e.target.value)} placeholder="@channel" className="w-full !bg-white/[0.03] !border-white/[0.08] !text-white focus:border-[#ee3e96] focus:ring-4 focus:ring-[#ee3e96]/15 placeholder-gray-500 rounded-xl px-4 py-3 h-12 transition-all outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Twitter (optional)</label>
                  <input value={twitterHandle} onChange={(e) => setTwitterHandle(e.target.value)} placeholder="@handle" className="w-full !bg-white/[0.03] !border-white/[0.08] !text-white focus:border-[#ee3e96] focus:ring-4 focus:ring-[#ee3e96]/15 placeholder-gray-500 rounded-xl px-4 py-3 h-12 transition-all outline-none" />
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-white mb-4">Collaboration Preferences</h2>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Content Types</label>
                <div className="flex flex-wrap gap-2">
                  {COLLAB_TYPES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setCollabTypes(toggleArrayItem(collabTypes, type))}
                      className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
                        collabTypes.includes(type)
                          ? 'bg-[#ee3e96]/15 border-[#ee3e96]/30 text-[#ee3e96]'
                          : 'bg-white/[0.03] border-white/10 text-gray-400 hover:border-white/20'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Price Range</label>
                <div className="grid grid-cols-2 gap-3">
                  {PRICE_TIERS.map((tier) => (
                    <button
                      key={tier.value}
                      type="button"
                      onClick={() => setPriceRange(tier.value)}
                      className={`p-4 rounded-xl text-left border transition-all ${
                        priceRange === tier.value
                          ? 'bg-[#ee3e96]/10 border-[#ee3e96]/30'
                          : 'bg-white/[0.03] border-white/10 hover:border-white/20'
                      }`}
                    >
                      <div className={`text-sm font-bold ${priceRange === tier.value ? 'text-[#ee3e96]' : 'text-white'}`}>
                        {tier.label}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">{tier.range}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-3 mt-8">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((step - 1) as Step)}
                className="flex-1 h-12 rounded-xl text-sm font-semibold text-gray-300 border border-white/10 hover:bg-white/5 transition-all"
              >
                Back
              </button>
            )}
            {step < 4 ? (
              <button
                type="button"
                onClick={() => setStep((step + 1) as Step)}
                disabled={!canProceed()}
                className="flex-1 h-12 rounded-xl text-sm font-bold text-black bg-white hover:bg-gray-100 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 shadow-sm"
                style={{ color: 'black' }}
              >
                Continue
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isLoading || !canProceed()}
                className="flex-1 h-12 rounded-xl text-sm font-bold text-black bg-white hover:bg-gray-100 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 shadow-sm"
                style={{ color: 'black' }}
              >
                {isLoading ? 'Creating account...' : 'Create Account'}
              </button>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-gray-400">
          Already have an account?{' '}
          <Link href="/login" className="text-[#ee3e96] hover:text-[#d6358a] font-semibold transition-colors">
            Sign in
          </Link>
        </p>
        <p className="mt-2 text-center text-sm text-gray-400">
          Want to join as a business?{' '}
          <Link href="/signup/business" className="text-[#ee3e96] hover:text-[#d6358a] font-semibold transition-colors">
            Sign up here
          </Link>
        </p>
      </div>
    </div>
  );
}
