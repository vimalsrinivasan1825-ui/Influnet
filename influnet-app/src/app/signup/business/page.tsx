'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const INDUSTRIES = [
  'Fashion & Apparel', 'Beauty & Personal Care', 'Food & Beverage', 'Technology',
  'Healthcare & Wellness', 'Finance', 'Education', 'Travel & Hospitality',
  'Home & Lifestyle', 'Automotive', 'Entertainment & Media', 'Sports & Fitness',
  'Real Estate', 'Other',
];

const BUSINESS_TYPES = [
  'Startup', 'SME', 'Enterprise', 'Agency', 'D2C Brand', 'E-commerce',
  'NGO / Non-profit', 'Freelancer / Solo', 'Other',
];

const BUDGET_RANGES = [
  'Under ₹25K/month', '₹25K – ₹50K', '₹50K – ₹1L', '₹1L – ₹5L', '₹5L – ₹10L', '₹10L+', 'Other',
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

export default function BusinessSignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [industry, setIndustry] = useState('');
  const [website, setWebsite] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [registeredAddress, setRegisteredAddress] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [marketingBudget, setMarketingBudget] = useState('');

  const canProceed = (): boolean => {
    if (step === 1) return !!fullName && !!companyName && !!email && !!password;
    if (step === 2) return !!businessType && !!industry;
    if (step === 3) return !!city && !!state && !!registeredAddress;
    if (step === 4) return !!marketingBudget;
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
            name: fullName,
            role: 'business_owner',
            companyName,
            phone,
            businessType,
            industry,
            website,
            city,
            state,
            registeredAddress,
            gstNumber,
            marketingBudget,
            location: `${city}, ${state}`,
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
        router.push('/dashboard');
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
          <h1 className="text-2xl font-bold text-white mb-2">Create your business account</h1>
          <p className="text-sm text-gray-400">Join as a Business</p>
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
            <span>Company</span>
            <span>Verify</span>
            <span>Intent</span>
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
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Full Name</label>
                <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" className="w-full !bg-white/[0.03] !border-white/[0.08] !text-white focus:border-[#ee3e96] focus:ring-4 focus:ring-[#ee3e96]/15 placeholder-gray-500 rounded-xl px-4 py-3 h-12 transition-all outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Company Name</label>
                <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Your company name" className="w-full !bg-white/[0.03] !border-white/[0.08] !text-white focus:border-[#ee3e96] focus:ring-4 focus:ring-[#ee3e96]/15 placeholder-gray-500 rounded-xl px-4 py-3 h-12 transition-all outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Work Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="w-full !bg-white/[0.03] !border-white/[0.08] !text-white focus:border-[#ee3e96] focus:ring-4 focus:ring-[#ee3e96]/15 placeholder-gray-500 rounded-xl px-4 py-3 h-12 transition-all outline-none" />
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
              <h2 className="text-lg font-bold text-white mb-4">Company Information</h2>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Business Type</label>
                <select value={businessType} onChange={(e) => setBusinessType(e.target.value)} className="w-full !bg-[#09090b] !border border-white/[0.08] !text-white focus:border-[#ee3e96] focus:ring-4 focus:ring-[#ee3e96]/15 rounded-xl px-4 py-3 h-12 transition-all outline-none">
                  <option value="">Select business type</option>
                  {BUSINESS_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Industry</label>
                <select value={industry} onChange={(e) => setIndustry(e.target.value)} className="w-full !bg-[#09090b] !border border-white/[0.08] !text-white focus:border-[#ee3e96] focus:ring-4 focus:ring-[#ee3e96]/15 rounded-xl px-4 py-3 h-12 transition-all outline-none">
                  <option value="">Select industry</option>
                  {INDUSTRIES.map((ind) => (
                    <option key={ind} value={ind}>{ind}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Website (optional)</label>
                <input type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://yourcompany.com" className="w-full !bg-white/[0.03] !border-white/[0.08] !text-white focus:border-[#ee3e96] focus:ring-4 focus:ring-[#ee3e96]/15 placeholder-gray-500 rounded-xl px-4 py-3 h-12 transition-all outline-none" />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-white mb-4">Verification & Address</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">City</label>
                  <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className="w-full !bg-white/[0.03] !border-white/[0.08] !text-white focus:border-[#ee3e96] focus:ring-4 focus:ring-[#ee3e96]/15 placeholder-gray-500 rounded-xl px-4 py-3 h-12 transition-all outline-none" />
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
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Registered Address</label>
                <textarea
                  value={registeredAddress}
                  onChange={(e) => setRegisteredAddress(e.target.value)}
                  placeholder="Full registered address"
                  rows={3}
                  className="w-full !bg-white/[0.03] !border-white/[0.08] !text-white focus:border-[#ee3e96] focus:ring-4 focus:ring-[#ee3e96]/15 placeholder-gray-500 rounded-xl px-4 py-3 transition-all outline-none resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">GST Number (optional)</label>
                <input value={gstNumber} onChange={(e) => setGstNumber(e.target.value)} placeholder="22AAAAA0000A1Z5" className="w-full !bg-white/[0.03] !border-white/[0.08] !text-white focus:border-[#ee3e96] focus:ring-4 focus:ring-[#ee3e96]/15 placeholder-gray-500 rounded-xl px-4 py-3 h-12 transition-all outline-none" />
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-white mb-4">Collaboration Intent</h2>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Monthly Marketing Budget</label>
                <div className="grid grid-cols-2 gap-3">
                  {BUDGET_RANGES.map((range) => (
                    <button
                      key={range}
                      type="button"
                      onClick={() => setMarketingBudget(range)}
                      className={`p-3 rounded-xl text-left text-sm font-medium border transition-all ${
                        marketingBudget === range
                          ? 'bg-[#ee3e96]/10 border-[#ee3e96]/30 text-[#ee3e96]'
                          : 'bg-white/[0.03] border-white/10 text-gray-400 hover:border-white/20'
                      }`}
                    >
                      {range}
                    </button>
                  ))}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-[#ee3e96]/5 border border-[#ee3e96]/15">
                <p className="text-sm text-gray-300">
                  Your account will be reviewed by our team. You&apos;ll receive access to the dashboard once approved.
                </p>
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
                {isLoading ? 'Creating account...' : 'Submit for Review'}
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
          Want to join as a creator?{' '}
          <Link href="/signup/influencer" className="text-[#ee3e96] hover:text-[#d6358a] font-semibold transition-colors">
            Sign up here
          </Link>
        </p>
      </div>
    </div>
  );
}
