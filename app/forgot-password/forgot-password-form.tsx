"use client";

import { useState, type FormEvent } from 'react';
import { CircleAlert, Loader2, MailCheck } from 'lucide-react';
import { createClient } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';

export function ForgotPasswordForm({ initialError }: { initialError?: string }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      // The link lands on /auth/callback, which swaps the code for a session
      // cookie and then forwards to the form that sets the new password.
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });

    setLoading(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }

    setSent(true);
  }

  if (sent) {
    return (
      <div className="flex items-start gap-3 rounded-md border border-green-600/20 bg-green-50 px-4 py-3 text-sm text-green-800">
        <MailCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-medium">Check your inbox</p>
          <p className="mt-1">
            If an account exists for {email}, a reset link is on its way. The link is
            single-use and expires in an hour.
          </p>
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
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          className="mt-2 w-full rounded-md border border-ink-100 px-3 py-2.5 text-sm text-ink placeholder:text-ink-300 focus:border-accent"
        />
      </div>

      <Button type="submit" disabled={loading || !email.trim()}>
        {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        Send reset link
      </Button>
    </form>
  );
}
