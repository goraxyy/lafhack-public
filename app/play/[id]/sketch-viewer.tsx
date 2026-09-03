"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Clock,
  Loader2,
  Volume2,
  VolumeX,
  type LucideIcon,
} from 'lucide-react';
import type { Project } from '@/lib/types';

export function SketchViewer({
  project,
  countsAsPlay,
}: {
  project: Project;
  /** False for owner/admin previews of an unapproved sketch. */
  countsAsPlay: boolean;
}) {
  if (project.status === 'failed' || project.status === 'error') {
    return (
      <Placeholder tone="error" icon={AlertTriangle} title="This sketch failed to compile.">
        {project.error_message}
      </Placeholder>
    );
  }

  if (
    project.status === 'uploading' ||
    project.status === 'queued' ||
    project.status === 'processing' ||
    !project.bundle_pde_path
  ) {
    return (
      <Placeholder tone="muted" icon={Loader2} title="Still processing this sketch." spin />
    );
  }

  return <Player project={project} countsAsPlay={countsAsPlay} />;
}

function Player({
  project,
  countsAsPlay,
}: {
  project: Project;
  countsAsPlay: boolean;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);

  const effective = muted ? 0 : volume;

  // The sketch shim owns the actual <audio> elements, so the level is sent in
  // rather than set here. Same-origin only, and re-sent whenever it changes so
  // a sketch that creates sounds late still picks it up.
  const send = useCallback((level: number) => {
    frame.current?.contentWindow?.postMessage(
      { type: 'lafhack:volume', value: level },
      window.location.origin
    );
  }, []);

  useEffect(() => {
    send(effective);
  }, [effective, send]);

  return (
    <div className="overflow-hidden rounded-lg border border-ink-100 bg-ink">
      <RecordPlay projectId={project.id} enabled={countsAsPlay} />
      <iframe
        ref={frame}
        src={`/api/projects/${project.id}/sketch`}
        title={project.title}
        className="h-[600px] w-full border-0 bg-white"
        sandbox="allow-scripts allow-same-origin"
        // The sketch only learns the level once it has loaded its shim.
        onLoad={() => send(effective)}
      />

      <div className="flex items-center gap-3 border-t border-ink-700 px-4 py-2.5">
        <button
          type="button"
          onClick={() => setMuted((value) => !value)}
          aria-label={muted ? 'Unmute sketch' : 'Mute sketch'}
          aria-pressed={muted}
          className="text-white/70 transition-colors hover:text-white"
        >
          {muted || volume === 0 ? (
            <VolumeX className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Volume2 className="h-4 w-4" aria-hidden="true" />
          )}
        </button>

        <label htmlFor="sketch-volume" className="sr-only">
          Sketch volume
        </label>
        <input
          id="sketch-volume"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={muted ? 0 : volume}
          onChange={(event) => {
            setMuted(false);
            setVolume(Number(event.target.value));
          }}
          className="h-1 w-40 max-w-full cursor-pointer accent-white"
        />

        <span className="tabular-nums text-xs text-white/50">
          {Math.round(effective * 100)}%
        </span>

        <span className="ml-auto hidden text-xs text-white/40 sm:block">
          Only affects sketches that play sound
        </span>
      </div>
    </div>
  );
}

/** Fires once per mount, after the iframe has had a chance to start. */
function RecordPlay({ projectId, enabled }: { projectId: string; enabled: boolean }) {
  const recorded = useRef(false);

  useEffect(() => {
    if (!enabled || recorded.current) return;
    recorded.current = true;

    // A failed count must never surface to the player.
    fetch(`/api/projects/${projectId}/play`, { method: 'POST' }).catch(() => {});
  }, [enabled, projectId]);

  return null;
}

function Placeholder({
  tone,
  icon: Icon,
  title,
  spin,
  children,
}: {
  tone: 'error' | 'muted';
  icon: LucideIcon;
  title: string;
  spin?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-ink-100 bg-ink-50 py-24 text-center">
      <Icon
        className={`h-6 w-6 ${tone === 'error' ? 'text-red-600' : 'text-accent'} ${spin ? 'animate-spin' : ''}`}
        aria-hidden="true"
      />
      <p className="text-sm font-medium text-ink">{title}</p>
      {children && <p className="max-w-md text-xs text-ink-500">{children}</p>}
    </div>
  );
}

/** Shown to an owner while their upload waits for an admin decision. */
export function ReviewNotice({
  reviewStatus,
  notes,
}: {
  reviewStatus: 'pending' | 'rejected';
  notes: string | null;
}) {
  const pending = reviewStatus === 'pending';

  return (
    <div
      className={`mt-6 flex gap-3 rounded-lg border p-4 ${
        pending ? 'border-amber-200 bg-amber-50' : 'border-red-200 bg-red-50'
      }`}
    >
      {pending ? (
        <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
      ) : (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" aria-hidden="true" />
      )}
      <div className={`text-sm ${pending ? 'text-amber-900' : 'text-red-900'}`}>
        <p className="font-medium">
          {pending ? 'Waiting for admin review' : 'Not approved for the gallery'}
        </p>
        <p className="mt-1">
          {pending
            ? 'Only you and admins can see this sketch. It reaches the gallery once an admin has played and approved it.'
            : 'An admin reviewed this sketch and did not approve it for the gallery.'}
        </p>
        {notes && <p className="mt-2 italic">“{notes}”</p>}
      </div>
    </div>
  );
}
