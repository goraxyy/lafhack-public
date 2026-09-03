"use client";

import { useState, type FormEvent } from 'react';
import { usePathname } from 'next/navigation';
import { CheckCircle2, CircleAlert, Loader2, MessageSquarePlus } from 'lucide-react';
import { MAX_FEEDBACK_LENGTH } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';

/**
 * The feedback box in the footer.
 *
 * Collapsed to a single button until clicked -- it sits on every page, so it
 * has to stay out of the way. Open to signed-out visitors on purpose: someone
 * who cannot get past sign-up is exactly the person with something to report.
 */
export function FeedbackWidget() {
  const { user } = useAuth();
  const pathname = usePathname();

  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSending(true);

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, email, pagePath: pathname }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Could not send your feedback.');

      setSent(true);
      setMessage('');
      setEmail('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not send your feedback.');
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setSent(false);
        }}
        className="inline-flex items-center gap-2 rounded-md border border-ink-100 px-3 py-2 text-sm text-ink-500 transition-colors hover:border-ink-200 hover:text-ink"
      >
        <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
        Send feedback
      </button>
    );
  }

  if (sent) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-green-600/20 bg-green-50 px-3 py-2 text-sm text-green-800">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          Thanks — that went straight to the admins.{' '}
          <button
            type="button"
            onClick={() => setSent(false)}
            className="font-medium underline"
          >
            Send another
          </button>
        </span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-md">
      <label htmlFor="feedback-message" className="block text-sm font-medium text-ink">
        What should we fix or improve?
      </label>
      <p className="mt-1 text-xs text-ink-500">
        Bugs, confusing bits, missing features — all useful.
      </p>

      <textarea
        id="feedback-message"
        required
        rows={3}
        maxLength={MAX_FEEDBACK_LENGTH}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        placeholder="The upload button did nothing when I..."
        className="mt-2 w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-300 focus:border-accent"
      />

      {!user && (
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email (optional, if you want a reply)"
          className="mt-2 w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-300 focus:border-accent"
        />
      )}

      {error && (
        <div className="mt-2 flex items-start gap-2 rounded-md border border-red-600/20 bg-red-50 px-3 py-2 text-sm text-red-700">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="submit"
          disabled={sending || !message.trim()}
          className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Send
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md px-3 py-2 text-sm text-ink-500 hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
