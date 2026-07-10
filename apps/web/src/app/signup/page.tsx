import Link from 'next/link';
import React from 'react';
import { useSearchParams } from 'next/navigation';

export default function SignupSelectionPage() {
  return (
    <React.Suspense fallback={<div>Loading...</div>}>
      <SignupSelectionContent />
    </React.Suspense>
  );
}

function SignupSelectionContent() {
  const searchParams = useSearchParams();
  const nextParam = searchParams.get('next');
  const nextQuery = nextParam ? `?next=${encodeURIComponent(nextParam)}` : '';
  return (
    <div className="min-h-screen bg-[#fafafb] flex items-center justify-center px-4 relative overflow-hidden font-sans">
      {/* Soft Light Ambient Glows */}
      <div className="absolute inset-0 pointer-events-none select-none">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-pink-100/30 blur-[130px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-purple-100/30 blur-[130px]" />
      </div>

      <div className="relative z-10 w-full max-w-[500px]">
        {/* Logo Container */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2.5 mb-6 group">
            <img
              src="/influet_logo.png"
              alt="influnet"
              className="h-10 w-auto flex-shrink-0 transition-transform group-hover:scale-105"
            />
            <span className="text-2xl font-black text-gray-900 tracking-tight">influnet</span>
          </Link>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight mb-2">Join Influnet</h1>
          <p className="text-gray-400 font-semibold">
            Choose how you want to use the platform
          </p>
        </div>

        {/* Apple-like Premium Card */}
        <div className="p-8 sm:p-10 rounded-[2.5rem] bg-white border border-gray-150 shadow-[0_20px_50px_rgba(0,0,0,0.018)]">
          <div className="space-y-4">
            
            {/* Influencer Card */}
            <Link href={`/signup/influencer${nextQuery}`} className="group block">
              <div className="p-6 rounded-[1.5rem] bg-gray-50/50 border border-gray-200 hover:border-pink-200 hover:bg-pink-50/40 transition-all cursor-pointer relative overflow-hidden">
                <div className="flex items-center gap-4 relative z-10">
                  <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-xl border border-gray-100 group-hover:border-pink-100 group-hover:shadow-pink-100 transition-all">
                    ✨
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-gray-900 group-hover:text-pink-600 transition-colors">I'm a Creator</h3>
                    <p className="text-sm font-semibold text-gray-400 mt-1">Get discovered by top brands and manage your collaborations.</p>
                  </div>
                </div>
              </div>
            </Link>

            {/* Business Card */}
            <Link href={`/signup/business${nextQuery}`} className="group block">
              <div className="p-6 rounded-[1.5rem] bg-gray-50/50 border border-gray-200 hover:border-purple-200 hover:bg-purple-50/40 transition-all cursor-pointer relative overflow-hidden">
                <div className="flex items-center gap-4 relative z-10">
                  <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-xl border border-gray-100 group-hover:border-purple-100 group-hover:shadow-purple-100 transition-all">
                    🏢
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-gray-900 group-hover:text-purple-600 transition-colors">I'm a Business</h3>
                    <p className="text-sm font-semibold text-gray-400 mt-1">Find the perfect creators and manage your influencer campaigns.</p>
                  </div>
                </div>
              </div>
            </Link>

          </div>
        </div>

        <p className="mt-8 text-center text-sm font-semibold text-gray-400">
          Already have an account?{' '}
          <Link
            href="/login"
            className="text-pink-600 hover:text-pink-700 font-extrabold transition-colors"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
