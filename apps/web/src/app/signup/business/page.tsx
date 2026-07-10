'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { motion } from 'framer-motion';

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
  return (
    <React.Suspense fallback={<div>Loading...</div>}>
      <BusinessSignupContent />
    </React.Suspense>
  );
}

function BusinessSignupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get('next') || '/dashboard';
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
      
      const payload = {
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
        router.push(nextParam);
      } else {
        router.push(`/login?message=Check your email to confirm your account&next=${encodeURIComponent(nextParam)}`);
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
          <h1 className="text-3xl font-black text-gray-900 tracking-tight mb-2">Create your business account</h1>
          <p className="text-gray-400 font-semibold">Join as a Business</p>
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
            <span>Company</span>
            <span>Verify</span>
            <span>Intent</span>
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
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-gray-400 mb-1.5">Full Name</label>
                <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" className="w-full bg-gray-50/50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:bg-white focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 rounded-2xl px-4 py-3 h-13 transition-all outline-none font-semibold text-base" />
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-gray-400 mb-1.5">Company Name</label>
                <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Your company name" className="w-full bg-gray-50/50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:bg-white focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 rounded-2xl px-4 py-3 h-13 transition-all outline-none font-semibold text-base" />
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-gray-400 mb-1.5">Work Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="w-full bg-gray-50/50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:bg-white focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 rounded-2xl px-4 py-3 h-13 transition-all outline-none font-semibold text-base" />
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
              <h2 className="text-xl font-black text-gray-900 mb-4 border-b border-gray-100 pb-2">Company Information</h2>
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-gray-400 mb-1.5">Business Type</label>
                <select value={businessType} onChange={(e) => setBusinessType(e.target.value)} className="w-full bg-gray-50/50 border border-gray-200 text-gray-900 focus:bg-white focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 rounded-2xl px-4 py-3 h-13 transition-all outline-none font-semibold text-base">
                  <option value="">Select business type</option>
                  {BUSINESS_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-gray-400 mb-1.5">Industry</label>
                <select value={industry} onChange={(e) => setIndustry(e.target.value)} className="w-full bg-gray-50/50 border border-gray-200 text-gray-900 focus:bg-white focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 rounded-2xl px-4 py-3 h-13 transition-all outline-none font-semibold text-base">
                  <option value="">Select industry</option>
                  {INDUSTRIES.map((ind) => (
                    <option key={ind} value={ind}>{ind}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-gray-400 mb-1.5">Website (optional)</label>
                <input type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://yourcompany.com" className="w-full bg-gray-50/50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:bg-white focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 rounded-2xl px-4 py-3 h-13 transition-all outline-none font-semibold text-base" />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <h2 className="text-xl font-black text-gray-900 mb-4 border-b border-gray-100 pb-2">Verification & Address</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-gray-400 mb-1.5">City</label>
                  <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className="w-full bg-gray-50/50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:bg-white focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 rounded-2xl px-4 py-3 h-13 transition-all outline-none font-semibold text-base" />
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
                <label className="block text-xs font-black uppercase tracking-wider text-gray-400 mb-1.5">Registered Address</label>
                <textarea
                  value={registeredAddress}
                  onChange={(e) => setRegisteredAddress(e.target.value)}
                  placeholder="Full registered address"
                  rows={3}
                  className="w-full bg-gray-50/50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:bg-white focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 rounded-2xl px-4 py-3 transition-all outline-none resize-none font-semibold text-base"
                />
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-gray-400 mb-1.5">GST Number (optional)</label>
                <input value={gstNumber} onChange={(e) => setGstNumber(e.target.value)} placeholder="22AAAAA0000A1Z5" className="w-full bg-gray-50/50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:bg-white focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 rounded-2xl px-4 py-3 h-13 transition-all outline-none font-semibold text-base" />
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5">
              <h2 className="text-xl font-black text-gray-900 mb-4 border-b border-gray-100 pb-2">Collaboration Intent</h2>
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-gray-400 mb-2">Monthly Marketing Budget</label>
                <div className="grid grid-cols-2 gap-3">
                  {BUDGET_RANGES.map((range) => (
                    <button
                      key={range}
                      type="button"
                      onClick={() => setMarketingBudget(range)}
                      className={`p-3.5 rounded-2xl text-left text-sm font-bold border transition-all cursor-pointer ${
                        marketingBudget === range
                          ? 'bg-pink-50 border-pink-200 text-pink-600'
                          : 'bg-gray-50/50 border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-100/20'
                      }`}
                    >
                      {range}
                    </button>
                  ))}
                </div>
              </div>
              <div className="p-4 rounded-2xl bg-pink-50/40 border border-pink-100/50">
                <p className="text-sm font-semibold text-gray-500 leading-relaxed">
                  Your account will be reviewed by our team. You&apos;ll receive access to the dashboard once approved.
                </p>
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
                {isLoading ? 'Creating account...' : 'Submit for Review'}
              </button>
            )}
          </div>
        </div>

        {/* Footnotes */}
        <p className="mt-8 text-center text-sm font-semibold text-gray-400">
          Already have an account?{' '}
          <Link href={nextParam && nextParam !== '/dashboard' ? `/login?next=${encodeURIComponent(nextParam)}` : '/login'} className="text-pink-600 hover:text-pink-700 font-extrabold transition-colors">
            Sign in
          </Link>
        </p>
        <p className="mt-2 text-center text-sm font-semibold text-gray-400">
          Want to join as a creator?{' '}
          <Link href="/signup/influencer" className="text-pink-600 hover:text-pink-700 font-extrabold transition-colors">
            Sign up here
          </Link>
        </p>
      </div>
    </div>
  );
}
