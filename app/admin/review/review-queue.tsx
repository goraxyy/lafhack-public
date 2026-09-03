"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, ExternalLink, ImageOff, Loader2, X } from 'lucide-react';
import { formatTerm, thumbnailUrl, type Project } from '@/lib/types';
import { Chip, StatusBadge } from '@/components/ui/badge';

type Decision = 'approved' | 'rejected';

export function ReviewQueue({ projects }: { projects: Project[] }) {
  if (projects.length === 0) {
    return (
      <div className="mt-8 flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-ink-100 py-20 text-center">
        <Check className="h-8 w-8 text-ink-300" aria-hidden="true" />
        <p className="text-sm font-medium text-ink">Queue is empty</p>
        <p className="text-sm text-ink-500">Every uploaded sketch has been reviewed.</p>
      </div>
    );
  }

  return (
    <ul className="mt-8 space-y-8">
      {projects.map((project) => (
        <li key={project.id}>
          <ReviewCard project={project} />
        </li>
      ))}
    </ul>
  );
}

function ReviewCard({ project }: { project: Project }) {
  const router = useRouter();
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canApprove = project.status === 'ready';
  const term = formatTerm(project);
  const cover = thumbnailUrl(project);

  async function decide(decision: Decision) {
    setBusy(decision);
    setError(null);

    try {
      const response = await fetch(`/api/admin/projects/${project.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, notes }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Could not save the review.');
      }

      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the review.');
      setBusy(null);
    }
  }

  return (
    <article className="overflow-hidden rounded-lg border border-ink-100">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 p-5">
        <div>
          <h2 className="text-base font-medium text-ink">{project.title}</h2>
          <p className="mt-1 text-sm text-ink-500">
            {project.author_name ?? 'Unknown author'}
            {term ? ` · ${term}` : ''}
            {project.collaborators.length > 0 && ` · with ${project.collaborators.join(', ')}`}
          </p>
          {(project.genre || project.tags.length > 0) && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {project.genre && <Chip>{project.genre}</Chip>}
              {project.tags.map((tag) => (
                <Chip key={tag}>#{tag}</Chip>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <StatusBadge status={project.status} />
          <Link
            href={`/play/${project.id}`}
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-md border border-ink-100 px-3 py-1.5 text-sm text-ink-500 hover:border-ink-200 hover:text-ink"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            Open
          </Link>
        </div>
      </div>

      {project.description && (
        <p className="whitespace-pre-line border-b border-ink-100 px-5 py-4 text-sm text-ink-500">
          {project.description}
        </p>
      )}

      {/*
        The sketch is not embedded here. Every card in the queue would mount its
        own player, so opening the page started as many sketches as there are
        pending -- each one running arbitrary user code, competing for the same
        audio output and animation frames. Reviewing still means playing it, so
        the cover and an Open link stand in and the sketch runs on its own page.
      */}
      {canApprove ? (
        <div className="flex flex-col gap-4 border-b border-ink-100 p-5 sm:flex-row sm:items-center">
          <div className="w-full overflow-hidden rounded-md border border-ink-100 bg-ink-50 sm:w-64">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element -- Storage-proxied
              <img
                src={cover}
                alt={`${project.title} cover`}
                className="aspect-[16/10] w-full object-cover"
              />
            ) : (
              <div className="flex aspect-[16/10] w-full items-center justify-center">
                <ImageOff className="h-6 w-6 text-ink-300" aria-hidden="true" />
              </div>
            )}
          </div>

          <div className="min-w-0">
            <p className="text-sm text-ink">
              {cover ? 'Cover image as it will appear in the gallery.' : 'No cover image set.'}
            </p>
            <p className="mt-1 text-sm text-ink-500">
              Approving is supposed to mean someone ran it — open it in a new tab and play
              it before deciding.
            </p>
            <Link
              href={`/play/${project.id}`}
              target="_blank"
              className="mt-3 inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink-700"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              Play it
            </Link>
          </div>
        </div>
      ) : (
        <p className="bg-ink-50 px-5 py-10 text-center text-sm text-ink-500">
          This sketch is {project.status}
          {project.error_message ? `: ${project.error_message}` : '.'} It cannot be approved
          until it compiles.
        </p>
      )}

      <div className="space-y-3 border-t border-ink-100 p-5">
        <label className="block text-sm font-medium text-ink">
          Review notes
          <span className="ml-1 font-normal text-ink-300">
            (shown to the uploader — required context if you reject)
          </span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={2}
            placeholder="Plays fine, controls match the instructions."
            className="mt-2 w-full rounded-md border border-ink-100 px-3 py-2 text-sm text-ink placeholder:text-ink-300"
          />
        </label>

        {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => decide('approved')}
            disabled={!canApprove || busy !== null}
            className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === 'approved' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Check className="h-4 w-4" aria-hidden="true" />
            )}
            Approve for gallery
          </button>

          <button
            type="button"
            onClick={() => decide('rejected')}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 rounded-md border border-ink-100 px-4 py-2 text-sm font-medium text-ink-500 hover:border-red-300 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === 'rejected' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <X className="h-4 w-4" aria-hidden="true" />
            )}
            Reject
          </button>
        </div>
      </div>
    </article>
  );
}
