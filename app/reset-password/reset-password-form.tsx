"use client";

import { useEffect, useState, type FormEvent } from 'react';
import { CircleAlert, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';

const MIN_LENGTH = 8;

export function ResetPasswordForm() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  // The recovery link must have produced a session, or there is nothing to
  // update. Say so up front rather than after they type a password twice.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(Boolean(data.session));
      setChecking(false);
    });
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < MIN_LENGTH) {
      setError(`Password must be at least ${MIN_LENGTH} characters.`);
      return;
    }

    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    // Full reload so the server picks up the refreshed session cookie.
    window.location.href = '/profile';
  }

  if (checking) {
    return (
      <p className="flex items-center gap-2 text-sm text-ink-500">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Checking your reset link...
      </p>
    );
  }

  if (!hasSession) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-red-600/20 bg-red-50 px-3 py-2 text-sm text-red-700">
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          This reset link is invalid or has expired. Request a new one from the{' '}
          <a href="/forgot-password" className="font-medium underline">
            forgot password
          </a>{' '}
          page.
        </span>
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
        <label htmlFor="password" className="block text-sm font-medium text-ink">
          New password
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={MIN_LENGTH}
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-2 w-full rounded-md border border-ink-100 px-3 py-2.5 text-sm text-ink focus:border-accent"
        />
        <p className="mt-1 text-xs text-ink-300">At least {MIN_LENGTH} characters.</p>
      </div>

      <div>
        <label htmlFor="confirm" className="block text-sm font-medium text-ink">
          Confirm new password
        </label>
        <input
          id="confirm"
          type="password"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          className="mt-2 w-full rounded-md border border-ink-100 px-3 py-2.5 text-sm text-ink focus:border-accent"
        />
      </div>

      <Button type="submit" disabled={loading}>
        {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        Set new password
      </Button>
    </form>
  );
}
