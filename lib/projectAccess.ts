import 'server-only';
import { isPubliclyBrowsable } from '@/lib/types';
import type { Viewer } from '@/lib/admin';

/** The columns every access decision needs. */
export interface AccessFields {
  owner_id: string | null;
  visibility: string;
  status: string;
  review_status: string;
}

export const ACCESS_COLUMNS = 'owner_id, visibility, status, review_status';

/**
 * Who may open a sketch.
 *
 * Approval gates the *public*, not the author: an owner has to be able to play
 * their own upload while it waits in the review queue, and an admin has to be
 * able to play it in order to review it at all.
 */
export function canViewProject(project: AccessFields, viewer: Viewer | null): boolean {
  if (isPubliclyBrowsable(project)) return true;
  if (!viewer) return false;
  return viewer.role === 'admin' || project.owner_id === viewer.id;
}
