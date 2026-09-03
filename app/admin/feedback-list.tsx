"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Undo2 } from 'lucide-react';
import clsx from 'clsx';
import type { Feedback, FeedbackStatus } from '@/lib/types';

const STATUS_STYLES: Record<FeedbackStatus, string> = {
  new: 'bg-amber-50 text-amber-700 border-amber-600/20',
  triaged: 'bg-blue-50 text-blue-700 border-blue-600/20',
  done: 'bg-green-50 text-green-700 border-green-600/20',
};

export function FeedbackList({ items }: { items: Feedback[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(id: string, status: FeedbackStatus) {
    setBusyId(id);
    setError(null);

    try {
      const response = await fetch(`/api/admin/feedback/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Could not update it.');

      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update it.');
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="mt-4 rounded-lg border border-dashed border-ink-100 py-12 text-center">
        <p className="text-sm text-ink-500">No feedback yet.</p>
        <p className="mt-1 text-xs text-ink-300">
          The box lives in the footer of every page.
        </p>
      </div>
    );
  }

  return (
    <>
      {error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <ul className="mt-4 space-y-3">
        {items.map((item) => (
          <li
            key={item.id}
            className={clsx(
              'rounded-lg border border-ink-100 p-4',
              item.status === 'done' && 'opacity-60'
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="whitespace-pre-line text-sm text-ink">{item.message}</p>

                <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-300">
                  <span>
                    {new Date(item.created_at).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  {item.page_path && <span>· on {item.page_path}</span>}
                  {item.email && <span>· {item.email}</span>}
                  {!item.user_id && <span>· signed out</span>}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={clsx(
                    'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
                    STATUS_STYLES[item.status]
                  )}
                >
                  {item.status}
                </span>

                {busyId === item.id ? (
                  <Loader2 className="h-4 w-4 animate-spin text-ink-300" aria-hidden="true" />
                ) : item.status === 'done' ? (
                  <button
                    type="button"
                    onClick={() => setStatus(item.id, 'new')}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-ink-500 hover:bg-ink-50 hover:text-ink"
                  >
                    <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Reopen
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setStatus(item.id, 'done')}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-ink-500 hover:bg-ink-50 hover:text-ink"
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    Done
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
