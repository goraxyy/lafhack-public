"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import {
  cropRect,
  cropToFile,
  DEFAULT_FRAME,
  isCroppable,
  THUMBNAIL_ASPECT,
  type CropFrame,
} from '@/lib/cropImage';

const PREVIEW_WIDTH = 480;
const PREVIEW_HEIGHT = Math.round(PREVIEW_WIDTH / THUMBNAIL_ASPECT);
const MAX_ZOOM = 4;

interface ThumbnailCropperProps {
  /** The picked file, or null when nothing is chosen yet. */
  source: File | null;
  disabled?: boolean;
  onPick: () => void;
  onClear: () => void;
  /** Fires whenever the framed result changes, with the encoded file. */
  onChange: (file: File | null) => void;
}

/**
 * Choose the framing of a gallery cover.
 *
 * Drag to move, slider to zoom. The preview is a canvas drawing the exact
 * rectangle `cropToFile` will encode, so what you see is what gets stored --
 * a CSS-transform preview would have to reproduce the same maths in a second
 * place and could disagree with it.
 */
export function ThumbnailCropper({
  source,
  disabled,
  onPick,
  onClear,
  onChange,
}: ThumbnailCropperProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const bitmap = useRef<ImageBitmap | null>(null);
  const dragging = useRef<{ x: number; y: number } | null>(null);

  const [frame, setFrame] = useState<CropFrame>(DEFAULT_FRAME);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the picked file into a bitmap once; every redraw reuses it.
  useEffect(() => {
    let cancelled = false;

    bitmap.current?.close();
    bitmap.current = null;
    setReady(false);
    setError(null);
    setFrame(DEFAULT_FRAME);

    if (!source) return;

    if (!isCroppable(source)) {
      // Animated GIFs lose their animation through a canvas, so they are sent
      // exactly as picked and simply cannot be framed here.
      onChange(source);
      setError('GIFs are uploaded as-is — framing would flatten the animation.');
      return;
    }

    createImageBitmap(source)
      .then((loaded) => {
        if (cancelled) {
          loaded.close();
          return;
        }
        bitmap.current = loaded;
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setError('Could not read that image.');
      });

    return () => {
      cancelled = true;
    };
    // onChange is stable enough here; re-running on it would reload the bitmap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  // Redraw the preview whenever the framing changes.
  useEffect(() => {
    const image = bitmap.current;
    const element = canvas.current;
    if (!ready || !image || !element) return;

    const context = element.getContext('2d');
    if (!context) return;

    const rect = cropRect(image.width, image.height, frame);
    context.clearRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
    context.drawImage(
      image,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      0,
      0,
      PREVIEW_WIDTH,
      PREVIEW_HEIGHT
    );
  }, [frame, ready]);

  // Encode after the framing settles, rather than on every pointer move.
  const emit = useCallback(async () => {
    const image = bitmap.current;
    if (!image || !source) return;

    setBusy(true);
    try {
      const file = await cropToFile(image, frame, source.name, source.type);
      onChange(file);
      setError(null);
    } catch {
      setError('Could not prepare that image.');
      onChange(null);
    } finally {
      setBusy(false);
    }
  }, [frame, onChange, source]);

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(emit, 150);
    return () => clearTimeout(timer);
  }, [emit, ready]);

  function startDrag(event: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled || !ready) return;
    dragging.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onDrag(event: React.PointerEvent<HTMLCanvasElement>) {
    const image = bitmap.current;
    const from = dragging.current;
    if (!from || !image) return;

    const rect = cropRect(image.width, image.height, frame);

    // Pointer pixels are preview pixels; convert to source pixels, then to the
    // 0..1 centre the frame is stored in. Dragging right moves the view left.
    const dx = ((event.clientX - from.x) * rect.width) / PREVIEW_WIDTH;
    const dy = ((event.clientY - from.y) * rect.height) / PREVIEW_HEIGHT;

    dragging.current = { x: event.clientX, y: event.clientY };

    setFrame((current) => ({
      ...current,
      centerX: current.centerX - dx / image.width,
      centerY: current.centerY - dy / image.height,
    }));
  }

  function endDrag(event: React.PointerEvent<HTMLCanvasElement>) {
    dragging.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  if (!source) {
    return (
      <button
        type="button"
        onClick={onPick}
        disabled={disabled}
        className="inline-flex items-center gap-2 rounded-md border border-ink-100 px-4 py-2 text-sm text-ink-500 hover:border-accent hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
      >
        <ImagePlus className="h-4 w-4" aria-hidden="true" />
        Choose an image
      </button>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative w-full max-w-md overflow-hidden rounded-lg border border-ink-100 bg-ink-50">
        {ready ? (
          <canvas
            ref={canvas}
            width={PREVIEW_WIDTH}
            height={PREVIEW_HEIGHT}
            onPointerDown={startDrag}
            onPointerMove={onDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="w-full cursor-grab touch-none active:cursor-grabbing"
          />
        ) : (
          <div
            className="flex w-full items-center justify-center"
            style={{ aspectRatio: `${THUMBNAIL_ASPECT}` }}
          >
            {error ? (
              <span className="px-4 text-center text-xs text-ink-500">{error}</span>
            ) : (
              <Loader2 className="h-5 w-5 animate-spin text-ink-300" aria-hidden="true" />
            )}
          </div>
        )}

        <button
          type="button"
          onClick={onClear}
          disabled={disabled}
          aria-label="Remove thumbnail"
          className="absolute right-2 top-2 rounded-full bg-ink/80 p-1.5 text-white hover:bg-ink"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {ready && (
        <div className="max-w-md">
          <label htmlFor="thumbnail-zoom" className="block text-xs font-medium text-ink">
            Framing
            <span className="ml-1 font-normal text-ink-300">drag the image to reposition</span>
          </label>
          <input
            id="thumbnail-zoom"
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.05}
            value={frame.zoom}
            disabled={disabled}
            onChange={(event) =>
              setFrame((current) => ({ ...current, zoom: Number(event.target.value) }))
            }
            className="mt-1.5 h-1 w-full cursor-pointer accent-accent"
          />
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-300">
            {busy && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
            Cropped to the 16:10 gallery card.
          </p>
        </div>
      )}

      {error && ready && <p className="text-xs text-red-700">{error}</p>}

      <button
        type="button"
        onClick={onPick}
        disabled={disabled}
        className="inline-flex items-center gap-2 rounded-md border border-ink-100 px-3 py-1.5 text-xs text-ink-500 hover:border-accent hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
      >
        <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
        Replace image
      </button>
    </div>
  );
}
