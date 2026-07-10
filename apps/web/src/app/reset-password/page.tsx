'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type Mode = 'request' | 'update' | 'sent' | 'done';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('request');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const sb = createClient();

    // Recovery links can arrive with an error (expired/used link) in the URL hash
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    if (hash.includes('error=')) {
      const params = new URLSearchParams(hash.slice(1));
      setError(
        params.get('error_description')?.replace(/\+/g, ' ') ||
        'This reset link has expired or was already used. Please request a new one.'
      );
      return;
    }

    // If the user landed here from a valid recovery email, Supabase establishes
    // a session and fires PASSWORD_RECOVERY — switch to the new-password form.
    const { data: { subscription } } = sb.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMode('update');
      }
    });

    // Also handle the case where the recovery session already exists
    // (e.g. the event fired before this listener attached).
    sb.auth.getSession().then(({ data: { session } }) => {
      if (session && (hash.includes('type=recovery') || window.location.search.includes('code='))) {
        setMode('update');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const sb = createClient();
      const { error: err } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (err) throw err;
      setMode('sent');
    } catch (err: any) {
      setError(err.message || 'Failed to send reset email. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setIsLoading(true);
    try {
      const sb = createClient();
      const { error: err } = await sb.auth.updateUser({ password });
      if (err) throw err;
      setMode('done');
      setTimeout(() => router.push('/login'), 2500);
    } catch (err: any) {
      setError(err.message || 'Failed to update password. The link may have expired — request a new one.');
    } finally {
      setIsLoading(false);
    }
  };

  const inputClass =
    'w-full bg-gray-50/50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:bg-white focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 rounded-2xl px-4 py-3.5 h-13 transition-all outline-none font-semibold text-base';
  const buttonClass =
    'w-full h-13 mt-2 rounded-2xl text-base font-black text-white bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 shadow-lg shadow-pink-500/15 hover:shadow-pink-500/25 hover:-translate-y-0.5 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 flex items-center justify-center cursor-pointer';
  const labelClass = 'block text-xs font-black uppercase tracking-wider text-gray-400 mb-2';

  return (
    <div className="min-h-screen bg-[#fafafb] flex items-center justify-center px-4 relative overflow-hidden font-sans">
      <div className="absolute inset-0 pointer-events-none select-none">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-pink-100/30 blur-[130px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-purple-100/30 blur-[130px]" />
      </div>

      <div className="relative z-10 w-full max-w-[450px]">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2.5 mb-6 group">
            <img
              src="/influet_logo.png"
              alt="influnet"
              className="h-10 w-auto flex-shrink-0 transition-transform group-hover:scale-105"
            />
            <span className="text-2xl font-black text-gray-900 tracking-tight">influnet</span>
          </Link>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight mb-2">
            {mode === 'update' ? 'Set a new password' : 'Reset your password'}
          </h1>
          <p className="text-gray-400 font-semibold">
            {mode === 'update'
              ? 'Choose a strong password for your account'
              : "Enter your email and we'll send you a reset link"}
          </p>
        </div>

        <div className="p-10 rounded-[2.5rem] bg-white border border-gray-150 shadow-[0_20px_50px_rgba(0,0,0,0.018)]">
          {error && (
            <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-100 text-sm font-semibold text-red-600">
              {error}
            </div>
          )}

          {mode === 'request' && (
            <form onSubmit={handleRequest} className="space-y-6">
              <div>
                <label htmlFor="email" className={labelClass}>Email Address</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  required
                  className={inputClass}
                />
              </div>
              <button type="submit" disabled={isLoading} className={buttonClass}>
                {isLoading ? 'Sending...' : 'Send Reset Link'}
              </button>
            </form>
          )}

          {mode === 'sent' && (
            <div className="text-center py-4">
              <div className="text-4xl mb-4">📬</div>
              <p className="font-bold text-gray-900 mb-2">Check your inbox</p>
              <p className="text-sm font-semibold text-gray-400">
                If an account exists for {email}, you&apos;ll receive a password reset
                link shortly. The link expires after a short time.
              </p>
            </div>
          )}

          {mode === 'update' && (
            <form onSubmit={handleUpdate} className="space-y-6">
              <div>
                <label htmlFor="password" className={labelClass}>New Password</label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  required
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="confirm" className={labelClass}>Confirm Password</label>
                <input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repeat your new password"
                  required
                  className={inputClass}
                />
              </div>
              <button type="submit" disabled={isLoading} className={buttonClass}>
                {isLoading ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          )}

          {mode === 'done' && (
            <div className="text-center py-4">
              <div className="text-4xl mb-4">✅</div>
              <p className="font-bold text-gray-900 mb-2">Password updated</p>
              <p className="text-sm font-semibold text-gray-400">
                Redirecting you to sign in...
              </p>
            </div>
          )}
        </div>

        <p className="mt-8 text-center text-sm font-semibold text-gray-400">
          Remembered it?{' '}
          <Link href="/login" className="text-pink-600 hover:text-pink-700 font-extrabold transition-colors">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
