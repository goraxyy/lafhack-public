"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, ChevronRight, Loader2, Undo2 } from 'lucide-react';
import { StatusBadge } from '@/components/ui/badge';
import type { Project } from '@/lib/types';

/**
 * Every upload that failed to compile, with the reason.
 *
 * The dashboard counted these and stopped there, so reading the error behind a
 * failure meant knowing the project's id. A failed compile is usually a gap in
 * compileProject() rather than a bad upload -- every fix in that file so far
 * started from one of these strings -- so they belong where someone is already
 * looking.
 *
 * Collapsed by default, because the list is a queue: the useful view is how
 * many are outstanding, not five screens of stack traces. Clearing one moves
 * it out of the queue without deleting anything, and is reversible.
 */
export function FailedUploads({
  open,
  cleared,
}: {
  open: Project[];
  cleared: Project[];
}) {
  const [showCleared, setShowCleared] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div id="failed" className="mt-10 scroll-mt-8">
      <div className="flex items-center gap-2">
        <h2 className="font-display text-lg font-semibold text-ink">Failed uploads</h2>
        {open.length > 0 && (
          <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
            {open.length} open
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-ink-500">
        Uploads that never compiled, and what the compiler said. The uploader
        sees the same message on the sketch&rsquo;s own page, where it can be
        retried. Marking one done only clears it from here.
      </p>

      {error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {open.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-ink-100 py-10 text-center text-sm text-ink-500">
          {cleared.length > 0
            ? 'Nothing outstanding — every failure has been dealt with.'
            : 'Nothing has failed to compile.'}
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {open.map((project) => (
            <FailureRow key={project.id} project={project} onError={setError} />
          ))}
        </ul>
      )}

      {cleared.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowCleared((value) => !value)}
            aria-expanded={showCleared}
            className="inline-flex items-center gap-1.5 text-sm text-ink-500 transition-colors hover:text-ink"
          >
            <ChevronRight
              className={`h-4 w-4 transition-transform ${showCleared ? 'rotate-90' : ''}`}
              aria-hidden="true"
            />
            {cleared.length} marked done
          </button>

          {showCleared && (
            <ul className="mt-2 space-y-2">
              {cleared.map((project) => (
                <FailureRow key={project.id} project={project} onError={setError} isCleared />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function FailureRow({
  project,
  isCleared = false,
  onError,
}: {
  project: Project;
  isCleared?: boolean;
  onError: (message: string | null) => void;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);

  const panelId = `failure-${project.id}`;

  async function setCleared(cleared: boolean) {
    setBusy(true);
    onError(null);

    try {
      const response = await fetch(`/api/admin/projects/${project.id}/failure`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cleared }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Could not update it.');

      router.refresh();
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : 'Could not update it.');
      setBusy(false);
    }
  }

  return (
    <li className={`rounded-lg border border-ink-100 ${isCleared ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-center gap-2 p-3">
        {/* The row header and the action have to be separate controls: a button
            cannot contain another button, and the whole row toggling would make
            "mark done" a game of chance. */}
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-controls={panelId}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronRight
            className={`h-4 w-4 shrink-0 text-ink-300 transition-transform ${expanded ? 'rotate-90' : ''}`}
            aria-hidden="true"
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-ink">{project.title}</span>
            <span className="block truncate text-xs text-ink-500">
              {project.author_name ?? 'Unknown author'} ·{' '}
              {new Date(project.created_at).toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </span>
          </span>
        </button>

        <StatusBadge status={project.status} />

        <button
          type="button"
          onClick={() => setCleared(!isCleared)}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md border border-ink-100 px-2.5 py-1.5 text-xs font-medium text-ink-500 transition-colors hover:border-ink-200 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : isCleared ? (
            <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {isCleared ? 'Reopen' : 'Mark done'}
        </button>
      </div>

      {expanded && (
        <div id={panelId} className="border-t border-ink-100 p-3">
          {/* Whitespace preserved: a compiler message names files and paths,
              and re-wrapping them loses where one ends. */}
          <p className="overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-ink-50 px-3 py-2 font-mono text-xs leading-relaxed text-ink-700">
            {project.error_message ?? 'No error message was recorded.'}
          </p>
          <Link
            href={`/play/${project.id}`}
            className="mt-2 inline-block text-xs font-medium text-accent hover:underline"
          >
            Open the sketch page
          </Link>
        </div>
      )}
    </li>
  );
}
