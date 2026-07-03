'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

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

      if (data.session) {
        localStorage.setItem('influnet_token', data.session.access_token);
        localStorage.setItem('influnet_refresh_token', data.session.refresh_token);
        router.push('/dashboard');
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center px-4">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#ee3e96]/8 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-[#f26e59]/6 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <img
              src="/influet_logo.png"
              alt="influnet"
              className="h-9 w-auto flex-shrink-0"
            />
            <span className="text-2xl font-bold text-white tracking-tight">influnet</span>
          </Link>
          <h1 className="text-2xl font-bold text-white mb-2">Welcome back</h1>
          <p className="text-sm text-gray-400">
            Sign in to your account to continue
          </p>
        </div>

        <div className="p-8 rounded-2xl bg-white/[0.03] border border-white/[0.08] shadow-2xl">
          {error && (
            <div className="mb-6 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full !bg-white/[0.03] !border-white/[0.08] !text-white focus:border-[#ee3e96] focus:ring-4 focus:ring-[#ee3e96]/15 placeholder-gray-500 rounded-xl px-4 py-3 h-12 transition-all outline-none"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                className="w-full !bg-white/[0.03] !border-white/[0.08] !text-white focus:border-[#ee3e96] focus:ring-4 focus:ring-[#ee3e96]/15 placeholder-gray-500 rounded-xl px-4 py-3 h-12 transition-all outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 rounded-xl text-base font-bold text-black bg-white hover:bg-gray-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 shadow-sm"
              style={{ color: 'black' }}
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link
              href="/reset-password"
              className="text-sm text-[#ee3e96] hover:text-[#d6358a] font-medium transition-colors"
            >
              Forgot password?
            </Link>
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-gray-400">
          Don&apos;t have an account?{' '}
          <Link
            href="/signup/influencer"
            className="text-[#ee3e96] hover:text-[#d6358a] font-semibold transition-colors"
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
