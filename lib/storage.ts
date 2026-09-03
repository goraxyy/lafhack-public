/**
 * The Supabase Storage bucket holding every sketch file.
 *
 * `projects` is also the name of the *table*, which has bitten this codebase
 * before -- `supabase.storage.from('projects')` and
 * `supabase.from('projects')` look almost identical and fail very differently.
 * One constant, one place to change it.
 *
 * Override with NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET if your bucket is named
 * something else; it must be public (NEXT_PUBLIC_) because the upload page
 * uploads straight from the browser via a signed URL.
 */
export const STORAGE_BUCKET =
  process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET?.trim() || 'projects';

/** Storage layout, all under the one bucket. */
export const storagePaths = {
  raw: (projectId: string) => `raw/${projectId}`,
  normalized: (projectId: string) => `normalized/${projectId}`,
  bundle: (projectId: string) => `normalized/${projectId}/bundle.pde`,
  data: (projectId: string) => `normalized/${projectId}/data`,
  thumbnail: (projectId: string, extension: string) =>
    `thumbnails/${projectId}/cover.${extension}`,
};
