"use client";

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Loader2, CircleAlert, MailCheck } from 'lucide-react';
import { createClient } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';

export function SignupForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [alreadySent, setAlreadySent] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        // Where the confirmation link comes back to. /auth/callback exchanges
        // the code for a session before handing off.
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/gallery`,
      },
    });

    setLoading(false);

    if (signUpError) {
      // The account is created on the FIRST attempt; a rate-limit error on a
      // retry means the confirmation email is already on its way, not that
      // anything failed. Showing Supabase's raw "you can only request this
      // after N seconds" here reads as a broken signup.
      if (
        signUpError.code === 'over_email_send_rate_limit' ||
        signUpError.status === 429
      ) {
        setAlreadySent(true);
        setConfirmationSent(true);
        return;
      }

      setError(signUpError.message);
      return;
    }

    // With email confirmation switched on, signUp() creates the account but
    // returns NO session -- the account is not usable until the link in the
    // email is clicked. Redirecting here sent people to /gallery signed out,
    // which looks exactly like a broken signup, and retrying then tripped
    // Supabase's email rate limit with a "you can only request this after N
    // seconds" error. Only redirect when a session actually came back.
    if (!data.session) {
      setConfirmationSent(true);
      return;
    }

    // Full reload so the auth context picks the session up.
    window.location.href = '/gallery';
  }

  if (confirmationSent) {
    return (
      <div className="rounded-md border border-ink-100 bg-ink-50 p-4">
        <div className="flex items-start gap-2.5">
          <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-ink">Confirm your email</p>
            <p className="mt-1 text-sm text-ink-500">
              {alreadySent
                ? 'A confirmation link is already on its way to '
                : 'Your account is created, but you need to confirm it before you can log in. We sent a link to '}
              <strong>{email.trim()}</strong> -- click it and you will be signed in.
            </p>
            <p className="mt-3 text-sm text-ink-500">
              Nothing arrived? Check spam. Requesting another one too quickly is rate
              limited by the mail provider, so give it a minute.
            </p>
            <p className="mt-3 text-sm">
              <Link href="/login" className="font-medium text-accent hover:underline">
                Back to log in
              </Link>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-red-600/20 bg-red-50 px-3 py-2 text-sm text-red-700">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-ink">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1.5 w-full rounded-md border border-ink-100 px-3 py-2.5 text-sm text-ink focus:border-accent"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-ink">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1.5 w-full rounded-md border border-ink-100 px-3 py-2.5 text-sm text-ink focus:border-accent"
        />
        <p className="mt-1.5 text-xs text-ink-300">At least 8 characters.</p>
      </div>

      <Button type="submit" disabled={loading} className="mt-2 w-full">
        {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        Create account
      </Button>
    </form>
  );
}
