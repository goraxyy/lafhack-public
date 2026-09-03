import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

/** Which migrations the live database actually has. */
export interface SchemaHealth {
  /** 005 adds review_status, the metadata columns, favorites and play_history. */
  reviewAndFavorites: boolean;
  /** 006 locks down set_admin_role. */
  adminRoleLockedDown: boolean;
  missing: string[];
}

/**
 * The app's queries reference columns and tables that only exist after
 * migration 005. Without this check a database still on 001-003 fails
 * silently: `getApprovedProjects()` swallows the PostgREST error and the
 * gallery just looks empty, which reads as "no sketches yet" rather than
 * "you have not run the migration".
 */
export async function getSchemaHealth(): Promise<SchemaHealth> {
  const db = createAdminClient();

  const [reviewColumn, favoritesTable, lockedDown] = await Promise.all([
    db.from('projects').select('review_status').limit(1),
    db.from('favorites').select('project_id').limit(1),
    db.rpc('is_admin_role_locked_down'),
  ]);

  const reviewAndFavorites = !reviewColumn.error && !favoritesTable.error;

  // The probe function ships with 006; its absence is the signal.
  const adminRoleLockedDown = !lockedDown.error;

  const missing: string[] = [];
  if (!reviewAndFavorites) missing.push('005_review_metadata_favorites.sql');
  if (!adminRoleLockedDown) missing.push('006_lock_down_set_admin_role.sql');

  return { reviewAndFavorites, adminRoleLockedDown, missing };
}
