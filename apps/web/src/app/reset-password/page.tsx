'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { Loader2, AlertTriangle, CheckCircle, Mail, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';

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

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden font-sans"
      style={{ background: 'var(--color-surface)' }}>

      {/* Ambient blobs — same as login */}
      <div className="absolute inset-0 pointer-events-none select-none">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full blur-[130px]"
          style={{ background: 'color-mix(in oklch, var(--color-brand) 8%, transparent)' }} />
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full blur-[130px]"
          style={{ background: 'color-mix(in oklch, var(--color-brand) 5%, transparent)' }} />
      </div>

      <div className="relative z-10 w-full max-w-[450px]">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2.5 mb-6 group">
            <Image
              src="/influet_logo.png"
              alt="influnet"
              width={40}
              height={40}
              className="h-10 w-auto flex-shrink-0 transition-transform group-hover:scale-105"
            />
            <span className="text-2xl font-black tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
              influnet
            </span>
          </Link>

          <h1 className="text-3xl font-black tracking-tight mb-2" style={{ color: 'var(--color-text-primary)' }}>
            {mode === 'update' ? 'Set a new password' : 'Reset your password'}
          </h1>
          <p className="font-semibold" style={{ color: 'var(--color-text-muted)' }}>
            {mode === 'update'
              ? 'Choose a strong password for your account'
              : "Enter your email and we'll send you a reset link"}
          </p>
        </div>

        {/* Card */}
        <div className="p-10 rounded-[2.5rem] border"
          style={{
            background: 'var(--color-card)',
            borderColor: 'var(--color-border)',
            boxShadow: '0 20px 50px rgba(0,0,0,0.04)',
          }}>

          {/* Error banner */}
          {error && (
            <div className="mb-6 p-4 rounded-2xl flex items-start gap-3 text-sm font-semibold"
              style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}>
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {/* Mode: request email */}
          {mode === 'request' && (
            <form onSubmit={handleRequest} className="space-y-6">
              <div>
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  required
                />
              </div>
              <Button type="submit" disabled={isLoading} className="w-full">
                {isLoading ? (
                  <><Loader2 size={16} className="animate-spin mr-2" />Sending...</>
                ) : (
                  <><Mail size={16} className="mr-2" />Send Reset Link</>
                )}
              </Button>
            </form>
          )}

          {/* Mode: sent confirmation */}
          {mode === 'sent' && (
            <div className="text-center py-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
                style={{ background: 'color-mix(in oklch, var(--color-brand) 10%, transparent)' }}>
                <Mail size={28} style={{ color: 'var(--color-brand)' }} />
              </div>
              <p className="font-bold mb-2" style={{ color: 'var(--color-text-primary)' }}>Check your inbox</p>
              <p className="text-sm font-semibold" style={{ color: 'var(--color-text-muted)' }}>
                If an account exists for <span className="font-bold" style={{ color: 'var(--color-text-primary)' }}>{email}</span>,
                you&apos;ll receive a password reset link shortly. The link expires after a short time.
              </p>
            </div>
          )}

          {/* Mode: set new password */}
          {mode === 'update' && (
            <form onSubmit={handleUpdate} className="space-y-6">
              <div>
                <Label htmlFor="password">New Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  required
                />
              </div>
              <div>
                <Label htmlFor="confirm">Confirm Password</Label>
                <Input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repeat your new password"
                  required
                />
              </div>
              <Button type="submit" disabled={isLoading} className="w-full">
                {isLoading ? (
                  <><Loader2 size={16} className="animate-spin mr-2" />Updating...</>
                ) : (
                  <><KeyRound size={16} className="mr-2" />Update Password</>
                )}
              </Button>
            </form>
          )}

          {/* Mode: done */}
          {mode === 'done' && (
            <div className="text-center py-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
                style={{ background: '#f0fdf4' }}>
                <CheckCircle size={28} style={{ color: '#16a34a' }} />
              </div>
              <p className="font-bold mb-2" style={{ color: 'var(--color-text-primary)' }}>Password updated!</p>
              <p className="text-sm font-semibold" style={{ color: 'var(--color-text-muted)' }}>
                Redirecting you to sign in...
              </p>
            </div>
          )}
        </div>

        {/* Footer link */}
        <p className="mt-8 text-center text-sm font-semibold" style={{ color: 'var(--color-text-muted)' }}>
          Remembered it?{' '}
          <Link href="/login"
            className="font-extrabold transition-colors hover:opacity-80"
            style={{ color: 'var(--color-brand)' }}>
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
