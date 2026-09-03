"use client";

import { useState, type FormEvent } from 'react';
import { Loader2, CircleAlert } from 'lucide-react';
import { createClient } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    // Use window.location.href to force a full reload so auth state updates
    window.location.href = '/gallery';
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
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1.5 w-full rounded-md border border-ink-100 px-3 py-2.5 text-sm text-ink focus:border-accent"
        />
      </div>

      <Button type="submit" disabled={loading} className="mt-2 w-full">
        {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        Log in
      </Button>
    </form>
  );
}
