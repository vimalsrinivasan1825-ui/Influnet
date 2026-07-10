'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type SetupStatus = 'idle' | 'loading' | 'success' | 'error';

export default function SetupPage() {
  const router = useRouter();
  const [status, setStatus] = useState<SetupStatus>('idle');
  const [result, setResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [sqlToRun, setSqlToRun] = useState('');

  const handleAutoSetup = async () => {
    setStatus('loading');
    setErrorMsg('');
    setSqlToRun('');

    try {
      const res = await fetch('/api/admin/seed', { method: 'POST' });
      const data = await res.json();

      if (data.success) {
        setStatus('success');
        setResult(data);
      } else {
        setStatus('error');
        setErrorMsg(data.error || 'Setup failed');
        if (data.sqlToRun) {
          setSqlToRun(data.sqlToRun);
        }
        if (data.message) {
          setErrorMsg(data.message);
        }
      }
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err.message || 'Network error');
    }
  };

  const handleGoToLogin = () => {
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-[#fafafb] flex items-center justify-center px-4 relative overflow-hidden font-sans">
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none select-none">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-indigo-100/30 blur-[130px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-purple-100/30 blur-[130px]" />
      </div>

      <div className="relative z-10 w-full max-w-[560px]">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2.5 mb-6 group">
            <img
              src="/influet_logo.png"
              alt="influnet"
              className="h-10 w-auto flex-shrink-0 transition-transform group-hover:scale-105"
            />
            <span className="text-2xl font-black text-gray-900 tracking-tight">influnet</span>
          </Link>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight mb-2">Admin Setup</h1>
          <p className="text-gray-400 font-semibold">
            Create the first admin account to manage your platform
          </p>
        </div>

        <div className="p-10 rounded-[2.5rem] bg-white border border-gray-150 shadow-[0_20px_50px_rgba(0,0,0,0.018)]">
          {/* Auto Setup Section */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <span className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm font-black">
                1
              </span>
              <div>
                <h2 className="text-lg font-black text-gray-900">Try Automated Setup</h2>
                <p className="text-sm text-gray-400 font-semibold">
                  One-click admin account creation (requires Supabase credentials)
                </p>
              </div>
            </div>

            {status === 'idle' && (
              <button
                onClick={handleAutoSetup}
                className="w-full h-13 rounded-2xl text-base font-black text-white bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 shadow-lg shadow-indigo-500/15 hover:shadow-indigo-500/25 hover:-translate-y-0.5 active:scale-95 transition-all cursor-pointer"
              >
                Create Admin Account
              </button>
            )}

            {status === 'loading' && (
              <div className="w-full h-13 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center gap-3 text-indigo-600 font-bold">
                <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                Creating admin account...
              </div>
            )}

            {status === 'success' && (
              <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-100">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-black text-emerald-800">Admin Created!</h3>
                    <p className="text-sm text-emerald-600 font-semibold">Use these credentials to log in:</p>
                  </div>
                </div>
                <div className="bg-emerald-100/50 rounded-xl p-4 mb-4 font-mono text-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-emerald-500 font-bold">Email:</span>
                    <span className="text-emerald-900 font-semibold">{result?.credentials?.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-500 font-bold">Password:</span>
                    <span className="text-emerald-900 font-semibold">{result?.credentials?.password}</span>
                  </div>
                </div>
                <button
                  onClick={handleGoToLogin}
                  className="w-full h-11 rounded-xl text-sm font-black text-white bg-emerald-600 hover:bg-emerald-700 transition-all cursor-pointer"
                >
                  Go to Login
                </button>
              </div>
            )}

            {status === 'error' && !sqlToRun && (
              <div className="p-6 rounded-2xl bg-amber-50 border border-amber-100">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-sm font-bold text-amber-800">{errorMsg}</p>
                </div>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="flex items-center gap-4 mb-8">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs font-black uppercase tracking-wider text-gray-400">or use manual setup</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Manual Setup Section */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <span className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-sm font-black">
                2
              </span>
              <div>
                <h2 className="text-lg font-black text-gray-900">Manual Setup (No Credentials Needed)</h2>
                <p className="text-sm text-gray-400 font-semibold">
                  Follow these steps to create an admin account without Supabase access
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Step A */}
              <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-black">A</span>
                  <div>
                    <h3 className="font-bold text-gray-900 mb-1">Sign up as an Influencer</h3>
                    <p className="text-sm text-gray-500 mb-3">
                      Create a regular user account first. This creates your auth user in Supabase.
                    </p>
                    <Link
                      href="/signup/influencer"
                      className="inline-flex items-center gap-2 text-sm font-black text-indigo-600 hover:text-indigo-700 transition-colors"
                    >
                      Go to Signup →
                    </Link>
                  </div>
                </div>
              </div>

              {/* Step B */}
              <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-black">B</span>
                  <div>
                    <h3 className="font-bold text-gray-900 mb-1">Ask your team to run this SQL in Supabase</h3>
                    <p className="text-sm text-gray-500 mb-3">
                      Share the SQL below with your team. They need to run it in Supabase Dashboard → SQL Editor.
                      This adds the admin role to the database and promotes your user.
                    </p>
                    <div className="bg-gray-900 text-gray-100 rounded-xl p-4 text-xs font-mono leading-relaxed overflow-x-auto">
                      <p className="text-gray-500 mb-2">-- Replace &apos;your-email@example.com&apos; with the email you signed up with</p>
                      <div className="space-y-1">
                        <p><span className="text-purple-400">ALTER TYPE</span> <span className="text-blue-300">public.user_role</span> <span className="text-purple-400">ADD VALUE IF NOT EXISTS</span> <span className="text-green-300">&apos;admin&apos;</span>;</p>
                        <p className="text-gray-600"> </p>
                        <p><span className="text-blue-400">UPDATE</span> <span className="text-blue-300">public.profiles</span></p>
                        <p><span className="text-blue-400">SET</span> role = <span className="text-green-300">&apos;admin&apos;</span></p>
                        <p><span className="text-blue-400">WHERE</span> email = <span className="text-green-300">&apos;your-email@example.com&apos;</span>;</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        const sql = `-- Run this in Supabase Dashboard → SQL Editor:\nALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'admin';\n\nUPDATE public.profiles SET role = 'admin' WHERE email = 'your-email@example.com';`;
                        navigator.clipboard.writeText(sql);
                      }}
                      className="mt-3 text-sm font-bold text-indigo-600 hover:text-indigo-700 transition-colors cursor-pointer"
                    >
                      📋 Copy SQL
                    </button>
                  </div>
                </div>
              </div>

              {/* Step C */}
              <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-black">C</span>
                  <div>
                    <h3 className="font-bold text-gray-900 mb-1">Log in as Admin</h3>
                    <p className="text-sm text-gray-500 mb-3">
                      Once your team confirms the SQL has been run, log out if you&apos;re signed in, then log back in.
                      The sidebar will switch to the Admin view automatically.
                    </p>
                    <Link
                      href="/login"
                      className="inline-flex items-center gap-2 text-sm font-black text-indigo-600 hover:text-indigo-700 transition-colors"
                    >
                      Go to Login →
                    </Link>
                  </div>
                </div>
              </div>

              {/* SQL Result display */}
              {sqlToRun && (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-100">
                  <p className="text-sm font-bold text-amber-800 mb-2">
                    Automated setup needs a database change first:
                  </p>
                  <div className="bg-amber-900/10 rounded-lg p-3 text-xs font-mono leading-relaxed overflow-x-auto">
                    {sqlToRun.split('\n').map((line: string, i: number) => (
                      <p key={i} className={line.startsWith('--') ? 'text-amber-500' : 'text-amber-900'}>{line}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom link */}
        <p className="mt-8 text-center text-sm font-semibold text-gray-400">
          Already have an admin account?{' '}
          <Link href="/login" className="text-indigo-600 hover:text-indigo-700 font-extrabold transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
