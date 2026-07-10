'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { motion } from 'framer-motion';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const sb = createClient();
      const { data, error: authError } = await sb.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      if (data.session && data.user) {
        localStorage.setItem('influnet_token', data.session.access_token);
        localStorage.setItem('influnet_refresh_token', data.session.refresh_token);
        
        // Fetch user profile to determine role
        const { data: profile, error: profileError } = await sb
          .from('profiles')
          .select('role')
          .eq('id', data.user.id)
          .single();
          
        const p = profile as any;
        if (p?.role === 'influencer') {
          router.push('/dashboard/influencer');
        } else if (p?.role === 'admin') {
          router.push('/dashboard/admin');
        } else {
          router.push('/dashboard');
        }
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fafafb] flex items-center justify-center px-4 relative overflow-hidden font-sans">
      {/* Soft Light Ambient Glows */}
      <div className="absolute inset-0 pointer-events-none select-none">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-pink-100/30 blur-[130px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-purple-100/30 blur-[130px]" />
      </div>

      <div className="relative z-10 w-full max-w-[450px]">
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
          <h1 className="text-3xl font-black text-gray-900 tracking-tight mb-2">Welcome back</h1>
          <p className="text-gray-400 font-semibold">
            Sign in to your account to continue
          </p>
        </div>

        {/* Apple-like Premium Card */}
        <div className="p-10 rounded-[2.5rem] bg-white border border-gray-150 shadow-[0_20px_50px_rgba(0,0,0,0.018)]">
          {error && (
            <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-100 text-sm font-semibold text-red-600">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-xs font-black uppercase tracking-wider text-gray-400 mb-2">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                required
                className="w-full bg-gray-50/50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:bg-white focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 rounded-2xl px-4 py-3.5 h-13 transition-all outline-none font-semibold text-base"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label htmlFor="password" className="block text-xs font-black uppercase tracking-wider text-gray-400">
                  Password
                </label>
              </div>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                className="w-full bg-gray-50/50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:bg-white focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 rounded-2xl px-4 py-3.5 h-13 transition-all outline-none font-semibold text-base"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-13 mt-2 rounded-2xl text-base font-black text-white bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 shadow-lg shadow-pink-500/15 hover:shadow-pink-500/25 hover:-translate-y-0.5 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 flex items-center justify-center cursor-pointer"
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-8 text-center border-t border-gray-100 pt-6">
            <Link
              href="/reset-password"
              className="text-sm text-pink-600 hover:text-pink-700 font-extrabold transition-colors"
            >
              Forgot password?
            </Link>
          </div>
        </div>

        <p className="mt-8 text-center text-sm font-semibold text-gray-400">
          Don&apos;t have an account?{' '}
          <Link
            href="/signup"
            className="text-pink-600 hover:text-pink-700 font-extrabold transition-colors"
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
