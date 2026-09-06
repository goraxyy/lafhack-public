"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Clock,
  Loader2,
  Trash2,
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
  // A rejected sketch has had its files deleted, so there is nothing to run.
  // Without this it falls through to "Still processing", which is both wrong
  // and implies the sketch is coming back.
  if (project.review_status === 'rejected') {
    return (
      <Placeholder tone="error" icon={Trash2} title="This sketch was removed in review.">
        {project.review_notes
          ? `Reviewer's note: ${project.review_notes}`
          : 'Its files have been deleted. Upload it again if you want another look.'}
      </Placeholder>
    );
  }

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
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  const effective = muted ? 0 : volume;

  // A sketch is a fixed-size canvas -- size(550, 625) here, size(400, 400)
  // there -- and the frame used to be a flat 600px tall whatever it held. So a
  // tall sketch had its bottom cut off and a small one sat in a field of black.
  // The sketch reports its own size once it has run; until then the fallback
  // below stands in.
  //
  // The frame is sized to the sketch rather than the sketch scaled to the
  // frame: Processing.js reads mouseX/mouseY off the canvas's own coordinates,
  // so a CSS-scaled canvas would put every click in the wrong place.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.source !== frame.current?.contentWindow) return;

      const data = event.data as { type?: string; width?: unknown; height?: unknown };
      if (!data || data.type !== 'lafhack:size') return;

      const width = Number(data.width);
      const height = Number(data.height);

      // Nothing here is trusted enough to become a style attribute unchecked:
      // the sketch is uploaded code, and the page it runs on is its own.
      if (!Number.isFinite(width) || !Number.isFinite(height)) return;
      if (width < 1 || height < 1 || width > 4000 || height > 4000) return;

      setSize((current) => {
        const next = { width: Math.round(width), height: Math.round(height) };
        return current && current.width === next.width && current.height === next.height
          ? current
          : next;
      });
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

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
      {/* Scrolls sideways rather than shrinking, for a sketch wider than the
          page: a cut-off edge is recoverable, misplaced clicks are not. */}
      <div className="overflow-x-auto">
        <iframe
          ref={frame}
          src={`/api/projects/${project.id}/sketch`}
          title={project.title}
          className={
            size
              ? 'mx-auto block max-w-none border-0 bg-white'
              : 'block h-[600px] w-full border-0 bg-white'
          }
          style={size ? { width: size.width, height: size.height } : undefined}
          sandbox="allow-scripts allow-same-origin"
          // The sketch only learns the level once it has loaded its shim.
          onLoad={() => send(effective)}
        />
      </div>

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
