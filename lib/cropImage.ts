/**
 * Cropping for gallery cover images.
 *
 * Gallery cards are a fixed 16:10, so an uncropped upload gets centre-cropped
 * by CSS and the interesting part of a sketch screenshot is as likely as not
 * to be the part that gets cut. This lets the uploader choose the framing
 * instead, and produces the cropped image itself so what is stored is what
 * they saw.
 */

/** Aspect ratio of the gallery card, and so of the crop frame. */
export const THUMBNAIL_ASPECT = 16 / 10;

/** Longest edge of the encoded result. Comfortably retina for a card. */
const OUTPUT_WIDTH = 1280;

export interface CropFrame {
  /** 1 = the whole image fits the frame; higher zooms in. */
  zoom: number;
  /** Centre of the crop, as a fraction (0..1) of the source. */
  centerX: number;
  centerY: number;
}

export const DEFAULT_FRAME: CropFrame = { zoom: 1, centerX: 0.5, centerY: 0.5 };

/**
 * The source-pixel rectangle a frame selects.
 *
 * Kept as one function so the live preview and the final encode cannot drift:
 * both ask for the same rectangle, so what is drawn is what is saved.
 */
export function cropRect(
  naturalWidth: number,
  naturalHeight: number,
  frame: CropFrame
) {
  // Largest 16:10 rectangle that fits the source, then zoomed in.
  const baseWidth = Math.min(naturalWidth, naturalHeight * THUMBNAIL_ASPECT);
  const zoom = Math.max(1, frame.zoom);
  const width = baseWidth / zoom;
  const height = width / THUMBNAIL_ASPECT;

  // Clamp so the crop never runs off the edge of the image.
  const halfW = width / 2;
  const halfH = height / 2;
  const centerX = Math.min(Math.max(frame.centerX * naturalWidth, halfW), naturalWidth - halfW);
  const centerY = Math.min(Math.max(frame.centerY * naturalHeight, halfH), naturalHeight - halfH);

  return { x: centerX - halfW, y: centerY - halfH, width, height };
}

/** Formats a canvas can re-encode. Anything else is sent as picked. */
const RE_ENCODABLE = new Set(['image/png', 'image/jpeg', 'image/webp']);

export function isCroppable(file: File): boolean {
  return RE_ENCODABLE.has(file.type);
}

/** Encodes the framed region of `bitmap` as a file ready to upload. */
export async function cropToFile(
  bitmap: ImageBitmap,
  frame: CropFrame,
  sourceName: string,
  sourceType: string
): Promise<File> {
  const rect = cropRect(bitmap.width, bitmap.height, frame);

  const width = Math.min(OUTPUT_WIDTH, Math.round(rect.width));
  const height = Math.round(width / THUMBNAIL_ASPECT);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not prepare the image.');

  context.drawImage(
    bitmap,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    width,
    height
  );

  // JPEG has no alpha, so a PNG with transparency stays PNG.
  const type = sourceType === 'image/jpeg' ? 'image/jpeg' : sourceType;
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, 0.9)
  );

  if (!blob) throw new Error('Could not encode the image.');

  const extension = type === 'image/jpeg' ? 'jpg' : type === 'image/webp' ? 'webp' : 'png';
  const baseName = sourceName.replace(/\.[^.]+$/, '') || 'cover';

  return new File([blob], `${baseName}.${extension}`, { type });
}
