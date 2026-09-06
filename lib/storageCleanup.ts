import 'server-only';
import type { createAdminClient } from '@/lib/supabase/admin';
import { STORAGE_BUCKET } from '@/lib/storage';

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Every object under `prefix`, walking nested folders.
 *
 * Storage `list()` is not recursive and returns folders as synthetic rows with
 * a null id, so directories have to be walked by hand.
 */
export async function listAllFiles(
  adminClient: AdminClient,
  prefix: string
): Promise<string[]> {
  const queue = [prefix.replace(/^\/+|\/+$/g, '')];
  const files: string[] = [];

  while (queue.length > 0) {
    const currentPrefix = queue.shift();
    if (!currentPrefix) {
      continue;
    }

    const { data, error } = await adminClient.storage.from(STORAGE_BUCKET).list(currentPrefix, {
      limit: 1000,
      offset: 0,
    });

    if (error) {
      if (error.message?.toLowerCase().includes('not found')) {
        continue;
      }
      throw new Error(`Failed to list storage path ${currentPrefix}: ${error.message}`);
    }

    for (const item of data ?? []) {
      const fullPath = `${currentPrefix}/${item.name}`;
      if ((item as { id: string | null }).id === null) {
        queue.push(fullPath);
      } else {
        files.push(fullPath);
      }
    }
  }

  return files;
}

/** Deletes everything under `prefix`. A prefix with nothing under it is fine. */
export async function clearStoragePrefix(
  adminClient: AdminClient,
  prefix: string
): Promise<number> {
  const existing = await listAllFiles(adminClient, prefix);
  if (existing.length === 0) {
    return 0;
  }

  const chunkSize = 100;
  for (let i = 0; i < existing.length; i += chunkSize) {
    const chunk = existing.slice(i, i + chunkSize);
    const { error } = await adminClient.storage.from(STORAGE_BUCKET).remove(chunk);
    if (error) {
      throw new Error(`Failed to remove objects under ${prefix}: ${error.message}`);
    }
  }

  return existing.length;
}
